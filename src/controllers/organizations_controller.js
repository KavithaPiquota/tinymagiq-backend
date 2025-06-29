const { pool } = require("../config/database");

const getAllOrganizations = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT organization_id, organization_name, is_active FROM organizations ORDER BY organization_id"
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
      "SELECT organization_id, organization_name, is_active FROM organizations WHERE is_active = TRUE ORDER BY organization_id"
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
      "SELECT organization_id, organization_name, is_active FROM organizations WHERE is_active = FALSE ORDER BY organization_id"
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
      "INSERT INTO organizations (organization_name, is_active) VALUES ($1, $2) RETURNING organization_id, organization_name, is_active",
      [organization_name, is_active]
    );
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Organization created successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      // Unique violation
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

module.exports = {
  getAllOrganizations,
  getActiveOrganizations,
  getInactiveOrganizations,
  createOrganization,
};
