const crypto = require("crypto");

// Generate a 64-character random string
const jwtSecret = crypto.randomBytes(32).toString("hex");
console.log("JWT_SECRET:", jwtSecret);
