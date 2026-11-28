// Doors in shell doorways (docs 31, 64 package 6). The district fixes where each door
// is and what kind it is (src/sim/world.js); this module keeps the per-raid state, like
// raid.cont for containers, and writes it into the raid's own copy of the grid:
//   closed  grid 3: blocks movement, sight and shots; opens when walked into or used,
//           and a pursuing hostile pressed against it shoves it open after a moment
//   locked  grid 1: opens only with its key, found in a container nearby
//   jammed  grid 1: a shutter that can be forced by holding E, which is loud
//   dead    grid 1: a lift out of service; never opens, shows its notice
//   open    grid 0
// Keys are kept in raid.keys (door ids), not in the pack, until the pack grid exists.

import { clamp } from '../core/math.js';
import { BLOCK } from './data.js';
import { message } from '../i18n/index.js';

export const PUSH_OPEN = 0.8;    // seconds a hostile leans on a closed door before it gives
export const FORCE_TIME = 3;     // seconds of hold E to force a jammed shutter
export const SEE_RANGE = 28;     // a door in line of sight this close is marked on the map
// Grid values a walker may path through: free cells and closed doors.
export const PASSABLE = Uint8Array.of(1, 0, 0, 1);

const CELL = { open: 0, closed: 3, locked: 1, jammed: 1, dead: 1 };
const SIDE_NAME = ['north', 'south', 'west', 'east'];
const USE_NAME = { shop: 'shop', bar: 'bar', office: 'office', home: 'flat' };

// What a door is called in a key's tag and a lead: "the south door of the bar in C4".
export const doorPlace = (d) => message('the {side} door of the {use} in {ref}', { side: message(SIDE_NAME[d.side]), use: message(USE_NAME[d.use] || 'shop'), ref: d.ref });

export function initDoors(raid) {
  const w = raid.world;
  raid.doors = w.doors.map((d) => ({ state: d.kind, progress: 0, openT: -1, seen: false, lead: false, push: 0, pushT: -1 }));
  // Breakable windows (doc 32): whole until someone breaks one, then a one-way drop.
  raid.windows = (w.windows || []).map(() => ({ broken: false, progress: 0, brokenT: -1 }));
  raid.keys = new Set();
  raid.doorVer = 0;          // bumped whenever a door or key changes what a route may cross
  raid.doorSeeT = 0;
  raid.pushing = new Set();
  for (const d of w.doors) writeCells(raid, d);
}
function writeCells(raid, d) {
  const v = CELL[raid.doors[d.id].state], G = raid.world.grid;
  for (const i of d.cells) G[i] = v;
}

// Every door whose block overlaps the square of half-size r around (x, z).
export function forDoorsNear(raid, x, z, r, fn) {
  const w = raid.world, n = w.n;
  const bx0 = clamp(Math.floor((x - r) / BLOCK), 0, n - 1), bx1 = clamp(Math.floor((x + r) / BLOCK), 0, n - 1);
  const bz0 = clamp(Math.floor((z - r) / BLOCK), 0, n - 1), bz1 = clamp(Math.floor((z + r) / BLOCK), 0, n - 1);
  for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) for (const d of w.blocks[bz * n + bx].doors) fn(d, raid.doors[d.id]);
}
// Offset from (x, z) to the nearest point of the doorway's cells.
const toDoor = (d, x, z) => [clamp(x, d.x0, d.x1) - x, clamp(z, d.z0, d.z1) - z];
// With height a doorway is worked only from its own floor (doc 64 Package 8): a door on a
// mezzanine is not opened from the lobby under it.
const atLevel = (raid, d, b) => !raid.world.hasHeight || Math.abs(raid.world.floorAt(d.x, d.z) - raid.bodyY(b)) <= 1.5;

