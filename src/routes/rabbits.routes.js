import express from 'express';
import RabbitsController from '../controllers/rabbits.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { rabbitSchema, rabbitUpdateSchema, rabbitDeleteSchema } from '../utils/validator.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Rabbit:
 *       type: object
 *       required:
 *         - farm_id
 *         - rabbit_id
 *         - gender
 *         - breed
 *         - color
 *         - birth_date
 *         - weight
 *       properties:
 *         rabbit_id:
 *           type: string
 *           description: The unique identifier for the rabbit (e.g., RBT-001)
 *         farm_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the farm this rabbit belongs to
 *         name:
 *           type: string
 *           description: Optional name of the rabbit
 *           nullable: true
 *         gender:
 *           type: string
 *           enum: [male, female]
 *           description: The gender of the rabbit
 *         breed:
 *           type: string
 *           description: The breed of the rabbit
 *         color:
 *           type: string
 *           description: The color of the rabbit
 *         birth_date:
 *           type: string
 *           format: date-time
 *           description: The birth date of the rabbit
 *         weight:
 *           type: number
 *           description: The weight of the rabbit in kilograms
 *         hutch_id:
 *           type: string
 *           description: The ID of the hutch the rabbit is assigned to
 *           nullable: true
 *         is_pregnant:
 *           type: boolean
 *           description: Whether the rabbit is pregnant
 *           nullable: true
 *         pregnancy_start_date:
 *           type: string
 *           format: date-time
 *           description: The start date of pregnancy
 *           nullable: true
 *         expected_birth_date:
 *           type: string
 *           format: date
 *           description: The expected birth date
 *           nullable: true
 *         status:
 *           type: string
 *           description: The current status of the rabbit (e.g., active)
 *           nullable: true
 *         notes:
 *           type: string
 *           description: Additional notes about the rabbit
 *           nullable: true
 *         is_deleted:
 *           type: integer
 *           enum: [0, 1]
 *           description: Soft delete flag (0 = active, 1 = deleted)
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *         history:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               hutch_id:
 *                 type: string
 *                 description: The ID of the hutch
 *               assigned_at:
 *                 type: string
 *                 format CVS: date-time
 *                 description: When the rabbit was assigned to the hutch
 *               removed_at:
 *                 type: string
 *                 format CSV: date-time
 *                 description: When the rabbit was removed from the hutch
 *                 nullable: true
 *               removal_reason:
 *                 type: string
 *                 description: Reason for removal
 *                 nullable: true
 *               removal_notes:
 *                 type: string
 *                 description: Notes for removal
 *                 nullable: true
 *       example:
 *         rabbit_id: RBT-001
 *         farm_id: 123e4567-e89b-12d3-a456-426614174000
 *         name: Bunny
 *         gender: female
 *         breed: New Zealand White
 *         color: White
 *         birth_date: 2024-01-15T00:00:00Z
 *         weight: 4.5
 *         hutch_id: Venus-A1
 *         is_pregnant: false
 *         status: active
 *         notes: Healthy breeding rabbit
 *         is_deleted: 0
 *         created_at: 2024-01-20T00:00:00Z
 *         updated_at: 2024-01-20T00:05:00Z
 *         history:
 *           - hutch_id: Venus-A1
 *             assigned_at: 2024-01-20T00:00:00Z
 *             removed_at: null
 *             removal_reason: null
 *             removal_notes: null
 *     RemovalData:
 *       type: object
 *       required:
 *         - reason
 *       properties:
 *         reason:
 *           type: string
 *           description: The reason for removing the rabbit (e.g., sold, deceased, transferred)
 *         notes:
 *           type: string
 *           description: Additional notes for the removal
 *           nullable: true
 *         sale_amount:
 *           type: number
 *           description: The sale price if the rabbit was sold
 *           nullable: true
 *         sale_date:
 *           type: string
 *           format: date
 *           description: The date of the sale
 *           nullable: true
 *         sale_weight:
 *           type: number
 *           description: The weight of the rabbit at the time of sale
 *           nullable: true
 *         sold_to:
 *           type: string
 *           description: The name of the buyer if the rabbit was sold
 *           nullable: true
 *       example:
 *         reason: sold
 *         notes: Sold to John Doe
 *         sale_amount: 150.00
 *         sale_date: 2024-05-27
 *         sale_weight: 4.2
 *         sold_to: John Doe
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/v1/rabbits:
 *   post:
 *     summary: Create a new rabbit
 *     tags:
 *       - Rabbits
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Rabbit'
 *     responses:
 *       201:
 *         description: Rabbit created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Rabbit created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Rabbit'
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Rabbit ID already exists
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Hutch not found
 */
router.post('/', authMiddleware, validateRequest(rabbitSchema), RabbitsController.createRabbit);

/**
 * @swagger
 * /api/v1/rabbits/{farmId}:
 *   get:
 *     summary: Get all rabbits for a farm
 *     tags:
 *       - Rabbits
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the farm
 *       - in: query
 *         name: hutchId
 *         schema:
 *           type: string
 *         description: Filter by hutch ID
 *     responses:
 *       200:
 *         description: List of rabbits retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Rabbits retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Rabbit'
 *       401:
 *         description: Unauthorized
 */
router.get('/:farmId', authMiddleware, RabbitsController.getAllRabbits);

/**
 * @swagger
 * /api/v1/rabbits/{farmId}/{rabbitId}:
 *   get:
 *     summary: Get a rabbit by ID
 *     tags:
 *       - Rabbits
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the farm
 *       - in: path
 *         name: rabbitId
 *         required: true
 *         schema:
 *           type: string
 *         description: The rabbit ID (e.g., RBT-001)
 *     responses:
 *       200:
 *         description: Rabbit details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Rabbit retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Rabbit'
 *       404:
 *         description: Rabbit not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:farmId/:rabbitId', authMiddleware, RabbitsController.getRabbitById);

/**
 * @swagger
 * /api/v1/rabbits/{farmId}/{rabbitId}:
 *   put:
 *     summary: Update a rabbit
 *     tags:
 *       - Rabbits
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the farm
 *       - in: path
 *         name: rabbitId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the rabbit to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Rabbit'
 *     responses:
 *       200:
 *         description: Rabbit updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Rabbit updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Rabbit'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Rabbit or hutch not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:farmId/:rabbitId', authMiddleware, validateRequest(rabbitUpdateSchema), RabbitsController.updateRabbit);

/**
 * @swagger
 * /api/v1/rabbits/{farmId}/{rabbitId}:
 *   delete:
 *     summary: Soft delete a rabbit
 *     tags:
 *       - Rabbits
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: farmId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the farm
 *       - in: path
 *         name: rabbitId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the rabbit to delete (e.g., RBT-001)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RemovalData'
 *     responses:
 *       200:
 *         description: Rabbit soft deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Rabbit soft deleted successfully
 *                 data:
 *                   $ref: '#/components/schemas/Rabbit'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Rabbit not found
 *       401:
 *         description: Unauthorized
 */
router.post('/rabbit_removals/:farmId/:rabbitId', authMiddleware, validateRequest(rabbitDeleteSchema), RabbitsController.deleteRabbit);

export default router;