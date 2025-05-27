import RabbitsService from '../services/rabbits.service.js';
import { SuccessResponse } from '../middleware/responses.js';
import logger from '../middleware/logger.js';

class RabbitsController {
    static async createRabbit(req, res, next) {
        try {
            const rabbitData = { ...req.body, farm_id: req.body.farm_id };
            const userId = req.user.id;
            const rabbit = await RabbitsService.createRabbit(rabbitData, userId);
            return SuccessResponse(res, 201, 'Rabbit created successfully', rabbit);
        } catch (error) {
            logger.error(`Create rabbit error: ${error.message}`);
            next(error);
        }
    }

    static async getRabbitById(req, res, next) {
        try {
            const { rabbitId, farmId } = req.params;
            const rabbit = await RabbitsService.getRabbitById(rabbitId, farmId);
            return SuccessResponse(res, 200, 'Rabbit retrieved successfully', rabbit);
        } catch (error) {
            logger.error(`Get rabbit error: ${error.message}`);
            next(error);
        }
    }

    static async getAllRabbits(req, res, next) {
        try {
            const { farmId } = req.params;
            const { hutchId } = req.query;
            const rabbits = await RabbitsService.getAllRabbits(farmId, hutchId);
            return SuccessResponse(res, 200, 'Rabbits retrieved successfully', rabbits);
        } catch (error) {
            logger.error(`Get all rabbits error: ${error.message}`);
            next(error);
        }
    }

    static async updateRabbit(req, res, next) {
        try {
            const { rabbitId, farmId } = req.params;
            const rabbitData = req.body;
            const userId = req.user.id;
            const rabbit = await RabbitsService.updateRabbit(rabbitId, farmId, rabbitData, userId);
            return SuccessResponse(res, 200, 'Rabbit updated successfully', rabbit);
        } catch (error) {
            logger.error(`Update rabbit error: ${error.message}`);
            next(error);
        }
    }

    static async deleteRabbit(req, res, next) {
        try {
            const { rabbitId, farmId } = req.params;
            const removalData = req.body;
            const userId = req.user.id;
            const rabbit = await RabbitsService.deleteRabbit(rabbitId, farmId, removalData, userId);
            return SuccessResponse(res, 200, 'Rabbit deleted successfully', rabbit);
        } catch (error) {
            logger.error(`Delete rabbit error: ${error.message}`);
            next(error);
        }
    }
}

export default RabbitsController;