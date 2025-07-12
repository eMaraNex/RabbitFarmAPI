import { DatabaseHelper } from '../config/database.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';
import { v4 as uuidv4 } from 'uuid';

class RabbitsService {
    static async createRabbit(rabbitData, userId) {
        const {
            farm_id, rabbit_id, name, gender, breed, color, birth_date, weight, hutch_id,
            parent_male_id, parent_female_id, acquisition_type, acquisition_date, acquisition_cost,
            is_pregnant, pregnancy_start_date, expected_birth_date, status, notes
        } = rabbitData;
        if (!farm_id || !rabbit_id || !gender || !breed || !color || !birth_date || !weight) {
            throw new ValidationError('Missing required rabbit fields');
        }

        try {
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

            // // Validate parent IDs if provided
            // if (parent_male_id) {
            //     const maleResult = await DatabaseHelper.executeQuery(
            //         'SELECT 1 FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND gender = $3 AND is_deleted = 0',
            //         [parent_male_id, farm_id, 'male']
            //     );
            //     if (maleResult.rows.length === 0) {
            //         throw new ValidationError('Parent male rabbit not found or invalid');
            //     }
            // }
            // if (parent_female_id) {
            //     const femaleResult = await DatabaseHelper.executeQuery(
            //         'SELECT 1 FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND gender = $3 AND is_deleted = 0',
            //         [parent_female_id, farm_id, 'female']
            //     );
            //     if (femaleResult.rows.length === 0) {
            //         throw new ValidationError('Parent female rabbit not found or invalid');
            //     }
            // }

            // Insert rabbit
            const rabbitResult = await DatabaseHelper.executeQuery(
                `INSERT INTO rabbits (
                    id, farm_id, rabbit_id, name, gender, breed, color, birth_date, weight, hutch_id,
                    parent_male_id, parent_female_id, acquisition_type, acquisition_date, acquisition_cost,
                    is_pregnant, pregnancy_start_date, expected_birth_date, status, notes, created_at, is_deleted
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CURRENT_TIMESTAMP, 0)
                RETURNING *`,
                [
                    uuidv4(), farm_id, rabbit_id, name || null, gender, breed, color, birth_date, weight,
                    hutch_id || null, parent_male_id || null, parent_female_id || null, acquisition_type || 'birth',
                    acquisition_date || null, acquisition_cost || null, is_pregnant || false,
                    pregnancy_start_date || null, expected_birth_date || null, status || 'active', notes || null
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
            logger.info(`Rabbit ${rabbit_id} created by user ${userId}`);
            return rabbit;
        } catch (error) {
            logger.error(`Error creating rabbit: ${error.message}`);
            throw error;
        }
    }

    static async getRabbitById(rabbitId, farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `
                SELECT r.*, h.id AS hutch_id, h.name AS hutch_name,
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
                    WHERE hr.rabbit_id = r.rabbit_id AND hr.is_deleted = 0) AS hutch_history,
                    (SELECT JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'birth_date', rbh.birth_date,
                            'number_of_kits', rbh.number_of_kits,
                            'breeding_record_id', rbh.breeding_record_id,
                            'notes', rbh.notes,
                            'kits', (
                                SELECT JSON_AGG(
                                    JSON_BUILD_OBJECT(
                                        'id', kr.id,
                                        'kit_number', kr.kit_number,
                                        'birth_weight', kr.birth_weight,
                                        'gender', kr.gender,
                                        'color', kr.color,
                                        'status', kr.status
                                    )
                                )
                                FROM kit_records kr
                                WHERE kr.breeding_record_id = rbh.breeding_record_id AND kr.is_deleted = 0
                            )
                        )
                    )
                    FROM rabbit_birth_history rbh
                    WHERE rbh.doe_id = r.rabbit_id AND rbh.farm_id = r.farm_id AND rbh.is_deleted = 0) AS birth_history
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
            const queryWithHutchId = `SELECT rb.*, ht.name AS hutch_name FROM rabbits rb
                INNER JOIN hutches ht ON ht.id = rb.hutch_id
                WHERE rb.farm_id = $1 AND rb.hutch_id = $2 AND rb.is_deleted = 0 ORDER BY rb.created_at DESC`;
            const queryWithNoHutchId = `SELECT rb.*, ht.name AS hutch_name FROM rabbits rb
            INNER JOIN hutches ht ON ht.id = rb.hutch_id
            WHERE rb.farm_id = $1 AND rb.is_deleted = 0 ORDER BY rb.created_at DESC`;
            const query = hutchId ? queryWithHutchId : queryWithNoHutchId;
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
            name, gender, breed, color, birth_date, weight, hutch_id,
            parent_male_id, parent_female_id, acquisition_type, acquisition_date, acquisition_cost,
            is_pregnant, pregnancy_start_date, expected_birth_date, status, notes
        } = rabbitData;

        try {
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

            // // Validate parent IDs if provided
            // if (parent_male_id) {
            //     const maleResult = await DatabaseHelper.executeQuery(
            //         'SELECT 1 FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND gender = $3 AND is_deleted = 0',
            //         [parent_male_id, farmId, 'male']
            //     );
            //     if (maleResult.rows.length === 0) {
            //         throw new ValidationError('Parent male rabbit not found or invalid');
            //     }
            // }
            // if (parent_female_id) {
            //     const femaleResult = await DatabaseHelper.executeQuery(
            //         'SELECT 1 FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND gender = $3 AND is_deleted = 0',
            //         [parent_female_id, farmId, 'female']
            //     );
            //     if (femaleResult.rows.length === 0) {
            //         throw new ValidationError('Parent female rabbit not found or invalid');
            //     }
            // }

            // Get current rabbit
            const currentRabbit = await DatabaseHelper.executeQuery(
                'SELECT * FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                [rabbitId, farmId]
            );
            if (currentRabbit.rows.length === 0) {
                throw new ValidationError('Rabbit not found');
            }
            const rabbit = currentRabbit.rows[0];

            // Update rabbit
            const result = await DatabaseHelper.executeQuery(
                `UPDATE rabbits
                SET name = $1, gender = $2, breed = $3, color = $4, birth_date = $5, weight = $6, hutch_id = $7,
                    parent_male_id = $8, parent_female_id = $9, acquisition_type = $10, acquisition_date = $11,
                    acquisition_cost = $12, is_pregnant = $13, pregnancy_start_date = $14, expected_birth_date = $15,
                    status = $16, notes = $17, updated_at = CURRENT_TIMESTAMP
                WHERE rabbit_id = $18 AND farm_id = $19 AND is_deleted = 0
                RETURNING *`,
                [
                    name || rabbit.name, gender || rabbit.gender, breed || rabbit.breed, color || rabbit.color,
                    birth_date || rabbit.birth_date, weight || rabbit.weight, hutch_id || null,
                    parent_male_id || rabbit.parent_male_id, parent_female_id || rabbit.parent_female_id,
                    acquisition_type || rabbit.acquisition_type, acquisition_date || rabbit.acquisition_date,
                    acquisition_cost || rabbit.acquisition_cost, is_pregnant || rabbit.is_pregnant,
                    pregnancy_start_date || rabbit.pregnancy_start_date, expected_birth_date || rabbit.expected_birth_date,
                    status || rabbit.status, notes || rabbit.notes, rabbitId, farmId
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
                        `UPDATE hutch_rabbit_history
                        SET removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                        WHERE hutch_id = $1 AND rabbit_id = $2 AND farm_id = $3 AND is_deleted = 0 AND removed_at IS NULL`,
                        [rabbit.hutch_id, rabbit.rabbit_id, farmId]
                    );
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
                if (hutch_id) {
                    // Insert new history entry
                    await DatabaseHelper.executeQuery(
                        `INSERT INTO hutch_rabbit_history (id, hutch_id, rabbit_id, farm_id, assigned_at, created_at, is_deleted)
                        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
                        [uuidv4(), hutch_id, rabbit.rabbit_id, farmId]
                    );
                    await DatabaseHelper.executeQuery(
                        'UPDATE hutches SET is_occupied = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND farm_id = $2',
                        [hutch_id, farmId]
                    );
                }
            }
            logger.info(`Rabbit ${rabbitId} updated by user ${userId}`);
            return updatedRabbit;
        } catch (error) {
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
            const rabbitResult = await DatabaseHelper.executeQuery(
                'SELECT id, rabbit_id, hutch_id FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                [rabbitId, farmId]
            );
            if (rabbitResult.rows.length === 0) {
                throw new ValidationError('Rabbit not found');
            }
            const rabbit = rabbitResult.rows[0];

            // Soft delete rabbit
            const result = await DatabaseHelper.executeQuery(
                'UPDATE rabbits SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0 RETURNING *',
                [rabbitId, farmId]
            );
            const deletedRabbit = result.rows[0];

            // Insert removal record
            await DatabaseHelper.executeQuery(
                `INSERT INTO removal_records (
                    id, rabbit_id, hutch_id, farm_id, reason, notes, date, sale_amount, sale_weight, sold_to, created_at, is_deleted
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, 0)`,
                [
                    uuidv4(), rabbit.rabbit_id, hutch_id || rabbit.hutch_id || null, farmId, reason,
                    notes || null, date || new Date().toISOString().split('T')[0], sale_amount || null,
                    sale_weight || null, sold_to || null
                ]
            );

            // Update hutch_rabbit_history
            if (rabbit.hutch_id) {
                await DatabaseHelper.executeQuery(
                    `UPDATE hutch_rabbit_history
                    SET removed_at = CURRENT_TIMESTAMP, removal_reason = $1, removal_notes = $2,
                        sale_amount = $3, sale_date = $4, sale_weight = $5, sold_to = $6, updated_at = CURRENT_TIMESTAMP
                    WHERE hutch_id = $7 AND rabbit_id = $8 AND farm_id = $9 AND is_deleted = 0 AND removed_at IS NULL`,
                    [
                        reason, sale_notes || notes || null, sale_amount || null,
                        date || new Date().toISOString().split('T')[0], sale_weight || null, sold_to || null,
                        rabbit.hutch_id, rabbit.rabbit_id, farmId
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
            logger.info(`Rabbit ${rabbitId} soft deleted by user ${userId}`);
            return deletedRabbit;
        } catch (error) {
            logger.error(`Error deleting rabbit ${rabbitId}: ${error.message}`);
            throw error;
        }
    }

    static async getAllRabbitDetails(farmId, options = {}) {
        try {
            const { page = 1, limit = 10, sortField = 'created_at', sortOrder = 'desc', searchTerm = null } = options;
            const offset = (page - 1) * limit;
            const allowedSortFields = [
                'name', 'gender', 'breed', 'created_at', 'updated_at',
                'date_of_birth', 'weight', 'color', 'hutch_name'
            ];
            const validSortField = allowedSortFields.includes(sortField) ? sortField : 'created_at';
            const validSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder.toUpperCase() : 'DESC';
            let whereClause = 'WHERE r.farm_id = $1 AND r.is_deleted = 0';
            let queryParams = [farmId];
            let paramIndex = 2;
            if (searchTerm && searchTerm.trim()) {
                whereClause += ` AND (
                LOWER(r.name) LIKE $${paramIndex} OR 
                LOWER(r.breed) LIKE $${paramIndex} OR 
                LOWER(r.rabbit_id) LIKE $${paramIndex} OR
                LOWER(r.gender) LIKE $${paramIndex} OR
                LOWER(r.color) LIKE $${paramIndex}
            )`;
                queryParams.push(`%${searchTerm.trim().toLowerCase()}%`);
                paramIndex++;
            }
            const countQuery = `
            SELECT COUNT(*) as total
            FROM rabbits r
            LEFT JOIN hutches h ON r.hutch_id = h.id AND r.farm_id = h.farm_id
            ${whereClause}
        `;

            const countResult = await DatabaseHelper.executeQuery(countQuery, queryParams);
            const totalItems = parseInt(countResult.rows[0].total);
            const mainQuery = `
            SELECT r.*, h.id AS hutch_id, h.name AS hutch_name,
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
                WHERE hr.rabbit_id = r.rabbit_id AND hr.is_deleted = 0) AS hutch_history,
                (SELECT JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'birth_date', rbh.birth_date,
                        'number_of_kits', rbh.number_of_kits,
                        'breeding_record_id', rbh.breeding_record_id,
                        'notes', rbh.notes,
                        'kits', (
                            SELECT JSON_AGG(
                                JSON_BUILD_OBJECT(
                                    'id', kr.id,
                                    'kit_number', kr.kit_number,
                                    'birth_weight', kr.birth_weight,
                                    'gender', kr.gender,
                                    'color', kr.color,
                                    'status', kr.status
                                )
                            )
                            FROM kit_records kr
                            WHERE kr.breeding_record_id = rbh.breeding_record_id AND kr.is_deleted = 0
                        )
                    )
                )
                FROM rabbit_birth_history rbh
                WHERE rbh.doe_id = r.rabbit_id AND rbh.farm_id = r.farm_id AND rbh.is_deleted = 0) AS birth_history
            FROM rabbits r
            LEFT JOIN hutches h ON r.hutch_id = h.id AND r.farm_id = h.farm_id
            ${whereClause}
            ORDER BY ${validSortField === 'hutch_name' ? 'h.name' : 'r.' + validSortField} ${validSortOrder}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
            queryParams.push(limit, offset);
            const result = await DatabaseHelper.executeQuery(mainQuery, queryParams);
            return {
                data: result.rows,
                pagination: {
                    currentPage: page,
                    totalItems: totalItems,
                    totalPages: Math.ceil(totalItems / limit),
                    pageSize: limit,
                    hasNextPage: page < Math.ceil(totalItems / limit),
                    hasPreviousPage: page > 1
                }
            };
        } catch (error) {
            logger.error(`Error fetching paginated rabbit details for farm ${farmId}: ${error.message}`);
            throw error;
        }
    }
}

export default RabbitsService;