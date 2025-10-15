const cors = require("cors");

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "https://nextgenlearn.magiqspark.ai",
      "https://tinymagiq.yoweb.fun",
      "https://tinymagiq-backend-f1tn.onrender.com",
      "http://localhost:3000",
      "http://localhost:3001",
      "127.0.0.1", // Allow Nginx internal connection
      "127.0.0.1:5000", // Allow Nginx internal connection with port
      "localhost", // Allow Nginx internal connection without port
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(
        null,
        origin ||
          "https://nextgenlearn.magiqspark.ai" ||
          "https://tinymagiq.yoweb.fun" ||
          "https://tinymagiq-backend-f1tn.onrender.com"
      );
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
