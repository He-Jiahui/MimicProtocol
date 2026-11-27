// Set dressing for the city: everything that makes a street read as lived in.
// Shopfront kits, sign columns, wall services, fire escapes, alley clutter, kerbs and
// railings, quay and rail furniture, landmark dressing and mimic growth in the deep zones.
// Pure data, like the generator: it only writes instances, lights and grid cells.

import { MAT, SHAPE, SURF, STYLE, SUB, prim, primR, box, cyl, ball, light } from './emit.js';
import { NEON } from './data.js';

const { BOX, SPHERE, CYL, CONE, WEDGE } = SHAPE;
const P = MAT.PLAIN, HALF = Math.PI / 2;
const DARK = [0.035, 0.035, 0.04], STEEL = [0.16, 0.17, 0.19], PALE = [0.42, 0.43, 0.44], WOOD = [0.22, 0.15, 0.09];
const CONCRETE = [0.2, 0.2, 0.21], RUBBER = [0.02, 0.02, 0.022], FLESH = [0.55, 0.06, 0.32];
const CLOTH = [[0.3, 0.08, 0.08], [0.08, 0.16, 0.26], [0.26, 0.2, 0.08], [0.1, 0.22, 0.14], [0.2, 0.2, 0.2], [0.34, 0.3, 0.26]];
const PAINT = [[0.5, 0.1, 0.1], [0.1, 0.2, 0.4], [0.3, 0.3, 0.3], [0.1, 0.3, 0.15], [0.45, 0.36, 0.08], [0.05, 0.05, 0.06]];
const CRATE = [[0.55, 0.42, 0.06], [0.5, 0.1, 0.08], [0.08, 0.2, 0.42], [0.1, 0.3, 0.16]];
const WARM = [1.0, 0.72, 0.42];

// How busy each district's frontages are.
const DENS = [
  /* Old Town  */ { sign: 0.3, stack: 0.12, awn: 0.38, prop: 0.5, ac: 0.3, cable: 0.9, lantern: 0.3, escape: 0.3, poster: 0.25 },
  /* Neon      */ { sign: 0.45, stack: 0.42, awn: 0.3, prop: 0.46, ac: 0.34, cable: 0.8, lantern: 0.22, escape: 0.35, poster: 0.3 },
  /* Arcology  */ { sign: 0.2, stack: 0.1, awn: 0.06, prop: 0.26, ac: 0.04, cable: 0.1, lantern: 0, escape: 0, poster: 0.08 },
  /* Corporate */ { sign: 0.16, stack: 0.06, awn: 0.08, prop: 0.26, ac: 0.03, cable: 0.06, lantern: 0, escape: 0, poster: 0.06 },
  /* Dockside  */ { sign: 0.14, stack: 0.04, awn: 0.12, prop: 0.5, ac: 0.18, cable: 0.7, lantern: 0.05, escape: 0.25, poster: 0.15 },
];

// One wall of a footprint. Side 0 faces -z, 1 faces +z, 2 faces -x, 3 faces +x.
// t runs along the wall in world units, o is metres out from it.
function frame(s, x0, z0, x1, z1) {
  const horiz = s < 2, out = s === 0 || s === 2 ? -1 : 1;
  const face = s === 0 ? z0 : s === 1 ? z1 : s === 2 ? x0 : x1;
  const yaw = s === 1 ? 0 : s === 0 ? Math.PI : s === 3 ? HALF : -HALF;
  const lo = horiz ? x0 : z0, hi = horiz ? x1 : z1;
  // On sides 0 and 3 the wall's local x axis runs against the world axis, so tilts are mirrored.
  return { horiz, out, face, yaw, lo, hi, flip: s === 0 || s === 3, len: hi - lo, mid: (lo + hi) / 2, P: (t, o) => (horiz ? [t, face + out * o] : [face + out * o, t]) };
}
// A free-standing frame: origin (x, z), local +z pointing along yaw.
export function freeFrame(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { yaw, P: (t, o) => [x + c * t + s * o, z - s * t + c * o] };
}
// Emitter in a frame: sx runs along the wall, sz is depth out from it.
function kit(w, F) {
  return (shape, t, o, y, sx, sy, sz, mat, col, emis = 0, p0 = 0, p1 = 0, p2 = 0, p3 = 0, pitch = 0, roll = 0, turn = 0) => {
    const [x, z] = F.P(t, o);
    const m = F.flip ? -1 : 1;
    primR(w, shape, x, y, z, sx, sy, sz, mat, col, emis, p0, p1, p2, p3, F.yaw + turn * m, pitch, roll * m);
  };
}

const inReserved = (w, x, z, pad = 0) => w.reserved.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2);
const walkable = (s) => s === SURF.WALK || s === SURF.ALLEY || s === SURF.PLAZA || s === SURF.LOT;
// A ground prop may stand at (x, z) if the cell is clear public ground and, when it
// blocks movement, there is still room to walk past on the outside.
function standable(w, F, t, block = true) {
  const [x, z] = F.P(t, 0.5);
  if (w.cell(x, z) !== 0 || !walkable(w.surf(x, z)) || inReserved(w, x, z)) return false;
  if (!block) return true;
  const [x1, z1] = F.P(t, 1.5), [x2, z2] = F.P(t, 2.5);
  return w.cell(x1, z1) === 0 && w.cell(x2, z2) === 0;
}
const occupy = (w, x, z) => w.fillRect(Math.floor(x), Math.floor(z), Math.floor(x) + 1, Math.floor(z) + 1, 2);

