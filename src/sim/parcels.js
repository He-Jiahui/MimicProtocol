// Authored Meridian parcels: the named set pieces a district preset books before ordinary
// infill. Each builder works in its lot's street frame (u along the frontage, v inward),
// keeps the entry apron clear, opens its paths only toward sides that have a street, and
// reports the gates it leaves so a route never ends at a wall. Pure data, like the generator.
import { MAT, SUB, SHAPE, SURF, STYLE, box, boxMM, cyl, ball, prim, primR, light } from './emit.js';
import { level, slope, parapets, marks, HMARK } from './height.js';
import { lotFrame } from './scenes.js';
import * as DR from './dress.js';

const P = MAT.PLAIN, E = MAT.EMISSIVE, HALF = Math.PI / 2;
const OPP = { 'x+': 'x-', 'x-': 'x+', 'z+': 'z-', 'z-': 'z+' };
const BACK = [1, 0, 3, 2], LEFT = [2, 3, 0, 0], RIGHT = [3, 2, 1, 1];
const STONE = [0.22, 0.23, 0.21], STEEL = [0.16, 0.2, 0.21], DARK = [0.05, 0.055, 0.06], WOOD = [0.24, 0.17, 0.1];
const BRICK = [0.24, 0.15, 0.12], CONCRETE = [0.2, 0.2, 0.21], PALE = [0.52, 0.55, 0.56], RUST = [0.34, 0.18, 0.1];
// The hatched cap a solid mass shows where the camera cut-away slices it (as buildings do).
const CAP = [0.035, 0.038, 0.046], CUT = 2.58;
const WARM = [1, 0.7, 0.4], MOON = [0.62, 1, 0.8], SODIUM = [1, 0.55, 0.26], SIGNAL = [0.78, 0.87, 1], CYAN = [0.4, 0.86, 1];
// The lamp each preset hangs over its own ground: the districts differ at a glance.
export const GLOW = { city: [0.62, 0.82, 1], homes: WARM, fringe: MOON, harbor: SODIUM, yards: SIGNAL };

function tools(w, rng, L, K) {
  const F = lotFrame(L.x0, L.z0, L.x1, L.z1, L.side), R = F.rect, at = F.pt, W = F.W, Dp = F.D;
  const roads = L.roads || [2, 2, 2, 2];
  const open = { front: true, back: roads[BACK[L.side]] > 0, left: roads[LEFT[L.side]] > 0, right: roads[RIGHT[L.side]] > 0 };
  const cu = Math.floor(W / 2), cv = Math.floor(Dp / 2), glow = GLOW[w.preset] || WARM, style = L.style ?? STYLE.OLDTOWN;
  const panel = (u0, v0, u1, v1, y0, y1, mat, col, ...p) => boxMM(w, ...R(u0, v0, u1, v1), y0, y1, mat, col, ...p);
  const fill = (u0, v0, u1, v1, c) => w.fillRect(...R(u0, v0, u1, v1), c);
  const solid = (u0, v0, u1, v1, y0, y1, col, sub = SUB.WALL, cell = 1, mat = P) => { fill(u0, v0, u1, v1, cell); panel(u0, v0, u1, v1, y0, y1, mat, col, 0, sub); };
  const paint = (u0, v0, u1, v1, s) => w.paint(...R(u0, v0, u1, v1), s);
  const floor = (u0, v0, u1, v1, y) => level(w, ...R(u0, v0, u1, v1), y);
  const deck = (u0, v0, u1, v1) => { const r = R(u0, v0, u1, v1), M = marks(w); for (let z = r[1]; z < r[3]; z++) M.fill(HMARK.DECK, z * w.size + r[0], z * w.size + r[2]); };
  const free = (u, v, r = 0.7) => { const [x, z] = at(u, v); return w.circleFree(x, z, r); };
  const clear = (u0, v0, u1, v1) => { const r = R(u0, v0, u1, v1); for (let z = r[1]; z < r[3]; z++) for (let x = r[0]; x < r[2]; x++) if (w.cell(x + 0.5, z + 0.5) !== 0 || w.floorAt(x + 0.5, z + 0.5) !== 0) return false; return true; };
  // A thin post and lantern: it lights the ground without standing in anyone's way.
  const lamp = (u, v, h = 3.4, col = glow, reach = 13, k = 1.5, y = 0) => {
    const [x, z] = at(u, v);
    cyl(w, x, y, y + h, z, 0.06, P, DARK, 0, SUB.METAL); box(w, x, y + h + 0.16, z, 0.34, 0.3, 0.34, E, col, 3.6);
    box(w, x, y + h + 0.36, z, 0.5, 0.06, 0.5, P, DARK, 0, SUB.METAL); light(w, x, y + h - 0.2, z, col, reach, k);
  };
  // A floodlight mast for a yard, standing on its own cell.
  const mast = (u, v, h = 12, col = glow, reach = 34) => {
    const [x, z] = at(u, v), cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    if (w.cell(cx, cz) !== 0) return;
    w.fillRect(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5, 1);
    cyl(w, cx, 0, h, cz, 0.16, P, DARK, 0, SUB.METAL); box(w, cx, 0.2, cz, 0.9, 0.4, 0.9, P, CONCRETE, 0, SUB.WALL);
    box(w, cx, h, cz, 2.2, 0.16, 0.5, P, DARK, 0, SUB.METAL);
    for (const o of [-0.8, 0, 0.8]) box(w, cx + o, h - 0.2, cz, 0.5, 0.22, 0.42, E, col, 6);
    light(w, cx, h - 1, cz, col, reach, 2.1);
  };
  const bench = (u, v, alongU = true) => {
    const [x, z] = at(u, v), cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5, ax = (F.s < 2) === alongU;
    if (w.cell(cx, cz) !== 0 || w.floorAt(cx, cz) !== 0) return false;
    w.fillRect(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5, 2);
    box(w, cx, 0.44, cz, ax ? 1.7 : 0.5, 0.08, ax ? 0.5 : 1.7, P, WOOD, 0, SUB.TIMBER);
    for (const o of [-0.65, 0.65]) box(w, cx + (ax ? o : 0), 0.2, cz + (ax ? 0 : o), ax ? 0.08 : 0.4, 0.4, ax ? 0.4 : 0.08, P, DARK, 0, SUB.METAL);
    return true;
  };
  // A planter box with clipped green in it, one cell.
  const planter = (u, v, col = [0.07, 0.17, 0.09], h = 0.55) => {
    const [x, z] = at(u, v), cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    if (w.cell(cx, cz) !== 0 || w.floorAt(cx, cz) !== 0) return false;
    w.fillRect(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5, 2);
    box(w, cx, h / 2, cz, 0.96, h, 0.96, P, CONCRETE, 0, SUB.PLANTER);
    ball(w, cx, h + 0.3, cz, 0.52, MAT.FOLIAGE, col, 0, rng.float(), 0.8);
    return true;
  };
  // A clipped hedge or a low wall along a run of cells, leaving the listed gaps open.
  const run = (u0, v0, u1, v1, kind = 'hedge', gaps = []) => {
    const alongU = u1 - u0 >= v1 - v0, lo = alongU ? u0 : v0, hi = alongU ? u1 : v1;
    let a = lo;
    const piece = (s, e) => {
      if (e - s < 1) return;
      const r = alongU ? [s, v0, e, v1] : [u0, s, u1, e];
      fill(...r, 2);
      if (kind === 'hedge') { panel(r[0] + 0.12, r[1] + 0.12, r[2] - 0.12, r[3] - 0.12, 0, 1.05, MAT.FOLIAGE, [0.05, 0.13, 0.06], 0, rng.float()); }
      else if (kind === 'wall') { panel(...r, 0, 1.0, P, BRICK, 0, SUB.WALL); panel(r[0] - 0.05, r[1] - 0.05, r[2] + 0.05, r[3] + 0.05, 1.0, 1.1, P, STONE, 0, SUB.CAP); }
      else if (kind === 'fence') { const [x0, z0, x1, z1] = R(...r); box(w, (x0 + x1) / 2, 1.0, (z0 + z1) / 2, alongU === (F.s < 2) ? x1 - x0 : 0.06, 2.0, alongU === (F.s < 2) ? 0.06 : z1 - z0, P, [0.3, 0.31, 0.32], 0, SUB.BARS, 2); }
      else { panel(...r, 0, 0.8, P, CONCRETE, 0, SUB.WALL); panel(r[0], r[1], r[2], r[3], 0.8, 0.86, P, [0.6, 0.45, 0.05], 0, SUB.HAZARD); }
    };
    // Only the stretches still standing clear are closed: nothing is built through a tree.
    const seg = (s, e) => {
      let from = null;
      for (let t = Math.ceil(s); t <= Math.floor(e); t++) {
        const ok = t < Math.floor(e) && (alongU ? clear(t, v0, t + 1, v1) : clear(u0, t, u1, t + 1));
        if (ok && from === null) from = t;
        if (!ok && from !== null) { piece(from, t); from = null; }
      }
    };
    for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { seg(a, Math.min(g0, hi)); a = Math.max(a, g1); }
    seg(a, hi);
  };
  // A prop from the street-dressing kit, facing along the frame (turn rotates it).
  const prop = (name, u, v, turn = 0, y = 0) => {
    const [x, z] = at(u, v), cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    if (w.cell(cx, cz) !== 0 || w.floorAt(cx, cz) !== y) return false;
    const FF = DR.freeFrame(cx, cz, F.yawIn + turn);
    DR.PROPS[name](w, rng, DR.kit(w, FF, y), 0, FF);
    w.fillRect(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5, 2);
    return true;
  };
  const tree = (u, v) => { const [x, z] = at(u, v); K.tree(w, rng, Math.floor(x) + 0.5, Math.floor(z) + 0.5); };
  // Stock stood in rows on spare ground: pallets, drums and crates with aisles to walk.
  const stock = (u0, v0, u1, v1, kinds = ['pallet', 'drum', 'crates', 'pallet']) => {
    for (let v = v0 + 1; v + 1 <= v1 - 1; v += 4) for (let u = u0 + 1; u + 1 <= u1 - 1; u += 3) if (!rng.chance(0.3)) prop(rng.pick(kinds), u + 0.5, v + 0.5, rng.pick([0, HALF, Math.PI, -HALF]));
  };
  // A tank farm: upright vessels with banding, a status lamp each and a pipe run between them.
  const tanks = (u0, v0, u1, v1) => {
    const mu = Math.floor((u0 + u1) / 2);
    let prev = null;
    for (let v = v0 + 3; v + 3 <= v1 - 1; v += 8) {
      if (!clear(mu - 2, v - 2, mu + 2, v + 2)) { prev = null; continue; }
      const [x, z] = at(mu, v), h = rng.range(5, 8), col = rng.pick([[0.3, 0.33, 0.34], [0.36, 0.3, 0.2], [0.2, 0.27, 0.3]]);
      w.fillRect(x - 2, z - 2, x + 2, z + 2, 1);
      cyl(w, x, 0, 0.4, z, 2.5, P, CONCRETE, 0, SUB.WALL); cyl(w, x, 0.4, h, z, 2.1, MAT.ENAMEL, col); ball(w, x, h, z, 2.1, MAT.ENAMEL, col, 0, 0, 0.3); cyl(w, x, 0.4, CUT, z, 2.04, P, CAP, 0, SUB.CAP);
      for (const y of [h * 0.35, h * 0.7]) cyl(w, x, y, y + 0.12, z, 2.16, P, DARK, 0, SUB.METAL);
      ball(w, x, h + 0.8, z, 0.14, E, rng.chance(0.7) ? [0.3, 1, 0.5] : [1, 0.3, 0.2], 5, rng.float());
      if (prev !== null) panel(mu - 0.15, prev + 2, mu + 0.15, v - 2, 1.4, 1.7, P, [0.34, 0.3, 0.12], 0, SUB.METAL);
      prev = v;
    }
    lamp(u0 + 1, Math.floor((v0 + v1) / 2), 4.2, glow, 15, 1.5);
  };
  const loot = (u, v, kind, indoor = false, extra = {}) => {
    const [x, z] = at(u, v), cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    if (w.cell(cx, cz) !== 0) return null;
    return w.addContainer(cx, cz, kind, indoor, { yaw: F.yawIn, ...extra });
  };
  // A lit name frame over a way in: two slim posts, a beam and a board in the district's light.
  const arch = (u, v, half = 3, alongU = true, col = glow) => {
    for (const s of [-1, 1]) { const [x, z] = alongU ? at(u + s * half, v) : at(u, v + s * half); cyl(w, x, 0, 4.2, z, 0.09, P, DARK, 0, SUB.METAL); }
    const r = alongU ? [u - half, v - 0.1, u + half, v + 0.1] : [u - 0.1, v - half, u + 0.1, v + half];
    panel(...r, 4.1, 4.3, P, DARK, 0, SUB.METAL);
    const b = alongU ? [u - half + 0.8, v - 0.14, u + half - 0.8, v + 0.14] : [u - 0.14, v - half + 0.8, u + 0.14, v + half - 0.8];
    panel(...b, 3.45, 4.05, MAT.SIGN, col, 3, rng.float(), 0);
    const [lx, lz] = at(u, v); light(w, lx, 3.3, lz, col, 11, 1.3);
  };
  // A walled room with open doorways: 1 m walls, a lintel light over each way in, glazing on
  // the long faces, a flat roof. doors: [face, centre] with face f (front), b, l or r; the
  // doorway is the two cells either side of the centre. y lifts the floor (a terrace room).
  const hut = (u0, v0, u1, v1, o = {}) => {
    const { h = 3.2, col = BRICK, sub = SUB.WALL, doors = [], y = 0, lit = glow, roof = DARK, glass = true, base = y > 0, mat = P } = o;
    const gapsOn = (f) => doors.filter((d) => d[0] === f).map((d) => [d[1] - 1, d[1] + 1]);
    if (y) floor(u0, v0, u1, v1, y);
    fill(u0 + 1, v0 + 1, u1 - 1, v1 - 1, 0); paint(u0 + 1, v0 + 1, u1 - 1, v1 - 1, SURF.FLOOR);
    const wall = (a0, b0, a1, b1) => { if (a1 - a0 <= 0 || b1 - b0 <= 0) return; fill(a0, b0, a1, b1, 1); panel(a0, b0, a1, b1, base ? 0 : y, y + h, mat, col, 0, sub); };
    for (const [f, lo, hi, fixed] of [['f', u0, u1, v0], ['b', u0, u1, v1 - 1], ['l', v0 + 1, v1 - 1, u0], ['r', v0 + 1, v1 - 1, u1 - 1]]) {
      const alongU = f === 'f' || f === 'b', out = f === 'f' || f === 'l' ? -1 : 1;
      let a = lo;
      const seg = (s, e) => {
        if (alongU) wall(s, fixed, e, fixed + 1); else wall(fixed, s, fixed + 1, e);
        // Glazing set a hand's width proud of the wall: a pane, a lit reveal behind it.
        if (!glass || e - s < 3) return;
        const edge = out < 0 ? fixed - 0.05 : fixed + 1 + 0.05, g0 = Math.min(edge, edge - out * 0.04), g1 = Math.max(edge, edge - out * 0.04);
        for (let t = s + 0.6; t + 1.5 <= e - 0.4; t += 2.6) {
          const r = alongU ? [t, g0, t + 1.5, g1] : [g0, t, g1, t + 1.5];
          panel(...r, y + 1.25, y + 2.35, E, lit, 1.1);
          const fr = alongU ? [t - 0.08, g0, t + 1.58, g1] : [g0, t - 0.08, g1, t + 1.58];
          panel(...fr, y + 2.35, y + 2.45, P, DARK, 0, SUB.METAL);
        }
      };
      for (const [g0, g1] of gapsOn(f).sort((p, q) => p[0] - q[0])) {
        seg(a, g0); a = g1;
        const r = alongU ? [g0, fixed, g1, fixed + 1] : [fixed, g0, fixed + 1, g1];
        fill(...r, 0); paint(...r, SURF.FLOOR);
        panel(...r, y + 2.5, y + h, mat, col, 0, sub);
        const e = out < 0 ? fixed - 0.08 : fixed + 1, lr = alongU ? [g0 - 0.2, e, g1 + 0.2, e + 0.08] : [e, g0 - 0.2, e + 0.08, g1 + 0.2];
        panel(...lr, y + 2.5, y + 2.64, E, lit, 2.6);
      }
      seg(a, hi);
    }
    panel(u0 - 0.3, v0 - 0.3, u1 + 0.3, v1 + 0.3, y + h, y + h + 0.22, P, roof, 0, SUB.METAL);
    const [lx, lz] = at((u0 + u1) / 2, (v0 + v1) / 2); light(w, lx, y + h - 0.5, lz, lit, Math.max(u1 - u0, v1 - v0) * 0.7 + 4, 1.9);
    return { u0: u0 + 1, v0: v0 + 1, u1: u1 - 1, v1: v1 - 1 };
  };
  // Where a side has no street, close it with something that reads as an edge.
  const edges = (kind = 'hedge', gates = {}) => {
    const g = (side, mid) => (open[side] && gates[side] !== false ? [[(gates[side] ?? mid) - 2, (gates[side] ?? mid) + 2]] : []);
    run(0, Dp - 1, W, Dp, kind, g('back', cu)); run(0, 1, 1, Dp - 1, kind, g('left', cv)); run(W - 1, 1, W, Dp - 1, kind, g('right', cv));
  };
  return { w, rng, K, F, R, at, W, D: Dp, cu, cv, open, glow, style, panel, fill, solid, paint, floor, deck, free, clear, lamp, mast, bench, planter, run, prop, tree, stock, tanks, loot, arch, hut, edges };
}

// ---------------------------------------------------------------- Lintel Courts
// Hemlock Close: four apartment blocks round a crossing of two passages, balconies over
// the shared court, washing strung between them and a planted ring where the ways meet.
function court(T, named) {
  const { w, rng, K, R, W, D, cu, cv, open, panel, paint, lamp, bench, loot, run, arch, at } = T, gap = 3;
  paint(0, 0, W, D, SURF.PLAZA);
  paint(cu - gap, 0, cu + gap, D, SURF.ALLEY); paint(0, cv - gap, W, cv + gap, SURF.WALK);
  for (const [a, b] of [[1, cu - gap], [cu + gap, W - 1]]) for (const [c, d] of [[1, cv - gap], [cv + gap, D - 1]]) {
    K.addBuilding(w, rng, ...R(a, c, b, d), STYLE.OLDTOWN, false, false, named);
    // Stacked balconies face the shared walk; both ground passages stay open.
    const front = c < cv, face = front ? d : c;
    for (let u = a + 2; u + 3.6 < b - 1; u += 6) for (const y of [3.2, 5.9]) {
      panel(u, front ? face : face - 1.1, u + 3.6, front ? face + 1.1 : face, y, y + 0.16, P, STONE);
      panel(u, front ? face + 1.0 : face - 1.1, u + 3.6, front ? face + 1.1 : face - 1.0, y + 0.16, y + 1.0, P, STEEL, 0, SUB.BARS);
      if (named && y < 4) panel(u + 0.5, front ? face - 0.02 : face - 0.03, u + 1.7, front ? face + 0.03 : face + 0.02, y + 0.2, y + 2.2, E, WARM, 0.9);
    }
  }
  // The ring where the passages cross: a tree in a stone collar, benches on the diagonals.
  { const [x, z] = at(cu, cv); K.tree(w, rng, Math.floor(x) + 0.5, Math.floor(z) + 0.5); cyl(w, Math.floor(x) + 0.5, 0, 0.45, Math.floor(z) + 0.5, 1.2, P, STONE, 0, SUB.PLANTER); }
  for (const [du, dv] of [[-2.5, -2.5], [2.5, 2.5]]) bench(cu + du, cv + dv, du < 0);
  if (!named) return [[cu, 0], open.back && [cu, D - 0.5], open.left && [0.5, cv], open.right && [W - 0.5, cv]];
  // Washing between the blocks, high enough to walk under.
  for (let u = 4; u < W - 4; u += 5) {
    if (Math.abs(u - cu) < gap + 1) continue;
    panel(u, cv - gap, u + 0.03, cv + gap, 3.5, 3.53, P, DARK);
    for (let v = cv - gap + 0.6; v < cv + gap - 0.8; v += rng.range(0.8, 1.3)) if (rng.chance(0.7)) panel(u - 0.02, v, u + 0.04, v + rng.range(0.4, 0.7), 2.85, 3.5, P, rng.pick([[0.6, 0.6, 0.62], [0.5, 0.15, 0.15], [0.15, 0.25, 0.5], [0.55, 0.5, 0.3]]), 0, SUB.FABRIC);
  }
  for (const [u, v] of [[cu - gap + 0.4, 5], [cu + gap - 0.4, D - 5], [5, cv - gap + 0.4], [W - 5, cv + gap - 0.4]]) lamp(u, v, 3.2, WARM, 12, 1.4);
  arch(cu, 0.6, gap); if (open.back) arch(cu, D - 0.6, gap);
  // A side with no street ends as a nook: a wall, a lamp and a seat, not a passage.
  if (!open.left) { run(0, cv - gap, 1, cv + gap, 'wall'); bench(2.5, cv, false); }
  if (!open.right) { run(W - 1, cv - gap, W, cv + gap, 'wall'); bench(W - 2.5, cv, false); }
  if (!open.back) { run(cu - gap, D - 1, cu + gap, D, 'wall'); bench(cu, D - 2.5, true); }
  loot(cu + 2.5, cv - 2.5, 'basket');
  return [[cu, 0], open.back && [cu, D - 0.5], open.left && [0.5, cv], open.right && [W - 0.5, cv]];
}

