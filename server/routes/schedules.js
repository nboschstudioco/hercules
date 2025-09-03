const express = require('express');
const database = require('../database');
const router = express.Router();

// Import auth middleware
const { authenticateToken } = require('./auth');

/**
 * Convert step delay to hours for consistent scheduling
 * Supports both legacy delayDays and new delayUnit/delayValue format
 */
function getDelayInHours(step) {
    // Legacy format: delayDays
    if (typeof step.delayDays === 'number' && step.delayDays >= 0) {
        return step.delayDays * 24; // Convert days to hours
    }
    
    // New format: delayUnit + delayValue
    if (step.delayUnit && typeof step.delayValue === 'number' && step.delayValue > 0) {
        switch (step.delayUnit) {
            case 'hours':
                return step.delayValue;
            case 'days':
                return step.delayValue * 24;
            case 'weeks':
                return step.delayValue * 24 * 7;
            default:
                return 24; // Default to 1 day
        }
    }
    
    return 24; // Default to 1 day if no valid delay found
}

/**
 * Get all schedules for user
 * GET /schedules
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const status = req.query.status; // Optional filter by status
        
        let schedules;
        if (status) {
            schedules = await database.all(
                `SELECT s.*, e.sequence_id, seq.name as sequence_name, em.subject as email_subject
                 FROM schedules s 
                 JOIN enrollments e ON s.enrollment_id = e.id 
                 JOIN sequences seq ON e.sequence_id = seq.id
                 JOIN emails em ON e.email_id = em.id
                 WHERE s.user_id = ? AND s.status = ?
                 ORDER BY s.scheduled_for ASC`,
                [userId, status]
            );
        } else {
            schedules = await database.all(
                `SELECT s.*, e.sequence_id, seq.name as sequence_name, em.subject as email_subject
                 FROM schedules s 
                 JOIN enrollments e ON s.enrollment_id = e.id 
                 JOIN sequences seq ON e.sequence_id = seq.id
                 JOIN emails em ON e.email_id = em.id
                 WHERE s.user_id = ? 
                 ORDER BY s.scheduled_for ASC`,
                [userId]
            );
        }
        
        // Format response
        const processedSchedules = schedules.map(schedule => ({
            id: schedule.id,
            enrollmentId: schedule.enrollment_id,
            sequenceId: schedule.sequence_id,
            sequenceName: schedule.sequence_name,
            emailSubject: schedule.email_subject,
            sequenceStep: schedule.sequence_step,
            scheduledFor: schedule.scheduled_for,
            status: schedule.status,
            sentAt: schedule.sent_at,
            errorMessage: schedule.error_message,
            createdAt: schedule.created_at,
            updatedAt: schedule.updated_at
        }));
        
        res.json({
            success: true,
            schedules: processedSchedules
        });
        
    } catch (error) {
        console.error('Get schedules error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get schedules'
        });
    }
});

/**
 * Manually trigger a follow-up send for an enrollment
 * POST /schedules/{enrollmentId}/trigger
 */
router.post('/:enrollmentId/trigger', authenticateToken, async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { userId } = req.user;
        const { stepIndex } = req.body; // Optional: specific step to trigger
        
        // Verify enrollment exists and belongs to user
        const enrollment = await database.getEnrollmentById(enrollmentId);
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                error: 'Enrollment not found'
            });
        }
        
        if (enrollment.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        if (enrollment.status !== 'active') {
            return res.status(400).json({
                success: false,
                error: 'Can only trigger sends for active enrollments'
            });
        }
        
        // Get sequence details
        const sequence = await database.getSequenceById(enrollment.sequence_id);
        const steps = JSON.parse(sequence.steps);
        
        // Determine which step to send
        const targetStep = stepIndex !== undefined ? stepIndex : enrollment.current_step;
        
        if (targetStep >= steps.length) {
            return res.status(400).json({
                success: false,
                error: 'Step index out of range'
            });
        }
        
        const step = steps[targetStep];
        
        // Get original email details
        const email = await database.getEmailById(enrollment.email_id);
        
        // For MVP, mock the email sending process
        const now = new Date().toISOString();
        const sendSuccess = true; // Mock success
        
        // Record the send in analytics
        await database.recordSend({
            userId,
            enrollmentId,
            sequenceId: enrollment.sequence_id,
            emailId: enrollment.email_id,
            stepNumber: targetStep,
            sentAt: now,
            status: sendSuccess ? 'sent' : 'failed',
            errorMessage: sendSuccess ? null : 'Mock error for testing'
        });
        
        if (sendSuccess) {
            // Update enrollment progress
            const nextStep = targetStep + 1;
            let nextSendDate = null;
            
            if (nextStep < steps.length) {
                // Calculate next send date
                const nextStepData = steps[nextStep];
                const sendDate = new Date();
                const delayHours = getDelayInHours(nextStepData);
                sendDate.setTime(sendDate.getTime() + (delayHours * 60 * 60 * 1000));
                nextSendDate = sendDate.toISOString();
                
                // Create next schedule
                await database.createSchedule({
                    userId,
                    enrollmentId,
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
            await database.updateEnrollmentStatus(enrollmentId, newStatus, updateData);
            
            // Update any existing schedule for this step
            await database.run(
                'UPDATE schedules SET status = ?, sent_at = ? WHERE enrollment_id = ? AND sequence_step = ? AND status = ?',
                ['sent', now, enrollmentId, targetStep, 'pending']
            );
            
            res.json({
                success: true,
                message: 'Follow-up triggered successfully',
                sendDetails: {
                    stepNumber: targetStep,
                    subject: step.subject,
                    sentAt: now,
                    nextSendDate,
                    enrollmentCompleted: nextStep >= steps.length
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to send follow-up email'
            });
        }
        
    } catch (error) {
        console.error('Trigger send error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to trigger send'
        });
    }
});

/**
 * Get health status of the scheduling system
 * GET /schedules/health
 */
router.get('/health', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        
        // Get pending schedules count
        const pendingSchedules = await database.all(
            'SELECT COUNT(*) as count FROM schedules WHERE user_id = ? AND status = ?',
            [userId, 'pending']
        );
        
        // Get overdue schedules (should have been sent by now)
        const overdueSchedules = await database.all(
            'SELECT COUNT(*) as count FROM schedules WHERE user_id = ? AND status = ? AND scheduled_for < ?',
            [userId, 'pending', new Date().toISOString()]
        );
        
        // Get recent sends (last 24 hours)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const recentSends = await database.all(
            'SELECT COUNT(*) as count FROM schedules WHERE user_id = ? AND status = ? AND sent_at > ?',
            [userId, 'sent', yesterday.toISOString()]
        );
        
        // Get failed sends (last 7 days)
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        
        const failedSends = await database.all(
            'SELECT COUNT(*) as count FROM schedules WHERE user_id = ? AND status = ? AND created_at > ?',
            [userId, 'failed', lastWeek.toISOString()]
        );
        
        // Get active enrollments count
        const activeEnrollments = await database.all(
            'SELECT COUNT(*) as count FROM enrollments WHERE user_id = ? AND status = ?',
            [userId, 'active']
        );
        
        res.json({
            success: true,
            health: {
                pendingSchedules: pendingSchedules[0]?.count || 0,
                overdueSchedules: overdueSchedules[0]?.count || 0,
                recentSends: recentSends[0]?.count || 0,
                failedSends: failedSends[0]?.count || 0,
                activeEnrollments: activeEnrollments[0]?.count || 0,
                lastChecked: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Get schedules health error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get schedules health'
        });
    }
});

module.exports = router;