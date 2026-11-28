// Meridian district recipes. Each deployment loads one 500 m sheet at a time.
import { Rng } from '../core/rng.js';
import { MAT, SUB, SHAPE, SURF, STYLE, box, cyl, ball, primR, light } from './emit.js';
import { stall } from './dress.js';

export const DISTRICTS = {
  city: { name: 'Spindle Ward', features: [] },
  homes: { name: 'Lintel Courts', features: ['court', 'snacks', 'villas'] },
  fringe: { name: 'Alder Spillbank', features: ['grove'] },
  harbor: { name: 'Sounding Basin', features: ['factory', 'apron', 'stacks'] },
};
const LANDINGS = {
  55: { name: 'Porter Nook', cover: SUB.BARS, height: 2.1, col: [0.16, 0.18, 0.2] },
  150: { name: 'Fern Steps', cover: SUB.PLANTER, height: 0.9, col: [0.19, 0.18, 0.16] },
  250: { name: 'Switchglass Bay', cover: SUB.METAL, height: 1.7, col: [0.18, 0.24, 0.22] },
  345: { name: 'Ochre Siding', cover: SUB.CORRUGATED, height: 2.3, col: [0.32, 0.22, 0.14] },
};
export function landingFor(seed) {
  const x = new Rng(seed).fork('landing').pick(Object.keys(LANDINGS).map(Number));
  return { x, ...LANDINGS[x] };
}
export const PASSAGE = 'Ledger Crossing';
// Start guesses: one minute of director heat per crossing; no change to curfew.
export const CROSSING_SECONDS = 60;
export function districtPlan(seed) {
  const order = new Rng(seed).fork('district itinerary').shuffle(Object.keys(DISTRICTS));
  return [{ preset: order[0], seed }, { preset: order[1], seed: new Rng(seed).fork('far bank').s }];
}

export function parcelStyle(preset, base) {
  if (preset === 'homes') return STYLE.OLDTOWN;
  if (preset === 'harbor') return STYLE.DOCK;
  if (preset === 'fringe') return base === STYLE.DOCK ? base : STYLE.OLDTOWN;
  return base;
}

// Book the named lots before ordinary infill, without displacing authored interiors,
// the lair or exits. Each candidate fronts a public street. Keep the entry coordinate
// and footprint as hooks for later interior and vegetation passes.
export function planParcels(w, net, scenes, bounds, reserved, rng) {
  const lots = [];
  for (let i = 0; i < net.xs.length - 1; i++) for (let j = 0; j < net.zs.length - 1; j++) {
    const b = bounds(i, j), key = i * 1000 + j;
    if (!b || scenes.has(key) || reserved(w, b.x0, b.z0, b.x1, b.z1) || Math.min(b.x1 - b.x0, b.z1 - b.z0) < 25) continue;
    const roads = [net.h[j][i], net.h[j + 1][i], net.v[i][j], net.v[i + 1][j]];
    if (Math.max(...roads) < 2) continue;
    lots.push({ ...b, key, side: roads.indexOf(Math.max(...roads)) });
  }
  rng.shuffle(lots);
  const recipe = DISTRICTS[w.preset].features, book = new Map();
  for (let i = 0; i < lots.length; i++) {
    const L = lots[i];
    const kind = recipe[i] || (w.preset === 'fringe' ? 'grove' : w.preset === 'harbor' && i % 2 === 0 ? 'stacks' : w.preset === 'homes' && i % 3 === 0 ? 'court' : null);
    if (kind) book.set(L.key, { ...L, kind, named: i < recipe.length });
  }
  return book;
}

const NAMES = { court: 'Hemlock Close', snacks: 'Kettle Walk', villas: 'Sparrow Mews', grove: 'Rill Garden', factory: 'Gauge House', apron: 'Lantern Apron', stacks: 'Seal Yard' };
const stone = [0.22, 0.23, 0.21], steel = [0.16, 0.2, 0.21], warm = [1, 0.66, 0.33];
function grove(w, rng, x0, z0, x1, z1, cx, cz) {
  w.paint(x0, z0, x1, z1, SURF.GRASS);
  w.paint(cx - 2, z0, cx + 2, z1, SURF.WALK); w.paint(x0, cz - 2, x1, cz + 2, SURF.WALK);
  for (let i = 0; i < (x1 - x0) * (z1 - z0) / 52; i++) {
    const x = rng.range(x0 + 3, x1 - 3), z = rng.range(z0 + 3, z1 - 3);
    if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4 || !w.circleFree(x, z, 2)) continue;
    const h = rng.range(3, 8), broad = rng.range(1.3, 2.6), leaf = rng.pick([[0.075, 0.16, 0.085], [0.12, 0.19, 0.09], [0.10, 0.22, 0.16]]);
    cyl(w, x, 0, h, z, h * 0.04, MAT.PLAIN, [0.12, 0.1, 0.08], 0, SUB.BARK);
    w.fillRect(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1);
    const crown = rng.range(0, 6.28);
    for (let k = 0; k < 5; k++) {
      const a = crown + 2.4 * k, reach = broad * (1 - k * 0.14), dx = Math.cos(a) * reach, dz = Math.sin(a) * reach;
      primR(w, SHAPE.CYL, x + dx / 2, h - 0.8 + k * 0.33, z + dz / 2, 0.17, Math.hypot(1.6, reach), 0.17, MAT.PLAIN, stone, 0, SUB.BARK, 0, 0, 0, Math.atan2(dx, dz), Math.atan2(reach, 1.6));
      const sprig = broad * rng.range(0.56, 0.83);
      const hue = leaf.map(c => c * (0.8 + k * 0.08));
      ball(w, x + dx, h + k * 0.36, z + dz, sprig, MAT.FOLIAGE, hue, 0, rng.float(), 0.6);
      ball(w, x + dx * 0.61, h + k * 0.36 + 0.34, z + dz * 0.61, sprig * 0.86, MAT.FOLIAGE, hue, 0, rng.float(), 0.64);
    }
    for (let k = 0; k < 5; k++) {
      const a = rng.range(0, 6.28), reach = rng.range(0.9, 2.3);
      const px = x + Math.sin(a) * reach, pz = z + Math.cos(a) * reach;
      primR(w, SHAPE.CONE, px, 0.34, pz, 0.45, rng.range(0.65, 1.05), 0.32, MAT.FOLIAGE, leaf, 0, rng.float(), 0, 0, 0, a, 0.4);
    }
  }
}

