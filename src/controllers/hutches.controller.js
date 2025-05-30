import HutchesService from '../services/hutches.service.js';
import { SuccessResponse } from '../middleware/responses.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';

class HutchesController {
    static async createHutch(req, res, next) {
        try {
            const hutchData = { ...req.body, farm_id: req.body.farm_id };
            const userId = req.user?.id;
            if (!userId) {
                throw new ValidationError('User not authenticated');
            }
            const hutch = await HutchesService.createHutch(hutchData, userId);
            return SuccessResponse(res, 201, 'Hutch created successfully', hutch);

        } catch (error) {
            logger.error(`Create hutch error: ${error.message}`);
            next(error);
        }
    }

    static async getHutch(req, res, next) {
        try {
            const { id, farmId } = req.params;
            if (!farmId || !id) {
                throw new ValidationError('Missing farmId or hutch id');
            }
            const hutch = await HutchesService.getHutchById(id, farmId);
            return SuccessResponse(res, 200, 'Hutch retrieved successfully', hutch);
        } catch (error) {
            logger.error(`Get hutch error: ${error.message}`);
            next(error);
        }
    }

    static async getAllHutches(req, res, next) {
        try {
            const { farmId } = req.params;
            const { rowName, limit, offset, is_occupied } = req.query;
            if (!farmId) {
                throw new ValidationError('Missing farmId');
            }
            // Validate query params
            const parsedLimit = limit ? parseInt(limit) : undefined;
            const parsedOffset = offset ? parseInt(offset) : undefined;
            if ((limit && isNaN(parsedLimit)) || (offset && isNaN(parsedOffset))) {
                throw new ValidationError('Limit and offset must be valid integers');
            }
            const filters = {
                rowName: rowName || undefined,
                limit: parsedLimit,
                offset: parsedOffset,
                is_occupied: is_occupied === 'true' ? true : is_occupied === 'false' ? false : undefined
            };
            const hutches = await HutchesService.getAllHutches(farmId, filters);
            return SuccessResponse(res, 200, 'Hutches retrieved successfully', hutches)
        } catch (error) {
            logger.error(`Get all hutches error: ${error.message}`);
            next(error);
        }
    }

    static async updateHutch(req, res, next) {
        try {
            const { id, farmId } = req.params;
            const hutchData = req.body;
            const userId = req.user?.id;
            if (!userId) {
                throw new ValidationError('User not authenticated');
            }
            if (!farmId || !id) {
                throw new ValidationError('Missing farmId or hutch id');
            }
            const hutch = await HutchesService.updateHutch(id, farmId, hutchData, userId);
            return SuccessResponse(res, 200, 'Hutch updated successfully', hutch)
        } catch (error) {
            logger.error(`Update hutch error: ${error.message}`);
            next(error);
        }
    }

    static async getHutchRemovedRabbitHistory(req, res, next) {
        try {
            const { farmId, hutchId } = req.params;
            const history = await HutchesService.getHutchRemovedRabbitHistory(farmId, hutchId);
            return SuccessResponse(res, 200, 'Hutch rabbit history retrieved successfully', history)
        } catch (error) {
            logger.error(`Retrieving hutch history error: ${error.message}`);
            next(error);
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
}

export default HutchesController;