// ---------------------------------------------------------------- ground props
// Each prop is built in a wall frame at distance o from the wall, around coordinate t.
const PROPS = {
  planter(w, rng, put, t) {
    put(BOX, t, 0.45, 0.25, 1.5, 0.5, 0.55, P, CONCRETE, 0, SUB.WALL);
    const g = [0.05 + rng.float() * 0.04, 0.14 + rng.float() * 0.08, 0.06];
    for (let k = -1; k <= 1; k++) put(SPHERE, t + k * 0.45, 0.45, 0.62 + rng.float() * 0.14, 0.6, 0.55, 0.55, MAT.FOLIAGE, g, 0, rng.float());
    if (rng.chance(0.4)) put(SPHERE, t + rng.range(-0.4, 0.4), 0.45, 0.95, 0.16, 0.16, 0.16, P, rng.pick([[0.7, 0.2, 0.3], [0.8, 0.7, 0.2], [0.8, 0.8, 0.85]]), 0.25);
  },
  pot(w, rng, put, t) {
    const n = rng.irange(1, 3);
    for (let k = 0; k < n; k++) {
      const tt = t + (k - (n - 1) / 2) * 0.5, r = rng.range(0.16, 0.24), tall = rng.chance(0.4);
      put(CYL, tt, 0.4, r * 0.9, r * 2, r * 1.8, r * 2, P, rng.pick([[0.34, 0.16, 0.1], [0.2, 0.2, 0.22], [0.12, 0.16, 0.24]]));
      put(tall ? CONE : SPHERE, tt, 0.4, r * 1.8 + (tall ? 0.45 : 0.22), tall ? 0.45 : 0.5, tall ? 0.95 : 0.5, tall ? 0.45 : 0.5, MAT.FOLIAGE, [0.05, 0.15 + rng.float() * 0.08, 0.06], 0, rng.float());
    }
  },
  crates(w, rng, put, t) {
    const n = rng.irange(1, 3);
    for (let k = 0; k < n; k++) put(BOX, t + rng.range(-0.06, 0.06), 0.45, 0.25 + k * 0.5, 0.72, 0.5, 0.6, P, WOOD, 0, SUB.TIMBER, 0, 0, 0, 0, 0, rng.range(-0.25, 0.25));
    if (rng.chance(0.5)) put(BOX, t + 0.8, 0.45, 0.2, 0.6, 0.4, 0.5, P, WOOD, 0, SUB.TIMBER, 0, 0, 0, 0, 0, rng.range(-0.4, 0.4));
  },
  beer(w, rng, put, t) {
    // Stacked bottle crates, the back-door furniture of every bar.
    for (let c = 0; c < 2; c++) {
      const n = rng.irange(1, 4), col = rng.pick(CRATE);
      for (let k = 0; k < n; k++) put(BOX, t + (c - 0.5) * 0.5, 0.4, 0.15 + k * 0.3, 0.45, 0.28, 0.34, P, col, 0, SUB.RUBBER, 0, 0, 0, 0, 0, rng.range(-0.08, 0.08));
    }
  },
  kegs(w, rng, put, t) {
    for (const d of [-0.26, 0.26]) put(CYL, t + d, 0.42, 0.3, 0.44, 0.6, 0.44, P, PALE, 0, SUB.METAL);
    if (rng.chance(0.5)) put(CYL, t, 0.42, 0.9, 0.44, 0.6, 0.44, P, PALE, 0, SUB.METAL);
  },
  aboard(w, rng, put, t) {
    // A-frame pavement sign: two lit panels leaning together.
    const col = rng.pick(NEON), seed = rng.float(), kind = rng.chance(0.5) ? 2 : 0;
    put(BOX, t, 0.66, 0.48, 0.62, 0.96, 0.04, MAT.SIGN, kind ? [1, 1, 1] : col, kind ? 1.7 : 2.6, seed, kind, 0, 0, 0.2);
    put(BOX, t, 0.86, 0.48, 0.62, 0.96, 0.04, MAT.SIGN, kind ? [1, 1, 1] : col, kind ? 1.7 : 2.6, seed + 0.31, kind, 0, 0, -0.2);
  },
  kanban(w, rng, put, t, F) {
    // Standing light box with the shop's name down it.
    const col = rng.pick(NEON), hgt = rng.range(1.3, 1.9);
    put(BOX, t, 0.5, 0.06, 0.62, 0.12, 0.44, P, DARK);
    put(BOX, t, 0.5, 0.12 + hgt / 2, 0.16, hgt, 0.5, MAT.SIGN, col, 3.6, rng.float(), 1);
    if (rng.chance(0.35)) { const [x, z] = F.P(t, 0.9); light(w, x, 1.2, z, col, 6, 1.0); }
  },
  bags(w, rng, put, t) {
    const n = rng.irange(2, 4);
    for (let k = 0; k < n; k++) { const r = rng.range(0.28, 0.42); put(SPHERE, t + rng.range(-0.45, 0.45), rng.range(0.32, 0.6), r * 0.7, r * 2, r * 1.5, r * 2, P, rng.chance(0.7) ? [0.03, 0.03, 0.035] : [0.5, 0.5, 0.52], 0, SUB.RUBBER); }
  },
  cardboard(w, rng, put, t) {
    const n = rng.irange(2, 4);
    for (let k = 0; k < n; k++) { const s = rng.range(0.35, 0.6); put(BOX, t + rng.range(-0.4, 0.4), rng.range(0.35, 0.6), s * 0.4 + (k > 1 ? 0.4 : 0), s, s * 0.8, s * 0.8, P, [0.36, 0.27, 0.16], 0, SUB.FABRIC, 0, 0, 0, 0, 0, rng.range(-0.6, 0.6)); }
  },
  bike(w, rng, put, t) {
    const col = rng.pick(PAINT), lean = rng.range(-0.1, 0.1), o = 0.4;
    for (const d of [-0.52, 0.52]) put(CYL, t + d, o, 0.33, 0.66, 0.035, 0.66, P, RUBBER, 0, SUB.RUBBER, 0, 0, 0, HALF + lean);
    put(BOX, t - 0.05, o, 0.56, 0.9, 0.04, 0.04, MAT.GLOSS, col, 0, 0, 0, 0, 0, 0, 0.32);
    put(BOX, t - 0.2, o, 0.7, 0.04, 0.5, 0.04, MAT.GLOSS, col, 0, 0, 0, 0, 0, 0, 0.25);
    put(BOX, t - 0.28, o, 0.95, 0.26, 0.05, 0.12, P, RUBBER, 0, SUB.RUBBER);
    put(BOX, t + 0.42, o, 0.78, 0.04, 0.55, 0.04, MAT.GLOSS, col, 0, 0, 0, 0, 0, 0, -0.3);
    put(BOX, t + 0.36, o, 1.04, 0.04, 0.04, 0.5, P, STEEL, 0, SUB.METAL);
    if (rng.chance(0.4)) put(BOX, t + 0.58, o, 0.78, 0.3, 0.22, 0.34, P, [0.1, 0.1, 0.11], 0, SUB.BARS, 2);
  },
  scooter(w, rng, put, t) {
    const col = rng.pick(PAINT), o = 0.45;
    for (const d of [-0.52, 0.52]) put(CYL, t + d, o, 0.2, 0.4, 0.12, 0.4, P, RUBBER, 0, SUB.RUBBER, 0, 0, 0, HALF);
    put(BOX, t - 0.1, o, 0.38, 0.95, 0.3, 0.34, MAT.GLOSS, col);
    put(BOX, t - 0.25, o, 0.6, 0.6, 0.1, 0.3, P, RUBBER, 0, SUB.RUBBER);
    put(BOX, t + 0.42, o, 0.66, 0.1, 0.66, 0.36, MAT.GLOSS, col, 0, 0, 0, 0, 0, 0, -0.28);
    put(BOX, t + 0.5, o, 1.02, 0.05, 0.05, 0.56, P, STEEL, 0, SUB.METAL);
    put(SPHERE, t + 0.56, o, 0.82, 0.12, 0.14, 0.16, MAT.EMISSIVE, [1, 0.95, 0.8], 1.2);
    put(BOX, t - 0.6, o, 0.5, 0.04, 0.08, 0.2, MAT.EMISSIVE, [1, 0.1, 0.08], 1.6);
    if (rng.chance(0.4)) put(BOX, t - 0.5, o, 0.82, 0.4, 0.34, 0.38, P, [0.2, 0.2, 0.21], 0, SUB.RUBBER);
  },
  condenser(w, rng, put, t) {
    const n = rng.chance(0.3) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const y = 0.45 + k * 0.82;
      put(BOX, t, 0.32, y, 0.9, 0.72, 0.42, P, [0.34, 0.35, 0.34], 0, SUB.METAL);
      put(CYL, t - 0.12, 0.54, y, 0.52, 0.03, 0.52, P, DARK, 0, SUB.BARS, 3, 0, 0, HALF);
      put(BOX, t, 0.32, y - 0.4, 0.8, 0.08, 0.3, P, DARK);
    }
    put(CYL, t + 0.4, 0.1, 1.9, 0.05, 2.2, 0.05, P, [0.3, 0.3, 0.3]);
  },
  meter(w, rng, put, t) {
    put(BOX, t, 0.16, 1.0, 0.75, 1.15, 0.3, P, [0.28, 0.3, 0.29], 0, SUB.METAL);
    put(BOX, t, 0.32, 1.15, 0.5, 0.3, 0.02, P, DARK);
    put(SPHERE, t + 0.25, 0.32, 0.7, 0.06, 0.06, 0.04, MAT.EMISSIVE, rng.chance(0.5) ? [0.2, 1, 0.4] : [1, 0.3, 0.1], 3, rng.float());
    put(CYL, t - 0.2, 0.12, 2.2, 0.05, 1.3, 0.05, P, [0.12, 0.12, 0.13]);
  },
  gas(w, rng, put, t) {
    const n = rng.irange(2, 3);
    for (let k = 0; k < n; k++) {
      const tt = t + (k - (n - 1) / 2) * 0.34;
      put(CYL, tt, 0.3, 0.55, 0.3, 1.1, 0.3, P, rng.pick([[0.3, 0.32, 0.3], [0.4, 0.14, 0.08], [0.36, 0.36, 0.4]]), 0, SUB.METAL);
      put(SPHERE, tt, 0.3, 1.12, 0.26, 0.22, 0.26, P, [0.3, 0.3, 0.31], 0, SUB.METAL);
    }
    put(BOX, t, 0.3, 0.8, n * 0.36, 0.03, 0.34, P, DARK);
  },
  wheelie(w, rng, put, t) {
    const n = rng.irange(1, 2);
    for (let k = 0; k < n; k++) {
      const tt = t + (k - (n - 1) / 2) * 0.7, col = rng.pick([[0.06, 0.2, 0.1], [0.06, 0.12, 0.26], [0.12, 0.12, 0.13]]);
      put(BOX, tt, 0.42, 0.52, 0.58, 0.96, 0.66, P, col, 0, SUB.RUBBER);
      put(BOX, tt, 0.44, 1.03, 0.62, 0.06, 0.72, P, col, 0, SUB.RUBBER, 0, 0, 0, rng.chance(0.25) ? -0.5 : 0);
    }
  },
  table(w, rng, put, t) {
    // A standing table and stools outside a bar.
    put(CYL, t, 0.62, 0.5, 0.07, 1.0, 0.07, P, STEEL, 0, SUB.METAL);
    put(CYL, t, 0.62, 1.02, 0.7, 0.05, 0.7, P, WOOD, 0, SUB.TIMBER);
    for (const d of [-0.62, 0.62]) { put(CYL, t + d, 0.5, 0.24, 0.06, 0.48, 0.06, P, STEEL, 0, SUB.METAL); put(CYL, t + d, 0.5, 0.5, 0.32, 0.06, 0.32, P, [0.3, 0.07, 0.07], 0, SUB.RUBBER); }
    if (rng.chance(0.6)) put(CYL, t + 0.12, 0.6, 1.14, 0.07, 0.2, 0.07, MAT.GLOSS, [0.1, 0.25, 0.12]);
  },
  vend(w, rng, put, t, F) {
    const col = rng.pick([[0.8, 0.1, 0.1], [0.1, 0.3, 0.8], [0.85, 0.85, 0.85], [0.1, 0.5, 0.3]]);
    put(BOX, t, 0.38, 0.95, 1.0, 1.9, 0.7, MAT.GLOSS, col);
    put(BOX, t, 0.74, 1.25, 0.82, 0.95, 0.03, MAT.EMISSIVE, [0.85, 0.95, 1.0], 2.2);
    put(BOX, t, 0.74, 0.5, 0.6, 0.18, 0.03, P, DARK);
    for (let k = -2; k <= 2; k++) put(BOX, t + k * 0.15, 0.76, 1.3, 0.07, 0.16, 0.02, MAT.EMISSIVE, rng.pick(NEON), 1.2);
    const [x, z] = F.P(t, 0.9);
    light(w, x, 1.4, z, [0.7, 0.85, 1.0], 6, 1.0);
  },
  pallet(w, rng, put, t) {
    const n = rng.irange(1, 4);
    for (let k = 0; k < n; k++) put(BOX, t, 0.55, 0.07 + k * 0.15, 1.2, 0.13, 1.0, P, [0.26, 0.19, 0.11], 0, SUB.TIMBER, 0, 0, 0, 0, 0, rng.range(-0.1, 0.1));
    if (rng.chance(0.5)) put(BOX, t, 0.55, n * 0.15 + 0.3, 0.9, 0.6, 0.8, P, [0.36, 0.27, 0.16], 0, SUB.FABRIC);
  },
  drum(w, rng, put, t) {
    const n = rng.irange(1, 3);
    for (let k = 0; k < n; k++) put(CYL, t + (k - (n - 1) / 2) * 0.62, 0.42, 0.45, 0.58, 0.9, 0.58, P, rng.pick([[0.1, 0.2, 0.36], [0.4, 0.12, 0.06], [0.3, 0.3, 0.1], [0.12, 0.12, 0.13]]), 0, SUB.CORRUGATED, rng.float());
  },
  ladder(w, rng, put, t) {
    put(BOX, t, 0.5, 1.3, 0.5, 2.7, 0.04, P, PALE, 0, SUB.BARS, 1, 0, 0, -0.26);
    put(CYL, t + 0.6, 0.4, 0.17, 0.3, 0.34, 0.3, P, [0.5, 0.5, 0.5], 0, SUB.METAL);
  },
};
const BLOCKING = { planter: 1, crates: 1, beer: 1, kegs: 1, kanban: 1, condenser: 1, meter: 1, gas: 1, wheelie: 1, vend: 1, pallet: 1, drum: 1, scooter: 1, table: 1 };
// Weighted prop tables: street-facing shopfronts and service alleys differ.
const FRONT_PROPS = [
  /* Old Town  */ [['planter', 3], ['pot', 5], ['aboard', 3], ['kanban', 3], ['bike', 4], ['table', 2], ['vend', 3], ['beer', 2], ['crates', 2], ['meter', 1], ['scooter', 2], ['gas', 1]],
  /* Neon      */ [['aboard', 4], ['kanban', 6], ['vend', 5], ['bike', 3], ['scooter', 3], ['pot', 2], ['table', 3], ['beer', 2], ['bags', 2], ['meter', 1], ['planter', 1]],
  /* Arcology  */ [['planter', 7], ['pot', 2], ['kanban', 2], ['vend', 2], ['bike', 1], ['meter', 1]],
  /* Corporate */ [['planter', 7], ['pot', 2], ['kanban', 1], ['vend', 2], ['aboard', 1], ['meter', 1]],
  /* Dockside  */ [['drum', 5], ['pallet', 5], ['crates', 4], ['gas', 2], ['condenser', 2], ['meter', 2], ['bags', 2], ['bike', 1], ['ladder', 1], ['vend', 1]],
];
const BACK_PROPS = [['bags', 5], ['wheelie', 4], ['condenser', 5], ['cardboard', 4], ['beer', 4], ['crates', 3], ['gas', 2], ['meter', 3], ['kegs', 2], ['bike', 2], ['pallet', 2], ['ladder', 1], ['drum', 1], ['pot', 1]];
function pickProp(rng, table) {
  const i = rng.weighted(table.map((e) => e[1]));
  return table[i][0];
}
function groundProp(w, rng, F, put, t, name) {
  const block = !!BLOCKING[name];
  if (!standable(w, F, t, block)) return false;
  PROPS[name](w, rng, put, t, F);
  if (block) { const [x, z] = F.P(t, 0.5); occupy(w, x, z); }
  return true;
}

