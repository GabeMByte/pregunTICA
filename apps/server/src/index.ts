import { createApp } from './app.js';

const SWEEP_INTERVAL_MS = 60_000;

const port = Number(process.env.PORT ?? 3000);
const { httpServer, registry } = createApp({ trustProxy: process.env.TRUST_PROXY === 'true' });

// Removes rooms idle for longer than ROOM_IDLE_TTL_MS.
setInterval(() => {
  registry.sweep();
}, SWEEP_INTERVAL_MS).unref();

httpServer.listen(port, () => {
  console.log(`PregunTICA server listening on http://localhost:${String(port)}`);
});