export function openDoor(raid, d, by = 'player') {
  const st = raid.doors[d.id];
  if (st.state === 'open' || st.state === 'dead') return false;
  st.state = 'open'; st.openT = raid.time; st.by = by; st.push = 0; st.progress = 0;
  writeCells(raid, d);
  raid.doorVer++;
  raid.pushing.delete(d.id);
  raid.sfx(by === 'force' ? 'break' : 'door', d.x, d.z);
  raid.emit({ t: 'door', id: d.id, x: d.x, z: d.z, by });
  return true;
}

export function updateDoors(raid, dt) {
  const w = raid.world, p = raid.player, G = w.grid, D = w.doorCell, S = w.size;
  if (!p.dead && !p.hidden) {
    forDoorsNear(raid, p.x, p.z, 3, (d, st) => {
      if (!atLevel(raid, d, p)) return;
      const [dx, dz] = toDoor(d, p.x, p.z), l = Math.hypot(dx, dz);
      // Walking into a closed door opens it: the operator is up against it and moving toward it.
      if (st.state === 'closed' && p.moving && l < p.r + 0.12 && dx * (p.lastMx || 0) + dz * (p.lastMz || 0) > 0.3 * l) openDoor(raid, d, 'player');
      // Trying a locked door reads its keyholder notice: a lead to the key's block.
      else if (st.state === 'locked' && !st.lead && l < 2 && !raid.keys.has(d.id) && d.key >= 0) {
        st.lead = true; raid.doorVer++;
        raid.toast(message('Locked. Keyholder notice: the key is kept in {ref}.', { ref: keyRef(raid, d) }), '#ffb86a', 'warning');
      }
    });
  }
  // Hostiles in pursuit lean on closed doors that stand between them and the operator.
  for (const e of raid.enemies) {
    if (e.dead || e.state !== 'hunt') continue;
    const R = e.r + 0.3, xa = Math.max(0, Math.floor(e.x - R)), xb = Math.min(S - 1, Math.floor(e.x + R));
    const za = Math.max(0, Math.floor(e.z - R)), zb = Math.min(S - 1, Math.floor(e.z + R));
    for (let zi = za; zi <= zb; zi++) {
      for (let xi = xa; xi <= xb; xi++) {
        const i = zi * S + xi;
        if (G[i] !== 3) continue;
        const id = D[i] - 1, st = raid.doors[id];
        if (st.pushT === raid.time || !atLevel(raid, w.doors[id], e)) continue;
        st.pushT = raid.time; st.push += dt;
        raid.pushing.add(id);
      }
    }
  }
  for (const id of raid.pushing) {
    const st = raid.doors[id];
    if (st.pushT !== raid.time) { st.push = Math.max(0, st.push - dt); if (st.push <= 0) raid.pushing.delete(id); }
    else if (st.push >= PUSH_OPEN) openDoor(raid, w.doors[id], 'enemy');
  }
  // Doors in line of sight are surveyed: the map shows them and routes know what they are.
  if ((raid.doorSeeT -= dt) <= 0 && !p.hidden) {
    raid.doorSeeT = 0.25;
    forDoorsNear(raid, p.x, p.z, SEE_RANGE, (d, st) => {
      if (st.seen) return;
      const dd = Math.hypot(d.x - p.x, d.z - p.z);
      if (dd > SEE_RANGE || (dd > 1.6 && w.raycast(p.x, p.z, d.x, d.z) * dd < dd - 1.2)) return;
      st.seen = true;
      if (d.kind !== 'closed') raid.doorVer++;
    });
  }
}

// The block where a locked door's key is kept.
export function keyRef(raid, d) { const c = raid.world.containers[d.key]; return c ? raid.world.refAt(c.x, c.z) : d.ref; }

