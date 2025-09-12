const express = require("express");
const router = express.Router();
const promptsController = require("../../controllers/prompts_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

router.post(
  "/",
  authMiddleware,
  restrictTo("superadmin"),
  promptsController.addPrompt
);
router.put(
  "/:prompt_id",
  authMiddleware,
  restrictTo("superadmin"),
  promptsController.updatePrompt
);
router.get("/", authMiddleware, restrictTo("superadmin"), promptsController.getPrompts);
router.get(
  "/all",
  (req, res, next) => {
    req.query.scope = "all";
    next();
  },
  authMiddleware,
  restrictTo("superadmin"),
  promptsController.getPrompts
);
router.get("/global", authMiddleware, restrictTo("superadmin"), promptsController.getGlobalPrompts);
router.get("/batch", authMiddleware, restrictTo("superadmin"), promptsController.getBatchPrompts);
router.get("/archived", authMiddleware, restrictTo("superadmin"), promptsController.getArchivedPrompts);
router.post("/batch", authMiddleware, restrictTo("superadmin"), promptsController.addBatchPrompt);
router.get(
  "/fallback",
  authMiddleware,
  restrictTo("superadmin", "mentor", "orgadmin", "orguser"),
  promptsController.getPromptsWithFallback
);

// New LLM processing endpoint
router.post(
  "/process",
  authMiddleware,
  restrictTo("superadmin", "mentor", "orgadmin", "orguser"),
  promptsController.processLLM
);

module.exports = router;
