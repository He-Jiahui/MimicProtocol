// Turns read-only simulation state into GPU instance data: camera, lights,
// rigged characters, props, additive sprites and render-side particles.
//
// Characters are posed on a small skeleton (pelvis, spine, two-bone limbs solved
// with IK) and skinned with tapered capsules, ellipsoids and plates. The frame
// they are built in can pitch and roll, which gives tumbles, flinches and falls.

import { mat4Perspective, mat4LookAt, mat4Mul, mat4Ortho, project, clamp, lerp, smoothstep, hash2 } from '../core/math.js';
import { SPRITE_FLOATS, MAX_SPRITES } from './gpu.js';
import { MAX_LIGHTS, MAX_BLOBS, GO } from './shaders.js';
import { INST_FLOATS, SHAPE, SHAPE_COUNT, MAT } from '../sim/world.js';
import { CLASSES, AFFIXES, RARITY, SCAN_RANGE, ENEMIES } from '../sim/data.js';
import { Impacts } from './impacts.js';

const CAP = [6000, 6000, 3000, 9000, 4000, 400]; // per-shape instance capacity
const COATS = [[0.2, 0.21, 0.25], [0.26, 0.17, 0.14], [0.14, 0.22, 0.25], [0.3, 0.27, 0.2], [0.11, 0.12, 0.18], [0.32, 0.12, 0.17], [0.16, 0.25, 0.18], [0.3, 0.3, 0.32], [0.08, 0.08, 0.09], [0.36, 0.3, 0.12], [0.42, 0.4, 0.36], [0.1, 0.16, 0.3]];
const SKIN = [[0.58, 0.42, 0.33], [0.4, 0.27, 0.2], [0.68, 0.54, 0.44], [0.3, 0.2, 0.15], [0.62, 0.47, 0.36]];
const HAIR = [[0.04, 0.035, 0.03], [0.1, 0.07, 0.04], [0.22, 0.2, 0.2], [0.3, 0.1, 0.08], [0.06, 0.05, 0.08]];
const MIMIC_COL = {
  walker: [0.75, 0.08, 0.4], mite: [0.9, 0.25, 0.5], spitter: [0.35, 0.8, 0.15], skitter: [0.7, 0.2, 0.8], brute: [0.8, 0.12, 0.2], hollow: [1.0, 0.45, 0.1],
  mote: [0.3, 0.85, 1.0], lobber: [0.95, 0.75, 0.15], titan: [1.0, 0.25, 0.1], matron: [0.85, 0.1, 0.45], cyst: [0.7, 0.9, 0.2], dummy: [0.3, 0.6, 0.8],
};
const SHELLED = new Set(['mite', 'skitter', 'brute', 'titan', 'matron']);
// Combat remnants and calls (doc 64, Package 2): never in a loot colour.
const ORDER_COL = [1, 0.72, 0.18], FRAGMENT_COL = [1, 0.35, 0.5];
const MAX_PARTICLES = 2200;
// Plain-material sub types (see the shader): fabric, armour, skin, hair, rubber.
const FAB = 5, ARM = 6, SKN = 7, HAR = 8, RUB = 9;
const O = MAT.ORGANIC, P = MAT.PLAIN, E = MAT.EMISSIVE;
const { BOX, SPHERE, CYL, CAPSULE, CONE, WEDGE } = SHAPE;