// ---------------------------------------------------------------- frontages
// Dress every wall that faces public ground. Bays follow the same world-space grid
// the facade shader uses for its windows, so props sit under panes and signs between them.
export function dressFrontage(w, rng, x0, z0, x1, z1, h, style, sides, cellW, opt = {}) {
  const D = DENS[style], floors = Math.floor(h / 3.3), zone = w.zoneAt((x0 + x1) / 2, (z0 + z1) / 2);
  const doors = (opt.doors || []).slice();
  let escaped = false;
  for (const s of sides) {
    const F = frame(s, x0, z0, x1, z1), put = kit(w, F);
    if (F.len < 5) continue;
    // Does this wall face a real street, or a service alley?
    const [qx, qz] = F.P(F.mid, 2.5), qs = w.surf(qx, qz);
    const back = qs === SURF.ALLEY || qs === SURF.LOT;
    const nearDoor = (t) => doors.some((d) => d.s === s && Math.abs(d.c - t) < 2.6);
    // Ledge over the ground floor and a plinth course at the pavement.
    if (opt.shell && h > 6) put(BOX, F.mid, 0.1, 4.05, F.len + 0.2, 0.14, 0.2, P, [0.15, 0.15, 0.16], 0, SUB.WALL);
    if (h > 6 && !opt.shell) put(BOX, F.mid, 0.13, 3.36, F.len + 0.26, 0.14, 0.26, P, [0.15, 0.15, 0.16], 0, SUB.WALL);
    if (!opt.shell) put(BOX, F.mid, 0.05, 0.2, F.len, 0.4, 0.1, P, [0.09, 0.09, 0.1], 0, SUB.WALL);
    // Cable runs with junction boxes, and a downpipe at one end.
    if (rng.chance(D.cable)) {
      const y = rng.range(3.5, 3.9);
      put(BOX, F.mid, 0.07, y, F.len - 0.6, 0.035, 0.035, P, DARK);
      if (rng.chance(0.6)) put(BOX, F.mid, 0.07, y + 0.12, F.len - 1.4, 0.03, 0.03, P, DARK);
      for (let t = F.lo + rng.range(1.5, 4); t < F.hi - 1; t += rng.range(5, 11)) put(BOX, t, 0.1, y + 0.05, 0.3, 0.38, 0.16, P, [0.2, 0.2, 0.21], 0, SUB.METAL);
    }
    if (rng.chance(0.6)) { const t = rng.chance(0.5) ? F.lo + 0.35 : F.hi - 0.35; put(CYL, t, 0.1, Math.min(h, 22) / 2, 0.13, Math.min(h, 22), 0.13, P, [0.12, 0.12, 0.13]); put(CYL, t, 0.2, 0.12, 0.15, 0.24, 0.3, P, [0.12, 0.12, 0.13]); }
    // Fire escape: grated landings and ladders zig-zagging down to a drop ladder.
    if (!escaped && floors >= 3 && F.len >= 9 && rng.chance(D.escape * (back ? 1.4 : 0.7))) {
      escaped = true;
      const t0 = F.mid + rng.range(-0.25, 0.25) * (F.len - 6), top = Math.min(floors - 1, 6);
      for (let k = 1; k <= top; k++) {
        const y = k * 3.3 - 0.2, e = k % 2 ? 1 : -1;
        put(BOX, t0, 0.62, y, 3.4, 0.07, 1.2, P, DARK, 0, SUB.BARS, 3);
        put(BOX, t0, 1.2, y + 0.52, 3.4, 0.98, 0.05, P, DARK, 0, SUB.BARS, 0);
        for (const d of [-1.7, 1.7]) put(BOX, t0 + d, 0.62, y + 0.52, 0.05, 0.98, 1.2, P, DARK, 0, SUB.BARS, 0);
        if (k < top) put(BOX, t0 + e * 1.2, 0.5, y + 1.65, 0.55, 3.3, 0.05, P, DARK, 0, SUB.BARS, 1);
        for (const d of [-1.5, 1.5]) put(BOX, t0 + d, 0.3, y - 0.3, 0.06, 0.06, 0.7, P, DARK, 0, 0, 0, 0, 0, 0.6);
      }
      if (!nearDoor(t0 - 1.2)) put(BOX, t0 - 1.2, 0.9, 3.1 - 0.9, 0.5, 1.8, 0.05, P, DARK, 0, SUB.BARS, 1);
    }
    // Mimic growth creeps over walls in the deep zones.
    if (zone >= 2 && rng.chance([0, 0, 0.1, 0.34, 0.6][zone])) growth(w, rng, F, put, h, zone);

    const k0 = Math.ceil((F.lo + 0.5) / cellW), k1 = Math.floor((F.hi - 0.5) / cellW);
    // One way in per wall: a glazed lobby door on the street, a steel service door at the back.
    if (!opt.shell && k1 > k0 && rng.chance(back ? 0.6 : 0.85)) {
      const t = (rng.irange(k0, k1 - 1) + 0.5) * cellW, [dx, dz] = F.P(t, 0.5);
      if (w.cell(dx, dz) === 0) {
        doors.push({ s, c: t });
        if (back) {
          put(BOX, t, 0.03, 1.12, 1.2, 2.36, 0.06, P, DARK);
          put(BOX, t, 0.05, 1.1, 1.02, 2.2, 0.06, P, [0.17, 0.18, 0.2], 0, SUB.METAL);
          put(BOX, t + 0.36, 0.1, 1.05, 0.05, 0.16, 0.05, P, PALE, 0, SUB.METAL);
          put(BOX, t, 0.4, 0.05, 1.4, 0.1, 0.8, P, CONCRETE, 0, SUB.WALL);
          put(BOX, t, 0.16, 2.6, 0.3, 0.1, 0.3, P, DARK);
          put(SPHERE, t, 0.22, 2.5, 0.18, 0.12, 0.18, MAT.EMISSIVE, [1.0, 0.5, 0.2], 3);
          if (rng.chance(0.4)) { const [lx, lz] = F.P(t, 1.2); light(w, lx, 2.4, lz, [1.0, 0.5, 0.2], 7, 1.1); }
        } else {
          const ac = rng.pick(NEON);
          put(BOX, t, 0.06, 1.3, 2.4, 2.6, 0.12, P, DARK);
          for (const d of [-0.54, 0.54]) { put(BOX, t + d, 0.1, 1.2, 1.0, 2.3, 0.06, MAT.GLOSS, [0.03, 0.05, 0.07]); put(BOX, t + d * 0.2, 0.15, 1.15, 0.04, 0.5, 0.04, P, PALE, 0, SUB.METAL); }
          put(BOX, t, 0.14, 2.5, 2.3, 0.14, 0.1, MAT.EMISSIVE, [0.9, 0.92, 1.0], 1.6);
          put(BOX, t, 0.6, 2.8, 3.0, 0.1, 1.2, P, [0.12, 0.12, 0.13], 0, SUB.METAL);
          put(BOX, t, 1.18, 2.72, 3.0, 0.06, 0.04, MAT.EMISSIVE, ac, 2.4, rng.float());
          put(BOX, t, 0.5, 0.05, 2.7, 0.1, 1.0, P, CONCRETE, 0, SUB.WALL);
          put(BOX, t + 1.42, 0.05, 1.4, 0.2, 0.32, 0.05, P, STEEL, 0, SUB.METAL);
          put(SPHERE, t + 1.42, 0.08, 1.48, 0.04, 0.04, 0.03, MAT.EMISSIVE, [0.2, 1, 0.4], 3, rng.float());
        }
      }
    }
    // Between bays: projecting signs, sign columns, lamps and cameras.
    for (let k = k0; k <= k1; k++) {
      const t = k * cellW;
      if (nearDoor(t)) continue;
      const r = rng.float();
      if (!back && r < D.stack && h > 9) {
        // A column of small tenant boards, one per floor: the face of a mixed-use block.
        const n = Math.min(rng.irange(2, 5), floors - 1), col0 = rng.int(NEON.length);
        put(BOX, t, 0.62, 3.75 + n * 0.45, 0.08, n * 0.9 + 0.2, 0.08, P, DARK);
        for (let q = 0; q < n; q++) put(BOX, t, 0.68, 4.1 + q * 0.9, 0.14, 0.76, 1.12, MAT.SIGN, NEON[(col0 + q * 3) % NEON.length], 3.4, rng.float(), 0);
        if (rng.chance(0.4)) { const [lx, lz] = F.P(t, 2); light(w, lx, 4.6, lz, NEON[col0], 11, 1.1); }
      } else if (r < D.stack + D.sign * (back ? 0.4 : 1)) {
        const kind = rng.int(3);
        if (kind === 0) { put(BOX, t, 0.55, rng.range(2.9, 3.3), 0.1, 0.8, 0.8, MAT.SIGN, [1, 1, 1], 2.6, rng.float(), 2); put(BOX, t, 0.3, 3.5, 0.04, 0.04, 0.6, P, DARK); }
        else if (kind === 1 && h > 7.5) { const sh = Math.min(h - 4.2, rng.range(2.2, 5)); put(BOX, t, 0.62, 3.7 + sh / 2, 0.3, sh, 0.95, MAT.SIGN, rng.pick(NEON), 4.6, rng.float(), 1); put(BOX, t, 0.62, 3.7 + sh / 2, 0.16, sh + 0.16, 1.07, P, DARK); }
        else { const col = rng.pick(NEON), bw = Math.min(cellW * 0.9, 2.4); put(BOX, t + cellW / 2, 0.14, rng.range(3.6, 4.2), bw, 0.7, 0.12, MAT.SIGN, col, 3.6, rng.float(), 0); }
      } else if (r > 0.9) {
        // Wall lamp on a bracket.
        put(BOX, t, 0.22, 3.0, 0.05, 0.05, 0.44, P, DARK);
        put(SPHERE, t, 0.42, 2.9, 0.2, 0.24, 0.2, MAT.EMISSIVE, WARM, 3.5);
        if (back || rng.chance(0.3)) { const [lx, lz] = F.P(t, 1.2); light(w, lx, 2.8, lz, WARM, 9, 1.1); }
      } else if (r > 0.86) {
        put(BOX, t, 0.2, 3.2, 0.12, 0.12, 0.34, P, [0.3, 0.3, 0.31], 0, SUB.METAL, 0, 0, 0, 0.3);
        put(SPHERE, t, 0.38, 3.12, 0.04, 0.04, 0.04, MAT.EMISSIVE, [1, 0.1, 0.1], 5, rng.float(), 2);
      }
    }
    // Under each bay: awnings, curtains, lanterns, posters, window units and a prop on the pavement.
    const table = back ? BACK_PROPS : FRONT_PROPS[style];
    for (let k = k0 - 1; k <= k1; k++) {
      const t = (k + 0.5) * cellW;
      if (t < F.lo + 0.9 || t > F.hi - 0.9 || nearDoor(t)) continue;
      if (opt.shell) {
        // Enterable shells get real windows: a lit pane in a frame, with a sill.
        if (rng.chance(0.7)) {
          const ww = Math.min(cellW * 0.62, 1.9), wc = rng.chance(0.5) ? [1.0, 0.74, 0.42] : [0.55, 0.78, 1.0];
          put(BOX, t, 0.03, 2.05, ww + 0.18, 1.38, 0.08, P, DARK);
          put(BOX, t, 0.05, 2.05, ww, 1.2, 0.08, MAT.EMISSIVE, wc, rng.range(0.5, 1.3), rng.float());
          put(BOX, t, 0.08, 2.05, 0.05, 1.2, 0.08, P, DARK);
          put(BOX, t, 0.1, 1.36, ww + 0.3, 0.07, 0.2, P, [0.3, 0.3, 0.31], 0, SUB.WALL);
        }
      }
      if (!back) {
        const r = rng.float();
        if (r < D.awn) put(WEDGE, t, 0.72, 3.0, cellW * 0.94, 0.5, 1.4, P, rng.pick(CLOTH), 0, SUB.FABRIC);
        else if (r < D.awn + 0.14 && style <= STYLE.NEON) { const c = rng.pick([[0.07, 0.1, 0.24], [0.36, 0.07, 0.06], [0.5, 0.48, 0.42]]); for (const d of [-0.34, 0, 0.34]) put(BOX, t + d * cellW * 0.8, 0.1, 2.36, cellW * 0.25, 0.62, 0.03, P, c, 0, SUB.FABRIC); put(BOX, t, 0.1, 2.7, cellW * 0.78, 0.04, 0.04, P, WOOD, 0, SUB.TIMBER); }
        if (rng.chance(D.lantern)) {
          // Paper lantern beside the door.
          const lc = rng.chance(0.75) ? [1.0, 0.22, 0.12] : [1.0, 0.85, 0.6], tt = t + cellW * 0.42;
          put(SPHERE, tt, 0.45, 2.35, 0.42, 0.6, 0.42, MAT.EMISSIVE, lc, 2.4, rng.float());
          for (const dy of [-0.32, 0.32]) put(CYL, tt, 0.45, 2.35 + dy, 0.24, 0.05, 0.24, P, DARK);
          if (rng.chance(0.25)) { const [lx, lz] = F.P(tt, 1.0); light(w, lx, 2.2, lz, lc, 7, 1.0); }
        }
      }
      if (rng.chance(D.poster * (back ? 1.6 : 0.5))) {
        const n = rng.irange(1, 3);
        for (let q = 0; q < n; q++) put(BOX, t + (q - (n - 1) / 2) * 0.82, 0.03, rng.range(1.5, 1.8), 0.76, 1.06, 0.03, MAT.SIGN, [1, 1, 1], rng.range(0.25, 0.6), rng.float(), 2);
      }
      // Window air conditioners on the floors above.
      if (D.ac > 0.02) for (let fl = opt.shell ? 2 : 1; fl <= Math.min(floors - 1, 5); fl++) {
        if (!rng.chance(D.ac * (back ? 1.3 : 0.7))) continue;
        const y = fl * 3.3 + 0.5;
        put(BOX, t, 0.28, y, 0.8, 0.52, 0.5, P, [0.36, 0.37, 0.36], 0, SUB.METAL);
        put(BOX, t, 0.54, y, 0.66, 0.38, 0.02, P, DARK, 0, SUB.BARS, 3);
        put(BOX, t, 0.2, y - 0.32, 0.7, 0.05, 0.4, P, DARK);
      }
      if (rng.chance(D.prop * (back ? 1.15 : 1))) groundProp(w, rng, F, put, t, pickProp(rng, table));
    }
    // A vent stack up a service wall.
    if (back && h > 8 && rng.chance(0.35)) {
      const t = rng.range(F.lo + 1.5, F.hi - 1.5), top = Math.min(h + 0.8, 16);
      put(BOX, t, 0.26, (2.9 + top) / 2, 0.5, top - 2.9, 0.5, P, [0.3, 0.31, 0.32], 0, SUB.METAL);
      put(BOX, t, 0.42, 2.9, 0.62, 0.4, 0.8, P, [0.24, 0.25, 0.26], 0, SUB.METAL);
      const [vx, vz] = F.P(t, 0.8);
      w.blocks[w.blockIndex(vx, vz)].vents.push({ x: vx, z: vz, y: 2.6 });
    }
  }
}

