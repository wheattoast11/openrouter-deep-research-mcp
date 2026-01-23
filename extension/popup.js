/**
 * Zero Extension - Popup Script
 *
 * Handles popup UI interactions and communicates with background service worker.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const identityEl = document.getElementById('identity');

  /**
   * Update status display
   */
  function updateStatus(connected, text) {
    // Clear all status classes and inline styles first
    statusDot.classList.remove('connecting', 'error');
    statusDot.style.background = '';
    statusDot.style.animation = '';

    if (connected === true) {
      statusDot.style.background = '#22c55e';  // Green for connected
    } else if (connected === false) {
      statusDot.classList.add('error');
      statusDot.style.background = '#ef4444';  // Red for error
    } else {
      statusDot.classList.add('connecting');   // Animated for pending
    }
    statusText.textContent = text;
  }

  /**
   * Get Zero status from background
   */
  async function getStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'ZERO_STATUS' });
      if (response && response.success) {
        updateStatus(true, 'Connected');
        identityEl.textContent = response.result.identity;
        return response.result;
      } else {
        updateStatus(false, 'Error');
        identityEl.textContent = response?.error || 'Unknown error';
      }
    } catch (error) {
      updateStatus(false, 'Disconnected');
      identityEl.textContent = error.message;
    }
    return null;
  }

  /**
   * Perform handshake
   */
  async function performHandshake() {
    updateStatus(null, 'Verifying...');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'ZERO_HANDSHAKE' });
      if (response && response.success) {
        updateStatus(true, 'Verified');
        showToast('Fixed point verified! ' + (response.result.isSelf ? '(self)' : ''));
      } else {
        updateStatus(false, 'Verification failed');
        showToast('Handshake failed: ' + (response?.error || 'Unknown'));
      }
    } catch (error) {
      updateStatus(false, 'Error');
      showToast('Error: ' + error.message);
    }
  }

  /**
   * Send message to content script
   */
  async function sendToContentScript(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showToast('No active tab');
      return null;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, message);
      return response;
    } catch (error) {
      // Content script may not be loaded
      showToast('Content script not available');
      return null;
    }
  }

  /**
   * Show overlay on current page
   */
  async function showOverlay() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showToast('No active tab');
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'ZERO_INJECT_OVERLAY',
        config: { visible: true }
      });
      showToast('Overlay opened');
      window.close(); // Close popup
    } catch (error) {
      showToast('Could not inject overlay');
    }
  }

  /**
   * Extract page context
   */
  async function extractContext() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showToast('No active tab');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'ZERO_EXTRACT_CONTEXT'
      });

      if (response && response.success) {
        const context = response.context;
        console.log('[Zero Popup] Page context:', context);

        // Show summary
        const summary = `
Title: ${context.title}
Domain: ${context.domain}
Headings: ${context.content?.headings?.length || 0}
Links: ${context.content?.links?.length || 0}
        `.trim();

        showToast('Context extracted. Check console.');
        console.log(summary);
      } else {
        showToast('Failed to extract context');
      }
    } catch (error) {
      showToast('Error: ' + error.message);
    }
  }

  /**
   * Open research interface
   */
  async function openResearch() {
    // For now, open terminals.tech
    chrome.tabs.create({
      url: 'https://terminals.tech/compose'
    });
    window.close();
  }

  /**
   * Show toast notification
   */
  function showToast(message) {
    // Simple console log for now
    console.log('[Zero]', message);

    // Could add visual toast here
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 255, 255, 0.1);
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      animation: fadeIn 0.2s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s';
      setTimeout(() => toast.remove(), 200);
    }, 2000);
  }

  // Initial status check
  await getStatus();

  // Button handlers
  document.getElementById('btn-handshake').addEventListener('click', performHandshake);
  document.getElementById('btn-overlay').addEventListener('click', showOverlay);
  document.getElementById('btn-context').addEventListener('click', extractContext);
  document.getElementById('btn-research').addEventListener('click', openResearch);
});
