// Height on the 1 m grid (doc 64 Package 8, doc 29): one floor per cell in 0.25 m units,
// from -8 m to +12 m. The World keeps the maps (floor, drop, hmark) and the movement and
// sight rules; this module authors them: terraces, stairs, ramps, pits, parapets and the
// one-way drop cells, and emits their static geometry. Pure data, like the generator.

import { MAT, SUB, SURF, NO_CUT, box, boxMM, light } from './emit.js';

export const FLOOR_UNIT = 0.25;          // metres per floor unit
export const STEP = 2;                   // units: 0.5 m, the most a body steps up or down
export const FLOOR_MIN = -32, FLOOR_MAX = 48;
// Falls (start): 15% of maximum health up to 4 m, 40% up to 8 m, lethal beyond.
export const FALL_HURT = 4, FALL_SERIOUS = 8, FALL_SHARE = [0.15, 0.4];
export const EYE = 1.3;                  // eye height for sight lines given no heights of their own
// Height marks on a cell: part of a stair, a ramp, a parapet over a tall edge, or a deck (a
// bridge over the canal: the water runs on under it, so its sides are not walls).
export const HMARK = { STAIR: 1, RAMP: 2, PARAPET: 3, DECK: 4 };

export const marks = (w) => w.hmark || (w.hmark = new Uint8Array(w.size * w.size));

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

// The ?heighttest switch: a compact yard of the same pieces beside the Shelter, to look at
// height before any scene uses it. 28 x 24 m from its north-west corner (x, z): the +4 m
// terrace with its stair and an east drop, the +8 m deck with its stair and a west drop, and
// a pit 2 m down with its stair, all on plaza paving and lit.
export function heightTestYard(w, x, z) {
  w.paint(x - 2, z - 2, x + 30, z + 26, SURF.PLAZA);
  level(w, x, z, x + 16, z + 16, 4);
  slope(w, x + 6, z + 16, x + 9, z + 24, 'z-', 0, 4);
  level(w, x, z, x + 7, z + 7, 8);
  slope(w, x + 7, z + 2, x + 15, z + 5, 'x-', 4, 8);
  dropCells(w, x + 15, z + 10, x + 16, z + 11);
  dropCells(w, x, z + 4, x + 1, z + 5);
  level(w, x + 18, z + 6, x + 28, z + 16, -2);
  slope(w, x + 21, z + 2, x + 24, z + 6, 'z+', 0, -2);
  parapets(w, x - 1, z - 1, x + 30, z + 26);
  light(w, x + 11, 7.5, z + 11, [0.7, 0.85, 1.0], 22, 1.8);
  light(w, x + 3.5, 11, z + 3.5, [1.0, 0.75, 0.45], 14, 1.6);
  light(w, x + 23, 1.2, z + 11, [1.0, 0.7, 0.4], 16, 1.8);
  return { x, z };
}

// ---------------------------------------------------------------- geometry
// Static instances for the height the floor map holds, emitted once at finalize (doc 64
// Package 8). The ground pass draws a plane per level (w.planes: the paving look, wet and
// sheltered like the street); these give the levels their volume and their edges:
// - raised ground: slabs from 0 to just under the level's plane, merged into rectangles;
// - stairs and ramps: a block per tread row up to its exact height;
// - sunken ground: a wall on every edge where the floor steps down below 0;
// - parapets and railings on the tops of tall edges, each with a lit nosing, because the
//   tactical camera looks north and sees only the faces turned south;
// - an amber sill on each drop cell, and a handrail on the open side of a stair.
// Instances are cut at the 100 m block lines, like everything else the generator emits.
const LIFT = 0.03;                        // a slab top sits this far under its level's plane
// The ground is never cut away round the operator: a terrace near them stays a terrace.
const GP = MAT.PLAIN + NO_CUT, GE = MAT.EMISSIVE + NO_CUT;
const WALL = [0.15, 0.148, 0.142], TREAD = [0.2, 0.195, 0.185], PARAPET = [0.19, 0.19, 0.2], RAIL = [0.2, 0.21, 0.23];
const NOSE = [0.55, 0.82, 1.0], SILL = [1.0, 0.52, 0.12], STEP_LIGHT = [0.95, 0.86, 0.68];

