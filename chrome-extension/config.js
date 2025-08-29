// Browser-safe configuration for Chrome Extension
// This file provides runtime configuration without Node.js dependencies

window.APP_CONFIG = {
    // Backend server URL - defaults to localhost for development
    BACKEND_URL: 'http://localhost:3000',
    
    // OAuth configuration
    OAUTH_TIMEOUT: 5 * 60 * 1000, // 5 minutes
    
    // API configuration  
    API_RETRY_ATTEMPTS: 3,
    API_RETRY_DELAY: 1000,
    
    // Gmail API configuration
    GMAIL_BATCH_SIZE: 50,
    MAX_EMAIL_LENGTH: 1000000, // 1MB
    
    // UI configuration
    DEFAULT_SEQUENCE_DELAY: 1,
    MAX_SEQUENCE_STEPS: 10
};

// Helper function to get backend URL
function getBackendUrl() {
    return window.APP_CONFIG?.BACKEND_URL || 'http://localhost:3000';
}