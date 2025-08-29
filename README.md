Gmail Auto Follow-Up Extension
Overview
Gmail Auto Follow-Up is a Chrome extension that automates sending scheduled follow-ups to emails sent from your Gmail account.
Features include:

OAuth Google authentication

Latest sent emails list with enrollment into follow-up sequences

Dedicated sequence designer (up to 4 steps/step, 3 variants each)

Batch enrollment, status dashboard, and controls (pause/resume/unenroll)

Smart scheduling: business days/hours, randomized intra-day timing, variant cycling

Support for manual and automatic (reply-based) pauses

Visual indicators for emails already enrolled in sequences

User control for Reply vs Reply-All for each follow-up

Brand-specific UI updates for buttons, tabs, and headlines

Chrome Extension Limitations
All scheduling and sending is handled locally by the extension via chrome.alarms and background service worker.

Browser and authentication must remain active for sends to succeed.

Sends missed while Chrome is closed or the user is logged out are currently lost unless manually retried.

No automatic recovery or server-based delivery if the browser is inactive.

New Architecture: Server-Based Automation
To ensure follow-ups are always sent on schedule—even if Chrome is closed or the user is logged out—we are migrating email scheduling and sending to a secure backend service.
The extension will become a UI client; the backend manages all automation, token refresh, and Gmail API communication.

Migration Plan — Progressive Steps
Step 1: API Contract Definition
Document all API endpoints (enroll, sequence CRUD, status fetch, sync, etc.)

Choose data formats for enrollments, schedules, and authentication

Step 2: Authentication Flow Update
Implement Google OAuth2 flow on the backend (web-based, with secure token storage)

Update extension for web-based login to obtain server-managed tokens (not chrome.identity)

Step 3: Backend Service MVP
Scaffold backend (Node.js, Python, etc.) with endpoints for:

Save enrollment, fetch sequences/enrollments/status

Queue follow-up steps/sends per user

Integrate backend storage for all sequence, schedule, and reply-check data

Step 4: Extension-to-Backend Communication
Update extension: All enrollments, status checks, and sequence edits go through backend APIs (use fetch/XHR)

UI shows live status, progress, and error data from backend

Step 5: Server-Scheduled & Sent Emails
Enable backend cron/process to send follow-ups at scheduled time (using Gmail API, per user OAuth)

Support reply monitoring, recovery of missed/failed sends, and retried sends

Step 6: Missed/Failed Send Recovery
If browser/server/user was offline or logged out, ensure backend queues and retries missed follow-ups automatically upon re-authentication

Step 7: Security, Privacy, and Monitoring
Harden backend for token security, user data privacy, and Google policy compliance

Provide clear user controls for data/account revoke