// Greedy rectangles of cells sharing a key inside [x0, x1) x [z0, z1); key null skips a cell.
function rects(S, x0, z0, x1, z1, key) {
  const W = x1 - x0, seen = new Uint8Array(W * (z1 - z0)), out = [];
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      if (seen[(z - z0) * W + x - x0]) continue;
      const k = key(z * S + x);
      if (k === null) { seen[(z - z0) * W + x - x0] = 1; continue; }
      let xe = x + 1;
      while (xe < x1 && !seen[(z - z0) * W + xe - x0] && key(z * S + xe) === k) xe++;
      let ze = z + 1;
      grow: while (ze < z1) { for (let xx = x; xx < xe; xx++) if (seen[(ze - z0) * W + xx - x0] || key(ze * S + xx) !== k) break grow; ze++; }
      for (let zz = z; zz < ze; zz++) seen.fill(1, (zz - z0) * W + x - x0, (zz - z0) * W + xe - x0);
      out.push({ x0: x, z0: z, x1: xe, z1: ze, k });
    }
  }
  return out;
}

export function emitHeight(w) {
  w.planes = [];
  if (!w.hasHeight) return;
  const S = w.size, F = w.floor, M = marks(w), B = 100, n = w.n, U = FLOOR_UNIT;
  const slopeCell = (i) => M[i] === HMARK.STAIR || M[i] === HMARK.RAMP;
  // Blocks that hold any height at all, so the scans below skip flat ones.
  const busy = new Uint8Array(n * n);
  for (let i = 0; i < S * S; i++) if (F[i]) busy[Math.min(n - 1, (((i / S) | 0) / B) | 0) * n + Math.min(n - 1, ((i % S) / B) | 0)] = 1;
  for (let bz = 0; bz < n; bz++) {
    for (let bx = 0; bx < n; bx++) {
      // An edge on a block line belongs to the cell on either side, so look beside busy blocks too.
      let near = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const zz = bz + dz, xx = bx + dx; if (zz >= 0 && xx >= 0 && zz < n && xx < n && busy[zz * n + xx]) near = true; }
      if (near) emitBlock(w, bx * B, bz * B, Math.min(S, bx * B + B), Math.min(S, bz * B + B));
    }
  }
  // Ground planes: one per level per block, bounding the cells of that level (not stairs).
  const planes = new Map();
  for (let i = 0; i < S * S; i++) {
    const u = F[i];
    if (!u || slopeCell(i)) continue;
    const x = i % S, z = (i / S) | 0, key = u * 1000 + Math.min(n - 1, (z / B) | 0) * n + Math.min(n - 1, (x / B) | 0);
    let p = planes.get(key);
    if (!p) planes.set(key, p = { y: u * U, x0: x, z0: z, x1: x + 1, z1: z + 1, deck: false, cells: 0 });
    p.x0 = Math.min(p.x0, x); p.z0 = Math.min(p.z0, z); p.x1 = Math.max(p.x1, x + 1); p.z1 = Math.max(p.z1, z + 1); p.cells++;
    // A water plane runs on under the bridge decks inside its bounds.
    if (w.surface[i] === SURF.WATER) p.deck = true;
  }
  w.planes = [...planes.values()].sort((a, b) => a.y - b.y || a.z0 - b.z0 || a.x0 - b.x0);
}

