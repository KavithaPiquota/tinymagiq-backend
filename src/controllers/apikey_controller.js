const { pool } = require("../config/database");

exports.getApiKey = async (req, res) => {
  try {
    const result = await pool.query("SELECT api_key FROM keys WHERE id = $1", [
      1,
    ]);
    if (result.rows.length > 0) {
      res.status(200).json({ apiKey: result.rows[0].api_key });
    } else {
      res.status(404).json({ message: "API Key not found" });
    }
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
