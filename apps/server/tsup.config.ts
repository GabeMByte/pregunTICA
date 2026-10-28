import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node24',
  clean: true,
  // shared ships TypeScript source, so it must be bundled into the server.
  noExternal: ['@preguntica/shared'],
});
