// Procedural city for the demo raid (docs 09, 10, 17). Pure data: no DOM, no GPU.
// The world is a pure function of the seed. Coordinates: +x east, +z south, +y up.
//
// Layout: irregular street lines form a hierarchy (avenues, streets, pedestrian
// alleys, and edges that are built over), so the city is not a uniform grid. Lots
// are subdivided into parcels with narrow gaps, some of them dead ends. A canal
// with bridges and an elevated rail line cut across the map.

import { Rng } from '../core/rng.js';
import { valueNoise, clamp } from '../core/math.js';
import { BLOCK, BLOCKS, NEON } from './data.js';

import { INST_FLOATS, SHAPE, SHAPE_COUNT, MAT, STYLE, SURF, SUB, prim, primR, box, boxMM, cyl, ball, light } from './emit.js';
import * as D from './dress.js';
import { FLOOR_UNIT, STEP, FLOOR_MIN, FLOOR_MAX, EYE, emitHeight, heightTestYard } from './height.js';
import * as HT from './height.js';
import { pickSceneLots, laundryCourt, recordsTower } from './scenes.js';

export { INST_FLOATS, SHAPE, SHAPE_COUNT, MAT, STYLE, SURF };
export const STYLE_NAMES = ['Old Town Alleys', 'Neon Strip', 'Arcology Heights', 'Corporate Plaza', 'Dockside'];
const ROAD_KIND = { NONE: 0, ALLEY: 1, STREET: 2, AVENUE: 3 };
const ROAD_HALF = [0, 2, 4, 8];   // carriageway half width
const WALK_W = [0, 0, 2, 3];      // sidewalk width on each side

// Everything is placed as a fraction of the map, so the district scales with BLOCKS.
const SIZE = BLOCKS * BLOCK;
const INSERT_X = Math.round(SIZE / 2), INSERT_Z = SIZE - 60;

// ---- Height (doc 64 Package 8, doc 29) ----
// One floor per cell in 0.25 m units, -8 m to +12 m. A step of 0.5 m or less between
// neighbouring cells is walkable both ways; a taller edge is a wall from below and, from
// above, impassable except off an authored one-way drop cell. Falls: 15% of maximum health
// up to 4 m, 40% up to 8 m, lethal beyond (start). Network streets and bridges stay at 0.
// The constants and the authoring helpers live in height.js.
export { FLOOR_UNIT, STEP, FLOOR_MIN, FLOOR_MAX, FALL_HURT, FALL_SERIOUS, FALL_SHARE, EYE, HMARK } from './height.js';

class World {
  constructor(seed, n, annex = false) {
    this.seed = seed;
    this.n = n;
    this.size = n * BLOCK;
    this.annex = annex;
    this.grid = new Uint8Array(this.size * this.size);    // 0 free, 1 wall, 2 low obstacle, 3 closed door
    this.surface = new Uint8Array(this.size * this.size); // SURF class per square metre
    this.floor = new Int8Array(this.size * this.size);    // floor height per cell, 0.25 m units
    this.drop = new Uint8Array(this.size * this.size);    // 1 on an authored one-way drop cell (the sill)
    this.hasHeight = false;                               // any non-zero floor: the flat paths are exact otherwise
    this.doorCell = new Int16Array(this.size * this.size); // door id + 1 on doorway cells, else 0
    this.doors = [];
    this.windows = [];        // breakable windows (doc 32): one-way drops once broken, per raid in doors.js
    this.scenes = [];         // authored interior scenes (doc 64 Package 8): the laundry court, the records tower
    this.zone = new Uint8Array(n * n);
    this.style = new Uint8Array(n * n);
    this.blocks = [];
    for (let i = 0; i < n * n; i++) this.blocks.push({ lights: [], containers: [], pois: [], ped: [], vents: [], doors: [] });
    this.towers = [];
    this.places = [];         // open lots by kind: park, carpark, square, market, site
    this.freightYards = [];    // visual apron bounds; simulation still treats the aisles as road
    this.curStyle = 0;
    this.build = [];
    for (let s = 0; s < SHAPE_COUNT; s++) this.build.push(this.blocks.map(() => []));
    this.shapes = null;       // per shape: { data Float32Array, range Uint32Array } after finalize()
    this.containers = [];
    this.vehicles = [];       // parked vehicles and wrecks: { kind, x, z, yaw, L, W, ... }
    this.pois = [];
    this.extractions = [];
    this.insertion = { x: 0, z: 0 };
    this.boss = null;
    this.reserved = [];
  }

  blockIndex(x, z) {
    const bx = clamp(Math.floor(x / BLOCK), 0, this.n - 1);
    const bz = clamp(Math.floor(z / BLOCK), 0, this.n - 1);
    return bz * this.n + bx;
  }
  zoneAt(x, z) { return this.zone[this.blockIndex(x, z)]; }
  styleAt(x, z) { return this.style[this.blockIndex(x, z)]; }
  // Survey reference of the 100 m block, as printed on the full map: column letter, row number.
  refAt(x, z) { const b = this.blockIndex(x, z); return `${String.fromCharCode(65 + (b % this.n))}${((b / this.n) | 0) + 1}`; }

  // A per-raid view of the district. It shares everything with the generated world but
  // owns its occupancy grid, so a raid can open doors without touching any other raid.
  // The floor and drop maps are shared, read only; a raid that changes one (a window that
  // breaks into a drop) takes its own copy first with ownDrop / ownFloor.
  overlay() {
    const v = Object.create(this);
    v.grid = this.grid.slice();
    return v;
  }
  ownDrop() { if (!Object.hasOwn(this, 'drop')) this.drop = this.drop.slice(); return this.drop; }
  ownFloor() { if (!Object.hasOwn(this, 'floor')) this.floor = this.floor.slice(); return this.floor; }

  cell(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    if (xi < 0 || zi < 0 || xi >= this.size || zi >= this.size) return 1;
    return this.grid[zi * this.size + xi];
  }
  surf(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    if (xi < 0 || zi < 0 || xi >= this.size || zi >= this.size) return 0;
    return this.surface[zi * this.size + xi];
  }
  isFree(x, z) { return this.cell(x, z) === 0; }

  // ---- height ----
  // Floor of a cell in 0.25 m units (0 off the map), and in metres at a point.
  fl(xi, zi) { return xi < 0 || zi < 0 || xi >= this.size || zi >= this.size ? 0 : this.floor[zi * this.size + xi]; }
  floorAt(x, z) { return this.hasHeight ? this.fl(Math.floor(x), Math.floor(z)) * FLOOR_UNIT : 0; }
  setFloor(x0, z0, x1, z1, metres) {
    const u = clamp(Math.round(metres / FLOOR_UNIT), FLOOR_MIN, FLOOR_MAX);
    x0 = clamp(Math.floor(x0), 0, this.size); x1 = clamp(Math.ceil(x1), 0, this.size);
    z0 = clamp(Math.floor(z0), 0, this.size); z1 = clamp(Math.ceil(z1), 0, this.size);
    for (let z = z0; z < z1; z++) this.floor.fill(u, z * this.size + x0, z * this.size + x1);
    if (u) this.hasHeight = true;
  }
  setDrop(x0, z0, x1, z1, on = 1) {
    x0 = clamp(Math.floor(x0), 0, this.size); x1 = clamp(Math.ceil(x1), 0, this.size);
    z0 = clamp(Math.floor(z0), 0, this.size); z1 = clamp(Math.ceil(z1), 0, this.size);
    for (let z = z0; z < z1; z++) this.drop.fill(on, z * this.size + x0, z * this.size + x1);
  }
  // Can a body walk from cell a to the neighbouring cell b (indices)? The step rule, and a
  // drop off a drop cell when `drops` is set (for enemies that may step off but never climb).
  stepOK(a, b, drops = false) {
    const d = this.floor[b] - this.floor[a];
    return (d <= STEP && d >= -STEP) || (drops && d < 0 && this.drop[a] === 1);
  }
  // Does the free cell (xi, zi) block a body standing at level lv (units) whose cell of
  // record is (bx, bz)? A cell k cells away may differ by k steps, so a long body still
  // fits a stair; anything taller is a wall from below, anything lower an edge from above
  // unless the body stands on a drop cell.
  hblock(xi, zi, lv, bx, bz, drop) {
    const k = Math.max(1, Math.abs(xi - bx), Math.abs(zi - bz)), rise = this.fl(xi, zi) - lv;
    return rise > STEP * k || (rise < -STEP * k && !drop);
  }
  // True if every cell along a straight walk from (x0, z0) to (x1, z1) steps to the next
  // within the step rule: nothing to climb and no edge to fall off on the way.
  walkLine(x0, z0, x1, z1) {
    if (!this.hasHeight) return true;
    const S = this.size;
    let xi = Math.floor(x0), zi = Math.floor(z0);
    const xe = Math.floor(x1), ze = Math.floor(z1), dx = x1 - x0, dz = z1 - z0, sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx ? Math.abs(1 / dx) : Infinity, tdz = dz ? Math.abs(1 / dz) : Infinity;
    let tx = dx ? (dx > 0 ? xi + 1 - x0 : x0 - xi) * tdx : Infinity, tz = dz ? (dz > 0 ? zi + 1 - z0 : z0 - zi) * tdz : Infinity;
    for (let guard = 0; guard < 600 && (xi !== xe || zi !== ze); guard++) {
      const a = zi * S + xi;
      if (tx < tz) { tx += tdx; xi += sx; } else { tz += tdz; zi += sz; }
      if (xi < 0 || zi < 0 || xi >= S || zi >= S || !this.stepOK(a, zi * S + xi)) return false;
    }
    return true;
  }

  // True if a circle of radius r at (x, z) overlaps no solid cell. With height, a body
  // standing at fy metres (by default the floor under its centre) is also stopped by the
  // edges the step rule makes.
  circleFree(x, z, r, fy) {
    const H = this.hasHeight, bx = Math.floor(x), bz = Math.floor(z);
    const lv = H ? (fy === undefined ? this.fl(bx, bz) : Math.round(fy / FLOOR_UNIT)) : 0;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    for (let zi = z0; zi <= z1; zi++) {
      for (let xi = x0; xi <= x1; xi++) {
        if (this.cell(xi, zi) === 0 && !(H && (xi === bx && zi === bz ? this.fl(xi, zi) !== lv : this.hblock(xi, zi, lv, bx, bz, false)))) continue;
        const nx = clamp(x, xi, xi + 1), nz = clamp(z, zi, zi + 1);
        if ((x - nx) * (x - nx) + (z - nz) * (z - nz) < r * r) return false;
      }
    }
    return true;
  }

  // Push a circle out of solid cells. Mutates and returns the object {x, z}. With height
  // the body carries its level: fy (metres) and fc, the cell it was established on. A body
  // that has moved more than two cells since (placed, or teleported) takes the floor under
  // it. fell is set to the height of a drop this resolve committed to, in metres.
  resolveCircle(p, r) {
    const H = this.hasHeight, S = this.size;
    let lv = 0, bx = 0, bz = 0, drop = false;
    if (H) {
      const ci = Math.floor(p.z) * S + Math.floor(p.x);
      if (p.fc === undefined || Math.abs((p.fc % S) - (ci % S)) > 2 || Math.abs(((p.fc / S) | 0) - ((ci / S) | 0)) > 2 || ci < 0 || ci >= S * S) {
        p.fc = clamp(ci, 0, S * S - 1); p.fy = this.floor[p.fc] * FLOOR_UNIT;
      }
      lv = Math.round(p.fy / FLOOR_UNIT); bx = p.fc % S; bz = (p.fc / S) | 0; drop = this.drop[p.fc] === 1;
      p.fell = 0;
    }
    for (let iter = 0; iter < 3; iter++) {
      const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
      let moved = false;
      for (let zi = z0; zi <= z1; zi++) {
        for (let xi = x0; xi <= x1; xi++) {
          if (this.cell(xi, zi) === 0 && !(H && this.hblock(xi, zi, lv, bx, bz, drop))) continue;
          const nx = clamp(p.x, xi, xi + 1), nz = clamp(p.z, zi, zi + 1);
          const dx = p.x - nx, dz = p.z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2), push = r - d;
            p.x += (dx / d) * push; p.z += (dz / d) * push;
          } else {
            const l = p.x - xi, rr = xi + 1 - p.x, t = p.z - zi, b = zi + 1 - p.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) p.x = xi - r; else if (m === rr) p.x = xi + 1 + r;
            else if (m === t) p.z = zi - r; else p.z = zi + 1 + r;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (H) {
      // Take the level of the cell the centre ended on, if the body could stand there.
      const ci = Math.floor(p.z) * S + Math.floor(p.x);
      if (ci !== p.fc && ci >= 0 && ci < S * S) {
        const xi = ci % S, zi = (ci / S) | 0, f = this.floor[ci], k = Math.max(1, Math.abs(xi - bx), Math.abs(zi - bz));
        if ((Math.abs(f - lv) <= STEP * k || (f < lv && drop)) && (this.grid[ci] === 0 || this.grid[ci] === 3)) {
          if (lv - f > STEP) p.fell = (lv - f) * FLOOR_UNIT;
          p.fc = ci; p.fy = f * FLOOR_UNIT;
        }
      }
    }
    return p;
  }
  // Put a body down where it stands: its level is the floor under it (spawns, teleports).
  place(p) {
    if (!this.hasHeight) { p.fy = 0; return p; }
    const S = this.size;
    p.fc = clamp(Math.floor(p.z), 0, S - 1) * S + clamp(Math.floor(p.x), 0, S - 1);
    p.fy = this.floor[p.fc] * FLOOR_UNIT;
    return p;
  }

  // Grid ray march. Returns the fraction of the segment travelled before hitting a wall
  // or a closed door (cell values 1 and 3, the odd ones), or 1 if the segment is clear.
  // Low obstacles do not block. With height the segment runs from y0 to y1 (by default eye
  // height over the floor at each end) and the ground blocks it where it passes below a
  // cell's floor: a terrace face from below, its own floor short of the edge from above.
  raycast(x0, z0, x1, z1, y0, y1, walls = true) {
    const dx = x1 - x0, dz = z1 - z0;
    let xi = Math.floor(x0), zi = Math.floor(z0);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx !== 0 ? (dx > 0 ? xi + 1 - x0 : x0 - xi) * tdx : Infinity;
    let tz = dz !== 0 ? (dz > 0 ? zi + 1 - z0 : z0 - zi) * tdz : Infinity;
    let t = 0;
    if (this.hasHeight) {
      if (y0 === undefined) y0 = this.floorAt(x0, z0) + EYE;
      if (y1 === undefined) y1 = this.floorAt(x1, z1) + EYE;
      const dy = y1 - y0;
      for (let guard = 0; guard < 400; guard++) {
        if (walls && (this.cell(xi, zi) & 1)) return t;
        const next = Math.min(1, tx, tz), f = this.fl(xi, zi) * FLOOR_UNIT, ya = y0 + dy * t, yb = y0 + dy * next;
        if (ya < f) return t;
        if (yb < f) return t + (next - t) * (ya - f) / (ya - yb);
        if (tx < tz) { t = tx; tx += tdx; xi += sx; } else { t = tz; tz += tdz; zi += sz; }
        if (t >= 1) return 1;
      }
      return 1;
    }
    for (let guard = 0; guard < 400; guard++) {
      if (this.cell(xi, zi) & 1) return t;
      if (tx < tz) { t = tx; tx += tdx; xi += sx; } else { t = tz; tz += tdz; zi += sz; }
      if (t >= 1) return 1;
    }
    return 1;
  }
  hasLos(x0, z0, x1, z1, y0, y1) { return this.raycast(x0, z0, x1, z1, y0, y1) >= 1; }

  // Find a free point in a ring around (cx, cz). Returns null if none is found.
  randomFree(rng, cx, cz, rmin, rmax, radius = 0.6, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = rng.float() * Math.PI * 2, d = rng.range(rmin, rmax);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (x < 4 || z < 4 || x > this.size - 4 || z > this.size - 4) continue;
      if (this.circleFree(x, z, radius)) return { x, z };
    }
    return null;
  }

  // A pedestrian point (sidewalk, alley or plaza) near (x, z), from the baked samples.
  pedNear(rng, x, z, reach = 1) {
    const bx = clamp(Math.floor(x / BLOCK) + rng.irange(-reach, reach), 0, this.n - 1);
    const bz = clamp(Math.floor(z / BLOCK) + rng.irange(-reach, reach), 0, this.n - 1);
    const list = this.blocks[bz * this.n + bx].ped;
    return list.length ? list[rng.int(list.length)] : null;
  }

  // A searchable container in the cell at (x, z); `extra` carries kind-specific data
  // such as the vehicle a rear compartment belongs to.
  addContainer(x, z, kind, indoor, extra) {
    const c = { id: this.containers.length, x, z, kind, indoor, zone: this.zoneAt(x, z), block: this.blockIndex(x, z), ...extra };
    this.fillRect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 2);
    this.containers.push(c);
    return c;
  }

  fillRect(x0, z0, x1, z1, v) {
    x0 = clamp(Math.floor(x0), 0, this.size); x1 = clamp(Math.ceil(x1), 0, this.size);
    z0 = clamp(Math.floor(z0), 0, this.size); z1 = clamp(Math.ceil(z1), 0, this.size);
    for (let z = z0; z < z1; z++) this.grid.fill(v, z * this.size + x0, z * this.size + x1);
  }
  paint(x0, z0, x1, z1, s) {
    x0 = clamp(Math.floor(x0), 0, this.size); x1 = clamp(Math.ceil(x1), 0, this.size);
    z0 = clamp(Math.floor(z0), 0, this.size); z1 = clamp(Math.ceil(z1), 0, this.size);
    for (let z = z0; z < z1; z++) this.surface.fill(s, z * this.size + x0, z * this.size + x1);
  }
}

function styleFor(x, z, canalX) {
  if (x > canalX) return STYLE.DOCK;
  if (z >= SIZE * 0.64) return STYLE.OLDTOWN;
  if (z >= SIZE * 0.34) return STYLE.NEON;
  return x < SIZE * 0.45 ? STYLE.ARCOLOGY : STYLE.CORPORATE;
}
// Wall palettes: tile, plaster, brick, concrete and dark curtain wall.
const WALLS = [
  [[0.2, 0.17, 0.14], [0.26, 0.24, 0.21], [0.17, 0.1, 0.08], [0.15, 0.15, 0.15], [0.23, 0.2, 0.16]],
  [[0.12, 0.12, 0.15], [0.19, 0.18, 0.2], [0.1, 0.1, 0.12], [0.22, 0.21, 0.2], [0.14, 0.11, 0.1]],
  [[0.07, 0.09, 0.12], [0.1, 0.12, 0.15], [0.14, 0.15, 0.17], [0.06, 0.07, 0.09]],
  [[0.06, 0.075, 0.095], [0.09, 0.1, 0.12], [0.05, 0.06, 0.075], [0.13, 0.14, 0.15]],
  [[0.13, 0.14, 0.13], [0.16, 0.13, 0.1], [0.1, 0.12, 0.13], [0.19, 0.19, 0.18]],
];
function heightFor(style, rng, big) {
  switch (style) {
    case STYLE.OLDTOWN: return rng.irange(6, big ? 15 : 20);
    case STYLE.NEON: return rng.irange(12, big ? 44 : 36);
    case STYLE.ARCOLOGY: return rng.irange(34, big ? 150 : 90);
    case STYLE.CORPORATE: return rng.irange(30, big ? 120 : 80);
    default: return rng.irange(6, 13);
  }
}

