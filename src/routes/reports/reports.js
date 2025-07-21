const express = require("express");
const router = express.Router();
const reportsController = require("../../controllers/reports_controller");

// GET /api/reports/progress
// Fetch progress report with user details, batch, and pod information
router.get("/progress", reportsController.getProgressReport);

module.exports = router;
