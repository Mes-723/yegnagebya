const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect } = require("../middleware/auth");

router.get("/", protect, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, type, title, body, read, data, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    console.error("Load notifications error:", err);
    res.status(500).json({ error: "Failed to load notifications." });
  }
});

router.get("/unread-count", protect, async (req, res) => {
  try {
    const result = await query("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false", [req.user.id]);
    res.json({ unread: Number(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load notification count." });
  }
});

router.patch("/:id/read", protect, async (req, res) => {
  await query("UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

router.post("/read-all", protect, async (req, res) => {
  await query("UPDATE notifications SET read = true WHERE user_id = $1", [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;