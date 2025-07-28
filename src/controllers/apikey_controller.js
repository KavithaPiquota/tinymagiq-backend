const { pool } = require("../config/database");
const crypto = require("crypto");

const algorithm = "aes-256-gcm";
const secretKey = Buffer.from(process.env.API_KEY_SECRET, "hex");

exports.getApiKey = async (req, res) => {
  try {
    const result = await pool.query("SELECT api_key FROM keys WHERE id = $1", [
      1,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "API Key not found" });
    }

    const apiKey = result.rows[0].api_key;
    const iv = crypto.randomBytes(12); // 12 bytes for GCM
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);

    let encrypted = cipher.update(apiKey, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    res.status(200).json({
      encryptedApiKey: encrypted,
      iv: iv.toString("hex"),
      authTag: authTag,
    });
  } catch (error) {
    console.error("Error fetching API Key:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.updateApiKey = async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ message: "API Key is required" });
  }

  try {
    const result = await pool.query(
      "UPDATE keys SET api_key = $1 WHERE id = $2 RETURNING *",
      [apiKey, 1]
    );

    if (result.rowCount > 0) {
      res.status(200).json({
        message: "API Key updated successfully",
        data: result.rows[0],
      });
    } else {
      res.status(404).json({ message: "API Key not found" });
    }
  } catch (error) {
    console.error("Error updating API Key:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
