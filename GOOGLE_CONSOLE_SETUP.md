# Google Console Setup for Chrome Extension OAuth

## Required Changes in Google Cloud Console

### 1. **Access Google Cloud Console**
- Go to: https://console.cloud.google.com/
- Select your existing project (or create a new one)

### 2. **Update OAuth Client Configuration**
- Navigate to: **APIs & Services** → **Credentials**
- Find your OAuth 2.0 Client ID: `947297353415-g1s6m4kpiac8be749aqji63hhvqussk0.apps.googleusercontent.com`
- Click to edit it

### 3. **Add Chrome Extension Redirect URI**
You need to add your Chrome extension's redirect URI. First, get your extension ID:

**To find your Extension ID:**
1. Open Chrome → go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Look at your extension card - the ID will be shown
4. Example ID: `abcdefghijklmnopqrstuvwxyz123456`

**Add this redirect URI:**
```
https://YOUR_EXTENSION_ID.chromiumapp.org/
```

**Example (replace with your actual extension ID):**
```
https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/
```

### 4. **Keep Existing Redirect URI**
**IMPORTANT:** Also keep your existing localhost redirect URI for local development:
```
http://localhost:3000/auth/google/callback
```

### 5. **Final OAuth Client Configuration**
Your OAuth client should have **both** redirect URIs:
- `https://YOUR_EXTENSION_ID.chromiumapp.org/` (for Chrome extension)
- `http://localhost:3000/auth/google/callback` (for local development)

### 6. **Save Changes**
Click **Save** to apply the changes.

## Verification Steps

1. **Check Extension ID** in `chrome://extensions/` (Developer mode enabled)
2. **Update manifest.json** if needed with correct client ID
3. **Test authentication** - Chrome Identity API should now work
4. **Check console logs** for successful OAuth flow

## Notes
- The extension redirect URI format is always: `https://EXTENSION_ID.chromiumapp.org/`
- Chrome automatically handles this redirect for `chrome.identity.launchWebAuthFlow`
- No need to implement any handler for this URL - Chrome manages it internally