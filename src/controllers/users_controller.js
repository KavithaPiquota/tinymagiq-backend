const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const checkUsernameExists = async (username) => {
  const result = await pool.query("SELECT 1 FROM users WHERE username = $1", [
    username,
  ]);
  return result.rows.length > 0;
};

const generateUsername = async () => {
  let nextNumber = 1;
  let username;
  do {
    username = `user_${nextNumber.toString().padStart(4, "0")}`;
    nextNumber++;
  } while (await checkUsernameExists(username));
  return username;
};

const getOrganizationIdByName = async (organization_name) => {
  if (!organization_name) return null;
  const trimmedOrgName = organization_name.trim();
  console.log(
    `getOrganizationIdByName: Input organization_name: '${organization_name}', trimmed: '${trimmedOrgName}', length: ${trimmedOrgName.length}, hex: ${Buffer.from(trimmedOrgName).toString("hex")}`
  );
  const result = await pool.query(
    "SELECT organization_id, organization_name FROM organizations WHERE organization_name = $1",
    [trimmedOrgName]
  );
  if (result.rows.length === 0) {
    console.log(`No organization found for name: '${trimmedOrgName}'`);
    const allOrgs = await pool.query(
      "SELECT organization_name FROM organizations"
    );
    console.log(
      `Available organizations: ${JSON.stringify(allOrgs.rows.map((row) => row.organization_name))}`
    );
    throw new Error("Organization not found");
  }
  console.log(`Found organization: ${JSON.stringify(result.rows[0])}`);
  return result.rows[0].organization_id;
};

const getRoleIdByName = async (role_name) => {
  const result = await pool.query("SELECT role_id FROM roles WHERE role = $1", [
    role_name,
  ]);
  if (result.rows.length === 0) {
    throw new Error("Role not found");
  }
  return result.rows[0].role_id;
};

// Helper function to validate password strength
const validatePassword = (password) => {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*?]/.test(password);

  if (!minLength) {
    return {
      isValid: false,
      message: "Password must be at least 8 characters long",
    };
  }
  if (!hasUppercase) {
    return {
      isValid: false,
      message: "Password must contain at least one uppercase letter",
    };
  }
  if (!hasLowercase) {
    return {
      isValid: false,
      message: "Password must contain at least one lowercase letter",
    };
  }
  if (!hasNumber) {
    return {
      isValid: false,
      message: "Password must contain at least one number",
    };
  }
  if (!hasSpecialChar) {
    return {
      isValid: false,
      message:
        "Password must contain at least one special character (!@#$%^&*?)",
    };
  }
  return { isValid: true };
};

