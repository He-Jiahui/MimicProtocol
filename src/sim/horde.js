// Horde director and the pressure it applies (sustained, rising, never idle).
// The longer the operator stays outside the Shelter the more arrives: a steady
// trickle from every side, a Surge every minute, a hunting elite pack, and a
// Titan every five minutes. Also home to the horde monsters and auto-firing items.

import { dist, angleDiff, clamp } from '../core/math.js';
import { ZONES, ENEMIES, AUTO_CAP, MIMIC_SHARE, ITEMS, ITEM_IDS, stackStat } from './data.js';
import { SHOT_BUDGET, LURKER_KINDS } from './behave.js';
import { rollRunItem } from './loot.js';

const ZONE_RATE = [0, 1.0, 1.2, 1.45, 1.75];
// [kind, weight, minutes of pressure before it appears, minimum zone]
const ROSTER = [
  ['mite', 46, 0, 1], ['walker', 30, 0, 1], ['spitter', 8, 1.0, 1], ['skitter', 9, 1.5, 1], ['mote', 7, 2.0, 1],
  ['lobber', 5, 3.0, 1], ['hollow', 6, 3.5, 1], ['brute', 3, 4.0, 1],
];

function pickKind(raid, heat, zone) {
  const w = ROSTER.map(([, wt, at, z]) => (heat + (zone - 1) * 1.2 >= at && zone >= z ? wt : 0));
  return ROSTER[raid.rSpawn.weighted(w)][0];
}

// A walkable point on a ring around the operator, outside the Shelter.
function ringSpot(raid, angle, rmin, rmax) {
  const p = raid.player, w = raid.world, S = w.size;
  for (let i = 0; i < 10; i++) {
    const a = angle + (i ? raid.rSpawn.range(-0.5, 0.5) * (1 + i * 0.25) : 0), d = raid.rSpawn.range(rmin, rmax);
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (x < 5 || z < 5 || x > S - 5 || z > S - 5) continue;
    if (!w.reach[Math.floor(z) * S + Math.floor(x)] || !w.circleFree(x, z, 0.6) || w.zoneAt(x, z) === 0) continue;
    return { x, z };
  }
  return null;
}

function spawnGroup(raid, kinds, angle, rmin, rmax, o = {}) {
  let n = 0;
  for (const k of kinds) {
    const s = ringSpot(raid, angle + raid.rSpawn.range(-0.25, 0.25), rmin, rmax);
    if (!s) continue;
    const share = raid.eliteShare(raid.world.zoneAt(s.x, s.z)) * 0.35;
    const elite = o.elite && n === 0 ? o.elite : (!o.noElite && ['walker', 'spitter', 'skitter', 'brute'].includes(k) && raid.rSpawn.chance(share) ? raid.rollAffixes() : null);
    const e = raid.spawnEnemy(k, s.x, s.z, { state: 'revealing', elite });
    // They claw up out of the street: a short rise, then the hunt.
    e.revealT = 0.6 + raid.rSpawn.float() * 0.3;
    if (o.wanted && n === 0) e.wanted = true;
    raid.emit({ t: 'spawnfx', x: s.x, z: s.z });
    n++;
  }
  return n;
}

export const FIRST_WAVE = 8, WAVE_GAP = 14, SURGE_MAX = 12;

