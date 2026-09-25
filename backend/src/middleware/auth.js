// JWT Authentication middleware
// Protects routes that require login

const jwt = require("jsonwebtoken");
const { query } = require("../config/database");

// Verify token middleware — add to any route that needs login
const protect = async (req, res, next) => {
  try {
    // Get token from header: "Authorization: Bearer eyJ..."
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided. Please sign in." });
    }

    const token = authHeader.split(" ")[1];

    // Verify the token using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get fresh user data from database
    const result = await query(
      "SELECT id, name, email, phone, role, region, verified, is_active FROM users WHERE id = $1",
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "User not found." });
    }

    if (!result.rows[0].is_active) {
      return res.status(403).json({ error: "Account is banned." });
    }

    // Attach user to request object — available in all route handlers
    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token." });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please sign in again." });
    }
    res.status(500).json({ error: "Authentication error." });
  }
};

// Admin only middleware — use after protect
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
};

// Authenticated user or admin middleware.
// Anyone with a valid account can create listings; admin remains the only privileged role.
const sellerOrAdmin = (req, res, next) => {
  const allowedRoles = ["user", "buyer", "seller", "admin"];
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: "Account access required." });
  }
  next();
};

module.exports = { protect, adminOnly, sellerOrAdmin };