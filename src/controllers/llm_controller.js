const { pool } = require("../config/database");

// Utility to fetch organization_id from users table
const getUserOrganizationId = async (user_id, res) => {
  try {
    const userCheck = await pool.query(
      "SELECT organization_id FROM users WHERE user_id = $1 AND is_active = true",
      [user_id]
    );
    if (userCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "User is invalid or inactive",
      });
      return null;
    }
    const organization_id = userCheck.rows[0].organization_id;
    if (!organization_id) {
      res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "User is not associated with any organization",
      });
      return null;
    }
    return organization_id;
  } catch (error) {
    console.error("Error fetching user organization_id:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
    return null;
  }
};

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

// Utility to validate name
const validateName = (name) => {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return {
      isValid: false,
      message: "Name is required and must be a non-empty string",
    };
  }
  return { isValid: true };
};

// Utility to validate api_key
const validateApiKey = (apiKey) => {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return {
      isValid: false,
      message: "API key is required and must be a non-empty string",
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
  const {
    model_name,
    name,
    api_key,
    description,
    is_active = true,
    organization_id,
  } = req.body;
  const user = req.user;

  try {
    // Validate model_name
    const modelValidation = validateModelName(model_name);
    if (!modelValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: modelValidation.message,
      });
    }

    // Validate name
    const nameValidation = validateName(name);
    if (!nameValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: nameValidation.message,
      });
    }

    // Validate api_key
    const apiKeyValidation = validateApiKey(api_key);
    if (!apiKeyValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: apiKeyValidation.message,
      });
    }

    // Determine organization_id based on user role
    let effectiveOrgId = organization_id;
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      if (organization_id && organization_id !== userOrgId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message:
            "Orgadmins can only create models for their own organization",
        });
      }
      effectiveOrgId = userOrgId;
    }

    // Validate organization_id if provided
    if (effectiveOrgId) {
      const orgCheck = await pool.query(
        "SELECT 1 FROM organizations WHERE organization_id = $1 AND is_active = true",
        [effectiveOrgId]
      );
      if (orgCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: "Invalid or inactive organization_id",
        });
      }
    }

    // Check if name is already used globally
    const globalNameCheck = await pool.query(
      "SELECT 1 FROM llm_models WHERE name = $1 AND organization_id IS NULL",
      [name]
    );
    if (globalNameCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: `Name '${name}' is already used in global scope`,
      });
    }

    // Check if name is already used in the same organization (if org-specific)
    if (effectiveOrgId) {
      const orgNameCheck = await pool.query(
        "SELECT 1 FROM llm_models WHERE name = $1 AND organization_id = $2",
        [name, effectiveOrgId]
      );
      if (orgNameCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: `Name '${name}' is already used in organization ${effectiveOrgId}`,
        });
      }
    }

    // Insert new model
    const result = await pool.query(
      "INSERT INTO llm_models (model_name, name, api_key, description, is_active, organization_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [
        model_name,
        name,
        api_key,
        description || null,
        is_active,
        effectiveOrgId,
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "LLM model added successfully",
    });
  } catch (error) {
    console.error("Error adding LLM model:", error);
    if (error.code === "23502") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "API key cannot be null",
      });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: `Name '${name}' is already used`,
      });
    }
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
  let { model_name, name, api_key, description, is_active, organization_id } =
    req.body;
  const user = req.user;

  if (
    !model_name &&
    !name &&
    api_key === undefined &&
    !description &&
    is_active === undefined &&
    organization_id === undefined
  ) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "At least one field to update is required (model_name, name, api_key, description, is_active, or organization_id)",
    });
  }

  try {
    // Check if model exists and is accessible
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

    const model = currentModel.rows[0];
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      if (model.organization_id !== userOrgId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message:
            "Orgadmins can only update models for their own organization",
        });
      }
    }

    // Validate organization_id for updates
    let effectiveOrgId =
      organization_id !== undefined ? organization_id : model.organization_id;
    if (organization_id !== undefined && user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      if (organization_id !== userOrgId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "Orgadmins cannot change organization_id",
        });
      }
    }
    if (effectiveOrgId) {
      const orgCheck = await pool.query(
        "SELECT 1 FROM organizations WHERE organization_id = $1 AND is_active = true",
        [effectiveOrgId]
      );
      if (orgCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: "Invalid or inactive organization_id",
        });
      }
    }

    // Validate model_name if provided
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
    }

    // Validate name if provided
    if (name) {
      name = name.trim();
      const nameValidation = validateName(name);
      if (!nameValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: nameValidation.message,
        });
      }

      // Check if name is already used globally
      const globalNameCheck = await pool.query(
        "SELECT 1 FROM llm_models WHERE name = $1 AND organization_id IS NULL AND model_id != $2",
        [name, model_id]
      );
      if (globalNameCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: `Name '${name}' is already used in global scope`,
        });
      }

      // Check if name is already used in the same organization (if org-specific)
      if (effectiveOrgId) {
        const orgNameCheck = await pool.query(
          "SELECT 1 FROM llm_models WHERE name = $1 AND organization_id = $2 AND model_id != $3",
          [name, effectiveOrgId, model_id]
        );
        if (orgNameCheck.rows.length > 0) {
          return res.status(409).json({
            success: false,
            error: "Conflict",
            message: `Name '${name}' is already used in organization ${effectiveOrgId}`,
          });
        }
      }
    }

    // Validate api_key if provided
    if (api_key !== undefined) {
      const apiKeyValidation = validateApiKey(api_key);
      if (!apiKeyValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: apiKeyValidation.message,
        });
      }
    }

    // Build dynamic update query
    const fields = [];
    const values = [];
    let index = 1;

    if (model_name) {
      fields.push(`model_name = $${index++}`);
      values.push(model_name);
    }
    if (name) {
      fields.push(`name = $${index++}`);
      values.push(name);
    }
    if (api_key !== undefined) {
      fields.push(`api_key = $${index++}`);
      values.push(api_key);
    }
    if (description !== undefined) {
      fields.push(`description = $${index++}`);
      values.push(description || null);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(is_active);
    }
    if (organization_id !== undefined) {
      fields.push(`organization_id = $${index++}`);
      values.push(organization_id);
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
    if (error.code === "23502") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "API key cannot be null",
      });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: `Name '${name}' is already used`,
      });
    }
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Delete an LLM model (hard delete with assignment conflict check)
const deleteModel = async (req, res) => {
  const { model_id } = req.params;
  const user = req.user;

  try {
    // Fetch the model
    const modelResult = await pool.query(
      "SELECT * FROM llm_models WHERE model_id = $1",
      [model_id]
    );
    if (modelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "LLM model not found",
      });
    }
    const model = modelResult.rows[0];

    // Role-based access control
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      if (model.organization_id !== userOrgId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message:
            "Orgadmins can only delete models from their own organization",
        });
      }
    } else if (user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Only superadmin or orgadmin can delete models",
      });
    }

    // Check for assignments (for both superadmin and orgadmin)
    const assignmentQuery = `
      SELECT 
        a.level,
        o.organization_name,
        b.batch_name
      FROM llm_assignments a
      LEFT JOIN organizations o ON a.organization_id = o.organization_id
      LEFT JOIN batches b ON a.batch_id = b.batch_id
      WHERE a.model_id = $1
    `;
    const assignmentResult = await pool.query(assignmentQuery, [model_id]);

    if (assignmentResult.rows.length > 0) {
      const assignedScopes = assignmentResult.rows.map((row) => ({
        level: row.level,
        organization_name: row.organization_name || null,
        batch_name: row.batch_name || null,
      }));
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message:
          "Cannot delete model as it is assigned to the following scopes. Please re-assign or remove these assignments first.",
        assigned_scopes: assignedScopes,
      });
    }

    // Perform hard delete (permanent removal)
    const deleteResult = await pool.query(
      "DELETE FROM llm_models WHERE model_id = $1 RETURNING *",
      [model_id]
    );

    res.json({
      success: true,
      data: deleteResult.rows[0],
      message: "LLM model deleted successfully (hard delete)",
    });
  } catch (error) {
    console.error("Error deleting LLM model:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Get all LLM models (for dropdown)
const getAllModels = async (req, res) => {
  const user = req.user;

  try {
    let query = `
      SELECT model_id, model_name, name, api_key, description, is_active, organization_id, created_at, updated_at
      FROM llm_models
      WHERE is_active = true
    `;
    let values = [];
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      query += ` AND (organization_id IS NULL OR organization_id = $1)`;
      values = [userOrgId];
    }
    query += ` ORDER BY model_name`;

    const result = await pool.query(query, values);
    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "LLM models fetched successfully"
          : "No active LLM models found",
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
  const user = req.user;

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

    // Restrict orgadmin to organization or batch level
    if (user.role === "orgadmin" && level === "global") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Orgadmins cannot assign models to global level",
      });
    }

    // Validate organization_id and batch_id based on level
    let effectiveOrgId = organization_id;
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      if (organization_id && organization_id !== userOrgId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message:
            "Orgadmins can only assign models within their own organization",
        });
      }
      effectiveOrgId = userOrgId;
    }

    if (level === "batch" && (!effectiveOrgId || !batch_id)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id are required for batch level",
      });
    }
    if (level === "organization" && !effectiveOrgId) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id is required for organization level",
      });
    }
    if (level === "global" && (effectiveOrgId || batch_id)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id must be null for global level",
      });
    }

    // Check if model exists and is active
    let modelCheckQuery = `
      SELECT model_name, name, api_key, organization_id
      FROM llm_models
      WHERE model_id = $1 AND is_active = true
    `;
    let modelCheckValues = [model_id];
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      modelCheckQuery += ` AND (organization_id IS NULL OR organization_id = $2)`;
      modelCheckValues.push(userOrgId);
    }

    const modelCheck = await pool.query(modelCheckQuery, modelCheckValues);
    if (modelCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "LLM model not found, inactive, or inaccessible",
      });
    }

    // Validate organization_id
    if (effectiveOrgId) {
      const orgCheck = await pool.query(
        "SELECT 1 FROM organizations WHERE organization_id = $1 AND is_active = true",
        [effectiveOrgId]
      );
      if (orgCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: "Invalid or inactive organization_id",
        });
      }
    }

    // Validate batch_id belongs to organization_id for batch level
    if (level === "batch") {
      const batchCheck = await pool.query(
        "SELECT batch_name FROM batches WHERE batch_id = $1 AND organization_id = $2 AND is_active = true",
        [batch_id, effectiveOrgId]
      );
      if (batchCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: `Batch with batch_id '${batch_id}' does not belong to organization_id '${effectiveOrgId}' or is inactive`,
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
      effectiveOrgId,
      batch_id,
    ]);
    if (existingAssignment.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: `An assignment already exists for level '${level}', organization_id '${effectiveOrgId || "NULL"}', batch_id '${batch_id || "NULL"}'. Use PUT to update the existing assignment.`,
      });
    }

    // Insert new assignment
    const result = await pool.query(
      `
      INSERT INTO llm_assignments (model_id, level, organization_id, batch_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [model_id, level, effectiveOrgId, batch_id]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "LLM model assigned successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: `An assignment already exists for level '${level}', organization_id '${effectiveOrgId || "NULL"}', batch_id '${batch_id || "NULL"}'`,
      });
    }
    if (error.code === "23503") {
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
  const user = req.user;

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
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      if (currentAssignment.organization_id !== userOrgId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message:
            "Orgadmins can only update assignments for their own organization",
        });
      }
    }

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
      if (user.role === "orgadmin" && level === "global") {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "Orgadmins cannot assign models to global level",
        });
      }
    }

    // Validate new organization_id
    let effectiveOrgId =
      organization_id !== undefined
        ? organization_id
        : currentAssignment.organization_id;
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      if (effectiveOrgId !== userOrgId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message:
            "Orgadmins can only assign models within their own organization",
        });
      }
    }

    // Validate organization_id
    if (effectiveOrgId) {
      const orgCheck = await pool.query(
        "SELECT 1 FROM organizations WHERE organization_id = $1 AND is_active = true",
        [effectiveOrgId]
      );
      if (orgCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: "Invalid or inactive organization_id",
        });
      }
    }

    // Validate new level and organization_id/batch_id
    const effectiveLevel = level || currentAssignment.level;
    if (
      effectiveLevel === "batch" &&
      (effectiveOrgId === undefined || batch_id === undefined)
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id are required for batch level",
      });
    }
    if (effectiveLevel === "organization" && effectiveOrgId === undefined) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id is required for organization level",
      });
    }
    if (
      effectiveLevel === "global" &&
      (effectiveOrgId !== undefined || batch_id !== undefined)
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id must be null for global level",
      });
    }

    // Validate batch_id belongs to organization_id for batch level
    if (effectiveLevel === "batch") {
      const effectiveBatchId =
        batch_id !== undefined ? batch_id : currentAssignment.batch_id;
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

    // If updating scope fields, check for existing assignment
    if (level || organization_id !== undefined || batch_id !== undefined) {
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

    // Verify model exists and is accessible
    if (model_id) {
      let modelCheckQuery = `
        SELECT model_name, name, api_key
        FROM llm_models
        WHERE model_id = $1 AND is_active = true
      `;
      let modelCheckValues = [model_id];
      if (user.role === "orgadmin") {
        const userOrgId = await getUserOrganizationId(user.user_id, res);
        if (!userOrgId) return;

        modelCheckQuery += ` AND (organization_id IS NULL OR organization_id = $2)`;
        modelCheckValues.push(userOrgId);
      }

      const modelCheck = await pool.query(modelCheckQuery, modelCheckValues);
      if (modelCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "LLM model not found, inactive, or inaccessible",
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
  const user = req.user;

  try {
    let query = `
      SELECT 
        a.assignment_id, 
        a.model_id, 
        m.model_name, 
        m.name,
        m.api_key,
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
      WHERE m.is_active = true
    `;
    let values = [];
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      query += ` AND (a.organization_id = $1 OR a.level = 'global')`;
      values = [userOrgId];
    }
    query += ` ORDER BY a.updated_at DESC`;

    const result = await pool.query(query, values);
    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "LLM assignments fetched successfully"
          : "No active LLM assignments found",
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
  const user = req.user;

  try {
    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      if (organization_id != userOrgId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message:
            "Orgadmins can only view assignments for their own organization",
        });
      }
    }

    const result = await pool.query(
      `
      SELECT 
        a.assignment_id, 
        a.model_id, 
        m.model_name, 
        m.name,
        m.api_key,
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
      WHERE (a.organization_id = $1 OR a.level = 'global') AND m.is_active = true
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
          : "No active LLM assignments found for organization",
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
  const user = req.user;

  try {
    // Validate input
    if (!organization_id || !batch_id) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "organization_id and batch_id are required",
      });
    }

    if (user.role === "orgadmin") {
      const userOrgId = await getUserOrganizationId(user.user_id, res);
      if (!userOrgId) return;

      if (organization_id != userOrgId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message:
            "Orgadmins can only query assignments for their own organization",
        });
      }
    }

    // Validate organization_id
    const orgCheck = await pool.query(
      "SELECT 1 FROM organizations WHERE organization_id = $1 AND is_active = true",
      [organization_id]
    );
    if (orgCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Invalid or inactive organization_id",
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
        m.name,
        m.api_key,
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
        m.name,
        m.api_key,
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
        m.name,
        m.api_key,
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

// Get active models for orgadmin (excludes api_key)
const getOrgadminModels = async (req, res) => {
  const user = req.user;

  try {
    // Restrict to orgadmin role
    if (user.role !== "orgadmin") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "This endpoint is restricted to orgadmin users",
      });
    }

    const userOrgId = await getUserOrganizationId(user.user_id, res);
    if (!userOrgId) return;

    // Fetch active models (global and org-specific) without api_key
    const query = `
      SELECT 
        model_id, 
        model_name, 
        name, 
        description, 
        is_active, 
        organization_id, 
        created_at, 
        updated_at
      FROM llm_models
      WHERE is_active = true 
      AND (organization_id IS NULL OR organization_id = $1)
      ORDER BY model_name
    `;
    const result = await pool.query(query, [userOrgId]);

    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "Models fetched successfully"
          : "No active models found",
    });
  } catch (error) {
    console.error("Error fetching models for orgadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Get active assignments for orgadmin (excludes api_key)
const getOrgadminAssignments = async (req, res) => {
  const user = req.user;

  try {
    // Restrict to orgadmin role
    if (user.role !== "orgadmin") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "This endpoint is restricted to orgadmin users",
      });
    }

    const userOrgId = await getUserOrganizationId(user.user_id, res);
    if (!userOrgId) return;

    // Fetch active assignments (global and org-specific) without api_key
    const query = `
      SELECT 
        a.assignment_id, 
        a.model_id, 
        m.model_name, 
        m.name, 
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
      WHERE m.is_active = true 
      AND (a.organization_id = $1 OR a.level = 'global')
      ORDER BY a.level, a.batch_id, a.updated_at DESC
    `;
    const result = await pool.query(query, [userOrgId]);

    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "Assignments fetched successfully"
          : "No active assignments found",
    });
  } catch (error) {
    console.error("Error fetching assignments for orgadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Get organization-specific models for orgadmin (includes api_key)
const getOrgadminOrganizationModels = async (req, res) => {
  const user = req.user;

  try {
    // Restrict to orgadmin role
    if (user.role !== "orgadmin") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "This endpoint is restricted to orgadmin users",
      });
    }

    const userOrgId = await getUserOrganizationId(user.user_id, res);
    if (!userOrgId) return;

    // Fetch active organization-specific models with api_key
    const query = `
      SELECT 
        model_id, 
        model_name, 
        name, 
        api_key, 
        description, 
        is_active, 
        organization_id, 
        created_at, 
        updated_at
      FROM llm_models
      WHERE is_active = true 
      AND organization_id = $1
      ORDER BY model_name
    `;
    const result = await pool.query(query, [userOrgId]);

    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "Organization models fetched successfully"
          : "No active organization models found",
    });
  } catch (error) {
    console.error("Error fetching organization models for orgadmin:", error);
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
  deleteModel,
  getAllModels,
  addAssignment,
  updateAssignment,
  getAllAssignments,
  getOrganizationAssignments,
  getAssignmentWithFallback,
  getOrgadminModels,
  getOrgadminAssignments,
  getOrgadminOrganizationModels,
};
