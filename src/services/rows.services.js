import { DatabaseHelper } from '../config/database.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';

class RowsService {
    static async createRow(rowData, userId) {
        const { farm_id, name, description, capacity } = rowData;
        if (!farm_id || !name || !capacity || capacity < 1) {
            throw new ValidationError('Farm ID, name, and valid capacity are required');
        }

        try {
            await DatabaseHelper.executeQuery('BEGIN');

            // Check if row exists
            const existingRow = await DatabaseHelper.executeQuery(
                'SELECT 1 FROM rows WHERE name = $1 AND farm_id = $2 AND is_deleted = 0',
                [name, farm_id]
            );
            if (existingRow.rows.length > 0) {
                throw new ValidationError('Row already exists');
            }

            // Insert row
            const rowResult = await DatabaseHelper.executeQuery(
                'INSERT INTO rows (name, farm_id, description, capacity, occupied, created_at, is_deleted) VALUES ($1, $2, $3, $4, 0, CURRENT_TIMESTAMP, 0) RETURNING *',
                [name, farm_id, description || null, capacity]
            );
            const row = rowResult.rows[0];

            // Generate hutches based on capacity
            const levels = ['A', 'B', 'C'];
            const hutchesPerLevel = Math.ceil(capacity / levels.length);
            const hutches = [];
            let hutchCount = 0;

            for (const level of levels) {
                for (let position = 1; position <= hutchesPerLevel && hutchCount < capacity; position++) {
                    const hutchId = `${name}-${level}${position}`;
                    hutches.push([
                        hutchId,
                        name,
                        farm_id,
                        level,
                        position,
                        'medium',
                        'wire',
                        JSON.stringify(['water bottle', 'feeder']),
                        false,
                        0 // Remove CURRENT_TIMESTAMP here; handle it in the query
                    ]);
                    hutchCount++;
                }
            }

            // Insert hutches
            for (const hutch of hutches) {
                await DatabaseHelper.executeQuery(
                    'INSERT INTO hutches (id, row_name, farm_id, level, position, size, material, features, is_occupied, created_at, is_deleted) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10)',
                    hutch
                );
            }

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Row ${name} created with ${hutchCount} hutches by user ${userId}`);
            return row;
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error creating row: ${error.message}`);
            throw error;
        }
    }

    static async getRowByName(name, farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                'SELECT * FROM rows WHERE name = $1 AND farm_id = $2 AND is_deleted = 0',
                [name, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Row not found');
            }
            return result.rows[0];
        } catch (error) {
            logger.error(`Error fetching row ${name}: ${error.message}`);
            throw error;
        }
    }

    static async getAllRows(farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                'SELECT * FROM rows WHERE farm_id = $1 AND is_deleted = 0 ORDER BY created_at DESC',
                [farmId]
            );
            return result.rows;
        } catch (error) {
            logger.error(`Error fetching rows for farm ${farmId}: ${error.message}`);
            throw error;
        }
    }

    static async updateRow(name, farmId, rowData, userId) {
        const { description } = rowData;
        try {
            const result = await DatabaseHelper.executeQuery(
                'UPDATE rows SET description = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2 AND farm_id = $3 AND is_deleted = 0 RETURNING *',
                [description || null, name, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Row not found');
            }
            logger.info(`Row ${name} updated by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            logger.error(`Error updating row ${name}: ${error.message}`);
            throw error;
        }
    }

    static async deleteRow(name, farmId, userId) {
        try {
            await DatabaseHelper.executeQuery('BEGIN');
            const result = await DatabaseHelper.executeQuery(
                'UPDATE rows SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE name = $1 AND farm_id = $2 AND is_deleted = 0 RETURNING *',
                [name, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Row not found');
            }

            // Soft delete associated hutches
            await DatabaseHelper.executeQuery(
                'UPDATE hutches SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE row_name = $1 AND farm_id = $2 AND is_deleted = 0',
                [name, farmId]
            );

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Row ${name} soft deleted by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error deleting row ${name}: ${error.message}`);
            throw error;
        }
    }
}

export default RowsService;