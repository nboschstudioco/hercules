/**
 * Gmail Auto Follow-Up Extension - Side Panel Script
 * Handles OAuth authentication, sequence management, email enrollment, and tracking
 */

class GmailFollowUpApp {
    constructor() {
        this.elements = {
            // App states
            loading: document.getElementById('loading'),
            signin: document.getElementById('signin'),
            mainApp: document.getElementById('main-app'),
            error: document.getElementById('error'),
            
            // Authentication
            signinBtn: document.getElementById('signin-btn'),
            signoutBtn: document.getElementById('signout-btn'),
            retryBtn: document.getElementById('retry-btn'),
            userEmail: document.getElementById('user-email'),
            statusDot: document.getElementById('status-dot'),
            errorMessage: document.getElementById('error-message'),
            
            // Navigation
            tabEmails: document.getElementById('tab-emails'),
            tabSequences: document.getElementById('tab-sequences'),
            tabEnrollments: document.getElementById('tab-enrollments'),
            emailsTab: document.getElementById('emails-tab'),
            sequencesTab: document.getElementById('sequences-tab'),
            enrollmentsTab: document.getElementById('enrollments-tab'),
            
            // Emails
            refreshEmailsBtn: document.getElementById('refresh-emails-btn'),
            emailsLoading: document.getElementById('emails-loading'),
            emailsList: document.getElementById('emails-list'),
            emailsEmpty: document.getElementById('emails-empty'),
            emailsError: document.getElementById('emails-error'),
            emailsErrorMessage: document.getElementById('emails-error-message'),
            retryEmailsBtn: document.getElementById('retry-emails-btn'),
            
            // Enrollment
            enrollmentSection: document.getElementById('enrollment-section'),
            selectedCount: document.getElementById('selected-count'),
            selectedPlural: document.getElementById('selected-plural'),
            sequenceSelect: document.getElementById('sequence-select'),
            enrollBtn: document.getElementById('enroll-btn'),
            
            // Sequences
            addSequenceBtn: document.getElementById('add-sequence-btn'),
            sequencesList: document.getElementById('sequences-list'),
            sequencesEmpty: document.getElementById('sequences-empty'),
            createFirstSequenceBtn: document.getElementById('create-first-sequence-btn'),
            
            // Enrollments
            statusFilter: document.getElementById('status-filter'),
            enrollmentsList: document.getElementById('enrollments-list'),
            enrollmentsEmpty: document.getElementById('enrollments-empty'),
            
            // Modal
            sequenceModal: document.getElementById('sequence-modal'),
            sequenceModalTitle: document.getElementById('sequence-modal-title'),
            closeSequenceModal: document.getElementById('close-sequence-modal'),
            sequenceForm: document.getElementById('sequence-form'),
            sequenceName: document.getElementById('sequence-name'),
            sequenceTimezone: document.getElementById('sequence-timezone'),
            stepsContainer: document.getElementById('steps-container'),
            addStepBtn: document.getElementById('add-step-btn'),
            cancelSequenceBtn: document.getElementById('cancel-sequence-btn'),
            saveSequenceBtn: document.getElementById('save-sequence-btn')
        };
        
        this.currentEditingSequence = null;
        this.selectedEmails = new Set();
        this.isAuthenticated = false;
        
        this.init();
    }

    async init() {
        this.showState('loading');
        this.setupEventListeners();
        
        try {
            await this.checkAuthStatus();
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showState('signin');
        }
    }

    setupEventListeners() {
        // Authentication
        this.elements.signinBtn.addEventListener('click', () => this.handleSignIn());
        this.elements.signoutBtn.addEventListener('click', () => this.handleSignOut());
        this.elements.retryBtn.addEventListener('click', () => this.handleRetry());
        
        // Navigation
        this.elements.tabEmails.addEventListener('click', () => this.showTab('emails'));
        this.elements.tabSequences.addEventListener('click', () => this.showTab('sequences'));
        this.elements.tabEnrollments.addEventListener('click', () => this.showTab('enrollments'));
        
        // Emails
        this.elements.refreshEmailsBtn.addEventListener('click', () => this.loadSentEmails());
        this.elements.retryEmailsBtn.addEventListener('click', () => this.loadSentEmails());
        
        // Enrollment
        this.elements.sequenceSelect.addEventListener('change', () => this.updateEnrollButton());
        this.elements.enrollBtn.addEventListener('click', () => this.enrollSelectedEmails());
        
        // Sequences
        this.elements.addSequenceBtn.addEventListener('click', () => this.showSequenceModal());
        this.elements.createFirstSequenceBtn.addEventListener('click', () => this.showSequenceModal());
        this.elements.closeSequenceModal.addEventListener('click', () => this.hideSequenceModal());
        this.elements.cancelSequenceBtn.addEventListener('click', () => this.hideSequenceModal());
        this.elements.sequenceForm.addEventListener('submit', (e) => this.handleSequenceFormSubmit(e));
        this.elements.addStepBtn.addEventListener('click', () => this.addStep());
        
        // Enrollments
        this.elements.statusFilter.addEventListener('change', () => this.loadEnrollments());
    }

