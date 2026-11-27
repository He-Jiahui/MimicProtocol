// Hunter behaviour. Every enemy runs a small state machine instead of a straight
// pursuit: approach by role, hold at range, commit with a readable wind-up, then
// recover and give ground. Attack tokens cap how many commit at once, and a shot
// budget caps how many enemy projectiles are in the air.

import { angleDiff, dist } from '../core/math.js';
import { ENEMIES } from './data.js';

export const MELEE_TOKENS = (heat) => Math.min(4, 2 + Math.floor(heat / 3));
export const SHOT_BUDGET = 5;      // enemy projectiles and pending shells in play
const CHARGING_MOTES = 2;

// Roles give the same archetype different habits.
export function assignRole(raid, e) {
  const r = raid.rAi.float();
  if (e.kind === 'walker') e.role = r < 0.45 ? 'rusher' : r < 0.8 ? 'flanker' : 'lurker';
  else if (e.kind === 'mite') e.role = r < 0.5 ? 'weaver' : 'rusher';
  else e.role = 'default';
  e.mode = 'approach'; e.modeT = 0; e.orbit = raid.rAi.chance(0.5) ? 1 : -1;
  e.patience = raid.rAi.range(1.2, 3.6); e.chargeCd = raid.rAi.range(3, 7); e.weave = raid.rAi.range(0, 6.28);
  // Nothing attacks the instant it arrives.
  e.atkCd = raid.rAi.range(0.9, 1.8);
}

function steer(raid, e, tx, tz, speed, dt, face = true) {
  const dx = tx - e.x, dz = tz - e.z, l = Math.hypot(dx, dz);
  if (l < 0.05) return;
  raid.moveEnemy(e, dx / l, dz / l, speed, dt, face);
}
function chase(raid, e, speed, dt) { raid.chaseDir(e); raid.moveEnemy(e, raid.dirX, raid.dirZ, speed, dt); }

// Brute charge lane (doc 64, Package 3): a rectangle along the locked direction, half-width
// body + operator + 0.4 m (the same reach the charge hits with), as long as the 1.25 s run at
// 13 m/s (16.25 m) or up to the first wall.
export const CHARGE_SPEED = 13, CHARGE_TIME = 1.25, CHARGE_LEN = CHARGE_SPEED * CHARGE_TIME;
export function chargeLane(raid, e, angle) {
  const ux = Math.cos(angle), uz = Math.sin(angle), w = e.r * 0.8, W = raid.world; // the body that meets the wall
  let len = CHARGE_LEN;
  // Anything that stops a body counts (low cover too, which a sight line passes over).
  for (const k of [0, -1, 1]) {
    const x = e.x - uz * w * k, z = e.z + ux * w * k;
    for (let s = 0.25; s < len; s += 0.25) if (W.cell(x + ux * (s + w), z + uz * (s + w)) !== 0) { len = s; break; }
  }
  return { x: e.x, z: e.z, angle, ux, uz, len, hw: e.r + raid.player.r + 0.4 };
}
export function inLane(L, x, z) {
  const along = (x - L.x) * L.ux + (z - L.z) * L.uz, side = Math.abs((x - L.x) * L.uz - (z - L.z) * L.ux);
  return along >= 0 && along <= L.len && side <= L.hw;
}
function tele(raid, e, r, half, angle, life, col = [1, 0.16, 0.1]) {
  raid.addArea({ kind: 'tele', x: e.x, z: e.z, r, life, col, half, angle, follow: half ? null : e, src: e });
  raid.sfx('warn', e.x, e.z);
}

