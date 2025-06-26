// src/routes/index.js
const express = require("express");

// Import routes
const templateRoutes = require("./templates/templates");
const superadminRoutes = require("./superadmin/");
const organizationRoutes = require("./organization");
const orgadminRoutes = require("./orgadmin");
const orguserRoutes = require("./orguser");
const authRoutes = require("./auth");
const mentorsRoutes = require("./mentors");
const conceptsRoutes = require("./concepts");

// Import sanitization middleware with error handling
let sanitizeRequest;
try {
  const { sanitizeRequest: sanitize } = require("../middleware/validation");
  sanitizeRequest = sanitize || ((req, res, next) => next());
  console.log("✅ Validation middleware loaded successfully");
} catch (error) {
  console.warn(
    "❌ Validation middleware not found, using no-op sanitizer:",
    error.message
  );
  sanitizeRequest = (req, res, next) => next();
}

const router = express.Router();

// Apply sanitization to all routes
router.use(sanitizeRequest);

// API version info
router.get("/", (req, res) => {
  res.json({
    name: "TinyMagiq API",
    version: "1.0.0",
    description: "API for managing templates and chat conversations",
    endpoints: {
      // Template endpoints
      templates: "/api/templates",
      defaults: "/api/templates/defaults",
      list: "/api/templates/list",
      process: "/api/templates/process",
      restore: "/api/templates/restore",

      // Chat endpoints
      chat: "/api/chat",
      latestChat: "/api/chat/latest/:user_id",
      chatCounts: "/api/chat/counts/:user_id",
      userChats: "/api/chat/user/:user_id",

      // Utility endpoints
      health: "/health",

      // Superadmin endpoints
      superadmin: "/api/superadmin",

      // Organization endpoints
      organization: {
        list: "GET /api/organization",
        create: "POST /api/organization",
      },

      // Orgadmin endpoints
      orgadmin: "/api/orgadmin",

      // Orguser endpoints
      orguser: "/api/orguser",

      // Authentication endpoints
      auth: "/api/auth/login",

      mentors: {
        list: "GET /api/mentors",
        create: "POST /api/mentors",
        update: "PUT /api/mentors/:mentor_id",
        delete: "DELETE /api/mentors/:mentor_id",
      },

      // Concepts endpoints
      concepts: {
        list: "GET /api/concepts",
        create: "POST /api/concepts",
        update: "PUT /api/concepts/:concept_id",
      },
    },
    documentation: "See README.md for detailed API documentation",
  });
});

// Template management routes
router.use("/templates", templateRoutes);

// Chat routes - with error handling
try {
  const chatRoutes = require("./chat/chat");
  router.use("/chat", chatRoutes);
  console.log("✅ Chat routes loaded successfully");
} catch (error) {
  console.error("❌ Failed to load chat routes:", error.message);
  // Provide a fallback route
  router.use("/chat", (req, res) => {
    res.status(503).json({
      error: "Chat service unavailable",
      message:
        "Chat routes failed to load. Make sure chat controller and routes are properly set up.",
      details: error.message,
    });
  });
}

// Superadmin routes - with error handling
try {
  router.use("/superadmin", superadminRoutes);
  console.log("✅ Superadmin routes loaded successfully");
} catch (error) {
  console.error("❌ Failed to load superadmin routes:", error.message);
  router.use("/superadmin", (req, res) => {
    res.status(503).json({
      error: "Superadmin service unavailable",
      message:
        "Superadmin routes failed to load. Make sure superadmin controller and routes are properly set up.",
      details: error.message,
    });
  });
}

// Organization routes - with error handling
try {
  router.use("/organization", organizationRoutes);
  console.log("✅ Organization routes loaded successfully");
} catch (error) {
  console.error("❌ Failed to load organization routes:", error.message);
  router.use("/organization", (req, res) => {
    res.status(503).json({
      error: "Organization service unavailable",
      message:
        "Organization routes failed to load. Make sure organization controller and routes are properly set up.",
      details: error.message,
    });
  });
}

// Orgadmin routes - with error handling
try {
  router.use("/orgadmin", orgadminRoutes);
  console.log("✅ Orgadmin routes loaded successfully");
} catch (error) {
  console.error("❌ Failed to load orgadmin routes:", error.message);
  router.use("/orgadmin", (req, res) => {
    res.status(503).json({
      error: "Orgadmin service unavailable",
      message:
        "Orgadmin routes failed to load. Make sure orgadmin controller and routes are properly set up.",
      details: error.message,
    });
  });
}

// Orguser routes - with error handling
try {
  router.use("/orguser", orguserRoutes);
  console.log("✅ Orguser routes loaded successfully");
} catch (error) {
  console.error("❌ Failed to load orguser routes:", error.message);
  router.use("/orguser", (req, res) => {
    res.status(503).json({
      error: "Orguser service unavailable",
      message:
        "Orguser routes failed to load. Make sure orguser controller and routes are properly set up.",
      details: error.message,
    });
  });
}

// Auth routes - with error handling
try {
  router.use("/auth", authRoutes);
  console.log("✅ Auth routes loaded successfully");
} catch (error) {
  console.error("❌ Failed to load auth routes:", error.message);
  router.use("/auth", (req, res) => {
    res.status(503).json({
      error: "Auth service unavailable",
      message:
        "Auth routes failed to load. Make sure auth controller and routes are properly set up.",
      details: error.message,
    });
  });
}

// Mentors routes
router.use("/mentors", mentorsRoutes);

// Concepts routes
router.use("/concepts", conceptsRoutes);

// Legacy compatibility routes (if needed)
router.use("/templates/update", templateRoutes);
router.use("/templates/get", templateRoutes);
router.use("/templates/delete", templateRoutes);

module.exports = router;
