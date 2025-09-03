/**
 * Gmail Follow-Up Extension API Client
 * Handles all backend communication with proper authentication and error handling
 */

class ApiClient {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
        this.sessionToken = null;
    }

    /**
     * Get backend URL
     */
    getBackendUrl() {
        return this.baseUrl;
    }

    /**
     * Get session token from storage
     */
    async getSessionToken() {
        if (this.sessionToken) return this.sessionToken;
        
        const result = await chrome.storage.local.get(['sessionToken']);
        this.sessionToken = result.sessionToken;
        return this.sessionToken;
    }

    /**
     * Set session token and store it
     */
    async setSessionToken(token) {
        this.sessionToken = token;
        await chrome.storage.local.set({ sessionToken: token });
    }

    /**
     * Clear session token
     */
    async clearSessionToken() {
        this.sessionToken = null;
        await chrome.storage.local.remove(['sessionToken']);
    }

    /**
     * Make authenticated API request
     */
    async makeRequest(endpoint, options = {}) {
        const token = await this.getSessionToken();
        
        if (!token && !options.skipAuth) {
            throw new Error('No authentication token found');
        }

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (token && !options.skipAuth) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const requestOptions = {
            method: options.method || 'GET',
            headers,
            ...options
        };

        if (options.body && typeof options.body === 'object') {
            requestOptions.body = JSON.stringify(options.body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, requestOptions);

        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
            await this.clearSessionToken();
            throw new Error('Authentication expired. Please sign in again.');
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}: Request failed`);
        }

        return data;
    }

    // ==========================================
    // AUTHENTICATION METHODS
    // ==========================================

    /**
     * Start OAuth flow (legacy - kept for compatibility)
     */
    async startAuth() {
        return await this.makeRequest('/auth/google/init', { skipAuth: true });
    }

    /**
     * Login with Google access token from Chrome Identity API
     */
    async loginWithAccessToken(accessToken) {
        return await this.makeRequest('/auth/ext_oauth_login', {
            method: 'POST',
            body: { accessToken },
            skipAuth: true
        });
    }

    /**
     * Check authentication status
     */
    async checkAuthStatus() {
        return await this.makeRequest('/auth/status');
    }

    /**
     * Refresh authentication token
     */
    async refreshToken() {
        return await this.makeRequest('/auth/refresh', { method: 'POST' });
    }

    /**
     * Logout
     */
    async logout() {
        try {
            await this.makeRequest('/auth/logout', { method: 'POST' });
        } finally {
            await this.clearSessionToken();
        }
    }

    // ==========================================
    // USER METHODS
    // ==========================================

    /**
     * Get user profile
     */
    async getUserProfile() {
        return await this.makeRequest('/user/profile');
    }

    /**
     * Get Gmail token
     */
    async getGmailToken() {
        return await this.makeRequest('/user/gmail-token');
    }

    // ==========================================
    // EMAIL METHODS
    // ==========================================

    /**
     * Get sent emails
     */
    async getSentEmails(limit = 50) {
        return await this.makeRequest(`/emails/sent?limit=${limit}`);
    }

    /**
     * Get specific email by ID
     */
    async getEmailById(emailId) {
        return await this.makeRequest(`/emails/sent/${emailId}`);
    }

    /**
     * Sync emails from Gmail
     */
    async syncEmails() {
        return await this.makeRequest('/emails/sync', { method: 'POST' });
    }

    /**
     * Check for replies
     */
    async checkReplies(emailIds) {
        return await this.makeRequest('/emails/check-replies', {
            method: 'POST',
            body: { emailIds }
        });
    }

    // ==========================================
    // SEQUENCE METHODS
    // ==========================================

    /**
     * Get all sequences
     */
    async getSequences() {
        return await this.makeRequest('/sequences');
    }

    /**
     * Get specific sequence
     */
    async getSequence(sequenceId) {
        return await this.makeRequest(`/sequences/${sequenceId}`);
    }

    /**
     * Create new sequence
     */
    async createSequence(sequenceData) {
        return await this.makeRequest('/sequences', {
            method: 'POST',
            body: sequenceData
        });
    }

    /**
     * Update sequence
     */
    async updateSequence(sequenceId, sequenceData) {
        return await this.makeRequest(`/sequences/${sequenceId}`, {
            method: 'PUT',
            body: sequenceData
        });
    }

    /**
     * Delete sequence
     */
    async deleteSequence(sequenceId) {
        return await this.makeRequest(`/sequences/${sequenceId}`, {
            method: 'DELETE'
        });
    }

    // ==========================================
    // ENROLLMENT METHODS
    // ==========================================

    /**
     * Get all enrollments
     */
    async getEnrollments(params = {}) {
        const queryParams = new URLSearchParams();
        if (params.status) queryParams.append('status', params.status);
        if (params.limit) queryParams.append('limit', params.limit);
        if (params.offset) queryParams.append('offset', params.offset);
        
        const query = queryParams.toString();
        const endpoint = query ? `/enrollments?${query}` : '/enrollments';
        
        return await this.makeRequest(endpoint);
    }

    /**
     * Get specific enrollment
     */
    async getEnrollment(enrollmentId) {
        return await this.makeRequest(`/enrollments/${enrollmentId}`);
    }

    /**
     * Create new enrollment
     */
    async createEnrollment(enrollmentData) {
        return await this.makeRequest('/enrollments', {
            method: 'POST',
            body: enrollmentData
        });
    }

    /**
     * Update enrollment
     */
    async updateEnrollment(enrollmentId, enrollmentData) {
        return await this.makeRequest(`/enrollments/${enrollmentId}`, {
            method: 'PUT',
            body: enrollmentData
        });
    }

    /**
     * Delete enrollment
     */
    async deleteEnrollment(enrollmentId) {
        return await this.makeRequest(`/enrollments/${enrollmentId}`, {
            method: 'DELETE'
        });
    }

    /**
     * Pause enrollment
     */
    async pauseEnrollment(enrollmentId) {
        return await this.makeRequest(`/enrollments/${enrollmentId}/pause`, {
            method: 'POST'
        });
    }

    /**
     * Resume enrollment
     */
    async resumeEnrollment(enrollmentId) {
        return await this.makeRequest(`/enrollments/${enrollmentId}/resume`, {
            method: 'POST'
        });
    }

    // ==========================================
    // SCHEDULE METHODS
    // ==========================================

    /**
     * Get schedules
     */
    async getSchedules(status = null) {
        const endpoint = status ? `/schedules?status=${status}` : '/schedules';
        return await this.makeRequest(endpoint);
    }

    /**
     * Trigger schedule manually
     */
    async triggerSchedule(enrollmentId, stepIndex = null) {
        const body = stepIndex !== null ? { stepIndex } : {};
        return await this.makeRequest(`/schedules/${enrollmentId}/trigger`, {
            method: 'POST',
            body
        });
    }

    /**
     * Get schedules health
     */
    async getSchedulesHealth() {
        return await this.makeRequest('/schedules/health');
    }

    // ==========================================
    // SYNC METHODS
    // ==========================================

    /**
     * Full system sync
     */
    async fullSync() {
        return await this.makeRequest('/sync', { method: 'POST' });
    }

    // ==========================================
    // ANALYTICS METHODS
    // ==========================================

    /**
     * Get send analytics
     */
    async getSendAnalytics(params = {}) {
        const queryParams = new URLSearchParams();
        if (params.dateFrom) queryParams.append('dateFrom', params.dateFrom);
        if (params.dateTo) queryParams.append('dateTo', params.dateTo);
        if (params.sequenceId) queryParams.append('sequenceId', params.sequenceId);
        
        const query = queryParams.toString();
        const endpoint = query ? `/analytics/sends?${query}` : '/analytics/sends';
        
        return await this.makeRequest(endpoint);
    }

    /**
     * Get enrollment analytics
     */
    async getEnrollmentAnalytics(sequenceId = null) {
        const endpoint = sequenceId ? `/analytics/enrollments?sequenceId=${sequenceId}` : '/analytics/enrollments';
        return await this.makeRequest(endpoint);
    }

    // ==========================================
    // HEALTH METHODS
    // ==========================================

    /**
     * Get system health
     */
    async getHealth() {
        return await this.makeRequest('/health', { skipAuth: true });
    }
}

// Create singleton instance
const apiClient = new ApiClient();

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.apiClient = apiClient;
}