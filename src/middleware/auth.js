const jwt = require("jsonwebtoken");
const crypto = require("crypto"); // Add this

const IV_LENGTH = 12; // For GCM
const ALGORITHM = "aes-256-gcm";

const decryptToken = (encryptedToken) => {
  try {
    const key = Buffer.from(process.env.JWT_ENCRYPTION_KEY, "base64");
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

const authMiddleware = (req, res, next) => {
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

  const token = decryptToken(encryptedToken); // Add decryption
  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid or tampered token (decryption failed)",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attaches user_id, role, email_hash, username, session_token_version
    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
  }
};

module.exports = authMiddleware;
