// src/routes/batches/index.js
const express = require("express");
const router = express.Router();
const batchesController = require("../../controllers/batchesController");

// POST /api/batches - Create a batch
router.post("/", batchesController.createBatch);

// GET /api/batches - List all batches
router.get("/", batchesController.getBatches);

// PUT /api/batches/:batch_id - Update a batch
router.put("/:batch_id", batchesController.updateBatch);

module.exports = router;
