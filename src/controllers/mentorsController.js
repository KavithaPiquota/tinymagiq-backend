const { pool } = require("../config/database");

// Get all mentors
const getMentors = async (req, res) => {
  const { isActive } = req.query;

  try {
    let query = `
      SELECT mentor_id, mentor_name, mentor_email, isActive, created_at, updated_at
      FROM mentors
    `;
    const params = [];
    if (isActive !== undefined) {
      query += ` WHERE isActive = $1`;
      params.push(isActive === "true");
    }
    query += ` ORDER BY mentor_name`;

    const result = await pool.query(query, params);
    return res.status(200).json({ mentors: result.rows });
  } catch (error) {
    console.error("Error fetching mentors:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Create a mentor
const createMentor = async (req, res) => {
  const { mentor_name, mentor_email, isActive = true } = req.body;

  if (!mentor_name || !mentor_email) {
    return res
      .status(400)
      .json({ error: "Mentor name and email are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO mentors (mentor_name, mentor_email, isActive)
       VALUES ($1, $2, $3)
       RETURNING mentor_id, mentor_name, mentor_email, isActive, created_at, updated_at`,
      [mentor_name, mentor_email, isActive]
    );
    return res
      .status(201)
      .json({ message: "Mentor created", mentor: result.rows[0] });
  } catch (error) {
    console.error("Error creating mentor:", error);
    if (error.code === "23505") {
      return res.status(400).json({ error: "Mentor email already exists" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Update a mentor
const updateMentor = async (req, res) => {
  const { mentor_id } = req.params;
  const { mentor_name, mentor_email, isActive } = req.body;

  try {
    const existingMentor = await pool.query(
      `SELECT mentor_id FROM mentors WHERE mentor_id = $1`,
      [mentor_id]
    );
    if (existingMentor.rows.length === 0) {
      return res.status(404).json({ error: "Mentor not found" });
    }

    const updates = {};
    if (mentor_name) updates.mentor_name = mentor_name;
    if (mentor_email) updates.mentor_email = mentor_email;
    if (isActive !== undefined) updates.isActive = isActive;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error:
          "At least one field (mentor_name, mentor_email, isActive) must be provided",
      });
    }

    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(", ");
    const values = [mentor_id, ...Object.values(updates)];

    const result = await pool.query(
      `UPDATE mentors
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE mentor_id = $1
       RETURNING mentor_id, mentor_name, mentor_email, isActive, created_at, updated_at`,
      values
    );

    return res
      .status(200)
      .json({ message: "Mentor updated", mentor: result.rows[0] });
  } catch (error) {
    console.error("Error updating mentor:", error);
    if (error.code === "23505") {
      return res.status(400).json({ error: "Mentor email already exists" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Delete a mentor
const deleteMentor = async (req, res) => {
  const { mentor_id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM mentors
       WHERE mentor_id = $1
       RETURNING mentor_id`,
      [mentor_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Mentor not found" });
    }

    return res
      .status(200)
      .json({ message: "Mentor deleted", mentor_id: parseInt(mentor_id) });
  } catch (error) {
    console.error("Error deleting mentor:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { createMentor, getMentors, updateMentor, deleteMentor };
