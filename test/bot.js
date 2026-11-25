// A simple scripted operator used by the headless tests and balance runs.
import { dist } from '../src/core/math.js';

export function makeBot({ goal = null, scanEvery = 12, aggressive = true } = {}) {
  const input = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
  let scanT = 2, stuckT = 0, lastX = 0, lastZ = 0, side = 1, wp = 0;
  return function bot(raid, dt) {
    const p = raid.player;
    const tgt = raid.nearestTarget(p.x, p.z, 30, null, true) || raid.nearestTarget(p.x, p.z, 12);
    input.m1 = input.m2 = input.dodge = input.ult = input.scan = input.interact = input.quick1 = false;
    // A goal may be a list of waypoints (the city is not a grid: follow an avenue).
    if (Array.isArray(goal)) { while (wp < goal.length - 1 && dist(p.x, p.z, goal[wp].x, goal[wp].z) < 4) wp++; }
    const g = Array.isArray(goal) ? goal[wp] : goal;
    let gx = g ? g.x : p.x, gz = g ? g.z : p.z - 50;
    if (tgt && aggressive) {
      input.aimX = tgt.x; input.aimZ = tgt.z;
      input.m1 = true; input.m2 = true;
      const d = dist(p.x, p.z, tgt.x, tgt.z);
      const melee = p.classId === 'blade';
      const want = melee ? 2 : 11;
      const dx = (tgt.x - p.x) / (d || 1), dz = (tgt.z - p.z) / (d || 1);
      if (d > want + 2) { input.mx = dx; input.mz = dz; }
      else if (d < want - 2 && !melee) { input.mx = -dx + -dz * side * 0.6; input.mz = -dz + dx * side * 0.6; }
      else { input.mx = -dz * side; input.mz = dx * side; }
      if (raid.hostileCount() >= 3) input.ult = true;
      // Dodge when standing in a telegraph or when something is winding up nearby.
      for (const a of raid.areas) if (a.kind === 'tele' && dist(a.x, a.z, p.x, p.z) < a.r + 0.5 && a.life - a.t < 0.35) input.dodge = true;
    } else {
      const d = dist(p.x, p.z, gx, gz) || 1;
      input.mx = (gx - p.x) / d; input.mz = (gz - p.z) / d;
      input.aimX = p.x + input.mx * 10; input.aimZ = p.z + input.mz * 10;
      input.interact = !!raid.prompt;
    }
    if (p.hp < p.maxHp * 0.45) input.quick1 = true;
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
