const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const http = require("http");

const config = require("./config/config");
const corsMiddleware = require("./middleware/cors");
const errorHandler = require("./middleware/errorHandler");
const routes = require("./routes");

const app = express();

// Define allowed hosts
const ALLOWED_HOSTS = [
  "nextgenlearn.api.magiqspark.ai",
  "localhost:5000", // Allow localhost for development
  "https://tiny-magic-1.onrender.com",
];

// Host header validation middleware
app.use((req, res, next) => {
  const host = req.get("host");
  if (!ALLOWED_HOSTS.includes(host)) {
    console.error(`Invalid Host header: ${host}`);
    return res.status(403).json({
      error: "Invalid Host header",
      message: `Host ${host} is not allowed`,
      timestamp: new Date().toISOString(),
    });
  }
  next();
});

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: "Too many requests from this IP",
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
});
app.use("/api/", limiter);

// CORS with logging
app.use((req, res, next) => {
  console.log(
    `CORS middleware: ${req.method} ${req.url} from Origin: ${req.get("Origin")}`
  );
  res.setHeader("Connection", "keep-alive");
  res.on("finish", () => {
    console.log(
      `Response headers for ${req.method} ${req.url}:`,
      res.getHeaders()
    );
  });
  corsMiddleware(req, res, next);
});

// Compression
app.use(compression());

// Logging
if (config.nodeEnv !== "test") {
  app.use(morgan("combined"));
}

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check with database status
app.get("/health", async (req, res) => {
  try {
    const { testConnection } = require("./config/database");
    const dbStatus = await testConnection();

    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      version: process.env.npm_package_version || "1.0.0",
      database: dbStatus ? "connected" : "disconnected",
    });
  } catch (error) {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      version: process.env.npm_package_version || "1.0.0",
      database: "unknown",
    });
  }
});

// Manual migration endpoint
app.post("/migrate", async (req, res) => {
  try {
    const { secret } = req.body;
    const expectedSecret =
      process.env.MIGRATION_SECRET || "tinymagiq-migrate-2024";

    if (secret !== expectedSecret) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid migration secret",
      });
    }

    console.log("🔄 Running manual migration via endpoint...");

    let createTables;
    try {
      const migrate = require("./config/migrate");
      createTables = migrate.createTables;
    } catch (error) {
      return res.status(500).json({
        error: "Migration file not found",
        message: "Unable to load migration script",
      });
    }

    await createTables();

    res.json({
      success: true,
      message: "Database migration completed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Manual migration failed:", error);
    res.status(500).json({
      error: "Migration failed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Migration status endpoint
app.get("/migrate/status", async (req, res) => {
  try {
    const { pool } = require("./config/database");

    const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('chat', 'prompt_templates', 'users')
            ORDER BY table_name
        `);

    const existingTables = result.rows.map((row) => row.table_name);
    const expectedTables = ["chat", "prompt_templates", "users"];
    const missingTables = expectedTables.filter(
      (table) => !existingTables.includes(table)
    );

    res.json({
      success: true,
      data: {
        existingTables,
        missingTables,
        allTablesExist: missingTables.length === 0,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("❌ Error checking migration status:", error);
    res.status(500).json({
      error: "Failed to check migration status",
      message: error.message,
    });
  }
});

// API routes
app.use("/api", routes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use(errorHandler);

// Create HTTP server with increased timeout
const server = http.createServer(app);
server.keepAliveTimeout = 150000; // 150 seconds
server.headersTimeout = 160000; // 160 seconds
server.timeout = 160000; // 160 seconds

module.exports = app;
