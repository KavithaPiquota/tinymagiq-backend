// src/controllers/conceptsController.js
const { pool } = require("../config/database");

// Create a concept
const createConcept = async (req, res) => {
  const { concept_name } = req.body;

  if (!concept_name) {
    return res.status(400).json({ error: "Concept name is required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO concepts (concept_name)
             VALUES ($1)
             RETURNING concept_id, concept_name, created_at, updated_at`,
      [concept_name]
    );
    return res
      .status(201)
      .json({ message: "Concept created", concept: result.rows[0] });
  } catch (error) {
    console.error("Error creating concept:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get all concepts
const getConcepts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT concept_id, concept_name, created_at, updated_at
             FROM concepts
             ORDER BY concept_name`
    );
    return res.status(200).json({ concepts: result.rows });
  } catch (error) {
    console.error("Error fetching concepts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Update a concept
const updateConcept = async (req, res) => {
  const { concept_id } = req.params;
  const { concept_name } = req.body;

  if (!concept_name) {
    return res.status(400).json({ error: "Concept name is required" });
  }

  try {
    const result = await pool.query(
      `UPDATE concepts
             SET concept_name = $1, updated_at = CURRENT_TIMESTAMP
             WHERE concept_id = $2
             RETURNING concept_id, concept_name, created_at, updated_at`,
      [concept_name, concept_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Concept not found" });
    }

    return res
      .status(200)
      .json({ message: "Concept updated", concept: result.rows[0] });
  } catch (error) {
    console.error("Error updating concept:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { createConcept, getConcepts, updateConcept };
