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
router.post(
  "/superadmin",
  authMiddleware,
  restrictTo("superadmin"),
  usersController.addSuperadmin
);
router.post(
  "/mentor",
  authMiddleware,
  restrictTo("superadmin"),
  usersController.addMentor
);
router.post(
  "/orgadmin",
  authMiddleware,
  restrictTo("superadmin"),
  usersController.addOrgadmin
);
router.post(
  "/orguser",
  authMiddleware,
  restrictTo("superadmin"),
  usersController.addOrguser
);
router.put(
  "/:user_id",
  authMiddleware,
  restrictTo("superadmin"),
  usersController.updateUser
);
router.get(
  "/",
  authMiddleware,
  restrictTo("superadmin"),
  usersController.getAllUsers
);
router.get("/:user_id", authMiddleware, usersController.getUserById);
router.get(
  "/identifier/:identifier",
  authMiddleware,
  usersController.getUserByEmailOrUsername
);
router.get(
  "/role/:role_name",
  authMiddleware,
  restrictTo("superadmin"),
  usersController.getUsersByRole
);
router.get(
  "/organization/:organization_name",
  authMiddleware,
  usersController.getUsersByOrganization
);
// New change password route
router.post(
  "/change-password",
  authMiddleware,
  restrictTo("superadmin", "mentor", "orgadmin", "orguser"),
  usersController.changePassword
);
// Logout route
router.post("/logout", authMiddleware, usersController.logoutUser);

module.exports = router;
