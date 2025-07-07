// src/controllers/chatController.js - Simplified with 3 Status System
const { pool } = require('../config/database');

class ChatController {

    // Create chat with simplified status system
    async createChat(req, res, next) {
        let client;

        try {
            const { user_id, conversation, status, current_stage } = req.body;

            if (!user_id || !conversation) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    details: 'user_id and conversation are required'
                });
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

            console.log(`💾 Creating chat for ${user_id} with status: ${finalStatus}, stage: ${finalStage}`);

            client = await pool.connect();

            try {
                await client.query('BEGIN');

                // When saving as completed, archive other active conversations
                if (finalStatus === 'completed') {
                    const archiveResult = await client.query(
                        `UPDATE chat 
                         SET status = 'archived', updated_at = CURRENT_TIMESTAMP 
                         WHERE user_id = $1 AND status IN ('not_started', 'inprogress')
                         RETURNING id, status`,
                        [user_id]
                    );

                    console.log(`📚 Archived ${archiveResult.rows.length} active conversations for ${user_id}`);
                }

                // Insert new chat
                const insertResult = await client.query(
                    `INSERT INTO chat (user_id, conversation, status, current_stage) 
                     VALUES ($1, $2, $3, $4) 
                     RETURNING id, created_at, updated_at`,
                    [user_id, JSON.stringify(conversation), finalStatus, finalStage]
                );

                await client.query('COMMIT');

                const newChat = insertResult.rows[0];

                console.log(`✅ Chat created: ${user_id} - ${finalStatus} - Stage ${finalStage} (ID: ${newChat.id})`);

                res.status(201).json({
                    success: true,
                    message: 'Chat stored successfully',
                    data: {
                        id: newChat.id,
                        user_id,
                        conversation,
                        status: finalStatus,
                        current_stage: finalStage,
                        stage_display_name: `Stage ${finalStage}`,
                        created_at: newChat.created_at,
                        updated_at: newChat.updated_at,
                        shouldStartFresh: finalStatus === 'completed'
                    }
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
            console.error('❌ Error creating chat:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to store chat',
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

    // Get session status 
    async getSessionStatus(req, res, next) {
        try {
            const { user_id } = req.params; // Changed from username to user_id

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: user_id'
                });
            }

            console.log(`🔍 Checking session status for user_id: ${user_id}`);

            // Look for not_started or inprogress conversations - get LATEST (most recent)
            const activeResult = await pool.query(
                `SELECT id, user_id, conversation, status, current_stage, created_at, updated_at 
             FROM chat 
             WHERE user_id = $1 AND status IN ('not_started', 'inprogress') 
             ORDER BY updated_at DESC 
             LIMIT 1`,
                [user_id] // Using user_id instead of username
            );

            if (activeResult.rows.length > 0) {
                const chat = activeResult.rows[0];
                if (typeof chat.conversation === 'string') {
                    try {
                        chat.conversation = JSON.parse(chat.conversation);
                    } catch (parseError) {
                        console.error('Error parsing conversation JSON:', parseError);
                    }
                }

                const stageDisplayName = `Stage ${chat.current_stage}`;
                console.log(`🔄 Found ${chat.status} conversation (ID: ${chat.id}) at ${stageDisplayName}`);

                return res.json({
                    success: true,
                    data: {
                        sessionType: 'resume',
                        hasActiveSession: true,
                        shouldStartFresh: false,
                        chat: {
                            ...chat,
                            stage_display_name: stageDisplayName
                        },
                        message: `Found ${chat.status} conversation at ${stageDisplayName}`
                    }
                });
            }

            // Check completed sessions count
            const completedResult = await pool.query(
                `SELECT COUNT(*) as count FROM chat 
             WHERE user_id = $1 AND status = 'completed'`,
                [user_id] // Using user_id instead of username
            );

            const completedCount = parseInt(completedResult.rows[0].count, 10);
            console.log(`🆕 No active sessions for user_id ${user_id}. Completed: ${completedCount}`);

            return res.json({
                success: true,
                data: {
                    sessionType: 'fresh',
                    hasActiveSession: false,
                    shouldStartFresh: true,
                    chat: null,
                    recommended_stage: 0,
                    stage_display_name: 'Stage 0',
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

    // Update conversation
    async updateConversation(req, res, next) {
        let client;

        try {
            const { chat_id } = req.params;
            const { conversation, status, current_stage } = req.body;

            if (!chat_id || !conversation) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: chat_id and conversation'
                });
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

            console.log(`📝 Updating conversation ID: ${chat_id} with status: ${finalStatus}, stage: ${finalStage}`);

            client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Check if chat exists
                const checkResult = await pool.query(
                    'SELECT id, user_id, status, current_stage FROM chat WHERE id = $1',
                    [parseInt(chat_id)]
                );

                if (checkResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({
                        success: false,
                        error: 'Chat not found'
                    });
                }

                const existingChat = checkResult.rows[0];

                // If stage not provided, keep current stage
                if (finalStage === null) {
                    finalStage = existingChat.current_stage || 0;
                }

                // Business logic for status-stage relationship
                if (finalStatus === 'not_started') {
                    finalStage = 0;
                } else if (finalStatus === 'completed') {
                    finalStage = 5;
                }

                // If updating to completed, archive other active chats
                if (finalStatus === 'completed') {
                    await client.query(
                        `UPDATE chat 
                         SET status = 'archived', updated_at = CURRENT_TIMESTAMP 
                         WHERE user_id = $1 AND status IN ('not_started', 'inprogress') AND id != $2`,
                        [existingChat.user_id, parseInt(chat_id)]
                    );
                }

                // Update the conversation
                const updateResult = await client.query(
                    `UPDATE chat 
                     SET conversation = $1, status = $2, current_stage = $3, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $4 
                     RETURNING id, user_id, conversation, status, current_stage, updated_at`,
                    [JSON.stringify(conversation), finalStatus, finalStage, parseInt(chat_id)]
                );

                await client.query('COMMIT');

                const updatedChat = updateResult.rows[0];
                if (typeof updatedChat.conversation === 'string') {
                    try {
                        updatedChat.conversation = JSON.parse(updatedChat.conversation);
                    } catch (parseError) {
                        console.error('Error parsing conversation JSON:', parseError);
                    }
                }

                const stageDisplayName = `Stage ${updatedChat.current_stage}`;
                console.log(`✅ Conversation updated: ID ${chat_id} -> ${finalStatus} at ${stageDisplayName}`);

                res.json({
                    success: true,
                    message: 'Conversation updated successfully',
                    data: {
                        ...updatedChat,
                        stage_display_name: stageDisplayName,
                        shouldStartFresh: finalStatus === 'completed'
                    }
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

    // Get chat counts by status
    async getChatCounts(req, res, next) {
        try {
            const { user_id } = req.params;

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: user_id'
                });
            }

            const counts = {};

            // Get counts for each status
            const statuses = ['not_started', 'inprogress', 'completed', 'archived'];

            for (const status of statuses) {
                const result = await pool.query(
                    'SELECT COUNT(*) as count FROM chat WHERE user_id = $1 AND status = $2',
                    [user_id, status]
                );
                counts[status] = parseInt(result.rows[0].count, 10);
            }

            // Active sessions (not_started + inprogress)
            counts.active = counts.not_started + counts.inprogress;

            // Stage breakdown for inprogress sessions
            const stageBreakdown = {};
            for (let stage = 0; stage <= 5; stage++) {
                const result = await pool.query(
                    'SELECT COUNT(*) as count FROM chat WHERE user_id = $1 AND current_stage = $2 AND status = $3',
                    [user_id, stage, 'inprogress']
                );
                stageBreakdown[`stage_${stage}`] = parseInt(result.rows[0].count, 10);
            }

            // Total count
            const totalResult = await pool.query(
                'SELECT COUNT(*) as count FROM chat WHERE user_id = $1',
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
            console.error('❌ Error fetching chat counts:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to fetch chat counts',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Get chat history
    async getChatHistory(req, res, next) {
        try {
            const { user_id } = req.params;
            const { status = 'all', limit = 20, offset = 0, stage } = req.query;

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: user_id'
                });
            }

            let query, params, countQuery, countParams;

            if (status === 'all') {
                if (stage !== undefined) {
                    query = `SELECT id, user_id, conversation, status, current_stage, created_at, updated_at 
                            FROM chat 
                            WHERE user_id = $1 AND current_stage = $2
                            ORDER BY updated_at DESC 
                            LIMIT $3 OFFSET $4`;
                    params = [user_id, parseInt(stage), parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM chat WHERE user_id = $1 AND current_stage = $2`;
                    countParams = [user_id, parseInt(stage)];
                } else {
                    query = `SELECT id, user_id, conversation, status, current_stage, created_at, updated_at 
                            FROM chat 
                            WHERE user_id = $1 
                            ORDER BY updated_at DESC 
                            LIMIT $2 OFFSET $3`;
                    params = [user_id, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM chat WHERE user_id = $1`;
                    countParams = [user_id];
                }
            } else if (status === 'active') {
                // Active = not_started + inprogress
                const activeStatuses = ['not_started', 'inprogress'];
                if (stage !== undefined) {
                    query = `SELECT id, user_id, conversation, status, current_stage, created_at, updated_at 
                            FROM chat 
                            WHERE user_id = $1 AND status = ANY($2) AND current_stage = $3
                            ORDER BY updated_at DESC 
                            LIMIT $4 OFFSET $5`;
                    params = [user_id, activeStatuses, parseInt(stage), parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM chat WHERE user_id = $1 AND status = ANY($2) AND current_stage = $3`;
                    countParams = [user_id, activeStatuses, parseInt(stage)];
                } else {
                    query = `SELECT id, user_id, conversation, status, current_stage, created_at, updated_at 
                            FROM chat 
                            WHERE user_id = $1 AND status = ANY($2)
                            ORDER BY updated_at DESC 
                            LIMIT $3 OFFSET $4`;
                    params = [user_id, activeStatuses, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM chat WHERE user_id = $1 AND status = ANY($2)`;
                    countParams = [user_id, activeStatuses];
                }
            } else {
                const validStatuses = ['not_started', 'inprogress', 'completed', 'archived'];
                if (!validStatuses.includes(status)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid status',
                        message: `Status must be one of: ${validStatuses.join(', ')}, 'active', or 'all'`
                    });
                }

                if (stage !== undefined) {
                    query = `SELECT id, user_id, conversation, status, current_stage, created_at, updated_at 
                            FROM chat 
                            WHERE user_id = $1 AND status = $2 AND current_stage = $3
                            ORDER BY updated_at DESC 
                            LIMIT $4 OFFSET $5`;
                    params = [user_id, status, parseInt(stage), parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM chat WHERE user_id = $1 AND status = $2 AND current_stage = $3`;
                    countParams = [user_id, status, parseInt(stage)];
                } else {
                    query = `SELECT id, user_id, conversation, status, current_stage, created_at, updated_at 
                            FROM chat 
                            WHERE user_id = $1 AND status = $2 
                            ORDER BY updated_at DESC 
                            LIMIT $3 OFFSET $4`;
                    params = [user_id, status, parseInt(limit), parseInt(offset)];
                    countQuery = `SELECT COUNT(*) as total FROM chat WHERE user_id = $1 AND status = $2`;
                    countParams = [user_id, status];
                }
            }

            const result = await pool.query(query, params);
            const countResult = await pool.query(countQuery, countParams);

            // Add stage display names
            const chats = result.rows.map(chat => {
                if (typeof chat.conversation === 'string') {
                    try {
                        chat.conversation = JSON.parse(chat.conversation);
                    } catch (parseError) {
                        console.error('Error parsing conversation JSON:', parseError);
                    }
                }
                return {
                    ...chat,
                    stage_display_name: `Stage ${chat.current_stage}`
                };
            });

            const total = parseInt(countResult.rows[0].total, 10);

            res.json({
                success: true,
                data: {
                    chats,
                    filter: status,
                    stage_filter: stage,
                    pagination: {
                        total,
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        hasMore: (parseInt(offset) + parseInt(limit)) < total
                    }
                }
            });

        } catch (error) {
            console.error('❌ Error fetching chat history:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to fetch chat history',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Get chat by ID
    async getChatById(req, res, next) {
        try {
            const { chat_id } = req.params;

            if (!chat_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: chat_id'
                });
            }

            const result = await pool.query(
                'SELECT id, user_id, conversation, status, current_stage, created_at, updated_at FROM chat WHERE id = $1',
                [parseInt(chat_id)]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Chat not found'
                });
            }

            const chat = result.rows[0];
            if (typeof chat.conversation === 'string') {
                try {
                    chat.conversation = JSON.parse(chat.conversation);
                } catch (parseError) {
                    console.error('Error parsing conversation JSON:', parseError);
                }
            }

            res.json({
                success: true,
                data: {
                    chat: {
                        ...chat,
                        stage_display_name: `Stage ${chat.current_stage}`
                    }
                }
            });

        } catch (error) {
            console.error('❌ Error fetching chat by ID:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to fetch chat',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Delete chat
    async deleteChat(req, res, next) {
        let client;

        try {
            const { chat_id } = req.params;

            if (!chat_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: chat_id'
                });
            }

            client = await pool.connect();

            try {
                await client.query('BEGIN');

                const result = await client.query(
                    'DELETE FROM chat WHERE id = $1 RETURNING id, user_id, status, current_stage',
                    [parseInt(chat_id)]
                );

                if (result.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({
                        success: false,
                        error: 'Chat not found'
                    });
                }

                await client.query('COMMIT');

                res.json({
                    success: true,
                    message: 'Chat deleted successfully',
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
            console.error('❌ Error deleting chat:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error',
                message: 'Failed to delete chat',
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

module.exports = new ChatController();