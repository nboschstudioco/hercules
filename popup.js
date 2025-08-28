/**
 * Gmail Auto Follow-Up Extension - Minimal Popup Script
 * Opens side panel when requested
 */

document.addEventListener('DOMContentLoaded', () => {
    const openSidePanelBtn = document.getElementById('open-sidepanel-btn');
    
    if (openSidePanelBtn) {
        openSidePanelBtn.addEventListener('click', async () => {
            try {
                // Open the side panel
                await chrome.sidePanel.open();
                
                // Close the popup
                window.close();
            } catch (error) {
                console.error('Failed to open side panel:', error);
                
                // Fallback: just close the popup
                window.close();
            }
        });
    }
});