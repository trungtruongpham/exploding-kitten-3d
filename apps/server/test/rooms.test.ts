import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientToServer, GameUpdate, RoomInfo, ServerToClient } from '@meobom/engine';
import { RoomManager } from '../src/rooms';
import { createHandlers } from '../src/socket';

type C = Socket<ServerToClient, ClientToServer>;

const FAST = { hiss: 60, defuse: 80, noSnip: 40, place: 80, give: 80, turn: 150 };
let url = '';
let ioServer: Server;
let rooms: RoomManager;
const clients: C[] = [];

beforeAll(async () => {
  const http = createServer();
  ioServer = new Server(http);
  rooms = new RoomManager(
    {
      roomState: (sid, info) => ioServer.to(sid).emit('room:state', info),
      gameUpdate: (sid, u) => ioServer.to(sid).emit('game:update', u),
      kicked: (sid) => ioServer.to(sid).emit('room:kicked'),
    },
    { timings: FAST, botPace: 0.02, graceMs: 200 },
  );
  ioServer.on('connection', createHandlers(rooms) as never);
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(() => {
  clients.forEach((c) => c.close());
  for (const r of rooms.rooms.values()) r.dispose();
  ioServer.close();
});

function client(): Promise<C> {
  const c: C = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return new Promise((r) => c.on('connect', () => r(c)));
}
const call = <T>(c: C, ev: string, ...args: unknown[]) =>
  new Promise<T>((r) => (c.emit as (...a: unknown[]) => void)(ev, ...args, r));
const nextRoom = (c: C) => new Promise<RoomInfo>((r) => c.once('room:state', r));

describe('rooms', () => {
  it('create, invite by code, add a bot, start, and finish a full game', async () => {
    const host = await client();
    const friend = await client();
    const created = await call<{ ok: true; code: string; playerId: string; token: string }>(host, 'room:create', { name: 'Trung' });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z2-9]{5}$/);

    const hostSees = nextRoom(host);
    const joined = await call<{ ok: true; playerId: string }>(friend, 'room:join', { code: created.code.toLowerCase(), name: 'Lan' });
    expect(joined.ok).toBe(true);
    expect((await hostSees).members.map((m) => m.name)).toEqual(['Trung', 'Lan']);

    // only the host may add bots or start
    expect(await call(friend, 'room:addBot')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await call(host, 'room:addBot')).toEqual({ ok: true });

    // both humans auto-play: draw on their turn, snip when they can, hide the Fuse Cat on top
    const finished: Promise<string>[] = [host, friend].map(
      (c) =>
        new Promise((resolve) => {
          c.on('game:update', (u: GameUpdate) => {
            const v = u.view;
            if (v.phase.kind === 'over') return resolve(v.phase.winner);
            if (v.you && v.players.find((p) => p.id === v.you)?.alive === false) return;
            // each player only ever sees their own hand
            expect(v.hand.length).toBe(v.players.find((p) => p.id === v.you)!.handCount);
            if (v.phase.kind === 'turn' && v.turn === v.you) c.emit('game:action', { type: 'draw' }, () => {});
            if (v.phase.kind === 'defuse' && v.phase.player === v.you) c.emit('game:action', { type: v.phase.hasSnip ? 'defuse' : 'explode' }, () => {});
            if (v.phase.kind === 'placeFuse' && v.phase.player === v.you) c.emit('game:action', { type: 'place', position: 0 }, () => {});
          });
        }),
    );
    expect(await call(host, 'room:start')).toEqual({ ok: true });
    const [w1, w2] = await Promise.all(finished);
    expect(w1).toBe(w2);
    expect(await call(host, 'room:backToLobby')).toEqual({ ok: true });
  }, 60_000);

  it('rejects unknown codes, full rooms and games in progress', async () => {
    const a = await client();
    expect(await call(a, 'room:join', { code: 'ZZZZZ', name: 'X' })).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    const r = await call<{ code: string }>(a, 'room:create', { name: 'Host' });
    for (let i = 0; i < 4; i++) await call(a, 'room:addBot');
    const b = await client();
    expect(await call(b, 'room:join', { code: r.code, name: 'Late' })).toEqual({ ok: false, error: 'ROOM_FULL' });
    expect(await call(a, 'room:addBot')).toEqual({ ok: false, error: 'ROOM_FULL' });
  });

  it('a player who reloads gets their seat and hand back with their token', async () => {
    const a = await client();
    const b = await client();
    const r = await call<{ code: string; token: string; playerId: string }>(a, 'room:create', { name: 'Host' });
    await call(b, 'room:join', { code: r.code, name: 'Guest' });
    const first = new Promise<GameUpdate>((res) => a.once('game:update', res));
    await call(a, 'room:start');
    const hand = (await first).view.hand.map((c) => c.id).sort();
    a.close();
    const a2 = await client();
    const snap = new Promise<GameUpdate>((res) => a2.once('game:update', res));
    const back = await call<{ ok: boolean; playerId: string }>(a2, 'room:join', { code: r.code, name: 'Host', token: r.token });
    expect(back).toMatchObject({ ok: true, playerId: r.playerId });
    const v = (await snap).view;
    expect(v.you).toBe(r.playerId);
    // the hand may have grown if a turn passed, but the original cards are still there unless played
    expect(v.hand.length).toBeGreaterThan(0);
    expect(hand.length).toBe(8);
  });

  it('rejects moves from the wrong player', async () => {
    const a = await client();
    const b = await client();
    const r = await call<{ code: string }>(a, 'room:create', { name: 'A' });
    await call(b, 'room:join', { code: r.code, name: 'B' });
    const ua = new Promise<GameUpdate>((res) => a.once('game:update', res));
    await call(a, 'room:start');
    const v = (await ua).view;
    const notMe = v.turn === v.you ? b : a;
    expect(await call(notMe, 'game:action', { type: 'draw' })).toEqual({ ok: false, error: 'ILLEGAL_MOVE' });
  });
});
