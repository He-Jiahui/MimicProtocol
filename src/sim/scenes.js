// Two interior scenes on the height model (doc 64 Package 8; docs 32 and 44), each built on
// one lot by layout code in place of the lot's usual buildings. Pure data, like the generator.
//
// The laundry court: behind a street frontage, through a passage, a tenants' stair goes down
// to a paved court a level below the street. A laundry van stands in it, washing hangs across
// it, a tree grows from a pit in its paving, an unloading room opens off its back wall and the
// lost-property basket waits by that door.
//
// The records tower: a tall enterable building. Its lobby is at street level; the records
// mezzanine is 4 m up over the back of the floor plan, reached by an interior stair and
// furnished with filing cabinets that hold better finds. A window in the mezzanine's back
// wall can be broken (loudly) and becomes a one-way drop to the plaza behind; beside it an
// evacuation cabinet holds a clip-on descent line that makes one drop of up to 12 m cost
// nothing.

import { MAT, SHAPE, SUB, SURF, STYLE, prim, primR, box, boxMM, cyl, ball, light } from './emit.js';
import { NEON } from './data.js';
import { level, slope, parapets } from './height.js';
import * as D from './dress.js';

const P = MAT.PLAIN, E = MAT.EMISSIVE, HALF = Math.PI / 2;
const COURT_Y = -2, MEZZ_Y = 4, TOWER_WH = 8.6;

// A lot seen from its street: u runs along the front, v inward from the front edge. Side s
// is the footprint side the front lies on (0 north, 1 south, 2 west, 3 east, as for doors).
export function lotFrame(x0, z0, x1, z1, s) {
  const W = s < 2 ? x1 - x0 : z1 - z0, Dp = s < 2 ? z1 - z0 : x1 - x0;
  const pt = (u, v) => (s === 0 ? [x0 + u, z0 + v] : s === 1 ? [x1 - u, z1 - v] : s === 2 ? [x0 + v, z0 + u] : [x1 - v, z0 + u]);
  const rect = (u0, v0, u1, v1) => { const [ax, az] = pt(u0, v0), [bx, bz] = pt(u1, v1); return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]; };
  // Walking inward (+v) and along the front (+u) in the grid's terms, and the yaw facing +v.
  const inward = ['z+', 'z-', 'x+', 'x-'][s], along = ['x+', 'x-', 'z+', 'z+'][s];
  const yawIn = [0, Math.PI, HALF, -HALF][s];
  const dir = (du, dv) => { const [ax, az] = pt(0, 0), [bx, bz] = pt(du, dv); return [bx - ax, bz - az]; };
  return { W, D: Dp, s, pt, rect, inward, along, yawIn, dir, x0, z0, x1, z1 };
}

