const { pool } = require('../config/database');

const getOrganizationIdByName = async (organization_name) => {
    const result = await pool.query('SELECT organization_id FROM organizations WHERE organization_name = $1', [organization_name]);
    if (result.rows.length === 0) {
        throw new Error('Organization not found');
    }
    return result.rows[0].organization_id;
};

const validateConceptIds = async (concept_ids) => {
    if (!concept_ids || !Array.isArray(concept_ids) || concept_ids.length === 0) {
        return;
    }
    const result = await pool.query('SELECT concept_id FROM concepts WHERE concept_id = ANY($1)', [concept_ids]);
    const foundIds = result.rows.map(row => row.concept_id);
    const invalidIds = concept_ids.filter(id => !foundIds.includes(id));
    if (invalidIds.length > 0) {
        throw new Error(`Invalid concept IDs: ${invalidIds.join(', ')}`);
    }
};

const addBatch = async (req, res) => {
    const { organization_name, batch_name, batch_size, pod_size, is_active = true, concept_ids } = req.body;

    if (!organization_name || !batch_name || !batch_size || !pod_size) {
        return res.status(400).json({
            success: false,
            error: 'Bad request',
            message: 'Organization name, batch name, batch size, and pod size are required'
        });
    }

    if (!Number.isInteger(batch_size) || batch_size <= 0 || !Number.isInteger(pod_size) || pod_size <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Bad request',
            message: 'Batch size and pod size must be positive integers'
        });
    }

    try {
        const organization_id = await getOrganizationIdByName(organization_name);
        await validateConceptIds(concept_ids);

        await pool.query('BEGIN');
        const batchResult = await pool.query(
            'INSERT INTO batches (organization_id, batch_name, batch_size, pod_size, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [organization_id, batch_name, batch_size, pod_size, is_active]
        );

        const batch = batchResult.rows[0];
        if (concept_ids && concept_ids.length > 0) {
            const values = concept_ids.map(concept_id => `(${batch.batch_id}, ${concept_id})`).join(', ');
            await pool.query(`INSERT INTO batch_concepts (batch_id, concept_id) VALUES ${values}`);
        }

        const conceptsResult = await pool.query(
            'SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1',
            [batch.batch_id]
        );

        await pool.query('COMMIT');
        res.status(201).json({
            success: true,
            data: { ...batch, organization_name, concepts: conceptsResult.rows },
            message: 'Batch created successfully'
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        if (error.message === 'Organization not found') {
            return res.status(400).json({
                success: false,
                error: 'Bad request',
                message: 'Organization not found'
            });
        }
        if (error.message.includes('Invalid concept IDs')) {
            return res.status(400).json({
                success: false,
                error: 'Bad request',
                message: error.message
            });
        }
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                error: 'Conflict',
                message: 'Batch name already exists'
            });
        }
        console.error('Error creating batch:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

const updateBatch = async (req, res) => {
    const { batch_id } = req.params;
    const { organization_name, batch_name, batch_size, pod_size, is_active, concept_ids } = req.body;

    if (!organization_name && !batch_name && !batch_size && !pod_size && is_active === undefined && !concept_ids) {
        return res.status(400).json({
            success: false,
            error: 'Bad request',
            message: 'At least one field to update is required'
        });
    }

    if (batch_size !== undefined && (!Number.isInteger(batch_size) || batch_size <= 0)) {
        return res.status(400).json({
            success: false,
            error: 'Bad request',
            message: 'Batch size must be a positive integer'
        });
    }

    if (pod_size !== undefined && (!Number.isInteger(pod_size) || pod_size <= 0)) {
        return res.status(400).json({
            success: false,
            error: 'Bad request',
            message: 'Pod size must be a positive integer'
        });
    }

    try {
        const organization_id = organization_name ? await getOrganizationIdByName(organization_name) : null;
        await validateConceptIds(concept_ids);

        const fields = [];
        const values = [];
        let index = 1;

        if (organization_name !== undefined) { fields.push(`organization_id = $${index++}`); values.push(organization_id); }
        if (batch_name) { fields.push(`batch_name = $${index++}`); values.push(batch_name); }
        if (batch_size !== undefined) { fields.push(`batch_size = $${index++}`); values.push(batch_size); }
        if (pod_size !== undefined) { fields.push(`pod_size = $${index++}`); values.push(pod_size); }
        if (is_active !== undefined) { fields.push(`is_active = $${index++}`); values.push(is_active); }

        await pool.query('BEGIN');
        let batch;
        if (fields.length > 0) {
            values.push(batch_id);
            const query = `UPDATE batches SET ${fields.join(', ')} WHERE batch_id = $${index} RETURNING *`;
            const result = await pool.query(query, values);
            if (result.rows.length === 0) {
                await pool.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    error: 'Not found',
                    message: 'Batch not found'
                });
            }
            batch = result.rows[0];
        } else {
            const result = await pool.query('SELECT * FROM batches WHERE batch_id = $1', [batch_id]);
            if (result.rows.length === 0) {
                await pool.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    error: 'Not found',
                    message: 'Batch not found'
                });
            }
            batch = result.rows[0];
        }

        if (concept_ids && Array.isArray(concept_ids)) {
            await pool.query('DELETE FROM batch_concepts WHERE batch_id = $1', [batch_id]);
            if (concept_ids.length > 0) {
                const values = concept_ids.map(concept_id => `(${batch_id}, ${concept_id})`).join(', ');
                await pool.query(`INSERT INTO batch_concepts (batch_id, concept_id) VALUES ${values}`);
            }
        }

        const orgResult = await pool.query('SELECT organization_name FROM organizations WHERE organization_id = $1', [batch.organization_id]);
        const conceptsResult = await pool.query(
            'SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1',
            [batch_id]
        );

        await pool.query('COMMIT');
        res.json({
            success: true,
            data: { ...batch, organization_name: orgResult.rows[0].organization_name, concepts: conceptsResult.rows },
            message: 'Batch updated successfully'
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        if (error.message === 'Organization not found') {
            return res.status(400).json({
                success: false,
                error: 'Bad request',
                message: 'Organization not found'
            });
        }
        if (error.message.includes('Invalid concept IDs')) {
            return res.status(400).json({
                success: false,
                error: 'Bad request',
                message: error.message
            });
        }
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                error: 'Conflict',
                message: 'Batch name already exists'
            });
        }
        console.error('Error updating batch:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

const getAllBatches = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT b.*, o.organization_name FROM batches b JOIN organizations o ON b.organization_id = o.organization_id ORDER BY b.batch_id'
        );
        const batches = result.rows;
        for (let batch of batches) {
            const conceptsResult = await pool.query(
                'SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1',
                [batch.batch_id]
            );
            batch.concepts = conceptsResult.rows;
        }
        res.json({
            success: true,
            data: batches,
            message: 'Batches fetched successfully'
        });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

