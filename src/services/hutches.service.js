import { DatabaseHelper } from '../config/database.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';

class HutchesService {
    static async createHutch(hutchData, userId) {
        const { farm_id, id, row_name, level, position, size, material, features, last_cleaned } = hutchData;
        if (!farm_id || !id || !level || !position || !size || !material) {
            throw new ValidationError('Missing required hutch fields');
        }

        try {
            await DatabaseHelper.executeQuery('BEGIN');

            // Validate row_name if provided
            if (row_name) {
                const rowResult = await DatabaseHelper.executeQuery(
                    'SELECT 1 FROM rows WHERE name = $1 AND farm_id = $2 AND is_deleted = 0',
                    [row_name, farm_id]
                );
                if (rowResult.rows.length === 0) {
                    throw new ValidationError('Row not found');
                }
            }

            // Check if hutch exists
            const existingHutch = await DatabaseHelper.executeQuery(
                'SELECT 1 FROM hutches WHERE id = $1 AND farm_id = $2 AND is_deleted = 0',
                [id, farm_id]
            );
            if (existingHutch.rows.length > 0) {
                throw new ValidationError('Hutch ID already exists');
            }

            // Validate level
            if (!['A', 'B', 'C'].includes(level)) {
                throw new ValidationError('Level must be A, B, or C');
            }

            const result = await DatabaseHelper.executeQuery(
                `INSERT INTO hutches (id, farm_id, row_name, level, position, size, material, features, is_occupied, last_cleaned, created_at, updated_at, is_deleted)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0) RETURNING *`,
                [
                    id,
                    farm_id,
                    row_name || null,
                    level,
                    position,
                    size,
                    material,
                    JSON.stringify(features || ['water bottle', 'feeder']),
                    false,
                    last_cleaned || null
                ]
            );

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Hutch ${id} created by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error creating hutch: ${error.message}`);
            throw error;
        }
    }

    static async getHutchById(id, farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `SELECT h.*, r.name AS row_name,
                        (SELECT JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'rabbit_id', r2.rabbit_id,
                                'rabbit_name', r2.name,
                                'hutch_id', r2.hutch_id
                            )
                        )
                        FROM rabbits r2
                        WHERE r2.hutch_id = h.id AND r2.farm_id = $2 AND r2.is_deleted = 0) AS rabbits
                 FROM hutches h
                 LEFT JOIN rows r ON h.row_name = r.name
                 WHERE h.id = $1 AND h.farm_id = $2 AND h.is_deleted = 0`,
                [id, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Hutch not found');
            }
            return result.rows[0];
        } catch (error) {
            logger.error(`Error fetching hutch ${id}: ${error.message}`);
            throw error;
        }
    }

    static async getAllHutches(farmId, { rowName, limit, offset, is_occupied }) {
        try {
            let query = 'SELECT h.*, r.name AS row_name FROM hutches h LEFT JOIN rows r ON h.row_name = r.name WHERE h.farm_id = $1 AND h.is_deleted = 0';
            const params = [farmId];
            let paramIndex = 2;

            if (rowName) {
                query += ` AND h.row_name = $${paramIndex++}`;
                params.push(rowName);
            }

            if (is_occupied !== undefined) {
                query += ` AND h.is_occupied = $${paramIndex++}`;
                params.push(is_occupied);
            }

            query += ' ORDER BY h.id';

            if (limit) {
                query += ` LIMIT $${paramIndex++}`;
                params.push(parseInt(limit));
            }

            if (offset) {
                query += ` OFFSET $${paramIndex++}`;
                params.push(parseInt(offset));
            }

            const result = await DatabaseHelper.executeQuery(query, params);
            return result.rows;
        } catch (error) {
            logger.error(`Error fetching hutches for farm ${farmId}: ${error.message}`);
            throw error;
        }
    }

    static async updateHutch(id, farmId, hutchData, userId) {
        const { row_name, level, position, size, material, features, is_occupied, last_cleaned } = hutchData;
        try {
            await DatabaseHelper.executeQuery('BEGIN');

            // Validate row_name if provided
            if (row_name) {
                const rowResult = await DatabaseHelper.executeQuery(
                    'SELECT 1 FROM rows WHERE name = $1 AND farm_id = $2 AND is_deleted = 0',
                    [row_name, farmId]
                );
                if (rowResult.rows.length === 0) {
                    throw new ValidationError('Row not found');
                }
            }

            // Validate level if provided
            if (level && !['A', 'B', 'C'].includes(level)) {
                throw new ValidationError('Level must be A, B, or C');
            }

            const result = await DatabaseHelper.executeQuery(
                `UPDATE hutches SET row_name = $1, level = COALESCE($2, level), position = COALESCE($3, position), 
                 size = COALESCE($4, size), material = COALESCE($5, material), features = COALESCE($6, features), 
                 is_occupied = COALESCE($7, is_occupied), last_cleaned = $8, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $9 AND farm_id = $10 AND is_deleted = 0 RETURNING *`,
                [
                    row_name || null,
                    level,
                    position,
                    size,
                    material,
                    features ? JSON.stringify(features) : null,
                    is_occupied,
                    last_cleaned || null,
                    id,
                    farmId
                ]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Hutch not found');
            }

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Hutch ${id} updated by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error updating hutch ${id}: ${error.message}`);
            throw error;
        }
    }

    static async deleteHutch(id, farmId, userId) {
        try {
            await DatabaseHelper.executeQuery('BEGIN');

            const result = await DatabaseHelper.executeQuery(
                'UPDATE hutches SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND farm_id = $2 AND is_deleted = 0 RETURNING *',
                [id, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Hutch not found');
            }

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Hutch ${id} soft deleted by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error deleting hutch ${id}: ${error.message}`);
            throw error;
        }
    }

    static async getHutchRemovedRabbitHistory(farm_id, hutch_id) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `SELECT * FROM hutch_rabbit_history
                 WHERE farm_id = $1 AND hutch_id = $2 AND is_deleted = 0
                 ORDER BY updated_at DESC`,
                [farm_id, hutch_id]
            );
            return result.rows;
        } catch (error) {
            logger.error(`Error fetching hutch data history for ${hutch_id}: ${error.message}`);
            throw error;
        }
    }
}

export default HutchesService;