// ---------------------------------------------------------------- the laundry court
export function laundryCourt(w, rng, L, K) {
  const F = lotFrame(L.x0, L.z0, L.x1, L.z1, L.side), W = F.W, Dp = F.D;
  const FD = 9, SB = 6, BD = 7, GAL = 3, cu = Math.floor(W / 2);
  const R = (u0, v0, u1, v1) => F.rect(u0, v0, u1, v1);
  // The frontage on the street, split by the passage; its buildings dress the street side.
  for (const [u0, u1] of [[0, cu - 2], [cu + 2, W]]) { const r = R(u0, 0, u1, FD); K.addBuilding(w, rng, ...r, L.style, true); }
  // The passage through the frontage, a lintel and a lit name over it.
  const pr = R(cu - 2, 0, cu + 2, FD);
  w.fillRect(...pr, 0); w.paint(...pr, SURF.ALLEY);
  { const [x, z] = F.pt(cu, 0.2), [dx, dz] = F.dir(1, 0); boxMM(w, ...R(cu - 2, 0, cu + 2, 0.6), 3.4, 5.2, P, [0.16, 0.14, 0.13], 0, SUB.WALL); box(w, x, 4.3, z, Math.abs(dx) * 3.2 + 0.12, 0.7, Math.abs(dz) * 3.2 + 0.12, MAT.SIGN, NEON[1], 4.2, rng.float(), 0); light(w, ...F.pt(cu, 2), 3.2, [0.6, 0.9, 1.0], 10, 1.4); void x; void z; }
  boxMM(w, ...R(cu - 2, 0, cu + 2, FD), 5.2, 5.5, P, [0.12, 0.12, 0.13]);
  // Tenement backs on either side, and the back block a level down, with the unloading room.
  for (const [u0, u1] of [[0, SB], [W - SB, W]]) {
    const r = R(u0, FD, u1, Dp - BD), h = rng.irange(10, 14);
    w.fillRect(...r, 1);
    boxMM(w, ...r, 0, h, MAT.FACADE, [0.2, 0.16, 0.13], 1, rng.float() * 997, 0.35, 2.8, rng.int(8));
    K.addRoof(w, rng, ...r, h);
  }
  const back = R(0, Dp - BD, W, Dp), bh = rng.irange(11, 15);
  level(w, ...back, COURT_Y);
  w.fillRect(...back, 1);
  // The unloading room: 10 m along the back wall, 5 m deep, its door onto the court.
  const ru0 = cu - 5, ru1 = cu + 5, rv0 = Dp - BD, rv1 = Dp - 1, room = R(ru0 + 1, rv0 + 1, ru1 - 1, rv1 - 1);
  w.fillRect(...room, 0); w.paint(...room, SURF.FLOOR);
  const wallCol = [0.24, 0.2, 0.17];
  // Its walls, the court-side one split round a 3 m doorway whose two cells take the door.
  for (const r of [R(ru0, rv0, cu - 1.5, rv0 + 1), R(cu + 1.5, rv0, ru1, rv0 + 1), R(ru0, rv1 - 1, ru1, rv1), R(ru0, rv0, ru0 + 1, rv1), R(ru1 - 1, rv0, ru1, rv1)]) boxMM(w, ...r, COURT_Y, COURT_Y + 4.2, P, wallCol, 0, 1);
  w.fillRect(...R(cu - 1, rv0, cu + 1, rv0 + 1), 0);
  // Mass of the back block round and over the room.
  for (const r of [R(0, Dp - BD, ru0, Dp), R(ru1, Dp - BD, W, Dp), R(ru0, rv1, ru1, Dp)]) boxMM(w, ...r, COURT_Y, bh, MAT.FACADE, [0.19, 0.15, 0.12], 1, rng.float() * 997, 0.3, 2.8, rng.int(8));
  boxMM(w, ...R(ru0, rv0, ru1, rv1), COURT_Y + 4.2, bh, MAT.FACADE, [0.19, 0.15, 0.12], 1, rng.float() * 997, 0.3, 2.8, rng.int(8));
  K.addRoof(w, rng, ...back, bh);
  boxMM(w, ...room, COURT_Y, COURT_Y + 0.05, P, [0.19, 0.185, 0.18], 0, 2);
  light(w, ...F.pt(cu, rv0 + 2.5), COURT_Y + 3.2, [1.0, 0.82, 0.55], 12, 2.0);
  // Its door, in the wall that faces the court: the room's side toward the street, as the lot's.
  const ds = L.side, [dcx, dcz] = F.pt(cu, rv0), door = K.addDoor(w, rng, ds, ds < 2 ? Math.round(dcx) : Math.round(dcz), ...R(ru0, rv0, ru1, rv1), false, wallCol);
  if (door) { door.kind = 'closed'; door.use = 'shop'; }
  // The court a level down, the tenants' gallery along the frontage and the stair from the passage.
  const court = R(SB, FD + GAL, W - SB, Dp - BD);
  level(w, ...court, COURT_Y);
  w.fillRect(...court, 0); w.paint(...court, SURF.PLAZA);
  const gallery = R(SB, FD, W - SB, FD + GAL);
  w.fillRect(...gallery, 0); w.paint(...gallery, SURF.WALK);
  slope(w, ...R(cu - 2, FD, cu + 2, FD + 4), F.inward, 0, COURT_Y);
  // The court's furnishing: washing lines, machines under a lean-to, carts and bags.
  const cv0 = FD + GAL, cv1 = Dp - BD, cw0 = SB, cw1 = W - SB;
  const at = (u, v) => F.pt(u, v), put = (u, v, y, su, sy, sv, mat, col, emis = 0, p0 = 0, p1 = 0) => { const [x, z] = at(u, v), [du] = [F.dir(1, 0)]; const alongX = Math.abs(du[0]) > 0.5; box(w, x, COURT_Y + y, z, alongX ? su : sv, sy, alongX ? sv : su, mat, col, emis, p0, p1); };
  const block = (u, v) => { const [x, z] = at(u, v); w.fillRect(Math.floor(x), Math.floor(z), Math.floor(x) + 1, Math.floor(z) + 1, 2); };
  // Washing machines in a row against one side, under a corrugated lean-to.
  for (let v = cv0 + 2; v < cv1 - 2; v += 1.2) { put(cw0 + 0.45, v, 0.45, 0.8, 0.9, 0.8, MAT.ENAMEL, [0.72, 0.74, 0.76]); put(cw0 + 0.86, v, 0.55, 0.02, 0.4, 0.4, MAT.GLOSS, [0.08, 0.1, 0.12]); block(cw0 + 0.5, v); }
  put(cw0 + 1.1, (cv0 + cv1) / 2, 2.6, 2.4, 0.08, cv1 - cv0 - 3, P, [0.3, 0.32, 0.3], 0, SUB.CORRUGATED);
  // Lines of washing across the court, high enough to walk under.
  for (let v = cv0 + 3; v < cv1 - 2; v += 3.5) {
    put((cw0 + cw1) / 2, v, 3.3, cw1 - cw0 - 1, 0.02, 0.02, P, [0.05, 0.05, 0.05]);
    for (let u = cw0 + 2; u < cw1 - 1.5; u += rng.range(0.7, 1.3)) if (rng.chance(0.7)) put(u, v, 2.95 - rng.range(0, 0.25), rng.range(0.4, 0.75), rng.range(0.5, 0.8), 0.03, P, rng.pick([[0.6, 0.6, 0.62], [0.5, 0.15, 0.15], [0.15, 0.25, 0.5], [0.55, 0.5, 0.3], [0.2, 0.35, 0.25]]), 0, SUB.FABRIC);
  }
  // The laundry van, backed up to the unloading room.
  const [vx, vz] = at(cw1 - 3.5, cv1 - 4.5);
  D.vehicle(w, rng, Math.floor(vx) + 0.5, Math.floor(vz) + 0.5, L.side < 2, 'van', COURT_Y);
  // A tree in a pit in the paving: a grate round its foot.
  const [tx, tz] = at((cw0 + cw1) / 2 + 1.5, (cv0 + cv1) / 2 + 1);
  const tcx = Math.floor(tx) + 0.5, tcz = Math.floor(tz) + 0.5;
  w.fillRect(tcx - 0.5, tcz - 0.5, tcx + 0.5, tcz + 0.5, 2);
  box(w, tcx, COURT_Y + 0.02, tcz, 1.6, 0.04, 1.6, P, [0.08, 0.08, 0.09], 0, SUB.BARS, 3);
  cyl(w, tcx, COURT_Y, COURT_Y + 4.4, tcz, 0.18, P, [0.09, 0.065, 0.045], 0, SUB.BARK);
  ball(w, tcx, COURT_Y + 5.0, tcz, 1.9, MAT.FOLIAGE, [0.06, 0.16, 0.07], 0, rng.float(), 0.85);
  ball(w, tcx + 0.7, COURT_Y + 4.3, tcz - 0.5, 1.2, MAT.FOLIAGE, [0.07, 0.18, 0.08], 0, rng.float(), 0.8);
  // Laundry carts and bags by the room door; the lost-property basket on a bench beside it.
  for (const du of [-3.5, 3.6]) { put(cu + du, cv1 - 1.2, 0.55, 0.9, 0.7, 0.6, P, [0.3, 0.32, 0.36], 0, SUB.METAL); put(cu + du, cv1 - 1.2, 1.0, 0.8, 0.35, 0.5, P, [0.55, 0.55, 0.58], 0, SUB.FABRIC); block(cu + du, cv1 - 1.2); }
  const [bx, bz] = at(cu - 5, cv1 - 1.5);
  put(cu - 5, cv1 - 1.5, 0.42, 1.6, 0.08, 0.5, P, [0.22, 0.15, 0.09], 0, SUB.TIMBER);
  const basket = w.addContainer(Math.floor(bx) + 0.5, Math.floor(bz) + 0.5, 'basket', false, { y: 0.48, yaw: F.yawIn });
  // Inside the unloading room: shelves of folded linen, a locker and a crate.
  const lock = at(ru0 + 1.5, rv0 + 2.5), crate = at(ru1 - 1.5, rv1 - 1.5);
  w.addContainer(Math.floor(lock[0]) + 0.5, Math.floor(lock[1]) + 0.5, 'locker', true, { yaw: F.yawIn });
  w.addContainer(Math.floor(crate[0]) + 0.5, Math.floor(crate[1]) + 0.5, 'crate', true, { yaw: F.yawIn });
  for (let u = ru0 + 3; u < ru1 - 2; u += 2.2) { put(u, rv1 - 1.4, 1.0, 1.8, 2.0, 0.5, P, [0.18, 0.18, 0.2], 0, SUB.METAL); for (const y of [0.6, 1.2, 1.8]) put(u, rv1 - 1.35, y, 1.6, 0.18, 0.4, P, rng.pick([[0.62, 0.62, 0.64], [0.6, 0.55, 0.45]]), 0, SUB.FABRIC); block(u, rv1 - 1.4); }
  // Light: lamps over the gallery and the court, warm windows on the backs.
  light(w, ...at(cu, cv0 + 3), COURT_Y + 4.2, [1.0, 0.78, 0.5], 18, 2.0);
  light(w, ...at(cu, cv1 - 3), COURT_Y + 3.4, [1.0, 0.78, 0.5], 14, 1.6);
  for (const u of [cw0 + 1, cw1 - 1]) { const [x, z] = at(u, cv0 + 1); cyl(w, x, COURT_Y, COURT_Y + 3.6, z, 0.05, P, [0.1, 0.1, 0.1]); ball(w, x, COURT_Y + 3.7, z, 0.18, E, [1.0, 0.8, 0.5], 4); }
  parapets(w, ...R(-1, -1, W + 1, Dp + 1));
  const [cx, cz] = at(cu, FD + 5.5);
  K.addPoi(w, 'scene', cx, cz, { name: 'Laundry Court', y: COURT_Y });
  return { kind: 'laundry', x: cx, z: cz, court, stair: R(cu - 2, FD, cu + 2, FD + 4), basket, door, van: [vx, vz], tree: [tcx, tcz] };
}

