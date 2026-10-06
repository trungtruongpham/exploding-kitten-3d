import { currentPlayer, isAlley } from './game';
import { ALLEY_CARDS, type Action, type CardType, type GameState } from './types';

type Rand = () => number;

/** Should this bot hiss the pending play? Decided once per Hiss window. */
export function botWantsHiss(s: GameState, botId: string, rand: Rand): boolean {
  const ph = s.phase;
  if (ph.kind !== 'hiss') return false;
  const bot = s.players.find((p) => p.id === botId);
  if (!bot || !bot.alive || !bot.isBot || !bot.hand.some((c) => c.type === 'hiss')) return false;
  const last = ph.play.hissers[ph.play.hissers.length - 1] ?? ph.play.actor;
  if (last === botId) return false;
  let chance = 0.18;
  const nextIdx = (() => {
    const a = s.players.findIndex((p) => p.id === ph.play.actor);
    for (let k = 1; k <= s.players.length; k++) {
      const j = (a + k) % s.players.length;
      if (s.players[j].alive) return j;
    }
    return a;
  })();
  if (ph.play.target === botId) chance = 0.6;
  else if (ph.play.type === 'pounce' && s.players[nextIdx].id === botId) chance = 0.55;
  // someone hissed a play this bot made: fight back
  if (ph.play.actor === botId && ph.play.hissers.length % 2 === 1) chance = 0.7;
  return rand() < chance;
}

/** The bot's move for the current phase, or null if it has nothing to do. */
export function botAction(s: GameState, botId: string, rand: Rand): Action | null {
  const bot = s.players.find((p) => p.id === botId);
  if (!bot || !bot.alive) return null;
  const ph = s.phase;
  const pickOne = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

  if (ph.kind === 'defuse' && ph.player === botId) {
    return bot.hand.some((c) => c.type === 'snip') ? { type: 'defuse', playerId: botId } : { type: 'explode', playerId: botId };
  }
  if (ph.kind === 'placeFuse' && ph.player === botId) {
    // a little mean: often right near the top for the next player
    const pos = rand() < 0.5 ? Math.floor(rand() * Math.min(3, s.deck.length + 1)) : Math.floor(rand() * (s.deck.length + 1));
    return { type: 'place', playerId: botId, position: pos };
  }
  if (ph.kind === 'give' && ph.from === botId) {
    const cheap = bot.hand.filter((c) => isAlley(c.type));
    const notSnip = bot.hand.filter((c) => c.type !== 'snip');
    const card = pickOne(cheap.length ? cheap : notSnip.length ? notSnip : bot.hand);
    return card ? { type: 'give', playerId: botId, cardId: card.id } : null;
  }
  if (ph.kind !== 'turn' || currentPlayer(s).id !== botId) return null;

  const others = s.players.filter((p) => p.alive && p.id !== botId && p.hand.length > 0);
  const has = (t: CardType) => bot.hand.find((c) => c.type === t);
  const top = s.knownTop[botId];
  if (top && top[0] === 'fuse') {
    for (const t of ['catnap', 'pounce', 'scramble'] as const) {
      const c = has(t);
      if (c) return { type: 'play', playerId: botId, cardIds: [c.id] };
    }
  }
  if (s.playsThisTurn === 0) {
    const roll = rand();
    if (roll < 0.35) {
      const acts = bot.hand.filter((c) => ['pounce', 'catnap', 'scramble', 'peek'].includes(c.type) || (c.type === 'bribe' && others.length));
      // a bot that already knows the top is safe doesn't waste a Peek
      const usable = acts.filter((c) => !(c.type === 'peek' && (top?.length || s.deck.length < 2)));
      if (usable.length) {
        const c = pickOne(usable);
        return { type: 'play', playerId: botId, cardIds: [c.id], target: c.type === 'bribe' ? pickOne(others).id : undefined };
      }
    } else if (roll < 0.6 && others.length) {
      for (const a of ALLEY_CARDS) {
        const pair = bot.hand.filter((c) => c.type === a);
        if (pair.length >= 2) return { type: 'play', playerId: botId, cardIds: [pair[0].id, pair[1].id], target: pickOne(others).id };
      }
    }
  }
  return { type: 'draw', playerId: botId };
}
