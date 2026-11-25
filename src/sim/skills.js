// The four demo kits (doc 18, section 3). Slot contract: M1 builds a resource or
// mark, M2 spends it, S repositions and refunds or buffs, R bursts.

import { angleDiff, dist } from '../core/math.js';

const aimDir = (p) => [Math.cos(p.face), Math.sin(p.face)];
const clampAim = (p, input, max) => {
  let dx = input.aimX - p.x, dz = input.aimZ - p.z;
  const l = Math.hypot(dx, dz) || 1;
  if (l > max) { dx = dx / l * max; dz = dz / l * max; }
  return [p.x + dx, p.z + dz];
};
// Pull a landing point back to open ground if the aim is inside a wall.
const landing = (raid, p, x, z) => {
  const t = raid.world.raycast(p.x, p.z, x, z);
  if (t < 1) { const k = Math.max(0, t - 0.04); return [p.x + (x - p.x) * k, p.z + (z - p.z) * k]; }
  return [x, z];
};

// ---------------------------------------------------------------- Rifleman
const rifleman = {
  m1(raid, p) {
    p.cd.m1 = 0.42 / p.aspd;
    for (let i = 0; i < 3; i++) {
      raid.after(i * 0.07, () => {
        if (p.dead || p.hidden) return;
        const a = p.face + raid.rCombat.range(-0.022, 0.022);
        const dx = Math.cos(a), dz = Math.sin(a);
        raid.fireBullet(p.x + dx * 0.9, p.z + dz * 0.9, dx, dz, {
          dmg: 9, range: 46, builder: true,
          onHit: (e) => { if (raid.isTarget(e)) { e.st.supp = Math.min(3, e.st.supp + 1); e.st.suppT = 4; } },
        });
        raid.emit({ t: 'muzzle', x: p.x + dx, z: p.z + dz });
        raid.sfx('shot');
      });
    }
    raid.noise(p.x, p.z, 18);
  },
  // Piercing Line: +25% per Suppression stack on each target, ricochet at 3 stacks.
  m2(raid, p) {
    const [dx, dz] = aimDir(p), range = 42;
    const L = range * raid.world.raycast(p.x, p.z, p.x + dx * range, p.z + dz * range);
    const hits = [];
    for (const e of raid.enemies) {
      if (e.dead || e.untargetable) continue;
      const proj = (e.x - p.x) * dx + (e.z - p.z) * dz;
      if (proj < 0 || proj > L) continue;
      if (Math.abs((e.x - p.x) * dz - (e.z - p.z) * dx) <= e.r + 0.7) hits.push(e);
    }
    let ric = null;
    for (const e of hits) {
      const stacks = e.st.supp;
      e.st.supp = 0;
      if (stacks > 0) raid.consume(e);
      raid.playerHit(e, 46 * (1 + 0.25 * stacks), 'skill');
      if (stacks >= 3) ric = e;
    }
    raid.emit({ t: 'beam', x: p.x + dx, z: p.z + dz, x2: p.x + dx * L, z2: p.z + dz * L, col: [0.5, 0.9, 1], life: 0.22, w: 0.22, k: 7 });
    if (ric) {
      const other = raid.nearestTarget(ric.x, ric.z, 13, (t) => !hits.includes(t));
      if (other) {
        raid.emit({ t: 'beam', x: ric.x, z: ric.z, x2: other.x, z2: other.z, col: [1, 0.9, 0.5], life: 0.22, w: 0.16, k: 6 });
        raid.playerHit(other, 46 * 1.2, 'skill');
      }
    }
    raid.emit({ t: 'muzzle', x: p.x + dx, z: p.z + dz, col: [0.5, 0.9, 1] });
    raid.sfx('rail');
    raid.noise(p.x, p.z, 24);
    raid.setCd('m2', 2.5);
    raid.lastM2 = { stacksSpent: hits.length, ricochet: !!ric };
  },
  s(raid, p, input) {
    const [dx, dz] = raid.dodgeDir(input);
    raid.startDash(dx, dz, 5, 0.26, 0.3);
    raid.setCd('s', 5);
    // Refund 30% of M2 if a suppressed enemy is within 10 m.
    if (p.cd.m2 > 0 && raid.nearestTarget(p.x, p.z, 10, (e) => e.st.supp > 0)) p.cd.m2 *= 0.7;
  },
  r(raid, p) {
    p.channel = { kind: 'barrage', t: 4, moveMul: 0.5, acc: 0 };
    raid.setCd('r', 40);
    raid.sfx('ult');
  },
  tick(raid, p, dt) {
    const c = p.channel;
    if (!c || c.kind !== 'barrage') return;
    c.t -= dt; c.acc -= dt;
    while (c.acc <= 0) {
      c.acc += 0.08;
      // Nearest enemy inside the cone, re-targeting after each kill.
      const tgt = raid.nearestTarget(p.x, p.z, 28, (e) => Math.abs(angleDiff(p.face, Math.atan2(e.z - p.z, e.x - p.x))) < 0.75, true);
      const a = tgt ? Math.atan2(tgt.z - p.z, tgt.x - p.x) : p.face + raid.rCombat.range(-0.2, 0.2);
      const dx = Math.cos(a), dz = Math.sin(a);
      raid.fireBullet(p.x + dx * 0.9, p.z + dz * 0.9, dx, dz, { dmg: 11, range: 34, col: [1, 0.7, 0.35] });
      raid.emit({ t: 'muzzle', x: p.x + dx, z: p.z + dz });
      raid.sfx('shot');
    }
    raid.noise(p.x, p.z, 22);
    if (c.t <= 0) p.channel = null;
  },
};

