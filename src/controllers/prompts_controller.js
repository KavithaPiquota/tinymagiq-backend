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
  let {
    prompt_type,
    user_content,
    json_content,
    additional_content,
    organization_id,
    batch_id,
    prompt_level = "global",
  } = req.body;

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
    additional_content,
    "organization_id:",
    organization_id,
    "batch_id:",
    batch_id,
    "prompt_level:",
    prompt_level
  );

  try {
    // Sanitize inputs
    prompt_type = sanitizeInput(prompt_type);
    user_content = sanitizeInput(user_content);
    json_content = sanitizeInput(json_content);
    additional_content = sanitizeInput(additional_content);
    prompt_level = sanitizeInput(prompt_level);

    // Validate input
    if (!prompt_type || !user_content || !json_content) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "prompt_type, user_content, and json_content are required",
      });
    }

    // Validate prompt_level
    if (!["global", "batch"].includes(prompt_level)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "prompt_level must be 'global' or 'batch'",
      });
    }

    // Validate organization_id and batch_id for batch-level prompts
    if (prompt_level === "batch" && (!organization_id || !batch_id)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message:
          "organization_id and batch_id are required for batch-level prompts",
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

    // Check if a non-archived prompt with the same prompt_type, prompt_level, organization_id, and batch_id exists
    const existingPromptQuery = `
      SELECT prompt_id 
      FROM prompts 
      WHERE prompt_type = $1 
      AND prompt_level = $2 
      AND COALESCE(organization_id, -1) = COALESCE($3, -1)
      AND COALESCE(batch_id, -1) = COALESCE($4, -1)
      AND isarchived = FALSE
    `;
    const existingPrompt = await pool.query(existingPromptQuery, [
      prompt_type,
      prompt_level,
      organization_id,
      batch_id,
    ]);

    if (existingPrompt.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `A non-archived prompt with prompt_type '${prompt_type}', prompt_level '${prompt_level}', organization_id '${organization_id || "NULL"}', and batch_id '${batch_id || "NULL"}' already exists`,
      });
    }

    // Insert new prompt with version 1 using a CTE for joins
    const result = await pool.query(
      `
      WITH inserted_prompt AS (
        INSERT INTO prompts (prompt_type, user_content, json_content, additional_content, version, isarchived, prompt_level, organization_id, batch_id)
        VALUES ($1, $2, $3, $4, 1, FALSE, $5, $6, $7)
        RETURNING *
      )
      SELECT 
        ip.prompt_id, 
        ip.prompt_type, 
        ip.user_content, 
        ip.json_content, 
        ip.additional_content, 
        ip.version, 
        ip.isarchived, 
        ip.prompt_level, 
        ip.organization_id, 
        ip.batch_id, 
        ip.created_at, 
        ip.updated_at,
        o.organization_name AS organization_name,
        b.batch_name AS batch_name
      FROM inserted_prompt ip
      LEFT JOIN organizations o ON ip.organization_id = o.organization_id
      LEFT JOIN batches b ON ip.batch_id = b.batch_id
      `,
      [
        prompt_type,
        user_content,
        json_content,
        additional_content,
        prompt_level,
        organization_id,
        batch_id,
      ]
    );

    const prompt = result.rows[0];
    const prompt_content = `${prompt.user_content} ${prompt.json_content} ${prompt.additional_content || ""}`;
    console.log("addPrompt: prompt_content length:", prompt_content.length);
    res.status(201).json({
      success: true,
      data: {
        ...prompt,
        prompt_content,
        organization_name: prompt.organization_name || "",
        batch_name: prompt.batch_name || "",
      },
      message: "Prompt added successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `A non-archived prompt with prompt_type '${prompt_type}', prompt_level '${prompt_level}', organization_id '${organization_id || "NULL"}', and batch_id '${batch_id || "NULL"}' already exists`,
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
  const { prompt_id } = req.params;
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
      `SELECT prompt_id, prompt_type, version, json_content, additional_content, prompt_level, organization_id, batch_id 
       FROM prompts 
       WHERE prompt_id = $1 AND isarchived = FALSE`,
      [prompt_id]
    );

    if (existingPrompt.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: `No non-archived prompt found with prompt_id ${prompt_id}`,
      });
    }

    const {
      prompt_type,
      version,
      json_content: existing_json_content,
      additional_content: existing_additional_content,
      prompt_level,
      organization_id,
      batch_id,
    } = existingPrompt.rows[0];

    // Archive the existing prompt
    await pool.query(
      "UPDATE prompts SET isarchived = TRUE, updated_at = CURRENT_TIMESTAMP WHERE prompt_id = $1",
      [prompt_id]
    );

    // Use provided json_content or fall back to existing json_content
    const new_json_content =
      json_content !== undefined ? json_content : existing_json_content;
    // Use provided additional_content or fall back to existing additional_content
    const new_additional_content =
      additional_content !== undefined
        ? additional_content
        : existing_additional_content;

    // Insert new prompt with incremented version using a CTE
    const result = await pool.query(
      `
      WITH inserted_prompt AS (
        INSERT INTO prompts (prompt_type, user_content, json_content, additional_content, version, isarchived, prompt_level, organization_id, batch_id)
        VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8)
        RETURNING *
      )
      SELECT 
        ip.prompt_id, 
        ip.prompt_type, 
        ip.user_content, 
        ip.json_content, 
        ip.additional_content, 
        ip.version, 
        ip.isarchived, 
        ip.prompt_level, 
        ip.organization_id, 
        ip.batch_id, 
        ip.created_at, 
        ip.updated_at,
        o.organization_name AS organization_name,
        b.batch_name AS batch_name
      FROM inserted_prompt ip
      LEFT JOIN organizations o ON ip.organization_id = o.organization_id
      LEFT JOIN batches b ON ip.batch_id = b.batch_id
      `,
      [
        prompt_type,
        user_content,
        new_json_content,
        new_additional_content,
        version + 1,
        prompt_level,
        organization_id,
        batch_id,
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
        organization_name: prompt.organization_name || "",
        batch_name: prompt.batch_name || "",
      },
      message: "Prompt updated successfully",
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `A non-archived prompt with prompt_type '${prompt_type}', prompt_level '${prompt_level}', organization_id '${organization_id || "NULL"}', and batch_id '${batch_id || "NULL"}' already exists`,
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
  const { scope, organization_id, batch_id } = req.query; // 'archived' or 'all', optional organization_id and batch_id

  try {
    let query = `
      SELECT 
        p.prompt_id, 
        p.prompt_type, 
        p.version, 
        p.isarchived, 
        p.prompt_level, 
        p.organization_id, 
        p.batch_id, 
        p.created_at, 
        p.updated_at,
        o.organization_name AS organization_name,
        b.batch_name AS batch_name,
        (p.user_content || ' ' || p.json_content || ' ' || COALESCE(p.additional_content, '')) AS prompt_content
    `;
    const values = [];
    let condition = "";
    let paramIndex = 1;

    if (scope === "archived" || scope === "all") {
      query = `
        SELECT 
          p.prompt_id, 
          p.prompt_type, 
          p.user_content, 
          p.json_content, 
          p.additional_content, 
          p.version, 
          p.isarchived, 
          p.prompt_level, 
          p.organization_id, 
          p.batch_id, 
          p.created_at, 
          p.updated_at,
          o.organization_name AS organization_name,
          b.batch_name AS batch_name,
          (p.user_content || ' ' || p.json_content || ' ' || COALESCE(p.additional_content, '')) AS prompt_content
      `;
    }

    query += ` FROM prompts p
               LEFT JOIN organizations o ON p.organization_id = o.organization_id
               LEFT JOIN batches b ON p.batch_id = b.batch_id`;

    if (scope === "archived") {
      condition = "WHERE p.isarchived = TRUE";
    } else if (scope !== "all") {
      condition = "WHERE p.isarchived = FALSE";
    }

    if (organization_id !== undefined) {
      condition += condition ? " AND" : " WHERE";
      condition += ` COALESCE(p.organization_id, -1) = COALESCE($${paramIndex++}, -1)`;
      values.push(organization_id);
    }

    if (batch_id !== undefined) {
      condition += condition ? " AND" : " WHERE";
      condition += ` COALESCE(p.batch_id, -1) = COALESCE($${paramIndex++}, -1)`;
      values.push(batch_id);
    }

    query += ` ${condition} ORDER BY p.updated_at DESC`;

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
      data: prompts.map((prompt) => ({
        ...prompt,
        organization_name: prompt.organization_name || "",
        batch_name: prompt.batch_name || "",
      })),
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

const addBatchPrompt = async (req, res) => {
  const { prompt_id, organization_id, batch_id } = req.body;

  // Log raw request body for debugging
  console.log("Raw request body:", JSON.stringify(req.body, null, 2));
  console.log(
    "addBatchPrompt: prompt_id:",
    prompt_id,
    "organization_id:",
    organization_id,
    "batch_id:",
    batch_id
  );

  try {
    // Validate input
    if (!prompt_id || !organization_id || !batch_id) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "prompt_id, organization_id, and batch_id are required",
      });
    }

    // Fetch the global prompt
    const globalPrompt = await pool.query(
      `SELECT prompt_type, user_content, json_content, additional_content 
       FROM prompts 
       WHERE prompt_id = $1 AND prompt_level = 'global' AND isarchived = FALSE`,
      [prompt_id]
    );

    if (globalPrompt.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: `No non-archived global prompt found with prompt_id ${prompt_id}`,
      });
    }

    const { prompt_type, user_content, json_content, additional_content } =
      globalPrompt.rows[0];

    // Check if a non-archived batch prompt with the same prompt_type, organization_id, and batch_id exists
    const existingBatchPrompt = await pool.query(
      `SELECT prompt_id 
       FROM prompts 
       WHERE prompt_type = $1 
       AND prompt_level = 'batch' 
       AND COALESCE(organization_id, -1) = COALESCE($2, -1)
       AND COALESCE(batch_id, -1) = COALESCE($3, -1)
       AND isarchived = FALSE`,
      [prompt_type, organization_id, batch_id]
    );

    if (existingBatchPrompt.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `A non-archived batch prompt with prompt_type '${prompt_type}', organization_id '${organization_id}', and batch_id '${batch_id}' already exists`,
      });
    }

    // Insert new batch prompt with version 1 using a CTE
    const result = await pool.query(
      `
      WITH inserted_prompt AS (
        INSERT INTO prompts (prompt_type, user_content, json_content, additional_content, version, isarchived, prompt_level, organization_id, batch_id)
        VALUES ($1, $2, $3, $4, 1, FALSE, 'batch', $5, $6)
        RETURNING *
      )
      SELECT 
        ip.prompt_id, 
        ip.prompt_type, 
        ip.user_content, 
        ip.json_content, 
        ip.additional_content, 
        ip.version, 
        ip.isarchived, 
        ip.prompt_level, 
        ip.organization_id, 
        ip.batch_id, 
        ip.created_at, 
        ip.updated_at,
        o.organization_name AS organization_name,
        b.batch_name AS batch_name
      FROM inserted_prompt ip
      LEFT JOIN organizations o ON ip.organization_id = o.organization_id
      LEFT JOIN batches b ON ip.batch_id = b.batch_id
      `,
      [
        prompt_type,
        user_content,
        json_content,
        additional_content,
        organization_id,
        batch_id,
      ]
    );

    const prompt = result.rows[0];
    const prompt_content = `${prompt.user_content} ${prompt.json_content} ${prompt.additional_content || ""}`;
    console.log(
      "addBatchPrompt: prompt_content length:",
      prompt_content.length
    );
    res.status(201).json({
      success: true,
      data: {
        ...prompt,
        prompt_content,
        organization_name: prompt.organization_name || "",
        batch_name: prompt.batch_name || "",
      },
      message: "Batch prompt created successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      // Try fetching prompt_type for unique_active_prompt
      let conflictPrompt = await pool.query(
        `SELECT prompt_type 
         FROM prompts 
         WHERE prompt_level = 'batch' 
         AND COALESCE(organization_id, -1) = COALESCE($1, -1)
         AND COALESCE(batch_id, -1) = COALESCE($2, -1)
         AND isarchived = FALSE`,
        [organization_id, batch_id]
      );
      let conflict_prompt_type =
        conflictPrompt.rows.length > 0
          ? conflictPrompt.rows[0].prompt_type
          : null;

      if (!conflict_prompt_type) {
        // Check for unique_active_prompt_type violation
        const globalPrompt = await pool.query(
          `SELECT prompt_type 
           FROM prompts 
           WHERE prompt_id = $1 AND prompt_level = 'global' AND isarchived = FALSE`,
          [prompt_id]
        );
        if (globalPrompt.rows.length > 0) {
          const prompt_type = globalPrompt.rows[0].prompt_type;
          conflictPrompt = await pool.query(
            `SELECT prompt_id 
             FROM prompts 
             WHERE prompt_type = $1 AND isarchived = FALSE`,
            [prompt_type]
          );
          conflict_prompt_type =
            conflictPrompt.rows.length > 0 ? prompt_type : "unknown";
        } else {
          conflict_prompt_type = "unknown";
        }
      }

      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `A non-archived prompt with prompt_type '${conflict_prompt_type}' already exists for organization_id '${organization_id}' and batch_id '${batch_id}'`,
      });
    }
    console.error("Error adding batch prompt:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getGlobalPrompts = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.prompt_id, 
        p.prompt_type, 
        p.user_content, 
        p.json_content, 
        p.additional_content, 
        p.version, 
        p.isarchived, 
        p.prompt_level, 
        p.organization_id, 
        p.batch_id, 
        p.created_at, 
        p.updated_at,
        o.organization_name AS organization_name,
        b.batch_name AS batch_name,
        (p.user_content || ' ' || p.json_content || ' ' || COALESCE(p.additional_content, '')) AS prompt_content
      FROM prompts p
      LEFT JOIN organizations o ON p.organization_id = o.organization_id
      LEFT JOIN batches b ON p.batch_id = b.batch_id
      WHERE p.prompt_level = 'global' AND p.isarchived = FALSE
      ORDER BY p.updated_at DESC
    `;
    console.log("Executing query:", query);
    const result = await pool.query(query);
    const prompts = result.rows;

    // Log prompt_content length for each prompt
    prompts.forEach((prompt, index) => {
      console.log(
        `getGlobalPrompts: prompt[${index}] prompt_content length:`,
        prompt.prompt_content.length
      );
    });

    res.json({
      success: true,
      data: prompts.map((prompt) => ({
        ...prompt,
        organization_name: prompt.organization_name || "",
        batch_name: prompt.batch_name || "",
      })),
      message:
        prompts.length > 0
          ? "Global prompts fetched successfully"
          : "No global prompts found",
    });
  } catch (error) {
    console.error("Error fetching global prompts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getBatchPrompts = async (req, res) => {
  const { organization_id, batch_id } = req.query;

  try {
    let query = `
      SELECT 
        p.prompt_id, 
        p.prompt_type, 
        p.user_content, 
        p.json_content, 
        p.additional_content, 
        p.version, 
        p.isarchived, 
        p.prompt_level, 
        p.organization_id, 
        p.batch_id, 
        p.created_at, 
        p.updated_at,
        o.organization_name AS organization_name,
        b.batch_name AS batch_name,
        (p.user_content || ' ' || p.json_content || ' ' || COALESCE(p.additional_content, '')) AS prompt_content
      FROM prompts p
      LEFT JOIN organizations o ON p.organization_id = o.organization_id
      LEFT JOIN batches b ON p.batch_id = b.batch_id
      WHERE p.prompt_level = 'batch' AND p.isarchived = FALSE
    `;
    const values = [];
    let condition = "";
    let paramIndex = 1;

    if (organization_id !== undefined) {
      condition += ` AND COALESCE(p.organization_id, -1) = COALESCE($${paramIndex++}, -1)`;
      values.push(organization_id);
    }

    if (batch_id !== undefined) {
      condition += ` AND COALESCE(p.batch_id, -1) = COALESCE($${paramIndex++}, -1)`;
      values.push(batch_id);
    }

    query += ` ${condition} ORDER BY p.updated_at DESC`;

    console.log("Executing query:", query, "with values:", values);
    const result = await pool.query(query, values);
    const prompts = result.rows;

    // Log prompt_content length for each prompt
    prompts.forEach((prompt, index) => {
      console.log(
        `getBatchPrompts: prompt[${index}] prompt_content length:`,
        prompt.prompt_content.length
      );
    });

    res.json({
      success: true,
      data: prompts.map((prompt) => ({
        ...prompt,
        organization_name: prompt.organization_name || "",
        batch_name: prompt.batch_name || "",
      })),
      message:
        prompts.length > 0
          ? "Batch prompts fetched successfully"
          : "No batch prompts found",
    });
  } catch (error) {
    console.error("Error fetching batch prompts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getArchivedPrompts = async (req, res) => {
  const { organization_id, batch_id } = req.query;

  try {
    let query = `
      SELECT 
        p.prompt_id, 
        p.prompt_type, 
        p.user_content, 
        p.json_content, 
        p.additional_content, 
        p.version, 
        p.isarchived, 
        p.prompt_level, 
        p.organization_id, 
        p.batch_id, 
        p.created_at, 
        p.updated_at,
        o.organization_name AS organization_name,
        b.batch_name AS batch_name,
        (p.user_content || ' ' || p.json_content || ' ' || COALESCE(p.additional_content, '')) AS prompt_content
      FROM prompts p
      LEFT JOIN organizations o ON p.organization_id = o.organization_id
      LEFT JOIN batches b ON p.batch_id = b.batch_id
      WHERE p.isarchived = TRUE
    `;
    const values = [];
    let condition = "";
    let paramIndex = 1;

    if (organization_id !== undefined) {
      condition += ` AND COALESCE(p.organization_id, -1) = COALESCE($${paramIndex++}, -1)`;
      values.push(organization_id);
    }

    if (batch_id !== undefined) {
      condition += ` AND COALESCE(p.batch_id, -1) = COALESCE($${paramIndex++}, -1)`;
      values.push(batch_id);
    }

    query += ` ${condition} ORDER BY p.updated_at DESC`;

    console.log("Executing query:", query, "with values:", values);
    const result = await pool.query(query, values);
    const prompts = result.rows;

    // Log prompt_content length for each prompt
    prompts.forEach((prompt, index) => {
      console.log(
        `getArchivedPrompts: prompt[${index}] prompt_content length:`,
        prompt.prompt_content.length
      );
    });

    res.json({
      success: true,
      data: prompts.map((prompt) => ({
        ...prompt,
        organization_name: prompt.organization_name || "",
        batch_name: prompt.batch_name || "",
      })),
      message:
        prompts.length > 0
          ? "Archived prompts fetched successfully"
          : "No archived prompts found",
    });
  } catch (error) {
    console.error("Error fetching archived prompts:", error);
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
  addBatchPrompt,
  getGlobalPrompts,
  getBatchPrompts,
  getArchivedPrompts,
};
