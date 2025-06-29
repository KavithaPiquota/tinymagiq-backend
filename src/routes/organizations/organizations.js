const express = require("express");
const router = express.Router();
const organizationsController = require("../../controllers/organizations_controller");

// Get all organizations
router.get("/", organizationsController.getAllOrganizations);

// Get active organizations
router.get("/active", organizationsController.getActiveOrganizations);

// Get inactive organizations
router.get("/inactive", organizationsController.getInactiveOrganizations);

// Create a new organization
router.post("/", organizationsController.createOrganization);

module.exports = router;
