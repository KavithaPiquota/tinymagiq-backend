const { pool } = require("../config/database");

const getMentorIdByIdentifier = async (mentor_identifier) => {
  const result = await pool.query(
    "SELECT u.user_id, u.first_name, u.last_name, u.email, u.username, r.role " +
      "FROM users u JOIN roles r ON u.role_id = r.role_id " +
      "WHERE (u.email = $1 OR u.username = $1) AND r.role = $2",
    [mentor_identifier, "mentor"]
  );
  if (result.rows.length === 0) {
    throw new Error("Mentor not found");
  }
  return result.rows[0].user_id;
};

const getUserIdByIdentifier = async (identifier, first_name, last_name) => {
  let result;
  if (identifier) {
    result = await pool.query(
      "SELECT u.user_id, u.first_name, u.last_name, u.email, u.username, r.role " +
        "FROM users u JOIN roles r ON u.role_id = r.role_id " +
        "WHERE (u.email = $1 OR u.username = $1) AND r.role = $2",
      [identifier, "orguser"]
    );
  } else if (first_name && last_name) {
    result = await pool.query(
      "SELECT u.user_id, u.first_name, u.last_name, u.email, u.username, r.role " +
        "FROM users u JOIN roles r ON u.role_id = r.role_id " +
        "WHERE u.first_name = $1 AND u.last_name = $2 AND r.role = $3",
      [first_name, last_name, "orguser"]
    );
  } else {
    throw new Error(
      "User identifier (email, username, or first_name and last_name) is required"
    );
  }
  if (result.rows.length === 0) {
    throw new Error("User not found or not an orguser");
  }
  return result.rows[0];
};

