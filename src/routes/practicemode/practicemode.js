// src/routes/practicemode/practicemode.js - Complete practicemode Routes
const express = require("express");
const router = express.Router();
const practicemodeController = require("../../controllers/practicemodecontroller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// MAIN WORKFLOW ENDPOINTS

// Check session status (first call when user logs in)
router.get(
  "/session-status/:user_id",
  authMiddleware,
  restrictTo("orguser"),
  practicemodeController.getSessionStatus
);

// Create/Save new practicemode conversation
router.post(
  "/",
  authMiddleware,
  restrictTo("orguser"),
  practicemodeController.createpracticemode
);

// Update existing conversation (for resuming and continuing)
router.put(
  "/conversation/:practicemode_id",
  authMiddleware,
  restrictTo("orguser"),
  practicemodeController.updateConversation
);

// UTILITY ENDPOINTS

// Get practicemode counts by status
router.get(
  "/counts/:user_id",
  authMiddleware,
  restrictTo("orguser"),
  practicemodeController.getpracticemodeCounts
);

// Get practicemode history with filtering and pagination
router.get(
  "/history/:user_id",
  authMiddleware,
  restrictTo("mentor", "orgadmin", "orguser"),
  practicemodeController.getpracticemodeHistory
);

// Get specific practicemode by ID
router.get("/:practicemode_id", practicemodeController.getpracticemodeById);

// Delete practicemode
router.delete("/:practicemode_id", practicemodeController.deletepracticemode);

module.exports = router;
