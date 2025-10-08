const express = require("express");
const router = express.Router();
const llmController = require("../../controllers/llm_controller");

// Model Routes
// POST /api/llm/model - Add a new LLM model
router.post("/model", llmController.addModel);

// PUT /api/llm/model/:model_id - Update an existing LLM model
router.put("/model/:model_id", llmController.updateModel);

// GET /api/llm/models - Get all LLM models (for dropdown)
router.get("/models", llmController.getAllModels);

// Assignment Routes
// POST /api/llm/assignment - Assign an LLM model to a level
router.post("/assignment", llmController.addAssignment);

// PUT /api/llm/assignment/:assignment_id - Update an LLM model assignment
router.put("/assignment/:assignment_id", llmController.updateAssignment);

// GET /api/llm/assignments - Fetch all LLM model assignments
router.get("/assignments", llmController.getAllAssignments);

// GET /api/llm/assignments/:organization_id - Fetch LLM model assignments for a specific organization
router.get(
  "/assignments/:organization_id",
  llmController.getOrganizationAssignments
);

// GET /api/llm/fallback - Fetch LLM model assignment with fallback (batch -> organization -> global)
router.get("/fallback", llmController.getAssignmentWithFallback);

module.exports = router;
