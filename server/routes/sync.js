const express = require('express');
const database = require('../database');
const router = express.Router();

// Import auth middleware
const { authenticateToken } = require('./auth');

/**
 * Full sync endpoint - sync Gmail and process pending schedules
 * POST /sync
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        
        // Step 1: Sync recent emails from Gmail
        const emailSyncResult = await syncGmailEmails(userId);
        
        // Step 2: Check for replies on existing emails
        const replyCheckResult = await checkEmailReplies(userId);
        
        // Step 3: Process pending schedules
        const scheduleProcessResult = await processPendingSchedules(userId);
        
        // Step 4: Update enrollment statuses based on replies
        const enrollmentUpdateResult = await updateEnrollmentStatuses(userId);
        
        res.json({
            success: true,
            message: 'Full sync completed',
            results: {
                emailSync: emailSyncResult,
                replyCheck: replyCheckResult,
                scheduleProcessing: scheduleProcessResult,
                enrollmentUpdates: enrollmentUpdateResult
            },
            syncedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Full sync error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to complete sync'
        });
    }
});

/**
 * Sync emails from Gmail
 */
async function syncGmailEmails(userId) {
    try {
        // Get user's Gmail token
        const userTokens = await database.getTokens(userId);
        if (!userTokens) {
            return { error: 'No Gmail access token found' };
        }
        
        // This is a simplified version - in a real implementation,
        // you would call the Gmail API here
        // For MVP, we'll mock this functionality
        
        return {
            message: 'Email sync completed (mocked for MVP)',
            syncedCount: 0,
            newEmails: 0
        };
        
    } catch (error) {
        console.error('Email sync error:', error);
        return { error: 'Failed to sync emails' };
    }
}

/**
 * Check for replies on enrolled emails
 */
async function checkEmailReplies(userId) {
    try {
        // Get all active enrollments for the user
        const activeEnrollments = await database.all(
            `SELECT e.*, em.thread_id, em.gmail_id 
             FROM enrollments e 
             JOIN emails em ON e.email_id = em.id 
             WHERE e.user_id = ? AND e.status = 'active'`,
            [userId]
        );
        
        let checkedCount = 0;
        let repliesFound = 0;
        
        // For MVP, mock the reply checking
        // In a real implementation, you would check Gmail API for replies
        for (const enrollment of activeEnrollments) {
            // Mock reply check - randomly assign some emails as having replies
            const hasReply = Math.random() < 0.1; // 10% chance of reply
            
            if (hasReply) {
                await database.updateEmailReplyStatus(enrollment.email_id, true);
                repliesFound++;
            }
            
            checkedCount++;
        }
        
        return {
            message: 'Reply check completed',
            checkedCount,
            repliesFound
        };
        
    } catch (error) {
        console.error('Reply check error:', error);
        return { error: 'Failed to check replies' };
    }
}

/**
 * Process pending schedules (send follow-ups)
 */
