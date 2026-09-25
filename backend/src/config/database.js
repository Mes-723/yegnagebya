// Database connection — connects Node.js to PostgreSQL
// pg = PostgreSQL client for Node.js

const { Pool } = require("pg");

// Pool = a group of database connections (more efficient than one connection)
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not configured. Copy .env.example to .env and set it to a reachable PostgreSQL database."
  );
}

const databaseHost = new URL(databaseUrl).hostname;
const databasePort = new URL(databaseUrl).port || "5432";
const isRailwayDb = databaseHost.endsWith(".railway.internal") || databaseHost.endsWith(".railway.app");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isRailwayDb ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error(
      `❌ Database connection error: cannot reach PostgreSQL at ${databaseHost}:${databasePort}. ` +
      "Start PostgreSQL or update backend/.env with a reachable DATABASE_URL."
    );
  } else {
    console.log("✅ PostgreSQL connected successfully");
    release();
  }
});

const fs = require("fs");
const path = require("path");

// Helper function — runs a SQL query and returns results
// Usage: const result = await query("SELECT * FROM users WHERE id = $1", [userId])
const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(`Query: ${text.slice(0, 50)} | Time: ${duration}ms | Rows: ${res.rowCount}`);
  return res;
};

async function ensureSchema() {
  const schemaPath = path.join(__dirname, "../../schema.sql");
  
  try {
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }
    
    const schema = fs.readFileSync(schemaPath, "utf8");
    console.log(`📄 Schema file loaded: ${schema.length} characters`);
    console.log("🧩 Ensuring database schema...");
    
    // Split schema into individual statements (separated by ;)
    const statements = schema
      .split(";")
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith("--"));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    let executed = 0;
    let skipped = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        console.log(`[${i+1}/${statements.length}] Executing: ${statement.slice(0, 60)}...`);
        await pool.query(statement + ";");
        executed++;
        console.log(`✅ Statement ${i+1} executed successfully`);
      } catch (err) {
        if (err.code === "42P07") {
          // Relation already exists — OK, continue
          skipped++;
          console.log(`⚠️  Statement ${i+1} already exists (42P07, skipped)`);
        } else if (err.code === "23505") {
          // Duplicate key violation — OK, continue for INSERT statements
          skipped++;
          console.log(`⚠️  Statement ${i+1} duplicate data (23505, skipped)`);
        } else {
          console.error(`❌ Statement ${i+1} failed with code ${err.code}:`, err.message);
          throw err;
        }
      }
    }
    
    console.log(`✅ Schema initialization complete! Executed: ${executed}, Skipped: ${skipped}`);
  } catch (err) {
    console.error(`❌ ensureSchema() failed:`, err.message);
    console.error(`Stack:`, err.stack);
    throw err;
  }
}

module.exports = { pool, query, ensureSchema };