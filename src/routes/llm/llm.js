const express = require("express");
const router = express.Router();
const llmController = require("../../controllers/llm_controller");
const authMiddleware = require("../../middleware/auth");

// Model routes
router.post("/models", authMiddleware, llmController.addModel);
router.put("/models/:model_id", authMiddleware, llmController.updateModel);
router.get("/models", authMiddleware, llmController.getAllModels);
router.get("/global-models/public", llmController.getGlobalModelsPublic);

// Assignment routes
router.post("/assignments", authMiddleware, llmController.addAssignment);
router.put(
  "/assignments/:assignment_id",
  authMiddleware,
  llmController.updateAssignment
);
router.get("/assignments", authMiddleware, llmController.getAllAssignments);
router.get(
  "/assignments/organization/:organization_id",
  authMiddleware,
  llmController.getOrganizationAssignments
);
router.get(
  "/assignments/fallback",
  authMiddleware,
  llmController.getAssignmentWithFallback
);

// Orgadmin-specific routes
router.get("/orgadmin/models", authMiddleware, llmController.getOrgadminModels);
router.get(
  "/orgadmin/assignments",
  authMiddleware,
  llmController.getOrgadminAssignments
);
router.get(
  "/orgadmin/organization-models",
  authMiddleware,
  llmController.getOrgadminOrganizationModels
);

//Delete routes
router.delete("/models/:model_id", authMiddleware, llmController.deleteModel);

module.exports = router;
