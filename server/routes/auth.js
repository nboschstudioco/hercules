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
        // Create stateless JWT-based state token (no session dependency)
        const statePayload = {
            nonce: uuidv4(),
            timestamp: Date.now(),
            type: 'oauth_state'
        };
        
        // Sign the state token to prevent tampering
        const state = jwt.sign(
            statePayload,
            process.env.JWT_SECRET || 'fallback-secret',
            { 
                expiresIn: '10m', // Short expiry for security
                issuer: 'gmail-followup-backend',
                audience: 'oauth-state'
            }
        );
        
        console.log('OAuth init - stateless state created:', {
            statePayload,
            hasJWT: !!state,
            tokenLength: state.length
        });
        
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
    // Build proper base URL (available for both success and error paths)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    try {
        const { code, state, error } = req.query;
        
        // Debug logging for OAuth callback
        console.log('OAuth callback received:', {
            hasCode: !!code,
            hasState: !!state,
            hasError: !!error,
            receivedState: state,
            sessionState: req.session.oauthState,
            stateMatch: state === req.session.oauthState,
            sessionId: req.sessionID,
            hasSession: !!req.session,
            fullSession: req.session,
            baseUrl: baseUrl,
            requestHeaders: {
                origin: req.get('origin'),
                host: req.get('host'),
                userAgent: req.get('user-agent'),
                referer: req.get('referer')
            }
        });
        
        // Handle OAuth errors
        if (error) {
            console.log('OAuth error from Google:', error);
            return res.redirect(`${baseUrl}/auth/error?error=${encodeURIComponent(error)}`);
        }
        
        // Verify stateless JWT state parameter (CSRF protection)
        if (!state) {
            console.log('State validation failed: No state parameter received');
            return res.redirect(`${baseUrl}/auth/error?error=missing_state`);
        }
        
        try {
            // Verify the JWT state token
            const statePayload = jwt.verify(
                state,
                process.env.JWT_SECRET || 'fallback-secret',
                {
                    issuer: 'gmail-followup-backend',
                    audience: 'oauth-state'
                }
            );
            
            console.log('State validation successful:', {
                statePayload,
                ageMinutes: (Date.now() - statePayload.timestamp) / (1000 * 60)
            });
            
        } catch (stateError) {
            console.log('State validation failed:', {
                error: stateError.message,
                receivedState: state.substring(0, 50) + '...'
            });
            return res.redirect(`${baseUrl}/auth/error?error=invalid_state`);
        }
        
        // Exchange code for tokens
        const { tokens: oauthTokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(oauthTokens);
        
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
            accessToken: oauthTokens.access_token,
            refreshToken: oauthTokens.refresh_token,
            expiryDate: oauthTokens.expiry_date,
            scope: oauthTokens.scope,
            tokenType: oauthTokens.token_type,
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
        
        // State token is stateless - no cleanup needed
        
        // Redirect to success page with token
        const successUrl = `${baseUrl}/auth/success?token=${sessionToken}&user=${encodeURIComponent(JSON.stringify({
            id: userId,
            email: user.email,
            name: user.name
        }))}`;
        
        console.log('OAuth success, redirecting to:', successUrl);
        res.redirect(successUrl);
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect(`${baseUrl}/auth/error?error=callback_failed`);
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
 * Handle successful OAuth completion 
 * This page communicates back to the Chrome extension
 */
router.get('/success', (req, res) => {
    const { token, user } = req.query;
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Authentication Successful</title>
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                margin: 0;
                background-color: #f5f5f5;
            }
            .success-container {
                text-align: center;
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                max-width: 400px;
            }
            .checkmark {
                color: #4CAF50;
                font-size: 3rem;
                margin-bottom: 1rem;
            }
        </style>
    </head>
    <body>
        <div class="success-container">
            <div class="checkmark">✓</div>
            <h2>Authentication Successful!</h2>
            <p>You can now close this tab and return to your extension.</p>
        </div>
        <script>
            // Send success message to Chrome extension
            if (window.chrome && chrome.runtime) {
                try {
                    chrome.runtime.sendMessage({
                        type: 'AUTH_SUCCESS',
                        token: '${token}',
                        user: ${user ? `JSON.parse(decodeURIComponent('${user}'))` : 'null'}
                    });
                } catch (error) {
                    console.log('Could not send message to extension:', error);
                }
            }
            
            // Alternative: Try to communicate with parent extension
            window.postMessage({
                type: 'AUTH_SUCCESS',
                token: '${token}',
                user: ${user ? `JSON.parse(decodeURIComponent('${user}'))` : 'null'}
            }, '*');
            
            // Close tab after a delay
            setTimeout(() => {
                window.close();
            }, 2000);
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
});

/**
 * Handle OAuth errors
 * This page communicates back to the Chrome extension
 */
router.get('/error', (req, res) => {
    const { error } = req.query;
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Authentication Error</title>
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                margin: 0;
                background-color: #f5f5f5;
            }
            .error-container {
                text-align: center;
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                max-width: 400px;
            }
            .error-mark {
                color: #f44336;
                font-size: 3rem;
                margin-bottom: 1rem;
            }
        </style>
    </head>
    <body>
        <div class="error-container">
            <div class="error-mark">✗</div>
            <h2>Authentication Failed</h2>
            <p>There was an error during authentication: ${error || 'Unknown error'}</p>
            <p>Please close this tab and try again.</p>
        </div>
        <script>
            // Send error message to Chrome extension
            if (window.chrome && chrome.runtime) {
                try {
                    chrome.runtime.sendMessage({
                        type: 'AUTH_ERROR',
                        error: '${error || 'unknown_error'}',
                        message: 'Authentication failed'
                    });
                } catch (error) {
                    console.log('Could not send message to extension:', error);
                }
            }
            
            // Alternative: Try to communicate with parent extension
            window.postMessage({
                type: 'AUTH_ERROR',
                error: '${error || 'unknown_error'}',
                message: 'Authentication failed'
            }, '*');
            
            // Close tab after a delay
            setTimeout(() => {
                window.close();
            }, 3000);
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
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