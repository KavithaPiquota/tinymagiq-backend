const { pool } = require("../config/database");
const OpenAI = require("openai");
const NodeCache = require("node-cache");
const fs = require("fs").promises;
const path = require("path");
const cache = new NodeCache({ stdTTL: 3600 });
const { Langfuse } = require("langfuse"); // Import Langfuse SDK

// Initialize Langfuse client
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY || "your-langfuse-public-key",
  secretKey: process.env.LANGFUSE_SECRET_KEY || "your-langfuse-secret-key",
  baseUrl: process.env.LANGFUSE_HOST || "https://cloud.langfuse.com", // Adjust if using self-hosted Langfuse
});

// Utility to create logs directory
const ensureLogsDirectory = async () => {
  const logsDir = path.join(__dirname, "../logs"); // logs/ directory in project root
  try {
    await fs.mkdir(logsDir, { recursive: true });
    console.log("Logs directory ensured:", logsDir);
  } catch (error) {
    console.error("Error creating logs directory:", error.message);
  }
};

// Utility to sanitize username for safe filenames
const sanitizeUsername = (username) => {
  if (!username) return "anonymous";
  // Replace invalid filename characters with underscores
  return username.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
};

// Fetch OpenAI API key from database
const getOpenAIApiKey = async () => {
  try {
    const result = await pool.query(
      "SELECT api_key FROM keys WHERE api_key IS NOT NULL LIMIT 1"
    );
    if (result.rows.length === 0) {
      throw new Error("No OpenAI API key found in database");
    }
    return result.rows[0].api_key;
  } catch (error) {
    console.error("Error fetching OpenAI API key:", error);
    throw error;
  }
};

// Initialize OpenAI client
const initializeOpenAI = async () => {
  const apiKey = await getOpenAIApiKey();
  return new OpenAI({ apiKey });
};

// Utility to sanitize input by removing invalid control characters
const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;
  // Remove invalid control characters except \n, \r, \t
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
};

// Utility to validate JSON string
const isValidJsonString = (str) => {
  if (typeof str !== "string") return true;
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    console.error("Invalid JSON:", e.message);
    return false;
  }
};

// Utility to process template with selected concept data
const processTemplate = (
  templateContent,
  selectedConcept,
  sessionHistory = []
) => {
  if (!templateContent || !selectedConcept) {
    return templateContent;
  }

  const filteredHistory = sessionHistory.filter(
    (entry) => entry.concept_name === selectedConcept.concept_name
  );

  const conversationHistory = filteredHistory
    .map((entry) => `Mentee: ${entry.Mentee}\nMentor: ${entry.Mentor}`)
    .join("\n");

  console.log(
    "Processing template with conversation history length:",
    conversationHistory.length
  );

  let processedContent = templateContent;

  const replacements = {
    "{{CONCEPT_NAME}}": selectedConcept.concept_name || "",
    "{{CONCEPT_CONTENT}}": selectedConcept.concept_content || "",
    "{{CONCEPT_ENDURING_UNDERSTANDINGS}}":
      selectedConcept.concept_enduring_understandings || "",
    "{{CONCEPT_ESSENTIAL_QUESTIONS}}":
      selectedConcept.concept_essential_questions || "",
    "{{CONCEPT_KNOWLEDGE_SKILLS}}":
      selectedConcept.concept_knowledge_skills || "",
    "{{STAGE_1_CONTENT}}": selectedConcept.stage_1_content || "",
    "{{STAGE_2_CONTENT}}": selectedConcept.stage_2_content || "",
    "{{STAGE_3_CONTENT}}": selectedConcept.stage_3_content || "",
    "{{STAGE_4_CONTENT}}": selectedConcept.stage_4_content || "",
    "{{STAGE_5_CONTENT}}": selectedConcept.stage_5_content || "",
    "{{CONCEPT_UNDERSTANDING_RUBRIC}}":
      selectedConcept.concept_understanding_rubric || "",
    "{{UNDERSTANDING_SKILLS_RUBRIC}}":
      selectedConcept.understanding_skills_rubric || "",
    "{{LEARNING_ASSESSMENT_DIMENSIONS}}":
      selectedConcept.learning_assessment_dimensions || "",
    "{{LEARNING_OBJECTIVE}}": selectedConcept.learning_objective || "",
    "{{LEVEL_1_NAME}}": selectedConcept.level_1_name || "",
    "{{LEVEL_1_DESCRIPTION}}": selectedConcept.level_1_description || "",
    "{{LEVEL_2_NAME}}": selectedConcept.level_2_name || "",
    "{{LEVEL_2_DESCRIPTION}}": selectedConcept.level_2_description || "",
    "{{LEVEL_3_NAME}}": selectedConcept.level_3_name || "",
    "{{LEVEL_3_DESCRIPTION}}": selectedConcept.level_3_description || "",
    "{{LEVEL_4_NAME}}": selectedConcept.level_4_name || "",
    "{{LEVEL_4_DESCRIPTION}}": selectedConcept.level_4_description || "",
    "{{LEVEL_5_NAME}}": selectedConcept.level_5_name || "",
    "{{LEVEL_5_DESCRIPTION}}": selectedConcept.level_5_description || "",
    "{{NUMBER_OF_SCENARIOS}}": selectedConcept.number_of_scenarios || "",
    "{{FACET_FOCUS}}": selectedConcept.facet_focus || "",
    "{{INTRODUCTION_CONTEXT}}": selectedConcept.introduction_context || "",
    "{{PROGRESSION_DESCRIPTION}}":
      selectedConcept.progression_description || "",
    "{{TASK_QUESTIONS}}": selectedConcept.task_questions || "",
    "{{REFLECTION_QUESTIONS}}": selectedConcept.reflection_questions || "",
    "{{STRENGTH_CHECKLIST}}": selectedConcept.strength_checklist || "",
    "{{CONVERSATION_HISTORY_PLACEHOLDER}}": conversationHistory || "",
  };

  Object.entries(replacements).forEach(([placeholder, value]) => {
    processedContent = processedContent.replace(
      new RegExp(placeholder, "g"),
      value
    );
  });

  return processedContent;
};

