const express = require("express");
const router = express.Router();
const podUsersController = require("../../controllers/pod_users_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// Add user to pod
router.post(
  "/",
  authMiddleware,
  restrictTo("superadmin"),
  podUsersController.addUserToPod
);

// Update pod user assignment or progress
router.put(
  "/:pod_user_id",
  authMiddleware,
  restrictTo("superadmin"),
  podUsersController.updatePodUser
);

// Get complete orguser details by identifier (email, username, or full name)
router.get(
  "/user/:identifier",
  authMiddleware,
  podUsersController.getOrguserDetails
);

// Get complete orguser details by email
router.get(
  "/user/email/:email",
  authMiddleware,
  podUsersController.getOrguserDetailsByEmail
);

// Get complete orguser details by user_id
router.get(
  "/user/id/:user_id",
  authMiddleware,
  podUsersController.getOrguserDetailsByUserId
);
// Get unaasigned user
router.get(
  "/unassigned/:organization_identifier",
  authMiddleware,
  podUsersController.getUnassignedOrgusers
);
// Get aasigned user
router.get(
  "/all/:organization_identifier",
  authMiddleware,
  podUsersController.getAllOrgusersWithAssignmentStatus
);

module.exports = router;
