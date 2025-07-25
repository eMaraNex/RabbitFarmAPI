import { pool } from '../config/database.js';
import logger from '../middleware/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const migrations = [
  {
    version: 1,
    name: 'create_initial_tables',
    up: `
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL UNIQUE,
        location VARCHAR(255),
        latitude DECIMAL(9,2),
        longitude DECIMAL(9,2),
        size DECIMAL(10,2),
        description TEXT,
        timezone VARCHAR(255) DEFAULT 'UTC',
        currency VARCHAR(3) DEFAULT 'USD',
        settings JSONB DEFAULT '{}',
        is_active INTEGER DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Add farm_id to users table
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'farm_id') THEN
          ALTER TABLE users ADD COLUMN farm_id UUID REFERENCES farms(id) ON DELETE SET NULL;
        END IF;
      END $$;

      -- Create password_resets table
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT false,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create token_blacklist table
      CREATE TABLE IF NOT EXISTS token_blacklist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token TEXT NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create rows table
      CREATE TABLE IF NOT EXISTS rows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) NOT NULL,
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        description TEXT,
        levels TEXT[] NOT NULL DEFAULT ARRAY['A', 'B', 'C']::TEXT[],
        capacity INTEGER NOT NULL DEFAULT 18 CHECK (capacity BETWEEN 1 AND 200),
        occupied INTEGER DEFAULT 0 CHECK (occupied >= 0 AND occupied <= capacity),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        -- Unique constraint: row name must be unique within each farm
        UNIQUE(farm_id, name)
      );

      -- Create hutches table
      CREATE TABLE IF NOT EXISTS hutches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) NOT NULL,
        row_id UUID REFERENCES rows(id) ON DELETE CASCADE,
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        level VARCHAR(1) NOT NULL CHECK (level ~ '^[A-Z]$'),
        position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 50),
        size VARCHAR(20) NOT NULL DEFAULT 'medium',
        material VARCHAR(20) NOT NULL DEFAULT 'wire',
        features JSONB DEFAULT '["water bottle", "feeder"]',
        is_occupied BOOLEAN DEFAULT false,
        last_cleaned TIMESTAMP WITH TIME ZONE,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        -- Unique constraint: hutch name must be unique within each farm
        UNIQUE(farm_id, name),
        -- Position must be unique within each row
        UNIQUE(row_id, level, position)
      );

      -- Create rabbits table
      CREATE TABLE IF NOT EXISTS rabbits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        rabbit_id VARCHAR(200) NOT NULL UNIQUE,
        name VARCHAR(50),
        gender VARCHAR(6) NOT NULL CHECK (gender IN ('male', 'female')),
        breed VARCHAR(50) NOT NULL,
        color VARCHAR(50) NOT NULL,
        birth_date DATE NOT NULL,
        weight DECIMAL(5,2) NOT NULL CHECK (weight > 0),
        hutch_id UUID REFERENCES hutches(id),
        parent_male_id VARCHAR(200) REFERENCES rabbits(rabbit_id),
        parent_female_id VARCHAR(200) REFERENCES rabbits(rabbit_id),
        acquisition_type VARCHAR(20) DEFAULT 'birth',
        acquisition_date DATE,
        acquisition_cost DECIMAL(10,2) CHECK (acquisition_cost >= 0),
        is_pregnant BOOLEAN DEFAULT false,
        pregnancy_start_date DATE,
        expected_birth_date DATE,
        actual_birth_date DATE,
        total_litters INTEGER DEFAULT 0 CHECK (total_litters >= 0),
        total_kits INTEGER DEFAULT 0 CHECK (total_kits >= 0),
        status VARCHAR(20) DEFAULT 'active',
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create hutch_rabbit_history table
      CREATE TABLE IF NOT EXISTS hutch_rabbit_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hutch_id UUID REFERENCES hutches(id) ON DELETE CASCADE,
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        removed_at TIMESTAMP WITH TIME ZONE,
        removal_reason VARCHAR(100),
        removal_notes TEXT,
        sale_amount DECIMAL(10,2) CHECK (sale_amount >= 0),
        sale_date DATE,
        sale_weight DECIMAL(5,2) CHECK (sale_weight > 0),
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        doe_id VARCHAR(200) NOT NULL REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        buck_id VARCHAR(200) NOT NULL REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        mating_date DATE NOT NULL,
        expected_birth_date DATE,
        actual_birth_date DATE,
        number_of_kits INTEGER CHECK (number_of_kits >= 0),
        notes TEXT,
        alert_date DATE,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create kit_records table
      CREATE TABLE IF NOT EXISTS kit_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        breeding_record_id UUID NOT NULL REFERENCES breeding_records(id) ON DELETE CASCADE,
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        kit_number VARCHAR(50) NOT NULL,
        birth_weight DECIMAL(5,2) CHECK (birth_weight > 0),
        gender VARCHAR(6) CHECK (gender IN ('male', 'female')),
        color VARCHAR(50),
        status VARCHAR(20) DEFAULT 'alive',
        weaning_date DATE,
        weaning_weight DECIMAL(5,2) CHECK (weaning_weight > 0),
        parent_male_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        parent_female_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        notes TEXT,
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create breeding_calendar table
      CREATE TABLE IF NOT EXISTS breeding_calendar (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        doe_id VARCHAR(200) NOT NULL REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        buck_id VARCHAR(200) NOT NULL REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rabbit_id VARCHAR(200) NOT NULL REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('vaccination', 'treatment', 'checkup', 'medication', 'surgery', 'other')),
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        vaccine_name VARCHAR(100) NOT NULL,
        description TEXT,
        frequency_days INTEGER NOT NULL CHECK (frequency_days > 0),
        age_start_days INTEGER DEFAULT 0 CHECK (age_start_days >= 0),
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rabbit_id VARCHAR(200) NOT NULL REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        hutch_id UUID REFERENCES hutches(id),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        feed_type VARCHAR(50) NOT NULL,
        brand VARCHAR(50),
        quantity DECIMAL(10,2) NOT NULL CHECK (quantity >= 0),
        unit VARCHAR(20) NOT NULL,
        cost_per_unit DECIMAL(10,2) CHECK (cost_per_unit >= 0),
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id),
        amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
        currency VARCHAR(3) DEFAULT 'USD',
        date DATE NOT NULL,
        weight DECIMAL(8,2) CHECK (weight > 0),
        sale_type VARCHAR(20) NOT NULL,
        includes_urine BOOLEAN DEFAULT false,
        includes_manure BOOLEAN DEFAULT false,
        buyer_name VARCHAR(100),
        notes TEXT,
        hutch_id UUID REFERENCES hutches(id),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create production_records table
      CREATE TABLE IF NOT EXISTS production_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL CHECK (quantity >= 0),
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rabbit_id VARCHAR(200) NOT NULL REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
        hutch_id UUID REFERENCES hutches(id),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        reason VARCHAR(100) NOT NULL CHECK (reason IN ('sale', 'death', 'transfer', 'breeding', 'other')),
        notes TEXT,
        date DATE NOT NULL,
        sale_amount DECIMAL(10,2) CHECK (sale_amount >= 0),
        sale_weight DECIMAL(5,2) CHECK (sale_weight > 0),
        sold_to VARCHAR(100),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create expenses table
      CREATE TABLE IF NOT EXISTS expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        category VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        farm_id UUID REFERENCES farms(id),
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size INTEGER NOT NULL CHECK (size > 0),
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
      -- Create performance indexes
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_users_farm_id ON users(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_farms_created_by ON farms(created_by) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbits_farm_id ON rabbits(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbits_rabbit_id ON rabbits(rabbit_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbits_hutch_id ON rabbits(hutch_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rabbits_status ON rabbits(status) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_hutches_row_id ON hutches(row_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_hutches_farm_id ON hutches(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_hutches_name ON hutches(name) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_hutches_is_occupied ON hutches(is_occupied) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rows_farm_id ON rows(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_rows_name ON rows(name) WHERE is_deleted = 0;
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
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
          IF NEW.row_id IS NOT NULL THEN
            UPDATE rows
            SET occupied = (
              SELECT COUNT(*)
              FROM hutches
              WHERE row_id = NEW.row_id
              AND is_occupied = true
              AND is_deleted = 0
            )
            WHERE id = NEW.row_id
            AND is_deleted = 0;
          END IF;
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          IF OLD.row_id IS NOT NULL THEN
            UPDATE rows
            SET occupied = (
              SELECT COUNT(*)
              FROM hutches
              WHERE row_id = OLD.row_id
              AND is_occupied = true
              AND is_deleted = 0
            )
            WHERE id = OLD.row_id
            AND is_deleted = 0;
          END IF;
          RETURN OLD;
        END IF;
        RETURN NULL;
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
      CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_feed_inventory_updated_at BEFORE UPDATE ON feed_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_vaccination_schedules_updated_at BEFORE UPDATE ON vaccination_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_health_alerts_updated_at BEFORE UPDATE ON health_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      -- Create trigger for rows.occupied (handles INSERT/UPDATE/DELETE)
      CREATE TRIGGER update_hutches_occupied
      AFTER INSERT OR UPDATE OF is_occupied, is_deleted, row_id OR DELETE
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
      DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
      DROP TRIGGER IF EXISTS update_feed_inventory_updated_at ON feed_inventory;
      DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
      DROP TRIGGER IF EXISTS update_vaccination_schedules_updated_at ON vaccination_schedules;
      DROP TRIGGER IF EXISTS update_health_alerts_updated_at ON health_alerts;
      DROP TRIGGER IF EXISTS update_hutches_occupied ON hutches;

      -- Drop functions
      DROP FUNCTION IF EXISTS update_updated_at_column;
      DROP FUNCTION IF EXISTS update_row_occupied;

      -- Drop indexes
      DROP INDEX IF EXISTS idx_users_email;
      DROP INDEX IF EXISTS idx_users_farm_id;
      DROP INDEX IF EXISTS idx_farms_created_by;
      DROP INDEX IF EXISTS idx_rabbits_farm_id;
      DROP INDEX IF EXISTS idx_rabbits_rabbit_id;
      DROP INDEX IF EXISTS idx_rabbits_hutch_id;
      DROP INDEX IF EXISTS idx_rabbits_status;
      DROP INDEX IF EXISTS idx_hutches_row_id;
      DROP INDEX IF EXISTS idx_hutches_farm_id;
      DROP INDEX IF EXISTS idx_hutches_name;
      DROP INDEX IF EXISTS idx_hutches_is_occupied;
      DROP INDEX IF EXISTS idx_rows_farm_id;
      DROP INDEX IF EXISTS idx_rows_name;
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
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        doe_id VARCHAR(200) NOT NULL REFERENCES rabbits(rabbit_id) ON DELETE CASCADE,
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
  },
  {
    version: 9,
    name: 'create_alerts_table',
    up: `
      -- Create function to update updated_on timestamp
      CREATE OR REPLACE FUNCTION update_updated_on_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_on = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      -- Create alerts table
      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        alert_start_date TIMESTAMP WITH TIME ZONE NOT NULL,
        alert_end_date TIMESTAMP WITH TIME ZONE,
        alert_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'sent', 'completed', 'rejected')),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        rabbit_id VARCHAR(200) REFERENCES rabbits(rabbit_id) ON DELETE SET NULL,
        hutch_id UUID REFERENCES hutches(id) ON DELETE SET NULL,
        notify_on DATE[] NOT NULL DEFAULT '{}',
        created_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        is_deleted BOOLEAN DEFAULT false
      );

      -- Create indexes for alerts
      CREATE INDEX IF NOT EXISTS idx_alerts_farm_id ON alerts(farm_id) WHERE is_deleted = false;
      CREATE INDEX IF NOT EXISTS idx_alerts_alert_start_date ON alerts(alert_start_date) WHERE is_deleted = false;
      CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status) WHERE is_deleted = false;
      CREATE INDEX IF NOT EXISTS idx_alerts_is_active ON alerts(is_active) WHERE is_deleted = false;
      CREATE INDEX IF NOT EXISTS idx_alerts_notify_on ON alerts USING GIN (notify_on) WHERE is_deleted = false;

      -- Create trigger for updated_on
      CREATE TRIGGER update_alerts_updated_on
      BEFORE UPDATE ON alerts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_on_column();
    `,
    down: `
      -- Drop trigger
      DROP TRIGGER IF EXISTS update_alerts_updated_on ON alerts;

      -- Drop indexes
      DROP INDEX IF EXISTS idx_alerts_farm_id;
      DROP INDEX IF EXISTS idx_alerts_alert_start_date;
      DROP INDEX IF EXISTS idx_alerts_status;
      DROP INDEX IF EXISTS idx_alerts_is_active;
      DROP INDEX IF EXISTS idx_alerts_notify_on;

      -- Drop table
      DROP TABLE IF EXISTS alerts CASCADE;

      -- Drop function
      DROP FUNCTION IF EXISTS update_updated_on_column;
    `
  },
  {
    version: 10,
    name: 'create_email_logs_table',
    up: `
      -- Create email_logs table
      CREATE TABLE IF NOT EXISTS email_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
        count INTEGER NOT NULL CHECK (count = 1),
        date DATE NOT NULL,
        is_active INTEGER DEFAULT 0 CHECK (is_active IN (0, 1)),
        is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for email_logs
      CREATE INDEX IF NOT EXISTS idx_email_logs_farm_id ON email_logs(farm_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_email_logs_date ON email_logs(date) WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_email_logs_is_active ON email_logs(is_active) WHERE is_deleted = 0;

      -- Create trigger for updated_at
      CREATE TRIGGER update_email_logs_updated_at
      BEFORE UPDATE ON email_logs
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `,
    down: `
      -- Drop trigger
      DROP TRIGGER IF EXISTS update_email_logs_updated_at ON email_logs;

      -- Drop indexes
      DROP INDEX IF EXISTS idx_email_logs_farm_id;
      DROP INDEX IF EXISTS idx_email_logs_user_id;
      DROP INDEX IF EXISTS idx_email_logs_date;
      DROP INDEX IF EXISTS idx_email_logs_is_active;

      -- Drop table
      DROP TABLE IF EXISTS email_logs CASCADE;
    `
  }
];

async function runMigrations() {
  let client;

  try {
    console.log('🔌 Getting database connection from pool...');
    client = await pool.connect();
    console.log('✅ Successfully connected to database');

    // Test connection
    const testResult = await client.query('SELECT NOW() as current_time');
    console.log('⏰ Database time:', testResult.rows[0].current_time);

    // Create migrations table
    console.log('📋 Creating migrations tracking table...');
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
    console.log('📊 Previously executed migrations:', executedVersions);

    // Apply migrations one by one
    for (const migration of migrations) {
      if (!executedVersions.includes(migration.version)) {
        console.log(`🚀 Applying migration ${migration.version}: ${migration.name}`);

        // Use explicit transaction
        await client.query('BEGIN');
        try {
          // Execute the migration SQL
          await client.query(migration.up);

          // Record the migration
          await client.query(
            'INSERT INTO migrations (version, name) VALUES ($1, $2)',
            [migration.version, migration.name]
          );

          // Commit the transaction
          await client.query('COMMIT');
          console.log(`✅ Migration ${migration.version} completed successfully`);
        } catch (err) {
          // Rollback on error
          await client.query('ROLLBACK');
          console.error(`❌ Migration ${migration.version} failed:`, err.message);
          throw new Error(`Migration ${migration.version} failed: ${err.message}`);
        }
      } else {
        console.log(`⏭️  Skipping migration ${migration.version}: already applied`);
      }
    }

    // Verify tables were created
    console.log('🔍 Verifying tables were created...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`📊 Total tables in database: ${tablesResult.rows.length}`);
    tablesResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.table_name}`);
    });

    console.log('🎉 All migrations completed successfully');

  } catch (error) {
    console.error('💥 Migration process failed:', error.message);
    console.error('Full error details:', error);
    throw new Error(`Migration process failed: ${error.message}`);
  } finally {
    if (client) {
      client.release();
      console.log('🔌 Database connection released back to pool');
    }
    // Close the pool to allow process to exit
    await pool.end();
    console.log('🏁 Migration process completed');
    process.exit(0);
  }
}

// Export the function for use if needed
export default runMigrations;

// Run migrations if this file is executed directly
runMigrations().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});