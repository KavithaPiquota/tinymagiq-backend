const express = require("express");

// Import routes
const templateRoutes = require("./templates/templates");
const rolesRoutes = require("./roles/roles");
const organizationsRoutes = require("./organizations/organizations");
const usersRoutes = require("./users/users");
const conceptsRoutes = require("./concepts/concepts");

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
    description:
      "API for managing templates, roles, organizations and chat conversations",
    endpoints: {
      // Role endpoints
      roles: "/api/roles",

      // Organization endpoints
      organizations: "/api/organizations",
      createOrganization: "/api/organizations",
      activeOrganizations: "/api/organizations/active",
      inactiveOrganizations: "/api/organizations/inactive",

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
    },
    documentation: "See README.md for detailed API documentation",
  });
});

// Role management routes
router.use("/roles", rolesRoutes);

// Organization management routes
router.use("/organizations", organizationsRoutes);

// User management routes
router.use("/users", usersRoutes);

// Concept management routes
router.use("/concepts", conceptsRoutes);

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

// Legacy compatibility routes (if needed)
router.use("/templates/update", templateRoutes);
router.use("/templates/get", templateRoutes);
router.use("/templates/delete", templateRoutes);

module.exports = router;
