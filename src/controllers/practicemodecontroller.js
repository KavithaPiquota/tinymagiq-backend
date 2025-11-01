const { pool } = require('../config/database');

class practicemodeController {

    // Create practicemode with concept_name field and scoring support
    async createpracticemode(req, res, next) {
        let client;

        try {
            const { 
                user_id, 
                conversation, 
                status, 
                current_stage, 
                concept_name,
                batch_id,
                // Scoring fields (only saved when status is 'completed')
                scoring_data, // Expected to contain the parsed scoring object from frontend
                overall_performance,
                facet_ratings_explanation,
                facet_ratings_interpretation,
                facet_ratings_application,
                facet_ratings_perspective,
                facet_ratings_empathy,
                facet_ratings_self_knowledge,
                key_patterns,
                recommended_focus_areas,
                personalized_next_steps,
                session_summary
            } = req.body;

            if (!user_id || !conversation) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    details: 'user_id and conversation are required'
                });
            }
            if (!batch_id) {
                return res.status(400).json({
                    success: false,
                    error: "batch_id required",
                });
            }

            // concept_name validation (optional but if provided should not be empty)
            let finalConceptName = concept_name ? concept_name.trim() : null;
            if (finalConceptName === '') {
                finalConceptName = null;
            }

            // Only 3 statuses allowed
            const validStatuses = ['not_started', 'inprogress', 'completed'];
            const finalStatus = validStatuses.includes(status) ? status : 'not_started';

            // Stage validation
            let finalStage = parseInt(current_stage) || 0;
            const validStages = [0, 1, 2, 3, 4, 5];
            if (!validStages.includes(finalStage)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid stage',
                    details: 'current_stage must be between 0 and 5'
                });
            }

            // Business logic for status-stage relationship
            if (finalStatus === 'not_started') {
                finalStage = 0; // not_started is always stage 0
            } 
            // inprogress can be any stage 0-5

            if (!Array.isArray(conversation)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid conversation format',
                    details: 'conversation must be an array'
                });
            }

            // Process scoring data if status is completed
            let scoringFields = {
                explanation_score: null,
                interpretation_score: null,
                application_score: null,
                perspective_score: null,
                empathy_score: null,
                self_knowledge_score: null,
                asking_questions_score: null,
                clarifying_ambiguity_score: null,
                summarizing_confirming_score: null,
                challenging_ideas_score: null,
                comparing_concepts_score: null,
                abstract_concrete_score: null,
                six_facets_average: null,
                understanding_skills_average: null,
                final_weighted_score: null
            };

            // Initialize extracted fields from final_assessment (override if provided in body)
            let extracted_overall_performance = overall_performance || null;
            let extracted_facet_ratings_explanation = facet_ratings_explanation || null;
            let extracted_facet_ratings_interpretation = facet_ratings_interpretation || null;
            let extracted_facet_ratings_application = facet_ratings_application || null;
            let extracted_facet_ratings_perspective = facet_ratings_perspective || null;
            let extracted_facet_ratings_empathy = facet_ratings_empathy || null;
            let extracted_facet_ratings_self_knowledge = facet_ratings_self_knowledge || null;
            let extracted_key_patterns = key_patterns || null;
            let extracted_recommended_focus_areas = recommended_focus_areas || null;
            let extracted_personalized_next_steps = personalized_next_steps || null;
            let extracted_session_summary = session_summary || null;

            if (finalStatus === 'completed' && scoring_data) {
                console.log("📊 Processing scoring data for completed practicemode:", JSON.stringify(scoring_data, null, 2));
                
                const sixFacets = scoring_data.six_facets || {};
                
                // Extract and coerce to numbers (handle strings like "1.33")
                scoringFields.explanation_score = sixFacets.explanation != null ? parseFloat(sixFacets.explanation) : null;
                scoringFields.interpretation_score = sixFacets.interpretation != null ? parseFloat(sixFacets.interpretation) : null;
                scoringFields.application_score = sixFacets.application != null ? parseFloat(sixFacets.application) : null;
                scoringFields.perspective_score = sixFacets.perspective != null ? parseFloat(sixFacets.perspective) : null;
                scoringFields.empathy_score = sixFacets.empathy != null ? parseFloat(sixFacets.empathy) : null;
                scoringFields.self_knowledge_score = sixFacets.self_knowledge != null ? parseFloat(sixFacets.self_knowledge) : null;

                // No UnderstandingSkills in new structure, set to null
                scoringFields.asking_questions_score = null;
                scoringFields.clarifying_ambiguity_score = null;
                scoringFields.summarizing_confirming_score = null;
                scoringFields.challenging_ideas_score = null;
                scoringFields.comparing_concepts_score = null;
                scoringFields.abstract_concrete_score = null;
                scoringFields.understanding_skills_average = null;

                // Set averages and final score (coerce to numbers)
                scoringFields.six_facets_average = sixFacets.average != null ? parseFloat(sixFacets.average) : null;
                scoringFields.final_weighted_score = scoring_data.overall_performance_score != null ? parseFloat(scoring_data.overall_performance_score) : null;

                // Validate: Warn if any required score is invalid
                const invalidScores = Object.entries(sixFacets).filter(([key, val]) => key !== 'average' && (val == null || isNaN(parseFloat(val))));
                if (invalidScores.length > 0) {
                    console.warn("⚠️ Incomplete six_facets scores:", invalidScores);
                }

                console.log("📊 Extracted scoring fields:", scoringFields);

                // Extract additional fields from scoring_data.final_assessment if present
                if (scoring_data.final_assessment) {
                    const fa = scoring_data.final_assessment;
                    const facets = fa.facet_assessments || {};

                    extracted_overall_performance = fa.overall_assessment?.summary || extracted_overall_performance;
                    extracted_facet_ratings_explanation = facets.explanation?.developmental_notes || extracted_facet_ratings_explanation;
                    extracted_facet_ratings_interpretation = facets.interpretation?.developmental_notes || extracted_facet_ratings_interpretation;
                    extracted_facet_ratings_application = facets.application?.developmental_notes || extracted_facet_ratings_application;
                    extracted_facet_ratings_perspective = facets.perspective?.developmental_notes || extracted_facet_ratings_perspective;
                    extracted_facet_ratings_empathy = facets.empathy?.developmental_notes || extracted_facet_ratings_empathy;
                    extracted_facet_ratings_self_knowledge = facets.self_knowledge?.developmental_notes || extracted_facet_ratings_self_knowledge;
                    extracted_key_patterns = JSON.stringify(fa.pattern_analysis) || extracted_key_patterns;
                    extracted_recommended_focus_areas = JSON.stringify(fa.personalized_feedback?.priority_growth_areas) || extracted_recommended_focus_areas;
                    extracted_personalized_next_steps = JSON.stringify(fa.next_steps) || extracted_personalized_next_steps;
                    extracted_session_summary = fa.overall_assessment?.summary || extracted_session_summary; // Or customize as needed
                }
            }

            console.log(`💾 Creating practicemode for ${user_id} with concept: "${finalConceptName}" status: ${finalStatus}, stage: ${finalStage}`);
            if (finalStatus === 'completed' && scoringFields.final_weighted_score) {
                console.log(`📊 Including scoring data - Final Score: ${scoringFields.final_weighted_score}`);
            }

            client = await pool.connect();

            try {
                await client.query('BEGIN');

                let insertQuery, insertParams;
                
                if (finalStatus === 'completed' && Object.values(scoringFields).some(val => val !== null)) {
                    // Insert with scoring data
                    insertQuery = `INSERT INTO practicemode (
                        user_id, batch_id, conversation, status, current_stage, concept_name,
                        explanation_score, interpretation_score, application_score, perspective_score, 
                        empathy_score, self_knowledge_score, asking_questions_score, clarifying_ambiguity_score, 
                        summarizing_confirming_score, challenging_ideas_score, comparing_concepts_score, 
                        abstract_concrete_score, six_facets_average, understanding_skills_average, final_weighted_score, overall_performance, facet_ratings_explanation, facet_ratings_interpretation, facet_ratings_application, facet_ratings_perspective, facet_ratings_empathy, facet_ratings_self_knowledge, key_patterns, recommended_focus_areas, personalized_next_steps, session_summary
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31) 
                    RETURNING id, created_at, updated_at`;
                    
                    insertParams = [
                        user_id, 
                        batch_id,
                        JSON.stringify(conversation), 
                        finalStatus, 
                        finalStage, 
                        finalConceptName,
                        scoringFields.explanation_score,
                        scoringFields.interpretation_score,
                        scoringFields.application_score,
                        scoringFields.perspective_score,
                        scoringFields.empathy_score,
                        scoringFields.self_knowledge_score,
                        scoringFields.asking_questions_score,
                        scoringFields.clarifying_ambiguity_score,
                        scoringFields.summarizing_confirming_score,
                        scoringFields.challenging_ideas_score,
                        scoringFields.comparing_concepts_score,
                        scoringFields.abstract_concrete_score,
                        scoringFields.six_facets_average,
                        scoringFields.understanding_skills_average,
                        scoringFields.final_weighted_score,
                        extracted_overall_performance,
                        extracted_facet_ratings_explanation,
                        extracted_facet_ratings_interpretation,
                        extracted_facet_ratings_application,
                        extracted_facet_ratings_perspective,
                        extracted_facet_ratings_empathy,
                        extracted_facet_ratings_self_knowledge,
                        extracted_key_patterns,
                        extracted_recommended_focus_areas,
                        extracted_personalized_next_steps,
                        extracted_session_summary
                    ];

                } else {
                    // Insert without scoring data
                    insertQuery = `INSERT INTO practicemode (user_id, batch_id, conversation, status, current_stage, concept_name, overall_performance, facet_ratings_explanation, facet_ratings_interpretation, facet_ratings_application, facet_ratings_perspective, facet_ratings_empathy, facet_ratings_self_knowledge, key_patterns, recommended_focus_areas, personalized_next_steps, session_summary) 
                                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
                                   RETURNING id, created_at, updated_at`;
                    insertParams = [user_id, batch_id, JSON.stringify(conversation), finalStatus, finalStage, finalConceptName, extracted_overall_performance, extracted_facet_ratings_explanation, extracted_facet_ratings_interpretation, extracted_facet_ratings_application, extracted_facet_ratings_perspective, extracted_facet_ratings_empathy, extracted_facet_ratings_self_knowledge, extracted_key_patterns, extracted_recommended_focus_areas, extracted_personalized_next_steps, extracted_session_summary];
                }

                const insertResult = await client.query(insertQuery, insertParams);
                await client.query('COMMIT');

                const newpracticemode = insertResult.rows[0];

                console.log(`✅ practicemode created: ${user_id} - "${finalConceptName}" - ${finalStatus} - Stage ${finalStage} (ID: ${newpracticemode.id})`);

                const responseData = {
                    id: newpracticemode.id,
                    user_id,
                    batch_id,
                    conversation,
                    status: finalStatus,
                    current_stage: finalStage,
                    concept_name: finalConceptName,
                    stage_display_name: `Stage ${finalStage}`,
                    created_at: newpracticemode.created_at,
                    updated_at: newpracticemode.updated_at,
                    shouldStartFresh: false,
                    overall_performance: extracted_overall_performance,
                    facet_ratings_explanation: extracted_facet_ratings_explanation,
                    facet_ratings_interpretation: extracted_facet_ratings_interpretation,
                    facet_ratings_application: extracted_facet_ratings_application,
                    facet_ratings_perspective: extracted_facet_ratings_perspective,
                    facet_ratings_empathy: extracted_facet_ratings_empathy,
                    facet_ratings_self_knowledge: extracted_facet_ratings_self_knowledge,
                    key_patterns: extracted_key_patterns,
                    recommended_focus_areas: extracted_recommended_focus_areas,
                    personalized_next_steps: extracted_personalized_next_steps,
                    session_summary: extracted_session_summary
                };

                // Include scoring data in response if it was saved
                if (finalStatus === 'completed' && Object.values(scoringFields).some(val => val !== null)) {
                    responseData.scoring = {
                        six_facets: {
                            explanation: scoringFields.explanation_score,
                            interpretation: scoringFields.interpretation_score,
                            application: scoringFields.application_score,
                            perspective: scoringFields.perspective_score,
                            empathy: scoringFields.empathy_score,
                            self_knowledge: scoringFields.self_knowledge_score,
                            average: scoringFields.six_facets_average
                        },
                        understanding_skills: {
                            asking_questions: scoringFields.asking_questions_score,
                            clarifying_ambiguity: scoringFields.clarifying_ambiguity_score,
                            summarizing_confirming: scoringFields.summarizing_confirming_score,
                            challenging_ideas: scoringFields.challenging_ideas_score,
                            comparing_concepts: scoringFields.comparing_concepts_score,
                            abstract_concrete: scoringFields.abstract_concrete_score,
                            average: scoringFields.understanding_skills_average
                        },
                        final_score: scoringFields.final_weighted_score
                    };
                }

                res.status(201).json({
                    success: true,
                    message: 'practicemode stored successfully',
                    data: responseData
                });

            } catch (transactionError) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Rollback failed:', rollbackError);
                }
                throw transactionError;
            }

        } catch (error) {
            console.error('❌ Error creating practicemode:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to store practicemode',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        } finally {
            if (client) {
                try {
                    client.release();
                } catch (releaseError) {
                    console.error('Error releasing client:', releaseError);
                }
            }
        }
    }

    // Get session status with concept_name (unchanged)
    async getSessionStatus(req, res, next) {
        try {
            const { user_id } = req.params;
            const { concept_name, batch_id } = req.query;

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: user_id'
                });
            }

            const conceptInfo = concept_name ? ` for concept: "${concept_name}"` : '';
            console.log(`🔍 Checking session status for user_id: ${user_id}${conceptInfo}`);

            let query, params;

           if (concept_name && batch_id) {
                query = `SELECT id, user_id, conversation, status, current_stage, concept_name, batch_id, created_at, overall_performance, facet_ratings_explanation, facet_ratings_interpretation, facet_ratings_application, facet_ratings_perspective, facet_ratings_empathy, facet_ratings_self_knowledge, key_patterns, recommended_focus_areas, personalized_next_steps, session_summary, updated_at 
                        FROM practicemode 
                        WHERE user_id = $1 AND status IN ('not_started', 'inprogress') 
                      AND concept_name ILIKE $2 AND batch_id = $3
                      ORDER BY updated_at DESC 
                      LIMIT 1`;
                params = [user_id, `%${concept_name}%`, batch_id];
            } else if (batch_id) {
            // ✅ Check for sessions with specific batch only
            query = `SELECT id, user_id, conversation, status, current_stage, concept_name, batch_id, created_at, overall_performance, facet_ratings_explanation, facet_ratings_interpretation, facet_ratings_application, facet_ratings_perspective, facet_ratings_empathy, facet_ratings_self_knowledge, key_patterns, recommended_focus_areas, personalized_next_steps, session_summary, updated_at 
                      FROM practicemode 
                      WHERE user_id = $1 AND status IN ('not_started', 'inprogress') AND batch_id = $2
                      ORDER BY updated_at DESC 
                      LIMIT 1`;
            params = [user_id, batch_id];
        } else if (concept_name) {
                query = `SELECT id, user_id, conversation, status, current_stage, concept_name, batch_id, created_at, overall_performance, facet_ratings_explanation, facet_ratings_interpretation, facet_ratings_application, facet_ratings_perspective, facet_ratings_empathy, facet_ratings_self_knowledge, key_patterns, recommended_focus_areas, personalized_next_steps, session_summary, updated_at 
                        FROM practicemode 
                        WHERE user_id = $1 AND status IN ('not_started', 'inprogress') AND concept_name ILIKE $2
                        ORDER BY updated_at DESC 
                        LIMIT 1`;
                params = [user_id, `%${concept_name}%`];
            } else {
                query = `SELECT id, user_id, conversation, status, current_stage, concept_name, batch_id, created_at, overall_performance, facet_ratings_explanation, facet_ratings_interpretation, facet_ratings_application, facet_ratings_perspective, facet_ratings_empathy, facet_ratings_self_knowledge, key_patterns, recommended_focus_areas, personalized_next_steps, session_summary, updated_at 
                        FROM practicemode 
                        WHERE user_id = $1 AND status IN ('not_started', 'inprogress') 
                        ORDER BY updated_at DESC 
                        LIMIT 1`;
                params = [user_id];
            }

            const activeResult = await pool.query(query, params);

            if (activeResult.rows.length > 0) {
                const practicemode = activeResult.rows[0];
                if (typeof practicemode.conversation === 'string') {
                    try {
                        practicemode.conversation = JSON.parse(practicemode.conversation);
                    } catch (parseError) {
                        console.error('Error parsing conversation JSON:', parseError);
                    }
                }

                const stageDisplayName = `Stage ${practicemode.current_stage}`;
                const conceptDisplay = practicemode.concept_name ? ` for "${practicemode.concept_name}"` : '';
                const searchedConcept = concept_name ? ` (searched for: "${concept_name}")` : '';
                console.log(`🔄 Found ${practicemode.status} conversation (ID: ${practicemode.id}) at ${stageDisplayName}${conceptDisplay}${searchedConcept}`);

                return res.json({
                    success: true,
                    data: {
                        PracSessionType: 'resume',
                        hasActiveSession: true,
                        shouldStartFresh: false,
                        practicemode: {
                            ...practicemode,
                            stage_display_name: stageDisplayName
                        },
                        searched_concept: concept_name || null,
                        message: `Found ${practicemode.status} conversation at ${stageDisplayName}${conceptDisplay}${searchedConcept}`
                    }
                });
            }

            if (concept_name) {
                console.log(`🔍 No active sessions found for user_id ${user_id} with concept: "${concept_name}"`);
                
                return res.json({
                    success: true,
                    data: {
                        PracSessionType: 'fresh',
                        hasActiveSession: false,
                        shouldStartFresh: true,
                        practicemode: null,
                        recommended_stage: 0,
                        stage_display_name: 'Stage 0',
                        searched_concept: concept_name,
                        message: `No active conversations found for concept: "${concept_name}". Start fresh.`
                    }
                });
            }

            const completedResult = await pool.query(
                `SELECT COUNT(*) as count FROM practicemode 
             WHERE user_id = $1 AND status = 'completed'`,
                [user_id]
            );

            const completedCount = parseInt(completedResult.rows[0].count, 10);
            console.log(`🆕 No active sessions for user_id ${user_id}. Completed: ${completedCount}`);

            return res.json({
                success: true,
                data: {
                    PracSessionType: 'fresh',
                    hasActiveSession: false,
                    shouldStartFresh: true,
                    practicemode: null,
                    recommended_stage: 0,
                    stage_display_name: 'Stage 0',
                    searched_concept: null,
                    message: `No active conversations. Start fresh. (${completedCount} completed sessions)`
                }
            });

        } catch (error) {
            console.error('❌ Error checking session status:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to check session status',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Update conversation with concept_name and scoring support
    async updateConversation(req, res, next) {
        let client;

        try {
            const { practicemode_id } = req.params;
            const { 
                batch_id,
                conversation, 
                status, 
                current_stage, 
                concept_name,
                // Scoring fields (only saved when status is 'completed')
                scoring_data, // Expected to contain the parsed scoring object from frontend
                overall_performance,
                facet_ratings_explanation,
                facet_ratings_interpretation,
                facet_ratings_application,
                facet_ratings_perspective,
                facet_ratings_empathy,
                facet_ratings_self_knowledge,
                key_patterns,
                recommended_focus_areas,
                personalized_next_steps,
                session_summary
            } = req.body;

            if (!practicemode_id || !conversation) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: practicemode_id and conversation'
                });
            }
             
            if (!batch_id) {
                return res.status(400).json({
                    success: false,
                    error: "batch_id required",
                });
            }
            // concept_name validation (optional but if provided should not be empty)
            let finalConceptName = concept_name !== undefined ? (concept_name ? concept_name.trim() : null) : undefined;
            if (finalConceptName === '') {
                finalConceptName = null;
            }

            const validStatuses = ['not_started', 'inprogress', 'completed'];
            const finalStatus = validStatuses.includes(status) ? status : 'inprogress';

            // Stage validation
            let finalStage = current_stage !== undefined ? parseInt(current_stage) : null;
            const validStages = [0, 1, 2, 3, 4, 5];
            if (finalStage !== null && !validStages.includes(finalStage)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid stage',
                    details: 'current_stage must be between 0 and 5'
                });
            }

            console.log(`📝 Updating conversation ID: ${practicemode_id} with concept: "${finalConceptName}" status: ${finalStatus}, stage: ${finalStage}`);

            client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Check if practicemode exists
                const checkResult = await pool.query(
                    'SELECT id, user_id, status, current_stage, concept_name FROM practicemode WHERE id = $1',
                    [parseInt(practicemode_id)]
                );

                if (checkResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({
                        success: false,
                        error: 'practicemode not found'
                    });
                }

                const existingpracticemode = checkResult.rows[0];

                // If stage not provided, keep current stage
                if (finalStage === null) {
                    finalStage = existingpracticemode.current_stage || 0;
                }

                // If concept_name not provided, keep existing concept_name
                if (finalConceptName === undefined) {
                    finalConceptName = existingpracticemode.concept_name;
                }

                // Business logic for status-stage relationship
                if (finalStatus === 'not_started') {
                    finalStage = 0;
                } 

                // Process scoring data if status is completed
                let scoringFields = {
                    explanation_score: null,
                    interpretation_score: null,
                    application_score: null,
                    perspective_score: null,
                    empathy_score: null,
                    self_knowledge_score: null,
                    asking_questions_score: null,
                    clarifying_ambiguity_score: null,
                    summarizing_confirming_score: null,
                    challenging_ideas_score: null,
                    comparing_concepts_score: null,
                    abstract_concrete_score: null,
                    six_facets_average: null,
                    understanding_skills_average: null,
                    final_weighted_score: null
                };

                // Initialize extracted fields from final_assessment (override if provided in body)
                let extracted_overall_performance = overall_performance || null;
                let extracted_facet_ratings_explanation = facet_ratings_explanation || null;
                let extracted_facet_ratings_interpretation = facet_ratings_interpretation || null;
                let extracted_facet_ratings_application = facet_ratings_application || null;
                let extracted_facet_ratings_perspective = facet_ratings_perspective || null;
                let extracted_facet_ratings_empathy = facet_ratings_empathy || null;
                let extracted_facet_ratings_self_knowledge = facet_ratings_self_knowledge || null;
                let extracted_key_patterns = key_patterns || null;
                let extracted_recommended_focus_areas = recommended_focus_areas || null;
                let extracted_personalized_next_steps = personalized_next_steps || null;
                let extracted_session_summary = session_summary || null;

                if (finalStatus === 'completed' && scoring_data) {
                    console.log("📊 Processing scoring data for completed practicemode update:", JSON.stringify(scoring_data, null, 2));
                    
                    const sixFacets = scoring_data.six_facets || {};
                    
                    // Extract and coerce to numbers (handle strings like "1.33")
                    scoringFields.explanation_score = sixFacets.explanation != null ? parseFloat(sixFacets.explanation) : null;
                    scoringFields.interpretation_score = sixFacets.interpretation != null ? parseFloat(sixFacets.interpretation) : null;
                    scoringFields.application_score = sixFacets.application != null ? parseFloat(sixFacets.application) : null;
                    scoringFields.perspective_score = sixFacets.perspective != null ? parseFloat(sixFacets.perspective) : null;
                    scoringFields.empathy_score = sixFacets.empathy != null ? parseFloat(sixFacets.empathy) : null;
                    scoringFields.self_knowledge_score = sixFacets.self_knowledge != null ? parseFloat(sixFacets.self_knowledge) : null;

                    // No UnderstandingSkills in new structure, set to null
                    scoringFields.asking_questions_score = null;
                    scoringFields.clarifying_ambiguity_score = null;
                    scoringFields.summarizing_confirming_score = null;
                    scoringFields.challenging_ideas_score = null;
                    scoringFields.comparing_concepts_score = null;
                    scoringFields.abstract_concrete_score = null;
                    scoringFields.understanding_skills_average = null;

                    // Set averages and final score (coerce to numbers)
                    scoringFields.six_facets_average = sixFacets.average != null ? parseFloat(sixFacets.average) : null;
                    scoringFields.final_weighted_score = scoring_data.overall_performance_score != null ? parseFloat(scoring_data.overall_performance_score) : null;

                    // Validate: Warn if any required score is invalid
                    const invalidScores = Object.entries(sixFacets).filter(([key, val]) => key !== 'average' && (val == null || isNaN(parseFloat(val))));
                    if (invalidScores.length > 0) {
                        console.warn("⚠️ Incomplete six_facets scores:", invalidScores);
                    }

                    console.log("📊 Extracted scoring fields for update:", scoringFields);

                    // Extract additional fields from scoring_data.final_assessment if present
                    if (scoring_data.final_assessment) {
                        const fa = scoring_data.final_assessment;
                        const facets = fa.facet_assessments || {};

                        extracted_overall_performance = fa.overall_assessment?.summary || extracted_overall_performance;
                        extracted_facet_ratings_explanation = facets.explanation?.developmental_notes || extracted_facet_ratings_explanation;
                        extracted_facet_ratings_interpretation = facets.interpretation?.developmental_notes || extracted_facet_ratings_interpretation;
                        extracted_facet_ratings_application = facets.application?.developmental_notes || extracted_facet_ratings_application;
                        extracted_facet_ratings_perspective = facets.perspective?.developmental_notes || extracted_facet_ratings_perspective;
                        extracted_facet_ratings_empathy = facets.empathy?.developmental_notes || extracted_facet_ratings_empathy;
                        extracted_facet_ratings_self_knowledge = facets.self_knowledge?.developmental_notes || extracted_facet_ratings_self_knowledge;
                        extracted_key_patterns = JSON.stringify(fa.pattern_analysis) || extracted_key_patterns;
                        extracted_recommended_focus_areas = JSON.stringify(fa.personalized_feedback?.priority_growth_areas) || extracted_recommended_focus_areas;
                        extracted_personalized_next_steps = JSON.stringify(fa.next_steps) || extracted_personalized_next_steps;
                        extracted_session_summary = fa.overall_assessment?.summary || extracted_session_summary; // Or customize as needed
                    }
                }

                let updateQuery, updateParams;
                
                if (finalStatus === 'completed' && Object.values(scoringFields).some(val => val !== null)) {
                    // Update with scoring data
                    updateQuery = `UPDATE practicemode 
                                   SET conversation = $1, status = $2, current_stage = $3, concept_name = $4, batch_id = $5,
                                       explanation_score = $6, interpretation_score = $7, application_score = $8, 
                                       perspective_score = $9, empathy_score = $10, self_knowledge_score = $11,
                                       asking_questions_score = $12, clarifying_ambiguity_score = $13, 
                                       summarizing_confirming_score = $14, challenging_ideas_score = $15, 
                                       comparing_concepts_score = $16, abstract_concrete_score = $17,
                                       six_facets_average = $18, understanding_skills_average = $19, 
                                       final_weighted_score = $20, overall_performance = $21, facet_ratings_explanation = $22, 
                                       facet_ratings_interpretation = $23, facet_ratings_application = $24, 
                                       facet_ratings_perspective = $25, facet_ratings_empathy = $26, 
                                       facet_ratings_self_knowledge = $27, key_patterns = $28, 
                                       recommended_focus_areas = $29, personalized_next_steps = $30, 
                                       session_summary = $31, updated_at = CURRENT_TIMESTAMP 
                                   WHERE id = $32 
                                   RETURNING id, user_id, conversation, status, current_stage, concept_name, batch_id,
                                            explanation_score, interpretation_score, application_score, perspective_score, 
                                            empathy_score, self_knowledge_score, asking_questions_score, clarifying_ambiguity_score, 
                                            summarizing_confirming_score, challenging_ideas_score, comparing_concepts_score, 
                                            abstract_concrete_score, six_facets_average, understanding_skills_average, 
                                            final_weighted_score, overall_performance, facet_ratings_explanation, 
                                            facet_ratings_interpretation, facet_ratings_application, facet_ratings_perspective, 
                                            facet_ratings_empathy, facet_ratings_self_knowledge, key_patterns, 
                                            recommended_focus_areas, personalized_next_steps, session_summary, updated_at`;
                    
                    updateParams = [
                        JSON.stringify(conversation), 
                        finalStatus, 
                        finalStage, 
                        finalConceptName,
                        batch_id,
                        scoringFields.explanation_score,
                        scoringFields.interpretation_score,
                        scoringFields.application_score,
                        scoringFields.perspective_score,
                        scoringFields.empathy_score,
                        scoringFields.self_knowledge_score,
                        scoringFields.asking_questions_score,
                        scoringFields.clarifying_ambiguity_score,
                        scoringFields.summarizing_confirming_score,
                        scoringFields.challenging_ideas_score,
                        scoringFields.comparing_concepts_score,
                        scoringFields.abstract_concrete_score,
                        scoringFields.six_facets_average,
                        scoringFields.understanding_skills_average,
                        scoringFields.final_weighted_score,
                        extracted_overall_performance,
                        extracted_facet_ratings_explanation,
                        extracted_facet_ratings_interpretation,
                        extracted_facet_ratings_application,
                        extracted_facet_ratings_perspective,
                        extracted_facet_ratings_empathy,
                        extracted_facet_ratings_self_knowledge,
                        extracted_key_patterns,
                        extracted_recommended_focus_areas,
                        extracted_personalized_next_steps,
                        extracted_session_summary,
                        parseInt(practicemode_id)
                    ];
                } else {
                    // Update without scoring data
                    updateQuery = `UPDATE practicemode 
                                   SET conversation = $1, status = $2, current_stage = $3, concept_name = $4, batch_id = $5, overall_performance = $6, facet_ratings_explanation = $7, facet_ratings_interpretation = $8, facet_ratings_application = $9, facet_ratings_perspective = $10, facet_ratings_empathy = $11, facet_ratings_self_knowledge = $12, key_patterns = $13, recommended_focus_areas = $14, personalized_next_steps = $15, session_summary = $16, updated_at = CURRENT_TIMESTAMP 
                                   WHERE id = $17 
                                   RETURNING id, user_id, conversation, status, current_stage, concept_name, batch_id, overall_performance, facet_ratings_explanation, facet_ratings_interpretation, facet_ratings_application, facet_ratings_perspective, facet_ratings_empathy, facet_ratings_self_knowledge, key_patterns, recommended_focus_areas, personalized_next_steps, session_summary, updated_at`;
                    updateParams = [JSON.stringify(conversation), finalStatus, finalStage, finalConceptName, batch_id, extracted_overall_performance, extracted_facet_ratings_explanation, extracted_facet_ratings_interpretation, extracted_facet_ratings_application, extracted_facet_ratings_perspective, extracted_facet_ratings_empathy, extracted_facet_ratings_self_knowledge, extracted_key_patterns, extracted_recommended_focus_areas, extracted_personalized_next_steps, extracted_session_summary, parseInt(practicemode_id)];
                }

                const updateResult = await client.query(updateQuery, updateParams);
                await client.query('COMMIT');

                const updatedpracticemode = updateResult.rows[0];
                if (typeof updatedpracticemode.conversation === 'string') {
                    try {
                        updatedpracticemode.conversation = JSON.parse(updatedpracticemode.conversation);
                    } catch (parseError) {
                        console.error('Error parsing conversation JSON:', parseError);
                    }
                }

                const stageDisplayName = `Stage ${updatedpracticemode.current_stage}`;
                const conceptInfo = updatedpracticemode.concept_name ? ` for "${updatedpracticemode.concept_name}"` : '';
                console.log(`✅ Conversation updated: ID ${practicemode_id} -> ${finalStatus} at ${stageDisplayName}${conceptInfo}`);

                const responseData = {
                    ...updatedpracticemode,
                    stage_display_name: stageDisplayName,
                    shouldStartFresh: false
                };

                // Include scoring data in response if present
                if (finalStatus === 'completed' && (updatedpracticemode.final_weighted_score !== null || updatedpracticemode.six_facets_average !== null)) {
                    responseData.scoring = {
                        six_facets: {
                            explanation: updatedpracticemode.explanation_score,
                            interpretation: updatedpracticemode.interpretation_score,
                            application: updatedpracticemode.application_score,
                            perspective: updatedpracticemode.perspective_score,
                            empathy: updatedpracticemode.empathy_score,
                            self_knowledge: updatedpracticemode.self_knowledge_score,
                            average: updatedpracticemode.six_facets_average
                        },
                        understanding_skills: {
                            asking_questions: updatedpracticemode.asking_questions_score,
                            clarifying_ambiguity: updatedpracticemode.clarifying_ambiguity_score,
                            summarizing_confirming: updatedpracticemode.summarizing_confirming_score,
                            challenging_ideas: updatedpracticemode.challenging_ideas_score,
                            comparing_concepts: updatedpracticemode.comparing_concepts_score,
                            abstract_concrete: updatedpracticemode.abstract_concrete_score,
                            average: updatedpracticemode.understanding_skills_average
                        },
                        final_score: updatedpracticemode.final_weighted_score
                    };
                }

                res.json({
                    success: true,
                    message: 'Conversation updated successfully',
                    data: responseData
                });

            } catch (transactionError) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Rollback failed:', rollbackError);
                }
                throw transactionError;
            }

        } catch (error) {
            console.error('❌ Error updating conversation:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to update conversation',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        } finally {
            if (client) {
                try {
                    client.release();
                } catch (releaseError) {
                    console.error('Error releasing client:', releaseError);
                }
            }
        }
    }

    // Get practicemode counts by status (unchanged)
    async getpracticemodeCounts(req, res, next) {
        try {
            const { user_id } = req.params;

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: user_id'
                });
            }

            const counts = {};
            const statuses = ['not_started', 'inprogress', 'completed'];

            for (const status of statuses) {
                const result = await pool.query(
                    'SELECT COUNT(*) as count FROM practicemode WHERE user_id = $1 AND status = $2',
                    [user_id, status]
                );
                counts[status] = parseInt(result.rows[0].count, 10);
            }

            counts.active = counts.not_started + counts.inprogress;

            const stageBreakdown = {};
            for (let stage = 0; stage <= 5; stage++) {
                const result = await pool.query(
                    'SELECT COUNT(*) as count FROM practicemode WHERE user_id = $1 AND current_stage = $2 AND status = $3',
                    [user_id, stage, 'inprogress']
                );
                stageBreakdown[`stage_${stage}`] = parseInt(result.rows[0].count, 10);
            }

            const totalResult = await pool.query(
                'SELECT COUNT(*) as count FROM practicemode WHERE user_id = $1',
                [user_id]
            );
            counts.total = parseInt(totalResult.rows[0].count, 10);

            res.json({
                success: true,
                data: {
                    user_id,
                    counts,
                    stage_breakdown: stageBreakdown
                }
            });

        } catch (error) {
            console.error('❌ Error fetching practicemode counts:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to fetch practicemode counts',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
 
    // Get practicemode history with concept_name, scoring data, batch and pod info 
   // Get practicemode history with concept_name, scoring data, batch and pod info 
async getpracticemodeHistory(req, res, next) {
    try {
        const { user_id } = req.params;
        const { status = 'all', limit = 20, offset = 0, stage, concept, batch_id } = req.query;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: user_id'
            });
        }

        let query, params, countQuery, countParams;

        const selectFields = `c.id, c.user_id, c.conversation, c.status, c.current_stage, c.concept_name, c.created_at, c.updated_at,
                            c.explanation_score, c.interpretation_score, c.application_score, c.perspective_score, 
                            c.empathy_score, c.self_knowledge_score, c.asking_questions_score, c.clarifying_ambiguity_score, 
                            c.summarizing_confirming_score, c.challenging_ideas_score, c.comparing_concepts_score, 
                            c.abstract_concrete_score, c.six_facets_average, c.understanding_skills_average, c.final_weighted_score,
                            c.overall_performance, c.facet_ratings_explanation, c.facet_ratings_interpretation, c.facet_ratings_application, 
                            c.facet_ratings_perspective, c.facet_ratings_empathy, c.facet_ratings_self_knowledge, 
                            c.key_patterns, c.recommended_focus_areas, c.personalized_next_steps, c.session_summary,
                            u.username, u.first_name, u.last_name, u.email,
                            c.batch_id, b.batch_name, pu.pod_id, p.pod_name`;

        // ✅ FIXED FROM CLAUSE: Properly join through pod_users to get pod info
        const fromClause = `FROM practicemode c 
                            LEFT JOIN users u ON c.user_id::integer = u.user_id
                            LEFT JOIN batches b ON c.batch_id = b.batch_id
                            LEFT JOIN pod_users pu ON c.user_id::integer = pu.user_id AND c.batch_id = pu.batch_id
                            LEFT JOIN pods p ON pu.pod_id = p.pod_id`;

        // Base WHERE clause
        let whereClause = `WHERE c.user_id = $1`;
        params = [user_id];
        let countWhereClause = `WHERE c.user_id = $1`;
        countParams = [user_id];

        // ✅ FIXED: Use c.batch_id instead of pu.batch_id
        if (batch_id) {
            whereClause += ` AND c.batch_id = $${params.length + 1}`;
            params.push(parseInt(batch_id));
            countWhereClause += ` AND c.batch_id = $${countParams.length + 1}`;
            countParams.push(parseInt(batch_id));
        }

        if (status === 'all') {
            if (stage !== undefined && concept !== undefined) {
                whereClause += ` AND c.current_stage = $${params.length + 1} AND c.concept_name ILIKE $${params.length + 2}`;
                params.push(parseInt(stage), `%${concept}%`);
                countWhereClause += ` AND c.current_stage = $${countParams.length + 1} AND c.concept_name ILIKE $${countParams.length + 2}`;
                countParams.push(parseInt(stage), `%${concept}%`);
            } else if (stage !== undefined) {
                whereClause += ` AND c.current_stage = $${params.length + 1}`;
                params.push(parseInt(stage));
                countWhereClause += ` AND c.current_stage = $${countParams.length + 1}`;
                countParams.push(parseInt(stage));
            } else if (concept !== undefined) {
                whereClause += ` AND c.concept_name ILIKE $${params.length + 1}`;
                params.push(`%${concept}%`);
                countWhereClause += ` AND c.concept_name ILIKE $${countParams.length + 1}`;
                countParams.push(`%${concept}%`);
            }
            // No status filter for "all"
        } else if (status === 'active') {
            // Active = not_started + inprogress
            const activeStatuses = ['not_started', 'inprogress'];
            whereClause += ` AND c.status = ANY($${params.length + 1})`;
            params.push(activeStatuses);
            countWhereClause += ` AND c.status = ANY($${countParams.length + 1})`;
            countParams.push(activeStatuses);

            if (stage !== undefined && concept !== undefined) {
                whereClause += ` AND c.current_stage = $${params.length + 1} AND c.concept_name ILIKE $${params.length + 2}`;
                params.push(parseInt(stage), `%${concept}%`);
                countWhereClause += ` AND c.current_stage = $${countParams.length + 1} AND c.concept_name ILIKE $${countParams.length + 2}`;
                countParams.push(parseInt(stage), `%${concept}%`);
            } else if (stage !== undefined) {
                whereClause += ` AND c.current_stage = $${params.length + 1}`;
                params.push(parseInt(stage));
                countWhereClause += ` AND c.current_stage = $${countParams.length + 1}`;
                countParams.push(parseInt(stage));
            } else if (concept !== undefined) {
                whereClause += ` AND c.concept_name ILIKE $${params.length + 1}`;
                params.push(`%${concept}%`);
                countWhereClause += ` AND c.concept_name ILIKE $${countParams.length + 1}`;
                countParams.push(`%${concept}%`);
            }
        } else {
            const validStatuses = ['not_started', 'inprogress', 'completed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid status',
                    message: `Status must be one of: ${validStatuses.join(', ')}, 'active', or 'all'`
                });
            }

            whereClause += ` AND c.status = $${params.length + 1}`;
            params.push(status);
            countWhereClause += ` AND c.status = $${countParams.length + 1}`;
            countParams.push(status);

            if (stage !== undefined && concept !== undefined) {
                whereClause += ` AND c.current_stage = $${params.length + 1} AND c.concept_name ILIKE $${params.length + 2}`;
                params.push(parseInt(stage), `%${concept}%`);
                countWhereClause += ` AND c.current_stage = $${countParams.length + 1} AND c.concept_name ILIKE $${countParams.length + 2}`;
                countParams.push(parseInt(stage), `%${concept}%`);
            } else if (stage !== undefined) {
                whereClause += ` AND c.current_stage = $${params.length + 1}`;
                params.push(parseInt(stage));
                countWhereClause += ` AND c.current_stage = $${countParams.length + 1}`;
                countParams.push(parseInt(stage));
            } else if (concept !== undefined) {
                whereClause += ` AND c.concept_name ILIKE $${params.length + 1}`;
                params.push(`%${concept}%`);
                countWhereClause += ` AND c.concept_name ILIKE $${countParams.length + 1}`;
                countParams.push(`%${concept}%`);
            }
        }

        // ORDER, LIMIT, OFFSET
       const orderBy = `ORDER BY c.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit), parseInt(offset));

        query = `SELECT ${selectFields} ${fromClause} ${whereClause} ${orderBy}`;
        countQuery = `SELECT COUNT(DISTINCT c.id) as total ${fromClause} ${countWhereClause}`;

        const result = await pool.query(query, params);
        const countResult = await pool.query(countQuery, countParams);

        // Process rows: Parse JSON, add display names, scoring (unchanged)
        const practicemodes = result.rows.map(practicemode => {
            // Parse conversation JSON if needed
            if (typeof practicemode.conversation === 'string') {
                try {
                    practicemode.conversation = JSON.parse(practicemode.conversation);
                } catch (parseError) {
                    console.error('Error parsing conversation JSON:', parseError);
                }
            }

            // Structure user details
            const user_details = {
                username: practicemode.username || "",
                first_name: practicemode.first_name || "",
                last_name: practicemode.last_name || "",
                email: practicemode.email || ""
            };

            const practicemodeData = {
                id: practicemode.id,
                user_id: practicemode.user_id,
                conversation: practicemode.conversation,
                status: practicemode.status,
                current_stage: practicemode.current_stage,
                concept_name: practicemode.concept_name,
                created_at: practicemode.created_at,
                updated_at: practicemode.updated_at,
                stage_display_name: `Stage ${practicemode.current_stage}`,
                user_details,
                batch_id: practicemode.batch_id || null,
                batch_name: practicemode.batch_name || null,
                pod_id: practicemode.pod_id || null,
                pod_name: practicemode.pod_name || null,
                overall_performance: practicemode.overall_performance,
                facet_ratings_explanation: practicemode.facet_ratings_explanation,
                facet_ratings_interpretation: practicemode.facet_ratings_interpretation,
                facet_ratings_application: practicemode.facet_ratings_application,
                facet_ratings_perspective: practicemode.facet_ratings_perspective,
                facet_ratings_empathy: practicemode.facet_ratings_empathy,
                facet_ratings_self_knowledge: practicemode.facet_ratings_self_knowledge,
                key_patterns: practicemode.key_patterns,
                recommended_focus_areas: practicemode.recommended_focus_areas,
                personalized_next_steps: practicemode.personalized_next_steps,
                session_summary: practicemode.session_summary
            };

            // Include scoring data if present (for completed practicemodes)
            if (practicemode.status === 'completed' && (practicemode.final_weighted_score !== null || practicemode.six_facets_average !== null)) {
                practicemodeData.scoring = {
                    six_facets: {
                        explanation: practicemode.explanation_score,
                        interpretation: practicemode.interpretation_score,
                        application: practicemode.application_score,
                        perspective: practicemode.perspective_score,
                        empathy: practicemode.empathy_score,
                        self_knowledge: practicemode.self_knowledge_score,
                        average: practicemode.six_facets_average
                    },
                    understanding_skills: {
                        asking_questions: practicemode.asking_questions_score,
                        clarifying_ambiguity: practicemode.clarifying_ambiguity_score,
                        summarizing_confirming: practicemode.summarizing_confirming_score,
                        challenging_ideas: practicemode.challenging_ideas_score,
                        comparing_concepts: practicemode.comparing_concepts_score,
                        abstract_concrete: practicemode.abstract_concrete_score,
                        average: practicemode.understanding_skills_average
                    },
                    final_score: practicemode.final_weighted_score
                };
            }

            return practicemodeData;
        });

        const total = parseInt(countResult.rows[0].total, 10);

        res.json({
            success: true,
            data: {
                practicemodes,
                filter: status,
                stage_filter: stage,
                concept_filter: concept,
                batch_filter: batch_id || null, // Added for frontend awareness
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (parseInt(offset) + parseInt(limit)) < total
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching practicemode history:', error);
        return res.status(500).json({
            success: false,
            error: 'Database error',
            message: 'Failed to fetch practicemode history',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

    // Get practicemode by ID with concept_name and scoring data
    async getpracticemodeById(req, res, next) {
        try {
            const { practicemode_id } = req.params;

            if (!practicemode_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: practicemode_id'
                });
            }

            const result = await pool.query(
                `SELECT id, user_id, conversation, status, current_stage, concept_name, created_at, updated_at,
                        explanation_score, interpretation_score, application_score, perspective_score, 
                        empathy_score, self_knowledge_score, asking_questions_score, clarifying_ambiguity_score, 
                        summarizing_confirming_score, challenging_ideas_score, comparing_concepts_score, 
                        abstract_concrete_score, six_facets_average, understanding_skills_average, final_weighted_score, overall_performance, facet_ratings_explanation, facet_ratings_interpretation, facet_ratings_application, 
                        facet_ratings_perspective, facet_ratings_empathy, facet_ratings_self_knowledge, 
                        key_patterns, recommended_focus_areas, personalized_next_steps, session_summary
                 FROM practicemode WHERE id = $1`,
                [parseInt(practicemode_id)]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'practicemode not found'
                });
            }

            const practicemode = result.rows[0];

            // Parse conversation JSON
            if (typeof practicemode.conversation === 'string') {
                try {
                    practicemode.conversation = JSON.parse(practicemode.conversation);
                } catch (parseError) {
                    console.error('Error parsing conversation JSON:', parseError);
                }
            }

            const responseData = {
                practicemode: {
                    ...practicemode,
                    stage_display_name: `Stage ${practicemode.current_stage}`
                }
            };

            // Include scoring data if present (for completed practicemodes)
            if (practicemode.status === 'completed' && (practicemode.final_weighted_score !== null || practicemode.six_facets_average !== null)) {
                responseData.practicemode.scoring = {
                    six_facets: {
                        explanation: practicemode.explanation_score,
                        interpretation: practicemode.interpretation_score,
                        application: practicemode.application_score,
                        perspective: practicemode.perspective_score,
                        empathy: practicemode.empathy_score,
                        self_knowledge: practicemode.self_knowledge_score,
                        average: practicemode.six_facets_average
                    },
                    understanding_skills: {
                        asking_questions: practicemode.asking_questions_score,
                        clarifying_ambiguity: practicemode.clarifying_ambiguity_score,
                        summarizing_confirming: practicemode.summarizing_confirming_score,
                        challenging_ideas: practicemode.challenging_ideas_score,
                        comparing_concepts: practicemode.comparing_concepts_score,
                        abstract_concrete: practicemode.abstract_concrete_score,
                        average: practicemode.understanding_skills_average
                    },
                    final_score: practicemode.final_weighted_score
                };
            }

            res.json({
                success: true,
                data: responseData
            });

        } catch (error) {
            console.error('❌ Error fetching practicemode by ID:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to fetch practicemode',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Delete practicemode (unchanged)
    async deletepracticemode(req, res, next) {
        let client;

        try {
            const { practicemode_id } = req.params;

            if (!practicemode_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: practicemode_id'
                });
            }

            client = await pool.connect();

            try {
                await client.query('BEGIN');

                const result = await client.query(
                    'DELETE FROM practicemode WHERE id = $1 RETURNING id, user_id, status, current_stage, concept_name',
                    [parseInt(practicemode_id)]
                );

                if (result.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({
                        success: false,
                        error: 'practicemode not found'
                    });
                }

                await client.query('COMMIT');

                res.json({
                    success: true,
                    message: 'practicemode deleted successfully',
                    data: result.rows[0]
                });

            } catch (transactionError) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Rollback failed:', rollbackError);
                }
                throw transactionError;
            }

        } catch (error) {
            console.error('❌ Error deleting practicemode:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to delete practicemode',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        } finally {
            if (client) {
                try {
                    client.release();
                } catch (releaseError) {
                    console.error('Error releasing client:', releaseError);
                }
            }
        }
    }
}

module.exports = new practicemodeController();