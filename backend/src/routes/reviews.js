// Review routes

const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect } = require("../middleware/auth");
const { upload } = require("../config/cloudinary");

const updateProductReviewStats = async (productId) => {
  await query(
    `UPDATE products
     SET rating = (SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE product_id = $1),
         review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = $1)
     WHERE id = $1`,
    [productId]
  );
};

// POST /api/reviews — Write a review with photo
router.post("/", protect, upload.array("photos", 4), async (req, res) => {
  try {
    const { product_id, order_id, rating, comment, aspect_ratings } = req.body;

    if (!product_id || !rating) {
      return res.status(400).json({ error: "Product ID and rating are required." });
    }

    const photoUrls = req.files ? req.files.map(f => f.path) : [];
    const aspectRatings = typeof aspect_ratings === "string"
      ? JSON.parse(aspect_ratings)
      : aspect_ratings || {};
    const normalizedRating = parseInt(rating, 10);

    if (Number.isNaN(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5." });
    }

    const existing = await query(
      "SELECT id FROM reviews WHERE product_id = $1 AND buyer_id = $2",
      [product_id, req.user.id]
    );

    let result;

    if (existing.rows.length > 0) {
      result = await query(
        `UPDATE reviews
         SET order_id = $3,
             rating = $4,
             comment = $5,
             photo_urls = $6,
             aspect_ratings = $7,
             verified = true
         WHERE product_id = $1 AND buyer_id = $2
         RETURNING *`,
        [
          product_id,
          req.user.id,
          order_id || null,
          normalizedRating,
          comment || null,
          photoUrls,
          aspectRatings,
        ]
      );
    } else {
      try {
        result = await query(
          `INSERT INTO reviews (product_id, buyer_id, order_id, rating, comment, photo_urls, aspect_ratings)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            product_id,
            req.user.id,
            order_id || null,
            normalizedRating,
            comment || null,
            photoUrls,
            aspectRatings,
          ]
        );
      } catch (insertErr) {
        if (insertErr && insertErr.code === "23505") {
          result = await query(
            `UPDATE reviews
             SET order_id = $3,
                 rating = $4,
                 comment = $5,
                 photo_urls = $6,
                 aspect_ratings = $7,
                 verified = true
             WHERE product_id = $1 AND buyer_id = $2
             RETURNING *`,
            [
              product_id,
              req.user.id,
              order_id || null,
              normalizedRating,
              comment || null,
              photoUrls,
              aspectRatings,
            ]
          );
        } else {
          throw insertErr;
        }
      }
    }

    await updateProductReviewStats(product_id);

    res.status(existing.rows.length > 0 ? 200 : 201).json({
      message: existing.rows.length > 0 ? "Review updated! ⭐" : "Review submitted! ⭐",
      review: result.rows[0],
    });
  } catch (err) {
    console.error("Submit review error:", err);
    res.status(500).json({
      error: process.env.NODE_ENV === "production" ? "Failed to submit review." : err.message,
    });
  }
});

// GET /api/reviews/:productId — Get reviews for a product
router.get("/:productId", async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, u.name AS buyer_name, u.avatar_url AS buyer_avatar
       FROM reviews r
       LEFT JOIN users u ON r.buyer_id = u.id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.productId]
    );
    res.json({ reviews: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reviews." });
  }
});

// POST /api/reviews/:id/helpful — Mark review as helpful
router.post("/:id/helpful", protect, async (req, res) => {
  await query("UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = $1", [req.params.id]);
  res.json({ message: "Marked as helpful!" });
});

module.exports = router;