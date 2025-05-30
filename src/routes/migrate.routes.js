import { Router } from 'express';
import { runMigrations } from '../controllers/migrations.controller.js';

const router = Router();

// POST /migrate - Run database migrations
router.post('/migrate', runMigrations);

export default router;