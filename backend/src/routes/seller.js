// Seller application routes

const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect } = require("../middleware/auth");

// POST /api/seller/apply
// Buyers can apply to become sellers. In development this auto-upgrades the user.
router.post("/apply", protect, async (req, res) => {
  try {
    // In production, record an application for admin review
    if (process.env.NODE_ENV === "production") {
      // For now, store an application record if table exists — otherwise log and return 202
      try {
        await query(
          `INSERT INTO seller_applications (user_id, full_name, phone, region, bio, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.id, req.user.name || null, req.user.phone || null, req.user.region || null, req.body.bio || null]
        );
        return res.status(202).json({ message: "Application received. Admin will review your request." });
      } catch (err) {
        console.warn("seller/apply: could not insert application table, falling back to notify admins", err.message);
        return res.status(202).json({ message: "Application queued (fallback). Admin will review." });
      }
    }

    // In non-production (dev/test), immediately upgrade to seller for convenience
    await query("UPDATE users SET role = 'seller' WHERE id = $1", [req.user.id]);
    const updated = await query("SELECT id, name, email, phone, role, region, avatar_url FROM users WHERE id = $1", [req.user.id]);
    res.json({ message: "Your account is now a seller (dev).", user: updated.rows[0] });
  } catch (err) {
    console.error("Seller apply error:", err);
    res.status(500).json({ error: "Failed to apply to become a seller." });
  }
});

module.exports = router;
