# Local Development Setup

## Running the Backend Server Locally

### Prerequisites
1. **Node.js installed** on your local machine
2. **Google API credentials** in your local `.env` file

### Setup Steps

1. **Copy the server folder** from Replit to your local machine:
   ```bash
   # Download or clone the server directory
   cd /path/to/your/local/project
   ```

2. **Install dependencies** locally:
   ```bash
   cd server
   npm install
   ```

3. **Ensure your .env file** has the correct format:
   ```env
   # Google OAuth2 Configuration
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

   # Server Configuration
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=development_jwt_secret_key_change_in_production
   SESSION_SECRET=development_session_secret_change_in_production

   # CORS Origins
   ALLOWED_ORIGINS=chrome-extension://*,http://localhost:5000
   ```

4. **Start the backend server** locally:
   ```bash
   cd server
   node server.js
   ```

5. **Install the Chrome extension** locally:
   - Open Chrome
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

### Architecture Flow
```
Chrome Extension (local) → Backend Server (localhost:3000) → Google APIs → postMessage → Extension
```

### Verification
- Backend should start on `http://localhost:3000`
- Extension should communicate with your local backend
- OAuth popup should use your local backend for authentication
- Success page should send postMessage back to extension

The extension is designed to work with a local backend server, not the Replit-hosted server.