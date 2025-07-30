const express = require("express");
const router = express.Router();
const rolesController = require("../../controllers/roles_controller");
const authMiddleware = require("../../middleware/auth");

// Get all roles
router.get("/", authMiddleware, rolesController.getAllRoles);

module.exports = router;