// ------------------------------------------------------------------- Blade
const blade = {
  m1(raid, p) {
    const step = p.combo, dmg = [22, 22, 36][step], a = p.face, range = 3.4;
    let built = 0; // Charge counts at most two enemies per swing
    raid.forRadius(p.x, p.z, range, (e) => {
      const d = dist(e.x, e.z, p.x, p.z);
      if (d > 1.1 && Math.abs(angleDiff(a, Math.atan2(e.z - p.z, e.x - p.x))) > 1.05) return;
      raid.playerHit(e, dmg, 'melee', built < 2 ? { builder: true } : {});
      built++;
      // The third strike applies Exposed for 6 s.
      if (step === 2 && raid.isTarget(e)) e.st.exposedT = 6;
    });
    raid.emit({ t: 'slash', x: p.x, z: p.z, r: range, half: 1.05, angle: a, col: step === 2 ? [1, 0.8, 0.9] : [1, 0.35, 0.5] });
    raid.sfx(step === 2 ? 'slash3' : 'slash');
    p.swingT = 0.2;
    p.combo = (step + 1) % 3; p.comboT = 1.3;
    p.cd.m1 = (step === 2 ? 0.5 : 0.3) / p.aspd;
    if (!p.dash) p.dash = { vx: Math.cos(a) * 9, vz: Math.sin(a) * 9, t: 0.07 };
    raid.noise(p.x, p.z, 8);
  },
  // Whirl Slash: spends Exposed; each spent refunds 15% of M2 and S (max 45%).
  m2(raid, p) {
    let spent = 0;
    raid.forRadius(p.x, p.z, 4.3, (e) => {
      raid.playerHit(e, 50, 'skill', { melee: true });
      if (e.st.exposedT > 0) { e.st.exposedT = 0; spent++; raid.consume(e); }
    });
    const refund = Math.min(0.45, 0.15 * spent);
    raid.emit({ t: 'ring', x: p.x, z: p.z, r: 4.3, col: [1, 0.35, 0.5], life: 0.25, k: 4 });
    raid.emit({ t: 'slash', x: p.x, z: p.z, r: 4.3, half: 3.2, angle: p.face, col: [1, 0.5, 0.65] });
    raid.sfx('whirl');
    p.swingT = 0.2;
    raid.setCd('m2', 2 * (1 - refund));
    p.cd.s *= 1 - refund;
    raid.lastM2 = { stacksSpent: spent, refund };
    raid.noise(p.x, p.z, 10);
  },
  s(raid, p, input) {
    const [dx, dz] = aimDir(p);
    const hit = new Set();
    raid.startDash(dx, dz, 6, 0.18, 0.28, null, () => {
      raid.forRadius(p.x, p.z, 1.4, (e) => {
        if (hit.has(e.id)) return;
        hit.add(e.id);
        raid.playerHit(e, 30, 'melee');
        // A hit makes the next M1 start at strike 2.
        p.combo = 1; p.comboT = 1.6;
      });
    });
    raid.emit({ t: 'beam', x: p.x, z: p.z, x2: p.x + dx * 6, z2: p.z + dz * 6, col: [1, 0.35, 0.5], life: 0.25, w: 0.3, k: 3 });
    raid.setCd('s', 4);
  },
  // Execution: strike up to 5 Exposed targets in turn; kills restore 5% health.
  r(raid, p) {
    let targets = raid.enemies.filter((e) => raid.isTarget(e) && e.st.exposedT > 0 && dist(e.x, e.z, p.x, p.z) < 18);
    if (!targets.length) targets = raid.enemies.filter((e) => raid.isTarget(e) && dist(e.x, e.z, p.x, p.z) < 12);
    if (!targets.length) return false;
    targets.sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z));
    targets = targets.slice(0, targets[0].st.exposedT > 0 ? 5 : 3);
    p.invuln = true;
    raid.sfx('ult');
    targets.forEach((e, i) => {
      raid.after(0.12 + i * 0.2, () => {
        if (e.dead || p.dead) return;
        const a = Math.atan2(e.z - p.z, e.x - p.x);
        const tx = e.x - Math.cos(a) * (e.r + 1), tz = e.z - Math.sin(a) * (e.r + 1);
        raid.emit({ t: 'beam', x: p.x, z: p.z, x2: tx, z2: tz, col: [1, 0.35, 0.5], life: 0.3, w: 0.35, k: 4 });
        if (raid.world.circleFree(tx, tz, p.r)) { p.x = tx; p.z = tz; }
        p.face = a; p.swingT = 0.2;
        raid.emit({ t: 'slash', x: p.x, z: p.z, r: 3.5, half: 1.2, angle: a, col: [1, 0.9, 0.95] });
        raid.sfx('slash3');
        raid.playerHit(e, 150, 'skill', { melee: true });
        if (e.dead) { raid.heal(p.maxHp * 0.05); raid.emit({ t: 'heal' }); }
      });
    });
    raid.after(0.2 + targets.length * 0.2, () => { p.invuln = false; });
    raid.setCd('r', 45);
    return true;
  },
};

