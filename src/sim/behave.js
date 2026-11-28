// Hunter behaviour. Every enemy runs a small state machine instead of a straight
// pursuit: approach by role, hold at range, commit with a readable wind-up, then
// recover and give ground. Attack tokens cap how many commit at once, and a shot
// budget caps how many enemy projectiles are in the air.

import { angleDiff, dist } from '../core/math.js';
import { ENEMIES } from './data.js';

export const MELEE_TOKENS = (heat) => Math.min(4, 2 + Math.floor(heat / 3));
export const SHOT_BUDGET = 5;      // enemy projectiles and pending shells in play
const CHARGING_MOTES = 2;

// Lurkers (doc 64, Package 3; doc 37): the disguised elite the director rolls. While it still
// looks human each one works the street in one way, announced by a visible gesture:
// - aura: planted, a faint ring of disturbance round it; the operator's legs drag within 9 m.
// - assimilate: it beckons; people nearby drift to it and one held close for 2.5 s is taken.
// - ambush: it comes up like someone asking for help; within 2.5 m the disguise drops and it strikes 3 m round.
// - thief: a stolen dispatch radio blinks in its hand; it hurries away and is gone past 110 m.
// Distances and times are (start) values.
export const LURKER_KINDS = ['aura', 'assimilate', 'ambush', 'thief'];
export const LURK = { auraR: 9, drawR: 14, holdR: 1.6, take: 2.5, ambushR: 2.5, approach: 18, flee: 25, escape: 110 };

// Returns true when it moved the lurker itself this frame.
export function lurkerTick(raid, e, dt, d) {
  const p = raid.player, near = !p.dead && raid.world.zoneAt(p.x, p.z) !== 0;
  switch (e.lurker) {
    case 'aura':
      e.waitT = Math.max(e.waitT, 0.5);
      if (near && d < LURK.auraR) p.sapT = 0.25;
      return false;
    case 'assimilate':
      e.waitT = Math.max(e.waitT, 0.5);
      for (const c of raid.enemies) {
        if (c.dead || c.state !== 'civ') continue;
        const cd = dist(c.x, c.z, e.x, e.z);
        if (cd > LURK.drawR) continue;
        if (cd > LURK.holdR) { c.tx = e.x; c.tz = e.z; c.waitT = 0; c.stuckT = 0; c.drawT = 0; continue; }
        c.waitT = 0.3; c.drawT = (c.drawT || 0) + dt;
        if (c.drawT >= LURK.take) assimilate(raid, e, c);
      }
      return false;
    case 'ambush':
      if (!near || d > LURK.approach) return false;
      if (d < LURK.ambushR) {
        raid.reveal(e, true);
        e.face = Math.atan2(p.z - e.z, p.x - e.x);
        raid.enemyBlast(e.x, e.z, 3, raid.warn(0.6), e.dmg * 1.6, [1, 0.2, 0.5], { shake: 0.4, cancel: () => e.dead });
        return true;
      }
      raid.moveEnemy(e, (p.x - e.x) / d, (p.z - e.z) / d, 1.6, dt);
      return true;
    case 'thief':
      if (d > LURK.escape) { e.dead = true; raid.toast('The radio thief got away', '#ff8a80', 'warning'); return true; }
      if (!near || d > LURK.flee || d < 0.1) return false;
      raid.moveEnemy(e, (e.x - p.x) / d, (e.z - p.z) / d, 2.6, dt);
      return true;
    default: return false;
  }
}
// The taken civilian rises as a hostile Husk of this zone and hour.
function assimilate(raid, lurker, c) {
  const base = ENEMIES.walker, { hpMul, dmgMul } = raid.scaleAt('walker', c.x, c.z);
  Object.assign(c, { isMimic: true, state: 'revealing', revealT: 0.6, wasDisguised: true, aware: 1, maxHp: base.hp * hpMul, hp: base.hp * hpMul, dmg: base.dmg * dmgMul, xp: base.xp, credits: base.credits, drawT: 0 });
  lurker.taken = (lurker.taken || 0) + 1;
  raid.emit({ t: 'beam', x: lurker.x, z: lurker.z, x2: c.x, z2: c.z, col: [0.7, 0.3, 1], life: 0.4, w: 0.08, k: 3 });
  raid.emit({ t: 'reveal', x: c.x, z: c.z });
  raid.sfx('reveal', c.x, c.z);
}

