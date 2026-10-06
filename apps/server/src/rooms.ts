import { randomBytes, randomInt } from 'node:crypto';
import {
  botAction,
  botWantsHiss,
  createGame,
  DEFAULT_TIMINGS,
  eventFor,
  MAX_PLAYERS,
  MIN_PLAYERS,
  reduce,
  RuleError,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  setBot,
  viewFor,
  type Action,
  type ErrorCode,
  type GameEvent,
  type GameState,
  type GameUpdate,
  type JoinResult,
  type RoomInfo,
  type Timings,
} from '@meobom/engine';

/** How the room manager talks to clients; Socket.IO in production, a fake in tests. */
export interface Transport {
  roomState(socketId: string, info: RoomInfo): void;
  gameUpdate(socketId: string, update: GameUpdate): void;
  kicked(socketId: string): void;
}

export interface RoomOptions {
  timings?: Timings;
  /** Multiplies bot thinking delays (tests use 0). */
  botPace?: number;
  /** How long a disconnected player keeps their seat before a bot takes over (or, in the lobby, before they are removed). */
  graceMs?: number;
}

interface Member {
  id: string;
  token: string;
  name: string;
  isBot: boolean;
  socketId: string | null;
  /** Left for good during a game: a bot plays the seat until the game ends. */
  left: boolean;
  graceTimer?: NodeJS.Timeout;
}

const BOT_NAMES = ['Bông', 'Mướp', 'Mun', 'Khói', 'Mochi', 'Su Su', 'Tiêu', 'Đậu'];

export class Fail extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? code);
  }
}

export class Room {
  members: Member[] = [];
  hostId = '';
  status: 'lobby' | 'playing' = 'lobby';
  game: GameState | null = null;
  emptySince: number | null = null;
  private timers: NodeJS.Timeout[] = [];
  private lastEvents: GameEvent[] = [];

  constructor(
    public code: string,
    private transport: Transport,
    private opts: Required<RoomOptions>,
  ) {}

  /* ---------- membership ---------- */

  addHuman(name: string, socketId: string): Member {
    if (this.members.length >= MAX_PLAYERS) throw new Fail('ROOM_FULL');
    if (this.status !== 'lobby') throw new Fail('GAME_IN_PROGRESS');
    const m: Member = { id: newId('p'), token: randomBytes(16).toString('hex'), name: this.uniqueName(name), isBot: false, socketId, left: false };
    this.members.push(m);
    if (!this.hostId) this.hostId = m.id;
    this.emptySince = null;
    return m;
  }

  addBot(byId: string) {
    this.requireHost(byId);
    if (this.status !== 'lobby') throw new Fail('GAME_IN_PROGRESS');
    if (this.members.length >= MAX_PLAYERS) throw new Fail('ROOM_FULL');
    const name = BOT_NAMES.find((n) => !this.members.some((m) => m.name === n)) ?? `Mèo ${this.members.length + 1}`;
    this.members.push({ id: newId('b'), token: '', name, isBot: true, socketId: null, left: false });
    this.pushRoomState();
  }

  remove(byId: string, memberId: string) {
    this.requireHost(byId);
    if (this.status !== 'lobby') throw new Fail('GAME_IN_PROGRESS');
    const m = this.members.find((x) => x.id === memberId);
    if (!m || m.id === byId) return;
    this.members = this.members.filter((x) => x !== m);
    if (m.socketId) this.transport.kicked(m.socketId);
    this.pushRoomState();
  }

  /** Re-binds a returning player (same browser token) to a new socket. */
  reconnect(token: string, socketId: string): Member | null {
    const m = this.members.find((x) => !x.isBot && x.token === token && !x.left);
    if (!m) return null;
    m.socketId = socketId;
    clearTimeout(m.graceTimer);
    this.emptySince = null;
    if (this.game) {
      const p = this.game.players.find((q) => q.id === m.id);
      if (p?.isBot) {
        this.game = setBot(this.game, m.id, false);
        this.schedule();
      }
    }
    return m;
  }