export class Scene {
  constructor(renderer) {
    this.r = renderer;
    this.dyn = CAP.map((n) => new Float32Array(n * INST_FLOATS));
    this.counts = new Array(SHAPE_COUNT).fill(0);
    this.xray = new Float32Array(400 * INST_FLOATS);
    this.nx = 0;
    this.sprites = new Float32Array(MAX_SPRITES * SPRITE_FLOATS);
    this.ns = 0;
    this.frame = { dyn: this.dyn, counts: this.counts, xray: this.xray, xrayCount: 0, sprites: this.sprites, spriteCount: 0, focusX: 0, focusZ: 0, reach: 9 };
    this.cam = {
      mode: 'top', blend: 0, yaw: 0, pitch: 0.18, dist: 36, free: null,
      ex: 0, ey: 30, ez: 0, tx: 0, ty: 0, tz: 0, fov: 0.63,
      view: new Float32Array(16), proj: new Float32Array(16), vp: new Float32Array(16),
      right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1], tanX: 1, tanY: 1, shake: 0,
    };
    this.lview = new Float32Array(16); this.lproj = new Float32Array(16); this.lvp = new Float32Array(16);
    this.time = 0;
    this.px = 0; this.pz = 0;
    const F = () => new Float32Array(MAX_PARTICLES);
    this.pool = { n: 0, x: F(), y: F(), z: F(), vx: F(), vy: F(), vz: F(), life: F(), max: F(), size: F(), r: F(), g: F(), b: F(), grav: F() };
    this.flashes = []; this.rings = []; this.beams = []; this.ghosts = []; this.ripples = [];
    this.fx = new Impacts(this);   // impacts by material, muzzle flashes, tracer ends
    this.hitPulse = 0; this.opts = { shake: 1, distort: true, dof: true, rain: 1 };
    this.lightScratch = [];
    this.extra = [];   // moving lights of the frame: train, drone searchlights
    this.tmp = [0, 0, 0];
    this.damageFlash = 0; this.healFlash = 0; this.recoil = 0; this.dodgeMax = 0.3;
    // Character frame: origin, basis (side, up, forward) and its quaternion.
    this.ox = 0; this.oy = 0; this.oz = 0; this.pivot = 0;
    this.S = [1, 0, 0]; this.U = [0, 1, 0]; this.Fw = [0, 0, 1]; this.q = [0, 0, 0, 1];
    this.w = [0, 0, 0]; this.j = [0, 0, 0]; this.tq = [0, 0, 0, 1];
    // Skeleton joints, reused between characters.
    const v = () => [0, 0, 0];
    this.J = { pel: v(), chest: v(), neck: v(), head: v(), sd: v(), sh: [v(), v()], el: [v(), v()], ha: [v(), v()], hip: [v(), v()], kn: [v(), v()], ft: [v(), v()], s: 1 };
  }

  // ---- instance writers ----
  emit(shape, x, y, z, sx, sy, sz, qx, qy, qz, qw, mat, col, emis = 0, p0 = 0, p1 = 0, p2 = 0, p3 = 0) {
    const n = this.counts[shape];
    if (n >= CAP[shape]) return;
    this.counts[shape] = n + 1;
    const d = this.dyn[shape], o = n * INST_FLOATS;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = mat;
    d[o + 4] = sx; d[o + 5] = sy; d[o + 6] = sz; d[o + 7] = emis;
    d[o + 8] = qx; d[o + 9] = qy; d[o + 10] = qz; d[o + 11] = qw;
    d[o + 12] = col[0]; d[o + 13] = col[1]; d[o + 14] = col[2]; d[o + 15] = 1;
    d[o + 16] = p0; d[o + 17] = p1; d[o + 18] = p2; d[o + 19] = p3;
  }
  // Axis-aligned or yawed world-space primitive.
  box(x, y, z, sx, sy, sz, yaw, mat, col, emis = 0, p0 = 0, shape = BOX) {
    const h = yaw * 0.5;
    this.emit(shape, x, y, z, sx, sy, sz, 0, Math.sin(h), 0, Math.cos(h), mat, col, emis, p0);
  }
  // World-space segment between two points. r2 gives a taper toward the far end.
  wseg(ax, ay, az, bx, by, bz, r, mat, col, emis = 0, p0 = 0, shape = CAPSULE, r2 = r) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz) || 1e-4;
    let qx = dz / l, qz = -dx / l, qw = 1 + dy / l;
    const ql = Math.hypot(qx, qz, qw);
    if (ql < 1e-5) { qx = 1; qz = 0; qw = 0; } else { qx /= ql; qz /= ql; qw /= ql; }
    const rm = Math.max(r, r2), k = shape === CAPSULE ? 4 : 2, taper = r !== r2;
    this.emit(shape, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, rm * k, shape === CAPSULE ? l + rm : l, rm * k, qx, 0, qz, qw, taper ? mat + 32 : mat, col, emis, p0, 0, r / rm, r2 / rm);
  }

  // Quaternion of a rotation matrix whose columns are the given axes. Writes this.tq.
  basisQ(sx, sy, sz, ux, uy, uz, fx, fy, fz) {
    const q = this.tq, tr = sx + uy + fz;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q[3] = s / 4; q[0] = (uz - fy) / s; q[1] = (fx - sz) / s; q[2] = (sy - ux) / s; }
    else if (sx > uy && sx > fz) { const s = Math.sqrt(1 + sx - uy - fz) * 2; q[3] = (uz - fy) / s; q[0] = s / 4; q[1] = (ux + sy) / s; q[2] = (fx + sz) / s; }
    else if (uy > fz) { const s = Math.sqrt(1 + uy - sx - fz) * 2; q[3] = (fx - sz) / s; q[0] = (ux + sy) / s; q[1] = s / 4; q[2] = (fy + uz) / s; }
    else { const s = Math.sqrt(1 + fz - sx - uy) * 2; q[3] = (sy - ux) / s; q[0] = (fx + sz) / s; q[1] = (fy + uz) / s; q[2] = s / 4; }
    return q;
  }

  // Character-local frame: x = side, y = up, z = forward. Pitch leans forward,
  // roll tips sideways, both about a pivot at `pivot` metres above the feet.
  begin(x, z, face, y = 0, pitch = 0, roll = 0, pivot = 0) {
    const cf = Math.cos(face), sf = Math.sin(face), S = this.S, U = this.U, F = this.Fw;
    S[0] = sf; S[1] = 0; S[2] = -cf; U[0] = 0; U[1] = 1; U[2] = 0; F[0] = cf; F[1] = 0; F[2] = sf;
    if (pitch) {
      const c = Math.cos(pitch), s = Math.sin(pitch);
      for (let k = 0; k < 3; k++) { const f = F[k], u = U[k]; F[k] = f * c - u * s; U[k] = u * c + f * s; }
    }
    if (roll) {
      const c = Math.cos(roll), s = Math.sin(roll);
      for (let k = 0; k < 3; k++) { const a = S[k], u = U[k]; S[k] = a * c + u * s; U[k] = u * c - a * s; }
    }
    this.ox = x; this.oy = y + pivot; this.oz = z; this.pivot = pivot;
    const q = this.basisQ(S[0], S[1], S[2], U[0], U[1], U[2], F[0], F[1], F[2]);
    this.q[0] = q[0]; this.q[1] = q[1]; this.q[2] = q[2]; this.q[3] = q[3];
  }
  // Local point to world. Writes this.w.
  L(x, y, z) {
    const S = this.S, U = this.U, F = this.Fw, w = this.w, yy = y - this.pivot;
    w[0] = this.ox + S[0] * x + U[0] * yy + F[0] * z;
    w[1] = this.oy + S[1] * x + U[1] * yy + F[1] * z;
    w[2] = this.oz + S[2] * x + U[2] * yy + F[2] * z;
    return w;
  }
  // Local segment: limbs, spikes, barrels. r2 tapers toward b.
  seg(ax, ay, az, bx, by, bz, r, mat, col, emis = 0, p0 = 0, shape = CAPSULE, r2 = r) {
    const a = this.L(ax, ay, az), x = a[0], y = a[1], z = a[2], b = this.L(bx, by, bz);
    this.wseg(x, y, z, b[0], b[1], b[2], r, mat, col, emis, p0, shape, r2);
  }
  vseg(a, b, r, mat, col, emis, p0, r2 = r, shape = CAPSULE) { this.seg(a[0], a[1], a[2], b[0], b[1], b[2], r, mat, col, emis, p0, shape, r2); }
  // Local shape aligned with the frame (sizes in metres).
  blob(x, y, z, sx, sy, sz, mat, col, emis = 0, p0 = 0, shape = SPHERE) {
    const w = this.L(x, y, z), q = this.q, k = shape === CAPSULE ? 2 : 1;
    this.emit(shape, w[0], w[1], w[2], sx * k, sy, sz * k, q[0], q[1], q[2], q[3], mat, col, emis, p0);
  }
  // Local shape whose Y axis points along (ux, uy, uz), with an optional taper.
  // Used for torsos, plates on limbs and anything that follows a bone.
  part(shape, x, y, z, sx, sy, sz, ux, uy, uz, mat, col, emis = 0, p0 = 0, tb = 1, tt = 1) {
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    // Side axis: the frame's side with the up component removed; forward completes it.
    let sxv = 1 - ux * ux, syv = -ux * uy, szv = -ux * uz;
    const sl = Math.hypot(sxv, syv, szv) || 1;
    sxv /= sl; syv /= sl; szv /= sl;
    const fxv = syv * uz - szv * uy, fyv = szv * ux - sxv * uz, fzv = sxv * uy - syv * ux;
    const S = this.S, U = this.U, F = this.Fw;
    const W = (vx, vy, vz, k) => S[k] * vx + U[k] * vy + F[k] * vz;
    const q = this.basisQ(W(sxv, syv, szv, 0), W(sxv, syv, szv, 1), W(sxv, syv, szv, 2), W(ux, uy, uz, 0), W(ux, uy, uz, 1), W(ux, uy, uz, 2), W(fxv, fyv, fzv, 0), W(fxv, fyv, fzv, 1), W(fxv, fyv, fzv, 2));
    const w = this.L(x, y, z), k = shape === CAPSULE ? 2 : 1, taper = tb !== 1 || tt !== 1;
    this.emit(shape, w[0], w[1], w[2], sx * k, sy, sz * k, q[0], q[1], q[2], q[3], taper ? mat + 32 : mat, col, emis, p0, 0, tb, tt);
  }

  // Two-bone IK in local space. Writes the middle joint to `out` and clamps the target.
  ik(root, tgt, l1, l2, kx, ky, kz, out) {
    let dx = tgt[0] - root[0], dy = tgt[1] - root[1], dz = tgt[2] - root[2], d = Math.hypot(dx, dy, dz) || 1e-4;
    const max = (l1 + l2) * 0.999;
    if (d > max) { const k = max / d; dx *= k; dy *= k; dz *= k; d = max; tgt[0] = root[0] + dx; tgt[1] = root[1] + dy; tgt[2] = root[2] + dz; }
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / d, uy = dy / d, uz = dz / d, dot = kx * ux + ky * uy + kz * uz;
    let bx = kx - ux * dot, by = ky - uy * dot, bz = kz - uz * dot;
    const bl = Math.hypot(bx, by, bz) || 1;
    out[0] = root[0] + ux * a + bx / bl * h; out[1] = root[1] + uy * a + by / bl * h; out[2] = root[2] + uz * a + bz / bl * h;
  }
  // One-off two-bone limb for creatures (legs of crawlers, tripod feet).
  limb(rx, ry, rz, tx, ty, tz, l1, l2, r, mat, col, kx, ky, kz, emis = 0, p0 = 0, r2 = r * 0.6) {
    const root = [rx, ry, rz], tgt = [tx, ty, tz], j = this.j;
    this.ik(root, tgt, l1, l2, kx, ky, kz, j);
    const jx = j[0], jy = j[1], jz = j[2], rm = (r + r2) / 2;
    this.seg(rx, ry, rz, jx, jy, jz, r, mat, col, emis, p0, CAPSULE, rm);
    this.seg(jx, jy, jz, tgt[0], tgt[1], tgt[2], rm, mat, col, emis, p0, CAPSULE, r2);
  }

  // Pose the shared skeleton. o: s scale, wide, a walk phase, m stride, crouch, lean (rad),
  // stance (0..1 combat stance), long (arm length), hr / hl hand targets relative to the chest.
  rig(o) {
    const J = this.J, s = o.s || 1, wide = o.wide || 1, a = o.a || 0, m = o.m ?? 0, lean = o.lean || 0, long = o.long || 1, st = o.stance || 0;
    const sw = Math.sin(a), cw = Math.cos(a);
    const hipY = (0.93 - (o.crouch || 0)) * s - Math.abs(sw) * 0.045 * s * m;
    const pz = lean * 0.12 * s;
    J.s = s;
    J.pel[0] = 0; J.pel[1] = hipY; J.pel[2] = pz;
    const sdy = Math.cos(lean), sdz = Math.sin(lean);
    J.sd[0] = 0; J.sd[1] = sdy; J.sd[2] = sdz;
    J.chest[0] = 0; J.chest[1] = hipY + sdy * 0.5 * s; J.chest[2] = pz + sdz * 0.5 * s;
    J.neck[0] = 0; J.neck[1] = J.chest[1] + sdy * 0.1 * s; J.neck[2] = J.chest[2] + sdz * 0.1 * s;
    const hl = lean * 0.45 + (o.nod || 0);
    J.head[0] = o.tilt || 0; J.head[1] = J.neck[1] + Math.cos(hl) * 0.15 * s; J.head[2] = J.neck[2] + Math.sin(hl) * 0.15 * s;
    for (let i = 0; i < 2; i++) {
      const k = i ? 1 : -1;
      // Legs: the foot swings forward and lifts on the return stroke.
      const hip = J.hip[i], ft = J.ft[i];
      hip[0] = k * 0.1 * s * wide; hip[1] = hipY - 0.03 * s; hip[2] = pz;
      ft[0] = k * (0.12 + st * 0.05) * s * wide; ft[1] = 0.09 * s + Math.max(0, k * cw) * 0.18 * s * m; ft[2] = k * sw * 0.38 * s * m + k * st * 0.17 * s;
      this.ik(hip, ft, 0.46 * s, 0.46 * s, 0, 0.25, 1, J.kn[i]);
      // Arms: explicit targets (weapon grips, reaches) or a walking swing.
      const sh = J.sh[i], ha = J.ha[i], tg = i ? o.hr : o.hl;
      sh[0] = k * 0.2 * s * wide; sh[1] = J.chest[1] - sdy * 0.04 * s; sh[2] = J.chest[2] - sdz * 0.04 * s;
      if (tg) { ha[0] = tg[0] * s; ha[1] = J.chest[1] + tg[1] * s; ha[2] = J.chest[2] + tg[2] * s; }
      else { ha[0] = k * 0.27 * s * wide; ha[1] = sh[1] - 0.55 * s * long; ha[2] = sh[2] - k * sw * 0.28 * s * m + 0.05 * s; }
      this.ik(sh, ha, 0.3 * s * long, 0.28 * s * long, k * 0.7, -0.5, -1, J.el[i]);
    }
    return J;
  }
  // Skin the four limbs with tapered capsules. Radii are for a 1.0 scale human.
  limbs(mat, thigh, shin, upper, fore, p0L, p0A, em = 0, k = 1) {
    const J = this.J, s = J.s * k;
    for (let i = 0; i < 2; i++) {
      this.vseg(J.hip[i], J.kn[i], 0.098 * s, mat, thigh, em, p0L, 0.07 * s);
      this.vseg(J.kn[i], J.ft[i], 0.068 * s, mat, shin, em, p0L, 0.048 * s);
      this.vseg(J.sh[i], J.el[i], 0.068 * s, mat, upper, em, p0A, 0.055 * s);
      this.vseg(J.el[i], J.ha[i], 0.054 * s, mat, fore, em, p0A, 0.04 * s);
    }
  }
  // Torso: hips, a tapered ribcage along the spine, and a neck.
  torso(mat, col, hipCol, p0, em = 0, sw = 0.4, hw = 0.3, depth = 0.24, neckCol = col, neckP = p0) {
    const J = this.J, s = J.s, p = J.pel, c = J.chest, d = J.sd;
    this.blob(p[0], p[1] + 0.02 * s, p[2], hw * s, 0.24 * s, depth * 0.95 * s, mat, hipCol, em, p0);
    this.part(CAPSULE, 0, (p[1] + c[1]) / 2 + 0.03 * s, (p[2] + c[2]) / 2, sw * s, 0.62 * s, depth * s, d[0], d[1], d[2], mat, col, em, p0, hw / sw * 0.92, 1);
    this.vseg(c, J.neck, 0.055 * s, mat, neckCol, em, neckP, 0.048 * s);
  }
  // A plate strapped along a bone, offset toward the front or the outside.
  plate(a, b, t, ox, oz, sx, sy, sz, col, em = 0, p0 = ARM, shape = BOX) {
    this.part(shape, a[0] + (b[0] - a[0]) * t + ox, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + oz, sx, sy, sz, b[0] - a[0], b[1] - a[1], b[2] - a[2], P, col, em, p0);
  }

  sprite(x, y, z, size, r, g, b, kind = 0, ax = 0, ay = 0, az = 0, len = 0) {
    if (this.ns >= MAX_SPRITES) return;
    const d = this.sprites, o = this.ns++ * SPRITE_FLOATS;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = kind;
    d[o + 8] = ax; d[o + 9] = ay; d[o + 10] = az; d[o + 11] = len;
  }
  glow(x, y, z, size, col, k = 1) { this.sprite(x, y, z, size, col[0] * k, col[1] * k, col[2] * k, 0); }
  ring(x, z, radius, col, k = 1, inner = 0.9, fill = 0, halfArc = 0, angle = 0, y = 0.07) {
    this.sprite(x, y, z, radius, col[0] * k, col[1] * k, col[2] * k, 1, inner, fill, halfArc, angle);
  }
  // A flat rectangle on the floor (the Brute's charge lane): from (x, z) along (ux, uz) for len,
  // hw either side, with a fill swept to `sweep` of its length.
  lane(x, z, ux, uz, len, hw, col, k = 1, sweep = 1, y = 0.08) {
    this.sprite(x, y, z, hw, col[0] * k, col[1] * k, col[2] * k, 4, ux, sweep, uz, len);
  }
  streak(x0, y0, z0, x1, y1, z1, width, col, k = 1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dx, dy, dz) || 1e-4;
    this.sprite(x0, y0, z0, width, col[0] * k, col[1] * k, col[2] * k, 2, dx / l, dy / l, dz / l, l);
  }

  // ---- particles and transient effects (render side only; may use Math.random) ----
  spawn(x, y, z, vx, vy, vz, life, size, col, grav = 0) {
    const p = this.pool;
    let i = p.n;
    if (i >= MAX_PARTICLES) i = (Math.random() * MAX_PARTICLES) | 0; else p.n++;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.life[i] = life; p.max[i] = life; p.size[i] = size; p.r[i] = col[0]; p.g[i] = col[1]; p.b[i] = col[2]; p.grav[i] = grav;
  }
  burst(x, y, z, n, speed, life, size, col, grav = 9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, s = speed * (0.35 + Math.random() * 0.65), h = Math.sqrt(1 - u * u);
      this.spawn(x, y, z, Math.cos(a) * h * s, Math.abs(u) * s * 0.9 + 1, Math.sin(a) * h * s, life * (0.5 + Math.random() * 0.5), size, col, grav);
    }
  }
  // Camera trauma, scaled by the player's shake setting.
  kick(amount) { this.cam.shake = Math.max(this.cam.shake, amount * this.opts.shake); }
  // A refraction ring that spreads from a point in the world (explosions, slams, Overdrive).
  ripple(x, y, z, radius, strength, life = 0.45) { if (this.opts.distort && this.ripples.length < 4) this.ripples.push({ x, y, z, radius, strength, t: 0, life }); }
  flash(x, y, z, col, radius, intensity, life) { if (this.flashes.length < 24) this.flashes.push({ x, y, z, col, radius, intensity, life, max: life }); }
  shock(x, z, radius, col, life = 0.4, k = 2) { if (this.rings.length < 80) this.rings.push({ x, z, radius, col, life, max: life, k }); }
  beam(x0, y0, z0, x1, y1, z1, col, life = 0.12, width = 0.12, k = 4) { if (this.beams.length < 160) this.beams.push({ x0, y0, z0, x1, y1, z1, col, life, max: life, width, k }); }

  handleEvents(events) {
    let kills = 0;
    for (const e of events) {
      switch (e.t) {
        case 'muzzle': this.fx.muzzle(e); this.recoil = 1; break;
        case 'tracer': this.fx.tracer(e); break;
        case 'hit': {
          // What was struck decides the impact (impacts.js); a crit still lands hard.
          this.fx.hit(e);
          if (e.big) { this.shock(e.x, e.z, 1.4, [1, 0.9, 0.6], 0.18, 3); this.hitPulse = Math.max(this.hitPulse, 0.5); this.kick(0.12); }
          break;
        }
        case 'wallhit': this.fx.wallHit(e); break;
        case 'kill': {
          // Hordes die in bulk: cap the per-frame effect cost.
          const n = kills++ < 6 ? (e.big ? 34 : 10) : 3;
          this.burst(e.x, 1.1, e.z, n, e.big ? 11 : 6, 0.7, 0.24, e.col || [1, 0.15, 0.55]);
          if (kills < 4) this.flash(e.x, 1.5, e.z, e.col || [1, 0.15, 0.55], 10, 2.5, 0.22);
          if (e.big) { this.ripple(e.x, 1.2, e.z, 5, 0.7); this.kick(0.3); }
          // The body stays for a moment: it buckles and sinks into the street.
          if (e.body && this.ghosts.length < 48 && e.body.kind !== 'cyst' && e.body.kind !== 'dummy' && e.body.kind !== 'matron') {
            const b = e.body, civ = b.kind === 'civ';
            this.ghosts.push({ t: 0, life: civ ? 2.4 : b.kind === 'titan' ? 1.6 : 0.85, side: Math.random() < 0.5 ? -1 : 1, e: { id: b.id, kind: civ ? 'walker' : b.kind, x: e.x, z: e.z, face: b.face, scale: b.scale || 1, look: b.look || 0, animT: b.animT || 0, r: b.r || 0.5, state: civ ? 'civ' : 'hunt', isMimic: !civ, moving: false, hitFlash: 0, windupT: 0, windupMax: 1, shimmer: 0 } });
          }
          break;
        }
        case 'explode': this.shock(e.x, e.z, e.r, e.col, 0.45, 3); this.burst(e.x, 0.8, e.z, 22, e.r * 2.6, 0.6, 0.3, e.col); this.flash(e.x, 2, e.z, e.col, e.r * 4, 4, 0.3); this.kick(e.shake ?? 0.25); this.ripple(e.x, 1, e.z, e.r * 1.6, 0.5 + (e.shake ?? 0.25)); break;
        case 'ring': this.shock(e.x, e.z, e.r, e.col, e.life || 0.4, e.k || 2); break;
        case 'beam': this.beam(e.x, e.y ?? 1.3, e.z, e.x2, e.y2 ?? 1.3, e.z2, e.col, e.life || 0.15, e.w || 0.12, e.k || 4); break;
        case 'slash': this.rings.push({ x: e.x, z: e.z, radius: e.r, col: e.col, life: 0.16, max: 0.16, k: 3, arc: e.half, angle: e.angle }); break;
        case 'pickup': this.burst(e.x, 0.6, e.z, e.small ? 3 : 10, 3, 0.6, 0.14, e.col || [0.3, 0.9, 1], -3); break;
        case 'hurt': this.damageFlash = Math.min(0.6, this.damageFlash + 0.2 + e.amount * 0.012); this.kick(0.22); this.hitPulse = 1; break;
        case 'dodged': this.shock(e.x, e.z, 2.2, [0.6, 0.95, 1], 0.3, 4); break;
        case 'heal': this.healFlash = 0.35; break;
        case 'shake': this.kick(e.amount); break;
        case 'reveal': this.shock(e.x, e.z, 3, [1, 0.15, 0.6], 0.5, 3); this.burst(e.x, 1.2, e.z, 14, 5, 0.5, 0.18, [1, 0.15, 0.6]); break;
        case 'blink': this.burst(e.x, 1.2, e.z, 12, 4, 0.4, 0.2, [0.85, 0.4, 1]); break;
        case 'spawnfx': this.shock(e.x, e.z, 1.6, [1, 0.15, 0.5], 0.5, 2); this.burst(e.x, 0.3, e.z, 5, 3, 0.5, 0.16, [1, 0.15, 0.5], -2); break;
        case 'levelup': this.shock(e.x, e.z, 7, [1, 0.85, 0.4], 0.7, 4); this.burst(e.x, 1, e.z, 40, 8, 0.9, 0.2, [1, 0.85, 0.4], -4); this.flash(e.x, 2, e.z, [1, 0.85, 0.4], 18, 4, 0.5); break;
        default: break;
      }
    }
  }

  // ---- camera ----
  updateCamera(raid, input, dt, aspect) {
    const c = this.cam, p = raid.player;
    const wantShoulder = c.mode === 'shoulder' || input.aimHeld;
    c.blend = clamp(c.blend + (wantShoulder ? 1 : -1) * dt / 0.3, 0, 1);
    const b = smoothstep(0, 1, c.blend);
    if (Math.hypot(p.x - this.px, p.z - this.pz) > 30) { this.px = p.x; this.pz = p.z; }
    const k = 1 - Math.exp(-dt * 14);
    this.px += (p.x - this.px) * k; this.pz += (p.z - this.pz) * k;
    const px = this.px, pz = this.pz;
    // Tactical top-down: fixed 60 degree pitch, looking north (doc 04).
    const bossZoom = raid.boss && raid.boss.active ? 1.15 : 1;
    const d = c.dist * bossZoom;
    const la = 0.12;
    const ax = Number.isFinite(input.aimX) ? input.aimX : px, az = Number.isFinite(input.aimZ) ? input.aimZ : pz - 1;
    const tTx = px + (ax - px) * la, tTz = pz + (az - pz) * la;
    const tEx = tTx, tEy = d * 0.866, tEz = tTz + d * 0.5;
    // Shoulder: over the right shoulder, free pitch.
    const fx = Math.sin(c.yaw), fz = -Math.cos(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const dirx = fx * cp, diry = -sp, dirz = fz * cp;
    const rx = -fz, rz = fx;
    // Pulled back far enough to see what is closing in from the sides.
    const back = 6.8;
    let sEx = px - dirx * back + rx * 1.05, sEy = 2.0 - diry * back + 0.45, sEz = pz - dirz * back + rz * 1.05;
    // Keep the shoulder camera out of walls: pull it in along the arm.
    const hit = raid.world.raycast(px, pz, sEx, sEz);
    if (hit < 1) { const t = Math.max(0.15, hit - 0.08); sEx = px + (sEx - px) * t; sEz = pz + (sEz - pz) * t; }
    sEy = Math.max(0.5, sEy);
    const sTx = sEx + dirx * 20, sTy = sEy + diry * 20, sTz = sEz + dirz * 20;
    c.ex = lerp(tEx, sEx, b); c.ey = lerp(tEy, sEy, b); c.ez = lerp(tEz, sEz, b);
    c.tx = lerp(tTx, sTx, b); c.ty = lerp(1.0, sTy, b); c.tz = lerp(tTz, sTz, b);
    c.fov = lerp(0.62, 0.98, b);
    c.cut = lerp(clamp(d * 0.72, 18, 34), 2.4, b);
    c.shoulder = c.blend > 0.5;
    // A fixed camera for portraits and inspection overrides the game cameras.
    if (c.free) { const f = c.free; c.ex = f.ex; c.ey = f.ey; c.ez = f.ez; c.tx = f.tx; c.ty = f.ty; c.tz = f.tz; c.fov = f.fov || 0.6; c.cut = 0; c.shoulder = true; }
    if (c.shake > 0) {
      const s = c.shake * 0.5;
      c.ex += (Math.random() - 0.5) * s; c.ey += (Math.random() - 0.5) * s; c.ez += (Math.random() - 0.5) * s;
      c.shake = Math.max(0, c.shake - dt * 1.6);
    }
    mat4Perspective(c.proj, c.fov, aspect, 0.3, 2600);
    mat4LookAt(c.view, c.ex, c.ey, c.ez, c.tx, c.ty, c.tz);
    mat4Mul(c.vp, c.proj, c.view);
    const v = c.view;
    c.right = [v[0], v[4], v[8]]; c.up = [v[1], v[5], v[9]]; c.fwd = [-v[2], -v[6], -v[10]];
    c.tanY = Math.tan(c.fov / 2); c.tanX = c.tanY * aspect;
  }

  // Aim point on the chest-height plane (doc 04, section 2). ndc in [-1, 1].
  aimPoint(ndcX, ndcY, raid) {
    const c = this.cam, p = raid.player;
    const dx = c.fwd[0] + c.right[0] * ndcX * c.tanX + c.up[0] * ndcY * c.tanY;
    const dy = c.fwd[1] + c.right[1] * ndcX * c.tanX + c.up[1] * ndcY * c.tanY;
    const dz = c.fwd[2] + c.right[2] * ndcX * c.tanX + c.up[2] * ndcY * c.tanY;
    if (dy < -0.02) {
      const t = (1.2 - c.ey) / dy;
      let x = c.ex + dx * t, z = c.ez + dz * t;
      const dd = Math.hypot(x - p.x, z - p.z);
      if (dd > 70) { x = p.x + (x - p.x) / dd * 70; z = p.z + (z - p.z) / dd * 70; }
      return [x, z];
    }
    const l = Math.hypot(dx, dz) || 1;
    return [p.x + dx / l * 60, p.z + dz / l * 60];
  }

  // World point to CSS pixels. Returns false when behind the camera.
  toScreen(x, y, z, w, h, out) {
    project(this.cam.vp, x, y, z, this.tmp);
    if (this.tmp[2] <= 0.01) return false;
    out[0] = (this.tmp[0] * 0.5 + 0.5) * w;
    out[1] = (1 - (this.tmp[1] * 0.5 + 0.5)) * h;
    out[2] = this.tmp[2];
    return true;
  }

  // ---- the operator ----
  drawPlayer(raid, t) {
    const p = raid.player, cls = CLASSES[p.classId], cc = cls.color, id = p.classId;
    if (p.dead || p.hidden) return;
    const melee = id === 'blade', moving = p.moving ? 1 : 0, rec = this.recoil;
    const flick = (p.iframes > 0 ? 0.4 : 0) + p.hurtT * 3;
    // Whole-body motion: tumble, lunge, hop or slide on the dodge; a shudder when hit.
    if (p.dodgeT > this.dodgeMax || p.dodgeT <= 0) this.dodgeMax = Math.max(0.12, p.dodgeT);
    const dg = p.dodgeT > 0 ? 1 - p.dodgeT / this.dodgeMax : 0, dodging = p.dodgeT > 0 && this.dodgeMax > 0.1;
    let pitch = 0, roll = Math.sin(t * 45) * 0.12 * p.hurtT * 4, y = 0, crouch = 0.03, lean = moving ? 0.24 : 0.07 + Math.sin(t * 1.7) * 0.012, pivot = 0;
    if (dodging) {
      if (id === 'rifleman') { pitch = dg * 6.283; pivot = 0.75; crouch = 0.3; lean = 0.9; y = -0.15 * Math.sin(dg * 3.14); }
      else if (id === 'blade') { pitch = 0.55; lean = 0.5; crouch = 0.12; }
      else if (id === 'summoner') { y = Math.sin(dg * 3.14) * 0.7; crouch = 0.18 * Math.sin(dg * 3.14); lean = 0.3; }
      else { pitch = -0.5; crouch = 0.42; lean = -0.2; }
    }
    if (p.channel) { lean = 0.16; crouch = 0.08; }
    this.begin(p.x, p.z, p.face, y, pitch, roll, pivot);

    // Hand targets relative to the chest: both hands on the weapon, or a blade stance.
    const kick = rec * 0.07 + (p.channel ? Math.sin(t * 70) * 0.012 : 0);
    let hr, hl, sw = 0;
    if (melee) {
      sw = p.swingT > 0 ? 1 - p.swingT / 0.2 : 0;
      hr = p.swingT > 0 ? [0.42 - sw * 0.85, -0.12 + Math.sin(sw * 3.14) * 0.1, 0.3 + Math.sin(sw * 3.14) * 0.28] : [0.3, -0.36, 0.22];
      hl = p.swingT > 0 ? [-0.3, -0.2, -0.05] : [-0.24, -0.3, 0.16];
    } else if (dodging && id === 'rifleman') { hr = [0.16, -0.3, 0.2]; hl = [-0.1, -0.3, 0.26]; }
    else { hr = [0.15, -0.17, 0.24 - kick]; hl = [-0.03, -0.14, 0.56 - kick]; }
    const J = this.rig({ s: 1, a: p.animT, m: moving, crouch, lean, stance: moving || melee ? 0 : 0.8, hr, hl, nod: -0.05 });
    const armor = id === 'blade' ? [0.2, 0.18, 0.2] : id === 'toxic' ? [0.2, 0.23, 0.19] : id === 'summoner' ? [0.25, 0.22, 0.17] : [0.19, 0.22, 0.26];
    const cloth = id === 'blade' ? [0.09, 0.07, 0.09] : id === 'toxic' ? [0.11, 0.13, 0.1] : [0.08, 0.09, 0.11], dark = [0.05, 0.055, 0.065], em = flick;

    // Undersuit limbs, then the armour strapped over them.
    this.limbs(P, cloth, cloth, cloth, cloth, FAB, FAB, em);
    this.torso(P, cloth, cloth, FAB, em, 0.42, 0.32, 0.25);
    for (let i = 0; i < 2; i++) {
      const k = i ? 1 : -1;
      this.plate(J.hip[i], J.kn[i], 0.5, k * 0.055, 0.04, 0.13, 0.27, 0.12, armor, em);         // thigh
      this.plate(J.kn[i], J.ft[i], 0.42, 0, 0.045, 0.11, 0.3, 0.09, armor, em);                  // greave
      this.blob(J.kn[i][0], J.kn[i][1], J.kn[i][2] + 0.05, 0.13, 0.13, 0.12, P, armor, em, ARM); // knee cap
      this.blob(J.ft[i][0], J.ft[i][1] - 0.035, J.ft[i][2] + 0.07, 0.125, 0.11, 0.3, P, dark, em, RUB, BOX); // boot
      this.blob(J.ft[i][0], J.ft[i][1] + 0.06, J.ft[i][2], 0.13, 0.12, 0.14, P, dark, em, RUB);  // ankle cuff
      if (!(melee && i === 0)) this.blob(J.sh[i][0] + k * 0.03, J.sh[i][1] + 0.03, J.sh[i][2], 0.21, 0.15, 0.22, P, armor, em, ARM); // pauldron
      this.plate(J.el[i], J.ha[i], 0.45, 0, 0, 0.11, 0.2, 0.11, armor, em, ARM, CYL);           // bracer
      this.blob(J.ha[i][0], J.ha[i][1], J.ha[i][2], 0.1, 0.1, 0.12, P, dark, em, RUB);           // glove
    }
    // Belt, pouches and holster.
    const pv = J.pel;
    this.blob(0, pv[1] + 0.1, pv[2], 0.36, 0.07, 0.28, P, dark, em, RUB, CYL);
    this.blob(0, pv[1] + 0.1, pv[2] + 0.14, 0.08, 0.06, 0.03, E, cc, 2.5, 0, BOX);
    this.blob(-0.19, pv[1] + 0.02, pv[2] + 0.05, 0.08, 0.14, 0.12, P, armor, em, ARM, BOX);
    this.blob(0.2, pv[1] - 0.06, pv[2] + 0.02, 0.07, 0.2, 0.11, P, dark, em, RUB, BOX);
    // Chest rig: plates follow the spine.
    const c = J.chest, d = J.sd, mx = (pv[1] + c[1]) / 2, mz = (pv[2] + c[2]) / 2;
    this.part(BOX, 0, c[1] - 0.14, c[2] + 0.115 - d[2] * 0.14, 0.33, 0.25, 0.09, d[0], d[1], d[2], P, armor, em, ARM);
    this.part(BOX, 0, mx - 0.02, mz + 0.12, 0.26, 0.16, 0.06, d[0], d[1], d[2], P, armor, em, ARM);
    this.part(BOX, 0, c[1] - 0.1, c[2] + 0.166 - d[2] * 0.1, 0.2, 0.025, 0.012, d[0], d[1], d[2], E, cc, 3.5);
    this.part(CYL, 0, c[1] + 0.04, c[2] + 0.01, 0.2, 0.09, 0.2, d[0], d[1], d[2], P, armor, em, ARM); // collar

    // Helmet or mask, by class.
    const h = J.head, hx = h[0], hy = h[1], hz = h[2];
    if (id === 'toxic') {
      this.blob(hx, hy + 0.01, hz - 0.01, 0.27, 0.3, 0.29, P, [0.13, 0.15, 0.12], em, RUB);           // hood
      this.blob(hx, hy - 0.02, hz + 0.1, 0.19, 0.2, 0.12, P, dark, em, RUB);                           // mask
      for (const k of [-1, 1]) { this.blob(hx + k * 0.055, hy + 0.03, hz + 0.145, 0.07, 0.07, 0.04, E, cc, 4.5); this.seg(hx + k * 0.07, hy - 0.08, hz + 0.1, hx + k * 0.15, hy - 0.11, hz + 0.16, 0.045, P, [0.16, 0.17, 0.15], em, ARM, CYL); }
      this.seg(hx, hy - 0.07, hz + 0.14, hx, hy - 0.2, c[2] + 0.15, 0.022, P, dark, em, RUB);         // hose
    } else if (id === 'blade') {
      this.blob(hx, hy, hz, 0.22, 0.26, 0.24, P, SKIN[2], em, SKN);
      this.blob(hx, hy + 0.07, hz - 0.03, 0.24, 0.17, 0.26, P, [0.06, 0.05, 0.07], em, HAR);          // hair
      this.seg(hx, hy + 0.08, hz - 0.12, hx, hy - 0.02 + Math.sin(t * 5) * 0.02, hz - 0.36 - moving * 0.1, 0.045, P, [0.06, 0.05, 0.07], em, HAR, CAPSULE, 0.02); // tail
      this.blob(hx, hy - 0.05, hz + 0.08, 0.2, 0.11, 0.12, P, dark, em, ARM);                          // half mask
      this.blob(hx, hy + 0.035, hz + 0.115, 0.17, 0.028, 0.03, E, cc, 5, 0, BOX);                      // eye strip
      // Scarf: a long tail that trails when moving.
      this.blob(0, J.neck[1] + 0.01, J.neck[2], 0.21, 0.09, 0.21, P, [cc[0] * 0.5, cc[1] * 0.3, cc[2] * 0.4], em, FAB, CYL);
      this.seg(-0.08, J.neck[1], J.neck[2] - 0.08, -0.16 + Math.sin(t * 4) * 0.05, J.neck[1] - 0.25 + moving * 0.2, J.neck[2] - 0.5 - moving * 0.25, 0.05, P, [cc[0] * 0.5, cc[1] * 0.3, cc[2] * 0.4], em, FAB, CAPSULE, 0.025);
    } else {
      this.blob(hx, hy + 0.01, hz, 0.25, 0.27, 0.27, P, armor, em, ARM);                               // helmet shell
      this.blob(hx, hy - 0.07, hz + 0.07, 0.19, 0.1, 0.13, P, dark, em, ARM, BOX);                     // jaw guard
      if (id === 'summoner') { for (const k of [-1, 1]) { this.seg(hx + k * 0.055, hy + 0.02, hz + 0.1, hx + k * 0.055, hy + 0.02, hz + 0.16, 0.042, P, dark, em, ARM, CYL); this.blob(hx + k * 0.055, hy + 0.02, hz + 0.165, 0.06, 0.06, 0.02, E, cc, 5); } }
      else this.blob(hx, hy + 0.02, hz + 0.118, 0.2, 0.05, 0.05, E, cc, 5, 0, BOX);                    // visor band
      for (const k of [-1, 1]) this.blob(hx + k * 0.13, hy - 0.01, hz, 0.04, 0.09, 0.09, P, dark, em, ARM, CYL); // ear modules
    }

    // Back kit and the weapon.
    const bz = mz - 0.19, by = mx + 0.1, R = J.ha[1], Lh = J.ha[0];
    if (id === 'rifleman') {
      this.part(BOX, 0, by, bz, 0.3, 0.42, 0.15, d[0], d[1], d[2], P, [0.1, 0.11, 0.13], em, ARM);
      this.part(BOX, 0, by + 0.12, bz - 0.08, 0.2, 0.12, 0.04, d[0], d[1], d[2], P, armor, em, ARM);
      this.seg(0.12, by + 0.2, bz, 0.14, by + 0.62, bz - 0.06, 0.008, P, dark, em, ARM, CYL);         // antenna
      this.blob(0.14, by + 0.63, bz - 0.06, 0.03, 0.03, 0.03, E, cc, 5);
      // Rifle: receiver, stock, barrel with shroud, magazine and optic, along the grip line.
      const gx = R[0], gy = R[1] + 0.02, gz = R[2];
      this.blob(gx - 0.03, gy + 0.03, gz + 0.16, 0.06, 0.1, 0.5, P, [0.07, 0.075, 0.085], em, ARM, BOX);
      this.blob(gx - 0.03, gy + 0.01, gz - 0.2, 0.05, 0.11, 0.24, P, [0.05, 0.05, 0.06], em, RUB, BOX);
      this.seg(gx - 0.03, gy + 0.045, gz + 0.4, gx - 0.03, gy + 0.045, gz + 0.86, 0.02, P, [0.04, 0.04, 0.05], em, ARM, CYL);
      this.seg(gx - 0.03, gy + 0.045, gz + 0.4, gx - 0.03, gy + 0.045, gz + 0.62, 0.034, P, [0.09, 0.1, 0.11], em, ARM, CYL);
      this.blob(gx - 0.03, gy - 0.1, gz + 0.12, 0.04, 0.18, 0.08, P, [0.05, 0.05, 0.06], em, ARM, BOX);
      this.blob(gx - 0.03, gy + 0.11, gz + 0.14, 0.035, 0.045, 0.16, P, dark, em, ARM, BOX);
      this.blob(gx - 0.03, gy + 0.11, gz + 0.225, 0.03, 0.03, 0.01, E, cc, 4);
      if (rec > 0.3) this.glow(this.L(gx - 0.03, gy + 0.045, gz + 0.95)[0], this.w[1], this.w[2], 0.9 * rec, [1, 0.8, 0.5], 1.5);
    } else if (id === 'blade') {
      // Sheath across the back and the blade in hand: guard, grip, edge.
      this.seg(-0.2, by + 0.3, bz + 0.04, 0.22, by - 0.35, bz - 0.04, 0.035, P, dark, em, RUB);
      const tip = p.swingT > 0 ? [R[0] - Math.cos(sw * 3.14) * 1.05, R[1] + 0.18, R[2] + 0.35 + Math.sin(sw * 3.14) * 0.9] : [R[0] + 0.1, R[1] + 0.35, R[2] + 1.1];
      const tx = tip[0] - R[0], ty = tip[1] - R[1], tz = tip[2] - R[2];
      this.seg(R[0] - tx * 0.14, R[1] - ty * 0.14, R[2] - tz * 0.14, R[0] + tx * 0.06, R[1] + ty * 0.06, R[2] + tz * 0.06, 0.022, P, dark, em, RUB, CYL);
      this.part(BOX, R[0] + tx * 0.08, R[1] + ty * 0.08, R[2] + tz * 0.08, 0.16, 0.025, 0.05, tx, ty, tz, P, armor, em, ARM);
      this.part(BOX, R[0] + tx * 0.56, R[1] + ty * 0.56, R[2] + tz * 0.56, 0.012, Math.hypot(tx, ty, tz) * 0.94, 0.055, tx, ty, tz, E, cc, 6);
      this.part(BOX, R[0] + tx * 0.56, R[1] + ty * 0.56, R[2] + tz * 0.56, 0.02, Math.hypot(tx, ty, tz) * 0.9, 0.02, tx, ty, tz, P, [0.5, 0.52, 0.56], em, ARM);
    } else if (id === 'summoner') {
      // Drone bay on the back, a shoulder lamp and a drum launcher.
      this.part(BOX, 0, by, bz - 0.03, 0.36, 0.46, 0.2, d[0], d[1], d[2], P, [0.14, 0.13, 0.11], em, ARM);
      for (const k of [-1, 1]) { this.seg(k * 0.1, by + 0.14, bz - 0.14, k * 0.1, by + 0.14, bz - 0.2, 0.07, P, dark, em, ARM, CYL); this.blob(k * 0.1, by + 0.14, bz - 0.21, 0.09, 0.09, 0.02, E, cc, 2.5 + Math.sin(t * 3 + k) * 1); }
      this.blob(0.27, c[1] + 0.07, c[2] - 0.02, 0.08, 0.08, 0.12, P, dark, em, ARM, BOX);
      this.blob(0.27, c[1] + 0.07, c[2] + 0.05, 0.06, 0.06, 0.02, E, [1, 0.95, 0.8], 5);
      const gx = R[0] - 0.03, gy = R[1] + 0.03, gz = R[2];
      this.seg(gx, gy, gz - 0.12, gx, gy, gz + 0.62, 0.062, P, [0.12, 0.12, 0.13], em, ARM, CYL);
      this.seg(gx, gy - 0.03, gz + 0.08, gx, gy - 0.03, gz + 0.3, 0.095, P, [0.2, 0.18, 0.13], em, ARM, CYL);
      this.blob(gx, gy, gz + 0.63, 0.1, 0.1, 0.03, E, cc, 4);
      this.blob(gx, gy - 0.12, gz - 0.02, 0.04, 0.14, 0.06, P, dark, em, RUB, BOX);
    } else {
      // Twin tanks on the back, hoses to a sprayer with a glowing reservoir.
      for (const k of [-1, 1]) {
        this.part(CAPSULE, k * 0.1, by, bz - 0.04, 0.15, 0.48, 0.15, d[0], d[1], d[2], P, [0.16, 0.19, 0.15], em, ARM);
        this.part(CAPSULE, k * 0.1, by, bz - 0.04, 0.11, 0.3, 0.16, d[0], d[1], d[2], E, cc, 1.4 + Math.sin(t * 2.2 + k) * 0.4);
      }
      const gx = R[0] - 0.03, gy = R[1] + 0.03, gz = R[2];
      this.seg(gx, gy, gz - 0.1, gx, gy, gz + 0.5, 0.04, P, [0.13, 0.15, 0.12], em, ARM, CYL);
      this.seg(gx, gy, gz + 0.5, gx, gy + 0.01, gz + 0.72, 0.045, P, dark, em, ARM, CONE);
      this.blob(gx, gy + 0.09, gz + 0.16, 0.1, 0.12, 0.16, E, cc, 2.2);
      this.seg(0.1, by - 0.15, bz, gx, gy - 0.02, gz - 0.1, 0.02, P, dark, em, RUB);
      this.blob(gx, gy - 0.12, gz, 0.04, 0.14, 0.06, P, dark, em, RUB, BOX);
    }
    void Lh;
    this.glow(p.x, 1.3, p.z, 1.6, cc, 0.07);
    const barrier = p.barrier + p.shield;
    if (barrier > 0) this.ring(p.x, p.z, 0.95, [0.3, 0.8, 1], 0.9 * Math.min(1, barrier / 20), 0.8, 0.05, 0, 0, 0.1);
    // Orbit Blades: run-item satellites.
    const ob = p.items.orbit_blades || 0;
    for (let k = 0; k < Math.min(6, ob ? ob + 1 : 0); k++) {
      const an = raid.time * 3.2 + k * (6.283 / Math.min(6, ob + 1)), bx = p.x + Math.cos(an) * 2.6, bzz = p.z + Math.sin(an) * 2.6;
      this.wseg(bx - Math.sin(an) * 0.55, 1.1, bzz + Math.cos(an) * 0.55, bx + Math.sin(an) * 0.55, 1.1, bzz - Math.cos(an) * 0.55, 0.05, E, [0.6, 0.9, 1], 6, 0, CAPSULE, 0.01);
      this.glow(bx, 1.1, bzz, 0.7, [0.6, 0.9, 1], 0.5);
    }
  }

  // ---- civilians and disguised Mimics ----
  drawCivilian(e, t, hf, fall = 0) {
    const L = e.look | 0, coat = COATS[L % COATS.length], skin = SKIN[(L >> 3) % SKIN.length], hair = HAIR[(L >> 1) % HAIR.length];
    const pants = L % 3 === 0 ? [0.07, 0.08, 0.12] : [coat[0] * 0.45, coat[1] * 0.45, coat[2] * 0.5];
    // Passive sense: a faint shimmer on nearby Mimics, no identification (doc 03).
    const twitch = e.isMimic && e.shimmer > 0 ? (hash2(e.id, Math.floor(t * 9)) > 0.86 ? 0.9 : 0) * e.shimmer : 0;
    const sus = e.state === 'suspicious' ? 0.25 + 0.25 * Math.sin(t * 20) : 0;
    const em = hf + twitch + sus, s = 0.92 + ((L >> 2) % 5) * 0.035, wide = 0.9 + ((L >> 4) % 3) * 0.08;
    const fleeing = e.state === 'flee', umbrella = L % 3 === 0 && !fleeing && !fall, outfit = L % 4, female = (L >> 1) % 2 === 0;
    this.begin(e.x, e.z, e.face, -fall * fall * 0.25, -fall * 1.45, 0, 0);
    const J = this.rig({
      s, wide, a: e.animT, m: e.moving ? (fleeing ? 1.25 : 0.8) : 0, lean: fleeing ? 0.3 : e.state === 'suspicious' ? -0.05 : 0.04 + Math.sin(t * 1.3 + e.id) * 0.01,
      hr: umbrella ? [0.2, -0.18, 0.2] : fleeing ? [0.3, 0.3, 0.1] : null, hl: fleeing ? [-0.3, 0.32, 0.1] : null, tilt: e.state === 'suspicious' ? 0.03 : 0,
    });
    const sleeve = outfit === 3 ? skin : coat;
    this.limbs(P, pants, pants, coat, sleeve, FAB, outfit === 3 ? SKN : FAB, em);
    this.torso(P, coat, pants, FAB, em, 0.38 * (female ? 0.92 : 1), 0.3, 0.23, skin, SKN);
    const pv = J.pel, c = J.chest, d = J.sd, h = J.head;
    for (let i = 0; i < 2; i++) {
      this.blob(J.ft[i][0], J.ft[i][1] - 0.04, J.ft[i][2] + 0.06, 0.1 * s, 0.09 * s, 0.26 * s, P, [0.04, 0.035, 0.03], em, RUB, BOX);
      this.blob(J.ha[i][0], J.ha[i][1], J.ha[i][2], 0.08 * s, 0.09 * s, 0.09 * s, P, skin, em, SKN);
    }
    // Outfit: long coat, hooded jacket, skirt or shirt.
    if (outfit === 1) this.part(CAPSULE, 0, pv[1] - 0.2 * s, pv[2], 0.36 * s * wide, 0.62 * s, 0.26 * s, 0, 1, 0, P, coat, em, FAB, 1.15, 0.9);
    else if (outfit === 2) { this.blob(h[0], h[1] + 0.01, h[2] - 0.05, 0.27 * s, 0.3 * s, 0.27 * s, P, coat, em, FAB); this.blob(0, c[1] - 0.05, c[2] - 0.13, 0.26 * s, 0.2 * s, 0.14 * s, P, coat, em, FAB); }
    else if (female && outfit === 0) this.part(CONE, 0, pv[1] - 0.12 * s, pv[2], 0.5 * s * wide, 0.5 * s, 0.4 * s, 0, 1, 0, P, [coat[0] * 0.7, coat[1] * 0.7, coat[2] * 0.75], em, FAB);
    else { this.part(BOX, 0.0, c[1] - 0.16, c[2] + 0.115, 0.05 * s, 0.26 * s, 0.01, d[0], d[1], d[2], P, [0.4, 0.08, 0.1], em, FAB); }
    // Head: face, hair by style, sometimes a cap.
    this.blob(h[0], h[1], h[2], 0.2 * s, 0.25 * s, 0.22 * s, P, skin, em, SKN);
    if (outfit !== 2) {
      const style = (L >> 2) % 4;
      this.blob(h[0], h[1] + 0.055 * s, h[2] - 0.025 * s, 0.22 * s, 0.18 * s, 0.24 * s, P, hair, em, HAR);
      if (style === 1 || female) this.blob(h[0], h[1] - 0.04 * s, h[2] - 0.07 * s, 0.23 * s, 0.26 * s, 0.16 * s, P, hair, em, HAR);
      if (style === 2) this.seg(h[0], h[1] + 0.05 * s, h[2] - 0.11 * s, h[0], h[1] - 0.16 * s, h[2] - 0.2 * s, 0.04 * s, P, hair, em, HAR, CAPSULE, 0.02 * s);
      if (style === 3) { this.blob(h[0], h[1] + 0.1 * s, h[2], 0.23 * s, 0.09 * s, 0.24 * s, P, coat, em, FAB, CYL); this.blob(h[0], h[1] + 0.07 * s, h[2] + 0.14 * s, 0.18 * s, 0.02 * s, 0.14 * s, P, coat, em, FAB, BOX); }
    }
    // Carried things: a bag, a briefcase, an umbrella.
    if (L % 5 === 2) { this.blob(-0.2 * s * wide, pv[1] + 0.05, pv[2] - 0.05, 0.1, 0.3, 0.26, P, [0.12, 0.08, 0.05], em, RUB, BOX); this.seg(-0.2 * s * wide, pv[1] + 0.2, pv[2], 0.18 * s, c[1], c[2], 0.012, P, [0.08, 0.06, 0.04], em, RUB); }
    else if (L % 5 === 4 && !fleeing && !umbrella) this.blob(J.ha[0][0], J.ha[0][1] - 0.18, J.ha[0][2], 0.08, 0.26, 0.36, P, [0.07, 0.06, 0.05], em, RUB, BOX);
    if (umbrella) {
      const R = J.ha[1], uc = COATS[(L >> 2) % COATS.length], col = [uc[0] * 1.5 + 0.06, uc[1] * 1.5 + 0.06, uc[2] * 1.5 + 0.06], ty = h[1] + 0.5 * s;
      this.seg(R[0], R[1] - 0.05, R[2], R[0] - 0.05, ty, R[2] - 0.08, 0.012, P, [0.05, 0.05, 0.05], 0, ARM, CYL);
      this.blob(R[0] - 0.05, ty, R[2] - 0.08, 1.2, 0.3, 1.2, P, col, em, FAB, CONE);
      for (let k = 0; k < 6; k++) { const an = k * 1.047; this.seg(R[0] - 0.05, ty + 0.14, R[2] - 0.08, R[0] - 0.05 + Math.cos(an) * 0.6, ty - 0.14, R[2] - 0.08 + Math.sin(an) * 0.6, 0.008, P, [0.03, 0.03, 0.03], 0, ARM, CYL); }
    }
  }

  // ---- Mimics ----
  drawEnemy(e, t, fall = 0, side = 1) {
    const hf = e.hitFlash > 0 ? e.hitFlash * 5 : 0;
    const disguised = e.state === 'civ' || e.state === 'disguised' || e.state === 'suspicious' || e.state === 'flee';
    let showCiv = disguised;
    if (e.state === 'revealing' && e.wasDisguised) showCiv = hash2(e.id, Math.floor(t * 18)) > 0.5;
    if (showCiv) { this.drawCivilian(e, t, hf, fall); return; }
    const O = SHELLED.has(e.kind) ? MAT.SHELL : MAT.ORGANIC;
    const col = MIMIC_COL[e.kind] || MIMIC_COL.walker, sc = e.scale || 1, sd = (e.id % 97) / 97;
    // Wind-up progress from the simulation's own timing: 0 as it commits, 1 at the strike.
    const wind = e.windupT > 0 ? 1 - e.windupT / (e.windupMax || 1) : 0;
    const em = (0.7 + hf * 2 + wind * 2.5) * (1 - fall * 0.8);
    // Glow belongs to the focal parts (maw, core, sac, eyes); limbs carry only dim veins,
    // so a revealed creature reads by its shape rather than as neon on every limb.
    const veins = (0.15 + hf * 2) * (1 - fall * 0.8);
    // Follow-through after a strike: 1 as the recovery starts, falling to 0 as it ends.
    const kindBase = ENEMIES[e.kind], rec = e.mode === 'recover' && e.state === 'hunt' && kindBase && kindBase.recover ? clamp(e.modeT / kindBase.recover, 0, 1) : 0;
    const dark = [col[0] * 0.45, col[1] * 0.45, col[2] * 0.45], bone = [0.32, 0.28, 0.25];
    // Things that crawl out of the ground rise; hits rock them back; the dead topple and sink.
    const rise = e.state === 'revealing' && !e.wasDisguised ? -clamp(e.revealT / 0.6, 0, 1) * 1.3 * sc : 0;
    const flinch = Math.min(0.3, hf * 0.25);
    switch (e.kind) {
      case 'walker': {
        // Husk: what is left of a person, bent over a bone blade grown out of the right
        // forearm. It limps on a dragging left foot and its head lolls. Through the
        // wind-up the blade arm draws back over the shoulder while the claw reaches; it
        // sweeps through at the strike and hangs low and forward in the recovery.
        const s = 1.06 * sc, coat = COATS[(e.look | 0) % COATS.length], mv = e.moving ? 1 : 0;
        const draw = smoothstep(0, 0.82, wind), snap = smoothstep(0.86, 1, wind);
        const roll = Math.sin(e.animT) * 0.07 * mv;
        this.begin(e.x, e.z, e.face, rise - fall * fall * 0.3, -flinch - fall * 1.45, fall * 0.3 * side + roll, 0);
        const lean = 0.5 + Math.sin(t * 1.1 + e.id) * 0.04 * (1 - mv) - draw * 0.3 + snap * 0.45 + rec * 0.25;
        const hr = rec > 0 ? [0.12, -0.62, 0.78] : [0.28 + draw * 0.1, -0.35 + draw * 0.85 - snap * 1.0, 0.45 - draw * 0.8 + snap * 1.2];
        const hl = draw > 0 ? [-0.28, -0.1 * draw, 0.32 + 0.18 * draw] : [-0.27, -0.5, 0.08 + Math.sin(e.animT) * 0.16 * mv];
        const J = this.rig({ s, a: e.animT, m: mv, lean, crouch: 0.06 + rec * 0.08, long: 1.25, hr, hl, nod: 0.25 + Math.sin(t * 0.7 + e.id) * 0.09 * (1 - mv), tilt: 0.04 + Math.sin(t * 0.9 + e.id * 1.7) * 0.05 });
        // The left foot drags: it barely lifts and lands short.
        if (mv) { const f = J.ft[0]; f[1] = 0.09 * s + Math.max(0, -Math.cos(e.animT)) * 0.05 * s; f[2] *= 0.55; this.ik(J.hip[0], f, 0.46 * s, 0.46 * s, 0, 0.25, 1, J.kn[0]); }
        this.limbs(O, dark, dark, col, dark, sd, sd, veins);
        this.torso(O, col, dark, sd, veins, 0.4, 0.28, 0.25);
        const c = J.chest, d = J.sd, h = J.head, R = J.ha[1], Lh = J.ha[0], El = J.el[1];
        // Coat remnants: one shoulder and a torn tail.
        this.blob(-0.17 * s, c[1] - 0.06, c[2] - 0.02, 0.24 * s, 0.3 * s, 0.28 * s, P, coat, hf, FAB);
        this.seg(-0.12 * s, J.pel[1] + 0.1, J.pel[2] - 0.1, -0.16 * s, J.pel[1] - 0.4 * s, J.pel[2] - 0.2 - mv * 0.12, 0.09 * s, P, coat, hf, FAB, CAPSULE, 0.03 * s);
        // The bone blade runs on past the hand; claws on the left.
        this.seg(El[0], El[1], El[2], R[0] + (R[0] - El[0]) * 2.0, R[1] + (R[1] - El[1]) * 2.0, R[2] + (R[2] - El[2]) * 2.0 + 0.08, 0.07 * s, P, bone, hf, ARM, CONE);
        for (let k = -1; k <= 1; k++) this.seg(Lh[0], Lh[1], Lh[2], Lh[0] + k * 0.05, Lh[1] - 0.14 * s, Lh[2] + 0.1 * s, 0.018 * s, P, bone, hf, ARM, CONE);
        // Exposed ribs with light behind them that brightens as it draws back; spine growths.
        for (let k = 0; k < 3; k++) this.part(BOX, 0, c[1] - 0.12 - k * 0.08, c[2] + 0.115 - d[2] * (0.12 + k * 0.08), 0.22 * s, 0.022, 0.02, d[0], d[1], d[2], E, [1, 0.5, 0.75], 0.6 + draw * 4.5);
        for (let k = 0; k < 4; k++) { const f = k / 3; this.seg(0, J.pel[1] + 0.12 + f * 0.36 * s, J.pel[2] - 0.1 + f * d[2] * 0.4 * s, 0, J.pel[1] + 0.2 + f * 0.42 * s, J.pel[2] - 0.3 + f * d[2] * 0.3 * s, 0.035 * s, P, bone, hf, ARM, CONE); }
        const open = 0.03 + draw * 0.08;
        this.blob(h[0] - (0.07 + open) * s, h[1], h[2], 0.15 * s, 0.25 * s, 0.22 * s, O, col, veins * 2, sd);
        this.blob(h[0] + (0.07 + open) * s, h[1] + 0.02, h[2] - 0.01, 0.14 * s, 0.22 * s, 0.2 * s, O, col, veins * 2, sd + 0.3);
        this.blob(h[0], h[1] - 0.01, h[2] + 0.04, (0.05 + open) * s, 0.2 * s, 0.1 * s, E, [1, 0.6, 0.8], (3 + draw * 7) * (1 - fall));
        this.blob(h[0], h[1] - 0.11 * s, h[2] + 0.06 * s, 0.16 * s, 0.07 * s, 0.14 * s, P, bone, hf, ARM);
        break;
      }
      case 'mite': {
        // Mite: a tick the size of a dog, a fat abdomen behind a small head on six needle
        // legs. It scuttles in quick bobs; the wind-up presses it flat with its rear
        // raised and pincers snapping, and the pounce stretches it out with legs trailing.
        const s = 0.56 * sc, a = e.animT * 1.7, leap = !!e.leap, mv = e.moving ? 1 : 0;
        const press = leap ? 0 : smoothstep(0, 0.7, wind), bob = Math.abs(Math.sin(a * 2)) * 0.04 * s * mv;
        this.begin(e.x, e.z, e.face, rise - fall * 0.2 + bob - press * 0.12 * s + (leap ? 0.25 : 0), -flinch + press * 0.3 - (leap ? 0.25 : 0), fall * 2.6 * side, 0.3 * s);
        const swell = 1 + Math.sin(t * 3 + e.id) * 0.04;
        this.blob(0, 0.44 * s, -0.24 * s, 0.68 * s * swell, 0.54 * s * (1 - fall * 0.5) * swell, 0.74 * s * (leap ? 1.15 : 1), O, col, veins, sd);
        this.blob(0, 0.4 * s, 0.26 * s, 0.42 * s, 0.32 * s, 0.42 * s, O, dark, veins, sd + 0.4);
        this.blob(0, 0.56 * s, -0.28 * s, 0.36 * s, 0.3 * s, 0.4 * s, E, [1, 0.5, 0.7], 0.8 + press * 5);
        for (const sx of [-1, 1]) {
          this.blob(sx * 0.1 * s, 0.48 * s, 0.44 * s, 0.07 * s, 0.07 * s, 0.07 * s, E, [1, 0.6, 0.8], 4);
          const snap = press > 0 ? 0.1 + Math.abs(Math.sin(t * 30)) * 0.12 : 0.08;
          this.seg(sx * 0.12 * s, 0.34 * s, 0.42 * s, sx * snap * s, 0.24 * s, 0.78 * s, 0.05 * s, P, bone, hf, ARM, CONE);
          for (let k = 0; k < 3; k++) {
            const fz = (k - 1) * 0.3, ph = Math.sin(a + k * 2.1 + (sx > 0 ? 3.14 : 0)) * 0.16 * (mv ? 1 : 0.1);
            const tz = leap ? (fz * 0.8 - 0.45) : (fz * 1.3 + ph) * (1 + press * 0.25), ty = leap ? 0.18 * s : 0;
            this.limb(sx * 0.2 * s, 0.38 * s, fz * s, sx * (0.62 + press * 0.12) * s, ty, tz * s, 0.36 * s, 0.42 * s, 0.035 * s, O, dark, sx * 0.3, 1.6, 0, veins, sd, 0.012 * s);
          }
        }
        break;
      }
      case 'spitter': {
        // Bloat: a taut, translucent acid sac carried high on spindly legs, with a little
        // tube for a mouth. At rest the sac sloshes and the tube wanders; through the
        // wind-up the legs brace, the sac swells tight and glows from inside, and the tube
        // steadies on its target. After the shot the sac hangs slack for a moment.
        const s = sc, mv = e.moving ? 1 : 0, tight = smoothstep(0, 1, wind);
        const swell = 1 + tight * 0.38 - rec * 0.14 + Math.sin(t * 2.4 + e.id) * 0.03 * (1 - tight);
        const slosh = Math.sin(t * 3.1 + e.id) * 0.06 * (1 - tight), bob = Math.abs(Math.sin(e.animT)) * 0.07 * mv;
        this.begin(e.x, e.z, e.face, rise - fall * fall * 0.4, -flinch - fall * 1.3, Math.sin(e.animT) * 0.05 * mv, 0);
        const J = this.rig({ s: s * 1.12, a: e.animT, m: mv * 0.9, lean: 0.12 - tight * 0.08, long: 0.6, wide: 0.9 + tight * 0.28, crouch: 0.02 + tight * 0.13, stance: tight * 0.6 });
        this.limbs(O, dark, dark, dark, dark, sd, sd, veins * 0.5, 0.72);
        const c = J.chest, cy = c[1] - 0.05 - bob * 0.5, cz = c[2] - 0.1;
        this.blob(0, J.pel[1] + 0.02, J.pel[2], 0.24 * s, 0.2 * s, 0.22 * s, O, dark, veins, sd);
        const sxs = 0.8 * s * swell, sys = 0.78 * s * swell * (1 + slosh), szs = 0.74 * s * swell * (1 - slosh);
        this.blob(0, cy, cz, sxs, sys, szs, O, [0.3, 0.75, 0.15], 0.7 + tight * 2.2, sd + 0.5);
        // Light inside the sac: the warning grows in the body itself, not on the limbs.
        this.blob(0, cy - 0.03, cz + 0.05, sxs * 0.62, sys * 0.62, szs * 0.62, E, [0.5, 1, 0.2], 1.0 + tight * 5.5);
        for (let k = 0; k < 4; k++) { const an = k * 1.57 + 0.6, r = 0.36 * s * swell; this.blob(Math.cos(an) * r, cy + 0.22 * Math.sin(k * 1.9) * s, cz + Math.sin(an) * r, 0.22 * s * swell, 0.22 * s * swell, 0.22 * s * swell, O, [0.5, 1.0, 0.25], 0.8 + tight * 2, sd + k * 0.1); }
        // The tube mouth wanders at rest and locks onto the target as the sac tightens.
        const yaw = Math.sin(t * 1.7 + e.id) * 0.4 * (1 - tight), pitch = 0.2 + Math.sin(t * 1.3 + e.id) * 0.15 * (1 - tight) + tight * 0.1;
        const tx0 = 0, ty0 = cy + 0.1 * s, tz0 = cz + szs * 0.45, len = 0.45 * s;
        const tx1 = tx0 + Math.sin(yaw) * len, ty1 = ty0 + Math.sin(pitch) * len, tz1 = tz0 + Math.cos(yaw) * Math.cos(pitch) * len;
        this.seg(tx0, ty0, tz0, tx1, ty1, tz1, 0.09 * s, O, col, veins, sd, CAPSULE, 0.055 * s);
        this.blob(tx1, ty1, tz1, 0.1, 0.1, 0.06, E, [0.6, 1, 0.2], 2 + tight * 8);
        for (const sx of [-1, 1]) this.blob(sx * 0.07 * s, ty0 + 0.08 * s, tz0 - 0.04 * s, 0.05, 0.05, 0.05, E, [0.9, 1, 0.4], 3);
        break;
      }
      case 'skitter': {
        // Skitter: a narrow trunk slung low between six long splayed legs, so its outline
        // stays open, and a hooked tail held poised over its back. Circling, it keeps its
        // head on the operator and scuttles sideways; the wind-up drops it flat with the
        // hook cocked over its head; the leap stretches it with legs trailing.
        const s = sc, leap = !!e.leap, mv = e.moving ? 1 : 0, a = e.animT * 1.6;
        const cock = leap ? 1 : smoothstep(0, 0.75, wind), low = leap ? 0 : cock * 0.16 + rec * 0.1;
        let face = e.face, lat = 0;
        const pl = this.player;
        if (pl && e.state === 'hunt' && !leap && e.windupT <= 0 && mv) {
          const toP = Math.atan2(pl.z - e.z, pl.x - e.x);
          if (Math.hypot(pl.x - e.x, pl.z - e.z) < 11) { lat = Math.sin(toP - e.face); face = toP; }
        }
        const by = (0.5 - low) * s, stretch = leap ? 1.25 : 1;
        this.begin(e.x, e.z, face, rise - fall * 0.2, -flinch + (leap ? -0.22 : cock * 0.08), fall * 2.8 * side, 0.4 * s);
        this.blob(0, by, -0.02 * s, 0.4 * s, 0.3 * s * (1 - fall * 0.4), 0.8 * s * stretch, O, col, veins, sd);
        this.blob(0, by + 0.02 * s, -0.62 * s, 0.34 * s, 0.32 * s, 0.6 * s, O, dark, veins, sd + 0.2);
        this.blob(0, by + 0.04 * s, 0.5 * s, 0.3 * s, 0.22 * s, 0.32 * s, O, col, veins * 1.5, sd + 0.4);
        for (let k = 0; k < 3; k++) this.blob(0, by + 0.13 * s, (-0.32 + k * 0.28) * s, 0.28 * s, 0.08 * s, 0.2 * s, P, bone, hf, ARM);
        // Tail: up from the abdomen, over the back, and a hook at the end. Swaying at rest,
        // it cocks forward over the head through the wind-up.
        const sw = Math.sin(t * 1.3 + e.id) * 0.1 * (1 - cock);
        const t1 = [sw * 0.4, by + 0.55 * s, -1.05 * s], t2 = [sw, by + (1.0 + cock * 0.1) * s, (-0.72 + cock * 0.42) * s];
        const t3 = [sw * 1.2, by + (0.98 - cock * 0.12) * s, (-0.32 + cock * 0.78) * s], tip = [sw * 1.2, by + (0.72 - cock * 0.2) * s, (-0.2 + cock * 0.95) * s];
        this.seg(0, by + 0.08 * s, -0.86 * s, t1[0], t1[1], t1[2], 0.08 * s, O, dark, veins, sd, CAPSULE, 0.065 * s);
        this.vseg(t1, t2, 0.065 * s, O, dark, veins, sd, 0.05 * s);
        this.vseg(t2, t3, 0.05 * s, O, dark, veins, sd, 0.04 * s);
        this.vseg(t3, tip, 0.07 * s, P, bone, hf, ARM, 0.008 * s, CONE);
        this.seg(t3[0], t3[1], t3[2], t3[0], t3[1] + 0.12 * s, t3[2] - 0.1 * s, 0.035 * s, P, bone, hf, ARM, CONE);
        this.blob(t3[0], t3[1], t3[2], 0.11 * s, 0.11 * s, 0.11 * s, E, col, 1.5 + cock * 6);
        for (const sx of [-1, 1]) {
          this.blob(sx * 0.08 * s, by + 0.12 * s, 0.64 * s, 0.06, 0.06, 0.06, E, [1, 0.6, 1], 3 + cock * 4);
          this.seg(sx * 0.1 * s, by, 0.62 * s, sx * (0.05 + cock * 0.14) * s, by - 0.08 * s, 0.98 * s, 0.045 * s, P, bone, hf, ARM, CONE);
          for (let k = 0; k < 3; k++) {
            // Tripod gait: forward strides when it runs, side steps when it circles.
            const fz = (k - 1) * 0.5, ph = a + k * 2.1 + (sx > 0 ? 3.14 : 0), sn = Math.sin(ph), lift = Math.max(0, Math.cos(ph)) * 0.14 * s * mv;
            const fwd = mv ? Math.sqrt(Math.max(0, 1 - lat * lat)) : 0;
            let fx = sx * (1.05 + cock * 0.18) + sn * 0.22 * lat * mv, fzz = fz * 1.35 + sn * 0.3 * fwd;
            if (leap) { fx = sx * 0.7; fzz = fz * 0.9 - 0.55; }
            this.limb(sx * 0.16 * s, by, fz * 0.7 * s, fx * s, leap ? 0.25 * s : lift, fzz * s, 0.62 * s, 0.72 * s, 0.045 * s, O, dark, sx * 0.35, 1.8, 0, veins * 0.6, sd, 0.012 * s);
          }
        }
        break;
      }
      case 'brute': case 'titan': {
        // Brute: a knuckle-walker built like a wall. The head sits sunk between battered
        // shoulder plates; the weight rolls from fist to fist as it walks. Before a charge
        // it drops and squares its broad back to the lane, pawing at the paving; before a
        // slam it rears up with both fists high. After a charge it stands blown and
        // slumped (the opening); after a slam its fists stay planted.
        // The Titan is its elder: taller and more upright, horned and crowned with crystal
        // growths, a furnace in its chest, and it raises one fist for its slam.
        const titan = e.kind === 'titan', s = (titan ? 2.7 : 1.7) * sc, mv = e.moving ? 1 : 0, a = e.animT * 0.7;
        const charging = e.mode === 'charge', squared = e.pending === 'charge' ? smoothstep(0, 0.6, wind) : 0;
        const rear = e.pending !== 'charge' ? smoothstep(0, 0.8, wind) : 0, slamDown = e.pending !== 'charge' ? smoothstep(0.86, 1, wind) : 0;
        const blown = e.mode === 'recover' && e.pending !== 'slam' ? 1 : 0, planted = e.mode === 'recover' && e.pending === 'slam' ? rec : 0;
        const plant = Math.sin(a), heave = Math.sin(t * 1.6 + e.id) * 0.015;
        const face = e.pending === 'charge' && e.windupT > 0 && e.atkAngle !== undefined ? e.atkAngle : e.face;
        this.begin(e.x, e.z, face, rise - fall * fall * 0.5 * s, -flinch * 0.5 - fall * 1.2, plant * 0.06 * mv * (1 - squared) + Math.sin(t * 5) * 0.02 * blown, 0);
        const up = titan ? 0.28 : 0;
        let lean = 0.8 - up * 1.2 + squared * 0.35 - rear * (0.7 - up) + slamDown * 0.6 + planted * 0.2 + blown * 0.1 + (charging ? 0.25 : 0);
        let crouch = 0.1 + heave + Math.abs(plant) * 0.035 * mv + squared * 0.1 - rear * 0.06 + planted * 0.06 + (charging ? 0.08 : 0);
        // Knuckles: planted in turn while walking, wide and forward when squared up,
        // overhead when rearing, slammed down and flat after.
        // Fist height on the paving, relative to the chest in units of the body scale.
        const gy = 0.17 - (0.93 - crouch) - Math.cos(lean) * 0.5;
        const kx = 0.34 + squared * 0.14, gait = mv && !charging ? 1 : 0;
        let hr = [kx, gy, 0.32 - plant * 0.22 * gait], hl = [-kx, gy, 0.32 + plant * 0.22 * gait];
        hr[1] += Math.max(0, -Math.cos(a)) * 0.12 * gait; hl[1] += Math.max(0, Math.cos(a)) * 0.12 * gait;
        if (squared) { hr = [kx, gy + Math.max(0, Math.sin(t * 13)) * 0.08 * squared, 0.42 + Math.sin(t * 13) * 0.12 * squared]; hl = [-kx, gy, 0.42]; }
        if (charging) { const p2 = Math.sin(e.animT * 0.5); hr = [0.4, gy + Math.max(0, p2) * 0.3, 0.45 + p2 * 0.4]; hl = [-0.4, gy + Math.max(0, -p2) * 0.3, 0.45 - p2 * 0.4]; }
        if (rear) {
          const lift = rear * (1 - slamDown), oneArm = titan;
          hr = [0.26, -0.72 + lift * 1.45 + slamDown * 0.1, 0.3 - lift * 0.25 + slamDown * 0.55];
          hl = oneArm ? [-0.36, -0.5, 0.3] : [-0.26, -0.72 + lift * 1.45 + slamDown * 0.1, 0.3 - lift * 0.25 + slamDown * 0.55];
        }
        if (planted) { hr = [0.42, gy, 0.66]; hl = titan ? [-0.36, gy * 0.7, 0.3] : [-0.42, gy, 0.66]; }
        if (blown) { const br = Math.sin(t * 5.5) * 0.03; lean = 0.95; crouch = 0.16 + br; const g2 = 0.17 - (0.93 - crouch) - Math.cos(lean) * 0.5; hr = [0.36, g2, 0.18]; hl = [-0.36, g2, 0.18]; }
        const J = this.rig({ s, a, m: mv * (charging ? 1.2 : 0.7), lean, wide: 1.5 + squared * 0.22, crouch, long: titan ? 1.75 : 1.85, hr, hl, nod: 0.2 });
        const plate = titan ? [0.25, 0.18, 0.15] : [0.22, 0.24, 0.28], c = J.chest, d = J.sd;
        for (let i = 0; i < 2; i++) {
          const k = i ? 1 : -1;
          this.vseg(J.hip[i], J.kn[i], 0.16 * s, O, dark, veins, sd, 0.12 * s);
          this.vseg(J.kn[i], J.ft[i], 0.12 * s, O, dark, veins, sd, 0.1 * s);
          this.blob(J.ft[i][0], J.ft[i][1] - 0.03 * s, J.ft[i][2] + 0.05 * s, 0.22 * s, 0.14 * s, 0.32 * s, O, dark, veins, sd);
          // Pillar forearms that thicken to the fist, under bolted plates.
          this.vseg(J.sh[i], J.el[i], 0.12 * s, O, col, veins, sd, 0.14 * s);
          this.vseg(J.el[i], J.ha[i], 0.14 * s, O, col, veins, sd, 0.18 * s);
          this.blob(J.ha[i][0], J.ha[i][1], J.ha[i][2], 0.32 * s, 0.26 * s, 0.32 * s, O, dark, veins, sd + 0.2);
          this.plate(J.el[i], J.ha[i], 0.5, 0, 0.07 * s, 0.32 * s, 0.32 * s, 0.13 * s, plate, hf);
          // Shoulder plates ride up above the head on both sides.
          const sh = J.sh[i];
          this.part(BOX, sh[0] + k * 0.04 * s, sh[1] + (0.17 + squared * 0.05) * s, sh[2] - 0.02 * s, 0.42 * s, 0.3 * s, 0.5 * s, k * 0.35, 1, 0.1, P, plate, hf, ARM);
        }
        this.blob(0, J.pel[1], J.pel[2], 0.5 * s, 0.36 * s, 0.4 * s, O, dark, veins, sd);
        this.part(CAPSULE, 0, (J.pel[1] + c[1]) / 2 + 0.04 * s, (J.pel[2] + c[2]) / 2, 0.8 * s, 0.7 * s, 0.52 * s, d[0], d[1], d[2], O, col, veins, sd + 0.1, 0.62, 1);
        // The broad back: one slab across the shoulders, flaring as it squares up.
        const by2 = c[1] + d[2] * 0.24 * s - d[1] * 0.08 * s, bz2 = c[2] - d[1] * 0.24 * s - d[2] * 0.08 * s;
        this.part(BOX, 0, by2, bz2, 0.95 * s, 0.1 * s, 0.62 * s, 0, d[2] + squared * 0.2, -d[1] - squared * 0.3, P, plate, hf, ARM);
        this.part(BOX, 0, c[1] - 0.16 * s, c[2] + 0.22 * s, 0.5 * s, 0.34 * s, 0.1 * s, d[0], d[1], d[2], P, plate, hf, ARM);
        for (let k = 0; k < 4; k++) { const f = k / 3; this.seg(0, J.pel[1] + (0.1 + f * 0.45) * s, J.pel[2] - 0.2 * s + f * d[2] * 0.42 * s, 0, J.pel[1] + (0.24 + f * 0.5 + squared * 0.12) * s, J.pel[2] - 0.48 * s + f * d[2] * 0.3 * s, 0.05 * s, P, bone, hf, ARM, CONE); }
        // Head sunk low and forward between the shoulder plates; it lifts only when rearing.
        const hy = c[1] + (0.02 - squared * 0.08 - blown * 0.12 + rear * 0.1) * s, hz = c[2] + (0.24 + squared * 0.04) * s;
        this.blob(0, hy, hz, 0.26 * s, 0.22 * s, 0.28 * s, O, dark, veins * 1.5, sd + 0.2);
        this.blob(0, hy - 0.1 * s, hz + 0.08 * s, 0.22 * s, 0.1 * s, 0.2 * s, P, bone, hf, ARM);
        this.blob(0, hy + 0.02 * s, hz + 0.13 * s, 0.15 * s, 0.035 * s, 0.03 * s, E, [1, 0.8, 0.3], (3 + wind * 8 + (charging ? 4 : 0)) * (1 - fall), 0, BOX);
        if (titan) {
          for (const sx of [-1, 1]) {
            this.seg(sx * 0.1 * s, hy + 0.06 * s, hz, sx * 0.34 * s, hy + 0.34 * s, hz + 0.14 * s, 0.05 * s, P, bone, hf, ARM, CONE);
            for (let k = 0; k < 3; k++) this.seg(sx * (0.3 + k * 0.05) * s, c[1] + 0.12 * s, c[2] - 0.1 * s, sx * (0.36 + k * 0.1) * s, c[1] + (0.46 + (k % 2) * 0.16) * s, c[2] - (0.2 + k * 0.06) * s, 0.045 * s, E, col, 1.5 + Math.sin(t * 3 + k) * 0.5 + wind * 4, 0, CONE);
          }
          this.part(SPHERE, 0, c[1] - 0.2 * s, c[2] + 0.24 * s, 0.22 * s, 0.22 * s, 0.1 * s, d[0], d[1], d[2], E, [1, 0.5, 0.15], 3 + Math.sin(t * 5) * 1.2 + wind * 8);
          this.glow(e.x, c[1], e.z, 5, col, 0.1 + wind * 0.25);
        }
        break;
      }
      case 'hollow': {
        // Hollow: a starved frame staggering with its arms held out and its head thrown
        // back, around a core in the open ribs. Through the fuse it spreads its arms
        // wide and trembles while the core swells and pulses faster; sprinting, the arms
        // trail behind it.
        const s = sc * 1.1, fuse = smoothstep(0, 1, wind), mv = e.moving ? 1 : 0, run = mv && !fuse ? 1 : 0;
        const shake = fuse * 0.03 * Math.sin(t * 60 + e.id);
        this.begin(e.x, e.z, e.face, rise - fall * fall * 0.3, -flinch - fall * 1.4, Math.sin(e.animT * 0.5) * 0.12 * mv + shake, 0);
        const hr = fuse ? [0.55 * fuse + 0.2, -0.05 + fuse * 0.25, 0.25 - fuse * 0.1] : run ? [0.24, -0.35, -0.35] : [0.24, -0.1, 0.42];
        const hl = fuse ? [-(0.55 * fuse + 0.2), -0.05 + fuse * 0.25, 0.25 - fuse * 0.1] : run ? [-0.24, -0.35, -0.35] : [-0.24, -0.16, 0.38];
        const J = this.rig({ s, a: e.animT * 1.3, m: mv * 1.1, lean: run ? 0.75 : 0.5 - fuse * 0.35, wide: 0.78, long: 1.15, hr, hl, nod: -0.9 - fuse * 0.3 });
        const ash = [0.16, 0.07, 0.05], c = J.chest, d = J.sd, h = J.head;
        this.limbs(O, ash, ash, ash, ash, sd, sd, 0.15 + hf, 0.72);
        this.blob(0, J.pel[1], J.pel[2], 0.24 * s, 0.2 * s, 0.2 * s, O, ash, 0.15 + hf, sd);
        this.vseg(J.pel, c, 0.04 * s, P, bone, hf, ARM);
        const pulse = 2.5 + fuse * 10 + Math.sin(t * (8 + fuse * 30)) * (1 + fuse * 3), r = 0.28 * s * (1 + fuse * 0.7);
        const ky = c[1] - 0.2 * s, kz = c[2] + 0.02 - d[2] * 0.2 * s;
        this.blob(0, ky, kz, r, r * 1.15, r, E, col, pulse * (1 - fall));
        // Rib hoops open at the front, wider as the core swells.
        for (let k = 0; k < 5; k++) { const y = ky + (k - 2) * 0.085 * s, o2 = 1 + fuse * 0.4; for (const sx of [-1, 1]) { this.seg(0, y + 0.03, kz - 0.17 * s, sx * 0.2 * s * o2, y, kz - 0.02, 0.018 * s, P, bone, hf, ARM); this.seg(sx * 0.2 * s * o2, y, kz - 0.02, sx * 0.12 * s * o2, y - 0.03, kz + 0.19 * s, 0.016 * s, P, bone, hf, ARM, CAPSULE, 0.006 * s); } }
        // Light bleeds through cracks in the shins only.
        for (let i = 0; i < 2; i++) this.vseg(J.kn[i], J.ft[i], 0.02 * s, E, col, 1 + fuse * 5);
        this.blob(h[0], h[1], h[2], 0.2 * s, 0.25 * s, 0.22 * s, O, ash, 0.2 + hf, sd);
        this.blob(h[0], h[1] + 0.03 * s, h[2] + 0.07 * s, 0.1 * s, 0.14 * s, 0.1 * s, E, col, 1.5 + fuse * 8);
        this.glow(e.x, 1.25, e.z, 1.2 + fuse * 1.5, col, (0.2 + fuse * 0.6) * (1 - fall));
        break;
      }
      case 'mote': {
        // Mote: an eye in a shell of plates trailing jointed tendrils, drifting and
        // bobbing. Charging its beam it draws back and up, the plates open into a flat
        // ring around the eye, and the tendrils stiffen and stream out behind.
        const s = sc, charge = smoothstep(0, 0.9, wind), y = (2.3 + Math.sin(t * 2 + e.id) * 0.2 * (1 - charge) + charge * 0.25) * (1 - fall * 0.85);
        this.begin(e.x, e.z, e.face, y, -flinch + fall * 1.2 - charge * 0.15, fall * 0.8 * side, 0);
        const back = -charge * 0.25 * s;
        this.blob(0, 0, back, 0.56 * s, 0.56 * s, 0.56 * s, O, [0.08, 0.26, 0.36], (0.5 + hf) * (1 - fall), sd);
        this.blob(0, 0, back + 0.12 * s, 0.4 * s, 0.4 * s, 0.36 * s, E, col, (1.8 + charge * 8 + hf * 3) * (1 - fall));
        this.blob(0, 0, back + 0.28 * s, 0.16 * s, 0.2 * s, 0.08 * s, P, [0.01, 0.02, 0.03], 0, ARM);
        const open = 0.34 + charge * 0.3;
        for (let k = 0; k < 6; k++) {
          const an = k * 1.047 + t * (0.5 + charge * 3), cx = Math.cos(an), sy = Math.sin(an);
          // Closed, the plates cup the eye from behind; open, they lie flat like a ring.
          this.part(BOX, cx * open * s, sy * open * s, back - 0.04 * s + charge * 0.1 * s, 0.22 * s, 0.34 * s, 0.05 * s, cx * (0.5 + charge * 0.5), sy * (0.5 + charge * 0.5), -0.8 + charge * 0.8, P, [0.2, 0.3, 0.36], hf, ARM);
        }
        for (let k = 0; k < 5; k++) {
          const an = k * 1.257 + 0.3, sway = Math.sin(t * 3 + k) * 0.18 * (1 - charge), r0 = 0.2 * s;
          const mx = Math.cos(an) * (r0 + 0.1) + sway * 0.5, mz = Math.sin(an) * (r0 + 0.1) - 0.2 - charge * 0.5, my = -0.8 * s + charge * 0.45 * s;
          this.seg(Math.cos(an) * r0, -0.24 * s, back + Math.sin(an) * r0, mx, my, back + mz, 0.04 * s, O, dark, veins, sd, CAPSULE, 0.025 * s);
          this.seg(mx, my, back + mz, mx + sway, my - (0.65 - charge * 0.45) * s, back + mz - 0.25 - charge * 0.6, 0.025 * s, O, dark, veins, sd, CAPSULE, 0.006 * s);
        }
        this.glow(e.x, y, e.z, 1.4 + charge * 1.5, col, (0.25 + charge * 0.6) * (1 - fall));
        break;
      }
      case 'lobber': {
        // Lobber: a shelled tripod with a mortar tube and a counterweight tail. It
        // lurches on three legs with the tube slowly scanning; through the wind-up it
        // braces its legs wide, tips its shell back, raises the tube and lifts the tail,
        // and the tube kicks at the shot.
        const s = sc * 1.2, a = e.animT, mv = e.moving ? 1 : 0, brace = smoothstep(0, 0.7, wind), kick = rec;
        const by = (0.78 - brace * 0.12) * s * (1 - fall * 0.6) + Math.abs(Math.sin(a * 1.5)) * 0.05 * s * mv;
        this.begin(e.x, e.z, e.face, rise - fall * 0.1, -flinch * 0.5 - brace * 0.18 - kick * 0.08, fall * 0.5 * side + Math.sin(a * 1.5) * 0.05 * mv, by);
        this.blob(0, by, 0, 0.95 * s, 0.6 * s, 1.0 * s, O, dark, veins, sd);
        for (let k = 0; k < 4; k++) this.blob(0, by + (0.2 - k * 0.02) * s, (0.3 - k * 0.22) * s, (0.8 - k * 0.06) * s, 0.16 * s, 0.3 * s, P, [0.24, 0.22, 0.17], hf, ARM);
        for (let k = 0; k < 3; k++) {
          const an = k * 2.094 + 1.05, ph = Math.sin(a + k * 2) * 0.18 * mv, reach = 0.95 + brace * 0.22;
          this.limb(Math.cos(an) * 0.32 * s, by - 0.05, Math.sin(an) * 0.32 * s, Math.cos(an) * reach * s, 0, (Math.sin(an) * reach + ph) * s, 0.6 * s, 0.66 * s, 0.09 * s, O, dark, Math.cos(an), 1.5, Math.sin(an), veins, sd, 0.03 * s);
        }
        // Counterweight tail lifts as the tube rises.
        this.seg(0, by, -0.4 * s, 0, by + (0.25 + brace * 0.4) * s, -1.0 * s, 0.13 * s, O, dark, veins, sd, CAPSULE, 0.06 * s);
        this.blob(0, by + (0.26 + brace * 0.4) * s, -1.05 * s, 0.24 * s, 0.24 * s, 0.24 * s, P, [0.24, 0.22, 0.17], hf, ARM);
        const scan = Math.sin(t * 0.6 + e.id) * 0.25 * (1 - brace), elev = 0.35 + brace * 0.65 - kick * 0.25, L = 0.95 * s;
        const ty = by + 0.15 * s + Math.sin(elev) * L, tz = -0.1 * s + Math.cos(elev) * L * Math.cos(scan), tx = Math.cos(elev) * L * Math.sin(scan);
        this.seg(0, by + 0.15 * s, -0.1 * s, tx, ty, tz, (0.2 + brace * 0.05) * s, P, [0.2, 0.19, 0.16], hf, ARM, CYL, (0.17 + brace * 0.04) * s);
        this.seg(0, by + 0.5 * s, 0.1 * s, tx * 0.25, by + 0.6 * s, 0.14 * s, 0.24 * s, P, [0.3, 0.26, 0.16], hf, ARM, CYL);
        this.blob(tx, ty + 0.02, tz, 0.22 * s, 0.08 * s, 0.22 * s, E, col, (0.8 + brace * 6 + kick * 3) * (1 - fall));
        for (const sx of [-1, 1]) this.blob(sx * 0.16 * s, by + 0.06 * s, 0.46 * s, 0.08 * s, 0.08 * s, 0.06 * s, E, col, 3);
        break;
      }
      case 'matron': {
        this.begin(e.x, e.z, e.face, 0, 0, 0, 0);
        if (e.burrowed) {
          this.ring(e.x, e.z, 3.2, col, 1.2, 0.2, 0.25);
          for (let k = 0; k < 6; k++) this.blob(Math.cos(k * 1.05) * 1.6, 0.3, Math.sin(k * 1.05) * 1.6, 1.5, 0.9, 1.5, O, col, 0.8, k * 0.2);
          break;
        }
        const a = e.animT * 0.8, stag = e.staggerT > 0 ? -0.6 : 0, up = 2.2 + stag + Math.sin(t * 2) * 0.08;
        this.blob(0, up - 0.1, -1.9, 3.4, 2.6, 4.0, O, col, em, 0.13);
        this.blob(0, up + 0.1, 0.4, 2.4, 1.9, 2.6, O, dark, em, 0.3);
        for (let k = 0; k < 4; k++) this.blob(0, up + 1.0 - k * 0.06, 0.9 - k * 0.6, 2.0 - k * 0.1, 0.4, 0.7, P, [0.24, 0.16, 0.2], hf, ARM);
        this.blob(0, up + 0.5, 2.0, 1.5, 1.3, 1.5, O, col, em * 1.4, 0.4);
        this.blob(0, up + 0.6, 2.7, 0.9, 0.22, 0.2, E, [1, 0.85, 0.3], 6 + wind * 10, 0, BOX);
        for (const sx of [-1, 1]) this.seg(sx * 0.45, up + 0.25, 2.5, sx * (0.12 + wind * 0.3), up - 0.6, 3.6, 0.22, P, bone, hf, ARM, CONE);
        for (let k = 0; k < 5; k++) this.blob(((k % 3) - 1) * 0.95, up + 0.9 + (k % 2) * 0.3, -1.2 - k * 0.5, 1.1, 1.1, 1.1, O, [0.9, 0.5, 0.15], 2.2 + Math.sin(t * 3 + k) * 0.8, 0.7 + k * 0.1);
        for (let k = 0; k < 6; k++) {
          const sx = k < 3 ? -1 : 1, fz = ((k % 3) - 1) * 1.7, ph = Math.sin(a + k * 2.1) * 0.45 * (e.moving ? 1 : 0.15);
          this.limb(sx * 1.1, up, fz + 0.3, sx * 3.4, 0, fz + ph + 0.4, 2.3, 2.6, 0.24, O, dark, sx * 0.3, 1.8, 0, em * 0.5, 0.2, 0.05);
        }
        this.glow(e.x, 2.5, e.z, 6, col, 0.12 + wind * 0.2);
        break;
      }
      case 'cyst': {
        const g = e.glow || 0, pulse = 1 + Math.sin(t * 4 + e.id) * 0.06 + g * 0.15;
        this.begin(e.x, e.z, 0);
        this.blob(0, 1.1 * pulse, 0, 2.2 * pulse, 2.4 * pulse, 2.2 * pulse, O, col, 1.5 + g * 3 + hf, sd);
        this.blob(0, 1.1 * pulse, 0, 1.4 * pulse, 1.6 * pulse, 1.4 * pulse, E, col, 0.8 + g * 4);
        for (let k = 0; k < 5; k++) this.seg(Math.cos(k * 1.26) * 0.7, 0.5, Math.sin(k * 1.26) * 0.7, Math.cos(k * 1.26) * 1.7, 0, Math.sin(k * 1.26) * 1.7, 0.2, O, dark, 1 + g * 2, sd + k * 0.1, CAPSULE, 0.05);
        this.glow(e.x, 1.4, e.z, 2.6, col, 0.2 + g * 0.5);
        break;
      }
      case 'dummy': {
        this.begin(e.x, e.z, e.face, 0, -Math.min(0.25, hf * 0.3));
        this.blob(0, 0.04, 0, 0.6, 0.08, 0.6, P, [0.1, 0.1, 0.12], 0, ARM, CYL);
        this.seg(0, 0, 0, 0, 1.2, 0, 0.05, P, [0.12, 0.12, 0.14], 0, ARM, CYL);
        this.part(CAPSULE, 0, 1.3, 0, 0.44, 0.7, 0.24, 0, 1, 0, P, [0.22, 0.25, 0.29], hf * 1.5, ARM, 0.7, 1);
        this.blob(0, 1.82, 0, 0.24, 0.28, 0.24, P, [0.22, 0.25, 0.29], hf * 1.5, ARM);
        this.blob(0, 1.38, 0.125, 0.26, 0.26, 0.02, E, col, 3, 0, CYL);
        this.seg(-0.4, 1.5, 0, 0.4, 1.5, 0, 0.04, P, [0.12, 0.12, 0.14], 0, ARM, CYL);
        break;
      }
      default: break;
    }
    if (e.elite && !fall) {
      for (let k = 0; k < e.elite.length; k++) {
        const ac = AFFIXES[e.elite[k]].color, a = t * 2 + k * 3.14;
        this.ring(e.x, e.z, e.r * 1.9 + 0.5 + k * 0.4, ac, 0.75, 0.93);
        this.box(e.x + Math.cos(a) * 0.5, 2.6 * sc + (e.kind === 'brute' ? 1.2 : 0), e.z + Math.sin(a) * 0.5, 0.2, 0.3, 0.2, a, E, ac, 6, 0, CONE);
      }
      if (e.plate > 0) this.ring(e.x, e.z, e.r * 1.5, [0.45, 0.65, 1], 0.5, 0.82, 0.04);
    }
  }

  drawEnemyXray(e) {
    if (this.nx >= 400) return;
    const s = (e.scale || 1) * (e.kind === 'brute' ? 1.75 : 1), h = e.kind === 'skitter' || e.kind === 'mite' ? 0.7 : 1.85 * s, wd = e.kind === 'skitter' ? 1.0 : 0.6 * s;
    const d = this.xray, o = this.nx++ * INST_FLOATS, yaw = (Math.PI / 2 - e.face) / 2;
    d[o] = e.x; d[o + 1] = h / 2; d[o + 2] = e.z; d[o + 3] = P;
    d[o + 4] = wd; d[o + 5] = h; d[o + 6] = wd * 0.6; d[o + 7] = 1.4;
    d[o + 8] = 0; d[o + 9] = Math.sin(yaw); d[o + 10] = 0; d[o + 11] = Math.cos(yaw);
    d[o + 12] = 1; d[o + 13] = 0.12; d[o + 14] = 0.55; d[o + 15] = 1;
    d[o + 16] = 0; d[o + 17] = 0; d[o + 18] = 0; d[o + 19] = 0;
  }

  // ---- props and points of interest ----
  drawContainer(c, st, t) {
    const opened = st.opened;
    const col = st.hostKnown ? [0.55, 1.0, 0.35] : [0.2, 0.85, 1.0];
    let top = 0.8;
    if (c.kind === 'dumpster') {
      top = 1.15;
      this.box(c.x, 0.6, c.z, 1.0, 1.0, 0.95, 0, MAT.FREIGHT, [0.05, 0.14, 0.1]);
      this.box(c.x, opened ? 1.5 : 1.16, c.z + (opened ? 0.45 : 0), 1.04, 0.08, 0.98, 0, P, [0.04, 0.09, 0.07], 0, ARM, opened ? WEDGE : BOX);
      for (const s of [-0.38, 0.38]) this.box(c.x + s, 0.08, c.z, 0.12, 0.16, 0.8, 0, P, [0.02, 0.02, 0.02], 0, 0, SPHERE);
    } else if (c.kind === 'locker') {
      top = 1.75;
      this.box(c.x, 0.875, c.z, 0.9, 1.75, 0.6, 0, MAT.ENAMEL, [0.12, 0.14, 0.19]);
      this.box(c.x + (opened ? 0.42 : 0), 0.9, c.z + (opened ? 0.52 : 0.31), opened ? 0.04 : 0.8, 1.6, opened ? 0.5 : 0.03, 0, P, [0.16, 0.18, 0.24], 0, ARM);
      if (!opened) this.box(c.x + 0.25, 0.95, c.z + 0.33, 0.06, 0.16, 0.03, 0, E, col, 4);
    } else {
      this.box(c.x, 0.4, c.z, 0.95, 0.8, 0.8, 0, MAT.FREIGHT, [0.2, 0.16, 0.1]);
      for (const s of [-0.3, 0.3]) this.box(c.x + s, 0.4, c.z, 0.07, 0.84, 0.84, 0, P, [0.07, 0.07, 0.08], 0, ARM);
      this.box(c.x, opened ? 0.95 : 0.83, c.z + (opened ? -0.42 : 0), 0.99, 0.07, 0.84, 0, MAT.FREIGHT, [0.16, 0.13, 0.08]);
    }
    if (!opened) {
      if (c.kind !== 'locker') this.box(c.x, top + 0.04, c.z, 0.5, 0.04, 0.1, 0, E, col, 3.5);
      if (st.hostKnown) {
        this.glow(c.x, top * 0.6, c.z, 1.8, [0.6, 0.3, 0.9], 0.5 + 0.2 * Math.sin(t * 5 + c.id));
        for (let k = 0; k < 3; k++) this.box(c.x + Math.cos(k * 2.1) * 0.25, top + 0.15, c.z + Math.sin(k * 2.1) * 0.25, 0.36, 0.34, 0.36, 0, O, [0.5, 0.9, 0.3], 1.6, 0.3 + k * 0.2, SPHERE);
      } else this.glow(c.x, top + 0.2, c.z, 0.7, col, 0.2);
    }
  }

  drawPoi(p, st, t) {
    const x = p.x, z = p.z;
    switch (p.type) {
      case 'cache': {
        const used = st.used, col = [0.2, 0.9, 1.0];
        this.box(x, 0.45, z, 1.1, 0.9, 0.8, 0.4, MAT.FREIGHT, [0.09, 0.11, 0.14]);
        this.box(x, used ? 1.15 : 0.95, z, 1.14, 0.12, 0.84, 0.4 + (used ? 0.5 : 0), P, [0.14, 0.16, 0.2], 0, ARM);
        this.box(x, 0.5, z, 1.14, 0.08, 0.84, 0.4, E, col, used ? 0.3 : 4);
        if (!used) { this.streak(x, 1, z, x, 9, z, 0.35, col, 0.5); this.glow(x, 1.2, z, 1.6, col, 0.4); }
        break;
      }
      case 'shrine': {
        const used = st.used, col = [1.0, 0.15, 0.25];
        this.box(x, 0.2, z, 1.3, 0.4, 1.3, 0, P, [0.13, 0.11, 0.12], 0, 1, CYL);
        this.box(x, 1.6, z, 0.5, 2.6, 0.5, t * (used ? 0 : 0.6), P, [0.1, 0.07, 0.08], 0, ARM, CONE);
        this.box(x, 3.3 + (used ? 0 : Math.sin(t * 2) * 0.12), z, 0.5, 0.7, 0.5, -t, E, col, used ? 0.4 : 7, 0, SPHERE);
        if (!used) { this.ring(x, z, 2.2, col, 1.1 + 0.4 * Math.sin(t * 3), 0.9, 0.04); this.glow(x, 3.3, z, 2.2, col, 0.45); }
        break;
      }
      case 'terminal': {
        const used = st.used, col = [0.45, 0.6, 1.0];
        this.box(x, 0.55, z, 0.7, 1.1, 0.45, 0, MAT.GLOSS, [0.08, 0.09, 0.12]);
        this.box(x, 1.2, z + 0.1, 0.8, 0.1, 0.5, 0, P, [0.12, 0.13, 0.16], 0, ARM, WEDGE);
        this.box(x, 1.85, z, 1.0, 0.62, 0.05, 0, MAT.HOLO, col, used ? 0.5 : 4, 0.3);
        if (!used) this.glow(x, 1.85, z, 1.5, col, 0.35);
        if (st.progress > 0 && !used) this.ring(x, z, 1.6, col, 2, 1 - st.progress, 0.0);
        break;
      }
      case 'broker': {
        const col = [1.0, 0.7, 0.2];
        this.box(x, 1.2, z - 1.4, 3.0, 2.4, 1.0, 0, P, [0.16, 0.12, 0.09], 0, 1);
        this.box(x, 2.55, z - 0.6, 3.4, 0.5, 1.4, Math.PI, P, [0.3, 0.1, 0.08], 0, FAB, WEDGE);
        this.box(x, 1.0, z - 0.75, 2.6, 0.12, 0.5, 0, P, [0.1, 0.08, 0.06], 0, ARM);
        this.box(x, 3.2, z - 1.4, 3.2, 0.6, 0.15, 0, MAT.SIGN, col, 5, 0.7);
        this.drawCivilian({ id: p.id, look: 13, x, z: z - 1.05, face: Math.PI / 2, animT: 0, moving: false, state: 'civ', isMimic: false, shimmer: 0 }, t, 0);
        this.glow(x, 2.2, z, 2.6, col, 0.25);
        break;
      }
      case 'extract': {
        const col = [0.2, 1.0, 0.45], pulse = 1.2 + 0.5 * Math.sin(t * 2.5);
        this.ring(x, z, p.r, col, pulse, 0.93, 0.05);
        this.ring(x, z, p.r * 0.5, col, 0.6, 0.9);
        this.streak(x, 0, z, x, 120, z, 1.6, col, 0.55);
        if (st.progress > 0) this.ring(x, z, p.r * 0.96, [0.6, 1, 0.7], 2.5, 1 - st.progress * 0.95, 0.0);
        break;
      }
      case 'nest': if (!st.used) this.ring(x, z, p.r, [1.0, 0.1, 0.55], 0.7 + 0.3 * Math.sin(t * 2), 0.96, 0.02); break;
      case 'boss': {
        const col = [1.0, 0.55, 0.15];
        if (!st.used) { this.ring(x, z, p.r, col, 1.4 + 0.5 * Math.sin(t * 3), 0.9, 0.06); this.streak(x, 0, z, x, 30, z, 0.8, col, 0.5); }
        if (st.progress > 0 && !st.used) this.ring(x, z, p.r * 0.9, [1, 0.8, 0.4], 2.5, 1 - st.progress, 0);
        break;
      }
      default: break;
    }
  }

  // ---- frame build ----
  // The city going about its night: a train on the viaduct, patrol drones with
  // searchlights, aircraft, steam from the vents, shafts under the lamps and rain
  // splashing on the ground. Stateless: everything is a function of time.
  drawAmbience(w, t, fx, fz, nl) {
    const S = w.size, net = w.net, n = w.n, rainK = this.opts.rain;
    if (net) {
      const period = 52, run = 30, k = Math.floor(t / period), ph = (t - k * period) / run;
      if (ph < 1) {
        const dir = k % 2 ? -1 : 1, cars = 4, CL = 19, span = S + 240 + cars * CL, z = net.railZ;
        const head = dir > 0 ? -120 + ph * span : S + 120 - ph * span;
        const stripe = k % 3 === 0 ? [0.5, 0.1, 0.08] : k % 3 === 1 ? [0.06, 0.26, 0.4] : [0.42, 0.34, 0.06];
        for (let i = 0; i < cars; i++) {
          const x = head - dir * (i * CL + CL / 2);
          if (x < -160 || x > S + 160) continue;
          this.box(x, 11.95, z, CL - 0.6, 2.9, 2.9, 0, MAT.GLOSS + 16, [0.4, 0.42, 0.45]);
          this.box(x, 12.45, z, CL - 2.4, 0.85, 2.96, 0, E + 16, [1.0, 0.9, 0.7], 1.5);
          this.box(x, 11.15, z, CL - 0.58, 0.32, 2.94, 0, P + 16, stripe, 0, ARM);
          this.box(x, 10.42, z, CL - 5, 0.5, 2.2, 0, P + 16, [0.05, 0.05, 0.06], 0, ARM);
          this.box(x, 13.52, z, CL - 4, 0.24, 1.5, 0, P + 16, [0.2, 0.21, 0.22], 0, ARM);
          for (const d of [-CL * 0.3, 0, CL * 0.3]) this.box(x + d, 11.6, z, 1.3, 2.0, 2.98, 0, P + 16, [0.2, 0.21, 0.23], 0, ARM);
        }
        for (const o of [-0.9, 0.9]) { this.glow(head, 11.3, z + o, 1.5, [1.0, 0.95, 0.8], 2.2); this.glow(head - dir * cars * CL, 11.3, z + o, 1.0, [1.0, 0.1, 0.08], 2.0); }
        // The pantograph arcs on the wire now and then.
        if (hash2(Math.floor(t * 18), 7) > 0.78) { const sx = head - dir * CL * 1.5; this.glow(sx, 14.6, z + 1.7, 1.6, [0.6, 0.8, 1.0], 4); this.extra.push([sx, 13, z, 26, 0.5, 0.7, 1.0, 1.6]); }
        const mid = clamp(fx, Math.min(head, head - dir * cars * CL), Math.max(head, head - dir * cars * CL));
        if (Math.abs(mid - fx) < 90 && Math.abs(z - fz) < 90) this.extra.push([mid, 9.5, z, 30, 1.0, 0.85, 0.6, 1.3]);
      }
    }
    // Patrol drones: a slow orbit, navigation lights and a searchlight sweeping the streets.
    for (let i = 0; i < 4; i++) {
      const cx = S * (0.22 + 0.56 * hash2(i, 31)), cz = S * (0.22 + 0.56 * hash2(i, 32)), rad = 34 + 60 * hash2(i, 33), sp = (0.1 + 0.08 * hash2(i, 34)) * (i % 2 ? -1 : 1);
      const a = t * sp + i * 1.7, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad, y = 21 + 12 * hash2(i, 35) + Math.sin(t * 0.7 + i) * 0.8;
      if (Math.abs(x - fx) > 170 || Math.abs(z - fz) > 170) continue;
      const yaw = -a - (sp > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI / 2;
      this.box(x, y, z, 1.0, 0.24, 0.7, yaw, P + 16, [0.07, 0.075, 0.085], 0, ARM);
      for (let q = 0; q < 4; q++) { const an = q * 1.571 + 0.785 - yaw; this.box(x + Math.cos(an) * 0.75, y + 0.12, z + Math.sin(an) * 0.75, 0.62, 0.02, 0.62, t * 40, P + 16, [0.2, 0.21, 0.23], 0, 0, CYL); }
      if ((t * 1.3 + i * 0.37) % 1 < 0.5) this.glow(x, y + 0.2, z, 0.5, [1.0, 0.1, 0.08], 3);
      if ((t * 0.9 + i * 0.6) % 1 < 0.08) this.glow(x, y - 0.1, z, 1.2, [1.0, 1.0, 1.0], 4);
      // The beam points ahead of the drone and wanders.
      const gx = x - Math.sin(a) * Math.sign(sp) * 10 + Math.sin(t * 0.5 + i * 2) * 6, gz = z + Math.cos(a) * Math.sign(sp) * 10 + Math.cos(t * 0.37 + i) * 6;
      this.streak(x, y - 0.15, z, gx, 0.2, gz, 2.4, [0.5, 0.7, 1.0], 0.05);
      this.streak(x, y - 0.15, z, gx, 0.2, gz, 0.7, [0.6, 0.8, 1.0], 0.08);
      this.ring(gx, gz, 3.4, [0.5, 0.7, 1.0], 0.22, 0.0, 0.55);
      if (Math.abs(gx - fx) < 70 && Math.abs(gz - fz) < 70 && this.extra.length < 4) this.extra.push([gx, 3.5, gz, 11, 0.55, 0.75, 1.0, 1.5]);
    }
    // Aircraft high over the city.
    for (let i = 0; i < 2; i++) {
      const x = ((t * (9 + i * 4) + i * 420) % (S + 800)) - 400, z = S * (0.2 + 0.6 * i) + x * (i ? -0.3 : 0.2);
      this.glow(x, 150 + i * 40, z, 2.5, [1, 1, 1], (t * 1.1 + i * 0.5) % 1 < 0.12 ? 5 : 0.6);
      this.glow(x - 3, 150 + i * 40, z, 1.8, [1.0, 0.1, 0.08], 1.5);
    }
    const bx0 = clamp(Math.floor(fx / 100), 0, n - 1), bz0 = clamp(Math.floor(fz / 100), 0, n - 1);
    let shafts = 0;
    for (let bz = Math.max(0, bz0 - 1); bz <= Math.min(n - 1, bz0 + 1); bz++) {
      for (let bx = Math.max(0, bx0 - 1); bx <= Math.min(n - 1, bx0 + 1); bx++) {
        const B = w.blocks[bz * n + bx];
        // Steam rolling off vents, stalls and exhaust stacks.
        for (let vi = 0; vi < B.vents.length; vi++) {
          const v = B.vents[vi], dx = v.x - fx, dz = v.z - fz;
          if (dx * dx + dz * dz > 42 * 42) continue;
          const y0 = v.y || 0.1, seed = v.x * 7.3 + v.z * 3.1;
          for (let q = 0; q < 5; q++) {
            const f = (t * 0.42 + q / 5 + seed) % 1, lift = f * (2.6 + (seed % 1.3));
            this.glow(v.x + Math.sin(seed + f * 4 + q) * 0.5 * f + f * 0.6, y0 + lift, v.z + Math.cos(seed * 1.3 + f * 3) * 0.4 * f, 0.5 + f * 1.5, [0.075, 0.08, 0.09], Math.sin(f * Math.PI) * 0.75);
          }
        }
        // A shaft of lit rain under each street lamp.
        for (const L of B.lights) {
          if (L[3] !== 25 || shafts >= 26) continue;
          const dx = L[0] - fx, dz = L[2] - fz;
          if (dx * dx + dz * dz > 60 * 60) continue;
          shafts++;
          // Seen from above a shaft is just a haze over the road, so it is kept faint there.
          const sk = this.cam.shoulder ? 1 : 0.3;
          this.streak(L[0], L[1] + 0.3, L[2], L[0], 0.15, L[2], 3.0, [L[4], L[5], L[6]], 0.028 * sk * (0.5 + 0.5 * nl) * (0.5 + 0.5 * rainK));
          this.glow(L[0], L[1] + 0.35, L[2], 1.5, [L[4], L[5], L[6]], 0.9 * sk);
        }
      }
    }
    // Rain striking the ground around the operator.
    const drops = Math.floor(90 * rainK), span = 30;
    for (let i = 0; i < drops; i++) {
      const rate = 1.5 + hash2(i, 13), ph = t * rate + hash2(i, 14) * 9, cyc = Math.floor(ph), f = ph - cyc;
      const hx = (hash2(i, 11) * span + hash2(i, cyc % 89) * 9) % span, hz = (hash2(i, 12) * span + hash2(cyc % 83, i) * 9) % span;
      const x = hx + span * Math.round((fx - hx) / span), z = hz + span * Math.round((fz - hz) / span);
      if (w.cell(x, z) === 1) continue;
      this.ring(x, z, 0.03 + 0.15 * f, [0.5, 0.6, 0.75], (1 - f) * 0.2, 0.72, 0, 0, 0, 0.03);
    }
  }

  build(raid, input, dt, aspect) {
    this.counts.fill(0); this.ns = 0; this.nx = 0;
    this.time += dt;
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const t = this.time, w = raid.world, p = raid.player, c = this.cam;
    this.updateCamera(raid, input, dt, aspect);
    const fx = this.px, fz = this.pz, nl = raid.nl;

    this.drawPlayer(raid, t);
    // Enemies in view get full models; the horde beyond it is skipped.
    const view = c.shoulder ? 110 : 62, view2 = view * view;
    this.player = p;   // creatures that circle keep their heads on the operator
    for (const e of raid.enemies) {
      if (e.dead) continue;
      const d2 = (e.x - fx) * (e.x - fx) + (e.z - fz) * (e.z - fz);
      if (d2 > view2) continue;
      this.drawEnemy(e, t);
    }
    // The freshly dead: they buckle, topple and sink.
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      if (g.t >= g.life) { this.ghosts.splice(i, 1); continue; }
      this.drawEnemy(g.e, t, smoothstep(0, 1, Math.min(1, g.t / Math.min(0.55, g.life * 0.6))) * (1 + Math.max(0, g.t - g.life * 0.6) * 0.8), g.side);
    }
    const cc = CLASSES[p.classId].color;
    for (const s of raid.summons) {
      if (s.kind === 'sentry') {
        for (let k = 0; k < 3; k++) { const an = k * 2.094; this.wseg(s.x, 0.6, s.z, s.x + Math.cos(an) * 0.55, 0, s.z + Math.sin(an) * 0.55, 0.04, P, [0.12, 0.13, 0.15], 0, ARM, CAPSULE, 0.02); }
        this.box(s.x, 0.75, s.z, 0.36, 0.34, 0.36, 0, P, [0.14, 0.15, 0.18], 0, ARM, CYL);
        this.begin(s.x, s.z, s.face);
        this.blob(0, 1.05, 0.05, 0.3, 0.26, 0.5, P, [0.12, 0.13, 0.16], 0, ARM, BOX);
        this.seg(0, 1.05, 0.25, 0, 1.05, 0.85, 0.04, P, [0.06, 0.06, 0.07], 0, ARM, CYL);
        this.blob(0, 1.2, 0, 0.1, 0.06, 0.1, E, cc, 6 + (s.buffT > 0 ? 6 : 0));
        this.ring(s.x, s.z, 0.9, cc, 0.9, 0.8, 0.04);
        // The lane it holds: a faint sector out to its range and a chevron on the floor along the facing.
        if (s.lane !== null) {
          const ux = Math.cos(s.lane), uz = Math.sin(s.lane), k = s.post ? 1 : 0.55;
          this.ring(s.x, s.z, s.shot.shotRange, cc, 0.32 * k, 0.985, 0.035 * k, s.shot.halfArc, s.lane);
          this.streak(s.x + ux * 1.1, 0.08, s.z + uz * 1.1, s.x + ux * 3.2, 0.08, s.z + uz * 3.2, 0.07, cc, 1.4 * k);
          for (const side of [-1, 1]) this.streak(s.x + ux * 3.2, 0.08, s.z + uz * 3.2, s.x + ux * 2.6 - uz * 0.45 * side, 0.08, s.z + uz * 2.6 + ux * 0.45 * side, 0.06, cc, 1.4 * k);
        }
      } else {
        const y = 2.3 + Math.sin(t * 4 + s.id) * 0.15;
        this.box(s.x, y, s.z, 0.34, 0.16, 0.34, 0, P, [0.14, 0.15, 0.18], 0, ARM, SPHERE);
        for (let k = 0; k < 4; k++) { const an = k * 1.57 + 0.78; this.box(s.x + Math.cos(an) * 0.3, y + 0.06, s.z + Math.sin(an) * 0.3, 0.26, 0.02, 0.26, t * 30, P, [0.3, 0.32, 0.36], 0, 0, CYL); }
        this.box(s.x, y - 0.1, s.z, 0.12, 0.1, 0.12, 0, E, cc, 6, 0, SPHERE);
        this.glow(s.x, y, s.z, 0.9, cc, 0.35);
      }
    }
    const n = w.n, bx0 = clamp(Math.floor(fx / 100), 0, n - 1), bz0 = clamp(Math.floor(fz / 100), 0, n - 1);
    for (let bz = Math.max(0, bz0 - 1); bz <= Math.min(n - 1, bz0 + 1); bz++) {
      for (let bx = Math.max(0, bx0 - 1); bx <= Math.min(n - 1, bx0 + 1); bx++) {
        const blk = w.blocks[bz * n + bx];
        for (const k of blk.containers) if (Math.abs(k.x - fx) < 80 && Math.abs(k.z - fz) < 80) this.drawContainer(k, raid.cont[k.id], t);
        for (const poi of blk.pois) if (poi.type !== 'extract') this.drawPoi(poi, raid.poi[poi.id], t);
      }
    }
    for (const e of w.extractions) { if (!e) continue; const st = raid.poi[e.id]; if (st.known && Math.hypot(e.x - fx, e.z - fz) < 900) this.drawPoi(e, st, t); }
    for (const k of raid.pickups) {
      if (Math.abs(k.x - fx) > 70 || Math.abs(k.z - fz) > 70) continue;
      const col = k.col || RARITY[k.rarity || 0].color;
      if (k.kind === 'xp') {
        const y = 0.35 + Math.sin(t * 4 + k.id) * 0.08, s = 0.16 + Math.min(0.2, k.amount * 0.006);
        this.box(k.x, y + s * 0.5, k.z, s, s, s, t * 3 + k.id, E, col, 3.5, 0, CONE);
        this.emit(CONE, k.x, y - s * 0.5, k.z, s, s, s, 1, 0, 0, 0, E, col, 3.5);
        continue;
      }
      const y = 0.55 + Math.sin(t * 3 + k.id) * 0.12;
      this.box(k.x, y, k.z, 0.34, 0.34, 0.34, t * 2 + k.id, E, col, 4, 0, k.kind === 'gear' ? BOX : SPHERE);
      this.glow(k.x, y, k.z, 1.0, col, 0.4);
      if ((k.rarity || 0) >= 1 || k.kind === 'item') this.streak(k.x, 0.6, k.z, k.x, 5 + (k.rarity || 0) * 1.5, k.z, 0.22, col, 0.6);
    }
    // Plate fragments: flat steel shards lying on the floor with a hot pink edge and a ring that
    // shrinks as they time out. Loot floats, spins and casts a beam; a fragment never does.
    for (const f of raid.fragments) {
      const life = clamp(f.t / f.life, 0, 1), pulse = f.t < 1.5 ? 0.55 + 0.45 * Math.sin(t * 14) : 1;
      this.begin(f.x, f.z, f.face);
      this.blob(0, 0.05, 0, 0.6, 0.06, 0.42, P, [0.3, 0.32, 0.36], 0, ARM, WEDGE);
      this.blob(0.2, 0.06, -0.16, 0.32, 0.05, 0.24, P, [0.22, 0.23, 0.26], 0, ARM, WEDGE);
      this.blob(0, 0.1, 0.17, 0.5, 0.015, 0.03, E, FRAGMENT_COL, 4.5 * pulse, 0, BOX);
      this.ring(f.x, f.z, 0.8, FRAGMENT_COL, 1.5 * pulse, 0.84, 0.1, Math.max(0.05, Math.PI * life), f.face);
    }
    for (const pr of raid.projectiles) {
      if (pr.kind === 'bullet') continue;
      const y = pr.y ?? 1.2, s = (pr.size || 0.5) * 0.42;
      this.box(pr.x, y, pr.z, s, s, s, 0, E, pr.col, 5, 0, SPHERE);
    }
    if (raid.markers) for (const m of raid.markers) { this.ring(m.x, m.z, m.r || 2, m.col || [0.3, 0.9, 1], 1.4 + 0.5 * Math.sin(t * 4), 0.88, 0.05); this.streak(m.x, 0, m.z, m.x, 8, m.z, 0.4, m.col || [0.3, 0.9, 1], 0.5); }

    for (const e of raid.enemies) {
      if (e.dead) continue;
      if (e.outlineT > 0 && e.isMimic) this.drawEnemyXray(e);
      // A radio Order: an inverted amber cone over the target and a lock ring at its feet.
      if (e.st.orderT > 0) {
        const top = (e.kind === 'brute' ? 4.2 : e.kind === 'titan' ? 6.4 : 2.9) * (e.scale || 1) + Math.sin(t * 6) * 0.08;
        this.emit(CONE, e.x, top, e.z, 0.34, 0.42, 0.34, 1, 0, 0, 0, E, ORDER_COL, 6);
        this.ring(e.x, e.z, e.r * 1.6 + 0.35, ORDER_COL, 1.3 + 0.4 * Math.sin(t * 8), 0.86, 0.06);
      }
      if (e.linkT > 0 && e.isMimic && e.state !== 'hunt') this.streak(p.x, 1.3, p.z, e.x, 1.3, e.z, 0.05, [1, 0.15, 0.6], 0.5 + e.aware);
      // A charging Mote shows its beam line before it fires.
      if (e.kind === 'mote' && e.windupT > 0 && e.aimX !== undefined) this.streak(e.x, 2.3, e.z, e.aimX, 1.2, e.aimZ, 0.05 + 0.1 * (1 - e.windupT / e.windupMax), [0.4, 0.9, 1], 1.5);
    }

    // -- sprites --
    for (const pr of raid.projectiles) {
      const col = pr.col;
      if (pr.kind === 'bullet') {
        const l = Math.hypot(pr.vx, pr.vz) || 1;
        this.streak(pr.x - pr.vx / l * 1.8, 1.3, pr.z - pr.vz / l * 1.8, pr.x, 1.3, pr.z, 0.07, col, 5);
      } else {
        this.glow(pr.x, pr.y ?? 1.2, pr.z, pr.size || 0.5, col, 1.6);
        if (pr.owner === 'enemy') { this.ring(pr.x, pr.z, 0.55, col, 1.6, 0.6, 0.3); if (pr.vx || pr.vz) this.streak(pr.x - pr.vx * 0.12, pr.y ?? 1.2, pr.z - pr.vz * 0.12, pr.x, pr.y ?? 1.2, pr.z, 0.16, col, 1.5); }
      }
    }
    for (const a of raid.areas) {
      if (Math.abs(a.x - fx) > 90 || Math.abs(a.z - fz) > 90) continue;
      const life = a.life > 0 ? clamp(a.t / a.life, 0, 1) : 0;
      if (a.kind === 'tele') {
        // Danger zone: a hard outline, a faint floor, a fill that sweeps out to the edge,
        // and a white flash in the last moments so the timing reads at a glance.
        const col = a.col || [1, 0.15, 0.1], last = life > 0.78 ? 0.5 + 0.5 * Math.sin(t * 50) : 0;
        // A Brute's charge: the locked lane itself, constant width, filling from the Brute out.
        if (a.lane) { const L = a.lane; this.lane(L.x, L.z, L.ux, L.uz, L.len, L.hw, [col[0] + last, col[1] + last, col[2] + last], 2.4 + last * 2, life); continue; }
        this.ring(a.x, a.z, a.r, col, 2.8 + last * 2, 0.92, 0.1, a.half || 0, a.angle || 0);
        this.ring(a.x, a.z, a.r * life, [col[0] + last, col[1] + last, col[2] + last], 1.3, 0.0, 0.38, a.half || 0, a.angle || 0);
      } else if (a.kind === 'cloud') {
        const col = a.col, fade = Math.min(1, (a.life - a.t) * 2, a.t * 4);
        this.ring(a.x, a.z, a.r, col, 0.8 * fade, 0.93, 0.1);
        for (let k = 0; k < 6; k++) {
          const an = k * 1.05 + t * 0.4 + a.id, rr = a.r * 0.55 * (0.4 + 0.6 * hash2(a.id, k));
          this.glow(a.x + Math.cos(an) * rr, 1.0 + 0.5 * Math.sin(t + k), a.z + Math.sin(an) * rr, a.r * 0.7, col, 0.16 * fade);
        }
      } else {
        const col = a.col, fade = Math.min(1, (a.life - a.t) * 2);
        this.ring(a.x, a.z, a.r, col, 1.0 * fade, 0.9, 0.22);
        if (a.kind === 'fire') this.glow(a.x, 0.5, a.z, a.r * 1.4, col, 0.5 * fade);
      }
    }
    if (raid.bossArena && raid.bossArena.sealed) { const A = raid.bossArena; this.ring(A.x, A.z, A.r, [1, 0.3, 0.2], 1.6 + 0.4 * Math.sin(t * 5), 0.985, 0); }
    if (!p.dead && !p.hidden && !c.shoulder) {
      const dx = input.aimX - p.x, dz = input.aimZ - p.z, l = Math.hypot(dx, dz) || 1;
      this.streak(p.x + dx / l * 1.2, 1.25, p.z + dz / l * 1.2, p.x + dx / l * Math.min(l, 9), 1.25, p.z + dz / l * Math.min(l, 9), 0.025, cc, 0.5);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      const f = 1 - r.life / r.max;
      if (r.arc) this.ring(r.x, r.z, r.radius, r.col, r.k * (1 - f), 0.55, 0.25, r.arc, r.angle, 1.1);
      else this.ring(r.x, r.z, r.radius * (0.25 + 0.75 * f), r.col, r.k * (1 - f), 0.82, 0.04);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) { this.beams.splice(i, 1); continue; }
      this.streak(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, b.width, b.col, b.k * (b.life / b.max));
    }
    const Pt = this.pool;
    for (let i = 0; i < Pt.n; i++) {
      Pt.life[i] -= dt;
      if (Pt.life[i] <= 0) {
        const l = --Pt.n;
        Pt.x[i] = Pt.x[l]; Pt.y[i] = Pt.y[l]; Pt.z[i] = Pt.z[l]; Pt.vx[i] = Pt.vx[l]; Pt.vy[i] = Pt.vy[l]; Pt.vz[i] = Pt.vz[l];
        Pt.life[i] = Pt.life[l]; Pt.max[i] = Pt.max[l]; Pt.size[i] = Pt.size[l]; Pt.r[i] = Pt.r[l]; Pt.g[i] = Pt.g[l]; Pt.b[i] = Pt.b[l]; Pt.grav[i] = Pt.grav[l];
        i--; continue;
      }
      Pt.vy[i] -= Pt.grav[i] * dt;
      Pt.x[i] += Pt.vx[i] * dt; Pt.y[i] += Pt.vy[i] * dt; Pt.z[i] += Pt.vz[i] * dt;
      if (Pt.y[i] < 0.05) { Pt.y[i] = 0.05; Pt.vy[i] *= -0.3; Pt.vx[i] *= 0.6; Pt.vz[i] *= 0.6; }
      const f = Pt.life[i] / Pt.max[i];
      this.sprite(Pt.x[i], Pt.y[i], Pt.z[i], Pt.size[i] * (0.5 + f), Pt.r[i] * f * 2.2, Pt.g[i] * f * 2.2, Pt.b[i] * f * 2.2, 0);
    }
    this.fx.update(raid, dt, t);

    this.extra.length = 0;
    if (!w.annex) this.drawAmbience(w, t, fx, fz, nl);

    // Rain: world-anchored streaks wrapped around the camera target.
    const wetness = w.annex ? 0 : 0.75 + 0.25 * nl;
    if (!w.annex) {
      const count = Math.floor((500 + 900 * nl) * this.opts.rain), span = 70, hgt = 17;
      for (let i = 0; i < count; i++) {
        const hx = hash2(i, 1) * span, hz = hash2(i, 2) * span, sp = 26 + hash2(i, 3) * 12;
        const x = hx + span * Math.round((c.tx - hx) / span), z = hz + span * Math.round((c.tz - hz) / span);
        const y = hgt - ((t * sp + hash2(i, 4) * hgt) % hgt);
        this.sprite(x, y, z, 0.02, 0.16, 0.2, 0.26, 2, 0.06, -1, 0.02, 0.9);
      }
    }

    // -- globals --
    const g = this.r.globals, annex = w.annex ? 1 : 0;
    g.set(c.vp, GO.viewProj);
    // Key light: the Lantern, high in the north. Shadows cover a square around the operator.
    let Lx = 0.3, Ly = 0.72, Lz = -0.62;
    const Ll = Math.hypot(Lx, Ly, Lz); Lx /= Ll; Ly /= Ll; Lz /= Ll;
    const sx = Math.round(fx / 2) * 2, sz = Math.round(fz / 2) * 2, ext = c.free ? 14 : c.shoulder ? 95 : 70;
    mat4LookAt(this.lview, sx + Lx * 220, Ly * 220, sz + Lz * 220, sx, 0, sz);
    mat4Ortho(this.lproj, -ext, ext, -ext, ext, 20, 460);
    mat4Mul(this.lvp, this.lproj, this.lview);
    g.set(this.lvp, GO.lightVP);
    const put4 = (o, a, b, cc2, d) => { g[o] = a; g[o + 1] = b; g[o + 2] = cc2; g[o + 3] = d; };
    put4(GO.camPos, c.ex, c.ey, c.ez, t);
    put4(GO.camRight, c.right[0], c.right[1], c.right[2], c.tanX);
    put4(GO.camUp, c.up[0], c.up[1], c.up[2], c.tanY);
    put4(GO.camFwd, c.fwd[0], c.fwd[1], c.fwd[2], 2 * c.tanY / Math.max(1, this.r.height));
    put4(GO.focus, fx, 1, fz, c.cut);
    // Dusk fades to deep night: fog, ambient and the key light darken and cool (doc 17).
    put4(GO.fog, lerp(0.045, 0.016, nl), lerp(0.032, 0.026, nl), lerp(0.07, 0.05, nl), annex ? 0.002 : lerp(0.0045, 0.0065, nl));
    put4(GO.ambient, lerp(0.15, 0.07, nl), lerp(0.13, 0.1, nl), lerp(0.22, 0.18, nl), nl);
    put4(GO.world, w.size, w.n, annex, wetness);
    put4(GO.lightDir, Lx, Ly, Lz, this.r.opts.shadows ? 0.92 : 0);
    put4(GO.lightCol, lerp(0.3, 0.14, nl), lerp(0.24, 0.27, nl), lerp(0.36, 0.34, nl), 0);
    const sf = raid.scanFx;
    if (sf && sf.t < 1.4) put4(GO.scan, sf.x, sf.z, Math.min(1, sf.t / 0.7) * SCAN_RANGE, clamp(1.4 - sf.t, 0, 1)); else g[GO.scan + 3] = 0;

    // Lights: operator, flashes, then the nearest static lights with a distance fade.
    let nlights = 0;
    const putLight = (x, y, z, radius, r, gg, b, inten) => {
      if (nlights >= MAX_LIGHTS) return;
      const o = GO.lights + nlights++ * 8;
      g[o] = x; g[o + 1] = y; g[o + 2] = z; g[o + 3] = radius; g[o + 4] = r; g[o + 5] = gg; g[o + 6] = b; g[o + 7] = inten;
    };
    if (c.free && c.free.key) {
      // Portrait lighting: a warm key from the front and a class-coloured rim from behind.
      const k = c.free.key;
      putLight(k[0], k[1], k[2], 12, 1.0, 0.88, 0.76, 1.7);
      putLight(2 * p.x - k[0] + 1.2, 2.6, 2 * p.z - k[2], 9, cc[0], cc[1], cc[2], 2.2);
    } else putLight(p.x, 3.2, p.z, 13, 0.6 + cc[0] * 0.4, 0.6 + cc[1] * 0.4, 0.6 + cc[2] * 0.4, 0.7);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) { this.flashes.splice(i, 1); continue; }
      if (nlights < 9) putLight(f.x, f.y, f.z, f.radius, f.col[0], f.col[1], f.col[2], f.intensity * (f.life / f.max));
    }
    for (const L of this.extra) putLight(L[0], L[1], L[2], L[3], L[4], L[5], L[6], L[7]);
    const cand = this.lightScratch;
    cand.length = 0;
    const lx = c.free ? p.x : c.shoulder ? p.x + c.fwd[0] * 14 : c.tx, lz = c.free ? p.z : c.shoulder ? p.z + c.fwd[2] * 14 : c.tz;
    const lbx = clamp(Math.floor(lx / 100), 0, n - 1), lbz = clamp(Math.floor(lz / 100), 0, n - 1), lim = c.shoulder ? 130 : 75;
    for (let bz = Math.max(0, lbz - 1); bz <= Math.min(n - 1, lbz + 1); bz++) {
      for (let bx = Math.max(0, lbx - 1); bx <= Math.min(n - 1, lbx + 1); bx++) {
        for (const L of w.blocks[bz * n + bx].lights) {
          const d = Math.hypot(L[0] - lx, L[2] - lz) - L[3] * 0.5;
          if (d < lim) cand.push(d, L);
        }
      }
    }
    const want = MAX_LIGHTS - nlights, picked = [];
    for (let i = 0; i < cand.length; i += 2) picked.push(i);
    picked.sort((a, b) => cand[a] - cand[b]);
    const cutoff = picked.length > want ? cand[picked[want]] : 1e9;
    for (let k = 0; k < Math.min(want, picked.length); k++) {
      const d = cand[picked[k]], L = cand[picked[k] + 1];
      const fade = picked.length > want ? smoothstep(cutoff, cutoff * 0.7, d) : 1;
      putLight(L[0], L[1], L[2], L[3], L[4], L[5], L[6], L[7] * fade);
    }
    let nblob = 0;
    const putBlob = (x, z, r, s) => { if (nblob >= MAX_BLOBS) return; const o = GO.blobs + nblob++ * 4; g[o] = x; g[o + 1] = z; g[o + 2] = r; g[o + 3] = s; };
    if (!p.dead && !p.hidden) putBlob(p.x, p.z, 1.0, 0.6);
    for (const e of raid.enemies) {
      if (e.dead || nblob >= MAX_BLOBS) continue;
      const d2 = (e.x - fx) * (e.x - fx) + (e.z - fz) * (e.z - fz);
      if (d2 < 14 * 14) putBlob(e.x, e.z, e.r * 2.2, 0.5);
    }
    put4(GO.misc, nlights, nblob, annex ? 0 : 1, this.r.texReady && this.r.opts.textures ? 1 : 0);

    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.4);
    this.healFlash = Math.max(0, this.healFlash - dt * 1.2);
    const post = this.r.post;
    const low = p.maxHp > 0 && p.hp / p.maxHp < 0.3 && !p.dead && !p.hidden ? 0.12 + 0.08 * Math.sin(t * 6) : 0;
    // Bloom eases off (doc 43) but still rises as the shops light up through the night.
    post[0] = lerp(0.34, 0.46, nl) * (this.opts.bloom ?? 1); post[1] = 1.15; post[2] = this.damageFlash + low; post[3] = t;
    this.hitPulse = Math.max(0, this.hitPulse - dt * 5);
    post[4] = 1.25; post[5] = 0.012 + this.hitPulse * 0.05; post[6] = this.healFlash; post[7] = sf && sf.t < 1 ? (1 - sf.t) * 0.5 : 0;
    // Depth of field: focus on the operator from above, on the aim point over the shoulder.
    const fd = c.free ? Math.hypot(c.ex - p.x, c.ey - 1.2, c.ez - p.z) : c.shoulder ? Math.max(8, Math.hypot(c.ex - input.aimX, c.ey - 1.2, c.ez - input.aimZ)) : Math.hypot(c.ex - fx, c.ey - 1, c.ez - fz);
    post[8] = fd; post[9] = this.opts.dof ? (c.free ? 1.6 : c.shoulder ? 0.55 + (input.aimHeld ? 0.5 : 0) : 0.5) : 0; post[10] = 0.35; post[11] = this.hitPulse;
    let nr = 0;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      if (r.t >= r.life) { this.ripples.splice(i, 1); continue; }
      project(c.vp, r.x, r.y, r.z, this.tmp);
      if (this.tmp[2] <= 0.5 || nr >= 4) continue;
      const f = r.t / r.life, o = 16 + nr++ * 4;
      post[o] = this.tmp[0] * 0.5 + 0.5; post[o + 1] = 1 - (this.tmp[1] * 0.5 + 0.5);
      post[o + 2] = (r.radius * (0.15 + 0.85 * f)) / (2 * this.tmp[2] * c.tanY); post[o + 3] = r.strength * (1 - f) * (1 - f);
    }
    post[12] = nr; post[13] = aspect; post[14] = 0; post[15] = 0;

    this.frame.xrayCount = this.nx;
    this.frame.spriteCount = this.ns;
    this.frame.focusX = fx; this.frame.focusZ = fz;
    this.frame.reach = c.shoulder ? 9 : 5;
    // Blocks wholly behind a level camera are not drawn.
    const fl = Math.hypot(c.fwd[0], c.fwd[2]);
    this.frame.cull = fl > 0.6 ? [c.ex, c.ez, c.fwd[0] / fl, c.fwd[2] / fl] : null;
    return this.frame;
  }
}