// ---- Zone field (doc 17, section 3) ----
function genZones(w, seed) {
  const n = w.n, z = w.zone, ibx = INSERT_X / 100 - 0.5, ibz = INSERT_Z / 100 - 0.5;
  const v = new Float32Array(n * n), far = [];
  for (let bz = 0; bz < n; bz++) {
    for (let bx = 0; bx < n; bx++) {
      const d = Math.hypot(bx - ibx, bz - ibz);
      const amp = Math.min(1, n / 32 * 1.6);
      const noise = ((valueNoise(bx * 0.21, bz * 0.21, seed) - 0.5) * 7.0 + (valueNoise(bx * 0.55, bz * 0.55, seed + 9) - 0.5) * 2.5) * amp;
      // The Shelter is a single block: pressure starts a few steps from insertion.
      v[bz * n + bx] = d < 0.75 ? -1 : Math.max(0.01, d + noise);
      if (d >= 0.75) far.push(d + noise);
    }
  }
  far.sort((a, b) => a - b);
  const q = (f) => far[Math.min(far.length - 1, Math.floor(f * far.length))];
  const t1 = q(0.37), t2 = q(0.69), t3 = q(0.9);
  for (let i = 0; i < n * n; i++) z[i] = v[i] < 0 ? 0 : v[i] < t1 ? 1 : v[i] < t2 ? 2 : v[i] < t3 ? 3 : 4;
  const enforce = () => {
    for (let pass = 0; pass < 12; pass++) {
      let changed = false;
      for (let bz = 0; bz < n; bz++) {
        for (let bx = 0; bx < n; bx++) {
          const i = bz * n + bx;
          let m = 9;
          if (bx > 0) m = Math.min(m, z[i - 1]);
          if (bx < n - 1) m = Math.min(m, z[i + 1]);
          if (bz > 0) m = Math.min(m, z[i - n]);
          if (bz < n - 1) m = Math.min(m, z[i + n]);
          if (z[i] > m + 1) { z[i] = m + 1; changed = true; }
        }
      }
      if (!changed) break;
    }
  };
  enforce();
  const seen = new Uint8Array(n * n);
  for (let s = 0; s < n * n; s++) {
    if (seen[s]) continue;
    const lvl = z[s], comp = [s], around = [];
    seen[s] = 1;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k], bx = i % n, bz = (i / n) | 0;
      const nb = [];
      if (bx > 0) nb.push(i - 1);
      if (bx < n - 1) nb.push(i + 1);
      if (bz > 0) nb.push(i - n);
      if (bz < n - 1) nb.push(i + n);
      for (const j of nb) { if (z[j] === lvl) { if (!seen[j]) { seen[j] = 1; comp.push(j); } } else around.push(z[j]); }
    }
    if (n >= 16 && comp.length < 4 && around.length && lvl !== 0) { const target = Math.max(1, Math.min(...around)); for (const i of comp) z[i] = target; }
  }
  enforce();
}

// ---- Street network ----
function genLines(rng, size, forced) {
  // Irregular spacing; a forced coordinate keeps a line where a landmark needs one.
  const pos = [0];
  const gaps = size <= 800 ? [44, 52, 60, 72, 96] : [64, 78, 92, 104, 118, 136, 150], minGap = size <= 800 ? 36 : 46;
  while (pos[pos.length - 1] < size - gaps[gaps.length - 1]) pos.push(pos[pos.length - 1] + rng.pick(gaps));
  pos.push(size);
  for (const f of forced) {
    let best = 1;
    for (let i = 1; i < pos.length - 1; i++) if (Math.abs(pos[i] - f) < Math.abs(pos[best] - f)) best = i;
    pos[best] = f;
  }
  pos.sort((a, b) => a - b);
  for (let i = pos.length - 2; i > 0; i--) if (pos[i] - pos[i - 1] < minGap || pos[i + 1] - pos[i] < minGap) { if (!forced.includes(pos[i])) pos.splice(i, 1); }
  return pos;
}

function genNetwork(w, rng) {
  const S = w.size;
  const canalX = Math.round(S * 0.832), railZ = Math.round(S * 0.42), gateZ = INSERT_Z - 52;
  const xs = genLines(rng.fork('x'), S, [INSERT_X - 50, canalX]);
  const zs = genLines(rng.fork('z'), S, [gateZ, railZ]);
  const nx = xs.length, nz = zs.length;
  // Line classes: an avenue every few lines, the rest are minor.
  const cls = (pos, forcedAv, r) => pos.map((p, i) => (i === 0 || i === pos.length - 1 ? ROAD_KIND.NONE : forcedAv.includes(p) || r.chance(0.24) ? ROAD_KIND.AVENUE : ROAD_KIND.STREET));
  const xc = cls(xs, [INSERT_X - 50], rng.fork('xc')), zc = cls(zs, [gateZ, railZ], rng.fork('zc'));
  const ci = xs.indexOf(canalX);
  xc[ci] = ROAD_KIND.NONE;
  // Per-segment kind. v[i][j]: line x = xs[i] between zs[j] and zs[j+1]; h[j][i] likewise.
  const seg = (lineCls, r) => (lineCls === ROAD_KIND.AVENUE ? ROAD_KIND.AVENUE : lineCls === ROAD_KIND.NONE ? ROAD_KIND.NONE : r.weighted([26, 30, 44]) /* none, alley, street */);
  const rv = rng.fork('v'), rh = rng.fork('h');
  const v = xs.map((_, i) => zs.slice(0, -1).map(() => seg(xc[i], rv)));
  const h = zs.map((_, j) => xs.slice(0, -1).map(() => seg(zc[j], rh)));
  // Every lot needs at least one open edge.
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < nz - 1; j++) {
      if (v[i][j] || v[i + 1][j] || h[j][i] || h[j + 1][i]) continue;
      const opts = [];
      if (i > 0 && i !== ci) opts.push(() => { v[i][j] = ROAD_KIND.ALLEY; });
      if (i + 1 < nx - 1 && i + 1 !== ci) opts.push(() => { v[i + 1][j] = ROAD_KIND.ALLEY; });
      if (j > 0) opts.push(() => { h[j][i] = ROAD_KIND.ALLEY; });
      if (j + 1 < nz - 1) opts.push(() => { h[j + 1][i] = ROAD_KIND.ALLEY; });
      if (opts.length) rng.pick(opts)();
    }
  }
  return { xs, zs, xc, zc, v, h, ci, canalX, railZ, railJ: zs.indexOf(railZ) };
}

function paintNetwork(w, net) {
  const { xs, zs, v, h, ci, canalX } = net;
  const hwAt = (kinds) => Math.max(...kinds.map((k) => ROAD_HALF[k] + WALK_W[k]));
  // Half width of everything crossing a node, used to extend segments through junctions.
  const nodeV = (i, j) => hwAt([j > 0 ? v[i][j - 1] : 0, j < zs.length - 1 ? v[i][j] : 0]);
  const nodeH = (i, j) => hwAt([i > 0 ? h[j][i - 1] : 0, i < xs.length - 1 ? h[j][i] : 0]);
  const each = (fn) => {
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < zs.length - 1; j++) if (v[i][j]) fn(true, xs[i], zs[j] - nodeH(i, j), zs[j + 1] + nodeH(i, j + 1), v[i][j], zs[j], zs[j + 1]);
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length - 1; i++) if (h[j][i]) fn(false, zs[j], xs[i] - nodeV(i, j), xs[i + 1] + nodeV(i + 1, j), h[j][i], xs[i], xs[i + 1]);
  };
  // Sidewalks first, then carriageways on top so junctions come out clean.
  each((vert, c, a, b, k) => { const t = ROAD_HALF[k] + WALK_W[k]; if (k >= 2) { if (vert) w.paint(c - t, a, c + t, b, SURF.WALK); else w.paint(a, c - t, b, c + t, SURF.WALK); } });
  each((vert, c, a, b, k) => { const t = ROAD_HALF[k]; const s = k === ROAD_KIND.ALLEY ? SURF.ALLEY : SURF.ROAD; if (vert) w.paint(c - t, a, c + t, b, s); else w.paint(a, c - t, b, c + t, s); });
  // Lane paint and zebra crossings on streets and avenues, kept clear of junctions.
  each((vert, c, a, b, k, n0, n1) => {
    if (k < 2) return;
    const t = ROAD_HALF[k], m0 = n0 + 14, m1 = n1 - 14;
    if (m1 - m0 < 8) return;
    if (vert) { w.paint(c, m0 + 4, c + 1, m1 - 4, SURF.LANE_Z); w.paint(c - t, m0, c + t, m0 + 3, SURF.XWALK_Z); w.paint(c - t, m1 - 3, c + t, m1, SURF.XWALK_Z); }
    else { w.paint(m0 + 4, c, m1 - 4, c + 1, SURF.LANE_X); w.paint(m0, c - t, m0 + 3, c + t, SURF.XWALK_X); w.paint(m1 - 3, c - t, m1, c + t, SURF.XWALK_X); }
  });
  // Canal: water is a low obstacle (blocks movement, not shots). Quays on both banks.
  w.paint(canalX - QUAY_OUT, 0, canalX + QUAY_OUT, w.size, SURF.WALK);
  w.paint(canalX - QUAY_IN, 0, canalX + QUAY_IN, w.size, SURF.WATER);
  w.fillRect(canalX - QUAY_IN, 0, canalX + QUAY_IN, w.size, 2);
  net.bridges = [];
  for (let j = 1; j < zs.length - 1; j++) {
    const k = Math.max(h[j][ci - 1], h[j][ci]);
    if (k < 2) continue;
    const t = ROAD_HALF[k] + 1;
    w.paint(canalX - QUAY_OUT, zs[j] - t, canalX + QUAY_OUT, zs[j] + t, SURF.ROAD);
    w.fillRect(canalX - QUAY_IN, zs[j] - t, canalX + QUAY_IN, zs[j] + t, 0);
    net.bridges.push({ z: zs[j], t });
  }
  layQuays(w, net);
}

// ---- The sunken quay (doc 64 Package 8, doc 29) ----
// Both quays a level down at -2 m with the water 0.75 m below them; the bridges stay at 0
// over abutments and decks the water runs on under. Every abutment has a public stair down
// to each quay beside it; the busiest bridge also has a freight ramp on each side, on the
// landward half of the quay, south of it on the west bank (toward the market) and north of
// it on the east. The west quay's longest stretch between two bridges is the market street:
// its lots step back so a 12 m street at 0 runs along the top of the quay wall.
export const QUAY_IN = 12, QUAY_OUT = 18, QUAY_Y = -2, WATER_Y = -2.75, MARKET_W = 12;
function layQuays(w, net) {
  const { canalX, bridges } = net, S = w.size;
  w.setFloor(canalX - QUAY_IN, 0, canalX + QUAY_IN, S, WATER_Y);
  w.setFloor(canalX - QUAY_OUT, 0, canalX - QUAY_IN, S, QUAY_Y);
  w.setFloor(canalX + QUAY_IN, 0, canalX + QUAY_OUT, S, QUAY_Y);
  const M = HT.marks(w);
  for (const b of bridges) {
    // The road over both quays (abutments) and the water (a deck, parapet rows included).
    w.setFloor(canalX - QUAY_OUT, b.z - b.t, canalX + QUAY_OUT, b.z + b.t, 0);
    w.setFloor(canalX - QUAY_IN, b.z - b.t - 1, canalX + QUAY_IN, b.z + b.t + 1, 0);
    w.paint(canalX - QUAY_IN, b.z - b.t - 1, canalX + QUAY_IN, b.z + b.t + 1, SURF.ROAD);
    for (let z = b.z - b.t - 1; z < b.z + b.t + 1; z++) for (let x = canalX - QUAY_IN; x < canalX + QUAY_IN; x++) M[z * S + x] = HT.HMARK.DECK;
  }
  const busy = bridges.reduce((a, b) => (!a || b.t > a.t ? b : a), null);
  const half = (QUAY_OUT - QUAY_IN) / 2;
  for (const b of bridges) {
    for (const side of [-1, 1]) {
      // Quay columns, landward half first: west [canal-18, canal-15) [canal-15, canal-12).
      const land = side < 0 ? [canalX - QUAY_OUT, canalX - QUAY_OUT + half] : [canalX + QUAY_OUT - half, canalX + QUAY_OUT];
      const water = side < 0 ? [canalX - QUAY_OUT + half, canalX - QUAY_IN] : [canalX + QUAY_IN, canalX + QUAY_OUT - half];
      for (const dir of [-1, 1]) {
        const ramp = b === busy && dir === (side < 0 ? 1 : -1);
        const z0 = dir < 0 ? b.z - b.t : b.z + b.t, walk = dir < 0 ? 'z-' : 'z+';
        const run = (x0, x1, n, kind) => {
          const za = dir < 0 ? z0 - n : z0, zb = dir < 0 ? z0 : z0 + n;
          if (za < 4 || zb > S - 4) return;
          HT.slope(w, x0, za, x1, zb, walk, 0, QUAY_Y, kind);
        };
        if (ramp) { run(water[0], water[1], 4, 'stair'); run(land[0], land[1], 8, 'ramp'); }
        else run(Math.min(land[0], water[0]), Math.max(land[1], water[1]), 4, 'stair');
      }
    }
  }
  // The market street: the longest west stretch between two bridges.
  const zs = bridges.map((b) => b.z).sort((a, b) => a - b);
  let best = null;
  for (let k = 0; k + 1 < bridges.length; k++) {
    const a = bridges.find((b) => b.z === zs[k]), c = bridges.find((b) => b.z === zs[k + 1]);
    const len = (c.z - c.t) - (a.z + a.t);
    if (len > 36 && (!best || len > best.z1 - best.z0)) best = { z0: a.z + a.t, z1: c.z - c.t, za: a.z, zb: c.z };
  }
  net.market = best ? { ...best, x0: canalX - QUAY_OUT - MARKET_W, x1: canalX - QUAY_OUT } : null;
  if (net.market) w.paint(net.market.x0, net.market.z0, net.market.x1, net.market.z1, SURF.WALK);
}

// ---- Landmarks ----
function reserve(w, x, z, r, surf = SURF.PLAZA) {
  w.reserved.push({ x, z, r });
  const S = w.size;
  for (let zi = Math.max(0, Math.floor(z - r)); zi < Math.min(S, z + r); zi++) {
    for (let xi = Math.max(0, Math.floor(x - r)); xi < Math.min(S, x + r); xi++) {
      if ((xi + 0.5 - x) ** 2 + (zi + 0.5 - z) ** 2 > r * r) continue;
      const s = w.surface[zi * S + xi];
      if (s === SURF.LOT || s === SURF.WALK || s === SURF.ALLEY) w.surface[zi * S + xi] = surf;
    }
  }
}
const hitsReserved = (w, x0, z0, x1, z1) => w.reserved.some((c) => {
  const nx = clamp(c.x, x0, x1), nz = clamp(c.z, z0, z1);
  return (nx - c.x) ** 2 + (nz - c.z) ** 2 < c.r * c.r;
});

function addContainer(w, x, z, kind, indoor, extra) { return w.addContainer(x, z, kind, indoor, extra); }
// Small containers: a biscuit tin or a lost-property basket in place of a crate or
// locker, more often where people live or wait. Shares: [small at all, tin among them].
const SMALL = { home: [0.45, 0.8], shop: [0.3, 0.55], bar: [0.35, 0.4], office: [0.35, 0.25] };
function smallKind(rng, use, kind) { const s = SMALL[use]; return rng.chance(s[0]) ? (rng.chance(s[1]) ? 'tin' : 'basket') : kind; }
// A tin or basket left on a stall counter, 1.06 m up. It is searched from the customer
// side, so its cell is the front row of the stall and it is drawn back on the counter.
function stallBox(w, rng, x, z, yaw) {
  if (!rng.chance(0.12)) return;
  const F = D.freeFrame(x, z, yaw), t = rng.range(-0.8, 0.8), [fx, fz] = F.P(t, 1), [ax, az] = F.P(t, 0.15);
  addContainer(w, Math.floor(fx) + 0.5, Math.floor(fz) + 0.5, rng.chance(0.6) ? 'tin' : 'basket', false, { y: 1.06, yaw, ax, az });
}
// A door fills the two free cells of a shell's doorway. Its kind is fixed by the
// district; which doors are open is per raid (src/sim/doors.js). Shares per doorway:
// closed, locked, jammed shutter, dead lift. A street door is never a dead lift, so a
// shell always has one way in that can be opened.
const DOOR_KINDS = ['closed', 'locked', 'jammed', 'dead'];
const FRONT_DOOR = [62, 21, 17, 0], BACK_DOOR = [44, 19, 15, 22];
function addDoor(w, rng, s, c, x0, z0, x1, z1, back, col) {
  const horiz = s < 2, wa = Math.floor(s === 0 ? z0 : s === 1 ? z1 - 1 : s === 2 ? x0 : x1 - 1);
  const dx0 = horiz ? c - 1 : wa, dz0 = horiz ? wa : c - 1, dx1 = dx0 + (horiz ? 2 : 1), dz1 = dz0 + (horiz ? 1 : 2);
  const cells = [];
  for (let zi = dz0; zi < dz1; zi++) for (let xi = dx0; xi < dx1; xi++) cells.push(zi * w.size + xi);
  if (cells.some((i) => w.grid[i] !== 0)) return null;
  const x = (dx0 + dx1) / 2, z = (dz0 + dz1) / 2, zone = w.zoneAt(x, z);
  const kind = zone === 0 ? 'closed' : DOOR_KINDS[rng.weighted(back ? BACK_DOOR : FRONT_DOOR)];
  const d = {
    id: w.doors.length, kind, side: s, horiz, back, x, z, x0: dx0, z0: dz0, x1: dx1, z1: dz1, cells,
    nx: s === 2 ? -1 : s === 3 ? 1 : 0, nz: s === 0 ? -1 : s === 1 ? 1 : 0, use: 'shop', key: -1, ref: '', block: w.blockIndex(x, z), zone, col,
  };
  for (const i of cells) { w.grid[i] = 3; w.doorCell[i] = d.id + 1; }
  w.doors.push(d);
  return d;
}

