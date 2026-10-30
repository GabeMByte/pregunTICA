import { defineConfig, devices } from '@playwright/test';

// Own ports, so this can run next to `pnpm dev`, the E2E suite and the host's screenshots.
const SERVER_PORT = 3300;
const WEB_PORT = 5374;

/** Visual review of the player view against a real server, outside pnpm test:e2e and CI. */
export default defineConfig({
  testDir: './player-screenshots',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @preguntica/server dev',
      cwd: '..',
      // CLAUDE.md rule 7: never the real API. Variables already set win over --env-file, and a
      // blank key means "local bank only". TRUST_PROXY lets each test room use its own address,
      // since the script creates more rooms than the per-IP limit allows.
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
