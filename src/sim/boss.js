// B1 Matron of Hollows (doc 22, section 3): three phases, each adding a mechanic.
// Shared framework: intro, notched health, poise stagger, commit rule, enrage.

import { dist, angleDiff } from '../core/math.js';
import { ITEMS, ITEM_IDS } from './data.js';
import { rollGear } from './loot.js';
import { message } from '../i18n/index.js';

export const BOSS_NOTCHES = [0.7, 0.35];
const COL = [1, 0.2, 0.45];

export function startBoss(raid) {
  const A = raid.world.boss;
  // Clear bystanders so the arena only holds the fight.
  for (const o of raid.enemies) if (!o.dead && dist(o.x, o.z, A.x, A.z) < A.r + 15) { o.dead = true; }
  raid.groups.boss = { alive: 0 };
  const e = raid.spawnEnemy('matron', A.x, A.z - 8, { state: 'boss' });
  e.invuln = true;
  e.face = Math.PI / 2;
  raid.boss = {
    e, active: true, phase: 1, t: 0, intro: 2.6, transT: 0, busy: 0, atkT: 2.0, atkN: 0, addT: 12, rainT: 7,
    cysts: [], cystsAlive: 0, hatchT: 6, hatchIdx: 0, torn: false, poise: 0, poiseCd: 0, token: 0, lastBrood: false, rage: 1,
    hint: 'Dodge the slam cone. Stand clear of spore circles.',
  };
  raid.bossArena = { x: A.x, z: A.z, r: A.r, sealed: false };
  raid.banner('MATRON OF HOLLOWS', 'Brood mother of the Reliquary Quarter', '#ff4d9a');
  raid.relay('Relay: Progenitor signature. You can still walk away until it nests.');
  raid.sfx('boss');
  raid.emit({ t: 'shake', amount: 0.5 });
}

function resetBoss(raid) {
  const B = raid.boss;
  for (const o of raid.enemies) if (o.group === 'boss' || o === B.e || o.kind === 'cyst') o.dead = true;
  for (const poi of raid.world.pois) if (poi.type === 'boss') raid.poi[poi.id].used = false;
  raid.boss = null; raid.bossArena = null;
  raid.banner('BOSS RESET', 'The Matron returns to its lair.', '#aab');
}

function castToken(raid) { const B = raid.boss, tk = B.token; return () => !raid.boss || raid.boss.token !== tk || B.e.dead; }

