import type { Action, GameEvent } from './types';
import type { ClientView } from './view';

/** Socket.IO contract shared by the server and the web client. */

export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface MemberInfo {
  id: string;
  name: string;
  seat: number;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface RoomInfo {
  code: string;
  status: 'lobby' | 'playing';
  members: MemberInfo[];
  maxPlayers: number;
  you: string;
}

export interface GameUpdate {
  view: ClientView;
  events: GameEvent[];
  serverNow: number;
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: ErrorCode }) => void;

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'BAD_NAME'
  | 'NOT_IN_ROOM'
  | 'ILLEGAL_MOVE';

export interface JoinResult {
  code: string;
  playerId: string;
  token: string;
}

export interface ClientToServer {
  'room:create': (p: { name: string }, ack: Ack<JoinResult>) => void;
  'room:join': (p: { code: string; name: string; token?: string }, ack: Ack<JoinResult>) => void;
  'room:leave': () => void;
  'room:addBot': (ack: Ack) => void;
  'room:remove': (p: { memberId: string }, ack: Ack) => void;
  'room:start': (ack: Ack) => void;
  'room:backToLobby': (ack: Ack) => void;
  'game:action': (a: DistributiveOmit<Exclude<Action, { type: 'timeout' }>, 'playerId'>, ack: Ack<{ message?: string }>) => void;
}

export interface ServerToClient {
  'room:state': (r: RoomInfo) => void;
  'room:kicked': () => void;
  'game:update': (u: GameUpdate) => void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ClientAction = Parameters<ClientToServer['game:action']>[0];
