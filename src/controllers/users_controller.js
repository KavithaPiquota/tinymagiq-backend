const crypto = require("crypto");
const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const IV_LENGTH = 12; // For GCM
const ALGORITHM = "aes-256-gcm";

const encryptToken = (token) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(process.env.JWT_ENCRYPTION_KEY, "base64");
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
};

/* ============================
   Microsoft Graph mail helpers
   ============================ */

// Read either MS_* or your OFFICE365MAIL_*/MAIL_FROM_ADDRESS names (no other changes)
const TENANT_ID = process.env.MS_TENANT_ID || process.env.OFFICE365MAIL_TENANT;
const CLIENT_ID =
  process.env.MS_CLIENT_ID || process.env.OFFICE365MAIL_CLIENT_ID;
const CLIENT_SECRET =
  process.env.MS_CLIENT_SECRET || process.env.OFFICE365MAIL_CLIENT_SECRET;
const SENDER = process.env.MS_SENDER || process.env.MAIL_FROM_ADDRESS;

// Uses Node 18+ native fetch. If you're on older Node, install node-fetch and require it.
const tokenEndpoint = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

async function getGraphAccessToken() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const resp = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `Graph token error: ${resp.status} ${
        data.error_description || JSON.stringify(data)
      }`
    );
  }
  return data.access_token;
}

async function sendMailViaGraph({ to, subject, html, text }) {
  const accessToken = await getGraphAccessToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    SENDER
  )}/sendMail`;

  const body = {
    message: {
      subject,
      body: {
        contentType: html ? "HTML" : "Text",
        content: html || text || "",
      },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: "false",
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Graph sendMail failed: ${resp.status} ${errText}`);
  }
}

/* ============ end Graph helpers ============ */

