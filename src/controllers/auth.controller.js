import AuthService from '../services/auth.service.js';
import { SuccessResponse } from '../middleware/responses.js';
import logger from '../middleware/logger.js';

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

    static async login(req, res, next) {
        try {
            const result = await AuthService.login(req.body);
            return SuccessResponse(res, 200, 'Login successful', result)
        } catch (error) {
            logger.error(`Login error: ${error.message}`);
            next(error);
        }
    }

    static async forgotPassword(req, res, next) {
        try {
            const result = await AuthService.forgotPassword(req.body.email);
            return SuccessResponse(res, 200, 'Password reset email sent', result)
        } catch (error) {
            logger.error(`Forgot password error: ${error.message}`);
            next(error);
        }
    }

    static async resetPassword(req, res, next) {
        try {
            const result = await AuthService.resetPassword(req.body);
            return SuccessResponse(res, 200, 'Password reset successfully', result)
        } catch (error) {
            logger.error(`Reset password error: ${error.message}`);
            next(error);
        }
    }

    static async logout(req, res, next) {
        try {
            const token = req.headers.authorization.split(' ')[1];
            const result = await AuthService.logout(token);
            return SuccessResponse(res, 200, 'Logged out successfully', result)

        } catch (error) {
            logger.error(`Logout error: ${error.message}`);
            next(error);
        }
    }
}

export default AuthController;