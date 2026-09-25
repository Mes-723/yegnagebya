const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect, adminOnly } = require("../middleware/auth");

router.get("/active", async (req, res) => {
  try {
    const result = await query(
      "SELECT id, title, subtitle, emoji, color, clicks FROM banners WHERE active = true ORDER BY created_at DESC LIMIT 1"
    );
    res.json({ banner: result.rows[0] || null });
  } catch (err) {
    console.error("Load active banner error:", err);
    res.status(500).json({ error: "Failed to load banner." });
  }
});

router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const result = await query("SELECT id, title, subtitle, emoji, color, active, clicks, created_at FROM banners ORDER BY created_at DESC");
    res.json({ banners: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load banners." });
  }
});

router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { title, subtitle, emoji = "🎉", color = "#0f2d1a" } = req.body;
    if (!title?.trim() || !subtitle?.trim()) return res.status(400).json({ error: "Title and subtitle are required." });
    const result = await query(
      "INSERT INTO banners (title, subtitle, emoji, color, active) VALUES ($1, $2, $3, $4, true) RETURNING *",
      [title.trim(), subtitle.trim(), emoji, color]
    );
    res.status(201).json({ banner: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to create banner." });
  }
});

router.patch("/:id", protect, adminOnly, async (req, res) => {
  try {
    const updates = [];
    const values = [];
    let index = 1;
    for (const field of ["title", "subtitle", "emoji", "color"]) {
      if (typeof req.body[field] === "string" && req.body[field].trim()) {
        updates.push(`${field} = $${index++}`);
        values.push(req.body[field].trim());
      }
    }
    if (typeof req.body.active === "boolean") {
      updates.push(`active = $${index++}`);
      values.push(req.body.active);
    }
    if (!updates.length) return res.status(400).json({ error: "No banner changes supplied." });
    values.push(req.params.id);
    const result = await query(
      `UPDATE banners SET ${updates.join(", ")} WHERE id = $${index} RETURNING *`,
      values
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Banner not found." });
    res.json({ banner: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update banner." });
  }
});

router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    await query("DELETE FROM banners WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete banner." });
  }
});

module.exports = router;
