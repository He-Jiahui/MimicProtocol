// Impacts by material (doc 31, Package 5): after a shot the operator should be able to
// tell what it struck. Bright flecks skip off metal and a hot streak cools on it;
// safety glass whitens around the hole; plaster and brick puff dust and keep a dark
// hole; flesh splashes wet. The simulation reports hits without a material, so this
// side classifies them: a wall contact by the static geometry at that point, a body
// by the creature's kind and the side that was struck. Bullets are followed between
// frames so a tracer ends at its real contact point, and rounds that pass through a
// parked car or a vending machine (low obstacles do not stop them) mark its glass or
// panels on the way.
//
// Render-side only: reads the simulation, never writes it. Math.random is fine here.

import { INST_FLOATS, MAT, SHAPE, SHAPE_COUNT, SUB } from '../sim/emit.js';

const { BOX, SPHERE, CYL, CAPSULE } = SHAPE;
const BULLET_Y = 1.3;
const MAX_DECALS = 40, MAX_BITS = 260, MAX_CRACKS = 24;
// Body extents [bottom, top] in metres before scale, for the height of a contact.
const BODY_Y = {
  walker: [0.5, 1.75], spitter: [0.6, 1.9], hollow: [0.5, 1.75], mite: [0.12, 0.55], skitter: [0.25, 0.95], brute: [0.6, 2.5],
  titan: [1.0, 4.2], mote: [1.9, 2.8], lobber: [0.45, 1.9], matron: [1.2, 4.6], cyst: [0.3, 2.5], dummy: [0.9, 2.0], civ: [0.5, 1.75],
};
// What a body is made of where a round lands. Plates and shells only face forward.
const FLESH = { walker: 1, spitter: 1, hollow: 1, cyst: 1, civ: 1 };
const SHELLS = { mite: 1, skitter: 1 };
const PLATED_FRONT = { brute: 1, titan: 1 };
const HUMAN_BLOOD = [0.2, 0.012, 0.01];
const MIMIC_BLOOD = { walker: [0.3, 0.03, 0.14], spitter: [0.16, 0.34, 0.04], hollow: [0.32, 0.12, 0.02], mite: [0.32, 0.06, 0.16], skitter: [0.26, 0.05, 0.3], brute: [0.3, 0.03, 0.06], titan: [0.34, 0.08, 0.02], mote: [0.06, 0.24, 0.32], lobber: [0.3, 0.24, 0.04], matron: [0.3, 0.02, 0.14], cyst: [0.22, 0.3, 0.05] };

// The facade shader's shopHash, bit for bit, so a round finds the same open shop or
// shutter the shader drew.
const fract = (v) => v - Math.floor(v);
export function shopHash(cx, cy, seed, side) {
  let h = (Math.imul(cx | 0, 747796405) + Math.imul(cy | 0, 2891336453 | 0) + Math.imul(Math.floor(Math.fround(seed) * 64) | 0, 277803737) + Math.imul((side + 8) | 0, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519 | 0) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h >>> 8) / 16777216;
}
// Rotate v by quaternion q (x, y, z, w).
function qrot(qx, qy, qz, qw, vx, vy, vz, out) {
  const cx = qy * vz - qz * vy + qw * vx, cy = qz * vx - qx * vz + qw * vy, cz = qx * vy - qy * vx + qw * vz;
  out[0] = vx + 2 * (qy * cz - qz * cy); out[1] = vy + 2 * (qz * cx - qx * cz); out[2] = vz + 2 * (qx * cy - qy * cx);
  return out;
}

