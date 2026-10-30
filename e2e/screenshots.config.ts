import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

/** pnpm --filter @preguntica/e2e screenshots: visual review shots, outside pnpm test:e2e and CI. */
export default defineConfig({
  ...base,
  testDir: './screenshots',
  retries: 0,
  reporter: 'list',
});