function emitBlock(w, x0, z0, x1, z1) {
  const S = w.size, F = w.floor, G = w.grid, D = w.drop, M = w.hmark, U = FLOOR_UNIT;
  const slopeCell = (i) => M[i] === HMARK.STAIR || M[i] === HMARK.RAMP;
  // Raised ground: a slab per rectangle of one level.
  for (const r of rects(S, x0, z0, x1, z1, (i) => (F[i] > 0 && M[i] !== HMARK.DECK && !slopeCell(i) ? F[i] : null))) {
    boxMM(w, r.x0, r.z0, r.x1, r.z1, 0, r.k * U - LIFT, GP, WALL, 0, SUB.QUAY);
  }
  // Stairs and ramps: tread rows to their exact height, from the lowest ground beside them.
  for (const r of rects(S, x0, z0, x1, z1, (i) => (slopeCell(i) && F[i] ? F[i] * 4 + M[i] : null))) {
    const kind = ((r.k % 4) + 4) % 4, u = (r.k - kind) / 4, top = u * U;
    let lo = Math.min(0, top - 0.5);
    for (let z = r.z0 - 1; z <= r.z1; z++) for (let x = r.x0 - 1; x <= r.x1; x++) {
      if (x < 0 || z < 0 || x >= S || z >= S || (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1)) continue;
      if ((x >= r.x0 && x < r.x1) || (z >= r.z0 && z < r.z1)) lo = Math.min(lo, F[z * S + x] * U);
    }
    lo = Math.max(lo, top - 4);
    boxMM(w, r.x0, r.z0, r.x1, r.z1, lo, top, GP, TREAD, 0, kind === HMARK.RAMP ? SUB.APRON : SUB.QUAY);
    // A lit nosing along the edge of a stair tread toward the step below it.
    if (kind === HMARK.RAMP) continue;
    const below = (j) => F[j] < u && F[j] >= u - STEP && G[j] === 0;
    const mz = ((r.z0 + r.z1) / 2) | 0, mx = ((r.x0 + r.x1) / 2) | 0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (r.z0 > 0 && below((r.z0 - 1) * S + mx)) box(w, cx, top + 0.01, r.z0 + 0.06, r.x1 - r.x0 - 0.2, 0.03, 0.06, GE, STEP_LIGHT, 1.3);
    if (r.z1 < S && below(r.z1 * S + mx)) box(w, cx, top + 0.01, r.z1 - 0.06, r.x1 - r.x0 - 0.2, 0.03, 0.06, GE, STEP_LIGHT, 1.3);
    if (r.x0 > 0 && below(mz * S + r.x0 - 1)) box(w, r.x0 + 0.06, top + 0.01, cz, 0.06, 0.03, r.z1 - r.z0 - 0.2, GE, STEP_LIGHT, 1.3);
    if (r.x1 < S && below(mz * S + r.x1)) box(w, r.x1 - 0.06, top + 0.01, cz, 0.06, 0.03, r.z1 - r.z0 - 0.2, GE, STEP_LIGHT, 1.3);
  }
  // Edges, one direction at a time: (dx, dz) points from cell A to its neighbour B.
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const horiz = dz !== 0;   // the edge runs along x
    const len = horiz ? x1 - x0 : z1 - z0, rows = horiz ? z1 - z0 : x1 - x0;
    for (let r = 0; r < rows; r++) {
      let run = null;
      for (let t = 0; t <= len; t++) {
        let key = null, ctx = null;
        if (t < len) {
          const ax = horiz ? x0 + t : x0 + r, az = horiz ? z0 + r : z0 + t, bx = ax + dx, bz = az + dz;
          if (bx >= 0 && bz >= 0 && bx < S && bz < S) {
            const a = az * S + ax, b = bz * S + bx, fa = F[a], fb = F[b];
            ctx = { ax, az, fa, fb };
            // A sunken edge: the wall stands in B, from A's floor up to B's (or the street).
            if (fa < fb && fa < 0 && M[b] !== HMARK.DECK) key = `w${fa},${Math.min(fb, 0)},${fb > 0 ? 2 : slopeCell(b) ? 1 : 0}`;
            // The top of a tall edge, seen from A, the higher side.
            else if (fa - fb > STEP && G[b] === 0) key = M[a] === HMARK.PARAPET ? `p${fa}` : D[a] ? `d${fa}` : slopeCell(a) ? `s${fa}` : G[a] === 0 ? `n${fa}` : null;
          }
        }
        if (run && key === run.key) { run.t1 = t + 1; continue; }
        if (run) emitEdge(w, run, horiz, dx, dz);
        run = key ? { key, t0: t, t1: t + 1, x0, z0, ...ctx } : null;
      }
    }
  }
}

