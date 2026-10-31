import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { connect } from './db.js';
import { initialize } from './data.js';
import { createApp } from './app.js';
import { syncNFLverse } from './sync.js';
if (process.env.NODE_ENV === 'production') {
  if (!process.env.APP_URL?.startsWith('https://'))
    throw new Error('Set APP_URL to your public HTTPS origin in production.');
  if (!process.env.SMTP_URL)
    throw new Error('Set SMTP_URL for production verification and reset emails.');
  if (!process.env.DATABASE_URL)
    throw new Error('Set a managed PostgreSQL DATABASE_URL for production.');
}
const db = await connect();
await initialize(db);
const app = createApp(db);
if (process.env.NODE_ENV === 'production' || process.env.SERVE_BUILD === '1') {
  app.use(express.static(path.resolve('dist/public')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/public/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, ws: { port: Number(process.env.PORT || 3000) + 1 } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '0.0.0.0', () =>
  console.log(`StatArena listening on port ${port}.`),
);
const refreshMinutes = Number(process.env.SYNC_INTERVAL_MINUTES || 0);
if (refreshMinutes > 0) {
  if (!Number.isFinite(refreshMinutes) || refreshMinutes < 15)
    throw new Error('SYNC_INTERVAL_MINUTES must be at least 15.');
  setInterval(() => {
    void syncNFLverse(db, Number(process.env.SYNC_SEASON || 2024)).catch((e) =>
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'scheduled-sync',
          message: e.message,
          retryMinutes: refreshMinutes,
        }),
      ),
    );
  }, refreshMinutes * 60000).unref();
}
setInterval(() => {
  void db
    .transaction(async (q) => {
      await q('DELETE FROM sessions WHERE expires_at<now()');
      await q('DELETE FROM auth_tokens WHERE expires_at<now()');
    })
    .catch((e) =>
      console.error(
        JSON.stringify({ level: 'error', event: 'session-cleanup', message: e.message }),
      ),
    );
}, 3600000).unref();
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
