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
 * Get all enrollments for user
 * GET /enrollments
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const status = req.query.status; // Optional filter by status
        
        let enrollments;
        if (status) {
            enrollments = await database.all(
                `SELECT e.*, s.name as sequence_name, em.subject as email_subject, em.to_emails 
                 FROM enrollments e 
                 JOIN sequences s ON e.sequence_id = s.id 
                 JOIN emails em ON e.email_id = em.id 
                 WHERE e.user_id = ? AND e.status = ?
                 ORDER BY e.enrolled_at DESC 
                 LIMIT ? OFFSET ?`,
                [userId, status, limit, offset]
            );
        } else {
            enrollments = await database.getEnrollmentsByUser(userId, limit, offset);
        }
        
        // Format response with sequence details
        const processedEnrollments = await Promise.all(enrollments.map(async (enrollment) => {
            // Get the full sequence data including steps
            const sequence = await database.getSequenceById(enrollment.sequence_id);
            const steps = sequence ? JSON.parse(sequence.steps || '[]') : [];
            
            return {
                id: enrollment.id,
                sequenceId: enrollment.sequence_id,
                sequenceName: enrollment.sequence_name,
                emailId: enrollment.email_id,
                emailSubject: enrollment.email_subject,
                subject: enrollment.email_subject, // Add for frontend compatibility
                to: enrollment.to_emails ? JSON.parse(enrollment.to_emails).join(', ') : 'No recipients'
                status: enrollment.status,
                replyMode: enrollment.reply_mode,
                currentStep: enrollment.current_step,
                nextSendDate: enrollment.next_send_date,
                enrolledAt: enrollment.enrolled_at,
                lastSentAt: enrollment.last_sent_at,
                completedAt: enrollment.completed_at,
                createdAt: enrollment.created_at,
                updatedAt: enrollment.updated_at,
                // Include sequence data for frontend
                sequence: {
                    id: sequence?.id,
                    name: sequence?.name || enrollment.sequence_name,
                    steps: steps
                }
            };
        }));
        
        res.json({
            success: true,
            enrollments: processedEnrollments,
            pagination: {
                limit,
                offset,
                count: processedEnrollments.length
            }
        });
        
    } catch (error) {
        console.error('Get enrollments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get enrollments'
        });
    }
});

/**
 * Create new enrollment
 * POST /enrollments
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { sequenceId, emailId, replyMode } = req.body;
        
        // Validate required fields
        if (!sequenceId || !emailId) {
            return res.status(400).json({
                success: false,
                error: 'sequenceId and emailId are required'
            });
        }
        
        // Verify sequence exists and belongs to user
        const sequence = await database.getSequenceById(sequenceId);
        if (!sequence || sequence.user_id !== userId) {
            return res.status(400).json({
                success: false,
                error: 'Invalid sequence'
            });
        }
        
        // Verify email exists and belongs to user
        const email = await database.getEmailById(emailId);
        if (!email || email.user_id !== userId) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email'
            });
        }
        
        // Check if enrollment already exists for this email and sequence
        const existingEnrollment = await database.get(
            'SELECT id FROM enrollments WHERE sequence_id = ? AND email_id = ? AND status != ?',
            [sequenceId, emailId, 'cancelled']
        );
        
        if (existingEnrollment) {
            return res.status(400).json({
                success: false,
                error: 'Email is already enrolled in this sequence'
            });
        }
        
        // Calculate next send date (first step)
        const steps = JSON.parse(sequence.steps);
        const firstStep = steps[0];
        let nextSendDate = null;
        
        if (firstStep) {
            const delayHours = getDelayInHours(firstStep);
            const sendDate = new Date();
            sendDate.setTime(sendDate.getTime() + (delayHours * 60 * 60 * 1000));
            nextSendDate = sendDate.toISOString();
        }
        
        // Create enrollment
        const enrollmentId = await database.createEnrollment({
            userId,
            sequenceId,
            emailId,
            replyMode: replyMode || 'reply',
            nextSendDate
        });
        
        // Create initial schedule entry if needed
        if (nextSendDate) {
            await database.createSchedule({
                userId,
                enrollmentId,
                sequenceStep: 0,
                scheduledFor: nextSendDate
            });
        }
        
        // Get the created enrollment
        const enrollment = await database.getEnrollmentById(enrollmentId);
        
        res.status(201).json({
            success: true,
            enrollment: {
                id: enrollment.id,
                sequenceId: enrollment.sequence_id,
                sequenceName: enrollment.sequence_name,
                emailId: enrollment.email_id,
                emailSubject: enrollment.email_subject,
                status: enrollment.status,
                replyMode: enrollment.reply_mode,
                currentStep: enrollment.current_step,
                nextSendDate: enrollment.next_send_date,
                enrolledAt: enrollment.enrolled_at,
                lastSentAt: enrollment.last_sent_at,
                completedAt: enrollment.completed_at,
                createdAt: enrollment.created_at,
                updatedAt: enrollment.updated_at
            }
        });
        
    } catch (error) {
        console.error('Create enrollment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create enrollment'
        });
    }
});

/**
 * Get specific enrollment by ID
 * GET /enrollments/{enrollmentId}
 */
