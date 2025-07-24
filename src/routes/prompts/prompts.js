const express = require("express");
const router = express.Router();
const promptsController = require("../../controllers/prompts_controller");

router.post("/", promptsController.addPrompt);
router.put("/:prompt_id", promptsController.updatePrompt);
router.get("/", promptsController.getPrompts);
router.get(
  "/all",
  (req, res, next) => {
    req.query.scope = "all";
    next();
  },
  promptsController.getPrompts
);
router.get("/global", promptsController.getGlobalPrompts);
router.get("/batch", promptsController.getBatchPrompts);
router.get("/archived", promptsController.getArchivedPrompts);
router.post("/batch", promptsController.addBatchPrompt);

module.exports = router;
