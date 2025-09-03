const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Database connection
const DB_PATH = path.join(__dirname, 'data', 'gmail_followup.db');

class Database {
    constructor() {
        this.db = null;
        this.init();
    }

    init() {
        // Create data directory if it doesn't exist
        const fs = require('fs');
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
            } else {
                console.log('Connected to SQLite database');
                this.createTables();
            }
        });
    }

    createTables() {
        const createTableQueries = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                picture TEXT,
                created_at TEXT NOT NULL,
                last_login_at TEXT,
                updated_at TEXT NOT NULL
            )`,

            // OAuth tokens table
            `CREATE TABLE IF NOT EXISTS tokens (
                user_id TEXT PRIMARY KEY,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                expiry_date INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )`,

            // Emails table
            `CREATE TABLE IF NOT EXISTS emails (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                gmail_id TEXT NOT NULL,
                thread_id TEXT NOT NULL,
                subject TEXT NOT NULL,
                from_email TEXT NOT NULL,
                to_emails TEXT NOT NULL,
                cc_emails TEXT,
                bcc_emails TEXT,
                body_text TEXT,
                body_html TEXT,
                sent_at TEXT NOT NULL,
                has_reply BOOLEAN DEFAULT FALSE,
                reply_checked_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )`,

            // Sequences table
            `CREATE TABLE IF NOT EXISTS sequences (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                steps TEXT NOT NULL, -- JSON array of steps
                timezone TEXT DEFAULT 'America/New_York',
                send_window_days TEXT, -- JSON array of days
                send_window_start_hour INTEGER DEFAULT 9,
                send_window_end_hour INTEGER DEFAULT 17,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )`,

            // Enrollments table
            `CREATE TABLE IF NOT EXISTS enrollments (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                sequence_id TEXT NOT NULL,
                email_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active', -- active, paused, completed, cancelled
                reply_mode TEXT NOT NULL DEFAULT 'reply', -- reply, reply_all
                current_step INTEGER DEFAULT 0,
                next_send_date TEXT,
                enrolled_at TEXT NOT NULL,
                last_sent_at TEXT,
                completed_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (sequence_id) REFERENCES sequences (id) ON DELETE CASCADE,
                FOREIGN KEY (email_id) REFERENCES emails (id) ON DELETE CASCADE
            )`,

            // Schedules table (for tracking scheduled sends)
            `CREATE TABLE IF NOT EXISTS schedules (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                enrollment_id TEXT NOT NULL,
                sequence_step INTEGER NOT NULL,
                scheduled_for TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed, cancelled
                sent_at TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (enrollment_id) REFERENCES enrollments (id) ON DELETE CASCADE
            )`,

            // Analytics sends table
            `CREATE TABLE IF NOT EXISTS analytics_sends (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                enrollment_id TEXT NOT NULL,
                sequence_id TEXT NOT NULL,
                email_id TEXT NOT NULL,
                step_number INTEGER NOT NULL,
                sent_at TEXT NOT NULL,
                status TEXT NOT NULL, -- sent, failed, bounced
                error_message TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (enrollment_id) REFERENCES enrollments (id) ON DELETE CASCADE
            )`
        ];

        createTableQueries.forEach((query, index) => {
            this.db.run(query, (err) => {
                if (err) {
                    console.error(`Error creating table ${index + 1}:`, err.message);
                } else {
                    console.log(`Table ${index + 1} created/verified successfully`);
                }
            });
        });
    }

    // Utility methods
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // User methods
    async createUser(userData) {
        const userId = uuidv4();
        const now = new Date().toISOString();
        
        await this.run(
            `INSERT INTO users (id, email, name, picture, created_at, last_login_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, userData.email, userData.name, userData.picture, now, now, now]
        );
        
        return userId;
    }

    async getUserByEmail(email) {
        return await this.get('SELECT * FROM users WHERE email = ?', [email]);
    }

    async getUserById(userId) {
        return await this.get('SELECT * FROM users WHERE id = ?', [userId]);
    }

    async updateUserLastLogin(userId) {
        const now = new Date().toISOString();
        await this.run(
            'UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?',
            [now, now, userId]
        );
    }

    // Token methods
    async saveTokens(userId, tokens) {
        const now = new Date().toISOString();
        
        // Check if tokens exist for user
        const existing = await this.get('SELECT user_id FROM tokens WHERE user_id = ?', [userId]);
        
        if (existing) {
            await this.run(
                `UPDATE tokens SET access_token = ?, refresh_token = ?, expiry_date = ?, updated_at = ?
                 WHERE user_id = ?`,
                [tokens.accessToken, tokens.refreshToken, tokens.expiryDate, now, userId]
            );
        } else {
            await this.run(
                `INSERT INTO tokens (user_id, access_token, refresh_token, expiry_date, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, tokens.accessToken, tokens.refreshToken, tokens.expiryDate, now, now]
            );
        }
    }

    async getTokens(userId) {
        return await this.get('SELECT * FROM tokens WHERE user_id = ?', [userId]);
    }

    async deleteTokens(userId) {
        await this.run('DELETE FROM tokens WHERE user_id = ?', [userId]);
    }

    // Email methods
    async createEmail(emailData) {
        const emailId = uuidv4();
        const now = new Date().toISOString();
        
        await this.run(
            `INSERT INTO emails (id, user_id, gmail_id, thread_id, subject, from_email, to_emails, 
             cc_emails, bcc_emails, body_text, body_html, sent_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                emailId, emailData.userId, emailData.gmailId, emailData.threadId,
                emailData.subject, emailData.fromEmail, JSON.stringify(emailData.toEmails),
                JSON.stringify(emailData.ccEmails || []), JSON.stringify(emailData.bccEmails || []),
                emailData.bodyText, emailData.bodyHtml, emailData.sentAt, now, now
            ]
        );
        
        return emailId;
    }

    async getEmailsByUser(userId, limit = 50) {
        return await this.all(
            'SELECT * FROM emails WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?',
            [userId, limit]
        );
    }

    async getEmailById(emailId) {
        return await this.get('SELECT * FROM emails WHERE id = ?', [emailId]);
    }

    async updateEmailReplyStatus(emailId, hasReply) {
        const now = new Date().toISOString();
        await this.run(
            'UPDATE emails SET has_reply = ?, reply_checked_at = ?, updated_at = ? WHERE id = ?',
            [hasReply, now, now, emailId]
        );
    }

    // Sequence methods
    async createSequence(sequenceData) {
        const sequenceId = uuidv4();
        const now = new Date().toISOString();
        
        // Extract sendWindow data
        const sendWindow = sequenceData.sendWindow || { days: [], startHour: 9, endHour: 17 };
        
        await this.run(
            `INSERT INTO sequences (id, user_id, name, description, steps, timezone, send_window_days, send_window_start_hour, send_window_end_hour, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sequenceId, 
                sequenceData.userId, 
                sequenceData.name, 
                sequenceData.description,
                JSON.stringify(sequenceData.steps), 
                sequenceData.timezone || 'America/New_York',
                JSON.stringify(sendWindow.days || []),
                sendWindow.startHour || 9,
                sendWindow.endHour || 17,
                sequenceData.isActive !== false, 
                now, 
                now
            ]
        );
        
        return sequenceId;
    }

    async getSequencesByUser(userId) {
        return await this.all('SELECT * FROM sequences WHERE user_id = ?', [userId]);
    }

    async getSequenceById(sequenceId) {
        return await this.get('SELECT * FROM sequences WHERE id = ?', [sequenceId]);
    }

    async updateSequence(sequenceId, updateData) {
        const now = new Date().toISOString();
        const fields = [];
        const values = [];
        
        if (updateData.name !== undefined) {
            fields.push('name = ?');
            values.push(updateData.name);
        }
        if (updateData.description !== undefined) {
            fields.push('description = ?');
            values.push(updateData.description);
        }
        if (updateData.steps !== undefined) {
            fields.push('steps = ?');
            values.push(JSON.stringify(updateData.steps));
        }
        if (updateData.timezone !== undefined) {
            fields.push('timezone = ?');
            values.push(updateData.timezone);
        }
        if (updateData.sendWindow !== undefined) {
            const sendWindow = updateData.sendWindow;
            if (sendWindow.days !== undefined) {
                fields.push('send_window_days = ?');
                values.push(JSON.stringify(sendWindow.days));
            }
            if (sendWindow.startHour !== undefined) {
                fields.push('send_window_start_hour = ?');
                values.push(sendWindow.startHour);
            }
            if (sendWindow.endHour !== undefined) {
                fields.push('send_window_end_hour = ?');
                values.push(sendWindow.endHour);
            }
        }
        if (updateData.isActive !== undefined) {
            fields.push('is_active = ?');
            values.push(updateData.isActive);
        }
        
        fields.push('updated_at = ?');
        values.push(now, sequenceId);
        
        await this.run(
            `UPDATE sequences SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
    }

    async deleteSequence(sequenceId) {
        await this.run('DELETE FROM sequences WHERE id = ?', [sequenceId]);
    }

    // Enrollment methods
    async createEnrollment(enrollmentData) {
        const enrollmentId = uuidv4();
        const now = new Date().toISOString();
        
        await this.run(
            `INSERT INTO enrollments (id, user_id, sequence_id, email_id, status, reply_mode, 
             current_step, next_send_date, enrolled_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                enrollmentId, enrollmentData.userId, enrollmentData.sequenceId, enrollmentData.emailId,
                enrollmentData.status || 'active', enrollmentData.replyMode || 'reply',
                0, enrollmentData.nextSendDate, now, now, now
            ]
        );
        
        return enrollmentId;
    }

    async getEnrollmentsByUser(userId, limit = 100, offset = 0) {
        return await this.all(
            `SELECT e.*, s.name as sequence_name, em.subject as email_subject, em.to_emails 
             FROM enrollments e 
             JOIN sequences s ON e.sequence_id = s.id 
             JOIN emails em ON e.email_id = em.id 
             WHERE e.user_id = ? 
             ORDER BY e.enrolled_at DESC 
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );
    }

    async getEnrollmentById(enrollmentId) {
        return await this.get(
            `SELECT e.*, s.name as sequence_name, em.subject as email_subject 
             FROM enrollments e 
             JOIN sequences s ON e.sequence_id = s.id 
             JOIN emails em ON e.email_id = em.id 
             WHERE e.id = ?`,
            [enrollmentId]
        );
    }

    async updateEnrollmentStatus(enrollmentId, status, additionalData = {}) {
        const now = new Date().toISOString();
        const fields = ['status = ?', 'updated_at = ?'];
        const values = [status, now];
        
        if (additionalData.currentStep !== undefined) {
            fields.push('current_step = ?');
            values.push(additionalData.currentStep);
        }
        if (additionalData.nextSendDate !== undefined) {
            fields.push('next_send_date = ?');
            values.push(additionalData.nextSendDate);
        }
        if (additionalData.lastSentAt !== undefined) {
            fields.push('last_sent_at = ?');
            values.push(additionalData.lastSentAt);
        }
        if (status === 'completed' && !additionalData.completedAt) {
            fields.push('completed_at = ?');
            values.push(now);
        }
        
        values.push(enrollmentId);
        
        await this.run(
            `UPDATE enrollments SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
    }

    async deleteEnrollment(enrollmentId) {
        await this.run('DELETE FROM enrollments WHERE id = ?', [enrollmentId]);
    }

    // Schedule methods
    async createSchedule(scheduleData) {
        const scheduleId = uuidv4();
        const now = new Date().toISOString();
        
        await this.run(
            `INSERT INTO schedules (id, user_id, enrollment_id, sequence_step, scheduled_for, 
             status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                scheduleId, scheduleData.userId, scheduleData.enrollmentId, scheduleData.sequenceStep,
                scheduleData.scheduledFor, 'pending', now, now
            ]
        );
        
        return scheduleId;
    }

    async getPendingSchedules(limit = 100) {
        return await this.all(
            `SELECT s.*, e.sequence_id, e.email_id 
             FROM schedules s 
             JOIN enrollments e ON s.enrollment_id = e.id 
             WHERE s.status = 'pending' AND s.scheduled_for <= ? 
             ORDER BY s.scheduled_for ASC 
             LIMIT ?`,
            [new Date().toISOString(), limit]
        );
    }

    async getSchedulesByUser(userId) {
        return await this.all(
            `SELECT s.*, e.sequence_id 
             FROM schedules s 
             JOIN enrollments e ON s.enrollment_id = e.id 
             WHERE s.user_id = ? 
             ORDER BY s.scheduled_for DESC`,
            [userId]
        );
    }

    async updateScheduleStatus(scheduleId, status, sentAt = null, errorMessage = null) {
        const now = new Date().toISOString();
        await this.run(
            `UPDATE schedules SET status = ?, sent_at = ?, error_message = ?, updated_at = ? 
             WHERE id = ?`,
            [status, sentAt, errorMessage, now, scheduleId]
        );
    }

    // Analytics methods
    async recordSend(sendData) {
        const sendId = uuidv4();
        const now = new Date().toISOString();
        
        await this.run(
            `INSERT INTO analytics_sends (id, user_id, enrollment_id, sequence_id, email_id, 
             step_number, sent_at, status, error_message, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sendId, sendData.userId, sendData.enrollmentId, sendData.sequenceId,
                sendData.emailId, sendData.stepNumber, sendData.sentAt, sendData.status,
                sendData.errorMessage, now
            ]
        );
        
        return sendId;
    }

    async getSendAnalytics(userId, dateFrom = null, dateTo = null) {
        let sql = 'SELECT * FROM analytics_sends WHERE user_id = ?';
        const params = [userId];
        
        if (dateFrom) {
            sql += ' AND sent_at >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            sql += ' AND sent_at <= ?';
            params.push(dateTo);
        }
        
        sql += ' ORDER BY sent_at DESC';
        
        return await this.all(sql, params);
    }

    async getEnrollmentAnalytics(userId) {
        return await this.all(
            `SELECT 
                status,
                COUNT(*) as count,
                AVG(current_step) as avg_step
             FROM enrollments 
             WHERE user_id = ? 
             GROUP BY status`,
            [userId]
        );
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

// Create singleton instance
const database = new Database();

module.exports = database;