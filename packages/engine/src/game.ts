import { int, pick, shuffle } from './rng';
import {
  ACTION_CARDS,
  ALLEY_CARDS,
  DEFAULT_TIMINGS,
  RuleError,
  type Action,
  type Card,
  type CardType,
  type GameEvent,
  type GameState,
  type PendingPlay,
  type PlayerState,
  type ReduceResult,
  type Timings,
} from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const HAND_SIZE = 7;

const isAction = (t: CardType): boolean => (ACTION_CARDS as readonly string[]).includes(t);
export const isAlley = (t: CardType): boolean => (ALLEY_CARDS as readonly string[]).includes(t);

/** The 46 cards that are neither Fuse Cats nor Snips. */
function basePool(): CardType[] {
  const pool: CardType[] = [];
  const add = (t: CardType, n: number) => {
    for (let i = 0; i < n; i++) pool.push(t);
  };
  add('hiss', 5);
  add('pounce', 4);
  add('catnap', 4);
  add('bribe', 4);
  add('scramble', 4);
  add('peek', 5);
  for (const a of ALLEY_CARDS) add(a, 4);
  return pool;
}

export interface NewPlayer {
  id: string;
  name: string;
  isBot: boolean;
}

export function createGame(
  players: NewPlayer[],
  seed: number,
  now: number,
  timings: Timings = DEFAULT_TIMINGS,
): ReduceResult {
  const n = players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new RuleError(`need ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  const s: GameState = {
    players: [],
    deck: [],
    discard: [],
    turn: 0,
    pending: 1,
    phase: { kind: 'turn' },
    deadline: 0,
    turnDeadline: 0,
    timings,
    nextId: 1,
    rng: seed >>> 0,
    knownTop: {},
    playsThisTurn: 0,
  };
  const pool = shuffle(s, basePool());
  s.players = players.map<PlayerState>((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: true,
    hand: [newCard(s, 'snip'), ...pool.splice(0, HAND_SIZE).map((t) => newCard(s, t))],
  }));
  s.deck = pool;
  for (let i = 0; i < 6 - n; i++) s.deck.push('snip');
  for (let i = 0; i < n - 1; i++) s.deck.push('fuse');
  shuffle(s, s.deck);
  s.turn = int(s, n);
  const events: GameEvent[] = [{ kind: 'dealt', players: s.players.map((p) => p.id), fuses: n - 1 }];
  startTurn(s, now, events);
  return { state: s, events };
}

function newCard(s: GameState, type: CardType): Card {
  return { id: `c${s.nextId++}`, type };
}

const idx = (s: GameState, id: string) => s.players.findIndex((p) => p.id === id);
const player = (s: GameState, id: string): PlayerState => {
  const p = s.players.find((q) => q.id === id);
  if (!p) throw new RuleError('unknown player');
  return p;
};
export const currentPlayer = (s: GameState): PlayerState => s.players[s.turn];
export const aliveCount = (s: GameState) => s.players.filter((p) => p.alive).length;

export function nextAlive(s: GameState, from: number): number {
  for (let k = 1; k <= s.players.length; k++) {
    const j = (from + k) % s.players.length;
    if (s.players[j].alive) return j;
  }
  return from;
}

function startTurn(s: GameState, now: number, events: GameEvent[]) {
  s.phase = { kind: 'turn' };
  s.deadline = s.turnDeadline = now + s.timings.turn;
  s.playsThisTurn = 0;
  events.push({ kind: 'turn', player: currentPlayer(s).id, pending: s.pending });
}

/** Back to the current player's turn after an action resolves, keeping their turn timer fair. */
function resumeTurn(s: GameState, now: number) {
  s.phase = { kind: 'turn' };
  s.deadline = s.turnDeadline = Math.max(s.turnDeadline, now + 10000);
}

function endTurn(s: GameState, now: number, events: GameEvent[], pounce: boolean) {
  const cur = s.turn;
  if (pounce) {
    const owed = (s.pending > 1 ? s.pending : 0) + 2;
    s.turn = nextAlive(s, cur);
    s.pending = owed;
  } else if (s.pending > 1 && s.players[cur].alive) {
    s.pending -= 1;
  } else {
    s.turn = nextAlive(s, cur);
    s.pending = 1;
  }
  startTurn(s, now, events);
}

function takeFromHand(p: PlayerState, cardId: string): Card {
  const k = p.hand.findIndex((c) => c.id === cardId);
  if (k < 0) throw new RuleError('card not in hand');
  return p.hand.splice(k, 1)[0];
}

function drawTop(s: GameState): CardType {
  const t = s.deck.pop()!;
  for (const id in s.knownTop) s.knownTop[id].shift();
  return t;
}

/** Applies one action. Never mutates the input state. Throws RuleError on an illegal action. */
export function reduce(state: GameState, action: Action, now: number): ReduceResult {
  const s: GameState = structuredClone(state);
  const events: GameEvent[] = [];
  const ph = s.phase;
  if (ph.kind === 'over') throw new RuleError('game over');

  if (action.type === 'timeout') {
    if (now < s.deadline) throw new RuleError('too early');
    switch (ph.kind) {
      case 'turn':
        doDraw(s, now, events);
        break;
      case 'hiss':
        resolvePlay(s, ph.play, now, events);
        break;
      case 'defuse': {
        const p = player(s, ph.player);
        if (p.hand.some((c) => c.type === 'snip')) doDefuse(s, p, ph.card, now, events);
        else explode(s, p, ph.card, now, events);
        break;
      }
      case 'placeFuse':
        doPlace(s, ph.player, ph.card, int(s, s.deck.length + 1), now, events);
        break;
      case 'give': {
        const from = player(s, ph.from);
        doGive(s, from, player(s, ph.to), from.hand.length ? pick(s, from.hand).id : null, false, now, events);
        break;
      }
    }
    return { state: s, events };
  }

  const p = player(s, action.playerId);
  if (!p.alive) throw new RuleError('you are out');
  const isCurrent = currentPlayer(s).id === p.id;

  switch (action.type) {
    case 'draw':
      if (ph.kind !== 'turn' || !isCurrent) throw new RuleError('not your turn');
      doDraw(s, now, events);
      break;

    case 'play': {
      if (ph.kind !== 'turn' || !isCurrent) throw new RuleError('not your turn');
      const cards = action.cardIds.map((id) => {
        const c = p.hand.find((h) => h.id === id);
        if (!c) throw new RuleError('card not in hand');
        return c;
      });
      if (new Set(action.cardIds).size !== cards.length) throw new RuleError('duplicate card');
      let play: PendingPlay;
      if (cards.length === 1 && isAction(cards[0].type)) {
        const type = cards[0].type;
        if (type === 'bribe') validateTarget(s, p, action.target);
        play = { actor: p.id, type, kind: 'action', cardIds: action.cardIds, target: type === 'bribe' ? action.target : undefined, hissers: [] };
      } else if (cards.length === 2 && isAlley(cards[0].type) && cards[0].type === cards[1].type) {
        validateTarget(s, p, action.target);
        play = { actor: p.id, type: cards[0].type, kind: 'pair', cardIds: action.cardIds, target: action.target, hissers: [] };
      } else {
        throw new RuleError('that card cannot be played now');
      }
      const played = action.cardIds.map((id) => takeFromHand(p, id));
      s.discard.push(...played);
      s.playsThisTurn++;
      events.push({ kind: 'played', actor: p.id, type: play.type, cards: played, target: play.target });
      s.phase = { kind: 'hiss', play };
      s.deadline = now + s.timings.hiss;
      break;
    }

    case 'hiss': {
      if (ph.kind !== 'hiss') throw new RuleError('nothing to hiss');
      const last = ph.play.hissers[ph.play.hissers.length - 1] ?? ph.play.actor;
      if (last === p.id) throw new RuleError('you cannot hiss yourself');
      const hissCard = action.cardId ? p.hand.find((c) => c.id === action.cardId && c.type === 'hiss') : p.hand.find((c) => c.type === 'hiss');
      if (!hissCard) throw new RuleError('no Hiss card');
      takeFromHand(p, hissCard.id);
      s.discard.push(hissCard);
      ph.play.hissers.push(p.id);
      s.deadline = now + s.timings.hiss;
      events.push({ kind: 'hissed', player: p.id, card: hissCard });
      break;
    }

    case 'defuse':
      if (ph.kind !== 'defuse' || ph.player !== p.id) throw new RuleError('nothing to defuse');
      if (!p.hand.some((c) => c.type === 'snip')) throw new RuleError('no Snip card');
      doDefuse(s, p, ph.card, now, events);
      break;

    case 'explode':
      if (ph.kind !== 'defuse' || ph.player !== p.id) throw new RuleError('nothing to explode');
      explode(s, p, ph.card, now, events);
      break;

    case 'place': {
      if (ph.kind !== 'placeFuse' || ph.player !== p.id) throw new RuleError('nothing to place');
      const pos = Math.max(0, Math.min(s.deck.length, Math.floor(action.position)));
      doPlace(s, p.id, ph.card, pos, now, events);
      break;
    }

    case 'give': {
      if (ph.kind !== 'give' || ph.from !== p.id) throw new RuleError('nothing to give');
      doGive(s, p, player(s, ph.to), action.cardId, false, now, events);
      break;
    }
  }
  return { state: s, events };
}

function validateTarget(s: GameState, actor: PlayerState, target: string | undefined) {
  if (!target || target === actor.id) throw new RuleError('pick another player');
  const t = player(s, target);
  if (!t.alive) throw new RuleError('that player is out');
  if (!t.hand.length) throw new RuleError('that player has no cards');
}

function doDraw(s: GameState, now: number, events: GameEvent[]) {
  const p = currentPlayer(s);
  if (!s.deck.length) {
    endTurn(s, now, events, false);
    return;
  }
  const type = drawTop(s);
  const card = newCard(s, type);
  if (type === 'fuse') {
    s.phase = { kind: 'defuse', player: p.id, card };
    s.deadline = now + (p.hand.some((c) => c.type === 'snip') ? s.timings.defuse : s.timings.noSnip);
    events.push({ kind: 'fuseDrawn', player: p.id, card });
    return;
  }
  p.hand.push(card);
  events.push({ kind: 'drew', player: p.id, card });
  endTurn(s, now, events, false);
}

function doDefuse(s: GameState, p: PlayerState, fuse: Card, now: number, events: GameEvent[]) {
  const snip = p.hand.find((c) => c.type === 'snip')!;
  takeFromHand(p, snip.id);
  s.discard.push(snip);
  events.push({ kind: 'defused', player: p.id, card: snip });
  s.phase = { kind: 'placeFuse', player: p.id, card: fuse };
  s.deadline = now + s.timings.place;
}

function doPlace(s: GameState, playerId: string, fuse: Card, posFromTop: number, now: number, events: GameEvent[]) {
  s.deck.splice(s.deck.length - posFromTop, 0, 'fuse');
  s.knownTop = {};
  events.push({ kind: 'inserted', player: playerId, cardId: fuse.id, position: posFromTop });
  endTurn(s, now, events, false);
}

function explode(s: GameState, p: PlayerState, fuse: Card, now: number, events: GameEvent[]) {
  p.alive = false;
  s.discard.push(...p.hand);
  p.hand = [];
  delete s.knownTop[p.id];
  events.push({ kind: 'exploded', player: p.id, cardId: fuse.id });
  if (aliveCount(s) === 1) {
    const w = s.players.find((q) => q.alive)!;
    s.phase = { kind: 'over', winner: w.id };
    s.deadline = Number.MAX_SAFE_INTEGER;
    events.push({ kind: 'win', player: w.id });
    return;
  }
  s.turn = nextAlive(s, idx(s, p.id));
  s.pending = 1;
  startTurn(s, now, events);
}

function doGive(s: GameState, from: PlayerState, to: PlayerState, cardId: string | null, stolen: boolean, now: number, events: GameEvent[]) {
  if (cardId) {
    const card = takeFromHand(from, cardId);
    to.hand.push(card);
    events.push({ kind: 'gave', from: from.id, to: to.id, cardId: card.id, card, stolen });
  }
  resumeTurn(s, now);
}

function resolvePlay(s: GameState, play: PendingPlay, now: number, events: GameEvent[]) {
  const canceled = play.hissers.length % 2 === 1;
  events.push({ kind: 'resolved', actor: play.actor, type: play.type, canceled });
  if (canceled) {
    resumeTurn(s, now);
    return;
  }
  const actor = player(s, play.actor);
  if (play.kind === 'pair') {
    const target = player(s, play.target!);
    doGive(s, target, actor, target.hand.length ? pick(s, target.hand).id : null, true, now, events);
    return;
  }
  switch (play.type) {
    case 'catnap':
      endTurn(s, now, events, false);
      return;
    case 'pounce':
      endTurn(s, now, events, true);
      return;
    case 'scramble':
      shuffle(s, s.deck);
      s.knownTop = {};
      events.push({ kind: 'shuffled', player: actor.id });
      resumeTurn(s, now);
      return;
    case 'peek': {
      const top = s.deck.slice(-3).reverse();
      s.knownTop[actor.id] = [...top];
      events.push({ kind: 'peeked', player: actor.id, top });
      resumeTurn(s, now);
      return;
    }
    case 'bribe': {
      const target = player(s, play.target!);
      if (!target.alive || !target.hand.length) {
        resumeTurn(s, now);
        return;
      }
      s.phase = { kind: 'give', from: target.id, to: actor.id };
      s.deadline = now + s.timings.give;
      return;
    }
  }
}

/** Marks a player as controlled by a bot (or back to human). Used when someone disconnects or leaves. */
export function setBot(state: GameState, playerId: string, isBot: boolean): GameState {
  const s = structuredClone(state);
  player(s, playerId).isBot = isBot;
  return s;
}
