const express = require("express");
const router = express.Router();
const superadminController = require("../../controllers/superadminController");

// POST /api/superadmin - Create a new superadmin
router.post("/", superadminController.addSuperadmin);

module.exports = router;
