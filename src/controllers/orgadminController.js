const { pool } = require('../config/database');
const bcrypt = require('bcrypt');

// Controller to add an orgadmin
const addOrgadmin = async (req, res) => {
    const { email, username, password, first_name, last_name, orgname } = req.body;

    // Input validation
    if (!email || !username || !password || !first_name || !last_name || !orgname) {
        return res.status(400).json({ error: 'All fields (email, username, password, first_name, last_name, orgname) are required' });
    }

    // Validate email format (basic regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password length (minimum 8 characters)
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    try {
        // Fetch orgadmin role_id dynamically
        const roleQuery = await pool.query('SELECT role_id FROM roles WHERE name = $1', ['orgadmin']);
        if (roleQuery.rows.length === 0) {
            return res.status(500).json({ error: 'Orgadmin role not found' });
        }
        const orgadminRoleId = roleQuery.rows[0].role_id;

        // Fetch org_id based on orgname
        const orgQuery = await pool.query('SELECT org_id FROM organizations WHERE name = $1', [orgname]);
        if (orgQuery.rows.length === 0) {
            return res.status(400).json({ error: 'Organization not found' });
        }
        const organization_id = orgQuery.rows[0].org_id;

        // Check if email or username already exists
        const existingUser = await pool.query(
            'SELECT user_id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Email or username already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Insert orgadmin into users table
        const result = await pool.query(
            `INSERT INTO users (role_id, organization_id, email, username, password_hash, first_name, last_name, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING user_id, email, username, first_name, last_name, organization_id, is_active, created_at`,
            [orgadminRoleId, organization_id, email, username, password_hash, first_name, last_name, true]
        );

        const newOrgadmin = result.rows[0];
        return res.status(201).json({
            message: 'Orgadmin created successfully',
            orgadmin: {
                user_id: newOrgadmin.user_id,
                email: newOrgadmin.email,
                username: newOrgadmin.username,
                first_name: newOrgadmin.first_name,
                last_name: newOrgadmin.last_name,
                organization_id: newOrgadmin.organization_id,
                is_active: newOrgadmin.is_active,
                created_at: newOrgadmin.created_at
            }
        });
    } catch (error) {
        console.error('Error creating orgadmin:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { addOrgadmin };