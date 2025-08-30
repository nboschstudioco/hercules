const express = require('express');
const database = require('../database');
const router = express.Router();

// Import auth middleware
const { authenticateToken } = require('./auth');

/**
 * Get send analytics
 * GET /analytics/sends
 */
router.get('/sends', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { dateFrom, dateTo, sequenceId } = req.query;
        
        // Build query conditions
        let whereConditions = ['user_id = ?'];
        let queryParams = [userId];
        
        if (dateFrom) {
            whereConditions.push('sent_at >= ?');
            queryParams.push(dateFrom);
        }
        
        if (dateTo) {
            whereConditions.push('sent_at <= ?');
            queryParams.push(dateTo);
        }
        
        if (sequenceId) {
            whereConditions.push('sequence_id = ?');
            queryParams.push(sequenceId);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Get detailed send records
        const sends = await database.all(
            `SELECT * FROM analytics_sends WHERE ${whereClause} ORDER BY sent_at DESC`,
            queryParams
        );
        
        // Get summary statistics
        const totalSends = await database.get(
            `SELECT COUNT(*) as count FROM analytics_sends WHERE ${whereClause}`,
            queryParams
        );
        
        const successfulSends = await database.get(
            `SELECT COUNT(*) as count FROM analytics_sends WHERE ${whereClause} AND status = 'sent'`,
            queryParams
        );
        
        const failedSends = await database.get(
            `SELECT COUNT(*) as count FROM analytics_sends WHERE ${whereClause} AND status = 'failed'`,
            queryParams
        );
        
        // Get sends by sequence
        const sendsBySequence = await database.all(
            `SELECT s.sequence_id, seq.name, COUNT(*) as sends, 
                    SUM(CASE WHEN s.status = 'sent' THEN 1 ELSE 0 END) as successful
             FROM analytics_sends s
             JOIN sequences seq ON s.sequence_id = seq.id
             WHERE ${whereClause}
             GROUP BY s.sequence_id, seq.name
             ORDER BY sends DESC`,
            queryParams
        );
        
        // Get sends by day (last 30 days or custom range)
        const sendsByDay = await database.all(
            `SELECT DATE(sent_at) as date, COUNT(*) as sends,
                    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful
             FROM analytics_sends 
             WHERE ${whereClause}
             GROUP BY DATE(sent_at)
             ORDER BY date DESC`,
            queryParams
        );
        
        res.json({
            success: true,
            analytics: {
                summary: {
                    totalSends: totalSends.count,
                    successfulSends: successfulSends.count,
                    failedSends: failedSends.count,
                    successRate: totalSends.count > 0 ? 
                        (successfulSends.count / totalSends.count * 100).toFixed(2) : 0
                },
                sendsBySequence: sendsBySequence.map(item => ({
                    sequenceId: item.sequence_id,
                    sequenceName: item.name,
                    totalSends: item.sends,
                    successfulSends: item.successful,
                    successRate: item.sends > 0 ? 
                        (item.successful / item.sends * 100).toFixed(2) : 0
                })),
                sendsByDay: sendsByDay.map(item => ({
                    date: item.date,
                    totalSends: item.sends,
                    successfulSends: item.successful,
                    successRate: item.sends > 0 ? 
                        (item.successful / item.sends * 100).toFixed(2) : 0
                })),
                recentSends: sends.slice(0, 50).map(send => ({
                    id: send.id,
                    enrollmentId: send.enrollment_id,
                    sequenceId: send.sequence_id,
                    emailId: send.email_id,
                    stepNumber: send.step_number,
                    sentAt: send.sent_at,
                    status: send.status,
                    errorMessage: send.error_message
                }))
            }
        });
        
    } catch (error) {
        console.error('Get send analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get send analytics'
        });
    }
});

/**
 * Get enrollment analytics
 * GET /analytics/enrollments
 */
router.get('/enrollments', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { sequenceId } = req.query;
        
        // Build query conditions
        let whereConditions = ['user_id = ?'];
        let queryParams = [userId];
        
        if (sequenceId) {
            whereConditions.push('sequence_id = ?');
            queryParams.push(sequenceId);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Get enrollment status breakdown
        const enrollmentsByStatus = await database.getEnrollmentAnalytics(userId);
        
        // Get enrollments by sequence
        const enrollmentsBySequence = await database.all(
            `SELECT e.sequence_id, s.name, COUNT(*) as total_enrollments,
                    SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN e.status = 'paused' THEN 1 ELSE 0 END) as paused,
                    SUM(CASE WHEN e.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                    AVG(e.current_step) as avg_step_reached
             FROM enrollments e
             JOIN sequences s ON e.sequence_id = s.id
             WHERE ${whereClause}
             GROUP BY e.sequence_id, s.name
             ORDER BY total_enrollments DESC`,
            queryParams
        );
        
        // Get completion rates by sequence
        const completionRates = await database.all(
            `SELECT e.sequence_id, s.name, 
                    COUNT(*) as total_enrollments,
                    SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) as completed,
                    (SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as completion_rate
             FROM enrollments e
             JOIN sequences s ON e.sequence_id = s.id
             WHERE ${whereClause}
             GROUP BY e.sequence_id, s.name
             HAVING COUNT(*) > 0
             ORDER BY completion_rate DESC`,
            queryParams
        );
        
        // Get enrollment trends (last 30 days)
        const enrollmentTrends = await database.all(
            `SELECT DATE(enrolled_at) as date, COUNT(*) as new_enrollments
             FROM enrollments 
             WHERE ${whereClause} AND enrolled_at >= DATE('now', '-30 days')
             GROUP BY DATE(enrolled_at)
             ORDER BY date DESC`,
            queryParams
        );
        
        // Get average time to completion
        const completionStats = await database.get(
            `SELECT AVG(JULIANDAY(completed_at) - JULIANDAY(enrolled_at)) as avg_days_to_complete,
                    COUNT(*) as completed_count
             FROM enrollments 
             WHERE ${whereClause} AND status = 'completed' AND completed_at IS NOT NULL`,
            queryParams
        );
        
        res.json({
            success: true,
            analytics: {
                statusBreakdown: enrollmentsByStatus.map(item => ({
                    status: item.status,
                    count: item.count,
                    averageStep: parseFloat(item.avg_step || 0).toFixed(1)
                })),
                bySequence: enrollmentsBySequence.map(item => ({
                    sequenceId: item.sequence_id,
                    sequenceName: item.name,
                    totalEnrollments: item.total_enrollments,
                    active: item.active,
                    completed: item.completed,
                    paused: item.paused,
                    cancelled: item.cancelled,
                    averageStepReached: parseFloat(item.avg_step_reached || 0).toFixed(1)
                })),
                completionRates: completionRates.map(item => ({
                    sequenceId: item.sequence_id,
                    sequenceName: item.name,
                    totalEnrollments: item.total_enrollments,
                    completedEnrollments: item.completed,
                    completionRate: parseFloat(item.completion_rate || 0).toFixed(2)
                })),
                trends: {
                    enrollmentsByDay: enrollmentTrends.map(item => ({
                        date: item.date,
                        newEnrollments: item.new_enrollments
                    })),
                    averageDaysToComplete: completionStats?.avg_days_to_complete ? 
                        parseFloat(completionStats.avg_days_to_complete).toFixed(1) : null,
                    totalCompleted: completionStats?.completed_count || 0
                }
            }
        });
        
    } catch (error) {
        console.error('Get enrollment analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get enrollment analytics'
        });
    }
});

module.exports = router;