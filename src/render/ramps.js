// Smooth ramps (doc 64 Package 8) for the renderer. The generator builds a ramp as a block
// per tread row, one floor unit (0.25 m) apart, so it reads as a flight of shallow steps.
// Bodies are already drawn eased across ramp cells, passing each cell centre at that cell's
// floor height; here the treads are lowered half a unit in the copy sent to the GPU and a
// thin slab per ramp cell is laid over them, sloping one unit per metre and passing through
// the same centre heights, so the surface is a ramp and the feet stay on it.
// Render-side only: the world's own data is never changed.

import { INST_FLOATS, MAT, SUB, NO_CUT } from '../sim/emit.js';
import { HMARK, FLOOR_UNIT } from '../sim/height.js';

const TREAD_MAT = MAT.PLAIN + NO_CUT + 16;
const U = FLOOR_UNIT, THICK = 0.12, SLOPE = Math.atan(U);

const isRamp = (w, x, z) => x >= 0 && z >= 0 && x < w.size && z < w.size && w.hmark && w.hmark[z * w.size + x] === HMARK.RAMP;

// A copy of the static box data with the top of every ramp tread, and of the stone nosing
// along its foot, lowered by half a unit: any ground box on a ramp cell that ends at that
// cell's floor.
export function lowerRampTreads(w, data) {
  if (!w.hasHeight || !w.hmark) return data;
  let out = null;
  for (let o = 0; o < data.length; o += INST_FLOATS) {
    if (Math.round(data[o + 3]) !== TREAD_MAT) continue;
    const x = Math.floor(data[o]), z = Math.floor(data[o + 2]);
    if (!isRamp(w, x, z) || Math.abs(data[o + 1] + data[o + 5] / 2 - w.fl(x, z) * U) > 0.01) continue;
    out = out || data.slice();
    const sy = Math.max(0.01, out[o + 5] - U / 2);
    out[o + 1] -= (out[o + 5] - sy) / 2;
    out[o + 5] = sy;
  }
  return out || data;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Which way a ramp cell rises: toward a ramp neighbour one unit up, else toward any neighbour
// one unit up with the one behind one unit down. A side neighbour that happens to sit a unit
// higher (a kerb at the top corner) loses to the run itself.
function rampDir(w, x, z) {
  const u = w.fl(x, z);
  let best = null, score = 0;
  for (const [ax, az] of DIRS) {
    const up = w.fl(x + ax, z + az) === u + 1, k = (up && isRamp(w, x + ax, z + az) ? 2 : 0) + (up ? 1 : 0) + (w.fl(x - ax, z - az) === u - 1 ? 1 : 0);
    if (k > score && (up || w.fl(x - ax, z - az) === u - 1)) { score = k; best = [ax, az]; }
  }
  return best;
}

const cache = new WeakMap();
// One slab per ramp: [x, y, z, quaternion, width, length]. A run is a line of ramp cells, each
// one unit above the last, and runs side by side with the same start and length merge, so the
// whole ramp is one surface with no seam to catch the light. Its top passes through each
// cell's floor height at the cell centre, which is where bodies are drawn.
export function rampSlabs(w) {
  if (cache.has(w)) return cache.get(w);
  const out = [];
  if (w.hasHeight && w.hmark) {
    const S = w.size, dirs = new Map();
    const dirAt = (x, z) => { const i = z * S + x; if (!dirs.has(i)) dirs.set(i, isRamp(w, x, z) ? rampDir(w, x, z) : null); return dirs.get(i); };
    const same = (x, z, d, u) => { const e = dirAt(x, z); return e && e[0] === d[0] && e[1] === d[1] && w.fl(x, z) === u; };
    const runs = new Map();
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const d = dirAt(x, z);
      if (!d) continue;
      const u = w.fl(x, z);
      if (same(x - d[0], z - d[1], d, u - 1)) continue;          // not the foot of its run
      let n = 1;
      while (same(x + d[0] * n, z + d[1] * n, d, u + n)) n++;
      runs.set(z * S + x, { x, z, d, u, n, wide: 1 });
    }
    // Merge side by side: the side axis is across the slope.
    for (const r of [...runs.values()].sort((a, b) => a.z - b.z || a.x - b.x)) {
      if (!runs.has(r.z * S + r.x)) continue;
      const sx = Math.abs(r.d[1]), sz = Math.abs(r.d[0]);
      for (;;) {
        const k = (r.z + sz * r.wide) * S + r.x + sx * r.wide, o = runs.get(k);
        if (!o || o.d[0] !== r.d[0] || o.d[1] !== r.d[1] || o.u !== r.u || o.n !== r.n) break;
        runs.delete(k); r.wide++;
      }
    }
    const c = Math.cos(SLOPE), s = Math.sin(SLOPE);
    for (const r of runs.values()) {
      const [dx, dz] = r.d, sx = Math.abs(dz), sz = Math.abs(dx);
      // Basis: forward up the slope, up the surface normal, side completes it (side = up x forward).
      const F = [dx * c, s, dz * c], N = [-dx * s, c, -dz * s];
      const Sd = [N[1] * F[2] - N[2] * F[1], N[2] * F[0] - N[0] * F[2], N[0] * F[1] - N[1] * F[0]];
      const h = (r.n - 1) / 2, wd = (r.wide - 1) / 2;
      const cx = r.x + 0.5 + dx * h + sx * wd, cz = r.z + 0.5 + dz * h + sz * wd, cy = (r.u + h) * U;
      out.push([cx - N[0] * THICK / 2, cy - N[1] * THICK / 2, cz - N[2] * THICK / 2, quat(Sd, N, F), r.wide + 0.02, r.n / c + 0.02]);
    }
  }
  cache.set(w, out);
  return out;
}

// Quaternion of the rotation whose columns are the given axes.
function quat(S, U2, F) {
  const tr = S[0] + U2[1] + F[2];
  if (tr > 0) { const k = Math.sqrt(tr + 1) * 2; return [(U2[2] - F[1]) / k, (F[0] - S[2]) / k, (S[1] - U2[0]) / k, k / 4]; }
  if (S[0] > U2[1] && S[0] > F[2]) { const k = Math.sqrt(1 + S[0] - U2[1] - F[2]) * 2; return [k / 4, (U2[0] + S[1]) / k, (F[0] + S[2]) / k, (U2[2] - F[1]) / k]; }
  if (U2[1] > F[2]) { const k = Math.sqrt(1 + U2[1] - S[0] - F[2]) * 2; return [(U2[0] + S[1]) / k, k / 4, (F[1] + U2[2]) / k, (F[0] - S[2]) / k]; }
  const k = Math.sqrt(1 + F[2] - S[0] - U2[1]) * 2;
  return [(F[0] + S[2]) / k, (F[1] + U2[2]) / k, k / 4, (S[1] - U2[0]) / k];
}

export const RAMP_SLAB = { mat: TREAD_MAT, sub: SUB.APRON, col: [0.2, 0.195, 0.185], sy: THICK };
