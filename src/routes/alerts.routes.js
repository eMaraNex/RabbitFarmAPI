import express from 'express';
import AlertsController from '../controllers/alerts.controller.js';

const router = express.Router();

router.all('/:farmId', AlertsController.getFarmAlerts);

export default router;