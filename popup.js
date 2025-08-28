/**
 * Gmail Auto Follow-Up Extension - Minimal Popup Script
 * Opens side panel when requested
 */

document.getElementById('open-sidepanel-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "openSidePanel" });
    window.close();
});