// Postgres connection pool.
// DATABASE_URL comes from your Supabase/Neon project settings, e.g.:
// postgresql://user:password@host:5432/postgres
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }, // required by most hosted Postgres (Supabase/Neon)
});

module.exports = pool;
