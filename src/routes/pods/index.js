const express = require("express");
const router = express.Router();
const podsController = require("../../controllers/podsController");

// Create a pod
router.post("/", podsController.createPod);

// Get all pods (optionally filtered by organization_name)
router.get("/", podsController.getPods);

// Get pods by organization name
router.get("/organization", podsController.getPodsByOrganization);

// Get pods by organization name and batch name
router.get("/organization/batch", podsController.getPodsByOrgAndBatch);

// Get pods by batch name
router.get("/batch", podsController.getPodsByBatch);

// Get pods by batch ID
router.get("/batch_id", podsController.getPodsByBatchId);

// Get pods by organization ID
router.get("/org_id", podsController.getPodsByOrgId);

// Update a pod
router.put("/:pod_id", podsController.updatePod);

module.exports = router;
