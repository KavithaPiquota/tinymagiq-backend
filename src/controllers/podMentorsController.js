const { pool } = require("../config/database");

// Assign a mentor to a pod
const assignMentorToPod = async (req, res) => {
  const { pod_name, batch_name, organization_name, mentor_email } = req.body;

  if (!pod_name || !batch_name || !organization_name || !mentor_email) {
    return res.status(400).json({
      error:
        "Pod name, batch name, organization name, and mentor email are required",
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

    // Look up batch_id by batch_name and org_id, ensure isActive
    const batchCheck = await pool.query(
      `SELECT batch_id FROM batches WHERE batch_name = $1 AND org_id = $2 AND isActive = TRUE`,
      [batch_name, org_id]
    );
    if (batchCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Active batch not found for this organization" });
    }
    const batch_id = batchCheck.rows[0].batch_id;

    // Look up pod_id by pod_name and batch_id, ensure isActive
    const podCheck = await pool.query(
      `SELECT pod_id FROM pods WHERE pod_name = $1 AND batch_id = $2 AND isActive = TRUE`,
      [pod_name, batch_id]
    );
    if (podCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Active pod not found for this batch" });
    }
    const pod_id = podCheck.rows[0].pod_id;

    // Look up mentor_id by mentor_email, ensure isActive
    const mentorCheck = await pool.query(
      `SELECT mentor_id FROM mentors WHERE mentor_email = $1 AND isActive = TRUE`,
      [mentor_email]
    );
    if (mentorCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active mentor not found" });
    }
    const mentor_id = mentorCheck.rows[0].mentor_id;

    // Insert into pod_mentors
    await pool.query(
      `INSERT INTO pod_mentors (pod_id, mentor_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [pod_id, mentor_id]
    );

    return res.status(201).json({
      message: "Mentor assigned to pod",
      assignment: { pod_name, batch_name, organization_name, mentor_email },
    });
  } catch (error) {
    console.error("Error assigning mentor to pod:", error);
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ error: "Mentor already assigned to this pod" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get mentors for a pod
const getPodMentors = async (req, res) => {
  const { pod_id } = req.params;

  try {
    // Verify pod exists and is active
    const podCheck = await pool.query(
      `SELECT pod_id FROM pods WHERE pod_id = $1 AND isActive = TRUE`,
      [pod_id]
    );
    if (podCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active pod not found" });
    }

    // Get mentors assigned to the pod
    const result = await pool.query(
      `SELECT m.mentor_id, m.mentor_name, m.mentor_email, m.isActive
       FROM mentors m
       JOIN pod_mentors pm ON m.mentor_id = pm.mentor_id
       JOIN pods p ON pm.pod_id = p.pod_id
       WHERE pm.pod_id = $1`,
      [pod_id]
    );

    return res.status(200).json({ mentors: result.rows });
  } catch (error) {
    console.error("Error fetching pod mentors:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Remove a mentor from a pod
const removeMentorFromPod = async (req, res) => {
  const { pod_name, batch_name, organization_name, mentor_email } = req.body;

  if (!pod_name || !batch_name || !organization_name || !mentor_email) {
    return res.status(400).json({
      error:
        "Pod name, batch name, organization name, and mentor email are required",
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

    // Look up batch_id by batch_name and org_id, ensure isActive
    const batchCheck = await pool.query(
      `SELECT batch_id FROM batches WHERE batch_name = $1 AND org_id = $2 AND isActive = TRUE`,
      [batch_name, org_id]
    );
    if (batchCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Active batch not found for this organization" });
    }
    const batch_id = batchCheck.rows[0].batch_id;

    // Look up pod_id by pod_name and batch_id, ensure isActive
    const podCheck = await pool.query(
      `SELECT pod_id FROM pods WHERE pod_name = $1 AND batch_id = $2 AND isActive = TRUE`,
      [pod_name, batch_id]
    );
    if (podCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Active pod not found for this batch" });
    }
    const pod_id = podCheck.rows[0].pod_id;

    // Look up mentor_id by mentor_email
    const mentorCheck = await pool.query(
      `SELECT mentor_id FROM mentors WHERE mentor_email = $1`,
      [mentor_email]
    );
    if (mentorCheck.rows.length === 0) {
      return res.status(404).json({ error: "Mentor not found" });
    }
    const mentor_id = mentorCheck.rows[0].mentor_id;

    // Delete from pod_mentors
    const result = await pool.query(
      `DELETE FROM pod_mentors WHERE pod_id = $1 AND mentor_id = $2`,
      [pod_id, mentor_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Mentor not assigned to this pod" });
    }

    return res.status(200).json({
      message: "Mentor removed from pod",
      assignment: { pod_name, batch_name, organization_name, mentor_email },
    });
  } catch (error) {
    console.error("Error removing mentor from pod:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  assignMentorToPod,
  getPodMentors,
  removeMentorFromPod,
};