// The first static instance a ray meets: { t, mat, sub, nx, ny, nz, o, data }.
// Boxes stand in for every shape, which is close enough for walls, cars and kiosks.
const tmpO = [0, 0, 0], tmpD = [0, 0, 0], tmpN = [0, 0, 0];
export function firstSurface(world, ox, oy, oz, dx, dy, dz, maxT) {
  let best = null;
  const n = world.n, B = world.size / n, reach = 30;
  const bx0 = Math.max(0, Math.floor((Math.min(ox, ox + dx * maxT) - reach) / B)), bx1 = Math.min(n - 1, Math.floor((Math.max(ox, ox + dx * maxT) + reach) / B));
  const bz0 = Math.max(0, Math.floor((Math.min(oz, oz + dz * maxT) - reach) / B)), bz1 = Math.min(n - 1, Math.floor((Math.max(oz, oz + dz * maxT) + reach) / B));
  const ex = ox + dx * maxT * 0.5, ey = oy + dy * maxT * 0.5, ez = oz + dz * maxT * 0.5, half = maxT * 0.5;
  for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) {
    const b = bz * n + bx;
    for (let s = 0; s < SHAPE_COUNT; s++) {
      const sh = world.shapes[s], d = sh.data;
      if (!d.length) continue;
      const first = sh.range[b * 2], count = sh.range[b * 2 + 1];
      for (let i = first; i < first + count; i++) {
        const o = i * INST_FLOATS;
        const hx = d[o + 4] / 2, hy = d[o + 5] / 2, hz = d[o + 6] / 2, rb = Math.sqrt(hx * hx + hy * hy + hz * hz);
        const cx = d[o] - ex, cy = d[o + 1] - ey, cz = d[o + 2] - ez;
        if (cx * cx + cy * cy + cz * cz > (rb + half) * (rb + half)) continue;
        const mat = Math.round(d[o + 3]) & 15;
        // Slab test in the instance's own frame.
        const qx = -d[o + 8], qy = -d[o + 9], qz = -d[o + 10], qw = d[o + 11];
        qrot(qx, qy, qz, qw, ox - d[o], oy - d[o + 1], oz - d[o + 2], tmpO);
        qrot(qx, qy, qz, qw, dx, dy, dz, tmpD);
        let t0 = 0, t1 = maxT, axis = -1, sign = 0;
        const h = [hx, hy, hz];
        let miss = false;
        for (let k = 0; k < 3; k++) {
          if (Math.abs(tmpD[k]) < 1e-6) { if (Math.abs(tmpO[k]) > h[k]) { miss = true; break; } continue; }
          let ta = (-h[k] - tmpO[k]) / tmpD[k], tb = (h[k] - tmpO[k]) / tmpD[k], sg = -1;
          if (ta > tb) { const q = ta; ta = tb; tb = q; sg = 1; }
          if (ta > t0) { t0 = ta; axis = k; sign = sg; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) { miss = true; break; }
        }
        if (miss || axis < 0 || (best && t0 >= best.t)) continue;
        tmpN[0] = tmpN[1] = tmpN[2] = 0; tmpN[axis] = sign;
        const wn = qrot(-qx, -qy, -qz, qw, tmpN[0], tmpN[1], tmpN[2], [0, 0, 0]);
        best = { t: t0, mat, sub: Math.round(d[o + 16]), nx: wn[0], ny: wn[1], nz: wn[2], o, data: d, shape: s };
      }
    }
  }
  return best;
}

// Material class of a static surface at a contact: metal, glass, masonry, wood, soft, leaf, flesh.
export function surfaceClass(hit, px, py, pz) {
  const { mat, sub } = hit;
  if (mat === MAT.FACADE) {
    // Ground floor of a solid building: shop glass, a rolled shutter or the wall between.
    const d = hit.data, o = hit.o, seed = d[o + 16], cw = Math.max(d[o + 18], 1), ch = 3.3;
    if (py >= ch) return 'masonry';
    const alongX = Math.abs(hit.nx) <= 0.5, u = alongX ? px : pz;
    const cell = Math.floor(u / cw), f = [fract(u / cw), fract(py / ch)];
    const side = Math.round(Math.abs(hit.nx) * 17 + hit.nz * 5 + hit.nx * 3);
    const open = shopHash(cell, Math.floor(py / ch), seed, side) >= 0.35;
    if (f[1] > 0.76 && f[1] < 0.96) return 'glass';                // lit fascia board
    const inX = f[0] > 0.05 && f[0] < 0.95, inY = f[1] > 0.08 && f[1] < 0.72;
    if (!inX || !inY) return 'masonry';
    const edge = Math.min((f[0] - 0.05) * cw, (0.95 - f[0]) * cw, (f[1] - 0.08) * ch, (0.72 - f[1]) * ch);
    if (edge < 0.08) return 'metal';                               // window frame
    return open ? 'glass' : 'metal';
  }
  // Paper posters glow faintly; lit boards, tubes and panels are glass or acrylic.
  if (mat === MAT.SIGN && hit.data[hit.o + 7] < 1) return 'soft';
  if (mat === MAT.GLOSS || mat === MAT.SIGN || mat === MAT.HOLO || mat === MAT.EMISSIVE) return 'glass';
  if (mat === MAT.ENAMEL || mat === MAT.FREIGHT) return 'metal';
  if (mat === MAT.ORGANIC || mat === MAT.SHELL) return 'flesh';
  if (mat === MAT.FOLIAGE) return 'leaf';
  if (sub === SUB.METAL || sub === SUB.CORRUGATED || sub === SUB.BARS || sub === SUB.HAZARD) return 'metal';
  if (sub === SUB.TIMBER) return 'wood';
  if (sub === SUB.FABRIC || sub === SUB.RUBBER) return 'soft';
  return 'masonry';
}

