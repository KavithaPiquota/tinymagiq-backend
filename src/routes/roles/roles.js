const express = require('express');
const router = express.Router();
const rolesController = require('../../controllers/roles_controller');

// Get all roles
router.get('/', rolesController.getAllRoles);

module.exports = router;