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
  const trimmedOrgName = organization_name.trim();
  console.log(
    `getOrganizationIdByName: Input organization_name: '${organization_name}', trimmed: '${trimmedOrgName}', length: ${trimmedOrgName.length}, hex: ${Buffer.from(trimmedOrgName).toString("hex")}`
  );
  const result = await pool.query(
    "SELECT organization_id, organization_name FROM organizations WHERE organization_name = $1",
    [trimmedOrgName]
  );
  if (result.rows.length === 0) {
    console.log(`No organization found for name: '${trimmedOrgName}'`);
    const allOrgs = await pool.query(
      "SELECT organization_name FROM organizations"
    );
    console.log(
      `Available organizations: ${JSON.stringify(allOrgs.rows.map((row) => row.organization_name))}`
    );
    throw new Error("Organization not found");
  }
  console.log(`Found organization: ${JSON.stringify(result.rows[0])}`);
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
      "FROM pod_users pu WHERE pu.batch_id = $1",
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
    "SELECT pu.pod_id, p.pod_name, pu.batch_id " +
      "FROM pod_users pu JOIN pods p ON pu.pod_id = p.pod_id " +
      "WHERE pu.user_id = $1 AND pu.batch_id = $2",
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
        message:
          "One or more users are already assigned to a pod in this batch or invalid",
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

    // Re-check assignments within transaction to avoid race conditions
    for (const user of validatedUsers) {
      await checkUserAssignment(user.user_id, user.email, batch.batch_id);
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
          "Duplicate key violation in pod_users, attempting single inserts"
        );
        // Rollback and start a new transaction
        await client.query("ROLLBACK");
        await client.query("BEGIN");
        podUserResult = { rows: [] };
        const newErrors = [];
        for (const user of validatedUsers) {
          try {
            // Re-check assignment to ensure no conflicts
            await checkUserAssignment(user.user_id, user.email, batch.batch_id);
            const singleInsert = await client.query(
              "INSERT INTO pod_users (pod_id, user_id, batch_id) VALUES ($1, $2, $3) RETURNING pod_user_id, user_id",
              [pod_id, user.user_id, batch.batch_id]
            );
            podUserResult.rows.push(singleInsert.rows[0]);
            console.log(`Inserted user_id: ${user.user_id}`);
          } catch (singleError) {
            console.log(
              `Failed to insert user_id: ${user.user_id}: ${singleError.message}`
            );
            newErrors.push({
              user: user.email || user.username,
              error: singleError.message.includes("duplicate key")
                ? `User ${user.email || user.username} is already assigned to a pod in this batch`
                : singleError.message,
            });
          }
        }
        if (newErrors.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            success: false,
            error: "Conflict",
            message:
              "One or more users are already assigned to a pod in this batch",
            errors: newErrors,
          });
        }
      } else {
        throw error;
      }
    }

    const conceptsResult = await client.query(
      "SELECT c.concept_id FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
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

    assignedUsers.push(
      ...podUserResult.rows.map((row) => ({
        pod_user_id: row.pod_user_id,
        user: validatedUsers.find((u) => u.user_id === row.user_id),
      }))
    );

    const podResult = await client.query(
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
      "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
      [batch.batch_id]
    );

    const responseData = await Promise.all(
      assignedUsers.map(async ({ pod_user_id, user }) => {
        const progressResult = await client.query(
          "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1 AND concept_id IN (SELECT concept_id FROM batch_concepts WHERE batch_id = $2)",
          [user.user_id, batch.batch_id]
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
      error.message.includes("is not associated with the organization") ||
      error.message.includes("is already assigned to a pod")
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
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
  let client;

  if (!pod_name && !batch_name && !organization_name && !progress) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "At least one field to update (pod_name, batch_name, organization_name, or progress) is required",
    });
  }

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const currentPodUser = await client.query(
      "SELECT pu.pod_id, pu.batch_id, p.batch_id AS current_batch_id, b.organization_id " +
        "FROM pod_users pu JOIN pods p ON pu.pod_id = p.pod_id JOIN batches b ON p.batch_id = b.batch_id " +
        "WHERE pu.pod_user_id = $1",
      [pod_user_id]
    );
    if (currentPodUser.rows.length === 0) {
      await client.query("ROLLBACK");
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

    let organization_id = current_organization_id;
    let batch_id = current_batch_id;
    let pod_id = current_pod_id;

    if (organization_name || batch_name || pod_name) {
      organization_id = organization_name
        ? await getOrganizationIdByName(organization_name)
        : current_organization_id;
      const batch = batch_name
        ? await getBatchIdByName(batch_name, organization_id)
        : await client
            .query(
              "SELECT batch_id, batch_size, is_active FROM batches WHERE batch_id = $1",
              [current_batch_id]
            )
            .then((res) => res.rows[0]);
      batch_id = batch.batch_id;
      pod_id = pod_name
        ? await getPodIdByName(pod_name, batch_id)
        : current_pod_id;

      if (batch_id === current_batch_id && pod_id !== current_pod_id) {
        const user_id = (
          await client.query(
            "SELECT user_id FROM pod_users WHERE pod_user_id = $1",
            [pod_user_id]
          )
        ).rows[0].user_id;
        await checkUserAssignment(user_id, null, batch_id);
      }

      if (batch_id !== current_batch_id) {
        await validateBatchSize(batch_id, batch.batch_size, 1);
      }
    }

    let podUser;
    if (pod_id !== current_pod_id || batch_id !== current_batch_id) {
      const result = await client.query(
        "UPDATE pod_users SET pod_id = $1, batch_id = $2 WHERE pod_user_id = $3 RETURNING *",
        [pod_id, batch_id, pod_user_id]
      );
      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "Pod user assignment not found",
        });
      }
      podUser = result.rows[0];
    } else {
      const result = await client.query(
        "SELECT * FROM pod_users WHERE pod_user_id = $1",
        [pod_user_id]
      );
      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "Pod user assignment not found",
        });
      }
      podUser = result.rows[0];
    }

    if (batch_id !== current_batch_id) {
      const conceptsResult = await client.query(
        "SELECT c.concept_id FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
        [batch_id]
      );
      const concept_ids = conceptsResult.rows.map((row) => row.concept_id);
      if (concept_ids.length > 0) {
        const progressValues = concept_ids
          .map(
            (concept_id) => `(${podUser.user_id}, ${concept_id}, 'not started')`
          )
          .join(", ");
        await client.query(
          `INSERT INTO user_concept_progress (user_id, concept_id, status)
           VALUES ${progressValues}
           ON CONFLICT (user_id, concept_id) DO NOTHING`
        );
        console.log(
          `Initialized progress for user_id: ${podUser.user_id} in new batch`
        );
      }
    }

    if (progress && Array.isArray(progress)) {
      for (const { concept_id, status } of progress) {
        if (!["not started", "in progress", "completed"].includes(status)) {
          throw new Error(
            `Invalid status for concept ${concept_id}: ${status}`
          );
        }
        const conceptCheck = await client.query(
          "SELECT 1 FROM batch_concepts WHERE batch_id = $1 AND concept_id = $2",
          [batch_id, concept_id]
        );
        if (conceptCheck.rows.length === 0) {
          throw new Error(`Concept ${concept_id} is not assigned to the batch`);
        }
        await client.query(
          "INSERT INTO user_concept_progress (user_id, concept_id, status) VALUES ($1, $2, $3) " +
            "ON CONFLICT (user_id, concept_id) DO UPDATE SET status = $3, updated_at = CURRENT_TIMESTAMP",
          [podUser.user_id, concept_id, status]
        );
      }
    }

    const podResult = await client.query(
      "SELECT p.*, b.batch_name, b.batch_size, b.is_active AS batch_is_active, o.organization_name, u.user_id AS mentor_id, u.first_name AS mentor_first_name, u.last_name AS mentor_last_name, u.email AS mentor_email " +
        "FROM pods p " +
        "JOIN batches b ON p.batch_id = b.batch_id " +
        "JOIN organizations o ON p.organization_id = o.organization_id " +
        "JOIN users u ON p.mentor_id = u.user_id " +
        "WHERE p.pod_id = $1",
      [podUser.pod_id]
    );
    if (!podResult.rows[0].batch_is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Cannot update pod user for an inactive batch",
      });
    }
    const batchConcepts = await client.query(
      "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
      [podResult.rows[0].batch_id]
    );
    const progressResult = await client.query(
      "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1 AND concept_id IN (SELECT concept_id FROM batch_concepts WHERE batch_id = $2)",
      [podUser.user_id, podResult.rows[0].batch_id]
    );
    const userResult = await client.query(
      "SELECT user_id, first_name, last_name, email, username FROM users WHERE user_id = $1",
      [podUser.user_id]
    );

    await client.query("COMMIT");

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
    if (client) await client.query("ROLLBACK");
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
        "User is already assigned to pod",
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
  } finally {
    if (client) client.release();
  }
};