// What a body hit strikes: flesh, a shell, or armour plate on the side facing the shot.
export function bodyClass(kind, face, fromX, fromZ, disguised) {
  if (disguised || FLESH[kind]) return 'flesh';
  if (SHELLS[kind]) return 'chitin';
  if (kind === 'lobber' || kind === 'mote' || kind === 'dummy') return 'plate';
  const toShooter = Math.atan2(fromZ, fromX), diff = Math.abs(Math.atan2(Math.sin(toShooter - face), Math.cos(toShooter - face)));
  if (PLATED_FRONT[kind]) return diff < Math.PI / 3 ? 'plate' : 'flesh';
  if (kind === 'matron') return diff < Math.PI / 2 ? 'chitin' : 'flesh';
  return 'flesh';
}

export class Impacts {
  constructor(scene) {
    this.s = scene;
    this.raid = null;
    this.trace = new Map();      // projectile id -> last drawn position and velocity
    this.bits = [];              // sparks, glints, dust, chips and drops
    this.decals = [];            // holes in plaster, bare-metal gouges
    this.cracks = [];            // whitened safety glass
    this.marks = [];             // hot streaks cooling on metal
    this.muzzles = [];
    this.flashSeen = new WeakMap();
    this.cache = new Map();      // wall cell and face -> surface, for repeated fire at one wall
  }

  // ---- events from the simulation ----
  muzzle(e) {
    const p = this.raid && this.raid.player;
    let dx = 1, dz = 0;
    if (p) { const l = Math.hypot(e.x - p.x, e.z - p.z) || 1; dx = (e.x - p.x) / l; dz = (e.z - p.z) / l; }
    const col = e.col || [1, 0.72, 0.4];
    // A short, hot light at the barrel: it lights the operator, the wet street and the wall beside it.
    this.s.flash(e.x - dx * 0.05, 1.35, e.z - dz * 0.05, col, 7, 3.2, 0.05);
    if (this.muzzles.length < 12) this.muzzles.push({ x: e.x - dx * 0.05, z: e.z - dz * 0.05, dx, dz, col, life: 0.05, max: 0.05, seed: Math.random() * 6.283 });
  }
  tracer(e) {
    // Sentry rounds: end on the body's surface at its height, not at its centre.
    const tgt = this.bodyAt(e.x2, e.z2);
    let x2 = e.x2, z2 = e.z2, y2 = BULLET_Y;
    if (tgt) {
      const dx = e.x2 - e.x, dz = e.z2 - e.z, l = Math.hypot(dx, dz) || 1, r = Math.min(tgt.r || 0.5, l * 0.9);
      x2 -= dx / l * r; z2 -= dz / l * r; y2 = this.bodyY(tgt);
      this.sentryShot = { x: e.x, z: e.z, tx: e.x2, tz: e.z2 };
    }
    this.s.beam(e.x, 1.05, e.z, x2, y2, z2, e.col || [1, 0.9, 0.6], e.life || 0.06, e.w || 0.05, e.k || 4);
  }
  hit(e) {
    const tgt = this.bodyAt(e.x, e.z), p = this.raid && this.raid.player;
    const kind = tgt ? (tgt.state === 'civ' || tgt.state === 'flee' ? 'civ' : tgt.kind) : 'walker';
    // Where did it come from? A round we were following, a sentry, or the operator's reach.
    let fx, fz, fy = BULLET_Y, shot = null;
    const r = tgt ? tgt.r || 0.5 : 0.5;
    shot = this.matchBullet(e.x, e.z, r + 0.7, false);
    if (shot) { fx = -shot.vx; fz = -shot.vz; }
    else if (this.sentryShot && Math.abs(this.sentryShot.tx - e.x) < 1e-3 && Math.abs(this.sentryShot.tz - e.z) < 1e-3) { fx = this.sentryShot.x - e.x; fz = this.sentryShot.z - e.z; fy = 1.05; }
    else if (p) { fx = p.x - e.x; fz = p.z - e.z; }
    else { fx = 1; fz = 0; }
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const y = tgt ? this.bodyY(tgt, fy) : fy;
    const cx = e.x + fx * r * 0.9, cz = e.z + fz * r * 0.9;
    if (shot) this.s.beam(shot.x, BULLET_Y, shot.z, cx, y, cz, shot.col, 0.04, 0.07, 5);
    const disguised = tgt && this.lookHuman(tgt);
    const cls = bodyClass(tgt ? tgt.kind : 'walker', tgt ? tgt.face : 0, fx, fz, disguised);
    const melee = !shot && !(this.sentryShot && fy === 1.05) && p && Math.hypot(p.x - e.x, p.z - e.z) < 4.5;
    this.body(cx, y, cz, fx, fz, cls, disguised ? HUMAN_BLOOD : MIMIC_BLOOD[kind] || MIMIC_BLOOD.walker, !!e.big, melee);
  }
  wallHit(e) {
    const shot = this.matchBullet(e.x, e.z, 0.6, true);
    let dx, dz;
    if (shot) { const l = Math.hypot(shot.vx, shot.vz) || 1; dx = shot.vx / l; dz = shot.vz / l; }
    else { const p = this.raid && this.raid.player; const l = p ? Math.hypot(e.x - p.x, e.z - p.z) || 1 : 1; dx = p ? (e.x - p.x) / l : 1; dz = p ? (e.z - p.z) / l : 0; }
    if (shot && shot.owner === 'enemy') { this.acid(e.x, e.z, dx, dz, shot.col); return; }
    // The face may stand a little proud of the grid edge (a shutter, a door, a kiosk).
    const surf = this.surfaceAt(e.x, e.z, dx, dz), x = e.x + dx * surf.off, z = e.z + dz * surf.off;
    if (shot) this.s.beam(shot.x, BULLET_Y, shot.z, x, BULLET_Y, z, shot.col, 0.04, 0.07, 5);
    this.surface(x, BULLET_Y, z, dx, 0, dz, surf, true);
  }

