import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const SERVER_PORT = 3200;
const WEB_PORT = 5274;

/**
 * pnpm --filter @preguntica/e2e exec playwright test --config screenshots.host.config.ts
 * A full game for the visual review of the host view. Own ports, so it runs next to other sessions.
 */
export default defineConfig({
  ...base,
  testDir: './screenshots',
  testMatch: '**/*.host.ts',
  retries: 0,
  reporter: 'list',
  timeout: 120_000,
  use: { ...base.use, baseURL: `http://localhost:${String(WEB_PORT)}` },
  webServer: [
    {
      command: 'pnpm --filter @preguntica/server dev',
      cwd: '..',
      // CLAUDE.md rule 7: never the real API. A blank key means "local bank only". TRUST_PROXY lets
      // each game use its own address: there are more games than the per-IP room limit allows.
      env: { PORT: String(SERVER_PORT), ANTHROPIC_API_KEY: '', WARM_TOPICS: '', TRUST_PROXY: 'true' },
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
