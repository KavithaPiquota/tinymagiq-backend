const { pool } = require('../config/database');

const getAllRoles = async (req, res) => {
    try {
        const result = await pool.query('SELECT role_id, role FROM roles ORDER BY role_id');
        res.json({
            success: true,
            data: result.rows,
            message: 'Roles fetched successfully'
        });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

module.exports = {
    getAllRoles
};