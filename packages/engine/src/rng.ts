/** mulberry32: small, fast, seedable. The state is a single uint32 kept in GameState so games replay deterministically. */
export function next(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function int(state: { rng: number }, maxExclusive: number): number {
  return Math.floor(next(state) * maxExclusive);
}

export function shuffle<T>(state: { rng: number }, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(state, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick<T>(state: { rng: number }, arr: readonly T[]): T {
  return arr[int(state, arr.length)];
}
