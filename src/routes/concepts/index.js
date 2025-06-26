// src/routes/concepts/index.js
const express = require("express");
const router = express.Router();
const conceptsController = require("../../controllers/conceptsController");

// POST /api/concepts - Create a concept
router.post("/", conceptsController.createConcept);

// GET /api/concepts - List all concepts
router.get("/", conceptsController.getConcepts);

// PUT /api/concepts/:concept_id - Update a concept
router.put("/:concept_id", conceptsController.updateConcept);

module.exports = router;
