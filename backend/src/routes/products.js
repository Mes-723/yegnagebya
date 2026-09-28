// Product routes — CRUD + image upload

const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect, sellerOrAdmin, adminOnly } = require("../middleware/auth");
const { upload, cloudinary, hasCloudinaryCredentials } = require("../config/cloudinary");

function uploadedFileUrl(req, file) {
  return hasCloudinaryCredentials ? file.path : `${req.protocol}://${req.get("host")}/uploads/${file.destination.split(/[\\/]/).pop()}/${file.filename}`;
}

// ─────────────────────────────
// GET /api/products
// Get all approved products (with filters)
// ─────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      category, region, search, min_price, max_price, discovery,
      seller_id, sort = "created_at", order = "DESC",
      page = 1, limit = 20,
    } = req.query;

    const offset = (page - 1) * limit;
    const discoveryMode = String(discovery || "").toLowerCase() === "true";
    const conditions = [discoveryMode ? "p.is_active = true" : "p.approved = true AND p.is_active = true"];
    const values = [];
    let idx = 1;

    const requestedCategories = String(category || "")
      .toLowerCase()
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
    const normalizedCategories = requestedCategories.flatMap(value => {
      if (value === "asbeza" || value === "asebza") return ["asbeza", "asebza", "food"];
      return [value];
    });
    const normalizedCategory = normalizedCategories[0] || "";

    if (normalizedCategories.length > 0 && normalizedCategory !== "all") {
      const categoryValues = [...new Set(normalizedCategories)];
      const categoryParam = idx++;
      conditions.push(`(c.slug = ANY($${categoryParam}::text[]) OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) AS tag(product_tag) WHERE LOWER(tag.product_tag) = ANY($${categoryParam}::text[])))`);
      values.push(categoryValues);
    }
    if (region) {
      conditions.push(`p.region ILIKE $${idx++}`);
      values.push(`%${region}%`);
    }
    if (seller_id) {
      conditions.push(`p.seller_id = $${idx++}`);
      values.push(seller_id);
    }
    if (search) {
      conditions.push(`(p.name ILIKE $${idx++} OR p.description ILIKE $${idx++})`);
      values.push(`%${search}%`, `%${search}%`);
      idx++;
    }
    if (min_price) {
      conditions.push(`p.price >= $${idx++}`);
      values.push(min_price);
    }
    if (max_price) {
      conditions.push(`p.price <= $${idx++}`);
      values.push(max_price);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Valid sort columns to prevent SQL injection
    const allowedSorts = { price: "p.price", rating: "p.rating", sold: "p.sold_count", created_at: "p.created_at" };
    const sortColumn = allowedSorts[sort] || "p.created_at";

    values.push(parseInt(limit), parseInt(offset));

    const result = await query(
      `SELECT
        p.id, p.name, p.description, p.price, p.original_price,
        p.stock, p.region, p.country, p.images, p.main_image,
        p.rating, p.review_count, p.sold_count, p.tags, p.variants,
        p.created_at,
        c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
        u.name AS seller_name, u.id AS seller_id, u.phone AS seller_phone
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users u ON p.seller_id = u.id
       ${whereClause}
       ORDER BY ${sortColumn} ${order === "ASC" ? "ASC" : "DESC"}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );

    // Get total count for pagination
    const countResult = await query(
      `SELECT COUNT(*) FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       ${whereClause}`,
      values.slice(0, -2)
    );

    res.json({
      products: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit),
    });
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ error: "Failed to fetch products." });
  }
});

// Seller inventory, including listings still waiting for admin approval.
router.get("/mine", protect, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        p.id, p.name, p.description, p.price, p.original_price,
        p.stock, p.region, p.country, p.images, p.main_image,
        p.rating, p.review_count, p.sold_count, p.tags, p.variants,
        p.approved, p.is_active, p.moderation_status, p.created_at, p.updated_at,
        c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
        u.name AS seller_name, u.id AS seller_id, u.phone AS seller_phone
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users u ON p.seller_id = u.id
      WHERE p.seller_id = $1 AND COALESCE(p.moderation_status, CASE WHEN p.approved THEN 'approved' WHEN p.is_active THEN 'pending' ELSE 'rejected' END) <> 'deleted'
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    res.json({ products: result.rows, total: result.rows.length });
  } catch (err) {
    console.error("Get seller products error:", err);
    res.status(500).json({ error: "Failed to fetch your products." });
  }
});

// ─────────────────────────────
// GET /api/products/admin/pending
// Admin view of pending products
// ─────────────────────────────
router.get("/admin/pending", protect, adminOnly, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, c.name AS category_name, u.name AS seller_name, u.email AS seller_email
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users u ON p.seller_id = u.id
      WHERE p.approved = false AND p.is_active = true AND COALESCE(p.moderation_status, 'pending') = 'pending'
       ORDER BY p.created_at DESC`
    );
    res.json({ products: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load pending products." });
  }
});

