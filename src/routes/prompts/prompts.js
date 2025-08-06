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
router.get("/", authMiddleware, promptsController.getPrompts);
router.get(
  "/all",
  (req, res, next) => {
    req.query.scope = "all";
    next();
  },
  authMiddleware,
  promptsController.getPrompts
);
router.get("/global", authMiddleware, promptsController.getGlobalPrompts);
router.get("/batch", authMiddleware, promptsController.getBatchPrompts);
router.get("/archived", authMiddleware, promptsController.getArchivedPrompts);
router.post("/batch", authMiddleware, promptsController.addBatchPrompt);
router.get(
  "/fallback",
  authMiddleware,
  promptsController.getPromptsWithFallback
);

module.exports = router;
