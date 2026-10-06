import type { Socket } from 'socket.io';
import type { Ack, Action, ClientToServer, ServerToClient } from '@meobom/engine';
import { Fail, type RoomManager } from './rooms';

type S = Socket<ClientToServer, ServerToClient, Record<string, never>, { code?: string; memberId?: string }>;

const ok = (ack: unknown) => typeof ack === 'function';

/** Wires one socket's events to the room manager. Every handler validates input and answers through its ack. */
export function createHandlers(rooms: RoomManager) {
  return (socket: S) => {
    const guard =
      <A extends unknown[]>(fn: (...a: A) => object | void) =>
      (...args: A) => {
        const ack = args[args.length - 1] as Ack<object>;
        try {
          const res = fn(...args) ?? {};
          if (ok(ack)) ack({ ok: true, ...res });
        } catch (e) {
          if (e instanceof Fail) {
            if (ok(ack)) ack({ ok: false, error: e.code });
          } else {
            console.error(e);
            if (ok(ack)) ack({ ok: false, error: 'ILLEGAL_MOVE' });
          }
        }
      };

    const current = () => {
      const { code, memberId } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      if (!room || !memberId) throw new Fail('NOT_IN_ROOM');
      return { room, memberId };
    };

    const leaveCurrent = () => {
      const { code, memberId } = socket.data;
      if (code && memberId) rooms.get(code)?.leave(memberId);
      socket.data = {};
    };

    const cleanName = (n: unknown) => {
      if (typeof n !== 'string' || !n.trim()) throw new Fail('BAD_NAME');
      return n.trim().slice(0, 16);
    };

    socket.on(
      'room:create',
      guard((p: { name: string }, _ack: unknown) => {
        leaveCurrent();
        const r = rooms.create(cleanName(p?.name), socket.id);
        socket.data = { code: r.code, memberId: r.playerId };
        return r;
      }),
    );

    socket.on(
      'room:join',
      guard((p: { code: string; name: string; token?: string }, _ack: unknown) => {
        if (typeof p?.code !== 'string') throw new Fail('ROOM_NOT_FOUND');
        const token = typeof p.token === 'string' ? p.token : undefined;
        const name = token && typeof p.name !== 'string' ? 'Mèo' : cleanName(p.name);
        if (socket.data.code && socket.data.code !== p.code.toUpperCase()) leaveCurrent();
        const r = rooms.join(p.code, name, token, socket.id);
        socket.data = { code: r.code, memberId: r.playerId };
        return r;
      }),
    );

    socket.on('room:leave', () => leaveCurrent());

    socket.on(
      'room:addBot',
      guard((_ack: unknown) => {
        const { room, memberId } = current();
        room.addBot(memberId);
      }),
    );

    socket.on(
      'room:remove',
      guard((p: { memberId: string }, _ack: unknown) => {
        const { room, memberId } = current();
        room.remove(memberId, String(p?.memberId));
      }),
    );

    socket.on(
      'room:start',
      guard((_ack: unknown) => {
        const { room, memberId } = current();
        room.start(memberId);
      }),
    );

    socket.on(
      'room:backToLobby',
      guard((_ack: unknown) => {
        const { room, memberId } = current();
        room.backToLobby(memberId);
      }),
    );

    socket.on(
      'game:action',
      guard((a: unknown, _ack: unknown) => {
        const { room, memberId } = current();
        room.act(memberId, parseAction(a, memberId));
      }),
    );

    socket.on('disconnect', () => {
      const { code } = socket.data;
      if (code) rooms.get(code)?.disconnect(socket.id);
    });
  };
}

/** Turns untrusted client input into a typed action (playerId always comes from the socket, never the client). */
function parseAction(a: unknown, playerId: string): Action {
  if (!a || typeof a !== 'object') throw new Fail('ILLEGAL_MOVE');
  const o = a as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  switch (o.type) {
    case 'draw':
    case 'defuse':
    case 'explode':
      return { type: o.type, playerId };
    case 'hiss':
      return { type: 'hiss', playerId, cardId: str(o.cardId) };
    case 'play':
      if (!Array.isArray(o.cardIds) || o.cardIds.length > 3 || !o.cardIds.every((x) => typeof x === 'string')) throw new Fail('ILLEGAL_MOVE');
      return { type: 'play', playerId, cardIds: o.cardIds as string[], target: str(o.target) };
    case 'place':
      if (typeof o.position !== 'number' || !Number.isFinite(o.position)) throw new Fail('ILLEGAL_MOVE');
      return { type: 'place', playerId, position: o.position };
    case 'give': {
      const cardId = str(o.cardId);
      if (!cardId) throw new Fail('ILLEGAL_MOVE');
      return { type: 'give', playerId, cardId };
    }
    default:
      throw new Fail('ILLEGAL_MOVE');
  }
}
