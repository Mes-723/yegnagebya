// =============================================
// Database Setup Script — runs schema.sql
// =============================================
const path = require("path");

if (!process.env.DATABASE_URL) {
  require("dotenv").config({ path: path.join(__dirname, "../.env") });
}

const fs = require("fs");
const { Pool } = require("pg");

const databaseHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "";
const isRailwayDb = databaseHost.endsWith(".railway.internal") || databaseHost.endsWith(".railway.app");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRailwayDb ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

async function setupDatabase() {
  try {
    console.log("📡 Connecting to PostgreSQL...");
    const client = await pool.connect();
    console.log("✅ Connected!");

    // Read schema.sql
    const schemaPath = path.join(__dirname, "../schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    console.log("\n📝 Running schema.sql...");
    await client.query(schema);

    console.log("✅ Database schema created successfully!");
    console.log("✨ Tables: users, products, orders, reviews, categories, and more");

    client.release();
    process.exit(0);
  } catch (error) {
    console.error("❌ Database setup failed:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

setupDatabase();