// ─────────────────────────────
// GET /api/products/:id
// Get single product with reviews
// ─────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const product = await query(
      `SELECT
        p.*, p.country,
        c.name AS category_name, c.slug AS category_slug,
        u.name AS seller_name, u.id AS seller_id, u.avatar_url AS seller_avatar,
        u.phone AS seller_phone, u.region AS seller_region
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users u ON p.seller_id = u.id
       WHERE p.id = $1 AND p.is_active = true`,
      [id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    // Get product images
    const images = await query(
      "SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order",
      [id]
    );

    // Get reviews
    const reviews = await query(
      `SELECT r.*, u.name AS buyer_name, u.avatar_url AS buyer_avatar
       FROM reviews r
       LEFT JOIN users u ON r.buyer_id = u.id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [id]
    );

    res.json({
      product: { ...product.rows[0], images: images.rows },
      reviews: reviews.rows,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product." });
  }
});

// ─────────────────────────────
// POST /api/products
// Create product with images
// ─────────────────────────────
router.post("/", protect, sellerOrAdmin, upload.array("images", 5), async (req, res) => {
  try {
    const {
      name, description, price, original_price,
      stock, region, country, category_id, category, tags, variants,
    } = req.body;

    if (!name || !description || !price || !stock) {
      return res.status(400).json({ error: "Name, description, price and stock are required." });
    }

    // Get uploaded image URLs from Cloudinary
    const imageUrls = req.files ? req.files.map(file => uploadedFileUrl(req, file)) : [];
    const mainImage = imageUrls[0] || null;

    const normalizedCategory = category ? String(category).toLowerCase() : "";
    let resolvedCategoryId = category_id || null;
    if (!resolvedCategoryId && normalizedCategory) {
      const canonicalCategory = normalizedCategory === "asebza" ? "asbeza" : normalizedCategory;
      const categoryResult = await query(
        "SELECT id FROM categories WHERE slug = $1 OR slug = $2 OR name ILIKE $3 LIMIT 1",
        [canonicalCategory, normalizedCategory, String(category)]
      );
      if (categoryResult.rows[0]) resolvedCategoryId = categoryResult.rows[0].id;
    }

    // Insert product into database
    const result = await query(
      `INSERT INTO products
        (seller_id, category_id, name, description, price, original_price, stock, region, country, images, main_image, tags, variants)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        req.user.id, resolvedCategoryId, name, description,
        parseFloat(price), original_price ? parseFloat(original_price) : null,
        parseInt(stock), region, country || region, imageUrls, mainImage,
        tags ? JSON.parse(tags) : [],
        variants ? JSON.parse(variants) : [],
      ]
    );

    const product = result.rows[0];

    // Save images to product_images table
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        await query(
          "INSERT INTO product_images (product_id, url, public_id, is_primary, sort_order) VALUES ($1, $2, $3, $4, $5)",
          [product.id, imageUrls[i], req.files[i].filename, i === 0, i]
        );
      }
    }

    res.status(201).json({
      message: "Product submitted for review! It will go live within 24 hours. 🎉",
      product,
    });
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: "Failed to create product." });
  }
});