// Utility to load template from database
const loadTemplate = async (templateName, organization_id, batch_id) => {
  let query = `
    SELECT (user_content || ' ' || json_content || ' ' || COALESCE(additional_content, '')) AS prompt_content
    FROM prompts
    WHERE prompt_type = $1
    AND isarchived = FALSE
    AND prompt_level = 'batch'
    AND organization_id = $2
    AND batch_id = $3
  `;
  let values = [templateName, organization_id, batch_id];

  console.log("Executing batch prompt query:", query, "with values:", values);
  let result = await pool.query(query, values);
  if (result.rows.length > 0) {
    console.log(
      `Batch-level prompt found for ${templateName}, organization_id: ${organization_id}, batch_id: ${batch_id}`
    );
    return result.rows[0].prompt_content;
  }

  console.log(
    `No batch-level prompt found for ${templateName}, falling back to global`
  );
  query = `
    SELECT (user_content || ' ' || json_content || ' ' || COALESCE(additional_content, '')) AS prompt_content
    FROM prompts
    WHERE prompt_type = $1
    AND isarchived = FALSE
    AND prompt_level = 'global'
  `;
  values = [templateName];

  console.log("Executing global prompt query:", query, "with values:", values);
  result = await pool.query(query, values);
  if (result.rows.length > 0) {
    console.log(`Global prompt found for ${templateName}`);
    return result.rows[0].prompt_content;
  }

  throw new Error(`Template not found for ${templateName}`);
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
  const { scope, organization_id, batch_id } = req.query;

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

const getPromptsWithFallback = async (req, res) => {
  const { organization_id, batch_id } = req.query;

  try {
    // Validate input
    if (!organization_id || !batch_id) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id are required",
      });
    }

    // Query for non-archived batch-level prompts
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
      FROM prompts p
      LEFT JOIN organizations o ON p.organization_id = o.organization_id
      LEFT JOIN batches b ON p.batch_id = b.batch_id
      WHERE p.prompt_level = 'batch' AND p.isarchived = FALSE
      AND p.organization_id = $1 AND p.batch_id = $2
      ORDER BY p.updated_at DESC
    `;
    let values = [organization_id, batch_id];

    console.log("Executing batch prompt query:", query, "with values:", values);
    let result = await pool.query(query, values);
    let prompts = result.rows;

    // If no batch-level prompts found, fetch global prompts
    if (prompts.length === 0) {
      query = `
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
        FROM prompts p
        LEFT JOIN organizations o ON p.organization_id = o.organization_id
        LEFT JOIN batches b ON p.batch_id = b.batch_id
        WHERE p.prompt_level = 'global' AND p.isarchived = FALSE
        ORDER BY p.updated_at DESC
      `;
      console.log("Executing global prompt query:", query);
      result = await pool.query(query);
      prompts = result.rows;
    }

    // Log prompt_content length for each prompt
    prompts.forEach((prompt, index) => {
      console.log(
        `getPromptsWithFallback: prompt[${index}] prompt_content length:`,
        prompt.prompt_content.length
      );
    });

    res.json({
      success: true,
      data: prompts.map((prompt) => ({
        prompt_id: prompt.prompt_id,
        prompt_type: prompt.prompt_type,
        version: prompt.version,
        isarchived: prompt.isarchived,
        prompt_level: prompt.prompt_level,
        organization_id: prompt.organization_id,
        batch_id: prompt.batch_id,
        created_at: prompt.created_at,
        updated_at: prompt.updated_at,
        organization_name: prompt.organization_name || "",
        batch_name: prompt.batch_name || "",
        prompt_content: prompt.prompt_content,
      })),
      message:
        prompts.length > 0
          ? prompts[0].prompt_level === "batch"
            ? "Batch prompts fetched successfully"
            : "No batch prompts found, returning global prompts"
          : "No prompts found",
    });
  } catch (error) {
    console.error("Error fetching prompts with fallback:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// New function to process LLM request on backend
const processLLM = async (req, res) => {
  const {
    username,
    selectedPrompt,
    selectedModel,
    sessionHistory,
    userPrompt,
    selectedConcept,
    organizationId,
    batchId,
  } = req.body;

  console.log("processLLM: Request received:", {
    url: req.url,
    method: req.method,
    origin: req.get("Origin"),
    headers: req.headers,
    body: {
      username,
      selectedPrompt,
      selectedModel,
      sessionHistoryLength: sessionHistory?.length,
      userPrompt,
      selectedConcept: selectedConcept?.concept_name,
      organizationId,
      batchId,
    },
  });

  // Ensure logs directory exists
  await ensureLogsDirectory();

  // Sanitize username for filename
  const safeUsername = sanitizeUsername(username);
  const logFilePath = path.join(__dirname, "../logs", `${safeUsername}.txt`);

  // Prepare log entry for user input, including only the last sessionHistory entry
  const truncatedConcept =
    JSON.stringify(selectedConcept).split(/\s+/).slice(0, 30).join(" ") +
    (JSON.stringify(selectedConcept).split(/\s+/).length > 30 ? " ..." : "");
  const modifiedBody = {
    ...req.body,
    sessionHistory:
      sessionHistory.length > 0
        ? [sessionHistory[sessionHistory.length - 1]]
        : [],
    selectedConcept: truncatedConcept,
  };
  const logEntry = `