export function updateHorde(raid, dt) {
  const p = raid.player, w = raid.world, zone = raid.zone, bossOn = raid.boss && raid.boss.active;
  if (zone > 0) raid.pressT += dt;
  const heat = raid.pressT / 60; // minutes under pressure
  raid.dirT -= dt;
  let ambient = 0, hostile = 0;
  if (raid.dirT <= 0) {
    for (const e of raid.enemies) {
      if (e.dead) continue;
      if (e.state === 'civ' || e.state === 'disguised' || e.state === 'suspicious' || e.state === 'flee') ambient++;
      else if (e.state === 'hunt' || e.state === 'revealing') hostile++;
    }
    raid.aliveHostile = hostile; raid.aliveAmbient = ambient;
  } else { hostile = raid.aliveHostile; ambient = raid.aliveAmbient; }

  // Waves, not a trickle: the first arrives eight seconds after leaving the Shelter,
  // later ones at least fourteen seconds apart. Holding E on an interaction pauses them,
  // and nothing more is sent while 32 hostiles are already active.
  const scale = ZONE_RATE[zone] * (1 + 0.5 * raid.nl) * (1 + 0.15 * (raid.tier - 1));
  const active = zone > 0 && !bossOn, paused = raid.holding;
  if (zone === 0) raid.waveT = Math.max(raid.waveT, FIRST_WAVE);
  else if (active && !paused) raid.waveT -= dt;
  raid.threat = { heat, alive: hostile, target: AUTO_CAP, nextWave: Math.max(0, raid.waveT), surgeIn: Math.max(0, raid.surgeT - raid.pressT), zone, paused, wave: raid.waveN };

  if (active && !paused) {
    if (raid.waveT <= 0) {
      raid.waveT = Math.max(WAVE_GAP, 18 - heat * 0.8);
      const room = AUTO_CAP - hostile;
      if (room > 0) {
        raid.waveN++;
        const size = Math.min(room, 14, Math.round((4 + 1.5 * heat) * Math.sqrt(scale)));
        // One or two approach directions, favouring the direction of travel.
        const ahead = Math.atan2(p.lastMz || 0, p.lastMx || 0);
        const a0 = p.moving && raid.rSpawn.chance(0.45) ? ahead + raid.rSpawn.range(-0.8, 0.8) : raid.rSpawn.range(0, 6.283);
        const split = size >= 6 && raid.rSpawn.chance(0.5) ? Math.floor(size / 2) : 0;
        const kinds = [];
        for (let i = 0; i < size; i++) kinds.push(pickKind(raid, heat, zone));
        let made = spawnGroup(raid, kinds.slice(split), a0, 24, 31);
        if (split) made += spawnGroup(raid, kinds.slice(0, split), a0 + raid.rSpawn.range(1.8, 4.4), 24, 31);
        raid.aliveHostile += made;
        raid.emit({ t: 'wave', n: raid.waveN, size: made, angle: a0 });
        raid.sfx('wave');
      }
    }
    // Surge: every minute a ring closes in, up to twelve strong.
    if (raid.pressT >= raid.surgeT) {
      raid.surgeT += 60;
      const count = Math.min(SURGE_MAX, Math.max(0, AUTO_CAP - raid.aliveHostile), Math.round(6 + 1.5 * heat));
      if (count > 0) {
        raid.banner('SURGE', 'They are coming from every side.', '#ff4d9a');
        raid.sfx('boss');
        for (let i = 0; i < count; i++) raid.aliveHostile += spawnGroup(raid, [heat > 3 && i % 4 === 0 ? 'walker' : 'mite'], (i / count) * 6.283, 21, 25, { noElite: true });
      }
    }
    // A hunting pack led by a two-affix elite.
    if (raid.pressT >= raid.eliteT) {
      raid.eliteT += 150;
      if (raid.aliveHostile < AUTO_CAP) {
        raid.banner('ALPHA HUNT', 'A marked elite has your scent.', '#ffd76a');
        raid.sfx('banner');
        raid.aliveHostile += spawnGroup(raid, [heat > 5 ? 'brute' : 'walker', 'skitter', 'walker'], raid.rSpawn.range(0, 6.283), 26, 30, { elite: raid.rollAffixes(true), wanted: true });
      }
    }
    // Titan: a walking wall every five minutes.
    if (raid.pressT >= raid.titanT) {
      raid.titanT += 300;
      const s = ringSpot(raid, raid.rSpawn.range(0, 6.283), 26, 30);
      if (s) {
        const e = raid.spawnEnemy('titan', s.x, s.z, { state: 'revealing' });
        e.revealT = 1.2; e.scale = 1; e.affT = 4;
        raid.banner('TITAN', 'Stay out of its shockwave.', '#ff5a3a');
        raid.sfx('boss');
        raid.emit({ t: 'shake', amount: 0.6 });
      }
    }
  }

  if (raid.dirT > 0) return;
  raid.dirT = 0.35;
  // Ambient crowd: pedestrians, some of them disguised Mimics.
  const want = zone === 0 ? 12 : 16;
  if (ambient < want && !bossOn) {
    for (let tries = 0; tries < 3; tries++) {
      const pos = w.pedNear(raid.rSpawn, p.x, p.z, 1);
      if (!pos) continue;
      const d = dist(pos.x, pos.z, p.x, p.z);
      if (d < 36 || d > 120) continue;
      const z = w.zoneAt(pos.x, pos.z), mimic = raid.rSpawn.chance(MIMIC_SHARE[z]);
      let kind = 'walker', elite = null;
      if (mimic) {
        kind = raid.rSpawn.pick(ZONES[z].mimics);
        if (kind !== 'hollow' && raid.rSpawn.chance(raid.eliteShare(z))) elite = raid.rollAffixes();
      }
      const e = raid.spawnEnemy(kind, pos.x, pos.z, { state: mimic ? 'disguised' : 'civ', isMimic: mimic, elite });
      // A disguised elite is a lurker, with one behaviour of its own (doc 64, Package 3).
      if (elite) { e.lurker = raid.rSpawn.pick(LURKER_KINDS); e.radio = e.lurker === 'thief'; }
      if (!mimic) { e.hp = e.maxHp = 40; e.xp = 0; e.credits = 0; }
      e.tx = pos.x; e.tz = pos.z;
      break;
    }
  }
}

