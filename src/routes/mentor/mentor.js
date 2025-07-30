const express = require("express");
const router = express.Router();
const mentorController = require("../../controllers/mentor_controller");
const authMiddleware = require("../../middleware/auth");

// Get all pods assigned to a mentor
router.get(
  "/pods/:mentor_identifier",
  authMiddleware,
  mentorController.getMentorPods
);

// Get concepts for all pods assigned to a mentor
router.get(
  "/pods/:mentor_identifier/concepts",
  authMiddleware,
  mentorController.getMentorPodConcepts
);

// Get progress of orgusers in mentor's pods
router.get(
  "/pods/:mentor_identifier/orguser-progress",
  authMiddleware,
  mentorController.getMentorOrguserProgress
);

// Get details of a specific orguser in mentor's pods
router.get(
  "/pods/:mentor_identifier/orguser/:identifier",
  authMiddleware,
  mentorController.getMentorOrguserDetails
);

module.exports = router;
