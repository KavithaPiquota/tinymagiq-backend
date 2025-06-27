const { pool } = require("../config/database");

// Assign a concept to a batch
const assignConceptToBatch = async (req, res) => {
  const { batch_name, organization_name, concept_name } = req.body;

  if (!batch_name || !organization_name || !concept_name) {
    return res.status(400).json({ error: "Batch name, organization name, and concept name are required" });
  }

  try {
    // Look up org_id by organization_name
    const orgCheck = await pool.query(
      `SELECT org_id FROM organizations WHERE name = $1`,
      [organization_name]
    );
    if (orgCheck.rows.length === 0) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const org_id = orgCheck.rows[0].org_id;

    // Look up batch_id by batch_name and org_id, ensure isActive
    const batchCheck = await pool.query(
      `SELECT batch_id FROM batches WHERE batch_name = $1 AND org_id = $2 AND isActive = TRUE`,
      [batch_name, org_id]
    );
    if (batchCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active batch not found for this organization" });
    }
    const batch_id = batchCheck.rows[0].batch_id;

    // Look up concept_id by concept_name, ensure isActive
    const conceptCheck = await pool.query(
      `SELECT concept_id FROM concepts WHERE concept_name = $1 AND isActive = TRUE`,
      [concept_name]
    );
    if (conceptCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active concept not found" });
    }
    const concept_id = conceptCheck.rows[0].concept_id;

    // Insert into batch_concepts
    await pool.query(
      `INSERT INTO batch_concepts (batch_id, concept_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [batch_id, concept_id]
    );

    return res.status(201).json({
      message: "Concept assigned to batch",
      assignment: { batch_name, concept_name, organization_name }
    });
  } catch (error) {
    console.error("Error assigning concept to batch:", error);
    if (error.code === "23505") {
      return res.status(400).json({ error: "Concept already assigned to this batch" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get concepts for a pod (via its batch)
const getPodConcepts = async (req, res) => {
  const { pod_id } = req.params;

  try {
    // Verify pod exists and is active, get its batch_id
    const podCheck = await pool.query(
      `SELECT batch_id FROM pods WHERE pod_id = $1 AND isActive = TRUE`,
      [pod_id]
    );
    if (podCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active pod not found" });
    }
    const batch_id = podCheck.rows[0].batch_id;

    // Verify batch is active
    const batchCheck = await pool.query(
      `SELECT batch_id FROM batches WHERE batch_id = $1 AND isActive = TRUE`,
      [batch_id]
    );
    if (batchCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active batch not found" });
    }

    // Get active concepts assigned to the batch
    const result = await pool.query(
      `SELECT c.concept_id, c.concept_name, c.concept_content, c.concept_enduring_understandings,
              c.concept_essential_questions, c.concept_knowledge_skills, c.stage_1_content,
              c.stage_2_content, c.stage_3_content, c.stage_4_content, c.stage_5_content,
              c.concept_understanding_rubric, c.understanding_skills_rubric, c.learning_assessment_dimensions,
              c.isActive, c.created_at, c.updated_at
       FROM concepts c
       JOIN batch_concepts bc ON c.concept_id = bc.concept_id
       WHERE bc.batch_id = $1 AND c.isActive = TRUE`,
      [batch_id]
    );

    return res.status(200).json({ concepts: result.rows });
  } catch (error) {
    console.error("Error fetching pod concepts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Remove a concept from a batch
const removeConceptFromBatch = async (req, res) => {
  const { batch_name, organization_name, concept_name } = req.body;

  if (!batch_name || !organization_name || !concept_name) {
    return res.status(400).json({ error: "Batch name, organization name, and concept name are required" });
  }

  try {
    // Look up org_id by organization_name
    const orgCheck = await pool.query(
      `SELECT org_id FROM organizations WHERE name = $1`,
      [organization_name]
    );
    if (orgCheck.rows.length === 0) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const org_id = orgCheck.rows[0].org_id;

    // Look up batch_id by batch_name and org_id, ensure isActive
    const batchCheck = await pool.query(
      `SELECT batch_id FROM batches WHERE batch_name = $1 AND org_id = $2 AND isActive = TRUE`,
      [batch_name, org_id]
    );
    if (batchCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active batch not found for this organization" });
    }
    const batch_id = batchCheck.rows[0].batch_id;

    // Look up concept_id by concept_name, ensure isActive
    const conceptCheck = await pool.query(
      `SELECT concept_id FROM concepts WHERE concept_name = $1 AND isActive = TRUE`,
      [concept_name]
    );
    if (conceptCheck.rows.length === 0) {
      return res.status(404).json({ error: "Active concept not found" });
    }
    const concept_id = conceptCheck.rows[0].concept_id;

    // Delete from batch_concepts
    const result = await pool.query(
      `DELETE FROM batch_concepts WHERE batch_id = $1 AND concept_id = $2`,
      [batch_id, concept_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Concept not assigned to this batch" });
    }

    return res.status(200).json({
      message: "Concept removed from batch",
      assignment: { batch_name, concept_name, organization_name }
    });
  } catch (error) {
    console.error("Error removing concept from batch:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  assignConceptToBatch,
  getPodConcepts,
  removeConceptFromBatch
};