// Kettle Walk: a food lane of stalls under lantern strings, shophouses behind them, and at
// its far end a paved court round the copper kettle the walk is named for.
function snacks(T) {
  const { w, rng, K, F, R, at, W, D, cu, open, panel, fill, paint, lamp, loot, prop, arch, hut, run } = T;
  const courtV = D - Math.min(13, Math.floor(D * 0.34)), sr = rng.fork('stallbox');
  paint(0, 0, W, D, SURF.PLAZA); paint(cu - 4, 0, cu + 4, courtV, SURF.ALLEY);
  const [fx, fz] = F.dir(1, 0);
  for (let v = 5; v < courtV - 3; v += 6) for (const s of [-1, 1]) {
    const [x, z] = at(cu + s * 6, v), yaw = Math.atan2(-s * fx, -s * fz);
    if (DR.stall(w, rng, Math.floor(x) + 0.5, Math.floor(z) + 0.5, yaw)) K.stallBox(w, sr, Math.floor(x) + 0.5, Math.floor(z) + 0.5, yaw);
  }
  // Lantern strings down both edges of the lane.
  for (const s of [-1, 1]) {
    panel(cu + s * 4.2 - 0.02, 2, cu + s * 4.2 + 0.02, courtV, 4.3, 4.33, P, DARK);
    for (let v = 3, k = 0; v < courtV - 1; v += 2.2, k++) {
      const [x, z] = at(cu + s * 4.2, v);
      prim(w, SHAPE.SPHERE, x, 3.95 - 0.28 * Math.sin((k % 6) / 5 * Math.PI), z, 0.32, 0.42, 0.32, E, k % 3 ? [1, 0.66, 0.33] : [1, 0.32, 0.2], 3, rng.float());
      if (k % 6 === 2) light(w, x, 3.4, z, WARM, 10, 1.3);
    }
  }
  // Shophouses behind the stalls where the lot is wide enough, one unit every dozen metres.
  if (cu - 9 >= 8) for (const [a, b] of [[1, cu - 9], [cu + 9, W - 1]]) for (let v = 2; v + 8 <= courtV - 1; v += 12) K.addBuilding(w, rng, ...R(a, v, b, Math.min(v + 11, courtV - 1)), STYLE.OLDTOWN, false, true, true);
  // A lane too narrow for shophouses seats its customers behind the stalls instead.
  else for (const s of [-1, 1]) for (let v = 8; v < courtV - 4; v += 6) { if (cu + s * 10 > 1 && cu + s * 10 < W - 2) prop('table', cu + s * 10, v, s < 0 ? HALF : -HALF); if ((v - 8) % 12 === 0 && cu + s * 12 > 1 && cu + s * 12 < W - 2) T.planter(cu + s * 12, v + 3); }
  // The kettle court: the kettle on its hearth, tables round it, an open kitchen to one side.
  const kv = Math.floor((courtV + D) / 2), [kx, kz] = at(cu + 0.5, kv + 0.5), copper = [0.5, 0.27, 0.12];
  w.fillRect(kx - 1.5, kz - 1.5, kx + 1.5, kz + 1.5, 2);
  cyl(w, kx, 0, 0.5, kz, 1.9, P, STONE, 0, SUB.TILE); cyl(w, kx, 0.5, 0.56, kz, 1.6, E, [1, 0.5, 0.2], 1.6);
  cyl(w, kx, 0.56, 2.3, kz, 1.25, MAT.ENAMEL, copper); ball(w, kx, 2.3, kz, 1.25, MAT.ENAMEL, copper, 0, 0, 0.5);
  cyl(w, kx, 2.85, 3.1, kz, 0.3, MAT.ENAMEL, copper); ball(w, kx, 3.2, kz, 0.16, P, DARK);
  primR(w, SHAPE.CYL, kx + fx * 1.5, 1.9, kz + fz * 1.5, 0.3, 1.5, 0.3, MAT.ENAMEL, copper, 0, 0, 0, 0, 0, Math.atan2(fx, fz), 0.9);
  w.blocks[w.blockIndex(kx, kz)].vents.push({ x: kx, z: kz, y: 3.2 });
  light(w, kx, 3.4, kz, [1, 0.6, 0.3], 16, 1.8);
  for (const [du, dv] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) if (kv + dv < D - 1.5) prop('table', cu + du, kv + dv, du < 0 ? HALF : -HALF);
  if (cu + 14 <= W - 1 && D - courtV >= 9) {
    const r = hut(cu + 8, courtV + 2, cu + 14, D - 2, { doors: [['l', kv]], col: [0.27, 0.2, 0.16], lit: [1, 0.62, 0.3], h: 3 });
    fill(r.u1 - 1, r.v0, r.u1, r.v1, 2); panel(r.u1 - 1, r.v0, r.u1, r.v1, 0, 0.95, P, STEEL, 0, SUB.METAL);
    for (let v = r.v0 + 0.5; v < r.v1; v += 1.1) { const [x, z] = at(r.u1 - 0.5, v); cyl(w, x, 0.95, 1.3, z, 0.22, P, [0.5, 0.5, 0.52], 0, SUB.METAL); }
    loot(r.u0 + 0.5, r.v0 + 0.5, 'tin', true); loot(r.u0 + 0.5, r.v1 - 0.5, 'crate', true);
  }
  for (const s of [-1, 1]) lamp(cu + s * 7, courtV + 1.5, 3.4, WARM, 13, 1.5);
  arch(cu, 0.6, 4, true, [1, 0.5, 0.25]);
  if (open.back) arch(cu, D - 0.6, 4, true, [1, 0.5, 0.25]); else run(0, D - 1, W, D, 'wall');
  if (!open.left) run(0, courtV, 1, D - 1, 'wall');
  if (!open.right) run(W - 1, courtV, W, D - 1, 'wall');
  return [[cu, 0], open.back && [cu, D - 0.5], open.left && [0.5, kv], open.right && [W - 0.5, kv]];
}

// Sparrow Mews: four villas on a planted lane, each behind its own hedge and gate, a path
// from the gate to the door, a porch lamp and a garden tree.
function villas(T) {
  const { w, rng, K, F, R, at, W, D, cu, cv, open, panel, paint, lamp, bench, run, tree, arch, planter } = T, lane = 3;
  paint(0, 0, W, D, SURF.GRASS);
  paint(cu - lane, 0, cu + lane, open.back ? D : D - 4, SURF.ALLEY);
  if (open.left) paint(0, cv - 2, cu, cv + 2, SURF.WALK);
  if (open.right) paint(cu, cv - 2, W, cv + 2, SURF.WALK);
  for (const left of [true, false]) for (const near of [true, false]) {
    const u0 = left ? Math.max(3, cu - lane - 3 - 14) : cu + lane + 3, u1 = left ? cu - lane - 3 : Math.min(W - 3, cu + lane + 3 + 14);
    const v0 = near ? 3 : Math.min(D - 3 - 8, cv + 4), v1 = near ? Math.min(cv - 4, v0 + 13) : Math.min(D - 3, v0 + 13);
    if (u1 - u0 < 6 || v1 - v0 < 6) continue;
    // A paved apron round the house, so its door meets a path whichever wall it is in.
    paint(u0 - 2, v0 - 2, u1 + 2, v1 + 2, SURF.WALK);
    const before = w.buildings.length;
    K.addBuilding(w, rng, ...R(u0, v0, u1, v1), STYLE.OLDTOWN, false, false, true);
    const made = w.buildings[before], gateV = Math.floor((v0 + v1) / 2), hedgeU = left ? cu - lane - 1 : cu + lane;
    if (!made?.entry) {
      // A shut house still shows a lit front door toward the lane.
      const fu = left ? u1 : u0 - 0.06; panel(fu, gateV - 0.6, fu + 0.06, gateV + 0.6, 0, 2.2, P, [0.16, 0.1, 0.08], 0, SUB.TIMBER); panel(fu - 0.02, gateV - 0.75, fu + 0.08, gateV + 0.75, 2.2, 2.34, E, WARM, 2.2);
    }
    run(hedgeU, Math.max(1, v0 - 2), hedgeU + 1, Math.min(D - 1, v1 + 2), 'hedge', [[gateV - 1, gateV + 2]]);
    lamp(hedgeU + (left ? 0.2 : 0.8), gateV - 1.4, 2.4, WARM, 9, 1.3);
    tree(left ? u0 - 2.5 : u1 + 2.5, near ? v0 + 1 : v1 - 1);
    planter(left ? u1 + 1.5 : u0 - 1.5, near ? v1 + 1.5 : v0 - 2.5, [0.2, 0.12, 0.14]);
  }
  // The lane itself: a parked car in a lay-by, a lantern where the ways cross, a turning ring.
  { const [x, z] = at(cu + 1.6, Math.min(D - 8, cv + 9)); K.car(w, rng, x, z, F.s < 2); }
  lamp(cu - lane + 0.3, cv - 2.4, 3.6, WARM, 14, 1.5); lamp(cu + lane - 0.3, cv + 2.4, 3.6, WARM, 14, 1.5);
  if (!open.back) {
    const [x, z] = at(cu, D - 4); cyl(w, x, 0, 0.4, z, 1.4, P, STONE, 0, SUB.PLANTER); ball(w, x, 0.9, z, 1.1, MAT.FOLIAGE, [0.06, 0.16, 0.08], 0, rng.float(), 0.7);
    w.fillRect(x - 1, z - 1, x + 1, z + 1, 2); bench(cu - 2, D - 6.5); run(0, D - 1, W, D, 'hedge');
  }
  if (!open.left) run(0, 1, 1, D - 1, 'hedge'); if (!open.right) run(W - 1, 1, W, D - 1, 'hedge');
  arch(cu, 0.6, lane);
  return [[cu, 0], open.back && [cu, D - 0.5], open.left && [0.5, cv], open.right && [W - 0.5, cv]];
}

// Linen Gallery: deck-access flats. A drying court on the street, an access gallery a floor
// up along the block with a stair at each end, and one flat left open off the gallery.
function gallery(T) {
  const { w, rng, K, F, R, W, D, cu, panel, fill, paint, floor, lamp, bench, planter, loot, prop, arch, at } = T;
  const bv = Math.min(D - 9, 20), Y = 3, h = rng.irange(11, 14), col = [0.25, 0.2, 0.17], seed = rng.float() * 997;
  paint(0, 0, W, D, SURF.PLAZA);
  // The block: solid but for the one flat, whose floor is the gallery's.
  fill(2, bv, W - 2, bv + 8, 1);
  floor(8, bv - 3, W - 8, bv, Y); paint(2, bv - 3, W - 2, bv, SURF.WALK);
  slope(w, ...R(2, bv - 3, 8, bv), F.along, 0, Y); slope(w, ...R(W - 8, bv - 3, W - 2, bv), OPP[F.along], 0, Y);
  const ru0 = cu - 3, ru1 = cu + 3;
  floor(ru0, bv, ru1, bv + 7, Y); fill(ru0, bv + 1, ru1, bv + 7, 0); fill(cu - 1, bv, cu + 1, bv + 1, 0); paint(ru0, bv, ru1, bv + 7, SURF.FLOOR);
  for (const [a, b] of [[2, ru0], [ru1, W - 2]]) { panel(a, bv, b, bv + 8, 0, h, MAT.FACADE, col, 1, seed, 0.42, 2.9, 2); panel(a + 0.06, bv + 0.06, b - 0.06, bv + 7.94, 0, CUT, P, CAP, 0, SUB.CAP); panel(a + 0.06, bv + 0.06, b - 0.06, bv + 7.94, CUT, Y + CUT, P, CAP, 0, SUB.CAP); }
  panel(ru0, bv + 7, ru1, bv + 8, 0, h, MAT.FACADE, col, 1, seed, 0.42, 2.9, 2);
  panel(ru0, bv, cu - 1, bv + 1, Y, Y + 3.2, P, col, 0, SUB.WALL); panel(cu + 1, bv, ru1, bv + 1, Y, Y + 3.2, P, col, 0, SUB.WALL);
  panel(ru0, bv, ru1, bv + 7, Y + 3.2, h, MAT.FACADE, col, 1, seed + 3, 0.42, 2.9, 2);
  panel(cu - 1.2, bv - 0.06, cu + 1.2, bv, Y + 2.5, Y + 2.64, E, WARM, 2.6);
  K.addRoof(w, rng, ...R(2, bv, W - 2, bv + 8), h);
  parapets(w, ...R(8, bv - 3, W - 8, bv));
  // Front doors along the gallery and store shutters under it: the block reads as lived in.
  for (let u = 9; u + 1.2 < W - 8; u += 4.5) {
    if (Math.abs(u + 0.6 - cu) < 3) continue;
    panel(u, bv - 0.05, u + 1.2, bv, Y, Y + 2.15, P, rng.pick([[0.3, 0.12, 0.1], [0.1, 0.2, 0.26], [0.16, 0.22, 0.14]]), 0, SUB.TIMBER);
    panel(u + 1.5, bv - 0.04, u + 2.9, bv, Y + 1.1, Y + 2.1, E, WARM, rng.chance(0.6) ? 1.0 : 0.15);
    panel(u + 0.3, bv - 3.05, u + 2.7, bv - 3, 0.2, 2.3, P, STEEL, 0, SUB.CORRUGATED);
  }
  // Washing hung out over the rail.
  for (let u = 9; u < W - 9.5; u += rng.range(0.9, 1.6)) if (rng.chance(0.55)) panel(u, bv - 3.1, u + rng.range(0.4, 0.8), bv - 3.05, Y + 0.35, Y + 1.0, P, rng.pick([[0.6, 0.6, 0.62], [0.5, 0.15, 0.15], [0.15, 0.25, 0.5], [0.55, 0.5, 0.3]]), 0, SUB.FABRIC);
  for (let u = 11; u < W - 10; u += 9) { const [x, z] = at(u, bv - 1.5); box(w, x, Y + 2.9, z, 0.3, 0.1, 0.3, E, WARM, 3); light(w, x, Y + 2.5, z, WARM, 9, 1.3); }
  // The open flat: a table, a cot, a wardrobe; what was left is still in the cupboard.
  { const [x, z] = at(cu, bv + 4); light(w, x, Y + 2.7, z, WARM, 10, 1.8); }
  fill(ru0, bv + 5, ru0 + 2, bv + 7, 2); panel(ru0, bv + 5, ru0 + 2, bv + 7, Y, Y + 0.5, P, [0.3, 0.3, 0.36], 0, SUB.FABRIC);
  fill(ru1 - 1, bv + 2, ru1, bv + 4, 2); panel(ru1 - 1, bv + 2, ru1, bv + 4, Y, Y + 2, P, WOOD, 0, SUB.TIMBER);
  loot(ru1 - 0.5, bv + 6.5, 'locker', true); loot(ru0 + 0.5, bv + 1.5, 'tin', true);
  // The drying court: frames of washing, seats, planted corners, bikes by the stair.
  for (const [u, v] of [[3, 3], [W - 4, 3], [3, bv - 6], [W - 4, bv - 6]]) if (v > 2) { planter(u, v); planter(u, v + 1, [0.09, 0.2, 0.1]); }
  bench(cu - 4, 4); bench(cu + 4, 4);
  if (bv >= 14) for (const u of [cu - 5, cu + 5]) { for (const dv of [0, 3]) cyl(w, at(u, 7 + dv)[0], 0, 2.1, at(u, 7 + dv)[1], 0.04, P, DARK, 0, SUB.METAL); panel(u - 0.02, 7, u + 0.02, 10, 2.05, 2.08, P, DARK); for (let v = 7.3; v < 9.6; v += 0.8) panel(u - 0.03, v, u + 0.03, v + 0.55, 1.35, 2.05, P, rng.pick([[0.6, 0.6, 0.62], [0.5, 0.15, 0.15], [0.15, 0.25, 0.5]]), 0, SUB.FABRIC); }
  prop('bike', 9.5, bv - 4.5, Math.PI); prop('bike', W - 10.5, bv - 4.5, Math.PI);
  lamp(4, bv - 5, 3.4, WARM, 13, 1.5); lamp(W - 4, bv - 5, 3.4, WARM, 13, 1.5);
  arch(cu, 0.6, 3);
  // Whatever lot is left behind the block is ordinary housing.
  if (D - bv - 9 >= 9) { if (W >= 34) { K.addBuilding(w, rng, ...R(2, bv + 10, cu - 2, D - 1), STYLE.OLDTOWN, false, false); K.addBuilding(w, rng, ...R(cu + 2, bv + 10, W - 2, D - 1), STYLE.OLDTOWN, false, false); } else K.addBuilding(w, rng, ...R(2, bv + 10, W - 2, D - 1), STYLE.OLDTOWN, false, false); }
  const [ux, uz] = at(cu, bv - 1.5);
  return { gates: [[cu, 0]], upper: { x: ux, z: uz, y: Y }, room: { x: at(cu, bv + 3)[0], z: at(cu, bv + 3)[1], y: Y } };
}

