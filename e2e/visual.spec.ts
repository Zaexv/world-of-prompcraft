import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotDir = path.resolve(__dirname, '../../issues/screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

test('Visual sanity check', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  // Wait for main canvas or some element to load
  await page.waitForLoadState('networkidle');
  const screenshotPath = path.join(screenshotDir, `visual-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  // Simple check: ensure page has some expected element, e.g., canvas
  const canvas = await page.$('canvas');
  expect(canvas).not.toBeNull();
  // Optionally write a brief entry to markdown report (append)
  const issuePath = path.resolve(__dirname, '../../issues/2026-05-25-visual-issues.md');
  const entry = `- Screenshot: ![${path.basename(screenshotPath)}](${screenshotPath})\n`;
  fs.appendFileSync(issuePath, entry);
});
