import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Vite puts a content hash in every name under /assets/, so a new build never reuses a URL. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * The file a request maps to, or null for a 404. A path without an extension that is not a file is
 * a React route (/host, /play/ABC234) and gets index.html. Nothing outside `root` is ever reachable.
 */
async function resolveFile(root: string, url: string): Promise<string | null> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const path = resolve(root, `.${pathname}`);
  if (path !== root && !path.startsWith(`${root}${sep}`)) return null;
  if (await isFile(path)) return path;
  return extname(pathname) === '' ? join(root, 'index.html') : null;
}

/** SPEC §4 Despliegue: serves the web build from the server's own port, with the SPA fallback. */
export function createStaticHandler(staticDir: string) {
  const root = resolve(staticDir);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const file = req.method === 'GET' || req.method === 'HEAD' ? await resolveFile(root, req.url ?? '/') : null;
    if (file === null) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': file.startsWith(join(root, 'assets', sep)) ? IMMUTABLE : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  };
}
