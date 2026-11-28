// The Command Hub as a place (docs 16 and 19): the civil-defence shelter the operator works
// out of between raids. One hall, 44 m by 30 m, walked in the same views as a raid. Six
// staffed stations stand along its walls and the deployment lift waits in an alcove in the
// north wall. Talking to a member of staff opens that station's panel; nothing in the hall
// is fought, searched or timed. Pure data, like the generator.

import { MAT, SHAPE, SUB, SURF, prim, primR, box, boxMM, cyl, ball, light } from './emit.js';

const P = MAT.PLAIN, E = MAT.EMISSIVE, HALF = Math.PI / 2;
const CONC = [0.17, 0.19, 0.21], DARK = [0.08, 0.09, 0.11], STEEL = [0.24, 0.26, 0.29], PANEL = [0.12, 0.14, 0.17], TOP = [0.2, 0.22, 0.25];
const HAZ = [0.78, 0.52, 0.06], WHITE = [0.85, 0.92, 1.0];

export const HUB = { X0: 28, X1: 72, Z0: 36, Z1: 66, GATE: { x: 50, z: 31.5, r: 3.2 } };

// Who stands where. `look` picks the figure's build, hair and cut of coat from the same
// tables the street uses; `uniform` is the coat's colour, so staff read as staff.
export const STATIONS = {
  liaison: { name: 'Relay', role: 'Liaison', col: [0.35, 0.85, 1.0], look: 8, uniform: [0.16, 0.32, 0.4] },
  dispatch: { name: 'Threat Console', role: 'Dispatcher', col: [1.0, 0.76, 0.24], look: 5, uniform: [0.12, 0.16, 0.3] },
  armory: { name: 'Armory', role: 'Armorer', col: [1.0, 0.55, 0.2], look: 11, uniform: [0.34, 0.2, 0.1] },
  lab: { name: 'Containment Lab', role: 'Lab technician', col: [0.5, 1.0, 0.6], look: 1, uniform: [0.8, 0.85, 0.85] },
  quartermaster: { name: 'Quartermaster', role: 'Quartermaster', col: [0.8, 0.86, 0.4], look: 31, uniform: [0.26, 0.3, 0.16] },
  barracks: { name: 'Barracks', role: 'Instructor', col: [1.0, 0.38, 0.42], look: 23, uniform: [0.38, 0.1, 0.1] },
};
export const STATION_IDS = Object.keys(STATIONS);

// A counter between a member of staff and the operator: a plinth, a lighter top and a lit
// edge in the station's colour on the operator's side. (ux, uz) points from staff to operator.
function counter(w, x, z, ux, uz, len, col) {
  const along = ux ? [0.8, len] : [len, 0.8], [sx, sz] = along;
  box(w, x, 0.5, z, sx, 1.0, sz, P, PANEL, 0, SUB.METAL);
  box(w, x, 1.04, z, sx + 0.16, 0.08, sz + 0.16, P, TOP, 0, SUB.METAL);
  box(w, x + ux * (sx / 2 + 0.02), 0.82, z + uz * (sz / 2 + 0.02), ux ? 0.03 : len - 0.3, 0.05, uz ? 0.03 : len - 0.3, E, col, 3.2);
  box(w, x + ux * (sx / 2 + 0.02), 0.3, z + uz * (sz / 2 + 0.02), ux ? 0.03 : len - 0.3, 0.3, uz ? 0.03 : len - 0.3, P, DARK, 0, SUB.BARS);
  w.fillRect(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, 2);
}
// A header plate on the wall behind a station's staff: a dark panel between two lit rules in
// the station's colour, with a row of status lamps. It carries no lettering; the name is
// drawn over the figure by the interface, in whatever language is set.
function board(w, x, z, ux, uz, col, width = 5) {
  const t = 0.1, sx = ux ? t : width, sz = uz ? t : width;
  box(w, x, 3.7, z, sx, 0.8, sz, P, DARK, 0, SUB.METAL);
  for (const y of [3.24, 4.16]) box(w, x + ux * 0.03, y, z + uz * 0.03, ux ? t : width, 0.06, uz ? t : width, E, col, 4);
  for (let k = 0; k < 5; k++) {
    const o = (k - 2) * 0.42;
    box(w, x + ux * 0.07 + (uz ? o : 0), 3.7, z + uz * 0.07 + (ux ? o : 0), ux ? 0.03 : 0.26, 0.26, uz ? 0.03 : 0.26, E, col, k === 2 ? 5 : 1.6);
  }
}
function crate(w, x, y, z, sx, sy, sz, col, yaw = 0) {
  box(w, x, y + sy / 2, z, sx, sy, sz, MAT.FREIGHT, col, 0, 0, 0, 0, 0, yaw);
  box(w, x, y + sy - 0.03, z, sx + 0.04, 0.05, sz + 0.04, P, DARK, 0, SUB.METAL, 0, 0, 0, yaw);
}
// A small insurance drone parked on a pad: body, four arms and rotors, a lamp.
function drone(w, x, y, z, col, yaw) {
  cyl(w, x, y, y + 0.06, z, 0.55, P, DARK, 0, SUB.RUBBER);
  box(w, x, y + 0.3, z, 0.5, 0.2, 0.34, P, STEEL, 0, SUB.METAL, 0, 0, 0, yaw);
  for (let k = 0; k < 4; k++) {
    const a = yaw + HALF / 2 + k * HALF, rx = x + Math.cos(a) * 0.42, rz = z + Math.sin(a) * 0.42;
    primR(w, SHAPE.BOX, (x + rx) / 2, y + 0.32, (z + rz) / 2, 0.42, 0.04, 0.05, P, DARK, 0, SUB.METAL, 0, 0, 0, -a);
    cyl(w, rx, y + 0.34, y + 0.37, rz, 0.2, P, [0.05, 0.05, 0.06], 0, SUB.RUBBER);
  }
  ball(w, x, y + 0.2, z, 0.06, E, col, 5);
}

