const { pool } = require('../config/database');
const bcrypt = require('bcrypt');

// Controller to add a superadmin
const addSuperadmin = async (req, res) => {
    const { email, username, password, first_name, last_name } = req.body;

    // Input validation
    if (!email || !username || !password || !first_name || !last_name) {
        return res.status(400).json({ error: 'All fields (email, username, password, first_name, last_name) are required' });
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
        // Fetch superadmin role_id dynamically
        const roleQuery = await pool.query('SELECT role_id FROM roles WHERE name = $1', ['superadmin']);
        if (roleQuery.rows.length === 0) {
            return res.status(500).json({ error: 'Superadmin role not found' });
        }
        const superadminRoleId = roleQuery.rows[0].role_id;

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

        // Insert superadmin into users table (organization_id = NULL)
        const result = await pool.query(
            `INSERT INTO users (role_id, organization_id, email, username, password_hash, first_name, last_name, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING user_id, email, username, first_name, last_name, is_active, created_at`,
            [superadminRoleId, null, email, username, password_hash, first_name, last_name, true]
        );

        const newSuperadmin = result.rows[0];
        return res.status(201).json({
            message: 'Superadmin created successfully',
            superadmin: {
                user_id: newSuperadmin.user_id,
                email: newSuperadmin.email,
                username: newSuperadmin.username,
                first_name: newSuperadmin.first_name,
                last_name: newSuperadmin.last_name,
                is_active: newSuperadmin.is_active,
                created_at: newSuperadmin.created_at
            }
        });
    } catch (error) {
        console.error('Error creating superadmin:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { addSuperadmin };