--- Request at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })} IST ---
User Input:
${JSON.stringify(modifiedBody, null, 2)}
`;

  try {
    // Validate inputs
    if (
      !selectedPrompt ||
      !selectedModel ||
      !selectedConcept ||
      !organizationId ||
      !batchId
    ) {
      console.error("Validation failed: Missing required fields");
      // Append error to log
      await fs.appendFile(
        logFilePath,
        `${logEntry}Error: Missing required fields\n\n`
      );
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message:
          "selectedPrompt, selectedModel, selectedConcept, organizationId, and batchId are required",
      });
    }

    // Initialize OpenAI client
    console.log("Initializing OpenAI client...");
    const openai = await initializeOpenAI();

    // Create Langfuse trace
    const trace = langfuse.trace({
      name: `processLLM-${selectedPrompt}`,
      userId: safeUsername,
      sessionId: organizationId.toString(),
      metadata: {
        organizationId,
        batchId,
        selectedModel,
        selectedPrompt,
        conceptName: selectedConcept?.concept_name,
      },
    });

    // Create a span for template loading
    const templateSpan = trace.span({
      name: "load-template",
      input: { selectedPrompt, organizationId, batchId },
    });

    // Load template with caching
    console.log(`Loading template for ${selectedPrompt}...`);
    const cacheKey = `${selectedPrompt}:${organizationId}:${batchId}`;
    let templateContent = cache.get(cacheKey);
    if (!templateContent) {
      templateContent = await loadTemplate(
        selectedPrompt,
        organizationId,
        batchId
      );
      cache.set(cacheKey, templateContent);
      console.log(`Cached template ${cacheKey}`);
    }
    console.log("Template loaded:", templateContent.substring(0, 100) + "...");
    templateSpan.end({
      output: { templateContent: templateContent.substring(0, 100) + "..." },
    });

    // Create a span for template processing
    const processSpan = trace.span({
      name: "process-template",
      input: { templateContent, selectedConcept },
    });

    // Process template
    console.log("Processing template...");
    const processedSystemContent = processTemplate(
      templateContent,
      selectedConcept
    );
    processSpan.end({
      output: {
        processedSystemContent:
          processedSystemContent.substring(0, 100) + "...",
      },
    });

    // Prepare user input
    const isFirstMessage = sessionHistory.length === 0;
    const maxHistoryEntries =
      selectedPrompt === "assessmentPrompt" ? 5 : sessionHistory.length;
    const userInput = isFirstMessage
      ? userPrompt
      : [
          ...sessionHistory
            .slice(-maxHistoryEntries)
            .map((entry) => `Mentee: ${entry.Mentee}\nMentor: ${entry.Mentor}`),
          `Mentee: ${userPrompt}`,
        ].join("\n");

    // Prepare messages for OpenAI API
    const messages = [{ role: "system", content: processedSystemContent }];
    if (userInput && userInput.trim()) {
      messages.push({ role: "user", content: userInput.trim() });
    } else {
      messages.push({ role: "user", content: "" });
    }

    // Create a generation for the OpenAI API call
    const generation = trace.generation({
      name: "openai-chat-completion",
      model: selectedModel,
      input: messages,
      metadata: {
        maxTokens: selectedPrompt === "assessmentPrompt" ? 6000 : 4000,
        temperature: 0.7,
        topP: 1,
        stream: selectedPrompt === "assessmentPrompt",
      },
    });

    // Call OpenAI API
    const maxTokens = selectedPrompt === "assessmentPrompt" ? 6000 : 4000;
    console.log(
      `Calling OpenAI API with model: ${selectedModel}, max_tokens: ${maxTokens}`
    );
    const startTime = Date.now();

    // Optional: Use streaming for assessmentPrompt
    let responseText = "";
    if (selectedPrompt === "assessmentPrompt") {
      const stream = await openai.chat.completions.create({
        model: selectedModel,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        top_p: 1,
        stream: true,
      });
      for await (const chunk of stream) {
        responseText += chunk.choices[0]?.delta?.content || "";
      }
    } else {
      const llmResponse = await openai.chat.completions.create({
        model: selectedModel,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        top_p: 1,
      });
      responseText = llmResponse.choices[0].message.content;
    }

    const endTime = Date.now();
    console.log(`OpenAI API call took ${(endTime - startTime) / 1000} seconds`);
    console.log("OpenAI response:", responseText.substring(0, 200) + "...");

    // Log completion to Langfuse
    generation.end({
      output: responseText,
      latency: (endTime - startTime) / 1000,
    });

    // Append OpenAI response to log
    await fs.appendFile(
      logFilePath,
      `${logEntry}OpenAI Response:
${responseText}

`
    );

    // Default response structure
    let parsedResponse = {
      apiResponseText:
        "The LLM did not return a valid response. Please try again.",
      interactionCompleted: false,
      endRequested: false,
      readyForNextStage: false,
      currentStage: 0,
      pauseRequested: false,
    };

    // Handle assessmentPrompt specially
    if (selectedPrompt === "assessmentPrompt") {
      console.log("Processing assessmentPrompt response...");
      parsedResponse.apiResponseText = responseText;
      console.log("Sending response:", parsedResponse);
      return res.json({
        success: true,
        data: parsedResponse,
        message: "LLM processing completed successfully",
      });
    }

    // Parse response for other prompts
    try {
      // Method 1: Direct JSON parsing
      try {
        const parsed = JSON.parse(responseText.trim());
        if (parsed.userText) {
          parsedResponse = {
            apiResponseText: parsed.userText,
            interactionCompleted: parsed.interactionCompleted || false,
            endRequested: parsed.endRequested || false,
            readyForNextStage: parsed.readyForNextStage || false,
            currentStage: parsed.currentStage || 0,
            pauseRequested: parsed.pauseRequested || false,
          };
          console.log("Sending response (direct JSON):", parsedResponse);
          return res.json({
            success: true,
            data: parsedResponse,
            message: "LLM processing completed successfully",
          });
        }
      } catch (directJsonError) {
        console.warn("Direct JSON parsing failed:", directJsonError.message);
      }

      // Method 2: Extract JSON from code blocks
      const jsonBlockMatch = responseText.match(
        /```(?:json)?\s*([\s\S]*?)\s*```/
      );
      if (jsonBlockMatch && jsonBlockMatch[1]) {
        try {
          const extractedJson = JSON.parse(jsonBlockMatch[1].trim());
          if (extractedJson.userText) {
            parsedResponse = {
              apiResponseText: extractedJson.userText,
              interactionCompleted: extractedJson.interactionCompleted || false,
              endRequested: extractedJson.endRequested || false,
              readyForNextStage: extractedJson.readyForNextStage || false,
              currentStage: extractedJson.currentStage || 0,
              pauseRequested: extractedJson.pauseRequested || false,
            };
            console.log("Sending response (code block):", parsedResponse);
            return res.json({
              success: true,
              data: parsedResponse,
              message: "LLM processing completed successfully",
            });
          }
        } catch (blockJsonError) {
          console.warn("JSON block extraction failed:", blockJsonError.message);
        }
      }

      // Method 3: Find any JSON-like structure
      const jsonRegex = /\{[\s\S]*?"userText"[\s\S]*?\}/g;
      const potentialJsonMatches = responseText.match(jsonRegex);
      if (potentialJsonMatches) {
        for (const match of potentialJsonMatches) {
          try {
            const extractedJson = JSON.parse(match);
            if (extractedJson.userText) {
              parsedResponse = {
                apiResponseText: extractedJson.userText,
                interactionCompleted:
                  extractedJson.interactionCompleted || false,
                endRequested: extractedJson.endRequested || false,
                readyForNextStage: extractedJson.readyForNextStage || false,
                currentStage: extractedJson.currentStage || 0,
                pauseRequested: extractedJson.pauseRequested || false,
              };
              console.log("Sending response (regex match):", parsedResponse);
              return res.json({
                success: true,
                data: parsedResponse,
                message: "LLM processing completed successfully",
              });
            }
          } catch (matchError) {
            continue;
          }
        }
      }

      // Fallback: Use raw text
      console.warn("All JSON parsing methods failed, using raw text");
      parsedResponse.apiResponseText = responseText;
      console.log("Sending response (raw text):", parsedResponse);
      return res.json({
        success: true,
        data: parsedResponse,
        message: "LLM processing completed with raw text fallback",
      });
    } catch (err) {
      console.error("Error processing LLM response:", err);
      parsedResponse.apiResponseText = responseText;
      console.log("Sending response (error fallback):", parsedResponse);
      return res.json({
        success: true,
        data: parsedResponse,
        message: "LLM processing completed with raw text fallback",
      });
    }
  } catch (error) {
    console.error("Error in processLLM:", error);
    // Append error to log
    await fs.appendFile(
      logFilePath,
      `${logEntry}Error:
${error.message}

`
    );
    // Log error to Langfuse
    trace.span({
      name: "error",
      input: { errorMessage: error.message },
      output: { status: "failed" },
    });
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message.includes("Template not found")
        ? `No prompt found for ${selectedPrompt}. Please contact support.`
        : error.message,
    });
  } finally {
    // Ensure Langfuse trace is flushed
    await langfuse.flush();
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
  getPromptsWithFallback,
  processLLM,
};