// Mimic biomass on a wall: mounds, pods and tendrils reaching up it.
function growth(w, rng, F, put, h, zone) {
  const t0 = rng.range(F.lo + 2, F.hi - 2), n = rng.irange(4, 5 + zone * 2), top = Math.min(h, 4 + zone * 2.5);
  for (let k = 0; k < n; k++) {
    const t = t0 + rng.range(-2.6, 2.6), y = rng.range(0.2, top) * rng.float(), s = rng.range(0.5, 1.5) * (1 - y / (top + 4));
    if (t < F.lo + 0.3 || t > F.hi - 0.3) continue;
    put(SPHERE, t, 0.1, y + s * 0.3, s * 1.3, s, s * 0.6, MAT.ORGANIC, FLESH, 1.2, rng.float());
  }
  for (let k = 0; k < 2 + zone; k++) {
    const t = t0 + rng.range(-2.4, 2.4), len = rng.range(2, top + 1);
    if (t < F.lo + 0.3 || t > F.hi - 0.3) continue;
    put(CYL, t, 0.08, len / 2, 0.14, len, 0.12, MAT.ORGANIC, FLESH, 0.9, rng.float(), 0, 0, 0, 0, rng.range(-0.3, 0.3));
  }
  if (rng.chance(0.5)) put(SPHERE, t0, 0.3, rng.range(1.2, 2.4), 0.5, 0.62, 0.42, MAT.ORGANIC, [0.9, 0.3, 0.5], 3.0, rng.float());
}

// ---------------------------------------------------------------- alleys between parcels
// Overhead in the gaps: cable bundles, pipe bridges and washing lines.
export function dressGap(w, rng, a, b, c, d, horiz, style) {
  const len = horiz ? c - a : d - b, wid = horiz ? d - b : c - a;
  if (len < 8 || wid < 2 || inReserved(w, (a + c) / 2, (b + d) / 2)) return;
  const at = (t, o) => (horiz ? [t, b + o] : [a + o, t]);
  const lo = horiz ? a : b, hi = lo + len, old = style === STYLE.OLDTOWN || style === STYLE.NEON;
  for (let t = lo + rng.range(1.5, 4); t < hi - 1.5; t += rng.range(2.5, 6)) {
    const [x, z] = at(t, wid / 2), r = rng.float();
    if (w.surf(x, z) !== SURF.ALLEY) continue;
    const span = (y, th, mat, col, emis = 0, p0 = 0, p1 = 0) => box(w, x, y, z, horiz ? th : wid, th, horiz ? wid : th, mat, col, emis, p0, p1);
    if (r < 0.4) {
      // A sagging bundle of cables.
      const n = rng.irange(1, 3);
      for (let q = 0; q < n; q++) { const [cx, cz] = at(t + q * 0.2, wid / 2); primR(w, BOX, cx, rng.range(4.2, 7.5), cz, horiz ? 0.03 : wid, 0.03, horiz ? wid : 0.03, P, DARK, 0, 0, 0, 0, 0, 0, horiz ? rng.range(-0.08, 0.08) : 0, horiz ? 0 : rng.range(-0.08, 0.08)); }
    } else if (r < 0.55 && old) {
      // Washing on a line.
      const y = rng.range(3.4, 6.5);
      span(y, 0.02, P, DARK);
      for (let o = 0.5; o < wid - 0.4; o += rng.range(0.5, 0.9)) { const [lx, lz] = at(t, o), hgt = rng.range(0.4, 0.8); box(w, lx, y - hgt / 2 - 0.02, lz, horiz ? 0.03 : 0.42, hgt, horiz ? 0.42 : 0.03, P, rng.pick([[0.5, 0.5, 0.55], [0.45, 0.2, 0.2], [0.2, 0.3, 0.45], [0.4, 0.38, 0.3], [0.12, 0.25, 0.14]]), 0, SUB.FABRIC); }
    } else if (r < 0.66) {
      // A pipe bridge between the buildings.
      const y = rng.range(3.2, 5.5);
      primR(w, CYL, x, y, z, 0.18, wid, 0.18, P, [0.25, 0.2, 0.16], 0, SUB.METAL, 0, 0, 0, horiz ? 0 : HALF, HALF, 0);
    } else if (r < 0.74 && old) {
      // A small neon sign hung across the alley.
      const col = rng.pick(NEON);
      span(rng.range(3.3, 4.2), 0.05, P, DARK);
      box(w, x, 3.0, z, horiz ? 0.1 : Math.min(wid - 0.6, 1.8), 0.6, horiz ? Math.min(wid - 0.6, 1.8) : 0.1, MAT.SIGN, col, 3.6, rng.float(), 0);
      light(w, x, 2.8, z, col, 8, 1.2);
    }
  }
}

