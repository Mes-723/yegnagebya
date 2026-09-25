// Admin routes: manage seller applications and other admin tasks

const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect, adminOnly } = require("../middleware/auth");

// GET /api/admin/seller-applications
// List all seller applications (admin only)
router.get("/seller-applications", protect, adminOnly, async (req, res) => {
  try {
    const result = await query("SELECT sa.*, u.email FROM seller_applications sa LEFT JOIN users u ON sa.user_id = u.id ORDER BY sa.created_at DESC");
    res.json({ applications: result.rows });
  } catch (err) {
    console.error("Admin list seller applications error:", err);
    res.status(500).json({ error: "Failed to load applications." });
  }
});

// GET /api/admin/users
router.get("/users", protect, adminOnly, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, phone, role, region, verified, is_active, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error("Admin list users error:", err);
    res.status(500).json({ error: "Failed to load users." });
  }
});

// PATCH /api/admin/users/:id
router.patch("/users/:id", protect, adminOnly, async (req, res) => {
  try {
    const updates = [];
    const values = [];
    let index = 1;

    if (typeof req.body.is_active === "boolean") {
      updates.push(`is_active = $${index++}`);
      values.push(req.body.is_active);
    }
    if (typeof req.body.verified === "boolean") {
      updates.push(`verified = $${index++}`);
      values.push(req.body.verified);
    }
    if (updates.length === 0) return res.status(400).json({ error: "No user change supplied." });

    values.push(req.params.id);
    const result = await query(
      `UPDATE users SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id, name, email, phone, role, region, verified, is_active, created_at`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found." });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Admin update user error:", err);
    res.status(500).json({ error: "Failed to update user." });
  }
});

// POST /api/admin/seller-applications/:id/approve
router.post("/seller-applications/:id/approve", protect, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    // Mark application approved and promote user to seller
    await query("UPDATE seller_applications SET status='approved', reviewed_by=$1, reviewed_at=NOW(), admin_note=$2 WHERE id=$3", [req.user.id, req.body.note || null, id]);
    // Promote user
    const appRow = await query("SELECT user_id FROM seller_applications WHERE id = $1", [id]);
    if (appRow.rows[0]) {
      await query("UPDATE users SET role='seller' WHERE id = $1", [appRow.rows[0].user_id]);
    }
    res.json({ message: "Application approved and user promoted to seller." });
  } catch (err) {
    console.error("Approve application error:", err);
    res.status(500).json({ error: "Failed to approve." });
  }
});

// POST /api/admin/seller-applications/:id/reject
router.post("/seller-applications/:id/reject", protect, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    await query("UPDATE seller_applications SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), admin_note=$2 WHERE id=$3", [req.user.id, req.body.note || null, id]);
    res.json({ message: "Application rejected." });
  } catch (err) {
    console.error("Reject application error:", err);
    res.status(500).json({ error: "Failed to reject." });
  }
});

module.exports = router;