export function buildHub(w, rng, K) {
  const { X0, X1, Z0, Z1, GATE } = HUB, cx = (X0 + X1) / 2;
  w.hub = true;
  w.fillRect(0, 0, w.size, w.size, 1);
  w.fillRect(X0, Z0, X1, Z1, 0);
  w.fillRect(GATE.x - 5, Z0 - 9, GATE.x + 5, Z0, 0);         // the lift alcove
  w.surface.fill(SURF.FLOOR);
  const wall = (x0, z0, x1, z1, h = 5.5, col = CONC) => { w.fillRect(x0, z0, x1, z1, 1); boxMM(w, x0, z0, x1, z1, 0, h, P, col, 0, SUB.WALL); };
  wall(X0 - 1.5, Z0 - 1.5, GATE.x - 5, Z0); wall(GATE.x + 5, Z0 - 1.5, X1 + 1.5, Z0);
  wall(X0 - 1.5, Z1, X1 + 1.5, Z1 + 1.5); wall(X0 - 1.5, Z0, X0, Z1); wall(X1, Z0, X1 + 1.5, Z1);
  wall(GATE.x - 6.5, Z0 - 10.5, GATE.x - 5, Z0 - 1.5); wall(GATE.x + 5, Z0 - 10.5, GATE.x + 6.5, Z0 - 1.5);
  wall(GATE.x - 5, Z0 - 10.5, GATE.x + 5, Z0 - 9, 6.5, [0.13, 0.15, 0.17]);
  // A dado rail and a light strip round the hall, so the walls are not bare slabs.
  for (const [x0, z0, x1, z1] of [[X0, Z0 + 0.02, GATE.x - 5, Z0 + 0.1], [GATE.x + 5, Z0 + 0.02, X1, Z0 + 0.1], [X0 + 0.02, Z0, X0 + 0.1, Z1], [X1 - 0.1, Z0, X1 - 0.02, Z1]]) {
    boxMM(w, x0, z0, x1, z1, 1.25, 1.4, P, STEEL, 0, SUB.METAL);
    boxMM(w, x0, z0, x1, z1, 4.6, 4.72, E, [0.5, 0.8, 0.95], 2.2);
  }
  // Four columns carry the roof and break the floor into bays.
  for (const [x, z] of [[40, 47], [60, 47], [40, 58], [60, 58]]) {
    w.fillRect(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 1);
    boxMM(w, x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0, 5.5, P, [0.2, 0.22, 0.24], 0, SUB.WALL);
    boxMM(w, x - 0.66, z - 0.66, x + 0.66, z + 0.66, 0, 1.1, P, HAZ, 0, SUB.HAZARD);
    box(w, x, 2.6, z + 0.62, 0.5, 0.08, 0.03, E, WHITE, 3);
  }
  // Roof lamps over the bays.
  for (let x = X0 + 6; x < X1; x += 8) for (const z of [43, 52, 61]) {
    box(w, x, 5.4, z, 2.4, 0.12, 0.5, E, WHITE, 5);
    light(w, x, 5, z, [0.72, 0.85, 1.0], 15, 0.8);
  }
  // Floor paint: a walkway from the south door to the lift, and a ring in the middle bay.
  for (const dx of [-2.4, 2.4]) boxMM(w, cx + dx - 0.06, Z0 - 6, cx + dx + 0.06, Z1 - 1, 0.005, 0.02, P, HAZ, 0, SUB.HAZARD);
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * 6.283;
    primR(w, SHAPE.BOX, cx + Math.cos(a) * 5.2, 0.012, 52 + Math.sin(a) * 5.2, 0.7, 0.02, 0.1, P, [0.3, 0.5, 0.58], 0, SUB.METAL, 0, 0, 0, -a + HALF);
  }
  box(w, cx, 0.012, 52, 2.2, 0.02, 0.12, E, [0.3, 0.9, 0.85], 1.2); box(w, cx, 0.012, 52, 0.12, 0.02, 2.2, E, [0.3, 0.9, 0.85], 1.2);

  const stations = [];
  // (sx, sz): where staff stand; (ux, uz): from staff toward the operator.
  const station = (id, sx, sz, ux, uz, len = 4.4) => {
    const S = STATIONS[id];
    counter(w, sx + ux * 1.3, sz + uz * 1.3, ux, uz, len, S.col);
    board(w, ux > 0 ? X0 + 0.1 : ux < 0 ? X1 - 0.1 : sx, uz > 0 ? Z0 + 0.1 : sz, ux, uz, S.col);
    light(w, sx + ux * 1.6, 3.2, sz + uz * 1.6, S.col, 9, 1.1);
    const poi = K.addPoi(w, 'station', sx + ux * 2.75, sz + uz * 2.75, { station: id, name: S.name, role: S.role, nx: sx, nz: sz, face: Math.atan2(uz, ux), look: S.look, uniform: S.uniform, col: S.col });
    stations.push(poi);
    return poi;
  };

  // ---- Relay, the liaison: a comms desk under a wall of screens (north wall, west of the lift)
  station('liaison', 37, 37.6, 0, 1);
  for (let k = 0; k < 3; k++) box(w, 35.2 + k * 1.8, 2.3 + (k === 1 ? 0.25 : 0), Z0 + 0.14, 1.5, 0.95, 0.06, MAT.HOLO, [0.3, 0.8, 1.0], 2.2, rng.float());
  box(w, 35.6, 1.3, 38.9, 0.5, 0.36, 0.3, MAT.HOLO, [0.3, 0.8, 1.0], 2.4, rng.float(), 0, 0, 0, 0.3);
  cyl(w, 39.6, 0, 3.4, 36.6, 0.06, P, STEEL, 0, SUB.METAL); w.fillRect(39.2, 36.2, 40, 37, 2);
  primR(w, SHAPE.CONE, 39.6, 3.5, 36.7, 0.9, 0.3, 0.9, P, [0.6, 0.62, 0.66], 0, SUB.METAL, 0, 0, 0, 0, -0.9);
  ball(w, 39.6, 3.9, 36.6, 0.07, E, [1, 0.25, 0.2], 5);

  // ---- Threat Console, the dispatcher: a holo table of the sector (north wall, east of the lift)
  station('dispatch', 63, 37.6, 0, 1);
  box(w, 63, 1.12, 38.9, 3.2, 0.03, 0.62, MAT.HOLO, [1.0, 0.72, 0.25], 2.0, rng.float());
  for (let k = 0; k < 3; k++) box(w, 62 + k, 1.2 + 0.16 * (k + 1), 38.9, 0.34, 0.32 * (k + 1), 0.34, MAT.HOLO, [[0.3, 0.95, 0.5], [1.0, 0.88, 0.25], [1.0, 0.24, 0.3]][k], 2.6, rng.float());
  box(w, 63, 2.4, Z0 + 0.14, 4.6, 1.5, 0.06, MAT.HOLO, [1.0, 0.7, 0.25], 1.6, rng.float());
  for (let k = 0; k < 4; k++) box(w, 61.2 + k * 1.2, 2.4, Z0 + 0.19, 0.04, 1.3, 0.02, E, [1, 0.8, 0.4], 1.5);

  // ---- Armory: a bench and a wall of racks (west wall)
  station('armory', 30.2, 46, 1, 0);
  boxMM(w, X0 + 0.1, 42.6, X0 + 0.26, 49.4, 0.9, 3.0, P, [0.1, 0.11, 0.13], 0, SUB.BARS);
  for (let k = 0; k < 5; k++) {
    const y = 1.2 + k * 0.38, z = 43.4 + (k % 2) * 0.5, len = 1.5 + (k % 3) * 0.35;
    box(w, X0 + 0.36, y, z + 2.6, 0.07, 0.09, len, P, [0.07, 0.07, 0.08], 0, SUB.METAL);
    box(w, X0 + 0.36, y - 0.09, z + 2.6 - len * 0.32, 0.06, 0.2, 0.3, P, [0.16, 0.11, 0.07], 0, SUB.TIMBER);
    box(w, X0 + 0.36, y + 0.07, z + 2.6 + len * 0.1, 0.05, 0.06, 0.34, P, [0.05, 0.05, 0.06], 0, SUB.METAL);
  }
  box(w, 31.5, 1.13, 45.2, 0.16, 0.1, 1.5, P, [0.07, 0.07, 0.08], 0, SUB.METAL);          // a rifle stripped on the bench
  box(w, 31.45, 1.18, 47.2, 0.42, 0.2, 0.3, P, [0.5, 0.12, 0.1], 0, SUB.METAL);           // a vice
  cyl(w, 31.6, 1.08, 1.5, 44.2, 0.05, P, STEEL, 0, SUB.METAL); ball(w, 31.6, 1.56, 44.2, 0.1, E, [1, 0.8, 0.5], 4);
  crate(w, 29.2, 0, 42.2, 1.3, 0.7, 0.8, [0.13, 0.16, 0.13]); crate(w, 29.2, 0.7, 42.2, 1.0, 0.5, 0.7, [0.3, 0.2, 0.08]);
  w.fillRect(28.4, 41.7, 30, 42.8, 2);

  // ---- Containment Lab: three sealed tanks and an analysis bench (west wall)
  station('lab', 30.2, 58, 1, 0);
  for (let k = 0; k < 3; k++) {
    const z = 55.2 + k * 1.5 + (k === 2 ? 2.6 : 0), x = X0 + 0.95;
    cyl(w, x, 0, 0.45, z, 0.62, P, STEEL, 0, SUB.METAL); cyl(w, x, 2.5, 2.75, z, 0.62, P, STEEL, 0, SUB.METAL);
    cyl(w, x, 0.45, 2.5, z, 0.55, MAT.HOLO, [0.4, 1.0, 0.6], 0.9, rng.float());
    prim(w, SHAPE.SPHERE, x, 1.35 + (k % 2) * 0.2, z, 0.5, 0.9, 0.5, MAT.ORGANIC, [0.25, 0.5, 0.2], 0.5, rng.float());
    box(w, x + 0.62, 0.9, z, 0.04, 0.12, 0.3, E, k === 1 ? [1, 0.75, 0.2] : [0.4, 1, 0.6], 3);
    w.fillRect(x - 0.7, z - 0.7, x + 0.7, z + 0.7, 2);
  }
  light(w, 30, 2.2, 57.5, [0.4, 1.0, 0.6], 8, 1.2);
  for (let k = 0; k < 4; k++) cyl(w, 31.5, 1.08, 1.3 + (k % 2) * 0.08, 56.6 + k * 0.32, 0.06, MAT.HOLO, [0.5, 1, 0.7], 1.8);
  box(w, 31.45, 1.3, 59.2, 0.36, 0.44, 0.5, P, [0.75, 0.78, 0.8], 0, SUB.METAL);
  box(w, 31.66, 1.36, 59.2, 0.02, 0.24, 0.36, MAT.HOLO, [0.5, 1, 0.7], 2.4, rng.float());

  // ---- Quartermaster: shelves of crates and the drone pads (east wall)
  station('quartermaster', 69.8, 46, -1, 0);
  for (let k = 0; k < 3; k++) boxMM(w, X1 - 1.1, 42.6, X1 - 0.1, 49.4, 0.9 + k * 1.0, 0.98 + k * 1.0, P, STEEL, 0, SUB.METAL);
  for (const z of [42.6, 46, 49.4]) cyl(w, X1 - 1.05, 0, 3.1, z, 0.05, P, STEEL, 0, SUB.METAL);
  const crateCols = [[0.14, 0.2, 0.26], [0.3, 0.2, 0.08], [0.13, 0.17, 0.13], [0.26, 0.1, 0.08]];
  for (let k = 0; k < 3; k++) for (let j = 0; j < 5; j++) {
    if ((k * 5 + j) % 4 === 3) continue;
    crate(w, X1 - 0.6, 0.98 + k * 1.0, 43.3 + j * 1.35, 0.8, 0.5 + ((j + k) % 3) * 0.12, 1.0, crateCols[(j + k * 2) % 4]);
  }
  crate(w, 68.6, 0, 50.6, 1.4, 0.9, 1.0, crateCols[0], 0.2); crate(w, 68.7, 0.9, 50.6, 0.9, 0.6, 0.8, crateCols[1], -0.15); w.fillRect(67.8, 50, 69.4, 51.2, 2);
  drone(w, 67.6, 0, 41.4, [0.3, 0.9, 1.0], 0.4); drone(w, 69.6, 0, 41.2, [1.0, 0.75, 0.25], 1.1);
  box(w, 68.5, 1.2, 46.9, 0.4, 0.24, 0.5, P, [0.62, 0.64, 0.66], 0, SUB.METAL);          // scales
  box(w, 68.5, 1.34, 46.9, 0.5, 0.03, 0.6, P, STEEL, 0, SUB.METAL);

  // ---- Barracks: bunks, lockers and a practice post (east wall)
  station('barracks', 69.8, 58, -1, 0);
  for (const z of [54.6, 61.6]) {
    for (const y of [0.45, 1.75]) { box(w, X1 - 1.05, y, z, 1.9, 0.14, 0.95, P, [0.24, 0.27, 0.24], 0, SUB.FABRIC); box(w, X1 - 1.8, y + 0.12, z, 0.36, 0.1, 0.6, P, [0.6, 0.62, 0.6], 0, SUB.FABRIC); }
    for (const [dx, dz] of [[-1.95, -0.45], [-1.95, 0.45], [-0.15, -0.45], [-0.15, 0.45]]) cyl(w, X1 + dx, 0, 2.3, z + dz, 0.035, P, STEEL, 0, SUB.METAL);
    w.fillRect(X1 - 2.05, z - 0.55, X1, z + 0.55, 2);
  }
  for (let k = 0; k < 4; k++) { boxMM(w, X1 - 0.75, 63 + k * 0.62, X1 - 0.1, 63.56 + k * 0.62, 0, 2.0, P, [0.16, 0.22, 0.28], 0, SUB.METAL); box(w, X1 - 0.77, 1.5, 63.28 + k * 0.62, 0.02, 0.1, 0.26, E, [0.4, 0.8, 1], 1.4); }
  w.fillRect(X1 - 0.8, 63, X1, 65.5, 1);
  cyl(w, 66, 0, 1.0, 62.6, 0.07, P, STEEL, 0, SUB.METAL);                                     // the practice post
  prim(w, SHAPE.CAPSULE, 66, 1.35, 62.6, 0.5, 0.9, 0.34, P, [0.5, 0.42, 0.3], 0, SUB.FABRIC); ball(w, 66, 1.98, 62.6, 0.17, P, [0.5, 0.42, 0.3], 0, SUB.FABRIC);
  cyl(w, 66, 1.3, 1.34, 62.42, 0.2, E, [1, 0.3, 0.3], 1.2);
  w.fillRect(65.6, 62.2, 66.4, 63, 2);

  // ---- the deployment lift: a platform in the alcove, a blast door behind it
  const gx = GATE.x, gz = GATE.z;
  boxMM(w, gx - 3.4, gz - 3.4, gx + 3.4, gz + 3.4, 0, 0.06, P, [0.2, 0.22, 0.25], 0, SUB.METAL);
  for (const [a, b, c, d] of [[-3.4, -3.4, 3.4, -3.1], [-3.4, 3.1, 3.4, 3.4], [-3.4, -3.4, -3.1, 3.4], [3.1, -3.4, 3.4, 3.4]]) boxMM(w, gx + a, gz + b, gx + c, gz + d, 0.06, 0.075, P, HAZ, 0, SUB.HAZARD);
  boxMM(w, gx - 4.2, Z0 - 8.98, gx + 4.2, Z0 - 8.8, 0, 5.2, P, [0.18, 0.2, 0.23], 0, SUB.CORRUGATED);
  for (let k = 0; k < 5; k++) boxMM(w, gx - 4.2, Z0 - 8.82, gx + 4.2, Z0 - 8.76, 0.5 + k * 1.05, 0.62 + k * 1.05, P, DARK, 0, SUB.METAL);
  boxMM(w, gx - 0.05, Z0 - 8.8, gx + 0.05, Z0 - 8.74, 0, 5.2, E, [0.2, 1.0, 0.45], 1.6);
  box(w, gx, 5.7, Z0 - 8.7, 7.4, 0.8, 0.14, P, DARK, 0, SUB.METAL);
  for (let k = 0; k < 7; k++) primR(w, SHAPE.BOX, gx - 3 + k, 5.7, Z0 - 8.6, 0.5, 0.12, 0.04, E, [0.2, 1.0, 0.45], 3.4, 0, 0, 0, 0, 0, 0, k % 2 ? 0.7 : -0.7);
  for (const dx of [-4.5, 4.5]) { cyl(w, gx + dx, 0, 3.2, Z0 - 0.6, 0.09, P, HAZ, 0, SUB.HAZARD); ball(w, gx + dx, 3.35, Z0 - 0.6, 0.14, E, [0.2, 1.0, 0.45], 5); w.fillRect(gx + dx - 0.4, Z0 - 1, gx + dx + 0.4, Z0 - 0.2, 2); }
  light(w, gx, 4, gz, [0.3, 1.0, 0.5], 12, 1.3);
  const gate = K.addPoi(w, 'deploy', gx, gz, { name: 'Deployment Lift', r: GATE.r });

  // ---- the south door (shut: the way to the surface is the lift) and the hall's loose kit
  boxMM(w, cx - 2.2, Z1 - 0.12, cx + 2.2, Z1 - 0.02, 0, 3.4, P, [0.15, 0.17, 0.2], 0, SUB.CORRUGATED);
  box(w, cx, 3.75, Z1 - 0.1, 4.6, 0.5, 0.1, P, DARK, 0, SUB.METAL); box(w, cx, 3.75, Z1 - 0.17, 3.8, 0.08, 0.03, E, [1.0, 0.3, 0.25], 3);
  for (const [x, z, yaw] of [[34, 64.4, 0], [36.6, 64.5, 0.1], [45, 64.6, 0], [55.4, 64.5, -0.1]]) { crate(w, x, 0, z, 1.5, 0.8, 1.0, crateCols[(x | 0) % 4], yaw); w.fillRect(x - 0.8, z - 0.55, x + 0.8, z + 0.55, 2); }
  for (const x of [42.2, 57.8]) {           // benches against the south wall
    box(w, x, 0.45, Z1 - 0.6, 2.6, 0.08, 0.5, P, [0.2, 0.14, 0.08], 0, SUB.TIMBER);
    for (const dx of [-1.1, 1.1]) box(w, x + dx, 0.22, Z1 - 0.6, 0.08, 0.44, 0.44, P, STEEL, 0, SUB.METAL);
    w.fillRect(x - 1.3, Z1 - 0.9, x + 1.3, Z1, 2);
  }
  // Staff who are only there to be there: a guard at the lift, a hand at the crates.
  const staff = [
    { id: 901, x: gx + 4.2, z: Z0 + 1.4, face: HALF, look: 35, uniform: [0.14, 0.17, 0.2] },
    { id: 902, x: 36, z: 62.9, face: -HALF * 0.6, look: 22, uniform: [0.3, 0.26, 0.12] },
  ];
  w.insertion = { x: cx, z: Z1 - 8 };
  w.hubData = { stations, gate, staff };
  return w;
}
