# Mèo Bom (Fuse Cats)

A Vietnamese-first 3D online card game for 2 to 5 players, played in the browser. Draw cards in turn; whoever draws a **Mèo Bom** without a **Cắt Ngòi** explodes. The last cat standing wins.

- Design document: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- First look-and-feel sample (single HTML file): [prototype/table-sample.html](prototype/table-sample.html)

## Play with friends

1. Open the site, type your name, press **Tạo phòng** (create room).
2. Share the invite link (`/r/ABCDE`) or read out the 5-letter room code. Friends open the link or type the code under **Vào phòng của bạn bè**.
3. The host can fill empty seats with bots (**+ Thêm máy**), then press **Bắt đầu chơi**.
4. Reloading the page or losing the connection keeps your seat: the browser remembers you. If you stay away for 60 seconds a bot plays for you until you come back.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev        # server on :3001 + Vite on http://localhost:5173
```

Production (one process serves the web app and the game socket):

```bash
npm run build
PORT=3001 npm start   # open http://localhost:3001
```

Or with Docker: `docker build -t meo-bom . && docker run -p 3001:3001 meo-bom`.

## Deploy: web on Vercel, game server elsewhere

Vercel serves the static web app well, but its functions can't hold the long-lived WebSocket the game uses, so the Socket.IO server runs on a host that keeps a process alive (Render, Railway, Fly.io). Alternatively, skip Vercel and deploy just the server (or the Dockerfile): it serves the web app too.

1. **Server (Render example).** New → Blueprint, pick this repo; `render.yaml` sets it up (`npm run build -w @meobom/server`, `npm start`, health check `/healthz`). Set `CORS_ORIGIN` to your Vercel URL, e.g. `https://meo-bom.vercel.app` (comma-separate several, or `*`). Note the server URL, e.g. `https://meo-bom-server.onrender.com`.
2. **Web (Vercel).** Import the repo with the root directory left as the repo root; `vercel.json` sets the install, build and output (`apps/web/dist`) and rewrites invite links `/r/CODE` to the app. Add the environment variable `VITE_SERVER_URL` = the server URL from step 1, then deploy (redeploy after changing it, since Vite bakes it in at build time).
3. Open the Vercel URL, create a room and share the invite link.

Rooms live in the server's memory: a restart or a free-tier sleep ends games in progress.

## Tests

```bash
npm test           # rules engine (incl. 300 simulated bot games) + room server integration
npm run typecheck
```

## Layout

| Path | What |
|---|---|
| `packages/engine` | Pure TypeScript rules: deck, turns, Hiss windows, Fuse Cats, per-player views that never leak other hands or the deck order, bots, and the shared Socket.IO protocol types. |
| `apps/server` | Node + Socket.IO. Rooms with invite codes, host controls, reconnect tokens, phase timers, bot moves. Also serves the built web app. |
| `apps/web` | React + TypeScript + React Three Fiber. Home, lobby and the 3D table; all text in Vietnamese (`src/i18n.ts`). |

## Not in v1 yet

Three-of-a-kind Alley Cat combo, chat/emotes, sound, an English language switch, and room persistence across server restarts (rooms live in memory).
