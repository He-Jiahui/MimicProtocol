// The Matron's home (doc 45; doc 64 Package 8): the Reliquary cable works. A covered winding
// hall, 60 m by 32 m inside, long because it once needed a clear span between its drum
// stands. The spider has taken the whole volume: silk fans from the crane rails to the high
// windows and sacs hang under the rails. The fight stays on one floor. Eight drum stands
// along the long walls are the only cover; the strip down the middle, where finished drums
// were rolled out to the east shutter, is kept bare so the next rush can be seen coming.
// The gate is in the south wall, with the workers' little shrine outside beside it.
// Pure data, like the generator.

import { MAT, SHAPE, SUB, SURF, prim, primR, box, boxMM, cyl, ball, light } from './emit.js';

const P = MAT.PLAIN, E = MAT.EMISSIVE, O = MAT.ORGANIC, HALF = Math.PI / 2;
const BRICK = [0.2, 0.15, 0.14], STEEL = [0.2, 0.21, 0.23], RUST = [0.3, 0.17, 0.1], DARK = [0.07, 0.07, 0.08];
const FLESH = [0.5, 0.16, 0.24], SILK = [0.72, 0.7, 0.66], GLOW = [1.0, 0.3, 0.55];

export const WORKS = { HX: 30, HZ: 16, WALL: 9, GATE: 4, RAIL_Y: 8.2 };

// One drum stand: two trestles, an axle and a cable drum on its side. Solid.
function drumStand(w, rng, x, z, taken) {
  w.fillRect(x - 1.3, z - 1.7, x + 1.3, z + 1.7, 1);
  for (const dz of [-1.45, 1.45]) {
    for (const lean of [-0.34, 0.34]) primR(w, SHAPE.BOX, x + lean * 2.2, 1.0, z + dz, 0.16, 2.3, 0.16, P, STEEL, 0, SUB.METAL, 0, 0, 0, 0, 0, lean);
    box(w, x, 0.08, z + dz, 2.4, 0.16, 0.24, P, STEEL, 0, SUB.METAL);
  }
  primR(w, SHAPE.CYL, x, 1.95, z, 0.2, 3.3, 0.2, P, DARK, 0, SUB.METAL, 0, 0, 0, 0, HALF);            // the axle
  primR(w, SHAPE.CYL, x, 1.95, z, 1.7, 2.3, 1.7, P, taken ? [0.16, 0.13, 0.13] : [0.1, 0.1, 0.11], 0, SUB.RUBBER, 0, 0, 0, 0, HALF);   // the wound cable
  for (const dz of [-1.2, 1.2]) primR(w, SHAPE.CYL, x, 1.95, z + dz, 3.0, 0.14, 3.0, P, RUST, 0, SUB.TIMBER, 0, 0, 0, 0, HALF);          // flanges
  if (taken) {
    // The brood has been at this one: growth over a flange and a sac in its lee.
    prim(w, SHAPE.SPHERE, x + rng.range(-0.5, 0.5), 2.9, z + rng.range(-0.8, 0.8), 1.5, 1.0, 1.7, O, FLESH, 1.2, rng.float());
    ball(w, x + 1.5, 0.5, z + rng.range(-1, 1), 0.55, O, FLESH, 1.4, rng.float(), 0.8);
  }
}

// A strand of silk from (ax, ay, az) to (bx, by, bz): a thin pale cylinder, sagging a little.
function strand(w, ax, ay, az, bx, by, bz, r = 0.03) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 1, yaw = Math.atan2(dx, dz), pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
  primR(w, SHAPE.CYL, (ax + bx) / 2, (ay + by) / 2 - len * 0.01, (az + bz) / 2, r * 2, len, r * 2, P, SILK, 0.25, SUB.FABRIC, 0, 0, 0, yaw, pitch);
}

