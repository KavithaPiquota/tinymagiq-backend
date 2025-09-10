const express = require("express");
const router = express.Router();
const mentorController = require("../../controllers/mentor_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// Get all pods assigned to a mentor
router.get(
  "/pods/:mentor_identifier",
  authMiddleware,
  restrictTo("mentor"),
  mentorController.getMentorPods
);

// Get concepts for all pods assigned to a mentor
router.get(
  "/pods/:mentor_identifier/concepts",
  authMiddleware,
  restrictTo("mentor"),
  mentorController.getMentorPodConcepts
);

// Get progress of orgusers in mentor's pods
router.get(
  "/pods/:mentor_identifier/orguser-progress",
  authMiddleware,
  restrictTo("mentor"),
  mentorController.getMentorOrguserProgress
);

// Get details of a specific orguser in mentor's pods
router.get(
  "/pods/:mentor_identifier/orguser/:identifier",
  authMiddleware,
  restrictTo("mentor"),
  mentorController.getMentorOrguserDetails
);

module.exports = router;