// ---------------------------------------------------------------- Summoner
const summoner = {
  m1(raid, p, input) {
    p.cd.m1 = 0.62 / p.aspd;
    const [ax, az] = clampAim(p, input, 22);
    const [tx, tz] = landing(raid, p, ax, az);
    raid.lob(p.x, p.z, tx, tz, 0.42, [1, 0.8, 0.3], (x, z) => {
      raid.emit({ t: 'explode', x, z, r: 3, col: [1, 0.8, 0.3], shake: 0.08 });
      raid.sfx('pop', x, z);
      raid.noise(x, z, 14);
      let marked = 0, hitAny = false;
      raid.forRadius(x, z, 3, (e) => {
        raid.playerHit(e, 26, 'ballistic');
        if (raid.isTarget(e) && !hitAny) { hitAny = true; raid.gainCharge(10, true); }
        // Marks up to 5 enemies for 5 s.
        if (raid.isTarget(e) && marked < 5) { e.st.markT = 5; marked++; }
      });
    });
    raid.sfx('thump');
  },
  m2(raid, p, input) {
    const [ax, az] = clampAim(p, input, 12);
    let [x, z] = landing(raid, p, ax, az);
    if (!raid.world.circleFree(x, z, 0.5)) { x = p.x; z = p.z; }
    // At most two sentries: placing a third retires the oldest.
    const sentries = raid.summons.filter((s) => s.kind === 'sentry');
    if (sentries.length >= 2) raid.summons.splice(raid.summons.indexOf(sentries[0]), 1);
    raid.addSummon('sentry', x, z, 20);
    raid.emit({ t: 'ring', x, z, r: 2, col: [1, 0.8, 0.3], k: 3 });
    raid.sfx('deploy');
    raid.setCd('m2', 3);
  },
  s(raid, p, input) {
    const [dx, dz] = raid.dodgeDir(input);
    raid.startDash(dx, dz, 4, 0.22, 0.24);
    raid.setCd('s', 5);
    // Sentries within 8 m gain +40% attack speed for 3 s.
    for (const s of raid.summons) if (s.kind === 'sentry' && dist(s.x, s.z, p.x, p.z) < 8) { s.buffT = 3; raid.emit({ t: 'ring', x: s.x, z: s.z, r: 1.6, col: [1, 0.9, 0.5], k: 3 }); }
  },
  r(raid, p) {
    for (let i = 0; i < 3; i++) raid.addSummon('drone', p.x, p.z, 15);
    raid.emit({ t: 'ring', x: p.x, z: p.z, r: 4, col: [1, 0.8, 0.3], k: 3 });
    raid.sfx('ult');
    raid.setCd('r', 40);
  },
};

