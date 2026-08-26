/**
 * Seeded PRNG shared by the analytics tooling, so runs are reproducible.
 *
 * The first few outputs after seeding correlate with the seed, which matters
 * whenever many streams are created from structured seeds: the opening draw of
 * every stream then tracks whatever the seed was derived from. In the
 * simulator that put an arm-correlated bias into the first value each user
 * drew. Discarding a short warm-up removes it.
 */
export function seeded(seed: number, warmUp = 8): () => number {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < warmUp; i += 1) next();
  return next;
}
