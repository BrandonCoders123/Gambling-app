import { randomUUID } from 'node:crypto';
import type { Database } from './db.js';
import { fetchNFLverse } from './provider.js';
import { importSnapshot } from './data.js';
export async function startNFLverseSync(db: Database, season = 2024) {
  const id = randomUUID();
  // The partial unique index also protects against parallel processes/replicas.
  await db.query(
    "INSERT INTO sync_jobs(id,source,status) VALUES($1,'https://github.com/nflverse/nflverse-data','running')",
    [id],
  );
  const completion = (async () => {
    try {
      return await importSnapshot(db, await fetchNFLverse(season), id);
    } catch (e) {
      await db.query(
        "UPDATE sync_jobs SET status='failed',finished_at=now(),message=$2 WHERE id=$1",
        [id, (e as Error).message.slice(0, 500)],
      );
      throw e;
    }
  })();
  return { id, completion };
}
export async function syncNFLverse(db: Database, season = 2024) {
  return (await startNFLverseSync(db, season)).completion;
}
