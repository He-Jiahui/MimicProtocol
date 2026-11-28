// Route guidance to a chosen known activity (docs 36, 64 package 6). A* over the 1 m
// occupancy grid: the same cells the operator can enter, with closed doors passable
// (walking into one opens it), and a locked door passable once its key is carried. A
// hard door that has been seen (locked, a jammed shutter, a dead lift) is a blocker:
// the route goes round it, or stops at it and says why. A hard door nobody has seen
// yet is taken for an ordinary one: the route shows what is known, and changes once
// it is seen.
//
// raid.route: { target, result, t, ver }. The search reruns every ROUTE_EVERY seconds,
// at once when the target changes, and when a door or a key changes (raid.doorVer).

import { jobTargets, jobTargetOn, exitInfo } from './jobs.js';
import { message } from '../i18n/index.js';

export const ROUTE_EVERY = 0.5;
const SURVEY = 110;             // a point of interest this close is on the map (as in minimap.js)
const CAP = 30000;              // cells the flood from a goal covers before calling its ground open
const SQ2 = Math.SQRT2;
const DX = Int8Array.of(1, -1, 0, 0, 1, 1, -1, -1), DZ = Int8Array.of(0, 0, 1, -1, 1, -1, 1, -1);
const OPEN = 1, HARD = 2;       // cell classes in the pass map; 0 is blocked

// ---- search scratch, sized to the largest grid seen and reused ----
let N = 0, gCost, from, stamp, done, mark, queue, pass, heapI, heapF, heapN = 0, searchId = 0, passFor = null, passVer = -1;
// Height (doc 64 Package 8): the floor map of the world being searched, or null when it is
// flat. A route keeps to the step rule: stairs and ramps, never a drop (doc 32: a window
// drop is not an ordinary way home).
let FLR = null;
const STEP_UNITS = 2;
const level = (a, b) => !FLR || Math.abs(FLR[a] - FLR[b]) <= STEP_UNITS;
function scratch(n) {
  if (n <= N) return;
  N = n; gCost = new Float64Array(n); from = new Int32Array(n); stamp = new Uint32Array(n); done = new Uint32Array(n);
  mark = new Uint32Array(n); queue = new Int32Array(n); pass = new Uint8Array(n); passFor = null;
  heapI = new Int32Array(1 << 16); heapF = new Float64Array(1 << 16);
}
// Classify every cell for this raid's doors and keys. The grid only changes with its
// doors, so the map is kept until raid.doorVer moves on.
function passMap(raid) {
  if (passFor === raid && passVer === raid.doorVer) return pass;
  const G = raid.world.grid, D = raid.world.doorCell, n = G.length;
  for (let i = 0; i < n; i++) {
    const v = G[i];
    if (v === 0 || v === 3) { pass[i] = OPEN; continue; }
    pass[i] = 0;
    if (v !== 1 || !D[i]) continue;
    const d = D[i] - 1, st = raid.doors[d];
    pass[i] = (st.state === 'locked' && raid.keys.has(d)) || !st.seen ? OPEN : HARD;
  }
  passFor = raid; passVer = raid.doorVer;
  return pass;
}
function push(i, f) {
  if (heapN === heapI.length) { const a = new Int32Array(heapN * 2), b = new Float64Array(heapN * 2); a.set(heapI); b.set(heapF); heapI = a; heapF = b; }
  let k = heapN++;
  while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; }
  heapI[k] = i; heapF[k] = f;
}
function pop() {
  const top = heapI[0], li = heapI[--heapN], lf = heapF[heapN];
  let k = 0;
  for (;;) {
    let c = 2 * k + 1;
    if (c >= heapN) break;
    if (c + 1 < heapN && heapF[c + 1] < heapF[c]) c++;
    if (heapF[c] >= lf) break;
    heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c;
  }
  heapI[k] = li; heapF[k] = lf;
  return top;
}

