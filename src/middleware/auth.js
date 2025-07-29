const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "No token provided",
    });
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid token format",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attaches user_id, role, email, username
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
