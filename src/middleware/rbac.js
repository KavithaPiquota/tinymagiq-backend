const restrictTo = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      console.log(
        `[${new Date().toISOString()}] Access denied for ${req.user.user_id} (role: ${req.user.role}) on ${req.method} ${req.url}`
      );
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: `Access denied: ${req.user.role} role not allowed`,
      });
    }

    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url} by ${req.user.email} (role: ${req.user.role})`
    );
    next();
  };
};

module.exports = { restrictTo };
