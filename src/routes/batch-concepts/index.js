const express = require("express");
const router = express.Router();
const batchConceptsController = require("../../controllers/batchConceptsController");

// Assign a concept to a batch
router.post("/", batchConceptsController.assignConceptToBatch);

// Get concepts for a pod
router.get("/pods/:pod_id/concepts", batchConceptsController.getPodConcepts);

// Remove a concept from a batch
router.delete("/", batchConceptsController.removeConceptFromBatch);

module.exports = router;
