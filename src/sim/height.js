// Height on the 1 m grid (doc 64 Package 8, doc 29): one floor per cell in 0.25 m units,
// from -8 m to +12 m. The World keeps the maps (floor, drop, hmark) and the movement and
// sight rules; this module authors them: terraces, stairs, ramps, pits, parapets and the
// one-way drop cells. Pure data, like the generator.

export const FLOOR_UNIT = 0.25;          // metres per floor unit
export const STEP = 2;                   // units: 0.5 m, the most a body steps up or down
export const FLOOR_MIN = -32, FLOOR_MAX = 48;
// Falls (start): 15% of maximum health up to 4 m, 40% up to 8 m, lethal beyond.
export const FALL_HURT = 4, FALL_SERIOUS = 8, FALL_SHARE = [0.15, 0.4];
export const EYE = 1.3;                  // eye height for sight lines given no heights of their own
// Height marks on a cell: part of a stair, a ramp, or a parapet over a tall edge.
export const HMARK = { STAIR: 1, RAMP: 2, PARAPET: 3 };

const marks = (w) => w.hmark || (w.hmark = new Uint8Array(w.size * w.size));

// A level platform (or a pit, below 0) over a rectangle.
export function level(w, x0, z0, x1, z1, y) { w.setFloor(x0, z0, x1, z1, y); }

// A stair (0.5 m a cell) or a ramp (0.25 m a cell) over a rectangle, walked in direction
// dir ('x+', 'x-', 'z+', 'z-') from ground at yStart to ground at yEnd. The rectangle must
// hold exactly the rows the rise needs; the last row stands at yEnd, so it meets that level
// flush and the first row is one step above (or below) yStart.
export function slope(w, x0, z0, x1, z1, dir, yStart, yEnd, kind = 'stair') {
  const per = kind === 'ramp' ? 1 : STEP, along = dir[0], fwd = dir[1] === '+' ? 1 : -1;
  const lo = along === 'x' ? x0 : z0, hi = along === 'x' ? x1 : z1, n = hi - lo;
  const rise = Math.round((yEnd - yStart) / FLOOR_UNIT);
  if (Math.abs(rise) > per * n) throw new Error(`a ${kind} of ${n} cells cannot rise ${yEnd - yStart} m`);
  const M = marks(w);
  for (let k = 0; k < n; k++) {
    const row = fwd > 0 ? lo + k : hi - 1 - k;
    const y = (Math.round(yStart / FLOOR_UNIT) + Math.round(rise * (k + 1) / n)) * FLOOR_UNIT;
    if (along === 'x') { w.setFloor(row, z0, row + 1, z1, y); for (let z = z0; z < z1; z++) M[z * w.size + row] = kind === 'ramp' ? HMARK.RAMP : HMARK.STAIR; }
    else { w.setFloor(x0, row, x1, row + 1, y); for (let x = x0; x < x1; x++) M[row * w.size + x] = kind === 'ramp' ? HMARK.RAMP : HMARK.STAIR; }
  }
}

// An authored one-way drop: the sill cells a body may step off from above.
export function dropCells(w, x0, z0, x1, z1) { w.setDrop(x0, z0, x1, z1, 1); }

// Parapets: every free cell inside the rectangle that is the top of a tall edge to a free
// neighbour gets a low obstacle (grid 2, stops feet but not shots), except stairs, ramps
// and drop cells. Returns how many were placed.
export function parapets(w, x0, z0, x1, z1) {
  const S = w.size, G = w.grid, F = w.floor, D = w.drop, M = marks(w);
  x0 = Math.max(0, Math.floor(x0)); z0 = Math.max(0, Math.floor(z0)); x1 = Math.min(S, Math.ceil(x1)); z1 = Math.min(S, Math.ceil(z1));
  const out = [];
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const i = z * S + x;
      if (G[i] !== 0 || D[i] || M[i] === HMARK.STAIR || M[i] === HMARK.RAMP) continue;
      const edge = (j) => G[j] === 0 && F[i] - F[j] > STEP;
      if ((x > 0 && edge(i - 1)) || (x < S - 1 && edge(i + 1)) || (z > 0 && edge(i - S)) || (z < S - 1 && edge(i + S))) out.push(i);
    }
  }
  for (const i of out) { G[i] = 2; M[i] = HMARK.PARAPET; }
  return out.length;
}

// The yard used by the height tests and the ?heighttest switch: a +4 m terrace with an
// 8-cell stair on its south side, a parapet round its edges, and a drop cell in the middle
// of its east edge; a +8 m deck on its north-west quarter reached by its own stair, with a
// drop off its west side onto the street (an 8 m fall); a 12 m post west of the terrace whose
// only way down is a drop. And a sunken pit 2 m down with a stair, east of the terrace.
// (x, z) is the terrace's north-west corner; the yard spans x - 7 to x + 32, z to z + 24.
export function heightYard(w, x, z) {
  // Terrace +4: 16 x 16, its stair walked north from the street below its south edge.
  level(w, x, z, x + 16, z + 16, 4);
  slope(w, x + 6, z + 16, x + 9, z + 24, 'z-', 0, 4);
  // Deck +8 on the terrace's north-west quarter, its stair on the terrace walked west.
  level(w, x, z, x + 7, z + 7, 8);
  slope(w, x + 7, z + 2, x + 15, z + 5, 'x-', 4, 8);
  // A 12 m post west of the terrace, a drop cell on its east edge its only way down.
  level(w, x - 7, z + 4, x - 3, z + 8, 12);
  dropCells(w, x - 4, z + 5, x - 3, z + 6);
  // Drops: off the terrace's east edge (4 m) and off the deck's west edge (8 m).
  dropCells(w, x + 15, z + 10, x + 16, z + 11);
  dropCells(w, x, z + 4, x + 1, z + 5);
  // Pit -2: 10 x 10 east of the terrace, a 4-cell stair down its north side walked south.
  level(w, x + 22, z + 4, x + 32, z + 14, -2);
  slope(w, x + 25, z, x + 28, z + 4, 'z+', 0, -2);
  return { terrace: { x0: x, z0: z, x1: x + 16, z1: z + 16, y: 4 }, deck: { x0: x, z0: z, x1: x + 7, z1: z + 7, y: 8 }, post: { x: x - 3.5, z: z + 5.5 },
    stair: { x: x + 7.5, z0: z + 16, z1: z + 24 }, deckStair: { x0: x + 7, x1: x + 15, z: z + 3.5 }, drop: { x: x + 15.5, z: z + 10.5 }, deckDrop: { x: x + 0.5, z: z + 4.5 },
    pit: { x0: x + 22, z0: z + 4, x1: x + 32, z1: z + 14, y: -2 }, pitStair: { x: x + 26.5, z0: z, z1: z + 4 } };
}
// Parapets for the yard once it is laid (separate, so a test can lay floors without them).
export function heightYardEdges(w, x, z) { return parapets(w, x - 8, z - 1, x + 34, z + 26); }
