import { connect } from '../server/db.js';
import { initialize } from '../server/data.js';
import { audit } from '../server/auth.js';
const email = process.argv[2];
if (!email) throw new Error('Usage: npm run admin -- registered-email@example.com');
const db = await connect();
try {
  await initialize(db);
  await db.transaction(async (q) => {
    const [u] = await q('SELECT id,verified_at FROM users WHERE lower(email)=lower($1)', [email]);
    if (!u || !u.verified_at) throw new Error('Register and verify this account first.');
    await q("UPDATE users SET role='admin' WHERE id=$1", [u.id]);
    await audit(q, u.id, 'bootstrap-admin', u.id);
  });
  console.log('Administrator role granted.');
} finally {
  await db.close();
}