function slam(raid, B) {
  const e = B.e, p = raid.player;
  const a = Math.atan2(p.z - e.z, p.x - e.x);
  e.face = a;
  const wind = raid.warn(B.phase === 3 ? 1.15 : 1.4); // the busy time stretches with it
  e.windupT = e.windupMax = wind; B.busy = wind + 0.5;
  raid.sfx('charge', e.x, e.z);
  // Brood Slam: heavy 120 degree cone, about 30% of max health.
  raid.enemyBlast(e.x, e.z, 11, wind, e.dmg * 1.1 * B.rage, [1, 0.15, 0.1], { half: 1.05, angle: a, shake: 0.5, cancel: castToken(raid) });
}
function swipe(raid, B) {
  const e = B.e, p = raid.player;
  const a = Math.atan2(p.z - e.z, p.x - e.x);
  e.face = a;
  const wind = raid.warn(0.7);
  e.windupT = e.windupMax = wind; B.busy = wind + 0.3;
  raid.enemyBlast(e.x, e.z, 6.5, wind, e.dmg * 0.45 * B.rage, [1, 0.6, 0.15], { half: 0.85, angle: a, shake: 0.2, cancel: castToken(raid) });
}
function sporeRain(raid, B, count, pools) {
  const p = raid.player, A = raid.bossArena;
  raid.sfx('spit', p.x, p.z);
  for (let i = 0; i < count; i++) {
    let x = p.x, z = p.z;
    if (i > 0) { const an = raid.rAi.range(0, 6.283), d = raid.rAi.range(4, 13); x += Math.cos(an) * d; z += Math.sin(an) * d; }
    const dd = dist(x, z, A.x, A.z);
    if (dd > A.r - 3) { x = A.x + (x - A.x) / dd * (A.r - 3); z = A.z + (z - A.z) / dd * (A.r - 3); }
    raid.enemyBlast(x, z, 4, raid.warn(1.5) + i * 0.08, B.e.dmg * 0.6 * B.rage, [0.6, 1, 0.2], { shake: 0.1, pool: pools ? 6 : 0 });
  }
}
export function chainRoar(raid, B) {
  const e = B.e, p = raid.player;
  const a = Math.atan2(p.z - e.z, p.x - e.x);
  e.face = a;
  // Only the lead-in to the first slam stretches with the warning length; the 0.9 s beat is authored.
  const lead = raid.warn(1.0);
  e.windupT = e.windupMax = lead; B.busy = lead + 2.2;
  raid.sfx('charge', e.x, e.z);
  // Three slams in a line, 0.9 s apart: dodge on the rhythm.
  for (let i = 0; i < 3; i++) {
    const d = 6 + i * 7.5;
    raid.enemyBlast(e.x + Math.cos(a) * d, e.z + Math.sin(a) * d, 5.6, lead + i * 0.9, e.dmg * 0.9 * B.rage, [1, 0.15, 0.1], { shake: 0.4, cancel: castToken(raid) });
  }
}
function summon(raid, kinds, around) {
  const A = raid.bossArena;
  for (const k of kinds) {
    const an = raid.rAi.range(0, 6.283), d = around ? raid.rAi.range(2, 5) : A.r - 4;
    const cx = around ? around.x : A.x, cz = around ? around.z : A.z;
    const s = raid.world.randomFree(raid.rSpawn, cx + Math.cos(an) * d, cz + Math.sin(an) * d, 0, 2, 0.6) || { x: cx, z: cz };
    const m = raid.spawnEnemy(k, s.x, s.z, { state: 'revealing', group: 'boss' });
    m.revealT = 0.5; m.xp = 3; m.credits = 2;
  }
}

function toPhase(raid, B, phase) {
  const e = B.e, A = raid.bossArena, p = raid.player;
  B.phase = phase; B.transT = 3; B.token++; B.busy = 0;
  e.invuln = true; e.windupT = 0; e.staggerT = 0;
  // Transition: adds despawn and all player cooldowns drop by 30%.
  for (const o of raid.enemies) if (o.group === 'boss' && o.kind !== 'cyst') o.dead = true;
  raid.groups.boss.alive = 0;
  for (const k of ['m2', 's', 'r']) p.cd[k] *= 0.7;
  raid.emit({ t: 'explode', x: e.x, z: e.z, r: 8, col: COL, shake: 0.6 });
  raid.sfx('boss');
  if (phase === 2) {
    A.sealed = true;
    raid.banner('PHASE 2: NEST', 'The arena is sealed. Destroy the Brood Cysts.', '#ff4d9a');
    B.hint = 'She is immune while burrowed. Each cyst killed forces her up, staggered.';
  } else {
    raid.banner('PHASE 3: FRENZY', 'Chain Roar: dodge on the rhythm.', '#ff5a3a');
    B.hint = 'Three slams in a line. Acid pools shrink the safe ground.';
    for (const c of B.cysts) c.dead = true;
    B.cystsAlive = 0;
  }
}

function endTransition(raid, B) {
  const e = B.e, A = raid.bossArena;
  e.invuln = false;
  if (B.phase === 2) {
    e.x = A.x; e.z = A.z;
    e.burrowed = true; e.untargetable = true;
    B.cysts = [];
    for (let k = 0; k < 4; k++) {
      const an = k * Math.PI / 2 + 0.2;
      const c = raid.spawnEnemy('cyst', A.x + Math.cos(an) * A.r * 0.72, A.z + Math.sin(an) * A.r * 0.72, { state: 'static' });
      c.hp = c.maxHp = c.maxHp * raid.T.hp;
      B.cysts.push(c);
    }
    B.cystsAlive = 4; B.hatchT = 5; B.rainT = 4;
  } else {
    e.burrowed = false; e.untargetable = false;
    e.speed *= 1.25;
    e.stagger = 1; e.vuln = B.torn ? 0.15 : 0;
    B.atkT = 1.2;
  }
}