// ---- the Shrike, a flying Mimic (doc 33, doc 64 Package 9) ----
// It roosts (under the viaduct deck, head down, or crouched on a lamp arm or gantry) until it
// senses the operator, then takes off and circles 5 to 8 m up. To strike it takes a dive token,
// locks the spot the operator stands on and flares over it with a wingbeat while its shadow
// grows there (the warning, stretched by the warning setting); then it stoops onto that spot in
// a fixed 0.35 s and lies grounded for its recovery, in reach and taking +30% damage, before it
// takes off again. Fire reaches it in the air only at its height (Raid.bodySpan).
// Distances in metres, times in seconds, all start values.
export const FLY = {
  sense: 22,          // a roost wakes to the operator this close, in sight (or to a hit, or a loud noise)
  alt: 5, altSpan: 3, // circling height over the ground: 5 to 8 m
  radius: 8.5,        // circling radius round the operator, give or take 1.5
  climb: 3.4,         // m/s up or down
  near: 3,            // no dive is committed from nearer than this (nor beyond ENEMIES.shrike.range)
  tokens: 2,          // at most two Shrikes diving at once
  hover: 1.4,         // it flares this far back from the spot it will land on, its shadow over it
  dive: 0.35,         // the stoop itself: never stretched
  reach: 1.7,         // what the landing strikes round the spot
  vuln: 0.3,          // extra damage taken while grounded
  takeoff: 4.2,       // back to circling once this high over the ground
};

// Height of the ground a Shrike flies over, and of what rises 3 m ahead of it (so it climbs before
// a terrace, not into it); never under the operator's own floor, so it does not circle below a
// terrace edge the operator stands on.
const skyFloor = (raid, e) => { const w = raid.world; return Math.max(w.floorAt(e.x, e.z), w.floorAt(e.x + Math.cos(e.face) * 3, e.z + Math.sin(e.face) * 3), raid.bodyY(raid.player)); };

