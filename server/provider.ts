import 'dotenv/config';
import { fetch, ProxyAgent } from 'undici';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

// nflverse publishes open datasets; transport follows the environment's HTTPS proxy.
const dispatcher = process.env.HTTPS_PROXY ? new ProxyAgent(process.env.HTTPS_PROXY) : undefined;
async function csv(url: string) {
  const cached =
    process.env.NFLVERSE_CACHE_DIR &&
    path.join(
      process.env.NFLVERSE_CACHE_DIR,
      url.endsWith('teams_colors_logos.csv') ? 'teams.csv' : url.split('/').at(-1)!,
    );
  if (cached) {
    try {
      return parse(await fs.readFile(cached, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
      }) as Record<string, string>[];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  const response = await fetch(url, { dispatcher, signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`nflverse returned HTTP ${response.status} for ${url}`);
  return parse(await response.text(), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];
}
export async function fetchNFLverse(season: number) {
  if (!Number.isInteger(season) || season < 1999 || season > 2100)
    throw new Error('Supply a valid season');
  const [teamsRaw, statsRaw, gamesRaw, rosterRaw, teamStatsRaw] = await Promise.all([
    csv('https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/teams_colors_logos.csv'),
    csv(
      `https://github.com/nflverse/nflverse-data/releases/download/${season <= 2024 ? 'player_stats/player_stats_' : 'stats_player/stats_player_week_'}${season}.csv`,
    ),
    csv('https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'),
    csv(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`),
    csv(
      `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${season}.csv`,
    ),
  ]);
  if (!teamsRaw.length || !statsRaw.length || !rosterRaw.length || !teamStatsRaw.length)
    throw new Error('nflverse returned an empty required dataset');
  const aliases: Record<string, string> = {
    OAK: 'LV',
    SD: 'LAC',
    STL: 'LA',
    LAR: 'LA',
    JAC: 'JAX',
  };
  const abbr = (s: string) => aliases[s] || s;
  const teams = teamsRaw
    .filter((t) => !['OAK', 'SD', 'STL', 'LAR'].includes(t.team_abbr))
    .map((t) => ({
      id: abbr(t.team_abbr),
      name: t.team_name,
      nickname: t.team_nick,
      conference: t.team_conf,
      division: t.team_division,
      color: t.team_color,
    }));
  const teamIds = new Set(teams.map((t) => t.id));
  const metrics = [
    'completions',
    'attempts',
    'passing_yards',
    'passing_tds',
    'interceptions',
    'carries',
    'rushing_yards',
    'rushing_tds',
    'receptions',
    'targets',
    'receiving_yards',
    'receiving_tds',
  ];
  for (const r of statsRaw) {
    r.recent_team ||= r.team;
    r.interceptions ??= r.passing_interceptions;
  }
  const playersById = new Map<string, any>();
  for (const r of [...statsRaw]
    .sort((a, b) => Number(a.week) - Number(b.week))
    .filter((r) => r.season_type === 'REG' && teamIds.has(abbr(r.recent_team)))) {
    let p = playersById.get(r.player_id);
    if (!p) {
      p = {
        id: r.player_id,
        name: r.player_display_name || r.player_name,
        position: r.position,
        season: Number(r.season),
        team: abbr(r.recent_team),
        stats: { games: 0 },
        weekly: [],
      };
      playersById.set(p.id, p);
    }
    p.team = abbr(r.recent_team);
    p.stats.games++;
    const week: Record<string, number> = { week: Number(r.week) };
    for (const m of metrics) {
      if (r[m] === '' || r[m] === undefined) continue;
      const v = Number(r[m]);
      if (!Number.isFinite(v)) throw new Error(`Invalid ${m}`);
      p.stats[m] = (p.stats[m] || 0) + v;
      week[m] = v;
    }
    p.weekly.push(week);
  }
  const players = [...playersById.values()];
  for (const p of players)
    p.stats.completion_pct = p.stats.attempts
      ? Math.round((p.stats.completions / p.stats.attempts) * 1000) / 10
      : 0;
  const games = gamesRaw
    .filter(
      (g) =>
        Number(g.season) >= season &&
        teamIds.has(abbr(g.home_team)) &&
        teamIds.has(abbr(g.away_team)),
    )
    .map((g) => ({
      id: g.game_id,
      season: Number(g.season),
      week: Number(g.week),
      type: g.game_type,
      home: abbr(g.home_team),
      away: abbr(g.away_team),
      // nflverse gametime is America/New_York; derive the UTC offset with Intl.
      startsAt: toUTC(g.gameday, g.gametime || '13:00'),
      kickoffConfirmed: !!g.gametime,
      homeScore: g.home_score === '' ? null : Number(g.home_score),
      awayScore: g.away_score === '' ? null : Number(g.away_score),
      stadium: g.stadium || '',
    }));
  function toUTC(day: string, time: string) {
    const guess = new Date(`${day}T${time}:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'longOffset',
    }).formatToParts(guess);
    const offset =
      parts.find((p) => p.type === 'timeZoneName')!.value.replace('GMT', '') || '+00:00';
    return new Date(`${day}T${time}:00${offset}`).toISOString();
  }
  const statValues = (r: Record<string, string>) =>
    Object.fromEntries(
      [
        ...metrics,
        'def_tackles_solo',
        'def_sacks',
        'def_interceptions',
        'fg_made',
        'fg_att',
      ].flatMap((m) => {
        const raw = m === 'interceptions' ? (r.interceptions ?? r.passing_interceptions) : r[m];
        if (raw === '' || raw === undefined) return [];
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new Error(`Invalid ${m}`);
        return [[m, value]];
      }),
    );
  const weekly = statsRaw
    .filter((r) => ['REG', 'POST'].includes(r.season_type) && teamIds.has(abbr(r.recent_team)))
    .map((r) => ({
      player: r.player_id,
      name: r.player_display_name || r.player_name,
      position: r.position,
      team: abbr(r.recent_team),
      season: Number(r.season),
      week: Number(r.week),
      type: r.season_type,
      stats: statValues(r),
    }));
  const teamWeekly = teamStatsRaw
    .filter((r) => ['REG', 'POST'].includes(r.season_type) && teamIds.has(abbr(r.team)))
    .map((r) => ({
      team: abbr(r.team),
      season: Number(r.season),
      week: Number(r.week),
      type: r.season_type,
      stats: statValues(r),
    }));
  const roster = rosterRaw
    .filter((r) => teamIds.has(abbr(r.team)))
    .map((r) => ({
      id: r.gsis_id || `roster:${r.team}:${r.full_name}`,
      name: r.full_name,
      position: r.position,
      team: abbr(r.team),
      season: Number(r.season),
      status: r.status || 'Unavailable',
    }));
  const snapshot = {
    source: 'https://github.com/nflverse/nflverse-data',
    fetchedAt: new Date().toISOString(),
    teams,
    roster,
    weekly,
    teamWeekly,
    players,
    games,
  };
  return snapshot;
}
