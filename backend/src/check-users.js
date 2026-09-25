// Check users in database
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

async function checkUsers() {
  try {
    const result = await pool.query(
      "SELECT id, name, email, phone, role, region, verified, created_at FROM users ORDER BY created_at DESC LIMIT 5"
    );
    
    console.log("\n👥 Recent Users in Database:\n");
    if (result.rows.length === 0) {
      console.log("No users found");
    } else {
      result.rows.forEach((row, i) => {
        console.log(`${i + 1}. ${row.name} (${row.email})`);
        console.log(`   ID: ${row.id}`);
        console.log(`   Phone: ${row.phone}`);
        console.log(`   Role: ${row.role} | Region: ${row.region} | Verified: ${row.verified}`);
        console.log(`   Created: ${row.created_at}\n`);
      });
    }
    
    console.log(`✅ Total users: ${result.rows.length}\n`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkUsers();
