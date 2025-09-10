// src/routes/chat/chat.js - Complete Chat Routes
const express = require("express");
const router = express.Router();
const chatController = require("../../controllers/chatController");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// MAIN WORKFLOW ENDPOINTS

// Check session status (first call when user logs in)
router.get(
  "/session-status/:user_id",
  authMiddleware,
  restrictTo("orguser"),
  chatController.getSessionStatus
);

// Create/Save new chat conversation
router.post(
  "/",
  authMiddleware,
  restrictTo("orguser"),
  chatController.createChat
);

// Update existing conversation (for resuming and continuing)
router.put(
  "/conversation/:chat_id",
  authMiddleware,
  restrictTo("orguser"),
  chatController.updateConversation
);

// UTILITY ENDPOINTS

// Get chat counts by status
router.get(
  "/counts/:user_id",
  authMiddleware,
  restrictTo("orguser"),
  chatController.getChatCounts
);

// Get chat history with filtering and pagination
router.get(
  "/history/:user_id",
  authMiddleware,
  restrictTo("mentor", "orgadmin", "orguser"),
  chatController.getChatHistory
);

// Get specific chat by ID
router.get("/:chat_id", chatController.getChatById);

// Delete chat
router.delete("/:chat_id", chatController.deleteChat);

module.exports = router;
