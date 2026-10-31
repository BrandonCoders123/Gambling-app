import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
if (process.env.NODE_ENV === 'production')
  throw new Error('Development mailbox is unavailable in production.');
const text = await fs
  .readFile(path.join(process.env.DATA_DIR || '.data', 'mailbox.ndjson'), 'utf8')
  .catch(() => '');
const messages = text
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const email = process.argv[2];
for (const m of messages.filter((m) => !email || m.to === email).slice(-5))
  console.log(`To: ${m.to}\n${m.text}\n`);