function addPoi(w, type, x, z, extra = {}) {
  const p = { id: w.pois.length, type, x, z, zone: w.zoneAt(x, z), ...extra };
  w.pois.push(p);
  if (type !== 'extract' && type !== 'nest' && type !== 'boss' && type !== 'scene') w.fillRect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 2);
  return p;
}

// The centre of the lot whose zone and position best match a landmark.
function pickLot(w, net, used, filter, cost) {
  let best = null, bc = Infinity;
  for (let i = 0; i < net.xs.length - 1; i++) {
    for (let j = 0; j < net.zs.length - 1; j++) {
      const key = i * 1000 + j;
      if (used.has(key)) continue;
      const x = (net.xs[i] + net.xs[i + 1]) / 2, z = (net.zs[j] + net.zs[j + 1]) / 2;
      const sx = net.xs[i + 1] - net.xs[i], sz = net.zs[j + 1] - net.zs[j];
      // Landmarks sit on lots with at least one real street beside them.
      const open = Math.max(net.v[i][j], net.v[i + 1][j], net.h[j][i], net.h[j + 1][i]) >= 2;
      if (!open || !filter(x, z, w.zoneAt(x, z), Math.min(sx, sz))) continue;
      const c = cost(x, z);
      if (c < bc) { bc = c; best = { x, z, key, sx, sz }; }
    }
  }
  if (best) used.add(best.key);
  return best;
}

function placeLandmarks(w, net, rng) {
  const used = new Set();
  const d2 = (x, z, tx, tz) => (x - tx) ** 2 + (z - tz) ** 2;
  // Insertion: a Shelter plaza right on the forced avenue crossing.
  const ix = INSERT_X, iz = INSERT_Z;
  w.insertion = { x: ix, z: iz + 8 };
  reserve(w, ix, iz, 26);
  // A clear walk from the Shelter out to the avenue to its north.
  for (let z = iz - 24; z > iz - 52; z -= 3) reserve(w, ix, z, 3.4, SURF.ALLEY);
  for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
    w.fillRect(ix + dx - 0.5, iz + dz - 0.5, ix + dx + 0.5, iz + dz + 0.5, 1);
    cyl(w, ix + dx, 0, 5.2, iz + dz, 0.4, MAT.PLAIN, [0.16, 0.18, 0.2], 0, 6);
  }
  box(w, ix, 5.4, iz, 21, 0.4, 21, MAT.PLAIN, [0.1, 0.12, 0.14], 0, 6);
  box(w, ix, 5.1, iz, 17, 0.12, 0.3, MAT.EMISSIVE, [0.4, 0.8, 1.0], 6);
  box(w, ix, 5.1, iz, 0.3, 0.12, 17, MAT.EMISSIVE, [0.4, 0.8, 1.0], 6);
  light(w, ix, 4.6, iz, [0.5, 0.8, 1.0], 28, 2.2);
  // The Shelter holds the Broker and nothing to loot: supplies are out in the city.
  addPoi(w, 'broker', ix - 17.5, iz + 6.5, { name: 'Gray Market Broker' });
  D.dressShelter(w, rng.fork('shelter'), ix, iz);

  const extract = (idx, name, lot) => {
    if (!lot) return;
    reserve(w, lot.x, lot.z, 15);
    const e = addPoi(w, 'extract', lot.x, lot.z, { name, idx, r: 6 });
    w.extractions[idx] = e;
    for (let a = 0; a < 4; a++) {
      const px = lot.x + Math.cos(a * Math.PI / 2 + 0.785) * 9, pz = lot.z + Math.sin(a * Math.PI / 2 + 0.785) * 9;
      cyl(w, px, 0, 6, pz, 0.2, MAT.EMISSIVE, [0.2, 1.0, 0.45], 5);
    }
    light(w, lot.x, 4, lot.z, [0.2, 1.0, 0.45], 30, 2.4);
    if (idx !== 0) addContainer(w, Math.floor(lot.x + 11) + 0.5, Math.floor(lot.z - 9) + 0.5, 'crate', false);
    D.dressExtract(w, rng.fork('ex' + idx), lot.x, lot.z, idx);
  };
  // Zone is a preference, not a requirement: on a small map the right zone may not have a free lot.
  const S = w.size, zw = (zn, want) => Math.abs(zn - want) * S * S * 0.2;
  const zAt = (x, z) => w.zoneAt(x, z);
  extract(0, 'Shelter Gate', pickLot(w, net, used, (x, z, zn) => zn >= 1 && d2(x, z, ix, iz) > (S * 0.16) ** 2 && x < net.canalX, (x, z) => d2(x, z, ix + S * 0.2, iz - S * 0.1) + zw(zAt(x, z), 1)));
  extract(1, 'Dock Boat', pickLot(w, net, used, (x) => x > net.canalX + 20, (x, z) => d2(x, z, S, S * 0.55) + zw(zAt(x, z), 2)));
  extract(2, 'Rail Platform', pickLot(w, net, used, (x, z) => x < S * 0.3 && z < S * 0.7, (x, z) => d2(x, z, 0, S * 0.42) + zw(zAt(x, z), 3)));
  extract(3, 'Rooftop Dropship', pickLot(w, net, used, (x, z) => z < S * 0.3 && x < net.canalX, (x, z) => d2(x, z, S * 0.5, 0) + zw(zAt(x, z), 4)));

  // The lair takes the roomiest lot in the upper half of the district.
  const boss = pickLot(w, net, used, (x, z, zn, m) => m >= 44 && x < net.canalX - 20 && z < S * 0.62, (x, z) => -Math.min(net.xs.find((v) => v > x) - x, 60) * S + zw(zAt(x, z), 3) * 0.01 + d2(x, z, S * 0.55, S * 0.3) * 0.01)
    || pickLot(w, net, used, (x) => x < net.canalX - 20, (x, z) => d2(x, z, S * 0.5, S * 0.3));
  if (boss) {
    const AR = clamp(Math.min(boss.sx, boss.sz) / 2 + 4, 22, 32);
    const arena = { x: boss.x, z: boss.z, r: AR, pillars: [] };
    reserve(w, boss.x, boss.z, AR + 4);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + 0.39, px = Math.round(boss.x + Math.cos(a) * AR * 0.55), pz = Math.round(boss.z + Math.sin(a) * AR * 0.55);
      w.fillRect(px - 1, pz - 1, px + 1, pz + 1, 1);
      cyl(w, px, 0, 7, pz, 1.0, MAT.PLAIN, [0.2, 0.17, 0.18], 0, 1);
      cyl(w, px, 7, 7.3, pz, 1.25, MAT.EMISSIVE, [1.0, 0.2, 0.5], 2.5);
      arena.pillars.push({ x: px, z: pz });
    }
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, px = boss.x + Math.cos(a) * AR * 0.9, pz = boss.z + Math.sin(a) * AR * 0.9;
      cyl(w, px, 0, 8, pz, 0.15, MAT.PLAIN, [0.08, 0.08, 0.09]);
      ball(w, px, 8.3, pz, 0.5, MAT.EMISSIVE, [1.0, 0.45, 0.2], 7);
      light(w, px, 7.5, pz, [1.0, 0.45, 0.25], 28, 2.0);
    }
    w.boss = arena;
    D.dressArena(w, rng.fork('arena'), arena);
    addPoi(w, 'boss', boss.x, boss.z + AR * 0.68, { name: 'Matron of Hollows', r: 4 });
  }
  const broker = pickLot(w, net, used, (x, z, zn) => zn >= 1 && x < net.canalX - 20, (x, z) => d2(x, z, S * 0.3, S * 0.5) + zw(zAt(x, z), 2));
  if (broker) {
    reserve(w, broker.x, broker.z, 10);
    addPoi(w, 'broker', Math.floor(broker.x) + 0.5, Math.floor(broker.z) + 0.5, { name: 'Gray Market Broker' });
    light(w, broker.x, 4, broker.z, [1.0, 0.7, 0.2], 24, 2.0);
    addPoi(w, 'cache', Math.floor(broker.x) + 6.5, Math.floor(broker.z) + 4.5);
  }
  const nests = [];
  for (let k = 0; k < (S <= 800 ? 2 : 6); k++) {
    const lot = pickLot(w, net, used, (x, z, zn, m) => zn >= (S <= 800 ? 2 : 3) && m >= 36 && nests.every((o) => d2(x, z, o.x, o.z) > (S * 0.3) ** 2), (x, z) => rng.float() - zAt(x, z));
    if (!lot) break;
    nests.push(lot);
    reserve(w, lot.x, lot.z, 19);
    addPoi(w, 'nest', lot.x, lot.z, { r: 14 });
    for (let q = 0; q < 10; q++) {
      const a = rng.float() * 6.283, d = rng.range(0, 5), s = rng.range(0.9, 2.0);
      ball(w, lot.x + Math.cos(a) * d, s * 0.6, lot.z + Math.sin(a) * d, s, MAT.ORGANIC, [0.55, 0.06, 0.32], 1.4, rng.float(), 0.8);
    }
    w.fillRect(lot.x - 2, lot.z - 2, lot.x + 2, lot.z + 2, 1);
    light(w, lot.x, 3, lot.z, [1.0, 0.1, 0.55], 26, 2.2);
  }
}

// ---- Buildings ----
function addSigns(w, rng, x0, z0, x1, z1, h, style, sides) {
  const density = style === STYLE.NEON ? 0.95 : style === STYLE.OLDTOWN ? 0.8 : style === STYLE.DOCK ? 0.4 : 0.55;
  for (const s of sides) {
    if (!rng.chance(density)) continue;
    const col = rng.pick(NEON), horiz = s < 2;
    const len = horiz ? x1 - x0 : z1 - z0, mid = horiz ? (x0 + x1) / 2 : (z0 + z1) / 2;
    const face = s === 0 ? z0 : s === 1 ? z1 : s === 2 ? x0 : x1, out = s === 0 || s === 2 ? -1 : 1;
    const px = (t, o) => (horiz ? [t, face + out * o] : [face + out * o, t]);
    const [lx, lz] = px(mid, 2.5);
    light(w, lx, 3.2, lz, col, 15, 1.2);
    // Vertical blade sign with lettering.
    if (h > 8 && rng.chance(0.8)) {
      const col2 = rng.pick(NEON), sh = Math.min(h - 4.5, rng.range(3.5, 11)), sy = 4.2 + sh / 2;
      const [bx, bz] = px(mid + rng.range(-0.4, 0.4) * len, 0.8);
      box(w, bx, sy, bz, horiz ? 1.2 : 0.35, sh, horiz ? 0.35 : 1.2, MAT.SIGN, col2, 5.5, rng.float(), 1);
      box(w, bx, sy, bz, horiz ? 1.35 : 0.2, sh + 0.2, horiz ? 0.2 : 1.35, MAT.PLAIN, [0.03, 0.03, 0.04]);
      const [qx, qz] = px(mid, 3);
      light(w, qx, Math.min(sy, 7), qz, col2, 17, 1.4);
    }
    // Wide board above the first floors on bigger frontages.
    if (len > 14 && h > 12 && rng.chance(0.5)) {
      const col3 = rng.pick(NEON), bl = Math.min(len * 0.7, rng.range(6, 14)), [bx, bz] = px(mid + rng.range(-0.15, 0.15) * len, 0.25);
      box(w, bx, rng.range(7, Math.min(h - 2, 13)), bz, horiz ? bl : 0.3, 2.2, horiz ? 0.3 : bl, MAT.SIGN, col3, 4.5, rng.float(), 0);
    }
  }
}

function addRoof(w, rng, x0, z0, x1, z1, h) {
  const bw = x1 - x0, bd = z1 - z0;
  if (bw < 6 || bd < 6) return;
  const style = w.curStyle;
  // Old Town: low houses carry a tiled gable roof with deep eaves.
  if (style === STYLE.OLDTOWN && h <= 13 && Math.min(bw, bd) <= 22 && rng.chance(0.75)) {
    const tile = rng.pick([[0.11, 0.12, 0.15], [0.17, 0.09, 0.07], [0.08, 0.1, 0.1], [0.13, 0.13, 0.12]]);
    const rise = Math.min(4.2, Math.min(bw, bd) * 0.28), ov = 0.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (bw >= bd) {
      prim(w, SHAPE.WEDGE, cx, h + rise / 2, cz + bd / 4 + ov / 2, bw + ov * 2, rise, bd / 2 + ov, MAT.PLAIN, tile, 0, 12);
      prim(w, SHAPE.WEDGE, cx, h + rise / 2, cz - bd / 4 - ov / 2, bw + ov * 2, rise, bd / 2 + ov, MAT.PLAIN, tile, 0, 12, 0, 0, 0, Math.PI);
      box(w, cx, h + rise + 0.08, cz, bw + ov * 2 + 0.2, 0.2, 0.36, MAT.PLAIN, [0.06, 0.06, 0.07]);
    } else {
      prim(w, SHAPE.WEDGE, cx + bw / 4 + ov / 2, h + rise / 2, cz, bd + ov * 2, rise, bw / 2 + ov, MAT.PLAIN, tile, 0, 12, 0, 0, 0, Math.PI / 2);
      prim(w, SHAPE.WEDGE, cx - bw / 4 - ov / 2, h + rise / 2, cz, bd + ov * 2, rise, bw / 2 + ov, MAT.PLAIN, tile, 0, 12, 0, 0, 0, -Math.PI / 2);
      box(w, cx, h + rise + 0.08, cz, 0.36, 0.2, bd + ov * 2 + 0.2, MAT.PLAIN, [0.06, 0.06, 0.07]);
    }
    return;
  }
  // Flat roofs get a parapet, which also reads well from above.
  if (h < 34) {
    const pc = [0.12, 0.12, 0.13];
    boxMM(w, x0, z0, x1, z0 + 0.3, h, h + 0.7, MAT.PLAIN, pc, 0, 1); boxMM(w, x0, z1 - 0.3, x1, z1, h, h + 0.7, MAT.PLAIN, pc, 0, 1);
    boxMM(w, x0, z0 + 0.3, x0 + 0.3, z1 - 0.3, h, h + 0.7, MAT.PLAIN, pc, 0, 1); boxMM(w, x1 - 0.3, z0 + 0.3, x1, z1 - 0.3, h, h + 0.7, MAT.PLAIN, pc, 0, 1);
    if (rng.chance(0.35)) { const sx = rng.range(x0 + 2, x1 - 3), sz = rng.range(z0 + 2, z1 - 3); box(w, sx, h + 1.2, sz, 2.2, 2.4, 2.2, MAT.PLAIN, [0.15, 0.15, 0.16], 0, 1); box(w, sx + 1.12, h + 1.0, sz, 0.05, 1.9, 0.9, MAT.PLAIN, [0.05, 0.06, 0.07], 0, 6); }
  }
  const rx = () => rng.range(x0 + 2, x1 - 2), rz = () => rng.range(z0 + 2, z1 - 2);
  // Roofscape: masts, dishes, solar racks, pipe runs, skylights and a lit edge.
  if (rng.chance(0.55)) { const x = rx(), z = rz(), mh = rng.range(3, 7); cyl(w, x, h, h + mh, z, 0.05, MAT.PLAIN, [0.12, 0.12, 0.13]); for (let q = 0; q < 3; q++) box(w, x, h + mh - 0.4 - q * 0.5, z, 1.2 - q * 0.25, 0.03, 0.03, MAT.PLAIN, [0.12, 0.12, 0.13], 0, 0, 0, 0, 0, rng.float() * 3); }
  if (rng.chance(0.45)) { const x = rx(), z = rz(); cyl(w, x, h, h + 0.9, z, 0.05, MAT.PLAIN, [0.2, 0.2, 0.21]); primR(w, SHAPE.SPHERE, x, h + 1.1, z, 1.1, 1.1, 0.28, MAT.PLAIN, [0.42, 0.43, 0.44], 0, 6, 0, 0, 0, rng.float() * 6.283, -0.6); }
  if (bw > 10 && bd > 8 && rng.chance(0.4)) { const x = rng.range(x0 + 4, x1 - 4), z = rz(), n = rng.irange(2, 4); for (let q = 0; q < n; q++) { primR(w, SHAPE.BOX, x, h + 0.7, z - 1.5 + q * 1.3, Math.min(5, bw - 6), 0.06, 1.0, MAT.GLOSS, [0.02, 0.04, 0.09], 0, 0, 0, 0, 0, 0, 0.45); box(w, x, h + 0.3, z - 1.5 + q * 1.3 - 0.3, Math.min(5, bw - 6) * 0.9, 0.6, 0.05, MAT.PLAIN, [0.1, 0.1, 0.11], 0, 11, 0); } }
  if (rng.chance(0.6)) { const z = rz(); box(w, (x0 + x1) / 2, h + 0.22, z, bw - 3, 0.14, 0.14, MAT.PLAIN, [0.24, 0.2, 0.16], 0, 6); box(w, (x0 + x1) / 2, h + 0.22, z + 0.3, bw - 4, 0.1, 0.1, MAT.PLAIN, [0.16, 0.17, 0.19], 0, 6); for (let x = x0 + 2; x < x1 - 2; x += 3) box(w, x, h + 0.08, z + 0.12, 0.12, 0.16, 0.5, MAT.PLAIN, [0.1, 0.1, 0.11]); }
  if (bw > 9 && bd > 9 && rng.chance(0.3)) { const x = rx(), z = rz(); box(w, x, h + 0.25, z, 2.4, 0.5, 1.6, MAT.PLAIN, [0.14, 0.14, 0.15], 0, 1); box(w, x, h + 0.52, z, 2.1, 0.06, 1.3, MAT.EMISSIVE, [1.0, 0.8, 0.5], 0.9, rng.float()); }
  if (h < 40 && rng.chance(0.3)) { const col = rng.pick(NEON), s = rng.int(4); if (s < 2) box(w, (x0 + x1) / 2, h + 0.78, s ? z1 - 0.15 : z0 + 0.15, bw - 0.6, 0.08, 0.08, MAT.EMISSIVE, col, 3, rng.float()); else box(w, s === 2 ? x0 + 0.15 : x1 - 0.15, h + 0.78, (z0 + z1) / 2, 0.08, 0.08, bd - 0.6, MAT.EMISSIVE, col, 3, rng.float()); }
  if (rng.chance(0.5)) { const x = rx(), z = rz(); cyl(w, x, h + 0.6, h + 2.8, z, 1.1, MAT.PLAIN, [0.16, 0.15, 0.14], 0, 1); for (const [a, b] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) cyl(w, x + a, h, h + 0.7, z + b, 0.07, MAT.PLAIN, [0.08, 0.08, 0.08]); }
  for (let k = 0; k < 2; k++) if (rng.chance(0.6)) box(w, rx(), h + 0.55, rz(), rng.range(1.4, 2.6), 1.1, rng.range(1.2, 2.0), MAT.PLAIN, [0.17, 0.18, 0.19]);
  if (h > 24 && rng.chance(0.6)) {
    const col = rng.pick(NEON), bl = Math.min(bw - 2, rng.range(8, 16));
    box(w, (x0 + x1) / 2, h + 3.4, z1 - 1, bl, 5.4, 0.35, rng.chance(0.5) ? MAT.HOLO : MAT.SIGN, col, 4.5, rng.float(), 0);
    for (const dx of [-bl / 2 + 0.5, bl / 2 - 0.5]) cyl(w, (x0 + x1) / 2 + dx, h, h + 0.8, z1 - 1, 0.12, MAT.PLAIN, [0.06, 0.06, 0.07]);
  }
  if (h > 44) { cyl(w, x0 + 2, h, h + 9, z0 + 2, 0.12, MAT.PLAIN, [0.1, 0.1, 0.1]); ball(w, x0 + 2, h + 9.2, z0 + 2, 0.3, MAT.EMISSIVE, [1, 0.1, 0.1], 6, rng.float()); }
}

