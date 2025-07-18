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

const checkUserAssignment = async (user_id, user_email) => {
  const result = await pool.query(
    "SELECT pu.pod_id, p.pod_name FROM pod_users pu JOIN pods p ON pu.pod_id = p.pod_id WHERE pu.user_id = $1",
    [user_id]
  );
  if (result.rows.length > 0) {
    const pod_name = result.rows[0].pod_name;
    throw new Error(
      `User with email ${user_email} is already assigned to pod '${pod_name}'`
    );
  }
};

const validateUsers = async (users, organization_id, pod_id) => {
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
      await checkUserAssignment(userData.user_id, userData.email);
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
      pod_id
    );
    console.log(
      `Validated ${validatedUsers.length} users, ${errors.length} errors`
    );

    if (errors.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "One or more users are already assigned to a pod",
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
      .map((user) => `(${pod_id}, ${user.user_id})`)
      .join(", ");
    const podUserQuery = `
      INSERT INTO pod_users (pod_id, user_id)
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
              "INSERT INTO pod_users (pod_id, user_id) VALUES ($1, $2) RETURNING pod_user_id, user_id",
              [pod_id, user.user_id]
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
            message: "One or more users are already assigned to a pod",
            errors,
          });
        }
      } else {
        throw error; // Rethrow non-constraint errors
      }
    }

    const conceptsResult = await client.query(
      "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.is_active, c.updated_at " +
        "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
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
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name, u.user_id AS mentor_id, u.first_name AS mentor_first_name, u.last_name AS mentor_last_name, u.email AS mentor_email " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "JOIN users u ON p.mentor_id = u.user_id " +
        "WHERE p.pod_id = $1",
      [pod_id]
    );
    const pod = podResult.rows[0];
    const batchConcepts = await client.query(
      "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.is_active, c.updated_at " +
        "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
      [batch.batch_id]
    );

    const responseData = await Promise.all(
      assignedUsers.map(async ({ pod_user_id, user }) => {
        const progressResult = await client.query(
          "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
          [user.user_id]
        );
        return {
          pod_user_id,
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
            mentor: {
              user_id: pod.mentor_id,
              first_name: pod.mentor_first_name,
              last_name: pod.mentor_last_name,
              email: pod.mentor_email,
            },
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
        message: "One or more users are already assigned to a pod",
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
          message: "Pod user assignment not found",
        });
      }
      const {
        pod_id: current_pod_id,
        batch_id: current_batch_id,
        organization_id: current_organization_id,
      } = currentPodUser.rows[0];

      const organization_id = organization_name
        ? await getOrganizationIdByName(organization_name)
        : current_organization_id;
      const batch = batch_name
        ? await getBatchIdByName(batch_name, organization_id)
        : await pool
            .query(
              "SELECT batch_id, batch_size, is_active FROM batches WHERE batch_id = $1",
              [current_batch_id]
            )
            .then((res) => res.rows[0]);
      batch_id = batch.batch_id;
      pod_id = pod_name
        ? await getPodIdByName(pod_name, batch_id)
        : current_pod_id;

      if (batch_id !== current_batch_id) {
        await validateBatchSize(batch_id, batch.batch_size, 1);
      }
    }

    await pool.query("BEGIN");

    let podUser;
    if (pod_id) {
      const result = await pool.query(
        "UPDATE pod_users SET pod_id = $1 WHERE pod_user_id = $2 RETURNING *",
        [pod_id, pod_user_id]
      );
      if (result.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "Pod user assignment not found",
        });
      }
      podUser = result.rows[0];
    } else {
      const result = await pool.query(
        "SELECT * FROM pod_users WHERE pod_user_id = $1",
        [pod_user_id]
      );
      if (result.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "Pod user assignment not found",
        });
      }
      podUser = result.rows[0];
    }

    if (progress && Array.isArray(progress)) {
      for (const { concept_id, status } of progress) {
        if (!["not started", "in progress", "completed"].includes(status)) {
          throw new Error(
            `Invalid status for concept ${concept_id}: ${status}`
          );
        }
        const conceptCheck = await pool.query(
          "SELECT 1 FROM batch_concepts WHERE batch_id = $1 AND concept_id = $2",
          [
            batch_id ||
              (
                await pool.query(
                  "SELECT batch_id FROM pods WHERE pod_id = $1",
                  [podUser.pod_id]
                )
              ).rows[0].batch_id,
            concept_id,
          ]
        );
        if (conceptCheck.rows.length === 0) {
          throw new Error(`Concept ${concept_id} is not assigned to the batch`);
        }
        await pool.query(
          "INSERT INTO user_concept_progress (user_id, concept_id, status) VALUES ($1, $2, $3) " +
            "ON CONFLICT (user_id, concept_id) DO UPDATE SET status = $3, updated_at = CURRENT_TIMESTAMP",
          [podUser.user_id, concept_id, status]
        );
      }
    }

    const podResult = await pool.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name, u.user_id AS mentor_id, u.first_name AS mentor_first_name, u.last_name AS mentor_last_name, u.email AS mentor_email " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "JOIN users u ON p.mentor_id = u.user_id " +
        "WHERE p.pod_id = $1",
      [podUser.pod_id]
    );
    if (!podResult.rows[0].batch_is_active) {
      await pool.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Cannot update pod user for an inactive batch",
      });
    }
    const batchConcepts = await pool.query(
      "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.is_active, c.updated_at " +
        "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
      [podResult.rows[0].batch_id]
    );
    const progressResult = await pool.query(
      "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
      [podUser.user_id]
    );
    const userResult = await pool.query(
      "SELECT user_id, first_name, last_name, email, username FROM users WHERE user_id = $1",
      [podUser.user_id]
    );

    await pool.query("COMMIT");

    const pod = podResult.rows[0];
    res.json({
      success: true,
      data: {
        pod_user_id: podUser.pod_user_id,
        user: userResult.rows[0],
        pod: {
          pod_id: pod.pod_id,
          pod_name: pod.pod_name,
          is_active: pod.is_active,
          created_at: pod.created_at,
          mentor: {
            user_id: pod.mentor_id,
            first_name: pod.mentor_first_name,
            last_name: pod.mentor_last_name,
            email: pod.mentor_email,
          },
        },
        batch: {
          batch_id: pod.batch_id,
          batch_name: pod.batch_name,
          batch_size: pod.batch_size,
          is_active: pod.batch_is_active,
          organization_name: pod.organization_name,
          concepts: batchConcepts.rows,
        },
        progress: progressResult.rows,
      },
      message: "Pod user assignment updated successfully",
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    if (
      [
        "Organization not found",
        "Batch not found",
        "Pod not found",
        "Cannot assign users to an inactive batch",
        "Cannot assign users to an inactive pod",
        "Batch size limit reached",
        "Invalid status for concept",
        "Concept is not assigned to the batch",
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
    const podUserResult = await pool.query(
      "SELECT pu.pod_user_id, pu.pod_id, pu.created_at AS pod_assigned_at " +
        "FROM pod_users pu WHERE pu.user_id = $1",
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
    };

    if (podUserResult.rows.length > 0) {
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
          "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.is_active, c.updated_at " +
            "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
          [pod.batch_id]
        );
        const progressResult = await pool.query(
          "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
          [user.user_id]
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
      "SELECT pu.pod_user_id, pu.pod_id, pu.created_at AS pod_assigned_at " +
        "FROM pod_users pu WHERE pu.user_id = $1",
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
    };

    if (podUserResult.rows.length > 0) {
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
          "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.is_active, c.updated_at " +
            "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
          [pod.batch_id]
        );
        const progressResult = await pool.query(
          "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
          [user.user_id]
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
      "SELECT pu.pod_user_id, pu.pod_id, pu.created_at AS pod_assigned_at " +
        "FROM pod_users pu WHERE pu.user_id = $1",
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
    };

    if (podUserResult.rows.length > 0) {
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
          "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.is_active, c.updated_at " +
            "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
          [pod.batch_id]
        );
        const progressResult = await pool.query(
          "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1",
          [user.user_id]
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
      "SELECT u.user_id, u.first_name, u.last_name, u.email, u.username, " +
        "pu.pod_user_id, pu.pod_id, pu.created_at AS pod_assigned_at, " +
        "p.pod_name, p.is_active AS pod_is_active, p.created_at AS pod_created_at, " +
        "b.batch_id, b.batch_name, b.batch_size, b.is_active AS batch_is_active, " +
        "o.organization_name, m.user_id AS mentor_id, m.first_name AS mentor_first_name, m.last_name AS mentor_last_name, m.email AS mentor_email " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN pod_users pu ON u.user_id = pu.user_id " +
        "LEFT JOIN pods p ON pu.pod_id = p.pod_id " +
        "LEFT JOIN batches b ON p.batch_id = b.batch_id " +
        "LEFT JOIN organizations o ON p.organization_id = o.organization_id " +
        "LEFT JOIN users m ON p.mentor_id = m.user_id " +
        "WHERE u.organization_id = $1 AND r.role = $2",
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
            "SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings, c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content, c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content, c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions, c.download_link, c.is_active, c.updated_at " +
              "FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
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
            mentor: {
              user_id: row.mentor_id,
              first_name: row.mentor_first_name,
              last_name: row.mentor_last_name,
              email: row.mentor_email,
            },
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
};
