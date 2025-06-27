const { pool } = require("../config/database");

// Get orguser details (batches, pods, mentors, concepts)
const getOrguserDetails = async (req, res) => {
  const { email } = req.params;

  try {
    // Verify user exists and is an orguser
    const userResult = await pool.query(
      `SELECT u.user_id, u.email, u.role, u.org_id, o.name AS organization_name
       FROM users u
       JOIN organizations o ON u.org_id = o.org_id
       WHERE u.email = $1 AND u.role = 'orguser' AND u.isActive = TRUE`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Active orguser not found" });
    }

    const user = userResult.rows[0];

    // Get pods and batches
    const podsResult = await pool.query(
      `SELECT p.pod_id, p.pod_name, p.batch_id, b.batch_name, b.org_id, b.isActive
       FROM pod_users pu
       JOIN pods p ON pu.pod_id = p.pod_id
       JOIN batches b ON p.batch_id = b.batch_id
       WHERE pu.user_id = $1 AND p.isActive = TRUE AND b.isActive = TRUE`,
      [user.user_id]
    );

    const pods = podsResult.rows;

    // Get mentors and concepts for each pod
    const userDetails = {
      email: user.email,
      organization_name: user.organization_name,
      pods: [],
    };

    for (const pod of pods) {
      // Get mentors for the pod
      const mentorsResult = await pool.query(
        `SELECT m.mentor_id, m.mentor_name, m.mentor_email, m.isActive
         FROM pod_mentors pm
         JOIN mentors m ON pm.mentor_id = m.mentor_id
         WHERE pm.pod_id = $1 AND m.isActive = TRUE`,
        [pod.pod_id]
      );

      // Get concepts for the batch
      const conceptsResult = await pool.query(
        `SELECT c.concept_id, c.concept_name, c.isActive
         FROM batch_concepts bc
         JOIN concepts c ON bc.concept_id = c.concept_id
         WHERE bc.batch_id = $1 AND c.isActive = TRUE`,
        [pod.batch_id]
      );

      userDetails.pods.push({
        pod_id: pod.pod_id,
        pod_name: pod.pod_name,
        batch_id: pod.batch_id,
        batch_name: pod.batch_name,
        mentors: mentorsResult.rows,
        concepts: conceptsResult.rows,
      });
    }

    return res.status(200).json({ user: userDetails });
  } catch (error) {
    console.error("Error fetching orguser details:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { getOrguserDetails };
