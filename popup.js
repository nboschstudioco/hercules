/**
 * Gmail Auto Follow-Up Extension - Popup Script
 * Handles OAuth authentication flow and user interface
 */

class GmailAuthPopup {
    constructor() {
        this.elements = {
            loading: document.getElementById('loading'),
            signin: document.getElementById('signin'),
            authenticated: document.getElementById('authenticated'),
            error: document.getElementById('error'),
            signinBtn: document.getElementById('signin-btn'),
            signoutBtn: document.getElementById('signout-btn'),
            retryBtn: document.getElementById('retry-btn'),
            userEmail: document.getElementById('user-email'),
            errorMessage: document.getElementById('error-message'),
            // Email section elements
            refreshEmailsBtn: document.getElementById('refresh-emails-btn'),
            emailsLoading: document.getElementById('emails-loading'),
            emailsList: document.getElementById('emails-list'),
            emailsEmpty: document.getElementById('emails-empty'),
            emailsError: document.getElementById('emails-error'),
            emailsErrorMessage: document.getElementById('emails-error-message'),
            retryEmailsBtn: document.getElementById('retry-emails-btn')
        };
        
        this.init();
    }

    async init() {
        // Always start with loading state
        this.showState('loading');
        
        // Set up event listeners first
        this.setupEventListeners();
        
        // Check authentication status and transition to appropriate state
        try {
            await this.checkAuthStatus();
        } catch (error) {
            console.error('Auth check failed:', error);
            // On any error, show signin state
            this.showState('signin');
        }
    }

    setupEventListeners() {
        this.elements.signinBtn.addEventListener('click', () => this.handleSignIn());
        this.elements.signoutBtn.addEventListener('click', () => this.handleSignOut());
        this.elements.retryBtn.addEventListener('click', () => this.handleRetry());
        this.elements.refreshEmailsBtn.addEventListener('click', () => this.loadSentEmails());
        this.elements.retryEmailsBtn.addEventListener('click', () => this.loadSentEmails());
    }

    showState(state) {
        // Hide all state containers only (not individual elements inside them)
        const stateContainers = [
            this.elements.loading,
            this.elements.signin, 
            this.elements.authenticated,
            this.elements.error
        ];
        
        stateContainers.forEach(container => {
            if (container && container.classList) {
                container.classList.add('hidden');
            }
        });

        // Show requested state container
        switch (state) {
            case 'loading':
                this.elements.loading.classList.remove('hidden');
                break;
            case 'signin':
                this.elements.signin.classList.remove('hidden');
                break;
            case 'authenticated':
                this.elements.authenticated.classList.remove('hidden');
                break;
            case 'error':
                this.elements.error.classList.remove('hidden');
                break;
        }
    }

    async checkAuthStatus() {
        try {
            // Check if we have a stored token
            const result = await chrome.storage.local.get(['authToken', 'userEmail', 'tokenExpiry']);
            
            if (result.authToken && result.userEmail) {
                // Check if token is expired
                if (result.tokenExpiry && Date.now() < result.tokenExpiry) {
                    this.elements.userEmail.textContent = result.userEmail;
                    this.showState('authenticated');
                    // Load sent emails if already authenticated
                    await this.loadSentEmails();
                    return;
                }
            }

            // No valid authentication found - transition to signin
            this.showState('signin');
        } catch (error) {
            console.error('Error checking auth status:', error);
            // On error, transition to signin state
            this.showState('signin');
        }
    }

