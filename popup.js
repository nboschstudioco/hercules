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
            errorMessage: document.getElementById('error-message')
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
    }

    showState(state) {
        // Hide all states
        Object.values(this.elements).forEach(element => {
            if (element && element.classList) {
                element.classList.add('hidden');
            }
        });

        // Show requested state
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
