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
  const {
    organization_name,
    user_id,
    status,
    concept_name,
    mentor_id,
    mentor_email,
  } = req.query;

  try {
    // Validate user_id is numeric if provided
    if (user_id && !/^[0-9]+$/.test(user_id)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "user_id filter must be numeric",
      });
    }
    // Validate mentor_id is numeric if provided
    if (mentor_id && !/^[0-9]+$/.test(mentor_id)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "mentor_id filter must be numeric",
      });
    }

    let selectFields = `
      c.id,
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
      p.pod_name,
      m.first_name AS mentor_first_name,
      m.last_name AS mentor_last_name,
      m.email AS mentor_email,
      m.username AS mentor_username,
      c.explanation_score,
      c.interpretation_score,
      c.application_score,
      c.perspective_score,
      c.empathy_score,
      c.self_knowledge_score,
      c.asking_questions_score,
      c.clarifying_ambiguity_score,
      c.summarizing_confirming_score,
      c.challenging_ideas_score,
      c.comparing_concepts_score,
      c.abstract_concrete_score,
      c.six_facets_average,
      c.understanding_skills_average,
      c.final_weighted_score
    `;

    let query = `
      SELECT ${selectFields}
      FROM chat c
      JOIN users u ON c.user_id::integer = u.user_id
      JOIN organizations o ON u.organization_id = o.organization_id
      LEFT JOIN pod_users pu ON u.user_id = pu.user_id
      LEFT JOIN pods p ON pu.pod_id = p.pod_id
      LEFT JOIN batches b ON p.batch_id = b.batch_id
      LEFT JOIN users m ON p.mentor_id = m.user_id
      WHERE c.user_id ~ '^[0-9]+$' -- Ensure user_id is numeric
    `;
    // Alternative joins if user_id is not numeric:
    // JOIN users u ON c.user_id = u.username
    // JOIN users u ON c.user_id = u.email

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

    // New authorization logic to prevent IDOR
    if (req.user.role === "mentor") {
      // Force filter to the authenticated mentor's own ID
      conditions.push(`p.mentor_id = $${values.length + 1}`);
      values.push(req.user.user_id);

      // Optional: Strictly forbid if query provides a mismatched mentor_id
      if (mentor_id && parseInt(mentor_id) !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "You can only access your own progress reports",
        });
      }

      // Similarly, handle mentor_email if provided (ignore or check)
      if (mentor_email && mentor_email !== req.user.email) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "You can only access your own progress reports",
        });
      }
    } else if (req.user.role === "orgadmin") {
      // Allow flexible filtering for orgadmins
      if (mentor_id) {
        conditions.push(`p.mentor_id = $${values.length + 1}`);
        values.push(parseInt(mentor_id));
      }

      if (mentor_email) {
        conditions.push(`m.email = $${values.length + 1}`);
        values.push(mentor_email);
      }
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY c.updated_at DESC`;

    console.log("Executing query:", query, "with values:", values);
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
    if (error.code === "22P02") {
      // Invalid text representation (non-numeric user_id)
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message:
          "Some chat.user_id values are non-numeric and cannot be cast to integer",
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