// ---------------------------------------------------------------- streets
function vehicle(w, rng, x, z, alongZ, kind) {
  const yaw = alongZ ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? HALF : -HALF);
  const F = freeFrame(x, z, yaw), put = kit(w, F);
  const L = kind === 'van' ? 4.9 : kind === 'truck' ? 5.6 : 4.3, W = kind === 'car' ? 1.85 : 2.0, cw = alongZ ? W : L, cd = alongZ ? L : W;
  if (!w.circleFree(x, z, L / 2 + 0.2)) return false;
  w.fillRect(x - cw / 2, z - cd / 2, x + cw / 2, z + cd / 2, 2);
  const cc = rng.pick([[0.16, 0.18, 0.22], [0.3, 0.06, 0.07], [0.2, 0.2, 0.2], [0.05, 0.12, 0.16], [0.4, 0.38, 0.32], [0.04, 0.04, 0.05], [0.42, 0.42, 0.44]]);
  // Local +z is the nose.
  const wheels = (zs, r = 0.34) => { for (const a of [-1, 1]) for (const zz of zs) put(CYL, a * (W / 2 - 0.12), zz, r, r * 2, 0.24, r * 2, P, RUBBER, 0, SUB.RUBBER, 0, 0, 0, 0, HALF); };
  if (kind === 'van') {
    put(BOX, 0, -0.3, 1.2, W, 1.7, L - 1.1, MAT.ENAMEL, cc);
    put(BOX, 0, L / 2 - 0.5, 0.85, W, 1.0, 1.0, MAT.ENAMEL, cc);
    put(BOX, 0, L / 2 - 0.62, 1.62, W * 0.9, 0.6, 0.5, MAT.GLOSS, [0.02, 0.03, 0.05], 0, 0, 0, 0, 0, -0.5);
    if (rng.chance(0.6)) for (const a of [-1, 1]) put(BOX, a * (W / 2 + 0.01), -0.4, 1.3, 0.02, 0.7, 2.2, MAT.SIGN, rng.pick(NEON), 0.5, rng.float(), 0);
    wheels([-1.5, 1.5]);
  } else if (kind === 'truck') {
    put(BOX, 0, L / 2 - 0.85, 1.25, W, 1.7, 1.6, MAT.ENAMEL, cc);
    put(BOX, 0, L / 2 - 0.1, 1.55, W * 0.9, 0.6, 0.1, MAT.GLOSS, [0.02, 0.03, 0.05]);
    put(BOX, 0, -0.85, 0.75, W, 0.2, L - 1.8, P, STEEL, 0, SUB.METAL);
    if (rng.chance(0.7)) put(BOX, 0, -0.85, 1.75, W - 0.1, 1.8, L - 2.0, P, rng.pick([[0.42, 0.1, 0.07], [0.08, 0.2, 0.36], [0.3, 0.3, 0.31], [0.1, 0.3, 0.16]]), 0, SUB.CORRUGATED, rng.float());
    else for (let k = 0; k < 3; k++) put(BOX, rng.range(-0.4, 0.4), -0.2 - k * 0.9, 1.15, 0.8, 0.6, 0.7, P, WOOD, 0, SUB.TIMBER);
    wheels([-1.9, 1.7], 0.4);
  } else {
    put(BOX, 0, 0, 0.62, W, 0.62, L, MAT.ENAMEL, cc);
    put(BOX, 0, -0.2, 1.18, W * 0.86, 0.52, L * 0.5, MAT.GLOSS, [0.02, 0.03, 0.05]);
    if (kind === 'taxi') { put(BOX, 0, -0.2, 1.52, 0.5, 0.18, 0.22, MAT.EMISSIVE, [1.0, 0.8, 0.2], 3); put(BOX, 0, 0, 0.62, W + 0.02, 0.2, L * 0.6, P, [0.5, 0.42, 0.05]); }
    wheels([-L * 0.32, L * 0.32]);
  }
  put(BOX, 0, -L / 2, 0.72, 1.5, 0.12, 0.06, MAT.EMISSIVE, [1, 0.1, 0.08], 2.5);
  for (const a of [-0.6, 0.6]) put(BOX, a, L / 2, 0.7, 0.3, 0.14, 0.06, MAT.EMISSIVE, [1, 0.95, 0.85], kind === 'taxi' ? 2.0 : 0.6);
  return true;
}
// A burnt-out wreck, tipped on its side or slewed across the road.
function wreck(w, rng, x, z) {
  if (!w.circleFree(x, z, 2.6)) return;
  const F = freeFrame(x, z, rng.float() * 6.283), put = kit(w, F), tip = rng.chance(0.4) ? rng.range(0.9, 1.5) : rng.range(-0.08, 0.08);
  w.fillRect(x - 1.5, z - 1.5, x + 1.5, z + 1.5, 2);
  put(BOX, 0, 0, 0.62 + Math.abs(tip) * 0.35, 1.85, 0.62, 4.3, P, [0.035, 0.03, 0.03], 0, SUB.METAL, 0, 0, 0, 0, tip);
  put(BOX, 0.1, -0.2, 1.15 + Math.abs(tip) * 0.2, 1.6, 0.5, 2.1, P, [0.02, 0.02, 0.02], 0, SUB.BARS, 2, 0, 0, 0, tip);
  for (let k = 0; k < 4; k++) put(BOX, rng.range(-2, 2), rng.range(-2.6, 2.6), 0.05, rng.range(0.2, 0.6), 0.08, rng.range(0.2, 0.6), P, DARK, 0, 0, 0, 0, 0, 0, 0, rng.float() * 3);
  if (rng.chance(0.5)) put(SPHERE, 0, 0.6, 0.5, 1.2, 0.8, 1.4, MAT.ORGANIC, FLESH, 1.3, rng.float());
}

// Extra furniture along one road segment. P maps (t along, offset across) to world.
export function dressStreet(w, rng, vert, c, a, b, k, style, edge, half) {
  const at = (t, off) => (vert ? [c + off, t] : [t, c + off]);
  const zone = w.zoneAt(...at((a + b) / 2, 0)), old = style === STYLE.OLDTOWN || style === STYLE.NEON;
  const a0 = a + 12, b0 = b - 12;
  if (b0 - a0 < 6) return;
  const yawFor = (side) => (vert ? (side > 0 ? -HALF : HALF) : (side > 0 ? Math.PI : 0));   // local +z points at the carriageway
  // Kerb stones.
  for (const side of [-1, 1]) { const [x, z] = at((a0 + b0) / 2, side * (half + 0.12)); box(w, x, 0.07, z, vert ? 0.24 : b0 - a0, 0.14, vert ? b0 - a0 : 0.24, P, [0.2, 0.2, 0.2], 0, SUB.WALL); }
  // Guard rails in short runs between the pavement and the traffic.
  for (const side of [-1, 1]) {
    for (let t = a0 + 7; t < b0 - 9; t += rng.irange(8, 15)) {
      if (!rng.chance(k === 3 ? 0.55 : 0.3)) continue;
      const L = rng.irange(4, 7), [x, z] = at(t + L / 2, side * (half + 0.5));
      let free = true;
      for (let q = 0; q < L; q++) { const [qx, qz] = at(t + q + 0.5, side * (half + 0.5)); if (w.cell(qx, qz) !== 0 || w.surf(qx, qz) !== SURF.WALK) free = false; }
      if (!free) continue;
      box(w, x, 0.5, z, vert ? 0.06 : L, 0.9, vert ? L : 0.06, P, [0.5, 0.5, 0.5], 0, SUB.BARS, 0);
      for (let q = 0; q < L; q++) { const [qx, qz] = at(t + q + 0.5, side * (half + 0.5)); occupy(w, qx, qz); }
    }
  }
  // Pavement kit: hydrants, cabinets, sign posts, planters, parking meters, newspaper boxes.
  for (let t = a0 + 2; t < b0 - 2; t += rng.irange(4, 9)) {
    const side = rng.chance(0.5) ? 1 : -1, [fx, fz] = at(t, side * (edge + 0.5)), x = Math.floor(fx) + 0.5, z = Math.floor(fz) + 0.5;
    if (w.cell(x, z) !== 0 || w.surf(x, z) !== SURF.WALK) continue;
    const F = freeFrame(x, z, yawFor(side)), put = kit(w, F), r = rng.float();
    if (r < 0.14) {
      put(CYL, 0, 0, 0.32, 0.26, 0.64, 0.26, P, [0.5, 0.08, 0.06], 0, SUB.METAL); put(SPHERE, 0, 0, 0.68, 0.26, 0.2, 0.26, P, [0.5, 0.08, 0.06], 0, SUB.METAL);
      put(CYL, 0, 0.16, 0.42, 0.12, 0.14, 0.12, P, [0.42, 0.42, 0.4], 0, SUB.METAL, 0, 0, 0, HALF);
      occupy(w, x, z);
    } else if (r < 0.3) {
      put(BOX, 0, 0, 0.7, 1.0, 1.4, 0.5, P, rng.pick([[0.16, 0.22, 0.2], [0.26, 0.27, 0.27], [0.12, 0.14, 0.18]]), 0, SUB.METAL);
      put(BOX, 0, 0.26, 0.9, 0.7, 0.5, 0.02, MAT.SIGN, [1, 1, 1], 0.35, rng.float(), 2);
      put(SPHERE, 0.36, 0.26, 1.25, 0.05, 0.05, 0.04, MAT.EMISSIVE, [0.2, 1, 0.4], 3, rng.float());
      occupy(w, x, z);
    } else if (r < 0.52) {
      // Sign post: a pictogram disc and a name plate.
      put(CYL, 0, 0, 1.5, 0.07, 3.0, 0.07, P, [0.3, 0.3, 0.31], 0, SUB.METAL);
      put(BOX, 0, 0.06, 2.6, 0.7, 0.7, 0.04, MAT.SIGN, [1, 1, 1], 1.5, rng.float(), 2);
      if (rng.chance(0.5)) put(BOX, 0, 0.06, 2.05, 0.9, 0.3, 0.04, MAT.SIGN, [0.3, 0.6, 1.0], 1.6, rng.float(), 0);
    } else if (r < 0.68) {
      PROPS.planter(w, rng, put, 0); occupy(w, x, z);
      if (rng.chance(0.5)) { put(CYL, 0, 0, 1.4, 0.1, 1.9, 0.1, P, [0.09, 0.065, 0.045]); put(SPHERE, 0, 0, 2.6, 1.5, 1.3, 1.5, MAT.FOLIAGE, [0.05, 0.15, 0.06], 0, rng.float()); }
    } else if (r < 0.8) {
      put(CYL, 0, 0, 0.55, 0.06, 1.1, 0.06, P, [0.3, 0.3, 0.31], 0, SUB.METAL); put(BOX, 0, 0, 1.2, 0.2, 0.3, 0.14, P, [0.12, 0.12, 0.13], 0, SUB.METAL);
      put(BOX, 0, 0.08, 1.24, 0.12, 0.08, 0.01, MAT.EMISSIVE, [0.3, 1, 0.5], 2);
    } else if (r < 0.9) {
      for (let q = 0; q < rng.irange(1, 3); q++) { put(BOX, q * 0.55 - 0.3, 0, 0.6, 0.5, 1.0, 0.45, MAT.GLOSS, rng.pick(PAINT)); put(BOX, q * 0.55 - 0.3, 0.24, 0.75, 0.36, 0.4, 0.02, MAT.SIGN, [1, 1, 1], 0.5, rng.float(), 2); }
      occupy(w, x, z);
    } else {
      PROPS[rng.pick(['bike', 'bike', 'scooter', 'bags'])](w, rng, put, 0, F);
    }
  }
  // Litter: paper, cans and leaves gathered along the kerb and the building line.
  for (let t = a0; t < b0; t += rng.range(1.2, 4.5)) {
    const side = rng.chance(0.5) ? 1 : -1, [x, z] = at(t, side * (half + (rng.chance(0.5) ? rng.range(0.3, 0.7) : rng.range(1.6, 2.8))));
    if (w.surf(x, z) !== SURF.WALK || w.cell(x, z) === 1) continue;
    const r = rng.float();
    if (r < 0.5) primR(w, BOX, x, 0.012, z, rng.range(0.18, 0.34), 0.012, rng.range(0.14, 0.26), P, rng.pick([[0.42, 0.42, 0.4], [0.3, 0.26, 0.2], [0.36, 0.2, 0.16]]), 0, SUB.FABRIC, 0, 0, 0, rng.float() * 3);
    else if (r < 0.75) primR(w, CYL, x, 0.035, z, 0.07, 0.12, 0.07, P, rng.pick([[0.5, 0.1, 0.1], [0.4, 0.42, 0.44], [0.1, 0.3, 0.5]]), 0, SUB.METAL, 0, 0, 0, rng.float() * 3, HALF);
    else primR(w, SPHERE, x, 0.01, z, 0.14, 0.015, 0.09, P, [0.2, 0.14, 0.05], 0, SUB.FABRIC, 0, 0, 0, rng.float() * 3);
  }
  // Strings across the street: lanterns and pennants in the old quarters, bare wires elsewhere.
  if (k === 2) {
    for (let t = a0 + rng.range(2, 8); t < b0 - 2; t += rng.range(9, 18)) {
      const y = rng.range(6.2, 7.4), span = (half + 2) * 2, [x, z] = at(t, 0);
      box(w, x, y, z, vert ? span : 0.03, 0.03, vert ? 0.03 : span, P, DARK);
      if (!old || rng.chance(0.3)) continue;
      const lantern = rng.chance(0.5), col = rng.pick([[1.0, 0.3, 0.2], [1.0, 0.8, 0.5], [0.4, 0.9, 1.0]]);
      for (let o = -half - 1; o <= half + 1; o += lantern ? 1.7 : 0.9) {
        const [lx, lz] = at(t, o), sag = y - 0.3 - 0.4 * (1 - (o / (half + 1)) ** 2);
        if (lantern) prim(w, SPHERE, lx, sag, lz, 0.34, 0.44, 0.34, MAT.EMISSIVE, col, 2.8, rng.float());
        else primR(w, BOX, lx, sag, lz, vert ? 0.5 : 0.02, 0.5, vert ? 0.02 : 0.5, P, rng.pick(PAINT), 0.15, SUB.FABRIC);
      }
      if (lantern) light(w, x, y - 1, z, col, 13, 1.3);
    }
    // A lit gateway over one end of a shopping street.
    if (old && rng.chance(0.6)) {
      const t = rng.chance(0.5) ? a0 + 1 : b0 - 1, col = rng.pick(NEON), [x, z] = at(t, 0);
      for (const side of [-1, 1]) { const [px, pz] = at(t, side * (half + 0.6)); cyl(w, px, 0, 6.4, pz, 0.16, P, [0.3, 0.06, 0.05], 0, SUB.METAL); const [cx, cz] = at(t, side * (half + 0.6)); if (w.cell(cx, cz) === 0) w.fillRect(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5, 1); }
      box(w, x, 6.2, z, vert ? half * 2 + 2 : 0.3, 0.3, vert ? 0.3 : half * 2 + 2, P, [0.3, 0.06, 0.05], 0, SUB.METAL);
      box(w, x, 5.35, z, vert ? half * 2 - 0.4 : 0.2, 1.2, vert ? 0.2 : half * 2 - 0.4, MAT.SIGN, col, 4.6, rng.float(), 0);
      for (const o of [-half * 0.6, half * 0.6]) { const [lx, lz] = at(t, o); prim(w, SPHERE, lx, 4.35, lz, 0.4, 0.55, 0.4, MAT.EMISSIVE, [1.0, 0.3, 0.2], 3, rng.float()); }
      light(w, x, 4.6, z, col, 16, 1.6);
    }
  }
  // Traffic: vans, trucks and taxis stopped at the kerb; wrecks and barricades where the city has fallen.
  const n = rng.int(k === 3 ? 4 : 3);
  for (let q = 0; q < n; q++) { const [x, z] = at(rng.irange(a0 + 6, b0 - 6), (rng.chance(0.5) ? 1 : -1) * (half - 1.4)); vehicle(w, rng, x, z, vert, rng.pick(['van', 'truck', 'taxi', 'taxi', 'van'])); }
  if (zone >= 2) {
    for (let q = 0; q < zone - 1; q++) if (rng.chance(0.55)) { const [x, z] = at(rng.irange(a0 + 6, b0 - 6), rng.range(-half + 2, half - 2)); wreck(w, rng, x, z); }
    if (rng.chance(0.25 * (zone - 1))) {
      // An abandoned cordon: hazard barriers part way across, a floodlight left running.
      const t = rng.irange(a0 + 4, b0 - 4), gap = rng.irange(-1, 1);
      for (let o = -half + 1; o <= half - 1; o += 2.3) {
        if (Math.abs(o - gap * 2.3) < 1.2) continue;
        const [x, z] = at(t + rng.range(-0.3, 0.3), o);
        if (!w.circleFree(x, z, 1.2)) continue;
        primR(w, BOX, x, 0.45, z, vert ? 2.0 : 0.5, 0.9, vert ? 0.5 : 2.0, P, [0.75, 0.5, 0.05], 0, SUB.HAZARD, 0, 0, 0, rng.range(-0.15, 0.15));
        w.fillRect(x - (vert ? 1 : 0.5), z - (vert ? 0.5 : 1), x + (vert ? 1 : 0.5), z + (vert ? 0.5 : 1), 2);
      }
      const [lx, lz] = at(t + 1.5, -half - 0.6);
      cyl(w, lx, 0, 3.4, lz, 0.06, P, STEEL, 0, SUB.METAL); box(w, lx, 3.5, lz, 0.6, 0.4, 0.6, MAT.EMISSIVE, [1.0, 0.95, 0.8], 5);
      light(w, lx, 3.2, lz, [1.0, 0.92, 0.78], 20, 1.8);
    }
  }
}

