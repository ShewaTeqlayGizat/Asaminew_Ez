// One-off script to create the first admin account.
// Usage: node src/createAdmin.js <username> <password>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password) {
    console.error('Usage: node src/createAdmin.js <username> <password>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET password_hash = $2',
    [username, hash]
  );
  console.log(`Admin "${username}" created/updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
