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
        const result = await chrome.storage.local.get(['sessionToken', 'userEmail']);
        
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
    return 'https://6fd81350-6245-48d5-a2d0-9dee2975c9d8-00-2hm7yioywqrpg.kirk.replit.dev';
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
                enrollment.nextSendDate = calculateNextSendDateInBackground(nextStep, enrollment.sequence.sendWindow, enrollment.originalEmailDate);
                
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
 * Select variant using round-robin cycling
 * Tracks last used variant index per sequence + step to ensure fair distribution
 */
async function selectVariantRoundRobin(sequenceName, stepIndex, variants) {
    if (!variants || variants.length === 0) {
        throw new Error('No variants available for step');
    }
    
    if (variants.length === 1) {
        return variants[0];
    }
    
    // Key for tracking variant usage: sequenceName_stepIndex
    const trackingKey = `variant_tracking_${sequenceName}_${stepIndex}`;
    
    // Get current tracking data
    const result = await chrome.storage.local.get([trackingKey]);
    let lastUsedIndex = result[trackingKey] || -1;
    
    // Calculate next index (round-robin)
    const nextIndex = (lastUsedIndex + 1) % variants.length;
    
    // Update tracking
    await chrome.storage.local.set({ [trackingKey]: nextIndex });
    
    console.log(`Variant selection for ${sequenceName} step ${stepIndex}: using variant ${nextIndex + 1}/${variants.length}`);
    
    return variants[nextIndex];
}

/**
 * Send follow-up email in background
 */
/**
 * BACKGROUND FOLLOW-UP SENDING WITH REPLY MODE SUPPORT:
 * This function now supports both Reply and Reply-to-All modes based on enrollment choice.
 * 
 * REPLY MODE BEHAVIOR:
 * - 'reply': Sends only to primary 'To' recipient from original email
 * - 'reply-all': Sends to all To and CC recipients, excluding user's email
 * 
 * FEATURES:
 * - Respects user's reply mode choice from enrollment
 * - Proper recipient deduplication and user email exclusion
 * - Maintains conversation threading with In-Reply-To and References
 */
async function sendFollowUpInBackground(enrollment, stepIndex) {
    try {
        const result = await chrome.storage.local.get(['userEmail']);
        const gmailToken = await getGmailToken();

        const step = enrollment.sequence.steps[stepIndex];
        
        // Select variant using round-robin cycling
        const selectedVariant = await selectVariantRoundRobin(enrollment.sequenceName, stepIndex, step.variants);
        let emailBody = selectedVariant;
        
        // Simple variable replacement
        emailBody = emailBody.replace(/\{name\}/g, enrollment.to.split('<')[0].trim());
        emailBody = emailBody.replace(/\{subject\}/g, enrollment.subject);
        
        // Get recipient list based on reply mode
        const recipients = getRecipientsForReplyMode(enrollment, result.userEmail);
        
        // Create the email message
        const email = [
            `To: ${recipients.to}`,
            recipients.cc ? `Cc: ${recipients.cc}` : null,
            `Subject: Re: ${enrollment.subject}`,
            `In-Reply-To: ${enrollment.emailId}`,
            `References: ${enrollment.emailId}`,
            '',
            emailBody
        ].filter(line => line !== null).join('\r\n');

        // Encode the email in base64url format
        const encodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        // Send via Gmail API
        const response = await fetch(
            'https://www.googleapis.com/gmail/v1/users/me/messages/send',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gmailToken}`,
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
 * Get recipients for follow-up based on reply mode choice (background version)
 * @param {Object} enrollment - The enrollment record with reply mode
 * @param {string} userEmail - Current user's email to exclude
 * @returns {Object} - Recipients object with 'to' and 'cc' fields
 */
function getRecipientsForReplyMode(enrollment, userEmail) {
    const replyMode = enrollment.replyMode || 'reply';
    
    if (replyMode === 'reply') {
        // Reply mode: only send to primary To recipient
        return {
            to: enrollment.to,
            cc: null
        };
    } else {
        // Reply-all mode: send to all To and CC, excluding user
        const allToRecipients = parseEmailAddresses(enrollment.to);
        const allCcRecipients = parseEmailAddresses(enrollment.cc || '');
        
        // Combine and deduplicate recipients, excluding user's email
        const combinedRecipients = [...allToRecipients, ...allCcRecipients]
            .filter(email => email && email.toLowerCase() !== userEmail.toLowerCase())
            .filter((email, index, array) => array.indexOf(email) === index); // deduplicate
        
        // For reply-all, put primary recipient in To and others in CC
        const primaryRecipient = allToRecipients.find(email => 
            email && email.toLowerCase() !== userEmail.toLowerCase()
        );
        
        const ccRecipients = combinedRecipients.filter(email => email !== primaryRecipient);
        
        return {
            to: primaryRecipient || combinedRecipients[0] || enrollment.to,
            cc: ccRecipients.length > 0 ? ccRecipients.join(', ') : null
        };
    }
}

/**
 * Parse email addresses from a header string (background version)
 * Handles formats like: "Name <email@domain.com>, email2@domain.com"
 * @param {string} headerValue - Email header value to parse
 * @returns {Array} - Array of email addresses
 */
function parseEmailAddresses(headerValue) {
    if (!headerValue) return [];
    
    // Split by comma and clean up each address
    return headerValue
        .split(',')
        .map(addr => {
            // Extract email from "Name <email>" format or use as-is
            const match = addr.match(/<([^>]+)>/);
            return match ? match[1].trim() : addr.trim();
        })
        .filter(addr => addr && addr.includes('@')); // Basic email validation
}

/**
 * Calculate next send date in background
 */
function calculateNextSendDateInBackground(step, sendWindow, baseDate = null) {
    const now = new Date();
    let sendDate = new Date(baseDate || now);
    
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
    
    // Apply intra-day timing randomization within send window
    const randomizeTime = (sendDate.getHours() < sendWindow.startHour || sendDate.getHours() >= sendWindow.endHour);
    
    if (sendDate.getHours() < sendWindow.startHour || randomizeTime) {
        // Randomize within the send window for natural timing
        const windowStart = sendWindow.startHour;
        const windowEnd = sendWindow.endHour;
        const randomHour = windowStart + Math.floor(Math.random() * (windowEnd - windowStart));
        const randomMinute = Math.floor(Math.random() * 60);
        sendDate.setHours(randomHour, randomMinute, 0, 0);
    } else if (sendDate.getHours() >= sendWindow.endHour) {
        do {
            sendDate.setDate(sendDate.getDate() + 1);
        } while (!sendWindow.days.includes(sendDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()));
        sendDate.setHours(sendWindow.startHour, 0, 0, 0);
    }
    
    return sendDate.toISOString();
}
