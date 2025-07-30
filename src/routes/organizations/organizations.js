const express = require("express");
const router = express.Router();
const organizationsController = require("../../controllers/organizations_controller");
const authMiddleware = require("../../middleware/auth");

// Get all organizations
router.get("/", authMiddleware, organizationsController.getAllOrganizations);

// Get active organizations
router.get(
  "/active",
  authMiddleware,
  organizationsController.getActiveOrganizations
);

// Get inactive organizations
router.get(
  "/inactive",
  authMiddleware,
  organizationsController.getInactiveOrganizations
);

// Create a new organization
router.post("/", authMiddleware, organizationsController.createOrganization);

//Update organization
router.put(
  "/:organization_id",
  authMiddleware,
  organizationsController.updateOrganization
);

module.exports = router;
