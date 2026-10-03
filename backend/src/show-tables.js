// Show all database tables
const path = require("path");

if (!process.env.DATABASE_URL) {
  require("dotenv").config({ path: path.join(__dirname, "../.env") });
}
const { Pool } = require("pg");
const databaseHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "";
const isRailwayDb = databaseHost.endsWith(".railway.internal") || databaseHost.endsWith(".railway.app");

console.log("🔌 Connecting to:", process.env.DATABASE_URL?.split("@")[1] || "unknown");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRailwayDb ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

async function showTables() {
  try {
    const result = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    
    console.log("\n📊 Wedaje Gebya Database Tables:\n");
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.table_name}`);
    });
    
    console.log(`\n✅ Total: ${result.rows.length} tables created\n`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Connection Error:", error.message);
    process.exit(1);
  }
}

showTables();

showTables();
