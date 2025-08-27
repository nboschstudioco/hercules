# Gmail Auto Follow-Up Chrome Extension

A Chrome extension that automates Gmail follow-up sequences using OAuth authentication and the Gmail API.

## 🚀 Features

- **Secure OAuth Authentication**: Uses Chrome Identity API for secure Google account authentication
- **Gmail API Integration**: Full access to Gmail for reading, sending, and managing emails
- **Modern UI**: Clean, responsive popup interface with Google Material Design principles
- **Token Management**: Automatic token refresh and secure storage
- **Error Handling**: Comprehensive error handling with user-friendly messages

## 📋 Prerequisites

Before installing and using this extension, you'll need to set up OAuth credentials:

### 1. Google Cloud Console Setup

1. **Create a New Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Click "New Project" and give it a name (e.g., "Gmail Auto Follow-Up")
   - Note your Project ID

2. **Enable Gmail API**:
   - In your project, go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click on it and press "Enable"

3. **Configure OAuth Consent Screen**:
   - Go to "APIs & Services" > "OAuth consent screen"
   - Choose "External" user type (unless you have a Google Workspace account)
   - Fill in required fields:
     - App name: "Gmail Auto Follow-Up"
     - User support email: Your email
     - Developer contact information: Your email
   - Add scopes:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/userinfo.email`
   - Add test users (your Gmail account) if in testing mode

4. **Create OAuth Credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Chrome extension" as application type
   - Enter your extension ID (get this after loading the unpacked extension)
   - Copy the Client ID

### 2. Extension Configuration

1. **Update manifest.json**:
   ```json
   "oauth2": {
     "client_id": "YOUR_ACTUAL_CLIENT_ID_HERE.apps.googleusercontent.com",
     "scopes": [
       "https://www.googleapis.com/auth/gmail.readonly",
       "https://www.googleapis.com/auth/gmail.send",
       "https://www.googleapis.com/auth/gmail.modify",
       "https://www.googleapis.com/auth/userinfo.email"
     ]
   }
   ```

2. **Get Extension ID**:
   - Load the extension in Chrome (unpacked)
   - Copy the extension ID from chrome://extensions/
   - Update your OAuth credentials in Google Cloud Console with this ID

## 🛠️ Installation

1. **Clone or Download** this repository to your local machine

2. **Update OAuth Configuration**:
   - Replace `YOUR_OAUTH_CLIENT_ID_HERE` in `manifest.json` with your actual Client ID

3. **Load Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the extension directory
   - Note the Extension ID and update your Google Cloud Console OAuth credentials

4. **Test Authentication**:
   - Click the extension icon in the Chrome toolbar
   - Click "Sign in with Google"
   - Grant the required permissions
   - Verify your email address appears in the popup

## 📁 Project Structure

