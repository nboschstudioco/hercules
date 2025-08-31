const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
require('dotenv').config({ path: __dirname + '/.env' });

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const emailRoutes = require('./routes/emails');
const sequenceRoutes = require('./routes/sequences');
const enrollmentRoutes = require('./routes/enrollments');
const scheduleRoutes = require('./routes/schedules');
const analyticsRoutes = require('./routes/analytics');
const syncRoutes = require('./routes/sync');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow extension to make requests
}));

// Simplified CORS configuration for debugging
app.use(cors({
    origin: true, // Allow all origins for now
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static authentication pages  
app.use('/auth', express.static(__dirname + '/public'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: true, // Allow sessions to be saved even when uninitialized
    cookie: {
        secure: false, // Allow cookies over HTTP for development
        httpOnly: false, // Allow access from JavaScript for Chrome extension compatibility
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax' // Allow cross-site requests for OAuth flow
    }
}));

// API routes
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/emails', emailRoutes);
app.use('/sequences', sequenceRoutes);
app.use('/enrollments', enrollmentRoutes);
app.use('/schedules', scheduleRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/sync', syncRoutes);
app.use('/health', healthRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message
        });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token'
        });
    }
    
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 
            'Something went wrong' : err.message
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Gmail Follow-Up Backend running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 CORS: All origins allowed (development)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 SIGINT received, shutting down gracefully');
    process.exit(0);
});