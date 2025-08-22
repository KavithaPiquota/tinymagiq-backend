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
                // Scoring fields (only saved when status is 'completed')
                scoring_data // Expected to contain the parsed scoring object from frontend
            } = req.body;

            if (!user_id || !conversation) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    details: 'user_id and conversation are required'
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
            } else if (finalStatus === 'completed') {
                finalStage = 5; // completed is always stage 5
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

            if (finalStatus === 'completed' && scoring_data) {
                console.log("📊 Processing scoring data for completed practicemode");
                
                // Extract Six Facets scores
                if (scoring_data.SixFacets) {
                    const sixFacets = scoring_data.SixFacets;
                    scoringFields.explanation_score = sixFacets.Explanation?.score || null;
                    scoringFields.interpretation_score = sixFacets.Interpretation?.score || null;
                    scoringFields.application_score = sixFacets.Application?.score || null;
                    scoringFields.perspective_score = sixFacets.Perspective?.score || null;
                    scoringFields.empathy_score = sixFacets.Empathy?.score || null;
                    scoringFields.self_knowledge_score = sixFacets['Self-Knowledge']?.score || null;
                    scoringFields.six_facets_average = sixFacets.OverallScore || null;
                }

                // Extract Understanding Skills scores
                if (scoring_data.UnderstandingSkills) {
                    const skills = scoring_data.UnderstandingSkills;
                    scoringFields.asking_questions_score = skills.AskingQuestions?.score || null;
                    scoringFields.clarifying_ambiguity_score = skills.ClarifyingAmbiguity?.score || null;
                    scoringFields.summarizing_confirming_score = skills.SummarizingConfirming?.score || null;
                    scoringFields.challenging_ideas_score = skills.ChallengingIdeas?.score || null;
                    scoringFields.comparing_concepts_score = skills.ComparingConcepts?.score || null;
                    scoringFields.abstract_concrete_score = skills.AbstractConcrete?.score || null;
                    scoringFields.understanding_skills_average = skills.OverallScore || null;
                }

                // Extract final weighted score
                scoringFields.final_weighted_score = scoring_data.FinalWeightedScore || null;

                console.log("📊 Extracted scoring fields:", scoringFields);
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
                        user_id, conversation, status, current_stage, concept_name,
                        explanation_score, interpretation_score, application_score, perspective_score, 
                        empathy_score, self_knowledge_score, asking_questions_score, clarifying_ambiguity_score, 
                        summarizing_confirming_score, challenging_ideas_score, comparing_concepts_score, 
                        abstract_concrete_score, six_facets_average, understanding_skills_average, final_weighted_score
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) 
                    RETURNING id, created_at, updated_at`;
                    
                    insertParams = [
                        user_id, 
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
                        scoringFields.final_weighted_score
                    ];
                } else {
                    // Insert without scoring data
                    insertQuery = `INSERT INTO practicemode (user_id, conversation, status, current_stage, concept_name) 
                                   VALUES ($1, $2, $3, $4, $5) 
                                   RETURNING id, created_at, updated_at`;
                    insertParams = [user_id, JSON.stringify(conversation), finalStatus, finalStage, finalConceptName];
                }

                const insertResult = await client.query(insertQuery, insertParams);
                await client.query('COMMIT');

                const newpracticemode = insertResult.rows[0];

                console.log(`✅ practicemode created: ${user_id} - "${finalConceptName}" - ${finalStatus} - Stage ${finalStage} (ID: ${newpracticemode.id})`);

                const responseData = {
                    id: newpracticemode.id,
                    user_id,
                    conversation,
                    status: finalStatus,
                    current_stage: finalStage,
                    concept_name: finalConceptName,
                    stage_display_name: `Stage ${finalStage}`,
                    created_at: newpracticemode.created_at,
                    updated_at: newpracticemode.updated_at,
                    shouldStartFresh: false
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
            const { concept_name } = req.query;

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: user_id'
                });
            }

            const conceptInfo = concept_name ? ` for concept: "${concept_name}"` : '';
            console.log(`🔍 Checking session status for user_id: ${user_id}${conceptInfo}`);

            let query, params;

            if (concept_name) {
                query = `SELECT id, user_id, conversation, status, current_stage, concept_name, created_at, updated_at 
                        FROM practicemode 
                        WHERE user_id = $1 AND status IN ('not_started', 'inprogress') AND concept_name ILIKE $2
                        ORDER BY updated_at DESC 
                        LIMIT 1`;
                params = [user_id, `%${concept_name}%`];
            } else {
                query = `SELECT id, user_id, conversation, status, current_stage, concept_name, created_at, updated_at 
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
                        sessionType: 'resume',
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
                        sessionType: 'fresh',
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
                    sessionType: 'fresh',
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
                conversation, 
                status, 
                current_stage, 
                concept_name,
                // Scoring fields (only saved when status is 'completed')
                scoring_data // Expected to contain the parsed scoring object from frontend
            } = req.body;

            if (!practicemode_id || !conversation) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: practicemode_id and conversation'
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
                } else if (finalStatus === 'completed') {
                    finalStage = 5;
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

                if (finalStatus === 'completed' && scoring_data) {
                    console.log("📊 Processing scoring data for completed practicemode update");
                    
                    // Extract Six Facets scores
                    if (scoring_data.SixFacets) {
                        const sixFacets = scoring_data.SixFacets;
                        scoringFields.explanation_score = sixFacets.Explanation?.score || null;
                        scoringFields.interpretation_score = sixFacets.Interpretation?.score || null;
                        scoringFields.application_score = sixFacets.Application?.score || null;
                        scoringFields.perspective_score = sixFacets.Perspective?.score || null;
                        scoringFields.empathy_score = sixFacets.Empathy?.score || null;
                        scoringFields.self_knowledge_score = sixFacets['Self-Knowledge']?.score || null;
                        scoringFields.six_facets_average = sixFacets.OverallScore || null;
                    }

                    // Extract Understanding Skills scores
                    if (scoring_data.UnderstandingSkills) {
                        const skills = scoring_data.UnderstandingSkills;
                        scoringFields.asking_questions_score = skills.AskingQuestions?.score || null;
                        scoringFields.clarifying_ambiguity_score = skills.ClarifyingAmbiguity?.score || null;
                        scoringFields.summarizing_confirming_score = skills.SummarizingConfirming?.score || null;
                        scoringFields.challenging_ideas_score = skills.ChallengingIdeas?.score || null;
                        scoringFields.comparing_concepts_score = skills.ComparingConcepts?.score || null;
                        scoringFields.abstract_concrete_score = skills.AbstractConcrete?.score || null;
                        scoringFields.understanding_skills_average = skills.OverallScore || null;
                    }

                    // Extract final weighted score
                    scoringFields.final_weighted_score = scoring_data.FinalWeightedScore || null;

                    console.log("📊 Extracted scoring fields for update:", scoringFields);
                }

                let updateQuery, updateParams;
                
                if (finalStatus === 'completed' && Object.values(scoringFields).some(val => val !== null)) {
                    // Update with scoring data
                    updateQuery = `UPDATE practicemode 
                                   SET conversation = $1, status = $2, current_stage = $3, concept_name = $4,
                                       explanation_score = $5, interpretation_score = $6, application_score = $7, 
                                       perspective_score = $8, empathy_score = $9, self_knowledge_score = $10,
                                       asking_questions_score = $11, clarifying_ambiguity_score = $12, 
                                       summarizing_confirming_score = $13, challenging_ideas_score = $14, 
                                       comparing_concepts_score = $15, abstract_concrete_score = $16,
                                       six_facets_average = $17, understanding_skills_average = $18, 
                                       final_weighted_score = $19, updated_at = CURRENT_TIMESTAMP 
                                   WHERE id = $20 
                                   RETURNING id, user_id, conversation, status, current_stage, concept_name, 
                                            explanation_score, interpretation_score, application_score, perspective_score, 
                                            empathy_score, self_knowledge_score, asking_questions_score, clarifying_ambiguity_score, 
                                            summarizing_confirming_score, challenging_ideas_score, comparing_concepts_score, 
                                            abstract_concrete_score, six_facets_average, understanding_skills_average, 
                                            final_weighted_score, updated_at`;
                    
                    updateParams = [
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
                        parseInt(practicemode_id)
                    ];
                } else {
                    // Update without scoring data
                    updateQuery = `UPDATE practicemode 
                                   SET conversation = $1, status = $2, current_stage = $3, concept_name = $4, updated_at = CURRENT_TIMESTAMP 
                                   WHERE id = $5 
                                   RETURNING id, user_id, conversation, status, current_stage, concept_name, updated_at`;
                    updateParams = [JSON.stringify(conversation), finalStatus, finalStage, finalConceptName, parseInt(practicemode_id)];
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

    // Get practicemode history with concept_name and scoring data 
    async getpracticemodeHistory(req, res, next) {
        try {
            const { user_id } = req.params;
            const { status = 'all', limit = 20, offset = 0, stage, concept } = req.query;

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: user_id'
                });
            }

            let query, params, countQuery, countParams;

            // Updated SELECT to include scoring fields and user details
            const selectFields = `c.id, c.user_id, c.conversation, c.status, c.current_stage, c.concept_name, c.created_at, c.updated_at,
                                c.explanation_score, c.interpretation_score, c.application_score, c.perspective_score, 
                                c.empathy_score, c.self_knowledge_score, c.asking_questions_score, c.clarifying_ambiguity_score, 
                                c.summarizing_confirming_score, c.challenging_ideas_score, c.comparing_concepts_score, 
                                c.abstract_concrete_score, c.six_facets_average, c.understanding_skills_average, c.final_weighted_score,
                                u.username, u.first_name, u.last_name, u.email`;

            // Base FROM clause with JOIN using type conversion for user_id
            const fromClause = `FROM practicemode c LEFT JOIN users u ON c.user_id::integer = u.user_id`;

            if (status === 'all') {
                if (stage !== undefined && concept !== undefined) {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.current_stage = $2 AND c.concept_name ILIKE $3
                            ORDER BY c.updated_at DESC 
                            LIMIT $4 OFFSET $5`;
                    params = [user_id, parseInt(stage), `%${concept}%`, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.current_stage = $2 AND c.concept_name ILIKE $3`;
                    countParams = [user_id, parseInt(stage), `%${concept}%`];
                } else if (stage !== undefined) {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.current_stage = $2
                            ORDER BY c.updated_at DESC 
                            LIMIT $3 OFFSET $4`;
                    params = [user_id, parseInt(stage), parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.current_stage = $2`;
                    countParams = [user_id, parseInt(stage)];
                } else if (concept !== undefined) {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.concept_name ILIKE $2
                            ORDER BY c.updated_at DESC 
                            LIMIT $3 OFFSET $4`;
                    params = [user_id, `%${concept}%`, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.concept_name ILIKE $2`;
                    countParams = [user_id, `%${concept}%`];
                } else {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 
                            ORDER BY c.updated_at DESC 
                            LIMIT $2 OFFSET $3`;
                    params = [user_id, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1`;
                    countParams = [user_id];
                }
            } else if (status === 'active') {
                // Active = not_started + inprogress
                const activeStatuses = ['not_started', 'inprogress'];
                if (stage !== undefined && concept !== undefined) {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.status = ANY($2) AND c.current_stage = $3 AND c.concept_name ILIKE $4
                            ORDER BY c.updated_at DESC 
                            LIMIT $5 OFFSET $6`;
                    params = [user_id, activeStatuses, parseInt(stage), `%${concept}%`, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.status = ANY($2) AND c.current_stage = $3 AND c.concept_name ILIKE $4`;
                    countParams = [user_id, activeStatuses, parseInt(stage), `%${concept}%`];
                } else if (stage !== undefined) {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.status = ANY($2) AND c.current_stage = $3
                            ORDER BY c.updated_at DESC 
                            LIMIT $4 OFFSET $5`;
                    params = [user_id, activeStatuses, parseInt(stage), parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.status = ANY($2) AND c.current_stage = $3`;
                    countParams = [user_id, activeStatuses, parseInt(stage)];
                } else if (concept !== undefined) {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.status = ANY($2) AND c.concept_name ILIKE $3
                            ORDER BY c.updated_at DESC 
                            LIMIT $4 OFFSET $5`;
                    params = [user_id, activeStatuses, `%${concept}%`, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.status = ANY($2) AND c.concept_name ILIKE $3`;
                    countParams = [user_id, activeStatuses, `%${concept}%`];
                } else {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.status = ANY($2)
                            ORDER BY c.updated_at DESC 
                            LIMIT $3 OFFSET $4`;
                    params = [user_id, activeStatuses, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.status = ANY($2)`;
                    countParams = [user_id, activeStatuses];
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

                if (stage !== undefined && concept !== undefined) {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.status = $2 AND c.current_stage = $3 AND c.concept_name ILIKE $4
                            ORDER BY c.updated_at DESC 
                            LIMIT $5 OFFSET $6`;
                    params = [user_id, status, parseInt(stage), `%${concept}%`, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.status = $2 AND c.current_stage = $3 AND c.concept_name ILIKE $4`;
                    countParams = [user_id, status, parseInt(stage), `%${concept}%`];
                } else if (stage !== undefined) {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.status = $2 AND c.current_stage = $3
                            ORDER BY c.updated_at DESC 
                            LIMIT $4 OFFSET $5`;
                    params = [user_id, status, parseInt(stage), parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.status = $2 AND c.current_stage = $3`;
                    countParams = [user_id, status, parseInt(stage)];
                } else if (concept !== undefined) {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.status = $2 AND c.concept_name ILIKE $3
                            ORDER BY c.updated_at DESC 
                            LIMIT $4 OFFSET $5`;
                    params = [user_id, status, `%${concept}%`, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.status = $2 AND c.concept_name ILIKE $3`;
                    countParams = [user_id, status, `%${concept}%`];
                } else {
                    query = `SELECT ${selectFields} 
                            ${fromClause}
                            WHERE c.user_id = $1 AND c.status = $2 
                            ORDER BY c.updated_at DESC 
                            LIMIT $3 OFFSET $4`;
                    params = [user_id, status, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM practicemode c WHERE c.user_id = $1 AND c.status = $2`;
                    countParams = [user_id, status];
                }
            }

            const result = await pool.query(query, params);
            const countResult = await pool.query(countQuery, countParams);

            // Add stage display names, include scoring data, and structure user details
            const practicemodes = result.rows.map(practicemode => {
                // Parse conversation JSON
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
                    user_details
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
                        abstract_concrete_score, six_facets_average, understanding_skills_average, final_weighted_score 
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