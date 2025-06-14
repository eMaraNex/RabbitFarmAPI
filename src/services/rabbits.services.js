import { DatabaseHelper } from '../config/database.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';
import { v4 as uuidv4 } from 'uuid';

class RabbitsService {
    static async createRabbit(rabbitData, userId) {
        const {
            farm_id, rabbit_id, name, gender, breed, color, birth_date, weight, hutch_id,
            is_pregnant, pregnancy_start_date, expected_birth_date, status, notes
        } = rabbitData;
        if (!farm_id || !rabbit_id || !gender || !breed || !color || !birth_date || !weight) {
            throw new ValidationError('Missing required rabbit fields');
        }

        try {
            await DatabaseHelper.executeQuery('BEGIN');

            // Check if rabbit_id is unique
            const existingRabbit = await DatabaseHelper.executeQuery(
                'SELECT 1 FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                [rabbit_id, farm_id]
            );
            if (existingRabbit.rows.length > 0) {
                throw new ValidationError('Rabbit ID already exists');
            }

            // Validate hutch
            let is_occupied = false;
            if (hutch_id) {
                const hutchResult = await DatabaseHelper.executeQuery(
                    'SELECT 1 FROM hutches WHERE id = $1 AND farm_id = $2 AND is_deleted = 0',
                    [hutch_id, farm_id]
                );
                if (hutchResult.rows.length === 0) {
                    throw new ValidationError('Hutch not found');
                }
                // Check rabbit count to enforce max 6 rabbits per hutch
                const rabbitCount = await DatabaseHelper.executeQuery(
                    'SELECT COUNT(*) FROM rabbits WHERE hutch_id = $1 AND farm_id = $2 AND is_deleted = 0',
                    [hutch_id, farm_id]
                );
                if (parseInt(rabbitCount?.rows[0]?.count || 0) >= 6) {
                    throw new ValidationError('Hutch cannot have more than 6 rabbits');
                }
                is_occupied = true;
            }

            // Insert rabbit
            const rabbitResult = await DatabaseHelper.executeQuery(
                `INSERT INTO rabbits (id, farm_id, rabbit_id, name, gender, breed, color, birth_date, weight, hutch_id,
             is_pregnant, pregnancy_start_date, expected_birth_date, status, notes, created_at, is_deleted)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, $16)
             RETURNING *`,
                [
                    uuidv4(), farm_id,
                    rabbit_id, name || null, gender, breed, color, birth_date, weight,
                    hutch_id || null, is_pregnant || false, pregnancy_start_date || null, expected_birth_date || null,
                    status || 'active', notes || null, 0
                ]
            );
            const rabbit = rabbitResult.rows[0];

            // Update hutch is_occupied
            if (hutch_id) {
                await DatabaseHelper.executeQuery(
                    'UPDATE hutches SET is_occupied = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND farm_id = $3',
                    [is_occupied, hutch_id, farm_id]
                );

                // Insert into hutch_rabbit_history
                await DatabaseHelper.executeQuery(
                    `INSERT INTO hutch_rabbit_history (id, hutch_id, rabbit_id, farm_id, assigned_at, created_at, is_deleted)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
                    [uuidv4(), hutch_id, rabbit.rabbit_id, farm_id]
                );
            }

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Rabbit ${rabbit_id} created by user ${userId}`);
            return rabbit;
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error creating rabbit: ${error.message}`);
            throw error;
        }
    }

    static async getRabbitById(rabbitId, farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `
        SELECT r.*, h.id AS hutch_id, h.row_name,
               (SELECT JSON_AGG(
                   JSON_BUILD_OBJECT(
                       'hutch_id', hr.hutch_id,
                       'assigned_at', hr.assigned_at,
                       'removed_at', hr.removed_at,
                       'removal_reason', hr.removal_reason,
                       'removal_notes', hr.removal_notes
                   )
               )
               FROM hutch_rabbit_history hr
               WHERE hr.rabbit_id = r.id AND hr.is_deleted = 0) AS history
        FROM rabbits r
        LEFT JOIN hutches h ON r.hutch_id = h.id AND r.farm_id = h.farm_id
        WHERE r.rabbit_id = $1 AND r.farm_id = $2 AND r.is_deleted = 0
        `,
                [rabbitId, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Rabbit not found');
            }
            return result.rows[0];
        } catch (error) {
            logger.error(`Error fetching rabbit ${rabbitId}: ${error.message}`);
            throw error;
        }
    }

    static async getAllRabbits(farmId, hutchId) {
        try {
            const query = hutchId
                ? 'SELECT * FROM rabbits WHERE farm_id = $1 AND hutch_id = $2 AND is_deleted = 0 ORDER BY created_at DESC'
                : 'SELECT * FROM rabbits WHERE farm_id = $1 AND is_deleted = 0 ORDER BY created_at DESC';
            const params = hutchId ? [farmId, hutchId] : [farmId];
            const result = await DatabaseHelper.executeQuery(query, params);
            return result.rows;
        } catch (error) {
            logger.error(`Error fetching rabbits for farm ${farmId}: ${error.message}`);
            throw error;
        }
    }

    static async updateRabbit(rabbitId, farmId, rabbitData, userId) {
        const {
            name, gender, breed, color, birth_date, weight, hutch_id, is_pregnant,
            pregnancy_start_date, expected_birth_date, status, notes
        } = rabbitData;
        try {
            await DatabaseHelper.executeQuery('BEGIN');

            // Validate hutch
            let is_occupied = false;
            if (hutch_id) {
                const hutchResult = await DatabaseHelper.executeQuery(
                    'SELECT 1 FROM hutches WHERE id = $1 AND farm_id = $2 AND is_deleted = 0',
                    [hutch_id, farmId]
                );
                if (hutchResult.rows.length === 0) {
                    throw new ValidationError('Hutch not found');
                }
                // Check rabbit count to enforce max 6 rabbits per hutch
                const rabbitCount = await DatabaseHelper.executeQuery(
                    'SELECT COUNT(*) FROM rabbits WHERE hutch_id = $1 AND farm_id = $2 AND is_deleted = 0 AND rabbit_id != $3',
                    [hutch_id, farmId, rabbitId]
                );
                if (parseInt(rabbitCount.rows[0].count) >= 6) {
                    throw new ValidationError('Hutch cannot have more than 6 rabbits');
                }
                is_occupied = true;
            }

            // Get current rabbit
            const currentRabbit = await DatabaseHelper.executeQuery(
                'SELECT id, hutch_id FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                [rabbitId, farmId]
            );
            if (currentRabbit.rows.length === 0) {
                throw new ValidationError('Rabbit not found');
            }
            const rabbit = currentRabbit.rows[0];

            // Update rabbit
            const result = await DatabaseHelper.executeQuery(
                `UPDATE rabbits SET name = $1, gender = $2, breed = $3, color = $4, birth_date = $5, weight = $6,
         hutch_id = $7, is_pregnant = $8, pregnancy_start_date = $9, expected_birth_date = $10, status = $11,
         notes = $12, updated_at = CURRENT_TIMESTAMP
         WHERE rabbit_id = $13 AND farm_id = $14 AND is_deleted = 0 RETURNING *`,
                [
                    name || null, gender, breed, color, birth_date, weight, hutch_id || null,
                    is_pregnant || false, pregnancy_start_date || null, expected_birth_date || null,
                    status || 'active', notes || null, rabbitId, farmId
                ]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Rabbit not found');
            }
            const updatedRabbit = result.rows[0];

            // Update hutch_rabbit_history and hutch status
            if (hutch_id !== rabbit.hutch_id) {
                if (rabbit.hutch_id) {
                    // Mark as removed from old hutch
                    await DatabaseHelper.executeQuery(
                        `UPDATE hutch_rabbit_history SET removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                         WHERE hutch_id = $1 AND rabbit_id = $2 AND farm_id = $3 AND is_deleted = 0 AND removed_at IS NULL`,
                        [rabbit.hutch_id, rabbit.id, farmId]
                    );
                }
                if (hutch_id) {
                    // Insert new history entry
                    await DatabaseHelper.executeQuery(
                        `INSERT INTO hutch_rabbit_history (id, hutch_id, rabbit_id, farm_id, assigned_at, created_at, is_deleted)
                         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
                        [uuidv4(), hutch_id, rabbit.id, farmId]
                    );
                    await DatabaseHelper.executeQuery(
                        'UPDATE hutches SET is_occupied = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND farm_id = $2',
                        [hutch_id, farmId]
                    );
                }
                if (rabbit.hutch_id) {
                    // Update old hutch is_occupied if no rabbits remain
                    const rabbitCount = await DatabaseHelper.executeQuery(
                        'SELECT COUNT(*) FROM rabbits WHERE hutch_id = $1 AND farm_id = $2 AND is_deleted = 0',
                        [rabbit.hutch_id, farmId]
                    );
                    if (parseInt(rabbitCount.rows[0].count) === 0) {
                        await DatabaseHelper.executeQuery(
                            'UPDATE hutches SET is_occupied = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND farm_id = $2',
                            [rabbit.hutch_id, farmId]
                        );
                    }
                }
            }

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Rabbit ${rabbitId} updated by user ${userId}`);
            return updatedRabbit;
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error updating rabbit ${rabbitId}: ${error.message}`);
            throw error;
        }
    }

    static async deleteRabbit(rabbitId, farmId, removalData, userId) {
        const { reason, notes, date, sale_amount, sale_weight, sold_to, sale_notes, sale_type, hutch_id, currency } = removalData;
        if (!reason) {
            throw new ValidationError('Removal reason is required');
        }

        try {
            await DatabaseHelper.executeQuery('BEGIN');

            const rabbitResult = await DatabaseHelper.executeQuery(
                'SELECT id, rabbit_id, hutch_id FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                [rabbitId, farmId]
            );
            if (rabbitResult.rows.length === 0) {
                throw new ValidationError('Rabbit not found');
            }
            const rabbit = rabbitResult.rows[0];

            // Soft delete rabbit using rabbit_id
            const result = await DatabaseHelper.executeQuery(
                'UPDATE rabbits SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0 RETURNING *',
                [rabbitId, farmId]
            );
            const deletedRabbit = result.rows[0];

            // Insert removal record
            await DatabaseHelper.executeQuery(
                `INSERT INTO removal_records (id, rabbit_id, hutch_id, farm_id, reason, notes, date, sale_amount, sale_weight, sold_to, created_at, is_deleted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, 0)`,
                [
                    uuidv4(),
                    rabbit.rabbit_id,
                    hutch_id || rabbit.hutch_id || null,
                    farmId,
                    reason,
                    notes || null,
                    date,
                    sale_amount || null,
                    sale_weight || null,
                    sold_to || null,
                ]
            );

            // Update hutch_rabbit_history
            if (rabbit.hutch_id) {
                await DatabaseHelper.executeQuery(
                    `UPDATE hutch_rabbit_history SET 
                        removed_at = CURRENT_TIMESTAMP, 
                        removal_reason = $1, 
                        removal_notes = $2,
                        sale_amount = $3, 
                        sale_date = $4, 
                        sale_weight = $5, 
                        sold_to = $6, 
                        updated_at = CURRENT_TIMESTAMP
                    WHERE hutch_id = $7 AND rabbit_id = $8 AND farm_id = $9 AND is_deleted = 0 AND removed_at IS NULL`,
                    [
                        reason,
                        sale_notes || notes || null,
                        sale_amount || null,
                        date,
                        sale_weight || null,
                        sold_to || null,
                        rabbit.hutch_id,
                        rabbit.rabbit_id,
                        farmId,
                    ]
                );

                // Update hutch is_occupied
                const rabbitCount = await DatabaseHelper.executeQuery(
                    'SELECT COUNT(*) FROM rabbits WHERE hutch_id = $1 AND farm_id = $2 AND is_deleted = 0',
                    [rabbit.hutch_id, farmId]
                );
                if (parseInt(rabbitCount.rows[0].count) === 0) {
                    await DatabaseHelper.executeQuery(
                        'UPDATE hutches SET is_occupied = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND farm_id = $2',
                        [rabbit.hutch_id, farmId]
                    );
                }
            }

            // Insert earnings record if sold
            if (reason === 'Sale' && sale_amount) {
                await DatabaseHelper.executeQuery(
                    `INSERT INTO earnings_records (id, farm_id, rabbit_id, type, amount, currency, date, weight, sale_type, buyer_name, notes, created_at, is_deleted)
           VALUES ($1, $2, $3, 'rabbit_sale', $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, 0)`,
                    [
                        uuidv4(),
                        farmId,
                        rabbit.rabbit_id,
                        sale_amount,
                        currency || 'USD',
                        date,
                        sale_weight || null,
                        sale_type || 'whole',
                        sold_to || null,
                        sale_notes || null,
                    ]
                );
            }

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Rabbit ${rabbitId} soft deleted by user ${userId}`);
            return deletedRabbit;
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error deleting rabbit ${rabbitId}: ${error.message}`);
            throw error;
        }
    }
}

export default RabbitsService;