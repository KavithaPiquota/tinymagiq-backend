const express = require("express");
const router = express.Router();
const apikeyController = require("../../controllers/apikey_controller");

// GET API Key
router.get("/", apikeyController.getApiKey);

// UPDATE API Key
router.put("/", apikeyController.updateApiKey);

module.exports = router;
