import { networkInterfaces } from 'node:os';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { pickLanAddress } from './src/net/lan.js';

export default defineConfig(({ mode }) => {
  // `pnpm dev:lan` (vite --host --mode lan): the join QR needs an address a phone on the Wi-Fi can reach.
  const lanHost = mode === 'lan' ? (pickLanAddress(networkInterfaces()) ?? '') : '';
  if (mode === 'lan') {
    console.log(
      lanHost === ''
        ? 'No LAN address found: open the page with your IP for the join QR to work.'
        : `Join QR address: ${lanHost} (open the "Network" URL below)`,
    );
  }

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_LAN_HOST': JSON.stringify(lanHost),
    },
    server: {
      port: 5173,
      proxy: {
        // The socket goes through Vite, so it uses whatever address the page was opened with.
        // E2E points this at its own server (e2e/playwright.config.ts).
        '/socket.io': { target: process.env.SERVER_URL ?? 'http://localhost:3000', ws: true },
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
