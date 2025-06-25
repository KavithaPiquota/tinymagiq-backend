const express = require("express");
const router = express.Router();
const orgadminController = require("../../controllers/orgadminController");

// POST /api/orgadmin - Create a new orgadmin
router.post("/", orgadminController.addOrgadmin);

module.exports = router;
