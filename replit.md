# Gmail Auto Follow-Up Chrome Extension

## Overview

A Chrome extension that automates Gmail follow-up sequences through a standalone popup interface. The extension uses OAuth authentication to securely access Gmail accounts and provides tools to manage email follow-up campaigns directly within the browser. The system is designed to handle the complete follow-up workflow - from email enrollment to sequence management - without requiring external servers or databases.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Manifest V3 Chrome Extension**: Modern extension architecture using service workers instead of background pages
- **Popup-Based Interface**: Self-contained UI in popup.html with CSS styling and JavaScript functionality
- **Material Design Components**: Clean, responsive interface following Google's design principles
- **State Management**: Client-side state management for authentication status and user sessions

### Authentication & Authorization
- **Chrome Identity API**: Leverages browser's built-in OAuth flow for secure authentication
- **OAuth 2.0 Flow**: Standard Google OAuth implementation with appropriate Gmail API scopes
- **Token Management**: Automatic token refresh and secure storage using Chrome's storage API
- **Scope-Based Permissions**: Granular access to Gmail functions (read, send, modify emails)

### API Integration
- **Gmail API**: Direct integration with Google's Gmail API for email operations
- **RESTful Architecture**: Standard HTTP requests to Gmail endpoints
- **Background Processing**: Service worker handles API calls and token management
- **Error Handling**: Comprehensive error handling with user-friendly messaging

### Data Storage
- **Chrome Storage API**: Local storage for user preferences, authentication tokens, and extension state
- **No External Database**: Self-contained system without external data dependencies
- **Client-Side Data Management**: All data processing and storage handled locally

### Extension Components
- **Background Script**: Service worker for handling OAuth, API calls, and extension lifecycle
- **Popup Interface**: Main user interface for authentication and follow-up management
- **Manifest Configuration**: Extension permissions, OAuth client configuration, and API access definitions

## External Dependencies

### Google Services
- **Gmail API**: Core email functionality for reading, sending, and modifying emails
- **Google Cloud Console**: OAuth credential management and API enablement
- **Chrome Identity API**: Browser-based authentication flow

### Required Scopes
- `gmail.readonly`: Access to read email data and metadata
- `gmail.send`: Permission to send emails for follow-ups
- `gmail.modify`: Ability to modify email properties and labels
- `userinfo.email`: Access to user's email address for identification

### Development Dependencies
- **Chrome Extensions API**: Manifest V3 extension framework
- **Modern Web APIs**: ES6+ JavaScript features for extension functionality
- **Material Design Icons**: SVG-based iconography for UI components

### Third-Party Integrations
- **Google OAuth 2.0**: Authentication and authorization infrastructure
- **Chrome Web Store**: Extension distribution and updates
- **Google Cloud Platform**: API quota management and monitoring