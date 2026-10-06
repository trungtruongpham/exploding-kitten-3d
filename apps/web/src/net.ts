import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type {
  ClientAction,
  ClientToServer,
  ClientView,
  ErrorCode,
  GameEvent,
  JoinResult,
  RoomInfo,
  ServerToClient,
} from '@meobom/engine';
import { ERRORS, T } from './i18n';

export interface Update {
  seq: number;
  view: ClientView;
  events: GameEvent[];
}

interface Store {
  conn: 'connecting' | 'online' | 'offline';
  room: RoomInfo | null;
  update: Update | null;
  /** serverNow - Date.now(), for countdowns that match the server. */
  clockOffset: number;
  toast: { text: string; id: number } | null;
}

export const useStore = create<Store>(() => ({ conn: 'connecting', room: null, update: null, clockOffset: 0, toast: null }));

export const serverNow = () => Date.now() + useStore.getState().clockOffset;

let toastId = 0;
export function toast(text: string) {
  useStore.setState({ toast: { text, id: ++toastId } });
}

const socket: Socket<ServerToClient, ClientToServer> = io({ transports: ['websocket', 'polling'] });

/* ---------- local persistence (per browser) ---------- */

const NAME_KEY = 'meobom:name';
const tokenKey = (code: string) => `meobom:room:${code}`;
const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
export const savedName = () => safe(() => localStorage.getItem(NAME_KEY) ?? '', '');
const saveName = (n: string) => safe(() => localStorage.setItem(NAME_KEY, n), undefined);
const savedToken = (code: string) => safe(() => localStorage.getItem(tokenKey(code)) ?? undefined, undefined);
const saveToken = (code: string, token: string) => safe(() => localStorage.setItem(tokenKey(code), token), undefined);
const dropToken = (code: string) => safe(() => localStorage.removeItem(tokenKey(code)), undefined);

/* ---------- routing: "/" home, "/r/CODE" a room ---------- */

export const roomCodeFromPath = () => {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})\/?$/);
  return m ? m[1].toUpperCase() : null;
};
export const inviteLink = (code: string) => `${location.origin}/r/${code}`;
export const hasTokenFor = (code: string) => !!savedToken(code);

function goto(path: string) {
  if (location.pathname !== path) history.pushState(null, '', path);
  window.dispatchEvent(new Event('meobom:navigate'));
}

/* ---------- socket wiring ---------- */

let seq = 0;
let currentCode: string | null = null;

socket.on('connect', () => {
  useStore.setState({ conn: 'online' });
  // re-attach to the room after a reconnect (or a page reload on /r/CODE)
  const code = currentCode ?? roomCodeFromPath();
  const token = code ? savedToken(code) : undefined;
  if (code && token) void joinRoom(code, savedName() || 'Mèo', true);
});
socket.on('disconnect', () => useStore.setState({ conn: 'offline' }));
socket.io.on('reconnect_attempt', () => useStore.setState({ conn: 'connecting' }));

socket.on('room:state', (room) => {
  const prev = useStore.getState().room;
  useStore.setState({ room, ...(room.status === 'lobby' ? { update: null } : {}) });
  if (prev?.status === 'playing' && room.status === 'lobby') seq++;
});
socket.on('game:update', (u) => {
  useStore.setState({ update: { seq: ++seq, view: u.view, events: u.events }, clockOffset: u.serverNow - Date.now() });
});
socket.on('room:kicked', () => {
  if (currentCode) dropToken(currentCode);
  currentCode = null;
  useStore.setState({ room: null, update: null });
  toast(T.kicked);
  goto('/');
});

type Res<T> = ({ ok: true } & T) | { ok: false; error: ErrorCode };
function call<T = object>(ev: keyof ClientToServer, ...args: unknown[]): Promise<Res<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      toast(ERRORS.OFFLINE);
      return resolve({ ok: false, error: 'NOT_IN_ROOM' });
    }
    (socket.emit as (...a: unknown[]) => void)(ev, ...args, resolve);
  });
}

function fail(r: { ok: false; error: ErrorCode }) {
  toast(ERRORS[r.error] ?? ERRORS.ILLEGAL_MOVE);
}

/* ---------- actions ---------- */

export async function createRoom(name: string) {
  saveName(name);
  const r = await call<JoinResult>('room:create', { name });
  if (!r.ok) return fail(r);
  currentCode = r.code;
  saveToken(r.code, r.token);
  goto(`/r/${r.code}`);
}

export async function joinRoom(code: string, name: string, silent = false) {
  code = code.trim().toUpperCase();
  if (name) saveName(name);
  const r = await call<JoinResult>('room:join', { code, name, token: savedToken(code) });
  if (!r.ok) {
    if (r.error === 'ROOM_NOT_FOUND') dropToken(code);
    if (silent && r.error === 'ROOM_NOT_FOUND') {
      toast(T.roomGone);
      goto('/');
      return;
    }
    fail(r);
    return false;
  }
  currentCode = r.code;
  saveToken(r.code, r.token);
  goto(`/r/${r.code}`);
  return true;
}

export function leaveRoom() {
  socket.emit('room:leave');
  if (currentCode) dropToken(currentCode);
  currentCode = null;
  useStore.setState({ room: null, update: null });
  goto('/');
}

export async function addBot() {
  const r = await call('room:addBot');
  if (!r.ok) fail(r);
}
export async function removeMember(memberId: string) {
  const r = await call('room:remove', { memberId });
  if (!r.ok) fail(r);
}
export async function startGame() {
  const r = await call('room:start');
  if (!r.ok) fail(r);
}
export async function backToLobby() {
  const r = await call('room:backToLobby');
  if (!r.ok) fail(r);
}
export async function act(a: ClientAction) {
  const r = await call('game:action', a);
  if (!r.ok) fail(r);
  return r.ok;
}