// The door the operator can work at from here, as an interaction for raid.findInteract.
export function doorInteract(raid) {
  const p = raid.player;
  let door = null, st = null, bd = 1.9;
  forDoorsNear(raid, p.x, p.z, 2.5, (d, s) => {
    if (s.state === 'open' || !atLevel(raid, d, p)) return;
    const [dx, dz] = toDoor(d, p.x, p.z), l = Math.hypot(dx, dz);
    if (l < bd) { bd = l; door = d; st = s; }
  });
  // A window whole in front of the operator, at their floor, can be broken instead.
  const win = windowInteract(raid);
  if (win && (!door || win.dist < bd)) return win;
  if (!door) return null;
  const it = { key: 'door' + door.id, type: 'door', door, st, need: 0.3, ok: true, dist: bd, label: 'Open door' };
  if (st.state === 'locked') {
    if (raid.keys.has(door.id)) { it.label = 'Unlock door with key'; it.need = 0.8; } else {
      it.ok = false;
      it.label = door.key >= 0 ? message('Locked: the key is kept in {ref}', { ref: keyRef(raid, door) }) : 'Locked door';
    }
  } else if (st.state === 'jammed') {
    it.label = 'Force the jammed shutter (loud)'; it.need = FORCE_TIME;
    // The shutter rattles in its track every half second while it is forced.
    it.onHold = (dt, t) => { if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) { raid.noise(door.x, door.z, 24); raid.sfx('rattle', door.x, door.z); } };
  } else if (st.state === 'dead') { it.ok = false; it.label = 'Dead lift. Notice: OUT OF SERVICE, use the stairs'; }
  return it;
}

export function completeDoor(raid, it) {
  const d = it.door, st = it.st;
  if (st.state === 'closed') openDoor(raid, d, 'player');
  else if (st.state === 'locked' && raid.keys.has(d.id)) { openDoor(raid, d, 'key'); raid.toast('Door unlocked', '#9fe8ff', 'complete'); }
  else if (st.state === 'jammed') {
    openDoor(raid, d, 'force');
    // Forcing it is heard down the street, and something comes to look.
    raid.noise(d.x, d.z, 32);
    raid.toast('Shutter forced. That carried down the street.', '#ffb86a', 'warning');
    if (raid.mode === 'raid') raid.spawnWave(2, { near: d, rmin: 14, rmax: 24 });
  }
}

// ---- breakable windows (doc 32, doc 64 Package 8) ----
// A window in an upper wall: its cell is wall while the glass holds. Breaking it takes a
// second of hold E and is heard down the street; the cell then opens as a one-way drop cell
// (the sill), in this raid's own copies of the grid and the drop map.
export const BREAK_TIME = 1.0;
function windowInteract(raid) {
  const w = raid.world, p = raid.player;
  let best = null, bd = 1.9;
  (w.windows || []).forEach((win, i) => {
    const st = raid.windows[i];
    if (st.broken || (w.hasHeight && Math.abs(win.y - raid.bodyY(p)) > 1.5)) return;
    const l = Math.hypot(Math.max(0, Math.abs(p.x - win.x) - 0.5), Math.max(0, Math.abs(p.z - win.z) - 0.5));
    if (l < bd) { bd = l; best = { key: 'win' + win.id, type: 'window', win, st, need: BREAK_TIME, ok: true, dist: l, label: 'Break the window (loud)' }; }
  });
  return best;
}
export function breakWindow(raid, win) {
  const st = raid.windows[win.id], w = raid.world;
  if (st.broken) return false;
  st.broken = true; st.brokenT = raid.time; st.progress = 0;
  w.grid[win.cell] = 0;
  w.ownDrop()[win.cell] = 1;
  raid.doorVer++;
  raid.noise(win.x, win.z, 30);
  raid.sfx('break', win.x, win.z);
  raid.emit({ t: 'window', id: win.id, x: win.x, z: win.z, nx: win.nx, nz: win.nz, y: win.y });
  raid.toast('The window is out: a one-way drop to the ground below', '#ffb86a', 'warning');
  return true;
}

// Opening a container that holds a key hands it over, with the door it fits on its tag.
export function takeKey(raid, c) {
  if (!(c.key >= 0) || raid.keys.has(c.key)) return;
  raid.keys.add(c.key);
  raid.doorVer++;
  raid.toast(message('Key found: it fits {door}', { door: doorPlace(raid.world.doors[c.key]) }), '#ffd76a', 'loot');
  raid.emit({ t: 'key', id: c.key });
}
