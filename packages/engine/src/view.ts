import type { Card, CardType, GameEvent, GameState, PendingPlay } from './types';

/** What one player is allowed to know. Built on the server; the deck order and other hands never leave it. */
export interface ClientView {
  you: string | null;
  players: {
    id: string;
    name: string;
    alive: boolean;
    isBot: boolean;
    handCount: number;
  }[];
  hand: Card[];
  deckCount: number;
  fuseCount: number;
  /** Most recent cards on the discard pile, oldest first. */
  discard: Card[];
  turn: string;
  pending: number;
  phase:
    | { kind: 'turn' }
    | { kind: 'hiss'; play: PendingPlay }
    | { kind: 'defuse'; player: string; card: Card; hasSnip: boolean }
    | { kind: 'placeFuse'; player: string; card: Card }
    | { kind: 'give'; from: string; to: string }
    | { kind: 'over'; winner: string };
  deadline: number;
  /** Your own Peek knowledge, top first, while it is still valid. */
  knownTop: CardType[];
}

export const DISCARD_VISIBLE = 14;

export function viewFor(s: GameState, you: string | null): ClientView {
  const me = s.players.find((p) => p.id === you);
  const ph = s.phase;
  let phase: ClientView['phase'];
  if (ph.kind === 'defuse') {
    const p = s.players.find((q) => q.id === ph.player)!;
    phase = { ...ph, hasSnip: p.hand.some((c) => c.type === 'snip') };
  } else phase = ph;
  return {
    you: me ? me.id : null,
    players: s.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive, isBot: p.isBot, handCount: p.hand.length })),
    hand: me ? me.hand : [],
    deckCount: s.deck.length,
    fuseCount: s.deck.filter((t) => t === 'fuse').length,
    discard: s.discard.slice(-DISCARD_VISIBLE),
    turn: s.players[s.turn].id,
    pending: s.pending,
    phase,
    deadline: s.deadline,
    knownTop: (you && s.knownTop[you]) || [],
  };
}

/** Strips private details from an event for one viewer. */
export function eventFor(e: GameEvent, you: string | null): GameEvent {
  switch (e.kind) {
    case 'drew':
      return e.player === you ? e : { kind: 'drew', player: e.player };
    case 'gave':
      return e.from === you || e.to === you ? e : { ...e, card: undefined };
    case 'peeked':
      return e.player === you ? e : { kind: 'peeked', player: e.player };
    case 'inserted':
      return e.player === you ? e : { ...e, position: undefined };
    default:
      return e;
  }
}
