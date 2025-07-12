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

  const trimmedConceptName = concept_name.trim();
  if (!trimmedConceptName) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Concept name cannot be empty or whitespace",
    });
  }

  // Log input for debugging
  console.log(
    `Received concept_name: '${concept_name}', trimmed: '${trimmedConceptName}', length: ${trimmedConceptName.length}, hex: ${Buffer.from(trimmedConceptName).toString("hex")}`
  );

  try {
    // Check for existing concept_name (case-sensitive)
    const nameExists = await pool.query(
      "SELECT concept_id, concept_name FROM concepts WHERE concept_name = $1",
      [trimmedConceptName]
    );
    if (nameExists.rows.length > 0) {
      console.log(`Conflict found: ${JSON.stringify(nameExists.rows[0])}`);
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: `Concept name '${trimmedConceptName}' already exists (concept_id: ${nameExists.rows[0].concept_id})`,
      });
    }

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
                is_active,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP) RETURNING *`,
      [
        trimmedConceptName,
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
      console.error(`23505 error for concept_name: '${trimmedConceptName}'`);
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: `Concept name '${trimmedConceptName}' already exists`,
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
    const trimmedConceptName = concept_name ? concept_name.trim() : null;
    if (trimmedConceptName === "") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Concept name cannot be empty or whitespace",
      });
    }

    if (trimmedConceptName) {
      const nameExists = await pool.query(
        "SELECT 1 FROM concepts WHERE concept_name = $1 AND concept_id != $2",
        [trimmedConceptName, concept_id]
      );
      if (nameExists.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: `Concept name '${trimmedConceptName}' already exists`,
        });
      }
    }

    const fields = [];
    const values = [];
    let index = 1;

    if (trimmedConceptName) {
      fields.push(`concept_name = $${index++}`);
      values.push(trimmedConceptName);
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
        message: `Concept name '${trimmedConceptName || concept_name}' already exists`,
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
      "SELECT concept_id, concept_name, concept_content, concept_enduring_understandings, concept_essential_questions, concept_knowledge_skills, stage_1_content, stage_2_content, stage_3_content, stage_4_content, stage_5_content, concept_understanding_rubric, understanding_skills_rubric, learning_assessment_dimensions, is_active, updated_at FROM concepts ORDER BY concept_id"
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
      "SELECT concept_id, concept_name, concept_content, concept_enduring_understandings, concept_essential_questions, concept_knowledge_skills, stage_1_content, stage_2_content, stage_3_content, stage_4_content, stage_5_content, concept_understanding_rubric, understanding_skills_rubric, learning_assessment_dimensions, is_active, updated_at FROM concepts WHERE is_active = TRUE ORDER BY concept_id"
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
      "SELECT concept_id, concept_name, concept_content, concept_enduring_understandings, concept_essential_questions, concept_knowledge_skills, stage_1_content, stage_2_content, stage_3_content, stage_4_content, stage_5_content, concept_understanding_rubric, understanding_skills_rubric, learning_assessment_dimensions, is_active, updated_at FROM concepts WHERE concept_id = $1",
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
      "SELECT concept_id, concept_name, concept_content, concept_enduring_understandings, concept_essential_questions, concept_knowledge_skills, stage_1_content, stage_2_content, stage_3_content, stage_4_content, stage_5_content, concept_understanding_rubric, understanding_skills_rubric, learning_assessment_dimensions, is_active, updated_at FROM concepts WHERE concept_name = $1",
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
