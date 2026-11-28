// A simple scripted operator used by the headless tests and balance runs.
import { dist } from '../src/core/math.js';
import { worth } from '../src/sim/loot.js';

// A full pack: drop the cheapest pieces while the best piece in reach is worth more than
// they are together, then take it through the bag screen, as a player would (doc 61).
function makeRoom(raid, dumped) {
  const near = raid.nearby().filter((n) => n.item.kind !== 'pack' && !dumped.has(n.item.uid)).sort((a, b) => worth(b.item) - worth(a.item))[0];
  if (!near) return;
  let spent = 0;
  while (!raid.bagTake(near.ref, near.item.uid)) {
    const cheap = raid.cheapestCargo();
    if (!cheap || spent + worth(cheap) >= worth(near.item)) return;
    spent += worth(cheap);
    dumped.add(cheap.uid);
    raid.bagDrop(cheap.uid);
  }
}

// A point a few metres further along a route's path than the nearest point to (x, z).
function alongRoute(path, x, z, lead) {
  let bi = 0, bt = 0, bd = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)), d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2;
    if (d < bd) { bd = d; bi = i; bt = t; }
  }
  for (let i = bi; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z), from = i === bi ? bt * l : 0;
    if (from + lead <= l) { const t = (from + lead) / (l || 1); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
    lead -= l - from;
  }
  return path[path.length - 1];
}