export function buildParcel(w, rng, L, K) {
  const { x0, x1, z0, z1, kind, side } = L, cx = Math.floor((x0 + x1) / 2), cz = Math.floor((z0 + z1) / 2);
  const entry = { x: side === 2 ? x0 + 1 : side === 3 ? x1 - 1 : cx, z: side === 0 ? z0 + 1 : side === 1 ? z1 - 1 : cz };
  const home = (...r) => K.addBuilding(w, rng, ...r, STYLE.OLDTOWN, false);
  w.paint(x0, z0, x1, z1, SURF.PLAZA);
  switch (kind) {
    case 'court': case 'villas': {
      const inset = kind === 'villas' ? 3 : 1, gap = kind === 'villas' ? 5 : 3;
      if (kind === 'villas') w.paint(x0, z0, x1, z1, SURF.GRASS);
      w.paint(cx - gap, z0, cx + gap, z1, SURF.ALLEY); w.paint(x0, cz - gap, x1, cz + gap, SURF.WALK);
      for (const [a, b] of [[x0 + inset, cx - gap], [cx + gap, x1 - inset]]) for (const [c, d] of [[z0 + inset, cz - gap], [cz + gap, z1 - inset]]) {
        const xEnd = kind === 'villas' ? Math.min(b, a + 14) : b, zEnd = kind === 'villas' ? Math.min(d, c + 13) : d;
        home(a, c, xEnd, zEnd);
        if (kind === 'court') {
          // Stacked balconies face the small shared court. Both ground passages stay open.
          const face = c < cz ? zEnd : c, dir = c < cz ? 1 : -1;
          for (let x = a + 3; x < xEnd - 2; x += 6) for (const y of [3.2, 5.9]) {
            box(w, x, y, face + dir * 0.55, 3.6, 0.16, 1.1, MAT.PLAIN, stone);
            box(w, x, y + 0.55, face + dir, 3.6, 0.88, 0.1, MAT.PLAIN, steel, 0, SUB.BARS);
          }
        }
      }
      K.tree(w, rng, cx - gap + 0.5, cz + gap - 0.5);
      break;
    }
    case 'snacks': {
      // A narrow food lane opening onto a paved court. Both ends stay open.
      for (let z = z0 + 5; z < z1 - 4; z += 6) for (const s of [-1, 1]) {
        stall(w, rng, cx + s * 6, z, -s * Math.PI / 2);
        if (s < 0) { box(w, cx, 4.4, z, 13, 0.04, 0.04, MAT.PLAIN, steel); ball(w, cx + 2, 4.0, z, 0.26, MAT.EMISSIVE, warm, 3); }
      }
      break;
    }
    case 'grove': grove(w, rng, x0, z0, x1, z1, cx, cz); break;
    case 'stacks': K.containerYard(w, rng, x0 + 2, z0 + 2, x1 - 2, z1 - 2); break;
    case 'factory': {
      // Through-shed: a clear aisle between machine beds, with daylight at both ends.
      const hx = Math.min(16, cx - x0 - 3), hz = Math.min(24, cz - z0 - 3);
      box(w, cx, 8, cz, 2 * hx, 0.45, 2 * hz, MAT.PLAIN, steel, 0, SUB.CORRUGATED);
      for (const s of [-1, 1]) for (let z = cz - hz + 2; z < cz + hz; z += 7) {
        const x = cx + s * (hx - 1);
        box(w, x, 4, z, 0.7, 8, 0.7, MAT.PLAIN, steel, 0, SUB.METAL);
        w.fillRect(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 1);
        cyl(w, x - s * 3, 0, 2.4, z, 1.6, MAT.PLAIN, stone, 0, SUB.METAL);
        w.fillRect(x - s * 3 - 1.5, z - 1.5, x - s * 3 + 1.5, z + 1.5, 2);
      }
      for (const s of [-1, 1]) {
        box(w, cx, 7.6, cz + s * (hz - 1), 2 * hx - 2, 0.2, 0.35, MAT.EMISSIVE, warm, 2);
        light(w, cx, 6, cz + s * (hz - 3), warm, 20, 1.5);
      }
      break;
    }
    case 'apron': {
      w.paint(x0, z0, x1, z1, SURF.ROAD);
      for (let z = z0 + 4; z < z1 - 3; z += 7) {
        box(w, cx, 0.025, z, 0.45, 0.05, 3.5, MAT.PLAIN, [0.78, 0.72, 0.44]);
        for (const x of [x0 + 2, x1 - 2]) ball(w, x, 0.18, z, 0.19, MAT.EMISSIVE, [0.4, 0.72, 1], 3);
      }
      for (const z of [z0 + 2, z1 - 2]) box(w, cx, 0.025, z, 10, 0.05, 0.45, MAT.PLAIN, stone);
      break;
    }
  }
  w.places.push({ kind, ...entry, foot: [x0, z0, x1, z1] });
  if (L.named) K.addPoi(w, 'scene', entry.x, entry.z, { name: NAMES[kind] });
}

