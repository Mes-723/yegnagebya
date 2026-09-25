// Simple script to apply seller_applications migration to a Postgres DB
// Usage: set DATABASE_URL and run `node scripts/apply_seller_migration.js`

const { Pool } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const createTable = `CREATE TABLE IF NOT EXISTS seller_applications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    full_name   VARCHAR(150),
    phone       VARCHAR(30),
    region      VARCHAR(100),
    bio         TEXT,
    status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    admin_note  TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
  );`;

  const createIndex = `CREATE INDEX IF NOT EXISTS idx_seller_applications_user ON seller_applications(user_id);`;

  const client = await pool.connect();
  try {
    console.log('Applying migration...');
    await client.query(createTable);
    await client.query(createIndex);
    const res = await client.query('SELECT count(*)::int AS cnt FROM seller_applications');
    console.log('Migration applied. seller_applications rows:', res.rows[0].cnt);
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err.message || err);
    process.exit(2);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
