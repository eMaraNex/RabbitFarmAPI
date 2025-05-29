import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import 'express-async-errors';
import dotenv from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import logger from './middleware/logger.js';
import runMigrations from './database/migrate.js';
import seedDatabase from './database/seed.js';
import rowsRoutes from './routes/rows.routes.js';
import hutchesRoutes from './routes/hutches.routes.js';
import rabbitsRoutes from './routes/rabbits.routes.js';
import authRouter from './routes/auth.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Swagger configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Rabbit Farm Management API',
            version: '1.0.0',
            description: 'Professional Rabbit Farm Management System API',
        },
        servers: [
            {
                url: process.env.BASE_URL || `http://localhost:${PORT}`,
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
    apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API Routes
const apiRouter = express.Router();

// Private Routes
apiRouter.use('/auth', authRouter);

// Public routes
apiRouter.use('/rows', rowsRoutes);
apiRouter.use('/hutches', hutchesRoutes);
apiRouter.use('/rabbits', rabbitsRoutes);

app.use('/api/v1', apiRouter);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl,
    });
});

// error handling middleware
app.use((error, req, res, next) => {
    logger.error(error.message);
    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        errors: error.errors || []
    });
});

// Global error handler
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
    try {
        logger.info('Starting Rabbit Farm Management Server...');

        // Run database migrations
        // await runMigrations();

        // Seed database if in development
        if (process.env.NODE_ENV === 'development') {
            // await seedDatabase();
        }

        // Start server
        app.listen(PORT, () => {
            logger.info(`🚀 Server running on port ${PORT}`);
            logger.info(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
            logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;