// True if every cell the segment passes through, between its end cells, is open ground.
// A grid walk, so no corner of a wall is skipped; through a cell corner exactly, both
// cells beside it must be open.
function clearLine(S, x0, z0, x1, z1) {
  let xi = Math.floor(x0), zi = Math.floor(z0);
  const xe = Math.floor(x1), ze = Math.floor(z1), dx = x1 - x0, dz = z1 - z0, sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdz = dz ? Math.abs(1 / dz) : Infinity;
  let tx = dx ? (dx > 0 ? xi + 1 - x0 : x0 - xi) * tdx : Infinity, tz = dz ? (dz > 0 ? zi + 1 - z0 : z0 - zi) * tdz : Infinity;
  const open = (x, z) => x >= 0 && z >= 0 && x < S && z < S && pass[z * S + x] === OPEN;
  while (xi !== xe || zi !== ze) {
    const a = zi * S + xi;
    if (Math.abs(tx - tz) < 1e-9) {
      if (!open(xi + sx, zi) || !open(xi, zi + sz)) return false;
      if (FLR && (!level(a, a + sx) || !level(a, a + sz * S) || !level(a + sx, a + sx + sz * S) || !level(a + sz * S, a + sx + sz * S))) return false;
      tx += tdx; tz += tdz; xi += sx; zi += sz;
    } else if (tx < tz) { tx += tdx; xi += sx; } else { tz += tdz; zi += sz; }
    if (Math.abs(xi - xe) + Math.abs(zi - ze) > 2 * S) return false;
    if ((xi !== xe || zi !== ze) && !open(xi, zi)) return false;
    if (FLR && xi >= 0 && zi >= 0 && xi < S && zi < S && !level(a, zi * S + xi)) return false;
  }
  return true;
}
// Octile distance, and its largest ratio to the straight line (at 22.5 degrees).
const octile = (dx, dz) => { const a = Math.abs(dx), b = Math.abs(dz); return a > b ? a + (SQ2 - 1) * b : b + (SQ2 - 1) * a; };
const OCT_MAX = 1.0824;

// A* over open ground from cell `start` toward (tx, tz), done at a cell in `goals`. R
// widens the heuristic for a goal that is any cell within R of the target. Known hard
// doors are walls, except those in `doorGoals`, which are goals themselves; the ones
// met at the edge of the search are collected in `exits`.
function astar(S, start, tx, tz, R, goals, exits = null, doorGoals = null) {
  const id = ++searchId, slack = OCT_MAX * R;
  heapN = 0;
  // A hair over the true heuristic breaks ties toward the goal on open ground.
  const h = (i) => Math.max(0, octile((i % S) + 0.5 - tx, ((i / S) | 0) + 0.5 - tz) - slack) * 1.001;
  gCost[start] = 0; stamp[start] = id; from[start] = -1;
  push(start, h(start));
  let near = start, nearH = h(start);
  while (heapN > 0) {
    const i = pop();
    if (done[i] === id) continue;
    done[i] = id;
    if (goals.has(i)) return { found: i, near: i };
    const hi = h(i);
    if (hi < nearH) { nearH = hi; near = i; }
    const x = i % S, z = (i / S) | 0, gi = gCost[i];
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], nz = z + DZ[k];
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      const j = nz * S + nx;
      if (done[j] === id) continue;
      const c = pass[j];
      if (FLR && !level(i, j)) continue;
      if (c !== OPEN) { if (c === HARD) { if (exits) exits.add(j); if (!doorGoals || !doorGoals.has(j)) continue; } else continue; }
      // No cutting corners: both cells beside a diagonal step must be open as well.
      if (k >= 4 && (pass[z * S + nx] !== OPEN || pass[nz * S + x] !== OPEN)) continue;
      if (k >= 4 && FLR && (!level(i, z * S + nx) || !level(i, nz * S + x) || !level(j, z * S + nx) || !level(j, nz * S + x))) continue;
      const ng = gi + (k >= 4 ? SQ2 : 1);
      if (stamp[j] !== id || ng < gCost[j]) { stamp[j] = id; gCost[j] = ng; from[j] = i; push(j, ng + h(j)); }
    }
  }
  return { found: -1, near };
}
// Flood out from the goal cells over open ground (known hard doors shut), up to `cap`
// cells. Tells whether it met the start, whether it ran out of ground first, and which
// known hard doors border what it covered.
function flood(raid, seeds, start, cap) {
  const S = raid.world.size, id = ++searchId, exits = new Set();
  let head = 0, tail = 0;
  for (const s of seeds) if (mark[s] !== id) { mark[s] = id; queue[tail++] = s; }
  const visit = (i, j) => {
    if (mark[j] === id || (FLR && !level(i, j))) return;
    const c = pass[j];
    if (c === HARD) exits.add(j);
    if (c === OPEN) { mark[j] = id; queue[tail++] = j; }
  };
  while (head < tail) {
    const i = queue[head++], x = i % S;
    if (i === start) return { hitStart: true, exhausted: false, exits };
    if (tail > cap) return { hitStart: false, exhausted: false, exits };
    if (x > 0) visit(i, i - 1);
    if (x < S - 1) visit(i, i + 1);
    if (i >= S) visit(i, i - S);
    if (i < S * (S - 1)) visit(i, i + S);
  }
  return { hitStart: false, exhausted: true, exits };
}

