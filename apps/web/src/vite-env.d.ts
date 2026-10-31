/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** This machine's Wi-Fi IPv4 under `pnpm dev:lan`; empty otherwise (vite.config.ts). */
  readonly VITE_LAN_HOST: string;
}
