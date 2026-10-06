export const ACTION_CARDS = ['pounce', 'catnap', 'bribe', 'scramble', 'peek'] as const;
export const ALLEY_CARDS = ['toast', 'disco', 'potato', 'wizard', 'ninja'] as const;

export type ActionCard = (typeof ACTION_CARDS)[number];
export type AlleyCard = (typeof ALLEY_CARDS)[number];
export type CardType = 'fuse' | 'snip' | 'hiss' | ActionCard | AlleyCard;

export interface Card {
  id: string;
  type: CardType;
}

export interface PlayerState {
  id: string;
  name: string;
  hand: Card[];
  alive: boolean;
  isBot: boolean;
}

/** A card (or pair) on its way to resolving, waiting out the Hiss window. */
export interface PendingPlay {
  actor: string;
  type: CardType;
  kind: 'action' | 'pair';
  cardIds: string[];
  target?: string;
  /** Who hissed, in order. An odd count cancels the play. */
  hissers: string[];
}

export type Phase =
  | { kind: 'turn' }
  | { kind: 'hiss'; play: PendingPlay }
  | { kind: 'defuse'; player: string; card: Card }
  | { kind: 'placeFuse'; player: string; card: Card }
  | { kind: 'give'; from: string; to: string }
  | { kind: 'over'; winner: string };

export interface Timings {
  /** Reaction window after each action card. */
  hiss: number;
  /** Time to play a Snip after drawing a Fuse Cat. */
  defuse: number;
  /** Countdown before exploding when the player has no Snip. */
  noSnip: number;
  /** Time to choose where to hide the Fuse Cat. */
  place: number;
  /** Time for a bribed player to pick a card. */
  give: number;
  /** Whole-turn timer; the player auto-draws when it runs out. */
  turn: number;
}

export const DEFAULT_TIMINGS: Timings = {
  hiss: 3000,
  defuse: 6000,
  noSnip: 2500,
  place: 12000,
  give: 15000,
  turn: 45000,
};

export interface GameState {
  players: PlayerState[];
  /** Draw pile as types only, last element is the top. Ids are assigned when a card leaves the deck. */
  deck: CardType[];
  discard: Card[];
  /** Index into players of whose turn it is. */
  turn: number;
  /** Turns the current player still owes (Pounce stacks this). */
  pending: number;
  phase: Phase;
  /** Absolute ms timestamp when the current phase times out. */
  deadline: number;
  /** The current turn's own timeout, restored after an action resolves. */
  turnDeadline: number;
  timings: Timings;
  nextId: number;
  rng: number;
  /** What each player saw with Peek, top first. Cleared when the deck is shuffled or a card is hidden in it. */
  knownTop: Record<string, CardType[]>;
  /** Action cards played this turn by the current player (bots use it to pace themselves). */
  playsThisTurn: number;
}

export type Action =
  | { type: 'play'; playerId: string; cardIds: string[]; target?: string }
  | { type: 'draw'; playerId: string }
  | { type: 'hiss'; playerId: string; cardId?: string }
  | { type: 'defuse'; playerId: string }
  | { type: 'explode'; playerId: string }
  /** position counted from the top: 0 = next card drawn */
  | { type: 'place'; playerId: string; position: number }
  | { type: 'give'; playerId: string; cardId: string }
  | { type: 'timeout' };

export type GameEvent =
  | { kind: 'dealt'; players: string[]; fuses: number }
  | { kind: 'turn'; player: string; pending: number }
  | { kind: 'played'; actor: string; type: CardType; cards: Card[]; target?: string }
  | { kind: 'hissed'; player: string; card: Card }
  | { kind: 'resolved'; actor: string; type: CardType; canceled: boolean }
  | { kind: 'drew'; player: string; card?: Card }
  | { kind: 'fuseDrawn'; player: string; card: Card }
  | { kind: 'defused'; player: string; card: Card }
  | { kind: 'inserted'; player: string; cardId: string; position?: number }
  | { kind: 'exploded'; player: string; cardId: string }
  | { kind: 'shuffled'; player: string }
  | { kind: 'peeked'; player: string; top?: CardType[] }
  | { kind: 'gave'; from: string; to: string; cardId: string; card?: Card; stolen: boolean }
  | { kind: 'win'; player: string };

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}

export class RuleError extends Error {}