// Called for every hit on the Matron. Returns the damage that goes through.
export function bossDamaged(raid, e, amount) {
  const B = raid.boss;
  if (!B || e.burrowed) return 0;
  // Poise: heavy damage fills the bar; when full she staggers for 4 s (+50% damage taken).
  if (B.poiseCd <= 0 && !(e.staggerT > 0) && B.transT <= 0) {
    B.poise += amount;
    if (B.poise >= e.maxHp * 0.07) {
      B.poise = 0; B.poiseCd = 14; B.token++; B.busy = 0;
      e.staggerT = 4; e.windupT = 0; e.stagger = 1.5;
      raid.toast('STAGGERED: +50% damage', '#ffd76a', 'warning');
      raid.emit({ t: 'poise', x: e.x, z: e.z });
      raid.emit({ t: 'ring', x: e.x, z: e.z, r: 6, col: [1, 0.85, 0.3], k: 4 });
      raid.sfx('break', e.x, e.z);
    }
  }
  return amount;
}

export function updateBoss(raid, dt) {
  const B = raid.boss;
  if (!B || !B.active) return;
  const e = B.e, p = raid.player, A = raid.bossArena;
  if (e.dead || p.dead) return;
  B.t += dt;
  // Commit rule: leaving before Phase 2 resets the boss to full health.
  if (B.phase === 1 && dist(p.x, p.z, A.x, A.z) > A.r + 12) { resetBoss(raid); return; }
  if (B.intro > 0) { B.intro -= dt; if (B.intro <= 0) e.invuln = false; return; }
  // Enrage after 5:00: +10% damage every 10 s.
  B.rage = B.t > 300 ? 1 + 0.1 * Math.floor((B.t - 300) / 10 + 1) : 1;
  if (B.transT > 0) { B.transT -= dt; if (B.transT <= 0) endTransition(raid, B); return; }
  if (B.poiseCd > 0) B.poiseCd -= dt;
  B.poise = Math.max(0, B.poise - e.maxHp * 0.004 * dt);
  const f = e.hp / e.maxHp;
  if (B.phase === 1 && f <= BOSS_NOTCHES[0]) { toPhase(raid, B, 2); return; }
  if (B.phase === 2 && f <= BOSS_NOTCHES[1]) { toPhase(raid, B, 3); return; }

  if (B.phase === 2 && B.cystsAlive > 0) {
    // Cysts glow in sequence and hatch Skitters.
    const alive = B.cysts.filter((c) => !c.dead);
    if (alive.length < B.cystsAlive) {
      B.cystsAlive = alive.length;
      // A cyst died: the Matron surfaces and staggers.
      e.burrowed = false; e.untargetable = false; e.staggerT = 3.2; e.stagger = 1.5;
      raid.toast('The Matron surfaces: strike now', '#ffd76a', 'warning');
      raid.emit({ t: 'explode', x: e.x, z: e.z, r: 6, col: COL, shake: 0.4 });
      if (B.cystsAlive === 0) { B.torn = true; e.vuln = 0.15; B.hint = 'Torn Carapace: she takes +15% damage.'; }
    }
    for (const c of alive) c.glow = 0;
    if (alive.length) {
      const next = alive[B.hatchIdx % alive.length];
      B.hatchT -= dt;
      next.glow = Math.max(0, 1 - B.hatchT / 2.5);
      if (B.hatchT <= 0) { B.hatchT = 9; B.hatchIdx++; if (raid.groups.boss.alive < 8) summon(raid, ['skitter', 'skitter'], next); }
    }
    B.rainT -= dt;
    if (B.rainT <= 0) { B.rainT = 5.5; sporeRain(raid, B, 3, false); }
  }

  if (e.staggerT > 0) {
    e.staggerT -= dt;
    if (e.staggerT <= 0) {
      e.stagger = 1;
      if (B.phase === 2 && B.cystsAlive > 0) { e.burrowed = true; e.untargetable = true; }
      B.atkT = 1.0;
    }
    return;
  }
  if (e.burrowed) return;

  // ---- fighting: movement and attack rotation ----
  const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
  if (e.windupT > 0) e.windupT -= dt;
  if (B.busy > 0) { B.busy -= dt; return; }
  e.face += angleDiff(e.face, Math.atan2(dz, dx)) * Math.min(1, dt * 3);
  if (d > 5.5) {
    e.x += dx / d * e.speed * dt; e.z += dz / d * e.speed * dt;
    raid.world.resolveCircle(e, 1.2);
    e.moving = true; e.animT += dt * 6;
  }
  B.atkT -= dt;
  if (B.atkT <= 0) {
    const n = B.atkN++;
    if (B.phase === 3) {
      if (n % 3 === 0) chainRoar(raid, B);
      else if (n % 3 === 1) { sporeRain(raid, B, 5, true); B.busy = 0.8; }
      else if (d < 10) slam(raid, B); else chainRoar(raid, B);
      B.atkT = 1.5;
    } else {
      if (n % 3 === 1 || d > 12) { sporeRain(raid, B, 6, false); B.busy = 0.8; }
      else if (n % 3 === 0 && d < 7) swipe(raid, B);
      else slam(raid, B);
      B.atkT = 2.3;
    }
  }
  if (B.phase === 1) {
    B.addT -= dt;
    if (B.addT <= 0) { B.addT = 15; summon(raid, ['walker', 'walker'], null); }
  }
  // Last Brood at 15%.
  if (B.phase === 3 && !B.lastBrood && f <= 0.15) {
    B.lastBrood = true;
    raid.banner('LAST BROOD', 'Hollows incoming: kill them before they reach you.', '#ff9a3a');
    summon(raid, ['hollow', 'hollow', 'hollow', 'hollow', 'hollow', 'hollow'], null);
  }
}

