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

const getBatchIdByName = async (batch_name, organization_id) => {
  const result = await pool.query(
    "SELECT batch_id, batch_size, is_active FROM batches WHERE batch_name = $1 AND organization_id = $2",
    [batch_name, organization_id]
  );
  if (result.rows.length === 0) {
    throw new Error("Batch not found");
  }
  if (!result.rows[0].is_active) {
    throw new Error("Cannot create or update pod for an inactive batch");
  }
  return result.rows[0];
};

const getMentorIdByEmailOrId = async (mentor_email, mentor_id) => {
  let result;
  if (mentor_id) {
    result = await pool.query(
      "SELECT u.user_id, u.first_name, u.last_name, u.email FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = $1 AND r.role = $2",
      [mentor_id, "mentor"]
    );
  } else if (mentor_email) {
    result = await pool.query(
      "SELECT u.user_id, u.first_name, u.last_name, u.email FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = $1 AND r.role = $2",
      [mentor_email, "mentor"]
    );
  } else {
    throw new Error("Mentor email or ID is required");
  }
  if (result.rows.length === 0) {
    throw new Error("Mentor not found or not a valid mentor");
  }
  return result.rows[0];
};

const addPod = async (req, res) => {
  const {
    organization_name,
    batch_name,
    
    pod_name,
    is_active = true,
    mentors,
  } = req.body;

  if (
    !organization_name ||
    !batch_name ||
    !pod_name ||
    (!mentors || !Array.isArray(mentors) || mentors.length === 0)
  ) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "Organization name, batch name, pod name, and at least one mentor identifier are required",
    });
  }

  try {
    const organization_id = await getOrganizationIdByName(organization_name);
    const batch = await getBatchIdByName(batch_name, organization_id);
    const mentorObjects = [];
    for (const ident of mentors) {
      let mentor_email = null;
      let mentor_id = null;
      if (typeof ident === "string") {
        const num = parseInt(ident, 10);
        if (isNaN(num)) {
          mentor_email = ident;
        } else {
          mentor_id = num;
        }
      } else if (typeof ident === "number" && !isNaN(ident)) {
        mentor_id = ident;
      } else {
        return res.status(400).json({
          success: false,
          error: "Bad request",
          message: `Invalid mentor identifier: ${ident}`,
        });
      }
    const mentor = await getMentorIdByEmailOrId(mentor_email, mentor_id);

      mentorObjects.push(mentor);
    }

    const result = await pool.query(
      "INSERT INTO pods (organization_id, batch_id, pod_name, is_active) VALUES ($1, $2, $3, $4) RETURNING *",
      [organization_id, batch.batch_id, pod_name, is_active]
    );

    const pod = result.rows[0];
    for (const mentor of mentorObjects) {
      try {
        await pool.query(
          "INSERT INTO pod_mentors (pod_id, mentor_id) VALUES ($1, $2)",
          [pod.pod_id, mentor.user_id]
        );
      } catch (error) {
        if (error.code === "23505") {
          console.log("Duplicate mentor skipped");
        } else {
          throw error;
        }
      }
    }
    const batchResult = await pool.query(
      "SELECT b.*, o.organization_name FROM batches b JOIN organizations o ON b.organization_id = o.organization_id WHERE b.batch_id = $1",
      [pod.batch_id]
    );
    const conceptsResult = await pool.query(
      "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
      [pod.batch_id]
    );

    res.status(201).json({
      success: true,
      data: {
        ...pod,
        batch: { ...batchResult.rows[0], concepts: conceptsResult.rows },
        mentors: mentorObjects.map(m => ({
          user_id: m.user_id,
          first_name: m.first_name,
          last_name: m.last_name,
          email: m.email,
        })),
      },
      message: "Pod created successfully",
    });
  } catch (error) {
    if (
      [
        "Organization not found",
        "Batch not found",
        "Mentor not found or not a valid mentor",
        "Cannot create or update pod for an inactive batch",
      ].includes(error.message)
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Pod name already exists",
      });
    }
    console.error("Error creating pod:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const updatePod = async (req, res) => {
  const { pod_id } = req.params;
  const {
    organization_name,
    batch_name,
    pod_name,
    is_active,
    mentors,
  } = req.body;

  let hasUpdate = false;
  if (organization_name !== undefined) hasUpdate = true;
  if (batch_name !== undefined) hasUpdate = true;
  if (pod_name !== undefined) hasUpdate = true;
  if (is_active !== undefined) hasUpdate = true;
  if (mentors !== undefined) hasUpdate = true;

  if (!hasUpdate) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "At least one field to update is required",
    });
  }

  try {
    let organization_id, batch;
    if (organization_name !== undefined || batch_name !== undefined) {
      if (organization_name !== undefined) {
        organization_id = await getOrganizationIdByName(organization_name);
      }
      if (batch_name !== undefined) {
        const currentPodResult = await pool.query(
          "SELECT organization_id FROM pods WHERE pod_id = $1",
          [pod_id]
        );
        if (currentPodResult.rows.length === 0) {
          throw new Error("Pod not found");
        }
        const orgForBatch =
          organization_id || currentPodResult.rows[0].organization_id;
        batch = await getBatchIdByName(batch_name, orgForBatch);
      }
    }

    const fields = [];
    const values = [];
    let index = 1;

    if (organization_name !== undefined) {
      fields.push(`organization_id = $${index++}`);
      values.push(organization_id);
    }
    if (batch_name !== undefined) {
      fields.push(`batch_id = $${index++}`);
      values.push(batch.batch_id);
    }
    if (pod_name !== undefined) {
      fields.push(`pod_name = $${index++}`);
      values.push(pod_name);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(is_active);
    }

    let pod;
    if (fields.length > 0) {
      values.push(pod_id);
      const query = `UPDATE pods SET ${fields.join(", ")} WHERE pod_id = $${index} AND is_active = TRUE RETURNING *`;
      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "Pod not found or inactive",
        });
      }
      pod = result.rows[0];
    } else {
      const result = await pool.query(
        "SELECT * FROM pods WHERE pod_id = $1 AND is_active = TRUE",
        [pod_id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "Pod not found or inactive",
        });
      }
      pod = result.rows[0];
    }

    if (mentors !== undefined) {
      await pool.query("DELETE FROM pod_mentors WHERE pod_id = $1", [
        pod.pod_id,
      ]);
      if (Array.isArray(mentors) && mentors.length > 0) {
        for (const ident of mentors) {
          let mentor_email = null;
          let mentor_id = null;
          if (typeof ident === "string") {
            const num = parseInt(ident, 10);
            if (isNaN(num)) {
              mentor_email = ident;
            } else {
              mentor_id = num;
            }
          } else if (typeof ident === "number" && !isNaN(ident)) {
            mentor_id = ident;
          } else {
            return res.status(400).json({
              success: false,
              error: "Bad request",
              message: `Invalid mentor identifier: ${ident}`,
            });
          }
          const mentor = await getMentorIdByEmailOrId(mentor_email, mentor_id);
          try {
            await pool.query(
              "INSERT INTO pod_mentors (pod_id, mentor_id) VALUES ($1, $2)",
              [pod.pod_id, mentor.user_id]
            );
          } catch (error) {
            if (error.code === "23505") {
              console.log("Duplicate mentor skipped");
            } else {
              throw error;
            }
          }
        }
      }
    }

    const batchResult = await pool.query(
      "SELECT b.*, o.organization_name FROM batches b JOIN organizations o ON b.organization_id = o.organization_id WHERE b.batch_id = $1",
      [pod.batch_id]
    );
    if (batchResult.rows[0].is_active === false) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Cannot fetch or update pod for an inactive batch",
      });
    }
    const conceptsResult = await pool.query(
      "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
      [pod.batch_id]
    );
    const mentorResult = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email 
       FROM pod_mentors pm 
       JOIN users u ON pm.mentor_id = u.user_id 
       JOIN roles r ON u.role_id = r.role_id 
       WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
      [pod.pod_id]
    );

    res.json({
      success: true,
      data: {
        ...pod,
        batch: { ...batchResult.rows[0], concepts: conceptsResult.rows },
        mentors: mentorResult.rows,
      },
      message: "Pod updated successfully",
    });
  } catch (error) {
    if (
      [
        "Organization not found",
        "Batch not found",
        "Mentor not found or not a valid mentor",
        "Cannot create or update pod for an inactive batch",
      ].includes(error.message)
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Pod name already exists",
      });
    }
    console.error("Error updating pod:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getAllPods = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "WHERE p.is_active = TRUE AND b.is_active = TRUE"
    );
    const pods = result.rows;
    for (let pod of pods) {
      const conceptsResult = await pool.query(
        "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
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
     const mentorResult = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email 
         FROM pod_mentors pm 
         JOIN users u ON pm.mentor_id = u.user_id 
         JOIN roles r ON u.role_id = r.role_id 
         WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
        [pod.pod_id]
      );
      pod.mentors = mentorResult.rows;
      delete pod.batch_name;
      delete pod.batch_size;
      delete pod.batch_is_active;
      delete pod.organization_name;
      
    }
    res.json({
      success: true,
      data: pods,
      message: "Pods fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching pods:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getPodsByOrganization = async (req, res) => {
  const { organization_name } = req.params;
  try {
    const organization_id = await getOrganizationIdByName(organization_name);
    const result = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "JOIN users u ON p.mentor_id = u.user_id " +
        "WHERE p.organization_id = $1 AND p.is_active = TRUE AND b.is_active = TRUE",
      [organization_id]
    );
    const pods = result.rows;
    for (let pod of pods) {
      const conceptsResult = await pool.query(
        "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
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
      const mentorResult = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email 
         FROM pod_mentors pm 
         JOIN users u ON pm.mentor_id = u.user_id 
         JOIN roles r ON u.role_id = r.role_id 
         WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
        [pod.pod_id]
      );
      pod.mentors = mentorResult.rows;
      delete pod.batch_name;
      delete pod.batch_size;
      delete pod.batch_is_active;
      delete pod.organization_name;
    }
    res.json({
      success: true,
      data: pods,
      message: `Pods for organization ${organization_name} fetched successfully`,
    });
  } catch (error) {
    if (error.message === "Organization not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Organization not found",
      });
    }
    console.error("Error fetching pods by organization:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getPodsByMentorEmail = async (req, res) => {
  const { mentor_email } = req.params;
  try {
    const mentor = await getMentorIdByEmailOrId(mentor_email, null);
    const result = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "WHERE EXISTS (SELECT 1 FROM pod_mentors pm WHERE pm.pod_id = p.pod_id AND pm.mentor_id = $1) " +
        "AND p.is_active = TRUE AND b.is_active = TRUE",
      [mentor.user_id]
    );
    const pods = result.rows;
    for (let pod of pods) {
      const conceptsResult = await pool.query(
        "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
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
      const mentorResult = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email 
         FROM pod_mentors pm 
         JOIN users u ON pm.mentor_id = u.user_id 
         JOIN roles r ON u.role_id = r.role_id 
         WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
        [pod.pod_id]
      );
      pod.mentors = mentorResult.rows;
      delete pod.batch_name;
      delete pod.batch_size;
      delete pod.batch_is_active;
      delete pod.organization_name;
    }
    res.json({
      success: true,
      data: pods,
      message: `Pods for mentor ${mentor_email} fetched successfully`,
    });
  } catch (error) {
    if (error.message === "Mentor not found or not a valid mentor") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Mentor not found or not a valid mentor",
      });
    }
    console.error("Error fetching pods by mentor email:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getPodsByMentorId = async (req, res) => {
  const { mentor_id } = req.params;
  try {
    const mentor = await getMentorIdByEmailOrId(null, mentor_id);
    const result = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "WHERE EXISTS (SELECT 1 FROM pod_mentors pm WHERE pm.pod_id = p.pod_id AND pm.mentor_id = $1) " +
        "AND p.is_active = TRUE AND b.is_active = TRUE",
      [mentor.user_id]
    );
    const pods = result.rows;
    for (let pod of pods) {
      const conceptsResult = await pool.query(
        "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
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
      const mentorResult = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email 
         FROM pod_mentors pm 
         JOIN users u ON pm.mentor_id = u.user_id 
         JOIN roles r ON u.role_id = r.role_id 
         WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
        [pod.pod_id]
      );
      pod.mentors = mentorResult.rows;
      delete pod.batch_name;
      delete pod.batch_size;
      delete pod.batch_is_active;
      delete pod.organization_name;
    }
    res.json({
      success: true,
      data: pods,
      message: `Pods for mentor ID ${mentor_id} fetched successfully`,
    });
  } catch (error) {
    if (error.message === "Mentor not found or not a valid mentor") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Mentor not found or not a valid mentor",
      });
    }
    console.error("Error fetching pods by mentor ID:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getPodByName = async (req, res) => {
  const { pod_name } = req.params;
  try {
    const result = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "WHERE p.pod_name = $1 AND p.is_active = TRUE AND b.is_active = TRUE",
      [pod_name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "Pod not found or inactive, or batch is inactive",
      });
    }
    const pod = result.rows[0];
    const conceptsResult = await pool.query(
      "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
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
    const mentorResult = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email 
       FROM pod_mentors pm 
       JOIN users u ON pm.mentor_id = u.user_id 
       JOIN roles r ON u.role_id = r.role_id 
       WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
      [pod.pod_id]
    );
    pod.mentors = mentorResult.rows;
    delete pod.batch_name;
    delete pod.batch_size;
    delete pod.batch_is_active;
    delete pod.organization_name;
    res.json({
      success: true,
      data: pod,
      message: "Pod fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching pod by name:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getPodById = async (req, res) => {
  const { pod_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "WHERE p.pod_id = $1 AND p.is_active = TRUE AND b.is_active = TRUE",
      [pod_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "Pod not found or inactive, or batch is inactive",
      });
    }
    const pod = result.rows[0];
    const conceptsResult = await pool.query(
      "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
      [pod.batch_id]
    );
    const orgusersResult = await pool.query(
      "SELECT u.user_id, u.first_name, u.last_name, u.email, u.username " +
        "FROM pod_users pu " +
        "JOIN users u ON pu.user_id = u.user_id " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "WHERE pu.pod_id = $1 AND r.role = $2",
      [pod.pod_id, "orguser"]
    );
    const mentorResult = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email 
       FROM pod_mentors pm 
       JOIN users u ON pm.mentor_id = u.user_id 
       JOIN roles r ON u.role_id = r.role_id 
       WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
      [pod.pod_id]
    );
    res.json({
      success: true,
      data: {
        pod_id: pod.pod_id,
        organization_id: pod.organization_id,
        organization_name: pod.organization_name,
        batch_id: pod.batch_id,
        batch_name: pod.batch_name,
        pod_name: pod.pod_name,
        is_active: pod.is_active,
        created_at: pod.created_at,
        batch: {
          batch_id: pod.batch_id,
          batch_name: pod.batch_name,
          batch_size: pod.batch_size,
          is_active: pod.batch_is_active,
          organization_name: pod.organization_name,
          concepts: conceptsResult.rows,
        },
        mentors: mentorResult.rows,
        orgusers: orgusersResult.rows,
      },
      message: "Pod fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching pod by ID:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  addPod,
  updatePod,
  getAllPods,
  getPodsByOrganization,
  getPodsByMentorEmail,
  getPodsByMentorId,
  getPodByName,
  getPodById,
};