export function hordeStrike(raid, e) {
  const p = raid.player;
  if (e.kind === 'mote') {
    // Beam along the line locked at the start of the charge: sidestep it.
    const ax = e.aimX - e.x, az = e.aimZ - e.z, l2 = ax * ax + az * az;
    const t = clamp(((p.x - e.x) * ax + (p.z - e.z) * az) / l2, 0, 1);
    const hit = Math.hypot(e.x + ax * t - p.x, e.z + az * t - p.z) < 0.9;
    raid.emit({ t: 'beam', x: e.x, y: 2.3, z: e.z, x2: e.aimX, z2: e.aimZ, col: [0.4, 0.9, 1], life: 0.25, w: 0.3, k: 7 });
    raid.sfx('rail', e.x, e.z);
    if (hit) raid.damagePlayer(e.dmg, e.x, e.z);
    return true;
  }
  if (e.kind === 'lobber') {
    const tx = p.x + (p.lastMx || 0) * 2, tz = p.z + (p.lastMz || 0) * 2;
    raid.projectiles.push({ id: raid.nextId++, kind: 'lob', owner: 'enemy', x: e.x, z: e.z, y: 2, x0: e.x, z0: e.z, x1: tx, z1: tz, T: 1.6, life: 1.6, h: 7, col: [1, 0.8, 0.2], size: 1.0, onLand: () => {}, vx: 0, vz: 0 });
    raid.enemyBlast(tx, tz, 3.4, 1.6, e.dmg, [1, 0.7, 0.15], { shake: 0.2 }); // the shell's flight: never stretched
    raid.sfx('thump', e.x, e.z);
    return true;
  }
  return false;
}

// Titan specials: a ground shockwave and a litter of Mites.
export function titanTick(raid, e, dt, d) {
  e.affT -= dt;
  if (e.affT > 0 || d > 22) return;
  e.affT = 7.5;
  raid.sfx('charge', e.x, e.z);
  raid.enemyBlast(e.x, e.z, 9.5, raid.warn(1.5), e.dmg * 0.8, [1, 0.3, 0.1], { shake: 0.6, cancel: () => e.dead });
  for (let k = 0; k < 4; k++) {
    const s = raid.world.randomFree(raid.rSpawn, e.x, e.z, 2, 5, 0.5);
    if (s) { const m = raid.spawnEnemy('mite', s.x, s.z, { state: 'revealing' }); m.revealT = 0.5; }
  }
}

// Run items that fire on their own, the way a horde needs.
export function updateRunItems(raid, dt) {
  const p = raid.player, it = p.items;
  if (p.dead) return;
  const arc = it.arc_emitter || 0;
  if (arc) {
    p.arcT = (p.arcT || 0) - dt;
    if (p.arcT <= 0) {
      p.arcT = Math.max(0.7, 2.4 * Math.pow(0.92, arc - 1));
      // Chain lightning: jumps between the nearest enemies.
      let from = p, hits = 2 + arc;
      const done = new Set();
      while (hits-- > 0) {
        const t = raid.nearestTarget(from.x, from.z, from === p ? 14 : 8, (e) => !done.has(e.id));
        if (!t) break;
        done.add(t.id);
        raid.emit({ t: 'beam', x: from.x, z: from.z, x2: t.x, z2: t.z, col: [0.6, 0.9, 1], life: 0.16, w: 0.14, k: 6 });
        raid.playerHit(t, 22, 'skill', { noProc: true });
        from = t;
      }
      if (done.size) raid.sfx('sentry');
    }
  }
  const blades = it.orbit_blades || 0;
  if (blades) {
    p.bladeT = (p.bladeT || 0) - dt;
    if (p.bladeT <= 0) {
      p.bladeT = 0.25;
      const n = Math.min(6, blades + 1);
      for (let k = 0; k < n; k++) {
        const an = raid.time * 3.2 + k * (6.283 / n), bx = p.x + Math.cos(an) * 2.6, bz = p.z + Math.sin(an) * 2.6;
        raid.forRadius(bx, bz, 1.0, (e) => { if (raid.isTarget(e)) raid.playerHit(e, 9 + 3 * blades, 'melee', { noProc: true }); });
      }
    }
  }
  const nova = it.nova_core || 0;
  if (nova) {
    p.novaT = (p.novaT || 5) - dt;
    if (p.novaT <= 0) {
      p.novaT = Math.max(2.5, 6 * Math.pow(0.9, nova - 1));
      const r = 6 + stackStat(1, nova);
      let any = false;
      raid.forRadius(p.x, p.z, r, (e) => { if (raid.isTarget(e)) { raid.playerHit(e, 34, 'skill', { noProc: true }); e.st.slowT = 1.2; any = true; } });
      raid.emit({ t: 'ring', x: p.x, z: p.z, r, col: [0.5, 0.8, 1], life: 0.4, k: any ? 4 : 1.5 });
      if (any) raid.sfx('pop');
    }
  }
}

// Three distinct run items offered on a level-up.
export function levelChoices(raid) {
  const out = [], Q = raid.quality();
  for (let guard = 0; guard < 40 && out.length < 3; guard++) {
    const id = rollRunItem(raid.rLoot, Q);
    if (!out.includes(id)) out.push(id);
  }
  while (out.length < 3) { const id = raid.rLoot.pick(ITEM_IDS); if (!out.includes(id)) out.push(id); }
  void ITEMS; void SHOT_BUDGET; void ENEMIES; void angleDiff;
  return out;
}