// Cistern Green: the neighbourhood's lawn under its brick water cistern, with a shelter,
// a ring of seats and paths out to every street the lot touches.
function green(T) {
  const { w, rng, K, at, W, D, cu, cv, open, panel, paint, lamp, bench, tree, edges, arch } = T;
  paint(0, 0, W, D, SURF.GRASS);
  paint(cu - 2, 0, cu + 2, cv, SURF.WALK);
  if (open.back) paint(cu - 2, cv, cu + 2, D, SURF.WALK);
  if (open.left) paint(0, cv - 2, cu, cv + 2, SURF.WALK);
  if (open.right) paint(cu, cv - 2, W, cv + 2, SURF.WALK);
  const [x, z] = at(cu, cv), cx = Math.round(x), cz = Math.round(z), S = w.size;
  for (let zi = cz - 7; zi < cz + 7; zi++) for (let xi = cx - 7; xi < cx + 7; xi++) if ((xi + 0.5 - cx) ** 2 + (zi + 0.5 - cz) ** 2 < 42 && xi > 0 && zi > 0 && xi < S && zi < S) w.surface[zi * S + xi] = SURF.PLAZA;
  // The cistern: a brick drum on a stone foot, iron bands, a lit gauge strip and a ladder.
  w.fillRect(cx - 2, cz - 2, cx + 2, cz + 2, 1);
  cyl(w, cx, 0, 0.6, cz, 2.9, P, STONE, 0, SUB.WALL); cyl(w, cx, 0.6, 7.2, cz, 2.5, P, BRICK, 0, SUB.WALL); cyl(w, cx, 0.6, CUT, cz, 2.44, P, CAP, 0, SUB.CAP);
  for (const y of [2.2, 4.4, 6.6]) cyl(w, cx, y, y + 0.14, cz, 2.56, P, DARK, 0, SUB.METAL);
  cyl(w, cx, 7.2, 7.5, cz, 2.75, P, STEEL, 0, SUB.METAL); prim(w, SHAPE.CONE, cx, 8.1, cz, 5.2, 1.2, 5.2, P, [0.13, 0.15, 0.16], 0, SUB.METAL);
  box(w, cx, 3.9, cz + 2.53, 0.16, 5.6, 0.06, E, [0.5, 0.9, 1], 2.2); box(w, cx + 0.8, 3.9, cz + 2.55, 0.4, 6.6, 0.05, P, STEEL, 0, SUB.BARS, 1);
  light(w, cx, 3, cz + 4, WARM, 16, 1.5);
  for (const [du, dv, au] of [[-4.5, -3.5, true], [4.5, 3.5, true], [-3.5, 4.5, false], [3.5, -4.5, false]]) bench(cu + du, cv + dv, au);
  // A shelter with a notice board, back to the lawn.
  if (W >= 30) {
    const su = Math.max(4, cu - 12), sv = Math.max(4, cv - 12);
    for (const [du, dv] of [[0, 0], [5, 0], [0, 3], [5, 3]]) cyl(w, at(su + du, sv + dv)[0], 0, 2.7, at(su + du, sv + dv)[1], 0.08, P, DARK, 0, SUB.METAL);
    panel(su - 0.5, sv - 0.5, su + 5.5, sv + 3.5, 2.7, 2.86, P, [0.14, 0.17, 0.18], 0, SUB.METAL);
    panel(su + 0.4, sv - 0.06, su + 4.6, sv + 0.02, 0.9, 2.2, MAT.SIGN, [0.9, 0.86, 0.7], 1.1, rng.float(), 2);
    bench(su + 2.5, sv + 1.5); lamp(su + 2.5, sv + 3.3, 2.5, WARM, 9, 1.3);
    paint(su - 1, sv - 1, su + 6, sv + 4, SURF.PLAZA);
  }
  // A loop walk inside the hedge: the green is somewhere to go round, not a path to a wall.
  for (const r of [[4, 4, W - 4, 6], [4, D - 6, W - 4, D - 4], [4, 4, 6, D - 4], [W - 6, 4, W - 4, D - 4]]) paint(...r, SURF.WALK);
  for (let u = 9; u < W - 8; u += 9) { tree(u, 2); tree(u + 4, D - 3); if (Math.abs(u - cu) > 5) { lamp(u + 2, 6.4, 3.2, WARM, 12, 1.4); lamp(u - 2, D - 6.4, 3.2, WARM, 12, 1.4); } }
  for (let v = 10; v < D - 9; v += 9) { tree(2, v); tree(W - 3, v + 4); if (Math.abs(v - cv) > 5) { bench(7, v); bench(W - 8, v + 2); } }
  for (let k = 0; k < W * D / 260; k++) { const u = rng.irange(9, W - 10), v = rng.irange(9, D - 10); if (Math.hypot(u - cu, v - cv) > 10 && Math.abs(u - cu) > 4 && Math.abs(v - cv) > 4) tree(u, v); }
  lamp(cu - 2.4, 9, 3.2, WARM, 12, 1.4);
  K.addPoi(w, rng.chance(0.5) ? 'shrine' : 'cache', Math.floor(at(cu + 5.5, cv - 5.5)[0]) + 0.5, Math.floor(at(cu + 5.5, cv - 5.5)[1]) + 0.5);
  edges('hedge'); arch(cu, 0.6, 2.5);
  return [[cu, 0], open.back && [cu, D - 0.5], open.left && [0.5, cv], open.right && [W - 0.5, cv]];
}

// ---------------------------------------------------------------- Alder Spillbank
// One alder: a trunk, five boughs under layered crowns and ferns round its foot.
function alder(w, rng, x, z) {
  const h = rng.range(3, 8), broad = rng.range(1.3, 2.6), leaf = rng.pick([[0.075, 0.16, 0.085], [0.12, 0.19, 0.09], [0.10, 0.22, 0.16]]);
  cyl(w, x, 0, h, z, h * 0.04, P, [0.12, 0.1, 0.08], 0, SUB.BARK);
  w.fillRect(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1);
  const crown = rng.range(0, 6.28);
  for (let k = 0; k < 5; k++) {
    const a = crown + 2.4 * k, reach = broad * (1 - k * 0.14), dx = Math.cos(a) * reach, dz = Math.sin(a) * reach;
    primR(w, SHAPE.CYL, x + dx / 2, h - 0.8 + k * 0.33, z + dz / 2, 0.17, Math.hypot(1.6, reach), 0.17, P, STONE, 0, SUB.BARK, 0, 0, 0, Math.atan2(dx, dz), Math.atan2(reach, 1.6));
    const sprig = broad * rng.range(0.56, 0.83), hue = leaf.map((c) => c * (0.8 + k * 0.08));
    ball(w, x + dx, h + k * 0.36, z + dz, sprig, MAT.FOLIAGE, hue, 0, rng.float(), 0.6);
    ball(w, x + dx * 0.61, h + k * 0.36 + 0.34, z + dz * 0.61, sprig * 0.86, MAT.FOLIAGE, hue, 0, rng.float(), 0.64);
  }
  for (let k = 0; k < 5; k++) {
    const a = rng.range(0, 6.28), reach = rng.range(0.9, 2.3);
    primR(w, SHAPE.CONE, x + Math.sin(a) * reach, 0.34, z + Math.cos(a) * reach, 0.45, rng.range(0.65, 1.05), 0.32, MAT.FOLIAGE, leaf, 0, rng.float(), 0, 0, 0, a, 0.4);
  }
}
// Plant a rectangle with alders, clear of the paths and of anything already standing.
function plant(T, u0, v0, u1, v1, per = 52, keep = () => false) {
  const { w, rng, at } = T;
  for (let i = 0; i < (u1 - u0) * (v1 - v0) / per; i++) {
    const u = rng.range(u0 + 3, u1 - 3), v = rng.range(v0 + 3, v1 - 3), [x, z] = at(u, v);
    if (keep(u, v) || w.surf(x, z) !== SURF.GRASS || !w.circleFree(x, z, 2) || w.floorAt(x, z) !== 0) continue;
    alder(w, rng, x, z);
  }
}

// Rill Garden: alders over crossing paths. The named garden also has the rill itself, a
// stone-kerbed runnel from a spring basin to a pool, slab bridges where the paths cross it,
// a pergola walk and a tea pavilion.
function grove(T, named) {
  const { w, rng, at, W, D, cu, cv, open, panel, fill, paint, lamp, bench, loot, planter, edges, arch } = T;
  paint(0, 0, W, D, SURF.GRASS);
  paint(cu - 2, 0, cu + 2, cv + 2, SURF.WALK);
  if (open.back) paint(cu - 2, cv, cu + 2, D, SURF.WALK);
  if (open.left) paint(0, cv - 2, cu, cv + 2, SURF.WALK);
  if (open.right) paint(cu, cv - 2, W, cv + 2, SURF.WALK);
  const nearPath = (u, v) => Math.abs(u - cu) < 4 || Math.abs(v - cv) < 4;
  if (named && W >= 30 && D >= 30) {
    // The rill: along the front quarter, down the garden, out along the back quarter.
    const a = Math.max(5, Math.floor(D * 0.27)), b = Math.min(D - 6, Math.floor(D * 0.73)), ru = Math.max(5, cu - Math.max(7, Math.floor(W * 0.22)));
    const water = [0.03, 0.09, 0.11], runs = [[3, a, ru + 1, a + 1], [ru, a, ru + 1, b + 1], [ru, b, W - 3, b + 1]];
    for (const [u0, v0, u1, v1] of runs) {
      const alongU = u1 - u0 > v1 - v0;
      fill(u0, v0, u1, v1, 2);
      panel(u0 + (alongU ? 0 : 0.15), v0 + (alongU ? 0.15 : 0), u1 - (alongU ? 0 : 0.15), v1 - (alongU ? 0.15 : 0), 0.01, 0.06, MAT.GLOSS, water);
      for (const s of [0, 1]) panel(alongU ? u0 : u0 + s * 0.85, alongU ? v0 + s * 0.85 : v0, alongU ? u1 : u0 + 0.15 + s * 0.85, alongU ? v0 + 0.15 + s * 0.85 : v1, 0, 0.16, P, STONE, 0, SUB.QUAY);
    }
    // Slab bridges where the two paths cross the water; the crossings stay walkable.
    for (const [u0, v0, u1, v1] of [[ru, cv - 2, ru + 1, cv + 2], [cu - 2, b, cu + 2, b + 1]]) {
      if (u0 === ru && !open.left) continue;
      fill(u0, v0, u1, v1, 0); panel(u0 - 0.2, v0 - 0.2, u1 + 0.2, v1 + 0.2, 0.02, 0.1, P, [0.3, 0.31, 0.29], 0, SUB.QUAY);
      for (const [u, v] of [[u0 - 0.1, v0 - 0.1], [u1 + 0.1, v1 + 0.1]]) { const [x, z] = at(u, v); ball(w, x, 0.2, z, 0.09, E, CYAN, 3); }
    }
    for (const [u, v, r] of [[3.5, a + 0.5, 1.5], [W - 3.5, b + 0.5, 1.9]]) {
      const [x, z] = at(u, v); cyl(w, x, 0, 0.22, z, r + 0.25, P, STONE, 0, SUB.QUAY); cyl(w, x, 0.22, 0.26, z, r, MAT.GLOSS, water); cyl(w, x, 0.26, 0.29, z, 0.3, E, CYAN, 2);
      w.fillRect(x - r, z - r, x + r, z + r, 2); light(w, x, 1, z, CYAN, 9, 1.1);
    }
    // The pergola over the first stretch of the entry path.
    for (let v = 3; v < Math.min(a - 1, cv - 4); v += 3) {
      for (const s of [-1, 1]) { const [x, z] = at(cu + s * 2.3, v); cyl(w, x, 0, 2.8, z, 0.08, P, WOOD, 0, SUB.TIMBER); }
      panel(cu - 2.7, v - 0.08, cu + 2.7, v + 0.08, 2.8, 2.94, P, WOOD, 0, SUB.TIMBER);
      const [x, z] = at(cu + rng.range(-1.6, 1.6), v + 1.2); ball(w, x, 3.05, z, rng.range(0.7, 1.1), MAT.FOLIAGE, [0.1, 0.22, 0.12], 0, rng.float(), 0.35);
    }
    for (const s of [-1, 1]) panel(cu + s * 2.3 - 0.07, 3, cu + s * 2.3 + 0.07, Math.min(a - 1, cv - 4), 2.94, 3.06, P, WOOD, 0, SUB.TIMBER);
    // The tea pavilion in the far quarter, open on all sides.
    const pu = Math.min(W - 8, cu + Math.max(7, Math.floor(W * 0.22))), pv = Math.max(6, Math.floor(cv * 0.5));
    paint(pu - 3, pv - 3, pu + 3, pv + 3, SURF.PLAZA); paint(cu, pv - 1, pu, pv + 1, SURF.WALK);
    for (const [du, dv] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) { const [x, z] = at(pu + du, pv + dv); cyl(w, x, 0, 2.9, z, 0.1, P, [0.3, 0.1, 0.08], 0, SUB.TIMBER); }
    panel(pu - 3.2, pv - 3.2, pu + 3.2, pv + 3.2, 2.9, 3.05, P, [0.3, 0.1, 0.08], 0, SUB.TIMBER);
    { const [x, z] = at(pu, pv); prim(w, SHAPE.CONE, x, 3.75, z, 7, 1.4, 7, P, [0.13, 0.16, 0.15], 0, SUB.ROOFTILE); ball(w, x, 2.5, z, 0.2, E, MOON, 4); light(w, x, 2.3, z, MOON, 12, 1.6); }
    bench(pu - 1.5, pv + 1.5); loot(pu + 1.5, pv - 1.5, 'basket', false);
    for (const s of [-1, 1]) { planter(cu + s * 3.5, 1.5, [0.3, 0.12, 0.2]); planter(cu + s * 4.5, 1.5, [0.34, 0.3, 0.12]); }
    arch(cu, 0.6, 2.6, true, MOON);
  }
  // Lanterns down the paths, alternating sides: the way through the trees is the lit one.
  for (let v = 4, k = 0; v < (open.back ? D - 2 : cv); v += 9, k++) lamp(cu + (k % 2 ? 2.4 : -2.4), v, 2.6, MOON, 11, 1.3);
  for (let u = 5, k = 0; u < W - 3; u += 9, k++) if (Math.abs(u - cu) > 4 && (u < cu ? open.left : open.right)) lamp(u, cv + (k % 2 ? 2.4 : -2.4), 2.6, MOON, 11, 1.3);
  bench(cu + 2.6, cv - 3.5, false); bench(cu - 3.6, cv + 2.6, true);
  plant(T, 0, 0, W, D, named ? 52 : 64, nearPath);
  edges('hedge');
  return [[cu, 0], open.back && [cu, D - 0.5], open.left && [0.5, cv], open.right && [W - 0.5, cv]];
}

// Heron Boards: a reed pond a metre below its banks, crossed by a timber boardwalk that
// widens into a hide at the middle. Every arm of the walk ends on a street.
function boards(T) {
  const { w, rng, at, W, D, cu, cv, open, panel, fill, paint, floor, deck, lamp, bench, loot, tree, edges, arch } = T;
  paint(0, 0, W, D, SURF.GRASS);
  const p0 = 4, q0 = 5, p1 = W - 4, q1 = D - 4;
  floor(p0, q0, p1, q1, -1); fill(p0, q0, p1, q1, 2); paint(p0, q0, p1, q1, SURF.WATER);
  const walk = [[cu - 1, 0, cu + 2, cv], [cu - 3, cv - 3, cu + 4, cv + 4]], gates = [[cu, 0]];
  if (open.back) { walk.push([cu - 1, cv, cu + 2, D]); gates.push([cu, D - 0.5]); }
  if (open.left) { walk.push([0, cv - 1, cu, cv + 2]); gates.push([0.5, cv]); }
  if (open.right) { walk.push([cu, cv - 1, W, cv + 2]); gates.push([W - 0.5, cv]); }
  // With one street only, the walk loops back to it rather than stopping over the water.
  if (gates.length === 1) { const ou = Math.min(W - 7, cu + 9); walk.push([cu, cv + 1, ou + 3, cv + 4], [ou, 0, ou + 3, cv + 4]); gates.push([ou + 1, 0]); }
  for (const r of walk) {
    fill(...r, 0); floor(...r, 0); paint(...r, SURF.WALK); deck(...r);
    panel(r[0], r[1], r[2], r[3], -0.16, 0.035, P, [0.27, 0.2, 0.13], 0, SUB.TIMBER);
  }
  // Piles under the walk, a toe rail and a rope line along its open edges.
  const onWalk = (u, v) => walk.some((r) => u >= r[0] && u < r[2] && v >= r[1] && v < r[3]), wet = (u, v) => u >= p0 && u < p1 && v >= q0 && v < q1 && !onWalk(u, v);
  for (const r of walk) for (let u = r[0]; u < r[2]; u++) for (let v = r[1]; v < r[3]; v++) {
    for (const [du, dv] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (!wet(u + du, v + dv)) continue;
      const e = du ? [du > 0 ? u + 0.9 : u, v, du > 0 ? u + 1 : u + 0.1, v + 1] : [u, dv > 0 ? v + 0.9 : v, u + 1, dv > 0 ? v + 1 : v + 0.1];
      panel(...e, 0.035, 0.2, P, [0.2, 0.15, 0.1], 0, SUB.TIMBER);
      if ((u + v) % 3 === 0) { const [x, z] = at(u + 0.5 + du * 0.45, v + 0.5 + dv * 0.45); cyl(w, x, -1.4, 0.95, z, 0.07, P, [0.2, 0.15, 0.1], 0, SUB.TIMBER); }
    }
  }
  // The hide: a lean-to over a bench, a basket left under it, a lantern on the rail.
  for (const [du, dv] of [[-2.8, 3.8], [3.8, 3.8], [-2.8, 1], [3.8, 1]]) { const [x, z] = at(cu + du, cv + dv); cyl(w, x, 0, dv > 2 ? 2.2 : 2.8, z, 0.08, P, WOOD, 0, SUB.TIMBER); }
  panel(cu - 3.2, cv + 0.6, cu + 4.2, cv + 4.2, 2.6, 2.74, P, [0.16, 0.19, 0.16], 0, SUB.CORRUGATED);
  bench(cu + 2.5, cv + 3.5); loot(cu - 2.5, cv + 3.5, 'basket', false);
  lamp(cu - 2.6, cv - 2.6, 2.4, MOON, 12, 1.5);
  // Reeds along the banks, lily pads, and a few lights low over the water.
  for (let k = 0; k < (W + D) * 0.9; k++) {
    const u = rng.range(p0 + 0.3, p1 - 0.3), v = rng.range(q0 + 0.3, q1 - 0.3), bank = Math.min(u - p0, p1 - u, v - q0, q1 - v);
    if (!wet(Math.floor(u), Math.floor(v))) continue;
    const [x, z] = at(u, v);
    if (bank < 2.5 || rng.chance(0.25)) for (let q = 0; q < 3; q++) primR(w, SHAPE.CONE, x + rng.range(-0.4, 0.4), -0.2, z + rng.range(-0.4, 0.4), 0.16, rng.range(1.4, 2.2), 0.16, MAT.FOLIAGE, [0.14, 0.2, 0.09], 0, rng.float(), 0, 0, 0, rng.range(0, 6.28), rng.range(-0.12, 0.12));
    else if (rng.chance(0.5)) cyl(w, x, -0.99, -0.96, z, rng.range(0.3, 0.55), MAT.FOLIAGE, [0.08, 0.2, 0.1]);
    else if (rng.chance(0.3)) ball(w, x, rng.range(-0.5, 0.4), z, 0.05, E, [0.7, 1, 0.5], 4, rng.float());
  }
  for (const [u, v] of [[2, 2], [W - 3, 2], [2, D - 3], [W - 3, D - 3], [2, cv + 6], [W - 3, cv - 6]]) tree(u, v);
  bench(cu - 4, 2); bench(cu + 5, 2);
  for (const [u, v] of gates) lamp(u + (v < 1 || v > D - 1 ? 2.2 : 0), v + (v < 1 || v > D - 1 ? (v < 1 ? 1 : -1) : 2.2), 2.6, MOON, 11, 1.4);
  edges('hedge', { back: open.back ? cu : false, left: open.left ? cv : false, right: open.right ? cv : false });
  arch(cu, 0.6, 2, true, MOON);
  return gates;
}