// Geometry on the face of a solid building: balconies with railings on housing,
// vertical light strips on towers.
function addFacadeDetail(w, rng, x0, z0, x1, z1, h, style, sides) {
  const floors = Math.floor(h / 3.3);
  if ((style === STYLE.OLDTOWN || style === STYLE.NEON) && floors >= 3 && h <= 44 && rng.chance(0.5)) {
    const top = Math.min(floors - 1, 7), rail = [0.07, 0.075, 0.08], slab = [0.2, 0.2, 0.21];
    for (const s of sides) {
      const horiz = s < 2, len = horiz ? x1 - x0 : z1 - z0, mid = horiz ? (x0 + x1) / 2 : (z0 + z1) / 2;
      const face = s === 0 ? z0 : s === 1 ? z1 : s === 2 ? x0 : x1, out = s === 0 || s === 2 ? -1 : 1, bl = len * rng.range(0.55, 0.92);
      for (let k = 1; k <= top; k++) {
        if (rng.chance(0.2)) continue;
        const y = k * 3.3 + 0.12;
        if (horiz) { box(w, mid, y, face + out * 0.5, bl, 0.14, 1.0, MAT.PLAIN, slab, 0, 1); box(w, mid, y + 0.55, face + out * 0.97, bl, 0.95, 0.06, MAT.PLAIN, rail, 0, 6); }
        else { box(w, face + out * 0.5, y, mid, 1.0, 0.14, bl, MAT.PLAIN, slab, 0, 1); box(w, face + out * 0.97, y + 0.55, mid, 0.06, 0.95, bl, MAT.PLAIN, rail, 0, 6); }
        // Now and then something on the balcony: laundry or a plant.
        if (rng.chance(0.3)) { const t = mid + rng.range(-0.4, 0.4) * bl, c = rng.pick([[0.5, 0.5, 0.55], [0.45, 0.2, 0.2], [0.2, 0.3, 0.45], [0.1, 0.25, 0.12]]); if (horiz) box(w, t, y + 0.75, face + out * 0.7, 0.9, 0.7, 0.05, MAT.PLAIN, c, 0, 5); else box(w, face + out * 0.7, y + 0.75, t, 0.05, 0.7, 0.9, MAT.PLAIN, c, 0, 5); }
      }
    }
  }
  if (h > 56) {
    const col = rng.pick(NEON);
    for (const [cx, cz] of [[x0, z0], [x1, z1]]) box(w, cx, h * 0.55, cz, 0.35, h * 0.86, 0.35, MAT.EMISSIVE, col, 2.2, rng.float());
    w.towers.push({ x0, z0, x1, z1, h });
  }
}

// Which sides of a footprint look onto walkable public ground within a few metres.
function openSides(w, x0, z0, x1, z1) {
  // Public ground on the building's own level: a sunken quay below the wall is not a way in.
  const ok = (x, z) => { const s = w.surf(x, z); return w.cell(x, z) === 0 && s !== SURF.LOT && s !== SURF.WATER && w.floorAt(x, z) === w.floorAt((x0 + x1) / 2, (z0 + z1) / 2); };
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, out = [];
  const probe = (dx, dz, bx, bz) => { for (let d = 1.5; d <= 4.5; d += 1) if (ok(bx + dx * d, bz + dz * d)) return true; return false; };
  if (probe(0, -1, mx, z0)) out.push(0);
  if (probe(0, 1, mx, z1)) out.push(1);
  if (probe(-1, 0, x0, mz)) out.push(2);
  if (probe(1, 0, x1, mz)) out.push(3);
  return out;
}

function addBuilding(w, rng, x0, z0, x1, z1, style, big) {
  const bw = x1 - x0, bd = z1 - z0;
  if (bw < 6 || bd < 6 || hitsReserved(w, x0, z0, x1, z1)) return;
  const h = heightFor(style, rng, big);
  w.curStyle = style;
  const base = rng.pick(WALLS[style]), tint = rng.range(0.8, 1.2);
  const col = [base[0] * tint, base[1] * tint, base[2] * tint];
  const seed = rng.float() * 997, lit = rng.range(0.14, 0.5), cellW = rng.range(2.4, 3.8), accent = rng.int(8);
  const sides = openSides(w, x0, z0, x1, z1);
  const enterable = !big && sides.length > 0 && bw <= 40 && bd <= 40 && Math.min(bw, bd) >= 11 && rng.chance(0.42);

  if (!enterable) {
    w.fillRect(x0, z0, x1, z1, 1);
    // Stepped massing: a podium with a narrower tower above it on tall buildings.
    const podium = h > 26 && bw > 18 && bd > 18 && rng.chance(0.7) ? rng.irange(7, 14) : 0;
    if (podium) {
      const s = rng.irange(2, 5);
      boxMM(w, x0, z0, x1, z1, 0, podium, MAT.FACADE, col, 1, seed, lit, cellW, accent);
      boxMM(w, x0 + s, z0 + s, x1 - s, z1 - s, podium, h, MAT.FACADE, col, 1, seed + 5, lit, cellW, accent);
      if (h > 60 && rng.chance(0.6)) { const s2 = s + rng.irange(3, 6); if (x1 - x0 - 2 * s2 > 8 && z1 - z0 - 2 * s2 > 8) boxMM(w, x0 + s2, z0 + s2, x1 - s2, z1 - s2, h, h + h * rng.range(0.12, 0.3), MAT.FACADE, col, 1, seed + 9, lit, cellW, accent); }
      addRoof(w, rng, x0 + s, z0 + s, x1 - s, z1 - s, h);
    } else {
      boxMM(w, x0, z0, x1, z1, 0, h, MAT.FACADE, col, 1, seed, lit, cellW, accent);
      addRoof(w, rng, x0, z0, x1, z1, h);
    }
    // Plinth cap shown when the cut-away removes the upper mass.
    boxMM(w, x0 + 0.06, z0 + 0.06, x1 - 0.06, z1 - 0.06, 0, 2.58, MAT.PLAIN, [0.035, 0.038, 0.046], 0, 4);
    addFacadeDetail(w, rng, x0, z0, x1, z1, h, style, sides);
    addSigns(w, rng, x0, z0, x1, z1, h, style, sides);
    D.dressFrontage(w, rng, x0, z0, x1, z1, h, style, sides, cellW);
    return;
  }

  // ---- Enterable building: wall shell with a door, an interior and containers ----
  const WH = 4.0;
  const wallCol = [col[0] * 1.3 + 0.05, col[1] * 1.3 + 0.05, col[2] * 1.3 + 0.06];
  const doorSide = rng.pick(sides), horiz = doorSide < 2;
  // A back door when the far side also opens onto public ground: a way through.
  const back = doorSide ^ 1, door2 = sides.includes(back) && rng.chance(0.7) ? back : -1;
  const doorC = Math.round((horiz ? x0 : z0) + (horiz ? bw : bd) / 2 + rng.irange(-2, 2));
  const wall = (ax0, az0, ax1, az1) => {
    if (ax1 - ax0 <= 0 || az1 - az0 <= 0) return;
    w.fillRect(ax0, az0, ax1, az1, 1);
    boxMM(w, ax0, az0, ax1, az1, 0, WH, MAT.PLAIN, wallCol, 0, 1);
  };
  for (let s = 0; s < 4; s++) {
    const door = s === doorSide || s === door2;
    if (s < 2) {
      const za = s === 0 ? z0 : z1 - 1;
      if (door) { wall(x0, za, doorC - 1.5, za + 1); wall(doorC + 1.5, za, x1, za + 1); } else wall(x0, za, x1, za + 1);
    } else {
      const xa = s === 2 ? x0 : x1 - 1;
      if (door) { wall(xa, z0 + 1, xa + 1, doorC - 1.5); wall(xa, doorC + 1.5, xa + 1, z1 - 1); } else wall(xa, z0 + 1, xa + 1, z1 - 1);
    }
  }
  // Doors go in before the furniture, which then keeps clear of them. Their own stream
  // leaves the lot's random sequence, and so the rest of the district, unchanged.
  const dr = rng.fork('doors'), shellDoors = [addDoor(w, dr, doorSide, doorC, x0, z0, x1, z1, false, wallCol)];
  if (door2 >= 0) shellDoors.push(addDoor(w, dr, door2, doorC, x0, z0, x1, z1, true, wallCol));
  boxMM(w, x0 + 1, z0 + 1, x1 - 1, z1 - 1, 0, 0.05, MAT.PLAIN, [0.19, 0.185, 0.18], 0, 2);
  if (h > WH + 2) boxMM(w, x0, z0, x1, z1, WH, h, MAT.FACADE, col, 1, seed, lit, cellW, accent);
  else boxMM(w, x0, z0, x1, z1, WH, WH + 0.4, MAT.PLAIN, [0.1, 0.1, 0.11]);
  addRoof(w, rng, x0, z0, x1, z1, Math.max(h, WH + 0.4));
  // Door frame glow so entrances read from the street.
  const dcol = NEON[accent], out = doorSide === 0 || doorSide === 2 ? -1 : 1;
  const face = doorSide === 0 ? z0 : doorSide === 1 ? z1 : doorSide === 2 ? x0 : x1;
  if (horiz) box(w, doorC, WH - 0.5, face + out * 0.15, 3.4, 0.25, 0.2, MAT.EMISSIVE, dcol, 6, seed);
  else box(w, face + out * 0.15, WH - 0.5, doorC, 0.2, 0.25, 3.4, MAT.EMISSIVE, dcol, 6, seed);
  const warm = rng.chance(0.5) ? [1.0, 0.75, 0.45] : [0.55, 0.8, 1.0];
  light(w, (x0 + x1) / 2, 3.4, (z0 + z1) / 2, warm, Math.max(bw, bd) * 0.8 + 6, 2.6);
  // Partition, counters and shelving so interiors are not empty boxes.
  if (bw >= 20 && horiz) {
    const px = Math.round(x0 + bw * (doorC > (x0 + x1) / 2 ? 0.35 : 0.65)), gap = rng.irange(z0 + 3, z1 - 6);
    wall(px, z0 + 1, px + 1, gap); wall(px, gap + 3, px + 1, z1 - 1);
  } else if (bd >= 20 && !horiz) {
    const pz = Math.round(z0 + bd * (doorC > (z0 + z1) / 2 ? 0.35 : 0.65)), gap = rng.irange(x0 + 3, x1 - 6);
    wall(x0 + 1, pz, gap, pz + 1); wall(gap + 3, pz, x1 - 1, pz + 1);
  }
  const doorX = horiz ? doorC : face, doorZ = horiz ? face : doorC;
  // Furnish by use: a shop with shelving, a bar with a counter, an office or a home.
  const use = rng.pick(['shop', 'shop', 'bar', 'office', 'home']);
  for (const d of shellDoors) if (d) d.use = use;
  const place = (fx, fz, fw, fd) => {
    if (Math.hypot(fx + fw / 2 - doorX, fz + fd / 2 - doorZ) < 4.5) return false;
    for (let zz = Math.floor(fz); zz < fz + fd; zz++) for (let xx = Math.floor(fx); xx < fx + fw; xx++) if (w.cell(xx + 0.5, zz + 0.5) !== 0) return false;
    w.fillRect(fx, fz, fx + fw, fz + fd, 2);
    return true;
  };
  const wood = [0.2, 0.14, 0.09], steel = [0.16, 0.17, 0.19];
  if (use === 'shop') {
    for (let fx = x0 + 3; fx < x1 - 4; fx += 4) {
      const fz = z0 + 3, fd = Math.max(2, Math.min(6, bd - 8));
      if (!place(fx, fz, 1, fd)) continue;
      boxMM(w, fx, fz, fx + 1, fz + fd, 0, 1.7, MAT.PLAIN, steel, 0, 6);
      for (const sy of [0.6, 1.1, 1.55]) boxMM(w, fx - 0.04, fz + 0.1, fx + 1.04, fz + fd - 0.1, sy, sy + 0.22, MAT.EMISSIVE, rng.pick(NEON), 0.5, rng.float());
    }
    if (place(x1 - 3, z1 - 4, 1, 2)) { boxMM(w, x1 - 3, z1 - 4, x1 - 2, z1 - 2, 0, 2.0, MAT.GLOSS, [0.8, 0.82, 0.85], 0); boxMM(w, x1 - 3.05, z1 - 3.9, x1 - 3, z1 - 2.1, 0.3, 1.8, MAT.EMISSIVE, [0.75, 0.9, 1.0], 2.0); }
  } else if (use === 'bar') {
    const fx = x0 + 3, fz = Math.floor((z0 + z1) / 2), fw = Math.max(3, Math.min(8, bw - 7));
    if (place(fx, fz, fw, 1)) {
      boxMM(w, fx, fz, fx + fw, fz + 1, 0, 1.1, MAT.PLAIN, wood, 0, 13);
      boxMM(w, fx, fz - 0.1, fx + fw, fz + 1.1, 1.1, 1.17, MAT.GLOSS, [0.05, 0.04, 0.04], 0);
      for (let q = fx + 0.6; q < fx + fw; q += 1.2) { cyl(w, q, 0, 0.7, fz + 1.7, 0.06, MAT.PLAIN, steel, 0, 6); cyl(w, q, 0.7, 0.78, fz + 1.7, 0.2, MAT.PLAIN, [0.3, 0.07, 0.07], 0, 9); }
      boxMM(w, fx, z0 + 1.05, fx + fw, z0 + 1.3, 1.3, 2.4, MAT.EMISSIVE, rng.pick(NEON), 1.2, rng.float());
    }
  } else if (use === 'office') {
    for (let fx = x0 + 3; fx < x1 - 4; fx += 4) for (let fz = z0 + 3; fz < z1 - 4; fz += 4) {
      if (!rng.chance(0.75) || !place(fx, fz, 2, 1)) continue;
      boxMM(w, fx, fz, fx + 2, fz + 1, 0.7, 0.76, MAT.PLAIN, wood, 0, 13);
      for (const [a, b] of [[0.1, 0.1], [1.9, 0.1], [0.1, 0.9], [1.9, 0.9]]) cyl(w, fx + a, 0, 0.7, fz + b, 0.03, MAT.PLAIN, steel, 0, 6);
      box(w, fx + 1, 1.05, fz + 0.2, 0.6, 0.4, 0.04, MAT.EMISSIVE, [0.5, 0.75, 1.0], 1.6, rng.float());
    }
  } else {
    if (place(x0 + 2, z1 - 4, 2, 2)) { boxMM(w, x0 + 2, z1 - 4, x0 + 4, z1 - 2, 0, 0.45, MAT.PLAIN, [0.25, 0.22, 0.26], 0, 5); boxMM(w, x0 + 2, z1 - 4, x0 + 4, z1 - 3.4, 0.45, 0.6, MAT.PLAIN, [0.5, 0.5, 0.52], 0, 5); }
    if (place(Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2), 2, 1)) { const tx = Math.floor((x0 + x1) / 2), tz = Math.floor((z0 + z1) / 2); boxMM(w, tx, tz, tx + 2, tz + 1, 0.4, 0.46, MAT.PLAIN, wood, 0, 13); boxMM(w, tx + 0.2, tz + 0.2, tx + 1.8, tz + 0.8, 0, 0.4, MAT.PLAIN, wood, 0, 13); }
    if (place(x1 - 4, z0 + 2, 2, 1)) { boxMM(w, x1 - 4, z0 + 2, x1 - 2, z0 + 3, 0, 0.8, MAT.PLAIN, [0.14, 0.2, 0.26], 0, 5); boxMM(w, x1 - 4, z0 + 2, x1 - 2, z0 + 2.3, 0.8, 1.3, MAT.PLAIN, [0.14, 0.2, 0.26], 0, 5); }
  }
  const spots = rng.shuffle([
    [x0 + 2.5, z0 + 2.5], [x1 - 2.5, z0 + 2.5], [x0 + 2.5, z1 - 2.5], [x1 - 2.5, z1 - 2.5],
    [(x0 + x1) / 2, z0 + 2.5], [(x0 + x1) / 2, z1 - 2.5], [x0 + 2.5, (z0 + z1) / 2], [x1 - 2.5, (z0 + z1) / 2],
  ]);
  let count = rng.irange(2, 4);
  const kr = rng.fork('kinds');
  for (const [sx, sz] of spots) {
    if (count <= 0) break;
    if (Math.hypot(sx - doorX, sz - doorZ) < 5) continue;
    const cx = Math.floor(sx) + 0.5, cz = Math.floor(sz) + 0.5;
    if (w.cell(cx, cz) !== 0) continue;
    addContainer(w, cx, cz, smallKind(kr, use, rng.chance(0.5) ? 'locker' : 'crate'), true, { yaw: kr.float() * 6.283 });
    count--;
  }
  D.dressInterior(w, rng, x0, z0, x1, z1, use, place);
  addSigns(w, rng, x0, z0, x1, z1, Math.max(h, WH + 0.4), style, sides);
  const doors = [{ s: doorSide, c: doorC }];
  if (door2 >= 0) doors.push({ s: door2, c: doorC });
  D.dressFrontage(w, rng, x0, z0, x1, z1, Math.max(h, WH + 0.4), style, sides, cellW, { shell: true, doors });
}

