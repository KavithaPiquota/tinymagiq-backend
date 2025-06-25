const express = require("express");
const router = express.Router();
const orguserController = require("../../controllers/orguserController");

// POST /api/orguser - Create a new orguser
router.post("/", orguserController.addOrguser);

module.exports = router;
