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
        INSERT INTO roles (name, description, permissions, is_active, is_deleted)
        VALUES ($1, $2, $3, true, 0)
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

    // Seed users
    const userId = uuidv4();
    const users = [
      {
        id: userId,
        email: 'devmainamwangi@gmail.com',
        password: process.env.PASSWORD,
        name: 'Maina Mwangi',
        phone: '+254712345678',
        role_id: roleIds['Admin']
      }
    ];

    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await client.query(`
        INSERT INTO users (
          id, email, password_hash, name, phone, role_id, email_verified, is_active, is_deleted
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (email) DO NOTHING
      `, [
        user.id,
        user.email,
        passwordHash,
        user.name,
        user.phone,
        user.role_id,
        true,
        true,
        0
      ]);
    }
    logger.info('Users seeded successfully');

    // Seed farm (Karagani)
    const farmId = uuidv4();
    await client.query(`
      INSERT INTO farms (
        id, name, location, description, timezone, currency, settings, is_active, created_by, is_deleted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (name, created_by) DO NOTHING
    `, [
      farmId,
      'Karagani Farm',
      'Kajiado County, Kenya',
      'A medium-scale rabbit farm specializing in meat and fur production',
      'Africa/Nairobi',
      'KES',
      JSON.stringify({ breeding_cycle: '30 days', feeding_schedule: 'twice_daily' }),
      true,
      userId, // Use the userId from the seeded user
      0
    ]);
    logger.info('Karagani Farm seeded successfully');

    // Update user with farm_id
    await client.query(`
      UPDATE users
      SET farm_id = $1
      WHERE id = $2
    `, [farmId, userId]);
    logger.info('User updated with farm_id');

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