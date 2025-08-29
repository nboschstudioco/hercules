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

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'tokenCheck') {
        console.log('Performing scheduled token check');
        checkAndRefreshAuth();
    } else if (alarm.name.startsWith('send_')) {
        // Handle follow-up email sending
        await handleFollowUpAlarm(alarm);
    }
});

/**
 * Handle follow-up email sending alarms
 */
async function handleFollowUpAlarm(alarm) {
    try {
        console.log('Processing follow-up alarm:', alarm.name);
        
        // Get alarm data
        const result = await chrome.storage.local.get([`alarm_${alarm.name}`]);
        const alarmData = result[`alarm_${alarm.name}`];
        
        if (!alarmData) {
            console.log('No alarm data found for:', alarm.name);
            return;
        }
        
        // Get enrollment data
        const enrollmentsResult = await chrome.storage.local.get(['emailEnrollments']);
        const enrollments = enrollmentsResult.emailEnrollments || [];
        const enrollment = enrollments.find(e => e.id === alarmData.enrollmentId);
        
        if (!enrollment) {
            console.log('Enrollment not found:', alarmData.enrollmentId);
            return;
        }
        
        // Check if enrollment is still active
        if (enrollment.status !== 'active') {
            console.log('Enrollment not active, skipping:', enrollment.id);
            return;
        }
        
        // Check for replies before sending
        const hasReplies = await checkForRepliesInBackground(enrollment);
        if (hasReplies) {
            console.log('Reply detected, pausing enrollment:', enrollment.id);
            enrollment.status = 'paused';
            enrollment.statusReason = 'reply';
            enrollment.alarmId = null;
            await chrome.storage.local.set({ emailEnrollments: enrollments });
            return;
        }
        
        // Send the follow-up email
        const success = await sendFollowUpInBackground(enrollment, enrollment.currentStep);
        
        if (success) {
            enrollment.currentStep++;
            
            // Check if sequence is complete
            if (enrollment.currentStep >= enrollment.sequence.steps.length) {
                enrollment.status = 'finished';
                enrollment.statusReason = null;
                enrollment.alarmId = null;
            } else {
                // Schedule next step
                const nextStep = enrollment.sequence.steps[enrollment.currentStep];
                enrollment.nextSendDate = calculateNextSendDateInBackground(nextStep, enrollment.sequence.sendWindow);
                
                const nextAlarmId = `send_${enrollment.id}_${Date.now()}`;
                const nextSendTime = new Date(enrollment.nextSendDate);
                
                chrome.alarms.create(nextAlarmId, { when: nextSendTime.getTime() });
                enrollment.alarmId = nextAlarmId;
                
                // Store next alarm data
                await chrome.storage.local.set({
                    [`alarm_${nextAlarmId}`]: {
                        enrollmentId: enrollment.id,
                        scheduledFor: enrollment.nextSendDate,
                        currentStep: enrollment.currentStep
                    }
                });
            }
        } else {
            enrollment.status = 'error';
            enrollment.statusReason = 'send_failed';
            enrollment.alarmId = null;
        }
        
        // Clean up current alarm data
        await chrome.storage.local.remove([`alarm_${alarm.name}`]);
        
        // Save updated enrollment
        await chrome.storage.local.set({ emailEnrollments: enrollments });
        
        console.log('Follow-up alarm processed:', alarm.name);
        
    } catch (error) {
        console.error('Error processing follow-up alarm:', error);
    }
}

/**
 * Check for replies in background
 */
async function checkForRepliesInBackground(enrollment) {
    try {
        const result = await chrome.storage.local.get(['authToken']);
        if (!result.authToken) return false;

        const response = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/threads/${enrollment.threadId}`,
            { headers: { 'Authorization': `Bearer ${result.authToken}` } }
        );

        if (!response.ok) return false;

        const thread = await response.json();
        const enrolledDate = new Date(enrollment.enrolledAt);
        const userEmail = result.userEmail || '';
        
        for (const message of thread.messages || []) {
            const messageDate = new Date(parseInt(message.internalDate));
            if (messageDate <= enrolledDate) continue;
            
            const fromHeader = message.payload.headers.find(h => h.name.toLowerCase() === 'from');
            if (fromHeader && !fromHeader.value.includes(userEmail)) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error checking for replies in background:', error);
        return false;
    }
}

/**
 * Send follow-up email in background
 */
async function sendFollowUpInBackground(enrollment, stepIndex) {
    try {
        const result = await chrome.storage.local.get(['authToken']);
        if (!result.authToken) return false;

        const step = enrollment.sequence.steps[stepIndex];
        let emailBody = step.content;
        
        // Simple variable replacement
        emailBody = emailBody.replace(/\{name\}/g, enrollment.to.split('<')[0].trim());
        emailBody = emailBody.replace(/\{subject\}/g, enrollment.subject);
        
        // Create the email message
        const email = [
            `To: ${enrollment.to}`,
            `Subject: Re: ${enrollment.subject}`,
            `In-Reply-To: ${enrollment.emailId}`,
            `References: ${enrollment.emailId}`,
            '',
            emailBody
        ].join('\r\n');

        // Encode the email in base64url format
        const encodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        // Send via Gmail API
        const response = await fetch(
            'https://www.googleapis.com/gmail/v1/users/me/messages/send',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${result.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    raw: encodedEmail
                })
            }
        );

        return response.ok;
    } catch (error) {
        console.error('Error sending follow-up email in background:', error);
        return false;
    }
}

/**
 * Calculate next send date in background
 */
function calculateNextSendDateInBackground(step, sendWindow) {
    const now = new Date();
    let sendDate = new Date(now);
    
    if (step.delayUnit === 'hours') {
        sendDate.setHours(sendDate.getHours() + step.delay);
    } else {
        let daysAdded = 0;
        while (daysAdded < step.delay) {
            sendDate.setDate(sendDate.getDate() + 1);
            const dayName = sendDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            if (sendWindow.days.includes(dayName)) {
                daysAdded++;
            }
        }
    }
    
    if (sendDate.getHours() < sendWindow.startHour) {
        sendDate.setHours(sendWindow.startHour, 0, 0, 0);
    } else if (sendDate.getHours() >= sendWindow.endHour) {
        do {
            sendDate.setDate(sendDate.getDate() + 1);
        } while (!sendWindow.days.includes(sendDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()));
        sendDate.setHours(sendWindow.startHour, 0, 0, 0);
    }
    
    return sendDate.toISOString();
}
