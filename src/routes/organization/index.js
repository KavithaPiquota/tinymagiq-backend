const express = require("express");
const router = express.Router();
const organizationController = require("../../controllers/organizationController");

// GET /api/organization - Get list of organizations
router.get("/", organizationController.getOrganizations);

// POST /api/organization - Create a new organization
router.post("/", organizationController.addOrganization);

module.exports = router;