  // ---- per frame: follow rounds, catch silent hits, draw what is alive ----
  update(raid, dt, t) {
    this.raid = raid;
    const live = new Set();
    for (const pr of raid.projectiles) {
      if (pr.kind === 'lob') continue;
      live.add(pr.id);
      let tr = this.trace.get(pr.id);
      if (!tr) { tr = { x: pr.x, z: pr.z, vx: pr.vx, vz: pr.vz, col: pr.col || [1, 0.85, 0.55], owner: pr.owner, passed: null }; this.trace.set(pr.id, tr); }
      else if (pr.owner === 'player' && pr.kind === 'bullet') this.passThrough(tr, pr);
      tr.x = pr.x; tr.z = pr.z; tr.vx = pr.vx; tr.vz = pr.vz;
    }
    for (const id of this.trace.keys()) if (!live.has(id)) this.trace.delete(id);
    this.sentryShot = null;
    // Civilians and figures still in disguise flinch without a hit event: splash them too.
    for (const e of raid.enemies) {
      if (e.dead) continue;
      const prev = this.flashSeen.get(e) || 0;
      if (e.hitFlash > prev + 0.01 && (e.state === 'civ' || e.state === 'flee')) {
        const p = raid.player, fx = p.x - e.x, fz = p.z - e.z, l = Math.hypot(fx, fz) || 1;
        this.body(e.x + fx / l * 0.4, this.bodyY(e), e.z + fz / l * 0.4, fx / l, fz / l, 'flesh', HUMAN_BLOOD, false, l < 4.5);
      }
      this.flashSeen.set(e, e.hitFlash);
    }
    this.draw(dt, t);
  }

