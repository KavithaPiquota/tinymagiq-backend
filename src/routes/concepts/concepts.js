const express = require("express");
const router = express.Router();
const conceptsController = require("../../controllers/concepts_controller");

// Add a new concept
router.post("/", conceptsController.addConcept);

// Update a concept
router.put("/:concept_id", conceptsController.updateConcept);

// Get all concepts
router.get("/", conceptsController.getAllConcepts);

// Get concept by concept_id
router.get("/:concept_id", conceptsController.getConceptById);

// Get concept by concept_name
router.get("/name/:concept_name", conceptsController.getConceptByName);

module.exports = router;