// ─────────────────────────────
// PUT /api/products/:id
// Update product
// ─────────────────────────────
router.put("/:id", protect, upload.array("images", 5), async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const existing = await query("SELECT seller_id FROM products WHERE id = $1", [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Product not found." });
    if (existing.rows[0].seller_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not your product." });
    }

    const { name, description, price, stock, region, country, category, tags, variants } = req.body;
    const newImages = req.files ? req.files.map(file => uploadedFileUrl(req, file)) : [];

    const updates = ["updated_at = NOW()"];
    const values = [];
    let idx = 1;

    if (typeof name !== "undefined") { updates.push(`name = $${idx++}`); values.push(name); }
    if (typeof description !== "undefined") { updates.push(`description = $${idx++}`); values.push(description); }
    if (typeof price !== "undefined") { updates.push(`price = $${idx++}`); values.push(parseFloat(price)); }
    if (typeof stock !== "undefined") { updates.push(`stock = $${idx++}`); values.push(parseInt(stock)); }
    if (typeof region !== "undefined") { updates.push(`region = $${idx++}`); values.push(region); }
    if (typeof country !== "undefined") { updates.push(`country = $${idx++}`); values.push(country); }
    if (category) {
      const canonicalCategory = String(category).toLowerCase();
      const categoryResult = await query(
        "SELECT id FROM categories WHERE slug = $1 OR slug = $2 OR name ILIKE $3 LIMIT 1",
        [canonicalCategory, String(category).toLowerCase(), String(category)]
      );
      if (categoryResult.rows[0]) {
        updates.push(`category_id = $${idx++}`);
        values.push(categoryResult.rows[0].id);
      }
    }
    if (tags) {
      updates.push(`tags = $${idx++}`);
      values.push(Array.isArray(tags) ? tags : JSON.parse(tags));
    }
    if (variants) {
      updates.push(`variants = $${idx++}`);
      values.push(Array.isArray(variants) ? variants : JSON.parse(variants));
    }
    if (newImages.length > 0) {
      const current = await query("SELECT images FROM products WHERE id = $1", [id]);
      const existingImages = Array.isArray(current.rows[0]?.images) ? current.rows[0].images : [];
      updates.push(`images = $${idx++}`);
      values.push([...newImages, ...existingImages].slice(0, 5));
      updates.push(`main_image = $${idx++}`);
      values.push(newImages[0]);
    }

    values.push(id);

    const result = await query(
      `UPDATE products SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json({ message: "Product updated!", product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update product." });
  }
});

// ─────────────────────────────
// DELETE /api/products/:id/images/:publicId
// Delete a specific product image
// ─────────────────────────────
router.delete("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query("SELECT seller_id FROM products WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    if (existing.rows[0].seller_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not your product." });
    }

    const product = await query(
      "UPDATE products SET is_active = false, moderation_status = 'deleted', updated_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );

    res.json({ message: "Product deleted.", product: product.rows[0] });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ error: "Failed to delete product." });
  }
});

router.delete("/:id/images/:publicId", protect, async (req, res) => {
  try {
    const { id, publicId } = req.params;

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Delete from database
    await query("DELETE FROM product_images WHERE product_id = $1 AND public_id = $2", [id, publicId]);

    res.json({ message: "Image deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete image." });
  }
});

// ─────────────────────────────
// POST /api/products/:id/like
// Toggle like / wishlist for a product
// ─────────────────────────────
router.post("/:id/like", protect, async (req, res) => {
  try {
    const existing = await query(
      "SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2",
      [req.user.id, req.params.id]
    );

    if (existing.rows.length > 0) {
      await query("DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2", [req.user.id, req.params.id]);
      return res.json({ liked: false, message: "Removed from favorites." });
    }

    await query(
      "INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2)",
      [req.user.id, req.params.id]
    );

    res.json({ liked: true, message: "Added to favorites." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update likes." });
  }
});

// ─────────────────────────────
// POST /api/products/:id/approve (Admin)
// ─────────────────────────────
router.post("/:id/approve", protect, adminOnly, async (req, res) => {
  await query("UPDATE products SET approved = true, is_active = true, moderation_status = 'approved', updated_at = NOW() WHERE id = $1", [req.params.id]);
  res.json({ message: "Product approved and is now live!" });
});

router.post("/:id/reject", protect, adminOnly, async (req, res) => {
  await query("UPDATE products SET approved = false, is_active = false, moderation_status = 'rejected', updated_at = NOW() WHERE id = $1", [req.params.id]);
  res.json({ message: "Product rejected and removed." });
});

module.exports = router;