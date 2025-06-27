// src/controllers/batchesController.js
const { pool } = require("../config/database");

// Create a batch
const createBatch = async (req, res) => {
  const { batch_name, organization_name, isActive = true } = req.body;

  if (!batch_name || !organization_name) {
    return res
      .status(400)
      .json({ error: "Batch name and organization name are required" });
  }

  try {
    // Look up org_id by organization_name
    const orgCheck = await pool.query(
      `SELECT org_id FROM organizations WHERE name = $1`,
      [organization_name]
    );
    if (orgCheck.rows.length === 0) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const org_id = orgCheck.rows[0].org_id;

    // Create batch
    const result = await pool.query(
      `INSERT INTO batches (batch_name, org_id, isActive)
             VALUES ($1, $2, $3)
             RETURNING batch_id, batch_name, org_id, isActive, created_at, updated_at`,
      [batch_name, org_id, isActive]
    );
    return res.status(201).json({
      message: "Batch created",
      batch: {
        ...result.rows[0],
        organization_name,
      },
    });
  } catch (error) {
    console.error("Error creating batch:", error);
    if (error.code === "23505") {
      // Unique violation
      return res
        .status(400)
        .json({ error: "Batch name already exists for this organization" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get all batches (optionally filtered by organization_name)
const getBatches = async (req, res) => {
  const { organization_name } = req.query;

  try {
    let query = `
            SELECT b.batch_id, b.batch_name, b.org_id, o.name AS organization_name, b.isActive, b.created_at, b.updated_at
            FROM batches b
            JOIN organizations o ON b.org_id = o.org_id
        `;
    const params = [];
    if (organization_name) {
      query += ` WHERE o.name = $1`;
      params.push(organization_name);
    }
    query += ` ORDER BY b.batch_name`;

    const result = await pool.query(query, params);
    return res.status(200).json({ batches: result.rows });
  } catch (error) {
    console.error("Error fetching batches:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get batches by organization (using org_id or organization_name)
const getBatchesByOrganization = async (req, res) => {
  const { org_id, organization_name } = req.query;

  if (!org_id && !organization_name) {
    return res
      .status(400)
      .json({ error: "Either org_id or organization_name is required" });
  }

  try {
    let query = `
            SELECT b.batch_id, b.batch_name, b.org_id, o.name AS organization_name, b.isActive, b.created_at, b.updated_at
            FROM batches b
            JOIN organizations o ON b.org_id = o.org_id
        `;
    const params = [];
    if (org_id) {
      query += ` WHERE b.org_id = $1`;
      params.push(org_id);
    } else if (organization_name) {
      query += ` WHERE o.name = $1`;
      params.push(organization_name);
    }
    query += ` ORDER BY b.batch_name`;

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No batches found for the specified organization" });
    }
    return res.status(200).json({ batches: result.rows });
  } catch (error) {
    console.error("Error fetching batches by organization:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Update a batch
const updateBatch = async (req, res) => {
  const { batch_id } = req.params;
  const { batch_name, organization_name, isActive } = req.body;

  if (!batch_name || !organization_name || isActive === undefined) {
    return res.status(400).json({
      error: "Batch name, organization name, and isActive are required",
    });
  }

  try {
    // Look up org_id by organization_name
    const orgCheck = await pool.query(
      `SELECT org_id FROM organizations WHERE name = $1`,
      [organization_name]
    );
    if (orgCheck.rows.length === 0) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const org_id = orgCheck.rows[0].org_id;

    // Update batch
    const result = await pool.query(
      `UPDATE batches
             SET batch_name = $1, org_id = $2, isActive = $3, updated_at = CURRENT_TIMESTAMP
             WHERE batch_id = $4
             RETURNING batch_id, batch_name, org_id, isActive, created_at, updated_at`,
      [batch_name, org_id, isActive, batch_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Batch not found" });
    }

    // Add organization_name to response
    const batch = {
      ...result.rows[0],
      organization_name,
    };
    return res.status(200).json({ message: "Batch updated", batch });
  } catch (error) {
    console.error("Error updating batch:", error);
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ error: "Batch name already exists for this organization" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  createBatch,
  getBatches,
  getBatchesByOrganization,
  updateBatch,
};