// A moored survey vessel and its shore light occupy a bridge-free reach of the canal.
export function soundingBerth(w, net, water, addPoi) {
  const limits = [0, ...net.bridges.map(b => b.z).sort((a, b) => a - b), w.size];
  let gap = 0, z = 0;
  for (let i = 1; i < limits.length; i++) if (limits[i] - limits[i - 1] > gap) { gap = limits[i] - limits[i - 1]; z = Math.round((limits[i] + limits[i - 1]) / 2); }
  const x = net.canalX + 5, bank = net.canalX + 15;
  box(w, x, water + 0.9, z, 6.6, 2.4, 26, MAT.ENAMEL, [0.13, 0.19, 0.22]);
  for (const s of [-1, 1]) {
    ball(w, x, water + 0.9, z + s * 12, 3.2, MAT.ENAMEL, [0.13, 0.19, 0.22], 0, 0, 0.36);
    box(w, x, water + 2.2, z + s * 6, 5.6, 0.22, 10.5, MAT.PLAIN, stone);
    box(w, x + 5, water + 1.7, z + s * 9, 5, 0.1, 0.12, MAT.PLAIN, stone);
  }
  box(w, x, water + 3.6, z - 6, 5, 3, 7.4, MAT.PLAIN, [0.47, 0.48, 0.43]);
  box(w, x, water + 4.2, z - 2.25, 4.4, 0.8, 0.1, MAT.GLOSS, steel);
  // Fender strips, an aft winch, wheelhouse glazing and waist-high deck rails.
  for (const side of [-1, 1]) {
    box(w, x + side * 3.3, water + 1.45, z, 0.16, 0.27, 23.5, MAT.PLAIN, [0.06, 0.07, 0.08], 0, SUB.RUBBER);
    for (let dz = -11; dz < 12; dz += 3.8) cyl(w, x + side * 3, water + 2.2, water + 3.1, z + dz, 0.055, MAT.PLAIN, steel);
    box(w, x + side * 3, water + 3.1, z, 0.09, 0.09, 23, MAT.PLAIN, steel);
    for (let dz = -8; dz <= -4; dz += 1.3) box(w, x + side * 2.51, water + 4.22, z + dz, 0.06, 0.83, 0.96, MAT.GLOSS, [0.06, 0.12, 0.15]);
    cyl(w, x + side * 1.6, water + 2.3, water + 3.3, z + 6.7, 0.55, MAT.PLAIN, steel);
    ball(w, x + side * 2.5, water + 5.2, z - 5.5, 0.14, MAT.EMISSIVE, side < 0 ? [0.8, 0.2, 0.13] : [0.2, 0.9, 0.66], 2);
  }
  box(w, x, water + 5.13, z - 6, 5.5, 0.17, 7.8, MAT.PLAIN, steel);
  cyl(w, x, water + 2, water + 10, z + 2, 0.16, MAT.PLAIN, steel); ball(w, x, water + 10, z + 2, 0.18, MAT.EMISSIVE, warm, 5);
  const bz = z + 7, y = w.floorAt(bank, bz);
  for (let i = 0; i < 4; i++) cyl(w, bank, y + i * 3, y + (i + 1) * 3, bz, 1.55 - i * 0.14, MAT.PLAIN, i % 2 ? stone : [0.45, 0.22, 0.14]);
  w.fillRect(bank - 1.5, bz - 1.5, bank + 1.5, bz + 1.5, 1);
  cyl(w, bank, y + 12, y + 13.5, bz, 1.4, MAT.EMISSIVE, warm, 4); cyl(w, bank, y + 13.5, y + 13.8, bz, 1.8, MAT.PLAIN, steel);
  light(w, bank, y + 12, bz, warm, 32, 2);
  addPoi(w, 'scene', bank + 2, z, { name: 'Tally Light' });
  return z;
}
