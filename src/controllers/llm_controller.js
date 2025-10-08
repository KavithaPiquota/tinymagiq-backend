const { pool } = require("../config/database");

// Utility to validate model name
const validateModelName = (modelName) => {
  if (
    !modelName ||
    typeof modelName !== "string" ||
    modelName.trim().length === 0
  ) {
    return {
      isValid: false,
      message: "Model name is required and must be a non-empty string",
    };
  }
  return { isValid: true };
};

// Utility to validate level
const validateLevel = (level) => {
  if (!["global", "organization", "batch"].includes(level)) {
    return {
      isValid: false,
      message: "level must be 'global', 'organization', or 'batch'",
    };
  }
  return { isValid: true };
};

// Add a new LLM model
const addModel = async (req, res) => {
  const { model_name, description, is_active = true } = req.body;

  try {
    const validation = validateModelName(model_name);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: validation.message,
      });
    }

    // Check if model name already exists
    const existingModel = await pool.query(
      "SELECT 1 FROM llm_models WHERE model_name = $1",
      [model_name]
    );
    if (existingModel.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Model name already exists",
      });
    }

    // Insert new model
    const result = await pool.query(
      "INSERT INTO llm_models (model_name, description, is_active) VALUES ($1, $2, $3) RETURNING *",
      [model_name, description || null, is_active]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "LLM model added successfully",
    });
  } catch (error) {
    console.error("Error adding LLM model:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Update an existing LLM model
const updateModel = async (req, res) => {
  const { model_id } = req.params;
  let { model_name, description, is_active } = req.body;

  if (!model_name && !description && is_active === undefined) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "At least one field to update is required (model_name, description, or is_active)",
    });
  }

  try {
    if (model_name) {
      model_name = model_name.trim();
      const validation = validateModelName(model_name);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: validation.message,
        });
      }

      // Check if updated model name already exists
      const existingModel = await pool.query(
        "SELECT 1 FROM llm_models WHERE model_name = $1 AND model_id != $2",
        [model_name, model_id]
      );
      if (existingModel.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: "Updated model name already exists",
        });
      }
    }

    // Check if model exists
    const currentModel = await pool.query(
      "SELECT * FROM llm_models WHERE model_id = $1",
      [model_id]
    );
    if (currentModel.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "LLM model not found",
      });
    }

    // Build dynamic update query
    const fields = [];
    const values = [];
    let index = 1;

    if (model_name) {
      fields.push(`model_name = $${index++}`);
      values.push(model_name);
    }
    if (description !== undefined) {
      fields.push(`description = $${index++}`);
      values.push(description || null);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(is_active);
    }

    values.push(model_id);
    const query = `UPDATE llm_models SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE model_id = $${index} RETURNING *`;
    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: result.rows[0],
      message: "LLM model updated successfully",
    });
  } catch (error) {
    console.error("Error updating LLM model:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Get all LLM models (for dropdown)
const getAllModels = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT model_id, model_name, description, is_active, created_at, updated_at
      FROM llm_models
      ORDER BY model_name
      `
    );
    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "LLM models fetched successfully"
          : "No LLM models found",
    });
  } catch (error) {
    console.error("Error fetching LLM models:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Assign an LLM model to a level
const addAssignment = async (req, res) => {
  const { model_id, level = "global", organization_id, batch_id } = req.body;

  try {
    // Validate level
    const levelValidation = validateLevel(level);
    if (!levelValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: levelValidation.message,
      });
    }

    // Validate organization_id and batch_id based on level
    if (level === "batch" && (!organization_id || !batch_id)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id are required for batch level",
      });
    }
    if (level === "organization" && !organization_id) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id is required for organization level",
      });
    }
    if (level === "global" && (organization_id || batch_id)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id must be null for global level",
      });
    }

    // Check if model exists and is active
    const modelCheck = await pool.query(
      "SELECT model_name FROM llm_models WHERE model_id = $1 AND is_active = true",
      [model_id]
    );
    if (modelCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "LLM model not found or inactive",
      });
    }

    // Validate batch_id belongs to organization_id for batch level
    if (level === "batch") {
      const batchCheck = await pool.query(
        "SELECT batch_name FROM batches WHERE batch_id = $1 AND organization_id = $2 AND is_active = true",
        [batch_id, organization_id]
      );
      if (batchCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: `Batch with batch_id '${batch_id}' does not belong to organization_id '${organization_id}' or is inactive`,
        });
      }
    }

    // Check for existing assignment in the same scope
    const existingQuery = `
      SELECT assignment_id
      FROM llm_assignments
      WHERE level = $1
      AND COALESCE(organization_id, -1) = COALESCE($2, -1)
      AND COALESCE(batch_id, -1) = COALESCE($3, -1)
    `;
    const existingAssignment = await pool.query(existingQuery, [
      level,
      organization_id,
      batch_id,
    ]);
    if (existingAssignment.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: `An assignment already exists for level '${level}', organization_id '${organization_id || "NULL"}', batch_id '${batch_id || "NULL"}'. Use PUT to update the existing assignment.`,
      });
    }

    // Insert new assignment
    const result = await pool.query(
      `
      INSERT INTO llm_assignments (model_id, level, organization_id, batch_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [model_id, level, organization_id, batch_id]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "LLM model assigned successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      // Handle UNIQUE constraint violation
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: `An assignment already exists for level '${level}', organization_id '${organization_id || "NULL"}', batch_id '${batch_id || "NULL"}'`,
      });
    }
    if (error.code === "23503") {
      // Handle foreign key violation
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `Invalid reference: model_id, organization_id, or batch_id does not exist`,
      });
    }
    console.error("Error assigning LLM model:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Update an LLM assignment
const updateAssignment = async (req, res) => {
  const { assignment_id } = req.params;
  const { model_id, level, organization_id, batch_id } = req.body;

  if (
    !model_id &&
    !level &&
    organization_id === undefined &&
    batch_id === undefined
  ) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "At least one field to update is required (model_id, level, organization_id, or batch_id)",
    });
  }

  try {
    // Get existing assignment
    const existingAssignment = await pool.query(
      "SELECT * FROM llm_assignments WHERE assignment_id = $1",
      [assignment_id]
    );
    if (existingAssignment.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "LLM assignment not found",
      });
    }

    const currentAssignment = existingAssignment.rows[0];

    // Validate new level if provided
    if (level) {
      const levelValidation = validateLevel(level);
      if (!levelValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: levelValidation.message,
        });
      }
    }

    // Validate new organization_id and batch_id based on new level
    const effectiveLevel = level || currentAssignment.level;
    if (
      effectiveLevel === "batch" &&
      (organization_id === undefined || batch_id === undefined)
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id are required for batch level",
      });
    }
    if (effectiveLevel === "organization" && organization_id === undefined) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id is required for organization level",
      });
    }
    if (
      effectiveLevel === "global" &&
      (organization_id !== undefined || batch_id !== undefined)
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id must be null for global level",
      });
    }

    // Validate batch_id belongs to organization_id for batch level
    if (effectiveLevel === "batch") {
      const effectiveOrgId = organization_id !== undefined ? organization_id : currentAssignment.organization_id;
      const effectiveBatchId = batch_id !== undefined ? batch_id : currentAssignment.batch_id;
      const batchCheck = await pool.query(
        "SELECT batch_name FROM batches WHERE batch_id = $1 AND organization_id = $2 AND is_active = true",
        [effectiveBatchId, effectiveOrgId]
      );
      if (batchCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: `Batch with batch_id '${effectiveBatchId}' does not belong to organization_id '${effectiveOrgId}' or is inactive`,
        });
      }
    }

    // If updating scope fields, check for existing assignment in new scope
    if (level || organization_id !== undefined || batch_id !== undefined) {
      const effectiveOrgId =
        organization_id !== undefined
          ? organization_id
          : currentAssignment.organization_id;
      const effectiveBatchId =
        batch_id !== undefined ? batch_id : currentAssignment.batch_id;

      const existingAssignmentCheck = await pool.query(
        `
        SELECT assignment_id
        FROM llm_assignments
        WHERE level = $1
        AND COALESCE(organization_id, -1) = COALESCE($2, -1)
        AND COALESCE(batch_id, -1) = COALESCE($3, -1)
        AND assignment_id != $4
        `,
        [effectiveLevel, effectiveOrgId, effectiveBatchId, assignment_id]
      );
      if (existingAssignmentCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: `An assignment already exists for level '${effectiveLevel}', organization_id '${effectiveOrgId || "NULL"}', batch_id '${effectiveBatchId || "NULL"}'`,
        });
      }
    }

    // Verify model exists and is active if model_id is provided
    if (model_id) {
      const modelCheck = await pool.query(
        "SELECT model_name FROM llm_models WHERE model_id = $1 AND is_active = true",
        [model_id]
      );
      if (modelCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "LLM model not found or inactive",
        });
      }
    }

    // Build dynamic update query
    const fields = [];
    const values = [];
    let index = 1;

    if (model_id) {
      fields.push(`model_id = $${index++}`);
      values.push(model_id);
    }
    if (level) {
      fields.push(`level = $${index++}`);
      values.push(level);
    }
    if (organization_id !== undefined) {
      fields.push(`organization_id = $${index++}`);
      values.push(organization_id);
    }
    if (batch_id !== undefined) {
      fields.push(`batch_id = $${index++}`);
      values.push(batch_id);
    }

    values.push(assignment_id);
    const query = `
      UPDATE llm_assignments
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE assignment_id = $${index}
      RETURNING *
    `;
    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: result.rows[0],
      message: "LLM assignment updated successfully",
    });
  } catch (error) {
    if (error.code === "23503") {
      // Handle foreign key violation
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `Invalid reference: model_id, organization_id, or batch_id does not exist`,
      });
    }
    console.error("Error updating LLM assignment:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Get all LLM assignments
const getAllAssignments = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        a.assignment_id, 
        a.model_id, 
        m.model_name, 
        a.level, 
        a.organization_id, 
        o.organization_name, 
        a.batch_id, 
        b.batch_name, 
        a.created_at, 
        a.updated_at
      FROM llm_assignments a
      LEFT JOIN llm_models m ON a.model_id = m.model_id
      LEFT JOIN organizations o ON a.organization_id = o.organization_id
      LEFT JOIN batches b ON a.batch_id = b.batch_id
      ORDER BY a.updated_at DESC
      `
    );
    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "LLM assignments fetched successfully"
          : "No LLM assignments found",
    });
  } catch (error) {
    console.error("Error fetching LLM assignments:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Get LLM assignments for a specific organization
const getOrganizationAssignments = async (req, res) => {
  const { organization_id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        a.assignment_id, 
        a.model_id, 
        m.model_name, 
        a.level, 
        a.organization_id, 
        o.organization_name, 
        a.batch_id, 
        b.batch_name, 
        a.created_at, 
        a.updated_at
      FROM llm_assignments a
      LEFT JOIN llm_models m ON a.model_id = m.model_id
      LEFT JOIN organizations o ON a.organization_id = o.organization_id
      LEFT JOIN batches b ON a.batch_id = b.batch_id
      WHERE a.organization_id = $1 OR a.level = 'global'
      ORDER BY a.level, a.batch_id, a.updated_at DESC
      `,
      [organization_id]
    );
    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "LLM assignments for organization fetched successfully"
          : "No LLM assignments found for organization",
    });
  } catch (error) {
    console.error("Error fetching LLM assignments for organization:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Get LLM model assignment with fallback (batch -> organization -> global)
const getAssignmentWithFallback = async (req, res) => {
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

    // Validate batch_id belongs to organization_id
    const batchCheck = await pool.query(
      "SELECT batch_name FROM batches WHERE batch_id = $1 AND organization_id = $2 AND is_active = true",
      [batch_id, organization_id]
    );
    if (batchCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: `Batch with batch_id '${batch_id}' does not belong to organization_id '${organization_id}' or is inactive`,
      });
    }

    // Check batch-level assignment
    let query = `
      SELECT 
        a.assignment_id, 
        a.model_id, 
        m.model_name, 
        a.level, 
        a.organization_id, 
        a.batch_id, 
        a.created_at, 
        a.updated_at
      FROM llm_assignments a
      JOIN llm_models m ON a.model_id = m.model_id
      WHERE a.level = 'batch' 
      AND a.organization_id = $1 
      AND a.batch_id = $2
      AND m.is_active = true
    `;
    let values = [organization_id, batch_id];

    let result = await pool.query(query, values);
    if (result.rows.length > 0) {
      return res.json({
        success: true,
        data: result.rows[0],
        message: "Batch-level LLM model assignment fetched successfully",
      });
    }

    // Fallback to organization-level assignment
    query = `
      SELECT 
        a.assignment_id, 
        a.model_id, 
        m.model_name, 
        a.level, 
        a.organization_id, 
        a.batch_id, 
        a.created_at, 
        a.updated_at
      FROM llm_assignments a
      JOIN llm_models m ON a.model_id = m.model_id
      WHERE a.level = 'organization' 
      AND a.organization_id = $1
      AND m.is_active = true
    `;
    values = [organization_id];

    result = await pool.query(query, values);
    if (result.rows.length > 0) {
      return res.json({
        success: true,
        data: result.rows[0],
        message: "Organization-level LLM model assignment fetched successfully",
      });
    }

    // Fallback to global assignment
    query = `
      SELECT 
        a.assignment_id, 
        a.model_id, 
        m.model_name, 
        a.level, 
        a.organization_id, 
        a.batch_id, 
        a.created_at, 
        a.updated_at
      FROM llm_assignments a
      JOIN llm_models m ON a.model_id = m.model_id
      WHERE a.level = 'global'
      AND m.is_active = true
    `;
    result = await pool.query(query);
    if (result.rows.length > 0) {
      return res.json({
        success: true,
        data: result.rows[0],
        message: "Global LLM model assignment fetched successfully",
      });
    }

    return res.status(404).json({
      success: false,
      error: "Not found",
      message: "No active LLM model assignment found at any level",
    });
  } catch (error) {
    console.error("Error fetching LLM model assignment with fallback:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Export functions
module.exports = {
  addModel,
  updateModel,
  getAllModels,
  addAssignment,
  updateAssignment,
  getAllAssignments,
  getOrganizationAssignments,
  getAssignmentWithFallback,
};