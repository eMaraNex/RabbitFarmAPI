import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseHelper } from '../config/database.js';
import EmailService from './email.services.js';
import logger from '../middleware/logger.js';
import { ValidationError, NotFoundError, UnauthorizedError } from '../middleware/errors.js';

const DEFAULT_ROLE_ID = parseInt(process.env.DEFAULT_ROLE_ID, 10) || 1;
class AuthService {
    static async register({
        email,
        password,
        name,
        phone,
        role_id,
        farm_id,
        currentUserRoleId,
        email_verified = false,
        is_active = 1,
        is_deleted = 0
    }) {
        try {
            // Insert default roles if they don't exist (using integer values for boolean columns)
            const newRole = await DatabaseHelper.executeQuery(
                `INSERT INTO roles (name, description, permissions, is_active, is_deleted)
                     VALUES
                        ('User', 'Unpaid user with basic access', '["view_rabbits"]', 1, 0),
                        ('Premium', 'Paid user with enhanced access', '["view_rabbits", "manage_feeding"]', 1, 0),
                        ('Advanced', 'Higher paid user with reporting', '["view_rabbits", "manage_feeding", "view_reports"]', 1, 0),
                        ('Admin', 'Full farm management', '["all"]', 1, 0),
                        ('SuperAdmin', 'System-wide control', '["all", "manage_roles"]', 1, 0)
                     ON CONFLICT (name) DO NOTHING`
            );
            logger.info(`Inserted default roles if they didn't exist: ${newRole.rowCount} rows affected`);

            // Input validation
            if (!email || !name || !phone) {
                throw new ValidationError('Email, name, and phone are required fields');
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                throw new ValidationError('Invalid email format');
            }

            // Determine and validate role_id
            let finalRoleId = role_id;
            if (!role_id) {
                // Assign default role_id if not provided
                finalRoleId = DEFAULT_ROLE_ID;
            }

            // Validate the role_id from the roles table
            const roleResult = await DatabaseHelper.executeQuery(
                'SELECT id, name, permissions FROM roles WHERE id = $1 AND is_deleted = 0 AND is_active = 1',
                [finalRoleId]
            );
            if (roleResult.rows.length === 0) {
                throw new ValidationError(`Invalid or inactive role with ID ${finalRoleId}`);
            }

            // Permission check: Ensure current user can assign this role
            if (currentUserRoleId) {
                const currentRoleResult = await DatabaseHelper.executeQuery(
                    'SELECT permissions FROM roles WHERE id = $1 AND is_deleted = 0 AND is_active = 1',
                    [currentUserRoleId]
                );
                if (currentRoleResult.rows.length === 0) {
                    throw new UnauthorizedError('Invalid current user role');
                }

                const currentPermissions = currentRoleResult.rows[0].permissions;
                if (typeof currentPermissions !== 'object' || currentPermissions === null) {
                    throw new Error('Corrupted permissions data for current user');
                }

                // Define role hierarchy based on role_id (dynamic check)
                const roleHierarchy = {
                    [await this.getRoleIdByName('SuperAdmin')]: [await this.getRoleIdByName('Normal User'), await this.getRoleIdByName('Premium'), await this.getRoleIdByName('Advanced'), await this.getRoleIdByName('Admin'), await this.getRoleIdByName('SuperAdmin')], // SuperAdmin can assign all
                    [await this.getRoleIdByName('Admin')]: [await this.getRoleIdByName('Normal User'), await this.getRoleIdByName('Premium'), await this.getRoleIdByName('Advanced'), await this.getRoleIdByName('Admin')], // Admin can assign most
                    [await this.getRoleIdByName('Premium')]: [await this.getRoleIdByName('Normal User'), await this.getRoleIdByName('Premium')], // Premium can assign lower tiers
                    [await this.getRoleIdByName('Normal User')]: [await this.getRoleIdByName('Normal User')] // Normal User can only self-register
                };

                const allowedRoleIds = roleHierarchy[currentUserRoleId] || [await this.getRoleIdByName('Normal User')];
                if (!allowedRoleIds.includes(finalRoleId)) {
                    throw new UnauthorizedError('Insufficient permissions to assign this role');
                }
            }

            // Validate farm_id if provided
            if (farm_id) {
                const farmResult = await DatabaseHelper.executeQuery(
                    'SELECT id FROM farms WHERE id = $1 AND is_deleted = 0 AND is_active = 1',
                    [farm_id]
                );
                if (farmResult.rows.length === 0) {
                    throw new ValidationError('Invalid or inactive farm specified');
                }
            }

            // Check for existing email
            const emailCheck = await DatabaseHelper.executeQuery(
                'SELECT id FROM users WHERE email = $1 AND is_deleted = 0',
                [email]
            );
            if (emailCheck.rows.length > 0) {
                throw new ValidationError('Email is already registered');
            }

            // Handle password for SSO or normal registration
            let passwordHash = null;
            if (!password) {
                throw new ValidationError('Password is required for non-SSO registration');
            }
            if (password) {
                passwordHash = await bcrypt.hash(password, 12);
            }

            // Generate unique user ID and verification token
            const userId = uuidv4();
            const verificationToken = uuidv4();

            // Insert new user into database with verification token in preferences
            const userResult = await DatabaseHelper.executeQuery(
                `INSERT INTO users (
                    id, email, password_hash, name, phone, role_id, farm_id, email_verified, is_active, 
                    is_deleted, preferences, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
                RETURNING id, email, name, role_id, farm_id, email_verified, is_active, is_deleted, created_at`,
                [userId, email, passwordHash, name, phone, finalRoleId, farm_id, email_verified, is_active, is_deleted,
                    JSON.stringify({ verification_token: verificationToken, verification_expires: Date.now() + 24 * 3600 * 1000 })]
            );

            const newUser = userResult.rows[0];

            // Send verification email
            const verifyUrl = `${process.env.PROD_BASE_URL}/api/v1/auth/verify-email/${verificationToken}`;
            const emailService = new EmailService({}, logger);

            try {
                const emailResult = await emailService.sendEmail({
                    to: email,
                    subject: 'Verify Your Email - Karagani Farm',
                    text: `Please verify your email by clicking: ${verifyUrl}`,
                    templatePath: 'src/templates/email-verification.html',
                    appName: 'Karagani Farm',
                    verifyUrl
                }, 'email_verification');

                if (!emailResult.success) {
                    logger.warn(`Failed to send verification email to ${email}: ${emailResult.message}`);
                }
            } catch (emailError) {
                logger.warn(`Email service error for ${email}: ${emailError.message}`);
            }

            // Log successful registration
            logger.info(`User registered successfully: ${email} with role_id ${finalRoleId}`);

            return newUser;
        } catch (error) {
            logger.error(`Registration error for email ${email}: ${error.message}`, { stack: error.stack });
            if (error instanceof ValidationError || error instanceof UnauthorizedError) {
                throw error;
            }
            throw new Error('An unexpected error occurred during registration');
        }
    }

