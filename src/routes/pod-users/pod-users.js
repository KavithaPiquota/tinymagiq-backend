const express = require("express");
const router = express.Router();
const podUsersController = require("../../controllers/pod_users_controller");

// Add user to pod
router.post("/", podUsersController.addUserToPod);

// Update pod user assignment or progress
router.put("/:pod_user_id", podUsersController.updatePodUser);

// Get complete orguser details by identifier (email, username, or full name)
router.get("/user/:identifier", podUsersController.getOrguserDetails);

// Get complete orguser details by email
router.get("/user/email/:email", podUsersController.getOrguserDetailsByEmail);

// Get complete orguser details by user_id
router.get("/user/id/:user_id", podUsersController.getOrguserDetailsByUserId);

module.exports = router;