// Search from (sx, sz) to the target: { x, z, reach, los }. A goal is a walkable cell
// within reach of the target point that, if los is set, has a clear line to it.
// Most routes are one A* on open ground. When the goal can only be reached through a
// known hard door, either the ground around the goal is a small sealed region (a flood
// from the goal says so quickly) or the A* runs out of ground around the operator;
// either way the route is cut short at a door on that region's edge.
export function findRoute(raid, sx, sz, target) {
  const w = raid.world, S = w.size;
  scratch(S * S);
  passMap(raid);
  FLR = w.hasHeight ? w.floor : null;
  const tx = target.x, tz = target.z, reach = target.reach ?? 1.5, los = target.los !== false;
  const start = Math.min(S - 1, Math.max(0, Math.floor(sz))) * S + Math.min(S - 1, Math.max(0, Math.floor(sx)));
  const goals = new Set();
  for (let zi = Math.max(0, Math.floor(tz - reach)); zi <= Math.min(S - 1, Math.floor(tz + reach)); zi++) {
    for (let xi = Math.max(0, Math.floor(tx - reach)); xi <= Math.min(S - 1, Math.floor(tx + reach)); xi++) {
      const x = xi + 0.5, z = zi + 0.5, i = zi * S + xi;
      // A goal stands on the target's own level: the foot of a terrace is not its top.
      if (FLR && Math.abs(FLR[i] - FLR[Math.min(S - 1, Math.max(0, Math.floor(tz))) * S + Math.min(S - 1, Math.max(0, Math.floor(tx)))]) > 6) continue;
      if ((x - tx) ** 2 + (z - tz) ** 2 <= reach * reach && pass[i] === OPEN && (!los || w.raycast(x, z, tx, tz) >= 1)) goals.add(i);
    }
  }
  from[start] = -1;
  const done = (end, reached) => buildResult(raid, sx, sz, target, end, reached, los);
  if (!goals.size) return done(start, false);
  // Walk to a door on the edge of a sealed region and stop there. Out of the operator's
  // own region, take the door nearest the target.
  const toDoor = (exits, nearest) => {
    if (nearest) {
      let best = null, bd = Infinity;
      for (const j of exits) { const d = w.doors[w.doorCell[j] - 1], dd = Math.hypot(d.x - tx, d.z - tz); if (dd < bd) { bd = dd; best = d; } }
      exits = new Set(best.cells.filter((j) => pass[j] === HARD));
    }
    let R = 0;
    for (const j of exits) R = Math.max(R, Math.hypot((j % S) + 0.5 - tx, ((j / S) | 0) + 0.5 - tz));
    const r = astar(S, start, tx, tz, R + 1, exits, null, exits);
    if (r.found < 0) from[start] = -1;
    return done(r.found >= 0 ? r.found : start, false);
  };
  const back = flood(raid, goals, start, CAP);
  if (back.exhausted) return back.exits.size ? toDoor(back.exits, false) : done(start, false);
  const exits = new Set(), r = astar(S, start, tx, tz, reach, goals, exits);
  if (r.found >= 0) return done(r.found, true);
  return exits.size ? toDoor(exits, true) : done(r.near, false);
}