    static async getRoleIdByName(roleName) {
        try {
            const result = await DatabaseHelper.executeQuery(
                'SELECT id FROM roles WHERE name = $1 AND is_deleted = 0 AND is_active = 1',
                [roleName]
            );
            return result.rows.length > 0 ? result.rows[0].id : null;
        } catch (error) {
            logger.error(`Error getting role ID by name: ${error.message}`);
            return null;
        }
    }

    static async login({ email, password }) {
        try {
            const userResult = await DatabaseHelper.executeQuery(
                `SELECT u.id, u.email, u.password_hash, u.name, u.role_id, u.farm_id, r.permissions, u.login_count, u.email_verified
                 FROM users u
                 JOIN roles r ON u.role_id = r.id
                 WHERE u.email = $1 AND u.is_deleted = 0 AND u.is_active = 1
                 AND r.is_deleted = 0 AND r.is_active = 1`,
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
            await DatabaseHelper.executeQuery(
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
                    permissions: user.permissions,
                    email_verified: user.email_verified
                }
            };
        } catch (error) {
            logger.error(`Login error: ${error.message}`);
            throw error;
        }
    }

    static async verifyEmail(token) {
        try {
            // Find user with matching verification token in preferences
            const userResult = await DatabaseHelper.executeQuery(
                `SELECT id, email, name, preferences, email_verified
                 FROM users
                 WHERE preferences->>'verification_token' = $1 
                 AND is_deleted = 0 
                 AND is_active = 1`,
                [token]
            );

            if (userResult.rows.length === 0) {
                throw new ValidationError('Invalid verification token');
            }

            const user = userResult.rows[0];

            // Check if already verified
            if (user.email_verified) {
                return {
                    success: true,
                    message: 'Email is already verified!',
                    user: { email: user.email, name: user.name }
                };
            }

            // Check if token is expired
            const preferences = user.preferences || {};
            const verificationExpires = preferences.verification_expires;

            if (verificationExpires && Date.now() > verificationExpires) {
                throw new ValidationError('Verification token has expired');
            }

            // Update user email_verified status and clear verification token
            await DatabaseHelper.executeQuery(
                `UPDATE users 
                 SET email_verified = true, 
                     preferences = preferences - 'verification_token' - 'verification_expires',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [user.id]
            );

            logger.info(`Email verified successfully for user: ${user.email}`);

            return {
                success: true,
                message: 'Email verified successfully! You can now receive notifications.',
                user: { email: user.email, name: user.name }
            };

        } catch (error) {
            logger.error(`Email verification error: ${error.message}`);
            throw error;
        }
    }

    static async resendVerificationEmail(email) {
        try {
            // Find user
            const userResult = await DatabaseHelper.executeQuery(
                `SELECT id, email, name, email_verified, preferences, updated_at
                 FROM users 
                 WHERE email = $1 AND is_deleted = 0 AND is_active = 1`,
                [email]
            );

            if (userResult.rows.length === 0) {
                throw new NotFoundError('User not found');
            }

            const user = userResult.rows[0];

            if (user.email_verified) {
                return {
                    success: false,
                    message: 'Email is already verified'
                };
            }

            // Check if there's a recent verification email (within last 5 minutes)
            const preferences = user.preferences || {};
            const lastVerificationTime = preferences.last_verification_sent;

            if (lastVerificationTime && (Date.now() - lastVerificationTime) < 5 * 60 * 1000) {
                return {
                    success: false,
                    message: 'Verification email was sent recently. Please wait 5 minutes before requesting another.'
                };
            }

            // Generate new verification token
            const verificationToken = uuidv4();
            const now = Date.now();

            // Update user preferences with new token
            const updatedPreferences = {
                ...preferences,
                verification_token: verificationToken,
                verification_expires: now + 24 * 3600 * 1000, // 24 hours
                last_verification_sent: now
            };

            await DatabaseHelper.executeQuery(
                `UPDATE users 
                 SET preferences = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [JSON.stringify(updatedPreferences), user.id]
            );

            // Send verification email
            const verifyUrl = `${process.env.PROD_BASE_URL}/api/v1/auth/verify-email/${verificationToken}`;
            const emailService = new EmailService({}, logger);

            const emailResult = await emailService.sendEmail({
                to: email,
                subject: 'Verify Your Email - Karagani Farm',
                text: `Please verify your email by clicking: ${verifyUrl}`,
                templatePath: 'src/templates/email-verification.html',
                appName: 'Karagani Farm',
                verifyUrl
            }, 'email_verification');

            if (!emailResult.success) {
                throw new Error(`Failed to send verification email: ${emailResult.message}`);
            }

            logger.info(`Verification email resent to: ${email}`);
            return {
                success: true,
                message: 'Verification email sent successfully'
            };

        } catch (error) {
            logger.error(`Resend verification error: ${error.message}`);
            throw error;
        }
    }

