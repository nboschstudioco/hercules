const express = require('express');
const { google } = require('googleapis');
const database = require('../database');
const router = express.Router();

// Import auth middleware
const { authenticateToken } = require('./auth');

/**
 * Save/create email record
 * POST /emails
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { id, threadId, subject, fromEmail, to, cc, bcc, sentAt } = req.body;
        
        // Validate required fields
        if (!id || !subject) {
            return res.status(400).json({
                success: false,
                error: 'Email ID and subject are required'
            });
        }
        
        // Check if email already exists
        const existingEmail = await database.get(
            'SELECT id FROM emails WHERE user_id = ? AND gmail_id = ?',
            [userId, id]
        );
        
        if (existingEmail) {
            return res.json({
                success: true,
                message: 'Email already exists',
                emailId: id
            });
        }
        
        // Parse recipients into arrays
        const toEmails = to ? to.split(',').map(email => email.trim()) : [];
        const ccEmails = cc ? cc.split(',').map(email => email.trim()) : [];
        const bccEmails = bcc ? bcc.split(',').map(email => email.trim()) : [];
        
        // Create email record
        const emailData = {
            userId,
            gmailId: id,
            threadId: threadId || null,
            subject,
            fromEmail: fromEmail || 'unknown@gmail.com',
            toEmails: JSON.stringify(toEmails),
            ccEmails: JSON.stringify(ccEmails),
            bccEmails: JSON.stringify(bccEmails),
            sentAt: sentAt || new Date().toISOString()
        };
        
        await database.createEmail(emailData);
        
        res.json({
            success: true,
            message: 'Email saved successfully',
            emailId: id
        });
        
    } catch (error) {
        console.error('Save email error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save email'
        });
    }
});

/**
 * Get recent sent emails
 * GET /emails/sent
 */
router.get('/sent', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const limit = parseInt(req.query.limit) || 50;
        
        const emails = await database.getEmailsByUser(userId, limit);
        
        // Parse JSON fields
        const processedEmails = emails.map(email => {
            let toEmails, ccEmails, bccEmails;
            
            try {
                toEmails = JSON.parse(email.to_emails || '[]');
                ccEmails = JSON.parse(email.cc_emails || '[]');
                bccEmails = JSON.parse(email.bcc_emails || '[]');
            } catch (parseError) {
                console.error('Error parsing email recipients for email', email.id, parseError);
                toEmails = [];
                ccEmails = [];
                bccEmails = [];
            }
            
            // Ensure arrays are valid before calling join
            const toEmailsArray = Array.isArray(toEmails) ? toEmails : [];
            const ccEmailsArray = Array.isArray(ccEmails) ? ccEmails : [];
            const bccEmailsArray = Array.isArray(bccEmails) ? bccEmails : [];
            
            return {
                id: email.id,
                gmailId: email.gmail_id,
                threadId: email.thread_id,
                subject: email.subject,
                fromEmail: email.from_email,
                // Array format for new API consumers
                toEmails: toEmailsArray,
                ccEmails: ccEmailsArray,
                bccEmails: bccEmailsArray,
                // String format for frontend compatibility
                to: toEmailsArray.join(', '),
                cc: ccEmailsArray.join(', '),
                bcc: bccEmailsArray.join(', '),
                bodyText: email.body_text,
                bodyHtml: email.body_html,
                sentAt: email.sent_at,
                hasReply: email.has_reply,
                replyCheckedAt: email.reply_checked_at,
                createdAt: email.created_at,
                updatedAt: email.updated_at
            };
        });
        
        res.json({
            success: true,
            emails: processedEmails,
            count: processedEmails.length
        });
        
    } catch (error) {
        console.error('Get sent emails error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sent emails'
        });
    }
});

/**
 * Get specific sent email by ID
 * GET /emails/sent/{emailId}
 */
router.get('/sent/:emailId', authenticateToken, async (req, res) => {
    try {
        const { emailId } = req.params;
        const { userId } = req.user;
        
        const email = await database.getEmailById(emailId);
        
        if (!email) {
            return res.status(404).json({
                success: false,
                error: 'Email not found'
            });
        }
        
        // Verify user owns this email
        if (email.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        // Parse JSON fields and format response  
        const toEmails = JSON.parse(email.to_emails || '[]');
        const ccEmails = JSON.parse(email.cc_emails || '[]');
        const bccEmails = JSON.parse(email.bcc_emails || '[]');
        
        const processedEmail = {
            id: email.id,
            gmailId: email.gmail_id,
            threadId: email.thread_id,
            subject: email.subject,
            fromEmail: email.from_email,
            // Array format for new API consumers
            toEmails,
            ccEmails,
            bccEmails,
            // String format for frontend compatibility
            to: toEmails.join(', '),
            cc: ccEmails.join(', '),
            bcc: bccEmails.join(', '),
            bodyText: email.body_text,
            bodyHtml: email.body_html,
            sentAt: email.sent_at,
            hasReply: email.has_reply,
            replyCheckedAt: email.reply_checked_at,
            createdAt: email.created_at,
            updatedAt: email.updated_at
        };
        
        res.json({
            success: true,
            email: processedEmail
        });
        
    } catch (error) {
        console.error('Get email by ID error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get email'
        });
    }
});

/**
 * Trigger Gmail inbox sync
 * POST /emails/sync
 */
