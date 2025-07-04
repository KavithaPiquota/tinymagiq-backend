const express = require("express");
const router = express.Router();
const orgadminController = require("../../controllers/orgadmin_controller");

router.get("/batches/:email", orgadminController.getBatchesByOrgadmin);
router.get("/pods/:email", orgadminController.getPodsByOrgadmin);
router.get("/users/:email", orgadminController.getUsersByOrgadmin);
router.get("/progress/:email", orgadminController.getProgressByOrgadmin);
router.get(
  "/user-progress/:email/:user_email",
  orgadminController.getUserProgressByOrgadmin
);

module.exports = router;
