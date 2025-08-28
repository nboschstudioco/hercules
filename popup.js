/**
 * Gmail Auto Follow-Up Extension - Minimal Popup Script
 * Opens side panel when requested
 */

document.getElementById('open-sidepanel-btn').addEventListener('click', async () => {
    try {
        await chrome.sidePanel.open(); // No options needed for MV3
        window.close();
    } catch (e) {
        console.error("Side panel opening failed:", e);
        window.close();
    }
});