// ---------------------------------------------------------------- canal and rail
export function dressQuay(w, rng, canalX, bridges) {
  const S = w.size, clear = (z, m) => !bridges.some((b) => Math.abs(b.z - z) < m);
  for (const s of [-1, 1]) {
    const qx = canalX + s * 15.2;
    for (let z = 8; z < S - 8; z += 4) {
      if (!clear(z, 6)) continue;
      // Mooring bollards along the edge, a lamp every fifth.
      const k = Math.round(z / 4);
      if (k % 5 === 0) {
        cyl(w, qx + s * 1.2, 0, 4.6, z, 0.07, P, [0.07, 0.075, 0.08]); ball(w, qx + s * 1.2, 4.75, z, 0.24, MAT.EMISSIVE, WARM, 5);
        if (k % 10 === 0) light(w, qx + s * 1.2, 4.4, z, WARM, 16, 1.5);
      } else if (k % 2 === 0) { cyl(w, qx, 0, 0.5, z, 0.16, P, [0.1, 0.1, 0.11], 0, SUB.METAL); cyl(w, qx, 0.5, 0.58, z, 0.22, P, [0.1, 0.1, 0.11], 0, SUB.METAL); }
      if (rng.chance(0.1)) {
        const F = freeFrame(qx + s * 1.6, z, s > 0 ? HALF : -HALF), put = kit(w, F);
        const name = rng.pick(['crates', 'drum', 'pallet', 'bags', 'gas']), cx = Math.floor(qx + s * 1.6) + 0.5, cz = Math.floor(z) + 0.5;
        if (w.cell(cx, cz) === 0 && w.surf(cx, cz) === SURF.WALK) { PROPS[name](w, rng, put, 0, F); occupy(w, cx, cz); }
      }
    }
    // Skiffs tied up below the quay wall.
    for (let z = 20; z < S - 20; z += rng.irange(22, 44)) {
      if (!clear(z, 10)) continue;
      const bx = canalX + s * 11.4, col = rng.pick([[0.3, 0.3, 0.32], [0.1, 0.2, 0.3], [0.32, 0.12, 0.08], [0.4, 0.4, 0.36]]);
      box(w, bx, 0.28, z, 1.9, 0.6, 5.4, MAT.GLOSS, col);
      prim(w, WEDGE, bx, 0.28, z + 3.2, 1.9, 0.6, 1.0, MAT.GLOSS, col);
      box(w, bx, 0.62, z - 0.6, 1.6, 0.06, 0.3, P, WOOD, 0, SUB.TIMBER);
      box(w, bx, 0.75, z - 2.2, 0.5, 0.5, 0.4, P, DARK, 0, SUB.METAL);
      if (rng.chance(0.5)) box(w, bx, 0.75, z + 0.8, 1.4, 0.4, 1.8, P, rng.pick(CLOTH), 0, SUB.FABRIC);
      ball(w, bx, 1.1, z + 2.6, 0.1, MAT.EMISSIVE, [1, 0.6, 0.2], 4, rng.float());
    }
  }
  // Channel markers out in the water.
  for (let z = 30; z < S - 30; z += rng.irange(40, 70)) {
    if (!clear(z, 12)) continue;
    const bx = canalX + rng.range(-3, 3), red = rng.chance(0.5);
    cyl(w, bx, 0, 0.7, z, 0.4, P, red ? [0.5, 0.08, 0.06] : [0.08, 0.36, 0.14], 0, SUB.METAL);
    cyl(w, bx, 0.7, 1.9, z, 0.06, P, DARK); ball(w, bx, 2.0, z, 0.14, MAT.EMISSIVE, red ? [1, 0.12, 0.08] : [0.1, 1, 0.4], 6, rng.float(), 1);
  }
}

