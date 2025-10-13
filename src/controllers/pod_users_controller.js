const { pool } = require("../config/database");

const getOrganizationIdByIdentifier = async (organization_identifier) => {
  let organization_id;
  if (
    typeof organization_identifier === "string" &&
    !isNaN(parseInt(organization_identifier))
  ) {
    organization_id = parseInt(organization_identifier);
    const result = await pool.query(
      "SELECT organization_id FROM organizations WHERE organization_id = $1",
      [organization_id]
    );
    if (result.rows.length === 0) {
      throw new Error("Organization not found");
    }
  } else {
    const result = await pool.query(
      "SELECT organization_id FROM organizations WHERE organization_name = $1",
      [organization_identifier]
    );
    if (result.rows.length === 0) {
      throw new Error("Organization not found");
    }
    organization_id = result.rows[0].organization_id;
  }
  return organization_id;
};

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
    throw new Error("Cannot assign users to an inactive batch");
  }
  return result.rows[0];
};

const getPodIdByName = async (pod_name, batch_id) => {
  const result = await pool.query(
    "SELECT pod_id, is_active FROM pods WHERE pod_name = $1 AND batch_id = $2",
    [pod_name, batch_id]
  );
  if (result.rows.length === 0) {
    throw new Error("Pod not found");
  }
  if (!result.rows[0].is_active) {
    throw new Error("Cannot assign users to an inactive pod");
  }
  return result.rows[0].pod_id;
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

const getUserByEmail = async (email) => {
  const result = await pool.query(
    "SELECT u.user_id, u.first_name, u.last_name, u.email, u.username, r.role " +
      "FROM users u JOIN roles r ON u.role_id = r.role_id " +
      "WHERE u.email = $1 AND r.role = $2",
    [email, "orguser"]
  );
  if (result.rows.length === 0) {
    throw new Error("User not found or not an orguser");
  }
  return result.rows[0];
};

const getUserById = async (user_id) => {
  const result = await pool.query(
    "SELECT u.user_id, u.first_name, u.last_name, u.email, u.username, r.role " +
      "FROM users u JOIN roles r ON u.role_id = r.role_id " +
      "WHERE u.user_id = $1 AND r.role = $2",
    [user_id, "orguser"]
  );
  if (result.rows.length === 0) {
    throw new Error("User not found or not an orguser");
  }
  return result.rows[0];
};

const validateBatchSize = async (batch_id, batch_size, additional_users) => {
  const result = await pool.query(
    "SELECT COUNT(*) as user_count " +
      "FROM pod_users pu JOIN pods p ON pu.pod_id = p.pod_id " +
      "WHERE p.batch_id = $1 AND p.is_active = TRUE",
    [batch_id]
  );
  const user_count = parseInt(result.rows[0].user_count);
  if (user_count + additional_users > batch_size) {
    throw new Error(
      `Batch size limit of ${batch_size} would be exceeded (current: ${user_count}, trying to add: ${additional_users})`
    );
  }
};

const checkUserAssignment = async (user_id, user_email, batch_id) => {
  const result = await pool.query(
    "SELECT pu.pod_id, p.pod_name FROM pod_users pu JOIN pods p ON pu.pod_id = p.pod_id WHERE pu.user_id = $1 AND pu.batch_id = $2",
    [user_id, batch_id]
  );
  if (result.rows.length > 0) {
    const pod_name = result.rows[0].pod_name;
    throw new Error(
      `User with email ${user_email} is already assigned to pod '${pod_name}' in this batch`
    );
  }
};

const validateUsers = async (users, organization_id, pod_id, batch_id) => {   
  const validatedUsers = [];
  const errors = [];
  for (const user of users) {
    const { user_identifier, first_name, last_name } = user;
    try {
      const userData = await getUserIdByIdentifier(
        user_identifier,
        first_name,
        last_name
      );
      await checkUserAssignment(userData.user_id, userData.email, batch_id); 
      const orgCheck = await pool.query(
        "SELECT 1 FROM users WHERE user_id = $1 AND organization_id = $2",
        [userData.user_id, organization_id]
      );
      if (orgCheck.rows.length === 0) {
        throw new Error(
          `User ${userData.email || userData.username} is not associated with the organization`
        );
      }
      validatedUsers.push(userData);
    } catch (error) {
      console.log(
        `Validation failed for user ${user_identifier || `${first_name} ${last_name}`}: ${error.message}`
      );
      errors.push({
        user: user_identifier || `${first_name} ${last_name}`,
        error: error.message,
      });
    }
  }
  return { validatedUsers, errors };
};

const addUserToPod = async (req, res) => {
  const { organization_name, batch_name, pod_name, users } = req.body;
  let client;

  if (
    !organization_name ||
    !batch_name ||
    !pod_name ||
    !users ||
    !Array.isArray(users) ||
    users.length === 0
  ) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "Organization name, batch name, pod name, and a non-empty array of users (each with user_identifier or first_name and last_name) are required",
    });
  }

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const organization_id = await getOrganizationIdByName(organization_name);
    console.log(`Found organization_id: ${organization_id}`);
    const batch = await getBatchIdByName(batch_name, organization_id);
    console.log(`Found batch_id: ${batch.batch_id}`);
    const pod_id = await getPodIdByName(pod_name, batch.batch_id);
    console.log(`Found pod_id: ${pod_id}`);
    await validateBatchSize(batch.batch_id, batch.batch_size, users.length);
    console.log(`Batch size validated`);

    const { validatedUsers, errors } = await validateUsers(
      users,
      organization_id,
      pod_id,
      batch.batch_id  
    );
    console.log(
      `Validated ${validatedUsers.length} users, ${errors.length} errors`
    );

    if (errors.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "One or more users are already assigned to a pod in this batch", 
        errors,
      });
    }

    if (validatedUsers.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "No valid users to assign",
      });
    }

    const assignedUsers = [];
    const podUserValues = validatedUsers
      .map((user) => `(${pod_id}, ${user.user_id}, ${batch.batch_id})`)  
      .join(", ");
    const podUserQuery = `
      INSERT INTO pod_users (pod_id, user_id, batch_id)
      VALUES ${podUserValues}
      RETURNING pod_user_id, user_id
    `;
    let podUserResult;
    try {
      podUserResult = await client.query(podUserQuery);
      console.log(`Inserted ${podUserResult.rows.length} pod_users`);
    } catch (error) {
      if (error.code === "23505") {
        console.log(
          "Duplicate key violation in pod_users, checking constraints"
        );
        // Fallback: Insert one by one to identify problematic users
        podUserResult = { rows: [] };
        for (const user of validatedUsers) {
          try {
            const singleInsert = await client.query(
              "INSERT INTO pod_users (pod_id, user_id, batch_id) VALUES ($1, $2, $3) RETURNING pod_user_id, user_id",  // ADD batch_id
              [pod_id, user.user_id, batch.batch_id]   
            );
            podUserResult.rows.push(singleInsert.rows[0]);
            console.log(`Inserted user_id: ${user.user_id}`);
          } catch (singleError) {
            console.log(
              `Failed to insert user_id: ${user.user_id}: ${singleError.message}`
            );
            errors.push({
              user: user.email || user.username,
              error: singleError.message,
            });
          }
        }
        if (errors.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            success: false,
            error: "Conflict",
            message: "One or more users are already assigned to a pod in this batch",  
            errors,
          });
        }
      } else {
        throw error; // Rethrow non-constraint errors
      }
    }

    const conceptsResult = await client.query(
      "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.learning_objective, c.level_1_name, c.level_1_description, c.level_2_name, c.level_2_description, c.level_3_name, c.level_3_description, c.level_4_name, c.level_4_description, c.level_5_name, c.level_5_description, c.number_of_scenarios, c.facet_focus, c.introduction_context, c.progression_description, c.task_questions, c.reflection_questions, c.strength_checklist, c.is_active, c.updated_at " +
        "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1 ORDER BY bc.sequence_order",
      [batch.batch_id]
    );
    const concept_ids = conceptsResult.rows.map((row) => row.concept_id);
    console.log(`Found ${concept_ids.length} concepts for batch`);

    if (concept_ids.length > 0) {
      const progressValues = podUserResult.rows
        .map((row) => validatedUsers.find((u) => u.user_id === row.user_id))
        .flatMap((user) =>
          concept_ids.map(
            (concept_id) => `(${user.user_id}, ${concept_id}, 'not started')`
          )
        )
        .join(", ");
      const progressQuery = `
        INSERT INTO user_concept_progress (user_id, concept_id, status)
        VALUES ${progressValues}
        ON CONFLICT (user_id, concept_id) DO NOTHING
      `;
      await client.query(progressQuery);
      console.log(`Inserted progress for ${podUserResult.rows.length} users`);
    }

    const podResult = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "WHERE p.pod_id = $1",
      [pod_id]
    );
    const pod = podResult.rows[0];
    const batchConcepts = await client.query(
      "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.learning_objective, c.level_1_name, c.level_1_description, c.level_2_name, c.level_2_description, c.level_3_name, c.level_3_description, c.level_4_name, c.level_4_description, c.level_5_name, c.level_5_description, c.number_of_scenarios, c.facet_focus, c.introduction_context, c.progression_description, c.task_questions, c.reflection_questions, c.strength_checklist, c.is_active, c.updated_at " +
        "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1 ORDER BY bc.sequence_order",
      [batch.batch_id]
    );
    const mentorResult = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.username 
       FROM pod_mentors pm 
       JOIN users u ON pm.mentor_id = u.user_id 
       JOIN roles r ON u.role_id = r.role_id 
       WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
      [pod_id]
    );

    const responseData = await Promise.all(
      podUserResult.rows.map(async (row) => {
        const user = validatedUsers.find((u) => u.user_id === row.user_id);
        const progressResult = await client.query(
          "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
          [user.user_id]
        );
        return {
          pod_user_id: row.pod_user_id,
          user: {
            user_id: user.user_id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            username: user.username,
          },
          pod: {
            pod_id: pod.pod_id,
            pod_name: pod.pod_name,
            is_active: pod.is_active,
            created_at: pod.created_at,
            mentors: mentorResult.rows,
          },
          batch: {
            batch_id: batch.batch_id,
            batch_name: pod.batch_name,
            batch_size: pod.batch_size,
            is_active: pod.batch_is_active,
            organization_name: pod.organization_name,
            concepts: batchConcepts.rows,
          },
          progress: progressResult.rows,
        };
      })
    );

    await client.query("COMMIT");
    res.status(201).json({
      success: true,
      data: responseData,
      message: "Users assigned to pod successfully",
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (
      [
        "Organization not found",
        "Batch not found",
        "Pod not found",
        "Cannot assign users to an inactive batch",
        "Cannot assign users to an inactive pod",
        "Batch size limit reached",
        "User not found or not an orguser",
        "User identifier (email, username, or first_name and last_name) is required",
      ].includes(error.message) ||
      error.message.includes("is not associated with the organization")
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    if (error.message.includes("is already assigned to pod")) {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "One or more users are already assigned to a pod in this batch",   
        errors: [{ user: null, error: error.message }],
      });
    }
    console.error("Error assigning users to pod:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  } finally {
    if (client) client.release();
  }
};
const getUserBatches = async (req, res) => {
  const { user_id } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT DISTINCT 
        b.batch_id, 
        b.batch_name, 
        b.batch_size,
        b.is_active,
        o.organization_name,
        p.pod_id,
        p.pod_name,
        pu.pod_user_id,
        pu.created_at as assigned_at
      FROM pod_users pu
      JOIN pods p ON pu.pod_id = p.pod_id
      JOIN batches b ON pu.batch_id = b.batch_id
      JOIN organizations o ON b.organization_id = o.organization_id
      WHERE pu.user_id = $1
      ORDER BY pu.created_at DESC`,
      [user_id]
    );
    
    res.json({
      success: true,
      data: result.rows,
      message: result.rows.length > 0 
        ? `User is assigned to ${result.rows.length} batch(es)` 
        : "User is not assigned to any batches"
    });
  } catch (error) {
    console.error("Error fetching user batches:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};
const removeUserFromBatch = async (req, res) => {
  const { user_id, batch_id } = req.params;
  
  try {
    // Check if user is assigned to this batch
    const checkResult = await pool.query(
      `SELECT pu.pod_user_id, p.pod_name, b.batch_name 
       FROM pod_users pu 
       JOIN pods p ON pu.pod_id = p.pod_id 
       JOIN batches b ON pu.batch_id = b.batch_id
       WHERE pu.user_id = $1 AND pu.batch_id = $2`,
      [user_id, batch_id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User is not assigned to this batch"
      });
    }
    
    const { pod_name, batch_name } = checkResult.rows[0];
    
    // Delete the assignment
    await pool.query(
      "DELETE FROM pod_users WHERE user_id = $1 AND batch_id = $2",
      [user_id, batch_id]
    );
    
    res.json({
      success: true,
      message: `User removed from pod '${pod_name}' in batch '${batch_name}' successfully`
    });
  } catch (error) {
    console.error("Error removing user from batch:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const updatePodUser = async (req, res) => {
  const { pod_user_id } = req.params;
  const { pod_name, batch_name, organization_name, progress } = req.body;

  if (!pod_name && !batch_name && !organization_name && !progress) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "At least one field to update (pod_name, batch_name, organization_name, or progress) is required",
    });
  }

  try {
    let pod_id, batch_id;
    if (organization_name || batch_name || pod_name) {
      const currentPodUser = await pool.query(
        "SELECT pu.pod_id, p.batch_id, b.organization_id FROM pod_users pu JOIN pods p ON pu.pod_id = p.pod_id JOIN batches b ON p.batch_id = b.batch_id WHERE pu.pod_user_id = $1",
        [pod_user_id]
      );
      if (currentPodUser.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "Pod user not found",
        });
      }
      const currentOrgId = currentPodUser.rows[0].organization_id;
      if (organization_name) {
        const newOrgId = await getOrganizationIdByName(organization_name);
        if (newOrgId !== currentOrgId) {
          return res.status(400).json({
            success: false,
            error: "Bad request",
            message: "Cannot change organization for existing pod user",
          });
        }
      }
      if (batch_name) {
        const newBatch = await getBatchIdByName(batch_name, currentOrgId);
        batch_id = newBatch.batch_id;
        if (batch_id !== currentPodUser.rows[0].batch_id) {
          return res.status(400).json({
            success: false,
            error: "Bad request",
            message: "Cannot change batch for existing pod user",
          });
        }
      }
      if (pod_name) {
        const newPodId = await getPodIdByName(pod_name, currentPodUser.rows[0].batch_id);
        if (newPodId !== currentPodUser.rows[0].pod_id) {
          return res.status(400).json({
            success: false,
            error: "Bad request",
            message: "Cannot change pod for existing pod user",
          });
        }
      }
      pod_id = currentPodUser.rows[0].pod_id;
    } else {
      const currentPodUser = await pool.query(
        "SELECT pu.pod_id FROM pod_users pu WHERE pu.pod_user_id = $1",
        [pod_user_id]
      );
      if (currentPodUser.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "Pod user not found",
        });
      }
      pod_id = currentPodUser.rows[0].pod_id;
    }

    let updatedData = {};
    if (progress && Array.isArray(progress)) {
      for (const prog of progress) {
        if (!prog.concept_id || prog.status === undefined) {
          return res.status(400).json({
            success: false,
            error: "Bad request",
            message: "Each progress item must have concept_id and status",
          });
        }
        await pool.query(
          "INSERT INTO user_concept_progress (user_id, concept_id, status) VALUES ($1, $2, $3) ON CONFLICT (user_id, concept_id) DO UPDATE SET status = $3, updated_at = CURRENT_TIMESTAMP",
          [/* Get user_id from pod_user_id */ await (async () => {
            const userFromPod = await pool.query("SELECT user_id FROM pod_users WHERE pod_user_id = $1", [pod_user_id]);
            return userFromPod.rows[0].user_id;
          })(), prog.concept_id, prog.status]
        );
      }
      updatedData.progress = "Updated successfully";
    }

    res.json({
      success: true,
      data: updatedData,
      message: "Pod user updated successfully",
    });
  } catch (error) {
    if (
      [
        "Organization not found",
        "Batch not found",
        "Pod not found",
        "Cannot assign users to an inactive batch",
        "Cannot assign users to an inactive pod",
      ].includes(error.message)
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error updating pod user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getOrguserDetails = async (req, res) => {
  const { identifier } = req.params;
  const { first_name, last_name } = req.query;

  try {
    const user = await getUserIdByIdentifier(identifier, first_name, last_name);
    
    // Get ALL pod assignments for this user
    const podUserResult = await pool.query(
      "SELECT pu.pod_user_id, pu.pod_id, pu.batch_id, pu.created_at AS pod_assigned_at " +
        "FROM pod_users pu WHERE pu.user_id = $1 ORDER BY pu.created_at DESC",
      [user.user_id]
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
      batches: [], // NEW: Array with batch info + pod info
    };

    if (podUserResult.rows.length > 0) {
      const allProgressResult = await pool.query(
        "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
        [user.user_id]
      );
      responseData.progress = allProgressResult.rows;

      for (let i = 0; i < podUserResult.rows.length; i++) {
        const podUser = podUserResult.rows[i];
        
        const podResult = await pool.query(
          "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_id, o.organization_name " +
            "FROM pods p " +
            "JOIN batches b ON p.batch_id = b.batch_id " +
            "JOIN organizations o ON p.organization_id = o.organization_id " +
            "WHERE p.pod_id = $1 AND p.is_active = TRUE AND b.is_active = TRUE",
          [podUser.pod_id]
        );

        if (podResult.rows.length > 0) {
          const pod = podResult.rows[0];

          const batchConcepts = await pool.query(
            "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.learning_objective, c.level_1_name, c.level_1_description, c.level_2_name, c.level_2_description, c.level_3_name, c.level_3_description, c.level_4_name, c.level_4_description, c.level_5_name, c.level_5_description, c.number_of_scenarios, c.facet_focus, c.introduction_context, c.progression_description, c.task_questions, c.reflection_questions, c.strength_checklist, c.is_active, c.updated_at " +
              "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1 ORDER BY bc.sequence_order",
            [pod.batch_id]
          );

          const mentorResult = await pool.query(
            `SELECT u.user_id, u.first_name, u.last_name, u.email, u.username 
             FROM pod_mentors pm 
             JOIN users u ON pm.mentor_id = u.user_id 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
            [pod.pod_id]
          );

          // NEW STRUCTURE: batch info at top level with pod nested inside
          const batchData = {
            batch_id: pod.batch_id,
            batch_name: pod.batch_name,
            batch_size: pod.batch_size,
            is_active: pod.batch_is_active,
            organization_id: pod.organization_id,
            organization_name: pod.organization_name,
            concepts: batchConcepts.rows,
            pod: {
              pod_user_id: podUser.pod_user_id,
              pod_id: pod.pod_id,
              pod_name: pod.pod_name,
              pod_is_active: pod.is_active,
              pod_created_at: pod.created_at,
              pod_assigned_at: podUser.pod_assigned_at,
              mentors: mentorResult.rows,
            },
          };

          responseData.batches.push(batchData);

          // First assignment goes to top level for backward compatibility
          if (i === 0) {
            responseData.pod = {
              pod_user_id: podUser.pod_user_id,
              pod_id: pod.pod_id,
              pod_name: pod.pod_name,
              is_active: pod.is_active,
              created_at: pod.created_at,
              pod_assigned_at: podUser.pod_assigned_at,
              mentors: mentorResult.rows,
            };
            responseData.batch = {
              batch_id: pod.batch_id,
              batch_name: pod.batch_name,
              batch_size: pod.batch_size,
              is_active: pod.batch_is_active,
              organization_id: pod.organization_id,
              organization_name: pod.organization_name,
              concepts: batchConcepts.rows,
            };
          }
        }
      }
    }

    res.json({
      success: true,
      data: responseData,
      message: "Orguser details fetched successfully",
    });
  } catch (error) {
    if (["User not found or not an orguser"].includes(error.message)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching orguser details:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getOrguserDetailsByEmail = async (req, res) => {
  const { email } = req.params;

  try {
    const user = await getUserByEmail(email);
    
    const podUserResult = await pool.query(
      "SELECT pu.pod_user_id, pu.pod_id, pu.batch_id, pu.created_at AS pod_assigned_at " +
        "FROM pod_users pu WHERE pu.user_id = $1 ORDER BY pu.created_at DESC",
      [user.user_id]
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
      batches: [],
    };

    if (podUserResult.rows.length > 0) {
      const allProgressResult = await pool.query(
        "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
        [user.user_id]
      );
      responseData.progress = allProgressResult.rows;

      for (let i = 0; i < podUserResult.rows.length; i++) {
        const podUser = podUserResult.rows[i];
        
        const podResult = await pool.query(
          "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_id, o.organization_name " +
            "FROM pods p " +
            "JOIN batches b ON p.batch_id = b.batch_id " +
            "JOIN organizations o ON p.organization_id = o.organization_id " +
            "WHERE p.pod_id = $1 AND p.is_active = TRUE AND b.is_active = TRUE",
          [podUser.pod_id]
        );

        if (podResult.rows.length > 0) {
          const pod = podResult.rows[0];

          const batchConcepts = await pool.query(
            "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.learning_objective, c.level_1_name, c.level_1_description, c.level_2_name, c.level_2_description, c.level_3_name, c.level_3_description, c.level_4_name, c.level_4_description, c.level_5_name, c.level_5_description, c.number_of_scenarios, c.facet_focus, c.introduction_context, c.progression_description, c.task_questions, c.reflection_questions, c.strength_checklist, c.is_active, c.updated_at " +
              "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1 ORDER BY bc.sequence_order",
            [pod.batch_id]
          );

          const mentorResult = await pool.query(
            `SELECT u.user_id, u.first_name, u.last_name, u.email, u.username 
             FROM pod_mentors pm 
             JOIN users u ON pm.mentor_id = u.user_id 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
            [pod.pod_id]
          );

          const batchData = {
            batch_id: pod.batch_id,
            batch_name: pod.batch_name,
            batch_size: pod.batch_size,
            is_active: pod.batch_is_active,
            organization_id: pod.organization_id,
            organization_name: pod.organization_name,
            concepts: batchConcepts.rows,
            pod: {
              pod_user_id: podUser.pod_user_id,
              pod_id: pod.pod_id,
              pod_name: pod.pod_name,
              pod_is_active: pod.is_active,
              pod_created_at: pod.created_at,
              pod_assigned_at: podUser.pod_assigned_at,
              mentors: mentorResult.rows,
            },
          };

          responseData.batches.push(batchData);

          if (i === 0) {
            responseData.pod = {
              pod_user_id: podUser.pod_user_id,
              pod_id: pod.pod_id,
              pod_name: pod.pod_name,
              is_active: pod.is_active,
              created_at: pod.created_at,
              pod_assigned_at: podUser.pod_assigned_at,
              mentors: mentorResult.rows,
            };
            responseData.batch = {
              batch_id: pod.batch_id,
              batch_name: pod.batch_name,
              batch_size: pod.batch_size,
              is_active: pod.batch_is_active,
              organization_id: pod.organization_id,
              organization_name: pod.organization_name,
              concepts: batchConcepts.rows,
            };
          }
        }
      }
    }

    res.json({
      success: true,
      data: responseData,
      message: "Orguser details fetched successfully",
    });
  } catch (error) {
    if (["User not found or not an orguser"].includes(error.message)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching orguser details by email:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getOrguserDetailsByUserId = async (req, res) => {
  const { user_id } = req.params;

  try {
    const user = await getUserById(user_id);
    
    const podUserResult = await pool.query(
      "SELECT pu.pod_user_id, pu.pod_id, pu.batch_id, pu.created_at AS pod_assigned_at " +
        "FROM pod_users pu WHERE pu.user_id = $1 ORDER BY pu.created_at DESC",
      [user.user_id]
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
      batches: [],
    };

    if (podUserResult.rows.length > 0) {
      const allProgressResult = await pool.query(
        "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
        [user.user_id]
      );
      responseData.progress = allProgressResult.rows;

      for (let i = 0; i < podUserResult.rows.length; i++) {
        const podUser = podUserResult.rows[i];
        
        const podResult = await pool.query(
          "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_id, o.organization_name " +
            "FROM pods p " +
            "JOIN batches b ON p.batch_id = b.batch_id " +
            "JOIN organizations o ON p.organization_id = o.organization_id " +
            "WHERE p.pod_id = $1 AND p.is_active = TRUE AND b.is_active = TRUE",
          [podUser.pod_id]
        );

        if (podResult.rows.length > 0) {
          const pod = podResult.rows[0];

          const batchConcepts = await pool.query(
            "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.learning_objective, c.level_1_name, c.level_1_description, c.level_2_name, c.level_2_description, c.level_3_name, c.level_3_description, c.level_4_name, c.level_4_description, c.level_5_name, c.level_5_description, c.number_of_scenarios, c.facet_focus, c.introduction_context, c.progression_description, c.task_questions, c.reflection_questions, c.strength_checklist, c.is_active, c.updated_at " +
              "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1 ORDER BY bc.sequence_order",
            [pod.batch_id]
          );

          const mentorResult = await pool.query(
            `SELECT u.user_id, u.first_name, u.last_name, u.email, u.username 
             FROM pod_mentors pm 
             JOIN users u ON pm.mentor_id = u.user_id 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE pm.pod_id = $1 AND r.role = 'mentor'`,
            [pod.pod_id]
          );

          const batchData = {
            batch_id: pod.batch_id,
            batch_name: pod.batch_name,
            batch_size: pod.batch_size,
            is_active: pod.batch_is_active,
            organization_id: pod.organization_id,
            organization_name: pod.organization_name,
            concepts: batchConcepts.rows,
            pod: {
              pod_user_id: podUser.pod_user_id,
              pod_id: pod.pod_id,
              pod_name: pod.pod_name,
              pod_is_active: pod.is_active,
              pod_created_at: pod.created_at,
              pod_assigned_at: podUser.pod_assigned_at,
              mentors: mentorResult.rows,
            },
          };

          responseData.batches.push(batchData);

          if (i === 0) {
            responseData.pod = {
              pod_user_id: podUser.pod_user_id,
              pod_id: pod.pod_id,
              pod_name: pod.pod_name,
              is_active: pod.is_active,
              created_at: pod.created_at,
              pod_assigned_at: podUser.pod_assigned_at,
              mentors: mentorResult.rows,
            };
            responseData.batch = {
              batch_id: pod.batch_id,
              batch_name: pod.batch_name,
              batch_size: pod.batch_size,
              is_active: pod.batch_is_active,
              organization_id: pod.organization_id,
              organization_name: pod.organization_name,
              concepts: batchConcepts.rows,
            };
          }
        }
      }
    }

    res.json({
      success: true,
      data: responseData,
      message: "Orguser details fetched successfully",
    });
  } catch (error) {
    if (["User not found or not an orguser"].includes(error.message)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching orguser details by user_id:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUnassignedOrgusers = async (req, res) => {
  const { organization_identifier } = req.params;

  try {
    const organization_id = await getOrganizationIdByIdentifier(
      organization_identifier
    );
    const result = await pool.query(
      "SELECT u.user_id, u.first_name, u.last_name, u.email, u.username " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN pod_users pu ON u.user_id = pu.user_id " +
        "WHERE u.organization_id = $1 AND r.role = $2 AND pu.user_id IS NULL",
      [organization_id, "orguser"]
    );

    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "Unassigned orgusers fetched successfully"
          : "No unassigned orgusers found",
    });
  } catch (error) {
    if (["Organization not found"].includes(error.message)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching unassigned orgusers:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getAllOrgusersWithAssignmentStatus = async (req, res) => {
  const { organization_identifier } = req.params;

  try {
    const organization_id = await getOrganizationIdByIdentifier(
      organization_identifier
    );
    const result = await pool.query(
      `
      SELECT u.user_id, u.first_name, u.last_name, u.email, u.username,
        pu.pod_user_id, pu.pod_id, pu.created_at AS pod_assigned_at,
        p.pod_name, p.is_active AS pod_is_active, p.created_at AS pod_created_at,
        b.batch_id, b.batch_name, b.batch_size, b.is_active AS batch_is_active,
        o.organization_name,
        COALESCE(
          json_agg(
            json_build_object(
              'user_id', mu.user_id,
              'first_name', mu.first_name,
              'last_name', mu.last_name,
              'email', mu.email,
              'username', mu.username
            )
            ORDER BY mu.user_id
          ) FILTER (WHERE mu.user_id IS NOT NULL),
          '[]'::json
        ) AS mentors
      FROM users u
      JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN pod_users pu ON u.user_id = pu.user_id
      LEFT JOIN pods p ON pu.pod_id = p.pod_id
      LEFT JOIN batches b ON p.batch_id = b.batch_id
      LEFT JOIN organizations o ON p.organization_id = o.organization_id
      LEFT JOIN LATERAL (
        SELECT mu.user_id, mu.first_name, mu.last_name, mu.email, mu.username
        FROM pod_mentors pm
        JOIN users mu ON pm.mentor_id = mu.user_id
        JOIN roles mr ON mu.role_id = mr.role_id
        WHERE pm.pod_id = p.pod_id AND mr.role = 'mentor'
        ORDER BY mu.user_id
      ) mu ON true
      WHERE u.organization_id = $1 AND r.role = $2
      GROUP BY u.user_id, u.first_name, u.last_name, u.email, u.username, pu.pod_user_id, pu.pod_id, pu.created_at, p.pod_name, p.is_active, p.created_at, b.batch_id, b.batch_name, b.batch_size, b.is_active, o.organization_name
      ORDER BY u.first_name, u.last_name
      `,
      [organization_id, "orguser"]
    );

    const users = await Promise.all(
      result.rows.map(async (row) => {
        const userData = {
          user_id: row.user_id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          username: row.username,
          assigned: !!row.pod_user_id,
        };

        if (row.pod_user_id) {
          const batchConcepts = await pool.query(
            "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.learning_objective, c.level_1_name, c.level_1_description, c.level_2_name, c.level_2_description, c.level_3_name, c.level_3_description, c.level_4_name, c.level_4_description, c.level_5_name, c.level_5_description, c.number_of_scenarios, c.facet_focus, c.introduction_context, c.progression_description, c.task_questions, c.reflection_questions, c.strength_checklist, c.is_active, c.updated_at " +
              "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1 ORDER BY bc.sequence_order",
            [row.batch_id]
          );
          const progressResult = await pool.query(
            "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
            [row.user_id]
          );

          userData.pod = {
            pod_user_id: row.pod_user_id,
            pod_id: row.pod_id,
            pod_name: row.pod_name,
            is_active: row.pod_is_active,
            created_at: row.pod_created_at,
            pod_assigned_at: row.pod_assigned_at,
            mentors: row.mentors || [],
          };
          userData.batch = {
            batch_id: row.batch_id,
            batch_name: row.batch_name,
            batch_size: row.batch_size,
            is_active: row.batch_is_active,
            organization_name: row.organization_name,
            concepts: batchConcepts.rows,
          };
          userData.progress = progressResult.rows;
        }

        return userData;
      })
    );

    res.json({
      success: true,
      data: users,
      message:
        users.length > 0
          ? "Orgusers fetched successfully"
          : "No orgusers found",
    });
  } catch (error) {
    if (["Organization not found"].includes(error.message)) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error fetching all orgusers with assignment status:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  addUserToPod,
  updatePodUser,
  getOrguserDetails,
  getOrguserDetailsByEmail,
  getOrguserDetailsByUserId,
  getUnassignedOrgusers,
  getAllOrgusersWithAssignmentStatus,
  getUserBatches,            
  removeUserFromBatch,      
};