    async handleSignIn() {
        try {
            // Disable signin button and show loading
            this.elements.signinBtn.disabled = true;
            this.elements.signinBtn.textContent = 'Signing in...';
            
            // Get OAuth token using Chrome Identity API
            const token = await this.getAuthToken();
            
            if (token) {
                // Get user info using the token
                const userInfo = await this.getUserInfo(token);
                
                if (userInfo && userInfo.email) {
                    // Store authentication data
                    await this.storeAuthData(token, userInfo.email);
                    
                    // Update UI
                    this.elements.userEmail.textContent = userInfo.email;
                    this.showState('authenticated');
                    
                    // Load sent emails after successful authentication
                    await this.loadSentEmails();
                } else {
                    throw new Error('Failed to retrieve user information');
                }
            }
        } catch (error) {
            console.error('Sign-in error:', error);
            this.showError(this.getErrorMessage(error));
        } finally {
            // Re-enable signin button
            this.elements.signinBtn.disabled = false;
            this.elements.signinBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
            `;
        }
    }

    async getAuthToken() {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(token);
                }
            });
        });
    }

    async getUserInfo(token) {
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

    async storeAuthData(token, email) {
        // Calculate token expiry (typically 1 hour)
        const tokenExpiry = Date.now() + (60 * 60 * 1000);
        
        await chrome.storage.local.set({
            authToken: token,
            userEmail: email,
            tokenExpiry: tokenExpiry,
            lastLogin: Date.now()
        });
    }

    async handleSignOut() {
        try {
            // Get the current token to revoke it
            const result = await chrome.storage.local.get(['authToken']);
            
            if (result.authToken) {
                // Revoke the token
                await this.revokeToken(result.authToken);
            }

            // Clear stored authentication data
            await chrome.storage.local.remove(['authToken', 'userEmail', 'tokenExpiry', 'lastLogin']);

            // Clear Chrome identity cache
            chrome.identity.clearAllCachedAuthTokens(() => {
                console.log('Auth tokens cleared');
            });

            // Return to signin state
            this.showState('signin');
        } catch (error) {
            console.error('Sign-out error:', error);
            // Still clear local data even if revocation fails
            await chrome.storage.local.remove(['authToken', 'userEmail', 'tokenExpiry', 'lastLogin']);
            this.showState('signin');
        }
    }

    async revokeToken(token) {
        try {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        } catch (error) {
            console.error('Error revoking token:', error);
            // Don't throw here as we want to clear local data anyway
        }
    }

    handleRetry() {
        this.showState('signin');
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.showState('error');
    }

    getErrorMessage(error) {
        if (error.message) {
            const message = error.message.toLowerCase();
            
            if (message.includes('user did not approve')) {
                return 'Authentication was cancelled. Please try again and grant the required permissions.';
            } else if (message.includes('network')) {
                return 'Network error. Please check your internet connection and try again.';
            } else if (message.includes('oauth')) {
                return 'OAuth configuration error. Please check the extension setup.';
            } else if (message.includes('scope')) {
                return 'Permission error. The extension needs Gmail access to function properly.';
            }
        }
        
        return 'Authentication failed. Please try again or check your internet connection.';
    }

    async loadSentEmails() {
        try {
            // Show loading state
            this.showEmailsState('loading');
            
            // Get the stored auth token
            const result = await chrome.storage.local.get(['authToken']);
            if (!result.authToken) {
                throw new Error('No authentication token found');
            }
            
            // Fetch sent emails from Gmail API
            const messagesList = await this.fetchSentEmailsList(result.authToken);
            
            if (!messagesList || !messagesList.messages || messagesList.messages.length === 0) {
                this.showEmailsState('empty');
                return;
            }
            
            // Fetch details for each email (limit to first 20)
            const emailsToProcess = messagesList.messages.slice(0, 20);
            const emailDetails = await this.fetchEmailsDetails(result.authToken, emailsToProcess);
            
            if (emailDetails.length === 0) {
                this.showEmailsState('empty');
                return;
            }
            
            // Display emails
            this.displayEmails(emailDetails);
            this.showEmailsState('list');
            
        } catch (error) {
            console.error('Error loading sent emails:', error);
            this.showEmailsError(this.getEmailErrorMessage(error));
        }
    }
    
    async fetchSentEmailsList(token) {
        const response = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent&maxResults=20',
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to fetch emails list: ${response.status}`);
        }
        
