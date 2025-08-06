const express = require("express");
const router = express.Router();
const usersController = require("../../controllers/users_controller");
const authMiddleware = require("../../middleware/auth");
const { restrictTo } = require("../../middleware/rbac");

// Public route
router.post("/login", usersController.loginUser);

// Protected routes
router.get("/verify", authMiddleware, usersController.verifyUser);
router.post(
  "/",
  authMiddleware,
  restrictTo("superadmin"),
  usersController.addUser
);
router.post("/superadmin", authMiddleware, usersController.addSuperadmin);
router.post("/mentor", authMiddleware, usersController.addMentor);
router.post("/orgadmin", authMiddleware, usersController.addOrgadmin);
router.post("/orguser", authMiddleware, usersController.addOrguser);
router.put("/:user_id", authMiddleware, usersController.updateUser);
router.get("/", authMiddleware, usersController.getAllUsers);
router.get("/:user_id", authMiddleware, usersController.getUserById);
router.get(
  "/identifier/:identifier",
  authMiddleware,
  usersController.getUserByEmailOrUsername
);
router.get("/role/:role_name", authMiddleware, usersController.getUsersByRole);
router.get(
  "/organization/:organization_name",
  authMiddleware,
  usersController.getUsersByOrganization
);

module.exports = router;
