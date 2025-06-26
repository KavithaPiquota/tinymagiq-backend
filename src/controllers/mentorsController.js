// src/controllers/mentorsController.js
const { pool } = require("../config/database");

// Create a mentor
const createMentor = async (req, res) => {
  const { mentor_name, mentor_email } = req.body;

  if (!mentor_name || !mentor_email) {
    return res
      .status(400)
      .json({ error: "Mentor name and email are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO mentors (mentor_name, mentor_email)
             VALUES ($1, $2)
             RETURNING mentor_id, mentor_name, mentor_email, created_at, updated_at`,
      [mentor_name, mentor_email]
    );
    return res
      .status(201)
      .json({ message: "Mentor created", mentor: result.rows[0] });
  } catch (error) {
    console.error("Error creating mentor:", error);
    if (error.code === "23505") {
      // Unique violation
      return res.status(400).json({ error: "Mentor email already exists" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get all mentors
const getMentors = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mentor_id, mentor_name, mentor_email, created_at, updated_at
             FROM mentors
             ORDER BY mentor_name`
    );
    return res.status(200).json({ mentors: result.rows });
  } catch (error) {
    console.error("Error fetching mentors:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Update a mentor
const updateMentor = async (req, res) => {
  const { mentor_id } = req.params;
  const { mentor_name, mentor_email } = req.body;

  if (!mentor_name || !mentor_email) {
    return res
      .status(400)
      .json({ error: "Mentor name and email are required" });
  }

  try {
    const result = await pool.query(
      `UPDATE mentors
             SET mentor_name = $1, mentor_email = $2, updated_at = CURRENT_TIMESTAMP
             WHERE mentor_id = $3
             RETURNING mentor_id, mentor_name, mentor_email, created_at, updated_at`,
      [mentor_name, mentor_email, mentor_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Mentor not found" });
    }

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

    return res.status(200).json({ message: "Mentor deleted" });
  } catch (error) {
    console.error("Error deleting mentor:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { createMentor, getMentors, updateMentor, deleteMentor };