// Fernlight House: a nursery glasshouse with a door in each end and one on the street,
// planting benches under violet grow lights, and a potting table worth searching.
function glass(T) {
  const { w, rng, F, at, W, D, cu, open, panel, fill, paint, lamp, loot, prop, tree, edges, arch, planter } = T;
  paint(0, 0, W, D, SURF.GRASS);
  const GW = Math.min(W - 8, 30), GD = Math.min(D - 11, 14), u0 = Math.floor((W - GW) / 2), u1 = u0 + GW, v0 = 6, v1 = v0 + GD, mv = Math.floor((v0 + v1) / 2);
  paint(cu - 2, 0, cu + 2, v0, SURF.WALK); paint(0, mv - 2, u0, mv + 2, SURF.WALK); paint(u1, mv - 2, W, mv + 2, SURF.WALK);
  paint(1, 1, 3, D - 1, SURF.WALK); paint(W - 3, 1, W - 1, D - 1, SURF.WALK); paint(1, v1 + 2, W - 1, v1 + 4, SURF.WALK); paint(1, 1, W - 1, 3, SURF.WALK);
  fill(u0 + 1, v0 + 1, u1 - 1, v1 - 1, 0); paint(u0, v0, u1, v1, SURF.FLOOR);
  const glassCol = [0.07, 0.14, 0.13], doors = { f: [cu - 1, cu + 1], l: [mv - 1, mv + 1], r: [mv - 1, mv + 1] };
  const wall = (a0, b0, a1, b1) => {
    if (a1 - a0 <= 0 || b1 - b0 <= 0) return;
    fill(a0, b0, a1, b1, 1); panel(a0, b0, a1, b1, 0, 0.8, P, BRICK, 0, SUB.WALL);
    panel(a0 + (a1 - a0 > 1 ? 0 : 0.42), b0 + (b1 - b0 > 1 ? 0 : 0.42), a1 - (a1 - a0 > 1 ? 0 : 0.42), b1 - (b1 - b0 > 1 ? 0 : 0.42), 0.8, 3.1, MAT.GLOSS, glassCol, 0, 1);
  };
  for (const [f, lo, hi, fixed] of [['f', u0, u1, v0], ['b', u0, u1, v1 - 1], ['l', v0 + 1, v1 - 1, u0], ['r', v0 + 1, v1 - 1, u1 - 1]]) {
    const alongU = f === 'f' || f === 'b', g = doors[f];
    const seg = (s, e) => (alongU ? wall(s, fixed, e, fixed + 1) : wall(fixed, s, fixed + 1, e));
    if (g) { seg(lo, g[0]); seg(g[1], hi); const r = alongU ? [g[0], fixed, g[1], fixed + 1] : [fixed, g[0], fixed + 1, g[1]]; fill(...r, 0); panel(...r, 2.5, 3.1, P, STEEL, 0, SUB.METAL); const out = f === 'f' || f === 'l' ? fixed - 0.08 : fixed + 1, e = alongU ? [g[0], out, g[1], out + 0.08] : [out, g[0], out + 0.08, g[1]]; panel(...e, 2.38, 2.5, E, [1, 0.5, 0.85], 2.4); }
    else seg(lo, hi);
    for (let t = lo; t <= hi; t += 3) { if (g && t > g[0] - 0.5 && t < g[1] + 0.5) continue; const [x, z] = alongU ? at(t, fixed + 0.5) : at(fixed + 0.5, t); cyl(w, x, 0.8, 3.1, z, 0.06, P, STEEL, 0, SUB.METAL); }
  }
  // The ridge roof: two glass leaves leaning on a steel ridge.
  { const half = GD / 2, tilt = 0.42, [x, z] = at((u0 + u1) / 2, (v0 + v1) / 2), [fx, fz] = F.dir(0, 1), len = half / Math.cos(tilt);
    for (const s of [-1, 1]) primR(w, SHAPE.BOX, x + fx * s * half / 2, 3.1 + Math.tan(tilt) * half / 2, z + fz * s * half / 2, GW, 0.07, len, MAT.GLOSS, glassCol, 0, 1, 0, 0, 0, F.yawIn, s * tilt);
    box(w, x, 3.1 + Math.tan(tilt) * half, z, F.s < 2 ? GW : 0.16, 0.16, F.s < 2 ? 0.16 : GW, P, STEEL, 0, SUB.METAL); }
  // Planting benches in two rows, each under its own strip of grow light.
  for (const v of [v0 + 3, v1 - 4]) {
    for (let u = u0 + 2; u + 2 <= u1 - 2; u += 3) {
      if (Math.abs(u + 1 - cu) < 2.5) continue;
      fill(u, v, u + 2, v + 1, 2); panel(u, v, u + 2, v + 1, 0.7, 0.82, P, STEEL, 0, SUB.METAL);
      for (const [a, b] of [[0.1, 0.1], [1.8, 0.8]]) cyl(w, at(u + a, v + b)[0], 0, 0.7, at(u + a, v + b)[1], 0.04, P, STEEL, 0, SUB.METAL);
      for (let q = 0; q < 3; q++) { const [x, z] = at(u + 0.35 + q * 0.65, v + 0.5); ball(w, x, 1.02, z, rng.range(0.22, 0.34), MAT.FOLIAGE, rng.pick([[0.08, 0.24, 0.12], [0.14, 0.26, 0.1], [0.07, 0.2, 0.2]]), 0, rng.float(), rng.range(0.8, 1.5)); }
    }
    panel(u0 + 2, v + 0.42, u1 - 2, v + 0.58, 2.55, 2.63, E, [1, 0.42, 0.85], 2.6);
    for (let u = u0 + 5; u < u1 - 3; u += 9) { const [x, z] = at(u, v + 0.5); light(w, x, 2.3, z, [1, 0.45, 0.85], 9, 1.5); }
  }
  // The potting table against the back wall, sacks and a cabinet beside it.
  fill(cu - 2, v1 - 2, cu + 2, v1 - 1, 2); panel(cu - 2, v1 - 2, cu + 2, v1 - 1, 0.74, 0.84, P, WOOD, 0, SUB.TIMBER);
  loot(cu - 2.5, v1 - 1.5, 'tin', true); loot(u0 + 1.5, v0 + 1.5, 'crate', true); loot(u1 - 1.5, v1 - 1.5, 'locker', true);
  // Outside: cold frames, a rain tank, pots by the door and a tree at each corner.
  for (let u = u0 + 1; u + 2 < cu - 3; u += 3) { fill(u, v0 - 2, u + 2, v0 - 1, 2); panel(u, v0 - 2, u + 2, v0 - 1, 0, 0.45, P, WOOD, 0, SUB.TIMBER); panel(u + 0.06, v0 - 1.94, u + 1.94, v0 - 1.06, 0.45, 0.5, MAT.GLOSS, glassCol, 0, 1); }
  { const [x, z] = at(u1 - 1.5, v1 + 1); if (w.circleFree(x, z, 1)) { cyl(w, x, 0, 1.9, z, 0.85, P, [0.14, 0.2, 0.2], 0, SUB.CORRUGATED); w.fillRect(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 2); } }
  prop('pot', cu + 3, v0 - 1.5, Math.PI); planter(cu - 3.5, 1.5, [0.3, 0.12, 0.2]); planter(cu + 3.5, 1.5, [0.34, 0.3, 0.12]);
  for (const [u, v] of [[4, D - 3], [W - 5, D - 3], [4, 4], [W - 5, 4]]) tree(u, v);
  // The nursery rows behind the house: saplings in tubs, a walk between every pair of rows.
  for (let v = v1 + 6; v + 1 < D - 3; v += 4) for (let u = 5; u + 1 < W - 4; u += 2) {
    if (Math.abs(u - cu) < 2 || rng.chance(0.15)) continue;
    const [x, z] = at(u + 0.5, v + 0.5); if (w.cell(x, z) !== 0) continue;
    w.fillRect(Math.floor(x), Math.floor(z), Math.floor(x) + 1, Math.floor(z) + 1, 2); cyl(w, x, 0, 0.4, z, 0.32, P, [0.16, 0.1, 0.08], 0, SUB.PLANTER); prim(w, SHAPE.CONE, x, 1.2, z, 0.8, 1.7, 0.8, MAT.FOLIAGE, rng.pick([[0.08, 0.2, 0.1], [0.12, 0.22, 0.09]]), 0, rng.float());
  }
  if (D - v1 >= 12) { paint(cu - 1, v1 + 4, cu + 1, D - (open.back ? 0 : 3), SURF.WALK); lamp(cu + 1.4, v1 + 8, 2.6, MOON, 11, 1.3); }
  lamp(cu + 2.4, 3, 2.6, MOON, 11, 1.3); lamp(u0 - 1.5, mv + 2.5, 2.6, MOON, 11, 1.3); lamp(u1 + 1.5, mv - 2.5, 2.6, MOON, 11, 1.3);
  edges('hedge'); arch(cu, 0.6, 2.5, true, [1, 0.5, 0.85]);
  return { gates: [[cu, 0], open.left && [0.5, mv], open.right && [W - 0.5, mv], open.back && [cu, D - 0.5]], room: { x: at(cu, mv)[0], z: at(cu, mv)[1], y: 0 } };
}

// Furrow Plots: allotments behind a wire fence. Raised beds in rows, bean frames, a rain
// butt at every other bed, and a potting shed that was left unlocked.
function plots(T, named) {
  const { w, rng, at, W, D, cu, cv, open, panel, fill, paint, lamp, loot, prop, hut, edges, arch } = T;
  paint(0, 0, W, D, SURF.GRASS);
  paint(cu - 1, 0, cu + 2, open.back ? D : D - 3, SURF.WALK); paint(open.left ? 0 : 3, cv - 1, open.right ? W : W - 3, cv + 2, SURF.WALK);
  const shed = named && W >= 28 && D >= 28 ? [W - 10, D - 9, W - 3, D - 3] : null;
  for (let u = 3; u + 3 <= W - 3; u += 5) for (let v = 4; v + 6 <= D - 3; v += 8) {
    if ((u < cu + 3 && u + 3 > cu - 2) || (v < cv + 3 && v + 6 > cv - 2)) continue;
    if (shed && u + 3 > shed[0] - 2 && v + 6 > shed[1] - 2) continue;
    fill(u, v, u + 3, v + 6, 2);
    panel(u, v, u + 3, v + 6, 0, 0.32, P, WOOD, 0, SUB.TIMBER); panel(u + 0.12, v + 0.12, u + 2.88, v + 5.88, 0.32, 0.38, P, [0.1, 0.08, 0.06], 0, SUB.PLANTER);
    const crop = rng.int(3), leaf = rng.pick([[0.1, 0.24, 0.1], [0.16, 0.26, 0.08], [0.08, 0.2, 0.14]]);
    for (const du of [0.8, 2.2]) for (let dv = 0.6; dv < 5.6; dv += crop === 2 ? 1.1 : 0.7) {
      const [x, z] = at(u + du, v + dv);
      if (crop === 0) ball(w, x, 0.55, z, 0.28, MAT.FOLIAGE, leaf, 0, rng.float(), 0.8);
      else if (crop === 1) prim(w, SHAPE.CONE, x, 0.75, z, 0.3, 0.8, 0.3, MAT.FOLIAGE, leaf, 0, rng.float());
      else { cyl(w, x, 0.38, 2.0, z, 0.025, P, WOOD, 0, SUB.TIMBER); prim(w, SHAPE.CONE, x, 1.2, z, 0.5, 1.5, 0.5, MAT.FOLIAGE, leaf, 0, rng.float()); }
    }
    if (rng.chance(0.5)) prop('drum', u + 3.5, v + 0.5);
  }
  if (shed) {
    const [a, b, c, d] = shed, r = hut(a, b, c, d, { doors: [['l', b + 3]], col: [0.2, 0.16, 0.12], sub: SUB.TIMBER, lit: MOON, h: 2.8 });
    paint(cu + 2, b + 2, a, b + 4, SURF.WALK);
    fill(r.u0, r.v1 - 1, r.u1, r.v1, 2); panel(r.u0, r.v1 - 1, r.u1, r.v1, 0.74, 0.84, P, WOOD, 0, SUB.TIMBER);
    for (let u = r.u0 + 0.4; u < r.u1; u += 0.9) { const [x, z] = at(u, r.v1 - 0.5); cyl(w, x, 0.84, 1.1, z, 0.14, P, [0.36, 0.2, 0.12]); }
    loot(r.u1 - 0.5, r.v0 + 0.5, 'tin', true); loot(r.u0 + 0.5, r.v0 + 0.5, 'crate', true);
    // Compost bays beside it.
    for (let k = 0; k < 2; k++) { const u = a - 3 - k * 2.2; if (u < cu + 4) break; fill(u, d - 2, u + 2, d, 2); panel(u, d - 2, u + 2, d, 0, 1.0, P, WOOD, 0, SUB.TIMBER); panel(u + 0.15, d - 1.85, u + 1.85, d - 0.15, 1.0, 1.12, P, [0.12, 0.09, 0.06], 0, SUB.PLANTER); }
  }
  lamp(cu - 1.4, 4, 2.6, MOON, 11, 1.3); lamp(cu + 2.4, cv + 2.6, 2.6, MOON, 11, 1.3);
  edges('fence'); if (named) arch(cu + 0.5, 0.6, 2, true, MOON);
  return { gates: [[cu, 0], open.back && [cu, D - 0.5], open.left && [0.5, cv], open.right && [W - 0.5, cv]], room: shed && { x: at(shed[0] + 3, shed[1] + 3)[0], z: at(shed[0] + 3, shed[1] + 3)[1], y: 0 } };
}

// Spillbank Steps: where a planted lot meets the river, a promenade and a broad flight of
// steps down to the quay, under the gauge mast that marks the flood levels.
export function riverSteps(w, rng, L, K) {
  const T = tools(w, rng, L, K), { at, W, D, cu, paint, edges, arch } = T, q = K.quay, west = L.river < 0;
  const { x0, z0, x1, z1 } = L, za = z0 + 5, zb = z1 - 5, top = west ? x1 - 4 : x0 + 4, mz = Math.floor((za + zb) / 2);
  paint(0, 0, W, D, SURF.GRASS);
  // The promenade along the head of the steps, and the walk in from the street.
  w.paint(west ? top - 5 : top, z0 + 1, west ? top : top + 5, z1 - 1, SURF.WALK);
  const [ex, ez] = at(cu, 0), [ix, iz] = at(cu, 3), px = west ? top - 3 : top + 3;
  w.paint(Math.min(ix, px, ex) - 2, Math.min(iz, ez) - 2, Math.max(ix, px, ex) + 2, Math.max(iz, ez) + 2, SURF.WALK);
  if (west) slope(w, top, za, x1, zb, 'x+', 0, q.y); else slope(w, x0, za, top, zb, 'x-', 0, q.y);
  w.paint(west ? top : x0, za, west ? x1 : top, zb, SURF.WALK);
  // The gauge mast: a striped pole with lit level marks, at the middle of the top step.
  const gx = (west ? top - 1 : top) + 0.5, gz = mz + 0.5;
  w.fillRect(gx - 0.5, gz - 0.5, gx + 0.5, gz + 0.5, 1);
  cyl(w, gx, 0, 0.5, gz, 0.6, P, STONE, 0, SUB.QUAY);
  for (let k = 0; k < 9; k++) cyl(w, gx, 0.5 + k, 1.5 + k, gz, 0.14, P, k % 2 ? [0.6, 0.6, 0.58] : [0.1, 0.16, 0.2], 0, SUB.METAL);
  for (const y of [2.5, 4.5, 6.5, 8.5]) box(w, gx, y, gz, 0.7, 0.07, 0.7, E, CYAN, 3);
  ball(w, gx, 9.8, gz, 0.26, E, CYAN, 5); light(w, gx, 6, gz, CYAN, 22, 1.5);
  for (let z = za + 2, k = 0; z < zb; z += 8, k++) { cyl(w, west ? top - 0.4 : top + 0.4, 0, 2.6, z, 0.06, P, DARK, 0, SUB.METAL); ball(w, west ? top - 0.4 : top + 0.4, 2.75, z, 0.2, E, MOON, 4); if (k % 2 === 0) light(w, west ? top - 1 : top + 1, 2.4, z, MOON, 13, 1.4); }
  // Seats looking over the water, and the lawn planted behind them.
  for (let z = za + 5; z < zb - 3; z += 9) {
    const bx = Math.floor(west ? top - 4.5 : top + 4.5) + 0.5, bz = Math.floor(z) + 0.5;
    if (Math.abs(bz - gz) < 3 || w.cell(bx, bz) !== 0 || w.surf(bx, bz) !== SURF.WALK) continue;
    w.fillRect(bx - 0.5, bz - 0.5, bx + 0.5, bz + 0.5, 2); box(w, bx, 0.44, bz, 0.5, 0.08, 1.7, P, WOOD, 0, SUB.TIMBER); for (const o of [-0.65, 0.65]) box(w, bx, 0.2, bz + o, 0.4, 0.4, 0.08, P, DARK, 0, SUB.METAL);
  }
  plant(T, 0, 0, W, D, 70);
  edges('hedge', { back: false, left: false, right: false }); arch(cu, 0.6, 2.5, true, MOON);
  const quay = { x: west ? x1 + 1.5 : x0 - 1.5, z: mz }, head = { x: west ? top - 2.5 : top + 2.5, z: mz + 3 };
  return { entry: { x: ix, z: iz }, gates: [{ x: ix, z: iz }, quay], quay, head };
}

// ---------------------------------------------------------------- Sounding Basin
// Gauge House: a machine shed with daylight at both ends. Clad side walls with doors, an
// aisle between machine beds under a travelling crane, and the foreman's gauge deck.
function factory(T) {
  const { w, rng, F, R, at, W, D, cu, open, panel, fill, paint, floor, lamp, loot, prop, solid } = T;
  const hw = Math.min(16, cu - 3), v0 = 3, v1 = Math.min(D - 3, 51), len = v1 - v0, mv = Math.floor((v0 + v1) / 2);
  paint(0, 0, W, D, SURF.PLAZA); paint(cu - hw, v0, cu + hw, v1, SURF.FLOOR);
  panel(cu - hw - 0.4, v0 - 0.4, cu + hw + 0.4, v1 + 0.4, 8, 8.4, P, STEEL, 0, SUB.CORRUGATED);
  panel(cu - 2, v0, cu + 2, v1, 8.4, 9.3, P, STEEL, 0, SUB.METAL); panel(cu - 2.05, v0 + 1, cu + 2.05, v1 - 1, 8.5, 9.1, E, [0.5, 0.62, 0.7], 0.8);
  // Side walls between the columns, with a door a third and two thirds of the way down.
  const allDoors = len >= 30 ? [v0 + Math.floor(len / 3), v0 + Math.floor(2 * len / 3)] : [mv], hasDeck = hw >= 10 && len >= 26, deckV = v1 - 2 - 15;
  for (const s of [-1, 1]) {
    const wu = s < 0 ? cu - hw : cu + hw - 1, doorsAt = allDoors.filter((d) => !(s < 0 && hasDeck && d + 3 > deckV));
    let a = v0;
    for (const d of doorsAt) { solid(wu, a, wu + 1, d - 1, 0, 8, STEEL, SUB.CORRUGATED); panel(wu, d - 1, wu + 1, d + 2, 3, 8, P, STEEL, 0, SUB.CORRUGATED); panel(wu + (s < 0 ? -0.08 : 1), d - 1.2, wu + (s < 0 ? 0 : 1.08), d + 2.2, 3, 3.14, E, SODIUM, 2.4); a = d + 2; }
    solid(wu, a, wu + 1, v1, 0, 8, STEEL, SUB.CORRUGATED);
    for (let v = v0; v <= v1; v += 7) panel(wu - 0.1, Math.min(v, v1 - 0.7), wu + 1.1, Math.min(v, v1 - 0.7) + 0.7, 0, 8, P, [0.13, 0.16, 0.17], 0, SUB.METAL);
    // Machine beds along the wall: presses, lathes and pressure vessels, each with its lamp.
    for (let v = v0 + 2; v + 3 < v1 - 1; v += 4) {
      if (doorsAt.some((d) => v < d + 3 && v + 3 > d - 2) || (s < 0 && hasDeck && v + 3 > deckV)) continue;
      const mu = s < 0 ? wu + 2 : wu - 4, kind = rng.int(3), [x, z] = at(mu + 1.5, v + 1.5);
      fill(mu, v, mu + 3, v + 3, 2);
      if (kind === 0) { cyl(w, x, 0, 2.4, z, 1.4, P, STONE, 0, SUB.METAL); cyl(w, x, 2.4, 2.6, z, 0.5, P, DARK, 0, SUB.METAL); }
      else if (kind === 1) { panel(mu + 0.3, v + 0.3, mu + 2.7, v + 2.7, 0, 1.0, P, [0.13, 0.2, 0.2], 0, SUB.METAL); panel(mu + 0.8, v + 0.8, mu + 2.2, v + 2.2, 1.0, 3.0, P, [0.16, 0.24, 0.24], 0, SUB.METAL); panel(mu + 0.5, v + 0.5, mu + 2.5, v + 2.5, 3.0, 3.3, P, DARK, 0, SUB.METAL); }
      else { panel(mu + 0.9, v + 0.1, mu + 2.1, v + 2.9, 0, 1.0, P, [0.2, 0.22, 0.2], 0, SUB.METAL); const [fx, fz] = F.dir(0, 1); primR(w, SHAPE.CYL, x, 1.35, z, 0.5, 2.2, 0.5, P, PALE, 0, SUB.METAL, 0, 0, 0, Math.atan2(fx, fz), HALF); }
      ball(w, x, kind === 1 ? 3.45 : 2.75, z, 0.1, E, rng.chance(0.7) ? [0.3, 1, 0.5] : [1, 0.3, 0.2], 4, rng.float());
    }
  }
  // Work in progress stood between the aisle and the beds, clear of the cross walks to the doors.
  for (const s of [-1, 1]) for (let v = v0 + 4; v < v1 - 3; v += 5) if (!allDoors.some((d) => Math.abs(v - d - 0.5) < 2.5) && rng.chance(0.7) && hw >= 12) prop(rng.pick(['pallet', 'crates', 'drum', 'pallet']), cu + s * 7, v, s < 0 ? HALF : -HALF);
  // The aisle: hazard edges on the floor, the crane's rails, bridge and hook over it.
  for (const s of [-1, 1]) { panel(cu + s * 3 - 0.08, v0 + 1, cu + s * 3 + 0.08, v1 - 1, 0.005, 0.03, P, [0.62, 0.46, 0.06], 0, SUB.HAZARD); panel(cu + s * (hw - 1.6) - 0.15, v0, cu + s * (hw - 1.6) + 0.15, v1, 6.3, 6.6, P, [0.13, 0.16, 0.17], 0, SUB.METAL); }
  const bv = v0 + Math.floor(len * 0.62);
  panel(cu - hw + 1.4, bv - 0.4, cu + hw - 1.4, bv + 0.4, 6.6, 7.2, P, [0.6, 0.44, 0.06], 0, SUB.HAZARD);
  { const [x, z] = at(cu + 1.5, bv); cyl(w, x, 4.2, 6.6, z, 0.04, P, DARK); box(w, x, 3.7, z, 1.4, 1.0, 1.4, P, [0.3, 0.22, 0.12], 0, SUB.TIMBER); }
  for (const [v, s] of [[v0 + 1, 1], [v1 - 1, -1]]) { panel(cu - hw + 1, v - 0.18, cu + hw - 1, v + 0.18, 7.5, 7.7, E, WARM, 2); const [x, z] = at(cu, v + s * 2); light(w, x, 6, z, WARM, 20, 1.5); panel(cu - 5, v - 0.3 * s - 0.06, cu + 5, v - 0.3 * s + 0.06, 6.4, 7.3, MAT.SIGN, SODIUM, 2.4, rng.float(), 0); }
  { const [x, z] = at(cu, mv); light(w, x, 6.4, z, [0.8, 0.88, 1], 22, 1.5); }
  // The gauge deck: a steel floor a storey up in the back corner, a stair along the wall.
  let upper = null;
  if (hasDeck) {
    const du0 = cu - hw + 1, dv1 = v1 - 2, Y = 3;
    floor(du0, dv1 - 8, du0 + 6, dv1, Y); slope(w, ...R(du0, dv1 - 14, du0 + 2, dv1 - 8), F.inward, 0, Y);
    parapets(w, ...R(du0, dv1 - 8, du0 + 6, dv1));
    // The wall of gauges faces the floor: lit dials in dark bezels over the control desk.
    for (let k = 0; k < 6; k++) for (const y of [Y + 1.3, Y + 2.1]) { const v = dv1 - 7.2 + k * 1.15; panel(du0 - 0.02, v, du0 + 0.04, v + 0.7, y, y + 0.7, P, DARK, 0, SUB.METAL); panel(du0 + 0.04, v + 0.1, du0 + 0.07, v + 0.6, y + 0.1, y + 0.6, E, k % 3 === 1 ? [1, 0.6, 0.2] : [0.5, 0.95, 0.8], 1.8, rng.float()); }
    fill(du0 + 1, dv1 - 1, du0 + 4, dv1, 2); panel(du0 + 1, dv1 - 1, du0 + 4, dv1, Y, Y + 0.95, P, [0.13, 0.2, 0.2], 0, SUB.METAL); panel(du0 + 1.2, dv1 - 0.3, du0 + 3.8, dv1 - 0.24, Y + 1.0, Y + 1.5, E, [0.5, 0.95, 0.8], 1.5, rng.float());
    loot(du0 + 4.5, dv1 - 0.5, 'locker', true);
    { const [x, z] = at(du0 + 3, dv1 - 4); light(w, x, Y + 2.6, z, [0.5, 0.95, 0.8], 11, 1.6); upper = { x, z, y: Y }; }
  }
  loot(cu + hw - 2.5, v0 + 1.5, 'crate', true); loot(cu - hw + 2.5, mv - 4.5, 'crate', true);
  // Spare ground either side of the shed is worked ground: a tank farm, a stock yard.
  if (cu - hw - 4 >= 8) T.tanks(2, v0 + 1, cu - hw - 3, v1 - 1);
  if (W - (cu + hw + 9) >= 7) T.stock(cu + hw + 8, v0 + 1, W - 2, v1 - 1);
  // Outside: a lorry at the front, cylinders and drums along the walls, yard lamps.
  { const [x, z] = at(Math.min(W - 4, cu + hw + 3.5), Math.min(D - 6, v0 + 8)); if (cu + hw + 5 <= W) DR.vehicle(w, rng, x, z, F.s < 2, 'truck'); }
  for (let v = v0 + 4; v < v1 - 3; v += 7) { if (cu - hw - 2 >= 1) prop(rng.pick(['drum', 'pallet', 'gas']), cu - hw - 1.5, v, -HALF); if (cu + hw + 2 <= W - 1 && rng.chance(0.5)) prop(rng.pick(['drum', 'pallet', 'crates']), cu + hw + 1.5, v + 3, HALF); }
  lamp(cu - hw - 1.5, v0 - 1, 4.2, SODIUM, 15, 1.6); lamp(cu + hw + 1.5, v1 + 1, 4.2, SODIUM, 15, 1.6);
  return { gates: [[cu, 0], open.back && [cu, D - 0.5]], upper, room: { x: at(cu, mv)[0], z: at(cu, mv)[1], y: 0 } };
}