export function dressRail(w, rng, railZ, canalX) {
  const S = w.size;
  // Catenary: portal masts over the deck with the wire slung between them, and signals.
  for (let x = 18; x < S - 6; x += 24) {
    for (const s of [-1, 1]) box(w, x, 13.2, railZ + s * 3.6, 0.18, 5.2, 0.18, P, [0.2, 0.21, 0.22], 0, SUB.METAL);
    box(w, x, 15.7, railZ, 0.16, 0.16, 7.4, P, [0.2, 0.21, 0.22], 0, SUB.METAL);
    for (const o of [-1.7, 1.7]) box(w, x, 15.2, railZ + o, 0.06, 0.9, 0.06, P, DARK);
    if ((x / 24 | 0) % 3 === 0) { box(w, x + 0.3, 12.2, railZ - 3.3, 0.3, 0.8, 0.3, P, DARK); ball(w, x + 0.3, 12.4, railZ - 3.12, 0.1, MAT.EMISSIVE, rng.chance(0.5) ? [1, 0.12, 0.08] : [0.1, 1, 0.4], 6); }
  }
  for (let x = 50; x < S; x += 100) {
    for (const o of [-1.7, 1.7]) { box(w, x, 14.75, railZ + o, 100, 0.03, 0.03, P, DARK); box(w, x, 10.25, railZ + o - 0.72, 100, 0.14, 0.08, P, [0.3, 0.3, 0.31], 0, SUB.METAL); box(w, x, 10.25, railZ + o + 0.72, 100, 0.14, 0.08, P, [0.3, 0.3, 0.31], 0, SUB.METAL); }
    // Service conduits and drain pipes under the deck.
    for (const o of [-3.2, 3.2]) primR(w, CYL, x, 8.75, railZ + o, 0.22, 100, 0.22, P, [0.2, 0.17, 0.14], 0, SUB.METAL, 0, 0, 0, 0, 0, HALF);
  }
  // Posters and hazard bands on the pillars, lamps slung under the deck.
  for (let x = 30; x < S - 20; x += 24) {
    if (Math.abs(x - canalX) < 16) continue;
    const px = Math.floor(x);
    if (w.cell(px, railZ) !== 1) continue;
    cyl(w, px, 0.05, 1.0, railZ, 0.78, P, [0.75, 0.5, 0.05], 0, SUB.HAZARD);
    for (const s of [-1, 1]) box(w, px, 2.1, railZ + s * 0.78, 0.8, 1.1, 0.04, MAT.SIGN, [1, 1, 1], 0.5, rng.float(), 2);
    box(w, px + 12, 8.7, railZ, 1.6, 0.1, 0.4, MAT.EMISSIVE, [0.75, 0.88, 1.0], 5);
    if ((px / 24 | 0) % 2 === 0) light(w, px + 12, 8, railZ, [0.7, 0.85, 1.0], 20, 1.4);
  }
}

// ---------------------------------------------------------------- landmarks
// The Shelter: a held position. Barriers, tents, floodlights, stacked supplies.
export function dressShelter(w, rng, ix, iz) {
  const solid = (x, z, hw, hd) => w.fillRect(x - hw, z - hd, x + hw, z + hd, 2);
  // Barrier arcs on the plaza edge, open to the north walk and the four diagonals.
  for (let k = 0; k < 28; k++) {
    const a = k / 28 * 6.283, x = ix + Math.cos(a) * 22.5, z = iz + Math.sin(a) * 22.5;
    if (Math.abs(x - ix) < 5 && z < iz) continue;
    if (k % 7 === 3 || !w.circleFree(x, z, 1.3)) continue;
    primR(w, BOX, x, 0.5, z, 4.4, 1.0, 0.6, P, k % 2 ? [0.75, 0.5, 0.05] : CONCRETE, 0, k % 2 ? SUB.HAZARD : SUB.WALL, 0, 0, 0, -a + HALF);
    solid(x, z, 1, 1);
    if (k % 4 === 0) { cyl(w, x, 1.0, 1.5, z, 0.05, P, STEEL); ball(w, x, 1.6, z, 0.12, MAT.EMISSIVE, [1, 0.6, 0.1], 5, rng.float(), 1); }
  }
  // Two tents with cots and crates.
  for (const [dx, dz, col] of [[-15, -6, [0.16, 0.2, 0.16]], [14, 6, [0.2, 0.2, 0.22]]]) {
    const x = ix + dx, z = iz + dz;
    prim(w, WEDGE, x, 2.8, z + 1.5, 6, 1.2, 3, P, col, 0, SUB.FABRIC);
    prim(w, WEDGE, x, 2.8, z - 1.5, 6, 1.2, 3, P, col, 0, SUB.FABRIC, 0, 0, 0, Math.PI);
    for (const a of [-2.9, 2.9]) for (const b of [-2.9, 2.9]) cyl(w, x + a, 0, 2.2, z + b, 0.05, P, STEEL, 0, SUB.METAL);
    box(w, x, 1.1, z - 3, 6, 2.2, 0.04, P, col, 0, SUB.FABRIC);
    box(w, x - 1.5, 0.3, z - 1.6, 1.9, 0.12, 0.8, P, [0.3, 0.32, 0.3], 0, SUB.FABRIC); box(w, x + 1.2, 0.3, z - 1.6, 1.9, 0.12, 0.8, P, [0.3, 0.32, 0.3], 0, SUB.FABRIC);
    box(w, x + 2, 0.4, z + 1.6, 1.0, 0.8, 0.8, P, [0.14, 0.18, 0.14], 0, SUB.METAL); solid(x + 2, z + 1.6, 0.5, 0.5);
    ball(w, x, 2.5, z, 0.14, MAT.EMISSIVE, WARM, 5);
    light(w, x, 2.3, z, WARM, 9, 1.4);
  }
  // Floodlight masts and a generator.
  for (const [dx, dz] of [[-16, 12], [16, -12]]) {
    const x = ix + dx, z = iz + dz;
    cyl(w, x, 0, 8.5, z, 0.1, P, STEEL, 0, SUB.METAL); solid(x, z, 0.5, 0.5);
    for (const o of [-0.5, 0.5]) box(w, x + o, 8.5, z, 0.7, 0.5, 0.3, MAT.EMISSIVE, [0.9, 0.95, 1.0], 6);
    light(w, x, 7.5, z - Math.sign(dz) * 4, [0.8, 0.9, 1.0], 26, 1.6);
  }
  const gx = ix + 12.5, gz = iz + 13.5;
  box(w, gx, 0.7, gz, 2.2, 1.4, 1.2, P, [0.36, 0.3, 0.06], 0, SUB.METAL); solid(gx, gz, 1.1, 0.6);
  box(w, gx, 1.0, gz + 0.61, 0.5, 0.3, 0.02, MAT.EMISSIVE, [0.2, 1, 0.4], 2.4, rng.float());
  w.blocks[w.blockIndex(gx, gz)].vents.push({ x: gx - 0.8, z: gz, y: 1.5 });
  // Supply stacks, a map table, a flag.
  for (const [dx, dz] of [[-6, 17], [-3, 18], [7, 17], [-18, 1], [19, 2]]) {
    const x = Math.floor(ix + dx) + 0.5, z = Math.floor(iz + dz) + 0.5;
    if (w.cell(x, z) !== 0) continue;
    const F = freeFrame(x, z, rng.float() * 6.283), put = kit(w, F);
    PROPS[rng.pick(['crates', 'drum', 'pallet', 'crates'])](w, rng, put, 0, F); occupy(w, x, z);
  }
  box(w, ix + 6, 0.85, iz + 5, 2.2, 0.08, 1.2, P, STEEL, 0, SUB.METAL); solid(ix + 6, iz + 5, 1.1, 0.6);
  for (const [a, b] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]]) cyl(w, ix + 6 + a, 0, 0.85, iz + 5 + b, 0.04, P, STEEL, 0, SUB.METAL);
  box(w, ix + 6, 0.91, iz + 5, 1.8, 0.02, 1.0, MAT.HOLO, [0.3, 0.8, 1.0], 1.6, rng.float());
  cyl(w, ix - 9, 5.4, 9.5, iz - 9, 0.05, P, STEEL, 0, SUB.METAL);
  box(w, ix - 8.1, 8.8, iz - 9, 1.8, 1.1, 0.03, P, [0.1, 0.3, 0.5], 0.2, SUB.FABRIC);
  box(w, ix, 4.2, iz - 10.4, 9, 1.3, 0.2, MAT.SIGN, [0.4, 0.8, 1.0], 4, rng.float(), 0);
}

// An extraction site: a marked pad with chevrons, barriers and a beacon mast.
export function dressExtract(w, rng, x, z, idx) {
  const green = [0.2, 1.0, 0.45];
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * 6.283, px = x + Math.cos(a) * 6.3, pz = z + Math.sin(a) * 6.3;
    primR(w, BOX, px, 0.03, pz, 1.6, 0.05, 0.24, MAT.EMISSIVE, green, k % 2 ? 1.2 : 2.6, k / 16, 0, 0, 0, -a + HALF);
  }
  for (let k = 0; k < 4; k++) { const a = k * HALF; primR(w, BOX, x + Math.cos(a) * 2.6, 0.03, z + Math.sin(a) * 2.6, 2.2, 0.05, 0.3, MAT.EMISSIVE, green, 1.5, 0, 0, 0, 0, -a); }
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * 6.283 + 0.5, px = x + Math.cos(a) * 12.5, pz = z + Math.sin(a) * 12.5;
    if (!w.circleFree(px, pz, 1.4)) continue;
    primR(w, BOX, px, 0.45, pz, 2.6, 0.9, 0.5, P, [0.75, 0.5, 0.05], 0, SUB.HAZARD, 0, 0, 0, -a + HALF);
    w.fillRect(px - 0.8, pz - 0.8, px + 0.8, pz + 0.8, 2);
  }
  const mx = x + 10.5, mz = z + 8.5;
  if (w.circleFree(mx, mz, 0.8)) {
    cyl(w, mx, 0, 9, mz, 0.09, P, STEEL, 0, SUB.METAL); w.fillRect(mx - 0.5, mz - 0.5, mx + 0.5, mz + 0.5, 2);
    ball(w, mx, 9.2, mz, 0.22, MAT.EMISSIVE, green, 7, rng.float(), 1);
    prim(w, SPHERE, mx, 7.2, mz + 0.3, 0.9, 0.9, 0.3, P, PALE, 0, SUB.METAL);
    box(w, mx, 3.0, mz + 0.1, 1.4, 0.9, 0.06, MAT.SIGN, green, 3, rng.float() + idx, 0);
  }
}

