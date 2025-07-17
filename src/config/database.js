import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// PostgreSQL configuration optimized for serverless
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'karagani-db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 1, // Reduced for serverless
    min: 0, // No minimum connections
    idleTimeoutMillis: 10000, // 10 seconds
    connectionTimeoutMillis: 60000, // 60 seconds
    acquireTimeoutMillis: 60000, // 60 seconds
    createTimeoutMillis: 60000, // 60 seconds
    destroyTimeoutMillis: 5000, // 5 seconds
    createRetryIntervalMillis: 200,
    propagateCreateError: false
};

// Create a connection pool
if (process.env.NODE_ENV === 'production') {
    dbConfig.connectionString = process.env.DATABASE_URL; // Use DATABASE_URL in production
    dbConfig.ssl = {
        rejectUnauthorized: false, // Allow self-signed certificates
    };
}
export const pool = new Pool(dbConfig);

// Test the connection on startup - ONLY IN DEVELOPMENT
if (process.env.NODE_ENV !== 'production') {
    (async () => {
        try {
            const client = await pool.connect();
            console.log('Connected to PostgreSQL successfully');
            client.release();
        } catch (error) {
            console.error('Failed to connect to PostgreSQL:', error.message);
            process.exit(1); // Exit if connection fails
        }
    })();
}

// Database helper class for executing queries and transactions
export class DatabaseHelper {
    static async executeQuery(query, params = []) {
        const client = await pool.connect();
        try {
            const result = await client.query(query, params);
            return result;
        } catch (error) {
            console.error('Database query error:', { query, params, error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    static async executeTransaction(queries) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const results = [];

            for (const { query, params } of queries) {
                const result = await client.query(query, params);
                results.push(result);
            }

            await client.query('COMMIT');
            return results;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Transaction error:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    static async getConnection() {
        return await pool.connect();
    }
}