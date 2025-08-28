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
            statusDot: document.getElementById('status-dot'),
            expandStatusBtn: document.getElementById('expand-status'),
            statusDetails: document.getElementById('status-details'),
            lastLogin: document.getElementById('last-login'),
            errorMessage: document.getElementById('error-message'),
            // Email section elements
            refreshEmailsBtn: document.getElementById('refresh-emails-btn'),
            emailsLoading: document.getElementById('emails-loading'),
            emailsList: document.getElementById('emails-list'),
            emailsEmpty: document.getElementById('emails-empty'),
            emailsError: document.getElementById('emails-error'),
            emailsErrorMessage: document.getElementById('emails-error-message'),
            retryEmailsBtn: document.getElementById('retry-emails-btn'),
            // Sequence panel elements
            settingsBtn: document.getElementById('settings-btn'),
            sequencePanel: document.getElementById('sequence-panel'),
            backBtn: document.getElementById('back-btn'),
            addSequenceBtn: document.getElementById('add-sequence-btn'),
            sequencesList: document.getElementById('sequences-list'),
            sequencesEmpty: document.getElementById('sequences-empty'),
            sequenceFormModal: document.getElementById('sequence-form-modal'),
            sequenceForm: document.getElementById('sequence-form'),
            sequenceFormTitle: document.getElementById('sequence-form-title'),
            closeFormBtn: document.getElementById('close-form-btn'),
            cancelFormBtn: document.getElementById('cancel-form-btn'),
            saveSequenceBtn: document.getElementById('save-sequence-btn'),
            sequenceName: document.getElementById('sequence-name'),
            stepsContainer: document.getElementById('steps-container'),
            addStepBtn: document.getElementById('add-step-btn'),
            // Enrollment elements
            enrollmentSection: document.getElementById('enrollment-section'),
            sequenceSelect: document.getElementById('sequence-select'),
            enrollSelectedBtn: document.getElementById('enroll-selected-btn'),
            selectedCount: document.getElementById('selected-count')
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
        this.elements.refreshEmailsBtn.addEventListener('click', () => {
            this.loadSentEmails();
            this.updateSequenceDropdown();
        });
        this.elements.retryEmailsBtn.addEventListener('click', () => {
            this.loadSentEmails();
            this.updateSequenceDropdown();
        });
        this.elements.expandStatusBtn.addEventListener('click', () => this.toggleStatusDetails());
        
        // Sequence panel event listeners
        this.elements.settingsBtn.addEventListener('click', () => this.showSequencePanel());
        this.elements.backBtn.addEventListener('click', () => this.hideSequencePanel());
        this.elements.addSequenceBtn.addEventListener('click', () => this.showSequenceForm());
        this.elements.closeFormBtn.addEventListener('click', () => this.hideSequenceForm());
        this.elements.cancelFormBtn.addEventListener('click', () => this.hideSequenceForm());
        this.elements.sequenceForm.addEventListener('submit', (e) => this.handleSequenceFormSubmit(e));
        this.elements.addStepBtn.addEventListener('click', () => this.addStep());
        
        // Enrollment event listeners
        this.elements.sequenceSelect.addEventListener('change', () => this.updateEnrollButton());
        this.elements.enrollSelectedBtn.addEventListener('click', () => this.enrollSelectedEmails());
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
                    this.updateAuthenticationStatus('ok');
                    this.updateLastLoginTime(result.lastLogin);
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
                    this.updateAuthenticationStatus('ok');
                    this.updateLastLoginTime();
                    this.showState('authenticated');
                    
                    // Load sent emails and sequences after successful authentication
                    await this.loadSentEmails();
                    await this.updateSequenceDropdown();
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
            
            // Collapse status details if expanded
            this.elements.statusDetails.classList.add('hidden');
            this.elements.expandStatusBtn.classList.remove('expanded');

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
        emailItem.dataset.emailSubject = email.subject;
        emailItem.dataset.emailTo = email.to;
        emailItem.dataset.threadId = email.threadId;
        
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
        // Update enrollment button when selection changes
        this.updateEnrollButton();
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
                // Update status to show error
                this.updateAuthenticationStatus('error');
                return 'Permission denied. Please sign out and sign in again.';
            } else if (message.includes('404')) {
                return 'Gmail API not accessible. Please check your connection.';
            } else if (message.includes('network') || message.includes('fetch')) {
                return 'Network error. Please check your internet connection.';
            } else if (message.includes('token')) {
                // Update status to show warning
                this.updateAuthenticationStatus('warning');
                return 'Authentication expired. Please sign in again.';
            }
        }
        
        return 'Failed to load emails. Please try again.';
    }
    
    toggleStatusDetails() {
        const statusDetails = this.elements.statusDetails;
        const expandBtn = this.elements.expandStatusBtn;
        
        statusDetails.classList.toggle('hidden');
        expandBtn.classList.toggle('expanded');
    }
    
    updateAuthenticationStatus(status) {
        const statusDot = this.elements.statusDot;
        
        // Remove all status classes
        statusDot.classList.remove('status-ok', 'status-error', 'status-warning');
        
        // Add appropriate status class and update aria-label
        switch (status) {
            case 'ok':
                statusDot.classList.add('status-ok');
                statusDot.setAttribute('aria-label', 'Authenticated');
                break;
            case 'error':
                statusDot.classList.add('status-error');
                statusDot.setAttribute('aria-label', 'Authentication Error');
                break;
            case 'warning':
                statusDot.classList.add('status-warning');
                statusDot.setAttribute('aria-label', 'Authentication Warning');
                break;
            default:
                statusDot.classList.add('status-error');
                statusDot.setAttribute('aria-label', 'Unknown Status');
        }
    }
    
    updateLastLoginTime(loginTime) {
        const lastLoginElement = this.elements.lastLogin;
        
        if (loginTime) {
            const loginDate = new Date(loginTime);
            const now = new Date();
            const diffMinutes = Math.floor((now - loginDate) / (1000 * 60));
            
            if (diffMinutes < 1) {
                lastLoginElement.textContent = 'Just now';
            } else if (diffMinutes < 60) {
                lastLoginElement.textContent = `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
            } else if (diffMinutes < 1440) { // Less than 24 hours
                const hours = Math.floor(diffMinutes / 60);
                lastLoginElement.textContent = `${hours} hour${hours === 1 ? '' : 's'} ago`;
            } else {
                lastLoginElement.textContent = loginDate.toLocaleDateString();
            }
        } else {
            lastLoginElement.textContent = 'Just now';
        }
    }

    // ==========================================
    // SEQUENCE MANAGEMENT FUNCTIONALITY
    // ==========================================

    // Storage functions for sequences
    async saveSequences(sequences) {
        try {
            await chrome.storage.local.set({ followUpSequences: sequences });
        } catch (error) {
            console.error('Failed to save sequences:', error);
            throw error;
        }
    }

    async loadSequences() {
        try {
            const result = await chrome.storage.local.get(['followUpSequences']);
            return result.followUpSequences || [];
        } catch (error) {
            console.error('Failed to load sequences:', error);
            return [];
        }
    }

    async deleteSequence(sequenceName) {
        try {
            const sequences = await this.loadSequences();
            const updatedSequences = sequences.filter(seq => seq.name !== sequenceName);
            await this.saveSequences(updatedSequences);
            return updatedSequences;
        } catch (error) {
            console.error('Failed to delete sequence:', error);
            throw error;
        }
    }

    // Navigation functions
    showSequencePanel() {
        this.elements.authenticated.classList.add('hidden');
        this.elements.sequencePanel.classList.remove('hidden');
        this.loadSequencesView();
    }

    hideSequencePanel() {
        this.elements.sequencePanel.classList.add('hidden');
        this.elements.authenticated.classList.remove('hidden');
    }

    showSequenceForm(sequence = null) {
        this.currentEditingSequence = sequence;
        this.elements.sequenceFormModal.classList.remove('hidden');
        
        if (sequence) {
            this.elements.sequenceFormTitle.textContent = 'Edit Follow-Up Sequence';
            this.populateSequenceForm(sequence);
        } else {
            this.elements.sequenceFormTitle.textContent = 'New Follow-Up Sequence';
            this.resetSequenceForm();
        }
        
        this.elements.sequenceName.focus();
    }

    hideSequenceForm() {
        this.elements.sequenceFormModal.classList.add('hidden');
        this.currentEditingSequence = null;
        this.resetSequenceForm();
    }

    async loadSequencesView() {
        try {
            const sequences = await this.loadSequences();
            this.renderSequencesList(sequences);
        } catch (error) {
            console.error('Failed to load sequences view:', error);
        }
    }

    renderSequencesList(sequences) {
        const listContainer = this.elements.sequencesList;
        const emptyState = this.elements.sequencesEmpty;

        if (sequences.length === 0) {
            listContainer.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        listContainer.innerHTML = sequences.map((sequence, index) => `
            <div class="sequence-item" data-sequence-index="${index}">
                <div class="sequence-item-header">
                    <h4 class="sequence-name">${this.escapeHtml(sequence.name)}</h4>
                    <div class="sequence-actions">
                        <button class="sequence-edit-btn" data-sequence-index="${index}">Edit</button>
                        <button class="sequence-delete-btn" data-sequence-index="${index}">Delete</button>
                    </div>
                </div>
                <div class="sequence-summary">
                    <span class="sequence-step-count">${sequence.steps.length} step${sequence.steps.length === 1 ? '' : 's'}</span>
                    • Send on ${this.formatSendDays(sequence.sendWindow.days)}
                    • ${sequence.sendWindow.startHour}:00 - ${sequence.sendWindow.endHour}:00
                </div>
            </div>
        `).join('');

        // Add event listeners for edit and delete buttons
        listContainer.querySelectorAll('.sequence-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.sequenceIndex);
                this.showSequenceForm(sequences[index]);
            });
        });

        listContainer.querySelectorAll('.sequence-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.sequenceIndex);
                if (confirm(`Are you sure you want to delete "${sequences[index].name}"?`)) {
                    try {
                        await this.deleteSequence(sequences[index].name);
                        this.loadSequencesView(); // Refresh the view
                        this.updateSequenceDropdown(); // Update main UI dropdown
                    } catch (error) {
                        alert('Failed to delete sequence. Please try again.');
                    }
                }
            });
        });
    }

    // Form management
    resetSequenceForm() {
        this.elements.sequenceForm.reset();
        this.elements.stepsContainer.innerHTML = '';
        this.addStep(); // Add one initial step
    }

    populateSequenceForm(sequence) {
        this.elements.sequenceName.value = sequence.name;
        
        // Set send window days
        const dayCheckboxes = this.elements.sequenceForm.querySelectorAll('input[name="sendDays"]');
        dayCheckboxes.forEach(checkbox => {
            checkbox.checked = sequence.sendWindow.days.includes(checkbox.value);
        });
        
        // Set send hours
        document.getElementById('send-start-hour').value = sequence.sendWindow.startHour;
        document.getElementById('send-end-hour').value = sequence.sendWindow.endHour;
        
        // Clear and populate steps
        this.elements.stepsContainer.innerHTML = '';
        sequence.steps.forEach(step => {
            this.addStep(step);
        });
    }

    addStep(stepData = null) {
        const stepCount = this.elements.stepsContainer.children.length;
        if (stepCount >= 4) {
            alert('Maximum of 4 steps allowed per sequence.');
            return;
        }

        const stepIndex = stepCount;
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step-item';
        stepDiv.dataset.stepIndex = stepIndex;

        stepDiv.innerHTML = `
            <div class="step-header">
                <h4 class="step-title">Step ${stepIndex + 1}</h4>
                <button type="button" class="step-remove-btn" data-step-index="${stepIndex}">Remove</button>
            </div>
            <div class="step-timing">
                <label>Wait:</label>
                <input type="number" name="stepDelay" min="1" max="30" value="${stepData?.delay || 1}" required>
                <select name="stepDelayUnit">
                    <option value="days" ${stepData?.delayUnit === 'days' ? 'selected' : ''}>business days</option>
                    <option value="hours" ${stepData?.delayUnit === 'hours' ? 'selected' : ''}>hours</option>
                </select>
                <span>after ${stepIndex === 0 ? 'original email' : 'previous step'}</span>
            </div>
            <div class="step-variants">
                <label>Email templates (up to 3 variants):</label>
                <div class="variants-container" data-step-index="${stepIndex}">
                    <!-- Variants will be added here -->
                </div>
                <button type="button" class="add-variant-btn" data-step-index="${stepIndex}">+ Add variant</button>
            </div>
        `;

        this.elements.stepsContainer.appendChild(stepDiv);

        // Add event listener for remove button
        stepDiv.querySelector('.step-remove-btn').addEventListener('click', () => {
            this.removeStep(stepIndex);
        });

        // Add event listener for add variant button
        stepDiv.querySelector('.add-variant-btn').addEventListener('click', () => {
            this.addVariant(stepIndex);
        });

        // Add initial variant or populate from stepData
        const variantsContainer = stepDiv.querySelector('.variants-container');
        if (stepData && stepData.variants) {
            stepData.variants.forEach(variant => {
                this.addVariant(stepIndex, variant);
            });
        } else {
            this.addVariant(stepIndex); // Add one initial variant
        }
    }

    removeStep(stepIndex) {
        const stepElement = this.elements.stepsContainer.querySelector(`[data-step-index="${stepIndex}"]`);
        if (stepElement) {
            stepElement.remove();
            this.renumberSteps();
        }
    }

    renumberSteps() {
        const steps = this.elements.stepsContainer.querySelectorAll('.step-item');
        steps.forEach((step, index) => {
            step.dataset.stepIndex = index;
            step.querySelector('.step-title').textContent = `Step ${index + 1}`;
            step.querySelector('.step-remove-btn').dataset.stepIndex = index;
            step.querySelector('.add-variant-btn').dataset.stepIndex = index;
            step.querySelector('.variants-container').dataset.stepIndex = index;
            
            // Update timing text
            const timingText = step.querySelector('.step-timing span');
            timingText.textContent = `after ${index === 0 ? 'original email' : 'previous step'}`;
        });
    }

    addVariant(stepIndex, variantText = '') {
        const variantsContainer = this.elements.stepsContainer.querySelector(`[data-step-index="${stepIndex}"] .variants-container`);
        const variantCount = variantsContainer.children.length;
        
        if (variantCount >= 3) {
            alert('Maximum of 3 variants allowed per step.');
            return;
        }

        const variantDiv = document.createElement('div');
        variantDiv.className = 'variant-item';
        variantDiv.innerHTML = `
            <textarea class="variant-textarea" name="stepVariant" placeholder="Enter email template text..." required>${this.escapeHtml(variantText)}</textarea>
            <button type="button" class="variant-remove-btn">×</button>
        `;

        variantDiv.querySelector('.variant-remove-btn').addEventListener('click', () => {
            variantDiv.remove();
        });

        variantsContainer.appendChild(variantDiv);
    }

    async handleSequenceFormSubmit(e) {
        e.preventDefault();
        
        try {
            const formData = new FormData(this.elements.sequenceForm);
            const sequence = this.parseSequenceFormData(formData);
            
            // Validate sequence
            if (!this.validateSequence(sequence)) {
                return;
            }

            // Save sequence
            const sequences = await this.loadSequences();
            
            if (this.currentEditingSequence) {
                // Update existing sequence
                const index = sequences.findIndex(seq => seq.name === this.currentEditingSequence.name);
                if (index !== -1) {
                    sequences[index] = sequence;
                }
            } else {
                // Check for duplicate names
                if (sequences.some(seq => seq.name === sequence.name)) {
                    alert('A sequence with this name already exists. Please choose a different name.');
                    return;
                }
                // Add new sequence
                sequences.push(sequence);
            }

            await this.saveSequences(sequences);
            this.hideSequenceForm();
            this.loadSequencesView();
            // Update main UI dropdown after sequence changes
            this.updateSequenceDropdown();
            
        } catch (error) {
            console.error('Failed to save sequence:', error);
            alert('Failed to save sequence. Please try again.');
        }
    }

    parseSequenceFormData(formData) {
        const sequence = {
            name: formData.get('name').trim(),
            sendWindow: {
                days: formData.getAll('sendDays'),
                startHour: parseInt(formData.get('startHour')),
                endHour: parseInt(formData.get('endHour'))
            },
            steps: []
        };

        // Parse steps
        const stepElements = this.elements.stepsContainer.querySelectorAll('.step-item');
        stepElements.forEach((stepElement, index) => {
            const delay = parseInt(stepElement.querySelector('input[name="stepDelay"]').value);
            const delayUnit = stepElement.querySelector('select[name="stepDelayUnit"]').value;
            const variantTextareas = stepElement.querySelectorAll('textarea[name="stepVariant"]');
            
            const variants = Array.from(variantTextareas)
                .map(textarea => textarea.value.trim())
                .filter(text => text.length > 0);

            sequence.steps.push({
                delay,
                delayUnit,
                variants
            });
        });

        return sequence;
    }

    validateSequence(sequence) {
        if (!sequence.name) {
            alert('Please enter a sequence name.');
            return false;
        }

        if (sequence.sendWindow.days.length === 0) {
            alert('Please select at least one day for sending emails.');
            return false;
        }

        if (sequence.sendWindow.startHour >= sequence.sendWindow.endHour) {
            alert('Start hour must be before end hour.');
            return false;
        }

        if (sequence.steps.length === 0) {
            alert('Please add at least one step to the sequence.');
            return false;
        }

        for (let i = 0; i < sequence.steps.length; i++) {
            const step = sequence.steps[i];
            if (step.variants.length === 0) {
                alert(`Step ${i + 1} must have at least one email template.`);
                return false;
            }
        }

        return true;
    }

    // Utility functions
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatSendDays(days) {
        const dayNames = {
            monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', 
            thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
        };
        
        if (days.length === 7) return 'all days';
        if (days.length === 5 && !days.includes('saturday') && !days.includes('sunday')) {
            return 'weekdays';
        }
        
        return days.map(day => dayNames[day]).join(', ');
    }

    // ==========================================
    // ENROLLMENT FUNCTIONALITY
    // ==========================================

    async updateSequenceDropdown() {
        try {
            const sequences = await this.loadSequences();
            const select = this.elements.sequenceSelect;
            
            // Clear existing options except the first placeholder
            select.innerHTML = '<option value="">Select a sequence...</option>';
            
            // Add sequence options
            sequences.forEach(sequence => {
                const option = document.createElement('option');
                option.value = sequence.name;
                option.textContent = `${sequence.name} (${sequence.steps.length} steps)`;
                select.appendChild(option);
            });
            
            // Show/hide enrollment section based on available sequences
            if (sequences.length > 0) {
                this.elements.enrollmentSection.classList.remove('hidden');
            } else {
                this.elements.enrollmentSection.classList.add('hidden');
            }
            
        } catch (error) {
            console.error('Failed to update sequence dropdown:', error);
        }
    }

    updateEnrollButton() {
        const selectedSequence = this.elements.sequenceSelect.value;
        const selectedEmails = this.getSelectedEmails();
        const selectedCount = selectedEmails.length;
        
        this.elements.selectedCount.textContent = selectedCount;
        this.elements.enrollSelectedBtn.disabled = !selectedSequence || selectedCount === 0;
    }

    getSelectedEmails() {
        const checkboxes = this.elements.emailsList.querySelectorAll('.email-checkbox:checked');
        return Array.from(checkboxes).map(checkbox => {
            const emailItem = checkbox.closest('.email-item');
            return {
                id: emailItem.dataset.emailId,
                subject: emailItem.dataset.emailSubject,
                to: emailItem.dataset.emailTo,
                threadId: emailItem.dataset.threadId
            };
        });
    }

    async enrollSelectedEmails() {
        const selectedSequence = this.elements.sequenceSelect.value;
        const selectedEmails = this.getSelectedEmails();
        
        if (!selectedSequence || selectedEmails.length === 0) {
            return;
        }

        try {
            // Get sequence details
            const sequences = await this.loadSequences();
            const sequence = sequences.find(seq => seq.name === selectedSequence);
            
            if (!sequence) {
                alert('Selected sequence not found. Please refresh and try again.');
                return;
            }

            // Create enrollment records
            const enrollments = selectedEmails.map(email => ({
                id: this.generateEnrollmentId(),
                emailId: email.id,
                threadId: email.threadId,
                subject: email.subject,
                to: email.to,
                sequenceName: selectedSequence,
                sequence: sequence,
                enrolledAt: new Date().toISOString(),
                currentStep: 0,
                status: 'active',
                nextSendDate: this.calculateNextSendDate(sequence.steps[0], sequence.sendWindow)
            }));

            // Save enrollments
            await this.saveEnrollments(enrollments);
            
            // Clear selections and update UI
            this.clearEmailSelections();
            this.elements.sequenceSelect.value = '';
            this.updateEnrollButton();
            
            // Show success message
            alert(`Successfully enrolled ${enrollments.length} email${enrollments.length === 1 ? '' : 's'} in "${selectedSequence}" sequence.`);
            
        } catch (error) {
            console.error('Failed to enroll emails:', error);
            alert('Failed to enroll emails. Please try again.');
        }
    }

    async saveEnrollments(enrollments) {
        try {
            const result = await chrome.storage.local.get(['emailEnrollments']);
            const existingEnrollments = result.emailEnrollments || [];
            
            const updatedEnrollments = [...existingEnrollments, ...enrollments];
            await chrome.storage.local.set({ emailEnrollments: updatedEnrollments });
            
        } catch (error) {
            console.error('Failed to save enrollments:', error);
            throw error;
        }
    }

    generateEnrollmentId() {
        return 'enroll_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    calculateNextSendDate(step, sendWindow) {
        const now = new Date();
        let sendDate = new Date(now);
        
        // Add delay
        if (step.delayUnit === 'hours') {
            sendDate.setHours(sendDate.getHours() + step.delay);
        } else {
            // Business days
            let daysAdded = 0;
            while (daysAdded < step.delay) {
                sendDate.setDate(sendDate.getDate() + 1);
                const dayName = sendDate.toLocaleDateString('en-US', { weekday: 'lowercase' });
                if (sendWindow.days.includes(dayName)) {
                    daysAdded++;
                }
            }
        }
        
        // Adjust to send window hours
        if (sendDate.getHours() < sendWindow.startHour) {
            sendDate.setHours(sendWindow.startHour, 0, 0, 0);
        } else if (sendDate.getHours() >= sendWindow.endHour) {
            // Move to next valid day
            do {
                sendDate.setDate(sendDate.getDate() + 1);
            } while (!sendWindow.days.includes(sendDate.toLocaleDateString('en-US', { weekday: 'lowercase' })));
            sendDate.setHours(sendWindow.startHour, 0, 0, 0);
        }
        
        return sendDate.toISOString();
    }

    clearEmailSelections() {
        const checkboxes = this.elements.emailsList.querySelectorAll('.email-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            const emailItem = checkbox.closest('.email-item');
            emailItem.classList.remove('selected');
        });
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