// One merged run of edge cells along a block row: cells t0..t1 of it, A on the near side.
function emitEdge(w, run, horiz, dx, dz) {
  const U = FLOOR_UNIT, k = run.key[0], fa = run.fa * U;
  // The line between A and B, and the span along it.
  const a0 = (horiz ? run.x0 : run.z0) + run.t0, a1 = (horiz ? run.x0 : run.z0) + run.t1;
  const line = horiz ? run.az + (dz > 0 ? 1 : 0) : run.ax + (dx > 0 ? 1 : 0), out = dz + dx;
  // A strip of depth d on the B side (s = 1) or the A side (s = -1) of the line, from y0 to y1.
  const strip = (d, s, y0, y1, mat, col, emis = 0, p0 = 0, p1 = 0) => {
    const o = s * out > 0 ? [line, line + d] : [line - d, line];
    if (horiz) boxMM(w, a0, o[0], a1, o[1], y0, y1, mat, col, emis, p0, p1);
    else boxMM(w, o[0], a0, o[1], a1, y0, y1, mat, col, emis, p0, p1);
  };
  if (k === 'w') {
    const [lo, hi, kind] = run.key.slice(1).split(',').map(Number);
    // B carries a plane at its own floor (the street's at 0), so the wall stops just under
    // it; a stair tread or a raised slab (from 0 up) meets it exactly.
    const top = hi * U - (kind ? 0 : LIFT);
    strip(0.25, 1, lo * U, top, GP, WALL, 0, SUB.QUAY);
    return;
  }
  if (k === 'p') {
    // Above the street, a railing over sunken ground; on a terrace, a solid parapet. Both get
    // a lit nosing along their top so the edge reads from above.
    if (fa <= 0) {
      strip(0.06, -1, fa, fa + 1.05, GP, RAIL, 0, SUB.BARS, 0);
      strip(0.09, -1, fa + 1.0, fa + 1.09, GP, RAIL, 0, SUB.METAL);
      strip(0.08, -1, fa + 0.005, fa + 0.04, GE, NOSE, 1.8);
    } else {
      strip(0.26, -1, fa - 0.02, fa + 0.95, GP, PARAPET, 0, 1);
      strip(0.12, -1, fa + 0.95, fa + 0.99, GE, NOSE, 2.0);
    }
    return;
  }
  if (k === 'd') {
    // The sill of a drop: an amber hazard edge, no rail.
    strip(0.16, -1, fa + 0.005, fa + 0.05, GE, SILL, 3.2);
    strip(0.3, -1, fa + 0.005, fa + 0.02, GP, [0.6, 0.45, 0.05], 0, SUB.HAZARD);
    return;
  }
  if (k === 's') {
    // The open side of a stair: a handrail at hand height over each tread, and a nosing.
    strip(0.05, -1, fa + 0.9, fa + 0.96, GP, RAIL, 0, SUB.METAL);
    strip(0.05, -1, fa, fa + 0.9, GP, RAIL, 0, SUB.BARS, 0);
    strip(0.06, -1, fa + 0.005, fa + 0.035, GE, NOSE, 1.4);
    return;
  }
  // A bare tall edge (no parapet was laid): the nosing alone.
  strip(0.1, -1, fa + 0.005, fa + 0.04, GE, NOSE, 1.8);
}