        return await response.json();
    }
    
    async fetchEmailsDetails(token, messages) {
        const emailPromises = messages.map(message => 
            this.fetchEmailDetails(token, message.id)
        );
        
        const results = await Promise.allSettled(emailPromises);
        
        // Filter successful results and extract email data
        return results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value)
            .filter(email => email); // Remove any null/undefined emails
    }
    
    async fetchEmailDetails(token, messageId) {
        try {
            const response = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (!response.ok) {
                console.error(`Failed to fetch message ${messageId}: ${response.status}`);
                return null;
            }
            
            const messageData = await response.json();
            return this.parseEmailData(messageData);
        } catch (error) {
            console.error(`Error fetching email ${messageId}:`, error);
            return null;
        }
    }
    
    parseEmailData(messageData) {
        try {
            const headers = messageData.payload.headers;
            const subject = this.getHeaderValue(headers, 'Subject') || '(No Subject)';
            const to = this.getHeaderValue(headers, 'To') || '';
            const date = this.getHeaderValue(headers, 'Date') || '';
            
            return {
                id: messageData.id,
                threadId: messageData.threadId,
                subject: subject,
                to: to,
                date: this.formatDate(date),
                rawDate: date
            };
        } catch (error) {
            console.error('Error parsing email data:', error);
            return null;
        }
    }
    
    getHeaderValue(headers, name) {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : null;
    }
    
    formatDate(dateString) {
        try {
            if (!dateString) return '';
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = now - date;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return dateString;
        }
    }
    
    displayEmails(emails) {
        const emailsList = this.elements.emailsList;
        emailsList.innerHTML = '';
        
        emails.forEach(email => {
            const emailItem = this.createEmailItem(email);
            emailsList.appendChild(emailItem);
        });
    }
    
    createEmailItem(email) {
        const emailItem = document.createElement('div');
        emailItem.className = 'email-item';
        emailItem.dataset.emailId = email.id;
        
        emailItem.innerHTML = `
            <input type="checkbox" class="email-checkbox" data-email-id="${email.id}">
            <div class="email-content">
                <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                <div class="email-to">To: ${this.escapeHtml(email.to)}</div>
                <div class="email-date">${email.date}</div>
            </div>
        `;
        
        // Add click handler for selection
        emailItem.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                const checkbox = emailItem.querySelector('.email-checkbox');
                checkbox.checked = !checkbox.checked;
            }
            this.updateEmailItemSelection(emailItem);
        });
        
        // Add checkbox change handler
        const checkbox = emailItem.querySelector('.email-checkbox');
        checkbox.addEventListener('change', () => {
            this.updateEmailItemSelection(emailItem);
        });
        
        return emailItem;
    }
    
    updateEmailItemSelection(emailItem) {
        const checkbox = emailItem.querySelector('.email-checkbox');
        if (checkbox.checked) {
            emailItem.classList.add('selected');
        } else {
            emailItem.classList.remove('selected');
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showEmailsState(state) {
        // Hide all email states
        const emailStates = [
            this.elements.emailsLoading,
            this.elements.emailsList,
            this.elements.emailsEmpty,
            this.elements.emailsError
        ];
        
        emailStates.forEach(element => {
            if (element) element.classList.add('hidden');
        });
        
        // Show requested state
        switch (state) {
            case 'loading':
                this.elements.emailsLoading.classList.remove('hidden');
                break;
            case 'list':
                this.elements.emailsList.classList.remove('hidden');
                break;
            case 'empty':
                this.elements.emailsEmpty.classList.remove('hidden');
                break;
            case 'error':
                this.elements.emailsError.classList.remove('hidden');
                break;
        }
    }
    
    showEmailsError(message) {
        this.elements.emailsErrorMessage.textContent = message;
        this.showEmailsState('error');
    }
    
    getEmailErrorMessage(error) {
        if (error.message) {
            const message = error.message.toLowerCase();
            
            if (message.includes('403') || message.includes('unauthorized')) {
                return 'Permission denied. Please sign out and sign in again.';
            } else if (message.includes('404')) {
                return 'Gmail API not accessible. Please check your connection.';
            } else if (message.includes('network') || message.includes('fetch')) {
                return 'Network error. Please check your internet connection.';
            } else if (message.includes('token')) {
                return 'Authentication expired. Please sign in again.';
            }
        }
        
        return 'Failed to load emails. Please try again.';
    }
}

// Initialize popup when DOM is loaded
let popupInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    popupInstance = new GmailAuthPopup();
});

// Handle popup visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && popupInstance) {
        // Popup became visible, refresh auth status without creating new instance
        popupInstance.checkAuthStatus().catch(error => {
            console.error('Visibility change auth check failed:', error);
            popupInstance.showState('signin');
        });
    }
});
