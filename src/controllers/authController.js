const { pool } = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Controller for user login
const login = async (req, res) => {
  const { username, email, password } = req.body;

  // Input validation
  if (!password || (!username && !email)) {
    return res
      .status(400)
      .json({ error: "Password and either username or email are required" });
  }

  // Validate email format if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
  }

  try {
    // Fetch user by username or email
    const userQuery = await pool.query(
      `SELECT u.user_id, u.email, u.username, u.password_hash, u.first_name, u.last_name, u.organization_id, u.is_active, r.name AS role_name
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE u.email = $1 OR u.username = $2`,
      [email || "", username || ""]
    );

    if (userQuery.rows.length === 0) {
      return res
        .status(401)
        .json({ error: "Invalid username/email or password" });
    }

    const user = userQuery.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ error: "Account is inactive" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ error: "Invalid username/email or password" });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role_name: user.role_name,
        organization_id: user.organization_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" } // Token expires in 1 hour
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role_name: user.role_name,
        organization_id: user.organization_id,
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { login };