export function hunterBrain(raid, e, dt, dx, dz, d, nx, nz) {
  const p = raid.player, base = ENEMIES[e.kind], heat = raid.threat.heat;
  const faceP = (k = 9) => { e.face += angleDiff(e.face, Math.atan2(dz, dx)) * Math.min(1, dt * k); };
  const px = -nz * e.orbit, pz = nx * e.orbit; // sideways, in this enemy's orbit direction
  e.modeT -= dt;

  // Recovery after any attack: back away or stand winded. This is the opening to punish.
  if (e.mode === 'recover') {
    if (e.kind === 'brute' || e.kind === 'titan' || e.kind === 'lobber') faceP(2);
    else if (d < 7) raid.moveEnemy(e, -nx * 0.8 + px * 0.5, -nz * 0.8 + pz * 0.5, e.speed * 0.6, dt, false);
    if (e.modeT <= 0) { e.mode = 'approach'; e.winded = false; e.patience = raid.rAi.range(0.8, 2.6); if (raid.rAi.chance(0.4)) e.orbit *= -1; }
    return;
  }

  switch (e.kind) {
    case 'walker': {
      const range = base.range * (e.scale || 1);
      if (d > range) {
        if (!e.los || e.role === 'rusher' || e.mode === 'commit') chase(raid, e, e.speed, dt);
        else if (e.role === 'flanker') {
          // Come in from the side: aim past the operator, then cut in.
          if (d > 5) steer(raid, e, p.x + px * 5, p.z + pz * 5, e.speed, dt); else chase(raid, e, e.speed * 1.1, dt);
        } else if (d > 8) chase(raid, e, e.speed, dt);
        else {
          // Lurker: prowl at range until its patience runs out, then commit.
          e.patience -= dt;
          raid.moveEnemy(e, px * 0.9 + (d < 6.5 ? -nx * 0.5 : 0), pz * 0.9 + (d < 6.5 ? -nz * 0.5 : 0), e.speed * 0.5, dt, false);
          faceP(5);
          if (e.patience <= 0 && raid.attackers < MELEE_TOKENS(heat)) e.mode = 'commit';
        }
        break;
      }
      faceP();
      if (e.atkCd <= 0 && raid.attackers < MELEE_TOKENS(heat)) {
        raid.attackers++;
        e.windupT = e.windupMax = base.windup;
        e.atkAngle = Math.atan2(dz, dx);
        tele(raid, e, 2.5 * (e.scale || 1), 0.8, e.atkAngle, base.windup);
      } else if (e.atkCd > 0 || raid.attackers >= MELEE_TOKENS(heat)) {
        // No opening: circle instead of standing in a queue.
        raid.moveEnemy(e, px, pz, e.speed * 0.4, dt, false);
      }
      break;
    }
    case 'mite': {
      if (d > base.range) {
        // Weavers zigzag in; rushers come straight.
        e.weave += dt * 6;
        if (e.role === 'weaver' && e.los && d < 14) raid.moveEnemy(e, nx + px * Math.sin(e.weave) * 0.9, nz + pz * Math.sin(e.weave) * 0.9, e.speed, dt);
        else chase(raid, e, e.speed, dt);
        break;
      }
      faceP();
      if (e.atkCd <= 0 && raid.pouncers < 3) {
        // Crouch, then pounce along a locked line.
        raid.pouncers++;
        e.windupT = e.windupMax = base.windup;
        e.atkAngle = Math.atan2(dz, dx);
        tele(raid, e, 0.9, 0, 0, base.windup, [1, 0.3, 0.2]);
      } else raid.moveEnemy(e, px, pz, e.speed * 0.6, dt, false);
      break;
    }
    case 'spitter': {
      // Find a firing spot with a clear line, shoot once, then move somewhere new.
      if (d < 6) { raid.moveEnemy(e, -nx, -nz, e.speed, dt, false); faceP(); e.mode = 'approach'; break; }
      if (!e.los || d > 15) { chase(raid, e, e.speed, dt); break; }
      if (e.mode === 'relocate' && e.modeT > 0) { raid.moveEnemy(e, px + (d < 10 ? -nx * 0.4 : nx * 0.2), pz + (d < 10 ? -nz * 0.4 : nz * 0.2), e.speed * 0.9, dt, false); faceP(4); break; }
      faceP();
      if (e.atkCd <= 0 && raid.enemyShots < SHOT_BUDGET) {
        raid.enemyShots++;
        e.windupT = e.windupMax = base.windup;
        raid.sfx('warn', e.x, e.z);
      }
      break;
    }
    case 'skitter': {
      if (d > 9 || !e.los) { chase(raid, e, e.speed, dt); break; }
      if (e.atkCd <= 0 && d < base.range + 1.5) {
        // Lock a direction and show the leap line before going.
        faceP(20);
        e.windupT = e.windupMax = base.windup;
        e.atkAngle = Math.atan2(dz, dx);
        tele(raid, e, 8.5, 0.11, e.atkAngle, base.windup, [1, 0.25, 0.8]);
      } else {
        // Circle at leaping distance.
        const want = 6.5, radial = d > want + 0.8 ? 0.6 : d < want - 0.8 ? -0.6 : 0;
        raid.moveEnemy(e, px + nx * radial, pz + nz * radial, e.speed * 0.75, dt);
      }
      break;
    }
    case 'brute': case 'titan': {
      const range = base.range * (e.scale || 1);
      if (e.mode === 'charge') {
        // A straight-line charge: it does not turn, so step aside.
        const c = e.charge;
        e.x += c.vx * dt; e.z += c.vz * dt;
        const bx = e.x, bz = e.z;
        raid.world.resolveCircle(e, e.r * 0.8);
        e.moving = true; e.animT += dt * 26;
        const blocked = Math.hypot(e.x - bx, e.z - bz) > 0.02;
        // Contact reach equals the lane's half-width, so the lane on the floor is the truth.
        if (!c.hit && dist(e.x, e.z, p.x, p.z) < (e.lane ? e.lane.hw : e.r + p.r + 0.4)) { c.hit = true; raid.damagePlayer(e.dmg * 1.2, e.x, e.z); raid.emit({ t: 'shake', amount: 0.5 }); }
        if (e.modeT <= 0 || blocked) {
          // Overextended: blown for 2.0 s after a wall, 1.3 s at the end of an open lane.
          e.mode = 'recover'; e.modeT = blocked ? 2.0 : 1.3; e.winded = true; e.chargeCd = raid.rAi.range(7, 11);
          if (blocked) { raid.emit({ t: 'explode', x: e.x, z: e.z, r: 2.5, col: [1, 0.5, 0.2], shake: 0.4 }); raid.sfx('slam', e.x, e.z); }
        }
        break;
      }
      e.chargeCd -= dt;
      if (e.kind === 'brute' && e.los && d > 8 && d < 20 && e.chargeCd <= 0) {
        // Roar, lock the lane on the floor, then go.
        e.windupT = e.windupMax = 1.0;
        e.atkAngle = Math.atan2(dz, dx);
        e.pending = 'charge';
        e.lane = chargeLane(raid, e, e.atkAngle);
        raid.addArea({ kind: 'tele', x: e.x, z: e.z, r: e.lane.len, life: e.windupMax, col: [1, 0.45, 0.1], angle: e.atkAngle, lane: e.lane, src: e });
        raid.sfx('warn', e.x, e.z);
        raid.sfx('charge', e.x, e.z);
        break;
      }
      if (d > range - 0.2) { chase(raid, e, e.speed, dt); break; }
      faceP(5);
      if (e.atkCd <= 0) {
        e.windupT = e.windupMax = base.windup;
        e.atkAngle = Math.atan2(dz, dx);
        e.pending = 'slam';
        tele(raid, e, e.kind === 'titan' ? 8 : 4.8 * e.scale, 0.9, e.atkAngle, base.windup);
        raid.sfx('charge', e.x, e.z);
      }
      break;
    }
    case 'hollow': {
      // Sprints the last stretch; the fuse slows it so the blast can be outrun.
      chase(raid, e, e.speed * (d < 10 ? 1.3 : 1), dt);
      if (d < base.range && e.atkCd <= 0) {
        e.windupT = e.windupMax = base.windup;
        raid.addArea({ kind: 'tele', x: e.x, z: e.z, r: 3.5, life: base.windup, col: [1, 0.5, 0.1], follow: e, src: e });
        raid.sfx('fuse', e.x, e.z);
      }
      break;
    }
    case 'mote': {
      if (d > 15) chase(raid, e, e.speed, dt);
      else if (d < 9) raid.moveEnemy(e, -nx, -nz, e.speed * 0.8, dt, false);
      else raid.moveEnemy(e, px, pz, e.speed * 0.5, dt, false);
      faceP();
      if (e.los && d < base.range && e.atkCd <= 0 && raid.chargingMotes < CHARGING_MOTES) {
        raid.chargingMotes++;
        e.windupT = e.windupMax = base.windup;
        e.aimX = e.x + nx * 24; e.aimZ = e.z + nz * 24;
        raid.sfx('charge', e.x, e.z);
      }
      break;
    }
    case 'lobber': {
      if (d > 21 || !e.los) chase(raid, e, e.speed, dt);
      else if (d < 12) raid.moveEnemy(e, -nx, -nz, e.speed * 0.9, dt, false);
      faceP();
      if (d < base.range && e.atkCd <= 0 && raid.enemyShots < SHOT_BUDGET) { raid.enemyShots++; e.windupT = e.windupMax = base.windup; raid.sfx('warn', e.x, e.z); }
      break;
    }
    default: break;
  }
}