router.post('/sync', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        
        // Get user's Gmail token
        const userTokens = await database.getTokens(userId);
        if (!userTokens) {
            return res.status(401).json({
                success: false,
                error: 'No Gmail access token found'
            });
        }
        
        // Set up Gmail API client
        const auth = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        
        auth.setCredentials({
            access_token: userTokens.access_token,
            refresh_token: userTokens.refresh_token
        });
        
        const gmail = google.gmail({ version: 'v1', auth });
        
        // Get recent sent emails from Gmail
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: 'in:sent',
            maxResults: 50
        });
        
        let syncedCount = 0;
        
        if (response.data.messages) {
            for (const message of response.data.messages) {
                try {
                    // Get full message details
                    const messageDetails = await gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'full'
                    });
                    
                    const headers = messageDetails.data.payload.headers;
                    const subject = headers.find(h => h.name === 'Subject')?.value || '';
                    const fromEmail = headers.find(h => h.name === 'From')?.value || '';
                    
                    // Extract recipient headers with better parsing
                    const toHeader = headers.find(h => h.name === 'To')?.value || '';
                    const ccHeader = headers.find(h => h.name === 'Cc')?.value || '';
                    const bccHeader = headers.find(h => h.name === 'Bcc')?.value || '';
                    
                    const toEmails = toHeader ? toHeader.split(',').map(e => e.trim()).filter(e => e) : [];
                    const ccEmails = ccHeader ? ccHeader.split(',').map(e => e.trim()).filter(e => e) : [];
                    const bccEmails = bccHeader ? bccHeader.split(',').map(e => e.trim()).filter(e => e) : [];
                    const sentDate = headers.find(h => h.name === 'Date')?.value || '';
                    
                    // Debug logging for first few emails
                    if (syncedCount < 3) {
                        console.log(`📧 Email ${message.id}:`, {
                            subject,
                            toHeader: toHeader || 'NO TO HEADER',
                            toEmails: toEmails.length ? toEmails : 'NO TO EMAILS',
                            ccHeader: ccHeader || 'NO CC HEADER',
                            totalHeaders: headers.length
                        });
                    }
                    
                    // Extract body text (simplified)
                    let bodyText = '';
                    let bodyHtml = '';
                    if (messageDetails.data.payload.body?.data) {
                        bodyText = Buffer.from(messageDetails.data.payload.body.data, 'base64').toString();
                    }
                    
                    // Check if this email already exists
                    const existingEmail = await database.get(
                        'SELECT id FROM emails WHERE gmail_id = ? AND user_id = ?',
                        [message.id, userId]
                    );
                    
                    if (!existingEmail) {
                        // Create new email record
                        await database.createEmail({
                            userId,
                            gmailId: message.id,
                            threadId: messageDetails.data.threadId,
                            subject,
                            fromEmail,
                            toEmails,
                            ccEmails,
                            bccEmails,
                            bodyText,
                            bodyHtml,
                            sentAt: new Date(sentDate).toISOString()
                        });
                        syncedCount++;
                    }
                    
                } catch (emailError) {
                    console.error('Error syncing individual email:', message.id, emailError.message);
                    // Continue with other emails
                }
            }
        }
        
        res.json({
            success: true,
            message: 'Gmail sync completed',
            syncedCount,
            totalMessages: response.data.messages?.length || 0
        });
        
    } catch (error) {
        console.error('Gmail sync error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync Gmail'
        });
    }
});

/**
 * Check for replies to specific emails
 * POST /emails/check-replies
 */
router.post('/check-replies', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { emailIds } = req.body; // Array of email IDs to check
        
        if (!emailIds || !Array.isArray(emailIds)) {
            return res.status(400).json({
                success: false,
                error: 'emailIds array is required'
            });
        }
        
        // Get user's Gmail token
        const userTokens = await database.getTokens(userId);
        if (!userTokens) {
            return res.status(401).json({
                success: false,
                error: 'No Gmail access token found'
            });
        }
        
        // Set up Gmail API client
        const auth = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        
        auth.setCredentials({
            access_token: userTokens.access_token,
            refresh_token: userTokens.refresh_token
        });
        
        const gmail = google.gmail({ version: 'v1', auth });
        
        let checkedCount = 0;
        let repliesFound = 0;
        
        for (const emailId of emailIds) {
            try {
                const email = await database.getEmailById(emailId);
                
                if (!email || email.user_id !== userId) {
                    continue; // Skip if email not found or doesn't belong to user
                }
                
                // Check for replies in the thread
                const threadResponse = await gmail.users.threads.get({
                    userId: 'me',
                    id: email.thread_id
                });
                
                // Count messages in thread (more than 1 means there are replies)
                const messageCount = threadResponse.data.messages?.length || 1;
                const hasReply = messageCount > 1;
                
                // Update email reply status
                await database.updateEmailReplyStatus(emailId, hasReply);
                
                if (hasReply) {
                    repliesFound++;
                }
                
                checkedCount++;
                
            } catch (emailError) {
                console.error('Error checking replies for email:', emailId, emailError);
                // Continue with other emails
            }
        }
        
        res.json({
            success: true,
            message: 'Reply check completed',
            checkedCount,
            repliesFound
        });
        
    } catch (error) {
        console.error('Check replies error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check replies'
        });
    }
});

module.exports = router;