// Lantern Apron: a marshalling pad under two floodlight masts. Trailers in a row, a lorry,
// a dispatcher's hut, painted bays with blue edge lights.
function apron(T) {
  const { w, rng, F, at, W, D, cu, open, panel, fill, paint, mast, loot, prop, hut, run } = T;
  paint(0, 0, W, D, SURF.ROAD);
  for (let v = 4; v < D - 3; v += 7) {
    panel(cu - 0.22, v - 1.75, cu + 0.22, v + 1.75, 0, 0.05, P, [0.78, 0.72, 0.44]);
    for (const u of [2, W - 2]) { const [x, z] = at(u, v); ball(w, x, 0.18, z, 0.19, E, [0.4, 0.72, 1], 3); }
    if (v + 7 < D - 3) panel(2.5, v + 3.4, cu - 3, v + 3.56, 0, 0.04, P, [0.6, 0.6, 0.56]);
  }
  for (const v of [2, D - 2]) panel(cu - 5, v - 0.22, cu + 5, v + 0.22, 0, 0.05, P, STONE);
  mast(3, 3, 16, [1, 0.9, 0.72], 44); if (W >= 36 && D >= 36) mast(W - 4, D - 4, 16, [1, 0.9, 0.72], 44);
  // Trailers along one edge: a box on a chassis, legs down, one bay left empty.
  const skip = rng.int(4);
  for (let v = 7, k = 0; v + 9 < D - 4; v += 12, k++) {
    if (k === skip) continue;
    const u0 = W - 7, col = rng.pick([[0.42, 0.1, 0.07], [0.08, 0.2, 0.36], [0.1, 0.3, 0.16], [0.5, 0.26, 0.06], [0.3, 0.3, 0.31]]);
    fill(u0, v, u0 + 3, v + 9, 1);
    panel(u0 + 0.1, v, u0 + 2.9, v + 9, 1.25, 3.85, P, col, 0, SUB.CORRUGATED, rng.float()); panel(u0 + 0.3, v, u0 + 2.7, v + 9, 0.95, 1.25, P, DARK, 0, SUB.METAL); panel(u0 + 0.16, v + 0.06, u0 + 2.84, v + 8.94, 1.25, CUT, P, CAP, 0, SUB.CAP);
    panel(u0 + 0.2, v + 6, u0 + 2.8, v + 8.4, 0.1, 0.95, P, [0.03, 0.03, 0.035], 0, SUB.RUBBER);
    for (const du of [0.5, 2.3]) panel(u0 + du, v + 1, u0 + du + 0.2, v + 1.2, 0, 0.95, P, STEEL, 0, SUB.METAL);
    panel(u0 + 0.6, v + 8.98, u0 + 2.4, v + 9.03, 1.0, 1.14, E, [1, 0.12, 0.08], 2);
  }
  // The dispatcher's hut in the back corner, its door onto the pad.
  let room = null;
  if (W >= 30 && D >= 30) {
    const r = hut(2, D - 9, 9, D - 3, { doors: [['r', D - 6]], col: [0.24, 0.27, 0.28], sub: SUB.CORRUGATED, lit: SODIUM, h: 3 });
    fill(r.u0, r.v0, r.u0 + 1, r.v0 + 3, 2); panel(r.u0, r.v0, r.u0 + 1, r.v0 + 3, 0, 0.9, P, STEEL, 0, SUB.METAL); panel(r.u0 + 0.05, r.v0 + 0.3, r.u0 + 0.12, r.v0 + 2.7, 1.0, 1.7, E, [0.4, 0.86, 1], 1.6, rng.float());
    loot(r.u0 + 0.5, r.v1 - 0.5, 'locker', true);
    { const [x, z] = at(5.5, D - 6); cyl(w, x, 3.2, 6.4, z, 0.04, P, DARK); ball(w, x, 6.5, z, 0.16, E, [1, 0.6, 0.2], 5, rng.float()); room = { x: at(6, D - 6)[0], z: at(6, D - 6)[1], y: 0 }; }
  }
  { const [x, z] = at(Math.max(6, cu - 7), Math.floor(D * 0.4)); DR.vehicle(w, rng, Math.floor(x) + 0.5, Math.floor(z) + 0.5, F.s < 2, 'truck'); }
  for (let k = 0; k < 5; k++) prop(rng.pick(['pallet', 'drum', 'crates']), rng.irange(4, Math.max(5, cu - 4)), rng.irange(5, D - 12), rng.range(0, 6.28));
  loot(cu - 5.5, D - 4.5, 'crate'); loot(W - 8.5, 4.5, 'crate');
  // A side with no street behind it is closed with striped barriers.
  if (!open.back) run(0, D - 1, W, D, 'barrier'); if (!open.left) run(0, 1, 1, D - 1, 'barrier'); if (!open.right) run(W - 1, 1, W, D - 1, 'barrier');
  return { gates: [[cu, 0], open.back && [cu, D - 0.5], open.left && [0.5, Math.floor(D / 2)]], room };
}

// Seal Yard: stacked container lanes behind a customs gate. The named yard has the gate
// portal, the seal office and a box left open on the gate lane.
function stacks(T, named) {
  const { w, rng, K, R, at, W, D, cu, panel, fill, paint, lamp, loot, hut, solid } = T;
  if (!named || W < 28 || D < 30) { K.containerYard(w, rng, ...R(2, 2, W - 2, D - 2)); return { gates: [[cu, 0]] }; }
  paint(0, 0, W, 9, SURF.ROAD);
  K.containerYard(w, rng, ...R(2, 9, W - 2, D - 2));
  // The gate: posts, a beam with the yard's board, barrier arms run up.
  for (const s of [-1, 1]) { solid(cu + s * 5 - (s < 0 ? 1 : 0), 1, cu + s * 5 + (s < 0 ? 0 : 1), 2, 0, 5.6, [0.2, 0.24, 0.24], SUB.HAZARD); const [x, z] = at(cu + s * 3.6, 1.5); primR(w, SHAPE.BOX, x, 2.4, z, 0.12, 3.6, 0.12, P, [0.75, 0.5, 0.05], 0, SUB.HAZARD, 0, 0, 0, T.F.yawIn, 0, s * 0.35); }
  panel(cu - 6, 1.1, cu + 6, 1.9, 5.6, 6.2, P, [0.14, 0.17, 0.17], 0, SUB.METAL); panel(cu - 4, 0.98, cu + 4, 1.08, 4.5, 5.5, MAT.SIGN, SODIUM, 2.8, rng.float(), 0);
  { const [x, z] = at(cu, 2.5); light(w, x, 4.8, z, SODIUM, 18, 1.6); }
  // The seal office beside the gate lane.
  let room = null;
  if (cu + 13 <= W - 1) {
    const r = hut(cu + 7, 2, cu + 13, 8, { doors: [['l', 5]], col: [0.25, 0.28, 0.29], sub: SUB.CORRUGATED, lit: SODIUM, h: 3 });
    fill(r.u1 - 1, r.v0, r.u1, r.v1, 2); panel(r.u1 - 1, r.v0, r.u1, r.v1, 0, 0.9, P, STEEL, 0, SUB.METAL);
    for (let v = r.v0 + 0.4; v < r.v1; v += 0.8) panel(r.u1 - 0.8, v, r.u1 - 0.3, v + 0.5, 0.9, 1.2, P, rng.pick([[0.5, 0.42, 0.2], [0.3, 0.32, 0.36]]), 0, SUB.FABRIC);
    loot(r.u0 + 0.5, r.v0 + 0.5, 'locker', true); room = { x: at(cu + 9.5, 5)[0], z: at(cu + 9.5, 5)[1], y: 0 };
  }
  // An opened box on the lane: three walls, a strip light, something left at the back.
  if (cu - 7 >= 10) {
    const u0 = 3, col = [0.1, 0.3, 0.16];
    solid(u0, 3, u0 + 7, 4, 0, 2.6, col, SUB.CORRUGATED); solid(u0, 6, u0 + 7, 7, 0, 2.6, col, SUB.CORRUGATED); solid(u0, 4, u0 + 1, 6, 0, 2.6, col, SUB.CORRUGATED);
    paint(u0 + 1, 4, u0 + 7, 6, SURF.FLOOR); panel(u0, 3, u0 + 7, 7, 2.6, 2.72, P, col, 0, SUB.CORRUGATED);
    panel(u0 + 1.5, 4.9, u0 + 6, 5.1, 2.5, 2.56, E, [1, 0.9, 0.7], 1.6); { const [x, z] = at(u0 + 3.5, 5); light(w, x, 2.2, z, [1, 0.9, 0.7], 7, 1.4); }
    loot(u0 + 1.5, 4.5, 'crate', true);
  }
  lamp(cu - 6.5, 3.5, 4.2, SODIUM, 15, 1.6);
  return { gates: [[cu, 0]], room };
}

// Brine Locker: a cold store. Lorries back up to a loading dock a metre over the yard, a
// ramp at one end and steps at the other; the hall behind it runs through to a rear door.
function cold(T) {
  const { w, rng, F, R, at, W, D, cu, panel, fill, paint, floor, lamp, loot } = T;
  const Y = 1, hv0 = 9, hv1 = Math.min(D - 4, 33), u0 = 3, u1 = W - 3, white = [0.56, 0.6, 0.62], frost = [0.6, 0.92, 1];
  paint(0, 0, W, D, SURF.ROAD); paint(u0, 5, u1, hv0, SURF.WALK);
  // The dock, its ramp and its steps.
  floor(u0 + 4, 5, u1 - 2, hv0, Y); slope(w, ...R(u0, 5, u0 + 4, hv0), F.along, 0, Y, 'ramp'); slope(w, ...R(u1 - 2, 5, u1, hv0), OPP[F.along], 0, Y);
  // The hall: insulated panel walls, three dock doors, racks in rows, a rear door and steps.
  floor(u0, hv0, u1, hv1, Y); fill(u0, hv0, u1, hv1, 1); fill(u0 + 1, hv0 + 1, u1 - 1, hv1 - 1, 0); paint(u0, hv0, u1, hv1, SURF.FLOOR);
  const doorsAt = [cu - 8, cu, cu + 8].filter((u) => u - 2 >= u0 + 5 && u + 2 <= u1 - 3);
  let a = u0;
  for (const d of doorsAt) {
    panel(a, hv0, d - 1, hv0 + 1, 0, 7, MAT.ENAMEL, white); fill(d - 1, hv0, d + 2, hv0 + 1, 0);
    panel(d - 1, hv0, d + 2, hv0 + 1, Y + 3, 7, MAT.ENAMEL, white); panel(d - 1.2, hv0 - 0.08, d + 2.2, hv0, Y + 3, Y + 3.16, E, frost, 2.6);
    for (let q = 0; q < 6; q++) panel(d - 1 + q * 0.5, hv0 + 0.45, d - 0.6 + q * 0.5, hv0 + 0.5, Y + 2.2, Y + 3, MAT.GLOSS, [0.2, 0.3, 0.32], 0, 1);
    panel(d - 0.3, hv0 - 0.1, d + 1.3, hv0 - 0.04, Y + 3.3, Y + 4.1, MAT.SIGN, frost, 2, rng.float(), 2);
    a = d + 2;
  }
  panel(a, hv0, u1, hv0 + 1, 0, 7, MAT.ENAMEL, white);
  panel(u0, hv0 + 1, u0 + 1, hv1, 0, 7, MAT.ENAMEL, white); panel(u1 - 1, hv0 + 1, u1, hv1, 0, 7, MAT.ENAMEL, white);
  panel(u0 + 1, hv1 - 1, cu - 1, hv1, 0, 7, MAT.ENAMEL, white); panel(cu + 1, hv1 - 1, u1 - 1, hv1, 0, 7, MAT.ENAMEL, white);
  fill(cu - 1, hv1 - 1, cu + 1, hv1, 0); panel(cu - 1, hv1 - 1, cu + 1, hv1, Y + 2.5, 7, MAT.ENAMEL, white); panel(cu - 1.2, hv1, cu + 1.2, hv1 + 0.08, Y + 2.5, Y + 2.64, E, frost, 2.6);
  slope(w, ...R(cu - 1, hv1, cu + 1, hv1 + 2), F.inward, Y, 0); fill(cu - 1, hv1, cu + 1, hv1 + 2, 0);
  panel(u0 - 0.3, hv0 - 0.3, u1 + 0.3, hv1 + 0.3, 7, 7.3, P, [0.4, 0.43, 0.44], 0, SUB.METAL);
  for (let u = u0 + 3; u + 2 < u1 - 2; u += 7) { panel(u, hv0 + 3, u + 2, hv0 + 5, 7.3, 8.3, P, PALE, 0, SUB.METAL); const [x, z] = at(u + 1, hv0 + 4); cyl(w, x, 8.3, 8.36, z, 0.7, P, DARK, 0, SUB.METAL); }
  for (let v = hv0 + 4; v + 1 < hv1 - 3; v += 4) {
    for (const [ra, rb] of [[u0 + 3, cu - 2], [cu + 2, u1 - 3]]) {
      if (rb - ra < 2) continue;
      fill(ra, v, rb, v + 1, 1); panel(ra, v + 0.1, rb, v + 0.9, Y, Y + 3.4, P, [0.15, 0.2, 0.22], 0, SUB.BARS);
      for (const y of [Y + 0.1, Y + 1.25, Y + 2.4]) for (let u = ra + 0.15; u + 0.8 < rb; u += 1.05) if (rng.chance(0.7)) panel(u, v + 0.14, u + 0.8, v + 0.86, y, y + 0.8, P, rng.pick([[0.5, 0.56, 0.6], [0.2, 0.36, 0.5], [0.56, 0.5, 0.36]]), 0, SUB.FABRIC);
    }
    panel(u0 + 2, v + 2.4, u1 - 2, v + 2.56, 6.6, 6.68, E, frost, 2.2);
  }
  for (const u of [cu - Math.floor((u1 - u0) / 4), cu + Math.floor((u1 - u0) / 4)]) { const [x, z] = at(u, (hv0 + hv1) / 2); light(w, x, Y + 4.6, z, frost, 18, 1.7); }
  loot(u0 + 1.5, hv1 - 1.5, 'crate', true); loot(u1 - 1.5, hv1 - 1.5, 'locker', true); loot(u1 - 1.5, hv0 + 1.5, 'crate', true);
  // The yard: a lorry backed along the dock, bay lines, a yard lamp at each end.
  for (let u = u0 + 6; u < u1 - 4; u += 5) panel(u - 0.08, 0.5, u + 0.08, 4.6, 0, 0.04, P, [0.6, 0.6, 0.56]);
  { const [x, z] = at(Math.min(W - 6, cu + 9), 2.5); DR.vehicle(w, rng, Math.floor(x) + 0.5, Math.floor(z) + 0.5, F.s >= 2, 'truck'); }
  lamp(1.5, 3, 4.4, SODIUM, 15, 1.6); lamp(W - 1.5, 3, 4.4, SODIUM, 15, 1.6); lamp(cu + 3, hv1 + 3, 4.4, SODIUM, 15, 1.6);
  const [dx, dz] = at(cu + 0.5, 7), [hx, hz] = at(cu, hv0 + 2.5), [bx, bz] = at(cu, Math.min(D - 1, hv1 + 3));
  return { gates: [[cu, 0]], upper: { x: dx, z: dz, y: Y }, room: { x: hx, z: hz, y: Y }, rear: { x: bx, z: bz } };
}

