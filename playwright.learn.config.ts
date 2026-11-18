import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/** Screenshot capture for the learning centre (scripts/learn). Same servers as the e2e run, one desktop browser. */
export default defineConfig({
  ...base,
  testDir: './scripts/learn',
  fullyParallel: false,
  workers: 1,
  use: { ...base.use, actionTimeout: 15_000, navigationTimeout: 30_000 },
  projects: [
    {
      name: 'capture',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
