import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './db.js';
import { createSession, digest, hashPassword, token } from './auth.js';

const profileSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  email_verified: z.literal(true),
  hd: z.string().optional(),
});
export function googleAuth(db: Database) {
  const router = Router();
  const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const callback = () =>
    new URL('/api/auth/google/callback', process.env.APP_URL || 'http://localhost:3000').href;
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/google',
  };
  router.get('/config', (_req, res) => res.json({ data: { enabled: configured() } }));
  router.get('/', async (_req, res) => {
    if (!configured()) return res.redirect('/login?google_error=unavailable');
    const state = token(),
      verifier = token();
    await db.query('DELETE FROM google_oauth_states WHERE expires_at<now()');
    await db.query(
      "INSERT INTO google_oauth_states(state_hash,verifier,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
      [digest(state), verifier],
    );
    res.cookie('sa_google_state', state, { ...cookieOptions, maxAge: 600000 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callback(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    res.redirect(url.href);
  });
  router.get('/callback', async (req, res) => {
    res.clearCookie('sa_google_state', cookieOptions);
    const failure = (reason: string) => res.redirect('/login?google_error=' + reason);
    if (!configured()) return failure('unavailable');
    const state = req.query.state;
    if (
      typeof state !== 'string' ||
      !/^[a-f0-9]{64}$/.test(state) ||
      state !== req.cookies.sa_google_state
    )
      return failure('expired');
    const [attempt] = await db.query(
      'DELETE FROM google_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING verifier',
      [digest(state)],
    );
    if (!attempt) return failure('expired');
    if (req.query.error) return failure('cancelled');
    if (typeof req.query.code !== 'string' || req.query.code.length > 4096)
      return failure('failed');
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: req.query.code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: callback(),
          grant_type: 'authorization_code',
          code_verifier: attempt.verifier,
        }),
      });
      if (!response.ok) return failure('failed');
      const tokens = z.object({ access_token: z.string().min(1) }).parse(await response.json());
      // Fetch identity directly from Google over TLS; never trust browser-supplied profile data.
      const identity = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!identity.ok) return failure('failed');
      const profile = profileSchema.parse(await identity.json());
      const user = await db.transaction(async (q) => {
        // Serialize creation/linking for simultaneous callbacks for the same Google account.
        await q('SELECT pg_advisory_xact_lock(hashtext($1))', [profile.sub]);
        const [linked] = await q(
          'SELECT u.* FROM google_identities g JOIN users u ON u.id=g.user_id WHERE g.subject=$1',
          [profile.sub],
        );
        if (linked) return linked;
        const [existing] = await q('SELECT * FROM users WHERE lower(email)=$1', [profile.email]);
        if (existing) {
          // Google is authoritative for Gmail and Workspace addresses only. Do not
          // merge unverified local accounts or third-party Google email addresses.
          if (!existing.verified_at || !(profile.email.endsWith('@gmail.com') || profile.hd))
            return null;
          await q('INSERT INTO google_identities(subject,user_id) VALUES($1,$2)', [
            profile.sub,
            existing.id,
          ]);
          return existing;
        }
        const id = randomUUID();
        const username = 'fan_' + id.replaceAll('-', '').slice(0, 20);
        const [created] = await q(
          'INSERT INTO users(id,username,email,password_hash,verified_at) VALUES($1,$2,$3,$4,now()) RETURNING *',
          [id, username, profile.email, await hashPassword(token())],
        );
        await q('INSERT INTO google_identities(subject,user_id) VALUES($1,$2)', [profile.sub, id]);
        return created;
      });
      if (!user) return failure('existing');
      if (user.status !== 'active' || !user.verified_at) return failure('disabled');
      await createSession(db, req, res, user.id);
      return res.redirect('/');
    } catch {
      // Provider errors can contain credentials or tokens; keep them out of logs and URLs.
      return failure('failed');
    }
  });
  return router;
}
