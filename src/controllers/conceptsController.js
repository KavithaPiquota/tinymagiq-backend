// src/controllers/conceptsController.js
const { pool } = require("../config/database");
// Get all concepts
const getConcepts = async (req, res) => {
  const { isActive } = req.query;

  try {
    let query = `
      SELECT concept_id, concept_name, concept_content, concept_enduring_understandings,
             concept_essential_questions, concept_knowledge_skills, stage_1_content,
             stage_2_content, stage_3_content, stage_4_content, stage_5_content,
             concept_understanding_rubric, understanding_skills_rubric,
             learning_assessment_dimensions, isActive, created_at, updated_at
      FROM concepts
    `;
    const params = [];
    if (isActive !== undefined) {
      query += ` WHERE isActive = $1`;
      params.push(isActive === "true");
    }
    query += ` ORDER BY concept_name`;

    const result = await pool.query(query, params);
    return res.status(200).json({ concepts: result.rows });
  } catch (error) {
    console.error("Error fetching concepts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Create a concept
const createConcept = async (req, res) => {
  const {
    concept_name,
    concept_content,
    concept_enduring_understandings,
    concept_essential_questions,
    concept_knowledge_skills,
    stage_1_content,
    stage_2_content,
    stage_3_content,
    stage_4_content,
    stage_5_content,
    concept_understanding_rubric,
    understanding_skills_rubric,
    learning_assessment_dimensions,
    isActive = true,
  } = req.body;

  if (!concept_name) {
    return res.status(400).json({ error: "Concept name is required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO concepts (
        concept_name, concept_content, concept_enduring_understandings,
        concept_essential_questions, concept_knowledge_skills, stage_1_content,
        stage_2_content, stage_3_content, stage_4_content, stage_5_content,
        concept_understanding_rubric, understanding_skills_rubric,
        learning_assessment_dimensions, isActive
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING concept_id, concept_name, concept_content, concept_enduring_understandings,
                concept_essential_questions, concept_knowledge_skills, stage_1_content,
                stage_2_content, stage_3_content, stage_4_content, stage_5_content,
                concept_understanding_rubric, understanding_skills_rubric,
                learning_assessment_dimensions, isActive, created_at, updated_at`,
      [
        concept_name,
        concept_content || null,
        concept_enduring_understandings || null,
        concept_essential_questions || null,
        concept_knowledge_skills || null,
        stage_1_content || null,
        stage_2_content || null,
        stage_3_content || null,
        stage_4_content || null,
        stage_5_content || null,
        concept_understanding_rubric || null,
        understanding_skills_rubric || null,
        learning_assessment_dimensions || null,
        isActive,
      ]
    );
    return res
      .status(201)
      .json({ message: "Concept created", concept: result.rows[0] });
  } catch (error) {
    console.error("Error creating concept:", error);
    if (error.code === "23505") {
      return res.status(400).json({ error: "Concept name already exists" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Update a concept
const updateConcept = async (req, res) => {
  const { concept_id } = req.params;
  const {
    concept_name,
    concept_content,
    concept_enduring_understandings,
    concept_essential_questions,
    concept_knowledge_skills,
    stage_1_content,
    stage_2_content,
    stage_3_content,
    stage_4_content,
    stage_5_content,
    concept_understanding_rubric,
    understanding_skills_rubric,
    learning_assessment_dimensions,
    isActive,
  } = req.body;

  try {
    const existingConcept = await pool.query(
      `SELECT concept_id FROM concepts WHERE concept_id = $1`,
      [concept_id]
    );
    if (existingConcept.rows.length === 0) {
      return res.status(404).json({ error: "Concept not found" });
    }

    const updates = {};
    if (concept_name) updates.concept_name = concept_name;
    if (concept_content !== undefined)
      updates.concept_content = concept_content;
    if (concept_enduring_understandings !== undefined)
      updates.concept_enduring_understandings = concept_enduring_understandings;
    if (concept_essential_questions !== undefined)
      updates.concept_essential_questions = concept_essential_questions;
    if (concept_knowledge_skills !== undefined)
      updates.concept_knowledge_skills = concept_knowledge_skills;
    if (stage_1_content !== undefined)
      updates.stage_1_content = stage_1_content;
    if (stage_2_content !== undefined)
      updates.stage_2_content = stage_2_content;
    if (stage_3_content !== undefined)
      updates.stage_3_content = stage_3_content;
    if (stage_4_content !== undefined)
      updates.stage_4_content = stage_4_content;
    if (stage_5_content !== undefined)
      updates.stage_5_content = stage_5_content;
    if (concept_understanding_rubric !== undefined)
      updates.concept_understanding_rubric = concept_understanding_rubric;
    if (understanding_skills_rubric !== undefined)
      updates.understanding_skills_rubric = understanding_skills_rubric;
    if (learning_assessment_dimensions !== undefined)
      updates.learning_assessment_dimensions = learning_assessment_dimensions;
    if (isActive !== undefined) updates.isActive = isActive;

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ error: "At least one field must be provided for update" });
    }

    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(", ");
    const values = [concept_id, ...Object.values(updates)];

    const result = await pool.query(
      `UPDATE concepts
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE concept_id = $1
       RETURNING concept_id, concept_name, concept_content, concept_enduring_understandings,
                 concept_essential_questions, concept_knowledge_skills, stage_1_content,
                 stage_2_content, stage_3_content, stage_4_content, stage_5_content,
                 concept_understanding_rubric, understanding_skills_rubric,
                 learning_assessment_dimensions, isActive, created_at, updated_at`,
      values
    );

    return res
      .status(200)
      .json({ message: "Concept updated", concept: result.rows[0] });
  } catch (error) {
    console.error("Error updating concept:", error);
    if (error.code === "23505") {
      return res.status(400).json({ error: "Concept name already exists" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { getConcepts, createConcept, updateConcept };
