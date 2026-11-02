import { latestSeason, scheduleWeeks, gameState } from './football.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Database, Query } from './db.js';
import { audit, digest, hashPassword, safeUser, sendToken, token, verifyPassword } from './auth.js';
import { importSnapshot } from './data.js';
import fs from 'node:fs/promises';
import { startNFLverseSync } from './sync.js';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const uuid = z.string().uuid();
const password = z.string().min(12, 'Use at least 12 characters.').max(128);
const email = z.string().trim().toLowerCase().email().max(254);
const content = z.string().trim().min(1, 'Please enter some text.');
const out = (res: Response, data: any, status = 200) => res.status(status).json({ data });
const auth = (req: Request, _res: Response, next: NextFunction) =>
  req.user ? next() : next(new HttpError(401, 'Sign in to continue.'));
const admin = (req: Request, _res: Response, next: NextFunction) =>
  req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Administrator access required.'));
const seasonOf = (req: Request) =>
  z.coerce
    .number()
    .int()
    .min(1999)
    .max(2100)
    .parse(req.query.season || 2024);
const count = (rows: any[]) => rows[0]?.count || 0;
export function createApp(db: Database) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production'
          ? {
              directives: {
                'script-src': ["'self'"],
                'img-src': ["'self'", 'data:'],
                'style-src': ["'self'", "'unsafe-inline'"],
                'connect-src': ["'self'"],
                'upgrade-insecure-requests': [],
              },
            }
          : false,
    }),
  );
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 40,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many attempts. Please try again later.' },
    }),
  );
  app.use('/api', async (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const expected = new URL(process.env.APP_URL || `${req.protocol}://${req.get('host')}`)
        .origin;
      if ((origin && origin !== expected) || req.get('x-statarena') !== '1')
        return next(new HttpError(403, 'Request origin could not be verified.'));
    }
    const session = req.cookies.sa_session;
    if (typeof session === 'string') {
      const [user] = await db.query(
        "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND u.verified_at IS NOT NULL",
        [digest(session)],
      );
      req.user = user;
      if (user)
        await db.query(
          "UPDATE sessions SET last_seen=now() WHERE token_hash=$1 AND last_seen<now()-interval '5 minutes'",
          [digest(session)],
        );
    }
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    out(res, { status: 'ok', database: 'PostgreSQL', dataMode: 'sourced snapshot' });
  });
  app.post('/api/auth/register', async (req, res) => {
    const body = z
      .object({
        username: z
          .string()
          .trim()
          .min(3)
          .max(30)
          .regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers and underscores.'),
        email,
        password,
      })
      .parse(req.body);
    const user = { id: randomUUID(), ...body };
    await db.query('INSERT INTO users(id,username,email,password_hash) VALUES($1,$2,$3,$4)', [
      user.id,
      user.username,
      user.email,
      await hashPassword(body.password),
    ]);
    await sendToken(db, user, 'verify');
    out(res, { message: 'Check your email to verify your account.' }, 201);
  });
  app.post('/api/auth/verify', async (req, res) => {
    const { token: secret } = z.object({ token: z.string().length(64) }).parse(req.body);
    await db.transaction(async (q) => {
      const [t] = await q(
        "DELETE FROM auth_tokens WHERE token_hash=$1 AND kind='verify' AND expires_at>now() RETURNING user_id",
        [digest(secret)],
      );
      if (!t) fail(400, 'This verification link has expired or was already used.');
      await q('UPDATE users SET verified_at=now() WHERE id=$1', [t.user_id]);
    });
    out(res, { message: 'Email verified. You can now sign in.' });
  });
  app.post('/api/auth/resend', async (req, res) => {
    const body = z.object({ email }).parse(req.body);
    const [u] = await db.query('SELECT * FROM users WHERE email=$1', [body.email]);
    if (u && !u.verified_at && u.status === 'active') await sendToken(db, u, 'verify');
    out(res, { message: 'If the account needs verification, an email is on its way.' });
  });
  app.post('/api/auth/login', async (req, res) => {
    const body = z.object({ email, password: z.string().min(1).max(128) }).parse(req.body);
    const [u] = await db.query('SELECT * FROM users WHERE email=$1', [body.email]);
    // Run a password derivation even for unknown accounts to reduce timing differences.
    const valid = await verifyPassword(
      body.password,
      u?.password_hash || 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128),
    );
    if (!u || !valid || u.status !== 'active') fail(401, 'Email or password is incorrect.');
    if (!u.verified_at) fail(403, 'Verify your email before signing in.');
    const secret = token();
    await db.transaction(async (q) => {
      await q('DELETE FROM sessions WHERE expires_at<now()');
      await q(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
        [digest(secret), u.id],
      );
      await q("INSERT INTO activity_events(id,user_id,kind) VALUES($1,$2,'login')", [
        randomUUID(),
        u.id,
      ]);
    });
    res.cookie('sa_session', secret, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 86400000,
      path: '/',
    });
    out(res, safeUser(u));
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (req.cookies.sa_session)
      await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(req.cookies.sa_session)]);
    res.clearCookie('sa_session', { path: '/' });
    out(res, { ok: true });
  });
  app.get('/api/auth/me', (req, res) => out(res, req.user ? safeUser(req.user) : null));
  app.post('/api/auth/forgot', async (req, res) => {
    const body = z.object({ email }).parse(req.body);
    const [u] = await db.query(
      "SELECT * FROM users WHERE email=$1 AND verified_at IS NOT NULL AND status='active'",
      [body.email],
    );
    if (u) await sendToken(db, u, 'reset');
    out(res, { message: 'If the account exists, a reset link is on its way.' });
  });
  app.post('/api/auth/reset', async (req, res) => {
    const b = z.object({ token: z.string().length(64), password }).parse(req.body);
    const hash = await hashPassword(b.password);
    await db.transaction(async (q) => {
      const [t] = await q(
        "DELETE FROM auth_tokens WHERE token_hash=$1 AND kind='reset' AND expires_at>now() RETURNING user_id",
        [digest(b.token)],
      );
      if (!t) fail(400, 'This reset link has expired or was already used.');
      await q('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1', [t.user_id, hash]);
      await q('DELETE FROM sessions WHERE user_id=$1', [t.user_id]);
    });
    out(res, { message: 'Password updated. Sign in with your new password.' });
  });
  app.patch('/api/profile', auth, async (req, res) => {
    const b = z
      .object({
        username: z
          .string()
          .trim()
          .min(3)
          .max(30)
          .regex(/^[a-zA-Z0-9_]+$/),
        bio: z.string().trim().max(500),
      })
      .parse(req.body);
    const [u] = await db.query(
      'UPDATE users SET username=$2,bio=$3,updated_at=now() WHERE id=$1 RETURNING *',
      [req.user.id, b.username, b.bio],
    );
    out(res, safeUser(u));
  });
  app.get('/api/users/:id', async (req, res) => {
    const [u] = await db.query(
      "SELECT id,username,bio,created_at FROM users WHERE id=$1 AND status='active'",
      [uuid.parse(req.params.id)],
    );
    if (!u) fail(404, 'Profile not found.');
    out(res, u);
  });
  app.post('/api/account/:action', auth, async (req, res) => {
    const action = z.enum(['delete', 'deactivate']).parse(req.params.action);
    const b = z.object({ password: z.string().max(128) }).parse(req.body);
    if (!(await verifyPassword(b.password, req.user.password_hash)))
      fail(403, 'Password is incorrect.');
    await db.transaction(async (q) => {
      if (action === 'delete') await q('DELETE FROM users WHERE id=$1', [req.user.id]);
      else {
        await q("UPDATE users SET status='deactivated' WHERE id=$1", [req.user.id]);
        await q('DELETE FROM sessions WHERE user_id=$1', [req.user.id]);
      }
    });
    res.clearCookie('sa_session', { path: '/' });
    out(res, { ok: true });
  });
  app.get('/api/sports', (_req, res) => out(res, [{ id: 'football', name: 'American football' }]));
  app.get('/api/leagues', (_req, res) =>
    out(res, [{ id: 'nfl', name: 'National Football League', sport: 'football' }]),
  );
  app.get('/api/meta', async (_req, res) =>
    out(res, {
      league: 'NFL',
      communityCount: count(await db.query('SELECT count(*)::integer count FROM communities')),
      seasons: (
        await db.query(
          'SELECT season FROM player_seasons UNION SELECT season FROM games ORDER BY season DESC',
        )
      ).map((s) => s.season),
      gameSeasons: (await db.query('SELECT DISTINCT season FROM games ORDER BY season DESC')).map(
        (s) => s.season,
      ),
      source: 'nflverse',
      sourceUrl: 'https://github.com/nflverse/nflverse-data',
      sync: (
        await db.query(
          "SELECT * FROM sync_jobs WHERE status='success' ORDER BY finished_at DESC LIMIT 1",
        )
      )[0],
    }),
  );
  app.get('/api/teams', async (req, res) => {
    const season = seasonOf(req);
    out(
      res,
      await db.query(
        `SELECT t.*, (SELECT count(*)::integer FROM games g WHERE g.season=$1 AND g.type='REG' AND ((g.home_id=t.id AND g.home_score>g.away_score) OR (g.away_id=t.id AND g.away_score>g.home_score))) wins,(SELECT count(*)::integer FROM games g WHERE g.season=$1 AND g.type='REG' AND ((g.home_id=t.id AND g.home_score<g.away_score) OR (g.away_id=t.id AND g.away_score<g.home_score))) losses,(SELECT count(*)::integer FROM games g WHERE g.season=$1 AND g.type='REG' AND (g.home_id=t.id OR g.away_id=t.id) AND g.home_score=g.away_score) ties FROM teams t ORDER BY t.name`,
        [season],
      ),
    );
  });
  app.get('/api/teams/:id', async (req, res) => {
    const [t] = await db.query('SELECT * FROM teams WHERE id=$1', [req.params.id]);
    if (!t) fail(404, 'Team not found.');
    const season = req.query.season ? seasonOf(req) : await latestSeason(db);
    const games = await db.query(
      'SELECT * FROM games WHERE (home_id=$1 OR away_id=$1) AND season=$2 ORDER BY starts_at',
      [t.id, season],
    );
    const roster = await db.query(
      `SELECT r.player_id id,r.name,r.position,r.status,s.stats FROM team_rosters r LEFT JOIN player_seasons s ON s.player_id=r.player_id AND s.season=r.season AND s.team_id=r.team_id WHERE r.team_id=$1 AND r.season=$2 ORDER BY r.name`,
      [t.id, season],
    );
    const teamWeekly = await db.query(
      'SELECT * FROM team_weekly WHERE team_id=$1 AND season=$2 ORDER BY week',
      [t.id, season],
    );
    const stats: Record<string, number> = {};
    for (const w of teamWeekly.filter((w) => w.type === 'REG'))
      for (const [key, value] of Object.entries(w.stats))
        stats[key] = (stats[key] || 0) + Number(value);
    out(res, {
      ...t,
      season,
      stats,
      teamWeekly,
      rosterAvailable: roster.length > 0,
      players: roster.length
        ? roster
        : await db.query(
            'SELECT p.*,s.stats FROM players p JOIN player_seasons s ON p.id=s.player_id WHERE s.team_id=$1 AND s.season=$2 ORDER BY p.name',
            [t.id, season],
          ),
      games: games.map((g) => ({ ...g, status: gameState(g) })),
      schedule: scheduleWeeks(games, t.id, season),
      limitations: [
        'Season totals cover regular-season games only.',
        ...(roster.length
          ? []
          : ['Full roster unavailable; only players with recorded statistics are listed.']),
        ...(teamWeekly.length ? [] : ['Team statistics unavailable for this season.']),
        'Roster is the provider’s season snapshot; trades and inactive players may appear.',
      ],
    });
  });
  app.get('/api/weeks', async (req, res) => {
    const season = req.query.season ? seasonOf(req) : await latestSeason(db);
    const week = z.coerce
      .number()
      .int()
      .min(1)
      .max(30)
      .parse(req.query.week || 1);
    const type = z.enum(['REG', 'POST']).parse(req.query.type || 'REG');
    const games = await db.query(
      "SELECT * FROM games WHERE season=$1 AND (CASE WHEN type='REG' THEN 'REG' ELSE 'POST' END)=$2",
      [season, type],
    );
    const teams = await db.query('SELECT * FROM teams ORDER BY name');
    const teamStats = await db.query(
      'SELECT * FROM team_weekly WHERE season=$1 AND week=$2 AND type=$3',
      [season, week, type],
    );
    const players = await db.query(
      'SELECT * FROM player_weekly WHERE season=$1 AND week=$2 AND type=$3 ORDER BY team_id,name',
      [season, week, type],
    );
    out(res, {
      season,
      week,
      type,
      source: 'https://github.com/nflverse/nflverse-data',
      teams: teams.map((t) => {
        const schedule = games.filter((g) => g.home_id === t.id || g.away_id === t.id);
        const game = scheduleWeeks(schedule, t.id, season).find(
          (g) => g.week === week && (type === 'REG' ? g.type === 'REG' : g.type !== 'REG'),
        );
        return {
          ...t,
          game: game || null,
          status: game?.status || 'unavailable',
          stats: teamStats.find((w) => w.team_id === t.id)?.stats || null,
          players: players.filter((p) => p.team_id === t.id),
        };
      }),
    });
  });
  app.get('/api/players', async (req, res) => {
    const search = z
      .string()
      .max(100)
      .parse(req.query.q || '');
    const position = z
      .enum(['ALL', 'QB', 'RB', 'WR', 'TE', 'FB'])
      .parse(req.query.position || 'ALL');
    const metric = z
      .enum(['passing_yards', 'rushing_yards', 'receiving_yards', 'passing_tds', 'receptions'])
      .parse(req.query.metric || 'passing_yards');
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(req.query.page || 1);
    const args = [seasonOf(req), `%${search}%`, position];
    const where = "s.season=$1 AND p.name ILIKE $2 AND ($3='ALL' OR p.position=$3)";
    const total = count(
      await db.query(
        `SELECT count(*)::integer count FROM players p JOIN player_seasons s ON s.player_id=p.id WHERE ${where}`,
        args,
      ),
    );
    const items = await db.query(
      `SELECT p.*,s.season,s.team_id,s.stats,t.color,t.name team_name FROM players p JOIN player_seasons s ON s.player_id=p.id JOIN teams t ON t.id=s.team_id WHERE ${where} ORDER BY (s.stats->>'${metric}')::numeric DESC,p.name LIMIT 24 OFFSET $4`,
      [...args, (page - 1) * 24],
    );
    out(res, { items, total, page, pages: Math.ceil(total / 24) });
  });
  app.get('/api/compare/options', async (req, res) =>
    out(
      res,
      await db.query(
        'SELECT p.id,p.name,p.position,s.team_id FROM players p JOIN player_seasons s ON p.id=s.player_id WHERE s.season=$1 ORDER BY p.name',
        [seasonOf(req)],
      ),
    ),
  );
  app.get('/api/players/:id', async (req, res) => {
    const [p] = await db.query(
      'SELECT p.*,s.season,s.team_id,s.stats,s.weekly,t.color,t.name team_name FROM players p JOIN player_seasons s ON s.player_id=p.id JOIN teams t ON t.id=s.team_id WHERE p.id=$1 AND s.season=$2',
      [req.params.id, seasonOf(req)],
    );
    if (!p) fail(404, 'No statistics available for this player and season.');
    out(res, p);
  });
  app.get('/api/stats/players/:id', async (req, res) => {
    const [p] = await db.query('SELECT * FROM player_seasons WHERE player_id=$1 AND season=$2', [
      req.params.id,
      seasonOf(req),
    ]);
    if (!p) fail(404, 'Statistics not found.');
    out(res, p);
  });
  app.get('/api/games', async (req, res) => {
    const selected = req.query.season
      ? seasonOf(req)
      : Number((await db.query('SELECT max(season) season FROM games'))[0].season);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(req.query.page || 1);
    const week = req.query.week
      ? z.coerce.number().int().min(1).max(30).parse(req.query.week)
      : null;
    const phase = z.enum(['ALL', 'REG', 'POST']).parse(req.query.type || 'ALL');
    out(res, {
      season: selected,
      items: await db.query(
        `SELECT * FROM games WHERE season=$1 AND ($2::integer IS NULL OR week=$2) AND ($4='ALL' OR CASE WHEN type='REG' THEN 'REG' ELSE 'POST' END=$4) ORDER BY starts_at LIMIT 32 OFFSET $3`,
        [selected, week, (page - 1) * 32, phase],
      ),
      total: count(
        await db.query(
          `SELECT count(*)::integer count FROM games WHERE season=$1 AND ($2::integer IS NULL OR week=$2) AND ($3='ALL' OR CASE WHEN type='REG' THEN 'REG' ELSE 'POST' END=$3)`,
          [selected, week, phase],
        ),
      ),
    });
  });
  app.get('/api/games/:id', async (req, res) => {
    const [g] = await db.query('SELECT * FROM games WHERE id=$1', [req.params.id]);
    if (!g) fail(404, 'Game not found.');
    out(res, g);
  });
  app.get('/api/favorites', auth, async (req, res) =>
    out(res, {
      teams: (
        await db.query('SELECT team_id FROM favorite_teams WHERE user_id=$1', [req.user.id])
      ).map((t) => t.team_id),
      players: (
        await db.query('SELECT player_id FROM favorite_players WHERE user_id=$1', [req.user.id])
      ).map((t) => t.player_id),
    }),
  );
  app.put('/api/favorites/:type/:id', auth, async (req, res) => {
    const kind = z.enum(['teams', 'players']).parse(req.params.type);
    const b = z.object({ following: z.boolean() }).parse(req.body);
    const table = kind === 'teams' ? 'favorite_teams' : 'favorite_players';
    const column = kind === 'teams' ? 'team_id' : 'player_id';
    if (b.following)
      await db.query(
        `INSERT INTO ${table}(user_id,${column}) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [req.user.id, req.params.id],
      );
    else
      await db.query(`DELETE FROM ${table} WHERE user_id=$1 AND ${column}=$2`, [
        req.user.id,
        req.params.id,
      ]);
    out(res, { following: b.following });
  });
  app.get('/api/communities', async (req, res) =>
    out(
      res,
      await db.query(
        `SELECT c.*,t.color,(SELECT count(*)::integer FROM memberships m WHERE m.community_id=c.id) members,(SELECT count(*)::integer FROM posts p WHERE p.community_id=c.id AND NOT p.hidden) posts,EXISTS(SELECT 1 FROM memberships m WHERE m.community_id=c.id AND m.user_id=$1) joined FROM communities c LEFT JOIN teams t ON t.id=c.team_id ORDER BY members DESC,c.name`,
        [req.user?.id || null],
      ),
    ),
  );
  app.post('/api/communities/:id/join', auth, async (req, res) => {
    const b = z.object({ join: z.boolean() }).parse(req.body);
    if (b.join)
      await db.query(
        'INSERT INTO memberships(user_id,community_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [req.user.id, req.params.id],
      );
    else
      await db.query('DELETE FROM memberships WHERE user_id=$1 AND community_id=$2', [
        req.user.id,
        req.params.id,
      ]);
    out(res, { joined: b.join });
  });
  app.get('/api/communities/:id/members', async (req, res) =>
    out(
      res,
      await db.query(
        "SELECT u.id,u.username,u.bio FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.community_id=$1 AND u.status='active' ORDER BY m.joined_at DESC LIMIT 100",
        [req.params.id],
      ),
    ),
  );
  app.get(['/api/posts', '/api/communities/:id/posts'], async (req, res) => {
    const search = z
      .string()
      .max(100)
      .parse(req.query.q || '');
    const sort = z.enum(['newest', 'popular']).parse(req.query.sort || 'newest');
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(req.query.page || 1);
    out(
      res,
      await db.query(
        `SELECT p.*,u.username,c.name community_name,(SELECT count(*)::integer FROM reactions r WHERE r.post_id=p.id) upvotes,(SELECT count(*)::integer FROM comments cm WHERE cm.post_id=p.id AND NOT cm.hidden) comments,EXISTS(SELECT 1 FROM reactions r WHERE r.post_id=p.id AND r.user_id=$3) reacted FROM posts p LEFT JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id WHERE NOT p.hidden AND ($1::text IS NULL OR p.community_id=$1) AND (p.title ILIKE $2 OR p.body ILIKE $2) ORDER BY ${sort === 'popular' ? 'upvotes DESC,' : ''} p.created_at DESC LIMIT 20 OFFSET $4`,
        [req.params.id || null, `%${search}%`, req.user?.id || null, (page - 1) * 20],
      ),
    );
  });
  async function member(q: Query, userId: string, communityId: string) {
    if (
      !(
        await q('SELECT 1 FROM memberships WHERE user_id=$1 AND community_id=$2', [
          userId,
          communityId,
        ])
      ).length
    )
      fail(403, 'Join this community before posting.');
  }
  app.post('/api/posts', auth, async (req, res) => {
    const b = z
      .object({ community_id: content.max(20), title: content.max(180), body: content.max(10000) })
      .parse(req.body);
    const id = randomUUID();
    await db.transaction(async (q) => {
      await member(q, req.user.id, b.community_id);
      await q('INSERT INTO posts(id,user_id,community_id,title,body) VALUES($1,$2,$3,$4,$5)', [
        id,
        req.user.id,
        b.community_id,
        b.title,
        b.body,
      ]);
      await q("INSERT INTO activity_events(id,user_id,kind) VALUES($1,$2,'post')", [
        randomUUID(),
        req.user.id,
      ]);
    });
    out(res, { id }, 201);
  });
  app.get('/api/posts/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const [p] = await db.query(
      'SELECT p.*,u.username,c.name community_name FROM posts p LEFT JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id WHERE p.id=$1 AND NOT p.hidden',
      [id],
    );
    if (!p) fail(404, 'Discussion not found.');
    out(res, {
      ...p,
      comments: await db.query(
        'SELECT c.*,u.username FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND NOT c.hidden ORDER BY c.created_at',
        [id],
      ),
    });
  });
  app.patch('/api/posts/:id', auth, async (req, res) => {
    const b = z.object({ title: content.max(180), body: content.max(10000) }).parse(req.body);
    const rows = await db.query(
      'UPDATE posts SET title=$3,body=$4,updated_at=now() WHERE id=$1 AND user_id=$2 AND NOT hidden RETURNING id',
      [uuid.parse(req.params.id), req.user.id, b.title, b.body],
    );
    if (!rows.length) fail(403, 'You can only edit your own visible posts.');
    out(res, { ok: true });
  });
  async function canModerate(q: Query, user: any, community: string) {
    return (
      user.role === 'admin' ||
      (user.role === 'moderator' &&
        (
          await q('SELECT 1 FROM community_moderators WHERE user_id=$1 AND community_id=$2', [
            user.id,
            community,
          ])
        ).length > 0)
    );
  }
  for (const type of ['posts', 'comments'] as const)
    app.delete(`/api/${type}/:id`, auth, async (req, res) => {
      await db.transaction(async (q) => {
        const [item] = await q(
          type === 'posts'
            ? 'SELECT user_id,community_id FROM posts WHERE id=$1'
            : 'SELECT c.user_id,p.community_id FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=$1',
          [uuid.parse(req.params.id)],
        );
        if (!item) fail(404, 'Content not found.');
        if (item.user_id !== req.user.id && !(await canModerate(q, req.user, item.community_id)))
          fail(403, 'You do not have permission to remove this content.');
        await q(`UPDATE ${type} SET hidden=true WHERE id=$1`, [req.params.id]);
        if (item.user_id !== req.user.id)
          await audit(q, req.user.id, `hide-${type}`, String(req.params.id));
      });
      out(res, { ok: true });
    });
  app.post('/api/posts/:id/comments', auth, async (req, res) => {
    const b = z.object({ body: content.max(3000) }).parse(req.body);
    const id = randomUUID();
    await db.transaction(async (q) => {
      const [p] = await q('SELECT community_id FROM posts WHERE id=$1 AND NOT hidden', [
        uuid.parse(req.params.id),
      ]);
      if (!p) fail(404, 'Discussion not found.');
      await member(q, req.user.id, p.community_id);
      await q('INSERT INTO comments(id,post_id,user_id,body) VALUES($1,$2,$3,$4)', [
        id,
        req.params.id,
        req.user.id,
        b.body,
      ]);
    });
    out(res, { id }, 201);
  });
  app.put('/api/posts/:id/reaction', auth, async (req, res) => {
    const b = z.object({ active: z.boolean() }).parse(req.body);
    const id = uuid.parse(req.params.id);
    if (!(await db.query('SELECT 1 FROM posts WHERE id=$1 AND NOT hidden', [id])).length)
      fail(404, 'Discussion not found.');
    if (b.active)
      await db.query(
        'INSERT INTO reactions(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [req.user.id, id],
      );
    else await db.query('DELETE FROM reactions WHERE user_id=$1 AND post_id=$2', [req.user.id, id]);
    out(res, { ok: true });
  });
  app.post('/api/reports', auth, async (req, res) => {
    const b = z
      .object({ post_id: uuid.optional(), comment_id: uuid.optional(), reason: content.max(1000) })
      .refine((b) => !!b.post_id !== !!b.comment_id, 'Report one post or comment.')
      .parse(req.body);
    await db.query(
      'INSERT INTO reports(id,user_id,post_id,comment_id,reason) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), req.user.id, b.post_id || null, b.comment_id || null, b.reason],
    );
    out(res, { message: 'Report received. A moderator will review it.' }, 201);
  });
  app.get('/api/predictions/games', async (_req, res) =>
    out(
      res,
      await db.query(
        'SELECT * FROM games WHERE starts_at>now() AND home_score IS NULL AND kickoff_confirmed ORDER BY starts_at LIMIT 40',
      ),
    ),
  );
  app.get('/api/predictions/history', auth, async (req, res) =>
    out(
      res,
      await db.query(
        'SELECT p.*,g.* FROM predictions p JOIN games g ON g.id=p.game_id WHERE p.user_id=$1 ORDER BY g.starts_at DESC',
        [req.user.id],
      ),
    ),
  );
  app.post('/api/predictions', auth, async (req, res) => {
    const b = z.object({ game_id: content.max(50), team_id: content.max(4) }).parse(req.body);
    await db.transaction(async (q) => {
      const [g] = await q('SELECT * FROM games WHERE id=$1 FOR UPDATE', [b.game_id]);
      if (!g) fail(404, 'Game not found.');
      if (
        !g.kickoff_confirmed ||
        new Date(g.starts_at).getTime() <= Date.now() ||
        g.home_score !== null
      )
        fail(409, 'Predictions are locked for this game.');
      if (![g.home_id, g.away_id].includes(b.team_id))
        fail(400, 'Choose a team playing in this game.');
      await q(
        'INSERT INTO predictions(user_id,game_id,team_id) VALUES($1,$2,$3) ON CONFLICT(user_id,game_id) DO UPDATE SET team_id=excluded.team_id,updated_at=now()',
        [req.user.id, b.game_id, b.team_id],
      );
    });
    out(res, { ok: true });
  });
  app.get('/api/predictions/leaderboard', async (_req, res) =>
    out(
      res,
      await db.query(
        "SELECT u.id,u.username,count(p.points)::integer played,coalesce(sum(p.points),0)::integer points FROM users u JOIN predictions p ON u.id=p.user_id WHERE u.status='active' AND p.points IS NOT NULL GROUP BY u.id ORDER BY points DESC,played ASC,u.username LIMIT 100",
      ),
    ),
  );
  app.get('/api/polls', async (req, res) =>
    out(
      res,
      await db.query(
        `SELECT p.*, (SELECT coalesce(jsonb_agg(jsonb_build_object('option',v.option_index,'count',v.total)),'[]'::jsonb) FROM (SELECT option_index,count(*)::integer total FROM poll_votes WHERE poll_id=p.id GROUP BY option_index) v) votes,(SELECT option_index FROM poll_votes v WHERE v.poll_id=p.id AND v.user_id=$2) my_vote FROM polls p WHERE ($1::text IS NULL OR community_id=$1) ORDER BY closes_at DESC LIMIT 20`,
        [req.query.community || null, req.user?.id || null],
      ),
    ),
  );
  app.post('/api/polls', auth, async (req, res) => {
    const b = z
      .object({
        community_id: content.max(20),
        question: content.max(180),
        options: z
          .array(content.max(100))
          .min(2)
          .max(6)
          .refine((a) => new Set(a).size === a.length, 'Use distinct options.'),
        closes_at: z.iso.datetime(),
      })
      .parse(req.body);
    if (new Date(b.closes_at).getTime() <= Date.now()) fail(400, 'Choose a future closing date.');
    await member(db.query, req.user.id, b.community_id);
    const id = randomUUID();
    await db.query(
      'INSERT INTO polls(id,community_id,user_id,question,options,closes_at) VALUES($1,$2,$3,$4,$5,$6)',
      [id, b.community_id, req.user.id, b.question, JSON.stringify(b.options), b.closes_at],
    );
    out(res, { id }, 201);
  });
  app.put('/api/polls/:id/vote', auth, async (req, res) => {
    const b = z.object({ option: z.number().int().min(0).max(5) }).parse(req.body);
    await db.transaction(async (q) => {
      const [p] = await q('SELECT * FROM polls WHERE id=$1 FOR UPDATE', [
        uuid.parse(req.params.id),
      ]);
      if (!p) fail(404, 'Poll not found.');
      if (new Date(p.closes_at).getTime() <= Date.now()) fail(409, 'This poll is closed.');
      if (b.option >= p.options.length) fail(400, 'Invalid poll option.');
      await q(
        'INSERT INTO poll_votes(user_id,poll_id,option_index) VALUES($1,$2,$3) ON CONFLICT(user_id,poll_id) DO UPDATE SET option_index=excluded.option_index',
        [req.user.id, p.id, b.option],
      );
    });
    out(res, { ok: true });
  });
  app.get('/api/search', async (req, res) => {
    const q = z.string().trim().min(1).max(100).parse(req.query.q);
    const s = `%${q}%`;
    out(res, {
      teams: await db.query('SELECT id,name,color FROM teams WHERE name ILIKE $1 LIMIT 8', [s]),
      players: await db.query('SELECT id,name,position FROM players WHERE name ILIKE $1 LIMIT 8', [
        s,
      ]),
      communities: await db.query('SELECT id,name FROM communities WHERE name ILIKE $1 LIMIT 8', [
        s,
      ]),
      posts: await db.query(
        'SELECT id,title FROM posts WHERE NOT hidden AND (title ILIKE $1 OR body ILIKE $1) LIMIT 8',
        [s],
      ),
    });
  });
  app.get('/api/dashboard', async (req, res) => {
    const userId = req.user?.id || null;
    const next = await db.query(
      'SELECT * FROM games WHERE starts_at>now() AND home_score IS NULL AND kickoff_confirmed AND ($1::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM favorite_teams WHERE user_id=$1) OR home_id IN (SELECT team_id FROM favorite_teams WHERE user_id=$1) OR away_id IN (SELECT team_id FROM favorite_teams WHERE user_id=$1)) ORDER BY starts_at LIMIT 8',
      [userId],
    );
    out(res, {
      nextGames: next,
      recentPosts: await db.query(
        'SELECT p.id,p.title,p.created_at,c.name community_name,u.username FROM posts p JOIN communities c ON c.id=p.community_id LEFT JOIN users u ON u.id=p.user_id WHERE NOT p.hidden AND ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=$1 AND m.community_id=p.community_id)) ORDER BY p.created_at DESC LIMIT 4',
        [userId],
      ),
      results: await db.query(
        'SELECT * FROM games WHERE home_score IS NOT NULL ORDER BY starts_at DESC LIMIT 8',
      ),
      favorites: await db.query(
        'SELECT t.* FROM teams t JOIN favorite_teams f ON t.id=f.team_id WHERE f.user_id=$1',
        [userId],
      ),
      favoritePlayers: await db.query(
        'SELECT p.*,s.stats,s.team_id FROM players p JOIN favorite_players f ON p.id=f.player_id JOIN player_seasons s ON s.player_id=p.id WHERE f.user_id=$1 AND s.season=$2',
        [userId, seasonOf(req)],
      ),
      prediction: (
        await db.query(
          'SELECT count(*)::integer total,count(points)::integer scored,coalesce(sum(points),0)::integer correct FROM predictions WHERE user_id=$1',
          [userId],
        )
      )[0],
      memberships: await db.query('SELECT community_id FROM memberships WHERE user_id=$1', [
        userId,
      ]),
    });
  });
  app.get('/api/admin/overview', auth, admin, async (_req, res) =>
    out(res, {
      users: count(await db.query('SELECT count(*)::integer count FROM users')),
      communities: count(await db.query('SELECT count(*)::integer count FROM communities')),
      posts: count(await db.query('SELECT count(*)::integer count FROM posts WHERE NOT hidden')),
      comments: count(
        await db.query('SELECT count(*)::integer count FROM comments WHERE NOT hidden'),
      ),
      reports: count(
        await db.query("SELECT count(*)::integer count FROM reports WHERE status='open'"),
      ),
      dailyActive: count(
        await db.query(
          "SELECT count(DISTINCT user_id)::integer count FROM sessions WHERE last_seen>now()-interval '1 day'",
        ),
      ),
      monthlyActive: count(
        await db.query(
          "SELECT count(DISTINCT user_id)::integer count FROM activity_events WHERE created_at>now()-interval '30 days'",
        ),
      ),
      registrations: await db.query(
        "SELECT created_at::date AS registration_day,count(*)::integer count FROM users WHERE created_at>now()-interval '30 days' GROUP BY registration_day ORDER BY registration_day",
      ),
      sync: await db.query('SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT 20'),
      audit: await db.query(
        'SELECT a.*,u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 50',
      ),
    }),
  );
  app.get('/api/admin/users', auth, admin, async (_req, res) =>
    out(
      res,
      await db.query(
        'SELECT id,username,email,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 200',
      ),
    ),
  );
  app.patch('/api/admin/users/:id', auth, admin, async (req, res) => {
    const b = z
      .object({
        role: z.enum(['user', 'moderator', 'admin']).optional(),
        status: z.enum(['active', 'suspended']).optional(),
      })
      .refine((b) => b.role || b.status, 'Specify a change.')
      .parse(req.body);
    const id = uuid.parse(req.params.id);
    if (id === req.user.id) fail(400, 'You cannot change your own administrative access.');
    await db.transaction(async (q) => {
      const rows = await q(
        'UPDATE users SET role=coalesce($2,role),status=coalesce($3,status),updated_at=now() WHERE id=$1 RETURNING id',
        [id, b.role || null, b.status || null],
      );
      if (!rows.length) fail(404, 'Account not found.');
      await audit(q, req.user.id, 'update-user', id);
    });
    out(res, { ok: true });
  });
  app.get(['/api/admin/reports', '/api/moderation/reports'], auth, async (req, res) => {
    if (!['admin', 'moderator'].includes(req.user.role)) fail(403, 'Moderator access required.');
    out(
      res,
      await db.query(
        `SELECT r.*,p.title,p.body post_body,cm.body comment_body,c.name community_name FROM reports r LEFT JOIN comments cm ON cm.id=r.comment_id JOIN posts p ON p.id=coalesce(r.post_id,cm.post_id) JOIN communities c ON c.id=p.community_id WHERE $1='admin' OR EXISTS(SELECT 1 FROM community_moderators m WHERE m.community_id=p.community_id AND m.user_id=$2) ORDER BY r.created_at DESC LIMIT 100`,
        [req.user.role, req.user.id],
      ),
    );
  });
  app.patch(['/api/admin/reports/:id', '/api/moderation/reports/:id'], auth, async (req, res) => {
    const b = z
      .object({ status: z.enum(['resolved', 'dismissed']), hide: z.boolean() })
      .parse(req.body);
    await db.transaction(async (q) => {
      const [r] = await q(
        'SELECT r.*,p.community_id FROM reports r LEFT JOIN comments cm ON cm.id=r.comment_id JOIN posts p ON p.id=coalesce(r.post_id,cm.post_id) WHERE r.id=$1',
        [uuid.parse(req.params.id)],
      );
      if (!r) fail(404, 'Report not found.');
      if (!(await canModerate(q, req.user, r.community_id)))
        fail(403, 'This community is outside your moderation scope.');
      if (b.hide)
        await q(`UPDATE ${r.post_id ? 'posts' : 'comments'} SET hidden=true WHERE id=$1`, [
          r.post_id || r.comment_id,
        ]);
      await q('UPDATE reports SET status=$2 WHERE id=$1', [r.id, b.status]);
      await audit(q, req.user.id, b.hide ? 'resolve-and-hide' : 'review-report', r.id);
    });
    out(res, { ok: true });
  });
  app.patch('/api/admin/communities/:id', auth, admin, async (req, res) => {
    const b = z
      .object({ description: content.max(1000), rules: content.max(3000) })
      .parse(req.body);
    await db.transaction(async (q) => {
      const rows = await q(
        'UPDATE communities SET description=$2,rules=$3 WHERE id=$1 RETURNING id',
        [req.params.id, b.description, b.rules],
      );
      if (!rows.length) fail(404, 'Community not found.');
      await audit(q, req.user.id, 'update-community', String(req.params.id));
    });
    out(res, { ok: true });
  });
  app.put('/api/admin/communities/:id/moderator', auth, admin, async (req, res) => {
    const b = z.object({ user_id: uuid, assigned: z.boolean() }).parse(req.body);
    await db.transaction(async (q) => {
      if (b.assigned) {
        const [u] = await q('SELECT role FROM users WHERE id=$1', [b.user_id]);
        if (!u || !['moderator', 'admin'].includes(u.role))
          fail(400, 'Grant the moderator role first.');
        await q(
          'INSERT INTO community_moderators(user_id,community_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [b.user_id, req.params.id],
        );
      } else
        await q('DELETE FROM community_moderators WHERE user_id=$1 AND community_id=$2', [
          b.user_id,
          req.params.id,
        ]);
      await audit(q, req.user.id, 'assign-moderator', `${req.params.id}:${b.user_id}`);
    });
    out(res, { ok: true });
  });
  app.post('/api/admin/sync', auth, admin, async (req, res) => {
    const result = await importSnapshot(
      db,
      JSON.parse(await fs.readFile('data/nfl-snapshot.json', 'utf8')),
    );
    await audit(db.query, req.user.id, 'import-sports-data', result.id);
    out(res, result);
  });
  app.post('/api/admin/refresh', auth, admin, async (req, res) => {
    const b = z.object({ season: z.number().int().min(1999).max(2100) }).parse(req.body);
    const { id, completion } = await startNFLverseSync(db, b.season);
    // Provider downloads run outside the response path; status is visible in sync_jobs.
    void completion.catch((e) =>
      console.error(JSON.stringify({ level: 'error', event: 'provider-sync', message: e.message })),
    );
    await audit(db.query, req.user.id, 'request-provider-refresh', String(b.season));
    out(
      res,
      { message: 'Provider refresh started. Check synchronization status shortly.', jobId: id },
      202,
    );
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API endpoint not found.')));
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError)
      return res.status(400).json({
        error: err.issues.map((i) => `${i.path.join('.') || 'Request'}: ${i.message}`).join(' '),
      });
    if (err.code === '23505')
      return res.status(409).json({
        error:
          err.constraint === 'one_running_sync_per_source'
            ? 'A sports-data refresh is already running.'
            : 'That username, email, or record is already in use.',
      });
    if (err.code === '23503')
      return res.status(404).json({ error: 'The referenced record does not exist.' });
    if (err.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON request.' });
    if (!(err instanceof HttpError))
      console.error(JSON.stringify({ level: 'error', message: err.message, code: err.code }));
    res.status(err.status || 500).json({
      error: err instanceof HttpError ? err.message : 'Something went wrong. Please try again.',
    });
  });
  return app;
}
