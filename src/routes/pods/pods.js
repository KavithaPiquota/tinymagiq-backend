const express = require("express");
const router = express.Router();
const podsController = require("../../controllers/pods_controller");
const authMiddleware = require("../../middleware/auth");

// Add a new pod
router.post("/", authMiddleware, podsController.addPod);

// Update a pod
router.put("/:pod_id", authMiddleware, podsController.updatePod);

// Get all pods
router.get("/", authMiddleware, podsController.getAllPods);

// Get pods by organization name
router.get(
  "/organization/:organization_name",
  authMiddleware,
  podsController.getPodsByOrganization
);

// Get pods by mentor email
router.get(
  "/mentor/email/:mentor_email",
  authMiddleware,
  podsController.getPodsByMentorEmail
);

// Get pods by mentor ID
router.get(
  "/mentor/id/:mentor_id",
  authMiddleware,
  podsController.getPodsByMentorId
);

// Get pod by pod name
router.get("/name/:pod_name", authMiddleware, podsController.getPodByName);

// Get pod by pod_id
router.get("/:pod_id", authMiddleware, podsController.getPodById);

module.exports = router;