function tree(w, rng, x, z) {
  if (w.cell(x, z) !== 0 || w.floorAt(x, z) !== 0) return;
  const h = rng.range(3.2, 5.2);
  w.fillRect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 2);
  cyl(w, x, 0, h, z, 0.16, MAT.PLAIN, [0.09, 0.065, 0.045], 0, SUB.BARK);
  const g = [0.05 + rng.float() * 0.04, 0.13 + rng.float() * 0.07, 0.06];
  ball(w, x, h + 0.6, z, rng.range(1.3, 1.9), MAT.FOLIAGE, g, 0, rng.float(), 0.85);
  ball(w, x + rng.range(-0.8, 0.8), h + 0.1, z + rng.range(-0.8, 0.8), rng.range(0.9, 1.3), MAT.FOLIAGE, g, 0, rng.float(), 0.8);
}
function car(w, rng, x, z, alongZ) {
  const L = 4.3, W = 1.85, cw = alongZ ? W : L, cd = alongZ ? L : W;
  if (!w.circleFree(x, z, 2.4) || w.floorAt(x, z) !== 0) return;
  const cc = rng.pick([[0.16, 0.18, 0.22], [0.3, 0.06, 0.07], [0.2, 0.2, 0.2], [0.05, 0.12, 0.16], [0.4, 0.38, 0.32], [0.04, 0.04, 0.05]]);
  w.fillRect(x - cw / 2, z - cd / 2, x + cw / 2, z + cd / 2, 2);
  box(w, x, 0.62, z, cw, 0.62, cd, MAT.ENAMEL, cc, 0);
  box(w, x, 1.18, z, alongZ ? W * 0.86 : L * 0.5, 0.52, alongZ ? L * 0.5 : W * 0.86, MAT.GLOSS, [0.02, 0.03, 0.05], 0, 1);
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const wx = x + (alongZ ? a * W * 0.46 : b * L * 0.32), wz = z + (alongZ ? b * L * 0.32 : a * W * 0.46);
    prim(w, SHAPE.SPHERE, wx, 0.33, wz, alongZ ? 0.26 : 0.66, 0.66, alongZ ? 0.66 : 0.26, MAT.PLAIN, [0.02, 0.02, 0.02], 0, SUB.RUBBER);
  }
  const e = alongZ ? [0, cd / 2] : [cw / 2, 0];
  box(w, x + e[0], 0.72, z + e[1], alongZ ? 1.5 : 0.06, 0.12, alongZ ? 0.06 : 1.5, MAT.EMISSIVE, [1, 0.1, 0.08], 2.5);
  // The tail light marks the back: the nose points the other way.
  D.rearCompartment(w, rng, { kind: 'car', x, z, yaw: alongZ ? Math.PI : -Math.PI / 2, L, W, hx: cw / 2 - 0.05, hz: cd / 2 - 0.05, col: cc });
}

// Dockside container yard: stacked boxes in rows with lanes between them, floodlit.
function containerYard(w, rng, x0, z0, x1, z1) {
  w.freightYards.push([x0, z0, x1, z1]);
  w.paint(x0, z0, x1, z1, SURF.ROAD);
  const cols = [[0.42, 0.1, 0.07], [0.08, 0.2, 0.36], [0.1, 0.3, 0.16], [0.5, 0.26, 0.06], [0.3, 0.3, 0.31], [0.34, 0.3, 0.1]];
  const alongX = (x1 - x0) > (z1 - z0), L = 6, W = 3;
  for (let a = (alongX ? z0 : x0) + 3; a < (alongX ? z1 : x1) - W - 2; a += W + rng.pick([3, 4, 7])) {
    for (let b = (alongX ? x0 : z0) + 3; b < (alongX ? x1 : z1) - L - 2; b += L + (rng.chance(0.25) ? 4 : 0.5)) {
      if (rng.chance(0.2)) continue;
      const cx0 = alongX ? b : a, cz0 = alongX ? a : b, cw = alongX ? L : W, cd = alongX ? W : L;
      if (hitsReserved(w, cx0, cz0, cx0 + cw, cz0 + cd)) continue;
      w.fillRect(cx0, cz0, cx0 + cw, cz0 + cd, 1);
      const n = rng.weighted([30, 45, 25]) + 1;
      for (let k = 0; k < n; k++) boxMM(w, cx0 + 0.05, cz0 + 0.05, cx0 + cw - 0.05, cz0 + cd - 0.05, k * 2.6, k * 2.6 + 2.55, MAT.PLAIN, rng.pick(cols), 0, 10, rng.float());
    }
  }
  for (const [lx, lz] of [[x0 + 2, z0 + 2], [x1 - 2, z1 - 2]]) {
    if (w.cell(lx, lz) !== 0) continue;
    cyl(w, lx, 0, 11, lz, 0.14, MAT.PLAIN, [0.08, 0.08, 0.09]); box(w, lx, 11, lz, 1.6, 0.3, 0.8, MAT.EMISSIVE, [1.0, 0.92, 0.75], 7);
    light(w, lx, 10, lz, [1.0, 0.9, 0.7], 34, 2.2);
  }
  for (let k = 0; k < 3; k++) { const x = rng.irange(x0 + 2, x1 - 2) + 0.5, z = rng.irange(z0 + 2, z1 - 2) + 0.5; if (w.cell(x, z) === 0 && w.circleFree(x, z, 1)) addContainer(w, x, z, 'crate', false); }
}

// Recursive lot subdivision. Gaps become pedestrian alleys; some are dead ends.
function subdivide(w, rng, x0, z0, x1, z1, style, depth, leaves) {
  const bw = x1 - x0, bd = z1 - z0;
  const max = style === STYLE.OLDTOWN ? rng.irange(16, 26) : style === STYLE.DOCK ? rng.irange(26, 44) : style === STYLE.NEON ? rng.irange(18, 32) : rng.irange(30, 52);
  if (depth > 5 || (bw <= max && bd <= max) || Math.max(bw, bd) < 20) { leaves.push([x0, z0, x1, z1]); return; }
  const alongX = bw > bd;
  const span = alongX ? bw : bd, cut = Math.round((alongX ? x0 : z0) + span * rng.range(0.36, 0.64));
  const gap = rng.weighted([36, 42, 16, 6]);                 // 0 shared wall, 3 alley, 4, 6
  const g = [0, 3, 4, 6][gap], a = cut - Math.floor(g / 2), b = a + g;
  if (g) {
    // A dead end: the gap stops short of one side of the lot.
    const dead = rng.chance(0.3) ? rng.irange(5, 9) : 0, atStart = rng.chance(0.5);
    if (alongX) w.paint(a, z0 + (dead && atStart ? dead : 0), b, z1 - (dead && !atStart ? dead : 0), SURF.ALLEY);
    else w.paint(x0 + (dead && atStart ? dead : 0), a, x1 - (dead && !atStart ? dead : 0), b, SURF.ALLEY);
    // Landmark plazas stay open: no stub walls inside a reserved circle.
    const stubHits = dead && (alongX ? hitsReserved(w, a, atStart ? z0 : z1 - dead, b, (atStart ? z0 : z1 - dead) + dead) : hitsReserved(w, atStart ? x0 : x1 - dead, a, (atStart ? x0 : x1 - dead) + dead, b));
    if (dead && !stubHits) {
      // Close the stub with a low wall so the dead end is physical.
      if (alongX) { const zc = atStart ? z0 : z1 - dead; w.fillRect(a, zc, b, zc + dead, 1); boxMM(w, a, zc, b, zc + dead, 0, rng.range(3, 7), MAT.PLAIN, [0.12, 0.11, 0.1], 0, 1); }
      else { const xc = atStart ? x0 : x1 - dead; w.fillRect(xc, a, xc + dead, b, 1); boxMM(w, xc, a, xc + dead, b, 0, rng.range(3, 7), MAT.PLAIN, [0.12, 0.11, 0.1], 0, 1); }
    }
    leaves.gaps.push(alongX ? [a, z0, b, z1, false] : [x0, a, x1, b, true]);
  }
  if (alongX) { subdivide(w, rng, x0, z0, a, z1, style, depth + 1, leaves); subdivide(w, rng, b, z0, x1, z1, style, depth + 1, leaves); }
  else { subdivide(w, rng, x0, z0, x1, a, style, depth + 1, leaves); subdivide(w, rng, x0, b, x1, z1, style, depth + 1, leaves); }
}

// The buildable rectangle of lot (i, j): inside its streets' carriageways and pavements.
function lotBounds(w, net, i, j) {
  const { xs, zs, v, h, canalX } = net;
  const inset = (k) => (k ? ROAD_HALF[k] + WALK_W[k] : 0);
  let x0 = xs[i] + inset(v[i][j]), x1 = xs[i + 1] - inset(v[i + 1][j]), z0 = zs[j] + inset(h[j][i]), z1 = zs[j + 1] - inset(h[j + 1][i]);
  if (xs[i] === canalX) x0 = canalX + QUAY_OUT;
  if (xs[i + 1] === canalX) x1 = canalX - QUAY_OUT;
  // Lots along the market stretch step back from the quay wall for the market street.
  const M = net.market;
  if (M && xs[i + 1] === canalX && zs[j] >= M.za && zs[j + 1] <= M.zb) x1 = M.x0;
  x0 = Math.max(x0, 3); z0 = Math.max(z0, 3); x1 = Math.min(x1, w.size - 3); z1 = Math.min(z1, w.size - 3);
  return x1 - x0 < 8 || z1 - z0 < 8 ? null : { x0, z0, x1, z1 };
}

