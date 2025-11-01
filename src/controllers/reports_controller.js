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
      pod_info.batch_name,
      pod_info.pod_name,
      COALESCE(
        json_agg(
          json_build_object(
            'user_id', pm.user_id,
            'first_name', pm.first_name,
            'last_name', pm.last_name,
            'email', pm.email,
            'username', pm.username
          )
          ORDER BY pm.user_id
        ) FILTER (WHERE pm.user_id IS NOT NULL),
        '[]'::json
      ) AS mentors,
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
      LEFT JOIN LATERAL (
        -- Select exactly one pod per user (lowest pod_id for determinism; adjust ORDER BY if needed, e.g., p.created_at DESC)
        SELECT p.pod_id, p.pod_name, b.batch_name
        FROM (
          SELECT DISTINCT pu.pod_id
          FROM pod_users pu
          WHERE pu.user_id = u.user_id
        ) pu2
        JOIN pods p ON pu2.pod_id = p.pod_id
        JOIN batches b ON p.batch_id = b.batch_id
        ORDER BY p.pod_id ASC
        LIMIT 1
      ) pod_info ON true
      LEFT JOIN LATERAL (
        -- Mentors for the selected pod
        SELECT
          pm2.user_id,
          pm2.first_name,
          pm2.last_name,
          pm2.email,
          pm2.username
        FROM (
          SELECT u2.user_id, u2.first_name, u2.last_name, u2.email, u2.username
          FROM pod_mentors pm2_inner
          JOIN users u2 ON pm2_inner.mentor_id = u2.user_id
          JOIN roles r ON u2.role_id = r.role_id
          WHERE pm2_inner.pod_id = pod_info.pod_id AND r.role = 'mentor'
        ) pm2
        ORDER BY pm2.user_id
      ) pm ON true
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

    // Authorization logic to prevent IDOR (updated to use pod_info.pod_id)
    if (req.user.role === "mentor") {
      // Force filter to the authenticated mentor's own pods
      conditions.push(`EXISTS (SELECT 1 FROM pod_mentors pm WHERE pm.pod_id = pod_info.pod_id AND pm.mentor_id = $${values.length + 1})`);
      values.push(req.user.user_id);

      // Strictly forbid mismatched mentor_id
      if (mentor_id && parseInt(mentor_id) !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "You can only access your own progress reports",
        });
      }

      // Handle mentor_email
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
        conditions.push(`EXISTS (SELECT 1 FROM pod_mentors pm WHERE pm.pod_id = pod_info.pod_id AND pm.mentor_id = $${values.length + 1})`);
        values.push(parseInt(mentor_id));
      }

      if (mentor_email) {
        conditions.push(`EXISTS (SELECT 1 FROM pod_mentors pm JOIN users mu ON pm.mentor_id = mu.user_id WHERE pm.pod_id = pod_info.pod_id AND mu.email = $${values.length + 1})`);
        values.push(mentor_email);
      }
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` GROUP BY
      c.id, c.user_id, c.status, c.current_stage, c.concept_name, c.created_at, c.updated_at,
      u.first_name, u.last_name, u.email, u.username, o.organization_name,
      pod_info.batch_name, pod_info.pod_name,
      c.explanation_score, c.interpretation_score, c.application_score, c.perspective_score,
      c.empathy_score, c.self_knowledge_score, c.asking_questions_score, c.clarifying_ambiguity_score,
      c.summarizing_confirming_score, c.challenging_ideas_score, c.comparing_concepts_score,
      c.abstract_concrete_score, c.six_facets_average, c.understanding_skills_average, c.final_weighted_score
      ORDER BY c.updated_at DESC`;

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