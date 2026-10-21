/** Small, seedable random helpers so game logic is deterministic under test. */

export function createRng(seed = Date.now()) {
  let t = seed >>> 0;
  return function mulberry32() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng, maxExclusive) {
  return Math.floor(rng() * maxExclusive);
}

export function shuffle(items, rng) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pick(items, rng) {
  return items[randomInt(rng, items.length)];
}

/** Stable daily seed from a YYYY-MM-DD string. */
export function seedFromString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
