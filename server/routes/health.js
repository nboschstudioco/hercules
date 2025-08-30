const express = require('express');
const database = require('../database');
const router = express.Router();

/**
 * System health check
 * GET /health
 */
router.get('/', async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Test database connectivity
        let dbStatus = 'healthy';
        let dbResponseTime = 0;
        
        try {
            const dbStart = Date.now();
            await database.get('SELECT 1 as test');
            dbResponseTime = Date.now() - dbStart;
        } catch (dbError) {
            dbStatus = 'unhealthy';
            console.error('Database health check failed:', dbError);
        }
        
        // Get system statistics
        const stats = await getSystemStats();
        
        const totalResponseTime = Date.now() - startTime;
        const isHealthy = dbStatus === 'healthy' && totalResponseTime < 5000;
        
        const healthData = {
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            responseTime: totalResponseTime,
            database: {
                status: dbStatus,
                responseTime: dbResponseTime
            },
            statistics: stats
        };
        
        // Return appropriate status code
        const statusCode = isHealthy ? 200 : 503;
        res.status(statusCode).json(healthData);
        
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            message: error.message
        });
    }
});

/**
 * Get system statistics
 */
async function getSystemStats() {
    try {
        // Get total counts
        const [
            totalUsers,
            totalSequences, 
            totalEmails,
            totalEnrollments,
            totalSchedules,
            activeEnrollments,
            pendingSchedules,
            recentSends
        ] = await Promise.all([
            database.get('SELECT COUNT(*) as count FROM users'),
            database.get('SELECT COUNT(*) as count FROM sequences'),
            database.get('SELECT COUNT(*) as count FROM emails'),
            database.get('SELECT COUNT(*) as count FROM enrollments'),
            database.get('SELECT COUNT(*) as count FROM schedules'),
            database.get('SELECT COUNT(*) as count FROM enrollments WHERE status = ?', ['active']),
            database.get('SELECT COUNT(*) as count FROM schedules WHERE status = ?', ['pending']),
            database.get('SELECT COUNT(*) as count FROM analytics_sends WHERE sent_at > ?', [
                new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            ])
        ]);
        
        return {
            users: totalUsers.count,
            sequences: totalSequences.count,
            emails: totalEmails.count,
            enrollments: {
                total: totalEnrollments.count,
                active: activeEnrollments.count
            },
            schedules: {
                total: totalSchedules.count,
                pending: pendingSchedules.count
            },
            sends: {
                last24Hours: recentSends.count
            }
        };
        
    } catch (error) {
        console.error('Error getting system stats:', error);
        return {
            error: 'Failed to get system statistics'
        };
    }
}

module.exports = router;