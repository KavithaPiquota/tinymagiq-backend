const express = require("express");
const router = express.Router();
const podsController = require("../../controllers/pods_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// Add a new pod
router.post(
  "/",
  authMiddleware,
  restrictTo("superadmin"),
  podsController.addPod
);

// Update a pod
router.put(
  "/:pod_id",
  authMiddleware,
  restrictTo("superadmin"),
  podsController.updatePod
);

// Get all pods
router.get("/", authMiddleware, restrictTo("superadmin"), podsController.getAllPods);

// Get pods by organization name
router.get(
  "/organization/:organization_name",
  authMiddleware,
  restrictTo("superadmin"),
  podsController.getPodsByOrganization
);

// Get pods by mentor email
router.get(
  "/mentor/email/:mentor_email",
  authMiddleware,
  restrictTo("mentor"),
  podsController.getPodsByMentorEmail
);

// Get pods by mentor ID
router.get(
  "/mentor/id/:mentor_id",
  authMiddleware,
  restrictTo("mentor"),
  podsController.getPodsByMentorId
);

// Get pod by pod name
router.get("/name/:pod_name", authMiddleware, restrictTo("superadmin"), podsController.getPodByName);

// Get pod by pod_id
router.get(
  "/:pod_id",
  authMiddleware,
  restrictTo("mentor", "orgadmin", "superadmin"),
  podsController.getPodById
);

module.exports = router;
