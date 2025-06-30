import { DatabaseHelper } from '../config/database.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';
import { v4 as uuidv4 } from 'uuid';
import EmailService from './email.services.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AlertService {
    constructor() {
        this.emailService = new EmailService();
    }

    /**
     * Create a new alert
     * @param {Object} alertData - Alert data including required fields
     * @returns {Promise<Object>} - Created alert
     */
    async createAlert(alertData) {
        const {
            farm_id,
            user_id,
            rabbit_id,
            hutch_id,
            name,
            alert_start_date,
            alert_end_date,
            alert_type,
            severity,
            message,
            status = 'pending'
        } = alertData;

        if (!farm_id || !name || !alert_start_date || !alert_type || !severity || !message) {
            throw new ValidationError('Missing required alert fields');
        }

        try {
            await DatabaseHelper.executeQuery('BEGIN');

            const result = await DatabaseHelper.executeQuery(
                `INSERT INTO alerts (
                    id, name, alert_start_date, alert_end_date, alert_type, severity, message, status,
                    farm_id, user_id, rabbit_id, hutch_id, created_on, updated_on, is_active, is_deleted
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true, false)
                RETURNING *`,
                [
                    uuidv4(),
                    name,
                    alert_start_date,
                    alert_end_date || null,
                    alert_type,
                    severity,
                    message,
                    status,
                    farm_id,
                    user_id || null,
                    rabbit_id || null,
                    hutch_id || null
                ]
            );

            const alert = result.rows[0];
            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Alert ${alert.id} created for farm ${farm_id}`);

            // Send immediate notification if start date is now or in the past
            // if (new Date(alert_start_date) <= new Date()) {
                await this.sendAlertNotification(alert);
            // }

            return alert;
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error creating alert: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get due alerts for processing
     * @returns {Promise<Array>} - List of due alerts
     */
    async getDueAlerts() {
        try {
            const result = await DatabaseHelper.executeQuery(
                `SELECT * FROM alerts
                 WHERE alert_start_date <= CURRENT_TIMESTAMP
                 AND status = 'pending'
                 AND is_active = true
                 AND is_deleted = false`
            );
            return result.rows;
        } catch (error) {
            logger.error(`Error fetching due alerts: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send alert notification
     * @param {Object} alert - Alert object
     * @returns {Promise<Object>} - Notification result
     */
async sendAlertNotification(alert) {
    try {
        await DatabaseHelper.executeQuery('BEGIN');
        console.log('Current directory:', process.cwd());
        console.log('__dirname:', __dirname);

        // Get user email
        const userResult = await DatabaseHelper.executeQuery(
            'SELECT email FROM users WHERE id = $1 AND is_deleted = 0',
            [alert.user_id]
        );
        const userEmail = userResult.rows[0]?.email;
       const templatePath = path.join(__dirname, '../templates/alert_notification.html');
        console.log('Resolved templatePath:', templatePath);
        if (userEmail) {
            const emailResult = await this.emailService.sendEmail({
                ...alert,
                from: process.env.DEFAULT_SENDER_EMAIL,
                to: userEmail,
                subject: `Rabbit Farming Alert: ${alert.name}`,
                text: alert.message,
                templatePath: templatePath,
                appName: 'Rabbit Farm Management',
            });

            if (!emailResult.success) {
                throw new Error(`Failed to send email: ${emailResult.message}`);
            }
        }

        // Update alert status
        await DatabaseHelper.executeQuery(
            `UPDATE alerts SET status = 'sent', updated_on = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [alert.id]
        );

        await DatabaseHelper.executeQuery('COMMIT');
        logger.info(`Notification sent for alert ${alert.id}`);
        return { success: true, message: 'Notification sent successfully' };
    } catch (error) {
        await DatabaseHelper.executeQuery('ROLLBACK');
        logger.error(`Error sending alert notification ${alert.id}: ${error.message}`);
        throw error;
    }
}

    /**
     * Process due alerts (called by scheduler)
     */
    async processDueAlerts() {
        try {
            const dueAlerts = await this.getDueAlerts();
            const results = [];

            for (const alert of dueAlerts) {
                const result = await this.sendAlertNotification(alert);
                results.push({ alertId: alert.id, ...result });
            }

            return results;
        } catch (error) {
            logger.error(`Error processing due alerts: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get alerts for a farm
     * @param {string} farmId - Farm UUID
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - List of alerts
     */
    async getFarmAlerts(farmId, filters = {}) {
        const { alert_type, severity, status, limit = 10 } = filters;
        let query = `SELECT * FROM alerts WHERE farm_id = $1 AND is_active = true AND is_deleted = false`;
        const params = [farmId];
        let paramCount = 2;

        if (alert_type) {
            query += ` AND alert_type = $${paramCount++}`;
            params.push(alert_type);
        }
        if (severity) {
            query += ` AND severity = $${paramCount++}`;
            params.push(severity);
        }
        if (status) {
            query += ` AND status = $${paramCount++}`;
            params.push(status);
        }

        query += ` ORDER BY severity DESC, alert_start_date ASC LIMIT $${paramCount}`;
        params.push(limit);

        try {
            const result = await DatabaseHelper.executeQuery(query, params);
            return result.rows;
        } catch (error) {
            logger.error(`Error fetching alerts for farm ${farmId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update alert status
     * @param {string} alertId - Alert UUID
     * @param {string} status - New status
     * @returns {Promise<Object>} - Updated alert
     */
    async updateAlertStatus(alertId, status) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `UPDATE alerts SET status = $1, updated_on = CURRENT_TIMESTAMP
                 WHERE id = $2 AND is_deleted = false
                 RETURNING *`,
                [status, alertId]
            );

            if (result.rows.length === 0) {
                throw new ValidationError('Alert not found');
            }

            logger.info(`Alert ${alertId} status updated to ${status}`);
            return result.rows[0];
        } catch (error) {
            logger.error(`Error updating alert ${alertId} status: ${error.message}`);
            throw error;
        }
    }
}

export default new AlertService();