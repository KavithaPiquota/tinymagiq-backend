const { pool } = require("../config/database");
const crypto = require("crypto");
const axios = require("axios");
 
const algorithm = "aes-256-gcm";
const secretKey = Buffer.from(process.env.API_KEY_SECRET, "hex");
 
// Helper function to decrypt API key
const decryptApiKey = (encryptedApiKey, iv, authTag) => {
  try {
    const decipher = crypto.createDecipheriv(
      algorithm,
      secretKey,
      Buffer.from(iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(authTag, "hex"));
    let decrypted = decipher.update(encryptedApiKey, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", {
      message: error.message,
      stack: error.stack,
      encryptedApiKey,
      iv,
      authTag,
    });
    throw new Error("Failed to decrypt API key");
  }
};
 
// Get API Key
exports.getApiKey = async (req, res) => {
  try {
    const result = await pool.query("SELECT api_key, iv, auth_tag FROM keys WHERE id = $1", [1]);
    if (result.rows.length === 0) {
      console.error("No API key found in database for id=1");
      return res.status(404).json({ message: "API Key not found" });
    }
 
    const { api_key: encryptedApiKey, iv, auth_tag } = result.rows[0];
    res.status(200).json({
      encryptedApiKey,
      iv,
      authTag: auth_tag,
    });
  } catch (error) {
    console.error("Error fetching API Key:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Internal server error" });
  }
};
 
// Update API Key
exports.updateApiKey = async (req, res) => {
  const { apiKey } = req.body;
 
  if (!apiKey) {
    return res.status(400).json({ message: "API Key is required" });
  }
 
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(apiKey, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
 
    const result = await pool.query(
      "UPDATE keys SET api_key = $1, iv = $2, auth_tag = $3 WHERE id = $4 RETURNING *",
      [encrypted, iv.toString("hex"), authTag, 1]
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
    console.error("Error updating API Key:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Internal server error" });
  }
};
 
// Call LLM
exports.callLLM = async (req, res) => {
  try {
    const { messages, selectedModel, selectedPrompt, username, selectedConcept, organizationId, batchId } = req.body;
 
    // Validate inputs
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error("Invalid input: messages array is missing or empty", { body: req.body });
      return res.status(400).json({ message: "Messages array is required" });
    }
    if (!selectedModel || typeof selectedModel !== "string") {
      console.error("Invalid input: selectedModel is missing or invalid", { selectedModel });
      return res.status(400).json({ message: "Valid selectedModel is required" });
    }
 
    // Log request details for debugging
    console.log("Processing LLM request:", {
      username,
      selectedModel,
      selectedPrompt,
      messagesLength: messages.length,
      organizationId,
      batchId,
    });
 
    // Fetch API key
    const result = await pool.query("SELECT api_key, iv, auth_tag FROM keys WHERE id = $1", [1]);
    if (result.rows.length === 0) {
      console.error("No API key found in database for id=1");
      return res.status(404).json({ message: "API Key not found" });
    }
 
    const { api_key: encryptedApiKey, iv, auth_tag } = result.rows[0];
    if (!encryptedApiKey || !iv || !auth_tag) {
      console.error("Incomplete API key data in database", { encryptedApiKey, iv, auth_tag });
      return res.status(500).json({ message: "Incomplete API key data in database" });
    }
 
    // Decrypt API key
    const decryptedApiKey = decryptApiKey(encryptedApiKey, iv, auth_tag);
 
    // Make OpenAI API call
    const llmResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: selectedModel || "gpt-4o",
        messages,
        temperature: 0.7,
        max_tokens: 4000,
        top_p: 1,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${decryptedApiKey}`,
        },
      }
    );
 
    const responseText = llmResponse.data?.choices?.[0]?.message?.content;
    if (!responseText) {
      console.error("No response content from OpenAI API", { llmResponse: llmResponse.data });
      return res.status(500).json({ message: "No response content from OpenAI API" });
    }
 
    // Log successful response
    console.log("OpenAI API response received:", {
      responseLength: responseText.length,
      currentStage: 0,
    });
 
    res.status(200).json({
      apiResponseText: responseText,
      currentStage: 0,
      interactionCompleted: false,
      endRequested: false,
      readyForNextStage: false,
      pauseRequested: false,
    });
  } catch (error) {
    console.error("Error in callLLM:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
      } : null,
    });
    res.status(500).json({ message: "Failed to process LLM request", error: error.message });
  }
};
 
module.exports = exports;