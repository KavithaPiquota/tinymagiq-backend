const express = require("express");
const router = express.Router();
const orgadminController = require("../../controllers/orgadmin_controller");
const authMiddleware = require("../../middleware/auth");

router.get(
  "/batches/:email",
  authMiddleware,
  orgadminController.getBatchesByOrgadmin
);
router.get(
  "/pods/:email",
  authMiddleware,
  orgadminController.getPodsByOrgadmin
);
router.get(
  "/users/:email",
  authMiddleware,
  orgadminController.getUsersByOrgadmin
);
router.get(
  "/progress/:email",
  authMiddleware,
  orgadminController.getProgressByOrgadmin
);
router.get(
  "/user-progress/:email/:user_email",
  authMiddleware,
  orgadminController.getUserProgressByOrgadmin
);

module.exports = router;