// ------------------------------------------------------------ Toxic Handler
const TOX = [0.55, 1.0, 0.35];
const toxic = {
  cloud(raid, x, z, r, life, dps) {
    dps *= raid.powerMul;
    return raid.addArea({
      kind: 'cloud', x, z, r, life, col: [0.6, 0.9, 0.3],
      // Wither: lethal ticks, +20% per Venom stack on the target.
      onTick: (e) => {
        raid.playerHit(e, dps * 0.25 * (1 + 0.2 * e.st.venom), 'dot');
        // Rupture: at 5 Venom the cloud consumes it all for a burst.
        if (e.st.venom >= 5 && !e.dead) {
          e.st.venom = 0; e.st.venomT = 0;
          raid.consume(e);
          raid.emit({ t: 'explode', x: e.x, z: e.z, r: 1.8, col: [0.6, 1, 0.3], shake: 0.05 });
          raid.playerHit(e, 40, 'skill', { noProc: true });
        }
      },
    });
  },
  m1(raid, p) {
    p.cd.m1 = 0.3 / p.aspd;
    const a = p.face + raid.rCombat.range(-0.04, 0.04), dx = Math.cos(a), dz = Math.sin(a);
    raid.fireBullet(p.x + dx * 0.8, p.z + dz * 0.8, dx, dz, {
      kind: 'tox', speed: 32, range: 14, dmg: 10, r: 0.4, col: TOX, size: 0.55, builder: true,
      onHit: (e) => { if (raid.isTarget(e)) { e.st.venom = Math.min(5, e.st.venom + 1); e.st.venomT = 6; } },
    });
    raid.sfx('spit');
    raid.noise(p.x, p.z, 9);
  },
  m2(raid, p, input) {
    const [ax, az] = clampAim(p, input, 16);
    const [tx, tz] = landing(raid, p, ax, az);
    raid.lob(p.x, p.z, tx, tz, 0.4, TOX, (x, z) => { toxic.cloud(raid, x, z, 4.5, 5, 14 * p.skillMul); raid.sfx('hiss', x, z); });
    raid.sfx('thump');
    raid.setCd('m2', 3);
  },
  s(raid, p, input) {
    const [dx, dz] = raid.dodgeDir(input);
    const sx = p.x, sz = p.z;
    raid.startDash(dx, dz, 5, 0.3, 0.22, () => {
      // Acid pool along the slide: slows and applies Venom.
      raid.addArea({
        kind: 'pool', x: (sx + p.x) / 2, z: (sz + p.z) / 2, r: 3, life: 5, col: TOX, tick: 0,
        onTick: (e) => { e.st.slowT = 0.5; if ((e.poolT = (e.poolT || 0) + 1) % 2 === 0) { e.st.venom = Math.min(5, e.st.venom + 1); e.st.venomT = 6; } },
      });
    });
    raid.setCd('s', 5);
  },
  // Plague Burst: the infection hops to the nearest enemy every 0.5 s (max 8 hops).
  r(raid, p, input) {
    let first = raid.nearestTarget(input.aimX, input.aimZ, 6) || raid.nearestTarget(p.x, p.z, 20, null, true);
    if (!first || dist(first.x, first.z, p.x, p.z) > 26) return false;
    const infected = new Set();
    const infect = (e, from, hops) => {
      if (e.dead) return;
      infected.add(e.id);
      e.st.venom = 5; e.st.venomT = 6; e.st.plagueT = 6; e.st.plagueDps = 18 * p.skillMul;
      raid.emit({ t: 'beam', x: from.x, z: from.z, x2: e.x, z2: e.z, col: [0.7, 1, 0.3], life: 0.3, w: 0.14, k: 5 });
      raid.emit({ t: 'ring', x: e.x, z: e.z, r: 2, col: TOX, k: 3 });
      raid.sfx('hiss', e.x, e.z);
      if (hops <= 0) return;
      raid.after(0.5, () => {
        const next = raid.nearestTarget(e.x, e.z, 12, (t) => !infected.has(t.id));
        if (next) infect(next, e, hops - 1);
      });
    };
    infect(first, p, 8);
    raid.sfx('ult');
    raid.setCd('r', 45);
    return true;
  },
};

export const KITS = { rifleman, blade, summoner, toxic };
