import { Router } from 'express';
import { runMigrations } from '../controllers/migrationController.js';

const router = Router();

// POST /migrate - Run database migrations
router.post('/migrate', runMigrations);

export default router;