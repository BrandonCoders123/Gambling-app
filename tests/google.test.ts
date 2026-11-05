import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { connect, type Database } from '../server/db.js';
import { migrate } from '../server/data.js';
import { createApp } from '../server/app.js';
import { digest } from '../server/auth.js';

let db: Database, app: ReturnType<typeof createApp>, dir: string;
const originalFetch = globalThis.fetch;
let profile: any;
let providerFails = false;
let exchanges: URLSearchParams[] = [];
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'google-auth-'));
  process.env.DATA_DIR = dir;
  delete process.env.DATABASE_URL;
  process.env.APP_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  db = await connect();
  await migrate(db);
  app = createApp(db);
  globalThis.fetch = (async (url, options) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      exchanges.push(options!.body as URLSearchParams);
      return new Response(JSON.stringify({ access_token: 'test-access' }), {
        status: providerFails ? 400 : 200,
      });
    }
    assert.equal(String(url), 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal((options!.headers as any).Authorization, 'Bearer test-access');
    return new Response(JSON.stringify(profile));
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = originalFetch;
  await db.close();
  await fs.rm(dir, { recursive: true, force: true });
});
async function start() {
  const agent = request.agent(app);
  const response = await agent.get('/api/auth/google').expect(302);
  const url = new URL(response.headers.location);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'http://localhost:3000/api/auth/google/callback',
  );
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(!response.headers.location.includes('test-secret'));
  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  return { agent, state: url.searchParams.get('state')! };
}
test('Google creates a verified ordinary user, issues a session, and reuses the linked account', async () => {
  profile = { sub: 'google-123', email: 'new@gmail.com', email_verified: true };
  const { agent, state } = await start();
  const response = await agent
    .get('/api/auth/google/callback')
    .query({ state, code: 'test-code' })
    .expect(302);
  assert.equal(response.headers.location, '/');
  assert.match(String(response.headers['set-cookie']), /sa_session=.*HttpOnly/);
  const me = (await agent.get('/api/auth/me')).body.data;
  assert.equal(me.email, profile.email);
  assert.equal(me.verified, true);
  assert.equal(me.role, 'user');
  assert.equal(me.password_hash, undefined);
  assert.equal(exchanges.at(-1)!.get('client_secret'), 'test-secret');
  assert.ok(exchanges.at(-1)!.get('code_verifier'));
  const next = await start();
  await next.agent.get('/api/auth/google/callback').query({ state: next.state, code: 'next' });
  assert.equal((await next.agent.get('/api/auth/me')).body.data.id, me.id);
  assert.equal((await db.query('SELECT * FROM users')).length, 1);
  await agent
    .get('/api/auth/google/callback')
    .query({ state, code: 'replay' })
    .expect('Location', '/login?google_error=expired');
  await agent.post('/api/auth/logout').set('X-StatArena', '1').expect(200);
  assert.equal((await agent.get('/api/auth/me')).body.data, null);
});
test('state must match the browser, be unexpired and be consumed once, including cancellation', async () => {
  let attempt = await start();
  const before = exchanges.length;
  await request(app)
    .get('/api/auth/google/callback')
    .query({ state: attempt.state, code: 'forged' })
    .expect('Location', '/login?google_error=expired');
  await attempt.agent
    .get('/api/auth/google/callback')
    .query({ state: attempt.state, error: 'access_denied' })
    .expect('Location', '/login?google_error=cancelled');
  assert.equal(
    (
      await db.query('SELECT * FROM google_oauth_states WHERE state_hash=$1', [
        digest(attempt.state),
      ])
    ).length,
    0,
  );
  attempt = await start();
  await db.query("UPDATE google_oauth_states SET expires_at=now()-interval '1 minute'");
  await attempt.agent
    .get('/api/auth/google/callback')
    .query({ state: attempt.state, code: 'expired' })
    .expect('Location', '/login?google_error=expired');
  assert.equal(exchanges.length, before);
});
test('unverified Google emails, provider failures and suspended users cannot sign in', async () => {
  for (const scenario of ['unverified', 'provider', 'suspended']) {
    profile = {
      sub: 'google-123',
      email: 'new@gmail.com',
      email_verified: scenario !== 'unverified',
    };
    providerFails = scenario === 'provider';
    if (scenario === 'suspended') await db.query("UPDATE users SET status='suspended'");
    const { agent, state } = await start();
    await agent
      .get('/api/auth/google/callback')
      .query({ state, code: 'test' })
      .expect(
        'Location',
        '/login?google_error=' + (scenario === 'suspended' ? 'disabled' : 'failed'),
      );
    assert.equal((await agent.get('/api/auth/me')).body.data, null);
  }
  providerFails = false;
});
test('existing third-party and unverified accounts are not automatically merged', async () => {
  for (const email of ['third@example.com', 'unverified@gmail.com']) {
    await db.query(
      'INSERT INTO users(id,username,email,password_hash,verified_at) VALUES(gen_random_uuid(),$1,$2,$3,$4)',
      [email.split('@')[0], email, 'unused', email.endsWith('@example.com') ? new Date() : null],
    );
    profile = { sub: email, email, email_verified: true };
    const { agent, state } = await start();
    await agent
      .get('/api/auth/google/callback')
      .query({ state, code: 'test' })
      .expect('Location', '/login?google_error=existing');
    assert.equal((await agent.get('/api/auth/me')).body.data, null);
  }
});
test('verified Gmail users keep their existing profile when linked', async () => {
  await db.query(
    "INSERT INTO users(id,username,email,password_hash,verified_at) VALUES(gen_random_uuid(),'gmailfan','existing@gmail.com','unused',now())",
  );
  profile = { sub: 'existing-google', email: 'existing@gmail.com', email_verified: true };
  const { agent, state } = await start();
  await agent
    .get('/api/auth/google/callback')
    .query({ state, code: 'test' })
    .expect('Location', '/');
  assert.equal((await agent.get('/api/auth/me')).body.data.username, 'gmailfan');
});

test('Google configuration endpoint never exposes credentials and supports disabled setup', async () => {
  const enabled = await request(app).get('/api/auth/google/config').expect(200);
  assert.deepEqual(enabled.body, { data: { enabled: true } });
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.deepEqual((await request(app).get('/api/auth/google/config')).body, {
    data: { enabled: false },
  });
  await request(app).get('/api/auth/google').expect('Location', '/login?google_error=unavailable');
});
