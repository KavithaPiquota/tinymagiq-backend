const { pool } = require("../config/database");

const getOrgadminDetails = async (email) => {
  const result = await pool.query(
    "SELECT u.user_id, u.organization_id, o.organization_name " +
      "FROM users u JOIN roles r ON u.role_id = r.role_id " +
      "JOIN organizations o ON u.organization_id = o.organization_id " +
      "WHERE u.email = $1 AND r.role = $2",
    [email, "orgadmin"]
  );
  if (result.rows.length === 0) {
    throw new Error("Orgadmin not found or not a valid orgadmin");
  }
  return result.rows[0];
};

const getBatchesByOrgadmin = async (req, res) => {
  const { email } = req.params;
  try {
    const orgadmin = await getOrgadminDetails(email);
    const batchesResult = await pool.query(
      "SELECT b.batch_id, b.batch_name, b.batch_size, b.is_active, b.created_at, o.organization_name " +
        "FROM batches b JOIN organizations o ON b.organization_id = o.organization_id " +
        "WHERE b.organization_id = $1 AND b.is_active = TRUE",
      [orgadmin.organization_id]
    );
    const batches = batchesResult.rows;
    for (let batch of batches) {
      // Get pod count
      const podsResult = await pool.query(
        "SELECT COUNT(*) as pod_count FROM pods WHERE batch_id = $1 AND is_active = TRUE",
        [batch.batch_id]
      );
      batch.pod_count = parseInt(podsResult.rows[0].pod_count);

      // Get user count
      const usersResult = await pool.query(
        "SELECT COUNT(DISTINCT pu.user_id) as user_count " +
          "FROM pod_users pu JOIN pods p ON pu.pod_id = p.pod_id " +
          "WHERE p.batch_id = $1 AND p.is_active = TRUE",
        [batch.batch_id]
      );
      batch.user_count = parseInt(usersResult.rows[0].user_count);

      // Get assigned concepts
      const conceptsResult = await pool.query(
        "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id " +
          "WHERE bc.batch_id = $1",
        [batch.batch_id]
      );
      batch.concepts = conceptsResult.rows;
      batch.concept_count = conceptsResult.rows.length; // Add concept count
    }
    res.json({
      success: true,
      data: batches,
      message: `Batches for organization ${orgadmin.organization_name} fetched successfully`,
    });
  } catch (error) {
    if (error.message === "Orgadmin not found or not a valid orgadmin") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching batches for orgadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getPodsByOrgadmin = async (req, res) => {
  const { email } = req.params;
  try {
    const orgadmin = await getOrgadminDetails(email);
    const podsResult = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name, " +
        "u.user_id AS mentor_id, u.first_name AS mentor_first_name, u.last_name AS mentor_last_name, u.email AS mentor_email " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "JOIN users u ON p.mentor_id = u.user_id " +
        "WHERE p.organization_id = $1 AND p.is_active = TRUE AND b.is_active = TRUE",
      [orgadmin.organization_id]
    );
    const pods = podsResult.rows;
    for (let pod of pods) {
      // Get user count for each pod
      const usersResult = await pool.query(
        "SELECT COUNT(*) as user_count FROM pod_users WHERE pod_id = $1",
        [pod.pod_id]
      );
      pod.user_count = parseInt(usersResult.rows[0].user_count);

      // Get assigned concepts
      const conceptsResult = await pool.query(
        "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id " +
          "WHERE bc.batch_id = $1",
        [pod.batch_id]
      );
      pod.batch = {
        batch_id: pod.batch_id,
        batch_name: pod.batch_name,
        batch_size: pod.batch_size,
        is_active: pod.batch_is_active,
        organization_name: pod.organization_name,
        concepts: conceptsResult.rows,
      };
      pod.mentor = {
        user_id: pod.mentor_id,
        first_name: pod.mentor_first_name,
        last_name: pod.mentor_last_name,
        email: pod.mentor_email,
      };
      delete pod.batch_name;
      delete pod.batch_size;
      delete pod.batch_is_active;
      delete pod.organization_name;
      delete pod.mentor_id;
      delete pod.mentor_first_name;
      delete pod.mentor_last_name;
      delete pod.mentor_email;
    }
    res.json({
      success: true,
      data: pods,
      message: `Pods for organization ${orgadmin.organization_name} fetched successfully`,
    });
  } catch (error) {
    if (error.message === "Orgadmin not found or not a valid orgadmin") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching pods for orgadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUsersByOrgadmin = async (req, res) => {
  const { email } = req.params;
  try {
    const orgadmin = await getOrgadminDetails(email);
    const usersResult = await pool.query(
      "SELECT u.user_id, u.first_name, u.last_name, u.email " +
        "FROM users u JOIN roles r ON u.role_id = r.role_id " +
        "WHERE u.organization_id = $1 AND r.role = $2",
      [orgadmin.organization_id, "orguser"]
    );
    res.json({
      success: true,
      data: usersResult.rows,
      message: `Orgusers for organization ${orgadmin.organization_name} fetched successfully`,
    });
  } catch (error) {
    if (error.message === "Orgadmin not found or not a valid orgadmin") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching orgusers for orgadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getProgressByOrgadmin = async (req, res) => {
  const { email } = req.params;
  try {
    const orgadmin = await getOrgadminDetails(email);
    const batchesResult = await pool.query(
      "SELECT b.batch_id, b.batch_name, b.batch_size " +
        "FROM batches b WHERE b.organization_id = $1 AND b.is_active = TRUE",
      [orgadmin.organization_id]
    );
    const progressData = [];
    for (let batch of batchesResult.rows) {
      const podsResult = await pool.query(
        "SELECT p.pod_id, p.pod_name " +
          "FROM pods p WHERE p.batch_id = $1 AND p.is_active = TRUE",
        [batch.batch_id]
      );
      const batchConceptsResult = await pool.query(
        "SELECT c.concept_id, c.concept_name " +
          "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id " +
          "WHERE bc.batch_id = $1",
        [batch.batch_id]
      );
      const totalConcepts = batchConceptsResult.rows.length;
      const batchProgress = {
        batch_id: batch.batch_id,
        batch_name: batch.batch_name,
        batch_size: batch.batch_size,
        pods: [],
        total_concepts: totalConcepts,
      };
      for (let pod of podsResult.rows) {
        const usersResult = await pool.query(
          "SELECT u.user_id, u.email, u.first_name, u.last_name " +
            "FROM pod_users pu JOIN users u ON pu.user_id = u.user_id " +
            "WHERE pu.pod_id = $1",
          [pod.pod_id]
        );
        const podProgress = {
          pod_id: pod.pod_id,
          pod_name: pod.pod_name,
          users: [],
        };
        for (let user of usersResult.rows) {
          const progressResult = await pool.query(
            "SELECT ucp.status, ucp.updated_at, c.concept_name " +
              "FROM user_concept_progress ucp JOIN concepts c ON ucp.concept_id = c.concept_id " +
              "WHERE ucp.user_id = $1 AND ucp.concept_id IN (SELECT concept_id FROM batch_concepts WHERE batch_id = $2)",
            [user.user_id, batch.batch_id]
          );
          const completedConcepts = progressResult.rows.filter(
            (p) => p.status === "completed"
          ).length;
          const progressPercentage =
            totalConcepts > 0
              ? ((completedConcepts / totalConcepts) * 100).toFixed(2)
              : 0;
          podProgress.users.push({
            user_id: user.user_id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            completed_concepts: completedConcepts,
            total_concepts: totalConcepts,
            progress_percentage: progressPercentage,
          });
        }
        batchProgress.pods.push(podProgress);
      }
      progressData.push(batchProgress);
    }
    res.json({
      success: true,
      data: progressData,
      message: `Progress for organization ${orgadmin.organization_name} fetched successfully`,
    });
  } catch (error) {
    if (error.message === "Orgadmin not found or not a valid orgadmin") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching progress for orgadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUserProgressByOrgadmin = async (req, res) => {
  const { email, user_email } = req.params;
  try {
    const orgadmin = await getOrgadminDetails(email);
    const userResult = await pool.query(
      "SELECT u.user_id, u.first_name, u.last_name, u.email " +
        "FROM users u JOIN roles r ON u.role_id = r.role_id " +
        "WHERE u.email = $1 AND u.organization_id = $2 AND r.role = $3",
      [user_email, orgadmin.organization_id, "orguser"]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "Orguser not found or not in this organization",
      });
    }
    const user = userResult.rows[0];
    const podResult = await pool.query(
      "SELECT p.pod_id, p.pod_name, b.batch_id, b.batch_name " +
        "FROM pod_users pu JOIN pods p ON pu.pod_id = p.pod_id " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "WHERE pu.user_id = $1 AND p.is_active = TRUE AND b.is_active = TRUE",
      [user.user_id]
    );
    const progressResult = await pool.query(
      "SELECT ucp.status, ucp.updated_at, c.concept_id, c.concept_name, c.description " +
        "FROM user_concept_progress ucp JOIN concepts c ON ucp.concept_id = c.concept_id " +
        "WHERE ucp.user_id = $1 AND ucp.concept_id IN (SELECT concept_id FROM batch_concepts bc JOIN pods p ON bc.batch_id = p.batch_id WHERE p.pod_id IN (SELECT pod_id FROM pod_users WHERE user_id = $1))",
      [user.user_id]
    );
    const totalConcepts = progressResult.rows.length;
    const completedConcepts = progressResult.rows.filter(
      (p) => p.status === "completed"
    ).length;
    const progressPercentage =
      totalConcepts > 0
        ? ((completedConcepts / totalConcepts) * 100).toFixed(2)
        : 0;
    res.json({
      success: true,
      data: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        pod: podResult.rows[0]
          ? {
              pod_id: podResult.rows[0].pod_id,
              pod_name: podResult.rows[0].pod_name,
              batch_id: podResult.rows[0].batch_id,
              batch_name: podResult.rows[0].batch_name,
            }
          : null,
        progress: progressResult.rows,
        total_concepts: totalConcepts,
        completed_concepts: completedConcepts,
        progress_percentage: progressPercentage,
      },
      message: `Progress for orguser ${user_email} fetched successfully`,
    });
  } catch (error) {
    if (error.message === "Orgadmin not found or not a valid orgadmin") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching user progress for orgadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  getBatchesByOrgadmin,
  getPodsByOrgadmin,
  getUsersByOrgadmin,
  getProgressByOrgadmin,
  getUserProgressByOrgadmin,
};
