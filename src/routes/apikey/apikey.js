const express = require("express");
const router = express.Router();
const apikeyController = require("../../controllers/apikey_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// GET API Key
router.get("/", authMiddleware, apikeyController.getApiKey);

// UPDATE API Key
router.put(
  "/",
  authMiddleware,
  restrictTo("superadmin"),
  apikeyController.updateApiKey
);
// POST LLM Request (new endpoint)
router.post(
  "/call-llm",
  authMiddleware,
  restrictTo("orguser", "superadmin"),
  apikeyController.callLLM
);
 
module.exports = router;