export function flierTick(raid, e, dt, dx, dz, d) {
  const p = raid.player, w = raid.world, base = ENEMIES[e.kind];
  e.flap = (e.flap || 0) + dt;
  // Sight runs from its body to the operator's chest, through the air.
  e.losT -= dt;
  if (e.losT <= 0) { e.losT = 0.2; e.los = d < 60 && w.hasLos(e.x, e.z, p.x, p.z, e.ay + 0.6, raid.bodyY(p) + 1.3); }
  const faceTo = (x, z, k = 8) => { e.face += angleDiff(e.face, Math.atan2(z - e.z, x - e.x)) * Math.min(1, dt * k); };
  const toAlt = (want, rate = FLY.climb) => { e.ay += Math.max(-rate * dt, Math.min(rate * dt, want - e.ay)); };
  switch (e.mode) {
    case 'perch': {
      // Still as a fixture until something gives it away.
      if (p.dead || !(e.woken || e.hp < e.maxHp || (d < FLY.sense && e.los))) return;
      e.mode = 'takeoff'; e.perch = null; e.atkCd = Math.max(e.atkCd, 1.2);
      raid.sfx('flap', e.x, e.z);
      raid.shrikeSeen();
      return;
    }
    case 'dive': {
      // The stoop: a straight line onto the locked spot, then the strike.
      const D = e.dive;
      D.t += dt;
      const s = Math.min(1, D.t / FLY.dive);
      e.x = D.x0 + (D.x - D.x0) * s; e.z = D.z0 + (D.z - D.z0) * s;
      w.place(e);
      e.ay = Math.max(e.fy, D.y0 + (D.y - D.y0) * s * s);
      e.face = Math.atan2(D.z - D.z0, D.x - D.x0); e.moving = true;
      if (s >= 1) land(raid, e);
      return;
    }
    case 'grounded': {
      // Sprawled where it landed, wings flat on the paving: the opening.
      e.modeT -= dt;
      if (e.kx || e.kz) { e.x += e.kx * dt; e.z += e.kz * dt; w.resolveCircle(e, e.r * 0.8); const k = Math.max(0, 1 - dt * 9); e.kx *= k; e.kz *= k; }
      e.ay = raid.bodyY(e);
      faceTo(p.x, p.z, 2);
      if (e.modeT <= 0) { e.mode = 'takeoff'; e.vuln = 0; raid.sfx('flap', e.x, e.z); }
      return;
    }
    default: break;
  }
  e.kx = e.kz = 0; // nothing shoves a body in the air off its line
  const fl = skyFloor(raid, e);
  if (e.windupT > 0) {
    // The flare: it beats up over the spot, a little back from it, and its shadow grows there.
    const L = e.dive, ux = e.x - L.x, uz = e.z - L.z, ul = Math.hypot(ux, uz) || 1;
    const hx = L.x + ux / ul * FLY.hover, hz = L.z + uz / ul * FLY.hover, hd = Math.hypot(hx - e.x, hz - e.z);
    if (hd > 0.05) raid.moveFlier(e, (hx - e.x) / hd, (hz - e.z) / hd, Math.min(base.speed * 1.3, hd / Math.max(0.05, e.windupT)), dt);
    toAlt(Math.max(fl, L.y) + FLY.alt + 0.8);
    faceTo(L.x, L.z, 10);
    e.windupT -= dt;
    if (e.windupT <= 0) { e.mode = 'dive'; Object.assign(e.dive, { x0: e.x, z0: e.z, y0: e.ay, t: 0 }); raid.sfx('dive', e.x, e.z); }
    return;
  }
  if (p.dead) { toAlt(fl + FLY.alt + FLY.altSpan); return; }
  // Circling: round the operator in its own direction, rising and falling slowly between 5 and 8 m.
  const R = FLY.radius + 1.5 * Math.sin(e.id * 1.7), want = fl + FLY.alt + FLY.altSpan * (0.5 + 0.5 * Math.sin(raid.time * 0.55 + e.id));
  e.orbitA = e.orbitA ?? Math.atan2(e.z - p.z, e.x - p.x);
  e.orbitA += e.orbit * base.speed * 0.55 / R * dt;
  const tx = p.x + Math.cos(e.orbitA) * R, tz = p.z + Math.sin(e.orbitA) * R, td = Math.hypot(tx - e.x, tz - e.z);
  const climbing = e.mode === 'takeoff';
  if (td > 0.2) raid.moveFlier(e, (tx - e.x) / td, (tz - e.z) / td, base.speed * (climbing ? 0.7 : Math.min(1.25, 0.6 + td / 10)), dt);
  else e.moving = true;
  if (e.blocked > 0.6) { e.orbit *= -1; e.blocked = 0; }   // a wall in the way: round the other side
  toAlt(want);
  faceTo(tx, tz, 6);
  // Up to height again: it circles a while before the next dive (cd from here, not from the landing).
  if (climbing) { if (e.ay - w.floorAt(e.x, e.z) >= FLY.takeoff) { e.mode = 'circle'; e.atkCd = Math.max(e.atkCd, base.cd * raid.rAi.range(0.7, 1.15)); } return; }
  e.mode = 'circle';
  // Commit a dive: a token free, the operator in sight and in range, outside the Shelter.
  const hd = Math.hypot(dx, dz);
  if (e.atkCd > 0 || e.decoyT !== undefined || !e.los || hd < FLY.near || hd > base.range || raid.divers >= FLY.tokens) return;
  if (w.zoneAt(p.x, p.z) === 0 && raid.mode === 'raid') return;
  raid.divers++;
  e.windupT = e.windupMax = raid.warn(base.windup);
  e.dive = { x: p.x, z: p.z, y: raid.bodyY(p) };
  raid.addArea({ kind: 'tele', x: p.x, z: p.z, r: FLY.reach, life: e.windupMax + FLY.dive, col: [1, 0.2, 0.55], src: e, fy: e.dive.y });
  raid.sfx('wingbeat', e.x, e.z);
  raid.shrikeSeen();
}

// The end of a stoop: it strikes round the spot it showed and lies there for its recovery.
function land(raid, e) {
  const p = raid.player, D = e.dive, w = raid.world;
  e.x = D.x; e.z = D.z;
  w.place(e);
  w.resolveCircle(e, e.r * 0.8);
  e.ay = raid.bodyY(e);
  e.mode = 'grounded'; e.modeT = ENEMIES[e.kind].recover * raid.rAi.range(0.9, 1.1); e.vuln = FLY.vuln;
  e.atkCd = ENEMIES[e.kind].cd * raid.rAi.range(0.85, 1.2);
  e.dive = null;
  raid.emit({ t: 'explode', x: D.x, z: D.z, r: FLY.reach, col: [0.85, 0.2, 0.6], shake: 0.25 });
  raid.sfx('slam', D.x, D.z);
  if (!p.dead && dist(p.x, p.z, D.x, D.z) <= FLY.reach + p.r * 0.5 && Math.abs(raid.bodyY(p) - D.y) <= 1.5) {
    if (raid.damagePlayer(e.dmg, D.x, D.z)) raid.leech(e, e.dmg);
  }
}

