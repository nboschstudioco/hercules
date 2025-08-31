# Run Gmail Extension Backend Locally

## Current Issue
- Chrome extension runs locally in your browser
- Extension opens OAuth popup to Google
- **Google redirects back to `localhost:3000`** (YOUR machine, not Replit)
- No backend server running on YOUR localhost:3000
- OAuth callback fails → No postMessage → Extension timeout

## Solution

### 1. Copy Server Code to Your Local Machine
Download these files from Replit to your local computer:
```
server/
├── server.js
├── package.json  
├── .env (with your Google credentials)
├── database.js
├── routes/
│   ├── auth.js
│   ├── user.js
│   ├── emails.js
│   └── [all other route files]
└── data/
    └── gmail_followup.db
```

### 2. Install Dependencies Locally
```bash
cd server
npm install
```

### 3. Start Backend on Your Local Machine
```bash
node server.js
```

You should see:
```
🚀 Gmail Follow-Up Backend running on port 3000
📱 Environment: development  
🔐 CORS: All origins allowed (development)
Connected to SQLite database
```

### 4. Test the Extension
- Chrome extension (local) → Backend (YOUR localhost:3000) → Google OAuth → Success!

## Why This is Required
Chrome extensions run in your local browser and Google OAuth redirects back to `localhost:3000` **on your machine**, not on Replit servers.

The extension expects a local backend server to handle the OAuth callback and send postMessage back to the extension.