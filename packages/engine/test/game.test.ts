import { describe, expect, it } from 'vitest';
import {
  botAction,
  botWantsHiss,
  createGame,
  eventFor,
  reduce,
  viewFor,
  type Action,
  type CardType,
  type GameState,
} from '../src';

const players = (n: number, bots = false) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: bots }));

const T0 = 1_000_000;

function totalCards(s: GameState, exploded: number) {
  return s.deck.length + s.discard.length + s.players.reduce((n, p) => n + p.hand.length, 0) + exploded + (s.phase.kind === 'defuse' || s.phase.kind === 'placeFuse' ? 1 : 0);
}

/** Puts a specific card type on top of the deck (test helper). */
function stackTop(s: GameState, t: CardType) {
  const k = s.deck.lastIndexOf(t);
  if (k >= 0) s.deck.splice(k, 1);
  s.deck.push(t);
}

function give(s: GameState, pid: string, t: CardType) {
  const id = `t${s.nextId++}`;
  s.players.find((p) => p.id === pid)!.hand.push({ id, type: t });
  return id;
}

describe('setup', () => {
  it.each([2, 3, 4, 5])('deals %i players correctly', (n) => {
    const { state: s } = createGame(players(n), 42, T0);
    expect(s.players).toHaveLength(n);
    for (const p of s.players) {
      expect(p.hand).toHaveLength(8);
      expect(p.hand.filter((c) => c.type === 'snip').length).toBeGreaterThanOrEqual(1);
    }
    expect(s.deck.filter((t) => t === 'fuse')).toHaveLength(n - 1);
    expect(s.deck).toHaveLength(46 - 7 * n + (6 - n) + (n - 1));
    expect(totalCards(s, 0)).toBe(56 - 4 + (n - 1));
    const ids = s.players.flatMap((p) => p.hand.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects 1 or 6 players', () => {
    expect(() => createGame(players(1), 1, T0)).toThrow();
    expect(() => createGame(players(6), 1, T0)).toThrow();
  });
});

describe('turns', () => {
  it('drawing a safe card ends the turn', () => {
    let { state: s } = createGame(players(3), 7, T0);
    s.turn = 0;
    stackTop(s, 'peek');
    const before = s.players[0].hand.length;
    const r = reduce(s, { type: 'draw', playerId: 'p0' }, T0);
    expect(r.state.players[0].hand.length).toBe(before + 1);
    expect(r.state.turn).toBe(1);
    expect(r.events.map((e) => e.kind)).toEqual(['drew', 'turn']);
  });

  it('rejects moves out of turn', () => {
    const { state: s } = createGame(players(3), 7, T0);
    s.turn = 0;
    expect(() => reduce(s, { type: 'draw', playerId: 'p1' }, T0)).toThrow();
  });

  it('Fuse Cat with a Snip: defuse, hide it, turn passes', () => {
    let { state: s } = createGame(players(3), 9, T0);
    s.turn = 0;
    stackTop(s, 'fuse');
    const deckBefore = s.deck.length;
    s = reduce(s, { type: 'draw', playerId: 'p0' }, T0).state;
    expect(s.phase.kind).toBe('defuse');
    s = reduce(s, { type: 'defuse', playerId: 'p0' }, T0).state;
    expect(s.phase.kind).toBe('placeFuse');
    s = reduce(s, { type: 'place', playerId: 'p0', position: 0 }, T0).state;
    expect(s.deck.length).toBe(deckBefore);
    expect(s.deck[s.deck.length - 1]).toBe('fuse');
    expect(s.turn).toBe(1);
  });

  it('Fuse Cat without a Snip explodes on timeout, and the last cat wins', () => {
    let { state: s } = createGame(players(2), 11, T0);
    s.turn = 0;
    s.players[0].hand = s.players[0].hand.filter((c) => c.type !== 'snip');
    stackTop(s, 'fuse');
    s = reduce(s, { type: 'draw', playerId: 'p0' }, T0).state;
    expect(() => reduce(s, { type: 'timeout' }, T0)).toThrow();
    const r = reduce(s, { type: 'timeout' }, s.deadline);
    expect(r.state.players[0].alive).toBe(false);
    expect(r.state.phase).toEqual({ kind: 'over', winner: 'p1' });
    expect(r.events.map((e) => e.kind)).toEqual(['exploded', 'win']);
  });

  it('turn timeout auto-draws', () => {
    let { state: s } = createGame(players(3), 5, T0);
    s.turn = 0;
    stackTop(s, 'hiss');
    const r = reduce(s, { type: 'timeout' }, s.deadline);
    expect(r.events[0]).toMatchObject({ kind: 'drew', player: 'p0' });
  });
});

describe('actions and Hiss', () => {
  it('Catnap ends the turn without drawing after the Hiss window', () => {
    let { state: s } = createGame(players(3), 3, T0);
    s.turn = 0;
    const id = give(s, 'p0', 'catnap');
    const deck = s.deck.length;
    s = reduce(s, { type: 'play', playerId: 'p0', cardIds: [id] }, T0).state;
    expect(s.phase.kind).toBe('hiss');
    s = reduce(s, { type: 'timeout' }, s.deadline).state;
    expect(s.turn).toBe(1);
    expect(s.deck.length).toBe(deck);
  });

  it('one Hiss cancels, a second Hiss un-cancels', () => {
    let { state: s } = createGame(players(3), 3, T0);
    s.turn = 0;
    const id = give(s, 'p0', 'catnap');
    give(s, 'p1', 'hiss');
    give(s, 'p0', 'hiss');
    s = reduce(s, { type: 'play', playerId: 'p0', cardIds: [id] }, T0).state;
    s = reduce(s, { type: 'hiss', playerId: 'p1' }, T0 + 100).state;
    expect(() => reduce(s, { type: 'hiss', playerId: 'p1' }, T0 + 200)).toThrow();
    let r = reduce(s, { type: 'timeout' }, s.deadline);
    expect(r.events[0]).toMatchObject({ kind: 'resolved', canceled: true });
    expect(r.state.turn).toBe(0);
    s = reduce(s, { type: 'hiss', playerId: 'p0' }, T0 + 300).state;
    r = reduce(s, { type: 'timeout' }, s.deadline);
    expect(r.events[0]).toMatchObject({ kind: 'resolved', canceled: false });
    expect(r.state.turn).toBe(1);
  });

  it('Pounce stacks: 2 turns, then 4 when passed on', () => {
    let { state: s } = createGame(players(3), 3, T0);
    s.turn = 0;
    const a = give(s, 'p0', 'pounce');
    const b = give(s, 'p1', 'pounce');
    s = reduce(s, { type: 'play', playerId: 'p0', cardIds: [a] }, T0).state;
    s = reduce(s, { type: 'timeout' }, s.deadline).state;
    expect([s.turn, s.pending]).toEqual([1, 2]);
    s = reduce(s, { type: 'play', playerId: 'p1', cardIds: [b] }, T0).state;
    s = reduce(s, { type: 'timeout' }, s.deadline).state;
    expect([s.turn, s.pending]).toEqual([2, 4]);
  });

  it('Bribe makes the target pick a card to give', () => {
    let { state: s } = createGame(players(3), 3, T0);
    s.turn = 0;
    const id = give(s, 'p0', 'bribe');
    s = reduce(s, { type: 'play', playerId: 'p0', cardIds: [id], target: 'p2' }, T0).state;
    s = reduce(s, { type: 'timeout' }, s.deadline).state;
    expect(s.phase).toEqual({ kind: 'give', from: 'p2', to: 'p0' });
    const card = s.players[2].hand[0];
    const r = reduce(s, { type: 'give', playerId: 'p2', cardId: card.id }, T0);
    expect(r.state.players[0].hand.some((c) => c.id === card.id)).toBe(true);
    expect(r.state.phase.kind).toBe('turn');
  });

  it('a pair steals a random card', () => {
    let { state: s } = createGame(players(2), 3, T0);
    s.turn = 0;
    const a = give(s, 'p0', 'toast');
    const b = give(s, 'p0', 'toast');
    const n1 = s.players[1].hand.length;
    s = reduce(s, { type: 'play', playerId: 'p0', cardIds: [a, b], target: 'p1' }, T0).state;
    s = reduce(s, { type: 'timeout' }, s.deadline).state;
    expect(s.players[1].hand.length).toBe(n1 - 1);
  });

  it('Snip and Hiss cannot be played on your turn', () => {
    const { state: s } = createGame(players(2), 3, T0);
    s.turn = 0;
    const snip = s.players[0].hand.find((c) => c.type === 'snip')!;
    expect(() => reduce(s, { type: 'play', playerId: 'p0', cardIds: [snip.id] }, T0)).toThrow();
  });
});

describe('hidden information', () => {
  it('a view shows only your own hand and never the deck order', () => {
    const { state: s } = createGame(players(4), 21, T0);
    const v = viewFor(s, 'p1');
    expect(v.hand).toEqual(s.players[1].hand);
    expect(JSON.stringify(v)).not.toContain(s.players[2].hand[0].id);
    expect(v).not.toHaveProperty('deck');
    expect(v.deckCount).toBe(s.deck.length);
  });

  it('other players do not see what you drew, peeked or where you hid the Fuse Cat', () => {
    expect(eventFor({ kind: 'drew', player: 'p0', card: { id: 'c1', type: 'snip' } }, 'p1')).toEqual({ kind: 'drew', player: 'p0' });
    expect(eventFor({ kind: 'peeked', player: 'p0', top: ['fuse'] }, 'p1')).toEqual({ kind: 'peeked', player: 'p0' });
    expect(eventFor({ kind: 'inserted', player: 'p0', cardId: 'c9', position: 0 }, 'p1')).toMatchObject({ position: undefined });
    expect(eventFor({ kind: 'inserted', player: 'p0', cardId: 'c9', position: 0 }, 'p0')).toMatchObject({ position: 0 });
  });
});

describe('bot simulation', () => {
  it('plays 300 full games between bots without breaking a rule', () => {
    let seed = 1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const lengths: number[] = [];
    for (let g = 0; g < 300; g++) {
      const n = 2 + (g % 4);
      let now = T0;
      let { state: s } = createGame(players(n, true), g + 1, now);
      const initial = totalCards(s, 0);
      let exploded = 0;
      let steps = 0;
      while (s.phase.kind !== 'over') {
        if (++steps > 5000) throw new Error('game did not end');
        now += 500;
        let action: Action | null = null;
        if (s.phase.kind === 'hiss') {
          const hisser = s.players.find((p) => botWantsHiss(s, p.id, rand));
          action = hisser ? { type: 'hiss', playerId: hisser.id } : { type: 'timeout' };
        } else {
          for (const p of s.players) {
            action = botAction(s, p.id, rand);
            if (action) break;
          }
        }
        if (!action) {
          now = s.deadline;
          action = { type: 'timeout' };
        }
        if (action.type === 'timeout') now = Math.max(now, s.deadline);
        const r = reduce(s, action, now);
        exploded += r.events.filter((e) => e.kind === 'exploded').length;
        s = r.state;
        expect(totalCards(s, exploded)).toBe(initial);
      }
      expect(s.players.filter((p) => p.alive)).toHaveLength(1);
      expect(exploded).toBe(n - 1);
      lengths.push(steps);
    }
    expect(Math.max(...lengths)).toBeLessThan(5000);
  });
});
