const express = require("express");
const router = express.Router();
const conceptsController = require("../../controllers/concepts_controller");

// Add a new concept
router.post("/", conceptsController.addConcept);

// Update a concept
router.put("/:concept_id", conceptsController.updateConcept);

// Get all concepts
router.get("/", conceptsController.getAllConcepts);

// Get active concepts
router.get("/active", conceptsController.getActiveConcepts);

// Get archived concepts
router.get(
  "/archived",
  (req, res, next) => {
    console.log(`[${new Date().toISOString()}] Hit GET /api/concepts/archived`);
    next();
  },
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
  conceptsController.getNonArchivedConcepts
);

// Get concept by concept_name
router.get("/name/:concept_name", conceptsController.getConceptByName);

// Get concept by concept_id
router.get("/:concept_id", conceptsController.getConceptById);

module.exports = router;
