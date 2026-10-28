import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@preguntica/shared';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface App {
  httpServer: HttpServer;
  io: GameServer;
}

export function createApp(): App {
  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404).end();
  });

  const io: GameServer = new Server(httpServer);

  return { httpServer, io };
}
