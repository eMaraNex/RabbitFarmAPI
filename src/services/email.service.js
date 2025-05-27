import dotenv from 'dotenv';
dotenv.config();
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Email Service using Nodemailer with rate limiting
 */
class EmailService {
    constructor(config = {}, logger, dailyLimit) {
        this.config = {
            service: process.env.EMAIL_SERVICE || 'gmail',
            user: process.env.SMTP_USER,
            defaultSender: process.env.DEFAULT_SENDER_EMAIL,
            dailyLimit: dailyLimit || 500,
            counterFilePath: path.join(__dirname, 'email-counter.json'),
            ...config
        };

        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        this.emailsSentToday = 0;
        this.logger = logger || console;
        this.initialize();
    }

    /**
     * Initialize the service with persistent counter data
     */
    async initialize() {
        try {
            // Load counter data
            const counterExists = await this.fileExists(this.config.counterFilePath);
            if (counterExists) {
                const counterData = JSON.parse(await fs.readFile(this.config.counterFilePath, 'utf8'));
                if (this.isSameDay(new Date(), new Date(counterData.date))) {
                    this.emailsSentToday = counterData.count;
                } else {
                    // Reset counter for new day
                    await this.resetDailyCounter();
                }
            } else {
                await this.resetDailyCounter();
            }

            this.logger.info(`Email service initialized. Emails sent today: ${this.emailsSentToday}`);
        } catch (error) {
            this.logger.error(`Initialization error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Reset daily email counter
     */
    async resetDailyCounter() {
        this.emailsSentToday = 0;
        await fs.writeFile(
            this.config.counterFilePath,
            JSON.stringify({ count: 0, date: new Date() }),
            'utf8'
        );
        this.logger.info('Daily email counter reset');
    }

    /**
     * Update counter in memory and persistent storage
     */
    async updateCounter() {
        this.emailsSentToday++;
        await fs.writeFile(
            this.config.counterFilePath,
            JSON.stringify({ count: this.emailsSentToday, date: new Date() }),
            'utf8'
        );
    }

    /**
     * Check if two dates are the same day
     */
    isSameDay(date1, date2) {
        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        );
    }

    /**
     * Load template file from disk
     * @param {string} templatePath - Path to the template file
     * @returns {Promise<string>} - Template content
     */
    async loadTemplate(templatePath) {
        try {
            return await fs.readFile(templatePath, 'utf8');
        } catch (error) {
            this.logger.error(`Error loading template ${templatePath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get system information for templates
     * @returns {Object} - System information
     */
    getSystemInfo() {
        return {
            machineName: os.hostname(),
            osInfo: `${os.type()} ${os.release()} ${os.arch()}`,
            username: os.userInfo().username,
            timestamp: new Date().toLocaleString()
        };
    }

    /**
     * Replace variables in the email template
     */
    updateTemplate(template, data) {
        return template.replace(/{{(\w+)}}/g, (_, key) => {
            return data[key] || '';
        });
    }

    /**
     * Create an email message object
     */
    async createMessage(options, type) {
        const {
            to,
            subject,
            text,
            from = this.config.defaultSender,
            attachments,
            templatePath,
            appName = 'Application'
        } = options;

        let html = text;
        if (templatePath) {
            const templateContent = await this.loadTemplate(templatePath);
            const templateData = {
                ...this.getSystemInfo(),
                appName,
                url: process.env.NODE_ENV === 'production' ? process.env.PROD_BACKEND_URL : process.env.DEV_BACKEND_URL,
                type: type,
                ...options
            };
            html = this.updateTemplate(templateContent, templateData);
        }

        const msg = {
            to,
            from,
            subject,
            text,
            html
        };

        if (attachments && Array.isArray(attachments)) {
            msg.attachments = attachments.map((attachment) => {
                const att = {
                    filename: attachment.filename,
                    contentType: attachment.contentType || attachment.type,
                    disposition: attachment.disposition || 'attachment'
                };
                if (attachment.path) {
                    att.path = attachment.path;
                } else if (attachment.content) {
                    if (!Buffer.isBuffer(attachment.content)) {
                        this.logger.error(`Attachment content is not a Buffer: ${typeof attachment.content}`);
                        throw new Error('Attachment content must be a Buffer');
                    }
                    att.content = attachment.content;
                }
                return att;
            });
        }

        return msg;
    }

    /**
     * Send an email immediately
     */
    async sendEmail(options, type = 'general') {
        try {
            // Check daily limit
            if (this.emailsSentToday >= this.config.dailyLimit) {
                this.logger.error(`Daily email limit reached: ${this.emailsSentToday}/${this.config.dailyLimit}`);
                return { success: false, status: 'limit_reached', message: 'Daily email limit reached' };
            }

            const message = await this.createMessage(options, type);
            await this.transporter.sendMail(message);
            await this.updateCounter();

            this.logger.info(`Email sent to ${message.to}. Daily count: ${this.emailsSentToday}/${this.config.dailyLimit}`);
            return { success: true, status: 'sent', message: 'Email sent successfully' };
        } catch (error) {
            this.logger.error(`Error sending email: ${error.message}`);
            return { success: false, status: 'error', message: error.message };
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            emailsSentToday: this.emailsSentToday,
            dailyLimit: this.config.dailyLimit,
            remainingQuota: this.config.dailyLimit - this.emailsSentToday
        };
    }
}

export default EmailService;