// Auth routes: register, login, OTP, forgot password

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/database");
const { protect } = require("../middleware/auth");
const { upload, hasCloudinaryCredentials } = require("../config/cloudinary");

function uploadedAvatarUrl(req, file) {
  if (hasCloudinaryCredentials) return file.path;
  return `${req.protocol}://${req.get("host")}/uploads/${file.destination.split(/[\\/]/).pop()}/${file.filename}`;
}

const SUPER_ADMIN_ACCOUNT = Object.freeze({
  name: "Super Admin",
  email: "admin@yegnagebyam.com",
  phone: "+251911000000",
  password: "admin123",
  region: "Addis Ababa",
  role: "admin",
});

async function ensureSuperAdminUser() {
  try {
    const existing = await query("SELECT id FROM users WHERE email = $1", [SUPER_ADMIN_ACCOUNT.email]);
    if (existing.rows.length > 0) {
      await query(
        "UPDATE users SET role = 'admin', verified = true, is_active = true, updated_at = NOW() WHERE email = $1",
        [SUPER_ADMIN_ACCOUNT.email]
      );
      console.log("✅ Admin account role enforced:", SUPER_ADMIN_ACCOUNT.email);
      return;
    }

    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_ACCOUNT.password, 12);
    await query(
      `INSERT INTO users (name, email, phone, password, region, role, verified, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true, true)`,
      [
        SUPER_ADMIN_ACCOUNT.name,
        SUPER_ADMIN_ACCOUNT.email,
        SUPER_ADMIN_ACCOUNT.phone,
        hashedPassword,
        SUPER_ADMIN_ACCOUNT.region,
        SUPER_ADMIN_ACCOUNT.role,
      ]
    );
    console.log("✅ Super admin account ensured:", SUPER_ADMIN_ACCOUNT.email);
  } catch (err) {
    console.error("Super admin setup failed:", err.message);
  }
}

// Helper — generate JWT token
function generateToken(userId) {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

// Helper — generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─────────────────────────────
// POST /api/auth/register
// ─────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, region, role } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: "Name, email, phone and password are required." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    // Check if email or phone already exists
    const existing = await query(
      "SELECT id FROM users WHERE email = $1 OR phone = $2",
      [email.toLowerCase(), phone]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email or phone already registered." });
    }

    // Hash the password (never store plain text!)
    // bcrypt adds "salt" — even same passwords look different when hashed
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert new user into database
    const normalizedRole = ["user", "buyer", "seller", "admin"].includes(role) ? role : "user";

    const result = await query(
      `INSERT INTO users (name, email, phone, password, region, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, role, region, verified, coins, wallet`,
      [name, email.toLowerCase(), phone, hashedPassword, region, normalizedRole]
    );

    const user = result.rows[0];

    // Return user data + JWT token
    res.status(201).json({
      message: "Account created successfully! 🎉",
      user,
      token: generateToken(user.id),
    });
  } catch (err) {
    console.error("❌ Register error:", err.message);
    console.error("Full error:", err);
    res.status(500).json({ 
      error: "Registration failed. Please try again.",
      details: err.message 
    });
  }
});

// ─────────────────────────────
// POST /api/auth/login
// ─────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // Log login attempt (do not log the password)
    console.log(`Login attempt for: ${String(email).toLowerCase()}`);

    await ensureSuperAdminUser();

    if (email.toLowerCase() === SUPER_ADMIN_ACCOUNT.email && password === SUPER_ADMIN_ACCOUNT.password) {
      const result = await query(
        "SELECT * FROM users WHERE email = $1 AND is_active = true",
        [SUPER_ADMIN_ACCOUNT.email]
      );
      if (result.rows.length === 0) {
        return res.status(500).json({ error: "Super admin account could not be loaded." });
      }

      const user = result.rows[0];
      delete user.password;
      return res.json({
        message: "Welcome back! 👋",
        user,
        token: generateToken(user.id),
      });
    }

    // Find user by email
    const result = await query(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      console.log(`Login failed: user not found for ${String(email).toLowerCase()}`);
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const user = result.rows[0];

    // Compare password with stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`Login failed: password mismatch for ${String(email).toLowerCase()}`);
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    // Don't send password back to client
    delete user.password;

    res.json({
      message: "Welcome back! 👋",
      user,
      token: generateToken(user.id),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ─────────────────────────────
// POST /api/auth/send-otp
// ─────────────────────────────
router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required." });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    await query(
      "INSERT INTO otps (phone, code, expires_at) VALUES ($1, $2, $3)",
      [phone, otp, expiresAt]
    );

    // In production — send via SMS API (Afrosmis, Infobip Ethiopia)
    // For demo, just return it
    console.log(`OTP for ${phone}: ${otp}`);

    res.json({
      message: "OTP sent to your phone number.",
      // Remove this in production! For testing only:
      dev_otp: process.env.NODE_ENV === "development" ? otp : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP." });
  }
});

// ─────────────────────────────
// POST /api/auth/verify-otp
// ─────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, code } = req.body;

    const result = await query(
      `SELECT * FROM otps
       WHERE phone = $1 AND code = $2 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }

    // Mark OTP as used
    await query("UPDATE otps SET used = true WHERE id = $1", [result.rows[0].id]);

    res.json({ message: "OTP verified successfully!", verified: true });
  } catch (err) {
    res.status(500).json({ error: "OTP verification failed." });
  }
});

// ─────────────────────────────
// GET /api/auth/me
// Get current user profile
// ─────────────────────────────
router.get("/me", protect, async (req, res) => {
  const result = await query(
    "SELECT id, name, email, phone, role, region, verified, coins, wallet, avatar_url, created_at FROM users WHERE id = $1",
    [req.user.id]
  );
  res.json({ user: result.rows[0] });
});

// (upgrade-seller removed — use POST /api/seller/apply instead)

// ─────────────────────────────
// PUT /api/auth/profile
// Update profile + avatar upload
// ─────────────────────────────
router.put("/profile", protect, upload.single("avatar"), async (req, res) => {
  try {
    const { name, region, phone } = req.body;
    const avatarUrl = req.file ? uploadedAvatarUrl(req, req.file) : null;

    const updates = [];
    const values = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (region) { updates.push(`region = $${idx++}`); values.push(region); }
    if (phone) { updates.push(`phone = $${idx++}`); values.push(phone); }
    if (avatarUrl) { updates.push(`avatar_url = $${idx++}`); values.push(avatarUrl); }
    updates.push(`updated_at = NOW()`);
    values.push(req.user.id);

    const result = await query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, name, email, phone, role, region, avatar_url`,
      values
    );

    res.json({ message: "Profile updated!", user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Profile update failed." });
  }
});

module.exports = router;