  // ---- classification helpers ----
  bodyAt(x, z) {
    if (!this.raid) return null;
    let best = null, bd = 2.25;
    for (const e of this.raid.enemies) {
      const d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
      if (d < bd) { bd = d; best = e; }
      if (d < 1e-8) break;
    }
    return best;
  }
  bodyY(e, y = BULLET_Y) {
    const k = BODY_Y[e.state === 'civ' || e.state === 'flee' ? 'civ' : e.kind] || BODY_Y.walker, sc = e.scale || 1;
    return Math.min(Math.max(y, k[0] * sc), k[1] * sc);
  }
  lookHuman(e) { return e.state === 'civ' || e.state === 'disguised' || e.state === 'suspicious' || e.state === 'flee' || (e.state === 'revealing' && e.wasDisguised); }
  // The followed round whose path passes nearest the point; dead rounds are used up.
  matchBullet(x, z, tol, consume) {
    const live = this.raid ? new Set(this.raid.projectiles.map((p) => p.id)) : new Set();
    let best = null, bd = tol, bid = -1;
    for (const [id, tr] of this.trace) {
      const sp = Math.hypot(tr.vx, tr.vz) || 1, ux = tr.vx / sp, uz = tr.vz / sp;
      const along = (x - tr.x) * ux + (z - tr.z) * uz;
      if (along < -0.8 || along > sp * 0.3 + 1) continue;
      const off = Math.abs((x - tr.x) * uz - (z - tr.z) * ux);
      const dead = !live.has(id);
      if (off < bd && (dead || !consume)) { bd = off; best = tr; bid = id; }
    }
    if (best && consume) this.trace.delete(bid);
    return best;
  }
  surfaceAt(x, z, dx, dz) {
    const w = this.raid && this.raid.world;
    if (!w) return { cls: 'masonry', nx: -dx, ny: 0, nz: -dz, off: 0 };
    const key = `${Math.floor(x * 4)},${Math.floor(z * 4)},${Math.sign(dx)},${Math.sign(dz)}`;
    let r = this.cache.get(key);
    if (r) return r;
    const hit = firstSurface(w, x - dx * 0.6, BULLET_Y, z - dz * 0.6, dx, 0, dz, 1.2);
    if (hit) { const off = hit.t - 0.6; r = { cls: surfaceClass(hit, x + dx * off, BULLET_Y, z + dz * off), nx: hit.nx, ny: hit.ny, nz: hit.nz, off }; }
    else {
      // No instance found: fall back to the grid edge the round crossed.
      const vert = Math.abs(x - Math.round(x)) < Math.abs(z - Math.round(z));
      r = { cls: 'masonry', nx: vert ? -Math.sign(dx) : 0, ny: 0, nz: vert ? 0 : -Math.sign(dz), off: 0 };
    }
    if (this.cache.size > 512) this.cache.clear();
    this.cache.set(key, r);
    return r;
  }
  // A round crossing a parked car or a kiosk marks it on the way through.
  passThrough(tr, pr) {
    const w = this.raid.world, dx = pr.x - tr.x, dz = pr.z - tr.z, l = Math.hypot(dx, dz);
    if (l < 1e-3 || l > 12) return;
    let low = false;
    for (let s = 0; s <= l; s += 0.5) if (w.cell(tr.x + dx * s / l, tr.z + dz * s / l) === 2) { low = true; break; }
    if (!low) return;
    const hit = firstSurface(w, tr.x, BULLET_Y, tr.z, dx / l, 0, dz / l, l);
    if (!hit || (tr.passed && tr.passed.has(hit.o))) return;
    (tr.passed || (tr.passed = new Set())).add(hit.o);
    const px = tr.x + dx / l * hit.t, pz = tr.z + dz / l * hit.t;
    this.surface(px, BULLET_Y, pz, dx / l, 0, dz / l, { cls: surfaceClass(hit, px, BULLET_Y, pz), nx: hit.nx, ny: hit.ny, nz: hit.nz }, false);
  }

