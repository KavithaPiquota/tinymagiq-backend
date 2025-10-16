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
router.get("/", authMiddleware, restrictTo("superadmin","orgadmin"), batchesController.getAllBatches);

// Get batches by organization name
router.get(
  "/organization/:organization_name",
  authMiddleware,
  restrictTo("superadmin"),
  batchesController.getBatchesByOrganization
);

// Get batch by batch name
router.get(
  "/name/:batch_name",
  authMiddleware,
  restrictTo("superadmin"),
  batchesController.getBatchByName
);

// Get batch by batch_id
router.get("/:batch_id", restrictTo("superadmin"), authMiddleware, batchesController.getBatchById);

module.exports = router;
