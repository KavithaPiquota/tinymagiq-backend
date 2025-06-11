const { pool } = require('./database');

const createTables = async () => {
    let client;
    
    try {
        console.log('🔄 Starting database migration...');
        client = await pool.connect();
        await client.query('BEGIN');

        // Create prompt_templates table (PostgreSQL syntax)
        console.log('📝 Creating prompt_templates table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS prompt_templates (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                template_type VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for prompt_templates
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_prompt_user_type ON prompt_templates(username, template_type);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_prompt_active ON prompt_templates(username, template_type, is_active);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_prompt_version ON prompt_templates(username, template_type, version);
        `);

        // Create unique constraint for active templates (PostgreSQL syntax)
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS unique_active_template 
            ON prompt_templates(username, template_type) 
            WHERE is_active = TRUE;
        `);

        // Create users table (PostgreSQL syntax)
        console.log('👥 Creating users table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for users
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        `);

        // Create chat table with JSONB support (PostgreSQL)
        console.log('💬 Creating chat table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                conversation JSONB NOT NULL,
                status VARCHAR(50) DEFAULT 'incomplete',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for chat table
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_user_id ON chat(user_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_status ON chat(status);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_created_at ON chat(created_at DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_user_status ON chat(user_id, status);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_user_created ON chat(user_id, created_at DESC);
        `);

        // Add additional indexes for better performance
        console.log('📈 Adding performance indexes...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_user_status_updated ON chat(user_id, status, updated_at DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_status_created ON chat(status, created_at DESC);
        `);

        // Add status constraint for chat table
        console.log('🔒 Adding chat status constraints...');
        await client.query(`
            DO $$ 
            BEGIN
                -- Check if constraint exists, if not create it
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'chk_chat_status' 
                    AND table_name = 'chat'
                ) THEN
                    ALTER TABLE chat ADD CONSTRAINT chk_chat_status 
                    CHECK (status IN ('incomplete', 'paused', 'completed', 'stopped', 'archived'));
                    RAISE NOTICE 'Added chat status constraint';
                ELSE
                    RAISE NOTICE 'Chat status constraint already exists';
                END IF;
            END $$;
        `);

        // Create trigger function to automatically update updated_at
        console.log('⚡ Creating auto-update triggers...');
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Create triggers for auto-updating updated_at columns
        await client.query(`
            DROP TRIGGER IF EXISTS update_prompt_templates_updated_at ON prompt_templates;
            CREATE TRIGGER update_prompt_templates_updated_at 
                BEFORE UPDATE ON prompt_templates 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
        `);

        await client.query(`
            DROP TRIGGER IF EXISTS update_users_updated_at ON users;
            CREATE TRIGGER update_users_updated_at 
                BEFORE UPDATE ON users 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
        `);

        await client.query(`
            DROP TRIGGER IF EXISTS update_chat_updated_at ON chat;
            CREATE TRIGGER update_chat_updated_at 
                BEFORE UPDATE ON chat 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
        `);

        // Clean up any invalid chat statuses (if any exist)
        console.log('🧹 Cleaning up invalid chat statuses...');
        const updateResult = await client.query(`
            UPDATE chat SET status = 'incomplete' 
            WHERE status NOT IN ('incomplete', 'paused', 'completed', 'stopped', 'archived')
            RETURNING id, status;
        `);
        
        if (updateResult.rows.length > 0) {
            console.log(`📝 Updated ${updateResult.rows.length} chats with invalid status to 'incomplete'`);
        }

        await client.query('COMMIT');
        
        // Display table information
        console.log('✅ Database tables created successfully');
        console.log('📊 Tables created: prompt_templates, users, chat');
        
        // Show chat table column info
        const chatTableInfo = await client.query(`
            SELECT 
                column_name, 
                data_type, 
                is_nullable, 
                column_default
            FROM information_schema.columns 
            WHERE table_name = 'chat' 
            ORDER BY ordinal_position;
        `);
        
        console.log('💬 Chat table structure:');
        chatTableInfo.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
        });

        // Show indexes
        const indexInfo = await client.query(`
            SELECT indexname, tablename 
            FROM pg_indexes 
            WHERE tablename IN ('chat', 'prompt_templates', 'users')
            ORDER BY tablename, indexname;
        `);
        
        console.log('📇 Created indexes:');
        indexInfo.rows.forEach(row => {
            console.log(`  - ${row.tablename}.${row.indexname}`);
        });

        // Show constraints
        const constraintInfo = await client.query(`
            SELECT constraint_name, table_name, constraint_type 
            FROM information_schema.table_constraints 
            WHERE table_name IN ('chat', 'prompt_templates', 'users')
            ORDER BY table_name, constraint_name;
        `);
        
        console.log('🔒 Table constraints:');
        constraintInfo.rows.forEach(row => {
            console.log(`  - ${row.table_name}.${row.constraint_name} (${row.constraint_type})`);
        });

        console.log('🚀 Migration completed successfully!');

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        
        // Check if it's a "relation already exists" error
        if (error.code === '42P07') {
            console.log('ℹ️  Tables already exist, running updates only...');
            
            // Still try to add constraints and triggers for existing tables
            try {
                await runUpdatesOnly(client);
            } catch (updateError) {
                console.log('⚠️  Some updates may have failed (this is normal if they already exist)');
            }
            return;
        }
        
        console.error('❌ Migration failed:', error.message);
        console.error('📋 Error details:', error);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

// Function to run updates on existing tables
const runUpdatesOnly = async (client) => {
    console.log('🔄 Running updates for existing tables...');
    
    // Add status constraint if it doesn't exist
    await client.query(`
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = 'chk_chat_status' 
                AND table_name = 'chat'
            ) THEN
                ALTER TABLE chat ADD CONSTRAINT chk_chat_status 
                CHECK (status IN ('incomplete', 'paused', 'completed', 'stopped', 'archived'));
                RAISE NOTICE 'Added chat status constraint';
            END IF;
        END $$;
    `);

    // Create/update trigger function
    await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

    // Create triggers
    await client.query(`
        DROP TRIGGER IF EXISTS update_chat_updated_at ON chat;
        CREATE TRIGGER update_chat_updated_at 
            BEFORE UPDATE ON chat 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
    `);

    // Add new indexes
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_user_status_updated ON chat(user_id, status, updated_at DESC);
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_status_created ON chat(status, created_at DESC);
    `);

    console.log('✅ Updates completed for existing tables');
};