  disconnect(socketId: string) {
    const m = this.members.find((x) => x.socketId === socketId);
    if (!m) return;
    m.socketId = null;
    clearTimeout(m.graceTimer);
    m.graceTimer = setTimeout(() => {
      if (m.socketId) return;
      if (this.status === 'lobby') this.dropMember(m);
      else this.botTakeover(m);
    }, this.opts.graceMs);
    if (!this.members.some((x) => x.socketId)) this.emptySince = Date.now();
    this.pushRoomState();
  }

  leave(memberId: string) {
    const m = this.members.find((x) => x.id === memberId);
    if (!m) return;
    clearTimeout(m.graceTimer);
    m.socketId = null;
    if (this.status === 'lobby') this.dropMember(m);
    else {
      m.left = true;
      this.botTakeover(m);
    }
    if (!this.members.some((x) => x.socketId)) this.emptySince = Date.now();
  }

  private dropMember(m: Member) {
    this.members = this.members.filter((x) => x !== m);
    this.fixHost();
    this.pushRoomState();
  }

  private botTakeover(m: Member) {
    if (!this.game) return;
    const p = this.game.players.find((q) => q.id === m.id);
    if (p && !p.isBot) {
      this.game = setBot(this.game, m.id, true);
      this.schedule();
    }
    this.fixHost();
    this.pushRoomState();
  }

  private fixHost() {
    const host = this.members.find((x) => x.id === this.hostId);
    if (host && !host.isBot && !host.left) return;
    const next = this.members.find((x) => !x.isBot && !x.left);
    this.hostId = next ? next.id : '';
  }

  private uniqueName(raw: string) {
    const base = raw.trim().slice(0, 16) || 'Mèo';
    let name = base;
    for (let k = 2; this.members.some((m) => m.name === name); k++) name = `${base} ${k}`;
    return name;
  }

  private requireHost(id: string) {
    if (id !== this.hostId) throw new Fail('NOT_HOST');
  }

  humans() {
    return this.members.filter((m) => !m.isBot && !m.left);
  }

  /* ---------- game ---------- */

  start(byId: string) {
    this.requireHost(byId);
    if (this.status !== 'lobby') throw new Fail('GAME_IN_PROGRESS');
    if (this.members.length < MIN_PLAYERS) throw new Fail('NOT_ENOUGH_PLAYERS');
    const { state, events } = createGame(
      this.members.map((m) => ({ id: m.id, name: m.name, isBot: m.isBot })),
      randomInt(2 ** 31),
      Date.now(),
      this.opts.timings,
    );
    this.status = 'playing';
    this.game = state;
    this.pushRoomState();
    this.commit(state, events);
  }

  backToLobby(byId: string) {
    this.requireHost(byId);
    if (this.game && this.game.phase.kind !== 'over') throw new Fail('GAME_IN_PROGRESS');
    this.clearTimers();
    this.game = null;
    this.status = 'lobby';
    this.members = this.members.filter((m) => !m.left);
    this.pushRoomState();
  }

  /** A player's move. Throws Fail('ILLEGAL_MOVE') with the rule's message. */
  act(memberId: string, action: Action) {
    if (!this.game) throw new Fail('ILLEGAL_MOVE', 'no game');
    if (action.type !== 'timeout' && action.playerId !== memberId) throw new Fail('ILLEGAL_MOVE');
    this.apply(action);
  }

  private apply(action: Action) {
    if (!this.game) return;
    try {
      const now = action.type === 'timeout' ? Math.max(Date.now(), this.game.deadline) : Date.now();
      const { state, events } = reduce(this.game, action, now);
      this.commit(state, events);
    } catch (e) {
      if (e instanceof RuleError) throw new Fail('ILLEGAL_MOVE', e.message);
      throw e;
    }
  }

  private commit(state: GameState, events: GameEvent[]) {
    this.game = state;
    this.lastEvents = events;
    const serverNow = Date.now();
    for (const m of this.members) {
      if (!m.socketId) continue;
      this.transport.gameUpdate(m.socketId, { view: viewFor(state, m.id), events: events.map((e) => eventFor(e, m.id)), serverNow });
    }
    this.schedule();
  }

