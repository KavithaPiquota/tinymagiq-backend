const { pool } = require("../config/database");

// Assign an orguser to a pod
const assignUserToPod = async (req, res) => {
  const { pod_name, batch_name, organization_name, login_id } = req.body;

  if (!pod_name || !batch_name || !organization_name || !login_id) {
    return res.status(400).json({ error: "Pod name, batch name, organization name, and login ID are required" });
  }

  try {
    // Look up org_id by organization_name
    const orgCheck = await pool.query(
      `SELECT org_id, max_users_per_batch, max_users_per_pod FROM organizations WHERE name = $1`,
      [organization_name]
    );
    if (orgCheck.rows.length === 0) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const { org_id, max_users_per_batch, max_users_per_pod } = orgCheck.rows[0];

    // Look up batch_id by batch_name and org_id, ensure isActive
    const batchCheck = await pool.query(
      `SELECT batch_id FROM batches WHERE batch_name = $1 AND org_id = $2 AND isActive = TRUE`,
      [batch_name, org_id]
    );
    if (batchCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active batch not found for this organization" });
    }
    const batch_id = batchCheck.rows[0].batch_id;

    // Look up pod_id by pod_name and batch_id, ensure isActive
    const podCheck = await pool.query(
      `SELECT pod_id FROM pods WHERE pod_name = $1 AND batch_id = $2 AND isActive = TRUE`,
      [pod_name, batch_id]
    );
    if (podCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active pod not found for this batch" });
    }
    const pod_id = podCheck.rows[0].pod_id;

    // Look up user_id by login_id, ensure role is orguser
    const userCheck = await pool.query(
      `SELECT user_id FROM users WHERE login_id = $1 AND role = 'orguser' AND org_id = $2`,
      [login_id, org_id]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "Orguser not found for this organization" });
    }
    const user_id = userCheck.rows[0].user_id;

    // Check max_users_per_pod
    const podUserCount = await pool.query(
      `SELECT COUNT(*) AS count FROM pod_users WHERE pod_id = $1`,
      [pod_id]
    );
    if (parseInt(podUserCount.rows[0].count) >= max_users_per_pod) {
      return res.status(400).json({ error: `Pod has reached maximum user limit of ${max_users_per_pod}` });
    }

    // Check max_users_per_batch
    const batchUserCount = await pool.query(
      `SELECT COUNT(pu.user_id) AS count
       FROM pod_users pu
       JOIN pods p ON pu.pod_id = p.pod_id
       WHERE p.batch_id = $1`,
      [batch_id]
    );
    if (parseInt(batchUserCount.rows[0].count) >= max_users_per_batch) {
      return res.status(400).json({ error: `Batch has reached maximum user limit of ${max_users_per_batch}` });
    }

    // Insert into pod_users
    await pool.query(
      `INSERT INTO pod_users (pod_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [pod_id, user_id]
    );

    return res.status(201).json({
      message: "Orguser assigned to pod",
      assignment: { pod_name, batch_name, organization_name, login_id }
    });
  } catch (error) {
    console.error("Error assigning orguser to pod:", error);
    if (error.code === "23505") {
      return res.status(400).json({ error: "Orguser already assigned to this pod" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get orgusers for a pod
const getPodUsers = async (req, res) => {
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

    // Get orgusers assigned to the pod
    const result = await pool.query(
      `SELECT u.user_id, u.login_id, u.role, u.org_id, o.name AS organization_name
       FROM users u
       JOIN pod_users pu ON u.user_id = pu.user_id
       JOIN pods p ON pu.pod_id = p.pod_id
       JOIN organizations o ON u.org_id = o.org_id
       WHERE pu.pod_id = $1 AND u.role = 'orguser'`,
      [pod_id]
    );

    return res.status(200).json({ users: result.rows });
  } catch (error) {
    console.error("Error fetching pod users:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Remove an orguser from a pod
const removeUserFromPod = async (req, res) => {
  const { pod_name, batch_name, organization_name, login_id } = req.body;

  if (!pod_name || !batch_name || !organization_name || !login_id) {
    return res.status(400).json({ error: "Pod name, batch name, organization name, and login ID are required" });
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
      return res.status(404).json({ error: "Active batch not found for this organization" });
    }
    const batch_id = batchCheck.rows[0].batch_id;

    // Look up pod_id by pod_name and batch_id, ensure isActive
    const podCheck = await pool.query(
      `SELECT pod_id FROM pods WHERE pod_name = $1 AND batch_id = $2 AND isActive = TRUE`,
      [pod_name, batch_id]
    );
    if (podCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active pod not found for this batch" });
    }
    const pod_id = podCheck.rows[0].pod_id;

    // Look up user_id by login_id, ensure role is orguser
    const userCheck = await pool.query(
      `SELECT user_id FROM users WHERE login_id = $1 AND role = 'orguser' AND org_id = $2`,
      [login_id, org_id]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "Orguser not found for this organization" });
    }
    const user_id = userCheck.rows[0].user_id;

    // Delete from pod_users
    const result = await pool.query(
      `DELETE FROM pod_users WHERE pod_id = $1 AND user_id = $2`,
      [pod_id, user_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Orguser not assigned to this pod" });
    }

    return res.status(200).json({
      message: "Orguser removed from pod",
      assignment: { pod_name, batch_name, organization_name, login_id }
    });
  } catch (error) {
    console.error("Error removing orguser from pod:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  assignUserToPod,
  getPodUsers,
  removeUserFromPod
};