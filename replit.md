# Gmail Auto Follow-Up Chrome Extension

## Overview

A Chrome extension that automates Gmail follow-up sequences through a comprehensive side panel interface. The extension uses OAuth authentication to securely access Gmail accounts and provides tools to manage email follow-up campaigns, sequence configuration, and enrollment tracking directly within the browser. The system is designed to handle the complete follow-up workflow - from email enrollment to status management - without requiring external servers or databases.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Manifest V3 Chrome Extension**: Modern extension architecture using service workers and side panel API
- **Side Panel Interface**: Full-featured UI in sidepanel.html utilizing complete vertical space for optimal user experience
- **Minimal Popup Interface**: Simple popup.html that opens the side panel for main functionality
- **Material Design Components**: Clean, responsive interface following Google's design principles with brand color integration
- **State Management**: Client-side state management for authentication status, sequences, and enrollment tracking

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
- **Side Panel Interface**: Main user interface for authentication, sequence management, email enrollment, and status tracking
- **Popup Interface**: Minimal interface that opens the side panel application
- **Manifest Configuration**: Extension permissions including sidePanel API, OAuth client configuration, and API access definitions

### Side Panel Features
- **Three-Tab Navigation**: Emails, Sequences, and Enrollments tabs for organized functionality
- **Email Management**: Display recent sent emails with checkbox selection for batch operations
- **Sequence CRUD Operations**: Create, read, update, and delete follow-up sequences with step configuration
- **Enrollment Management**: Track active, paused, and completed enrollments with status controls
- **Reply Mode Control**: Choose between "Reply" (single recipient) or "Reply to All" (all To/CC recipients) for each enrollment
- **Send Window Configuration**: Configurable days and hours for automated email sending
- **Persistent Storage**: All data stored locally using Chrome's storage API

## Reply vs Reply-to-All Feature

### Feature Overview
The extension now supports precise control over who receives automated follow-up emails, matching Gmail's native Reply and Reply-to-All behavior.

### User Interface
- **Enrollment Control**: Radio button selection during email enrollment
- **Reply Mode**: Send follow-ups only to the original primary recipient
- **Reply-to-All Mode**: Send follow-ups to all original To and CC recipients (excluding user)
- **Safety Warning**: Tooltip warning for Reply-to-All about group conversation implications

### Technical Implementation
- **Recipient Parsing**: Extracts and stores To, CC, and BCC recipients from original sent emails
- **Deduplication Logic**: Removes duplicate recipients and excludes user's email address
- **Conversation Threading**: Maintains proper In-Reply-To and References headers
- **Mode Persistence**: Reply mode choice stored with each enrollment for consistency

### Compliance & Etiquette
- **BCC Exclusion**: BCC recipients are never included in follow-ups (per Gmail standards)
- **User Exclusion**: User's own email is automatically excluded from reply-all recipients
- **Explicit Selection**: Users must explicitly choose reply mode before enrollment
- **Group Awareness**: Clear warnings about sending to multiple recipients

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

### Extension Permissions
- `identity`: OAuth authentication flow
- `storage`: Local data persistence for sequences and enrollments
- `activeTab`: Current tab access
- `sidePanel`: Side panel API for main interface

### Development Dependencies
- **Chrome Extensions API**: Manifest V3 extension framework
- **Modern Web APIs**: ES6+ JavaScript features for extension functionality
- **Material Design Icons**: SVG-based iconography for UI components

### Third-Party Integrations
- **Google OAuth 2.0**: Authentication and authorization infrastructure
- **Chrome Web Store**: Extension distribution and updates
- **Google Cloud Platform**: API quota management and monitoring