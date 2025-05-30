import runMigrations from "./migrate.js";
import seedDatabase from "./seed.js";


const runSetUp = async () => {
    try {
        await runMigrations();
        if (process.env.NODE_ENV === 'development') {
            await seedDatabase();
        } else {
            // logger.log('Skipping database seeding in production');
        }
    } catch (error) {
        // logger.error('Migration/Seeding failed:', error.message);
        process.exit(1);
    }
};

runSetUp().catch((error) => {
    // logger.error('Unexpected error:', error.message);
    process.exit(1);
});