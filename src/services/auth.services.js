import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database.js';
import EmailService from './email.services.js';
import logger from '../middleware/logger.js';
import { ValidationError, NotFoundError, UnauthorizedError } from '../middleware/errors.js';

class AuthService {
    static async register({ email, password, name, phone, role_id, farm_id }) {
        try {
            // Validate role exists
            const roleResult = await pool.query(
                'SELECT id, permissions FROM roles WHERE id = $1 AND is_deleted = 0 AND is_active = true',
                [role_id]
            );
            if (roleResult.rows.length === 0) {
                throw new ValidationError('Role not found');
            }

            // Validate farm_id if provided
            if (farm_id) {
                const farmResult = await pool.query(
                    'SELECT 1 FROM farms WHERE id = $1 AND is_deleted = 0 AND is_active = true',
                    [farm_id]
                );
                if (farmResult.rows.length === 0) {
                    throw new ValidationError('Farm not found');
                }
            }

            // Check if email exists
            const emailResult = await pool.query(
                'SELECT 1 FROM users WHERE email = $1 AND is_deleted = 0',
                [email]
            );
            if (emailResult.rows.length > 0) {
                throw new ValidationError('Email already registered');
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const userId = uuidv4();

            const userResult = await pool.query(
                `INSERT INTO users (id, email, password_hash, name, phone, role_id, farm_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, name, role_id, farm_id`,
                [userId, email, passwordHash, name, phone, role_id, farm_id || null]
            );

            logger.info(`User registered: ${email}`);
            return userResult.rows[0];
        } catch (error) {
            logger.error(`Register error: ${error.message}`);
            throw error;
        }
    }

    static async login({ email, password }) {
        try {
            const userResult = await pool.query(
                `SELECT u.id, u.email, u.password_hash, u.name, u.role_id, u.farm_id, r.permissions, u.login_count
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.email = $1 AND u.is_deleted = 0 AND u.is_active = true
         AND r.is_deleted = 0 AND r.is_active = true`,
                [email]
            );

            if (userResult.rows.length === 0) {
                throw new UnauthorizedError('Invalid email or password');
            }

            const user = userResult.rows[0];
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                throw new UnauthorizedError('Invalid email or password');
            }

            const token = jwt.sign(
                { userId: user.id, roleId: user.role_id },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            // Update login_count and last_login
            await pool.query(
                `UPDATE users
         SET login_count = $1, last_login = CURRENT_TIMESTAMP
         WHERE id = $2`,
                [user.login_count + 1, user.id]
            );

            logger.info(`User logged in: ${email}`);
            return {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role_id: user.role_id,
                    farm_id: user.farm_id,
                    permissions: user.permissions
                }
            };
        } catch (error) {
            logger.error(`Login error: ${error.message}`);
            throw error;
        }
    }

    static async forgotPassword(email) {
        try {
            const userResult = await pool.query(
                'SELECT id FROM users WHERE email = $1 AND is_deleted = 0 AND is_active = true',
                [email]
            );
            if (userResult.rows.length === 0) {
                throw new NotFoundError('User not found');
            }

            const userId = userResult.rows[0].id;
            const token = uuidv4();
            const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

            await pool.query(
                `INSERT INTO password_resets (id, user_id, token, expires_at)
         VALUES ($1, $2, $3, $4)`,
                [uuidv4(), userId, token, expiresAt]
            );

            const resetUrl = `${process.env.BASE_URL}/api/v1/auth/reset-password/${token}`;
            logger.info(`Generated reset URL: ${resetUrl}`);
            const emailService = new EmailService({}, logger);
            const emailResult = await emailService.sendEmail({
                to: email,
                subject: 'Password Reset Request',
                text: `Click here to reset your password: ${resetUrl}\nThis link expires in 1 hour.`,
                templatePath: 'src/templates/reset-password.html',
                appName: 'Karagani Farm',
                resetUrl
            }, 'password_reset');

            if (!emailResult.success) {
                throw new Error(`Failed to send reset email: ${emailResult.message}`);
            }

            logger.info(`Password reset requested for: ${email}`);
            return { message: 'Password reset email sent' };
        } catch (error) {
            logger.error(`Forgot password error: ${error.message}`);
            throw error;
        }
    }

    static async resetPassword({ token, currentPassword, password, newPassword }) {
        try {
            if (password !== newPassword) {
                throw new ValidationError('New password and confirmation do not match');
            }

            const resetResult = await pool.query(
                `SELECT user_id
         FROM password_resets
         WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP AND used = false AND is_deleted = 0`,
                [token]
            );

            if (resetResult.rows.length === 0) {
                throw new ValidationError('Invalid or expired reset token');
            }

            const userId = resetResult.rows[0].user_id;

            const userResult = await pool.query(
                `SELECT password_hash
         FROM users
         WHERE id = $1 AND is_deleted = 0 AND is_active = true`,
                [userId]
            );

            if (userResult.rows.length === 0) {
                throw new NotFoundError('User not found');
            }

            const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
            if (!isValidPassword) {
                throw new UnauthorizedError('Incorrect current password');
            }

            const passwordHash = await bcrypt.hash(password, 10);

            await pool.query('BEGIN');

            await pool.query(
                `UPDATE users
         SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND is_deleted = 0`,
                [passwordHash, userId]
            );

            await pool.query(
                `UPDATE password_resets
         SET used = true, updated_at = CURRENT_TIMESTAMP
         WHERE token = $1`,
                [token]
            );

            await pool.query('COMMIT');
            logger.info(`Password reset for user: ${userId}`);
            return { message: 'Password reset successfully' };
        } catch (error) {
            await pool.query('ROLLBACK');
            logger.error(`Reset password error: ${error.message}`);
            throw error;
        }
    }

    static async logout(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const expiresAt = new Date(decoded.exp * 1000);

            await pool.query(
                `INSERT INTO token_blacklist (id, token, user_id, expires_at)
         VALUES ($1, $2, $3, $4)`,
                [uuidv4(), token, decoded.userId, expiresAt]
            );

            logger.info(`User logged out: ${decoded.userId}`);
            return { message: 'Logged out successfully' };
        } catch (error) {
            logger.error(`Logout error: ${error.message}`);
            throw error;
        }
    }
}

export default AuthService;