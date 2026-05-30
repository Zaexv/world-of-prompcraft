import { test, expect } from "@playwright/test";

test.describe('Login form validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');
    // Ensure the login screen is visible
    await expect(page.locator('text=WORLD OF PROMPTCRAFT')).toBeVisible();
  });

  test('shows error for invalid username', async ({ page }) => {
    const usernameInput = page.locator('input[placeholder="Enter your name..."]');
    const enterBtn = page.locator('button:has-text("Enter World")');

    // initially button disabled
    await expect(enterBtn).toBeDisabled();

    // type invalid characters
    await usernameInput.fill('!!!');
    // button should stay disabled, but we can force click to trigger validation via Enter key
    await usernameInput.press('Enter');

    const error = page.getByText('Use 1-20 letters, numbers, or underscores.', { exact: true });
    await expect(error).toBeVisible();
  });

  test('accepts a valid username and enables button', async ({ page }) => {
    const usernameInput = page.locator('input[placeholder="Enter your name..."]');
    const enterBtn = page.locator('button:has-text("Enter World")');
    const error = page.locator('div', { hasText: 'Use 1-20 letters, numbers, or underscores.' });

    await usernameInput.fill('testuser');
    await expect(enterBtn).toBeEnabled();
    await expect(error).toBeHidden();

    // Click enter – we don't assert further navigation as backend handling may vary
    await enterBtn.click();
    // At this point, no error should be shown
    await expect(error).toBeHidden();
  });
});
