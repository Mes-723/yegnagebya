// Main Express server — Wedaje Gebya Backend API

const path = require("path");
const fs = require("fs");

if (!process.env.DATABASE_URL) {
  require("dotenv").config({ path: path.join(__dirname, "../.env") });
} else if (process.env.NODE_ENV === "production") {
  console.log("🚀 Production startup: using injected environment variables for database configuration.");
}

const express = require("express");
const cors = require("cors");
const uploadsPath = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "../uploads");
const { pool, ensureSchema } = require("./config/database");

const app = express();

app.set("trust proxy", 1);

// ─── Middleware ─────────────────────────────
app.use(cors({
  origin: true,
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
  exposedHeaders: ["Content-Type"],
}));
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(uploadsPath));

// ─── Health check ───────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "🏪 Wedaje Gebya API",
    version: "1.0.0",
    status: "running",
    country: "Ethiopia 🇪🇹",
  });
});

// ─── Routes ─────────────────────────────────
app.use("/api/auth",     require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/categories", require("./routes/categories"));
app.use("/api/orders",   require("./routes/orders"));
app.use("/api/reviews",  require("./routes/reviews"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/banners", require("./routes/banners"));
app.use("/api/discoveries", require("./routes/discoveries"));
app.use("/api/seller", require("./routes/seller"));
app.use("/api/admin", require("./routes/admin"));

// ─── Error handler ──────────────────────────
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({
    error: err.message || "Something went wrong. Please try again.",
  });
});

// ─── Start server ────────────────────────────
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await ensureSchema();
  } catch (err) {
    console.error("❌ Failed to initialize database schema:", err.message);
    process.exit(1);
  }

  // Start an HTTP server with robust port handling.
  const http = require("http");
  const maxTries = 5;
  let port = Number(process.env.PORT || PORT);
  let server;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    try {
      server = http.createServer(app);
      await new Promise((resolve, reject) => {
        server.once("error", (err) => reject(err));
        server.once("listening", () => resolve());
        server.listen(port, "0.0.0.0");
      });

      console.log(`\n🚀 Wedaje Gebya API running on port ${port}`);
      console.log(`📡 http://localhost:${port}`);
      console.log(`🇪🇹 Ethiopia's marketplace backend ready!\n`);
      break;
    } catch (err) {
      if (err && err.code === "EADDRINUSE") {
        console.error(`Port ${port} already in use, trying next port...`);
        port += 1; // try next port
        // close server and retry
        try { server && server.close(); } catch (e) {}
        continue;
      }
      console.error("Failed to start server:", err);
      process.exit(1);
    }
  }

  if (!server || !server.address()) {
    console.error(`Could not bind to any port after ${maxTries} attempts. Exiting.`);
    process.exit(1);
  }
})();