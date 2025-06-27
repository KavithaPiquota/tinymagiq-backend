const { pool } = require("../config/database");

// Assign orguser to pod
const assignOrguserToPod = async (req, res) => {
  const { pod_name, batch_name, organization_name, email } = req.body;

  if (!pod_name || !batch_name || !organization_name || !email) {
    return res.status(400).json({
      error: "Pod name, batch name, organization name, and email are required",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if organization exists
    const orgResult = await client.query(
      `SELECT org_id, max_users_per_batch, max_users_per_pod
       FROM organizations
       WHERE name = $1`,
      [organization_name]
    );
    if (orgResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Organization not found" });
    }
    const { org_id, max_users_per_batch, max_users_per_pod } =
      orgResult.rows[0];

    // Check if batch exists and is active
    const batchResult = await client.query(
      `SELECT batch_id
       FROM batches
       WHERE batch_name = $1 AND org_id = $2 AND isActive = TRUE`,
      [batch_name, org_id]
    );
    if (batchResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Active batch not found for this organization" });
    }
    const { batch_id } = batchResult.rows[0];

    // Check if pod exists and is active
    const podResult = await client.query(
      `SELECT pod_id
       FROM pods
       WHERE pod_name = $1 AND batch_id = $2 AND isActive = TRUE`,
      [pod_name, batch_id]
    );
    if (podResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Active pod not found for this batch" });
    }
    const { pod_id } = podResult.rows[0];

    // Check if user exists and is orguser
    const userResult = await client.query(
      `SELECT user_id
       FROM users
       WHERE email = $1 AND org_id = $2 AND role = 'orguser' AND isActive = TRUE`,
      [email, org_id]
    );
    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Active orguser not found for this organization" });
    }
    const { user_id } = userResult.rows[0];

    // Check if user is already assigned to another pod in the same batch
    const existingAssignment = await client.query(
      `SELECT pu.pod_id
       FROM pod_users pu
       JOIN pods p ON pu.pod_id = p.pod_id
       WHERE pu.user_id = $1 AND p.batch_id = $2`,
      [user_id, batch_id]
    );
    if (existingAssignment.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "User already assigned to a pod in this batch" });
    }

    // Check pod user count
    const podUserCount = await client.query(
      `SELECT COUNT(*) AS count
       FROM pod_users
       WHERE pod_id = $1`,
      [pod_id]
    );
    if (parseInt(podUserCount.rows[0].count) >= max_users_per_pod) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Pod has reached maximum user capacity" });
    }

    // Check batch user count
    const batchUserCount = await client.query(
      `SELECT COUNT(DISTINCT pu.user_id) AS count
       FROM pod_users pu
       JOIN pods p ON pu.pod_id = p.pod_id
       WHERE p.batch_id = $1`,
      [batch_id]
    );
    if (parseInt(batchUserCount.rows[0].count) >= max_users_per_batch) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Batch has reached maximum user capacity" });
    }

    // Assign user to pod
    await client.query(
      `INSERT INTO pod_users (pod_id, user_id)
       VALUES ($1, $2)`,
      [pod_id, user_id]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      message: "Orguser assigned to pod",
      assignment: { pod_name, batch_name, organization_name, email },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error assigning orguser to pod:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get orgusers for a pod
const getOrgusersForPod = async (req, res) => {
  const { pod_id } = req.params;

  try {
    const podResult = await pool.query(
      `SELECT pod_id
       FROM pods
       WHERE pod_id = $1 AND isActive = TRUE`,
      [pod_id]
    );
    if (podResult.rows.length === 0) {
      return res.status(404).json({ error: "Active pod not found" });
    }

    const result = await pool.query(
      `SELECT u.user_id, u.email, u.role, u.org_id, o.name AS organization_name
       FROM pod_users pu
       JOIN users u ON pu.user_id = u.user_id
       JOIN organizations o ON u.org_id = o.org_id
       WHERE pu.pod_id = $1 AND u.isActive = TRUE`,
      [pod_id]
    );

    return res.status(200).json({ users: result.rows });
  } catch (error) {
    console.error("Error fetching orgusers for pod:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Remove orguser from pod
const removeOrguserFromPod = async (req, res) => {
  const { pod_name, batch_name, organization_name, email } = req.body;

  if (!pod_name || !batch_name || !organization_name || !email) {
    return res.status(400).json({
      error: "Pod name, batch name, organization name, and email are required",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if organization exists
    const orgResult = await client.query(
      `SELECT org_id
       FROM organizations
       WHERE name = $1`,
      [organization_name]
    );
    if (orgResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Organization not found" });
    }
    const { org_id } = orgResult.rows[0];

    // Check if batch exists and is active
    const batchResult = await client.query(
      `SELECT batch_id
       FROM batches
       WHERE batch_name = $1 AND org_id = $2 AND isActive = TRUE`,
      [batch_name, org_id]
    );
    if (batchResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Active batch not found for this organization" });
    }
    const { batch_id } = batchResult.rows[0];

    // Check if pod exists and is active
    const podResult = await client.query(
      `SELECT pod_id
       FROM pods
       WHERE pod_name = $1 AND batch_id = $2 AND isActive = TRUE`,
      [pod_name, batch_id]
    );
    if (podResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Active pod not found for this batch" });
    }
    const { pod_id } = podResult.rows[0];

    // Check if user exists
    const userResult = await client.query(
      `SELECT user_id
       FROM users
       WHERE email = $1 AND org_id = $2 AND isActive = TRUE`,
      [email, org_id]
    );
    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Active user not found for this organization" });
    }
    const { user_id } = userResult.rows[0];

    // Check if user is assigned to the pod
    const assignmentResult = await client.query(
      `DELETE FROM pod_users
       WHERE pod_id = $1 AND user_id = $2
       RETURNING pod_id`,
      [pod_id, user_id]
    );
    if (assignmentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not assigned to this pod" });
    }

    await client.query("COMMIT");
    return res.status(200).json({
      message: "Orguser removed from pod",
      assignment: { pod_name, batch_name, organization_name, email },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error removing orguser from pod:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

module.exports = {
  assignOrguserToPod,
  getOrgusersForPod,
  removeOrguserFromPod,
};
