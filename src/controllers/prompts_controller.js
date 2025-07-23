const { pool } = require("../config/database");

const addPrompt = async (req, res) => {
  const { prompt_type, user_content, llm_content } = req.body;

  try {
    // Validate input
    if (!prompt_type || !user_content || !llm_content) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "prompt_type, user_content, and llm_content are required",
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
      `INSERT INTO prompts (prompt_type, user_content, llm_content, version, isArchived)
       VALUES ($1, $2, $3, 1, FALSE)
       RETURNING id, prompt_type, user_content, llm_content, version, isArchived, created_at, updated_at`,
      [prompt_type, user_content, llm_content]
    );

    const prompt = result.rows[0];
    res.status(201).json({
      success: true,
      data: {
        ...prompt,
        prompt_content: `${prompt.user_content} ${prompt.llm_content}`,
      },
      message: "Prompt added successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      // Unique constraint violation
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
  const { user_content, llm_content } = req.body;

  try {
    // Validate input
    if (!user_content) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "user_content is required",
      });
    }

    // Start a transaction
    await pool.query("BEGIN");

    // Get the existing prompt
    const existingPrompt = await pool.query(
      "SELECT id, prompt_type, version, llm_content FROM prompts WHERE id = $1 AND isArchived = FALSE",
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
      llm_content: existing_llm_content,
    } = existingPrompt.rows[0];

    // Archive the existing prompt
    await pool.query(
      "UPDATE prompts SET isArchived = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );

    // Use provided llm_content or fall back to existing llm_content
    const new_llm_content =
      llm_content !== undefined ? llm_content : existing_llm_content;

    // Insert new prompt with incremented version
    const result = await pool.query(
      `INSERT INTO prompts (prompt_type, user_content, llm_content, version, isArchived)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id, prompt_type, user_content, llm_content, version, isArchived, created_at, updated_at`,
      [prompt_type, user_content, new_llm_content, version + 1]
    );

    await pool.query("COMMIT");

    const prompt = result.rows[0];
    res.json({
      success: true,
      data: {
        ...prompt,
        prompt_content: `${prompt.user_content} ${prompt.llm_content}`,
      },
      message: "Prompt updated successfully",
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `A non-archived prompt with prompt_type '${req.body.prompt_type}' already exists`,
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
      SELECT id, prompt_type, user_content, llm_content, version, isArchived, created_at, updated_at,
             (user_content || ' ' || llm_content) AS prompt_content
      FROM prompts
    `;
    const values = [];
    let condition = "";

    if (scope === "archived") {
      condition = "WHERE isArchived = TRUE";
    } else if (scope !== "all") {
      condition = "WHERE isArchived = FALSE";
    }

    query += ` ${condition} ORDER BY updated_at DESC`;

    console.log("Executing query:", query, "with values:", values);
    const result = await pool.query(query, values);
    const prompts = result.rows;

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
