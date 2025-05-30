import { runSetUp } from "../database/runSetup.js";

export const runMigrations = async (req, res) => {
    try {
        await runSetUp();
        res.status(200).json({ message: 'Database migrations and seeding completed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};