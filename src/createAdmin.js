// One-off script to create an admin account (full manager or moderator).
// Usage: node src/createAdmin.js <username> <password> [role]
// role is "admin" (full access, default) or "moderator" (view + comment moderation only)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function main() {
  const [, , username, password, roleArg] = process.argv;
  if (!username || !password) {
    console.error('Usage: node src/createAdmin.js <username> <password> [admin|moderator]');
    process.exit(1);
  }
  const role = roleArg === 'moderator' ? 'moderator' : 'admin';
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO UPDATE SET password_hash = $2, role = $3',
    [username, hash, role]
  );
  console.log(`Admin "${username}" created/updated with role "${role}".`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
