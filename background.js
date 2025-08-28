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
        case "openSidePanel":
            // Now open the side panel (no arguments needed for default panel)
            chrome.sidePanel.open();
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
        const result = await chrome.storage.local.get(['authToken', 'tokenExpiry', 'userEmail']);
        
        if (result.authToken && result.tokenExpiry) {
            const timeUntilExpiry = result.tokenExpiry - Date.now();
            
            // If token expires within 5 minutes, try to refresh
            if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
                console.log('Token expires soon, attempting refresh');
                await refreshAuthToken();
            } else if (timeUntilExpiry <= 0) {
                console.log('Token expired, clearing auth data');
                await clearAuthData();
            }
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

/**
 * Refresh authentication token
 */
async function refreshAuthToken() {
    try {
        // Clear the cached token first
        const result = await chrome.storage.local.get(['authToken']);
        if (result.authToken) {
            chrome.identity.removeCachedAuthToken({ token: result.authToken }, () => {
                console.log('Cached token removed');
            });
        }
        
        // Get a new token
        const token = await getNewAuthToken();
        
        if (token) {
            // Get fresh user info
            const userInfo = await getUserInfo(token);
            
            if (userInfo && userInfo.email) {
                // Store the new token
                const tokenExpiry = Date.now() + (60 * 60 * 1000); // 1 hour
                
                await chrome.storage.local.set({
                    authToken: token,
                    userEmail: userInfo.email,
                    tokenExpiry: tokenExpiry,
                    lastRefresh: Date.now()
                });
                
                console.log('Token refreshed successfully');
                return { success: true };
            }
        }
        
        throw new Error('Failed to refresh token');
    } catch (error) {
        console.error('Token refresh failed:', error);
        await clearAuthData();
        return { success: false, error: error.message };
    }
}

/**
 * Get new authentication token
 */
function getNewAuthToken() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(token);
            }
        });
    });
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
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
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
            'authToken', 
            'userEmail', 
            'tokenExpiry', 
            'lastLogin', 
            'lastRefresh'
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

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'tokenCheck') {
        console.log('Performing scheduled token check');
        checkAndRefreshAuth();
    }
});
