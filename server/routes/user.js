const express = require('express');
const { google } = require('googleapis');
const router = express.Router();

// Import auth middleware
const { authenticateToken } = require('./auth');

// In-memory storage (same as auth.js - replace with database)
const users = new Map();
const tokens = new Map();

/**
 * Get user profile information
 */
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const { userId } = req.user;
        const user = users.get(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture,
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt
            }
        });
        
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user profile'
        });
    }
});

/**
 * Get Gmail access token for API calls
 * This endpoint provides the extension with current valid tokens
 */
router.get('/gmail-token', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const userTokens = tokens.get(userId);
        
        if (!userTokens) {
            return res.status(404).json({
                success: false,
                error: 'No tokens found for user'
            });
        }
        
        // Check if token needs refreshing
        const isExpired = userTokens.expiryDate && 
            new Date().getTime() > (userTokens.expiryDate - 5 * 60 * 1000); // 5 min buffer
        
        if (isExpired && userTokens.refreshToken) {
            // Refresh the token
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );
            
            oauth2Client.setCredentials({
                access_token: userTokens.accessToken,
                refresh_token: userTokens.refreshToken
            });
            
            try {
                const { credentials } = await oauth2Client.refreshAccessToken();
                
                // Update stored tokens
                const updatedTokens = {
                    ...userTokens,
                    accessToken: credentials.access_token,
                    expiryDate: credentials.expiry_date,
                    updatedAt: new Date().toISOString()
                };
                
                if (credentials.refresh_token) {
                    updatedTokens.refreshToken = credentials.refresh_token;
                }
                
                tokens.set(userId, updatedTokens);
                
                return res.json({
                    success: true,
                    accessToken: credentials.access_token,
                    expiresAt: new Date(credentials.expiry_date).toISOString(),
                    refreshed: true
                });
                
            } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                return res.status(401).json({
                    success: false,
                    error: 'Token refresh failed',
                    requiresReauth: true
                });
            }
        }
        
        // Return current valid token
        res.json({
            success: true,
            accessToken: userTokens.accessToken,
            expiresAt: userTokens.expiryDate ? 
                new Date(userTokens.expiryDate).toISOString() : null,
            refreshed: false
        });
        
    } catch (error) {
        console.error('Get Gmail token error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get Gmail token'
        });
    }
});

/**
 * Update user preferences
 */
router.put('/preferences', authenticateToken, (req, res) => {
    try {
        const { userId } = req.user;
        const { timezone, notifications } = req.body;
        
        const user = users.get(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Update user preferences
        const updatedUser = {
            ...user,
            preferences: {
                timezone: timezone || user.preferences?.timezone,
                notifications: notifications !== undefined ? 
                    notifications : user.preferences?.notifications
            },
            updatedAt: new Date().toISOString()
        };
        
        users.set(userId, updatedUser);
        
        res.json({
            success: true,
            preferences: updatedUser.preferences
        });
        
    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update preferences'
        });
    }
});

module.exports = router;