router.get('/:enrollmentId', authenticateToken, async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { userId } = req.user;
        
        const enrollment = await database.getEnrollmentById(enrollmentId);
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                error: 'Enrollment not found'
            });
        }
        
        // Verify user owns this enrollment
        if (enrollment.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        res.json({
            success: true,
            enrollment: {
                id: enrollment.id,
                sequenceId: enrollment.sequence_id,
                sequenceName: enrollment.sequence_name,
                emailId: enrollment.email_id,
                emailSubject: enrollment.email_subject,
                status: enrollment.status,
                replyMode: enrollment.reply_mode,
                currentStep: enrollment.current_step,
                nextSendDate: enrollment.next_send_date,
                enrolledAt: enrollment.enrolled_at,
                lastSentAt: enrollment.last_sent_at,
                completedAt: enrollment.completed_at,
                createdAt: enrollment.created_at,
                updatedAt: enrollment.updated_at
            }
        });
        
    } catch (error) {
        console.error('Get enrollment by ID error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get enrollment'
        });
    }
});

/**
 * Update enrollment
 * PUT /enrollments/{enrollmentId}
 */
router.put('/:enrollmentId', authenticateToken, async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { userId } = req.user;
        const { status, replyMode, currentStep } = req.body;
        
        // Check if enrollment exists and belongs to user
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
        
        // Validate status if provided
        const validStatuses = ['active', 'paused', 'completed', 'cancelled'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
            });
        }
        
        // Validate reply mode if provided
        const validReplyModes = ['reply', 'reply_all'];
        if (replyMode && !validReplyModes.includes(replyMode)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid reply mode. Must be one of: ' + validReplyModes.join(', ')
            });
        }
        
        // Update enrollment
        const updateData = {};
        if (status !== undefined) updateData.status = status;
        if (replyMode !== undefined) updateData.replyMode = replyMode;
        if (currentStep !== undefined) updateData.currentStep = currentStep;
        
        await database.updateEnrollmentStatus(enrollmentId, status || enrollment.status, updateData);
        
        // Get updated enrollment
        const updatedEnrollment = await database.getEnrollmentById(enrollmentId);
        
        res.json({
            success: true,
            enrollment: {
                id: updatedEnrollment.id,
                sequenceId: updatedEnrollment.sequence_id,
                sequenceName: updatedEnrollment.sequence_name,
                emailId: updatedEnrollment.email_id,
                emailSubject: updatedEnrollment.email_subject,
                status: updatedEnrollment.status,
                replyMode: updatedEnrollment.reply_mode,
                currentStep: updatedEnrollment.current_step,
                nextSendDate: updatedEnrollment.next_send_date,
                enrolledAt: updatedEnrollment.enrolled_at,
                lastSentAt: updatedEnrollment.last_sent_at,
                completedAt: updatedEnrollment.completed_at,
                createdAt: updatedEnrollment.created_at,
                updatedAt: updatedEnrollment.updated_at
            }
        });
        
    } catch (error) {
        console.error('Update enrollment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update enrollment'
        });
    }
});

/**
 * Delete enrollment
 * DELETE /enrollments/{enrollmentId}
 */
router.delete('/:enrollmentId', authenticateToken, async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { userId } = req.user;
        
        // Check if enrollment exists and belongs to user
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
        
        // Delete enrollment (this will cascade to schedules)
        await database.deleteEnrollment(enrollmentId);
        
        res.json({
            success: true,
            message: 'Enrollment deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete enrollment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete enrollment'
        });
    }
});

/**
 * Pause enrollment
 * POST /enrollments/{enrollmentId}/pause
 */
router.post('/:enrollmentId/pause', authenticateToken, async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { userId } = req.user;
        
        // Check if enrollment exists and belongs to user
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
        
        if (enrollment.status === 'paused') {
            return res.status(400).json({
                success: false,
                error: 'Enrollment is already paused'
            });
        }
        
        if (enrollment.status === 'completed' || enrollment.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                error: 'Cannot pause completed or cancelled enrollment'
            });
        }
        
        // Update status to paused
        await database.updateEnrollmentStatus(enrollmentId, 'paused');
        
        // Cancel any pending schedules
        await database.run(
            'UPDATE schedules SET status = ? WHERE enrollment_id = ? AND status = ?',
            ['cancelled', enrollmentId, 'pending']
        );
        
        res.json({
            success: true,
            message: 'Enrollment paused successfully'
        });
        
    } catch (error) {
        console.error('Pause enrollment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to pause enrollment'
        });
    }
});

/**
 * Resume enrollment
 * POST /enrollments/{enrollmentId}/resume
 */
router.post('/:enrollmentId/resume', authenticateToken, async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { userId } = req.user;
        
        // Check if enrollment exists and belongs to user
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
        
        if (enrollment.status !== 'paused') {
            return res.status(400).json({
                success: false,
                error: 'Only paused enrollments can be resumed'
            });
        }
        
        // Get sequence to calculate next send date
        const sequence = await database.getSequenceById(enrollment.sequence_id);
        const steps = JSON.parse(sequence.steps);
        
        let nextSendDate = null;
        const nextStepIndex = enrollment.current_step;
        
        if (nextStepIndex < steps.length) {
            const nextStep = steps[nextStepIndex];
            const sendDate = new Date();
            const delayHours = getDelayInHours(nextStep);
            sendDate.setTime(sendDate.getTime() + (delayHours * 60 * 60 * 1000));
            nextSendDate = sendDate.toISOString();
            
            // Create new schedule
            await database.createSchedule({
                userId,
                enrollmentId,
                sequenceStep: nextStepIndex,
                scheduledFor: nextSendDate
            });
        }
        
        // Update status to active
        await database.updateEnrollmentStatus(enrollmentId, 'active', { nextSendDate });
        
        res.json({
            success: true,
            message: 'Enrollment resumed successfully',
            nextSendDate
        });
        
    } catch (error) {
        console.error('Resume enrollment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resume enrollment'
        });
    }
});

module.exports = router;