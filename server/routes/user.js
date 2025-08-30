const express = require('express');
const { google } = require('googleapis');
const database = require('../database');
const router = express.Router();

// Import auth middleware
const { authenticateToken } = require('./auth');

/**
 * Get user profile information
 */
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const user = await database.getUserById(userId);
        
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
                createdAt: user.created_at,
                lastLoginAt: user.last_login_at
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
        const userTokens = await database.getTokens(userId);
        
        if (!userTokens) {
            return res.status(404).json({
                success: false,
                error: 'No tokens found for user'
            });
        }
        
        // Check if token needs refreshing
        const isExpired = userTokens.expiry_date && 
            new Date().getTime() > (userTokens.expiry_date - 5 * 60 * 1000); // 5 min buffer
        
        if (isExpired && userTokens.refresh_token) {
            // Refresh the token
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );
            
            oauth2Client.setCredentials({
                access_token: userTokens.access_token,
                refresh_token: userTokens.refresh_token
            });
            
            try {
                const { credentials } = await oauth2Client.refreshAccessToken();
                
                // Update stored tokens
                await database.saveTokens(userId, {
                    accessToken: credentials.access_token,
                    refreshToken: credentials.refresh_token || userTokens.refresh_token,
                    expiryDate: credentials.expiry_date
                });
                
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
            accessToken: userTokens.access_token,
            expiresAt: userTokens.expiry_date ? 
                new Date(userTokens.expiry_date).toISOString() : null,
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
// Note: User preferences will be implemented later if needed
// For now, removed this endpoint as it's not in the Step 3 requirements

module.exports = router;