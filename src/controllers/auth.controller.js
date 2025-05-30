import AuthService from '../services/auth.service.js';
import logger from '../middleware/logger.js';
import { SuccessResponse } from '../middleware/responses.js';
import { ValidationError } from '../middleware/errors.js';
import { pool } from '../config/database.js';

class AuthController {
    static async register(req, res, next) {
        try {
            const user = await AuthService.register(req.body);
            return SuccessResponse(res, 201, 'User registered successfully', user)
        } catch (error) {
            logger.error(`Register error: ${error.message}`);
            next(error);
        }
    }

    static async validateResetToken(req, res, next) {
        try {
            const { token } = req.params;
            if (!token) {
                throw new ValidationError('Missing reset token');
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

            return SuccessResponse(res, 200, 'Token is valid', { valid: true });
        } catch (error) {
            logger.error(`Validate reset token error: ${error.message}`);
            next(error);
        }
    }


    static async login(req, res, next) {
        try {
            const { email, password } = req.body;
            const result = await AuthService.login({ email, password });
            return SuccessResponse(res, 200, 'Login successful', result);
        } catch (error) {
            logger.error(`Login error: ${error.message}`);
            next(error);
        }
    }

    static async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;
            const result = await AuthService.forgotPassword(email);
            return SuccessResponse(res, 200, 'Password reset email sent', result);
        } catch (error) {
            logger.error(`Forgot password error: ${error.message}`);
            next(error);
        }
    }

    static async resetPassword(req, res, next) {
        try {
            const { token } = req.params;
            const { currentPassword, password, newPassword } = req.body;
            const result = await AuthService.resetPassword({ token, currentPassword, password, newPassword });
            return SuccessResponse(res, 200, 'Password reset successfully', result);
        } catch (error) {
            logger.error(`Reset password error: ${error.message}`);
            next(error);
        }
    }

    static async logout(req, res, next) {
        try {
            const { token } = req.body;
            const result = await AuthService.logout(token);
            return SuccessResponse(res, 200, 'Logged out successfully', result);
        } catch (error) {
            logger.error(`Logout error: ${error.message}`);
            next(error);
        }
    }
}

export default AuthController;