// Meridian district recipes. Each deployment loads one 500 m sheet at a time.
import { Rng } from '../core/rng.js';
import { MAT, SUB, SHAPE, SURF, STYLE, box, cyl, ball, primR, light } from './emit.js';
import { level, slope, marks, HMARK } from './height.js';
import { lotFrame } from './scenes.js';
import * as D from './dress.js';
import { buildNamed, riverSteps, GLOW } from './parcels.js';

export { GLOW };
// The named parcels each preset books, most demanding first. Every one is always placed.
export const DISTRICTS = {
  city: { name: 'Spindle Ward', features: ['well', 'arcade'] },
  homes: { name: 'Lintel Courts', features: ['villas', 'court', 'snacks', 'green', 'gallery'] },
  fringe: { name: 'Alder Spillbank', features: ['grove', 'boards', 'glass', 'plots'] },
  harbor: { name: 'Sounding Basin', features: ['factory', 'apron', 'stacks', 'cold', 'slip'] },
  yards: { name: 'Clinker Yards', features: ['shed', 'sidings', 'hoppers', 'table', 'cabin'] },
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
// Metres of public walk kept along the top of each quay wall, by preset.
export const BANK_WALK = { fringe: 6 };
// Start guesses: one minute of director heat per crossing; no change to curfew.
export const CROSSING_SECONDS = 60;
// Two different districts per raid. The four original presets keep their shuffle; a
// separate roll sends one raid in five through Clinker Yards on each leg, so every ordered
// pair of the five presets is equally likely.
const FOUNDING = ['city', 'homes', 'fringe', 'harbor'];
export function districtPlan(seed) {
  const order = new Rng(seed).fork('district itinerary').shuffle(FOUNDING.slice()), roll = new Rng(seed).fork('yard turn').int(5);
  if (roll < 2) order[roll] = 'yards';
  return [{ preset: order[0], seed }, { preset: order[1], seed: new Rng(seed).fork('far bank').s }];
}

export function parcelStyle(preset, base) {
  if (preset === 'homes') return STYLE.OLDTOWN;
  if (preset === 'harbor' || preset === 'yards') return STYLE.DOCK;
  if (preset === 'fringe') return base === STYLE.DOCK ? base : STYLE.OLDTOWN;
  return base;
}

export const NAMES = {
  court: 'Hemlock Close', snacks: 'Kettle Walk', villas: 'Sparrow Mews', gallery: 'Linen Gallery', green: 'Cistern Green',
  grove: 'Rill Garden', boards: 'Heron Boards', glass: 'Fernlight House', plots: 'Furrow Plots', steps: 'Spillbank Steps',
  factory: 'Gauge House', apron: 'Lantern Apron', stacks: 'Seal Yard', cold: 'Brine Locker', slip: 'Keel Slip',
  shed: 'Turnback Shed', sidings: 'Hasp Sidings', cabin: 'Lever Cabin', table: 'Quarter Table', hoppers: 'Grit Hoppers',
  well: 'Pilot Well', arcade: 'Vane Arcade',
};
// The frontage and depth a parcel is drawn for. A smaller lot still takes it, reduced.
const FIT = {
  court: [34, 34], snacks: [30, 40], villas: [40, 36], gallery: [30, 30], green: [34, 34],
  grove: [36, 36], boards: [32, 32], glass: [34, 28], plots: [30, 30],
  factory: [34, 40], apron: [36, 36], stacks: [34, 36], cold: [32, 30], slip: [30, 34],
  shed: [26, 36], sidings: [36, 36], cabin: [28, 28], table: [32, 32], hoppers: [38, 30],
  well: [42, 44], arcade: [26, 40],
};
// What the unnamed lots of a preset become, by their turn in the shuffled order.
const FILL = {
  homes: (n, L) => (n % 3 === 0 && Math.max(L.W, L.D) <= 66 ? 'court' : null),
  fringe: (n) => ['grove', 'grove', 'plots', null][n % 4],
  harbor: (n) => ['stacks', null, 'laydown', null][n % 4],
  yards: (n) => ['sidings', null, 'laydown', null][n % 4],
};

// Book the named lots before ordinary infill, without displacing authored interiors,
// the lair or exits. Each candidate fronts a public street; a parcel takes the first lot
// in the shuffled order that fits its plan, or the roomiest one left.
export function planParcels(w, net, scenes, bounds, reserved, rng, quay, styleOf) {
  const lots = [];
  for (let i = 0; i < net.xs.length - 1; i++) for (let j = 0; j < net.zs.length - 1; j++) {
    const b = bounds(i, j), key = i * 1000 + j;
    if (!b || scenes.has(key) || reserved(w, b.x0, b.z0, b.x1, b.z1) || Math.min(b.x1 - b.x0, b.z1 - b.z0) < 25) continue;
    const roads = [net.h[j][i], net.h[j + 1][i], net.v[i][j], net.v[i + 1][j]];
    if (Math.max(...roads) < 2) continue;
    // A lot on the map's rim has no street on that side whatever its line says.
    if (b.z0 <= 3) roads[0] = 0; if (b.z1 >= w.size - 3) roads[1] = 0; if (b.x0 <= 3) roads[2] = 0; if (b.x1 >= w.size - 3) roads[3] = 0;
    const side = roads.indexOf(Math.max(...roads));
    lots.push({ ...b, key, side, roads, style: styleOf((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), W: side < 2 ? b.x1 - b.x0 : b.z1 - b.z0, D: side < 2 ? b.z1 - b.z0 : b.x1 - b.x0 });
  }
  rng.shuffle(lots);
  const book = new Map(), open = () => lots.filter((L) => !book.has(L.key));
  if (w.preset === 'fringe') {
    // The river steps need a bank: a lot whose edge is the top of the quay wall.
    // The lot takes the riverside walk in front of it too, so the steps start at the wall.
    const west = quay.canalX - quay.outer - quay.walk, east = quay.canalX + quay.outer + quay.walk;
    const bank = lots.find((L) => (L.x1 === west && L.side !== 3) || (L.x0 === east && L.side !== 2));
    if (bank) book.set(bank.key, { ...bank, kind: 'steps', named: true, river: bank.x1 === west ? -1 : 1, ...(bank.x1 === west ? { x1: west + quay.walk } : { x0: east - quay.walk }) });
  }
  for (const kind of DISTRICTS[w.preset].features) {
    const left = open(), [fw, fd] = FIT[kind];
    // The closest fit to the drawn plan: a parcel in a lot far too big for it reads as an empty
    // pad. Of two fair fits the one nearer the landing wins, so the walk out passes named ground.
    const snug = (q) => Math.abs(q.W - fw * 1.2) + Math.abs(q.D - fd * 1.2) + 0.1 * Math.hypot((q.x0 + q.x1) / 2 - w.insertion.x, (q.z0 + q.z1) / 2 - w.insertion.z);
    const L = left.filter((q) => q.W >= fw && q.D >= fd).reduce((a, q) => (!a || snug(q) < snug(a) ? q : a), null) || left.reduce((a, q) => (!a || q.W * q.D > a.W * a.D ? q : a), null);
    if (L) book.set(L.key, { ...L, kind, named: true });
  }
  const fill = FILL[w.preset];
  if (fill) open().forEach((L, n) => { const kind = fill(n, L); if (kind) book.set(L.key, { ...L, kind, named: false }); });
  return book;
}

// Build one booked lot and record what it offers: its street entry, the gates its paths
// leave by, and any raised walk or room, for the map, the route marks and later work.
export function buildParcel(w, rng, L, K) {
  w.paint(L.x0, L.z0, L.x1, L.z1, SURF.PLAZA);
  const made = L.kind === 'steps' ? riverSteps(w, rng, L, K) : buildNamed(w, rng, L, K);
  const name = L.named ? NAMES[L.kind] : undefined, entry = made.entry || made.gates[0];
  w.places.push({ ...made, kind: L.kind, name, named: !!L.named, x: entry.x, z: entry.z, foot: [L.x0, L.z0, L.x1, L.z1] });
  if (L.named) K.addPoi(w, 'scene', entry.x, entry.z, { name });
}

const stone = [0.22, 0.23, 0.21], steel = [0.16, 0.2, 0.21], warm = [1, 0.66, 0.33], brass = [0.45, 0.31, 0.17];

// A moored survey vessel and its shore light occupy a bridge-free reach of the canal. A
// gangway climbs from the east quay to her aft deck, which can be walked and searched.
export function soundingBerth(w, net, water, addPoi) {
  const limits = [0, ...net.bridges.map(b => b.z).sort((a, b) => a - b), w.size];
  let gap = 0, z = 0;
  for (let i = 1; i < limits.length; i++) if (limits[i] - limits[i - 1] > gap) { gap = limits[i] - limits[i - 1]; z = Math.round((limits[i] + limits[i - 1]) / 2); }
  const x = net.canalX + 5, bank = net.canalX + 15, DECK_Y = -0.5, quayY = w.floorAt(bank, z);
  // The gangway lands where the quay is clear, fore or aft of the shore light.
  const gz = [z + 2, z + 3, z + 9, z + 1].find((g) => { for (let zz = g; zz < g + 2; zz++) for (let xx = net.canalX + 12; xx < net.canalX + 15; xx++) if (w.cell(xx + 0.5, zz + 0.5) !== 0 || w.floorAt(xx + 0.5, zz + 0.5) !== quayY) return false; return true; });
  box(w, x, water + 0.9, z, 6.6, 2.4, 26, MAT.ENAMEL, [0.13, 0.19, 0.22]);
  for (const s of [-1, 1]) {
    ball(w, x, water + 0.9, z + s * 12, 3.2, MAT.ENAMEL, [0.13, 0.19, 0.22], 0, 0, 0.36);
    box(w, x, water + 2.13, z + s * 6, 5.6, 0.22, 10.5, MAT.PLAIN, stone);
    box(w, x + 5, water + 1.7, z + s * 9, 5, 0.1, 0.12, MAT.PLAIN, stone);
  }
  box(w, x, water + 3.6, z - 6, 5, 3, 7.4, MAT.PLAIN, [0.47, 0.48, 0.43]);
  box(w, x, water + 4.2, z - 2.25, 4.4, 0.8, 0.1, MAT.GLOSS, steel);
  // Fender strips, an aft winch, wheelhouse glazing and waist-high deck rails.
  for (const side of [-1, 1]) {
    box(w, x + side * 3.3, water + 1.45, z, 0.16, 0.27, 23.5, MAT.PLAIN, [0.06, 0.07, 0.08], 0, SUB.RUBBER);
    for (let dz = -11; dz < 12; dz += 3.8) cyl(w, x + side * 3, water + 2.2, water + 3.1, z + dz, 0.055, MAT.PLAIN, steel);
    // The shore-side rail opens where the gangway comes aboard.
    const rails = side > 0 && gz !== undefined ? [[z - 11.5, gz], [gz + 2, z + 11.5]] : [[z - 11.5, z + 11.5]];
    for (const [a, b] of rails) box(w, x + side * 3, water + 3.1, (a + b) / 2, 0.09, 0.09, b - a, MAT.PLAIN, steel);
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
  const place = { kind: 'berth', name: 'Tally Light', named: true, x: bank + 2, z, gates: [{ x: bank + 2, z }] };
  if (gz !== undefined) {
    // The aft deck: six metres by ten of plate at -0.5 m, the winches and the mast foot on it.
    const dx0 = net.canalX + 2, dx1 = net.canalX + 8, dz0 = z + 1, dz1 = z + 11, M = marks(w), S = w.size;
    const open = (x0, z0, x1, z1, surf) => { w.fillRect(x0, z0, x1, z1, 0); w.paint(x0, z0, x1, z1, surf); for (let zz = z0; zz < z1; zz++) M.fill(HMARK.DECK, zz * S + x0, zz * S + x1); };
    level(w, dx0, dz0, dx1, dz1, DECK_Y); open(dx0, dz0, dx1, dz1, SURF.FLOOR);
    level(w, dx1, gz, dx1 + 1, gz + 2, DECK_Y); open(dx1, gz, dx1 + 1, gz + 2, SURF.FLOOR);
    w.fillRect(dx1 + 1, gz, dx1 + 4, gz + 2, 0); w.paint(dx1 + 1, gz, dx1 + 4, gz + 2, SURF.WALK);
    slope(w, dx1 + 1, gz, dx1 + 4, gz + 2, 'x-', quayY, DECK_Y);
    for (const side of [-1, 1]) w.fillRect(x + side * 1.6 - 0.5, z + 6.2, x + side * 1.6 + 0.5, z + 7.2, 2);
    w.fillRect(x - 0.5, z + 1.5, x + 0.5, z + 2.5, 1);
    // Gangway rails with lit caps, a work lamp over the deck, and what the survey left aboard.
    for (const zz of [gz - 0.04, gz + 2.04]) { box(w, dx1 + 2.5, quayY + 1.75, zz, 3.4, 0.07, 0.07, MAT.PLAIN, steel, 0, SUB.METAL); for (const xx of [dx1 + 1, dx1 + 4]) { cyl(w, xx, quayY, quayY + 2.2, zz, 0.05, MAT.PLAIN, steel); ball(w, xx, quayY + 2.3, zz, 0.1, MAT.EMISSIVE, [0.4, 0.86, 1], 4); } }
    box(w, x, DECK_Y + 2.9, z + 6, 0.5, 0.1, 0.5, MAT.EMISSIVE, warm, 4); light(w, x, DECK_Y + 2.6, z + 6, warm, 13, 1.7);
    box(w, x - 1.6, DECK_Y + 0.45, z + 9.6, 1.6, 0.9, 1.0, MAT.PLAIN, [0.32, 0.3, 0.12], 0, SUB.METAL);
    w.fillRect(x - 2.5, z + 9, x - 0.5, z + 10, 2);
    w.addContainer(dx0 + 0.5, dz1 - 0.5, 'locker', false); w.addContainer(dx1 - 0.5, dz1 - 1.5, 'crate', false);
    place.deck = { x, z: z + 4.5, y: DECK_Y }; place.gangway = { x: dx1 + 5.5, z: gz + 1 };
  }
  w.places.push(place);
  return z;
}

// The riverside walk: paving along the top of both quay walls wherever a lot stood back for
// it, a line of trees on the water side, lanterns and seats. It runs the length of the
// district between the bridges, so the river is an edge that can be followed.
export function bankWalk(w, rng, quay, net, tree) {
  const S = w.size, glow = GLOW[w.preset];
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? quay.canalX - quay.outer - quay.walk : quay.canalX + quay.outer, x1 = x0 + quay.walk;
    const open = (z) => { for (let x = x0; x < x1; x++) if (w.surf(x + 0.5, z + 0.5) !== SURF.LOT || w.cell(x + 0.5, z + 0.5) !== 0 || w.floorAt(x + 0.5, z + 0.5) !== 0) return false; return true; };
    const M = net.market, inMarket = (z) => s < 0 && M && z >= M.z0 - 1 && z <= M.z1 + 1;
    for (let z = 3; z < S - 3; z++) if (open(z) && !inMarket(z)) w.paint(x0, z, x1, z + 1, SURF.WALK);
    const tx = s < 0 ? x1 - 2.5 : x0 + 2.5, lx = s < 0 ? x0 + 0.7 : x1 - 0.7;
    for (let z = 8, k = 0; z < S - 8; z += 4, k++) {
      const clear = [z - 2, z, z + 2].every((q) => w.surf(tx, q) === SURF.WALK && w.cell(tx, q) === 0);
      if (!clear || inMarket(z)) continue;
      if (k % 2 === 0) tree(w, rng, Math.floor(tx) + 0.5, z + 0.5);
      else if (k % 6 === 3) {
        const bx = Math.floor(tx) + 0.5, bz = z + 0.5;
        w.fillRect(bx - 0.5, bz - 0.5, bx + 0.5, bz + 0.5, 2);
        box(w, bx, 0.44, bz, 0.5, 0.08, 1.7, MAT.PLAIN, [0.24, 0.17, 0.1], 0, SUB.TIMBER); for (const o of [-0.65, 0.65]) box(w, bx, 0.2, bz + o, 0.4, 0.4, 0.08, MAT.PLAIN, [0.05, 0.055, 0.06], 0, SUB.METAL);
      }
      if (k % 4 === 1) { cyl(w, lx, 0, 2.7, z, 0.06, MAT.PLAIN, [0.05, 0.055, 0.06], 0, SUB.METAL); ball(w, lx, 2.85, z, 0.2, MAT.EMISSIVE, glow, 4); if (k % 8 === 1) light(w, lx - s * 0.6, 2.5, z, glow, 13, 1.4); }
    }
  }
}

// ---------------------------------------------------------------- approaches (Spindle Ward)
// The hotel forecourt: brass inlay between the porticos, banner pylons, planted side walks
// and a service court behind. Nothing here narrows a door, a stair or the escape landing.
export function hotelApproach(w, rng, L, scene, K) {
  const F = lotFrame(L.x0, L.z0, L.x1, L.z1, L.side), at = F.pt, R = F.rect, tw = 14, gap = 8, left = Math.floor((F.W - 2 * tw - gap) / 2), amber = [1, 0.68, 0.32];
  const keep = scene.towers.flatMap((t) => [t.entry, t.street, t.stairFoot]), clearOf = (x, z, r) => keep.every((q) => Math.hypot(q.x - x, q.z - z) > r);
  const put = (u, v, r = 0.9) => { const [x, z] = at(u, v), cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5; return w.circleFree(cx, cz, r) && w.floorAt(cx, cz) === 0 && clearOf(cx, cz, 4) ? [cx, cz] : null; };
  const strip = (u0, v0, u1, v1, y0, y1, mat, col, ...p) => { const r = R(u0, v0, u1, v1); box(w, (r[0] + r[2]) / 2, (y0 + y1) / 2, (r[1] + r[3]) / 2, r[2] - r[0], y1 - y0, r[3] - r[1], mat, col, ...p); };
  strip(left + 7, 0.5, left + 2 * tw + gap - 7, 0.62, 0.008, 0.026, MAT.PLAIN, brass, 0, SUB.METAL);
  for (const off of [left, left + tw + gap]) for (const du of [2.2, 11.8]) {
    const [x, z] = at(off + du, 0.5);
    cyl(w, x, 0, 6.4, z, 0.07, MAT.PLAIN, brass, 0, SUB.METAL); box(w, x, 4.6, z, 0.12, 2.8, 0.12, MAT.EMISSIVE, amber, 1.8);
    const r = R(off + du - 0.03, 0.5, off + du + 0.03, 1.4); box(w, (r[0] + r[2]) / 2, 4.4, (r[1] + r[3]) / 2, r[2] - r[0], 2.2, r[3] - r[1], MAT.PLAIN, [0.3, 0.1, 0.1], 0, SUB.FABRIC);
  }
  // A name blade over the plant enclosure between the towers.
  { const [x, z] = at(left + tw + gap / 2, 1.4); box(w, x, 6.2, z, F.s < 2 ? 0.9 : 0.24, 5.4, F.s < 2 ? 0.24 : 0.9, MAT.SIGN, amber, 4, rng.float(), 1); light(w, x, 3.6, z, amber, 14, 1.4); }
  for (const u of [left + tw + 2, left + tw + 4, left + tw + 6]) { const q = put(u, 0.5, 0.45); if (q) { w.fillRect(q[0] - 0.5, q[1] - 0.5, q[0] + 0.5, q[1] + 0.5, 2); box(w, q[0], 0.3, q[1], 0.96, 0.6, 0.96, MAT.PLAIN, [0.2, 0.2, 0.21], 0, SUB.PLANTER); ball(w, q[0], 0.95, q[1], 0.5, MAT.FOLIAGE, [0.06, 0.16, 0.08], 0, rng.float(), 0.85); } }
  // Side walks: clipped trees, a seat and a lamp where the lot has the margin for them.
  for (const [u0, u1] of [[1, left - 1], [left + 2 * tw + gap + 1, F.W - 1]]) {
    if (u1 - u0 < 5) continue;
    const mid = (u0 + u1) / 2;
    for (let v = 6; v < Math.min(F.D - 4, 36); v += 8) { const q = put(mid, v, 1.2); if (q) K.tree(w, rng, q[0], q[1]); }
    for (const v of [10, 26]) { const q = put(mid + 1.5, v, 0.8); if (q) { w.fillRect(q[0] - 0.5, q[1] - 0.5, q[0] + 0.5, q[1] + 0.5, 2); box(w, q[0], 0.44, q[1], F.s < 2 ? 0.5 : 1.7, 0.08, F.s < 2 ? 1.7 : 0.5, MAT.PLAIN, [0.24, 0.17, 0.1], 0, SUB.TIMBER); box(w, q[0], 0.2, q[1], F.s < 2 ? 0.4 : 1.3, 0.4, F.s < 2 ? 1.3 : 0.4, MAT.PLAIN, [0.07, 0.07, 0.08], 0, SUB.METAL); } }
    const [lx, lz] = at(mid - 1.2, 18); cyl(w, lx, 0, 3.6, lz, 0.06, MAT.PLAIN, brass, 0, SUB.METAL); ball(w, lx, 3.75, lz, 0.2, MAT.EMISSIVE, amber, 4); light(w, lx, 3.4, lz, amber, 13, 1.4);
  }
  // The service court behind the towers: a van, bins, a striped bay under a wall lamp.
  if (F.D - 46 >= 6) {
    const cu = Math.floor(F.W / 2), v = Math.min(F.D - 4, 50);
    strip(cu - 6, v - 3.1, cu + 6, v - 2.9, 0.008, 0.03, MAT.PLAIN, [0.6, 0.45, 0.05], 0, SUB.HAZARD);
    const q = put(cu, v, 3); if (q) D.vehicle(w, rng, q[0], q[1], F.s >= 2, 'van');
    for (const du of [-7.5, 7.5]) { const b = put(cu + du, v + 1, 1); if (b && w.zoneAt(b[0], b[1]) >= 1) w.addContainer(b[0], b[1], 'dumpster', false); }
    const [lx, lz] = at(cu, v - 5); cyl(w, lx, 0, 4.4, lz, 0.06, MAT.PLAIN, steel, 0, SUB.METAL); ball(w, lx, 4.55, lz, 0.2, MAT.EMISSIVE, [0.62, 0.82, 1], 4); light(w, lx, 4.2, lz, [0.62, 0.82, 1], 15, 1.5);
  }
}

// The Reliquary gate: hazard marks across its threshold, a beacon pylon either side strung
// with the first silk, and studs in the ground from the street to the shutter.
export function reliquaryApproach(w, rng) {
  const g = w.boss?.gate; if (!g) return;
  const glow = [1, 0.3, 0.55], amber = [1, 0.55, 0.2];
  for (let k = -3; k <= 3; k++) box(w, g.x + k * 1.05, 0.02, g.z + 1.9, 0.26, 0.04, 1.5, MAT.PLAIN, [0.62, 0.46, 0.06], 0, SUB.HAZARD, 0, 0, 0, 0.6);
  for (const s of [-1, 1]) {
    for (let dz = 1.6; dz < 5.2; dz += 1.2) ball(w, g.x + s * 3.3, 0.06, g.z + dz, 0.11, MAT.EMISSIVE, dz > 3.5 ? amber : glow, 3.4);
    const px = Math.floor(g.x + s * 11) + 0.5, pz = Math.floor(g.z + 3.4) + 0.5;
    if (!w.circleFree(px, pz, 1) || w.floorAt(px, pz) !== 0) continue;
    w.fillRect(px - 0.5, pz - 0.5, px + 0.5, pz + 0.5, 1);
    box(w, px, 0.3, pz, 1.1, 0.6, 1.1, MAT.PLAIN, [0.2, 0.2, 0.21], 0, SUB.WALL); cyl(w, px, 0.6, 7.2, pz, 0.14, MAT.PLAIN, [0.2, 0.21, 0.23], 0, SUB.METAL);
    box(w, px, 6.2, pz, 0.5, 1.6, 0.5, MAT.PLAIN, [0.07, 0.07, 0.08], 0, SUB.METAL); ball(w, px, 7.45, pz, 0.3, MAT.EMISSIVE, glow, 6, rng.float());
    for (const y of [5.7, 6.2, 6.7]) box(w, px, y, pz + 0.26, 0.3, 0.2, 0.04, MAT.EMISSIVE, amber, 3);
    light(w, px, 6.6, pz, glow, 22, 1.6);
    // Silk from the pylon head back to the gate lintel.
    for (const [tx, ty] of [[g.x + s * 3.5, 5.3], [g.x + s * 1.2, 7.6]]) {
      const dx = tx - px, dy = ty - 7.2, dz = g.z + 0.6 - pz, len = Math.hypot(dx, dy, dz);
      primR(w, SHAPE.CYL, (px + tx) / 2, (7.2 + ty) / 2 - len * 0.012, (pz + g.z + 0.6) / 2, 0.05, len, 0.05, MAT.PLAIN, [0.72, 0.7, 0.66], 0.25, SUB.FABRIC, 0, 0, 0, Math.atan2(dx, dz), Math.acos(Math.max(-1, Math.min(1, dy / len))));
    }
  }
}

// ---------------------------------------------------------------- route marks
// Painted chevrons on public ground from the landing to the marked terminal, the crossing
// and the known gate. The walk they follow keeps to streets and paving and never needs a
// door; the marks are flush with the ground and stand in nobody's way.
const COST = [6, 2, 2, 3, 3, 5, 0, 2, 2, 2, 2, 5];   // by SURF: lot, road, walk, alley, plaza, floor, water, crossings, lanes, grass
const MARK = { terminal: [0.42, 0.78, 1], passage: [1, 0.57, 0.2], extract: [0.2, 1, 0.45] };
export const MARK_EVERY = 11;
export function markRoutes(w) {
  const S = w.size, G = w.grid, surf = w.surface, ins = w.insertion, start = Math.floor(ins.z) * S + Math.floor(ins.x);
  const dist = new Int32Array(S * S).fill(2e9), from = new Int32Array(S * S).fill(-1), ring = Array.from({ length: 8 }, () => []);
  dist[start] = 0; ring[0].push(start);
  for (let cur = 0, left = 1; left > 0;) {
    const b = ring[cur & 7];
    if (!b.length) { cur++; continue; }
    const i = b.pop(); left--;
    if (dist[i] !== cur) continue;
    const xi = i % S;
    for (const j of [xi > 0 ? i - 1 : -1, xi < S - 1 ? i + 1 : -1, i - S, i + S]) {
      if (j < 0 || j >= S * S || G[j] !== 0 || !w.stepOK(i, j)) continue;
      const nd = cur + (COST[surf[j]] || 6);
      if (nd < dist[j]) { dist[j] = nd; from[j] = i; ring[nd & 7].push(j); left++; }
    }
  }
  w.waymarks = []; w.routes = {};
  const goals = [['terminal', w.dispatch], ['passage', w.passage], ['extract', w.extractions[0]]];
  const M = w.hmark, onPath = new Uint8Array(S * S);
  goals.forEach(([goal, site], gi) => {
    if (!site) return;
    // The nearest reached cell at the site, then the walk back to the landing.
    let end = -1; const r = (site.r || 2) + 1;
    for (let zi = Math.floor(site.z - r); zi <= site.z + r; zi++) for (let xi = Math.floor(site.x - r); xi <= site.x + r; xi++) {
      const i = zi * S + xi;
      if (xi >= 0 && zi >= 0 && xi < S && zi < S && dist[i] < 2e9 && (end < 0 || dist[i] < dist[end])) end = i;
    }
    if (end < 0) return;
    const cells = []; for (let i = end; i >= 0; i = from[i]) cells.push(i);
    cells.reverse(); onPath.fill(0); for (const i of cells) onPath[i] = 1;
    // Keep only the turns: a stretch is straight if every cell under it is open paving.
    const P = (i) => ({ x: (i % S) + 0.5, z: ((i / S) | 0) + 0.5 });
    const straight = (a, b) => {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2);
      for (let k = 1; k < n; k++) { const i = Math.floor(a.z + (b.z - a.z) * k / n) * S + Math.floor(a.x + (b.x - a.x) * k / n); if (G[i] !== 0 || (!onPath[i] && (COST[surf[i]] || 6) > 3)) return false; }
      return w.walkLine(a.x, a.z, b.x, b.z);
    };
    const pts = [P(cells[0])];
    for (let a = 0, k = 2; k < cells.length; k++) if (!straight(P(cells[a]), P(cells[k]))) { pts.push(P(cells[k - 1])); a = k - 1; }
    pts.push(P(cells[cells.length - 1]));
    let total = 0; for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
    w.routes[goal] = { length: Math.round(total), turns: pts.length - 2, points: pts };
    // A chevron every eleven metres, each goal's a little out of step and to one side.
    let next = 9 + gi * 3.5, run = 0;
    const col = MARK[goal], side = (gi - 1) * 0.85;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], len = Math.hypot(b.x - a.x, b.z - a.z) || 1, fx = (b.x - a.x) / len, fz = (b.z - a.z) / len, yaw = Math.atan2(fx, fz);
      for (; next <= run + len; next += MARK_EVERY) {
        if (total - next < 4) break;
        const t = next - run; let x = a.x + fx * t + fz * side, z = a.z + fz * t - fx * side;
        if (w.cell(x, z) !== 0) { x = a.x + fx * t; z = a.z + fz * t; }
        const i = Math.floor(z) * S + Math.floor(x);
        if (w.cell(x, z) !== 0 || (M && (M[i] === HMARK.STAIR || M[i] === HMARK.RAMP))) continue;
        const y = w.floorAt(x, z) + 0.03;
        for (const s of [-1, 1]) box(w, x - s * fz * 0.26, y, z + s * fx * 0.26, 0.17, 0.035, 0.95, MAT.EMISSIVE, col, 1.7, 0, 0, 0, 0, yaw + s * 0.62);
        w.waymarks.push({ goal, x, z, yaw });
      }
      run += len;
    }
  });
  // The fingerpost at the landing: one arm per marked goal, in its colour, toward its route.
  const tx = ins.x + 4.2, tz = ins.z - 21.5;
  // Its arms stay under the camera cut-away height, so all three read from beside it.
  cyl(w, tx, 0, 2.85, tz, 0.07, MAT.PLAIN, [0.07, 0.075, 0.08], 0, SUB.METAL); box(w, tx, 2.95, tz, 0.3, 0.2, 0.3, MAT.EMISSIVE, [0.8, 0.9, 1], 3);
  goals.forEach(([goal], gi) => {
    const pts = w.routes[goal]?.points; if (!pts) return;
    let far = pts[pts.length - 1], run = 0;
    for (let k = 1; k < pts.length; k++) { run += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z); if (run > 45) { far = pts[k]; break; } }
    const dx = far.x - tx, dz = far.z - tz, len = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz);
    box(w, tx + dx / len * 0.75, 1.65 + gi * 0.38, tz + dz / len * 0.75, 0.07, 0.3, 1.3, MAT.EMISSIVE, MARK[goal], 2.4, 0, 0, 0, 0, yaw);
  });
  light(w, tx, 2.6, tz, [0.8, 0.9, 1], 9, 1.1);
  for (const goal in w.routes) delete w.routes[goal].points;
}
