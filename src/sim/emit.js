// Static instance emitters shared by the city generator and its dressing passes.
// Pure data: no DOM, no GPU.

export const INST_FLOATS = 20; // pos mat | scale emis | quat | colour _ | p0 p1 p2 p3
export const SHAPE = { BOX: 0, SPHERE: 1, CYL: 2, CAPSULE: 3, CONE: 4, WEDGE: 5 };
export const SHAPE_COUNT = 6;
export const MAT = { PLAIN: 0, FACADE: 1, EMISSIVE: 2, HOLO: 3, ORGANIC: 4, SIGN: 5, FOLIAGE: 6, GLOSS: 7, SHELL: 8, ENAMEL: 9, FREIGHT: 10 };
export const STYLE = { OLDTOWN: 0, NEON: 1, ARCOLOGY: 2, CORPORATE: 3, DOCK: 4 };
// Surface classes written to the 1 m surface map and read by the ground shader.
export const SURF = { LOT: 0, ROAD: 1, WALK: 2, ALLEY: 3, PLAZA: 4, FLOOR: 5, WATER: 6, XWALK_X: 7, XWALK_Z: 8, LANE_X: 9, LANE_Z: 10, GRASS: 11 };
// Sub-materials of MAT.PLAIN (instance parameter p0).
export const SUB = { WALL: 1, TILE: 2, CAP: 4, FABRIC: 5, METAL: 6, RUBBER: 9, CORRUGATED: 10, BARS: 11, ROOFTILE: 12, TIMBER: 13, HAZARD: 14, BARK: 15, QUAY: 16, APRON: 17, PLANTER: 18 };

// Every static instance carries the cut-away flag (+16 on the material id).
export function prim(w, shape, cx, cy, cz, sx, sy, sz, mat, col, emis = 0, p0 = 0, p1 = 0, p2 = 0, p3 = 0, yaw = 0) {
  const h = yaw * 0.5;
  w.build[shape][w.blockIndex(cx, cz)].push(cx, cy, cz, mat + 16, sx, sy, sz, emis, 0, Math.sin(h), 0, Math.cos(h), col[0], col[1], col[2], 1, p0, p1, p2, p3);
}
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
// As prim, with a full orientation: yaw about Y, then pitch about local X, then roll about local Z.
export function primR(w, shape, cx, cy, cz, sx, sy, sz, mat, col, emis = 0, p0 = 0, p1 = 0, p2 = 0, p3 = 0, yaw = 0, pitch = 0, roll = 0) {
  let q = [0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5)];
  if (pitch) q = qmul(q, [Math.sin(pitch * 0.5), 0, 0, Math.cos(pitch * 0.5)]);
  if (roll) q = qmul(q, [0, 0, Math.sin(roll * 0.5), Math.cos(roll * 0.5)]);
  w.build[shape][w.blockIndex(cx, cz)].push(cx, cy, cz, mat + 16, sx, sy, sz, emis, q[0], q[1], q[2], q[3], col[0], col[1], col[2], 1, p0, p1, p2, p3);
}
export const box = (w, cx, cy, cz, sx, sy, sz, mat, col, emis, p0, p1, p2, p3, yaw) => prim(w, SHAPE.BOX, cx, cy, cz, sx, sy, sz, mat, col, emis, p0, p1, p2, p3, yaw);
// Box from min/max corners on the ground plane and a vertical span.
export const boxMM = (w, x0, z0, x1, z1, y0, y1, mat, col, emis, p0, p1, p2, p3) => box(w, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, mat, col, emis, p0, p1, p2, p3);
export const cyl = (w, x, y0, y1, z, r, mat, col, emis = 0, p0 = 0) => prim(w, SHAPE.CYL, x, (y0 + y1) / 2, z, r * 2, y1 - y0, r * 2, mat, col, emis, p0);
export const ball = (w, x, y, z, r, mat, col, emis = 0, p0 = 0, sy = 1) => prim(w, SHAPE.SPHERE, x, y, z, r * 2, r * 2 * sy, r * 2, mat, col, emis, p0);
export function light(w, x, y, z, col, radius, intensity) {
  w.blocks[w.blockIndex(x, z)].lights.push([x, y, z, radius, col[0], col[1], col[2], intensity]);
}
