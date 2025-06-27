const express = require("express");
const router = express.Router();
const usersController = require("../../controllers/usersController");

// Get orguser details
router.get("/:email/details", usersController.getOrguserDetails);

module.exports = router;
