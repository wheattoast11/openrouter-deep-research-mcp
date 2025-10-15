// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Cognitive Substrate Integration', () => {
  const VITE_URL = 'http://localhost:5173';

  test.beforeEach(async ({ page }) => {
    await page.goto(VITE_URL);
  });

  test('should load the remote mode by default', async ({ page }) => {
    // Check for a title or element unique to the remote mode
    await expect(page.locator('h1:has-text("Agent Console")')).toBeVisible();
    await expect(page.locator('button:has-text("🌐 Server")')).toBeVisible();
  });

  test('should switch to local mode and render the cognitive substrate', async ({ page }) => {
    // Click the mode switcher
    await page.locator('button:has-text("🌐 Server")').click();

    // Verify the button text changes
    await expect(page.locator('button:has-text("🧠 Local")')).toBeVisible();

    // Verify the Cognitive Substrate component is visible
    await expect(page.locator('canvas')).toBeVisible();
    
    // Verify cognitive state metrics are displayed
    await expect(page.locator('text=Entropy')).toBeVisible();
    await expect(page.locator('text=Coherence')).toBeVisible();
    await expect(page.locator('text=Phase Lock')).toBeVisible();
  });

  test('should allow input in local mode', async ({ page }) => {
    // Switch to local mode
    await page.locator('button:has-text("🌐 Server")').click();
    
    // Find and type into the input field
    const input = page.locator('input[placeholder*="manifold"]');
    await expect(input).toBeVisible();
    await input.fill('Hello, cognitive substrate!');
    
    // Verify the text was entered
    await expect(input).toHaveValue('Hello, cognitive substrate!');
  });
});

