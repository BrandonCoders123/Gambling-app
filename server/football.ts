import type { Database } from './db.js';
export function gameState(game: any, now = Date.now()) {
  return game.home_score !== null && game.away_score !== null
    ? 'completed'
    : new Date(game.starts_at).getTime() > now
      ? 'upcoming'
      : 'unavailable';
}
export function teamResult(game: any, team: string) {
  if (gameState(game) !== 'completed') return null;
  const own = game.home_id === team ? game.home_score : game.away_score;
  const opponent = game.home_id === team ? game.away_score : game.home_score;
  return own === opponent ? 'T' : own > opponent ? 'W' : 'L';
}
export function scheduleWeeks(games: any[], team: string, season: number) {
  const regular = games.filter((g) => g.type === 'REG');
  const full = regular.length === (season >= 2021 ? 17 : 16);
  const max = season >= 2021 ? 18 : 17;
  const rows = games.map((g) => ({ ...g, status: gameState(g), result: teamResult(g, team) }));
  for (let week = 1; week <= max; week++) {
    if (!regular.some((g) => g.week === week))
      rows.push({ season, week, type: 'REG', status: full ? 'bye' : 'unavailable', result: null });
  }
  return rows.sort((a, b) => a.week - b.week);
}
export async function latestSeason(db: Database) {
  return Number((await db.query('SELECT max(season) season FROM games'))[0].season);
}