  /** Sends the current table to one socket (after joining or reconnecting). */
  sendSnapshot(m: Member) {
    if (!this.game || !m.socketId) return;
    this.transport.gameUpdate(m.socketId, { view: viewFor(this.game, m.id), events: [], serverNow: Date.now() });
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(() => {
      try {
        fn();
      } catch (e) {
        if (!(e instanceof Fail)) console.error(e);
      }
    }, Math.max(0, ms)));
  }

  /** Arms the phase timeout and lets bots take their move. */
  private schedule() {
    this.clearTimers();
    const s = this.game;
    if (!s || s.phase.kind === 'over') return;
    this.later(s.deadline - Date.now() + 5, () => this.apply({ type: 'timeout' }));
    const pace = this.opts.botPace;
    const ph = s.phase;
    if (ph.kind === 'hiss') {
      const window = s.deadline - Date.now();
      for (const p of shuffled(s.players)) {
        if (botWantsHiss(s, p.id, Math.random)) {
          this.later(pace * rand(500, Math.max(600, window - 600)), () => this.apply({ type: 'hiss', playerId: p.id }));
          break;
        }
      }
      return;
    }
    for (const p of s.players) {
      if (!p.isBot) continue;
      const a = botAction(s, p.id, Math.random);
      if (!a) continue;
      const drama = this.lastEvents.some((e) => e.kind === 'exploded' || e.kind === 'inserted' || e.kind === 'resolved') ? 900 : 0;
      const base = ph.kind === 'defuse' ? 1700 : ph.kind === 'turn' ? rand(1100, 1800) : 1000;
      this.later(pace * (base + drama), () => this.apply(a));
      break;
    }
  }

  dispose() {
    this.clearTimers();
    for (const m of this.members) clearTimeout(m.graceTimer);
  }

  /* ---------- broadcast ---------- */

  info(forId: string): RoomInfo {
    return {
      code: this.code,
      status: this.status,
      maxPlayers: MAX_PLAYERS,
      you: forId,
      members: this.members.map((m, seat) => ({
        id: m.id,
        name: m.name,
        seat,
        isBot: m.isBot || m.left,
        isHost: m.id === this.hostId,
        connected: m.isBot || !!m.socketId,
      })),
    };
  }

  pushRoomState() {
    for (const m of this.members) if (m.socketId) this.transport.roomState(m.socketId, this.info(m.id));
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();
  private opts: Required<RoomOptions>;

  constructor(private transport: Transport, opts: RoomOptions = {}) {
    this.opts = { timings: opts.timings ?? DEFAULT_TIMINGS, botPace: opts.botPace ?? 1, graceMs: opts.graceMs ?? 60_000 };
  }

  create(name: string, socketId: string): JoinResult {
    let code: string;
    do code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('');
    while (this.rooms.has(code));
    const room = new Room(code, this.transport, this.opts);
    this.rooms.set(code, room);
    const m = room.addHuman(name, socketId);
    room.pushRoomState();
    return { code, playerId: m.id, token: m.token };
  }

  join(rawCode: string, name: string, token: string | undefined, socketId: string): JoinResult {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Fail('ROOM_NOT_FOUND');
    const back = token ? room.reconnect(token, socketId) : null;
    if (back) {
      room.pushRoomState();
      room.sendSnapshot(back);
      return { code, playerId: back.id, token: back.token };
    }
    const m = room.addHuman(name, socketId);
    room.pushRoomState();
    return { code, playerId: m.id, token: m.token };
  }

  get(code: string) {
    return this.rooms.get(code);
  }

  /** Drops rooms nobody has been connected to for a while. */
  sweep(idleMs = 15 * 60_000) {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (!room.humans().length || (room.emptySince !== null && now - room.emptySince > idleMs)) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }
}

function newId(prefix: string) {
  return prefix + randomBytes(6).toString('hex');
}
function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}
function shuffled<T>(a: T[]): T[] {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}
