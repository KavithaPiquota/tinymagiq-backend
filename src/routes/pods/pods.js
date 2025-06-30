const express = require("express");
const router = express.Router();
const podsController = require("../../controllers/pods_controller");

// Add a new pod
router.post("/", podsController.addPod);

// Update a pod
router.put("/:pod_id", podsController.updatePod);

// Get all pods
router.get("/", podsController.getAllPods);

// Get pods by organization name
router.get(
  "/organization/:organization_name",
  podsController.getPodsByOrganization
);

// Get pods by mentor email
router.get("/mentor/email/:mentor_email", podsController.getPodsByMentorEmail);

// Get pods by mentor ID
router.get("/mentor/id/:mentor_id", podsController.getPodsByMentorId);

// Get pod by pod name
router.get("/name/:pod_name", podsController.getPodByName);

// Get pod by pod_id
router.get("/:pod_id", podsController.getPodById);

module.exports = router;
