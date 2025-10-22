require("dotenv").config();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../config/database");

const IV_LENGTH = 12;
const ALGORITHM = "aes-256-gcm";

const decryptToken = (encryptedToken) => {
  try {
    if (!process.env.JWT_ENCRYPTION_KEY) {
      console.error("JWT_ENCRYPTION_KEY is missing!");
      return null;
    }
    const key = Buffer.from(process.env.JWT_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) {
      console.error("Invalid JWT_ENCRYPTION_KEY length");
      return null;
    }
    const data = Buffer.from(encryptedToken, "base64");
    const iv = data.slice(0, IV_LENGTH);
    const authTag = data.slice(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = data.slice(IV_LENGTH + 16);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error.message);
    return null;
  }
};

const authMiddleware = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "No token provided",
    });
  }

  const encryptedToken = authHeader.replace("Bearer ", "");
  if (!encryptedToken) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid token format",
    });
  }

  const token = decryptToken(encryptedToken);
  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid or tampered token (decryption failed)",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check session_token_version against DB
    const result = await pool.query(
      "SELECT session_token_version, is_active FROM users WHERE user_id = $1",
      [decoded.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "User not found",
      });
    }

    const dbUser = result.rows[0];
    if (!dbUser.is_active) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Account is inactive",
      });
    }

    if (dbUser.session_token_version !== decoded.session_token_version) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Invalid or expired session (logged out or revoked)",
      });
    }

    req.user = {
      ...decoded,
      session_token_version: dbUser.session_token_version,
    };
    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Token has expired",
      });
    }
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid token",
    });
  }
};

module.exports = authMiddleware;