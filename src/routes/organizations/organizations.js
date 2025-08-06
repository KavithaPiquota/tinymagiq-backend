const express = require("express");
const router = express.Router();
const organizationsController = require("../../controllers/organizations_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

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
router.post(
  "/",
  authMiddleware,
  restrictTo("superadmin"),
  organizationsController.createOrganization
);

//Update organization
router.put(
  "/:organization_id",
  authMiddleware,
  restrictTo("superadmin"),
  organizationsController.updateOrganization
);

module.exports = router;
