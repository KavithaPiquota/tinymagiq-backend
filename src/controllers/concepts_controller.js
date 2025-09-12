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
    download_link,
    is_active = true,
    learning_objective,
    level_1_name,
    level_1_description,
    level_2_name,
    level_2_description,
    level_3_name,
    level_3_description,
    level_4_name,
    level_4_description,
    level_5_name,
    level_5_description,
    number_of_scenarios,
    facet_focus,
    introduction_context,
    progression_description,
    task_questions,
    reflection_questions,
    strength_checklist,
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
    `addConcept: concept_name: '${concept_name}', trimmed: '${trimmedConceptName}', length: ${trimmedConceptName.length}, hex: ${Buffer.from(trimmedConceptName).toString("hex")}`
  );

  try {
    // Check for existing concept_name
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
        download_link,
        is_active,
        version,
        updated_at,
        learning_objective,
        level_1_name,
        level_1_description,
        level_2_name,
        level_2_description,
        level_3_name,
        level_3_description,
        level_4_name,
        level_4_description,
        level_5_name,
        level_5_description,
        number_of_scenarios,
        facet_focus,
        introduction_context,
        progression_description,
        task_questions,
        reflection_questions,
        strength_checklist
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 1, CURRENT_TIMESTAMP, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
      RETURNING *`,
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
        download_link,
        is_active,
        learning_objective,
level_1_name,
level_1_description,
level_2_name,
level_2_description,
level_3_name,
level_3_description,
level_4_name,
level_4_description,
level_5_name,
level_5_description,
number_of_scenarios,
facet_focus,
introduction_context,
progression_description,
task_questions,
reflection_questions,
strength_checklist,
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
    download_link,
    is_active,
    learning_objective,
    level_1_name,
    level_1_description,
    level_2_name,
    level_2_description,
    level_3_name,
    level_3_description,
    level_4_name,
    level_4_description,
    level_5_name,
    level_5_description,
    number_of_scenarios,
    facet_focus,
    introduction_context,
    progression_description,
    task_questions,
    reflection_questions,
    strength_checklist
  } = req.body;

  // Check if at least one field is provided
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
    !download_link &&
    is_active === undefined &&
    !learning_objective &&
    !level_1_name &&
    !level_1_description &&
    !level_2_name &&
    !level_2_description &&
    !level_3_name &&
    !level_3_description &&
    !level_4_name &&
    !level_4_description &&
    !level_5_name &&
    !level_5_description &&
    !number_of_scenarios &&
    !facet_focus &&
    !introduction_context &&
    !progression_description &&
    !task_questions &&
    !reflection_questions &&
    !strength_checklist
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

    // Start transaction
    await pool.query("BEGIN");

    // Get existing concept
    const existingConcept = await pool.query(
      "SELECT * FROM concepts WHERE concept_id = $1",
      [concept_id]
    );

    if (existingConcept.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: `Concept not found with concept_id ${concept_id}`,
      });
    }

    const currentConcept = existingConcept.rows[0];
    const newVersion = currentConcept.version + 1;

    // Check for concept_name conflict if provided
    if (
      trimmedConceptName &&
      trimmedConceptName !== currentConcept.concept_name
    ) {
      const nameExists = await pool.query(
        "SELECT concept_id FROM concepts WHERE concept_name = $1",
        [trimmedConceptName]
      );
      if (nameExists.rows.length > 0) {
        await pool.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: `Concept name '${trimmedConceptName}' already exists`,
        });
      }
    }

    // Archive existing concept to concepts_archive
await pool.query(
  `INSERT INTO concepts_archive (
    concept_id,
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
    download_link,
    is_active,
    created_at,
    updated_at,
    version,
    archived_at,
    learning_objective,
    level_1_name,
    level_1_description,
    level_2_name,
    level_2_description,
    level_3_name,
    level_3_description,
    level_4_name,
    level_4_description,
    level_5_name,
    level_5_description,
    number_of_scenarios,
    facet_focus,
    introduction_context,
    progression_description,
    task_questions,
    reflection_questions,
    strength_checklist
    
  ) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15,
    $16, $17, $18, $19,CURRENT_TIMESTAMP,
    $20, $21, $22, $23, $24,
    $25, $26, $27, $28, $29,
    $30, $31, $32, $33, $34,
    $35, $36, $37
    
  )`,
  [
    currentConcept.concept_id,
    currentConcept.concept_name,
    currentConcept.concept_content,
    currentConcept.concept_enduring_understandings,
    currentConcept.concept_essential_questions,
    currentConcept.concept_knowledge_skills,
    currentConcept.stage_1_content,
    currentConcept.stage_2_content,
    currentConcept.stage_3_content,
    currentConcept.stage_4_content,
    currentConcept.stage_5_content,
    currentConcept.concept_understanding_rubric,
    currentConcept.understanding_skills_rubric,
    currentConcept.learning_assessment_dimensions,
    currentConcept.download_link,
    currentConcept.is_active,
    currentConcept.created_at,
    currentConcept.updated_at,
    currentConcept.version, // ✅ now in correct place
    currentConcept.learning_objective,
    currentConcept.level_1_name,
    currentConcept.level_1_description,
    currentConcept.level_2_name,
    currentConcept.level_2_description,
    currentConcept.level_3_name,
    currentConcept.level_3_description,
    currentConcept.level_4_name,
    currentConcept.level_4_description,
    currentConcept.level_5_name,
    currentConcept.level_5_description,
    currentConcept.number_of_scenarios,
    currentConcept.facet_focus,
    currentConcept.introduction_context,
    currentConcept.progression_description,
    currentConcept.task_questions,
    currentConcept.reflection_questions,
    currentConcept.strength_checklist
  ]
);


    // Update existing concept with new data
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
    if (download_link !== undefined) {
      fields.push(`download_link = $${index++}`);
      values.push(download_link);
    }
    if (learning_objective !== undefined) {
      fields.push(`learning_objective = $${index++}`);
      values.push(learning_objective);
    }
    if (level_1_name !== undefined) {
      fields.push(`level_1_name = $${index++}`);
      values.push(level_1_name);
    }
    if (level_1_description !== undefined) {
      fields.push(`level_1_description = $${index++}`);
      values.push(level_1_description);
    }
    if (level_2_name !== undefined) {
      fields.push(`level_2_name = $${index++}`);
      values.push(level_2_name);
    }
    if (level_2_description !== undefined) {
      fields.push(`level_2_description = $${index++}`);
      values.push(level_2_description);
    }
    if (level_3_name !== undefined) {
      fields.push(`level_3_name = $${index++}`);
      values.push(level_3_name);
    }
    if (level_3_description !== undefined) {
      fields.push(`level_3_description = $${index++}`);
      values.push(level_3_description);
    }
    if (level_4_name !== undefined) {
      fields.push(`level_4_name = $${index++}`);
      values.push(level_4_name);
    }
    if (level_4_description !== undefined) {
      fields.push(`level_4_description = $${index++}`);
      values.push(level_4_description);
    }
    if (level_5_name !== undefined) {
      fields.push(`level_5_name = $${index++}`);
      values.push(level_5_name);
    }
    if (level_5_description !== undefined) {
      fields.push(`level_5_description = $${index++}`);
      values.push(level_5_description);
    }
    if (number_of_scenarios !== undefined) {
      fields.push(`number_of_scenarios = $${index++}`);
      values.push(number_of_scenarios);
    }
    if (facet_focus !== undefined) {
      fields.push(`facet_focus = $${index++}`);
      values.push(facet_focus);
    }
    if (introduction_context !== undefined) {
      fields.push(`introduction_context = $${index++}`);
      values.push(introduction_context);
    }
    if (progression_description !== undefined) {
      fields.push(`progression_description = $${index++}`);
      values.push(progression_description);
    }
    if (task_questions !== undefined) {
      fields.push(`task_questions = $${index++}`);
      values.push(task_questions);
    }
    if (reflection_questions !== undefined) {
      fields.push(`reflection_questions = $${index++}`);
      values.push(reflection_questions);
    }
    if (strength_checklist !== undefined) {
      fields.push(`strength_checklist = $${index++}`);
      values.push(strength_checklist);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(is_active);
    }
    fields.push(`version = $${index++}`);
    values.push(newVersion);
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(concept_id);

    const query = `UPDATE concepts SET ${fields.join(", ")} WHERE concept_id = $${index} RETURNING *`;
    const result = await pool.query(query, values);

    await pool.query("COMMIT");

    res.json({
      success: true,
      data: result.rows[0],
      message: "Concept updated successfully",
    });
  } catch (error) {
    await pool.query("ROLLBACK");
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
      message:
        result.rows.length > 0
          ? "Concepts fetched successfully"
          : "No concepts found",
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
      message:
        result.rows.length > 0
          ? "Active concepts fetched successfully"
          : "No active concepts found",
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

const getArchivedConcepts = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM concepts_archive ORDER BY concept_id, version"
    );
    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "Archived concepts fetched successfully"
          : "No archived concepts found",
    });
  } catch (error) {
    console.error("Error fetching archived concepts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getNonArchivedConcepts = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM concepts ORDER BY concept_id"
    );
    res.json({
      success: true,
      data: result.rows,
      message:
        result.rows.length > 0
          ? "Non-archived concepts fetched successfully"
          : "No non-archived concepts found",
    });
  } catch (error) {
    console.error("Error fetching non-archived concepts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getConceptById = async (req, res) => {
  const { concept_id } = req.params;
  if (!/^\d+$/.test(concept_id)) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "concept_id must be a valid integer",
    });
  }
  try {
    const result = await pool.query(
      "SELECT * FROM concepts WHERE concept_id = $1",
      [parseInt(concept_id)]
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
  getArchivedConcepts,
  getNonArchivedConcepts,
  getConceptById,
  getConceptByName,
};
