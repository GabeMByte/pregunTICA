import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const { httpServer } = createApp();

httpServer.listen(port, () => {
  console.log(`PregunTICA server listening on http://localhost:${port}`);
});
