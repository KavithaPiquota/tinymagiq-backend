const express = require("express");
const router = express.Router();
const orgadminController = require("../../controllers/orgadmin_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

router.get(
  "/batches/:username",
  authMiddleware,
  restrictTo("orgadmin"),
  orgadminController.getBatchesByOrgadmin
);
router.get(
  "/pods/:username",
  authMiddleware,
  restrictTo("orgadmin"),
  orgadminController.getPodsByOrgadmin
);
router.get(
  "/users/:username",
  authMiddleware,
  restrictTo("orgadmin"),
  orgadminController.getUsersByOrgadmin
);
router.get(
  "/progress/:username",
  authMiddleware,
  restrictTo("orgadmin"),
  orgadminController.getProgressByOrgadmin
);
router.get(
  "/user-progress/:email/:user_email",
  authMiddleware,
  restrictTo("orgadmin"),
  orgadminController.getUserProgressByOrgadmin
);

module.exports = router;