// Keel Slip: a hull on the stocks, staged for repair. Scaffold along both sides, the slip
// rails running out past it, a winch house, a propeller waiting on its pallet.
function slip(T) {
  const { w, rng, F, at, W, D, cu, open, panel, fill, paint, mast, loot, prop, hut, run } = T;
  paint(0, 0, W, D, SURF.ROAD); paint(0, 0, W, 5, SURF.PLAZA);
  const v0 = 8, HL = Math.max(10, Math.min(D - 14, 26)), v1 = v0 + HL, hull = [0.12, 0.17, 0.2], [fx, fz] = F.dir(0, 1);
  fill(cu - 3, v0, cu + 3, v1, 1);
  panel(cu - 2.6, v0 + 1.5, cu + 2.6, v1 - 1.5, 1.9, 4.0, MAT.ENAMEL, hull); panel(cu - 2.2, v0 + 1.5, cu + 2.2, v1 - 1.5, 1.2, 1.9, MAT.ENAMEL, [0.36, 0.1, 0.08]); panel(cu - 2.54, v0 + 1.2, cu + 2.54, v1 - 1.2, 1.9, CUT, P, CAP, 0, SUB.CAP);
  for (const v of [v0 + 1.5, v1 - 1.5]) { const [x, z] = at(cu, v); prim(w, SHAPE.SPHERE, x, 2.9, z, F.s < 2 ? 5.2 : 3.6, 2.2, F.s < 2 ? 3.6 : 5.2, MAT.ENAMEL, hull); }
  panel(cu - 2.4, v0 + 2, cu + 2.4, v1 - 2, 4.0, 4.14, P, STONE); panel(cu - 1.6, v0 + 3, cu + 1.6, v0 + 8, 4.14, 6.2, P, [0.44, 0.45, 0.42]); panel(cu - 1.3, v0 + 7.96, cu + 1.3, v0 + 8.04, 5.0, 5.8, MAT.GLOSS, STEEL, 0, 1);
  // Keel blocks and bilge shores under the hull, the slip rails running on past it.
  for (let v = v0 + 2; v < v1 - 1; v += 3) { panel(cu - 0.6, v, cu + 0.6, v + 0.8, 0, 1.2, P, WOOD, 0, SUB.TIMBER); for (const s of [-1, 1]) { const [x, z] = at(cu + s * 2.6, v + 0.4); primR(w, SHAPE.BOX, x, 1.1, z, 0.18, 2.4, 0.18, P, WOOD, 0, SUB.TIMBER, 0, 0, 0, F.yawIn, 0, s * 0.5); } }
  for (const s of [-1, 1]) panel(cu + s * 1.4 - 0.08, 5, cu + s * 1.4 + 0.08, D - 2, 0.005, 0.1, P, STEEL, 0, SUB.METAL);
  for (let v = 6; v < D - 2; v += 2.5) if (v < v0 - 0.5 || v > v1 + 0.5) panel(cu - 1.9, v, cu + 1.9, v + 0.3, 0.005, 0.06, P, WOOD, 0, SUB.TIMBER);
  // Scaffold: standards, two lifts of planks and a lit work lamp, clear of the walk below.
  for (const s of [-1, 1]) {
    for (let v = v0 + 1; v <= v1 - 1; v += 3) { const [x, z] = at(cu + s * 4.4, v); cyl(w, x, 0, 4.6, z, 0.045, P, PALE, 0, SUB.METAL); }
    for (const y of [2.3, 4.2]) { panel(cu + s * 3.5 - 0.5, v0 + 1, cu + s * 3.5 + 0.5, v1 - 1, y, y + 0.06, P, WOOD, 0, SUB.TIMBER); panel(cu + s * 4.4 - 0.03, v0 + 1, cu + s * 4.4 + 0.03, v1 - 1, y + 1.0, y + 1.05, P, PALE, 0, SUB.METAL); }
  }
  { const [x, z] = at(cu + 3.6, v0 + Math.floor(HL / 2)); ball(w, x, 2.7, z, 0.14, E, [0.7, 0.86, 1], 7, rng.float()); light(w, x + fx, 2.4, z + fz, [0.7, 0.86, 1], 13, 1.9); }
  // The winch house on the street side, its cable run out to the stem.
  let room = null;
  if (cu - 12 >= 1) {
    const r = hut(cu - 12, 1, cu - 6, 6, { doors: [['r', 3]], col: [0.23, 0.2, 0.18], lit: SODIUM, h: 3 });
    { const [x, z] = at(cu - 10, 3.5); primR(w, SHAPE.CYL, x, 0.8, z, 1.3, 1.6, 1.3, P, RUST, 0, SUB.METAL, 0, 0, 0, F.yawIn, HALF); w.fillRect(Math.floor(x) - 1, Math.floor(z) - 1, Math.floor(x) + 1, Math.floor(z) + 1, 2); }
    loot(r.u0 + 0.5, r.v1 - 0.5, 'tin', true); room = { x: at(cu - 8, 3)[0], z: at(cu - 8, 3)[1], y: 0 };
  }
  // The propeller on its pallet: a hub and three blades laid flat.
  if (cu + 9 <= W - 2) {
    const [x, z] = at(cu + 8, 3), cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    if (w.circleFree(cx, cz, 1.4)) { w.fillRect(cx - 1, cz - 1, cx + 1, cz + 1, 2); box(w, cx, 0.1, cz, 2.2, 0.2, 2.2, P, WOOD, 0, SUB.TIMBER); cyl(w, cx, 0.2, 0.75, cz, 0.32, MAT.ENAMEL, [0.5, 0.36, 0.14]); for (let k = 0; k < 3; k++) { const a = k * 2.094; prim(w, SHAPE.SPHERE, cx + Math.sin(a) * 0.75, 0.5, cz + Math.cos(a) * 0.75, 0.62, 0.12, 1.2, MAT.ENAMEL, [0.5, 0.36, 0.14], 0, 0, 0, 0, 0, a); } }
  }
  for (let v = v0 + 2; v < v1; v += 6) { if (cu - 8 >= 2) prop(rng.pick(['drum', 'pallet', 'ladder']), cu - 7.5, v, -HALF); if (cu + 9 <= W - 2 && rng.chance(0.6)) prop(rng.pick(['drum', 'crates', 'pallet']), cu + 7.5, v + 2, HALF); }
  mast(2, D - 3, 13, SODIUM, 36); loot(cu + 5.5, v1 + 1.5, 'crate'); loot(cu - 5.5, v0 - 1.5, 'locker');
  if (!open.back) run(0, D - 1, W, D, 'barrier'); if (!open.left) run(0, 5, 1, D - 1, 'fence'); if (!open.right) run(W - 1, 5, W, D - 1, 'fence');
  return { gates: [[cu, 0], open.back && [cu + 5, D - 0.5]], room };
}

// A laydown pad: stock stored in the open. Rail lengths, sleeper stacks, cable drums, pipe.
function laydown(T) {
  const { w, rng, F, at, W, D, cu, open, panel, fill, paint, mast, loot } = T, [ux, uz] = F.dir(1, 0), along = Math.atan2(ux, uz);
  paint(0, 0, W, D, SURF.ROAD); paint(cu - 2, 0, cu + 2, D, SURF.ALLEY);
  for (let v = 4; v + 6 < D - 2; v += 9) for (const s of [-1, 1]) {
    const u = s < 0 ? Math.max(2, cu - 12) : cu + 5, span = Math.min(8, s < 0 ? cu - 3 - u : W - 2 - u);
    if (span < 4) continue;
    const kind = rng.int(4);
    fill(u, v, u + span, v + 4, 2);
    if (kind === 0) for (let k = 0; k < 4; k++) for (let j = 0; j < 3 - (k > 1 ? 1 : 0); j++) panel(u + 0.2, v + 0.4 + j * 1.1 + (k % 2) * 0.3, u + span - 0.2, v + 0.62 + j * 1.1 + (k % 2) * 0.3, k * 0.24, k * 0.24 + 0.2, P, RUST, 0, SUB.METAL);
    else if (kind === 1) for (let a = u + 0.2; a + 2.6 <= u + span; a += 2.9) for (let k = 0; k < rng.irange(2, 5); k++) panel(a, v + 0.3, a + 2.6, v + 3.4, k * 0.26, k * 0.26 + 0.22, P, [0.2, 0.15, 0.1], 0, SUB.TIMBER);
    else if (kind === 2) for (let a = u + 1.2; a + 1 <= u + span; a += 2.6) { const [x, z] = at(a, v + 2); primR(w, SHAPE.CYL, x, 1.1, z, 2.2, 1.3, 2.2, P, RUST, 0, SUB.TIMBER, 0, 0, 0, along + HALF, HALF); primR(w, SHAPE.CYL, x, 1.1, z, 1.4, 1.1, 1.4, P, [0.08, 0.08, 0.09], 0, SUB.RUBBER, 0, 0, 0, along + HALF, HALF); }
    else for (let k = 0; k < 3; k++) for (let j = 0; j < 3 - k; j++) { const [x, z] = at(u + span / 2, v + 0.8 + j * 1.0 + k * 0.5); primR(w, SHAPE.CYL, x, 0.45 + k * 0.82, z, 0.9, span - 0.6, 0.9, P, [0.3, 0.33, 0.34], 0, SUB.METAL, 0, 0, 0, along, HALF); }
  }
  mast(2, 2, 12, T.glow, 32); loot(cu + 3.5, D - 3.5, 'crate');
  return { gates: [[cu, 0], open.back && [cu, D - 0.5]] };
}

// ---------------------------------------------------------------- Clinker Yards
// Rolling stock: every vehicle stands on its track, three metres wide.
function wagon(T, P0, c, a, kind, len) {
  const { w, rng } = T, r = (a0, c0, a1, c1) => P0.rect(a0, c0, a1, c1), bx = (a0, c0, a1, c1, y0, y1, mat, col, ...p) => boxMM(w, ...r(a0, c0, a1, c1), y0, y1, mat, col, ...p);
  const oxide = rng.pick([[0.3, 0.13, 0.09], [0.17, 0.2, 0.17], [0.2, 0.2, 0.22], [0.26, 0.2, 0.1], [0.1, 0.17, 0.22]]);
  w.fillRect(...r(a, c - 1.5, a + len, c + 1.5), kind === 'flat' ? 2 : 1);
  bx(a + 0.2, c - 1.2, a + len - 0.2, c + 1.2, 0.75, 1.05, P, DARK, 0, SUB.METAL);
  for (const o of [1.2, len - 2.6]) bx(a + o, c - 1.25, a + o + 1.4, c + 1.25, 0.12, 0.75, P, [0.03, 0.03, 0.035], 0, SUB.METAL);
  for (const o of [0, len - 0.12]) bx(a + o, c - 0.3, a + o + 0.12, c + 0.3, 0.8, 1.05, P, [0.5, 0.36, 0.06], 0, SUB.HAZARD);
  if (kind === 'box') {
    bx(a + 0.25, c - 1.4, a + len - 0.25, c + 1.4, 1.05, 3.7, P, oxide, 0, rng.chance(0.5) ? SUB.CORRUGATED : SUB.TIMBER, rng.float());
    bx(a + 0.15, c - 1.5, a + len - 0.15, c + 1.5, 3.7, 3.86, P, [0.1, 0.1, 0.11], 0, SUB.METAL);
    for (const s of [-1, 1]) bx(a + len / 2 - 1.1, c + s * 1.42 - 0.03, a + len / 2 + 1.1, c + s * 1.42 + 0.03, 1.15, 3.4, P, oxide.map((v) => v * 1.25), 0, SUB.METAL);
    bx(a + 0.31, c - 1.34, a + len - 0.31, c + 1.34, 1.05, CUT, P, CAP, 0, SUB.CAP);
  } else if (kind === 'tank') {
    const [x, z] = P0.pt(a + len / 2, c);
    primR(w, SHAPE.CYL, x, 2.35, z, 2.6, len - 1, 2.6, MAT.ENAMEL, oxide, 0, 0, 0, 0, 0, P0.yaw, HALF);
    for (const o of [0.5, len - 0.5]) { const [ex, ez] = P0.pt(a + o, c); ball(w, ex, 2.35, ez, 1.3, MAT.ENAMEL, oxide, 0, 0, 1); }
    cyl(w, x, 3.6, 4.1, z, 0.5, P, DARK, 0, SUB.METAL); for (const o of [2, len - 2.6]) bx(a + o, c - 1.1, a + o + 0.6, c + 1.1, 1.05, 1.6, P, DARK, 0, SUB.METAL);
    bx(a + 0.9, c - 1.2, a + len - 0.9, c + 1.2, 1.05, CUT, P, CAP, 0, SUB.CAP);
    bx(a + len / 2 - 0.9, c - 1.33, a + len / 2 + 0.9, c - 1.3, 2.0, 2.7, MAT.SIGN, [1, 0.8, 0.3], 0.5, rng.float(), 2);
  } else if (kind === 'hopper') {
    bx(a + 0.3, c - 1.4, a + len - 0.3, c + 1.4, 2.0, 3.5, P, oxide, 0, SUB.METAL); bx(a + 1.2, c - 1.0, a + len - 1.2, c + 1.0, 1.05, 2.0, P, oxide.map((v) => v * 0.8), 0, SUB.METAL);
    for (let o = 0.6; o < len - 0.5; o += 1.5) bx(a + o, c - 1.45, a + o + 0.12, c + 1.45, 2.0, 3.55, P, DARK, 0, SUB.METAL);
    bx(a + 0.5, c - 1.2, a + len - 0.5, c + 1.2, 3.4, 3.62, P, [0.1, 0.1, 0.1], 0, SUB.RUBBER); bx(a + 0.36, c - 1.34, a + len - 0.36, c + 1.34, 2.0, CUT, P, CAP, 0, SUB.CAP);
  } else {
    bx(a + 0.1, c - 1.4, a + len - 0.1, c + 1.4, 1.05, 1.2, P, WOOD, 0, SUB.TIMBER);
    const load = rng.int(3);
    if (load === 0) for (const o of [len * 0.3, len * 0.7]) { const [x, z] = P0.pt(a + o, c); primR(w, SHAPE.CYL, x, 2.2, z, 2.0, 1.3, 2.0, P, RUST, 0, SUB.TIMBER, 0, 0, 0, P0.yaw, HALF); }
    else if (load === 1) for (let k = 0; k < 3; k++) bx(a + 0.6, c - 1.1 + k * 0.1, a + len - 0.6, c + 1.1 - k * 0.1, 1.2 + k * 0.3, 1.46 + k * 0.3, P, [0.24, 0.18, 0.12], 0, SUB.TIMBER);
  }
}
// A track frame: a runs along the rails, c across them, mapped onto the lot frame.
function trackFrame(T, alongU) {
  const { F } = T, pt = (a, c) => (alongU ? F.pt(a, c) : F.pt(c, a)), rect = (a0, c0, a1, c1) => (alongU ? F.rect(a0, c0, a1, c1) : F.rect(c0, a0, c1, a1));
  const [dx, dz] = alongU ? F.dir(1, 0) : F.dir(0, 1);
  return { pt, rect, yaw: Math.atan2(dx, dz), len: alongU ? T.W : T.D, across: alongU ? T.D : T.W };
}
function track(T, P0, c, a0, a1) {
  const { w } = T;
  w.paint(...P0.rect(a0, c - 1.5, a1, c + 1.5), SURF.ALLEY);
  for (const s of [-1, 1]) boxMM(w, ...P0.rect(a0, c + s * 0.75 - 0.06, a1, c + s * 0.75 + 0.06), 0.06, 0.2, P, [0.4, 0.4, 0.42], 0, SUB.METAL);
  for (let a = a0 + 0.4; a < a1 - 0.3; a += 1.5) boxMM(w, ...P0.rect(a, c - 1.25, a + 0.28, c + 1.25), 0, 0.08, P, [0.2, 0.15, 0.1], 0, SUB.TIMBER);
}
// A dwarf signal: a short post with one lit aspect.
function dwarf(T, x, z, red) { const { w } = T; cyl(w, x, 0, 1.1, z, 0.05, P, DARK, 0, SUB.METAL); box(w, x, 1.25, z, 0.3, 0.36, 0.2, P, DARK, 0, SUB.METAL); ball(w, x, 1.27, z, 0.1, E, red ? [1, 0.14, 0.1] : [0.2, 1, 0.5], 5); }

// Hasp Sidings: stabled rakes on parallel roads. A barrow crossing runs straight across the
// fan, the walks between the roads lead out to the streets, and one stores van stands open.
function sidings(T, named) {
  const { w, rng, W, D, cu, open, paint, mast } = T;
  const alongU = W > D, P0 = trackFrame(T, alongU), LEN = P0.len, ACR = P0.across, mid = Math.floor(LEN / 2);
  paint(0, 0, W, D, SURF.PLAZA);
  const rows = []; for (let c = 5.5; c + 2.5 <= ACR - 2; c += 6) rows.push(c);
  const van = named && rows.length >= 2 && LEN >= 34 ? { row: Math.floor(rows.length / 2), a: mid + 4 } : null;
  rows.forEach((c, k) => {
    track(T, P0, c, 2, LEN - 2);
    for (const a of [2.5, LEN - 2.5]) dwarf(T, ...P0.pt(a, c + 1.2), (k + (a < mid ? 0 : 1)) % 2 === 0);
    // Coupled wagons with a walking gap every few, clear of the crossing and of the van.
    let a = 4 + rng.irange(0, 3), since = 0;
    while (a + 8 < LEN - 4) {
      const kind = rng.pick(['box', 'box', 'tank', 'hopper', 'flat', 'flat']), len = kind === 'box' ? 10 : kind === 'hopper' ? 8 : 9;
      const end = a + len, hitsCross = a < mid + 3 && end > mid - 3, hitsVan = van && k === van.row && a < van.a + 12 && end > van.a - 2;
      const hitsEntry = !alongU && Math.abs(c - cu) < 4.5 && a < 5;
      if (hitsCross) { a = mid + 3; since = 0; continue; }
      if (hitsVan) { a = van.a + 12; since = 0; continue; }
      if (end > LEN - 4) break;
      if (!hitsEntry && !rng.chance(0.14)) wagon(T, P0, c, a, kind, len);
      a = end + 1; since++;
      if (since >= rng.irange(2, 3)) { a += 3; since = 0; }
    }
  });
  // The barrow crossing: boards between the rails, a lit post at each end.
  w.paint(...P0.rect(mid - 2, 1, mid + 2, ACR - 1), SURF.WALK);
  for (const c of rows) boxMM(w, ...P0.rect(mid - 1.8, c - 1.3, mid + 1.8, c + 1.3), 0.05, 0.21, P, [0.2, 0.15, 0.1], 0, SUB.TIMBER);
  for (const c of [1.5, ACR - 1.5]) { const [x, z] = P0.pt(mid + 2.4, c); cyl(w, x, 0, 2.2, z, 0.05, P, DARK, 0, SUB.METAL); box(w, x, 2.3, z, 0.5, 0.5, 0.08, MAT.SIGN, [1, 0.8, 0.2], 2, rng.float(), 2); }
  // The stores van: a wide body a metre up on its own road, a plank step to its open door.
  let room = null;
  if (van) {
    const c = rows[van.row], a = van.a, Y = 1, col = [0.2, 0.24, 0.2];
    const R2 = (a0, c0, a1, c1) => P0.rect(a0, c0, a1, c1), bx = (a0, c0, a1, c1, y0, y1, mat, colr, ...p) => boxMM(w, ...R2(a0, c0, a1, c1), y0, y1, mat, colr, ...p);
    level(w, ...R2(a, c - 2.5, a + 10, c + 2.5), Y); w.fillRect(...R2(a, c - 2.5, a + 10, c + 2.5), 1); w.fillRect(...R2(a + 1, c - 1.5, a + 9, c + 1.5), 0); w.paint(...R2(a + 1, c - 1.5, a + 9, c + 1.5), SURF.FLOOR);
    bx(a, c - 2.5, a + 10, c - 1.5, 0, 3.9, P, col, 0, SUB.TIMBER); bx(a, c + 1.5, a + 4, c + 2.5, 0, 3.9, P, col, 0, SUB.TIMBER); bx(a + 6, c + 1.5, a + 10, c + 2.5, 0, 3.9, P, col, 0, SUB.TIMBER);
    bx(a, c - 1.5, a + 1, c + 1.5, 0, 3.9, P, col, 0, SUB.TIMBER); bx(a + 9, c - 1.5, a + 10, c + 1.5, 0, 3.9, P, col, 0, SUB.TIMBER);
    bx(a + 4, c + 1.5, a + 6, c + 2.5, Y + 2.4, 3.9, P, col, 0, SUB.TIMBER); bx(a + 3.8, c + 2.5, a + 6.2, c + 2.58, Y + 2.4, Y + 2.54, E, WARM, 2.6);
    bx(a - 0.2, c - 2.7, a + 10.2, c + 2.7, 3.9, 4.1, P, [0.1, 0.1, 0.11], 0, SUB.METAL);
    w.fillRect(...R2(a + 4, c + 1.5, a + 6, c + 2.5), 0);
    // The plank step, two treads out from the door.
    const stepRect = R2(a + 4, c + 2.5, a + 6, c + 4.5), dirOut = alongU ? T.F.inward : T.F.along;
    slope(w, ...stepRect, OPP[dirOut], 0, Y); w.fillRect(...stepRect, 0);
    for (let q = 1.6; q < 9; q += 2.4) { bx(a + q, c - 1.5, a + q + 1.4, c - 1.0, Y, Y + 1.9, P, [0.15, 0.2, 0.22], 0, SUB.BARS); w.fillRect(...R2(a + q, c - 1.5, a + q + 1.4, c - 1), 2); }
    { const [x, z] = P0.pt(a + 5, c); light(w, x, Y + 2.3, z, WARM, 9, 1.8); room = { x, z, y: Y }; const [lx, lz] = P0.pt(a + 8.5, c + 1); w.addContainer(Math.floor(lx) + 0.5, Math.floor(lz) + 0.5, 'crate', true); const [tx, tz] = P0.pt(a + 1.5, c + 1); w.addContainer(Math.floor(tx) + 0.5, Math.floor(tz) + 0.5, 'tin', true); }
  }
  mast(2, 2, 13, SIGNAL, 36); if (W >= 40 || D >= 40) mast(W - 3, D - 3, 13, SIGNAL, 36);
  const gates = [[cu, 0]];
  if (alongU) { if (open.left) gates.push([0.5, 2.5]); if (open.right) gates.push([W - 0.5, 2.5]); if (open.back) gates.push([mid, D - 0.5]); }
  else { if (open.back) gates.push([2.5, D - 0.5]); if (open.left) gates.push([0.5, mid]); if (open.right) gates.push([W - 0.5, mid]); }
  return { gates, room };
}

