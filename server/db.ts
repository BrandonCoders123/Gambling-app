import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs/promises';

export type Query = <T = any>(sql: string, params?: any[]) => Promise<T[]>;
export interface Database {
  query: Query;
  transaction: <T>(fn: (query: Query) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}
export async function connect(): Promise<Database> {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    return {
      query: async (s, p) => (await pool.query(s, p)).rows,
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(async (s, p) => (await client.query(s, p)).rows);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const dir = process.env.DATA_DIR || path.resolve('.data');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const local = new PGlite(path.join(dir, 'postgres'));
  await local.waitReady;
  // Queue every local operation so other requests cannot enter a transaction.
  let queue: Promise<any> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  return {
    query: (s, p) => serial(async () => (await local.query<any>(s, p)).rows),
    transaction: (fn) =>
      serial(() => local.transaction((tx) => fn(async (s, p) => (await tx.query<any>(s, p)).rows))),
    close: () => serial(() => local.close()),
  };
}
