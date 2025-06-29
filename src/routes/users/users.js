const express = require("express");
const router = express.Router();
const usersController = require("../../controllers/users_controller");

// Add a new user (generic)
router.post("/", usersController.addUser);

// Add specific role users
router.post("/superadmin", usersController.addSuperadmin);
router.post("/mentor", usersController.addMentor);
router.post("/orgadmin", usersController.addOrgadmin);
router.post("/orguser", usersController.addOrguser);

// Update a user
router.put("/:user_id", usersController.updateUser);

// Login user
router.post("/login", usersController.loginUser);

// Get all users
router.get("/", usersController.getAllUsers);

// Get user by user_id
router.get("/:user_id", usersController.getUserById);

// Get user by email or username
router.get("/identifier/:identifier", usersController.getUserByEmailOrUsername);

// Get users by role name
router.get("/role/:role_name", usersController.getUsersByRole);

// Get users by organization name (orgadmin and orguser only)
router.get(
  "/organization/:organization_name",
  usersController.getUsersByOrganization
);

module.exports = router;
