const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect, adminOnly } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {
    const result = await query(
      "SELECT id, name, slug, icon, sort_order FROM categories WHERE active = true AND slug <> 'all' ORDER BY sort_order ASC, name ASC"
    );
    res.json({ categories: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load categories." });
  }
});

router.get("/admin", protect, adminOnly, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, name, slug, icon, sort_order, active FROM categories WHERE slug <> 'all' ORDER BY sort_order ASC, name ASC"
    );
    res.json({ categories: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load category management data." });
  }
});

router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { name, icon = "🛍️", sort_order = 0 } = req.body;
    const cleanName = String(name || "").trim();
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!cleanName || !slug) return res.status(400).json({ error: "Category name is required." });

    const existing = await query("SELECT * FROM categories WHERE slug = $1", [slug]);
    if (existing.rows[0]) {
      if (existing.rows[0].active) return res.status(409).json({ error: "That category already exists. Choose a different name." });
      const restored = await query(
        "UPDATE categories SET name = $1, icon = $2, active = true WHERE id = $3 RETURNING *",
        [cleanName, String(icon || "🛍️").slice(0, 10), existing.rows[0].id]
      );
      return res.status(200).json({ category: restored.rows[0], restored: true });
    }

    const result = await query(
      "INSERT INTO categories (name, slug, icon, sort_order, active) VALUES ($1, $2, $3, $4, true) RETURNING *",
      [cleanName, slug, String(icon || "🛍️").slice(0, 10), Number(sort_order) || 0]
    );
    res.status(201).json({ category: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "That category already exists." });
    res.status(500).json({ error: "Failed to create category." });
  }
});

router.patch("/:id", protect, adminOnly, async (req, res) => {
  try {
    const updates = [];
    const values = [];
    let index = 1;
    if (typeof req.body.name === "string" && req.body.name.trim()) { updates.push(`name = $${index++}`); values.push(req.body.name.trim()); }
    if (typeof req.body.icon === "string") { updates.push(`icon = $${index++}`); values.push(req.body.icon.slice(0, 10)); }
    if (typeof req.body.sort_order !== "undefined") { updates.push(`sort_order = $${index++}`); values.push(Number(req.body.sort_order) || 0); }
    if (typeof req.body.active === "boolean") { updates.push(`active = $${index++}`); values.push(req.body.active); }
    if (!updates.length) return res.status(400).json({ error: "No category changes supplied." });
    values.push(req.params.id);
    const result = await query(`UPDATE categories SET ${updates.join(", ")} WHERE id = $${index} AND slug <> 'all' RETURNING *`, values);
    if (!result.rows[0]) return res.status(404).json({ error: "Category not found." });
    res.json({ category: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update category." });
  }
});

router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const result = await query("UPDATE categories SET active = false WHERE id = $1 AND slug <> 'all' RETURNING id", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Category not found." });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove category." });
  }
});

module.exports = router;