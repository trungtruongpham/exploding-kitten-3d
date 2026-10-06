import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '@meobom/engine';
import { createHandlers } from './socket';
import { RoomManager } from './rooms';

const PORT = Number(process.env.PORT ?? 3001);
const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(process.env.WEB_DIST ?? join(here, '../../web/dist'));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (!existsSync(WEB_DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Mèo Bom server is running. Build the web app (npm run build) or use the Vite dev server.');
    return;
  }
  let file = normalize(join(WEB_DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(WEB_DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(WEB_DIST, 'index.html'); // SPA fallback for /r/CODE
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  const cache = file.includes(`${WEB_DIST}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': type, 'cache-control': cache });
  createReadStream(file).pipe(res);
});

// CORS_ORIGIN: comma-separated web origins allowed to connect (e.g. the Vercel site), or * for any.
const corsEnv = process.env.CORS_ORIGIN?.trim();
const corsOrigin = !corsEnv ? false : corsEnv === '*' ? true : corsEnv.split(',').map((o) => o.trim().replace(/\/$/, ''));
const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: corsOrigin } });
const rooms = new RoomManager({
  roomState: (sid, info) => io.to(sid).emit('room:state', info),
  gameUpdate: (sid, u) => io.to(sid).emit('game:update', u),
  kicked: (sid) => io.to(sid).emit('room:kicked'),
});
io.on('connection', createHandlers(rooms));
setInterval(() => rooms.sweep(), 60_000).unref();

http.listen(PORT, () => console.log(`Mèo Bom server on http://localhost:${PORT}`));