// Roles give the same archetype different habits.
export function assignRole(raid, e) {
  const r = raid.rAi.float();
  if (e.kind === 'walker') e.role = r < 0.45 ? 'rusher' : r < 0.8 ? 'flanker' : 'stalker';
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
  // Anything that stops a body counts (low cover too, which a sight line passes over), and with
  // height a terrace face or an edge it would not step down: the run is along one level.
  const H = W.hasHeight, lv = H ? raid.bodyY(e) : 0;
  const stops = (x, z) => W.cell(x, z) !== 0 || (H && Math.abs(W.floorAt(x, z) - lv) > 0.5 + 0.5 * Math.floor(Math.hypot(x - e.x, z - e.z)));
  for (const k of [0, -1, 1]) {
    const x = e.x - uz * w * k, z = e.z + ux * w * k;
    for (let s = 0.25; s < len; s += 0.25) if (stops(x + ux * (s + w), z + uz * (s + w))) { len = s; break; }
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
          // Stalker: prowl at range until its patience runs out, then commit.
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
        e.windupT = e.windupMax = raid.warn(base.windup);
        e.atkAngle = Math.atan2(dz, dx);
        tele(raid, e, 2.5 * (e.scale || 1), 0.8, e.atkAngle, e.windupMax);
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
        e.windupT = e.windupMax = raid.warn(base.windup);
        e.atkAngle = Math.atan2(dz, dx);
        tele(raid, e, 0.9, 0, 0, e.windupMax, [1, 0.3, 0.2]);
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
        e.windupT = e.windupMax = raid.warn(base.windup);
        raid.sfx('warn', e.x, e.z);
      }
      break;
    }
    case 'skitter': {
      if (d > 9 || !e.los) { chase(raid, e, e.speed, dt); break; }
      if (e.atkCd <= 0 && d < base.range + 1.5) {
        // Lock a direction and show the leap line before going.
        faceP(20);
        e.windupT = e.windupMax = raid.warn(base.windup);
        e.atkAngle = Math.atan2(dz, dx);
        tele(raid, e, 8.5, 0.11, e.atkAngle, e.windupMax, [1, 0.25, 0.8]);
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
        if (!c.hit && dist(e.x, e.z, p.x, p.z) < (e.lane ? e.lane.hw : e.r + p.r + 0.4) && raid.sameLevel(e, p)) { c.hit = true; raid.damagePlayer(e.dmg * 1.2, e.x, e.z); raid.emit({ t: 'shake', amount: 0.5 }); }
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
        e.windupT = e.windupMax = raid.warn(1.0);
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
        e.windupT = e.windupMax = raid.warn(base.windup);
        e.atkAngle = Math.atan2(dz, dx);
        e.pending = 'slam';
        tele(raid, e, e.kind === 'titan' ? 8 : 4.8 * e.scale, 0.9, e.atkAngle, e.windupMax);
        raid.sfx('charge', e.x, e.z);
      }
      break;
    }
    case 'hollow': {
      // Sprints the last stretch; the fuse slows it so the blast can be outrun.
      chase(raid, e, e.speed * (d < 10 ? 1.3 : 1), dt);
      if (d < base.range && e.atkCd <= 0) {
        e.windupT = e.windupMax = raid.warn(base.windup);
        raid.addArea({ kind: 'tele', x: e.x, z: e.z, r: 3.5, life: e.windupMax, col: [1, 0.5, 0.1], follow: e, src: e });
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
        e.windupT = e.windupMax = raid.warn(base.windup);
        e.aimX = e.x + nx * 24; e.aimZ = e.z + nz * 24;
        raid.sfx('charge', e.x, e.z);
      }
      break;
    }
    case 'lobber': {
      if (d > 21 || !e.los) chase(raid, e, e.speed, dt);
      else if (d < 12) raid.moveEnemy(e, -nx, -nz, e.speed * 0.9, dt, false);
      faceP();
      if (d < base.range && e.atkCd <= 0 && raid.enemyShots < SHOT_BUDGET) { raid.enemyShots++; e.windupT = e.windupMax = raid.warn(base.windup); raid.sfx('warn', e.x, e.z); }
      break;
    }
    default: break;
  }
}
