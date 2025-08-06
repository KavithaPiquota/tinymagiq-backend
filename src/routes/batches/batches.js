const express = require("express");
const router = express.Router();
const batchesController = require("../../controllers/batches_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// Add a new batch
router.post(
  "/",
  authMiddleware,
  restrictTo("superadmin"),
  batchesController.addBatch
);

// Update a batch
router.put(
  "/:batch_id",
  authMiddleware,
  restrictTo("superadmin"),
  batchesController.updateBatch
);

// Get all batches
router.get("/", authMiddleware, batchesController.getAllBatches);

// Get batches by organization name
router.get(
  "/organization/:organization_name",
  authMiddleware,
  batchesController.getBatchesByOrganization
);

// Get batch by batch name
router.get(
  "/name/:batch_name",
  authMiddleware,
  batchesController.getBatchByName
);

// Get batch by batch_id
router.get("/:batch_id", authMiddleware, batchesController.getBatchById);

module.exports = router;