// ---------------------------------------------------------------- the records tower
export function recordsTower(w, rng, L, K) {
  const F = lotFrame(L.x0, L.z0, L.x1, L.z1, L.side), W = F.W, Dp = F.D;
  const R = (u0, v0, u1, v1) => F.rect(u0, v0, u1, v1), at = (u, v) => F.pt(u, v);
  // The tower stands back 2 m from the street, with a plaza on both sides and behind it.
  const TW = Math.min(30, W - 10), TD = Math.min(30, Dp - 12), tu0 = Math.floor((W - TW) / 2), tv0 = 2, tu1 = tu0 + TW, tv1 = tv0 + TD;
  const lot = R(0, 0, W, Dp);
  w.paint(...lot, SURF.PLAZA);
  const foot = R(tu0, tv0, tu1, tv1), h = rng.irange(38, 58);
  const col = rng.pick([[0.07, 0.09, 0.12], [0.1, 0.12, 0.15], [0.09, 0.1, 0.12]]), seed = rng.float() * 997, cellW = rng.range(2.6, 3.4), accent = rng.int(8);
  const wallCol = [0.17, 0.18, 0.2];
  // Shell walls 1 m thick to 8.6 m; the back wall keeps a window open at the mezzanine.
  const LD = Math.floor((TD - 2) / 2), mv = tv0 + 1 + LD, wu = Math.floor((tu0 + tu1) / 2);
  const wall = (u0, v0, u1, v1, y0 = 0, y1 = TOWER_WH) => { const r = R(u0, v0, u1, v1); w.fillRect(...r, 1); boxMM(w, ...r, y0, y1, P, wallCol, 0, 1); };
  const dc = Math.floor((tu0 + tu1) / 2);
  wall(tu0, tv0, dc - 1.5, tv0 + 1); wall(dc + 1.5, tv0, tu1, tv0 + 1);            // front, a doorway of two cells at dc
  wall(tu0, tv0 + 1, tu0 + 1, tv1); wall(tu1 - 1, tv0 + 1, tu1, tv1);                 // sides
  wall(tu0 + 1, tv1 - 1, wu, tv1); wall(wu + 1, tv1 - 1, tu1 - 1, tv1);              // back, the window at wu
  const win = R(wu, tv1 - 1, wu + 1, tv1);
  w.fillRect(...win, 1);
  boxMM(w, ...win, 0, MEZZ_Y, P, wallCol, 0, 1); boxMM(w, ...win, MEZZ_Y + 2.9, TOWER_WH, P, wallCol, 0, 1);
  // Above the shell the tower's mass, its roof and a lit crown sign.
  boxMM(w, ...foot, TOWER_WH, h, MAT.FACADE, col, 1, seed, 0.5, cellW, accent);
  K.addRoof(w, rng, ...foot, h);
  const [sx, sz] = at((tu0 + tu1) / 2, tv0 - 0.2), [du0, dz0] = F.dir(1, 0);
  box(w, sx, TOWER_WH + 2.2, sz, Math.abs(du0) * 12 + 0.25, 1.6, Math.abs(dz0) * 12 + 0.25, MAT.SIGN, NEON[accent], 4.8, rng.float(), 0);
  const ds = L.side, [dx, dz] = at(dc, tv0), door = K.addDoor(w, rng, ds, ds < 2 ? Math.round(dx) : Math.round(dz), ...foot, false, wallCol);
  if (door) { door.kind = 'closed'; door.use = 'office'; }
  // The lobby at street level; the records mezzanine 4 m up behind it; the stair between.
  const inside = R(tu0 + 1, tv0 + 1, tu1 - 1, tv1 - 1);
  w.paint(...inside, SURF.FLOOR);
  const mez = R(tu0 + 1, mv, tu1 - 1, tv1 - 1);
  level(w, ...mez, MEZZ_Y);
  level(w, ...win, MEZZ_Y);
  slope(w, ...R(tu1 - 4, mv - 8, tu1 - 1, mv), F.inward, 0, MEZZ_Y);
  boxMM(w, ...R(tu0 + 1, tv0 + 1, tu1 - 4, mv), 0, 0.05, P, [0.2, 0.2, 0.21], 0, 2);
  // Lobby: a reception desk, planters, the directory board by the stair foot.
  const desk = R(tu0 + 3, tv0 + 4, tu0 + 8, tv0 + 5);
  w.fillRect(...desk, 2); boxMM(w, ...desk, 0, 1.1, P, [0.16, 0.17, 0.19], 0, 6); boxMM(w, ...desk, 1.1, 1.16, MAT.GLOSS, [0.05, 0.05, 0.06]);
  { const [bx, bz] = at(tu1 - 2.5, mv - 9.4); box(w, bx, 1.7, bz, Math.abs(du0) * 2.2 + 0.08, 1.4, Math.abs(dz0) * 2.2 + 0.08, MAT.SIGN, [0.9, 0.92, 1.0], 1.6, rng.float(), 2); }
  for (const [u, v] of [[tu0 + 2, tv0 + 2], [tu1 - 6, tv0 + 2]]) { const [px, pz] = at(u + 0.5, v + 0.5); w.fillRect(Math.floor(px), Math.floor(pz), Math.floor(px) + 1, Math.floor(pz) + 1, 2); cyl(w, px, 0, 0.5, pz, 0.35, P, [0.2, 0.2, 0.22]); prim(w, SHAPE.CONE, px, 1.2, pz, 0.9, 1.5, 0.9, MAT.FOLIAGE, [0.05, 0.17, 0.07], 0, rng.float()); }
  light(w, ...at((tu0 + tu1) / 2, tv0 + 4), 3.8, [0.85, 0.9, 1.0], 18, 2.2);
  light(w, ...at((tu0 + tu1) / 2, mv + 3), MEZZ_Y + 3.2, [1.0, 0.85, 0.6], 16, 2.0);
  light(w, ...at(wu + 0.5, tv1 - 3), MEZZ_Y + 2.6, [1.0, 0.75, 0.5], 10, 1.4);
  // Records: rows of filing cabinets along the mezzanine and three cabinets worth searching.
  const cabinet = [0.24, 0.25, 0.22];
  for (let u = tu0 + 2; u < tu1 - 5; u += 3) {
    for (const v of [tv1 - 2, mv + 3]) {
      if (Math.abs(u + 0.5 - (wu + 0.5)) < 2.5 && v === tv1 - 2) continue;
      const [cx, cz] = at(u + 0.5, v + 0.5);
      w.fillRect(Math.floor(cx), Math.floor(cz), Math.floor(cx) + 1, Math.floor(cz) + 1, 2);
      box(w, cx, MEZZ_Y + 0.7, cz, 0.9, 1.4, 0.9, P, cabinet, 0, SUB.METAL);
      for (const y of [0.35, 0.8, 1.2]) box(w, cx, MEZZ_Y + y, cz, 0.92, 0.04, 0.92, P, [0.12, 0.12, 0.11], 0, SUB.METAL);
    }
  }
  const records = [];
  for (const [u, v] of [[tu0 + 3.5, mv + 5.5], [(tu0 + tu1) / 2 + 3.5, mv + 5.5], [tu0 + 6.5, tv1 - 3.5]]) {
    const [cx, cz] = at(u, v);
    records.push(w.addContainer(Math.floor(cx) + 0.5, Math.floor(cz) + 0.5, 'records', true, { yaw: F.yawIn, rich: 1.8 }));
  }
  // The evacuation cabinet on the back wall beside the window.
  const [ex, ez] = at(wu + 2.5, tv1 - 1.5);
  const evac = w.addContainer(Math.floor(ex) + 0.5, Math.floor(ez) + 0.5, 'evac', true, { yaw: F.yawIn + Math.PI });
  // The window: a door-like opening of its own kind (doors.js), with its outward normal.
  const [nx, nz] = F.dir(0, 1), [wx, wz] = at(wu + 0.5, tv1 - 0.5);
  const window = { id: w.windows.length, x: wx, z: wz, cell: Math.floor(wz) * w.size + Math.floor(wx), nx, nz, y: MEZZ_Y, horiz: L.side < 2, block: w.blockIndex(wx, wz) };
  w.windows.push(window);
  // The plaza round it: trees and benches, and a lamp under the window so the drop reads.
  for (const [u, v] of [[2, Dp - 4], [W - 3, Dp - 4], [2, tv0 + 6], [W - 3, tv0 + 6]]) { const [px, pz] = at(u + 0.5, v + 0.5); K.tree(w, rng, Math.floor(px) + 0.5, Math.floor(pz) + 0.5); }
  { const [lx, lz] = at(wu + 3.5, tv1 + 2.5); cyl(w, lx, 0, 4, lz, 0.07, P, [0.1, 0.1, 0.11]); ball(w, lx, 4.1, lz, 0.2, E, [1.0, 0.85, 0.6], 4); light(w, lx, 3.8, lz, [1.0, 0.85, 0.6], 16, 1.6); w.fillRect(Math.floor(lx), Math.floor(lz), Math.floor(lx) + 1, Math.floor(lz) + 1, 2); }
  parapets(w, ...R(tu0, tv0, tu1, tv1));
  const [cx, cz] = at((tu0 + tu1) / 2 - 3, tv0 + 7.5);
  K.addPoi(w, 'scene', cx, cz, { name: 'Records Tower', y: 0 });
  return { kind: 'tower', x: cx, z: cz, foot, mez, stair: R(tu1 - 4, mv - 8, tu1 - 1, mv), door, window, records, evac, lobby: at((tu0 + tu1) / 2, tv0 + 4), plaza: at(wu + 0.5, tv1 + 3) };
}

