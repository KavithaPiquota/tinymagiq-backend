const express = require("express");
const router = express.Router();
const organizationController = require("../../controllers/organizationController");

// POST /api/organization - Create a new organization
router.post("/", organizationController.addOrganization);

module.exports = router;
