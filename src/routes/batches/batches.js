const express = require("express");
const router = express.Router();
const batchesController = require("../../controllers/batches_controller");

// Add a new batch
router.post("/", batchesController.addBatch);

// Update a batch
router.put("/:batch_id", batchesController.updateBatch);

// Get all batches
router.get("/", batchesController.getAllBatches);

// Get batches by organization name
router.get(
  "/organization/:organization_name",
  batchesController.getBatchesByOrganization
);

// Get batch by batch name
router.get("/name/:batch_name", batchesController.getBatchByName);

// Get batch by batch_id
router.get("/:batch_id", batchesController.getBatchById);

module.exports = router;
