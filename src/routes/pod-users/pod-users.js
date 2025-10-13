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
  restrictTo("superadmin", "orguser"),
  podUsersController.getOrguserDetails
);

// Get complete orguser details by email
router.get(
  "/user/email/:email",
  authMiddleware,
  restrictTo("superadmin"),
  podUsersController.getOrguserDetailsByEmail
);

// Get complete orguser details by user_id
router.get(
  "/user/id/:user_id",
  authMiddleware,
  restrictTo("mentor", "orgadmin"),
  podUsersController.getOrguserDetailsByUserId
);

// NEW: Get all batches a user is assigned to
router.get(
  "/user/:user_id/batches",
  authMiddleware,
  restrictTo("superadmin", "orgadmin", "mentor"),
  podUsersController.getUserBatches
);

// NEW: Remove user from a specific batch
router.delete(
  "/user/:user_id/batch/:batch_id",
  authMiddleware,
  restrictTo("superadmin"),
  podUsersController.removeUserFromBatch
);

// Get unassigned users
router.get(
  "/unassigned/:organization_identifier",
  authMiddleware,
  restrictTo("superadmin"),
  podUsersController.getUnassignedOrgusers
);
// Get aasigned user
router.get(
  "/all/:organization_identifier",
  authMiddleware,
  restrictTo("superadmin"),
  podUsersController.getAllOrgusersWithAssignmentStatus
);

module.exports = router;
