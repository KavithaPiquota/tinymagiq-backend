const { pool } = require("../config/database");

// Utility to sanitize input by removing invalid control characters
const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;
  // Remove invalid control characters except \n, \r, \t
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
};

// Utility to validate JSON string
const isValidJsonString = (str) => {
  if (typeof str !== "string") return true; // Non-string inputs are not validated as JSON
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    console.error("Invalid JSON:", e.message);
    return false;
  }
};

const addPrompt = async (req, res) => {
  let { prompt_type, user_content, json_content, additional_content } =
    req.body;

  // Log raw request body for debugging
  console.log("Raw request body:", JSON.stringify(req.body, null, 2));
  console.log(
    "addPrompt: prompt_type:",
    prompt_type,
    "user_content:",
    user_content,
    "json_content:",
    json_content,
    "additional_content:",
    additional_content
  );

  try {
    // Sanitize inputs
    prompt_type = sanitizeInput(prompt_type);
    user_content = sanitizeInput(user_content);
    json_content = sanitizeInput(json_content);
    additional_content = sanitizeInput(additional_content);

    // Validate input
    if (!prompt_type || !user_content || !json_content) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "prompt_type, user_content, and json_content are required",
      });
    }

    // Validate json_content as JSON string
    if (!isValidJsonString(json_content)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "json_content must be a valid JSON string",
      });
    }

    // Check if a non-archived prompt with the same prompt_type exists
    const existingPrompt = await pool.query(
      "SELECT id FROM prompts WHERE prompt_type = $1 AND isArchived = FALSE",
      [prompt_type]
    );

    if (existingPrompt.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `A non-archived prompt with prompt_type '${prompt_type}' already exists`,
      });
    }

    // Insert new prompt with version 1
    const result = await pool.query(
      `INSERT INTO prompts (prompt_type, user_content, json_content, additional_content, version, isArchived)
       VALUES ($1, $2, $3, $4, 1, FALSE)
       RETURNING id, prompt_type, user_content, json_content, additional_content, version, isArchived, created_at, updated_at`,
      [prompt_type, user_content, json_content, additional_content]
    );

    const prompt = result.rows[0];
    const prompt_content = `${prompt.user_content} ${prompt.json_content} ${prompt.additional_content || ""}`;
    console.log("addPrompt: prompt_content length:", prompt_content.length);
    res.status(201).json({
      success: true,
      data: {
        ...prompt,
        prompt_content,
      },
      message: "Prompt added successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `A non-archived prompt with prompt_type '${prompt_type}' already exists`,
      });
    }
    console.error("Error adding prompt:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const updatePrompt = async (req, res) => {
  const { id } = req.params;
  let { user_content, json_content, additional_content } = req.body;

  // Log raw request body for debugging
  console.log("Raw request body:", JSON.stringify(req.body, null, 2));
  console.log(
    "updatePrompt: user_content:",
    user_content,
    "json_content:",
    json_content,
    "additional_content:",
    additional_content
  );

  try {
    // Sanitize inputs
    user_content = sanitizeInput(user_content);
    json_content = sanitizeInput(json_content);
    additional_content = sanitizeInput(additional_content);

    // Validate input
    if (!user_content) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "user_content is required",
      });
    }

    // Validate json_content as JSON string if provided
    if (json_content !== undefined && !isValidJsonString(json_content)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "json_content must be a valid JSON string",
      });
    }

    // Start a transaction
    await pool.query("BEGIN");

    // Get the existing prompt
    const existingPrompt = await pool.query(
      "SELECT id, prompt_type, version, json_content, additional_content FROM prompts WHERE id = $1 AND isArchived = FALSE",
      [id]
    );

    if (existingPrompt.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: `No non-archived prompt found with id ${id}`,
      });
    }

    const {
      prompt_type,
      version,
      json_content: existing_json_content,
      additional_content: existing_additional_content,
    } = existingPrompt.rows[0];

    // Archive the existing prompt
    await pool.query(
      "UPDATE prompts SET isArchived = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );

    // Use provided json_content or fall back to existing json_content
    const new_json_content =
      json_content !== undefined ? json_content : existing_json_content;
    // Use provided additional_content or fall back to existing additional_content
    const new_additional_content =
      additional_content !== undefined
        ? additional_content
        : existing_additional_content;

    // Insert new prompt with incremented version
    const result = await pool.query(
      `INSERT INTO prompts (prompt_type, user_content, json_content, additional_content, version, isArchived)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING id, prompt_type, user_content, json_content, additional_content, version, isArchived, created_at, updated_at`,
      [
        prompt_type,
        user_content,
        new_json_content,
        new_additional_content,
        version + 1,
      ]
    );

    await pool.query("COMMIT");

    const prompt = result.rows[0];
    const prompt_content = `${prompt.user_content} ${prompt.json_content} ${prompt.additional_content || ""}`;
    console.log("updatePrompt: prompt_content length:", prompt_content.length);
    res.json({
      success: true,
      data: {
        ...prompt,
        prompt_content,
      },
      message: "Prompt updated successfully",
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `A non-archived prompt with prompt_type '${prompt_type}' already exists`,
      });
    }
    console.error("Error updating prompt:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getPrompts = async (req, res) => {
  const { scope } = req.query; // 'archived' or 'all', default is non-archived

  try {
    let query = `
      SELECT id, prompt_type, version, isArchived, created_at, updated_at,
             (user_content || ' ' || json_content || ' ' || COALESCE(additional_content, '')) AS prompt_content
    `;
    const values = [];
    let condition = "";

    if (scope === "archived" || scope === "all") {
      query = `
        SELECT id, prompt_type, user_content, json_content, additional_content, version, isArchived, created_at, updated_at,
               (user_content || ' ' || json_content || ' ' || COALESCE(additional_content, '')) AS prompt_content
      `;
    }

    query += " FROM prompts";

    if (scope === "archived") {
      condition = "WHERE isArchived = TRUE";
    } else if (scope !== "all") {
      condition = "WHERE isArchived = FALSE";
    }

    query += ` ${condition} ORDER BY updated_at DESC`;

    console.log("Executing query:", query, "with values:", values);
    const result = await pool.query(query, values);
    const prompts = result.rows;

    // Log prompt_content length for each prompt
    prompts.forEach((prompt, index) => {
      console.log(
        `getPrompts: prompt[${index}] prompt_content length:`,
        prompt.prompt_content.length
      );
    });

    res.json({
      success: true,
      data: prompts,
      message:
        prompts.length > 0
          ? "Prompts fetched successfully"
          : "No prompts found",
    });
  } catch (error) {
    console.error("Error fetching prompts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  addPrompt,
  updatePrompt,
  getPrompts,
};