// ---------------------------------------------------------------- choosing the lots
// Lots big enough with a real street on one side, away from the landmarks: the tower in the
// tall districts, the court among the low old streets, both out of the Shelter.
export function pickSceneLots(w, net, bounds, hitsReserved, styleFor) {
  const out = [], used = new Set();
  const want = [
    { kind: 'tower', ok: (st) => st === STYLE.CORPORATE || st === STYLE.ARCOLOGY || st === STYLE.NEON, w: 36, d: 36 },
    { kind: 'laundry', ok: (st) => st === STYLE.OLDTOWN || st === STYLE.NEON, w: 30, d: 32 },
  ];
  for (const k of want) {
    let best = null, bc = Infinity;
    for (let i = 0; i < net.xs.length - 1; i++) {
      for (let j = 0; j < net.zs.length - 1; j++) {
        if (used.has(i * 1000 + j)) continue;
        const b = bounds(i, j);
        if (!b) continue;
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, zone = w.zoneAt(cx, cz);
        if (zone < 1 || zone > 3 || !k.ok(styleFor(cx, cz)) || hitsReserved(w, b.x0, b.z0, b.x1, b.z1)) continue;
        // The front: the widest real street beside the lot.
        const roads = [net.h[j][i], net.h[j + 1][i], net.v[i][j], net.v[i + 1][j]];
        let side = -1, rk = 1;
        for (let s = 0; s < 4; s++) if (roads[s] > rk) { rk = roads[s]; side = s; }
        if (side < 0) continue;
        const W = side < 2 ? b.x1 - b.x0 : b.z1 - b.z0, Dp = side < 2 ? b.z1 - b.z0 : b.x1 - b.x0;
        if (W < k.w || Dp < k.d || W > 70 || Dp > 70) continue;
        const cost = Math.abs(W - k.w - 6) + Math.abs(Dp - k.d - 6) + zone * 3 + Math.hypot(cx - w.size / 2, cz - w.size / 2) * 0.05;
        if (cost < bc) { bc = cost; best = { kind: k.kind, i, j, side, style: styleFor(cx, cz), ...b }; }
      }
    }
    if (best) { used.add(best.i * 1000 + best.j); out.push(best); }
  }
  return out;
}
