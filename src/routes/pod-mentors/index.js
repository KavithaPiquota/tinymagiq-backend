const express = require("express");
const router = express.Router();
const podMentorsController = require("../../controllers/podMentorsController");

// Assign a mentor to a pod
router.post("/", podMentorsController.assignMentorToPod);

// Get mentors for a pod
router.get("/pods/:pod_id/mentors", podMentorsController.getPodMentors);

// Remove a mentor from a pod
router.delete("/", podMentorsController.removeMentorFromPod);

module.exports = router;
