const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect, adminOnly } = require("../middleware/auth");

router.get("/active", async (req, res) => {
  try {
    const result = await query("SELECT id, title, subtitle, emoji, color, CASE WHEN LOWER(route) IN ('/asebza', '/asbeza', 'asebza', 'asbeza') THEN '/category/asbeza' ELSE route END AS route, sort_order FROM discoveries WHERE active = true ORDER BY sort_order ASC, created_at DESC");
    res.json({ discoveries: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load Discover content." });
  }
});

router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const result = await query("SELECT id, title, subtitle, emoji, color, route, active, sort_order, created_at FROM discoveries ORDER BY sort_order ASC, created_at DESC");
    res.json({ discoveries: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load Discover content." });
  }
});

router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { title, subtitle, emoji = "✨", color = "#0f2d1a", route = "/(tabs)", sort_order = 0 } = req.body;
    if (!title?.trim() || !subtitle?.trim() || !route?.trim()) return res.status(400).json({ error: "Title, subtitle, and destination are required." });
    const result = await query(
      "INSERT INTO discoveries (title, subtitle, emoji, color, route, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [title.trim(), subtitle.trim(), emoji, color, route.trim(), Number(sort_order) || 0]
    );
    res.status(201).json({ discovery: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to create Discover card." });
  }
});

router.patch("/:id", protect, adminOnly, async (req, res) => {
  try {
    const updates = [];
    const values = [];
    let index = 1;
    for (const field of ["title", "subtitle", "emoji", "color", "route"]) {
      if (typeof req.body[field] === "string" && req.body[field].trim()) {
        updates.push(`${field} = $${index++}`);
        values.push(req.body[field].trim());
      }
    }
    if (typeof req.body.sort_order !== "undefined") { updates.push(`sort_order = $${index++}`); values.push(Number(req.body.sort_order) || 0); }
    if (typeof req.body.active === "boolean") { updates.push(`active = $${index++}`); values.push(req.body.active); }
    if (!updates.length) return res.status(400).json({ error: "No Discover changes supplied." });
    values.push(req.params.id);
    const result = await query(`UPDATE discoveries SET ${updates.join(", ")} WHERE id = $${index} RETURNING *`, values);
    if (!result.rows[0]) return res.status(404).json({ error: "Discover card not found." });
    res.json({ discovery: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update Discover card." });
  }
});

router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    await query("DELETE FROM discoveries WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete Discover card." });
  }
});

module.exports = router;