// Boss drop package (doc 23, section 4).
export function bossKilled(raid, e) {
  const B = raid.boss, A = raid.bossArena;
  if (!B) return;
  B.active = false;
  A.sealed = false;
  for (const o of raid.enemies) if (o.group === 'boss' || o.kind === 'cyst') o.dead = true;
  raid.bossKilled = true;
  raid.emit({ t: 'explode', x: e.x, z: e.z, r: 14, col: COL, shake: 0.9 });
  raid.banner('MATRON SLAIN', 'Collect the drop package, then extract.', '#ffd76a');
  raid.sfx('win');
  const T = raid.tier;
  for (let i = 0; i < 2 + T; i++) {
    const an = i * 2.1, d = 3 + i * 0.6;
    raid.dropPickup('gear', e.x + Math.cos(an) * d, e.z + Math.sin(an) * d, { item: rollGear(raid.rLoot, { tier: T, zone: 3, nl: raid.nl, source: 'boss', boss: true }) });
  }
  for (let i = 0; i < 4; i++) raid.dropPickup('sample', e.x + Math.cos(i * 1.6 + 1) * 5, e.z + Math.sin(i * 1.6 + 1) * 5);
  const cores = raid.firstBossKill ? 2 : 1;
  for (let i = 0; i < cores; i++) raid.dropPickup('core', e.x + i * 1.5 - 0.7, e.z + 6);
  raid.bossCash = Math.round(500 * (1 + 0.15 * (T - 1)));
  // Boss Cache: choose 1 of 3 Prototype run items.
  const protos = raid.rLoot.shuffle(ITEM_IDS.filter((id) => ITEMS[id].rarity === 3)).slice(0, 3);
  raid.after(1.2, () => raid.offerChoice('BOSS CACHE: choose one Prototype item', protos, (id) => raid.giveItem(id)));
  raid.relay(message('Relay: Confirmed kill. {cash} Cash bounty pays on extraction.', { cash: raid.bossCash }));
}
