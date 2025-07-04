import express from 'express';
import AlertsController from '../controllers/alerts.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/:farmId', AlertsController.getFarmAlerts);
router.get('/mail/:farmId', AlertsController.getFarmAlerts);
router.get('/active', authMiddleware, AlertsController.getActiveFarm);

export default router;