const getOrguserDetails = async (req, res) => {
  const { identifier } = req.params;
  const { first_name, last_name } = req.query;

  try {
    const user = await getUserIdByIdentifier(identifier, first_name, last_name);
    const podUserResult = await pool.query(
      "SELECT pu.pod_user_id, pu.pod_id, pu.batch_id, pu.created_at AS pod_assigned_at " +
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
      pods: [],
    };

    if (podUserResult.rows.length > 0) {
      const podResults = await Promise.all(
        podUserResult.rows.map(async (podUser) => {
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
              "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1 AND concept_id IN (SELECT concept_id FROM batch_concepts WHERE batch_id = $2)",
              [user.user_id, pod.batch_id]
            );
            return {
              pod_user_id: podUser.pod_user_id,
              pod_id: pod.pod_id,
              pod_name: pod.pod_name,
              is_active: pod.is_active,
              created_at: pod.created_at,
              pod_assigned_at: podUser.pod_assigned_at,
              batch: {
                batch_id: pod.batch_id,
                batch_name: pod.batch_name,
                batch_size: pod.batch_size,
                is_active: pod.batch_is_active,
                organization_name: pod.organization_name,
                concepts: batchConcepts.rows,
              },
              progress: progressResult.rows,
              mentor: {
                user_id: pod.mentor_id,
                first_name: pod.mentor_first_name,
                last_name: pod.mentor_last_name,
                email: pod.mentor_email,
              },
            };
          }
          return null;
        })
      );
      responseData.pods = podResults.filter((pod) => pod !== null);
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
      pods: [],
    };

    if (podUserResult.rows.length > 0) {
      const podResults = await Promise.all(
        podUserResult.rows.map(async (podUser) => {
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
              "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1 AND concept_id IN (SELECT concept_id FROM batch_concepts WHERE batch_id = $2)",
              [user.user_id, pod.batch_id]
            );
            return {
              pod_user_id: podUser.pod_user_id,
              pod_id: pod.pod_id,
              pod_name: pod.pod_name,
              is_active: pod.is_active,
              created_at: pod.created_at,
              pod_assigned_at: podUser.pod_assigned_at,
              batch: {
                batch_id: pod.batch_id,
                batch_name: pod.batch_name,
                batch_size: pod.batch_size,
                is_active: pod.batch_is_active,
                organization_name: pod.organization_name,
                concepts: batchConcepts.rows,
              },
              progress: progressResult.rows,
              mentor: {
                user_id: pod.mentor_id,
                first_name: pod.mentor_first_name,
                last_name: pod.mentor_last_name,
                email: pod.mentor_email,
              },
            };
          }
          return null;
        })
      );
      responseData.pods = podResults.filter((pod) => pod !== null);
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
      pods: [],
    };

    if (podUserResult.rows.length > 0) {
      const podResults = await Promise.all(
        podUserResult.rows.map(async (podUser) => {
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
              "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1 AND concept_id IN (SELECT concept_id FROM batch_concepts WHERE batch_id = $2)",
              [user.user_id, pod.batch_id]
            );
            return {
              pod_user_id: podUser.pod_user_id,
              pod_id: pod.pod_id,
              pod_name: pod.pod_name,
              is_active: pod.is_active,
              created_at: pod.created_at,
              pod_assigned_at: podUser.pod_assigned_at,
              batch: {
                batch_id: pod.batch_id,
                batch_name: pod.batch_name,
                batch_size: pod.batch_size,
                is_active: pod.batch_is_active,
                organization_name: pod.organization_name,
                concepts: batchConcepts.rows,
              },
              progress: progressResult.rows,
              mentor: {
                user_id: pod.mentor_id,
                first_name: pod.mentor_first_name,
                last_name: pod.mentor_last_name,
                email: pod.mentor_email,
              },
            };
          }
          return null;
        })
      );
      responseData.pods = podResults.filter((pod) => pod !== null);
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
        "pu.pod_user_id, pu.pod_id, pu.batch_id, pu.created_at AS pod_assigned_at, " +
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

    // Build user data synchronously first
    const userMap = result.rows.reduce((acc, row) => {
      if (!acc[row.user_id]) {
        acc[row.user_id] = {
          user_id: row.user_id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          username: row.username,
          pods: [],
        };
      }
      if (row.pod_user_id) {
        acc[row.user_id].pods.push({
          pod_user_id: row.pod_user_id,
          pod_id: row.pod_id,
          pod_name: row.pod_name,
          is_active: row.pod_is_active,
          created_at: row.pod_created_at,
          pod_assigned_at: row.pod_assigned_at,
          batch: {
            batch_id: row.batch_id,
            batch_name: row.batch_name,
            batch_size: row.batch_size,
            is_active: row.batch_is_active,
            organization_name: row.organization_name,
          },
          mentor: {
            user_id: row.mentor_id,
            first_name: row.mentor_first_name,
            last_name: row.mentor_last_name,
            email: row.mentor_email,
          },
        });
      }
      return acc;
    }, {});

    // Process async queries for concepts and progress
    const users = await Promise.all(
      Object.values(userMap).map(async (userData) => {
        const pods = await Promise.all(
          userData.pods.map(async (pod) => {
            const batchConcepts = await pool.query(
              "SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1",
              [pod.batch.batch_id]
            );
            const progressResult = await pool.query(
              "SELECT concept_id, status, updated_at FROM user_concept_progress WHERE user_id = $1 AND concept_id IN (SELECT concept_id FROM batch_concepts WHERE batch_id = $2)",
              [userData.user_id, pod.batch.batch_id]
            );
            return {
              ...pod,
              batch: {
                ...pod.batch,
                concepts: batchConcepts.rows,
              },
              progress: progressResult.rows,
            };
          })
        );
        return {
          ...userData,
          pods,
        };
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