// Turnback Shed: a two-road engine shed, open at both ends. One road holds a locomotive;
// the other runs over an inspection pit with a stair at each end.
function shed(T) {
  const { w, rng, F, R, at, W, D, cu, open, panel, fill, paint, floor, lamp, loot, prop, solid } = T;
  const hw = Math.min(11, cu - 2), v0 = 4, v1 = Math.min(D - 4, 46), len = v1 - v0, mv = Math.floor((v0 + v1) / 2), P0 = trackFrame(T, false);
  paint(0, 0, W, D, SURF.PLAZA); paint(cu - hw, v0, cu + hw, v1, SURF.FLOOR);
  const ta = cu - 4.5, tb = cu + 4;
  track(T, P0, ta, 1, D - 1); track(T, P0, tb, 1, D - 1); paint(cu - hw + 1, v0, cu + hw - 1, v1, SURF.FLOOR);
  // Brick side walls with a door at the middle; the gables stay open over both roads.
  for (const s of [-1, 1]) {
    const wu = s < 0 ? cu - hw : cu + hw - 1;
    solid(wu, v0, wu + 1, mv - 1, 0, 7.5, BRICK); solid(wu, mv + 2, wu + 1, v1, 0, 7.5, BRICK); panel(wu, mv - 1, wu + 1, mv + 2, 3, 7.5, P, BRICK, 0, SUB.WALL);
    panel(wu + (s < 0 ? -0.08 : 1), mv - 1.2, wu + (s < 0 ? 0 : 1.08), mv + 2.2, 3, 3.14, E, SIGNAL, 2.4);
    for (let v = v0 + 2; v + 3 < v1 - 1; v += 5) if (Math.abs(v + 1.5 - mv) > 4) panel(wu + (s < 0 ? -0.05 : 1), v, wu + (s < 0 ? 0 : 1.05), v + 3, 4.2, 6.4, E, [0.5, 0.6, 0.72], 0.7);
  }
  panel(cu - hw - 0.4, v0 - 0.4, cu + hw + 0.4, v1 + 0.4, 7.5, 7.8, P, [0.13, 0.15, 0.16], 0, SUB.CORRUGATED);
  panel(cu - 1.5, v0 + 1, cu + 1.5, v1 - 1, 7.8, 8.5, E, [0.5, 0.62, 0.72], 0.7);
  for (const [v, s] of [[v0, -1], [v1, 1]]) { panel(cu - hw, v - 0.25, cu + hw, v + 0.25, 5.6, 7.5, P, BRICK, 0, SUB.WALL); for (const [u, n] of [[ta, 1], [tb, 2]]) { panel(u - 0.6, v + s * 0.26 - 0.03, u + 0.6, v + s * 0.26 + 0.03, 6.0, 7.0, MAT.SIGN, SIGNAL, 2.6, rng.float(), n); } panel(cu - 0.5, v - 0.3, cu + 0.5, v + 0.3, 0, 5.6, P, BRICK, 0, SUB.WALL); }
  for (const v of [v0, v1 - 1]) fill(cu - 0.5, v, cu + 0.5, v + 1, 1);
  // Road one: the locomotive, nose to the street.
  const la = v0 + 4, ll = Math.min(12, len - 8), body = [0.4, 0.2, 0.09], bx = (a0, c0, a1, c1, y0, y1, mat, col, ...p) => boxMM(w, ...P0.rect(a0, c0, a1, c1), y0, y1, mat, col, ...p);
  w.fillRect(...P0.rect(la, ta - 1.5, la + ll, ta + 1.5), 1);
  bx(la + 0.2, ta - 1.3, la + ll - 0.2, ta + 1.3, 0.75, 1.15, P, DARK, 0, SUB.METAL); for (const o of [1, ll - 3.2]) bx(la + o, ta - 1.3, la + o + 2.2, ta + 1.3, 0.12, 0.75, P, [0.03, 0.03, 0.035], 0, SUB.METAL);
  bx(la + 0.3, ta - 1.15, la + ll - 3.4, ta + 1.15, 1.15, 3.3, MAT.ENAMEL, body); bx(la + ll - 3.4, ta - 1.4, la + ll - 0.4, ta + 1.4, 1.15, 4.0, MAT.ENAMEL, body);
  bx(la + 0.36, ta - 1.09, la + ll - 3.4, ta + 1.09, 1.15, CUT, P, CAP, 0, SUB.CAP); bx(la + ll - 3.4, ta - 1.34, la + ll - 0.46, ta + 1.34, 1.15, CUT, P, CAP, 0, SUB.CAP);
  bx(la + ll - 3.2, ta - 1.43, la + ll - 0.6, ta + 1.43, 2.7, 3.6, MAT.GLOSS, [0.05, 0.09, 0.1], 0, 1); bx(la + ll - 3.6, ta - 1.5, la + ll - 0.2, ta + 1.5, 4.0, 4.14, P, DARK, 0, SUB.METAL);
  for (const o of [0, ll - 0.2]) bx(la + o, ta - 1.4, la + o + 0.2, ta + 1.4, 0.8, 1.3, P, [0.6, 0.44, 0.06], 0, SUB.HAZARD);
  { const [x, z] = P0.pt(la + 0.25, ta); ball(w, x, 2.8, z, 0.22, E, [0.9, 0.95, 1], 6); const [fx, fz] = F.dir(0, -1); light(w, x + fx * 3, 2.4, z + fz * 3, [0.9, 0.95, 1], 16, 1.8); const [sx, sz] = P0.pt(la + 3, ta); cyl(w, sx, 3.3, 4.0, sz, 0.3, P, DARK, 0, SUB.METAL); }
  for (let o = 1.2; o < ll - 4; o += 1.6) bx(la + o, ta - 1.18, la + o + 0.9, ta - 1.15, 1.6, 2.8, P, body.map((c) => c * 0.7), 0, SUB.BARS);
  // Road two: the pit, 1.5 m down between the rails, a flight at each end and a tool alcove.
  const pu = Math.round(tb) - 1, pv0 = Math.max(v0 + 3, mv - 7), pv1 = Math.min(v1 - 3, pv0 + 14), PY = -1.5;
  floor(pu, pv0 + 3, pu + 2, pv1 - 3, PY); slope(w, ...R(pu, pv0, pu + 2, pv0 + 3), F.inward, 0, PY); slope(w, ...R(pu, pv1 - 3, pu + 2, pv1), OPP[F.inward], 0, PY);
  const av = Math.floor((pv0 + pv1) / 2);
  floor(pu + 2, av, pu + 3, av + 1, PY); paint(pu, pv0, pu + 3, pv1, SURF.FLOOR);
  parapets(w, ...R(pu - 1, pv0 - 1, pu + 4, pv1 + 1));
  for (const s of [0, 1]) panel(pu + s * 1.94, pv0 + 3, pu + 0.06 + s * 1.94, pv1 - 3, PY + 1.0, PY + 1.08, E, [1, 0.66, 0.3], 1.8);
  { const [x, z] = at(pu + 1, av + 0.5); light(w, x, PY + 1.2, z, [1, 0.66, 0.3], 9, 1.7); const [cx, cz] = at(pu + 2.5, av + 0.5); w.addContainer(Math.floor(cx) + 0.5, Math.floor(cz) + 0.5, 'tin', true); }
  // Benches, wheelsets and drums along the walls; smoke hoods and lamps over the roads.
  for (const s of [-1, 1]) for (let v = v0 + 3; v + 3 < v1 - 2; v += 7) {
    if (Math.abs(v + 1.5 - mv) < 4) continue;
    const bu = s < 0 ? cu - hw + 1 : cu + hw - 2;
    fill(bu, v, bu + 1, v + 3, 2); panel(bu, v, bu + 1, v + 3, 0, 0.9, P, [0.15, 0.2, 0.2], 0, SUB.METAL); panel(bu + (s < 0 ? 0 : 0.9), v + 0.2, bu + (s < 0 ? 0.1 : 1), v + 2.8, 1.2, 2.2, P, WOOD, 0, SUB.TIMBER);
    for (let q = 0.4; q < 2.8; q += 0.6) panel(bu + (s < 0 ? 0.1 : 0.84), v + q, bu + (s < 0 ? 0.16 : 0.9), v + q + 0.12, 1.3, 1.3 + rng.range(0.3, 0.8), P, PALE, 0, SUB.METAL);
  }
  for (const u of [ta, tb]) for (let v = v0 + 6; v < v1 - 3; v += 10) { const [x, z] = at(u, v); prim(w, SHAPE.CONE, x, 6.6, z, 2.4, 1.6, 2.4, P, [0.1, 0.11, 0.12], 0, SUB.METAL); box(w, x, 5.7, z, 0.6, 0.12, 0.6, E, SIGNAL, 3.4); light(w, x, 5.4, z, SIGNAL, 17, 1.5); }
  for (const [u, v] of [[cu, v0 + 6], [cu, v1 - 6]]) { const [x, z] = at(u, v), [fx, fz] = F.dir(1, 0); for (const o of [-0.75, 0.75]) primR(w, SHAPE.CYL, x + fx * o, 0.5, z + fz * o, 1.0, 0.14, 1.0, P, [0.2, 0.2, 0.21], 0, SUB.METAL, 0, 0, 0, Math.atan2(fx, fz), HALF); primR(w, SHAPE.CYL, x, 0.5, z, 0.16, 1.7, 0.16, P, DARK, 0, SUB.METAL, 0, 0, 0, Math.atan2(fx, fz), HALF); w.fillRect(Math.floor(x), Math.floor(z), Math.floor(x) + 1, Math.floor(z) + 1, 2); }
  loot(cu - hw + 1.5, v1 - 1.5, 'locker', true); loot(cu + hw - 1.5, v0 + 1.5, 'crate', true);
  // The apron: a water column by the road, drums, a lamp at each corner of the shed.
  { const [x, z] = at(cu, 2); if (w.circleFree(x, z, 0.7)) { cyl(w, x, 0, 3.6, z, 0.16, P, [0.14, 0.2, 0.2], 0, SUB.METAL); const [fx, fz] = F.dir(1, 0); box(w, x + fx * 0.9, 3.5, z + fz * 0.9, Math.abs(fx) * 1.8 + 0.14, 0.14, Math.abs(fz) * 1.8 + 0.14, P, [0.14, 0.2, 0.2], 0, SUB.METAL); w.fillRect(Math.floor(x), Math.floor(z), Math.floor(x) + 1, Math.floor(z) + 1, 1); } }
  if (cu - hw - 2 >= 1) for (let v = v0 + 4; v < v1 - 3; v += 9) prop(rng.pick(['drum', 'pallet', 'crates']), cu - hw - 1.5, v, -HALF);
  lamp(cu - hw - 0.6, v0 - 1, 4.4, SIGNAL, 15, 1.6); lamp(cu + hw + 0.6, v1 + 1, 4.4, SIGNAL, 15, 1.6);
  return { gates: [[Math.round(ta), 0], open.back && [Math.round(ta), D - 0.5]], room: { x: at(cu, mv)[0], z: at(cu, mv)[1], y: 0 }, pit: { x: at(pu + 1, av + 0.5)[0], z: at(pu + 1, av + 0.5)[1], y: PY } };
}

// Lever Cabin: a signal cabin a storey over the yard and the footbridge it watches, Lever
// Walk, which carries the only straight way across two roads of stabled wagons.
function cabin(T) {
  const { w, rng, F, R, at, W, D, cu, open, panel, fill, paint, floor, deck, lamp, loot, hut } = T;
  const tv = Math.floor(D / 2), Y = 4, P0 = trackFrame(T, true);
  paint(0, 0, W, D, SURF.PLAZA);
  // Two roads of coupled wagons across the lot; the ends stay open to walk round.
  for (const c of [tv - 3.5, tv + 3.5]) {
    track(T, P0, c, 1, W - 1);
    for (let a = 4; a + 9 <= W - 4; a += 10) wagon(T, P0, c, a, rng.pick(['box', 'box', 'hopper', 'tank']), 9);
    for (const a of [2, W - 2]) dwarf(T, ...P0.pt(a, c - 1.2), a < cu);
  }
  // A deep lot stables more rakes beyond the stairs; the walk to the bridge stays open.
  for (const c of [tv - 17.5, tv - 23.5, tv - 29.5, tv + 11.5, tv + 17.5, tv + 23.5, tv + 29.5]) {
    if (c - 1.5 < 5 || c + 1.5 > D - 4) continue;
    track(T, P0, c, 1, W - 1);
    for (let a = 3; a + 9 <= W - 3; a += 10) if (!(a < cu + 5 && a + 9 > cu - 4) && !rng.chance(0.2)) wagon(T, P0, c, a, rng.pick(['box', 'flat', 'hopper', 'tank', 'flat']), 9);
  }
  // The bridge: a stair along the rakes on either side, a steel deck between them.
  const span = [cu - 1, tv - 8, cu + 2, tv + 8];
  fill(...span, 0); floor(...span, Y); deck(...span); paint(...span, SURF.FLOOR);
  slope(w, ...R(cu - 9, tv - 8, cu - 1, tv - 6), F.along, 0, Y); fill(cu - 9, tv - 8, cu - 1, tv - 6, 0);
  slope(w, ...R(cu + 2, tv + 6, cu + 10, tv + 8), OPP[F.along], 0, Y); fill(cu + 2, tv + 6, cu + 10, tv + 8, 0);
  panel(span[0], span[1], span[2], span[3], Y - 0.3, Y - 0.02, P, [0.14, 0.17, 0.18], 0, SUB.METAL);
  for (const u of [cu - 1, cu + 2]) {
    const v0 = u < cu ? tv - 6 : tv - 8, v1 = u < cu ? tv + 8 : tv + 6;
    panel(u - 0.06, v0, u + 0.06, v1, Y, Y + 1.1, P, [0.2, 0.24, 0.25], 0, SUB.BARS); panel(u - 0.08, v0, u + 0.08, v1, Y + 1.1, Y + 1.18, E, SIGNAL, 1.5);
    for (const v of [tv - 1, tv + 1]) { const [x, z] = at(u, v); cyl(w, x, 0, Y - 0.3, z, 0.14, P, [0.14, 0.17, 0.18], 0, SUB.METAL); }
  }
  for (const v of [tv - 8, tv + 8]) panel(cu - 1, v - 0.06, cu + 2, v + 0.06, Y, Y + 1.1, P, [0.2, 0.24, 0.25], 0, SUB.BARS);
  { const [x, z] = at(cu + 0.5, tv); light(w, x, Y + 2.6, z, SIGNAL, 16, 1.6); box(w, x, Y + 3, z, 0.3, 0.1, 0.3, E, SIGNAL, 4); cyl(w, at(cu - 1, tv)[0], Y, Y + 3, at(cu - 1, tv)[1], 0.05, P, DARK); }
  // The cabin: a brick base, the operating floor level with the bridge, glazed all round.
  const c0 = cu + 2, c1 = Math.min(W - 2, cu + 9), cv0 = Math.max(1, tv - 13), cv1 = tv - 5;
  const r = hut(c0, cv0, c1, cv1, { y: Y, doors: [['l', tv - 7]], col: BRICK, lit: WARM, h: 3 });
  // The lever frame under the windows, the illuminated diagram on the back wall.
  fill(r.u0 + 1, r.v0, r.u1 - 1, r.v0 + 1, 2); panel(r.u0 + 1, r.v0 + 0.2, r.u1 - 1, r.v0 + 0.8, Y, Y + 0.35, P, DARK, 0, SUB.METAL);
  for (let u = r.u0 + 1.2, k = 0; u < r.u1 - 1.1; u += 0.45, k++) { const [x, z] = at(u, r.v0 + 0.5); primR(w, SHAPE.BOX, x, Y + 0.85, z, 0.07, 1.1, 0.07, P, [[0.6, 0.1, 0.08], [0.1, 0.2, 0.5], [0.6, 0.5, 0.08], [0.08, 0.08, 0.09]][k % 4], 0, SUB.METAL, 0, 0, 0, F.yawIn, k % 3 ? 0.3 : -0.3); }
  panel(r.u1 - 0.07, r.v0 + 0.6, r.u1, r.v1 - 0.6, Y + 1.3, Y + 2.3, P, [0.03, 0.07, 0.06]);
  for (const [dy, col] of [[1.55, [1, 0.6, 0.2]], [1.8, [0.3, 1, 0.5]], [2.05, [1, 0.2, 0.15]]]) panel(r.u1 - 0.1, r.v0 + 0.9, r.u1 - 0.07, r.v1 - 0.9, Y + dy, Y + dy + 0.05, E, col, 2.2);
  loot(r.u1 - 0.5, r.v1 - 0.5, 'locker', true);
  panel(c0 + 0.5, cv1, c1 - 0.5, cv1 + 0.06, 2.4, 3.3, MAT.SIGN, SIGNAL, 2.4, rng.float(), 0);
  // A signal mast by the cabin and lamps at the foot of each stair.
  { const [x, z] = at(Math.max(2, cu - 11), Math.max(2, tv - 10)); if (w.circleFree(x, z, 0.8)) { w.fillRect(Math.floor(x), Math.floor(z), Math.floor(x) + 1, Math.floor(z) + 1, 1); cyl(w, Math.floor(x) + 0.5, 0, 8, Math.floor(z) + 0.5, 0.12, P, PALE, 0, SUB.METAL); for (const [y, col] of [[7.4, [1, 0.14, 0.1]], [6.2, [1, 0.7, 0.2]]]) { box(w, Math.floor(x) + 0.5, y, Math.floor(z) + 0.5, 0.5, 0.9, 0.3, P, DARK, 0, SUB.METAL); ball(w, Math.floor(x) + 0.5, y, Math.floor(z) + 0.5, 0.17, E, col, 6); } } }
  lamp(cu - 9.5, tv - 9, 3.6, SIGNAL, 13, 1.5); lamp(cu + 10.5, tv + 9, 3.6, SIGNAL, 13, 1.5);
  const [ux, uz] = at(cu + 0.5, tv), [rx, rz] = at((c0 + c1) / 2, (cv0 + cv1) / 2), [bx, bz] = at(cu + 11, tv + 7);
  return { gates: [[cu, 0], open.back && [cu, D - 0.5]], upper: { x: ux, z: uz, y: Y }, room: { x: rx, z: rz, y: Y }, far: { x: bx, z: bz } };
}

