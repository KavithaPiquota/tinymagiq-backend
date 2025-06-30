const { pool } = require("../config/database");

const addConcept = async (req, res) => {
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
    is_active = true,
  } = req.body;

  if (!concept_name) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Concept name is required",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO concepts (
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
                is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
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
        is_active,
      ]
    );
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Concept created successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Concept name already exists",
      });
    }
    console.error("Error creating concept:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

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
    is_active,
  } = req.body;

  if (
    !concept_name &&
    !concept_content &&
    !concept_enduring_understandings &&
    !concept_essential_questions &&
    !concept_knowledge_skills &&
    !stage_1_content &&
    !stage_2_content &&
    !stage_3_content &&
    !stage_4_content &&
    !stage_5_content &&
    !concept_understanding_rubric &&
    !understanding_skills_rubric &&
    !learning_assessment_dimensions &&
    is_active === undefined
  ) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "At least one field to update is required",
    });
  }

  try {
    const fields = [];
    const values = [];
    let index = 1;

    if (concept_name) {
      fields.push(`concept_name = $${index++}`);
      values.push(concept_name);
    }
    if (concept_content !== undefined) {
      fields.push(`concept_content = $${index++}`);
      values.push(concept_content);
    }
    if (concept_enduring_understandings !== undefined) {
      fields.push(`concept_enduring_understandings = $${index++}`);
      values.push(concept_enduring_understandings);
    }
    if (concept_essential_questions !== undefined) {
      fields.push(`concept_essential_questions = $${index++}`);
      values.push(concept_essential_questions);
    }
    if (concept_knowledge_skills !== undefined) {
      fields.push(`concept_knowledge_skills = $${index++}`);
      values.push(concept_knowledge_skills);
    }
    if (stage_1_content !== undefined) {
      fields.push(`stage_1_content = $${index++}`);
      values.push(stage_1_content);
    }
    if (stage_2_content !== undefined) {
      fields.push(`stage_2_content = $${index++}`);
      values.push(stage_2_content);
    }
    if (stage_3_content !== undefined) {
      fields.push(`stage_3_content = $${index++}`);
      values.push(stage_3_content);
    }
    if (stage_4_content !== undefined) {
      fields.push(`stage_4_content = $${index++}`);
      values.push(stage_4_content);
    }
    if (stage_5_content !== undefined) {
      fields.push(`stage_5_content = $${index++}`);
      values.push(stage_5_content);
    }
    if (concept_understanding_rubric !== undefined) {
      fields.push(`concept_understanding_rubric = $${index++}`);
      values.push(concept_understanding_rubric);
    }
    if (understanding_skills_rubric !== undefined) {
      fields.push(`understanding_skills_rubric = $${index++}`);
      values.push(understanding_skills_rubric);
    }
    if (learning_assessment_dimensions !== undefined) {
      fields.push(`learning_assessment_dimensions = $${index++}`);
      values.push(learning_assessment_dimensions);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(is_active);
    }

    values.push(concept_id);
    const query = `UPDATE concepts SET ${fields.join(", ")} WHERE concept_id = $${index} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "Concept not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Concept updated successfully",
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Concept name already exists",
      });
    }
    console.error("Error updating concept:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getAllConcepts = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM concepts ORDER BY concept_id"
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Concepts fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching concepts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getActiveConcepts = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM concepts WHERE is_active = TRUE ORDER BY concept_id"
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Active concepts fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching active concepts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getConceptById = async (req, res) => {
  const { concept_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM concepts WHERE concept_id = $1",
      [concept_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "Concept not found",
      });
    }
    res.json({
      success: true,
      data: result.rows[0],
      message: "Concept fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching concept by ID:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getConceptByName = async (req, res) => {
  const { concept_name } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM concepts WHERE concept_name = $1",
      [concept_name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "Concept not found",
      });
    }
    res.json({
      success: true,
      data: result.rows[0],
      message: "Concept fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching concept by name:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  addConcept,
  updateConcept,
  getAllConcepts,
  getActiveConcepts,
  getConceptById,
  getConceptByName,
};
