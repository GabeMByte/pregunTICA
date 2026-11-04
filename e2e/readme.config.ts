import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const SERVER_PORT = 3300;
const WEB_PORT = 5374;

/**
 * pnpm --filter @preguntica/e2e exec playwright test --config readme.config.ts
 * Screenshots for the README. The server labels the local bank's questions as AI ones
 * (apps/server/scripts/screenshot-server.ts): no API call and no .env.
 */
export default defineConfig({
  ...base,
  testDir: './readme',
  testMatch: '**/*.readme.ts',
  retries: 0,
  reporter: 'list',
  use: { ...base.use, baseURL: `http://localhost:${String(WEB_PORT)}` },
  webServer: [
    {
      command: 'pnpm --filter @preguntica/server exec tsx scripts/screenshot-server.ts',
      cwd: '..',
      env: { PORT: String(SERVER_PORT), ANTHROPIC_API_KEY: '' },
      url: `http://localhost:${String(SERVER_PORT)}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @preguntica/web dev --port ${String(WEB_PORT)} --strictPort`,
      cwd: '..',
      env: { SERVER_URL: `http://localhost:${String(SERVER_PORT)}` },
      url: `http://localhost:${String(WEB_PORT)}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
