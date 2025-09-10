const express = require("express");
const router = express.Router();
const reportsController = require("../../controllers/reports_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// GET /api/reports/progress
// Fetch progress report with user details, batch, and pod information
router.get(
  "/progress",
  authMiddleware,
  restrictTo("mentor", "orgadmin"),
  reportsController.getProgressReport
);

module.exports = router;
