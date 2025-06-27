const express = require("express");
const router = express.Router();
const podUsersController = require("../../controllers/podUsersController");

router.post("/", podUsersController.assignOrguserToPod);
router.get("/pods/:pod_id/users", podUsersController.getOrgusersForPod);
router.delete("/", podUsersController.removeOrguserFromPod);

module.exports = router;
