import { DatabaseHelper } from '../config/database.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';
import { v4 as uuidv4 } from 'uuid';

class FarmsService {
    static async createFarm(farmData, userId) {
        const { name, location, latitude, longitude, size, description, timezone } = farmData;
        if (!name) {
            throw new ValidationError('Farm name is required');
        }

        try {
            await DatabaseHelper.executeQuery('BEGIN');

            // Check if farm name is unique for the user
            const existingFarm = await DatabaseHelper.executeQuery(
                'SELECT 1 FROM farms WHERE name = $1 AND created_by = $2 AND is_deleted = 0',
                [name, userId]
            );
            if (existingFarm.rows.length > 0) {
                throw new ValidationError('Farm name already exists for this user');
            }

            // Generate UUID for farm
            const farmId = uuidv4();

            // Insert farm
            const farmResult = await DatabaseHelper.executeQuery(
                `INSERT INTO farms (
                    id, name, location, latitude, longitude, size, description, timezone,
                    created_by, created_at, is_deleted
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, 0) RETURNING *`,
                [
                    farmId,
                    name,
                    location || null,
                    latitude || null,
                    longitude || null,
                    size || null,
                    description || null,
                    timezone || 'UTC',
                    userId
                ]
            );

            // Update user's farm_id if none exists (optional, for default farm)
            const userFarmCheck = await DatabaseHelper.executeQuery(
                'SELECT farm_id FROM users WHERE id = $1 AND is_deleted = 0',
                [userId]
            );
            if (!userFarmCheck.rows[0]?.farm_id) {
                await DatabaseHelper.executeQuery(
                    'UPDATE users SET farm_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [farmId, userId]
                );
            }

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Farm ${name} (ID: ${farmId}) created by user ${userId}`);
            return farmResult.rows[0];
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error creating farm: ${error.message}`);
            throw error;
        }
    }

    static async getFarmById(farmId, userId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                'SELECT * FROM farms WHERE id = $1 AND created_by = $2 AND is_deleted = 0',
                [farmId, userId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Farm not found');
            }
            return result.rows[0];
        } catch (error) {
            logger.error(`Error fetching farm ${farmId}: ${error.message}`);
            throw error;
        }
    }

    static async getAllFarms(userId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                'SELECT * FROM farms WHERE is_deleted = 0 ORDER BY created_at DESC'
            );
            return result.rows;
        } catch (error) {
            logger.error(`Error fetching farms for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    static async updateFarm(farmId, farmData, userId) {
        const { name, location, latitude, longitude, size, description, timezone } = farmData;
        try {
            const result = await DatabaseHelper.executeQuery(
                `UPDATE farms SET
                    name = $1, location = $2, latitude = $3, longitude = $4,
                    size = $5, description = $6, timezone = $7, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $8 AND created_by = $9 AND is_deleted = 0 RETURNING *`,
                [
                    name || null,
                    location || null,
                    latitude || null,
                    longitude || null,
                    size || null,
                    description || null,
                    timezone || 'UTC',
                    farmId,
                    userId
                ]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Farm not found');
            }
            logger.info(`Farm ${farmId} updated by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            logger.error(`Error updating farm ${farmId}: ${error.message}`);
            throw error;
        }
    }

    static async deleteFarm(farmId, userId) {
        try {
            await DatabaseHelper.executeQuery('BEGIN');
            const result = await DatabaseHelper.executeQuery(
                'UPDATE farms SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND created_by = $2 AND is_deleted = 0 RETURNING *',
                [farmId, userId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Farm not found');
            }

            // Soft delete related entities (rows, hutches, rabbits, etc.)
            await DatabaseHelper.executeQuery(
                'UPDATE rows SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE farm_id = $1 AND is_deleted = 0',
                [farmId]
            );
            await DatabaseHelper.executeQuery(
                'UPDATE hutches SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE farm_id = $1 AND is_deleted = 0',
                [farmId]
            );
            await DatabaseHelper.executeQuery(
                'UPDATE rabbits SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE farm_id = $1 AND is_deleted = 0',
                [farmId]
            );

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Farm ${farmId} soft deleted by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error deleting farm ${farmId}: ${error.message}`);
            throw error;
        }
    }
}

export default FarmsService;