function genLot(w, net, rng, i, j) {
  const { canalX } = net, b = lotBounds(w, net, i, j);
  if (!b) return;
  const { x0, z0, x1, z1 } = b;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, style = styleFor(cx, cz, canalX), zone = w.zoneAt(cx, cz);
  if (style === STYLE.DOCK && rng.chance(0.36) && !hitsReserved(w, x0, z0, x1, z1)) { containerYard(w, rng, x0, z0, x1, z1); return; }
  // A few lots are open: a pocket park, a car park or a paved square.
  let kind = rng.weighted([64, 7, 7, 8, 7, 7]);   // built, park, car park, square, night market, building site
  // One night market and two building sites are plenty for a district this size.
  if (kind === 4 && w.places.some((q) => q.kind === 'market')) kind = 3;
  if (kind === 5 && w.places.filter((q) => q.kind === 'site').length >= 2) kind = 0;
  if (kind && !hitsReserved(w, x0, z0, x1, z1) && (x1 - x0) * (z1 - z0) < 9000) {
    w.places.push({ kind: ['', 'park', 'carpark', 'square', 'market', 'site'][kind], x: cx, z: cz });
    if (kind === 1) {
      w.paint(x0, z0, x1, z1, SURF.GRASS);
      w.paint(x0, cz - 1.5, x1, cz + 1.5, SURF.ALLEY); w.paint(cx - 1.5, z0, cx + 1.5, z1, SURF.ALLEY);
      for (let k = 0; k < (x1 - x0) * (z1 - z0) / 110; k++) tree(w, rng, rng.irange(x0 + 2, x1 - 2) + 0.5, rng.irange(z0 + 2, z1 - 2) + 0.5);
      // A small shrine: gate posts, a lintel and a lantern.
      for (const s of [-1.8, 1.8]) { w.fillRect(cx + s - 0.5, z0 + 3.5, cx + s + 0.5, z0 + 4.5, 1); cyl(w, cx + s, 0, 4.2, z0 + 4, 0.22, MAT.PLAIN, [0.42, 0.07, 0.05], 0, 1); }
      box(w, cx, 4.3, z0 + 4, 5.2, 0.32, 0.5, MAT.PLAIN, [0.42, 0.07, 0.05], 0, 1);
      box(w, cx, 3.6, z0 + 4, 4.2, 0.2, 0.3, MAT.PLAIN, [0.42, 0.07, 0.05], 0, 1);
      ball(w, cx + 3.5, 1.5, cz + 3.5, 0.35, MAT.EMISSIVE, [1.0, 0.7, 0.35], 4);
      cyl(w, cx + 3.5, 0, 1.2, cz + 3.5, 0.18, MAT.PLAIN, [0.2, 0.2, 0.2], 0, 1);
      light(w, cx + 3.5, 1.8, cz + 3.5, [1.0, 0.7, 0.4], 14, 1.6);
      addPoi(w, rng.chance(0.5) ? 'shrine' : 'cache', Math.floor(cx) + 0.5, Math.floor(cz - 6) + 0.5);
      // A pond with stepping stones, stone lanterns on the paths, benches and a clipped hedge.
      const px = cx - (x1 - x0) / 4, pz = cz + (z1 - z0) / 4, pr = Math.min(4, (x1 - x0) / 8, (z1 - z0) / 8);
      if (pr > 1.5) {
        cyl(w, px, 0.01, 0.05, pz, pr, MAT.GLOSS, [0.015, 0.04, 0.055], 0);
        for (let q = 0; q < 9; q++) { const a = q / 9 * 6.283 + rng.float() * 0.4, s = rng.range(0.25, 0.6); ball(w, px + Math.cos(a) * (pr + 0.1), s * 0.3, pz + Math.sin(a) * (pr + 0.1), s, MAT.PLAIN, [0.16, 0.16, 0.17], 0, 1, 0.7); }
        for (let q = -1; q <= 1; q++) cyl(w, px + q * pr * 0.55, 0.04, 0.1, pz + q * 0.5, 0.42, MAT.PLAIN, [0.2, 0.2, 0.2], 0, 1);
      }
      for (const [dx, dz] of [[-4.5, -2.3], [4.5, 2.3], [-2.3, 5], [2.3, -9]]) {
        const lx = Math.floor(cx + dx) + 0.5, lz = Math.floor(cz + dz) + 0.5;
        if (w.cell(lx, lz) !== 0) continue;
        w.fillRect(lx - 0.5, lz - 0.5, lx + 0.5, lz + 0.5, 2);
        cyl(w, lx, 0, 0.9, lz, 0.14, MAT.PLAIN, [0.2, 0.2, 0.2], 0, 1); box(w, lx, 1.12, lz, 0.44, 0.44, 0.44, MAT.EMISSIVE, [1.0, 0.72, 0.4], 1.8, rng.float());
        prim(w, SHAPE.CONE, lx, 1.5, lz, 0.8, 0.34, 0.8, MAT.PLAIN, [0.16, 0.16, 0.17], 0, 1);
      }
      for (const [dx, dz, yw] of [[6, 2.2, 0], [-6, -2.2, 0], [2.2, 7, 1.571], [-2.2, -7, 1.571]]) {
        const bx = Math.floor(cx + dx) + 0.5, bz = Math.floor(cz + dz) + 0.5;
        if (w.cell(bx, bz) !== 0) continue;
        w.fillRect(bx - 0.5, bz - 0.5, bx + 0.5, bz + 0.5, 2);
        box(w, bx, 0.44, bz, 1.7, 0.08, 0.5, MAT.PLAIN, [0.22, 0.15, 0.09], 0, 13, 0, 0, 0, yw); box(w, bx, 0.22, bz, 1.4, 0.44, 0.08, MAT.PLAIN, [0.07, 0.07, 0.08], 0, 6, 0, 0, 0, yw);
      }
      for (let x = x0 + 1; x < x1 - 1; x += 1.6) for (const z of [z0 + 0.8, z1 - 0.8]) { if (Math.abs(x - cx) < 2.6 || w.cell(x, z) !== 0) continue; ball(w, x, 0.5, z, 0.7, MAT.FOLIAGE, [0.04, 0.12, 0.05], 0, rng.float(), 0.8); w.fillRect(Math.floor(x), Math.floor(z), Math.floor(x) + 1, Math.floor(z) + 1, 2); }
      for (let z = z0 + 2; z < z1 - 2; z += 1.6) for (const x of [x0 + 0.8, x1 - 0.8]) { if (Math.abs(z - cz) < 2.6 || w.cell(x, z) !== 0) continue; ball(w, x, 0.5, z, 0.7, MAT.FOLIAGE, [0.04, 0.12, 0.05], 0, rng.float(), 0.8); w.fillRect(Math.floor(x), Math.floor(z), Math.floor(x) + 1, Math.floor(z) + 1, 2); }
    } else if (kind === 2) {
      w.paint(x0, z0, x1, z1, SURF.ROAD);
      D.fenceRect(w, rng, x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5);
      for (let x = x0 + 4; x < x1 - 4; x += 3) for (let z = z0 + 5; z < z1 - 5; z += 9) {
        if (rng.chance(0.5)) { if (rng.chance(0.3)) D.vehicle(w, rng, x + 0.5, z + 0.5, true, rng.pick(['van', 'truck', 'taxi'])); else car(w, rng, x + 0.5, z + 0.5, true); }
        // Bay lines and a wheel stop.
        box(w, x - 1, 0.012, z + 0.5, 0.12, 0.02, 5.2, MAT.PLAIN, [0.5, 0.5, 0.48]);
        box(w, x + 0.5, 0.08, z - 1.9, 1.8, 0.16, 0.24, MAT.PLAIN, [0.5, 0.42, 0.06], 0, 14);
      }
      // Pay booth with a barrier arm.
      if (w.circleFree(x0 + 3.5, z0 + 3.5, 1.4)) {
        w.fillRect(x0 + 2.5, z0 + 2.5, x0 + 4.5, z0 + 4.5, 1);
        box(w, x0 + 3.5, 1.25, z0 + 3.5, 2, 2.5, 2, MAT.PLAIN, [0.2, 0.22, 0.24], 0, 6); box(w, x0 + 3.5, 1.6, z0 + 4.52, 1.4, 0.8, 0.04, MAT.EMISSIVE, [0.75, 0.9, 1.0], 1.6);
        box(w, x0 + 3.5, 2.75, z0 + 3.5, 2.4, 0.3, 2.4, MAT.SIGN, [0.3, 0.9, 0.5], 2.4, rng.float(), 0);
        primR(w, SHAPE.BOX, x0 + 6.6, 1.3, z0 + 4.8, 4, 0.1, 0.1, MAT.PLAIN, [0.75, 0.5, 0.05], 0, 14, 0, 0, 0, 0, 0, 0.12);
      }
      cyl(w, cx, 0, 8, cz, 0.14, MAT.PLAIN, [0.07, 0.07, 0.08]); box(w, cx, 8, cz, 1.8, 0.2, 0.6, MAT.EMISSIVE, [0.75, 0.85, 1.0], 6);
      light(w, cx, 7.5, cz, [0.7, 0.82, 1.0], 30, 2.0);
      if (rng.chance(0.6)) addContainer(w, Math.floor(x0) + 1.5, Math.floor(z0) + 1.5, 'dumpster', false);
    } else if (kind === 3) {
      w.paint(x0, z0, x1, z1, SURF.PLAZA);
      for (const [a, b] of [[x0 + 3, z0 + 3], [x1 - 3, z0 + 3], [x0 + 3, z1 - 3], [x1 - 3, z1 - 3]]) tree(w, rng, Math.floor(a) + 0.5, Math.floor(b) + 0.5);
      const col = rng.pick(NEON);
      cyl(w, cx, 0, 0.6, cz, 2.2, MAT.PLAIN, [0.14, 0.14, 0.15], 0, 1); cyl(w, cx, 0.6, 4.5, cz, 0.35, MAT.EMISSIVE, col, 3.5);
      w.fillRect(cx - 2, cz - 2, cx + 2, cz + 2, 2);
      light(w, cx, 3, cz, col, 26, 2.0);
      cyl(w, cx, 0.5, 0.56, cz, 2.0, MAT.GLOSS, [0.03, 0.08, 0.1], 0);
      for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + 0.78, bx = Math.floor(cx + Math.cos(a) * 6) + 0.5, bz = Math.floor(cz + Math.sin(a) * 6) + 0.5; if (w.cell(bx, bz) === 0) { w.fillRect(bx - 0.5, bz - 0.5, bx + 0.5, bz + 0.5, 2); box(w, bx, 0.42, bz, 1.8, 0.1, 0.5, MAT.PLAIN, [0.2, 0.14, 0.09], 0, 13, 0, 0, 0, a + 1.57); box(w, bx, 0.2, bz, 1.5, 0.4, 0.1, MAT.PLAIN, [0.1, 0.1, 0.11], 0, 6, 0, 0, 0, a + 1.57); } }
      if (zone >= 1) addPoi(w, rng.pick(['terminal', 'cache', 'shrine']), Math.floor(cx + 6) + 0.5, Math.floor(cz) + 0.5);
      const sr = rng.fork('stallbox');
      for (const [dx, dz, yw] of [[-(x1 - x0) / 2 + 4, 0, 1.571], [(x1 - x0) / 2 - 4, 0, -1.571], [0, -(z1 - z0) / 2 + 4, 0]]) {
        const sx = Math.floor(cx + dx) + 0.5, sz = Math.floor(cz + dz) + 0.5;
        if (rng.chance(0.7) && D.stall(w, rng, sx, sz, yw)) stallBox(w, sr, sx, sz, yw);
      }
    } else if (kind === 4) {
      // Night market: rows of food stalls facing each other under strings of lanterns.
      w.paint(x0, z0, x1, z1, SURF.PLAZA);
      const alongX = (x1 - x0) >= (z1 - z0), lo = alongX ? x0 : z0, hi = alongX ? x1 : z1, sr = rng.fork('stallbox');
      let n = 0;
      for (let r = (alongX ? z0 : x0) + 4; r < (alongX ? z1 : x1) - 3; r += n % 2 ? 6 : 10, n++) {
        const flip = n % 2 === 1;
        for (let t = lo + 4; t < hi - 3; t += 4.6) {
          if (rng.chance(0.16)) continue;
          const sx = Math.floor(alongX ? t : r) + 0.5, sz = Math.floor(alongX ? r : t) + 0.5, yw = alongX ? (flip ? Math.PI : 0) : (flip ? -Math.PI / 2 : Math.PI / 2);
          if (D.stall(w, rng, sx, sz, yw)) stallBox(w, sr, sx, sz, yw);
        }
        const ar = r + (flip ? -3.4 : 3.4), col = rng.pick([[1.0, 0.3, 0.2], [1.0, 0.8, 0.5], [1.0, 0.55, 0.25]]);
        if (ar < (alongX ? z0 : x0) + 1 || ar > (alongX ? z1 : x1) - 1) continue;
        for (let t = lo + 3, k = 0; t < hi - 3; t += 2.1, k++) {
          const lx = alongX ? t : ar, lz = alongX ? ar : t;
          prim(w, SHAPE.SPHERE, lx, 3.9 - 0.3 * Math.sin((k % 6) / 5 * Math.PI), lz, 0.34, 0.44, 0.34, MAT.EMISSIVE, col, 3.0, rng.float());
          if (k % 5 === 2) light(w, lx, 3.4, lz, col, 11, 1.4);
        }
        if (alongX) box(w, (lo + hi) / 2, 4.15, ar, hi - lo - 5, 0.03, 0.03, MAT.PLAIN, [0.02, 0.02, 0.02]); else box(w, ar, 4.15, (lo + hi) / 2, 0.03, 0.03, hi - lo - 5, MAT.PLAIN, [0.02, 0.02, 0.02]);
        for (const t of [lo + 2.5, hi - 2.5]) { const px = Math.floor(alongX ? t : ar) + 0.5, pz = Math.floor(alongX ? ar : t) + 0.5; cyl(w, px, 0, 4.3, pz, 0.07, MAT.PLAIN, [0.1, 0.09, 0.08]); }
      }
      for (let q = 0; q < 2; q++) { const x = rng.irange(x0 + 2, x1 - 2) + 0.5, z = rng.irange(z0 + 2, z1 - 2) + 0.5; if (w.cell(x, z) === 0 && w.circleFree(x, z, 1)) addContainer(w, x, z, 'crate', false); }
    } else if (kind === 5) {
      // Building site: a steel frame going up behind a fence, with a tower crane over it.
      D.fenceRect(w, rng, x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5);
      const nx = Math.max(1, Math.floor((x1 - x0 - 14) / 6)), nz = Math.max(1, Math.floor((z1 - z0 - 14) / 6)), lv = rng.irange(2, 4);
      const fx = Math.floor(cx - nx * 3), fz = Math.floor(cz - nz * 3), steel = [0.36, 0.13, 0.07];
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
        const x = fx + i * 6 + 0.5, z = fz + j * 6 + 0.5;
        w.fillRect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 1);
        box(w, x, lv * 1.8, z, 0.4, lv * 3.6, 0.4, MAT.PLAIN, steel, 0, 6);
        box(w, x, 0.15, z, 0.9, 0.3, 0.9, MAT.PLAIN, [0.2, 0.2, 0.21], 0, 1);
        for (let l = 1; l <= lv; l++) {
          if (i < nx) box(w, x + 3, l * 3.6 - 0.15, z, 5.6, 0.32, 0.22, MAT.PLAIN, steel, 0, 6);
          if (j < nz) box(w, x, l * 3.6 - 0.15, z + 3, 0.22, 0.32, 5.6, MAT.PLAIN, steel, 0, 6);
          if (i < nx && j < nz && l < lv && rng.chance(0.5)) box(w, x + 3, l * 3.6 + 0.07, z + 3, 5.9, 0.14, 5.9, MAT.PLAIN, [0.2, 0.2, 0.21], 0, 1);
        }
      }
      // Site cabin, material stacks and a floodlight.
      if (!hitsReserved(w, x0 + 2, z0 + 2, x0 + 8, z0 + 5)) {
        w.fillRect(x0 + 2, z0 + 2, x0 + 8, z0 + 5, 1);
        boxMM(w, x0 + 2, z0 + 2, x0 + 8, z0 + 5, 0.2, 2.8, MAT.PLAIN, [0.3, 0.32, 0.3], 0, 10, rng.float());
        box(w, x0 + 4, 1.7, z0 + 5.02, 1.6, 0.9, 0.04, MAT.EMISSIVE, [1.0, 0.8, 0.5], 1.4); box(w, x0 + 6.8, 1.2, z0 + 5.02, 0.9, 2.0, 0.04, MAT.PLAIN, [0.1, 0.1, 0.11], 0, 6);
        light(w, x0 + 5, 2.6, z0 + 6.5, [1.0, 0.8, 0.5], 12, 1.6);
      }
      for (let q = 0; q < 7; q++) {
        const x = rng.irange(x0 + 3, x1 - 3) + 0.5, z = rng.irange(z0 + 3, z1 - 3) + 0.5;
        if (w.cell(x, z) !== 0 || !w.circleFree(x, z, 1.2)) continue;
        const F = D.freeFrame(x, z, rng.float() * 6.283), put = D.kit(w, F), r = rng.float();
        if (r < 0.3) { for (let k = 0; k < 6; k++) put(SHAPE.CYL, (k % 3 - 1) * 0.34, 0, 0.17 + (k > 2 ? 0.3 : 0), 0.32, 3.6, 0.32, MAT.PLAIN, [0.3, 0.3, 0.31], 0, 6, 0, 0, 0, Math.PI / 2); }
        else if (r < 0.6) D.PROPS.pallet(w, rng, put, 0, F);
        else if (r < 0.8) D.PROPS.drum(w, rng, put, 0, F);
        else { put(SHAPE.CONE, 0, 0, 0.5, 2.2, 1.0, 2.2, MAT.PLAIN, [0.3, 0.26, 0.2], 0, 1); }
        w.fillRect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 2);
      }
      const tx = Math.floor(x1 - 5) + 0.5, tz = Math.floor(z1 - 5) + 0.5;
      if (w.circleFree(tx, tz, 1.5)) {
        const th = lv * 3.6 + rng.range(12, 20), yel = [0.6, 0.45, 0.05];
        w.fillRect(tx - 1, tz - 1, tx + 1, tz + 1, 1);
        box(w, tx, th / 2, tz, 1.5, th, 1.5, MAT.PLAIN, yel, 0, 11, 2);
        box(w, tx - 8, th + 0.6, tz, 30, 1.0, 1.0, MAT.PLAIN, yel, 0, 11, 2);
        box(w, tx + 5.5, th + 0.2, tz, 2.4, 1.6, 1.6, MAT.PLAIN, [0.2, 0.2, 0.21], 0, 1);
        box(w, tx, th + 1.2, tz + 1.1, 1.6, 1.4, 1.2, MAT.GLOSS, [0.1, 0.12, 0.14], 0); box(w, tx, th + 1.3, tz + 1.72, 1.2, 0.7, 0.04, MAT.EMISSIVE, [1.0, 0.9, 0.7], 2);
        cyl(w, tx - 14, th - 9, th + 0.2, tz, 0.03, MAT.PLAIN, [0.03, 0.03, 0.03]); box(w, tx - 14, th - 9.4, tz, 0.5, 0.7, 0.5, MAT.PLAIN, yel, 0, 6);
        ball(w, tx - 22.5, th + 1.4, tz, 0.25, MAT.EMISSIVE, [1, 0.1, 0.1], 6, rng.float(), 1); ball(w, tx, th + 2.2, tz, 0.25, MAT.EMISSIVE, [1, 0.1, 0.1], 6, rng.float(), 1);
      }
      cyl(w, cx, 0, 9, cz - 0.5, 0.1, MAT.PLAIN, [0.1, 0.1, 0.11]); box(w, cx, 9, cz - 0.5, 1.4, 0.4, 0.5, MAT.EMISSIVE, [1.0, 0.95, 0.8], 6);
      light(w, cx, 8, cz, [1.0, 0.92, 0.75], 30, 1.9);
      for (let q = 0; q < 2; q++) { const x = rng.irange(x0 + 3, x1 - 3) + 0.5, z = rng.irange(z0 + 3, z1 - 3) + 0.5; if (w.cell(x, z) === 0 && w.circleFree(x, z, 1)) addContainer(w, x, z, rng.chance(0.5) ? 'crate' : 'locker', false); }
    }
    return;
  }
  const leaves = [];
  leaves.gaps = [];
  subdivide(w, rng, x0, z0, x1, z1, style, 0, leaves);
  const big = leaves.length === 1 && (x1 - x0) > 50;
  for (const [a, b, c, d] of leaves) {
    // Setbacks vary so frontages do not line up.
    const s = () => (rng.chance(0.7) ? 0 : rng.irange(1, 3));
    addBuilding(w, rng, a + s(), b + s(), c - s(), d - s(), style, big);
  }
  // Alley dressing: lantern strings, dumpsters, crates, activities.
  for (const [a, b, c, d, horiz] of leaves.gaps) {
    const len = horiz ? c - a : d - b, mid = horiz ? (b + d) / 2 : (a + c) / 2;
    D.dressGap(w, rng, a, b, c, d, horiz, style);
    if (len < 12 || hitsReserved(w, a, b, c, d)) continue;
    if (rng.chance(style === STYLE.OLDTOWN || style === STYLE.NEON ? 0.55 : 0.15)) {
      const col = rng.pick([[1.0, 0.6, 0.3], [1.0, 0.3, 0.3], [1.0, 0.8, 0.5], [0.4, 0.9, 1.0]]);
      const start = (horiz ? a : b) + 3, step = 3.4;
      for (let t = start, k = 0; t < (horiz ? c : d) - 3; t += step, k++) {
        const sag = 4.3 - 0.35 * Math.sin((k % 5) / 4 * Math.PI);
        prim(w, SHAPE.SPHERE, horiz ? t : mid, sag, horiz ? mid : t, 0.34, 0.42, 0.34, MAT.EMISSIVE, col, 3.2, rng.float());
        if (k % 4 === 1) light(w, horiz ? t : mid, 3.8, horiz ? mid : t, col, 9, 1.3);
      }
      if (horiz) box(w, (a + c) / 2, 4.55, mid, len - 5, 0.03, 0.03, MAT.PLAIN, [0.02, 0.02, 0.02]); else box(w, mid, 4.55, (b + d) / 2, 0.03, 0.03, len - 5, MAT.PLAIN, [0.02, 0.02, 0.02]);
    }
    for (let k = 0; k < 2; k++) {
      if (!rng.chance(0.2)) continue;
      const t = rng.irange((horiz ? a : b) + 2, (horiz ? c : d) - 3), off = (horiz ? d - b : c - a) > 3 ? 1 : 0;
      const x = Math.floor(horiz ? t : a + off) + 0.5, z = Math.floor(horiz ? b + off : t) + 0.5;
      if (w.cell(x, z) === 0 && w.surf(x, z) === SURF.ALLEY) addContainer(w, x, z, 'dumpster', false);
    }
    if (zone >= 1 && rng.chance(0.02 + 0.006 * zone)) {
      const t = rng.irange((horiz ? a : b) + 4, (horiz ? c : d) - 4);
      const x = Math.floor(horiz ? t : mid) + 0.5, z = Math.floor(horiz ? mid : t) + 0.5;
      if (w.cell(x, z) === 0 && w.surf(x, z) === SURF.ALLEY) {
        const type = rng.pick(['cache', 'cache', 'cache', 'shrine', 'terminal']);
        addPoi(w, type, x, z);
        light(w, x, 2.5, z, type === 'cache' ? [0.2, 0.9, 1.0] : type === 'shrine' ? [1.0, 0.2, 0.3] : [0.5, 0.6, 1.0], 12, 1.4);
      }
    }
  }
}