    static async forgotPassword(email) {
        try {
            const userResult = await DatabaseHelper.executeQuery(
                'SELECT id FROM users WHERE email = $1 AND is_deleted = 0 AND is_active = 1',
                [email]
            );
            if (userResult.rows.length === 0) {
                throw new NotFoundError('User not found');
            }

            const userId = userResult.rows[0].id;
            const token = uuidv4();
            const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

            await DatabaseHelper.executeQuery(
                `INSERT INTO password_resets (id, user_id, token, expires_at)
                 VALUES ($1, $2, $3, $4)`,
                [uuidv4(), userId, token, expiresAt]
            );

            const resetUrl = `${process.env.PROD_BASE_URL}/api/v1/auth/reset-password/${token}`;
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

            const resetResult = await DatabaseHelper.executeQuery(
                `SELECT user_id
                 FROM password_resets
                 WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP AND used = false AND is_deleted = 0`,
                [token]
            );

            if (resetResult.rows.length === 0) {
                throw new ValidationError('Invalid or expired reset token');
            }

            const userId = resetResult.rows[0].user_id;

            const userResult = await DatabaseHelper.executeQuery(
                `SELECT password_hash
                 FROM users
                 WHERE id = $1 AND is_deleted = 0 AND is_active = 1`,
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

            await DatabaseHelper.executeQuery(
                `UPDATE users
                 SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2 AND is_deleted = 0`,
                [passwordHash, userId]
            );

            await DatabaseHelper.executeQuery(
                `UPDATE password_resets
                 SET used = true, updated_at = CURRENT_TIMESTAMP
                 WHERE token = $1`,
                [token]
            );

            logger.info(`Password reset for user: ${userId}`);
            return { message: 'Password reset successfully' };
        } catch (error) {
            logger.error(`Reset password error: ${error.message}`);
            throw error;
        }
    }

    static async logout(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const expiresAt = new Date(decoded.exp * 1000);

            await DatabaseHelper.executeQuery(
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