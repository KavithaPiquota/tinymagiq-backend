const { pool } = require('../config/database');

// Create a pod
const createPod = async (req, res) => {
    const { pod_name, batch_name, organization_name, isActive = true } = req.body;

    if (!pod_name || !batch_name || !organization_name) {
        return res.status(400).json({ error: 'Pod name, batch name, and organization name are required' });
    }

    try {
        // Look up org_id by organization_name
        const orgCheck = await pool.query(
            `SELECT org_id FROM organizations WHERE name = $1`,
            [organization_name]
        );
        if (orgCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        const org_id = orgCheck.rows[0].org_id;

        // Look up batch_id by batch_name and org_id
        const batchCheck = await pool.query(
            `SELECT batch_id FROM batches WHERE batch_name = $1 AND org_id = $2`,
            [batch_name, org_id]
        );
        if (batchCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Batch not found for this organization' });
        }
        const batch_id = batchCheck.rows[0].batch_id;

        // Create pod
        const result = await pool.query(
            `INSERT INTO pods (pod_name, batch_id, isActive)
             VALUES ($1, $2, $3)
             RETURNING pod_id, pod_name, batch_id, isActive, created_at, updated_at`,
            [pod_name, batch_id, isActive]
        );
        return res.status(201).json({ message: 'Pod created', pod: {
            ...result.rows[0],
            batch_name,
            organization_name
        } });
    } catch (error) {
        console.error('Error creating pod:', error);
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({ error: 'Pod name already exists for this batch' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Get all pods (optionally filtered by organization_name)
const getPods = async (req, res) => {
    const { organization_name } = req.query;

    try {
        let query = `
            SELECT p.pod_id, p.pod_name, p.batch_id, b.batch_name, b.org_id, o.name AS organization_name, p.isActive, p.created_at, p.updated_at
            FROM pods p
            JOIN batches b ON p.batch_id = b.batch_id
            JOIN organizations o ON b.org_id = o.org_id
        `;
        const params = [];
        if (organization_name) {
            query += ` WHERE o.name = $1`;
            params.push(organization_name);
        }
        query += ` ORDER BY p.pod_name`;

        const result = await pool.query(query, params);
        return res.status(200).json({ pods: result.rows });
    } catch (error) {
        console.error('Error fetching pods:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Get pods by organization name
const getPodsByOrganization = async (req, res) => {
    const { organization_name } = req.query;

    if (!organization_name) {
        return res.status(400).json({ error: 'Organization name is required' });
    }

    try {
        const query = `
            SELECT p.pod_id, p.pod_name, p.batch_id, b.batch_name, b.org_id, o.name AS organization_name, p.isActive, p.created_at, p.updated_at
            FROM pods p
            JOIN batches b ON p.batch_id = b.batch_id
            JOIN organizations o ON b.org_id = o.org_id
            WHERE o.name = $1
            ORDER BY p.pod_name
        `;
        const result = await pool.query(query, [organization_name]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No pods found for the specified organization' });
        }
        return res.status(200).json({ pods: result.rows });
    } catch (error) {
        console.error('Error fetching pods by organization:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Get pods by organization name and batch name
const getPodsByOrgAndBatch = async (req, res) => {
    const { organization_name, batch_name } = req.query;

    if (!organization_name || !batch_name) {
        return res.status(400).json({ error: 'Organization name and batch name are required' });
    }

    try {
        const orgCheck = await pool.query(
            `SELECT org_id FROM organizations WHERE name = $1`,
            [organization_name]
        );
        if (orgCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        const org_id = orgCheck.rows[0].org_id;

        const query = `
            SELECT p.pod_id, p.pod_name, p.batch_id, b.batch_name, b.org_id, o.name AS organization_name, p.isActive, p.created_at, p.updated_at
            FROM pods p
            JOIN batches b ON p.batch_id = b.batch_id
            JOIN organizations o ON b.org_id = o.org_id
            WHERE o.name = $1 AND b.batch_name = $2
            ORDER BY p.pod_name
        `;
        const result = await pool.query(query, [organization_name, batch_name]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No pods found for the specified organization and batch' });
        }
        return res.status(200).json({ pods: result.rows });
    } catch (error) {
        console.error('Error fetching pods by organization and batch:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Get pods by batch name
const getPodsByBatch = async (req, res) => {
    const { batch_name } = req.query;

    if (!batch_name) {
        return res.status(400).json({ error: 'Batch name is required' });
    }

    try {
        const query = `
            SELECT p.pod_id, p.pod_name, p.batch_id, b.batch_name, b.org_id, o.name AS organization_name, p.isActive, p.created_at, p.updated_at
            FROM pods p
            JOIN batches b ON p.batch_id = b.batch_id
            JOIN organizations o ON b.org_id = o.org_id
            WHERE b.batch_name = $1
            ORDER BY p.pod_name
        `;
        const result = await pool.query(query, [batch_name]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No pods found for the specified batch' });
        }
        return res.status(200).json({ pods: result.rows });
    } catch (error) {
        console.error('Error fetching pods by batch:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Get pods by batch_id
const getPodsByBatchId = async (req, res) => {
    const { batch_id } = req.query;

    if (!batch_id) {
        return res.status(400).json({ error: 'Batch ID is required' });
    }

    try {
        const query = `
            SELECT p.pod_id, p.pod_name, p.batch_id, b.batch_name, b.org_id, o.name AS organization_name, p.isActive, p.created_at, p.updated_at
            FROM pods p
            JOIN batches b ON p.batch_id = b.batch_id
            JOIN organizations o ON b.org_id = o.org_id
            WHERE p.batch_id = $1
            ORDER BY p.pod_name
        `;
        const result = await pool.query(query, [batch_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No pods found for the specified batch ID' });
        }
        return res.status(200).json({ pods: result.rows });
    } catch (error) {
        console.error('Error fetching pods by batch ID:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Get pods by org_id
const getPodsByOrgId = async (req, res) => {
    const { org_id } = req.query;

    if (!org_id) {
        return res.status(400).json({ error: 'Organization ID is required' });
    }

    try {
        const query = `
            SELECT p.pod_id, p.pod_name, p.batch_id, b.batch_name, b.org_id, o.name AS organization_name, p.isActive, p.created_at, p.updated_at
            FROM pods p
            JOIN batches b ON p.batch_id = b.batch_id
            JOIN organizations o ON b.org_id = o.org_id
            WHERE b.org_id = $1
            ORDER BY p.pod_name
        `;
        const result = await pool.query(query, [org_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No pods found for the specified organization ID' });
        }
        return res.status(200).json({ pods: result.rows });
    } catch (error) {
        console.error('Error fetching pods by organization ID:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Update a pod
const updatePod = async (req, res) => {
    const { pod_id } = req.params;
    const { pod_name, batch_name, organization_name, isActive } = req.body;

    if (!pod_name || !batch_name || !organization_name || isActive === undefined) {
        return res.status(400).json({ error: 'Pod name, batch name, organization name, and isActive are required' });
    }

    try {
        // Look up org_id by organization_name
        const orgCheck = await pool.query(
            `SELECT org_id FROM organizations WHERE name = $1`,
            [organization_name]
        );
        if (orgCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        const org_id = orgCheck.rows[0].org_id;

        // Look up batch_id by batch_name and org_id
        const batchCheck = await pool.query(
            `SELECT batch_id FROM batches WHERE batch_name = $1 AND org_id = $2`,
            [batch_name, org_id]
        );
        if (batchCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Batch not found for this organization' });
        }
        const batch_id = batchCheck.rows[0].batch_id;

        // Update pod
        const result = await pool.query(
            `UPDATE pods
             SET pod_name = $1, batch_id = $2, isActive = $3, updated_at = CURRENT_TIMESTAMP
             WHERE pod_id = $4
             RETURNING pod_id, pod_name, batch_id, isActive, created_at, updated_at`,
            [pod_name, batch_id, isActive, pod_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pod not found' });
        }

        // Add batch_name and organization_name to response
        const pod = {
            ...result.rows[0],
            batch_name,
            organization_name
        };
        return res.status(200).json({ message: 'Pod updated', pod });
    } catch (error) {
        console.error('Error updating pod:', error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Pod name already exists for this batch' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { createPod, getPods, getPodsByOrganization, getPodsByOrgAndBatch, getPodsByBatch, getPodsByBatchId, getPodsByOrgId, updatePod };