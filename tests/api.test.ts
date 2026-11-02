import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { connect, type Database } from '../server/db.js';
import { initialize, importSnapshot, scorePredictions } from '../server/data.js';
import { createApp } from '../server/app.js';
let db: Database, app: ReturnType<typeof createApp>, dir: string;
const secret = 'Strong test password 123!';
type Account = { id: string; agent: ReturnType<typeof request.agent>; email: string };
let alice: Account, bob: Account, mod: Account, admin: Account;
let postId: string, commentId: string, pollId: string;
const write = (
  agent: Account['agent'],
  method: 'post' | 'put' | 'patch' | 'delete',
  url: string,
  body: any = {},
) => agent[method](url).set('X-StatArena', '1').send(body);
async function mailToken(email: string) {
  const lines = (await fs.readFile(path.join(dir, 'mailbox.ndjson'), 'utf8'))
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const m = lines.filter((m) => m.to === email).at(-1);
  return new URL(m.text.split('\n').find((s: string) => s.startsWith('http'))).searchParams.get(
    'token',
  );
}
async function account(name: string) {
  const agent = request.agent(app);
  const email = name + '@example.com';
  await write(agent, 'post', '/api/auth/register', {
    username: name,
    email,
    password: secret,
  }).expect(201);
  await write(agent, 'post', '/api/auth/verify', { token: await mailToken(email) }).expect(200);
  const r = await write(agent, 'post', '/api/auth/login', { email, password: secret }).expect(200);
  return { id: r.body.data.id, email, agent };
}
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'statarena-test-'));
  process.env.DATA_DIR = dir;
  process.env.APP_URL = 'http://localhost:3000';
  delete process.env.DATABASE_URL;
  db = await connect();
  await initialize(db);
  app = createApp(db);
  alice = await account('alice');
  bob = await account('bob');
  mod = await account('moderator');
  admin = await account('administrator');
  await db.query("UPDATE users SET role='admin' WHERE id=$1", [admin.id]);
  await db.query("UPDATE users SET role='moderator' WHERE id=$1", [mod.id]);
  await db.query("INSERT INTO community_moderators(user_id,community_id) VALUES($1,'kc')", [
    mod.id,
  ]);
});
after(async () => {
  await db.close();
  await fs.rm(dir, { recursive: true, force: true });
});
test('sourced NFL data has correct season totals, search and pagination', async () => {
  const t = await request(app).get('/api/teams?season=2024').expect(200);
  assert.equal(t.body.data.length, 32);
  const p = await request(app).get('/api/players?season=2024&q=Joe%20Burrow').expect(200);
  assert.equal(p.body.data.items[0].stats.passing_yards, 4918);
  assert.equal(p.body.data.items[0].stats.passing_tds, 43);
  assert.match(p.body.data.items[0].source, /nflverse/);
  const page = await request(app).get('/api/players?page=2').expect(200);
  assert.equal(page.body.data.items.length, 24);
  await request(app).get('/api/players?metric=invalid').expect(400);
  await request(app).get('/api/players?season=invalid').expect(400);
});
test('guests, cross-origin requests, and forged form posts cannot write', async () => {
  await write(request.agent(app), 'post', '/api/posts', {
    community_id: 'kc',
    title: 'Denied',
    body: 'Denied',
  }).expect(401);
  await alice.agent.post('/api/posts').send({}).expect(403);
  await alice.agent
    .post('/api/posts')
    .set('X-StatArena', '1')
    .set('Origin', 'https://evil.example')
    .send({})
    .expect(403);
  await alice.agent.get('/api/admin/users').expect(403);
});
test('registration requires verification, enforces uniqueness, and uses one-use links', async () => {
  const a = request.agent(app),
    email = 'unverified@example.com';
  await write(a, 'post', '/api/auth/register', {
    username: 'unverified',
    email,
    password: secret,
  }).expect(201);
  await write(a, 'post', '/api/auth/login', { email, password: secret }).expect(403);
  const token = await mailToken(email);
  await write(a, 'post', '/api/auth/verify', { token }).expect(200);
  await write(a, 'post', '/api/auth/verify', { token }).expect(400);
  await write(a, 'post', '/api/auth/register', {
    username: 'alice2',
    email: 'ALICE@example.com',
    password: secret,
  }).expect(409);
  await write(a, 'post', '/api/auth/register', {
    username: 'short',
    email: 'short@example.com',
    password: 'short',
  }).expect(400);
  const [u] = await db.query('SELECT password_hash FROM users WHERE id=$1', [alice.id]);
  assert.match(u.password_hash, /^scrypt:/);
  assert.ok(!u.password_hash.includes(secret));
});
test('profile updates keep email and authentication fields private', async () => {
  await write(alice.agent, 'patch', '/api/profile', {
    username: 'alice',
    bio: 'Football and good conversations.',
  }).expect(200);
  const r = await bob.agent.get('/api/users/' + alice.id).expect(200);
  assert.equal(r.body.data.bio, 'Football and good conversations.');
  assert.equal(r.body.data.email, undefined);
  assert.equal(r.body.data.password_hash, undefined);
  const me = await alice.agent.get('/api/auth/me');
  assert.equal(me.body.data.email, alice.email);
  assert.equal(me.body.data.password_hash, undefined);
});
test('favorite relationships are idempotent and survive logout', async () => {
  for (let i = 0; i < 2; i++)
    await write(alice.agent, 'put', '/api/favorites/teams/KC', { following: true }).expect(200);
  await write(alice.agent, 'put', '/api/favorites/players/00-0036442', { following: true }).expect(
    200,
  );
  await write(alice.agent, 'post', '/api/auth/logout').expect(200);
  await alice.agent.get('/api/favorites').expect(401);
  const login = await write(alice.agent, 'post', '/api/auth/login', {
    email: alice.email,
    password: secret,
  }).expect(200);
  assert.match(login.headers['set-cookie'][0], /HttpOnly/);
  assert.match(login.headers['set-cookie'][0], /SameSite=Lax/);
  const f = await alice.agent.get('/api/favorites');
  assert.deepEqual(f.body.data.teams, ['KC']);
  assert.deepEqual(f.body.data.players, ['00-0036442']);
});
test('membership gates posting; content ownership is enforced', async () => {
  const body = {
    community_id: 'kc',
    title: 'A real football discussion',
    body: 'Let’s talk about the season.',
  };
  await write(alice.agent, 'post', '/api/posts', body).expect(403);
  for (const a of [alice, bob])
    await write(a.agent, 'post', '/api/communities/kc/join', { join: true }).expect(200);
  const p = await write(alice.agent, 'post', '/api/posts', body).expect(201);
  postId = p.body.data.id;
  await write(bob.agent, 'patch', '/api/posts/' + postId, {
    title: 'Hijacked',
    body: 'Not mine',
  }).expect(403);
  await write(bob.agent, 'delete', '/api/posts/' + postId).expect(403);
  await write(alice.agent, 'patch', '/api/posts/' + postId, {
    title: 'Updated football discussion',
    body: 'A more thoughtful take.',
  }).expect(200);
  const c = await write(bob.agent, 'post', `/api/posts/${postId}/comments`, {
    body: 'Interesting perspective.',
  }).expect(201);
  commentId = c.body.data.id;
  await write(alice.agent, 'delete', '/api/comments/' + commentId).expect(403);
  const detail = await request(app).get('/api/posts/' + postId);
  assert.equal(detail.body.data.comments.length, 1);
  await write(alice.agent, 'post', '/api/posts', {
    community_id: 'kc',
    title: '',
    body: 'invalid',
  }).expect(400);
});
test('reactions toggle without duplicate counts', async () => {
  for (let i = 0; i < 2; i++)
    await write(bob.agent, 'put', `/api/posts/${postId}/reaction`, { active: true }).expect(200);
  const [r] = await db.query('SELECT count(*)::integer count FROM reactions WHERE post_id=$1', [
    postId,
  ]);
  assert.equal(r.count, 1);
  await write(bob.agent, 'put', `/api/posts/${postId}/reaction`, { active: false }).expect(200);
});
test('poll votes enforce one active vote and reject closed or invalid options', async () => {
  const p = await write(alice.agent, 'post', '/api/polls', {
    community_id: 'kc',
    question: 'Which unit improves most?',
    options: ['Offense', 'Defense'],
    closes_at: new Date(Date.now() + 86400000).toISOString(),
  }).expect(201);
  pollId = p.body.data.id;
  await write(bob.agent, 'put', `/api/polls/${pollId}/vote`, { option: 0 }).expect(200);
  await write(bob.agent, 'put', `/api/polls/${pollId}/vote`, { option: 1 }).expect(200);
  const r = await bob.agent.get('/api/polls?community=kc').expect(200);
  assert.equal(r.body.data[0].my_vote, 1);
  assert.equal(r.body.data[0].votes[0].count, 1);
  await write(bob.agent, 'put', `/api/polls/${pollId}/vote`, { option: 5 }).expect(400);
  await db.query("UPDATE polls SET closes_at=now()-interval '1 minute' WHERE id=$1", [pollId]);
  await write(bob.agent, 'put', `/api/polls/${pollId}/vote`, { option: 0 }).expect(409);
});
test('reports and moderation are restricted to assigned communities', async () => {
  const report = await write(bob.agent, 'post', '/api/reports', {
    post_id: postId,
    reason: 'Please review this.',
  }).expect(201);
  assert.ok(report.body.data.message);
  await write(alice.agent, 'post', '/api/communities/buf/join', { join: true });
  const p = await write(alice.agent, 'post', '/api/posts', {
    community_id: 'buf',
    title: 'Another community',
    body: 'Different scope.',
  }).expect(201);
  await write(bob.agent, 'post', '/api/reports', {
    post_id: p.body.data.id,
    reason: 'Other scope',
  }).expect(201);
  const all = await admin.agent.get('/api/admin/reports').expect(200);
  assert.equal(all.body.data.length, 2);
  const scoped = await mod.agent.get('/api/moderation/reports').expect(200);
  assert.equal(scoped.body.data.length, 1);
  const outside = all.body.data.find((r: any) => r.post_id === p.body.data.id);
  await write(mod.agent, 'patch', '/api/moderation/reports/' + outside.id, {
    status: 'resolved',
    hide: true,
  }).expect(403);
  await mod.agent.get('/api/admin/overview').expect(403);
  await write(mod.agent, 'patch', '/api/moderation/reports/' + scoped.body.data[0].id, {
    status: 'resolved',
    hide: true,
  }).expect(200);
  await request(app)
    .get('/api/posts/' + postId)
    .expect(404);
  assert.equal((await db.query('SELECT * FROM audit_logs')).length, 1);
});
test('predictions reject outsiders and past games, update once, score idempotently', async () => {
  const [past] = await db.query('SELECT * FROM games WHERE starts_at<now() LIMIT 1');
  await write(alice.agent, 'post', '/api/predictions', {
    game_id: past.id,
    team_id: past.home_id,
  }).expect(409);
  const id = 'test-future';
  await db.query(
    "INSERT INTO games(id,season,week,type,home_id,away_id,starts_at,source) VALUES($1,2026,18,'REG','KC','BUF',now()+interval '1 day','test fixture')",
    [id],
  );
  await write(alice.agent, 'post', '/api/predictions', { game_id: id, team_id: 'SF' }).expect(400);
  await write(alice.agent, 'post', '/api/predictions', { game_id: id, team_id: 'KC' }).expect(200);
  await write(alice.agent, 'post', '/api/predictions', { game_id: id, team_id: 'BUF' }).expect(200);
  await db.query(
    "UPDATE games SET starts_at=now()-interval '1 minute',home_score=14,away_score=21 WHERE id=$1",
    [id],
  );
  for (let i = 0; i < 2; i++) await db.transaction(scorePredictions);
  const [p] = await db.query('SELECT * FROM predictions WHERE user_id=$1 AND game_id=$2', [
    alice.id,
    id,
  ]);
  assert.equal(p.points, 1);
  const r = await request(app).get('/api/predictions/leaderboard').expect(200);
  assert.equal(r.body.data[0].points, 1);
  assert.equal(r.body.data[0].played, 1);
  await db.query('DELETE FROM games WHERE id=$1', [id]);
});
test('repeated sports imports preserve IDs and avoid duplicates', async () => {
  const snapshot = JSON.parse(await fs.readFile('data/nfl-snapshot.json', 'utf8'));
  const before = await db.query('SELECT count(*)::integer count FROM player_seasons');
  await importSnapshot(db, snapshot);
  await importSnapshot(db, snapshot);
  assert.deepEqual(await db.query('SELECT count(*)::integer count FROM player_seasons'), before);
  assert.equal((await db.query('SELECT count(*)::integer count FROM teams'))[0].count, 32);
});
test('bad provider records roll back and concurrent sync jobs cannot start', async () => {
  const snapshot = JSON.parse(await fs.readFile('data/nfl-snapshot.json', 'utf8'));
  snapshot.players = [{ ...snapshot.players[0], id: 'test-rollback-player' }];
  snapshot.games = [{ ...snapshot.games[0], id: 'test-rollback-game', home: 'NOPE' }];
  await assert.rejects(importSnapshot(db, snapshot));
  assert.equal((await db.query("SELECT * FROM players WHERE id='test-rollback-player'")).length, 0);
  assert.equal((await db.query("SELECT * FROM sync_jobs WHERE status='failed'")).length, 1);
  const id = randomUUID();
  await db.query("INSERT INTO sync_jobs(id,source,status) VALUES($1,$2,'running')", [
    id,
    snapshot.source,
  ]);
  await write(admin.agent, 'post', '/api/admin/sync').expect(409);
  await db.query('DELETE FROM sync_jobs WHERE id=$1', [id]);
});
test('admin actions are protected, audited, and immediately affect existing sessions', async () => {
  await write(alice.agent, 'patch', '/api/admin/users/' + bob.id, { role: 'admin' }).expect(403);
  await write(admin.agent, 'patch', '/api/admin/users/' + admin.id, { role: 'user' }).expect(400);
  await write(admin.agent, 'patch', '/api/admin/users/' + bob.id, { status: 'suspended' }).expect(
    200,
  );
  await bob.agent.get('/api/favorites').expect(401);
  await write(admin.agent, 'patch', '/api/admin/users/' + bob.id, { status: 'active' }).expect(200);
  const r = await admin.agent.get('/api/admin/overview').expect(200);
  assert.ok(r.body.data.audit.length >= 3);
  assert.ok(r.body.data.dailyActive >= 1);
});
test('password reset is one-use and invalidates all old sessions', async () => {
  await write(bob.agent, 'post', '/api/auth/forgot', { email: bob.email }).expect(200);
  const t = await mailToken(bob.email);
  await write(bob.agent, 'post', '/api/auth/reset', {
    token: t,
    password: 'A new strong password 123!',
  }).expect(200);
  await bob.agent.get('/api/favorites').expect(401);
  await write(bob.agent, 'post', '/api/auth/reset', { token: t, password: secret }).expect(400);
  await write(bob.agent, 'post', '/api/auth/login', { email: bob.email, password: secret }).expect(
    401,
  );
  await write(bob.agent, 'post', '/api/auth/login', {
    email: bob.email,
    password: 'A new strong password 123!',
  }).expect(200);
});
test('account deletion requires password, cascades private data, and anonymizes comments', async () => {
  await write(bob.agent, 'post', '/api/account/delete', { password: 'wrong' }).expect(403);
  await write(bob.agent, 'post', '/api/account/delete', {
    password: 'A new strong password 123!',
  }).expect(200);
  assert.equal((await db.query('SELECT * FROM users WHERE id=$1', [bob.id])).length, 0);
  assert.equal(
    (await db.query('SELECT user_id FROM comments WHERE id=$1', [commentId]))[0].user_id,
    null,
  );
  await bob.agent.get('/api/favorites').expect(401);
});
test('deactivation revokes sessions and disables subsequent sign-ins', async () => {
  const a = await account('deactivating');
  await write(a.agent, 'post', '/api/account/deactivate', { password: secret }).expect(200);
  await a.agent.get('/api/favorites').expect(401);
  await write(a.agent, 'post', '/api/auth/login', { email: a.email, password: secret }).expect(401);
  assert.equal(
    (await db.query('SELECT status FROM users WHERE id=$1', [a.id]))[0].status,
    'deactivated',
  );
});
test('PostgreSQL application state survives closing and reopening the database', async () => {
  await db.close();
  db = await connect();
  app = createApp(db);
  const [u] = await db.query('SELECT username FROM users WHERE id=$1', [alice.id]);
  assert.equal(u.username, 'alice');
  const f = await db.query('SELECT * FROM favorite_teams WHERE user_id=$1', [alice.id]);
  assert.equal(f[0].team_id, 'KC');
});

