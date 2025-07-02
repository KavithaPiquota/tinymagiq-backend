const express = require("express");
const router = express.Router();
const mentorController = require("../../controllers/mentor_controller");

// Get all pods assigned to a mentor
router.get("/pods/:mentor_identifier", mentorController.getMentorPods);

// Get concepts for all pods assigned to a mentor
router.get(
  "/pods/:mentor_identifier/concepts",
  mentorController.getMentorPodConcepts
);

// Get progress of orgusers in mentor's pods
router.get(
  "/pods/:mentor_identifier/orguser-progress",
  mentorController.getMentorOrguserProgress
);

// Get details of a specific orguser in mentor's pods
router.get(
  "/pods/:mentor_identifier/orguser/:identifier",
  mentorController.getMentorOrguserDetails
);

module.exports = router;
