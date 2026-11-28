// Rain shelter map (doc 43: dry ground under awnings, canopies and the viaduct).
// Built once per world from the static instances, so it follows whatever the
// generator placed: awnings, stall canopies, balconies, eaves, the viaduct deck and
// the upper floors over an enterable shell. Pure data: no GPU, no DOM.
//
// Two bytes per texel: R is how sheltered the ground is (0 open, 1 under cover),
// G the height of the lowest cover above it in 0.1 m steps, so a wall is only dry
// below the awning that shelters it.

import { INST_FLOATS, MAT, SHAPE } from '../sim/emit.js';

export const COVER_RES = 2;        // texels per metre
export const COVER_MAX_Y = 25.5;   // heights are stored in 0.1 m steps
const MIN_Y = 1.9, MAX_Y = 24;     // an overhang starts above head height and below the skyline
const BARS = 11;                   // grated landings and railings let most rain through

// How much of the rain an overhang stops: grates and leaves less than a slab, and
// high covers less than low ones because the rain does not fall straight down. A whole
// upper storey (a tower over its lobby) stops all of it: its walls keep the slant out.
function stops(mat, sub, y0, area) {
  let k = 1;
  if (mat === MAT.FOLIAGE) k = 0.55;
  else if (mat === MAT.PLAIN && sub === BARS) k = 0.35;
  if (k === 1 && area > 200) return 1;
  const t = Math.min(1, Math.max(0, (y0 - 4) / 10));
  return k * (1 - 0.35 * t * t * (3 - 2 * t));
}

export function buildCover(world) {
  const S = world.size, R = COVER_RES, N = S * R;
  const amt = new Float32Array(N * N), low = new Float32Array(N * N).fill(COVER_MAX_Y);
  for (let shape = 0; shape < world.shapes.length; shape++) {
    const d = world.shapes[shape].data, round = shape === SHAPE.SPHERE || shape === SHAPE.CYL || shape === SHAPE.CAPSULE;
    for (let o = 0; o < d.length; o += INST_FLOATS) {
      const mat = Math.round(d[o + 3]) & 15;
      if (mat === MAT.EMISSIVE || mat === MAT.SIGN || mat === MAT.HOLO) continue;
      const sx = d[o + 4] / 2, sy = d[o + 5] / 2, sz = d[o + 6] / 2;
      const qx = d[o + 8], qy = d[o + 9], qz = d[o + 10], qw = d[o + 11];
      // Local axes of the instance in world space.
      const ax = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy)];
      const ay = [2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx)];
      const az = [2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)];
      const hx = Math.abs(ax[0]) * sx + Math.abs(ay[0]) * sy + Math.abs(az[0]) * sz;
      const hy = Math.abs(ax[1]) * sx + Math.abs(ay[1]) * sy + Math.abs(az[1]) * sz;
      const hz = Math.abs(ax[2]) * sx + Math.abs(ay[2]) * sy + Math.abs(az[2]) * sz;
      const cx = d[o], cy = d[o + 1], cz = d[o + 2], y0 = cy - hy;
      // Head height over the floor beneath it (doc 64 Package 8): an awning on a terrace or
      // down on the quay counts; the slabs and walls that make a level never do.
      const base = world.hasHeight ? world.floorAt(cx, cz) : 0;
      if (y0 - base < MIN_Y || y0 > MAX_Y || 4 * hx * hz < 0.6) continue;
      const k = stops(mat, d[o + 16], y0, 4 * hx * hz);
      if (k <= 0) continue;
      const x0 = Math.max(0, Math.floor((cx - hx) * R)), x1 = Math.min(N - 1, Math.floor((cx + hx) * R));
      const z0 = Math.max(0, Math.floor((cz - hz) * R)), z1 = Math.min(N - 1, Math.floor((cz + hz) * R));
      // Footprint in the instance's own frame: a rectangle, or an ellipse for round shapes.
      const ex = Math.hypot(ax[0], ax[2]) * sx, ez = Math.hypot(az[0], az[2]) * sz;
      for (let tz = z0; tz <= z1; tz++) {
        for (let tx = x0; tx <= x1; tx++) {
          const px = (tx + 0.5) / R - cx, pz = (tz + 0.5) / R - cz;
          const lx = (px * ax[0] + pz * ax[2]) / (Math.hypot(ax[0], ax[2]) || 1), lz = (px * az[0] + pz * az[2]) / (Math.hypot(az[0], az[2]) || 1);
          const u = ex > 1e-4 ? lx / ex : 0, v = ez > 1e-4 ? lz / ez : 0;
          if (round ? u * u + v * v > 1 : Math.abs(u) > 1 || Math.abs(v) > 1) continue;
          const i = tz * N + tx;
          if (k > amt[i]) amt[i] = k;
          if (y0 < low[i]) low[i] = Math.max(0, y0);
        }
      }
    }
  }
  // Soften the edge by one texel so the drip line is a band, not a step.
  const soft = new Float32Array(N * N);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      let s = 0, wsum = 0;
      for (let dz = -1; dz <= 1; dz++) {
        const zz = z + dz;
        if (zz < 0 || zz >= N) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= N) continue;
          const wgt = (2 - Math.abs(dx)) * (2 - Math.abs(dz));
          s += amt[zz * N + xx] * wgt; wsum += wgt;
        }
      }
      soft[z * N + x] = s / wsum;
    }
  }
  // Open texels next to a cover carry its height, so filtering at the edge keeps it.
  const out = new Uint8Array(N * N * 2);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      let h = amt[i] > 0 ? low[i] : COVER_MAX_Y;
      if (amt[i] === 0) {
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx >= 0 && zz >= 0 && xx < N && zz < N && amt[zz * N + xx] > 0) h = Math.min(h, low[zz * N + xx]);
        }
        if (h === COVER_MAX_Y) h = 0;
      }
      out[i * 2] = Math.round(Math.min(1, soft[i]) * 255);
      out[i * 2 + 1] = Math.round(Math.min(h, COVER_MAX_Y) / COVER_MAX_Y * 255);
    }
  }
  return { size: N, data: out };
}

// One map per world, shared by the renderer and the scene's rain splashes.
const built = new WeakMap();
export function coverOf(world) {
  let c = built.get(world);
  if (!c) built.set(world, c = buildCover(world));
  return c;
}

// CPU lookup with the same meaning as the shader's shelter(): used by tests and effects.
export function shelterAt(cover, x, z, y = 0) {
  const N = cover.size, tx = Math.floor(x * COVER_RES), tz = Math.floor(z * COVER_RES);
  if (tx < 0 || tz < 0 || tx >= N || tz >= N) return 0;
  const i = (tz * N + tx) * 2;
  return y <= cover.data[i + 1] / 255 * COVER_MAX_Y + 0.05 ? cover.data[i] / 255 : 0;
}
