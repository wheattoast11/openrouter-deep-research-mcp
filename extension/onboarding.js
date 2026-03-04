/**
 * Zero Extension - Onboarding Script
 *
 * Handles the first-run onboarding flow.
 */

let currentStep = 0;
let selectedPersona = null;

const steps = ['step-welcome', 'step-persona', 'step-success'];

/**
 * Show a specific step
 */
function showStep(index) {
  steps.forEach((stepId, i) => {
    const el = document.getElementById(stepId);
    if (el) {
      el.classList.toggle('active', i === index);
    }
  });
  currentStep = index;
}

/**
 * Go to next step
 */
function nextStep() {
  if (currentStep < steps.length - 1) {
    showStep(currentStep + 1);
  }
}

/**
 * Go to previous step
 */
function prevStep() {
  if (currentStep > 0) {
    showStep(currentStep - 1);
  }
}

/**
 * Select a persona
 */
function selectPersona(element) {
  // Deselect all
  document.querySelectorAll('.persona-card').forEach(card => {
    card.classList.remove('selected');
  });

  // Select this one
  element.classList.add('selected');
  selectedPersona = element.dataset.persona;

  // Enable continue button
  document.getElementById('btn-continue').disabled = false;

  // Store preference
  chrome.storage.local.set({ zeroPersona: selectedPersona });
}

/**
 * Try Zero now - open overlay on current tab
 */
async function tryNow() {
  try {
    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && tab.id) {
      // Send message to open overlay
      chrome.tabs.sendMessage(tab.id, { type: 'ZERO_OPEN_OVERLAY' });
    }

    // Close this tab
    window.close();
  } catch (error) {
    console.error('[Zero] Error opening overlay:', error);
    // Fallback: just close
    window.close();
  }
}

/**
 * Close the onboarding tab
 */
function closeTab() {
  window.close();
}

// Mark onboarding as complete when reaching success step
document.addEventListener('DOMContentLoaded', () => {
  // If we're on the success step, mark complete
  const observer = new MutationObserver(() => {
    const successStep = document.getElementById('step-success');
    if (successStep && successStep.classList.contains('active')) {
      chrome.storage.local.set({ zeroOnboardingComplete: true });
    }
  });

  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
});
