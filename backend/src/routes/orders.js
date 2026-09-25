// Order routes

const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const { protect, adminOnly } = require("../middleware/auth");

// ─────────────────────────────
// POST /api/orders
// Create a new order
// ─────────────────────────────
router.post("/", protect, async (req, res) => {
  try {
    const {
      items,                // [{ product_id, quantity, variant, price }]
      payment_method,
      delivery_region,
      delivery_city,
      delivery_subcity,
      delivery_woreda,
      delivery_kebele,
      delivery_description,
      delivery_phone,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Order must have at least one item." });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = 50; // ETB 50 flat
    const total = subtotal + deliveryFee;

    // Create the order
    const orderResult = await query(
      `INSERT INTO orders
        (buyer_id, payment_method, subtotal, delivery_fee, total,
         delivery_region, delivery_city, delivery_subcity, delivery_woreda,
         delivery_kebele, delivery_description, delivery_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        req.user.id, payment_method, subtotal, deliveryFee, total,
        delivery_region, delivery_city, delivery_subcity, delivery_woreda,
        delivery_kebele, delivery_description, delivery_phone,
      ]
    );

    const order = orderResult.rows[0];

    // Insert order items + update product stock
    for (const item of items) {
      // Get product info
      const product = await query(
        "SELECT name, main_image, seller_id, stock FROM products WHERE id = $1",
        [item.product_id]
      );

      if (product.rows.length === 0) continue;
      const p = product.rows[0];

      // Check stock
      if (p.stock < item.quantity) {
        return res.status(400).json({ error: `${p.name} is out of stock.` });
      }

      // Insert order item
      await query(
        `INSERT INTO order_items (order_id, product_id, seller_id, name, price, quantity, image_url, variant, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [order.id, item.product_id, p.seller_id, p.name, item.price, item.quantity, p.main_image, JSON.stringify(item.variant || {}), item.price * item.quantity]
      );

      // Reduce stock
      await query(
        "UPDATE products SET stock = stock - $1, sold_count = sold_count + $1 WHERE id = $2",
        [item.quantity, item.product_id]
      );
    }

    // Clear user's cart
    await query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);

    // Create notification for buyer
    await query(
      "INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "order", "Order Placed! 🎉", `Your order #${order.id.slice(0,8)} has been placed.`, JSON.stringify({ order_id: order.id })]
    );

    // Add loyalty coins (2 coins per 100 ETB)
    const coinsEarned = Math.floor(total / 100) * 2;
    if (coinsEarned > 0) {
      await query("UPDATE users SET coins = coins + $1 WHERE id = $2", [coinsEarned, req.user.id]);
    }

    res.status(201).json({
      message: "Order placed successfully! 🎉",
      order,
      coins_earned: coinsEarned,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Failed to place order." });
  }
});

// ─────────────────────────────
// GET /api/orders/my
// Get current user's orders
// ─────────────────────────────
router.get("/my", protect, async (req, res) => {
  try {
    const orders = await query(
      `SELECT o.*,
        json_agg(json_build_object(
          'product_id', oi.product_id,
          'name', oi.name,
          'price', oi.price,
          'quantity', oi.quantity,
          'image_url', oi.image_url,
          'subtotal', oi.subtotal
        )) AS items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.buyer_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    res.json({ orders: orders.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders." });
  }
});

// ─────────────────────────────
// GET /api/orders/:id
// Get order detail
// ─────────────────────────────
router.get("/:id", protect, async (req, res) => {
  try {
    const order = await query(
      `SELECT o.*,
        json_agg(json_build_object(
          'product_id', oi.product_id,
          'name', oi.name,
          'price', oi.price,
          'quantity', oi.quantity,
          'image_url', oi.image_url,
          'variant', oi.variant,
          'subtotal', oi.subtotal,
          'seller_id', oi.seller_id
        )) AS items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1 AND (o.buyer_id = $2 OR $3 = 'admin')
       GROUP BY o.id`,
      [req.params.id, req.user.id, req.user.role]
    );

    if (order.rows.length === 0) return res.status(404).json({ error: "Order not found." });
    res.json({ order: order.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch order." });
  }
});

// ─────────────────────────────
// PUT /api/orders/:id/status (Admin/Seller)
// Update order status
// ─────────────────────────────
router.put("/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["confirmed","shipped","delivered","cancelled"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const order = await query("SELECT buyer_id FROM orders WHERE id = $1", [req.params.id]);
    if (order.rows.length === 0) return res.status(404).json({ error: "Order not found." });

    await query(
      "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
      [status, req.params.id]
    );

    // Notify buyer
    const statusEmojis = { confirmed: "✅", shipped: "🚐", delivered: "🎉", cancelled: "❌" };
    await query(
      "INSERT INTO notifications (user_id, type, title, body) VALUES ($1, $2, $3, $4)",
      [
        order.rows[0].buyer_id,
        "order",
        `Order ${statusEmojis[status]} ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `Your order #${req.params.id.slice(0,8)} is now ${status}.`,
      ]
    );

    res.json({ message: `Order status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update order status." });
  }
});

module.exports = router;