// ---- Street furniture along each road segment ----
function dressRoads(w, net, rng) {
  const { xs, zs, v, h } = net;
  const lamp = (x, z, dx, dz, cool) => {
    const lc = cool ? [0.62, 0.82, 1.0] : [1.0, 0.72, 0.42];
    cyl(w, x, 0, 7.2, z, 0.1, MAT.PLAIN, [0.07, 0.075, 0.08]);
    box(w, x + dx * 0.8, 7.2, z + dz * 0.8, dx ? 1.8 : 0.16, 0.12, dz ? 1.8 : 0.16, MAT.PLAIN, [0.07, 0.075, 0.08]);
    box(w, x + dx * 1.5, 7.08, z + dz * 1.5, dx ? 0.8 : 0.4, 0.1, dz ? 0.8 : 0.4, MAT.EMISSIVE, lc, 7);
    light(w, x + dx * 1.6, 6.7, z + dz * 1.6, lc, 25, 1.9);
  };
  const seg = (vert, c, a, b, k) => {
    const len = b - a;
    if (len < 24) return;
    const style = styleFor(vert ? c : (a + b) / 2, vert ? (a + b) / 2 : c, net.canalX), cool = style === STYLE.ARCOLOGY || style === STYLE.CORPORATE;
    const P = (t, off) => (vert ? [c + off, t] : [t, c + off]);
    const edge = ROAD_HALF[k] + (k >= 2 ? 0.8 : 0);
    if (k === ROAD_KIND.ALLEY && (style === STYLE.OLDTOWN || style === STYLE.NEON) && len > 44 && rng.chance(0.45)) {
      // Covered market arcade: a glazed roof on arches, stalls down one side, lanterns overhead.
      // It stops at the top of a quay wall: the arcade stays on the street's level.
      let a0 = a + 10, b0 = b - 10;
      while (b0 > a0 && w.floorAt(...P(b0 + 2.5, 0)) !== 0) b0 -= 1;
      while (a0 < b0 && w.floorAt(...P(a0 - 2.5, 0)) !== 0) a0 += 1;
      const glass = [0.05, 0.07, 0.09], frame = [0.1, 0.1, 0.11];
      for (let t = a0; t < b0; t += 8) {
        const [x, z] = P(t, 0), seg8 = Math.min(8, b0 - t);
        const [rx, rz] = P(t + seg8 / 2, 0);
        box(w, rx, 5.6, rz, vert ? 4.6 : seg8, 0.12, vert ? seg8 : 4.6, MAT.GLOSS, glass, 0, 1);
        for (const sd of [-1, 1]) { const [px2, pz2] = P(t, sd * 2.15); cyl(w, px2, 0, 5.6, pz2, 0.07, MAT.PLAIN, frame, 0, 6); }
        box(w, x, 5.45, z, vert ? 4.5 : 0.14, 0.2, vert ? 0.14 : 4.5, MAT.PLAIN, frame, 0, 6);
        const lc = rng.pick([[1.0, 0.6, 0.3], [1.0, 0.35, 0.3], [1.0, 0.8, 0.5]]);
        prim(w, SHAPE.SPHERE, rx, 4.6, rz, 0.4, 0.5, 0.4, MAT.EMISSIVE, lc, 3.4, rng.float());
        if (((t - a0) / 8) % 2 === 0) light(w, rx, 4.2, rz, lc, 11, 1.5);
        // Stalls alternate sides so the path weaves.
        if (rng.chance(0.75)) {
          const sd = ((t - a0) / 8) % 2 ? 1 : -1, [sx, sz] = P(t + 4, sd * 1.45), cc = rng.pick(NEON);
          const cxs = Math.floor(sx) + 0.5, czs = Math.floor(sz) + 0.5;
          if (w.cell(cxs, czs) === 0) {
            w.fillRect(cxs - 0.5, czs - (vert ? 1.5 : 0.5), cxs + 0.5, czs + (vert ? 1.5 : 0.5), 2);
            if (!vert) w.fillRect(cxs - 1.5, czs - 0.5, cxs + 1.5, czs + 0.5, 2);
            box(w, cxs, 0.5, czs, vert ? 0.9 : 2.8, 1.0, vert ? 2.8 : 0.9, MAT.PLAIN, [0.17, 0.12, 0.08], 0, 1);
            prim(w, SHAPE.WEDGE, cxs - (vert ? sd * 0.2 : 0), 2.5, czs - (vert ? 0 : sd * 0.2), 3.0, 0.4, 1.5, MAT.PLAIN, rng.pick([[0.3, 0.08, 0.08], [0.08, 0.16, 0.26], [0.26, 0.2, 0.08]]), 0, 5, 0, 0, 0, vert ? (sd > 0 ? -Math.PI / 2 : Math.PI / 2) : (sd > 0 ? Math.PI : 0));
            box(w, cxs, 1.95, czs, vert ? 0.08 : 2.2, 0.36, vert ? 2.2 : 0.08, MAT.SIGN, cc, 3.6, rng.float(), 0);
            for (let q = -1; q <= 1; q++) ball(w, cxs + (vert ? 0 : q * 0.8), 1.12, czs + (vert ? q * 0.8 : 0), 0.16, MAT.PLAIN, rng.pick([[0.5, 0.2, 0.1], [0.2, 0.4, 0.15], [0.5, 0.45, 0.2]]), 0, 5);
          }
        }
      }
      // A lit name board over each entrance.
      for (const t of [a0, b0]) { const [x, z] = P(t, 0); box(w, x, 4.7, z, vert ? 3.6 : 0.2, 0.9, vert ? 0.2 : 3.6, MAT.SIGN, rng.pick(NEON), 5, rng.float(), 0); light(w, x, 4, z, [1, 0.6, 0.4], 12, 1.4); }
      return;
    }
    if (k === ROAD_KIND.ALLEY) {
      // Pedestrian alley: low wall lamps and the odd shop lantern.
      for (let t = a + 12; t < b - 10; t += rng.irange(16, 26)) {
        const side = rng.chance(0.5) ? 1 : -1, [x, z] = P(t, side * 1.7), col = rng.pick([[1.0, 0.65, 0.35], [1.0, 0.4, 0.3], [0.5, 0.9, 1.0]]);
        cyl(w, x, 0, 3, z, 0.06, MAT.PLAIN, [0.07, 0.07, 0.07]); ball(w, x, 3.15, z, 0.24, MAT.EMISSIVE, col, 4.5);
        light(w, x, 3, z, col, 12, 1.5);
      }
      return;
    }
    // Lamps alternate sides; avenues get them on both.
    let n = 0;
    // Street furniture stands on the street's own level, never out over a sunken quay.
    const level = (x, z) => w.floorAt(x, z) === 0;
    for (let t = a + 14; t < b - 12; t += 22, n++) {
      const side = n % 2 ? 1 : -1;
      const [x, z] = P(t, side * edge);
      if (level(x, z)) lamp(x, z, vert ? -side : 0, vert ? 0 : -side, cool);
      if (k === ROAD_KIND.AVENUE) { const [x2, z2] = P(t + 11, -side * edge); if (t + 11 < b - 12 && level(x2, z2)) lamp(x2, z2, vert ? side : 0, vert ? 0 : side, cool); }
    }
    // Street trees on avenues, utility poles with wires on streets.
    if (k === ROAD_KIND.AVENUE) {
      for (let t = a + 17; t < b - 14; t += 9) for (const side of [-1, 1]) if (rng.chance(0.6)) { const [x, z] = P(t, side * (edge + 1.2)); tree(w, rng, Math.floor(x) + 0.5, Math.floor(z) + 0.5); }
    } else {
      const side = rng.chance(0.5) ? 1 : -1;
      let prev = null;
      for (let t = a + 15; t < b - 13; t += 24) {
        const [x, z] = P(t, side * (edge + 0.6));
        if (!level(x, z)) { prev = null; continue; }
        cyl(w, x, 0, 8.6, z, 0.13, MAT.PLAIN, [0.1, 0.09, 0.08], 0, 1);
        box(w, x, 8.0, z, vert ? 1.6 : 0.12, 0.12, vert ? 0.12 : 1.6, MAT.PLAIN, [0.1, 0.09, 0.08]);
        cyl(w, x + (vert ? 0.5 : 0), 6.6, 7.5, z + (vert ? 0 : 0.5), 0.22, MAT.PLAIN, [0.13, 0.13, 0.13]);
        if (prev !== null) for (const o of [-0.6, 0, 0.6]) { const [mx, mz] = P((prev + t) / 2, side * (edge + 0.6) + o); box(w, mx, 7.9, mz, vert ? 0.03 : t - prev, 0.03, vert ? t - prev : 0.03, MAT.PLAIN, [0.02, 0.02, 0.02]); }
        prev = t;
      }
    }
    // Overhead gantry with direction boards on avenues.
    if (k === ROAD_KIND.AVENUE && len > 56) {
      const t = a + len * rng.range(0.35, 0.65), reach = ROAD_HALF[k] + 0.7, pole = [0.09, 0.095, 0.1];
      for (const sd of [-1, 1]) { const [gx, gz] = P(t, sd * reach); cyl(w, gx, 0, 7.0, gz, 0.14, MAT.PLAIN, pole, 0, 6); }
      const [mx, mz] = P(t, 0);
      box(w, mx, 6.9, mz, vert ? reach * 2 : 0.2, 0.25, vert ? 0.2 : reach * 2, MAT.PLAIN, pole, 0, 6);
      for (const sd of [-1, 1]) { const [bx, bz] = P(t, sd * reach * 0.48); box(w, bx, 6.1, bz, vert ? 5.2 : 0.12, 1.3, vert ? 0.12 : 5.2, MAT.SIGN, [0.25, 0.85, 0.5], 2.6, rng.float(), 0); }
    }
    // Furniture on the pavement: benches, post boxes, phone booths, bike racks, bins, works.
    for (let t = a + 14; t < b - 14; t += rng.irange(7, 14)) {
      const side = rng.chance(0.5) ? 1 : -1, [fx, fz] = P(t, side * (edge + 1.1)), x = Math.floor(fx) + 0.5, z = Math.floor(fz) + 0.5, r = rng.float();
      if (w.cell(x, z) !== 0 || w.surf(x, z) !== SURF.WALK || !level(x, z)) continue;
      if (r < 0.22) {
        w.fillRect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 2);
        box(w, x, 0.44, z, vert ? 0.5 : 1.7, 0.08, vert ? 1.7 : 0.5, MAT.PLAIN, [0.22, 0.15, 0.09], 0, 13);
        box(w, x + (vert ? side * 0.22 : 0), 0.75, z + (vert ? 0 : side * 0.22), vert ? 0.06 : 1.7, 0.5, vert ? 1.7 : 0.06, MAT.PLAIN, [0.22, 0.15, 0.09], 0, 13);
        for (const o of [-0.7, 0.7]) box(w, x + (vert ? 0 : o), 0.22, z + (vert ? o : 0), 0.08, 0.44, 0.4, MAT.PLAIN, [0.07, 0.07, 0.08], 0, 6);
      } else if (r < 0.34) {
        w.fillRect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 2);
        cyl(w, x, 0, 0.7, z, 0.08, MAT.PLAIN, [0.1, 0.1, 0.1], 0, 6); box(w, x, 1.0, z, 0.5, 0.6, 0.4, MAT.GLOSS, [0.5, 0.06, 0.05], 0); box(w, x, 1.12, z + 0.21, 0.3, 0.04, 0.02, MAT.PLAIN, [0.02, 0.02, 0.02]);
      } else if (r < 0.44) {
        w.fillRect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 2);
        box(w, x, 1.15, z, 0.95, 2.3, 0.95, MAT.GLOSS, [0.06, 0.1, 0.12], 0); box(w, x, 2.38, z, 1.0, 0.18, 1.0, MAT.EMISSIVE, [0.4, 0.9, 1.0], 2.4); box(w, x, 1.3, z, 0.4, 0.5, 0.2, MAT.EMISSIVE, [0.5, 0.8, 1.0], 0.9, rng.float());
        light(w, x, 2, z, [0.4, 0.85, 1.0], 6, 1.0);
      } else if (r < 0.58) {
        // Bike rack with a couple of bikes leaning in it.
        for (let q = -1; q <= 1; q++) {
          const [bx, bz] = P(t + q * 0.7, side * (edge + 1.1));
          cyl(w, bx, 0, 0.75, bz, 0.025, MAT.PLAIN, [0.3, 0.3, 0.32], 0, 6);
          if (q !== 0) { const c = rng.pick([[0.5, 0.1, 0.1], [0.1, 0.2, 0.4], [0.3, 0.3, 0.3], [0.1, 0.3, 0.15]]); for (const o of [-0.5, 0.5]) prim(w, SHAPE.CYL, bx + (vert ? o : 0.12), 0.34, bz + (vert ? 0.12 : o), 0.66, 0.04, 0.66, MAT.PLAIN, [0.03, 0.03, 0.03], 0, 9, 0, 0, 0, 0); box(w, bx + (vert ? 0 : 0.12), 0.62, bz + (vert ? 0.12 : 0), vert ? 1.0 : 0.05, 0.06, vert ? 0.05 : 1.0, MAT.GLOSS, c, 0); }
        }
      } else if (r < 0.72) {
        cyl(w, x, 0, 0.9, z, 0.26, MAT.PLAIN, [0.1, 0.13, 0.11], 0, 6); cyl(w, x, 0.9, 0.96, z, 0.29, MAT.PLAIN, [0.05, 0.05, 0.05], 0, 6);
      } else if (r < 0.84) {
        // Road works: barriers and cones, with an amber lamp.
        for (let q = 0; q < 3; q++) { const [bx, bz] = P(t + q * 1.4, side * (edge - 1.6)); prim(w, SHAPE.CONE, bx, 0.35, bz, 0.4, 0.7, 0.4, MAT.PLAIN, [0.8, 0.3, 0.05], 0, 9); }
        box(w, x, 0.6, z, vert ? 0.1 : 2.0, 0.3, vert ? 2.0 : 0.1, MAT.EMISSIVE, [1.0, 0.6, 0.1], 0.9, rng.float()); ball(w, x, 1.0, z, 0.1, MAT.EMISSIVE, [1.0, 0.6, 0.1], 5, rng.float());
      } else {
        // A steam vent in the pavement.
        box(w, x, 0.03, z, 0.9, 0.06, 0.9, MAT.PLAIN, [0.04, 0.04, 0.045], 0, 6);
        w.blocks[w.blockIndex(x, z)].vents.push({ x, z });
      }
    }
    // Parked cars against the kerb.
    const cars = rng.int(k === ROAD_KIND.AVENUE ? 5 : 3);
    for (let q = 0; q < cars; q++) { const [x, z] = P(rng.irange(a + 16, b - 16), (rng.chance(0.5) ? 1 : -1) * (ROAD_HALF[k] - 1.3)); car(w, rng, x, z, vert); }
    // Bollards, a bus shelter or rubbish at the kerb.
    for (let t = a + 13; t < b - 13; t += rng.irange(6, 13)) {
      const side = rng.chance(0.5) ? 1 : -1, [x, z] = P(t, side * (edge + 0.2)), r = rng.float();
      if (!level(x, z) || !level(...P(t, side * (edge + 2.2)))) continue;
      if (r < 0.5) { cyl(w, x, 0, 0.9, z, 0.09, MAT.PLAIN, [0.2, 0.2, 0.21]); ball(w, x, 0.92, z, 0.1, MAT.EMISSIVE, [1, 0.6, 0.2], 1.5); }
      else if (r < 0.62) { ball(w, x, 0.3, z, 0.38, MAT.PLAIN, [0.04, 0.04, 0.05], 0, 0, 0.8); ball(w, x + 0.5, 0.25, z + 0.2, 0.3, MAT.PLAIN, [0.5, 0.5, 0.5], 0, 0, 0.8); }
      else if (r < 0.7 && k === ROAD_KIND.AVENUE) {
        const [sx, sz] = P(t, side * (edge + 1.6));
        box(w, sx, 2.5, sz, vert ? 1.4 : 4, 0.1, vert ? 4 : 1.4, MAT.GLOSS, [0.1, 0.12, 0.14]);
        for (const o of [-1.8, 1.8]) { const [qx, qz] = P(t + o, side * (edge + 2.2)); cyl(w, qx, 0, 2.5, qz, 0.05, MAT.PLAIN, [0.15, 0.15, 0.16]); }
        const [ex, ez] = P(t, side * (edge + 2.25));
        box(w, ex, 1.5, ez, vert ? 0.06 : 3.4, 1.6, vert ? 3.4 : 0.06, MAT.SIGN, rng.pick(NEON), 2.5, rng.float(), 0);
      }
    }
    D.dressStreet(w, rng, vert, c, a, b, k, style, edge, ROAD_HALF[k]);
  };
  for (let i = 0; i < xs.length; i++) for (let j = 0; j < zs.length - 1; j++) if (v[i][j]) seg(true, xs[i], zs[j], zs[j + 1], v[i][j]);
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length - 1; i++) if (h[j][i]) seg(false, zs[j], xs[i], xs[i + 1], h[j][i]);
  // Traffic signals where two real streets cross.
  for (let i = 1; i < xs.length - 1; i++) {
    for (let j = 1; j < zs.length - 1; j++) {
      const kv = Math.max(v[i][j - 1], v[i][j] || 0), kh = Math.max(h[j][i - 1], h[j][i] || 0);
      if (kv < 2 || kh < 2 || Math.max(kv, kh) < 3) continue;
      const x = xs[i] + ROAD_HALF[kv] + 1, z = zs[j] + ROAD_HALF[kh] + 1;
      cyl(w, x, 0, 5.6, z, 0.1, MAT.PLAIN, [0.08, 0.08, 0.09]);
      box(w, x - 1.4, 5.5, z, 2.8, 0.1, 0.1, MAT.PLAIN, [0.08, 0.08, 0.09]);
      box(w, x - 2.6, 5.2, z, 0.9, 0.34, 0.26, MAT.PLAIN, [0.03, 0.03, 0.03]);
      const red = rng.chance(0.5);
      ball(w, x - 2.6 + (red ? 0.28 : -0.28), 5.2, z + 0.13, 0.11, MAT.EMISSIVE, red ? [1, 0.12, 0.08] : [0.1, 1, 0.5], 6);
      box(w, x, 3.4, z + 0.12, 0.8, 0.8, 0.08, MAT.SIGN, [1, 1, 1], 2.6, rng.float(), 2);
      box(w, x - 1.3, 4.6, z, 2.2, 0.5, 0.08, MAT.SIGN, [0.3, 0.9, 0.5], 2.4, rng.float(), 0);
    }
  }
}

function addCanalAndRail(w, net, rng) {
  const { canalX, railZ, bridges } = net;
  // A stone kerb along the quay's water edge, and the bridges: a deck the water runs under,
  // with parapets and lamps over the water.
  for (const s of [-1, 1]) for (let z = 50; z < w.size - 50; z += 100) box(w, canalX + s * (QUAY_IN + 0.15), QUAY_Y + 0.12, z, 0.3, 0.24, 100, MAT.PLAIN, [0.17, 0.165, 0.16], 0, SUB.QUAY);
  for (const b of bridges) {
    boxMM(w, canalX - QUAY_IN, b.z - b.t - 1, canalX + QUAY_IN, b.z + b.t + 1, -0.9, -0.03, MAT.PLAIN, [0.14, 0.135, 0.13], 0, SUB.QUAY);
    for (const s of [-1, 1]) {
      box(w, canalX, 0.6, b.z + s * b.t, QUAY_IN * 2 + 1, 1.2, 0.3, MAT.PLAIN, [0.18, 0.18, 0.19], 0, 1);
      w.fillRect(canalX - QUAY_IN, b.z + s * b.t - 0.5, canalX + QUAY_IN, b.z + s * b.t + 0.5, 2);
      for (let x = -12; x <= 12; x += 8) { ball(w, canalX + x, 1.35, b.z + s * b.t, 0.16, MAT.EMISSIVE, [1.0, 0.75, 0.45], 4); }
      light(w, canalX, 2, b.z + s * b.t, [1.0, 0.75, 0.45], 22, 1.5);
      // A lamp under each side of the deck lights the water and the quay stairs below it.
      box(w, canalX, -1.0, b.z + s * (b.t + 0.9), QUAY_IN * 2 - 2, 0.08, 0.08, MAT.EMISSIVE, [1.0, 0.7, 0.4], 1.6);
      light(w, canalX, -1.4, b.z + s * (b.t + 2), [1.0, 0.72, 0.45], 18, 1.4);
    }
  }
  // Elevated rail: pillars in the avenue median, a deck and a lit underside.
  for (let x = 30; x < w.size - 20; x += 24) {
    if (Math.abs(x - canalX) < 16) continue;
    const px = Math.floor(x), solid = w.surf(px, railZ) !== SURF.XWALK_X && !hitsReserved(w, px - 1, railZ - 1, px + 1, railZ + 1);
    if (solid) { w.fillRect(px - 0.75, railZ - 0.75, px + 0.75, railZ + 0.75, 1); cyl(w, px, 0, 8.2, railZ, 0.75, MAT.PLAIN, [0.2, 0.2, 0.21], 0, 1); box(w, px, 8.5, railZ, 2.2, 0.8, 8.6, MAT.PLAIN, [0.17, 0.17, 0.18], 0, 1); }
  }
  for (let x = 50; x < w.size; x += 100) {
    box(w, x, 9.5, railZ, 100, 1.2, 8, MAT.PLAIN, [0.15, 0.155, 0.165], 0, SUB.APRON);
    for (const s of [-1, 1]) box(w, x, 10.6, railZ + s * 3.9, 100, 1.1, 0.2, MAT.PLAIN, [0.11, 0.115, 0.125]);
    box(w, x, 8.85, railZ, 100, 0.06, 0.25, MAT.EMISSIVE, [0.4, 0.7, 1.0], 2.2);
  }
  D.dressQuay(w, rng.fork('quay'), canalX, bridges, { inner: QUAY_IN, outer: QUAY_OUT, y: QUAY_Y, water: WATER_Y });
  if (net.market) D.dressMarket(w, rng.fork('market'), net.market);
  D.dressRail(w, rng.fork('masts'), railZ, canalX);
  // Gantry cranes straddle the quay; barges ride in the canal between the bridges.
  const steelC = [0.42, 0.3, 0.06];
  for (let z = 70; z < w.size - 60; z += rng.irange(150, 230)) {
    if (bridges.some((b) => Math.abs(b.z - z) < 30)) continue;
    const side = rng.chance(0.5) ? 1 : -1, qx = canalX + side * 16.5;
    // Its legs stand on the quay, a level below the street.
    for (const dz of [-5, 5]) { w.fillRect(qx - 0.5, z + dz - 0.5, qx + 0.5, z + dz + 0.5, 1); box(w, qx, (QUAY_Y + 26) / 2, z + dz, 0.9, 26 - QUAY_Y, 0.9, MAT.PLAIN, steelC, 0, 10, rng.float()); }
    box(w, canalX + side * 2, 26.5, z, 34, 1.4, 1.6, MAT.PLAIN, steelC, 0, 10, rng.float());
    box(w, qx, 25, z, 1.2, 1.2, 11, MAT.PLAIN, steelC, 0, 10, rng.float());
    box(w, canalX + side * 6, 24.6, z, 3, 2.4, 2.6, MAT.GLOSS, [0.1, 0.12, 0.14], 0);
    box(w, canalX + side * 6, 24.2, z + 1.32, 2.4, 1.0, 0.04, MAT.EMISSIVE, [1.0, 0.9, 0.7], 2.5);
    cyl(w, canalX - side * 4, 12, 25.8, z, 0.04, MAT.PLAIN, [0.03, 0.03, 0.03]);
    box(w, canalX - side * 4, 10.7, z, 6, 2.55, 2.5, MAT.PLAIN, rng.pick([[0.42, 0.1, 0.07], [0.08, 0.2, 0.36], [0.1, 0.3, 0.16]]), 0, 10, rng.float());
    ball(w, canalX - side * 15, 27.6, z, 0.25, MAT.EMISSIVE, [1, 0.1, 0.1], 6, rng.float());
    light(w, qx, 9, z, [1.0, 0.85, 0.6], 30, 2.0);
  }
  for (let z = 40; z < w.size - 40; z += rng.irange(70, 130)) {
    if (bridges.some((b) => Math.abs(b.z - z) < 24)) continue;
    // Barges ride on the water, below the quays.
    const bx = canalX + rng.range(-6, 6), wy = WATER_Y;
    box(w, bx, wy + 0.5, z, 5, 1.2, 16, MAT.GLOSS, [0.1, 0.07, 0.06], 0);
    box(w, bx, wy + 1.5, z - 5.5, 3.6, 1.8, 3.6, MAT.PLAIN, [0.2, 0.2, 0.21], 0, 6);
    box(w, bx, wy + 1.6, z - 3.68, 2.8, 0.8, 0.04, MAT.EMISSIVE, [1.0, 0.85, 0.6], 2.0);
    for (let q = 0; q < 2; q++) box(w, bx, wy + 1.5 + (rng.chance(0.4) ? 2.6 : 0) * 0 , z + 1 + q * 5.2, 2.6, 2.5, 5, MAT.PLAIN, rng.pick([[0.42, 0.1, 0.07], [0.08, 0.2, 0.36], [0.5, 0.26, 0.06]]), 0, 10, rng.float());
    ball(w, bx, wy + 2.7, z - 7, 0.14, MAT.EMISSIVE, [0.2, 1, 0.4], 5);
  }
}