const addUser = async (req, res) => {
  let {
    role_name,
    organization_name,
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;

  if (role_name === "orguser") {
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "First name and last name are required for orguser",
      });
    }
  } else {
    if (!email || !first_name || !last_name || !password) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message:
          "Email, first name, last name, and password are required for non-orguser roles",
      });
    }
  }

  // Validate password for non-orguser roles or orguser with custom password
  if (password && !(role_name === "orguser" && !password)) {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: passwordValidation.message,
      });
    }
    if (password === "Tiny@Pass123") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "The password 'Tiny@Pass123' is not allowed for this role",
      });
    }
  }

  try {
    if (username && (await checkUsernameExists(username))) {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Username already exists",
      });
    }

    if (!username) {
      username = await generateUsername();
    }

    if (email) {
      const emailExists = await pool.query(
        "SELECT 1 FROM users WHERE email = $1",
        [email]
      );
      if (emailExists.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: "Email already exists",
        });
      }
    }

    const role_id = await getRoleIdByName(role_name);
    const organization_id = await getOrganizationIdByName(organization_name);

    let hashedPassword;
    let is_default_password = false;
    if (role_name === "orguser" && !password) {
      password = "Tiny@Pass123";
      hashedPassword = await bcrypt.hash(password, 10);
      is_default_password = true;
    } else {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const result = await pool.query(
      "INSERT INTO users (role_id, organization_id, email, username, first_name, last_name, password, is_active, is_default_password, session_token_version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
      [
        role_id,
        organization_id,
        email || null,
        username,
        first_name,
        last_name,
        hashedPassword,
        is_active,
        is_default_password,
        0, // Initial session_token_version
      ]
    );
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "User created successfully",
    });
  } catch (error) {
    if (error.message === "Organization not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Organization not found",
      });
    }
    if (error.message === "Role not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Role not found",
      });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Email or username already exists",
      });
    }
    if (error.code === "P0001") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error creating user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const addSuperadmin = async (req, res) => {
  const {
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Email and password are required for superadmin",
    });
  }
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: passwordValidation.message,
    });
  }
  if (password === "Tiny@Pass123") {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "The password 'Tiny@Pass123' is not allowed for superadmin",
    });
  }
  try {
    const roleResult = await pool.query(
      "SELECT role_id FROM roles WHERE role = $1",
      ["superadmin"]
    );
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Superadmin role not found",
      });
    }
    req.body.role_name = "superadmin";
    req.body.organization_name = null;
    return await addUser(req, res);
  } catch (error) {
    console.error("Error creating superadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const addMentor = async (req, res) => {
  const {
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Email and password are required for mentor",
    });
  }
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: passwordValidation.message,
    });
  }
  if (password === "Tiny@Pass123") {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "The password 'Tiny@Pass123' is not allowed for mentor",
    });
  }
  try {
    const roleResult = await pool.query(
      "SELECT role_id FROM roles WHERE role = $1",
      ["mentor"]
    );
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Mentor role not found",
      });
    }
    req.body.role_name = "mentor";
    req.body.organization_name = null;
    return await addUser(req, res);
  } catch (error) {
    console.error("Error creating mentor:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const addOrgadmin = async (req, res) => {
  const {
    organization_name,
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;
  if (!organization_name || !email || !password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "Organization name, email, and password are required for orgadmin",
    });
  }
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: passwordValidation.message,
    });
  }
  if (password === "Tiny@Pass123") {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "The password 'Tiny@Pass123' is not allowed for orgadmin",
    });
  }
  try {
    const roleResult = await pool.query(
      "SELECT role_id FROM roles WHERE role = $1",
      ["orgadmin"]
    );
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Orgadmin role not found",
      });
    }
    req.body.role_name = "orgadmin";
    return await addUser(req, res);
  } catch (error) {
    console.error("Error creating orgadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const addOrguser = async (req, res) => {
  const {
    organization_name,
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;
  if (!organization_name || !first_name || !last_name) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "Organization name, first name, and last name are required for orguser",
    });
  }
  if (password) {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: passwordValidation.message,
      });
    }
    if (password === "Tiny@Pass123") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message:
          "The password 'Tiny@Pass123' is not allowed as a custom password for orguser",
      });
    }
  }
  try {
    const roleResult = await pool.query(
      "SELECT role_id FROM roles WHERE role = $1",
      ["orguser"]
    );
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Orguser role not found",
      });
    }
    req.body.role_name = "orguser";
    return await addUser(req, res);
  } catch (error) {
    console.error("Error creating orguser:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const updateUser = async (req, res) => {
  const { user_id } = req.params;
  let {
    role_name,
    organization_name,
    email,
    username,
    first_name,
    last_name,
    password,
    is_active,
  } = req.body;

  if (
    !role_name &&
    !organization_name &&
    email === undefined &&
    !username &&
    !first_name &&
    !last_name &&
    !password &&
    is_active === undefined
  ) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "At least one field to update is required",
    });
  }
  if (password) {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: passwordValidation.message,
      });
    }
    if (password === "Tiny@Pass123") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "The password 'Tiny@Pass123' is not allowed",
      });
    }
  }

  try {
    if (username && (await checkUsernameExists(username))) {
      const currentUser = await pool.query(
        "SELECT username FROM users WHERE user_id = $1",
        [user_id]
      );
      if (
        currentUser.rows.length > 0 &&
        currentUser.rows[0].username !== username
      ) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: "Username already exists",
        });
      }
    }

    if (email) {
      const emailExists = await pool.query(
        "SELECT email FROM users WHERE user_id != $1 AND email = $2",
        [user_id, email]
      );
      if (emailExists.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: "Email already exists",
        });
      }
    }

    const role_id = role_name ? await getRoleIdByName(role_name) : null;
    const organization_id = await getOrganizationIdByName(organization_name);
    const fields = [];
    const values = [];
    let index = 1;

    if (role_id) {
      fields.push(`role_id = $${index++}`);
      values.push(role_id);
    }
    if (organization_name !== undefined) {
      fields.push(`organization_id = $${index++}`);
      values.push(organization_id);
    }
    if (email !== undefined) {
      fields.push(`email = $${index++}`);
      values.push(email || null);
    }
    if (username) {
      fields.push(`username = $${index++}`);
      values.push(username);
    }
    if (first_name) {
      fields.push(`first_name = $${index++}`);
      values.push(first_name);
    }
    if (last_name) {
      fields.push(`last_name = $${index++}`);
      values.push(last_name);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push(`password = $${index++}`);
      values.push(hashedPassword);
      fields.push(`is_default_password = $${index++}`);
      values.push(false);
      fields.push(`session_token_version = session_token_version + 1`);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(is_active);
    }

    values.push(user_id);
    const query = `UPDATE users SET ${fields.join(", ")} WHERE user_id = $${index} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "User updated successfully",
    });
  } catch (error) {
    if (error.message === "Organization not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Organization not found",
      });
    }
    if (error.message === "Role not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Role not found",
      });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Email or username already exists",
      });
    }
    if (error.code === "P0001") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error updating user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.user_id; // From authMiddleware

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Current password and new password are required",
    });
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: passwordValidation.message,
    });
  }
  if (newPassword === "Tiny@Pass123") {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "The password 'Tiny@Pass123' is not allowed",
    });
  }

  try {
    // Fetch user to verify current password
    const userResult = await pool.query(
      "SELECT password, role_id, is_default_password, session_token_version FROM users WHERE user_id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User not found",
      });
    }

    const user = userResult.rows[0];
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Current password is incorrect",
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password, is_default_password, and increment session_token_version
    const updateResult = await pool.query(
      "UPDATE users SET password = $1, is_default_password = $2, session_token_version = session_token_version + 1 WHERE user_id = $3 RETURNING user_id, email, username",
      [hashedNewPassword, false, userId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User not found",
      });
    }

    console.log(
      `[${new Date().toISOString()}] Password changed for user_id: ${userId}, email: ${updateResult.rows[0].email}`
    );
    return res.status(200).json({
      success: true,
      data: {
        user_id: updateResult.rows[0].user_id,
        email: updateResult.rows[0].email,
        username: updateResult.rows[0].username,
      },
      message: "Password changed successfully. Please log in again.",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};
// Maximum login attempts and lockout duration
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_DURATION_MINUTES = 10;

const loginUser = async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Identifier (email or username) and password are required",
    });
  }

  try {
    // Check for lockout or failed attempts
    let failedAttempts = 0;
    const userCheck = await pool.query(
      "SELECT user_id, failed_login_attempts, lockout_until FROM users WHERE email = $1 OR username = $1",
      [identifier]
    );

    if (userCheck.rows.length > 0) {
      const { user_id, failed_login_attempts, lockout_until } =
        userCheck.rows[0];
      failedAttempts = failed_login_attempts;

      if (lockout_until && new Date(lockout_until) > new Date()) {
        const minutesLeft = Math.ceil(
          (new Date(lockout_until) - new Date()) / 60000
        );
        return res.status(429).json({
          success: false,
          error: "Too many requests",
          message: `Account is locked. Try again in ${minutesLeft} minute(s).`,
        });
      } else if (lockout_until && new Date(lockout_until) <= new Date()) {
        // Lockout expired, reset attempts and lockout
        await pool.query(
          "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE user_id = $1",
          [user_id]
        );
        failedAttempts = 0;
      }
    }

    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, o.is_active AS org_is_active, u.email, u.username, u.password, u.is_active, u.is_default_password, u.failed_login_attempts, u.session_token_version " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE u.email = $1 OR u.username = $1",
      [identifier]
    );

    if (result.rows.length === 0) {
      // Simulate attempt tracking for non-existent users to prevent enumeration
      const remainingAttempts = MAX_LOGIN_ATTEMPTS - (failedAttempts + 1);
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: `Invalid credentials. ${remainingAttempts} attempt(s) remaining.`,
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Account is inactive",
      });
    }

    if (user.organization_id !== null && !user.org_is_active) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Organization is inactive",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      // Increment failed attempts
      const newAttempts = user.failed_login_attempts + 1;
      let lockoutUntil = null;

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        lockoutUntil = new Date(
          Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000
        );
        await pool.query(
          "UPDATE users SET failed_login_attempts = $1, lockout_until = $2 WHERE user_id = $3",
          [newAttempts, lockoutUntil, user.user_id]
        );
        return res.status(429).json({
          success: false,
          error: "Too many requests",
          message: `Account is locked due to too many failed attempts. Try again in ${LOCKOUT_DURATION_MINUTES} minute(s).`,
        });
      }

      await pool.query(
        "UPDATE users SET failed_login_attempts = $1 WHERE user_id = $2",
        [newAttempts, user.user_id]
      );

      const remainingAttempts = MAX_LOGIN_ATTEMPTS - newAttempts;
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: `Invalid Password. ${remainingAttempts} attempt(s) remaining.`,
      });
    }

    // Reset failed attempts and lockout, increment session_token_version
    await pool.query(
      "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, session_token_version = session_token_version + 1 WHERE user_id = $1",
      [user.user_id]
    );

    // Fetch updated session_token_version
    const updatedUser = await pool.query(
      "SELECT session_token_version FROM users WHERE user_id = $1",
      [user.user_id]
    );
    const sessionTokenVersion = updatedUser.rows[0].session_token_version;

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
        email: user.email,
        username: user.username,
        session_token_version: sessionTokenVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: "4h" }
    );

    res.json({
      success: true,
      data: {
        user_id: user.user_id,
        role: user.role,
        organization_name: user.organization_name,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        is_active: user.is_active,
        is_default_password:
          user.role === "orguser" ? user.is_default_password : false,
        token,
      },
      message: "Login successful",
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};
const logoutUser = async (req, res) => {
  const userId = req.user.user_id; // From authMiddleware

  try {
    // Increment session_token_version to invalidate current token
    await pool.query(
      "UPDATE users SET session_token_version = session_token_version + 1 WHERE user_id = $1",
      [userId]
    );

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Error logging out user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const verifyUser = async (req, res) => {
  try {
    const user = req.user; // From authMiddleware
    const result = await pool.query(
      "SELECT u.user_id, r.role, u.email, u.username, u.is_active, u.session_token_version " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "WHERE u.user_id = $1",
      [user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User not found",
      });
    }

    const dbUser = result.rows[0];
    if (dbUser.session_token_version !== user.session_token_version) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Session token is invalid or has been expired",
      });
    }

    res.json({
      success: true,
      data: {
        user_id: dbUser.user_id,
        role: dbUser.role,
        email: dbUser.email,
        username: dbUser.username,
        is_active: dbUser.is_active,
      },
      message: "User verified successfully",
    });
  } catch (error) {
    console.error("Error verifying user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "ORDER BY u.user_id"
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Users fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUserById = async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE u.user_id = $1",
      [user_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User not found",
      });
    }
    res.json({
      success: true,
      data: result.rows[0],
      message: "User fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUserByEmailOrUsername = async (req, res) => {
  const { identifier } = req.params;
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE u.email = $1 OR u.username = $1",
      [identifier]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User not found",
      });
    }
    res.json({
      success: true,
      data: result.rows[0],
      message: "User fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUsersByRole = async (req, res) => {
  const { role_name } = req.params;
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE r.role = $1 " +
        "ORDER BY u.user_id",
      [role_name]
    );
    res.json({
      success: true,
      data: result.rows,
      message: `Users with role ${role_name} fetched successfully`,
    });
  } catch (error) {
    console.error("Error fetching users by role:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUsersByOrganization = async (req, res) => {
  const { organization_name } = req.params;
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE o.organization_name = $1 AND r.role IN ('orgadmin', 'orguser') " +
        "ORDER BY u.user_id",
      [organization_name]
    );
    res.json({
      success: true,
      data: result.rows,
      message: `Users in organization ${organization_name} fetched successfully`,
    });
  } catch (error) {
    console.error("Error fetching users by organization:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  addUser,
  addSuperadmin,
  addMentor,
  addOrgadmin,
  addOrguser,
  updateUser,
  loginUser,
  logoutUser,
  verifyUser,
  getAllUsers,
  getUserById,
  getUserByEmailOrUsername,
  getUsersByRole,
  getUsersByOrganization,
  changePassword,
};