    showState(state) {
        const states = [this.elements.loading, this.elements.signin, this.elements.mainApp, this.elements.error];
        states.forEach(el => el.classList.add('hidden'));
        
        switch (state) {
            case 'loading':
                this.elements.loading.classList.remove('hidden');
                break;
            case 'signin':
                this.elements.signin.classList.remove('hidden');
                break;
            case 'main':
                this.elements.mainApp.classList.remove('hidden');
                break;
            case 'error':
                this.elements.error.classList.remove('hidden');
                break;
        }
    }

    showTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        
        this.elements[`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`].classList.add('active');
        this.elements[`${tabName}Tab`].classList.add('active');
        
        // Load content for the active tab
        switch (tabName) {
            case 'emails':
                this.loadSentEmails();
                this.updateSequenceDropdown();
                break;
            case 'sequences':
                this.loadSequences();
                break;
            case 'enrollments':
                this.loadEnrollments();
                break;
        }
    }

    // ==========================================
    // AUTHENTICATION
    // ==========================================

    async checkAuthStatus() {
        try {
            const sessionToken = await apiClient.getSessionToken();
            
            if (sessionToken) {
                // Check authentication status with backend
                const authStatus = await apiClient.checkAuthStatus();
                
                if (authStatus.authenticated) {
                    this.isAuthenticated = true;
                    this.elements.userEmail.textContent = authStatus.user.email;
                    this.updateAuthenticationStatus('ok');
                    this.showState('main-app');
                    this.showTab('emails');
                    return;
                }
            }
            
            this.showState('signin');
        } catch (error) {
            console.error('Error checking auth status:', error);
            await apiClient.clearSessionToken();
            this.showState('signin');
        }
    }

    async handleSignIn() {
        try {
            this.elements.signinBtn.disabled = true;
            this.elements.signinBtn.textContent = 'Signing in...';
            
            // Clear any previous auth results
            await chrome.storage.local.remove(['authResult']);
            
            // Get OAuth details from backend
            const authDetails = await apiClient.startAuth();
            
            // Open OAuth popup
            const popup = window.open(
                authDetails.authUrl,
                'oauth_popup',
                'width=500,height=600,scrollbars=yes,resizable=yes'
            );
            
            // Check if popup was blocked
            if (!popup) {
                throw new Error('Popup blocked. Please allow popups and try again.');
            }
            
            // Poll for auth result from background script
            const authResult = await this.waitForAuthResult(popup);
            
            if (authResult.success) {
                // Store session token and complete authentication
                await apiClient.setSessionToken(authResult.token);
                
                this.isAuthenticated = true;
                this.elements.userEmail.textContent = authResult.user.email;
                this.updateAuthenticationStatus('ok');
                this.showState('main-app');
                this.showTab('emails');
                this.resetSignInButton();
            } else {
                throw new Error(authResult.message || authResult.error || 'Authentication failed');
            }
            
        } catch (error) {
            console.error('Sign-in error:', error);
            this.showError(`Sign-in error: ${error.message}. Please try again or check your internet connection.`);
            this.resetSignInButton();
        }
    }
    
    async waitForAuthResult(popup) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const timeout = 120000; // 2 minutes
            
            const checkResult = async () => {
                try {
                    // Check if popup is closed
                    if (popup.closed) {
                        reject(new Error('Authentication cancelled by user'));
                        return;
                    }
                    
                    // Check for timeout
                    if (Date.now() - startTime > timeout) {
                        popup.close();
                        reject(new Error('Authentication timed out'));
                        return;
                    }
                    
                    // Check for auth result in storage
                    const result = await chrome.storage.local.get(['authResult']);
                    if (result.authResult && Date.now() - result.authResult.timestamp < 5000) {
                        // Clear the result and resolve
                        await chrome.storage.local.remove(['authResult']);
                        resolve(result.authResult);
                        return;
                    }
                    
                    // Continue polling
                    setTimeout(checkResult, 500);
                } catch (error) {
                    reject(error);
                }
            };
            
            checkResult();
        });
    }
    
    async initializeApp() {
        // Load initial data after successful authentication
        try {
            await Promise.all([
                this.updateSequenceDropdown(),
                this.loadSequences()
            ]);
            
            // Load emails for the currently active tab
            if (this.elements.emailsTab.classList.contains('active')) {
                await this.loadSentEmails();
            }
        } catch (error) {
            console.error('Failed to initialize app:', error);
        }
    }

    async handleSignOut() {
        try {
            await apiClient.logout();
            this.isAuthenticated = false;
            this.selectedEmails.clear();
            this.showState('signin');
        } catch (error) {
            console.error('Sign-out error:', error);
            await apiClient.clearSessionToken();
            this.isAuthenticated = false;
            this.selectedEmails.clear();
            this.showState('signin');
        }
    }

    async handleRetry() {
        this.showState('loading');
        await this.checkAuthStatus();
    }

    async getGmailToken() {
        try {
            const result = await apiClient.getGmailToken();
            return result.accessToken;
        } catch (error) {
            console.error('Error getting Gmail token:', error);
            if (error.message.includes('Authentication expired')) {
                await this.handleSignOut();
            }
            throw error;
        }
    }

    async getUserProfile() {
        try {
            const result = await apiClient.getUserProfile();
            return result.user;
        } catch (error) {
            console.error('Error getting user profile:', error);
            throw error;
        }
    }

    async verifySessionToken(sessionToken) {
        try {
            const authStatus = await apiClient.checkAuthStatus();
            return authStatus.authenticated;
        } catch (error) {
            console.error('Error verifying session token:', error);
            return false;
        }
    }

    // Removed - replaced by apiClient.logout()

    async storeAuthData(sessionToken, userData) {
        await apiClient.setSessionToken(sessionToken);
        // User data is now stored on the backend via the session token
    }

    updateAuthenticationStatus(status) {
        this.elements.statusDot.className = `status-dot status-${status}`;
    }
    
    getBackendUrl() {
        return apiClient.getBackendUrl();
    }
    
    handleAuthError(error, message) {
        console.error('Authentication error:', error, message);
        this.showError(message || 'Authentication failed. Please try again.');
        this.resetSignInButton();
    }
    
    resetSignInButton() {
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

    getErrorMessage(error) {
        if (error.message.includes('authorization')) {
            return 'Authorization failed. Please check your permissions and try again.';
        } else if (error.message.includes('network')) {
            return 'Network error. Please check your connection and try again.';
        } else {
            return 'An unexpected error occurred. Please try again.';
        }
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.showState('error');
    }

    // ==========================================
    // EMAIL MANAGEMENT
    // ==========================================

    async loadSentEmails() {
        try {
            this.elements.emailsLoading.classList.remove('hidden');
            this.elements.emailsList.innerHTML = '';
            this.elements.emailsEmpty.classList.add('hidden');
            this.elements.emailsError.classList.add('hidden');
            
            // First try to sync emails from Gmail
            try {
                await apiClient.syncEmails();
            } catch (syncError) {
                console.warn('Email sync failed, using cached data:', syncError.message);
            }
            
            // Get emails from backend
            const result = await apiClient.getSentEmails(50);
            const emails = result.emails || [];
            
            this.elements.emailsLoading.classList.add('hidden');
            
            if (emails.length === 0) {
                this.elements.emailsEmpty.classList.remove('hidden');
                this.elements.enrollmentSection.classList.add('hidden');
            } else {
                await this.displayEmails(emails);
                this.elements.enrollmentSection.classList.remove('hidden');
            }
            
        } catch (error) {
            console.error('Failed to load emails:', error);
            this.elements.emailsLoading.classList.add('hidden');
            this.elements.emailsErrorMessage.textContent = error.message;
            this.elements.emailsError.classList.remove('hidden');
            this.elements.enrollmentSection.classList.add('hidden');
        }
    }

    async fetchSentEmails(gmailToken) {
        const response = await fetch(
            'https://www.googleapis.com/gmail/v1/users/me/messages?q=in:sent&maxResults=50',
            { headers: { 'Authorization': `Bearer ${gmailToken}` } }
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch emails');
        }
        
        const data = await response.json();
        
        if (!data.messages) {
            return [];
        }
        
        const emailPromises = data.messages.slice(0, 20).map(async (msg) => {
            const detailResponse = await fetch(
                `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
                { headers: { 'Authorization': `Bearer ${gmailToken}` } }
            );
            
            if (!detailResponse.ok) return null;
            
            const detail = await detailResponse.json();
            const headers = detail.payload.headers;
            
            const subject = this.getHeaderValue(headers, 'Subject') || '(No Subject)';
            // RECIPIENT HANDLING: Currently only extracts 'To' header
            // CC and BCC recipients are NOT included in follow-up sequences
            const to = this.getHeaderValue(headers, 'To') || '';
            const cc = this.getHeaderValue(headers, 'Cc') || '';
            const bcc = this.getHeaderValue(headers, 'Bcc') || '';
            const originalDate = this.getHeaderValue(headers, 'Date');
            const date = this.formatDate(originalDate);
            
            return {
                id: msg.id,
                threadId: msg.threadId,
                subject,
                to, // Only 'To' recipients will receive follow-ups
                cc, // CC data captured but not used in follow-ups
                bcc, // BCC data captured but not used in follow-ups
                date,
                originalDate: originalDate // Store the raw date for calculations
            };
        });
        
        const emails = await Promise.all(emailPromises);
        return emails.filter(email => email !== null);
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
            const diffTime = date - now; // Future dates should be positive
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffTime > 0) {
                // Future dates
                if (diffDays === 0) {
                    return 'Today';
                } else if (diffDays === 1) {
                    return 'Tomorrow';
                } else if (diffDays < 7) {
                    return `in ${diffDays} days`;
                } else {
                    return date.toLocaleDateString();
                }
            } else {
                // Past dates
                const pastDays = Math.abs(diffDays);
                if (pastDays === 0) {
                    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } else if (pastDays === 1) {
                    return 'Yesterday';
                } else if (pastDays < 7) {
                    return `${pastDays} days ago`;
                } else {
                    return date.toLocaleDateString();
                }
            }
        } catch (error) {
            return dateString;
        }
    }

    async displayEmails(emails) {
        // Get current enrollments to check status
        const enrollments = await this.getEnrollments();
        
        this.elements.emailsList.innerHTML = emails.map(email => {
            const emailEnrollments = enrollments.filter(e => e.emailId === email.id && !['finished'].includes(e.status));
            const isEnrolled = emailEnrollments.length > 0;
            const enrollmentInfo = this.getEnrollmentInfo(emailEnrollments);
            
            return `
                <div class="email-item ${isEnrolled ? 'enrolled' : ''}" data-email-id="${email.id}" data-thread-id="${email.threadId}" data-subject="${this.escapeHtml(email.subject)}" data-to="${this.escapeHtml(email.to)}" data-cc="${this.escapeHtml(email.cc || '')}" data-bcc="${this.escapeHtml(email.bcc || '')}" data-original-date="${email.originalDate || ''}">
                    <input type="checkbox" class="email-checkbox" data-email-id="${email.id}" ${isEnrolled ? 'disabled' : ''}>
                    <div class="email-content">
                        <div class="email-subject">
                            ${this.escapeHtml(email.subject)}
                            ${isEnrolled ? `<span class="enrollment-indicator" title="${enrollmentInfo.tooltip}">🔄</span>` : ''}
                        </div>
                        <div class="email-to">
                            To: ${this.escapeHtml(email.to)}
                            ${email.cc ? `<br>CC: ${this.escapeHtml(email.cc)}` : ''}
                        </div>
                        <div class="email-date">${email.date}</div>
                        ${isEnrolled ? `<div class="enrollment-details">${enrollmentInfo.summary}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners
        this.elements.emailsList.querySelectorAll('.email-item').forEach(item => {
            const checkbox = item.querySelector('.email-checkbox');
            const isEnrolled = item.classList.contains('enrolled');
            
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox' && !isEnrolled && !e.target.classList.contains('enrollment-indicator')) {
                    checkbox.checked = !checkbox.checked;
                    this.updateEmailSelection(item);
                }
            });
            
            if (!isEnrolled) {
                checkbox.addEventListener('change', () => {
                    this.updateEmailSelection(item);
                });
            }
        });
    }

    getEnrollmentInfo(enrollments) {
        if (enrollments.length === 0) {
            return { summary: '', tooltip: '' };
        }
        
        const sequenceNames = [...new Set(enrollments.map(e => e.sequenceName))];
        const statuses = enrollments.map(e => {
            let statusText = e.status;
            if (e.status === 'paused' && e.statusReason) {
                statusText = e.statusReason === 'manual' ? 'Paused: Manual' : 'Paused: Reply Detected';
            } else if (e.status === 'pending') {
                statusText = 'Pending';
            } else if (e.status === 'active') {
                statusText = 'Active';
            } else if (e.status === 'error') {
                statusText = 'Error';
            }
            return statusText;
        });
        
        const summary = sequenceNames.length === 1 
            ? `${sequenceNames[0]} (${statuses[0]})`
            : `${sequenceNames.length} sequences`;
            
        const tooltip = enrollments.map(e => {
            let statusText = e.status;
            if (e.status === 'paused' && e.statusReason) {
                statusText = e.statusReason === 'manual' ? 'Paused: Manual' : 'Paused: Reply Detected';
            }
            return `${e.sequenceName}: ${statusText}`;
        }).join('\n');
        
        return { summary, tooltip };
    }

    updateEmailSelection(emailItem) {
        const checkbox = emailItem.querySelector('.email-checkbox');
        const emailId = checkbox.dataset.emailId;
        
        if (checkbox.checked) {
            emailItem.classList.add('selected');
            this.selectedEmails.add(emailId);
        } else {
            emailItem.classList.remove('selected');
            this.selectedEmails.delete(emailId);
        }
        
        this.updateEnrollButton();
    }

    updateEnrollButton() {
        const count = this.selectedEmails.size;
        this.elements.selectedCount.textContent = count;
        this.elements.selectedPlural.textContent = count === 1 ? '' : 's';
        
        const hasSequence = this.elements.sequenceSelect.value;
        this.elements.enrollBtn.disabled = !hasSequence || count === 0;
    }

    // ==========================================
    // SEQUENCE MANAGEMENT
    // ==========================================

    async loadSequences() {
        try {
            this.showSequencesLoading(true);
            const sequences = await this.getSequences();
            this.renderSequencesList(sequences);
            this.showSequencesLoading(false);
        } catch (error) {
            console.error('Failed to load sequences:', error);
            this.showSequencesError(error.message);
            this.showSequencesLoading(false);
        }
    }

    async getSequences() {
        try {
            const result = await apiClient.getSequences();
            return result.sequences || [];
        } catch (error) {
            console.error('Failed to get sequences from backend:', error);
            throw error;
        }
    }

    async saveSequence(sequenceData) {
        try {
            if (this.currentEditingSequence) {
                // Update existing sequence
                const result = await apiClient.updateSequence(this.currentEditingSequence.id, sequenceData);
                return result.sequence;
            } else {
                // Create new sequence
                const result = await apiClient.createSequence(sequenceData);
                return result.sequence;
            }
        } catch (error) {
            console.error('Failed to save sequence:', error);
            throw error;
        }
    }

    renderSequencesList(sequences) {
        if (sequences.length === 0) {
            this.elements.sequencesList.innerHTML = '';
            this.elements.sequencesEmpty.classList.remove('hidden');
            return;
        }
        
        this.elements.sequencesEmpty.classList.add('hidden');
        this.elements.sequencesList.innerHTML = sequences.map((sequence, index) => `
            <div class="sequence-item">
                <div class="sequence-item-header">
                    <h4 class="sequence-name">${this.escapeHtml(sequence.name)}</h4>
                    <div class="sequence-actions">
                        <button class="sequence-edit-btn" data-id="${sequence.id}">Edit</button>
                        <button class="sequence-delete-btn" data-id="${sequence.id}">Delete</button>
                    </div>
                </div>
                <div class="sequence-summary">
                    <span class="sequence-step-count">${sequence.steps.length} step${sequence.steps.length === 1 ? '' : 's'}</span>
                    ${sequence.description ? `• ${this.escapeHtml(sequence.description)}` : ''}
                    • ${sequence.isActive ? 'Active' : 'Inactive'}
                </div>
            </div>
        `).join('');
        
        // Add event listeners
        this.elements.sequencesList.querySelectorAll('.sequence-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sequenceId = btn.dataset.id;
                const sequence = sequences.find(s => s.id === sequenceId);
                if (sequence) {
                    this.editSequence(sequence);
                }
            });
        });
        
        this.elements.sequencesList.querySelectorAll('.sequence-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sequenceId = btn.dataset.id;
                const sequence = sequences.find(s => s.id === sequenceId);
                if (sequence && confirm(`Are you sure you want to delete "${sequence.name}"?`)) {
                    await this.deleteSequence(sequenceId);
                }
            });
        });
    }

    async updateSequenceDropdown() {
        try {
            const sequences = await this.getSequences();
            const select = this.elements.sequenceSelect;
            
            select.innerHTML = '<option value="">Select a sequence...</option>';
            sequences.forEach(sequence => {
                const option = document.createElement('option');
                option.value = sequence.id;
                option.textContent = `${sequence.name} (${sequence.steps.length} steps)`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to update sequence dropdown:', error);
        }
    }

    showSequenceModal(sequence = null) {
        this.currentEditingSequence = sequence;
        this.elements.sequenceModal.classList.remove('hidden');
        
        if (sequence) {
            this.elements.sequenceModalTitle.textContent = 'edit follow-up sequence';
            this.populateSequenceForm(sequence);
        } else {
            this.elements.sequenceModalTitle.textContent = 'new follow-up sequence';
            this.resetSequenceForm();
            // Set default timezone
            this.elements.sequenceTimezone.value = 'America/New_York';
        }
        
        this.elements.sequenceName.focus();
    }

    hideSequenceModal() {
        this.elements.sequenceModal.classList.add('hidden');
        this.currentEditingSequence = null;
        this.resetSequenceForm();
    }

    resetSequenceForm() {
        this.elements.sequenceForm.reset();
        this.elements.stepsContainer.innerHTML = '';
        this.addStep(); // Add one initial step
    }

    populateSequenceForm(sequence) {
        this.elements.sequenceName.value = sequence.name;
        this.elements.sequenceTimezone.value = sequence.timezone || 'America/New_York';
        
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

    async handleSequenceFormSubmit(e) {
        e.preventDefault();
        
        try {
            const formData = new FormData(this.elements.sequenceForm);
            const sequence = this.parseSequenceFormData(formData);
            
            if (!this.validateSequence(sequence)) {
                return;
            }
            
            await this.saveSequence(sequence);
            this.hideSequenceModal();
            this.loadSequences();
            this.updateSequenceDropdown();
            
        } catch (error) {
            console.error('Failed to save sequence:', error);
            if (error.message.includes('name already exists')) {
                alert('A sequence with this name already exists. Please choose a different name.');
            } else {
                alert('Failed to save sequence. Please try again.');
            }
        }
    }

    parseSequenceFormData(formData) {
        const sequence = {
            name: formData.get('name').trim(),
            timezone: formData.get('timezone') || 'America/New_York',
            sendWindow: {
                days: formData.getAll('sendDays'),
                startHour: parseInt(formData.get('startHour')),
                endHour: parseInt(formData.get('endHour'))
            },
            steps: []
        };
        
        const stepElements = this.elements.stepsContainer.querySelectorAll('.step-item');
        stepElements.forEach((stepElement) => {
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
                <button type="button" class="step-remove-btn">Remove</button>
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
                <div class="variants-container">
                    <!-- Variants will be added here -->
                </div>
                <button type="button" class="add-variant-btn">+ Add variant</button>
            </div>
        `;
        
        this.elements.stepsContainer.appendChild(stepDiv);
        
        // Add event listeners
        stepDiv.querySelector('.step-remove-btn').addEventListener('click', () => {
            this.removeStep(stepDiv);
        });
        
        stepDiv.querySelector('.add-variant-btn').addEventListener('click', () => {
            this.addVariant(stepDiv);
        });
        
        // Add initial variants
        const variantsContainer = stepDiv.querySelector('.variants-container');
        if (stepData && stepData.variants) {
            stepData.variants.forEach(variant => {
                this.addVariant(stepDiv, variant);
            });
        } else {
            this.addVariant(stepDiv); // Add one initial variant
        }
    }

    removeStep(stepDiv) {
        stepDiv.remove();
        this.renumberSteps();
    }

    renumberSteps() {
        const steps = this.elements.stepsContainer.querySelectorAll('.step-item');
        steps.forEach((step, index) => {
            step.dataset.stepIndex = index;
            step.querySelector('.step-title').textContent = `Step ${index + 1}`;
            
            const timingText = step.querySelector('.step-timing span');
            timingText.textContent = `after ${index === 0 ? 'original email' : 'previous step'}`;
        });
    }

    showSequencesLoading(show) {
        const loadingEl = document.querySelector('#sequences-loading');
        if (loadingEl) {
            loadingEl.classList.toggle('hidden', !show);
        }
    }

    showSequencesError(message) {
        const errorEl = document.querySelector('#sequences-error');
        const errorMessageEl = document.querySelector('#sequences-error-message');
        if (errorEl && errorMessageEl) {
            errorMessageEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    }

    async deleteSequence(sequenceId) {
        try {
            await apiClient.deleteSequence(sequenceId);
            this.loadSequences();
            this.updateSequenceDropdown();
        } catch (error) {
            console.error('Failed to delete sequence:', error);
            alert('Failed to delete sequence. Please try again.');
        }
    }

    addVariant(stepDiv, variantText = '') {
        const variantsContainer = stepDiv.querySelector('.variants-container');
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

    editSequence(sequence) {
        this.showSequenceModal(sequence);
    }

    async deleteSequence(index) {
        const sequences = await this.getSequences();
        sequences.splice(index, 1);
        await this.saveSequences(sequences);
        this.loadSequences();
        this.updateSequenceDropdown();
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
    // ENROLLMENT MANAGEMENT
    // ==========================================

    async enrollSelectedEmails() {
        const selectedSequenceId = this.elements.sequenceSelect.value;
        const selectedEmailIds = Array.from(this.selectedEmails);
        
        if (!selectedSequenceId || selectedEmailIds.length === 0) {
            return;
        }
        
        try {
            // Get selected reply mode from UI
            const replyModeRadio = document.querySelector('input[name="reply-mode"]:checked');
            const replyMode = replyModeRadio ? replyModeRadio.value : 'reply';
            
            const enrollments = [];
            
            for (const emailId of selectedEmailIds) {
                const emailItem = document.querySelector(`[data-email-id="${emailId}"]`);
                
                const enrollmentData = {
                    emailId: emailId,
                    sequenceId: selectedSequenceId,
                    replyMode: replyMode
                };
                
                const result = await apiClient.createEnrollment(enrollmentData);
                enrollments.push(result.enrollment);
            }
            
            // Clear selections
            this.selectedEmails.clear();
            document.querySelectorAll('.email-checkbox:checked').forEach(checkbox => {
                checkbox.checked = false;
                checkbox.closest('.email-item').classList.remove('selected');
            });
            this.elements.sequenceSelect.value = '';
            this.updateEnrollButton();
            
            alert(`Successfully enrolled ${enrollments.length} email${enrollments.length === 1 ? '' : 's'} in follow-up sequence.`);
            
            // Refresh enrollments tab
            this.loadEnrollments();
            
        } catch (error) {
            console.error('Failed to enroll emails:', error);
            alert('Failed to enroll emails. Please try again.');
        }
    }

    async getEnrollments(status = null) {
        try {
            const result = await apiClient.getEnrollments({ status });
            return result.enrollments || [];
        } catch (error) {
            console.error('Failed to get enrollments from backend:', error);
            throw error;
        }
    }

    async loadEnrollments() {
        try {
            this.showEnrollmentsLoading(true);
            const statusFilter = this.elements.statusFilter.value;
            
            // Get filtered enrollments from backend
            const enrollments = await this.getEnrollments(statusFilter);
            
            this.renderEnrollmentsList(enrollments);
            this.showEnrollmentsLoading(false);
        } catch (error) {
            console.error('Failed to load enrollments:', error);
            this.showEnrollmentsError(error.message);
            this.showEnrollmentsLoading(false);
        }
    }

    renderEnrollmentsList(enrollments) {
        if (enrollments.length === 0) {
            this.elements.enrollmentsList.innerHTML = '';
            this.elements.enrollmentsEmpty.classList.remove('hidden');
            return;
        }
        
        this.elements.enrollmentsEmpty.classList.add('hidden');
        this.elements.enrollmentsList.innerHTML = enrollments.map((enrollment, index) => `
            <div class="enrollment-item">
                <div class="enrollment-header">
                    <h4 class="enrollment-subject">${this.escapeHtml(enrollment.subject)}</h4>
                    <span class="enrollment-status ${this.getStatusClass(enrollment)}">${this.getStatusDisplay(enrollment)}</span>
                </div>
                <div class="enrollment-details">
                    <div>To: ${this.escapeHtml(enrollment.to)}</div>
                    <div>Sequence: ${this.escapeHtml(enrollment.sequenceName)}</div>
                    <div>Step: ${enrollment.currentStep + 1}/${enrollment.sequence.steps.length}</div>
                    <div>Next: ${this.formatDate(enrollment.nextSendDate)}</div>
                </div>
                <div class="enrollment-actions">
                    ${this.canPause(enrollment) ? 
                        `<button class="enrollment-pause-btn" data-index="${index}">Pause</button>` :
                        this.canResume(enrollment) ?
                        `<button class="enrollment-resume-btn" data-index="${index}">Resume</button>` : ''
                    }
                    <button class="enrollment-unenroll-btn" data-index="${index}">Unenroll</button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners
        this.elements.enrollmentsList.querySelectorAll('.enrollment-pause-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const index = parseInt(btn.dataset.index);
                await this.pauseEnrollment(enrollments[index].id);
            });
        });
        
        this.elements.enrollmentsList.querySelectorAll('.enrollment-resume-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const index = parseInt(btn.dataset.index);
                await this.resumeEnrollment(enrollments[index].id);
            });
        });
        
        this.elements.enrollmentsList.querySelectorAll('.enrollment-unenroll-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const index = parseInt(btn.dataset.index);
                if (confirm('Are you sure you want to unenroll this email?')) {
                    await this.removeEnrollment(enrollments[index].id);
                }
            });
        });
    }

    async pauseEnrollment(enrollmentId) {
        try {
            await apiClient.pauseEnrollment(enrollmentId);
            this.loadEnrollments();
        } catch (error) {
            console.error('Failed to pause enrollment:', error);
            alert('Failed to pause enrollment. Please try again.');
        }
    }

    async resumeEnrollment(enrollmentId) {
        try {
            await apiClient.resumeEnrollment(enrollmentId);
            this.loadEnrollments();
        } catch (error) {
            console.error('Failed to resume enrollment:', error);
            alert('Failed to resume enrollment. Please try again.');
        }
    }

    async removeEnrollment(enrollmentId) {
        try {
            await apiClient.deleteEnrollment(enrollmentId);
            this.loadEnrollments();
        } catch (error) {
            console.error('Failed to remove enrollment:', error);
            alert('Failed to remove enrollment. Please try again.');
        }
    }

    showEnrollmentsLoading(show) {
        const loadingEl = document.querySelector('#enrollments-loading');
        if (loadingEl) {
            loadingEl.classList.toggle('hidden', !show);
        }
    }

    showEnrollmentsError(message) {
        const errorEl = document.querySelector('#enrollments-error');
        const errorMessageEl = document.querySelector('#enrollments-error-message');
        if (errorEl && errorMessageEl) {
            errorMessageEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    }

    // Removed - replaced by apiClient.resumeEnrollment()

    // Removed - enrollment management now handled by backend API

    // Removed - backend generates unique UUIDs for enrollments

    calculateNextSendDate(step, sendWindow, baseDate = null) {
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
            
            // Randomize within the next valid send window
            const windowStart = sendWindow.startHour;
            const windowEnd = sendWindow.endHour;
            const randomHour = windowStart + Math.floor(Math.random() * (windowEnd - windowStart));
            const randomMinute = Math.floor(Math.random() * 60);
            sendDate.setHours(randomHour, randomMinute, 0, 0);
        }
        
        return sendDate.toISOString();
    }

    // ==========================================
    // STATUS MANAGEMENT
    // ==========================================

    getStatusDisplay(enrollment) {
        if (enrollment.status === 'paused') {
            return enrollment.statusReason === 'manual' ? 'Paused: Manual' : 'Paused: Reply Detected';
        }
        return enrollment.status.charAt(0).toUpperCase() + enrollment.status.slice(1);
    }

    getStatusClass(enrollment) {
        const baseStatus = enrollment.status;
        if (baseStatus === 'paused') {
            return enrollment.statusReason === 'manual' ? 'paused-manual' : 'paused-reply';
        }
        return baseStatus;
    }

    canPause(enrollment) {
        return ['pending', 'active'].includes(enrollment.status);
    }

    canResume(enrollment) {
        return enrollment.status === 'paused';
    }

    // ==========================================
    // AUTOMATION & SCHEDULING
    // ==========================================

    // Removed - scheduling now handled by backend service

    async checkForReplies(enrollment) {
        try {
            const gmailToken = await this.getGmailToken();

            // Check for replies in the thread since enrollment
            const response = await fetch(
                `https://www.googleapis.com/gmail/v1/users/me/threads/${enrollment.threadId}`,
                { headers: { 'Authorization': `Bearer ${result.authToken}` } }
            );

            if (!response.ok) return false;

            const thread = await response.json();
            
            // Look for messages after enrollment that aren't from us
            const enrolledDate = new Date(enrollment.enrolledAt);
            const userEmail = result.userEmail || '';
            
            for (const message of thread.messages || []) {
                const messageDate = new Date(parseInt(message.internalDate));
                if (messageDate <= enrolledDate) continue;
                
                const fromHeader = message.payload.headers.find(h => h.name.toLowerCase() === 'from');
                if (fromHeader && !fromHeader.value.includes(userEmail)) {
                    return true; // Reply detected
                }
            }

            return false;
        } catch (error) {
            console.error('Error checking for replies:', error);
            return false;
        }
    }

    /**
     * RECIPIENT HANDLING WITH REPLY MODE SUPPORT:
     * Follow-up emails now support both Reply and Reply-to-All modes.
     * 
     * REPLY MODE BEHAVIOR:
     * - 'reply': Sends only to primary 'To' recipient from original email
     * - 'reply-all': Sends to all To and CC recipients, excluding user's email
     * 
     * FEATURES:
     * - User selects reply mode during enrollment
     * - Proper recipient deduplication
     * - User email exclusion from reply-all
     * - Maintains conversation threading
     */
    async sendFollowUpEmail(enrollment, stepIndex) {
        try {
            const gmailToken = await this.getGmailToken();
            const userProfile = await this.getUserProfile();
            if (!gmailToken) throw new Error('No Gmail token available');

            const step = enrollment.sequence.steps[stepIndex];
            const emailBody = this.prepareEmailBody(step, enrollment);
            
            // Get recipient list based on reply mode
            const recipients = this.getRecipientsForReplyMode(enrollment, userProfile.email);
            
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

            if (!response.ok) {
                throw new Error(`Failed to send email: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error sending follow-up email:', error);
            throw error;
        }
    }
    
    /**
     * Get recipients for follow-up based on reply mode choice
     * @param {Object} enrollment - The enrollment record with reply mode
     * @param {string} userEmail - Current user's email to exclude
     * @returns {Object} - Recipients object with 'to' and 'cc' fields
     */
    getRecipientsForReplyMode(enrollment, userEmail) {
        const replyMode = enrollment.replyMode || 'reply';
        
        if (replyMode === 'reply') {
            // Reply mode: only send to primary To recipient
            return {
                to: enrollment.to,
                cc: null
            };
        } else {
            // Reply-all mode: send to all To and CC, excluding user
            const allToRecipients = this.parseEmailAddresses(enrollment.to);
            const allCcRecipients = this.parseEmailAddresses(enrollment.cc || '');
            
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
     * Parse email addresses from a header string
     * Handles formats like: "Name <email@domain.com>, email2@domain.com"
     * @param {string} headerValue - Email header value to parse
     * @returns {Array} - Array of email addresses
     */
    parseEmailAddresses(headerValue) {
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

    prepareEmailBody(step, enrollment) {
        let body = step.content;
        
        // Simple variable replacement
        body = body.replace(/\{name\}/g, enrollment.to.split('<')[0].trim());
        body = body.replace(/\{subject\}/g, enrollment.subject);
        
        return body;
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GmailFollowUpApp();
});