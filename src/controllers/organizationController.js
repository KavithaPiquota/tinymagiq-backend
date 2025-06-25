const { pool } = require("../config/database");

// Controller to add an organization
const addOrganization = async (req, res) => {
  const {
    name,
    description,
    max_users_per_batch = 10,
    max_users_per_pod = 6,
    is_active = true,
  } = req.body;

  // Input validation
  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  // Validate max_users_per_batch and max_users_per_pod
  if (typeof max_users_per_batch !== "number" || max_users_per_batch <= 0) {
    return res
      .status(400)
      .json({ error: "max_users_per_batch must be a positive number" });
  }
  if (typeof max_users_per_pod !== "number" || max_users_per_pod <= 0) {
    return res
      .status(400)
      .json({ error: "max_users_per_pod must be a positive number" });
  }

  try {
    // Insert organization into organizations table
    const result = await pool.query(
      `INSERT INTO organizations (name, description, is_active, max_users_per_batch, max_users_per_pod)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING org_id, name, description, is_active, max_users_per_batch, max_users_per_pod, created_at`,
      [
        name,
        description || null,
        is_active,
        max_users_per_batch,
        max_users_per_pod,
      ]
    );

    const newOrganization = result.rows[0];
    return res.status(201).json({
      message: "Organization created successfully",
      organization: {
        org_id: newOrganization.org_id,
        name: newOrganization.name,
        description: newOrganization.description,
        is_active: newOrganization.is_active,
        max_users_per_batch: newOrganization.max_users_per_batch,
        max_users_per_pod: newOrganization.max_users_per_pod,
        created_at: newOrganization.created_at,
      },
    });
  } catch (error) {
    console.error("Error creating organization:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Controller to get list of organizations
const getOrganizations = async (req, res) => {
  try {
    // Fetch all organizations
    const result = await pool.query(
      `SELECT org_id, name, description, is_active, max_users_per_batch, max_users_per_pod, created_at
             FROM organizations
             ORDER BY name ASC`
    );

    return res.status(200).json({
      message: "Organizations retrieved successfully",
      organizations: result.rows,
    });
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { addOrganization, getOrganizations };
