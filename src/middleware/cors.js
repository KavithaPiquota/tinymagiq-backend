const cors = require("cors");

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "https://nextgenlearn.magiqspark.ai",
      "http://localhost:3000",
      "http://localhost:3001",
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin || "https://nextgenlearn.magiqspark.ai");
    } else {
      callback(new Error(`CORS error: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 204,
  maxAge: 86400, // Cache preflight for 24 hours
};

module.exports = cors(corsOptions);
