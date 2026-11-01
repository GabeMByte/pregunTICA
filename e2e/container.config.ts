import { defineConfig, devices } from '@playwright/test';

/**
 * The E2E suite against a running container (docs/DEPLOY.md), with no dev servers of its own:
 * E2E_BASE_URL=http://localhost:8080 pnpm --filter @preguntica/e2e exec playwright test --config container.config.ts
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    // The interface follows the browser's language (SPEC §4 Idioma): the suites read Spanish.
    locale: 'es-CR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
