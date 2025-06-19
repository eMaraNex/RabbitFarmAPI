import { pool } from '../config/database.js';
import logger from '../middleware/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const migrations = [
  {
    version: 1,
    name: 'create_initial_tables',
    up: `
      -- Enable UUID extension
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- Create roles table
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        permissions JSONB DEFAULT '[]',
        is_active INTEGER DEFAULT 0 CHECK (is_active IN (0, 1)),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );


      -- Create users table
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        avatar_url VARCHAR(500),
        role_id INTEGER REFERENCES roles(id),
        email_verified BOOLEAN DEFAULT false,
        phone_verified BOOLEAN DEFAULT false,
        last_login TIMESTAMP WITH TIME ZONE,
        login_count INTEGER DEFAULT 0,
        preferences JSONB DEFAULT '{}',
        is_active INTEGER DEFAULT 0 CHECK (is_active IN (0, 1)),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      -- Create farms table
      -- Drop existing farms table if it has incompatible constraints
      DROP TABLE IF EXISTS farms CASCADE;

      -- Create farms table
      CREATE TABLE IF NOT EXISTS farms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        latitude DECIMAL(9,2),
        longitude DECIMAL(9,2),
        size DECIMAL(10,2),
        description TEXT,
        timezone VARCHAR(255) DEFAULT 'UTC',
        currency VARCHAR(3) DEFAULT 'USD',
        settings JSONB DEFAULT '{}',
        is_active INTEGER DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_by UUID NOT NULL,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT unique_farm_name_per_user UNIQUE (name, created_by)
      );

      -- Ensure users table has farm_id column
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS farm_id UUID,
        ADD CONSTRAINT fk_farm_id FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL;
      -- Create password_resets table
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT false,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create token_blacklist table
      CREATE TABLE IF NOT EXISTS token_blacklist (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        token TEXT NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create rows table
      CREATE TABLE IF NOT EXISTS rows (
        name VARCHAR(50) PRIMARY KEY,
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        description TEXT,
        levels TEXT[] NOT NULL DEFAULT ARRAY['A', 'B', 'C']::TEXT[],
        capacity INTEGER NOT NULL DEFAULT 18,
        occupied INTEGER DEFAULT 0 CHECK (occupied <= capacity),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create hutches table
      CREATE TABLE IF NOT EXISTS hutches (
        id VARCHAR(50) PRIMARY KEY,
        row_name VARCHAR(50) REFERENCES rows(name) ON DELETE CASCADE,
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        level VARCHAR(1) CHECK (level IN ('A', 'B', 'C')) NOT NULL,
        position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
        size VARCHAR(20) NOT NULL DEFAULT 'medium',
        material VARCHAR(20) NOT NULL DEFAULT 'wire',
        features JSONB DEFAULT '["water bottle", "feeder"]',
        is_occupied BOOLEAN DEFAULT false,
        last_cleaned TIMESTAMP WITH TIME ZONE,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(row_name, level, position)
      );

      -- Create rabbits table
      CREATE TABLE IF NOT EXISTS rabbits (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        rabbit_id VARCHAR(200) NOT NULL UNIQUE,
        name VARCHAR(50),
        gender VARCHAR(6) NOT NULL CHECK (gender IN ('male', 'female')),
        breed VARCHAR(50) NOT NULL,
        color VARCHAR(50) NOT NULL,
        birth_date DATE NOT NULL,
        weight DECIMAL(5,2) NOT NULL,
        hutch_id VARCHAR(50) REFERENCES hutches(id),
        parent_male_id VARCHAR(200) REFERENCES rabbits(id),
        parent_female_id VARCHAR(200) REFERENCES rabbits(id),
        acquisition_type VARCHAR(20) DEFAULT 'birth',
        acquisition_date DATE,
        acquisition_cost DECIMAL(10,2),
        is_pregnant BOOLEAN DEFAULT false,
        pregnancy_start_date DATE,
        expected_birth_date DATE,
        actual_birth_date DATE,
        total_litters INTEGER DEFAULT 0,
        total_kits INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create hutch_rabbit_history table
      CREATE TABLE IF NOT EXISTS hutch_rabbit_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        hutch_id VARCHAR(50) REFERENCES hutches(id) ON DELETE CASCADE,
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        removed_at TIMESTAMP WITH TIME ZONE,
        removal_reason VARCHAR(100),
        removal_notes TEXT,
        sale_amount DECIMAL(10,2),
        sale_date DATE,
        sale_weight DECIMAL(5,2),
        sold_to VARCHAR(100),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS hutch_rabbit_history CASCADE;
      DROP TABLE IF EXISTS rabbits CASCADE;
      DROP TABLE IF EXISTS hutches CASCADE;
      DROP TABLE IF EXISTS rows CASCADE;
      DROP TABLE IF EXISTS token_blacklist CASCADE;
      DROP TABLE IF EXISTS password_resets CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS farms CASCADE;
      DROP TABLE IF EXISTS roles CASCADE;
    `
  },
  {
    version: 2,
    name: 'create_breeding_tables',
    up: `
      -- Create breeding_records table
      CREATE TABLE IF NOT EXISTS breeding_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        doe_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        buck_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        mating_date DATE NOT NULL,
        expected_birth_date DATE,
        actual_birth_date DATE,
        number_of_kits INTEGER,
        notes TEXT,
        alert_date DATE,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create kit_records table
      CREATE TABLE IF NOT EXISTS kit_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        breeding_record_id UUID REFERENCES breeding_records(id) ON DELETE CASCADE,
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        kit_number VARCHAR(50) NOT NULL,
        birth_weight DECIMAL(5,2),
        gender VARCHAR(6) CHECK (gender IN ('male', 'female')),
        color VARCHAR(50),
        status VARCHAR(20) DEFAULT 'alive',
        weaning_date DATE,
        weaning_weight DECIMAL(5,2),
        parent_male_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        parent_female_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create breeding_calendar table
      CREATE TABLE IF NOT EXISTS breeding_calendar (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        doe_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        buck_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        planned_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'planned',
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS breeding_calendar CASCADE;
      DROP TABLE IF EXISTS kit_records CASCADE;
      DROP TABLE IF EXISTS breeding_records CASCADE;
    `
  },
  {
    version: 3,
    name: 'create_health_tables',
    up: `
      -- Create health_records table
      CREATE TABLE IF NOT EXISTS health_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        description TEXT NOT NULL,
        date DATE NOT NULL,
        next_due DATE,
        status VARCHAR(20) DEFAULT 'completed',
        veterinarian VARCHAR(100),
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create health_alerts table
      CREATE TABLE IF NOT EXISTS health_alerts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        alert_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) DEFAULT 'medium',
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        is_resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP WITH TIME ZONE,
        resolved_by UUID REFERENCES users(id),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create vaccination_schedules table
      CREATE TABLE IF NOT EXISTS vaccination_schedules (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        vaccine_name VARCHAR(100) NOT NULL,
        description TEXT,
        frequency_days INTEGER NOT NULL,
        age_start_days INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 0 CHECK (is_active IN (0, 1)),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS vaccination_schedules CASCADE;
      DROP TABLE IF EXISTS health_alerts CASCADE;
      DROP TABLE IF EXISTS health_records CASCADE;
    `
  },
  {
    version: 4,
    name: 'create_feeding_tables',
    up: `
      -- Create feeding_schedules table
      CREATE TABLE IF NOT EXISTS feeding_schedules (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        daily_amount VARCHAR(50) NOT NULL,
        feed_type VARCHAR(50) NOT NULL,
        times JSONB NOT NULL,
        special_diet TEXT,
        last_fed TIMESTAMP WITH TIME ZONE,
        is_active INTEGER DEFAULT 0 CHECK (is_active IN (0, 1)),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create feeding_records table
      CREATE TABLE IF NOT EXISTS feeding_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        hutch_id VARCHAR(50) REFERENCES hutches(id),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        feed_type VARCHAR(50) NOT NULL,
        amount VARCHAR(50) NOT NULL,
        unit VARCHAR(20) DEFAULT 'grams',
        feeding_time TIMESTAMP WITH TIME ZONE NOT NULL,
        fed_by UUID REFERENCES users(id),
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create feed_inventory table
      CREATE TABLE IF NOT EXISTS feed_inventory (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        feed_type VARCHAR(50) NOT NULL,
        brand VARCHAR(50),
        quantity DECIMAL(10,2) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        cost_per_unit DECIMAL(10,2),
        purchase_date DATE,
        expiry_date DATE,
        supplier VARCHAR(100),
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS feed_inventory CASCADE;
      DROP TABLE IF EXISTS feeding_records CASCADE;
      DROP TABLE IF EXISTS feeding_schedules CASCADE;
    `
  },
  {
    version: 5,
    name: 'create_financial_tables',
    up: `
      -- Create earnings_records table
      CREATE TABLE IF NOT EXISTS earnings_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id),
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        date DATE NOT NULL,
        weight DECIMAL(8,2),
        sale_type VARCHAR(20),
        includes_urine BOOLEAN DEFAULT false,
        includes_manure BOOLEAN DEFAULT false,
        buyer_name VARCHAR(100),
        notes TEXT,
        hutch_id VARCHAR(50) REFERENCES hutches(id),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create production_records table
      CREATE TABLE IF NOT EXISTS production_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        date DATE NOT NULL,
        source VARCHAR(50),
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create removal_records table
      CREATE TABLE IF NOT EXISTS removal_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        hutch_id VARCHAR(50) REFERENCES hutches(id),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        reason VARCHAR(100) NOT NULL,
        notes TEXT,
        date DATE NOT NULL,
        sale_amount DECIMAL(10,2),
        sale_weight DECIMAL(5,2),
        sold_to VARCHAR(100),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create expenses table
      CREATE TABLE IF NOT EXISTS expenses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        category VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        date DATE NOT NULL,
        vendor VARCHAR(100),
        payment_method VARCHAR(20),
        receipt_url VARCHAR(500),
        is_recurring BOOLEAN DEFAULT false,
        recurring_frequency VARCHAR(20),
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS expenses CASCADE;
      DROP TABLE IF EXISTS removal_records CASCADE;
      DROP TABLE IF EXISTS production_records CASCADE;
      DROP TABLE IF EXISTS earnings_records CASCADE;
    `
  },
  {
    version: 6,
    name: 'create_system_tables',
    up: `
      -- Create notifications table
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        data JSONB DEFAULT '{}',
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP WITH TIME ZONE,
        priority VARCHAR(20) DEFAULT 'medium',
        expires_at TIMESTAMP WITH TIME ZONE,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create activity_logs table
      CREATE TABLE IF NOT EXISTS activity_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        farm_id UUID REFERENCES farms(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(50),
        old_values JSONB,
        new_values JSONB,
        ip_address INET,
        user_agent TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create system_settings table
      CREATE TABLE IF NOT EXISTS system_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        key VARCHAR(100) NOT NULL UNIQUE,
        value JSONB NOT NULL,
        description TEXT,
        is_public BOOLEAN DEFAULT false,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create file_uploads table
      CREATE TABLE IF NOT EXISTS file_uploads (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        farm_id UUID REFERENCES farms(id),
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size INTEGER NOT NULL,
        path VARCHAR(500) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(50),
        is_public BOOLEAN DEFAULT false,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS file_uploads CASCADE;
      DROP TABLE IF EXISTS system_settings CASCADE;
      DROP TABLE IF EXISTS activity_logs CASCADE;
      DROP TABLE IF EXISTS notifications CASCADE;
    `
  },
  {
    version: 7,
    name: 'create_indexes_and_triggers',
    up: `
      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_users_farm_id ON users(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbits_farm_id ON rabbits(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbits_rabbit_id ON rabbits(rabbit_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbits_hutch_id ON rabbits(hutch_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbits_status ON rabbits(status) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_hutches_row_name ON hutches(row_name) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_hutches_farm_id ON hutches(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_hutches_is_occupied ON hutches(is_occupied) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rows_farm_id ON rows(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_hutch_rabbit_history_hutch_id ON hutch_rabbit_history(hutch_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_hutch_rabbit_history_rabbit_id ON hutch_rabbit_history(rabbit_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_breeding_records_farm_id ON breeding_records(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_breeding_records_doe_id ON breeding_records(doe_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_breeding_records_buck_id ON breeding_records(buck_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_kit_records_breeding_record_id ON kit_records(breeding_record_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_kit_records_farm_id ON kit_records(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_health_records_rabbit_id ON health_records(rabbit_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_health_records_date ON health_records(date) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_feeding_records_rabbit_id ON feeding_records(rabbit_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_feeding_records_hutch_id ON feeding_records(hutch_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_feeding_records_date ON feeding_records(feeding_time) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_earnings_records_farm_id ON earnings_records(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_earnings_records_date ON earnings_records(date) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_production_records_farm_id ON production_records(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_production_records_date ON production_records(date) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_activity_logs_farm_id ON activity_logs(farm_id) WHERE is_deleted = 0;

      -- Create function to update updated_at timestamp
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      -- Create function to update rows.occupied
      CREATE OR REPLACE FUNCTION update_row_occupied()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE rows
        SET occupied = (
          SELECT COUNT(*)
          FROM hutches
          WHERE row_name = NEW.row_name
          AND is_occupied = true
          AND is_deleted = 0
        )
        WHERE name = NEW.row_name
        AND is_deleted = 0;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      -- Create triggers for updated_at
      CREATE TRIGGER update_farms_updated_at BEFORE UPDATE ON farms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_rows_updated_at BEFORE UPDATE ON rows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_hutches_updated_at BEFORE UPDATE ON hutches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_rabbits_updated_at BEFORE UPDATE ON rabbits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_hutch_rabbit_history_updated_at BEFORE UPDATE ON hutch_rabbit_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_breeding_records_updated_at BEFORE UPDATE ON breeding_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_kit_records_updated_at BEFORE UPDATE ON kit_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_health_records_updated_at BEFORE UPDATE ON health_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_feeding_schedules_updated_at BEFORE UPDATE ON feeding_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_earnings_records_updated_at BEFORE UPDATE ON earnings_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_production_records_updated_at BEFORE UPDATE ON production_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      -- Create trigger for rows.occupied
      CREATE TRIGGER update_hutches_occupied
      AFTER INSERT OR UPDATE OF is_occupied, is_deleted
      ON hutches
      FOR EACH ROW
      EXECUTE FUNCTION update_row_occupied();
    `,
    down: `
      -- Drop triggers
      DROP TRIGGER IF EXISTS update_farms_updated_at ON farms;
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      DROP TRIGGER IF EXISTS update_rows_updated_at ON rows;
      DROP TRIGGER IF EXISTS update_hutches_updated_at ON hutches;
      DROP TRIGGER IF EXISTS update_rabbits_updated_at ON rabbits;
      DROP TRIGGER IF EXISTS update_hutch_rabbit_history_updated_at ON hutch_rabbit_history;
      DROP TRIGGER IF EXISTS update_breeding_records_updated_at ON breeding_records;
      DROP TRIGGER IF EXISTS update_kit_records_updated_at ON kit_records;
      DROP TRIGGER IF EXISTS update_health_records_updated_at ON health_records;
      DROP TRIGGER IF EXISTS update_feeding_schedules_updated_at ON feeding_schedules;
      DROP TRIGGER IF EXISTS update_earnings_records_updated_at ON earnings_records;
      DROP TRIGGER IF EXISTS update_production_records_updated_at ON production_records;
      DROP TRIGGER IF EXISTS update_hutches_occupied ON hutches;

      -- Drop functions
      DROP FUNCTION IF EXISTS update_updated_at_column;
      DROP FUNCTION IF EXISTS update_row_occupied;

      -- Drop indexes
      DROP INDEX IF EXISTS idx_users_email;
      DROP INDEX IF EXISTS idx_users_farm_id;
      DROP INDEX IF EXISTS idx_rabbits_farm_id;
      DROP INDEX IF EXISTS idx_rabbits_rabbit_id;
      DROP INDEX IF EXISTS idx_rabbits_hutch_id;
      DROP INDEX IF EXISTS idx_rabbits_status;
      DROP INDEX IF EXISTS idx_hutches_row_name;
      DROP INDEX IF EXISTS idx_hutches_farm_id;
      DROP INDEX IF EXISTS idx_hutches_is_occupied;
      DROP INDEX IF EXISTS idx_rows_farm_id;
      DROP INDEX IF EXISTS idx_hutch_rabbit_history_hutch_id;
      DROP INDEX IF EXISTS idx_hutch_rabbit_history_rabbit_id;
      DROP INDEX IF EXISTS idx_breeding_records_farm_id;
      DROP INDEX IF EXISTS idx_breeding_records_doe_id;
      DROP INDEX IF EXISTS idx_breeding_records_buck_id;
      DROP INDEX IF EXISTS idx_kit_records_breeding_record_id;
      DROP INDEX IF EXISTS idx_kit_records_farm_id;
      DROP INDEX IF EXISTS idx_health_records_rabbit_id;
      DROP INDEX IF EXISTS idx_health_records_date;
      DROP INDEX IF EXISTS idx_feeding_records_rabbit_id;
      DROP INDEX IF EXISTS idx_feeding_records_hutch_id;
      DROP INDEX IF EXISTS idx_feeding_records_date;
      DROP INDEX IF EXISTS idx_earnings_records_farm_id;
      DROP INDEX IF EXISTS idx_earnings_records_date;
      DROP INDEX IF EXISTS idx_production_records_farm_id;
      DROP INDEX IF EXISTS idx_production_records_date;
      DROP INDEX IF EXISTS idx_notifications_user_id;
      DROP INDEX IF EXISTS idx_notifications_is_read;
      DROP INDEX IF EXISTS idx_activity_logs_user_id;
      DROP INDEX IF EXISTS idx_activity_logs_farm_id;
    `
  },
  {
    version: 8,
    name: 'create_rabbit_birth_history_table',
    up: `
      -- Create rabbit_birth_history table
      CREATE TABLE IF NOT EXISTS rabbit_birth_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        doe_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        breeding_record_id UUID REFERENCES breeding_records(id) ON DELETE SET NULL,
        birth_date DATE NOT NULL,
        number_of_kits INTEGER NOT NULL CHECK (number_of_kits >= 0),
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create index for rabbit_birth_history
      CREATE INDEX IF NOT EXISTS idx_rabbit_birth_history_farm_id ON rabbit_birth_history(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbit_birth_history_doe_id ON rabbit_birth_history(doe_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbit_birth_history_breeding_record_id ON rabbit_birth_history(breeding_record_id) WHERE is_deleted = 0;

      -- Create trigger for updated_at
      CREATE TRIGGER update_rabbit_birth_history_updated_at
      BEFORE UPDATE ON rabbit_birth_history
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

      -- Create function to update rabbits.total_litters and total_kits
      CREATE OR REPLACE FUNCTION update_rabbit_birth_stats()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE rabbits
        SET total_litters = (
          SELECT COUNT(*)
          FROM rabbit_birth_history
          WHERE doe_id = NEW.doe_id
          AND farm_id = NEW.farm_id
          AND is_deleted = 0
        ),
        total_kits = (
          SELECT COALESCE(SUM(number_of_kits), 0)
          FROM rabbit_birth_history
          WHERE doe_id = NEW.doe_id
          AND farm_id = NEW.farm_id
          AND is_deleted = 0
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE rabbit_id = NEW.doe_id
        AND farm_id = NEW.farm_id
        AND is_deleted = 0;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      -- Create trigger for rabbit_birth_history to update rabbit stats
      CREATE TRIGGER update_rabbit_birth_stats
      AFTER INSERT OR UPDATE OF number_of_kits, is_deleted
      ON rabbit_birth_history
      FOR EACH ROW
      EXECUTE FUNCTION update_rabbit_birth_stats();
    `,
    down: `
      -- Drop trigger and function
      DROP TRIGGER IF EXISTS update_rabbit_birth_stats ON rabbit_birth_history;
      DROP FUNCTION IF EXISTS update_rabbit_birth_stats;
      DROP TRIGGER IF EXISTS update_rabbit_birth_history_updated_at ON rabbit_birth_history;

      -- Drop indexes
      DROP INDEX IF EXISTS idx_rabbit_birth_history_farm_id;
      DROP INDEX IF EXISTS idx_rabbit_birth_history_doe_id;
      DROP INDEX IF EXISTS idx_rabbit_birth_history_breeding_record_id;

      -- Drop table
      DROP TABLE IF EXISTS rabbit_birth_history CASCADE;
    `
  }
];

async function runMigrations() {
  let client;

  try {
    // Verify database connection
    client = await pool.connect();
    logger.info('Successfully connected to the database');

    // Create migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get executed migrations
    const result = await client.query('SELECT version FROM migrations ORDER BY version');
    const executedVersions = result.rows.map(row => row.version);

    // Apply migrations
    for (const migration of migrations) {
      if (!executedVersions.includes(migration.version)) {
        logger.info(`Applying migration ${migration.version}: ${migration.name}`);
        await client.query('BEGIN');
        try {
          await client.query(migration.up);
          await client.query(
            'INSERT INTO migrations (version, name) VALUES ($1, $2)',
            [migration.version, migration.name]
          );
          await client.query('COMMIT');
          logger.info(`Migration ${migration.version} applied successfully`);
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error(`Migration ${migration.version} failed: ${err.message}`);
          throw new Error(`Migration ${migration.version} failed: ${err.message}`);
        }
      } else {
        logger.info(`Skipping migration ${migration.version}: already applied`);
      }
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration process failed:', error.message);
    throw new Error(`Migration process failed: ${error.message}`);
  } finally {
    if (client) {
      client.release();
      logger.info('Database connection released');
    }
  }
}

export default runMigrations;