// Quarter Table: a turntable pit. The bridge girder crosses it at yard level; a stair goes
// down into each half of the well, and stub roads fan out from its rim.
function table(T) {
  const { w, rng, F, R, at, W, D, cu, cv, open, panel, paint, floor, deck, lamp, loot, mast } = T;
  const r = Math.min(11, Math.floor(Math.min(W, D) / 2) - 4), PY = -1.5, [cx, cz] = at(cu + 0.5, cv + 0.5), S = w.size;
  paint(0, 0, W, D, SURF.PLAZA);
  for (let zi = Math.floor(cz - r); zi <= cz + r; zi++) for (let xi = Math.floor(cx - r); xi <= cx + r; xi++) {
    if ((xi + 0.5 - cx) ** 2 + (zi + 0.5 - cz) ** 2 >= r * r) continue;
    w.floor[zi * S + xi] = PY * 4; w.surface[zi * S + xi] = SURF.FLOOR;
  }
  w.hasHeight = true;
  // The girder: three cells wide across the well, rails on it, a cab at one end.
  const span = [cu - r - 1, cv - 1, cu + r + 2, cv + 2];
  floor(...span, 0); deck(...span); paint(...span, SURF.FLOOR);
  panel(span[0] + 1, span[1], span[2] - 1, span[3], -0.5, -0.02, P, [0.15, 0.18, 0.19], 0, SUB.METAL);
  for (const s of [-1, 1]) { panel(span[0] + 1, cv + 0.5 + s * 0.75 - 0.06, span[2] - 1, cv + 0.5 + s * 0.75 + 0.06, 0.02, 0.16, P, [0.26, 0.24, 0.23], 0, SUB.METAL); panel(span[0] + 1, cv + 0.5 + s * 1.5 - 0.05, span[2] - 1, cv + 0.5 + s * 1.5 + 0.05, 0, 0.9, P, [0.6, 0.44, 0.06], 0, SUB.BARS); }
  cyl(w, cx, PY, -0.5, cz, 1.1, P, [0.15, 0.18, 0.19], 0, SUB.METAL); cyl(w, cx, PY + 0.01, PY + 0.07, cz, r - 0.6, P, [0.26, 0.24, 0.23], 0, SUB.METAL); cyl(w, cx, PY + 0.02, PY + 0.09, cz, r - 0.85, P, CONCRETE, 0, SUB.WALL);
  ball(w, cx, 1.3, cz, 0.2, E, [1, 0.6, 0.2], 5, rng.float()); cyl(w, cx, 0, 1.2, cz + 1.2, 0.05, P, DARK);
  // A stair into each half of the well.
  slope(w, ...R(cu + 2, cv - r - 1, cu + 4, cv - r + 2), F.inward, 0, PY); slope(w, ...R(cu - 3, cv + r - 1, cu - 1, cv + r + 2), OPP[F.inward], 0, PY);
  parapets(w, ...R(cu - r - 2, cv - r - 2, cu + r + 3, cv - 1)); parapets(w, ...R(cu - r - 2, cv + 2, cu + r + 3, cv + r + 3));
  for (const [du, dv] of [[-r * 0.6, -r * 0.5], [r * 0.6, r * 0.5]]) { const [x, z] = at(cu + du, cv + dv); light(w, x, PY + 2, z, [1, 0.66, 0.3], 11, 1.6); }
  { const [x, z] = at(cu - Math.floor(r * 0.5), cv + Math.floor(r * 0.5)); w.addContainer(Math.floor(x) + 0.5, Math.floor(z) + 0.5, 'locker', true); }
  // Stub roads off the rim: a shunter stands on one, a brake van on the other.
  const P0 = trackFrame(T, true), stock = [];
  if (cu - r - 9 >= 2) { track(T, P0, cv + 0.5, 1, cu - r - 1); stock.push([2, 'shunter']); }
  if (cu + r + 10 <= W - 1) { track(T, P0, cv + 0.5, cu + r + 2, W - 1); stock.push([W - 9, 'van']); }
  for (const [a, kind] of stock) {
    if (kind === 'van') { wagon(T, P0, cv + 0.5, a, 'box', 7); continue; }
    const c = cv + 0.5, bx = (a0, c0, a1, c1, y0, y1, mat, col, ...p) => boxMM(w, ...P0.rect(a0, c0, a1, c1), y0, y1, mat, col, ...p), body = [0.12, 0.26, 0.24];
    w.fillRect(...P0.rect(a, c - 1.5, a + 6, c + 1.5), 1);
    bx(a + 0.2, c - 1.25, a + 5.8, c + 1.25, 0.12, 1.1, P, [0.03, 0.03, 0.035], 0, SUB.METAL); bx(a + 0.3, c - 1.1, a + 3.4, c + 1.1, 1.1, 2.6, MAT.ENAMEL, body); bx(a + 3.4, c - 1.35, a + 5.7, c + 1.35, 1.1, 3.6, MAT.ENAMEL, body); bx(a + 0.36, c - 1.04, a + 3.4, c + 1.04, 1.1, CUT, P, CAP, 0, SUB.CAP); bx(a + 3.4, c - 1.29, a + 5.64, c + 1.29, 1.1, CUT, P, CAP, 0, SUB.CAP);
    bx(a + 3.5, c - 1.38, a + 5.6, c + 1.38, 2.4, 3.3, MAT.GLOSS, [0.05, 0.09, 0.1], 0, 1); for (const o of [0, 5.8]) bx(a + o, c - 1.35, a + o + 0.2, c + 1.35, 0.7, 1.2, P, [0.6, 0.44, 0.06], 0, SUB.HAZARD);
  }
  mast(2, 2, 13, SIGNAL, 36); lamp(cu + 5, cv - r - 2.5, 3.4, SIGNAL, 12, 1.4); lamp(cu - 4, cv + r + 3.5, 3.4, SIGNAL, 12, 1.4);
  loot(cu + r + 2.5, cv - r, 'crate');
  const [px, pz] = at(cu + 3, cv - Math.floor(r * 0.5)), [qx, qz] = at(cu - 2, cv + Math.floor(r * 0.5));
  return { gates: [[cu, 0], open.back && [cu, D - 0.5]], pit: { x: px, z: pz, y: PY }, pit2: { x: qx, z: qz, y: PY }, upper: { x: cx, z: cz, y: 0 } };
}

// Grit Hoppers: aggregate bays, a loading hopper on legs with its conveyor, and the
// weighbridge with its hut. The way through runs under the hopper.
function hoppers(T) {
  const { w, rng, F, at, W, D, cu, open, panel, fill, paint, loot, hut, mast, solid, run } = T;
  paint(0, 0, W, D, SURF.ROAD);
  // Bays along the back: three concrete walls each, a heap of stone, sand or slack in them.
  const heaps = [[0.3, 0.3, 0.31], [0.44, 0.36, 0.2], [0.06, 0.06, 0.07], [0.36, 0.2, 0.14]], bv = D - 8, gateU = open.back ? cu : -99;
  for (let u = 2, k = 0; u + 7 <= W - 2; u += 7, k++) {
    if (Math.abs(u + 3.5 - gateU) < 6) continue;
    solid(u, bv, u + 1, D - 1, 0, 2.4, CONCRETE); solid(u + 6, bv, u + 7, D - 1, 0, 2.4, CONCRETE); solid(u + 1, D - 2, u + 6, D - 1, 0, 2.4, CONCRETE);
    const [x, z] = at(u + 3.5, bv + 3.5), col = heaps[k % heaps.length];
    prim(w, SHAPE.CONE, x, 1.1, z, 5.4, 2.2, 5.4, P, col, 0, SUB.WALL); ball(w, x + 1.2, 0.3, z - 1.6, 0.9, P, col, 0, SUB.WALL, 0.6); fill(u + 2, bv + 2, u + 5, D - 2, 2);
  }
  // The hopper: a bin on four legs over the through lane, a conveyor rising to it.
  const hu = cu, hv = Math.max(9, Math.floor(D * 0.42));
  for (const [du, dv] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) solid(hu + du, hv + dv, hu + du + 1, hv + dv + 1, 0, 4.6, [0.2, 0.24, 0.25], SUB.METAL);
  panel(hu - 3, hv - 3, hu + 3, hv + 3, 4.6, 8, P, [0.24, 0.27, 0.27], 0, SUB.CORRUGATED); panel(hu - 3.2, hv - 3.2, hu + 3.2, hv + 3.2, 8, 8.2, P, DARK, 0, SUB.METAL);
  { const [x, z] = at(hu, hv); primR(w, SHAPE.CONE, x, 3.9, z, 3.4, 1.5, 3.4, P, [0.2, 0.24, 0.25], 0, SUB.METAL, 0, 0, 0, 0, Math.PI); box(w, x, 4.5, z, 1.2, 0.1, 1.2, E, SIGNAL, 3); light(w, x, 4, z, SIGNAL, 15, 1.7);
    const [fx, fz] = F.dir(1, 0), run2 = Math.min(13, W - 3 - (hu + 3)); if (run2 >= 7) { const [mx, mz] = at(hu + 3 + run2 / 2, hv); primR(w, SHAPE.BOX, mx, 4.0, mz, 0.9, 0.3, Math.hypot(run2, 6.6), P, [0.15, 0.18, 0.19], 0, SUB.RUBBER, 0, 0, 0, Math.atan2(fx, fz), Math.atan2(6.6, run2)); const [ex, ez] = at(hu + 3 + run2 - 0.5, hv); box(w, ex, 0.5, ez, 1.6, 1.0, 1.6, P, [0.2, 0.24, 0.25], 0, SUB.METAL); w.fillRect(Math.floor(ex) - 1, Math.floor(ez) - 1, Math.floor(ex) + 1, Math.floor(ez) + 1, 2); } }
  paint(hu - 2, 0, hu + 2, open.back ? D : bv, SURF.ALLEY);
  // The weighbridge: a plate in the road and the hut that reads it.
  let room = null;
  if (hu - 12 >= 2) {
    panel(hu - 10, 2, hu - 5, 3 + Math.min(10, hv - 8), 0.005, 0.06, P, [0.2, 0.24, 0.25], 0, SUB.METAL);
    for (const u of [hu - 10, hu - 5.1]) panel(u, 2, u + 0.1, 3 + Math.min(10, hv - 8), 0.005, 0.07, P, [0.6, 0.44, 0.06], 0, SUB.HAZARD);
    if (hu - 17 >= 1 && hv >= 12) {
      const r = hut(hu - 17, 3, hu - 11, 9, { doors: [['f', hu - 14]], col: [0.24, 0.27, 0.28], sub: SUB.CORRUGATED, lit: SIGNAL, h: 2.9 });
      panel(r.u1 - 0.1, r.v0 + 0.5, r.u1 - 0.04, r.v1 - 0.5, 1.3, 1.9, E, [1, 0.5, 0.2], 2, rng.float()); fill(r.u1 - 1, r.v0 + 1, r.u1, r.v1 - 1, 2); panel(r.u1 - 1, r.v0 + 1, r.u1, r.v1 - 1, 0, 0.9, P, STEEL, 0, SUB.METAL);
      loot(r.u0 + 0.5, r.v1 - 0.5, 'tin', true); room = { x: at(hu - 14, 6)[0], z: at(hu - 14, 6)[1], y: 0 };
    }
  }
  { const [x, z] = at(Math.min(W - 5, hu + 8), 4); DR.vehicle(w, rng, Math.floor(x) + 0.5, Math.floor(z) + 0.5, F.s >= 2, 'truck'); }
  mast(W - 3, 2, 13, SIGNAL, 36); loot(hu + 4.5, hv + 4.5, 'crate');
  if (!open.left) run(0, 1, 1, bv, 'barrier'); if (!open.right) run(W - 1, 1, W, bv, 'barrier');
  return { gates: [[hu, 0], open.back && [hu, D - 0.5]], room, under: { x: at(hu, hv)[0], z: at(hu, hv)[1] } };
}

// ---------------------------------------------------------------- Spindle Ward
// Pilot Well: a plaza sunk two metres below the pavement. Broad steps on the street side
// and the far side, a lit column at its centre, planted corners at street level.
function well(T) {
  const { w, K, F, R, at, W, D, cu, cv, open, panel, fill, paint, floor, lamp, bench, tree, planter, arch } = T;
  const PY = -2, hu = Math.min(18, cu - 7), hd = Math.min(16, cv - 8), u0 = cu - hu, u1 = cu + hu, v0 = cv - hd, v1 = cv + hd, ice = [0.5, 0.86, 1];
  paint(0, 0, W, D, SURF.PLAZA);
  floor(u0, v0, u1, v1, PY); paint(u0, v0 - 4, u1, v1 + 4, SURF.FLOOR);
  slope(w, ...R(cu - 4, v0 - 4, cu + 4, v0), F.inward, 0, PY);
  slope(w, ...R(cu - 4, v1, cu + 4, v1 + 4), OPP[F.inward], 0, PY);
  parapets(w, ...R(u0 - 1, v0 - 5, u1 + 1, v1 + 5));
  // The column: a ring seat, a glass shaft with a light running up it.
  const [x, z] = at(cu, cv);
  w.fillRect(x - 1.5, z - 1.5, x + 1.5, z + 1.5, 2);
  cyl(w, x, PY, PY + 0.46, z, 1.5, P, [0.14, 0.15, 0.17], 0, SUB.TILE); cyl(w, x, PY + 0.46, 7, z, 0.34, MAT.HOLO, ice, 3); cyl(w, x, PY + 0.46, 7, z, 0.5, MAT.GLOSS, [0.06, 0.1, 0.12], 0, 1); cyl(w, x, 7, 7.3, z, 0.8, P, DARK, 0, SUB.METAL);
  light(w, x, PY + 2.6, z, ice, 22, 2); light(w, x, 5, z, ice, 20, 1.2);
  // Recessed bays in the long walls: lit niches with a seat, one with a locker in it.
  for (const s of [-1, 1]) for (let v = v0 + 3; v + 3 <= v1 - 2; v += 6) {
    const eu = s < 0 ? u0 : u1 - 0.12;
    panel(eu, v, eu + 0.12, v + 3, PY + 0.2, PY + 1.9, P, [0.1, 0.12, 0.14], 0, SUB.METAL); panel(eu + (s < 0 ? 0.12 : -0.05), v + 0.2, eu + (s < 0 ? 0.17 : 0), v + 2.8, PY + 1.6, PY + 1.72, E, ice, 2.2);
    const bu = s < 0 ? u0 + 0.5 : u1 - 0.5; fill(Math.floor(bu), v + 1, Math.floor(bu) + 1, v + 2, 2); panel(Math.floor(bu), v + 0.6, Math.floor(bu) + 1, v + 2.4, PY + 0.38, PY + 0.46, P, [0.2, 0.2, 0.22], 0, SUB.TILE);
  }
  { const [lx, lz] = at(u0 + 1.5, v1 - 1.5); w.addContainer(Math.floor(lx) + 0.5, Math.floor(lz) + 0.5, 'locker', false); }
  // The floor: lit inlays from the column to the four walls, seat blocks between them.
  for (const [a, b, c, d] of [[cu - 0.06, v0 + 1, cu + 0.06, cv - 2.2], [cu - 0.06, cv + 2.2, cu + 0.06, v1 - 1], [u0 + 1, cv - 0.06, cu - 2.2, cv + 0.06], [cu + 2.2, cv - 0.06, u1 - 1, cv + 0.06]]) panel(a, b, c, d, PY + 0.005, PY + 0.03, MAT.EMISSIVE, ice, 1.6);
  for (const [du, dv] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const su = Math.round(cu + du * hu), sv = Math.round(cv + dv * hd);
    fill(su - 1, sv, su + 2, sv + 1, 2); panel(su - 1, sv, su + 2, sv + 1, PY, PY + 0.46, MAT.PLAIN, [0.16, 0.17, 0.19], 0, SUB.TILE); panel(su - 1.04, sv - 0.04, su + 2.04, sv + 1.04, PY + 0.02, PY + 0.07, MAT.EMISSIVE, ice, 1.4);
  }
  T.prop('vend', cu - 6.5, v0 + 0.5, 0, PY); T.prop('vend', cu + 6.5, v1 - 0.5, Math.PI, PY);
  { const [qx, qz] = at(u1 - 1.5, v0 + 1.5); if (w.zoneAt(qx, qz) >= 1) K.addPoi(w, 'cache', Math.floor(qx) + 0.5, Math.floor(qz) + 0.5); }
  // Street level: trees in the corners, seats along the rail, cool lamps.
  for (const [u, v] of [[3, 3], [W - 4, 3], [3, D - 4], [W - 4, D - 4]]) { planter(u, v); tree(u + 1.5, v + 1.5); }
  // Rows of trees in the paving either side of the well, a kiosk by two of its corners.
  for (const su of [u0 - 5, u1 + 4]) if (su > 4 && su < W - 5) for (let v = 9; v < D - 8; v += 7) { tree(su, v); if (su - 3 > 3 && su + 3 < W - 4) planter(su < cu ? su - 3 : su + 3, v + 3); }
  for (const [su, sv, yw] of [[u0 - 3, v0 - 8, 0], [u1 + 3, v1 + 8, Math.PI]]) { const [sx, sz] = at(su, sv); if (su > 3 && su < W - 3 && sv > 3 && sv < D - 3) DR.stall(w, T.rng, Math.floor(sx) + 0.5, Math.floor(sz) + 0.5, F.yawIn + yw); }
  for (const u of [cu - 7, cu + 7]) { bench(u, v0 - 6.5); bench(u, v1 + 6.5); }
  for (const [u, v] of [[u0 - 2, v0 - 2], [u1 + 2, v0 - 2], [u0 - 2, v1 + 2], [u1 + 2, v1 + 2]]) lamp(u, v, 4, ice, 15, 1.5);
  arch(cu, 0.6, 4, true, ice); if (open.back) arch(cu, D - 0.6, 4, true, ice);
  const [px, pz] = at(cu + 4, cv);
  return { gates: [[cu, 0], open.back && [cu, D - 0.5], open.left && [0.5, cv], open.right && [W - 0.5, cv]], pit: { x: px, z: pz, y: PY } };
}

// Vane Arcade: a glazed passage through the block, shops down both sides, benches and
// planters under a row of lit vanes.
function arcade(T) {
  const { w, rng, K, R, at, W, D, cu, open, style, panel, paint, bench, planter, prop, arch } = T, half = 4, ice = [0.5, 0.86, 1];
  paint(0, 0, W, D, SURF.PLAZA); paint(cu - half, 0, cu + half, D, SURF.FLOOR);
  for (const [a, b] of [[1, cu - half], [cu + half, W - 1]]) {
    if (b - a < 7) continue;
    const n = Math.max(1, Math.round((D - 4) / 18)), step = (D - 4) / n;
    for (let k = 0; k < n; k++) K.addBuilding(w, rng, ...R(a, Math.round(2 + k * step), b, Math.round(2 + (k + 1) * step)), style, false, true);
  }
  // The roof: glass on steel arches, a lit vane hanging from each.
  for (let v = 3; v < D - 2; v += 6) {
    for (const s of [-1, 1]) { const [x, z] = at(cu + s * (half - 0.2), v); cyl(w, x, 0, 8.2, z, 0.09, P, [0.12, 0.14, 0.15], 0, SUB.METAL); }
    panel(cu - half, v - 0.1, cu + half, v + 0.1, 8.1, 8.35, P, [0.12, 0.14, 0.15], 0, SUB.METAL);
    panel(cu - 0.06, v - 1.1, cu + 0.06, v + 1.1, 5.6, 7.4, MAT.SIGN, v % 12 < 6 ? ice : [1, 0.5, 0.75], 2.4, rng.float(), 1);
    if (v % 12 < 6) { const [x, z] = at(cu, v); light(w, x, 5, z, ice, 13, 1.5); }
  }
  panel(cu - half, 2, cu + half, D - 2, 8.35, 8.45, MAT.GLOSS, [0.05, 0.07, 0.09], 0, 1);
  for (const s of [-1, 1]) panel(cu + s * 1.2 - 0.04, 1, cu + s * 1.2 + 0.04, D - 1, 0.008, 0.024, P, [0.45, 0.31, 0.17], 0, SUB.METAL);
  for (let v = 8, k = 0; v < D - 6; v += 9, k++) { if (k % 2) bench(cu, v, false); else { planter(cu, v); planter(cu, v + 1, [0.09, 0.2, 0.1]); } }
  prop('vend', cu - half + 0.5, Math.floor(D / 2) + 2, HALF);
  arch(cu, 0.6, half, true, ice); if (open.back) arch(cu, D - 0.6, half, true, ice);
  return { gates: [[cu, 0], open.back && [cu, D - 0.5]] };
}

// ---------------------------------------------------------------- dispatch
const BUILD = { court, snacks, villas, gallery, green, grove, boards, glass, plots, factory, apron, stacks, cold, slip, laydown, sidings, shed, cabin, table, hoppers, well, arcade };
export function buildNamed(w, rng, L, K) {
  const T = tools(w, rng, L, K), out = BUILD[L.kind](T, L.named), o = Array.isArray(out) ? { gates: out } : out;
  const uv = o.gates.filter(Boolean), [ex, ez] = T.at(uv[0][0], 1);
  // Each gate is reported a step inside the lot, on ground the builder left open.
  o.gates = uv.map(([u, v]) => { const [x, z] = T.at(Math.max(0.5, Math.min(T.W - 0.5, u)), Math.max(0.5, Math.min(T.D - 0.5, v))); return { x, z }; });
  return { entry: { x: ex, z: ez }, ...o };
}