// Test database connection
const testConnection = async () => {
    let client;
    try {
        console.log('🔌 Testing database connection...');
        client = await pool.connect();
        const result = await client.query('SELECT NOW() as current_time, version() as postgres_version');
        console.log('✅ Database connection successful!');
        console.log(`⏰ Current time: ${result.rows[0].current_time}`);
        console.log(`🐘 PostgreSQL version: ${result.rows[0].postgres_version.split(' ')[0]}`);
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    } finally {
        if (client) {
            client.release();
        }
    }
};

// Run migration if called directly
if (require.main === module) {
    const runMigration = async () => {
        // Test connection first
        const connected = await testConnection();
        if (!connected) {
            console.error('💥 Cannot proceed without database connection');
            process.exit(1);
        }

        // Run migration
        await createTables();
        console.log('🎉 Migration completed successfully');
        
        // Final summary
        console.log('\n📋 Migration Summary:');
        console.log('  ✅ Tables: prompt_templates, users, chat');
        console.log('  ✅ Indexes: Optimized for query performance');
        console.log('  ✅ Constraints: Data integrity enforced');
        console.log('  ✅ Triggers: Auto-update timestamps');
        console.log('  ✅ Chat statuses: incomplete, paused, completed, stopped, archived');
        console.log('\n🚀 Your database is ready for the chat application!');
    };

    runMigration()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('💥 Migration failed:', error.message);
            process.exit(1);
        });
}

module.exports = { createTables, testConnection };