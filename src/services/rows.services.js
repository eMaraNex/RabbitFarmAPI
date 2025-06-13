import { DatabaseHelper } from '../config/database.js'
import logger from '../middleware/logger.js'
import { ValidationError } from '../middleware/errors.js'

class RowsService {
    static generateLevels(numLevels) {
        return Array.from({ length: numLevels }, (_, i) => String.fromCharCode(65 + i)) // A, B, C, etc.
    }

    static distributeHutchesAcrossLevels(capacity, levels) {
        const baseHutchesPerLevel = Math.floor(capacity / levels.length)
        const remainder = capacity % levels.length
        const distribution = {}

        levels.forEach((level, index) => {
            distribution[level] = baseHutchesPerLevel + (index < remainder ? 1 : 0)
        })

        return distribution
    }
    static async createRow(rowData, userId) {
        const { farm_id, name, description, capacity, levels } = rowData;
        if (!farm_id || !name || !capacity || capacity < 1 || !levels || levels.length < 1) {
            throw new ValidationError('Farm ID, name, valid capacity, and levels are required');
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
                'INSERT INTO rows (name, farm_id, description, capacity, levels, occupied, created_at, is_deleted) VALUES ($1, $2, $3, $4, $5, 0, CURRENT_TIMESTAMP, 0) RETURNING *',
                [name, farm_id, description || null, capacity, levels]
            );
            const row = rowResult.rows[0];

            const distribution = this.distributeHutchesAcrossLevels(capacity, levels);
            const hutches = [];

            for (const [level, count] of Object.entries(distribution)) {
                for (let position = 1; position <= count; position++) {
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
                        0
                    ]);
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
            logger.info(`Row ${name} created with ${hutches.length} hutches (${JSON.stringify(distribution)}) by user ${userId}`);
            return row;
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error creating row: ${error.message}`);
            throw error;
        }
    }

    static async expandRowCapacity(name, farmId, additionalCapacity, userId) {
        if (!additionalCapacity || additionalCapacity < 1) {
            throw new ValidationError('Additional capacity must be at least 1')
        }

        try {
            await DatabaseHelper.executeQuery('BEGIN')

            // Get current row
            const rowResult = await DatabaseHelper.executeQuery(
                'SELECT * FROM rows WHERE name = $1 AND farm_id = $2 AND is_deleted = 0',
                [name, farmId]
            )
            if (rowResult.rows.length === 0) {
                throw new ValidationError('Row not found')
            }

            const currentRow = rowResult.rows[0]
            const newCapacity = currentRow.capacity + additionalCapacity
            const currentLevels = currentRow.levels || ['A', 'B', 'C']

            // Update row capacity
            const updatedRowResult = await DatabaseHelper.executeQuery(
                'UPDATE rows SET capacity = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2 AND farm_id = $3 AND is_deleted = 0 RETURNING *',
                [newCapacity, name, farmId]
            )

            await DatabaseHelper.executeQuery('COMMIT')
            logger.info(`Row ${name} expanded by ${additionalCapacity} hutches to total capacity ${newCapacity} by user ${userId}`)
            return updatedRowResult.rows[0]
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK')
            logger.error(`Error expanding row ${name}: ${error.message}`)
            throw error
        }
    }

    static async getRowByName(name, farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                'SELECT * FROM rows WHERE name = $1 AND farm_id = $2 AND is_deleted = 0',
                [name, farmId]
            )
            if (result.rows.length === 0) {
                throw new ValidationError('Row not found')
            }
            return result.rows[0]
        } catch (error) {
            logger.error(`Error fetching row ${name}: ${error.message}`)
            throw error
        }
    }

    static async getAllRows(farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                'SELECT * FROM rows WHERE farm_id = $1 AND is_deleted = 0 ORDER BY created_at DESC',
                [farmId]
            )
            return result.rows
        } catch (error) {
            logger.error(`Error fetching rows for farm ${farmId}: ${error.message}`)
            throw error
        }
    }

    static async updateRow(name, farmId, rowData, userId) {
        const { description } = rowData
        try {
            const result = await DatabaseHelper.executeQuery(
                'UPDATE rows SET description = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2 AND farm_id = $3 AND is_deleted = 0 RETURNING *',
                [description || null, name, farmId]
            )
            if (result.rows.length === 0) {
                throw new ValidationError('Row not found')
            }
            logger.info(`Row ${name} updated by user ${userId}`)
            return result.rows[0]
        } catch (error) {
            logger.error(`Error updating row ${name}: ${error.message}`)
            throw error
        }
    }

    static async deleteRow(name, farmId, userId) {
        try {
            await DatabaseHelper.executeQuery('BEGIN')
            const result = await DatabaseHelper.executeQuery(
                'UPDATE rows SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE name = $1 AND farm_id = $2 AND is_deleted = 0 RETURNING *',
                [name, farmId]
            )
            if (result.rows.length === 0) {
                throw new ValidationError('Row not found')
            }

            await DatabaseHelper.executeQuery(
                'UPDATE hutches SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE row_name = $1 AND farm_id = $2 AND is_deleted = 0',
                [name, farmId]
            )

            await DatabaseHelper.executeQuery('COMMIT')
            logger.info(`Row ${name} soft deleted by user ${userId}`)
            return result.rows[0]
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK')
            logger.error(`Error deleting row ${name}: ${error.message}`)
            throw error
        }
    }
}

export default RowsService