export function makeBot({ goal = null, scanEvery = 12, aggressive = true } = {}) {
  const input = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
  let scanT = 2, stuckT = 0, lastX = 0, lastZ = 0, side = 1, wp = 0, cellT = 0, held = false;
  const dumped = new Set();
  return function bot(raid, dt) {
    const p = raid.player;
    // A Shrike in the air (doc 64 Package 9): the guns aim at its height on their own (the aim
    // point on its shadow), sentries and drones reach it, and a Blade waits for it to land:
    // it keeps moving through the dive warning and cuts it while it lies grounded.
    const blade = p.classId === 'blade', reach = (e) => !raid.aloft(e, 2.2);
    const tgt = (blade && (raid.nearestTarget(p.x, p.z, 30, reach, true) || raid.nearestTarget(p.x, p.z, 12, reach)))
      || raid.nearestTarget(p.x, p.z, 30, null, true) || raid.nearestTarget(p.x, p.z, 12);
    const aloft = !!tgt && raid.aloft(tgt);
    input.m1 = input.m2 = input.dodge = input.ult = input.scan = input.interact = input.quick1 = false;
    // A goal may be a list of waypoints (the city is not a grid: follow an avenue).
    if (Array.isArray(goal)) { while (wp < goal.length - 1 && dist(p.x, p.z, goal[wp].x, goal[wp].z) < 4) wp++; }
    const g = Array.isArray(goal) ? goal[wp] : goal;
    let gx = g ? g.x : p.x, gz = g ? g.z : p.z - 50;
    // With a route set on the raid (G in the game), walk the route instead of a straight line.
    const R = raid.route && raid.route.target && raid.route.result;
    // Lead only as far as the ground allows in a straight line, so a corner at the top of a
    // ramp is walked round instead of cut into the ledge.
    const lead = (path) => {
      const w = raid.world;
      for (const l of [3.5, 2, 1, 0.5]) { const a = alongRoute(path, p.x, p.z, l); if (l === 0.5 || !w.hasHeight || w.walkLine(p.x, p.z, a.x, a.z)) return a; }
    };
    if (R && R.path && R.path.length > 1) { const a = lead(R.path); gx = a.x; gz = a.z; }
    if (tgt && aggressive) {
      input.aimX = tgt.x; input.aimZ = tgt.z;
      input.m1 = true; input.m2 = true;
      // Class resources (doc 64): a Summoner only posts carried sentries (it never packs or
      // recalls), and a Rifleman taps M2 again while it cools to spend a loaded cell.
      // A sentry is set down a few steps toward the pack, so its lane faces what is coming:
      // aimed at the target itself it lands beyond it, looking the wrong way.
      if (p.classId === 'summoner') {
        input.m2 = p.carried > 0 && p.cd.m2 <= 0;
        if (input.m2) { const l = dist(p.x, p.z, tgt.x, tgt.z) || 1; input.aimX = p.x + (tgt.x - p.x) / l * 3; input.aimZ = p.z + (tgt.z - p.z) / l * 3; input.m1 = false; }
      }
      // As a player would: the line goes to a body already Suppressed, so its burst pays;
      // the Whirl waits for momentum unless the operator is being swarmed.
      else if (p.classId === 'rifleman' && p.cd.m2 <= 0) input.m2 = tgt.st.supp > 0;
      else if (blade) { let close = 0; raid.forRadius(p.x, p.z, 4, (e) => { if (raid.isTarget(e)) close++; }); input.m2 = p.momentum >= 30 || close >= 4; }
      else if (p.classId === 'rifleman' && p.cd.m2 > 0) { input.m2 = p.cells > 0 && cellT <= 0 && !held; if (input.m2) cellT = 0.8; }
      const d = dist(p.x, p.z, tgt.x, tgt.z);
      const melee = blade && !aloft;
      const want = melee ? 2 : 11;
      const dx = (tgt.x - p.x) / (d || 1), dz = (tgt.z - p.z) / (d || 1);
      if (aloft) { input.mx = -dz * side; input.mz = dx * side; } // under a flier: keep moving, never stand still for its dive
      else if (d > want + 2) { input.mx = dx; input.mz = dz; }
      else if (d < want - 2 && !melee) { input.mx = -dx + -dz * side * 0.6; input.mz = -dz + dx * side * 0.6; }
      else { input.mx = -dz * side; input.mz = dx * side; }
      if (blade && aloft) input.m1 = input.m2 = false;
      // A plate fragment on the floor is worth a step: walk onto the nearest one.
      if (blade && raid.fragments.length) {
        let f = null, fd = 7;
        for (const k of raid.fragments) { const kd = dist(k.x, k.z, p.x, p.z); if (kd < fd) { fd = kd; f = k; } }
        if (f) { input.mx = (f.x - p.x) / (fd || 1); input.mz = (f.z - p.z) / (fd || 1); }
      }
      if (raid.hostileCount() >= 3 || (aloft && !blade)) input.ult = true;
      // Dodge when standing in a telegraph or when something is winding up nearby.
      for (const a of raid.areas) if (a.kind === 'tele' && dist(a.x, a.z, p.x, p.z) < a.r + 0.5 && a.life - a.t < 0.35) input.dodge = true;
    } else {
      const d = dist(p.x, p.z, gx, gz) || 1;
      input.mx = (gx - p.x) / d; input.mz = (gz - p.z) / d;
      input.aimX = p.x + input.mx * 10; input.aimZ = p.z + input.mz * 10;
      const pr = raid.prompt;
      if (pr && pr.type === 'take' && !pr.ok && pr.want > 0) makeRoom(raid, dumped);
      // Hold E only when it can succeed, and never to pick up what was just thrown out.
      // Let go of E once after an interaction: a take needs a fresh press.
      input.interact = !!pr && pr.ok && !raid.interactHold && !(pr.uids && pr.uids.every((u) => dumped.has(u)));
    }
    // Leaving: with an exit as the route target the bot keeps shooting but walks the route
    // and holds E in the ring, instead of standing to fight every wave to the death.
    if (R && R.path && raid.route.target.kind === 'extract' && tgt) {
      const a2 = lead(R.path), d2 = dist(p.x, p.z, a2.x, a2.z) || 1;
      input.mx = (a2.x - p.x) / d2; input.mz = (a2.z - p.z) / d2;
      const pr = raid.prompt;
      input.interact = !!pr && pr.ok && pr.type === 'extract';
      // Stand well inside the ring, not on its edge where one lunge or shove ends the hold.
      const T = raid.route.target, dT = dist(p.x, p.z, T.x, T.z);
      if (input.interact) { if (dT > 1.5) { input.mx = (T.x - p.x) / dT; input.mz = (T.z - p.z) / dT; } else { input.mx = 0; input.mz = 0; } }
    }
    if (p.hp < p.maxHp * 0.45) input.quick1 = true;
    held = input.m2; cellT -= dt;
    scanT -= dt;
    if (scanT <= 0 && scanEvery > 0) { scanT = scanEvery; input.scan = true; }
    // Unstick: sidestep when not making progress.
    stuckT += dt;
    if (stuckT > 1) {
      if (dist(p.x, p.z, lastX, lastZ) < 0.8) side = -side;
      lastX = p.x; lastZ = p.z; stuckT = 0;
    }
    if (!tgt && side < 0) { const t = input.mx; input.mx = -input.mz; input.mz = t; }
    return input;
  };
}
