import {
  randomBytes,
  createHash,
  scrypt as rawScrypt,
  timingSafeEqual,
  randomUUID,
} from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import type { Request, Response } from 'express';
import type { Database, Query } from './db.js';
const scrypt = promisify(rawScrypt);
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const safeUser = (u: any) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  bio: u.bio,
  role: u.role,
  verified: !!u.verified_at,
  created_at: u.created_at,
});
export async function sendToken(db: Database, user: any, kind: 'verify' | 'reset') {
  const secret = token();
  await db.transaction(async (q) => {
    await q('DELETE FROM auth_tokens WHERE user_id=$1 AND kind=$2', [user.id, kind]);
    await q(
      "INSERT INTO auth_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [digest(secret), user.id, kind],
    );
  });
  const base = process.env.APP_URL || 'http://localhost:3000';
  const link = new URL(kind === 'verify' ? '/verify' : '/reset', base);
  link.searchParams.set('token', secret);
  const subject =
    kind === 'verify' ? 'Verify your StatArena account' : 'Reset your StatArena password';
  const text = `${subject}\n\n${link.toString()}\n\nThis link expires in one hour. If you did not request it, ignore this email.`;
  if (process.env.SMTP_URL)
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({
      from: process.env.MAIL_FROM || 'StatArena <noreply@example.com>',
      to: user.email,
      subject,
      text,
    });
  else {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Email delivery requires SMTP_URL in production');
    const dir = process.env.DATA_DIR || '.data';
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.appendFile(
      path.join(dir, 'mailbox.ndjson'),
      JSON.stringify({ to: user.email, subject, text }) + '\n',
      { mode: 0o600 },
    );
  }
}
export async function audit(q: Query, actor: string, action: string, target: string) {
  await q('INSERT INTO audit_logs(id,actor_id,action,target) VALUES($1,$2,$3,$4)', [
    randomUUID(),
    actor,
    action,
    target,
  ]);
}

export async function createSession(db: Database, req: Request, res: Response, userId: string) {
  const secret = token();
  await db.transaction(async (q) => {
    await q('DELETE FROM sessions WHERE expires_at<now()');
    if (typeof req.cookies.sa_session === 'string')
      await q('DELETE FROM sessions WHERE token_hash=$1', [digest(req.cookies.sa_session)]);
    await q(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [digest(secret), userId],
    );
    await q("INSERT INTO activity_events(id,user_id,kind) VALUES($1,$2,'login')", [
      randomUUID(),
      userId,
    ]);
  });
  res.cookie('sa_session', secret, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 86400000,
    path: '/',
  });
}
