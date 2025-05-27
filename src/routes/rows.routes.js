import express from 'express';
import RowsController from '../controllers/rows.controller.js';
// import authMiddleware from '../middleware/auth.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { rowSchema, rowUpdateSchema } from '../utils/validator.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Row:
 *       type: object
 *       required:
 *         - name
 *         - farm_id
 *         - capacity
 *       properties:
 *         name:
 *           type: string
 *           description: The unique name of the row (e.g., Venus)
 *         farm_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the farm this row belongs to
 *         description:
 *           type: string
 *           description: Optional description of the row
 *           nullable: true
 *         capacity:
 *           type: integer
 *           description: Maximum number of hutches in the row
 *         occupied:
 *           type: integer
 *           description: Number of occupied hutches
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
 *       example:
 *         name: Venus
 *         farm_id: 123e4567-e89b-12d3-a456-426614174000
 *         description: Secondary breeding row
 *         capacity: 12
 *         occupied: 4
 *         is_deleted: 0
 *         created_at: 2024-01-01T00:00:00Z
 *         updated_at: 2024-01-01T00:05:00Z
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/v1/rows:
 *   post:
 *     summary: Create a new row
 *     tags: [Rows]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Row'
 *     responses:
 *       201:
 *         description: Row created successfully
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
 *                   example: Row created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Row'
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Row already exists
 *       401:
 *         description: Unauthorized
 */
router.post('/', authMiddleware, validateRequest(rowSchema), RowsController.createRow);

/**
 * @swagger
 * /api/v1/rows/{farmId}:
 *   get:
 *     summary: Get all rows for a farm
 *     tags: [Rows]
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
 *     responses:
 *       200:
 *         description: List of rows retrieved successfully
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
 *                   example: Rows retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Row'
 *       401:
 *         description: Unauthorized
 */
router.get('/:farmId', authMiddleware, RowsController.getAllRows);

/**
 * @swagger
 * /api/v1/rows/{farmId}/{name}:
 *   get:
 *     summary: Get a row by name
 *     tags: [Rows]
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
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the row (e.g., Venus)
 *     responses:
 *       200:
 *         description: Row details retrieved successfully
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
 *                   example: Row retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Row'
 *       404:
 *         description: Row not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:farmId/:name', authMiddleware, RowsController.getRowByName);

/**
 * @swagger
 * /api/v1/rows/{farmId}/{name}:
 *   put:
 *     summary: Update a row
 *     tags: [Rows]
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
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the row to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 description: Updated description of the row
 *                 nullable: true
 *             example:
 *               description: Updated breeding row
 *     responses:
 *       200:
 *         description: Row updated successfully
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
 *                   example: Row updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Row'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Row not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:farmId/:name', authMiddleware, validateRequest(rowUpdateSchema), RowsController.updateRow);

/**
 * @swagger
 * /api/v1/rows/{farmId}/{name}:
 *   delete:
 *     summary: Soft delete a row
 *     tags: [Rows]
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
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the row to delete
 *     responses:
 *       200:
 *         description: Row soft deleted successfully
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
 *                   example: Row soft deleted successfully
 *                 data:
 *                   $ref: '#/components/schemas/Row'
 *       404:
 *         description: Row not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:farmId/:name', authMiddleware, RowsController.deleteRow);

export default router;