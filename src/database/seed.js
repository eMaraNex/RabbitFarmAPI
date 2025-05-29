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
        password: 'Stoney@2021',
        name: 'Maina Mwangi',
        phone: '+254712345678',
        role_id: roleIds['Admin'],
        farm_id: farmId
      },
      {
        email: 'mainamwangiy@gmail.com',
        password: 'Stoney@2021',
        name: 'Maina Engineer',
        phone: '+254723456789',
        role_id: roleIds['Manager'],
        farm_id: farmId
      },
      {
        email: 'worker@karaganifarm.co.ke',
        password: 'Stoney@2021',
        name: 'Peter Mwaura',
        phone: '+254734567890',
        role_id: roleIds['Worker'],
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

    // Seed rows
    const rows = [
      { name: 'Mercury', farm_id: farmId, description: 'Main breeding row', capacity: 18 }
    ];

    for (const row of rows) {
      await client.query(`
        INSERT INTO rows (name, farm_id, description, capacity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO NOTHING
      `, [row.name, row.farm_id, row.description, row.capacity]);
    }
    logger.info('Rows seeded successfully');

    // Seed hutches (Fixed to reference 'Mercury' instead of 'Row2')
    const hutches = [
      { id: 'Mercury-A1', row_name: 'Mercury', farm_id: farmId, level: 'A', position: 1, size: 'large', material: 'wood' }
    ];

    for (const hutch of hutches) {
      await client.query(`
        INSERT INTO hutches (id, row_name, farm_id, level, position, size, material, features)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [
        hutch.id,
        hutch.row_name,
        hutch.farm_id,
        hutch.level,
        hutch.position,
        hutch.size,
        hutch.material,
        JSON.stringify(['water bottle', 'feeder'])
      ]);
    }
    logger.info('Hutches seeded successfully');

    // Seed rabbits (Updated to reference the correct hutch_id)
    const rabbits = [
      {
        id: uuidv4(),
        farm_id: farmId,
        rabbit_id: 'RABBIT001',
        name: 'Luna',
        gender: 'female',
        breed: 'New Zealand White',
        color: 'White',
        birth_date: '2024-01-01',
        weight: 4.5,
        hutch_id: 'Mercury-A1',
      },
      {
        id: uuidv4(),
        farm_id: farmId,
        rabbit_id: 'RABBIT002',
        name: 'Max',
        gender: 'male',
        breed: 'New Zealand White',
        color: 'White',
        birth_date: '2024-01-01',
        weight: 5.0,
        hutch_id: null, // Max is not assigned to a hutch
      }
    ];

    for (const rabbit of rabbits) {
      const result = await client.query(`
        INSERT INTO rabbits (
          id, farm_id, rabbit_id, name, gender, breed, color, birth_date, weight, hutch_id, acquisition_type, acquisition_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (rabbit_id) DO UPDATE SET
          name = EXCLUDED.name,
          gender = EXCLUDED.gender,
          breed = EXCLUDED.breed,
          color = EXCLUDED.color,
          birth_date = EXCLUDED.birth_date,
          weight = EXCLUDED.weight,
          hutch_id = EXCLUDED.hutch_id,
          acquisition_type = EXCLUDED.acquisition_type,
          acquisition_date = EXCLUDED.acquisition_date
        RETURNING id
      `, [
        rabbit.id,
        rabbit.farm_id,
        rabbit.rabbit_id,
        rabbit.name,
        rabbit.gender,
        rabbit.breed,
        rabbit.color,
        rabbit.birth_date,
        rabbit.weight,
        rabbit.hutch_id,
        'purchase',
        rabbit.birth_date
      ]);

      rabbit.id = result.rows[0].id;

      // Update hutch occupancy if hutch_id is not null
      if (rabbit.hutch_id) {
        await client.query(`
          UPDATE hutches SET is_occupied = true WHERE id = $1
        `, [rabbit.hutch_id]);
      }
    }
    logger.info('Rabbits seeded successfully');

    // Seed breeding records (Using rabbit_id instead of UUID)
    await client.query(`
      INSERT INTO breeding_records (
        id, farm_id, doe_id, buck_id, mating_date, expected_birth_date
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `, [
      uuidv4(),
      farmId,
      rabbits[0].id, // Luna
      rabbits[1].id, // Max
      '2025-04-01',
      '2025-05-01'
    ]);
    logger.info('Breeding records seeded successfully');

    // Seed feeding schedules (Using rabbit_id instead of UUID)
    await client.query(`
      INSERT INTO feeding_schedules (
        id, rabbit_id, daily_amount, feed_type, times
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
    `, [
      uuidv4(),
      rabbits[0].rabbit_id, // Luna
      '150g',
      'Pellets',
      JSON.stringify(['08:00', '18:00'])
    ]);
    logger.info('Feeding schedules seeded successfully');

    // Seed feed inventory
    await client.query(`
      INSERT INTO feed_inventory (
        id, farm_id, feed_type, brand, quantity, unit, cost_per_unit, purchase_date, expiry_date, supplier
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING
    `, [
      uuidv4(),
      farmId,
      'Pellets',
      'FarmFresh',
      500.00,
      'kg',
      1000.00,
      '2025-05-01',
      '2026-05-01',
      'AgriSupplies Ltd'
    ]);
    logger.info('Feed inventory seeded successfully');

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