const getBatchesByOrganization = async (req, res) => {
    const { organization_name } = req.params;
    try {
        const organization_id = await getOrganizationIdByName(organization_name);
        const result = await pool.query(
            'SELECT b.*, o.organization_name FROM batches b JOIN organizations o ON b.organization_id = o.organization_id WHERE b.organization_id = $1 ORDER BY b.batch_id',
            [organization_id]
        );
        const batches = result.rows;
        for (let batch of batches) {
            const conceptsResult = await pool.query(
                'SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1',
                [batch.batch_id]
            );
            batch.concepts = conceptsResult.rows;
        }
        res.json({
            success: true,
            data: batches,
            message: `Batches for organization ${organization_name} fetched successfully`
        });
    } catch (error) {
        if (error.message === 'Organization not found') {
            return res.status(400).json({
                success: false,
                error: 'Bad request',
                message: 'Organization not found'
            });
        }
        console.error('Error fetching batches by organization:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

const getBatchByName = async (req, res) => {
    const { batch_name } = req.params;
    try {
        const result = await pool.query(
            'SELECT b.*, o.organization_name FROM batches b JOIN organizations o ON b.organization_id = o.organization_id WHERE b.batch_name = $1',
            [batch_name]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Not found',
                message: 'Batch not found'
            });
        }
        const batch = result.rows[0];
        const conceptsResult = await pool.query(
            'SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1',
            [batch.batch_id]
        );
        batch.concepts = conceptsResult.rows;
        res.json({
            success: true,
            data: batch,
            message: 'Batch fetched successfully'
        });
    } catch (error) {
        console.error('Error fetching batch by name:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

const getBatchById = async (req, res) => {
    const { batch_id } = req.params;
    try {
        const result = await pool.query(
            'SELECT b.*, o.organization_name FROM batches b JOIN organizations o ON b.organization_id = o.organization_id WHERE b.batch_id = $1',
            [batch_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Not found',
                message: 'Batch not found'
            });
        }
        const batch = result.rows[0];
        const conceptsResult = await pool.query(
            'SELECT c.* FROM concepts c JOIN batch_concepts bc ON c.concept_id = bc.concept_id WHERE bc.batch_id = $1',
            [batch.batch_id]
        );
        batch.concepts = conceptsResult.rows;
        res.json({
            success: true,
            data: batch,
            message: 'Batch fetched successfully'
        });
    } catch (error) {
        console.error('Error fetching batch by ID:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

module.exports = {
    addBatch,
    updateBatch,
    getAllBatches,
    getBatchesByOrganization,
    getBatchByName,
    getBatchById
};