// The lair: ribs of biomass arching in over the rim, cocoons on the pillars, wreckage.
export function dressArena(w, rng, A) {
  for (let k = 0; k < 22; k++) {
    const a = k / 22 * 6.283 + rng.range(-0.05, 0.05), r = A.r + 2.2, x = A.x + Math.cos(a) * r, z = A.z + Math.sin(a) * r;
    if (Math.abs(Math.sin(a) - 1) < 0.08) continue;                   // leave the approach open
    const hgt = rng.range(5, 9.5), lean = rng.range(0.25, 0.5);
    primR(w, CYL, x - Math.cos(a) * hgt * 0.2, hgt / 2, z - Math.sin(a) * hgt * 0.2, 0.7, hgt, 0.55, MAT.ORGANIC, FLESH, 1.0, rng.float(), 0, 0, 0, -a - HALF, lean);
    ball(w, x, 0.5, z, rng.range(0.9, 1.6), MAT.ORGANIC, FLESH, 1.2, rng.float(), 0.7);
    if (k % 3 === 0) ball(w, x - Math.cos(a) * hgt * 0.42, hgt * 0.92, z - Math.sin(a) * hgt * 0.42, 0.35, MAT.ORGANIC, [0.95, 0.35, 0.55], 3.2, rng.float());
  }
  for (const p of A.pillars) {
    for (let q = 0; q < 2; q++) { const a = rng.float() * 6.283; prim(w, SPHERE, p.x + Math.cos(a) * 1.0, rng.range(2.5, 5.5), p.z + Math.sin(a) * 1.0, 0.9, 1.5, 0.9, MAT.ORGANIC, FLESH, 1.5, rng.float()); }
    for (let q = 0; q < 3; q++) { const a = rng.float() * 6.283; primR(w, CYL, p.x + Math.cos(a) * 1.1, rng.range(0.6, 3), p.z + Math.sin(a) * 1.1, 0.16, rng.range(2, 5), 0.16, MAT.ORGANIC, FLESH, 0.8, rng.float(), 0, 0, 0, a, rng.range(-0.3, 0.3)); }
  }
  // Rubble and wrecks pushed to the edge.
  for (let k = 0; k < 26; k++) {
    const a = rng.float() * 6.283, r = A.r * rng.range(0.78, 0.98), x = A.x + Math.cos(a) * r, z = A.z + Math.sin(a) * r, s = rng.range(0.3, 1.1);
    primR(w, BOX, x, s * 0.3, z, s, s * 0.7, s * 0.8, P, CONCRETE, 0, SUB.WALL, 0, 0, 0, rng.float() * 3, rng.range(-0.4, 0.4), rng.range(-0.4, 0.4));
  }
}

// ---------------------------------------------------------------- interiors
// Soft furnishing that does not block: rugs, pendant lamps, wall shelves, pictures.
export function dressInterior(w, rng, x0, z0, x1, z1, use, place) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, bw = x1 - x0, bd = z1 - z0;
  box(w, cx, 0.06, cz, Math.min(bw - 5, 5), 0.02, Math.min(bd - 5, 3.4), P, rng.pick(CLOTH), 0, SUB.FABRIC);
  for (let x = x0 + 3.5; x < x1 - 2.5; x += 5) for (let z = z0 + 3.5; z < z1 - 2.5; z += 5) {
    cyl(w, x, 2.95, 3.9, z, 0.015, P, DARK);
    prim(w, CONE, x, 2.9, z, 0.6, 0.3, 0.6, P, use === 'bar' ? [0.4, 0.1, 0.08] : [0.2, 0.2, 0.21], 0, SUB.METAL);
    ball(w, x, 2.78, z, 0.09, MAT.EMISSIVE, use === 'office' ? [0.8, 0.9, 1.0] : WARM, 5);
  }
  // Shelving and pictures on the inner faces of the north and west walls.
  for (let x = x0 + 2.2; x < x1 - 2.2; x += rng.range(2.4, 4.2)) {
    if (w.cell(x - 0.8, z0 + 0.5) !== 1 || w.cell(x + 0.8, z0 + 0.5) !== 1 || w.cell(x, z0 + 1.5) === 1) continue;
    if (rng.chance(0.5)) {
      box(w, x, 1.55, z0 + 1.18, 1.5, 0.05, 0.34, P, WOOD, 0, SUB.TIMBER);
      for (let q = -2; q <= 2; q++) if (rng.chance(0.7)) box(w, x + q * 0.28, 1.72, z0 + 1.18, 0.16, rng.range(0.18, 0.32), 0.18, use === 'bar' ? MAT.GLOSS : P, rng.pick(use === 'bar' ? [[0.1, 0.3, 0.14], [0.4, 0.2, 0.05], [0.3, 0.3, 0.34]] : PAINT));
    } else box(w, x, 1.8, z0 + 1.03, 0.8, 1.0, 0.03, MAT.SIGN, [1, 1, 1], 0.5, rng.float(), 2);
  }
  for (let z = z0 + 2.2; z < z1 - 2.2; z += rng.range(2.6, 4.4)) {
    if (w.cell(x0 + 0.5, z - 0.5) !== 1 || w.cell(x0 + 0.5, z + 0.5) !== 1 || w.cell(x0 + 1.5, z) === 1) continue;
    box(w, x0 + 1.03, 1.8, z, 0.03, 0.9, 0.8, MAT.SIGN, [1, 1, 1], 0.5, rng.float(), 2);
  }
  // A plant in a corner and something particular to the use.
  const plant = (x, z) => { if (place(x - 0.5, z - 0.5, 1, 1)) { cyl(w, x, 0, 0.45, z, 0.22, P, [0.2, 0.2, 0.22]); prim(w, CONE, x, 1.1, z, 0.8, 1.4, 0.8, MAT.FOLIAGE, [0.05, 0.17, 0.07], 0, rng.float()); } };
  plant(Math.floor(x1 - 2) + 0.5, Math.floor(z1 - 2) + 0.5);
  if (use === 'shop') {
    const x = Math.floor(x0 + 2), z = Math.floor(z1 - 3);
    if (place(x, z, 2, 1)) { box(w, x + 1, 0.5, z + 0.5, 2, 1.0, 0.8, P, [0.22, 0.22, 0.24], 0, SUB.METAL); box(w, x + 0.5, 1.15, z + 0.5, 0.4, 0.3, 0.4, P, DARK); box(w, x + 0.5, 1.2, z + 0.71, 0.3, 0.16, 0.02, MAT.EMISSIVE, [0.3, 1, 0.5], 2, rng.float()); }
  } else if (use === 'bar') {
    for (let k = 0; k < 2; k++) {
      const x = Math.floor(x0 + 3 + k * 3) + 0.5, z = Math.floor(z1 - 3) + 0.5;
      if (!place(x - 0.5, z - 0.5, 1, 1)) continue;
      cyl(w, x, 0, 0.72, z, 0.05, P, STEEL, 0, SUB.METAL); cyl(w, x, 0.72, 0.77, z, 0.5, P, WOOD, 0, SUB.TIMBER);
      for (const [a, b] of [[-0.8, 0], [0.8, 0]]) { cyl(w, x + a, 0, 0.45, z + b, 0.17, P, [0.3, 0.07, 0.07], 0, SUB.RUBBER); }
      ball(w, x, 0.88, z, 0.07, MAT.EMISSIVE, WARM, 3, rng.float());
    }
  } else if (use === 'office') {
    const x = Math.floor(x1 - 3), z = Math.floor(z0 + 2);
    if (place(x, z, 1, 2)) { box(w, x + 0.5, 0.9, z + 1, 0.7, 1.8, 1.6, P, [0.26, 0.27, 0.28], 0, SUB.METAL); for (let q = 0; q < 6; q++) ball(w, x + 0.86, 0.5 + (q % 3) * 0.5, z + 0.6 + (q > 2 ? 0.8 : 0), 0.03, MAT.EMISSIVE, rng.chance(0.5) ? [0.2, 1, 0.4] : [1, 0.5, 0.1], 4, rng.float()); }
  } else {
    const x = Math.floor(x1 - 3), z = Math.floor(z1 - 5);
    if (place(x, z, 1, 1)) { box(w, x + 0.5, 0.95, z + 0.5, 0.75, 1.9, 0.7, MAT.GLOSS, [0.75, 0.77, 0.8]); }
    box(w, cx, 1.5, z0 + 1.05, 1.5, 0.85, 0.05, MAT.HOLO, [0.4, 0.6, 1.0], 1.2, rng.float());
  }
}

// ---------------------------------------------------------------- open lots
// Chain-link around a yard, with a gap left for the way in.
export function fenceRect(w, rng, x0, z0, x1, z1, gaps = 2) {
  const col = [0.3, 0.31, 0.32];
  const run = (ax, az, bx, bz) => {
    const horiz = az === bz, len = horiz ? bx - ax : bz - az;
    const gapAt = rng.range(0.2, 0.7) * len, gw = 4;
    for (const [s, e] of gaps > 0 ? [[0, gapAt], [gapAt + gw, len]] : [[0, len]]) {
      if (e - s < 1) continue;
      const m = (s + e) / 2;
      if (horiz) { box(w, ax + m, 1.1, az, e - s, 2.2, 0.05, P, col, 0, SUB.BARS, 2); w.fillRect(ax + s, az - 0.5, ax + e, az + 0.5, 2); }
      else { box(w, ax, 1.1, az + m, 0.05, 2.2, e - s, P, col, 0, SUB.BARS, 2); w.fillRect(ax - 0.5, az + s, ax + 0.5, az + e, 2); }
    }
  };
  run(x0, z0, x1, z0); run(x0, z1, x1, z1); run(x0, z0, x0, z1); run(x1, z0, x1, z1);
}
// A food stall: counter, canopy, lantern row and stools.
export function stall(w, rng, x, z, yaw) {
  if (!w.circleFree(x, z, 2)) return false;
  const F = freeFrame(x, z, yaw), put = kit(w, F), col = rng.pick(CLOTH), nc = rng.pick(NEON);
  put(BOX, 0, 0, 0.5, 2.8, 1.0, 1.0, P, WOOD, 0, SUB.TIMBER);
  put(BOX, 0, 0, 1.03, 3.0, 0.06, 1.2, P, STEEL, 0, SUB.METAL);
  for (const a of [-1.4, 1.4]) for (const b of [-0.5, 0.6]) put(CYL, a, b, 1.25, 0.06, 2.5, 0.06, P, WOOD, 0, SUB.TIMBER);
  put(WEDGE, 0, 0.35, 2.7, 3.3, 0.5, 2.0, P, col, 0, SUB.FABRIC);
  put(BOX, 0, 0.66, 2.2, 2.6, 0.4, 0.05, MAT.SIGN, nc, 3.4, rng.float(), 0);
  for (let q = -1; q <= 1; q++) put(SPHERE, q * 0.95, 0.9, 2.0, 0.3, 0.4, 0.3, MAT.EMISSIVE, [1.0, 0.3, 0.2], 2.6, rng.float());
  for (let q = -1; q <= 1; q++) put(CYL, q * 0.8, 1.15, 0.24, 0.3, 0.48, 0.3, P, [0.3, 0.07, 0.07], 0, SUB.RUBBER);
  for (let q = 0; q < 3; q++) put(CYL, rng.range(-1.1, 1.1), rng.range(-0.3, 0.3), 1.16, 0.2, 0.2, 0.2, P, [0.5, 0.5, 0.52], 0, SUB.METAL);
  const [fx, fz] = F.P(0, 0);
  w.fillRect(fx - 1, fz - 1, fx + 1, fz + 1, 2);
  const [lx, lz] = F.P(0, 1.4);
  light(w, lx, 2.2, lz, [1.0, 0.6, 0.35], 10, 1.6);
  w.blocks[w.blockIndex(fx, fz)].vents.push({ x: fx, z: fz, y: 1.2 });
  return true;
}
export { vehicle, PROPS, kit };
