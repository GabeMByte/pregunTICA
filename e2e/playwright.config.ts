import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer = !process.env.CI;

// Own ports, so a `pnpm dev` already running on 3000/5173 (with the real API key) is never reused.
const SERVER_PORT = 3100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @preguntica/server dev',
      cwd: '..',
      // CLAUDE.md rule 7: never the real API. Variables already set win over --env-file, and a
      // blank key means "local bank only".
      env: { PORT: String(SERVER_PORT), ANTHROPIC_API_KEY: '', WARM_TOPICS: '' },
      url: `http://localhost:${String(SERVER_PORT)}/health`,
      reuseExistingServer,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @preguntica/web dev --port ${String(WEB_PORT)} --strictPort`,
      cwd: '..',
      env: { SERVER_URL: `http://localhost:${String(SERVER_PORT)}` },
      url: `http://localhost:${String(WEB_PORT)}`,
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
});
