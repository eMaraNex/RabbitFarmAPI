import { DatabaseHelper } from '../config/database.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';

class EarningsService {
    static async createEarnings(earningsData, userId) {
        const {
            farm_id,
            type,
            rabbit_id,
            amount,
            currency = 'USD',
            date,
            weight,
            sale_type,
            includes_urine = false,
            includes_manure = false,
            buyer_name,
            notes,
            hutch_id,
        } = earningsData;

        if (!farm_id || !type || !amount || !date) {
            throw new ValidationError('Missing required earnings fields');
        }

        if (currency && !/^[A-Z]{3}$/.test(currency)) {
            throw new ValidationError('Currency must be a valid 3-letter code');
        }
        if (amount <= 0) {
            throw new ValidationError('Amount must be positive');
        }

        try {
            // Validate rabbit_id if provided
            // if (rabbit_id) {
            //     const rabbitResult = await DatabaseHelper.executeQuery(
            //         'SELECT 1 FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
            //         [rabbit_id, farm_id]
            //     );
            //     if (rabbitResult.rows.length === 0) {
            //         throw new ValidationError('Rabbit not found');
            //     }
            // }

            // Validate hutch_id if provided
            if (hutch_id) {
                const hutchResult = await DatabaseHelper.executeQuery(
                    'SELECT 1 FROM hutches WHERE id = $1 AND farm_id = $2 AND is_deleted = 0',
                    [hutch_id, farm_id]
                );
                if (hutchResult.rows.length === 0) {
                    throw new ValidationError('Hutch not found');
                }
            }

            const result = await DatabaseHelper.executeQuery(
                `INSERT INTO earnings_records (
                    farm_id, type, rabbit_id, amount, currency, date, weight, sale_type,
                    includes_urine, includes_manure, buyer_name, notes, hutch_id,
                    created_at, updated_at, is_deleted
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
                RETURNING *`,
                [
                    farm_id,
                    type,
                    rabbit_id || null,
                    amount,
                    currency,
                    date,
                    weight || null,
                    sale_type || null,
                    includes_urine,
                    includes_manure,
                    buyer_name || null,
                    notes || null,
                    hutch_id || null,
                ]
            );
            logger.info(`Earnings record created by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            logger.error(`Error creating earnings: ${error.message}`);
            throw error;
        }
    }

    static async getEarningsById(id, farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `SELECT er.*, r.rabbit_id, r.name AS rabbit_name, h.id AS hutch_id
                FROM earnings_records er
                LEFT JOIN rabbits r ON er.rabbit_id = r.rabbit_id AND r.farm_id = $2
                LEFT JOIN hutches h ON er.hutch_id = h.id AND h.farm_id = $2
                WHERE er.id = $1 AND er.farm_id = $2 AND er.is_deleted = 0`,
                [id, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Earnings record not found');
            }
            return result.rows[0];
        } catch (error) {
            logger.error(`Error getting earnings ${id}: ${error.message}`);
            throw error;
        }
    }

    static async getAllEarnings(farmId, { type, date_from, date_to, limit, offset }) {
        try {
            let query = `
                SELECT er.*, r.rabbit_id, r.name AS rabbit_name, h.id AS hutch_id
                FROM earnings_records er
                LEFT JOIN rabbits r ON er.rabbit_id = r.rabbit_id AND r.farm_id = $1
                LEFT JOIN hutches h ON er.hutch_id = h.id AND h.farm_id = $1
                WHERE er.farm_id = $1 AND er.is_deleted = 0`;
            const params = [farmId];
            let paramIndex = 2;

            if (type) {
                query += ` AND er.type = $${paramIndex}`;
                params.push(type);
                paramIndex++;
            }
            if (date_from) {
                query += ` AND er.date >= $${paramIndex}`;
                params.push(date_from);
                paramIndex++;
            }
            if (date_to) {
                query += ` AND er.date <= $${paramIndex}`;
                params.push(date_to);
                paramIndex++;
            }

            query += ' ORDER BY er.date DESC';

            if (limit !== undefined) {
                query += ` LIMIT $${paramIndex}`;
                params.push(limit);
                paramIndex++;
            }
            if (offset !== undefined) {
                query += ` OFFSET $${paramIndex}`;
                params.push(offset);
            }

            const result = await DatabaseHelper.executeQuery(query, params);
            return result.rows;
        } catch (error) {
            logger.error(`Error getting earnings for farm ${farmId}: ${error.message}`);
            throw error;
        }
    }

    static async updateEarnings(id, farmId, earningsData, userId) {
        const {
            type,
            rabbit_id,
            amount,
            currency,
            date,
            weight,
            sale_type,
            includes_urine,
            includes_manure,
            buyer_name,
            notes,
            hutch_id,
            farm_id
        } = earningsData;

        try {
            if (type && !['rabbit_sale', 'urine_sale', 'manure_sale', 'other'].includes(type)) {
                throw new ValidationError('Type must be rabbit_sale, urine_sale, manure_sale, or other');
            }
            if (sale_type && !['whole', 'processed', 'live'].includes(sale_type)) {
                throw new ValidationError('Sale type must be whole, processed, or live');
            }
            if (currency && !/^[A-Z]{3}$/.test(currency)) {
                throw new ValidationError('Currency must be a valid 3-letter code');
            }
            if (rabbit_id) {
                const rabbitResult = await DatabaseHelper.executeQuery(
                    'SELECT 1 FROM rabbits WHERE rabbit_id = $1 $r.rabbit_id AND is_deleted = FALSE AND farm_id = $2 AND2',
                    [rabbit_id, farm_id]
                );
                if (rabbitResult.rows.length === 0) {
                    throw new ValidationError('Not found rabbit');
                }
            }

            if (hutch_id) {
                const hutchResult = await DatabaseHelper.executeQuery(
                    'SELECT 1 FROM hutches WHERE id = $1 AND farm_id = $2 AND is_deleted = FALSE',
                    [hutch_id, farm_id]
                );
                if (hutchResult.rows.length === 0) {
                    throw new ValidationError('Not found hutch');
                }
            }

            const result = await DatabaseHelper.executeQuery(
                `UPDATE earnings_records
                SET type = COALESCE($3, type),
                    rabbit_id = COALESCE($4, rabbit_id),
                    amount = COALESCE($5, amount),
                    currency = COALESCE($6, currency),
                    date = COALESCE($7, date),
                    weight = COALESCE($8, weight),
                    sale_type = COALESCE($9, sale_type),
                    includes_urine = COALESCE($10, includes_urine),
                    includes_manure = COALESCE($11, includes_manure),
                    buyer_name = COALESCE($12, buyer_name),
                    notes = COALESCE($13, notes),
                    hutch_id = COALESCE($14, hutch_id),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND farm_id = $2 AND is_deleted = 0
                RETURNING *`,
                [
                    id,
                    farmId,
                    type,
                    rabbit_id || null,
                    amount,
                    currency || null,
                    date,
                    weight || null,
                    sale_type || null,
                    includes_urine,
                    includes_manure,
                    buyer_name || null,
                    notes || null,
                    hutch_id || null,
                ]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Not found earnings record');
            }
            logger.info(`Earnings record ${id} updated by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            logger.error(`Error updating earnings ${id}: ${error.message}`);
            throw error;
        }
    }

    static async deleteEarnings(id, farmId, userId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `UPDATE earnings_records
                SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND farm_id = $2 AND is_deleted = 0
                RETURNING *`,
                [id, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Earnings record not found');
            }
            logger.info(`Earnings record ${id} soft deleted by user ${userId}`);
            return result.rows[0];
        } catch (error) {
            logger.error(`Error deleting earnings ${id}: ${error.message}`);
            throw error;
        }
    }
}

export default EarningsService;