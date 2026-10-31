import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database, Query } from './db.js';

const snapshotSchema = z.object({
  source: z.string().url(),
  fetchedAt: z.string().datetime(),
  teams: z
    .array(
      z.object({
        id: z.string().max(4),
        name: z.string(),
        nickname: z.string(),
        conference: z.string(),
        division: z.string(),
        color: z.string().regex(/^#[a-f\d]{6}$/i),
      }),
    )
    .max(50),
  players: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        position: z.string(),
        season: z.number().int(),
        team: z.string(),
        stats: z.record(z.string(), z.number().finite()),
        weekly: z.array(z.record(z.string(), z.number().finite())),
      }),
    )
    .max(5000),
  games: z
    .array(
      z.object({
        id: z.string(),
        season: z.number().int(),
        week: z.number().int(),
        type: z.string(),
        home: z.string(),
        away: z.string(),
        startsAt: z.string().datetime(),
        kickoffConfirmed: z.boolean().default(true),
        homeScore: z.number().int().nullable(),
        awayScore: z.number().int().nullable(),
        stadium: z.string(),
      }),
    )
    .max(3000),
});
export async function migrate(db: Database) {
  const sql = await fs.readFile(
    new URL('./schema.sql', import.meta.url).pathname.replace(
      '/dist/schema.sql',
      '/server/schema.sql',
    ),
    'utf8',
  );
  // Split a migration containing only plain SQL statements; no procedural functions.
  await db.transaction(async (q) => {
    for (const statement of sql.split(';').filter((s) => s.trim())) await q(statement);
  });
}
export async function importSnapshot(db: Database, input: unknown, existingJob?: string) {
  const data = snapshotSchema.parse(input);
  const id = existingJob || randomUUID();
  if (!existingJob)
    await db.query("INSERT INTO sync_jobs(id,source,status) VALUES($1,$2,'running')", [
      id,
      data.source,
    ]);
  try {
    await db.transaction(async (q) => {
      for (const t of data.teams) {
        await q(
          `INSERT INTO teams(id,name,nickname,conference,division,color,source) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=excluded.name,nickname=excluded.nickname,conference=excluded.conference,division=excluded.division,color=excluded.color,source=excluded.source`,
          [t.id, t.name, t.nickname, t.conference, t.division, t.color, data.source],
        );
        await q(
          'INSERT INTO communities(id,name,description,team_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [
            t.id.toLowerCase(),
            t.name,
            `The home for ${t.nickname} fans. Break down the games, share your analysis, and find your people.`,
            t.id,
          ],
        );
      }
      await q(
        "INSERT INTO communities(id,name,description) VALUES('nfl','NFL Central','Every team. Every Sunday. A place for the bigger football conversation.') ON CONFLICT DO NOTHING",
      );
      for (const p of data.players) {
        await q(
          'INSERT INTO players(id,name,position,source) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position,source=excluded.source',
          [p.id, p.name, p.position, data.source],
        );
        await q(
          'INSERT INTO player_seasons(player_id,season,team_id,stats,weekly) VALUES($1,$2,$3,$4,$5) ON CONFLICT(player_id,season) DO UPDATE SET team_id=excluded.team_id,stats=excluded.stats,weekly=excluded.weekly',
          [p.id, p.season, p.team, JSON.stringify(p.stats), JSON.stringify(p.weekly)],
        );
      }
      for (const g of data.games)
        await q(
          'INSERT INTO games(id,season,week,type,home_id,away_id,starts_at,home_score,away_score,stadium,source,kickoff_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET starts_at=excluded.starts_at,home_score=excluded.home_score,away_score=excluded.away_score,stadium=excluded.stadium,kickoff_confirmed=excluded.kickoff_confirmed',
          [
            g.id,
            g.season,
            g.week,
            g.type,
            g.home,
            g.away,
            g.startsAt,
            g.homeScore,
            g.awayScore,
            g.stadium,
            data.source,
            g.kickoffConfirmed,
          ],
        );
      await scorePredictions(q);
      await q("UPDATE sync_jobs SET status='success',finished_at=now(),message=$2 WHERE id=$1", [
        id,
        `${data.teams.length} teams · ${data.players.length} player seasons · ${data.games.length} games. Source retrieved ${data.fetchedAt}.`,
      ]);
    });
    return { id, teams: data.teams.length, players: data.players.length, games: data.games.length };
  } catch (e) {
    await db.query(
      "UPDATE sync_jobs SET status='failed',finished_at=now(),message=$2 WHERE id=$1",
      [id, e instanceof Error ? e.message.slice(0, 500) : 'Import failed'],
    );
    throw e;
  }
}
export async function scorePredictions(q: Query) {
  await q(
    `UPDATE predictions p SET points=CASE WHEN (g.home_score>g.away_score AND p.team_id=g.home_id) OR (g.away_score>g.home_score AND p.team_id=g.away_id) THEN 1 ELSE 0 END FROM games g WHERE p.game_id=g.id AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL`,
  );
}
export async function initialize(db: Database) {
  await migrate(db);
  const [row] = await db.query('SELECT count(*)::integer AS count FROM teams');
  if (!row.count)
    await importSnapshot(db, JSON.parse(await fs.readFile('data/nfl-snapshot.json', 'utf8')));
}
