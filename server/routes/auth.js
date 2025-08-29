const express = require('express');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// In-memory storage for demo (replace with database in production)
const users = new Map();
const tokens = new Map();

// Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// OAuth2 scopes for Gmail access
const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile', 
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify'
];

/**
 * Initiate OAuth2 flow
 * Extension calls this to get authorization URL
 */
router.get('/google/init', (req, res) => {
    try {
        const state = uuidv4(); // CSRF protection
        req.session.oauthState = state;
        
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            include_granted_scopes: true,
            state: state,
            prompt: 'consent' // Force consent to ensure refresh token
        });
        
        res.json({
            success: true,
            authUrl: authUrl,
            state: state
        });
    } catch (error) {
        console.error('OAuth init error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate OAuth flow'
        });
    }
});

/**
 * Handle OAuth2 callback from Google
 */
router.get('/google/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;
        
        // Handle OAuth errors
        if (error) {
            return res.redirect(`${req.get('origin')}/auth/error?error=${encodeURIComponent(error)}`);
        }
        
        // Verify state parameter (CSRF protection)
        if (!state || state !== req.session.oauthState) {
            return res.redirect(`${req.get('origin')}/auth/error?error=invalid_state`);
        }
        
        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        // Get user info
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: userInfo } = await oauth2.userinfo.get();
        
        // Create or update user record
        const userId = uuidv4();
        const user = {
            id: userId,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            gmailId: userInfo.id,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
        };
        
        // Store user data
        users.set(userId, user);
        
        // Store OAuth tokens securely
        const tokenData = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiryDate: tokens.expiry_date,
            scope: tokens.scope,
            tokenType: tokens.token_type,
            userId: userId,
            createdAt: new Date().toISOString()
        };
        
        tokens.set(userId, tokenData);
        
        // Generate JWT session token for extension
        const sessionToken = jwt.sign(
            { 
                userId: userId,
                email: userInfo.email,
                type: 'session'
            },
            process.env.JWT_SECRET || 'fallback-secret',
            { 
                expiresIn: '7d',
                issuer: 'gmail-followup-backend',
                audience: 'gmail-followup-extension'
            }
        );
        
        // Clear OAuth state
        delete req.session.oauthState;
        
        // Redirect to success page with token
        const successUrl = `${req.get('origin')}/auth/success?token=${sessionToken}&user=${encodeURIComponent(JSON.stringify({
            id: userId,
            email: user.email,
            name: user.name
        }))}`;
        
        res.redirect(successUrl);
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect(`${req.get('origin')}/auth/error?error=callback_failed`);
    }
});

/**
 * Refresh access token
 */
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const userTokens = tokens.get(userId);
        
        if (!userTokens || !userTokens.refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'No refresh token available'
            });
        }
        
        // Set up OAuth client with stored tokens
        oauth2Client.setCredentials({
            access_token: userTokens.accessToken,
            refresh_token: userTokens.refreshToken
        });
        
        // Refresh the access token
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
        
        res.json({
            success: true,
            expiresAt: new Date(credentials.expiry_date).toISOString()
        });
        
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh token'
        });
    }
});

/**
 * Check authentication status
 */
router.get('/status', authenticateToken, (req, res) => {
    try {
        const { userId } = req.user;
        const user = users.get(userId);
        const userTokens = tokens.get(userId);
        
        if (!user || !userTokens) {
            return res.status(401).json({
                success: false,
                authenticated: false
            });
        }
        
        const isTokenExpired = userTokens.expiryDate && 
            new Date().getTime() > userTokens.expiryDate;
        
        res.json({
            success: true,
            authenticated: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            },
            tokenStatus: {
                hasAccessToken: !!userTokens.accessToken,
                hasRefreshToken: !!userTokens.refreshToken,
                isExpired: isTokenExpired,
                expiresAt: userTokens.expiryDate ? 
                    new Date(userTokens.expiryDate).toISOString() : null
            }
        });
        
    } catch (error) {
        console.error('Auth status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check authentication status'
        });
    }
});

/**
 * Logout and revoke tokens
 */
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const userTokens = tokens.get(userId);
        
        // Revoke Google tokens if they exist
        if (userTokens && userTokens.accessToken) {
            oauth2Client.setCredentials({
                access_token: userTokens.accessToken,
                refresh_token: userTokens.refreshToken
            });
            
            try {
                await oauth2Client.revokeCredentials();
            } catch (revokeError) {
                console.warn('Token revocation failed:', revokeError.message);
                // Continue with logout even if revocation fails
            }
        }
        
        // Remove stored tokens and user session
        tokens.delete(userId);
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
        
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to logout'
        });
    }
});

/**
 * Middleware to authenticate JWT tokens
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access token required'
        });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }
        
        req.user = user;
        next();
    });
}

// Export the authentication middleware for use in other routes
router.authenticateToken = authenticateToken;

module.exports = router;