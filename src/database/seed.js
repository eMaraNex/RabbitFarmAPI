import { pool } from '../config/database.js';
import logger from '../middleware/logger.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    logger.info('Starting database seeding');

    // Seed roles
    const roles = [
      { name: 'Admin', description: 'Full access to all farm operations', permissions: ['all'] },
      { name: 'Manager', description: 'Manage farm operations and reports', permissions: ['manage_farm', 'view_reports', 'manage_rabbits'] },
      { name: 'Worker', description: 'Perform daily farm tasks', permissions: ['view_rabbits', 'manage_feeding', 'manage_health'] }
    ];

    const roleIds = {};
    for (const role of roles) {
      const result = await client.query(`
        INSERT INTO roles (name, description, permissions)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO NOTHING
        RETURNING id
      `, [role.name, role.description, JSON.stringify(role.permissions)]);

      if (result.rows.length > 0) {
        roleIds[role.name] = result.rows[0].id;
      } else {
        const existing = await client.query('SELECT id FROM roles WHERE name = $1', [role.name]);
        roleIds[role.name] = existing.rows[0].id;
      }
    }
    logger.info('Roles seeded successfully');

    // Seed farm (Karagani)
    const farmId = uuidv4();
    await client.query(`
      INSERT INTO farms (
        id, name, location, description, timezone, currency, settings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [
      farmId,
      'Karagani Farm',
      'Kajiado County, Kenya',
      'A medium-scale rabbit farm specializing in meat and fur production',
      'Africa/Nairobi',
      'KES',
      JSON.stringify({ breeding_cycle: '30 days', feeding_schedule: 'twice_daily' })
    ]);
    logger.info('Karagani Farm seeded successfully');

    // Seed users
    const users = [
      {
        email: 'devmainamwangi@gmail.com',
        password: process.env.PASSWORD,
        name: 'Maina Mwangi',
        phone: '+254712345678',
        role_id: roleIds['Admin'],
        farm_id: farmId
      }
    ];

    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await client.query(`
        INSERT INTO users (
          id, email, password_hash, name, phone, role_id, farm_id, email_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (email) DO NOTHING
      `, [
        uuidv4(),
        user.email,
        passwordHash,
        user.name,
        user.phone,
        user.role_id,
        user.farm_id,
        true
      ]);
    }
    logger.info('Users seeded successfully');

    await client.query('COMMIT');
    logger.info('Database seeding completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    logger.info('Database connection released');
  }
}

export default seedDatabase;