  // ---- effects ----
  bit(o) { if (this.bits.length < MAX_BITS) this.bits.push(o); else this.bits[(Math.random() * MAX_BITS) | 0] = o; }
  // Particles leave in a cone around direction (ax, ay, az).
  spray(n, x, y, z, ax, ay, az, spread, speed, make) {
    for (let i = 0; i < n; i++) {
      let vx = ax + (Math.random() - 0.5) * 2 * spread, vy = ay + (Math.random() - 0.5) * 2 * spread, vz = az + (Math.random() - 0.5) * 2 * spread;
      const l = Math.hypot(vx, vy, vz) || 1, s = speed * (0.4 + Math.random() * 0.6);
      this.bit(make(x, y, z, vx / l * s, vy / l * s, vz / l * s, i));
    }
  }
  surface(x, y, z, dx, dy, dz, surf, decal) {
    const { cls, nx, ny, nz } = surf;
    // The bounce direction: the shot reflected off the face.
    const dn = dx * nx + dy * ny + dz * nz, rx = dx - 2 * dn * nx, ry = dy - 2 * dn * ny, rz = dz - 2 * dn * nz;
    const px = x + nx * 0.02, py = y + ny * 0.02, pz = z + nz * 0.02;
    if (cls === 'metal') {
      this.spray(8 + (Math.random() * 6 | 0), px, py, pz, rx + nx * 0.6, ry + 0.25, rz + nz * 0.6, 0.55, 11, (x0, y0, z0, vx, vy, vz) => ({ k: 'spark', x: x0, y: y0, z: z0, vx, vy, vz, life: 0.2 + Math.random() * 0.25, max: 0.45, size: 0.03, col: [1, 0.6 + Math.random() * 0.25, 0.25], grav: 9 }));
      this.s.beam(px, py, pz, px + rx * 1.3, py + 0.12, pz + rz * 1.3, [1, 0.75, 0.45], 0.06, 0.03, 6);
      // A hot streak on the metal along the round's path, cooling from white to red.
      const tx = dx - dn * nx, ty = dy - dn * ny, tz = dz - dn * nz, tl = Math.hypot(tx, ty, tz) || 1;
      this.marks.push({ x: px, y: py, z: pz, tx: tx / tl, ty: ty / tl, tz: tz / tl, life: 0.45, max: 0.45 });
      if (this.marks.length > 24) this.marks.shift();
      this.s.flash(px + nx * 0.3, py, pz + nz * 0.3, [1, 0.7, 0.4], 3.5, 1.6, 0.05);
      this.bit({ k: 'glint', x: px, y: py, z: pz, vx: 0, vy: 0, vz: 0, life: 0.06, max: 0.06, size: 0.4, col: [1, 0.8, 0.55], grav: 0 });
      if (decal) this.decal(x, y, z, nx, ny, nz, 0.04, [0.3, 0.31, 0.33], SUB.METAL, false);
    } else if (cls === 'glass') {
      this.crack(x, y, z, nx, ny, nz);
      this.spray(5 + (Math.random() * 4 | 0), px, py, pz, nx * 0.5 - dx * 0.3, 0.1, nz * 0.5 - dz * 0.3, 0.5, 2.2, (x0, y0, z0, vx, vy, vz) => ({ k: 'chip', x: x0, y: y0, z: z0, vx, vy, vz, life: 0.9 + Math.random() * 0.5, max: 1.4, size: 0.035, col: [0.5, 0.56, 0.6], mat: MAT.GLOSS, grav: 9.8, spin: Math.random() * 20 }));
      this.spray(4, px, py, pz, nx, 0.2, nz, 0.7, 2.5, (x0, y0, z0, vx, vy, vz) => ({ k: 'glint', x: x0, y: y0, z: z0, vx, vy, vz, life: 0.35, max: 0.35, size: 0.06, col: [0.75, 0.85, 0.95], grav: 9 }));
    } else if (cls === 'wood' || cls === 'masonry' || cls === 'soft') {
      const dust = cls === 'masonry' ? [0.09, 0.085, 0.075] : cls === 'wood' ? [0.08, 0.06, 0.04] : [0.05, 0.05, 0.055];
      const chip = cls === 'masonry' ? [0.3, 0.28, 0.25] : cls === 'wood' ? [0.3, 0.2, 0.11] : [0.12, 0.12, 0.13];
      // A puff that rolls off the wall and drifts, and chips thrown back toward the shooter.
      this.bit({ k: 'glint', x: px, y: py, z: pz, vx: 0, vy: 0, vz: 0, life: 0.05, max: 0.05, size: 0.3, col: [0.45, 0.42, 0.38], grav: 0 });
      this.spray(cls === 'soft' ? 2 : 4, px, py, pz, nx, 0.35, nz, 0.45, 1.1, (x0, y0, z0, vx, vy, vz) => ({ k: 'dust', x: x0, y: y0, z: z0, vx, vy, vz, life: 0.9 + Math.random() * 0.6, max: 1.5, size: 0.18, col: dust, grav: -0.15, drag: 2.2 }));
      if (cls !== 'soft') this.spray(4 + (Math.random() * 3 | 0), px, py, pz, nx + rx * 0.4, 0.4, nz + rz * 0.4, 0.5, 4.5, (x0, y0, z0, vx, vy, vz) => ({ k: 'chip', x: x0, y: y0, z: z0, vx, vy, vz, life: 0.8 + Math.random() * 0.4, max: 1.2, size: cls === 'wood' ? 0.05 : 0.035, col: chip, mat: MAT.PLAIN, sub: cls === 'wood' ? SUB.TIMBER : SUB.WALL, grav: 9.8, spin: Math.random() * 25 }));
      if (decal && cls !== 'soft') this.decal(x, y, z, nx, ny, nz, cls === 'wood' ? 0.045 : 0.055, [0.012, 0.011, 0.01], SUB.RUBBER, cls === 'masonry');
    } else if (cls === 'leaf') {
      this.spray(6, px, py, pz, nx, 0.3, nz, 0.8, 2, (x0, y0, z0, vx, vy, vz) => ({ k: 'chip', x: x0, y: y0, z: z0, vx, vy, vz, life: 1.4, max: 1.4, size: 0.05, col: [0.05, 0.13, 0.05], mat: MAT.FOLIAGE, grav: 3, spin: Math.random() * 8, drag: 1.5 }));
    } else if (cls === 'flesh') {
      this.body(x, y, z, nx, nz, 'flesh', MIMIC_BLOOD.walker, false, false);
    }
  }
  body(x, y, z, fx, fz, cls, blood, big, melee) {
    if (cls === 'plate') {
      this.surface(x, y, z, -fx, 0, -fz, { cls: 'metal', nx: fx, ny: 0, nz: fz }, false);
      return;
    }
    // A slash flings it sideways along the swing; a round sprays back toward the shooter.
    const side = Math.random() < 0.5 ? -1 : 1, sx = melee ? -fz * side : fx, sz = melee ? fx * side : fz;
    const n = (cls === 'chitin' ? 6 : 10) + (big ? 6 : 0);
    this.spray(n, x, y, z, sx * 0.8, 0.45, sz * 0.8, 0.55, melee ? 4.5 : 3.6, (x0, y0, z0, vx, vy, vz) => ({ k: 'drop', x: x0, y: y0, z: z0, vx, vy, vz, life: 0.9, max: 0.9, size: 0.022 + Math.random() * 0.03, col: blood, grav: 9.8 }));
    this.spray(4, x, y, z, sx, 0.2, sz, 0.4, 1.3, (x0, y0, z0, vx, vy, vz) => ({ k: 'mist', x: x0, y: y0, z: z0, vx, vy, vz, life: 0.3, max: 0.3, size: 0.26, col: [blood[0] * 2.5, blood[1] * 2.5, blood[2] * 2.5], grav: 0, drag: 4 }));
    // A wet glint where it went in, brief enough to read as a strike from the tactical height.
    this.bit({ k: 'glint', x: x + fx * 0.05, y, z: z + fz * 0.05, vx: 0, vy: 0, vz: 0, life: 0.07, max: 0.07, size: big ? 0.7 : 0.45, col: [0.5 + blood[0] * 2, 0.35 + blood[1] * 2, 0.4 + blood[2] * 2], grav: 0 });
    if (cls === 'chitin') this.spray(4, x, y, z, sx, 0.5, sz, 0.6, 3.5, (x0, y0, z0, vx, vy, vz) => ({ k: 'chip', x: x0, y: y0, z: z0, vx, vy, vz, life: 0.8, max: 0.8, size: 0.04, col: [0.3, 0.27, 0.23], mat: MAT.PLAIN, sub: SUB.METAL, grav: 9.8, spin: Math.random() * 25 }));
    if (melee) this.s.streak(x - sz * 0.4, y + 0.1, z + sx * 0.4, x + sx * 0.5, y - 0.15, z + sz * 0.5, 0.05, [blood[0] * 4, blood[1] * 4, blood[2] * 4], 1);
  }
  acid(x, z, dx, dz, col) {
    const c = col || [0.5, 1, 0.2];
    this.spray(8, x - dx * 0.05, BULLET_Y, z - dz * 0.05, -dx, 0.2, -dz, 0.7, 2.2, (x0, y0, z0, vx, vy, vz) => ({ k: 'glint', x: x0, y: y0, z: z0, vx, vy, vz, life: 0.5, max: 0.5, size: 0.09, col: [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], grav: 8 }));
    this.s.flash(x - dx * 0.3, BULLET_Y, z - dz * 0.3, c, 3, 1.2, 0.12);
  }
  decal(x, y, z, nx, ny, nz, r, col, sub, rim) {
    const j = 0.75 + Math.random() * 0.5;
    this.decals.push({ x, y, z, nx, ny, nz, r: r * j, col, sub, rim, life: 14, max: 14 });
    if (this.decals.length > MAX_DECALS) this.decals.shift();
  }
  crack(x, y, z, nx, ny, nz) {
    this.cracks.push({ x, y, z, nx, ny, nz, size: 0.28 + Math.random() * 0.14, seed: Math.random() * 100, life: 6, max: 6 });
    if (this.cracks.length > MAX_CRACKS) this.cracks.shift();
    this.s.glow(x + nx * 0.05, y, z + nz * 0.05, 0.6, [0.8, 0.9, 1], 1.2);
  }