function buildResult(raid, sx, sz, target, end, reached, los) {
  const w = raid.world, S = w.size, cells = [];
  for (let i = end; i >= 0; i = from[i]) cells.push(i);
  cells.reverse();
  // The first known hard door along the way is where the route stops.
  let blocked = null;
  for (let k = 0; k < cells.length; k++) {
    if (pass[cells[k]] !== HARD) continue;
    const d = w.doors[w.doorCell[cells[k]] - 1];
    blocked = { door: d.id, state: raid.doors[d.id].state, x: d.x, z: d.z };
    cells.length = k;
    break;
  }
  const pts = [{ x: sx, z: sz }];
  for (const i of cells.slice(1)) pts.push({ x: (i % S) + 0.5, z: ((i / S) | 0) + 0.5 });
  // The last leg runs on to the activity itself, so the length is the walk to it.
  const ends = !blocked && reached;
  if (ends && los) pts.push({ x: target.x, z: target.z });
  if (blocked) { const d = w.doors[blocked.door]; pts.push({ x: d.x, z: d.z }); }
  const path = simplify(S, pts, blocked ? 1 : 0);
  let length = 0;
  for (let k = 1; k < path.length; k++) length += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
  const straight = Math.hypot(target.x - sx, target.z - sz);
  const arrived = ends && cells.length <= 1;
  const reason = blocked ? blockReason(raid, blocked) : ends ? null : 'No surveyed way through';
  return { ok: ends, arrived, path, length, straight, blocked, reason, target };
}

// Keep only the turns: drop every point the walk can cut past in a straight line. The
// last `keep` points are kept as they are (the leg into a blocking door).
function simplify(S, pts, keep) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]], last = pts.length - 1 - keep;
  let a = 0;
  for (let k = 2; k <= last; k++) {
    if (clearLine(S, pts[a].x, pts[a].z, pts[k].x, pts[k].z)) continue;
    out.push(pts[k - 1]); a = k - 1;
  }
  for (let k = Math.max(1, last); k < pts.length; k++) out.push(pts[k]);
  return out;
}

function blockReason(raid, b) {
  const d = raid.world.doors[b.door], st = raid.doors[b.door];
  if (b.state === 'jammed') return 'Jammed shutter: hold E to force it (loud)';
  if (b.state === 'dead') return 'Dead lift: out of service, no way through';
  if (st.lead && d.key >= 0) { const c = raid.world.containers[d.key]; return message('Locked door: the key is kept in {ref}', { ref: raid.world.refAt(c.x, c.z) }); }
  return 'Locked door: it needs its key';
}

// ---- known activities ----
// Everything the operator knows of and could be led to, nearest first.
export function routeTargets(raid) {
  const w = raid.world, p = raid.player, out = [], seen = raid.surveyed || new Set();
  for (const poi of w.pois) {
    const st = raid.poi[poi.id], ref = w.refAt(poi.x, poi.z);
    if (poi.type === 'extract' && st.known) { const ex = exitInfo(raid, poi); out.push({ kind: 'extract', id: poi.id, x: poi.x, z: poi.z, reach: Math.max(2, (poi.r || 6) - 1.5), label: ex.cond ? message('{name}: {cond}', { name: message(poi.name), cond: message(ex.cond) }) : message(poi.name) }); }
    else if (poi.type === 'boss' && !st.used && !raid.bossKilled) out.push({ kind: 'boss', id: poi.id, x: poi.x, z: poi.z, reach: 2.5, label: message('{name} (lair gate)', { name: message(poi.name) }) });
    else if (poi.type === 'broker') out.push({ kind: 'broker', id: poi.id, x: poi.x, z: poi.z, reach: 2.6, label: message('{name}, {ref}', { name: message(poi.name), ref }) });
    else if (poi.type === 'terminal' && !st.used && seen.has(poi.id)) out.push({ kind: 'terminal', id: poi.id, x: poi.x, z: poi.z, reach: 2, label: message('Intel Terminal, {ref}', { ref }) });
  }
  for (const c of w.containers) if (raid.cont[c.id].hostKnown && !raid.cont[c.id].opened) out.push({ kind: 'container', id: c.id, x: c.x, z: c.z, reach: 2, label: message('Marked Host, {ref}', { ref: w.refAt(c.x, c.z) }) });
  for (const d of w.doors) {
    const st = raid.doors[d.id];
    if (st.state !== 'locked') continue;
    if (raid.keys.has(d.id)) out.push(doorTarget(raid, d));
    else if (st.lead && d.key >= 0) out.push(leadTarget(raid, d));
  }
  out.push(...jobTargets(raid));
  for (const o of out) o.key = `${o.kind}:${o.id}`;
  return out.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
}
// With the key in hand the door itself (its cells are open ground then, so no sight
// line is asked for); with only its notice read, the key's block. A lead marks the
// approach to that area, never the drawer the key is in (doc 36).
const doorTarget = (raid, d) => ({ kind: 'door', id: d.id, key: `door:${d.id}`, x: d.x, z: d.z, reach: 1.6, los: false, label: message('Locked door for your key, {ref}', { ref: d.ref }) });
function leadTarget(raid, d) {
  const c = raid.world.containers[d.key];
  return { kind: 'lead', id: d.id, key: `lead:${d.id}`, x: c.x, z: c.z, reach: 9, los: false, label: message('Key lead, {ref}', { ref: raid.world.refAt(c.x, c.z) }) };
}
// Is a followed target still something to go to?
function stillOn(raid, T) {
  switch (T.kind) {
    case 'extract': return raid.poi[T.id].known;
    case 'boss': return !raid.poi[T.id].used && !raid.bossKilled;
    case 'terminal': return !raid.poi[T.id].used;
    case 'container': return !raid.cont[T.id].opened;
    case 'door': return raid.doors[T.id].state === 'locked';
    case 'lead': return raid.doors[T.id].state === 'locked';
    case 'job': case 'jobradio': return jobTargetOn(raid, T);
    default: return true;
  }
}