async function processPendingSchedules(userId) {
    try {
        // Get pending schedules that are due
        const pendingSchedules = await database.all(
            `SELECT s.*, e.sequence_id, e.email_id, e.reply_mode
             FROM schedules s 
             JOIN enrollments e ON s.enrollment_id = e.id 
             WHERE s.user_id = ? AND s.status = 'pending' AND s.scheduled_for <= ?
             ORDER BY s.scheduled_for ASC`,
            [userId, new Date().toISOString()]
        );
        
        let processedCount = 0;
        let sentCount = 0;
        let failedCount = 0;
        
        for (const schedule of pendingSchedules) {
            try {
                // Check if the enrollment is still active
                const enrollment = await database.getEnrollmentById(schedule.enrollment_id);
                
                if (!enrollment || enrollment.status !== 'active') {
                    // Mark schedule as cancelled
                    await database.updateScheduleStatus(schedule.id, 'cancelled');
                    processedCount++;
                    continue;
                }
                
                // Check if the original email has received a reply
                const email = await database.getEmailById(enrollment.email_id);
                if (email && email.has_reply) {
                    // Stop the sequence if there's a reply
                    await database.updateEnrollmentStatus(enrollment.id, 'completed');
                    await database.updateScheduleStatus(schedule.id, 'cancelled');
                    processedCount++;
                    continue;
                }
                
                // Get sequence details
                const sequence = await database.getSequenceById(schedule.sequence_id);
                const steps = JSON.parse(sequence.steps);
                const step = steps[schedule.sequence_step];
                
                if (!step) {
                    await database.updateScheduleStatus(schedule.id, 'failed', null, 'Step not found');
                    failedCount++;
                    processedCount++;
                    continue;
                }
                
                // For MVP, mock the email sending
                const sendResult = await mockSendEmail(userId, enrollment, step);
                const now = new Date().toISOString();
                
                if (sendResult.success) {
                    // Mark schedule as sent
                    await database.updateScheduleStatus(schedule.id, 'sent', now);
                    
                    // Record the send in analytics
                    await database.recordSend({
                        userId,
                        enrollmentId: enrollment.id,
                        sequenceId: enrollment.sequence_id,
                        emailId: enrollment.email_id,
                        stepNumber: schedule.sequence_step,
                        sentAt: now,
                        status: 'sent'
                    });
                    
                    // Update enrollment progress
                    const nextStep = schedule.sequence_step + 1;
                    let nextSendDate = null;
                    
                    if (nextStep < steps.length) {
                        // Schedule next step
                        const nextStepData = steps[nextStep];
                        const sendDate = new Date();
                        sendDate.setDate(sendDate.getDate() + (nextStepData.delayDays || 1));
                        nextSendDate = sendDate.toISOString();
                        
                        await database.createSchedule({
                            userId,
                            enrollmentId: enrollment.id,
                            sequenceStep: nextStep,
                            scheduledFor: nextSendDate
                        });
                    }
                    
                    // Update enrollment
                    const updateData = {
                        currentStep: nextStep,
                        lastSentAt: now,
                        nextSendDate
                    };
                    
                    const newStatus = nextStep >= steps.length ? 'completed' : 'active';
                    await database.updateEnrollmentStatus(enrollment.id, newStatus, updateData);
                    
                    sentCount++;
                } else {
                    // Mark schedule as failed
                    await database.updateScheduleStatus(schedule.id, 'failed', null, sendResult.error);
                    failedCount++;
                }
                
                processedCount++;
                
            } catch (scheduleError) {
                console.error('Error processing schedule:', schedule.id, scheduleError);
                await database.updateScheduleStatus(schedule.id, 'failed', null, scheduleError.message);
                failedCount++;
                processedCount++;
            }
        }
        
        return {
            message: 'Schedule processing completed',
            processedCount,
            sentCount,
            failedCount
        };
        
    } catch (error) {
        console.error('Schedule processing error:', error);
        return { error: 'Failed to process schedules' };
    }
}

/**
 * Update enrollment statuses based on email replies
 */
async function updateEnrollmentStatuses(userId) {
    try {
        // Find enrollments where the original email has received a reply
        const enrollmentsWithReplies = await database.all(
            `SELECT e.* 
             FROM enrollments e 
             JOIN emails em ON e.email_id = em.id 
             WHERE e.user_id = ? AND e.status = 'active' AND em.has_reply = 1`,
            [userId]
        );
        
        let updatedCount = 0;
        
        for (const enrollment of enrollmentsWithReplies) {
            // Mark enrollment as completed due to reply
            await database.updateEnrollmentStatus(enrollment.id, 'completed');
            
            // Cancel any pending schedules for this enrollment
            await database.run(
                'UPDATE schedules SET status = ?, error_message = ? WHERE enrollment_id = ? AND status = ?',
                ['cancelled', 'Reply received', enrollment.id, 'pending']
            );
            
            updatedCount++;
        }
        
        return {
            message: 'Enrollment status updates completed',
            updatedCount
        };
        
    } catch (error) {
        console.error('Enrollment update error:', error);
        return { error: 'Failed to update enrollment statuses' };
    }
}

/**
 * Mock email sending for MVP
 */
async function mockSendEmail(userId, enrollment, step) {
    // For MVP, simulate email sending
    // In production, this would integrate with Gmail API to send actual emails
    
    // Mock a 95% success rate
    const success = Math.random() < 0.95;
    
    if (success) {
        console.log(`[MOCK SEND] User ${userId}, Enrollment ${enrollment.id}, Step: "${step.subject}"`);
        return { success: true };
    } else {
        return { success: false, error: 'Mock sending failure' };
    }
}

module.exports = router;