// Skybridges between towers that face each other across a street.
function addSkybridges(w, rng) {
  const T = w.towers, used = new Set();
  for (let i = 0; i < T.length; i++) {
    for (let j = i + 1; j < T.length; j++) {
      if (used.has(i) || used.has(j)) continue;
      const a = T[i], b = T[j], y = Math.min(a.h, b.h) * rng.range(0.35, 0.6);
      const zo0 = Math.max(a.z0, b.z0), zo1 = Math.min(a.z1, b.z1), xo0 = Math.max(a.x0, b.x0), xo1 = Math.min(a.x1, b.x1);
      const gapX = Math.max(b.x0 - a.x1, a.x0 - b.x1), gapZ = Math.max(b.z0 - a.z1, a.z0 - b.z1);
      if (zo1 - zo0 >= 8 && gapX >= 8 && gapX <= 34) {
        const xa = Math.min(a.x1, b.x1), zc = (zo0 + zo1) / 2;
        boxMM(w, xa, zc - 2, xa + gapX, zc + 2, y, y + 3.2, MAT.FACADE, [0.07, 0.08, 0.1], 1, rng.float() * 900, 0.7, 2.6, rng.int(8));
        boxMM(w, xa, zc - 0.15, xa + gapX, zc + 0.15, y - 0.2, y, MAT.EMISSIVE, rng.pick(NEON), 2.4, rng.float());
        used.add(i); used.add(j);
      } else if (xo1 - xo0 >= 8 && gapZ >= 8 && gapZ <= 34) {
        const za = Math.min(a.z1, b.z1), xc = (xo0 + xo1) / 2;
        boxMM(w, xc - 2, za, xc + 2, za + gapZ, y, y + 3.2, MAT.FACADE, [0.07, 0.08, 0.1], 1, rng.float() * 900, 0.7, 2.6, rng.int(8));
        boxMM(w, xc - 0.15, za, xc + 0.15, za + gapZ, y - 0.2, y, MAT.EMISSIVE, rng.pick(NEON), 2.4, rng.float());
        used.add(i); used.add(j);
      }
    }
  }
  w.towers = null;
}

function addPerimeter(w, rng) {
  const n = w.n, S = w.size;
  w.fillRect(0, 0, S, 3, 1); w.fillRect(0, S - 3, S, S, 1);
  w.fillRect(0, 0, 3, S, 1); w.fillRect(S - 3, 0, S, S, 1);
  const col = [0.06, 0.065, 0.08];
  for (let k = 0; k < n; k++) {
    const c = k * BLOCK + 50;
    for (const [x, z, sx, sz] of [[c, -4, 100, 10], [c, S + 4, 100, 10], [-4, c, 10, 100], [S + 4, c, 10, 100]]) {
      box(w, x, 9, z, sx, 18, sz, MAT.FACADE, col, 1, rng.float() * 900, 0.1, 3.2, rng.int(8));
      for (let j = 0; j < 2; j++) {
        const dist = rng.range(30, 160), h = rng.range(50, 190), tw = rng.range(22, 44);
        const tx = x + (x < 0 ? -dist : x > S ? dist : rng.range(-40, 40)), tz = z + (z < 0 ? -dist : z > S ? dist : rng.range(-40, 40));
        box(w, tx, h / 2, tz, tw, h, tw, MAT.FACADE, col, 1, rng.float() * 900, rng.range(0.15, 0.4), rng.range(2.6, 3.8), rng.int(8));
      }
    }
  }
}

// Flood fill from insertion: everything the operator can actually walk to. A doorway
// passes when `pass(door)` allows it; with no test given every door can be opened. With
// height the walk keeps to the step rule (stairs and ramps, never a drop), so whatever it
// reaches can also be walked back from.
export function reachable(w, pass = null, from = w.insertion) {
  const S = w.size, G = w.grid, D = w.doorCell, seen = new Uint8Array(S * S), q = new Int32Array(S * S);
  const open = pass ? Uint8Array.from(w.doors, (d) => (pass(d) ? 1 : 0)) : null;
  const H = w.hasHeight;
  const ok = (i, j) => (G[j] === 0 || (G[j] === 3 && (!open || open[D[j] - 1] === 1))) && (!H || w.stepOK(i, j));
  let head = 0, tail = 0;
  const start = Math.floor(from.z) * S + Math.floor(from.x);
  seen[start] = 1; q[tail++] = start;
  while (head < tail) {
    const i = q[head++], x = i % S;
    if (x > 0 && !seen[i - 1] && ok(i, i - 1)) { seen[i - 1] = 1; q[tail++] = i - 1; }
    if (x < S - 1 && !seen[i + 1] && ok(i, i + 1)) { seen[i + 1] = 1; q[tail++] = i + 1; }
    if (i >= S && !seen[i - S] && ok(i, i - S)) { seen[i - S] = 1; q[tail++] = i - S; }
    if (i < S * (S - 1) && !seen[i + S] && ok(i, i + S)) { seen[i + S] = 1; q[tail++] = i + S; }
  }
  return seen;
}
// True if any cell within r of (x, z) is marked in a reach map.
export function reachNear(w, seen, x, z, r) {
  const S = w.size;
  for (let zi = Math.max(0, Math.floor(z - r)); zi <= Math.min(S - 1, Math.floor(z + r)); zi++) {
    for (let xi = Math.max(0, Math.floor(x - r)); xi <= Math.min(S - 1, Math.floor(x + r)); xi++) {
      if (seen[zi * S + xi] && (xi + 0.5 - x) ** 2 + (zi + 0.5 - z) ** 2 <= r * r) return true;
    }
  }
  return false;
}

// Places a raid depends on: the exits, the lair gate, the brokers and the nests.
export function requiredPlaces(w) { return w.pois.filter((p) => p.type === 'extract' || p.type === 'boss' || p.type === 'broker' || p.type === 'nest'); }
const placeReach = (p) => (p.type === 'nest' ? p.r : 2);
// Keys favour the small containers people keep them in.
const KEY_WEIGHT = { basket: 6, tin: 6, locker: 3, crate: 1.5, cargo: 1, boot: 1, wreck: 0.5, dumpster: 0.5 };

// Settle the doors once everything else is placed. A hard door (locked, jammed or dead)
// never seals the only way to a required place, and every locked door gets a key in a
// container in the same or a neighbouring block that can be reached without passing a
// hard door, so no key is ever locked behind the door it opens.
function settleDoors(w, seen, rng) {
  const n = w.n, hard = (d) => d.kind !== 'closed', soft = (d) => !hard(d);
  for (const d of w.doors) d.ref = w.refAt(d.x, d.z);
  if (!w.doors.some(hard)) return;
  const goals = requiredPlaces(w).filter((p) => reachNear(w, seen, p.x, p.z, placeReach(p)));
  let sealed = reachable(w, soft);
  for (let guard = 0; guard < w.doors.length; guard++) {
    const miss = goals.find((p) => !reachNear(w, sealed, p.x, p.z, placeReach(p)));
    if (!miss) break;
    let best = null, bd = Infinity;
    for (const d of w.doors) { const dd = (d.x - miss.x) ** 2 + (d.z - miss.z) ** 2; if (hard(d) && dd < bd) { bd = dd; best = d; } }
    if (!best) break;
    best.kind = 'closed';
    sealed = reachable(w, soft);
  }
  const taken = new Set();
  for (const d of w.doors) {
    if (d.kind !== 'locked') continue;
    const bx = d.block % n, bz = (d.block / n) | 0, cands = [], weights = [];
    for (const c of w.containers) {
      if (taken.has(c.id) || Math.abs((c.block % n) - bx) > 1 || Math.abs(((c.block / n) | 0) - bz) > 1 || !reachNear(w, sealed, c.x, c.z, 1.5)) continue;
      cands.push(c); weights.push((KEY_WEIGHT[c.kind] || 1) / (1 + Math.hypot(c.x - d.x, c.z - d.z) / 40));
    }
    // No safe place for a key: the door stays shut but opens like any other.
    if (!cands.length) { d.kind = 'closed'; continue; }
    const c = cands[rng.weighted(weights)];
    taken.add(c.id); c.key = d.id; d.key = c.id;
  }
}

function finalize(w, rng) {
  const S = w.size;
  // Drop anything the operator cannot reach, then index by block.
  const seen = w.annex ? null : reachable(w);
  const near = (x, z) => { if (!seen) return true; const xi = Math.floor(x), zi = Math.floor(z); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) if (seen[(zi + dz) * S + xi + dx]) return true; return false; };
  // Nothing to loot inside the Shelter: its containers and caches are removed outright.
  const inShelter = (x, z) => !w.annex && w.zoneAt(x, z) === 0;
  for (const c of w.containers) if (inShelter(c.x, c.z)) w.fillRect(c.x - 0.5, c.z - 0.5, c.x + 0.5, c.z + 0.5, 0);
  for (const q of w.pois) if (q.type !== 'broker' && q.type !== 'extract' && inShelter(q.x, q.z)) w.fillRect(q.x - 0.5, q.z - 0.5, q.x + 0.5, q.z + 0.5, 0);
  w.pois = w.pois.filter((q) => q.type === 'broker' || q.type === 'extract' || !inShelter(q.x, q.z));
  w.containers = w.containers.filter((c) => near(c.x, c.z) && !inShelter(c.x, c.z));
  w.containers.forEach((c, i) => { c.id = i; w.blocks[c.block].containers.push(c); });
  w.pois = w.pois.filter((p) => p.type === 'extract' || p.type === 'boss' || p.type === 'nest' || near(p.x, p.z));
  w.pois.forEach((p, i) => { p.id = i; w.blocks[w.blockIndex(p.x, p.z)].pois.push(p); });
  w.reach = seen;
  if (seen) settleDoors(w, seen, rng.fork('doors'));
  for (const d of w.doors) w.blocks[d.block].doors.push(d);
  // Pedestrian sample points: reachable sidewalk, alley and plaza cells.
  if (seen) {
    for (let b = 0; b < w.blocks.length; b++) {
      const ox = (b % w.n) * BLOCK, oz = ((b / w.n) | 0) * BLOCK, ped = w.blocks[b].ped;
      for (let t = 0; t < 260 && ped.length < 20; t++) {
        const x = ox + rng.int(BLOCK), z = oz + rng.int(BLOCK), i = z * S + x, s = w.surface[i];
        if (seen[i] && (s === SURF.WALK || s === SURF.ALLEY || s === SURF.PLAZA) && w.circleFree(x + 0.5, z + 0.5, 0.7)) ped.push({ x: x + 0.5, z: z + 0.5 });
      }
    }
  }
  // Slabs, walls, treads, parapets and nosings for whatever height the district holds.
  emitHeight(w);
  w.shapes = w.build.map((perBlock) => {
    let total = 0;
    for (const b of perBlock) total += b.length;
    const data = new Float32Array(total), range = new Uint32Array(perBlock.length * 2);
    let o = 0;
    for (let i = 0; i < perBlock.length; i++) {
      data.set(perBlock[i], o);
      range[i * 2] = o / INST_FLOATS; range[i * 2 + 1] = perBlock[i].length / INST_FLOATS;
      o += perBlock[i].length;
    }
    return { data, range };
  });
  w.build = null;
  w.instances = w.shapes.reduce((a, s) => a + s.data.length / INST_FLOATS, 0);
  return w;
}

export function generateWorld(seed, opts = {}) {
  if (opts.annex) return generateAnnex(seed);
  const w = new World(seed, BLOCKS);
  const rng = new Rng(seed).fork('city');
  genZones(w, seed);
  const net = genNetwork(w, rng.fork('net'));
  w.net = { xs: net.xs, zs: net.zs, canalX: net.canalX, railZ: net.railZ };
  paintNetwork(w, net);
  w.net.bridges = net.bridges; w.net.market = net.market;
  for (let i = 0; i < w.n * w.n; i++) w.style[i] = styleFor((i % w.n) * 100 + 50, ((i / w.n) | 0) * 100 + 50, net.canalX);
  placeLandmarks(w, net, rng.fork('landmarks'));
  // Debug switch (?heighttest): a yard of terraces, stairs, drops and a pit beside the Shelter.
  if (opts.heightTest) { reserve(w, INSERT_X + 42, INSERT_Z + 22, 19); w.heightTest = heightTestYard(w, INSERT_X + 28, INSERT_Z + 10); }
  // Two interior scenes take a lot each in place of its usual buildings (doc 64 Package 8).
  const scenes = new Map();
  for (const L of pickSceneLots(w, net, (i, j) => lotBounds(w, net, i, j), hitsReserved, (x, z) => styleFor(x, z, net.canalX))) scenes.set(L.i * 1000 + L.j, L);
  const K = { addBuilding, addDoor, addPoi, addRoof, tree };
  for (let i = 0; i < net.xs.length - 1; i++) {
    for (let j = 0; j < net.zs.length - 1; j++) {
      const lr = new Rng((seed ^ Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663)) >>> 0).fork('lot'), L = scenes.get(i * 1000 + j);
      if (L) { w.curStyle = L.style; w.scenes.push(L.kind === 'tower' ? recordsTower(w, lr, L, K) : laundryCourt(w, lr, L, K)); } else genLot(w, net, lr, i, j);
    }
  }
  dressRoads(w, net, rng.fork('roads'));
  addCanalAndRail(w, net, rng.fork('rail'));
  addSkybridges(w, rng.fork('bridges'));
  addPerimeter(w, rng.fork('perimeter'));
  // Railings along the top of the quay walls, wherever the street meets them in the open.
  HT.parapets(w, net.canalX - QUAY_OUT - MARKET_W - 2, 0, net.canalX + QUAY_OUT + 2, w.size);
  w.resolveCircle(w.insertion, 1);
  return finalize(w, rng.fork('ped'));
}

// ---- Training Annex (doc 16): a small enclosed yard used by the tutorial ----
export function generateAnnex(seed) {
  const w = new World(seed, 2, true);
  const rng = new Rng(seed).fork('annex');
  const X0 = 40, X1 = 160, Z0 = 60, Z1 = 140;
  w.fillRect(0, 0, w.size, w.size, 1);
  w.fillRect(X0, Z0, X1, Z1, 0);
  w.surface.fill(SURF.FLOOR);
  const wallCol = [0.16, 0.18, 0.2];
  const wall = (x0, z0, x1, z1, h = 6) => { w.fillRect(x0, z0, x1, z1, 1); boxMM(w, x0, z0, x1, z1, 0, h, MAT.PLAIN, wallCol, 0, 1); };
  wall(X0 - 2, Z0 - 2, X1 + 2, Z0); wall(X0 - 2, Z1, X1 + 2, Z1 + 2);
  wall(X0 - 2, Z0, X0, Z1); wall(X1, Z0, X1 + 2, Z1);
  wall(80, Z0, 81, 92, 4); wall(80, 108, 81, Z1, 4);
  wall(120, Z0, 121, 92, 4); wall(120, 108, 121, Z1, 4);
  for (const [x, z] of [[134, 80], [146, 96], [134, 118], [150, 122], [142, 72]]) { w.fillRect(x, z, x + 2, z + 2, 1); boxMM(w, x, z, x + 2, z + 2, 0, 2.2, MAT.PLAIN, [0.2, 0.2, 0.22], 0, 6); }
  const strip = [0.35, 0.8, 1.0];
  box(w, 100, 5.6, Z0 + 0.2, 110, 0.25, 0.25, MAT.EMISSIVE, strip, 5);
  box(w, 100, 5.6, Z1 - 0.2, 110, 0.25, 0.25, MAT.EMISSIVE, strip, 5);
  for (let x = 55; x <= 145; x += 18) for (const z of [78, 100, 122]) { box(w, x, 6.5, z, 2.2, 0.15, 0.6, MAT.EMISSIVE, [0.8, 0.9, 1.0], 6); light(w, x, 6, z, [0.75, 0.88, 1.0], 20, 0.85); }
  box(w, 60, 4, Z0 + 0.3, 14, 1.4, 0.3, MAT.SIGN, NEON[1], 4, rng.float());
  box(w, 140, 4, Z0 + 0.3, 14, 1.4, 0.3, MAT.SIGN, NEON[0], 4, rng.float());
  w.insertion = { x: 50, z: 100 };
  w.annexData = {
    waypoints: [{ x: 62, z: 78 }, { x: 70, z: 122 }, { x: 74, z: 100 }],
    containers: [addContainer(w, 88.5, 70.5, 'crate', true), addContainer(w, 100.5, 66.5, 'locker', true), addContainer(w, 112.5, 70.5, 'crate', true)],
    dummies: [{ x: 90, z: 126 }, { x: 96, z: 130 }, { x: 102, z: 126 }, { x: 108, z: 130 }, { x: 114, z: 126 }],
    strike: { x: 100, z: 100 },
    mimics: [{ x: 136, z: 100 }, { x: 148, z: 84 }, { x: 144, z: 126 }],
    elite: { x: 152, z: 104 },
    extract: addPoi(w, 'extract', 150, 132, { name: 'Annex Exit', idx: 0, r: 5 }),
  };
  w.extractions[0] = w.annexData.extract;
  light(w, 150, 4, 132, [0.2, 1.0, 0.45], 22, 2.0);
  return finalize(w, rng);
}
