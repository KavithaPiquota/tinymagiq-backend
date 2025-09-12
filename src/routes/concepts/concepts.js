const express = require("express");
const router = express.Router();
const conceptsController = require("../../controllers/concepts_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// Add a new concept
router.post(
  "/",
  authMiddleware,
  restrictTo("superadmin"),
  conceptsController.addConcept
);

// Update a concept
router.put(
  "/:concept_id",
  authMiddleware,
  restrictTo("superadmin"),
  conceptsController.updateConcept
);

// Get all concepts
router.get("/", authMiddleware, restrictTo("superadmin"), conceptsController.getAllConcepts);

// Get active concepts
router.get("/active", authMiddleware, restrictTo("superadmin"), conceptsController.getActiveConcepts);

// Get archived concepts
router.get(
  "/archived",
  (req, res, next) => {
    console.log(`[${new Date().toISOString()}] Hit GET /api/concepts/archived`);
    next();
  },
  authMiddleware,
  restrictTo("superadmin"),
  conceptsController.getArchivedConcepts
);

// Get non-archived concepts
router.get(
  "/non-archived",
  (req, res, next) => {
    console.log(
      `[${new Date().toISOString()}] Hit GET /api/concepts/non-archived`
    );
    next();
  },
  authMiddleware,
  restrictTo("superadmin"),
  conceptsController.getNonArchivedConcepts
);

// Get concept by concept_name
router.get(
  "/name/:concept_name",
  authMiddleware,
  restrictTo("superadmin"),
  conceptsController.getConceptByName
);

// Get concept by concept_id
router.get("/:concept_id", authMiddleware, restrictTo("superadmin"), conceptsController.getConceptById);

module.exports = router;
