import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @preguntica/server dev',
      cwd: '..',
      url: 'http://localhost:3000/health',
      reuseExistingServer,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @preguntica/web dev',
      cwd: '..',
      url: 'http://localhost:5173',
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
});
