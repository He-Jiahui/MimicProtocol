// Seeded random streams. The simulation never calls Math.random (doc 13, section 4).

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  // Derive an independent named stream.
  fork(name) {
    return new Rng((this.s ^ hashStr(String(name))) + 0x6d2b79f5);
  }
  float() {
    // mulberry32
    let t = (this.s += 0x6d2b79f5) >>> 0;
    this.s = t;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.float(); }
  int(n) { return Math.floor(this.float() * n); }
  irange(a, b) { return a + Math.floor(this.float() * (b - a + 1)); }
  chance(p) { return this.float() < p; }
  pick(arr) { return arr[Math.floor(this.float() * arr.length)]; }
  // Weighted pick: weights is an array of numbers, returns the index.
  weighted(weights) {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