  draw(dt, t) {
    const s = this.s;
    for (let i = this.muzzles.length - 1; i >= 0; i--) {
      const m = this.muzzles[i];
      m.life -= dt;
      if (m.life <= -0.017) { this.muzzles.splice(i, 1); continue; }
      // Core, a forward flame and two short side petals: a star that lasts a frame or two.
      const k = 2.6, c = m.col, px = -m.dz, pz = m.dx, j = 0.75 + 0.5 * Math.sin(m.seed);
      s.glow(m.x, 1.35, m.z, 0.32, [1, 0.9, 0.7], k * 2);
      s.streak(m.x, 1.35, m.z, m.x + m.dx * 0.55 * j, 1.36, m.z + m.dz * 0.55 * j, 0.11, c, k * 1.6);
      s.streak(m.x - px * 0.16, 1.35, m.z - pz * 0.16, m.x + px * 0.16, 1.35, m.z + pz * 0.16, 0.05, c, k);
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0) { this.bits[i] = this.bits[this.bits.length - 1]; this.bits.pop(); continue; }
      if (b.drag) { const k = Math.exp(-b.drag * dt); b.vx *= k; b.vy *= k; b.vz *= k; }
      b.vy -= b.grav * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const f = b.life / b.max;
      if (b.y < 0.02) {
        if (b.k === 'drop') {
          // A drop meets the street: a small ring on the wet paving, then it is gone.
          s.ring(b.x, b.z, 0.08, [b.col[0] * 3, b.col[1] * 3, b.col[2] * 3], 0.6, 0.6, 0, 0, 0, 0.03);
          b.life = 0; continue;
        }
        b.y = 0.02; b.vy *= -0.25; b.vx *= 0.5; b.vz *= 0.5;
        if (b.k === 'spark') b.life = Math.min(b.life, 0.06);
        if (b.spin) b.spin *= 0.5;
      }
      if (b.k === 'spark') s.streak(b.x - b.vx * 0.028, b.y - b.vy * 0.028, b.z - b.vz * 0.028, b.x, b.y, b.z, b.size, b.col, 5 * f);
      else if (b.k === 'glint') s.glow(b.x, b.y, b.z, b.size, b.col, 2.5 * f);
      else if (b.k === 'dust') s.glow(b.x, b.y, b.z, b.size * (1 + (1 - f) * 2.5), b.col, 1.1 * f * f);
      else if (b.k === 'mist') s.glow(b.x, b.y, b.z, b.size * (1 + (1 - f)), b.col, 0.9 * f);
      else if (b.k === 'chip') {
        const a = (b.spin || 0) * (b.max - b.life), sz = b.size * Math.min(1, f * 3);
        s.box(b.x, b.y, b.z, sz, sz * 0.6, sz * 0.8, a, b.mat ?? MAT.PLAIN, b.col, 0, b.sub || 0);
      } else if (b.k === 'drop') {
        // Stretched along its flight, glossy so it catches the lamps.
        s.wseg(b.x - b.vx * 0.012, b.y - b.vy * 0.012, b.z - b.vz * 0.012, b.x, b.y, b.z, b.size, MAT.GLOSS, b.col, 0, 0, CAPSULE);
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) { this.decals.splice(i, 1); continue; }
      const r = d.r * Math.min(1, d.life / 2);
      s.wseg(d.x + d.nx * 0.004, d.y + d.ny * 0.004, d.z + d.nz * 0.004, d.x + d.nx * 0.018, d.y + d.ny * 0.018, d.z + d.nz * 0.018, r, MAT.PLAIN, d.col, 0, d.sub, CYL);
      // Plaster flakes away around the hole and shows a paler ring.
      if (d.rim) s.wseg(d.x + d.nx * 0.002, d.y + d.ny * 0.002, d.z + d.nz * 0.002, d.x + d.nx * 0.01, d.y + d.ny * 0.01, d.z + d.nz * 0.01, r * 2.1, MAT.PLAIN, [0.26, 0.25, 0.23], 0, SUB.WALL, CYL);
    }
    for (let i = this.cracks.length - 1; i >= 0; i--) {
      const c = this.cracks[i];
      c.life -= dt;
      if (c.life <= 0) { this.cracks.splice(i, 1); continue; }
      const k = Math.min(1, c.life / 1.5) * 0.55;
      s.sprite(c.x + c.nx * 0.03, c.y + c.ny * 0.03, c.z + c.nz * 0.03, c.size, 0.85 * k, 0.9 * k, 0.95 * k, 3, c.nx, c.ny, c.nz, c.seed);
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.life -= dt;
      if (m.life <= 0) { this.marks.splice(i, 1); continue; }
      const f = m.life / m.max, h = f * f;
      // White-hot to orange to a dull red as it cools.
      const col = [1, 0.25 + 0.65 * h, 0.08 + 0.6 * h * h];
      s.streak(m.x - m.tx * 0.2, m.y - m.ty * 0.2, m.z - m.tz * 0.2, m.x + m.tx * 0.12, m.y + m.ty * 0.12, m.z + m.tz * 0.12, 0.04, col, 5 * f);
      s.glow(m.x, m.y, m.z, 0.12, col, 3 * f * f);
    }
    void t; void BOX; void SPHERE;
  }
}
