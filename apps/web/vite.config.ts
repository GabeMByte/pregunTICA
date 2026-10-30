import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // E2E points this at its own server (e2e/playwright.config.ts).
      '/socket.io': { target: process.env.SERVER_URL ?? 'http://localhost:3000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
