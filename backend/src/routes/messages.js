const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect } = require("../middleware/auth");
const { upload, hasCloudinaryCredentials } = require("../config/cloudinary");

function uploadedImageUrl(req, file) {
  if (hasCloudinaryCredentials) return file.path;
  return `${req.protocol}://${req.get("host")}/uploads/${file.destination.split(/[\\/]/).pop()}/${file.filename}`;
}

router.get("/conversations", protect, async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*, u.id AS other_user_id, u.name AS other_name, u.avatar_url AS other_avatar
       FROM messages m
       LEFT JOIN users u ON u.id = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
       WHERE m.sender_id = $1 OR m.receiver_id = $1
       ORDER BY m.created_at DESC`,
      [req.user.id]
    );

    const conversations = [];
    const seen = new Set();

    for (const message of result.rows) {
      const otherUserId = message.other_user_id;
      if (!otherUserId || seen.has(otherUserId)) continue;
      seen.add(otherUserId);
      conversations.push({
        id: otherUserId,
        name: message.other_name || "Seller",
        avatar: message.other_avatar || null,
        lastMessage: message.text || (message.is_voice ? "🎤 Voice message" : ""),
        lastMessageAt: message.created_at,
        unread: result.rows.filter(row => row.sender_id === otherUserId && !row.read).length,
      });
    }

    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: "Failed to load conversations." });
  }
});

router.get("/:userId", protect, async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE (m.sender_id = $1 AND m.receiver_id = $2)
          OR (m.sender_id = $2 AND m.receiver_id = $1)
       ORDER BY m.created_at ASC`,
      [req.user.id, req.params.userId]
    );

    const participant = await query(
      "SELECT id, name, avatar_url FROM users WHERE id = $1",
      [req.params.userId]
    );

    await query(
      "UPDATE messages SET read = true WHERE receiver_id = $1 AND sender_id = $2",
      [req.user.id, req.params.userId]
    );

    res.json({ messages: result.rows, participant: participant.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages." });
  }
});

router.post("/", protect, upload.single("image"), async (req, res) => {
  try {
    const { receiver_id, text, product_id } = req.body;
    const imageUrl = req.file ? uploadedImageUrl(req, req.file) : null;

    if (!receiver_id || (!text && !product_id && !imageUrl)) {
      return res.status(400).json({ error: "Receiver and message are required." });
    }

    const result = await query(
      `INSERT INTO messages (sender_id, receiver_id, product_id, text, image_url, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [req.user.id, receiver_id, product_id || null, text || "", imageUrl]
    );

    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'message', $2, $3, $4)`,
      [receiver_id, `New message from ${req.user.name}`, text || (imageUrl ? "You received an image." : "You received a new message."), { sender_id: req.user.id, image_url: imageUrl }]
    );

    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to send message." });
  }
});

module.exports = router;
