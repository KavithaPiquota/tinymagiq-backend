const express = require("express");
const router = express.Router();
const podUsersController = require("../../controllers/podUsersController");

// Assign an orguser to a pod
router.post("/", podUsersController.assignUserToPod);

// Get orgusers for a pod
router.get("/pods/:pod_id/users", podUsersController.getPodUsers);

// Remove an orguser from a pod
router.delete("/", podUsersController.removeUserFromPod);

module.exports = router;
