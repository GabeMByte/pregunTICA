import { createApp } from './app.js';
import { evictRooms } from './socket/handlers.js';

const SWEEP_INTERVAL_MS = 60_000;

const port = Number(process.env.PORT ?? 3000);
const { httpServer, io, registry } = createApp({ trustProxy: process.env.TRUST_PROXY === 'true' });

// Removes rooms idle for longer than ROOM_IDLE_TTL_MS and disconnects their sockets.
setInterval(() => {
  evictRooms(io, registry.sweep());
}, SWEEP_INTERVAL_MS).unref();

httpServer.listen(port, () => {
  console.log(`PregunTICA server listening on http://localhost:${String(port)}`);
});