const getMentorPods = async (req, res) => {
  const { mentor_identifier } = req.params;
  try {
    const mentor_id = await getMentorIdByIdentifier(mentor_identifier);
    const result = await pool.query(
      "SELECT p.pod_id, p.pod_name, p.is_active AS pod_is_active, p.created_at AS pod_created_at, " +
        "b.batch_id, b.batch_name, b.batch_size, b.is_active AS batch_is_active, " +
        "o.organization_id, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "WHERE p.mentor_id = $1",
      [mentor_id]
    );
    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "Mentor pods fetched successfully"
          : "No pods assigned to mentor",
    });
  } catch (error) {
    if (["Mentor not found"].includes(error.message)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching mentor pods:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getMentorPodConcepts = async (req, res) => {
  const { mentor_identifier } = req.params;
  try {
    const mentor_id = await getMentorIdByIdentifier(mentor_identifier);
    const podsResult = await pool.query(
      "SELECT p.pod_id, p.pod_name, p.is_active AS pod_is_active, p.created_at AS pod_created_at, " +
        "b.batch_id, b.batch_name, b.batch_size, b.is_active AS batch_is_active, " +
        "o.organization_id, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "WHERE p.mentor_id = $1",
      [mentor_id]
    );
    const pods = await Promise.all(
      podsResult.rows.map(async (pod) => {
        const conceptsResult = await pool.query(
          "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
          [pod.batch_id]
        );
        return {
          pod_id: pod.pod_id,
          pod_name: pod.pod_name,
          is_active: pod.pod_is_active,
          created_at: pod.pod_created_at,
          batch: {
            batch_id: pod.batch_id,
            batch_name: pod.batch_name,
            batch_size: pod.batch_size,
            is_active: pod.batch_is_active,
            organization: {
              organization_id: pod.organization_id,
              organization_name: pod.organization_name,
            },
            concepts: conceptsResult.rows,
          },
        };
      })
    );
    res.json({
      success: true,
      data: pods,
      message:
        pods.length > 0
          ? "Mentor pod concepts fetched successfully"
          : "No pods or concepts assigned to mentor",
    });
  } catch (error) {
    if (["Mentor not found"].includes(error.message)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching mentor pod concepts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getMentorOrguserProgress = async (req, res) => {
  const { mentor_identifier } = req.params;
  try {
    const mentor_id = await getMentorIdByIdentifier(mentor_identifier);
    const podsResult = await pool.query(
      "SELECT p.pod_id, p.pod_name, p.is_active AS pod_is_active, p.created_at AS pod_created_at, " +
        "b.batch_id, b.batch_name, b.batch_size, b.is_active AS batch_is_active, " +
        "o.organization_id, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "WHERE p.mentor_id = $1",
      [mentor_id]
    );
    const pods = await Promise.all(
      podsResult.rows.map(async (pod) => {
        const usersResult = await pool.query(
          "SELECT u.user_id, u.first_name, u.last_name, u.email, u.username " +
            "FROM users u JOIN pod_users pu ON u.user_id = pu.user_id " +
            "WHERE pu.pod_id = $1",
          [pod.pod_id]
        );
        const users = await Promise.all(
          usersResult.rows.map(async (user) => {
            const progressResult = await pool.query(
              "SELECT ucp.concept_id, ucp.status, ucp.updated_at, c.concept_name " +
                "FROM user_concept_progress ucp JOIN concepts c ON ucp.concept_id = c.concept_id " +
                "WHERE ucp.user_id = $1 AND ucp.concept_id IN (" +
                "SELECT bc.concept_id FROM batch_concepts bc WHERE bc.batch_id = $2)",
              [user.user_id, pod.batch_id]
            );
            return {
              user_id: user.user_id,
              first_name: user.first_name,
              last_name: user.last_name,
              email: user.email,
              username: user.username,
              progress: progressResult.rows,
            };
          })
        );
        return {
          pod_id: pod.pod_id,
          pod_name: pod.pod_name,
          is_active: pod.pod_is_active,
          created_at: pod.pod_created_at,
          batch: {
            batch_id: pod.batch_id,
            batch_name: pod.batch_name,
            batch_size: pod.batch_size,
            is_active: pod.batch_is_active,
            organization: {
              organization_id: pod.organization_id,
              organization_name: pod.organization_name,
            },
          },
          users,
        };
      })
    );
    res.json({
      success: true,
      data: pods,
      message:
        pods.length > 0
          ? "Mentor orguser progress fetched successfully"
          : "No pods or users assigned to mentor",
    });
  } catch (error) {
    if (["Mentor not found"].includes(error.message)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching mentor orguser progress:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getMentorOrguserDetails = async (req, res) => {
  const { mentor_identifier, identifier } = req.params;
  const { first_name, last_name } = req.query;
  try {
    const mentor_id = await getMentorIdByIdentifier(mentor_identifier);
    const user = await getUserIdByIdentifier(identifier, first_name, last_name);
    const podUserResult = await pool.query(
      "SELECT pu.pod_user_id, pu.pod_id, pu.created_at AS pod_assigned_at " +
        "FROM pod_users pu " +
        "JOIN pods p ON pu.pod_id = p.pod_id " +
        "WHERE pu.user_id = $1 AND p.mentor_id = $2",
      [user.user_id, mentor_id]
    );
    let responseData = {
      user: {
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        username: user.username,
      },
      pod: null,
      batch: null,
      progress: [],
    };
    if (podUserResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Orguser is not assigned to any of the mentor's pods",
      });
    }
    const podUser = podUserResult.rows[0];
    const podResult = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name, u.user_id AS mentor_id, u.first_name AS mentor_first_name, u.last_name AS mentor_last_name, u.email AS mentor_email " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "JOIN users u ON p.mentor_id = u.user_id " +
        "WHERE p.pod_id = $1 AND p.is_active = TRUE AND b.is_active = TRUE",
      [podUser.pod_id]
    );
    if (podResult.rows.length > 0) {
      const pod = podResult.rows[0];
      const batchConcepts = await pool.query(
        "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
        [pod.batch_id]
      );
      const progressResult = await pool.query(
        "SELECT ucp.concept_id, ucp.status, ucp.updated_at, c.concept_name " +
          "FROM user_concept_progress ucp JOIN concepts c ON ucp.concept_id = c.concept_id " +
          "WHERE ucp.user_id = $1 AND ucp.concept_id IN (" +
          "SELECT bc.concept_id FROM batch_concepts bc WHERE bc.batch_id = $2)",
        [user.user_id, pod.batch_id]
      );
      responseData.pod = {
        pod_user_id: podUser.pod_user_id,
        pod_id: pod.pod_id,
        pod_name: pod.pod_name,
        is_active: pod.is_active,
        created_at: pod.created_at,
        pod_assigned_at: podUser.pod_assigned_at,
        mentor: {
          user_id: pod.mentor_id,
          first_name: pod.mentor_first_name,
          last_name: pod.mentor_last_name,
          email: pod.mentor_email,
        },
      };
      responseData.batch = {
        batch_id: pod.batch_id,
        batch_name: pod.batch_name,
        batch_size: pod.batch_size,
        is_active: pod.batch_is_active,
        organization_name: pod.organization_name,
        concepts: batchConcepts.rows,
      };
      responseData.progress = progressResult.rows;
    }
    res.json({
      success: true,
      data: responseData,
      message: "Orguser details fetched successfully",
    });
  } catch (error) {
    if (
      [
        "Mentor not found",
        "User not found or not an orguser",
        "User identifier (email, username, or first_name and last_name) is required",
      ].includes(error.message)
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    if (
      error.message === "Orguser is not assigned to any of the mentor's pods"
    ) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: error.message,
      });
    }
    console.error("Error fetching mentor orguser details:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  getMentorPods,
  getMentorPodConcepts,
  getMentorOrguserProgress,
  getMentorOrguserDetails,
};