function routeState(raid) { return raid.route || (raid.route = { target: null, result: null, t: 0, ver: -1, surveyT: 0 }); }

// Follow a target from routeTargets, or none to dismiss the route. The HUD announces
// a choice the player made; the raid's own changes come with their own toast (quiet).
export function setRoute(raid, target, quiet = false) {
  const R = routeState(raid);
  R.target = target || null; R.result = null; R.t = 0; R.ver = -1;
  // Searched at once, so the map shows the line while the raid is paused under it.
  if (R.target) refresh(raid, R);
  raid.emit({ t: 'route', target: R.target, quiet });
  return R.target;
}
function refresh(raid, R) {
  R.ver = raid.doorVer;
  R.result = findRoute(raid, raid.player.x, raid.player.z, R.target);
  // With no known way at all, the next look can wait a little longer.
  R.t = R.result.ok || R.result.blocked ? ROUTE_EVERY : 2;
}
// Next known activity after the current one, nearest first; past the last, none.
export function cycleRoute(raid) {
  const list = routeTargets(raid), cur = routeState(raid).target;
  if (!list.length) { raid.toast('Nothing known to follow yet', '#98adb3'); return null; }
  const i = cur ? list.findIndex((o) => o.key === cur.key) : -1;
  return setRoute(raid, i + 1 < list.length ? list[i + 1] : null);
}

export function updateRoute(raid, dt) {
  const R = routeState(raid), p = raid.player, w = raid.world;
  if ((R.surveyT -= dt) <= 0) {
    R.surveyT = 0.5;
    const seen = raid.surveyed || (raid.surveyed = new Set());
    for (const poi of w.pois) if (Math.abs(poi.x - p.x) < SURVEY && Math.abs(poi.z - p.z) < SURVEY) seen.add(poi.id);
  }
  if (!R.target) return;
  // A target that is used up, opened or unlocked ends the route. Finding the key turns
  // a lead into a route to its door.
  if (!stillOn(raid, R.target)) { setRoute(raid, null, true); raid.toast('Route complete', '#8ff0dc'); return; }
  if (R.target.kind === 'lead' && raid.keys.has(R.target.id)) { setRoute(raid, doorTarget(raid, w.doors[R.target.id]), true); raid.toast('Key in hand: route to its door', '#8ff0dc'); }
  R.t -= dt;
  if (R.t > 0 && R.ver === raid.doorVer) return;
  refresh(raid, R);
}

// The stretch of the route ahead of (x, z): from the nearest point on the line to the
// next turn, at most max metres. next: the point after that turn, if any.
export function routeAhead(result, x, z, max = 24) {
  const P = result && result.path;
  if (!P || P.length < 2) return null;
  let bi = 0, bd = Infinity, bt = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)), px = a.x + dx * t - x, pz = a.z + dz * t - z;
    if (px * px + pz * pz < bd) { bd = px * px + pz * pz; bi = i; bt = t; }
  }
  const a = P[bi], b = P[bi + 1], x0 = a.x + (b.x - a.x) * bt, z0 = a.z + (b.z - a.z) * bt, len = Math.hypot(b.x - x0, b.z - z0);
  return { x0, z0, x1: b.x, z1: b.z, len, max: Math.min(max, len), next: P[bi + 2] || null, last: bi + 1 === P.length - 1 };
}