test('weekly NFL data preserves scores, all teams, byes, phases, and missing statistics', async () => {
  const snapshot = JSON.parse(await fs.readFile('data/nfl-snapshot.json', 'utf8'));
  const latest = Math.max(...snapshot.games.map((g: any) => g.season));
  const response = await request(app)
    .get(`/api/weeks?season=${latest}&week=1&type=REG`)
    .expect(200);
  assert.equal(response.body.data.teams.length, 32);
  const sample = snapshot.teamWeekly.find((w: any) => w.season === latest && w.week === 1);
  const team = response.body.data.teams.find((t: any) => t.id === sample.team);
  assert.deepEqual(team.stats, sample.stats);
  const original = snapshot.games.find(
    (g: any) =>
      g.season === latest && g.week === 1 && (g.home === sample.team || g.away === sample.team),
  );
  assert.equal(team.game.home_score, original.homeScore);
  assert.equal(team.game.away_score, original.awayScore);
  assert.ok(team.players.length > 0);
  const future = await request(app).get(`/api/weeks?season=${latest}&week=18`).expect(200);
  assert.ok(future.body.data.teams.every((t: any) => t.stats === null && t.players.length === 0));
  const post = await request(app).get('/api/weeks?season=2024&week=19&type=POST').expect(200);
  assert.ok(post.body.data.teams.some((t: any) => t.game?.type === 'WC'));
  assert.ok(post.body.data.teams.every((t: any) => !t.game || t.game.type !== 'REG'));
  const bye = snapshot.games.filter(
    (g: any) => g.season === latest && g.type === 'REG' && (g.home === 'KC' || g.away === 'KC'),
  );
  const byeWeek = Array.from({ length: 18 }, (_, i) => i + 1).find(
    (w) => !bye.some((g: any) => g.week === w),
  );
  const byes = await request(app).get(`/api/weeks?season=${latest}&week=${byeWeek}`).expect(200);
  assert.equal(byes.body.data.teams.find((t: any) => t.id === 'KC').status, 'bye');
  const allPost = (await request(app).get('/api/games?season=2024&type=POST').expect(200)).body
    .data;
  assert.ok(allPost.items.length > 0);
  assert.ok(allPost.items.every((g: any) => g.type !== 'REG'));
  await request(app).get('/api/weeks?week=0').expect(400);
  await request(app).get('/api/weeks?type=invalid').expect(400);
});
test('team pages default to latest schedule season and include non-offensive roster members', async () => {
  const meta = (await request(app).get('/api/meta')).body.data;
  const team = (await request(app).get('/api/teams/KC').expect(200)).body.data;
  assert.equal(team.season, meta.gameSeasons[0]);
  assert.equal(team.rosterAvailable, true);
  assert.ok(
    team.players.some((p: any) =>
      ['CB', 'S', 'LB', 'DT', 'DE', 'OT', 'G', 'C', 'LS'].includes(p.position),
    ),
  );
  assert.ok(team.players.some((p: any) => p.stats === null));
  assert.equal(team.games.filter((g: any) => g.type === 'REG').length, 17);
  assert.ok(Object.keys(team.stats).length > 0);
  const old = (await request(app).get('/api/teams/KC?season=2024').expect(200)).body.data;
  assert.equal(old.season, 2024);
  assert.ok(old.games.some((g: any) => g.type === 'SB'));
  assert.ok(old.players.length > 0);
  assert.equal(old.rosterAvailable, false);
  assert.match(old.limitations.join(' '), /Full roster unavailable/);
});
test('multiple favorite teams persist after logout on another device and removals stay consistent', async () => {
  const fan = await account('weeklyfan');
  for (const id of ['KC', 'BUF'])
    await write(fan.agent, 'put', '/api/favorites/teams/' + id, { following: true }).expect(200);
  await write(fan.agent, 'post', '/api/auth/logout').expect(200);
  const device = request.agent(app);
  await write(device, 'post', '/api/auth/login', { email: fan.email, password: secret }).expect(
    200,
  );
  assert.deepEqual((await device.get('/api/favorites')).body.data.teams.sort(), ['BUF', 'KC']);
  await write(device, 'put', '/api/favorites/teams/KC', { following: false }).expect(200);
  const third = request.agent(app);
  await write(third, 'post', '/api/auth/login', { email: fan.email, password: secret }).expect(200);
  assert.deepEqual((await third.get('/api/favorites')).body.data.teams, ['BUF']);
  assert.deepEqual(
    (await third.get('/api/dashboard')).body.data.favorites.map((t: any) => t.id),
    ['BUF'],
  );
});
