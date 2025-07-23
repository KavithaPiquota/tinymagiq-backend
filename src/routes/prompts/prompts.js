const express = require("express");
const router = express.Router();
const promptsController = require("../../controllers/prompts_controller");

router.post("/", promptsController.addPrompt);
router.put("/:id", promptsController.updatePrompt);
router.get("/", promptsController.getPrompts);
router.get(
  "/archived",
  (req, res, next) => {
    req.query.scope = "archived";
    next();
  },
  promptsController.getPrompts
);
router.get(
  "/all",
  (req, res, next) => {
    req.query.scope = "all";
    next();
  },
  promptsController.getPrompts
);

module.exports = router;
