const { pool } = require("../config/database");

const getOrganizationIdByName = async (organization_name) => {
  const result = await pool.query(
    "SELECT organization_id FROM organizations WHERE organization_name = $1",
    [organization_name]
  );
  if (result.rows.length === 0) {
    throw new Error("Organization not found");
  }
  return result.rows[0].organization_id;
};

const getProgressReport = async (req, res) => {
  const { organization_name, user_id, status, concept_name } = req.query;

  try {
    let query = `
      SELECT 
        c.user_id,
        c.status,
        c.current_stage,
        c.concept_name,
        c.created_at,
        c.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.username,
        o.organization_name,
        b.batch_name,
        p.pod_name
      FROM chat c
      JOIN users u ON c.user_id = u.email
      JOIN organizations o ON u.organization_id = o.organization_id
      LEFT JOIN pod_users pu ON u.user_id = pu.user_id
      LEFT JOIN pods p ON pu.pod_id = p.pod_id
      LEFT JOIN batches b ON p.batch_id = b.batch_id
    `;
    const values = [];
    const conditions = [];

    if (organization_name) {
      const organization_id = await getOrganizationIdByName(organization_name);
      conditions.push(`o.organization_id = $${values.length + 1}`);
      values.push(organization_id);
    }

    if (user_id) {
      conditions.push(`c.user_id = $${values.length + 1}`);
      values.push(user_id);
    }

    if (status) {
      conditions.push(`c.status = $${values.length + 1}`);
      values.push(status);
    }

    if (concept_name) {
      conditions.push(`c.concept_name ILIKE $${values.length + 1}`);
      values.push(`%${concept_name}%`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY c.updated_at DESC`;

    const result = await pool.query(query, values);
    const reports = result.rows;

    res.json({
      success: true,
      data: reports,
      message:
        reports.length > 0
          ? "Progress report fetched successfully"
          : "No progress records found",
    });
  } catch (error) {
    if (error.message === "Organization not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching progress report:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  getProgressReport,
};
