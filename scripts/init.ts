import { connect } from '../server/db.js';
import { initialize, importSnapshot } from '../server/data.js';
import fs from 'node:fs/promises';
const db = await connect();
try {
  await initialize(db);
  if (process.argv.includes('--import'))
    console.log(
      await importSnapshot(db, JSON.parse(await fs.readFile('data/nfl-snapshot.json', 'utf8'))),
    );
  console.log('Database initialized.');
} finally {
  await db.close();
}