export function reliquaryWorks(w, rng, cx, cz, K) {
  const { HX, HZ, WALL, GATE, RAIL_Y } = WORKS;
  cx = Math.round(cx); cz = Math.round(cz);
  const x0 = cx - HX, x1 = cx + HX, z0 = cz - HZ, z1 = cz + HZ;
  for (const dx of [-21, 0, 21]) K.reserve(w, cx + dx, cz, 21.5);
  // The winding floor: worn boards over concrete.
  for (let z = z0; z < z1; z++) w.surface.fill(SURF.FLOOR, z * w.size + x0, z * w.size + x1);

  // ---- the shell: brick to the sill of the high windows, then glass and steel
  const wall = (ax, az, bx, bz) => { w.fillRect(ax, az, bx, bz, 1); boxMM(w, ax, az, bx, bz, 0, WALL, P, BRICK, 0, SUB.WALL); };
  wall(x0 - 1, z0 - 1, x1 + 1, z0);                                   // north
  wall(x0 - 1, z1, cx - GATE, z1 + 1); wall(cx + GATE, z1, x1 + 1, z1 + 1);   // south, with the gate between
  wall(x0 - 1, z0, x0, z1); wall(x1, z0, x1 + 1, z1);                 // west, east
  boxMM(w, cx - GATE, z1, cx + GATE, z1 + 1, 5.2, WALL, P, BRICK, 0, SUB.WALL);          // the gate's lintel
  for (const dx of [-GATE - 0.25, GATE + 0.25]) boxMM(w, cx + dx - 0.25, z1 - 0.1, cx + dx + 0.25, z1 + 1.1, 0, 5.2, P, STEEL, 0, SUB.METAL);
  boxMM(w, cx - GATE, z1 + 0.4, cx + GATE, z1 + 0.6, 4.4, 5.2, P, RUST, 0, SUB.CORRUGATED);   // the shutter, run up
  boxMM(w, x1 - 0.06, cz - 3, x1 + 0.04, cz + 3, 0, 4.6, P, RUST, 0, SUB.CORRUGATED);        // the roll-out shutter, shut
  for (const dz of [-3.2, 3.2]) boxMM(w, x1 - 0.2, cz + dz - 0.2, x1, cz + dz + 0.2, 0, 4.8, P, STEEL, 0, SUB.METAL);
  // High windows on the long walls: dusk through dirty glass, a few panes webbed over.
  for (let x = x0 + 3; x < x1 - 2; x += 6) for (const [z, s] of [[z0 + 0.06, 1], [z1 - 0.06, -1]]) {
    if (s < 0 && Math.abs(x + 2 - cx) < GATE + 2.5) continue;
    const webbed = rng.chance(0.3);
    box(w, x + 2, 6.9, z, 4, 1.6, 0.08, E, webbed ? [0.5, 0.42, 0.46] : [0.42, 0.5, 0.66], webbed ? 0.5 : 1.1);
    box(w, x + 2, 6.9, z + s * 0.05, 0.08, 1.6, 0.05, P, DARK, 0, SUB.METAL);
    box(w, x + 2, 6.0, z + s * 0.1, 4.3, 0.12, 0.25, P, STEEL, 0, SUB.METAL);
  }

  // ---- crane rails, the travelling crane and the roof trusses
  for (const dz of [-HZ + 2.2, HZ - 2.2]) {
    boxMM(w, x0, cz + dz - 0.18, x1, cz + dz + 0.18, RAIL_Y, RAIL_Y + 0.36, P, STEEL, 0, SUB.METAL);
    for (let x = x0 + 5; x < x1; x += 10) boxMM(w, x - 0.15, Math.min(cz + dz, cz + dz + Math.sign(dz) * 2.2), x + 0.15, Math.max(cz + dz, cz + dz + Math.sign(dz) * 2.2), RAIL_Y - 0.5, RAIL_Y, P, STEEL, 0, SUB.METAL);
  }
  const craneX = cx + 13;
  boxMM(w, craneX - 0.4, z0 + 2, craneX + 0.4, z1 - 2, RAIL_Y + 0.36, RAIL_Y + 1.0, P, [0.5, 0.36, 0.06], 0, SUB.HAZARD);
  cyl(w, craneX, 4.6, RAIL_Y + 0.36, cz - 5, 0.04, P, DARK, 0, SUB.METAL);
  box(w, craneX, 4.4, cz - 5, 0.5, 0.5, 0.5, P, STEEL, 0, SUB.METAL);
  for (let x = x0 + 5; x <= x1 - 5; x += 10) {
    boxMM(w, x - 0.14, z0, x + 0.14, z1, WALL + 0.5, WALL + 0.85, P, STEEL, 0, SUB.METAL);
    // Roof sheets, some of them gone.
    for (let z = z0; z < z1; z += 8) if (rng.chance(0.62)) boxMM(w, x - 5, z, x + 5, z + 8, WALL + 0.9, WALL + 0.98, P, [0.13, 0.13, 0.15], 0, SUB.CORRUGATED);
  }

  // ---- the roll-out strip down the middle: two floor rails to the east shutter, kept bare
  for (const dz of [-1.5, 1.5]) boxMM(w, x0 + 2, cz + dz - 0.05, x1, cz + dz + 0.05, 0.005, 0.03, P, STEEL, 0, SUB.METAL);
  for (let x = x0 + 4; x < x1; x += 4) boxMM(w, x - 0.4, cz - 0.06, x + 0.4, cz + 0.06, 0.005, 0.02, P, [0.6, 0.42, 0.08], 0, SUB.HAZARD);

  // ---- eight drum stands along the long walls, a clear span between them
  const stands = [];
  for (const dx of [-22, -10, 10, 22]) for (const dz of [-10, 10]) {
    const x = cx + dx, z = cz + dz;
    drumStand(w, rng, x, z, rng.chance(0.5));
    stands.push({ x, z });
  }

  // ---- silk: fans from the rails to the window heads, long strands across the span, hanging sacs
  for (let k = 0; k < 9; k++) {
    const x = x0 + 4 + k * 6.6 + rng.range(-1.5, 1.5), s = k % 2 ? 1 : -1, rz = cz + s * (HZ - 2.2);
    for (let q = 0; q < 3; q++) strand(w, x, RAIL_Y, rz, x + rng.range(-3.5, 3.5), rng.range(5.6, 7.6), cz + s * (HZ - 0.15), 0.025);
    if (k % 2 === 0) strand(w, x, RAIL_Y, rz, x + rng.range(-6, 6), RAIL_Y, cz - s * (HZ - 2.2), 0.035);
  }
  for (let k = 0; k < 10; k++) {
    const x = x0 + 4 + rng.range(0, 2 * HX - 8), z = cz + rng.range(-HZ + 3, HZ - 3), y = rng.range(5.2, 7.0);
    if (Math.abs(z - cz) < 2.5) continue;
    cyl(w, x, y + 0.4, RAIL_Y + 0.6, z, 0.025, P, SILK, 0.25, SUB.FABRIC);
    prim(w, SHAPE.SPHERE, x, y, z, 0.7, 1.0, 0.7, O, FLESH, 1.6, rng.float());
    if (k % 3 === 0) ball(w, x, y - 0.1, z, 0.16, E, GLOW, 2.2, rng.float());
  }
  // Growth where the walls meet the floor, thickest in the far corners.
  for (let k = 0; k < 26; k++) {
    const far = k < 14, x = far ? (k % 2 ? x0 + rng.range(0.4, 5) : x1 - rng.range(0.4, 5)) : x0 + rng.range(1, 2 * HX - 1);
    const z = far ? z0 + rng.range(0.3, 3) : (k % 2 ? z0 + rng.range(0.2, 0.9) : z1 - rng.range(0.2, 0.9));
    if (Math.abs(x - cx) < GATE + 2 && z > cz) continue;
    ball(w, x, rng.range(0.1, 0.5), z, rng.range(0.5, 1.3), O, FLESH, 1.0, rng.float(), 0.7);
  }
  // Lamps the works left burning, and what the brood lights.
  for (const [dx, dz, col, k] of [[-20, -HZ + 1, [1.0, 0.45, 0.25], 1.6], [20, -HZ + 1, [1.0, 0.45, 0.25], 1.6], [0, -HZ + 1, GLOW, 1.8], [-12, HZ - 1, [1.0, 0.45, 0.25], 1.3], [12, HZ - 1, [1.0, 0.45, 0.25], 1.3], [-27, 0, GLOW, 1.4], [27, 0, GLOW, 1.2]]) {
    ball(w, cx + dx, 5.4, cz + dz, 0.22, E, col, 6);
    light(w, cx + dx - Math.sign(dx) * 1.5, 5, cz + dz - Math.sign(dz) * 2.5, col, 24, k);
  }

  // ---- outside the gate: a lamp each side, the workers' shrine, and drums left in the yard
  for (const dx of [-GATE - 1.2, GATE + 1.2]) { cyl(w, cx + dx, 0, 4.2, z1 + 1.6, 0.07, P, STEEL, 0, SUB.METAL); ball(w, cx + dx, 4.4, z1 + 1.6, 0.2, E, [1.0, 0.55, 0.2], 6); w.fillRect(cx + dx - 0.4, z1 + 1.2, cx + dx + 0.4, z1 + 2, 2); }
  light(w, cx, 4, z1 + 2.5, [1.0, 0.55, 0.25], 16, 1.6);
  const sx = cx - GATE - 3.6, sz = z1 + 2.2;
  box(w, sx, 0.45, sz, 1.2, 0.9, 0.8, P, [0.24, 0.2, 0.18], 0, SUB.WALL); box(w, sx, 1.2, sz - 0.2, 1.0, 0.7, 0.3, P, [0.3, 0.1, 0.08], 0, SUB.TIMBER);
  primR(w, SHAPE.WEDGE, sx, 1.75, sz - 0.2, 1.3, 0.4, 0.7, P, [0.26, 0.09, 0.07], 0, SUB.ROOFTILE);
  for (const dx of [-0.35, 0, 0.35]) ball(w, sx + dx, 0.98, sz + 0.2, 0.05, E, [1.0, 0.7, 0.3], 5, rng.float());
  w.fillRect(sx - 0.7, sz - 0.6, sx + 0.7, sz + 0.5, 2);
  for (const [dx, yaw] of [[GATE + 5.5, 0.3], [GATE + 9, -0.2]]) {
    const x = cx + dx, z = z1 + 2.6;
    primR(w, SHAPE.CYL, x, 1.0, z, 2.0, 1.3, 2.0, P, RUST, 0, SUB.TIMBER, 0, 0, 0, yaw, HALF);
    primR(w, SHAPE.CYL, x, 1.0, z, 1.3, 1.1, 1.3, P, [0.1, 0.1, 0.11], 0, SUB.RUBBER, 0, 0, 0, yaw, HALF);
    w.fillRect(x - 1, z - 1, x + 1, z + 1, 2);
  }

  // Where she comes down from the web: six marks on the open floor, clear of every stand.
  const landings = [[-16, -4], [16, -4], [-16, 5], [16, 5], [0, -8], [0, 7]].map(([dx, dz]) => ({ x: cx + dx, z: cz + dz }));
  const arena = { x: cx, z: cz, r: HZ, hx: HX, hz: HZ, pillars: stands, landings, gate: { x: cx, z: z1, w: GATE }, railY: RAIL_Y };
  K.addPoi(w, 'boss', cx, z1 - 4.5, { name: 'Matron of Hollows', r: 4 });
  return arena;
}
