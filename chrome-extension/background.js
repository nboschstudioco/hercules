/**
 * Gmail Auto Follow-Up Extension - Background Script
 * Handles service worker functionality for Manifest V3
 */

// Extension installation handler
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Gmail Auto Follow-Up extension installed/updated');
    
    if (details.reason === 'install') {
        // First-time installation
        console.log('Extension installed for the first time');
        
        // Initialize storage with default values
        chrome.storage.local.set({
            extensionVersion: chrome.runtime.getManifest().version,
            installDate: Date.now()
        });
    } else if (details.reason === 'update') {
        // Extension updated
        console.log('Extension updated to version', chrome.runtime.getManifest().version);
        
        // Update version in storage
        chrome.storage.local.set({
            extensionVersion: chrome.runtime.getManifest().version,
            updateDate: Date.now()
        });
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension service worker started');
    
    // Check and refresh authentication if needed
    checkAndRefreshAuth();
});

// Message handler for communication between popup and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    switch (request.action) {
        case 'openSidePanel':
            // Get the current window ID
            chrome.windows.getCurrent((window) => {
                chrome.sidePanel.open({ windowId: window.id });
            });
            break;
            
        case 'refreshToken':
            handleTokenRefresh(request, sendResponse);
            return true; // Keep message channel open for async response
            
        case 'validateToken':
            handleTokenValidation(request, sendResponse);
            return true;
            
        case 'clearAuth':
            handleAuthClear(request, sendResponse);
            return true;
            
        default:
            console.log('Unknown action:', request.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }
});

/**
 * Check and refresh authentication tokens
 */
async function checkAndRefreshAuth() {
    try {
        // Get session token from storage
        const result = await chrome.storage.local.get(['sessionToken']);
        
        if (result.sessionToken) {
            // Check auth status with backend
            const isValid = await verifySessionToken(result.sessionToken);
            
            if (!isValid) {
                console.log('Session token invalid, clearing auth data');
                await clearAuthData();
            }
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

/**
 * Helper function to get backend URL
 * Service workers don't have access to window, so use direct constant
 */
function getBackendUrl() {
    return 'http://localhost:3000';
}

/**
 * Verify session token with backend
 */
async function verifySessionToken(sessionToken) {
    try {
        const response = await fetch(`${getBackendUrl()}/auth/status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        return data.success && data.authenticated;
        
    } catch (error) {
        console.error('Error verifying session token:', error);
        return false;
    }
}

/**
 * Refresh authentication token
 */
async function refreshAuthToken() {
    try {
        const result = await chrome.storage.local.get(['sessionToken']);
        
        if (!result.sessionToken) {
            throw new Error('No session token found');
        }
        
        // Refresh token with backend
        const response = await fetch(`${getBackendUrl()}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${result.sessionToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            console.log('Token refreshed successfully');
            return { success: true };
        } else {
            throw new Error('Failed to refresh token');
        }
    } catch (error) {
        console.error('Token refresh failed:', error);
        await clearAuthData();
        return { success: false, error: error.message };
    }
}

/**
 * Get new authentication token
 */
async function getGmailToken() {
    try {
        const result = await chrome.storage.local.get(['sessionToken']);
        if (!result.sessionToken) {
            throw new Error('No session token found');
        }
        
        const response = await fetch(`${getBackendUrl()}/user/gmail-token`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${result.sessionToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 401 && errorData.requiresReauth) {
                await clearAuthData();
                throw new Error('Session expired');
            }
            throw new Error(errorData.error || 'Failed to get Gmail token');
        }
        
        const data = await response.json();
        return data.accessToken;
        
    } catch (error) {
        console.error('Error getting Gmail token:', error);
        throw error;
    }
}

/**
 * Get user information from Google API
 */
async function getUserInfo(token) {
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText || 'Failed to get user info'}`);
        }

        const userInfo = await response.json();
        
        if (!userInfo || !userInfo.email) {
            throw new Error('User info response missing required email field');
        }

        return userInfo;
    } catch (error) {
        console.error('Error fetching user info:', error);
        throw error;
    }
}

/**
 * Clear authentication data
 */
async function clearAuthData() {
    try {
        await chrome.storage.local.remove([
            'sessionToken', 
            'userEmail', 
            'userData', 
            'lastLogin'
        ]);
        
        chrome.identity.clearAllCachedAuthTokens(() => {
            console.log('All cached tokens cleared');
        });
    } catch (error) {
        console.error('Error clearing auth data:', error);
    }
}

/**
 * Handle token refresh requests from popup
 */
async function handleTokenRefresh(request, sendResponse) {
    try {
        const result = await refreshAuthToken();
        sendResponse(result);
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle token validation requests
 */
async function handleTokenValidation(request, sendResponse) {
    try {
        const result = await chrome.storage.local.get(['authToken', 'tokenExpiry']);
        
        if (result.authToken && result.tokenExpiry) {
            const isValid = Date.now() < result.tokenExpiry;
            sendResponse({ success: true, valid: isValid });
        } else {
            sendResponse({ success: true, valid: false });
        }
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle authentication clearing requests
 */
async function handleAuthClear(request, sendResponse) {
    try {
        await clearAuthData();
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Set up periodic token check (every 30 minutes)
 */
chrome.alarms.create('tokenCheck', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'tokenCheck') {
        console.log('Performing scheduled token check');
        checkAndRefreshAuth();
    }
    // Note: Follow-up email scheduling is now handled by the backend service
});

// Removed - follow-up scheduling now handled by backend service

// Removed - reply checking now handled by backend service

// Removed - variant selection now handled by backend service

/**
 * Send follow-up email in background
 */
// Removed - email sending now handled by backend service

// Removed - recipient handling now done by backend service

// Removed - email parsing and date calculations now handled by backend service
