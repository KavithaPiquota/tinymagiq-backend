const { pool } = require("../config/database");

const getAllOrganizations = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT organization_id, organization_name, is_active, updated_at FROM organizations ORDER BY organization_id"
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Organizations fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching organizations:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getActiveOrganizations = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT organization_id, organization_name, is_active, updated_at FROM organizations WHERE is_active = TRUE ORDER BY organization_id"
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Active organizations fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching active organizations:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getInactiveOrganizations = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT organization_id, organization_name, is_active, updated_at FROM organizations WHERE is_active = FALSE ORDER BY organization_id"
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Inactive organizations fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching inactive organizations:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const createOrganization = async (req, res) => {
  const { organization_name, is_active = true } = req.body;

  if (!organization_name) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Organization name is required",
    });
  }

  try {
    const result = await pool.query(
      "INSERT INTO organizations (organization_name, is_active) VALUES ($1, $2) RETURNING organization_id, organization_name, is_active, updated_at",
      [organization_name, is_active]
    );
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Organization created successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Organization name already exists",
      });
    }
    console.error("Error creating organization:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const updateOrganization = async (req, res) => {
  const { organization_id } = req.params;
  const { organization_name, is_active } = req.body;

  if (organization_name === undefined && is_active === undefined) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "At least one field to update is required",
    });
  }

  try {
    if (organization_name) {
      const nameExists = await pool.query(
        "SELECT 1 FROM organizations WHERE organization_name = $1 AND organization_id != $2",
        [organization_name, organization_id]
      );
      if (nameExists.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: "Organization name already exists",
        });
      }
    }

    const fields = [];
    const values = [];
    let index = 1;

    if (organization_name !== undefined) {
      fields.push(`organization_name = $${index++}`);
      values.push(organization_name);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(is_active);
    }

    values.push(organization_id);
    const query = `UPDATE organizations SET ${fields.join(", ")} WHERE organization_id = $${index} RETURNING organization_id, organization_name, is_active, updated_at`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "Organization not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Organization updated successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Organization name already exists",
      });
    }
    console.error("Error updating organization:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  getAllOrganizations,
  getActiveOrganizations,
  getInactiveOrganizations,
  createOrganization,
  updateOrganization,
};