const generateHashKey = (inputString) => {
  return crypto
    .createHash("md5")
    .update(String(inputString).trim().toLowerCase())
    .digest("hex");
};

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
  const result = await pool.query(
    "SELECT organization_id, organization_name FROM organizations WHERE organization_name = $1",
    [trimmedOrgName]
  );
  if (result.rows.length === 0) {
    const allOrgs = await pool.query(
      "SELECT organization_name FROM organizations"
    );
    console.log(
      `No organization found for '${trimmedOrgName}'. Available: ${JSON.stringify(
        allOrgs.rows.map((row) => row.organization_name)
      )}`
    );
    throw new Error("Organization not found");
  }
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

  if (!minLength)
    return {
      isValid: false,
      message: "Password must be at least 8 characters long",
    };
  if (!hasUppercase)
    return {
      isValid: false,
      message: "Password must contain at least one uppercase letter",
    };
  if (!hasLowercase)
    return {
      isValid: false,
      message: "Password must contain at least one lowercase letter",
    };
  if (!hasNumber)
    return {
      isValid: false,
      message: "Password must contain at least one number",
    };
  if (!hasSpecialChar)
    return {
      isValid: false,
      message:
        "Password must contain at least one special character (!@#$%^&*?)",
    };
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
      const email_hash = generateHashKey(email);
      const emailExists = await pool.query(
        "SELECT 1 FROM users WHERE email_hash = $1",
        [email_hash]
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
      "INSERT INTO users (role_id, organization_id, email, username, first_name, last_name, password, is_active, is_default_password, session_token_version, email_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *",
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
        email ? generateHashKey(email) : null,
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
      return res
        .status(400)
        .json({ success: false, error: "Bad request", message: error.message });
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
      const email_hash = generateHashKey(email);
      const emailExists = await pool.query(
        "SELECT email_hash FROM users WHERE user_id != $1 AND email_hash = $2",
        [user_id, email_hash]
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
      fields.push(`email_hash = $${index++}`);
      values.push(email ? generateHashKey(email) : null);
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
    const query = `UPDATE users SET ${fields.join(
      ", "
    )} WHERE user_id = $${index} RETURNING *`;
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
      return res
        .status(400)
        .json({ success: false, error: "Bad request", message: error.message });
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

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    const updateResult = await pool.query(
      "UPDATE users SET password = $1, is_default_password = $2, session_token_version = session_token_version + 1 WHERE user_id = $3 RETURNING user_id, email_hash, username",
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
      `[${new Date().toISOString()}] Password changed for user_id: ${userId}`
    );
    return res.status(200).json({
      success: true,
      data: {
        user_id: updateResult.rows[0].user_id,
        email_hash: updateResult.rows[0].email_hash,
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
//  const backfillEmailHash = async () => {
//    const users = await pool.query('SELECT user_id, email FROM users WHERE email_hash IS NULL OR email_hash = \'\'');

//    for (const user of users.rows) {
//      if (!user.email) continue;
//      const hash = crypto.createHash('md5').update(user.email.trim().toLowerCase()).digest('hex');
//      await pool.query('UPDATE users SET email_hash = $1 WHERE user_id = $2', [hash, user.user_id]);
//      console.log(`Updated user_id ${user.user_id} with hash ${hash}`);
//    }
//    console.log('✅ Backfill completed');
//  }

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
    const identifierHash = generateHashKey(identifier);

    // Pre-check lockout
    let failedAttempts = 0;
    const userCheck = await pool.query(
      "SELECT user_id, failed_login_attempts, lockout_until FROM users WHERE email_hash = $1 OR username = $2",
      [identifierHash, identifier]
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
        await pool.query(
          "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE user_id = $1",
          [user_id]
        );
        failedAttempts = 0;
      }
    }

    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, " +
        "o.is_active AS org_is_active, u.email_hash, u.username, u.password, u.is_active, " +
        "u.is_default_password, u.failed_login_attempts, u.session_token_version, u.first_name, u.last_name " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE u.email_hash = $1 OR u.username = $2",
      [identifierHash, identifier]
    );

    if (result.rows.length === 0) {
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

    await pool.query(
      "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, session_token_version = session_token_version + 1 WHERE user_id = $1",
      [user.user_id]
    );

    const updatedUser = await pool.query(
      "SELECT session_token_version FROM users WHERE user_id = $1",
      [user.user_id]
    );
    const sessionTokenVersion = updatedUser.rows[0].session_token_version;

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
        email_hash: user.email_hash,
        username: user.username,
        session_token_version: sessionTokenVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: "4h" }
    );

    const encryptedToken = encryptToken(token); // encryptToken function

    return res.json({
      success: true,
      data: {
        user_id: user.user_id,
        role: user.role,
        organization_name: user.organization_name,
        email_hash: user.email_hash,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        is_active: user.is_active,
        is_default_password:
          user.role === "orguser" ? user.is_default_password : false,
        encrypted_token: encryptedToken, // Changed from 'token' to 'encrypted_token'
      },
      message: "Login successful",
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const logoutUser = async (req, res) => {
  const userId = req.user.user_id; // From authMiddleware
  try {
    await pool.query(
      "UPDATE users SET session_token_version = session_token_version + 1 WHERE user_id = $1",
      [userId]
    );
    res.status(200).json({ success: true, message: "Logged out successfully" });
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
      "SELECT u.user_id, r.role, u.email_hash, u.username, u.first_name, u.is_active, u.session_token_version " +
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
        email_hash: dbUser.email_hash,
        username: dbUser.username,
        first_name: dbUser.first_name,
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
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email_hash, u.username, u.first_name, u.last_name, u.is_active " +
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
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email_hash, u.username, u.first_name, u.last_name, u.is_active " +
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
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email_hash, u.username, u.first_name, u.last_name, u.is_active " +
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
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email_hash, u.username, u.first_name, u.last_name, u.is_active " +
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
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email_hash, u.username, u.first_name, u.last_name, u.is_active " +
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

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email is required" });
  }

  try {
    const email_hash = generateHashKey(email);
    const result = await pool.query(
      "SELECT user_id FROM users WHERE email_hash = $1",
      [email_hash]
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // CHANGED: update by email_hash (not raw email)
    await pool.query(
      "UPDATE users SET reset_otp = $1, reset_otp_expiry = $2 WHERE email_hash = $3",
      [otp, expiry, email_hash]
    );

    // CHANGED: Send via Microsoft Graph (removed SendGrid)
    const subject = "Password Reset OTP";
    const html = `<p>Your OTP is <strong>${otp}</strong>. It will expire in 5 minutes.</p>`;
    await sendMailViaGraph({
      to: email,
      subject,
      html,
      text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
    });

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    console.error("Error in forgotPassword:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res
      .status(400)
      .json({ success: false, message: "Email and OTP are required" });
  }

  try {
    const result = await pool.query(
      "SELECT reset_otp, reset_otp_expiry FROM users WHERE email_hash = $1",
      [generateHashKey(email)]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const user = result.rows[0];
    if (
      user.reset_otp !== otp ||
      new Date(user.reset_otp_expiry) < new Date()
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("Error in verifyOtp:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Email, OTP and new password are required",
    });
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    return res
      .status(400)
      .json({ success: false, message: passwordValidation.message });
  }

  try {
    // CHANGED: select by email_hash (not raw email)
    const result = await pool.query(
      "SELECT reset_otp, reset_otp_expiry FROM users WHERE email_hash = $1",
      [generateHashKey(email)]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const user = result.rows[0];
    if (
      user.reset_otp !== otp ||
      new Date(user.reset_otp_expiry) < new Date()
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password = $1, reset_otp = NULL, reset_otp_expiry = NULL, session_token_version = session_token_version + 1 WHERE email_hash = $2",
      [hashedPassword, generateHashKey(email)]
    );

    res.json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    console.error("Error in resetPassword:", err);
    res.status(500).json({ success: false, message: err.message });
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
  //backfillEmailHash,
  logoutUser,
  verifyUser,
  getAllUsers,
  getUserById,
  getUserByEmailOrUsername,
  getUsersByRole,
  getUsersByOrganization,
  changePassword,
  forgotPassword,
  verifyOtp,
  resetPassword,
};
