// Headless checks for the simulation. Each test names the acceptance row of the
// design documents it exercises (docs/designs). Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { makeTutorial } from '../src/sim/tutorial.js';
import { Rng } from '../src/core/rng.js';
import { ZONES, ITEMS, ITEM_IDS, ENEMIES, ASPECTS, AUTO_CAP, ENEMY_HP, ENEMY_DMG, GEAR_AFFIX_IDS, stackStat, itemRarityWeights, enhanceCost, HOSTILE_CAP, SUMMON_CAP, RAID_SECONDS } from '../src/sim/data.js';
import { levelChoices } from '../src/sim/horde.js';
import { rollRunItem, rollGear, gearStats, starterItem } from '../src/sim/loot.js';
import * as P from '../src/sim/profile.js';
import { makeBot } from './bot.js';
import { castSkill, witherCloudArea } from '../src/sim/skills.js';

const SEED = 20261125;
const city = generateWorld(SEED);
const annex = generateWorld(SEED, { annex: true });
// A point out in the district: on the avenue just north of the Shelter.
const OUT = city.resolveCircle({ x: city.insertion.x, z: city.insertion.z - 60 }, 1);
const DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const sandbox = (o = {}) => { const r = new Raid({ world: city, seed: 5, mode: 'sandbox', ...o }); r.player.crit = 0; return r; };
const run = (raid, seconds, input = idle) => { for (let i = 0; i < seconds * 60 && !raid.over; i++) stepRaid(raid, DT, typeof input === 'function' ? input(raid, DT) : input); };
const near = (actual, expected, msg = '') => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg} ${actual} vs ${expected}`);
const geared = (o, extra = {}) => { const r = new Raid({ world: city, seed: 5, mode: 'sandbox', gear: { ...gearStats(null), ...o }, ...extra }); r.player.crit = 0; return r; };
const bag = (raid, dx = 3) => { const e = raid.spawnEnemy('dummy', raid.player.x + dx, raid.player.z); e.hp = e.maxHp = 1e6; return e; };
function hash(raid) {
  let h = 2166136261;
  const mix = (v) => { h = Math.imul(h ^ Math.round(v * 1000), 16777619) >>> 0; };
  const p = raid.player;
  mix(p.x); mix(p.z); mix(p.hp); mix(p.credits); mix(raid.kills); mix(raid.enemies.length);
  for (const e of raid.enemies) { mix(e.x); mix(e.z); mix(e.hp); }
  return h;
}

test('world: generation is a pure function of the seed (10-A, 13 section 7)', () => {
  const again = generateWorld(SEED);
  assert.deepEqual(again.zone, city.zone);
  assert.equal(again.instances, city.instances);
  let diff = 0;
  for (let s = 0; s < city.shapes.length; s++) for (let i = 0; i < city.shapes[s].data.length; i += 97) if (again.shapes[s].data[i] !== city.shapes[s].data[i]) diff++;
  for (let i = 0; i < city.grid.length; i += 211) if (again.grid[i] !== city.grid[i] || again.surface[i] !== city.surface[i]) diff++;
  assert.equal(diff, 0);
  assert.notDeepEqual(generateWorld(SEED + 1).zone, city.zone);
});

test('world: 500 m district with four extraction points spread across it (17-A-01)', () => {
  assert.equal(city.size, 500);
  assert.equal(city.extractions.filter(Boolean).length, 4);
  const far = Math.max(...city.extractions.map((e) => Math.hypot(e.x - city.insertion.x, e.z - city.insertion.z)));
  // Straight-line distance; the walking route through the street network is longer.
  assert.ok(far >= 300, `farthest extraction is ${far.toFixed(0)} m away`);
  const ex = city.extractions;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(Math.hypot(ex[i].x - ex[j].x, ex[i].z - ex[j].z) > 80, 'extraction points are spread out');
  for (const e of city.extractions) assert.ok(city.reach[Math.floor(e.z) * city.size + Math.floor(e.x)], `${e.name} is reachable on foot`);
  const gate = city.pois.find((k) => k.type === 'boss');
  assert.ok(gate && city.reach[Math.floor(gate.z) * city.size + Math.floor(gate.x)], 'the boss gate is reachable');
  assert.ok(city.boss.r >= 22 && city.boss.r <= 32 && city.boss.pillars.length === 8);
  assert.ok(city.zoneAt(city.extractions[0].x, city.extractions[0].z) <= 1);
  for (const e of city.extractions.slice(1)) assert.ok(e.zone >= 1, 'the other exits are out in the district');
  assert.ok(city.boss && city.zoneAt(city.boss.x, city.boss.z) >= 2);
  assert.ok(city.circleFree(city.insertion.x, city.insertion.z, 0.5));
  assert.ok(city.containers.filter((c) => c.indoor).length >= 40 * 2, 'at least 40 enterable buildings');
});

test('world: zone shares near targets and neighbours differ by one level (17-A-05)', () => {
  const share = [0, 0, 0, 0, 0], n = city.n;
  for (const z of city.zone) share[z] += 100 / (n * n);
  // The Shelter is a single block; the rest follows the 36/31/21/10 split as closely as 24 blocks allow.
  assert.ok(Math.abs(share[0] - 100 / (n * n)) < 0.01, `Z0 share ${share[0].toFixed(2)}%`);
  const target = [0, 36, 31, 21, 10];
  for (let i = 1; i < 5; i++) assert.ok(Math.abs(share[i] - target[i]) <= 9, `Z${i} share ${share[i].toFixed(1)}%`);
  const sb = city.blockIndex(city.insertion.x, city.insertion.z);
  assert.equal(city.blocks[sb].containers.length, 0, 'no containers in the Shelter');
  assert.ok(city.blocks[sb].pois.every((p) => p.type === 'broker'), 'no caches in the Shelter');
  for (let bz = 0; bz < n; bz++) for (let bx = 0; bx < n - 1; bx++) assert.ok(Math.abs(city.zone[bz * n + bx] - city.zone[bz * n + bx + 1]) <= 1);
  for (let bz = 0; bz < n - 1; bz++) for (let bx = 0; bx < n; bx++) assert.ok(Math.abs(city.zone[bz * n + bx] - city.zone[(bz + 1) * n + bx]) <= 1);
});

test('sim: same seed and scripted inputs give the same state hash (13-A-01, 13-A-02)', () => {
  const play = () => {
    const raid = new Raid({ world: city, seed: 42, classId: 'rifleman', tier: 1 });
    const bot = makeBot({ goal: [OUT, { x: OUT.x, z: 250 }] });
    const out = [];
    for (let i = 0; i < 60 * 90; i++) { stepRaid(raid, DT, bot(raid, DT)); raid.events.length = 0; if (i % 600 === 599) out.push(hash(raid)); }
    return out;
  };
  assert.deepEqual(play(), play());
});

test('clock: curfew at 02:00 after 30 minutes of raid clock (17-A-02)', () => {
  const raid = new Raid({ world: city, seed: 3, clockScale: 60 });
  raid.player.invuln = true;
  run(raid, RAID_SECONDS / 60 - 1);
  assert.equal(raid.over, false);
  assert.ok(raid.clock > 25.5 && raid.band === 3);
  run(raid, 2);
  assert.equal(raid.result.outcome, 'curfew');
  assert.equal(raid.result.bonus, 0);
});

test('night: the same Z1 encounter at NL 0 and NL 1 (17-A-03)', () => {
  const raid = sandbox();
  const z1 = city.containers.find((c) => c.zone === 1);
  raid.nl = 0;
  const a = raid.spawnEnemy('walker', z1.x, z1.z);
  const share0 = raid.eliteShare(1);
  raid.nl = 1;
  const b = raid.spawnEnemy('walker', z1.x, z1.z);
  assert.ok(Math.abs(b.maxHp / a.maxHp - 1.6) < 1e-9);
  assert.ok(Math.abs(b.dmg / a.dmg - 1.4) < 1e-9);
  assert.ok(Math.abs(share0 - 0.03) < 1e-9 && Math.abs(raid.eliteShare(1) - 0.15) < 1e-9);
});

test('elites: one affix at NL 0, up to two at NL 1 (18-A-04)', () => {
  const raid = sandbox();
  raid.nl = 0;
  for (let i = 0; i < 50; i++) assert.equal(raid.rollAffixes().length, 1);
  raid.nl = 1;
  const counts = new Set();
  for (let i = 0; i < 200; i++) counts.add(raid.rollAffixes().length);
  assert.deepEqual([...counts].sort(), [1, 2]);
});

test('extraction bonus: Z4 at 02:00 pays V x 0.45, Z1 at dusk V x 0.05 (19-A-02)', () => {
  const bonus = (zmax, nl) => {
    const raid = sandbox();
    raid.player.inv.push({ kind: 'loot', name: 'x', value: 1000 });
    raid.zmax = zmax; raid.nl = nl;
    raid.finish('extracted');
    return raid.result.bonus;
  };
  assert.equal(bonus(4, 1), 450);
  assert.equal(bonus(1, 0), 50);
});

test('death keeps only the secure case of two items (19 section 8)', () => {
  const raid = sandbox();
  for (const v of [10, 500, 30, 200]) raid.player.inv.push({ kind: 'loot', name: `v${v}`, value: v });
  raid.samples = 3;
  raid.finish('dead');
  assert.deepEqual(raid.result.inv.map((i) => i.value), [500, 200]);
  assert.equal(raid.result.lost, 2);
  assert.equal(raid.result.samples, 0);
});

test('items: Hair Trigger stacking follows the formula and its limit (18-A-05)', () => {
  assert.ok(Math.abs(stackStat(0.08, 1) - 0.08) < 1e-12);
  assert.ok(Math.abs(stackStat(0.08, 20) - (0.08 * 20) / (1 + 0.1 * 19)) < 1e-12);
  for (let s = 1; s <= 200; s++) assert.ok(stackStat(0.08, s) <= 0.8 + 1e-12);
  const raid = sandbox();
  for (let i = 0; i < 20; i++) raid.giveItem('hair_trigger', true);
  assert.ok(Math.abs(raid.player.aspd - (1 + stackStat(0.08, 20))) < 1e-9);
});

test('items: rarity shares at Q 1 and Q 5.2 (18-A-06)', () => {
  const shares = (Q) => {
    const rng = new Rng(9), c = { 0: 0, 1: 0, 3: 0 };
    for (let i = 0; i < 10000; i++) c[ITEMS[rollRunItem(rng, Q)].rarity]++;
    return [c[0] / 100, c[1] / 100, c[3] / 100];
  };
  const a = shares(1), b = shares(5.2);
  assert.ok(Math.abs(a[0] - 70) < 2 && Math.abs(a[1] - 25) < 2 && Math.abs(a[2] - 5) < 1.5, a.join('/'));
  assert.ok(Math.abs(b[0] - 27) < 3 && Math.abs(b[1] - 50) < 3 && Math.abs(b[2] - 23) < 3, b.join('/'));
  const w = itemRarityWeights(1);
  assert.deepEqual(w, [70, 25, 5]);
});

test('rifleman: M2 spends Suppression and each Suppressed body bursts, in place of the ricochet (18-A-02, 64 Package 2)', () => {
  const raid = sandbox();
  const p = raid.player;
  const a = raid.spawnEnemy('dummy', p.x + 8, p.z); a.hp = a.maxHp = 1000;
  const b = raid.spawnEnemy('dummy', p.x + 9, p.z + 2); b.hp = b.maxHp = 1000;      // 2.2 m from a, off the line
  const far = raid.spawnEnemy('dummy', p.x + 14, p.z + 6); far.hp = far.maxHp = 1000; // where the ricochet went
  const civ = raid.spawnEnemy('walker', p.x + 7, p.z - 2, { state: 'civ', isMimic: false }); civ.waitT = 1e9;
  a.st.supp = 3; a.st.suppT = 4;
  run(raid, 0.1, { ...idle, aimX: a.x, aimZ: a.z, m2: true });
  assert.equal(a.st.supp, 0, 'stacks are spent');
  near(1000 - a.hp, 46 * 1.75, 'the line hit');
  near(1000 - b.hp, 20 * (1 + 0.25 * 3), 'the burst');
  assert.equal(far.hp, 1000, 'no ricochet');
  assert.equal(civ.hp, civ.maxHp, 'the burst never touches a human-looking figure');
  assert.equal(raid.lastM2.bursts, 1);
  near(p.cd.m2, 5 - 0.1 + 1 / 60, 'M2 cools for 5 s and costs nothing');
});

test('rifleman: landed rounds load cells; a press during the cooldown spends one (64 Package 2)', () => {
  const raid = sandbox(), p = raid.player;
  const e = bag(raid, 6);
  run(raid, 0.75, { ...idle, aimX: e.x, aimZ: e.z, m1: true });
  assert.equal(p.cellProg, 6, 'two bursts of three landed rounds');
  // Splash and Barrage rounds do not count; 24 landed rounds load one cell.
  raid.fireBullet(p.x + 1, p.z, 1, 0, { dmg: 1 });
  run(raid, 0.2);
  assert.equal(p.cellProg, 6);
  raid.cellRounds(18);
  assert.deepEqual([p.cells, p.cellProg], [1, 0]);
  raid.cellRounds(24 * 5);
  assert.deepEqual([p.cells, p.cellProg], [3, 0], 'three cells at most');
  run(raid, 1 / 60, { ...idle, aimX: e.x, aimZ: e.z, m2: true });
  const cd = p.cd.m2, hp = e.hp;
  assert.ok(cd > 4.9 && p.cells === 3, 'the first press fires off cooldown');
  run(raid, 0.2, { ...idle, aimX: e.x, aimZ: e.z, m2: true });
  assert.equal(p.cells, 3, 'holding the button spends nothing');
  run(raid, 1 / 60, { ...idle, aimX: e.x, aimZ: e.z });
  run(raid, 1 / 60, { ...idle, aimX: e.x, aimZ: e.z, m2: true });
  assert.equal(p.cells, 2, 'a fresh press while it cools spends a cell');
  near(hp - e.hp, 46, 'and fires at once');
  near(p.cd.m2, cd - 14 / 60, 'the cooldown keeps running');
  assert.equal(p.cellShots, 1);
});

test('rifleman: Barrage takes every cell and four rounds a cell burst on Suppressed bodies (64 Package 2)', () => {
  const raid = sandbox(), p = raid.player;
  const a = bag(raid, 6), b = raid.spawnEnemy('dummy', p.x + 6, p.z + 1.6);
  b.hp = b.maxHp = 1e6;
  p.cells = 2;
  run(raid, 1 / 60, { ...idle, aimX: a.x, aimZ: a.z, ult: true });
  assert.equal(p.cells, 0);
  assert.equal(p.channel.bursts, 8);
  a.st.supp = 2; a.st.suppT = 99;
  run(raid, 4.2, { ...idle, aimX: a.x, aimZ: a.z });
  near(b.maxHp - b.hp, 8 * 20 * 1.5, 'eight bursts of 20 x 1.5 on the neighbour');
  assert.equal(a.st.supp, 2, 'Barrage does not spend Suppression');
});

test('kits: four-slot rotation retains damage and cast cooldowns (18-A-01, 15-A-02)', () => {
  // [damage, M2, S and R cooldowns], measured after doc 64 Package 2: no Charge, M2 at 5/4/3/5 s,
  // Blade no longer refunds on Whirl, and the cloud ruptures Venom at its first tick.
  const rotations = {
    rifleman: [363, 5, 5, 40], blade: [410.25, 4, 4, 45],
    summoner: [355.8, 3, 5, 40], toxic: [236.97, 5, 5, 45],
  };
  for (const [classId, expected] of Object.entries(rotations)) {
    const raid = sandbox({ classId });
    const p = raid.player;
    const e = raid.spawnEnemy('dummy', p.x + 2.5, p.z); e.hp = e.maxHp = 5000;
    const slots = new Set();
    for (let i = 0; i < 180; i++) {
      stepRaid(raid, DT, { ...idle, aimX: e.x, aimZ: e.z, m1: true, m2: true, dodge: i > 60, ult: i > 90 });
      for (const ev of raid.events) if (ev.t === 'skill') slots.add(ev.slot);
      raid.events.length = 0;
    }
    assert.deepEqual([...slots].sort(), ['m1', 'm2', 'r', 's'], classId);
    const actual = [e.maxHp - e.hp, p.cdMax.m2, p.cdMax.s, p.cdMax.r];
    assert.deepEqual(actual.map((n) => Number(n.toFixed(6))), expected, classId);
  }
});

test('summoner: the cap of six summons holds, the oldest retires, posted sentries never do (18-A-03)', () => {
  const raid = sandbox({ classId: 'summoner' }), p = raid.player;
  const post = raid.addSummon('sentry', p.x, p.z, Infinity, undefined, { post: true });
  const first = raid.addSummon('sentry', p.x, p.z, 20);
  for (let i = 0; i < 9; i++) raid.addSummon('drone', p.x, p.z, 15);
  assert.equal(raid.summons.length, SUMMON_CAP);
  assert.ok(!raid.summons.includes(first));
  assert.ok(raid.summons.includes(post), 'carried hardware is exempt');
});

test('scan: Mimics are outlined and linked, civilians read as human (03-A-01, 03-A-02)', () => {
  const raid = sandbox();
  const p = raid.player;
  const mimics = [0, 1, 2].map((i) => { const e = raid.spawnEnemy('walker', p.x + 12 + i * 2, p.z + 8, { state: 'disguised' }); e.waitT = 1e9; e.flip = 2; return e; });
  const civs = [0, 1].map((i) => { const e = raid.spawnEnemy('walker', p.x - 12 - i * 2, p.z + 8, { state: 'civ', isMimic: false }); e.waitT = 1e9; return e; });
  run(raid, 0.1, { ...idle, scan: true });
  for (const m of mimics) assert.ok(m.outlineT > 0 && m.linkT > 0);
  for (const c of civs) assert.ok(c.humanT > 0 && c.linkT === 0);
  assert.equal(raid.links, 3);
  run(raid, 3.5);
  for (const m of mimics) assert.equal(m.state, 'hunt', 'the link stayed open for the full flip time');
  for (const c of civs) assert.equal(c.state, 'civ');
});

test('director: hostile count never passes the cap (03-A-05)', () => {
  const raid = new Raid({ world: city, seed: 11 });
  const p = raid.player;
  const z3 = city.containers.find((c) => c.zone === 3 && !c.indoor);
  p.x = z3.x + 2; p.z = z3.z + 2; city.resolveCircle(p, 1);
  p.invuln = true;
  raid.pressT = 60 * 40; raid.surgeT = raid.eliteT = raid.titanT = 1e9;
  let peak = 0;
  for (let i = 0; i < 60 * 40; i++) { stepRaid(raid, DT, idle); raid.events.length = 0; peak = Math.max(peak, raid.hostileCount()); }
  assert.ok(peak > 20, `peak ${peak}`);
  assert.ok(peak <= AUTO_CAP, 'the director stops reinforcing at 32 active hostiles');
  assert.ok(peak <= HOSTILE_CAP, `peak ${peak}`);
});

test('tutorial: the three containers always yield their guaranteed items (16-A-01)', () => {
  const raid = new Raid({ world: annex, seed: 1, mode: 'tutorial', script: makeTutorial() });
  const A = annex.annexData;
  for (const c of A.containers) raid.openContainer(c, raid.cont[c.id]);
  const names = raid.player.inv.map((i) => i.name).sort();
  assert.deepEqual(names, ['Resonant Carapace', 'Sealed Data Case', 'Sealed Data Case']);
  assert.ok(raid.player.inv.find((i) => i.kind === 'gear').unid);
});

test('tutorial: a telegraphed strike deals nothing during the dodge window (16-A-02)', () => {
  const strike = (dodge) => {
    const raid = new Raid({ world: annex, seed: 1, mode: 'tutorial' });
    const p = raid.player, hp = p.hp;
    raid.enemyBlast(p.x, p.z, 8, 1.0, 20);
    run(raid, 0.9);
    // Shift is pressed just before the hit lands; the 8 m ring is too wide to leave.
    run(raid, 0.3, { ...idle, mx: 1, dodge });
    return hp - p.hp;
  };
  assert.ok(strike(false) > 0);
  assert.equal(strike(true), 0);
});

test('tutorial: a scripted operator clears stages A1 to A8', () => {
  const script = makeTutorial();
  const raid = new Raid({ world: annex, seed: 1, mode: 'tutorial', script });
  const A = annex.annexData, p = raid.player;
  const inp = { ...idle };
  const goto = (x, z) => {
    for (const wx of [80.5, 120.5]) if ((p.x < wx - 1 && x > wx + 1) || (p.x > wx + 1 && x < wx - 1)) { x = Math.abs(p.z - 100) > 4 ? p.x : (x > p.x ? wx + 3 : wx - 3); z = 100; break; }
    const d = Math.hypot(x - p.x, z - p.z);
    inp.mx = d > 0.4 ? (x - p.x) / d : 0; inp.mz = d > 0.4 ? (z - p.z) / d : 0;
    return d <= 0.6;
  };
  script.note('camera');
  for (let i = 0; i < 60 * 240 && !raid.over; i++) {
    Object.assign(inp, idle);
    const tgt = raid.nearestTarget(p.x, p.z, 40);
    for (const a of raid.areas) if (a.kind === 'tele' && a.life - a.t < 0.2) inp.dodge = true;
    switch (script.stage) {
      case 0: if (raid.markers.length) goto(raid.markers[0].x, raid.markers[0].z); break;
      case 1: { const c = A.containers.find((k) => !raid.cont[k.id].opened); if (c && goto(c.x, c.z + 1.4)) inp.interact = true; break; }
      case 2: { goto(102, 112); const d = script.dummies.find((k) => k.hp >= k.maxHp) || script.dummies[0]; inp.aimX = d.x; inp.aimZ = d.z; inp.m1 = script.sub === 0; inp.m2 = script.sub === 1; break; }
      case 3: goto(A.strike.x, A.strike.z); break;
      case 4: inp.ult = true; break;
      case 5: case 6: goto(128, 100); inp.scan = script.stage === 5 && script.sub === 0; if (tgt) { inp.aimX = tgt.x; inp.aimZ = tgt.z; inp.m1 = inp.m2 = true; } break;
      default: if (goto(A.extract.x, A.extract.z)) inp.interact = true; break;
    }
    stepRaid(raid, DT, inp);
    raid.events.length = 0;
  }
  assert.equal(raid.over, true, `stuck at stage ${script.stage}`);
  assert.equal(raid.result.outcome, 'extracted');
  assert.equal(raid.result.inv.length, 3);
});

test('boss: the Matron runs three phases and drops her package (22, 23 section 4)', () => {
  const raid = new Raid({ world: city, seed: 77, classId: 'rifleman', tier: 1, gear: gearStats(Object.fromEntries(['weapon', 'body', 'rig', 'backpack'].map((s) => [s, starterItem(s)]))) });
  const p = raid.player, gate = city.pois.find((k) => k.type === 'boss');
  p.x = gate.x; p.z = gate.z;
  raid.noLethal = true;
  run(raid, 3.3, { ...idle, interact: true });
  assert.ok(raid.boss && raid.boss.active, 'holding E at the gate awakens the boss');
  const bot = makeBot({ scanEvery: 0 });
  const phases = new Set();
  let sealed = false;
  for (let i = 0; i < 60 * 600 && raid.boss.active; i++) {
    if (raid.choice) raid.pickChoice(0);
    stepRaid(raid, DT, bot(raid, DT));
    raid.events.length = 0;
    phases.add(raid.boss.phase);
    sealed = sealed || raid.bossArena.sealed;
  }
  assert.deepEqual([...phases].sort(), [1, 2, 3]);
  assert.ok(sealed, 'the arena seals from phase 2');
  assert.equal(raid.bossKilled, true);
  assert.equal(raid.bossArena.sealed, false);
  assert.equal(raid.bossCash, 500);
  assert.equal(raid.pickups.filter((k) => k.kind === 'gear').length + raid.player.inv.filter((k) => k.kind === 'gear' && k.unid).length >= 3, true);
  // A level-up card that lands first is picked too; the cache follows it.
  let cache = false;
  for (let k = 0; k < 6 && !cache; k++) { run(raid, 2); if (raid.choice) { cache = String(raid.choice.title).startsWith('BOSS CACHE'); raid.pickChoice(0); } }
  assert.ok(cache, 'the Boss Cache offers its choice');
  assert.ok(Object.keys(p.items).some((id) => ITEMS[id].rarity === 3), 'the Boss Cache grants a Prototype item');
});

test('boss: leaving before phase 2 resets the fight (22 commit rule)', () => {
  const raid = new Raid({ world: city, seed: 78 });
  const p = raid.player, gate = city.pois.find((k) => k.type === 'boss');
  p.x = gate.x; p.z = gate.z; raid.noLethal = true;
  run(raid, 3.3, { ...idle, interact: true });
  assert.ok(raid.boss);
  p.x = city.boss.x + 60; p.z = city.boss.z;
  run(raid, 0.2);
  assert.equal(raid.boss, null);
  assert.equal(raid.poi[gate.id].used, false);
});

test('gear: item level, affix counts and unidentified sources (23 section 2)', () => {
  const rng = new Rng(4);
  const g = rollGear(rng, { tier: 2, zone: 3, nl: 0.5, source: 'boss', boss: true });
  assert.equal(g.ilvl, 10 * 2 + 2 * 3 + 2 + 3);
  assert.ok(g.unid && g.rarity >= 1);
  assert.equal(g.affixes.length, [0, 1, 2, 3, 3][g.rarity]);
  assert.equal(rollGear(rng, { source: 'container' }).unid, false);
});

test('profile: hub checklist gates the first raid; tiers and costs (16-A-03, 16-A-05, 19 section 6)', () => {
  const p = P.newProfile();
  assert.equal(P.totalRating(p), 40, 'starter kit is Gear Rating 40');
  assert.deepEqual([0, 1, 2, 3, 4].map(enhanceCost), [60, 96, 154, 246, 393]);
  const raid = new Raid({ world: annex, seed: 1, mode: 'tutorial', script: makeTutorial() });
  for (const c of annex.annexData.containers) raid.openContainer(c, raid.cont[c.id]);
  raid.finish('extracted');
  P.applyRaidResult(p, raid.result);
  assert.equal(p.stash.length, 3);
  assert.equal(P.hubReady(p), false);
  p.cash = 0;
  p.samples = 0;
  const cases = p.stash.filter((i) => i.kind === 'loot'), carapace = p.stash.find((i) => i.kind === 'gear');
  assert.equal(P.equipItem(p, carapace.uid).ok, false, 'unidentified gear cannot be equipped');
  assert.ok(P.processItem(p, carapace.uid).ok);
  assert.ok(P.equipItem(p, carapace.uid).ok);
  for (let level = 0; level < 8; level++) assert.ok(P.enhanceItem(p, p.equipped.weapon.uid).ok);
  assert.equal(P.enhanceItem(p, p.equipped.weapon.uid).ok, false, 'free boosts still have a max level');
  assert.ok(P.rerollAffix(p, carapace.uid, 0).ok);
  assert.ok(P.rerollAffix(p, carapace.uid, 0).ok);
  assert.deepEqual([p.cash, p.samples, p.cores], [0, 0, 0]);
  P.sellItem(p, cases[0].uid);
  assert.equal(P.hubChecklist(p)[0].done, false, 'one case sold is not enough');
  P.sellItem(p, cases[1].uid);
  assert.equal(P.hubChecklist(p)[0].done, true);
  assert.equal(p.cash, 200);
  assert.equal(P.setTier(p, 2).ok, false, 'T2 is locked before a T1 extraction');
  assert.equal(P.setTier(p, 4).ok, false, 'no T4 in the demo');
  assert.ok(P.setTier(p, 1).ok && P.setClass(p, 'blade').ok);
  assert.equal(P.setClass(p, 'engineer').ok, false, 'no fifth class');
  p.samples = 2;
  p.cores = 1;
  assert.equal(P.syncHubTutorial(p), true);
  assert.equal(p.tutorial.done, true);
  assert.deepEqual([p.cash, p.samples, p.cores], [0, 0, 0]);
  assert.equal(P.hubReady(p), true);
  assert.equal(P.enhanceItem(p, carapace.uid).ok, false, 'normal costs apply after the tutorial');
  assert.equal(P.rerollAffix(p, carapace.uid, 0).ok, false);
  p.cash = 90;
  assert.equal(P.syncHubTutorial(p), false, 'later visits do not reset balances');
  assert.equal(p.cash, 90);
  assert.ok(P.totalRating(p) > 40);
});

test('profile: first visit restores only missing checklist supplies in an interrupted save', () => {
  const profile = P.newProfile();
  profile.tutorial.annex = true;
  profile.tutorial.sold = 1;
  profile.tutorial.processed = true;
  assert.equal(P.syncHubTutorial(profile), true);
  assert.equal(P.syncHubTutorial(profile), false);
  assert.equal(profile.stash.filter((item) => item.kind === 'loot').length, 1);
  const carapace = profile.stash.find((item) => item.kind === 'gear');
  assert.equal(carapace.unid, false);
  assert.equal(P.sellItem(profile, carapace.uid).ok, true);
  assert.equal(P.syncHubTutorial(profile), true);
  assert.ok(P.equipItem(profile, carapace.uid).ok);
  assert.equal(P.syncHubTutorial(profile), false);
});

test('profile: own storage key, round trip, StormBound key untouched (13-A-04)', () => {
  const store = new Map([['stormbound.profile.v2', '{"keep":"me"}']]);
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.equal(P.loadProfile(storage), null);
  const p = P.newProfile();
  p.cash = 777;
  P.saveProfile(storage, p);
  assert.equal(P.loadProfile(storage).cash, 777);
  assert.equal(store.get('stormbound.profile.v2'), '{"keep":"me"}');
  p.cash = 778;
  P.saveProfile(storage, p);
  assert.equal(JSON.parse(store.get(P.PROFILE_KEY + '.backup')).cash, 777, 'the previous record is kept as a backup');
  store.set(P.PROFILE_KEY, '{broken');
  assert.equal(P.loadProfile(storage), null, 'a damaged profile is rejected, not half loaded');
});

test('raid: a bot survives the first minutes and T2 unlocks after a T1 extraction (15, 19)', () => {
  const p = P.newProfile();
  const raid = new Raid({ world: city, seed: 2024, classId: 'rifleman', tier: 1, gear: P.profileStats(p) });
  raid.autoPick = true;
  const bot = makeBot({ goal: [{ x: OUT.x, z: OUT.z + 30 }, OUT, { x: OUT.x - 40, z: OUT.z }, { x: OUT.x + 60, z: OUT.z }], scanEvery: 0 });
  run(raid, 220, bot);
  assert.equal(raid.over, false, 'still alive after 220 s');
  assert.ok(raid.kills > 0);
  assert.ok(ZONES[raid.zmax].id >= 1);
  raid.finish('extracted');
  P.applyRaidResult(p, raid.result);
  assert.equal(p.tierUnlocked, 2);
  assert.equal(p.stats.extractions, 1);
});

test('horde: waves start 8 s after leaving the Shelter and come at least 14 s apart', () => {
  const raid = new Raid({ world: city, seed: 9 });
  const p = raid.player;
  p.invuln = true;
  run(raid, 12);
  assert.equal(raid.hostileCount(), 0, 'nothing arrives while the operator stays in the Shelter');
  p.x = OUT.x; p.z = OUT.z;
  const waves = [];
  for (let i = 0; i < 60 * 50; i++) { stepRaid(raid, DT, idle); for (const e of raid.events) if (e.t === 'wave') waves.push(i / 60); raid.events.length = 0; }
  assert.ok(waves.length >= 3, `waves at ${waves.map((t) => t.toFixed(1))}`);
  assert.ok(waves[0] > 7.5 && waves[0] < 9, `first wave at ${waves[0].toFixed(1)} s`);
  for (let k = 1; k < waves.length; k++) assert.ok(waves[k] - waves[k - 1] >= 13.9, 'gap of at least 14 s');
});

test('interaction: a hit does not reset progress, and holding E pauses reinforcements', () => {
  const raid = new Raid({ world: city, seed: 14 });
  const p = raid.player, ex = city.extractions[0];
  p.x = ex.x + 1; p.z = ex.z; raid.zone = city.zoneAt(p.x, p.z);
  const hold = { ...idle, interact: true };
  run(raid, 2, hold);
  const before = raid.prompt.progress;
  assert.ok(before > 0.3);
  assert.ok(raid.damagePlayer(5, p.x + 1, p.z), 'the operator still takes damage while extracting');
  run(raid, 0.1, hold);
  assert.ok(raid.prompt.progress > before, 'progress carries on after the hit');
  const wave = raid.waveT;
  run(raid, 1, hold);
  assert.equal(raid.waveT, wave, 'the wave clock is paused while E is held');
  run(raid, 4, hold);
  assert.equal(raid.result.outcome, 'extracted', 'about six seconds in the ring extracts');
});

test('tuning: regular enemies are weaker and Mites pay 5 XP', () => {
  const raid = sandbox();
  const z1 = city.containers.find((c) => c.zone === 1);
  const e = raid.spawnEnemy('walker', z1.x, z1.z);
  assert.ok(Math.abs(e.maxHp - ENEMIES.walker.hp * ENEMY_HP) < 1e-9 && ENEMY_HP === 0.75);
  assert.ok(Math.abs(e.dmg - ENEMIES.walker.dmg * ENEMY_DMG) < 1e-9 && ENEMY_DMG === 0.7);
  assert.equal(ENEMIES.mite.xp, 5);
  for (const k of ['walker', 'mite', 'skitter', 'spitter', 'brute']) assert.ok(ENEMIES[k].windup >= 0.5, `${k} telegraphs for at least half a second`);
});

test('behaviour: attack tokens limit how many melee enemies commit at once', () => {
  const raid = sandbox();
  const p = raid.player;
  p.invuln = true;
  for (let i = 0; i < 10; i++) { const e = raid.spawnEnemy('walker', p.x + Math.cos(i) * 1.6, p.z + Math.sin(i) * 1.6, { state: 'hunt' }); e.atkCd = 0; e.role = 'rusher'; }
  let peak = 0;
  for (let i = 0; i < 240; i++) { stepRaid(raid, DT, idle); peak = Math.max(peak, raid.enemies.filter((e) => e.windupT > 0).length); raid.events.length = 0; }
  assert.ok(peak >= 1 && peak <= 2, `at most two wind up together, saw ${peak}`);
  assert.ok(raid.areas.length >= 0);
});

test('clean dodge: 40% of the S cooldown back plus the class payout; pools never pay (doc 64 Package 2)', () => {
  const dodge = (classId, setup = () => {}) => {
    const raid = sandbox({ classId }), p = raid.player;
    setup(raid);
    p.cd.s = 5; p.iframes = 0.3; raid.time = 1;
    assert.equal(raid.damagePlayer(10, p.x + 1, p.z), false);
    near(p.cd.s, 3, `${classId} S refund`);
    return raid.player;
  };
  assert.equal(dodge('rifleman').cellProg, 8, 'eight rounds of cell progress');
  assert.equal(dodge('blade').momentum, 25);
  assert.equal(dodge('summoner', (r) => { r.player.radioT = 3; }).radioT, 0, 'the radio is ready at once');
  let close, far, civ;
  dodge('toxic', (r) => {
    close = bag(r, 3); far = bag(r, 7);
    civ = r.spawnEnemy('walker', r.player.x - 2, r.player.z, { state: 'civ', isMimic: false }); civ.waitT = 1e9;
  });
  assert.deepEqual([close.st.venom, far.st.venom, civ.st.venom], [1, 0, 0], 'Venom on every hostile within 4 m');
  // Rolling through acid takes no damage and earns nothing.
  const raid = sandbox(), p = raid.player, hp = p.hp;
  raid.addArea({ kind: 'pool', x: p.x, z: p.z, r: 3, life: 2, owner: 'enemy', dps: 20 });
  p.cd.s = 5; p.iframes = 0.3;
  run(raid, 0.25);
  assert.equal(p.hp, hp);
  assert.equal(p.cellProg, 0);
  assert.ok(p.cd.s > 4.7, 'no S refund for a pool');
});

test('synergy: Brands and the Consume event outlive Charge; Rending answers it (doc 64 Package 2)', () => {
  const raid = geared({ aspects: ['rending'] }), p = raid.player;
  const e = bag(raid, 6), side = raid.spawnEnemy('dummy', p.x + 7, p.z + 2.2);
  side.hp = side.maxHp = 1e6;
  e.st.supp = 1; e.st.suppT = 9;
  run(raid, 1 / 60, { ...idle, aimX: e.x, aimZ: e.z, m2: true });
  near(e.maxHp - e.hp, 46 * 1.25, 'the line hit');
  near(side.maxHp - side.hp, 20 * 1.25 + 25, 'the mark burst and Rending on the neighbour');
});

test('blade: momentum from cuts, its ebb, and a whirl that travels on it (64 Package 2)', () => {
  const raid = sandbox({ classId: 'blade' }), p = raid.player;
  p.face = 0;
  const civ = raid.spawnEnemy('walker', p.x + 1.5, p.z + 0.5, { state: 'civ', isMimic: false });
  civ.waitT = 1e9; civ.hp = civ.maxHp = 1e6;
  bag(raid, 1.6);
  castSkill(raid, 'm1', { ...idle, aimX: p.x + 5, aimZ: p.z });
  assert.equal(p.momentum, 9, 'a cut pays 9 for each enemy struck; a civilian pays nothing');
  bag(raid, 2); bag(raid, 2.4);
  p.dash = null; castSkill(raid, 'm1', { ...idle, aimX: p.x + 5, aimZ: p.z });
  assert.equal(p.momentum, 27, 'two enemies a swing at most');
  p.momentum = 60; p.momT = raid.time;
  run(raid, 1.9);
  assert.equal(p.momentum, 60, 'it holds for 2 s');
  run(raid, 1);
  assert.ok(Math.abs(p.momentum - 37.5) < 1, `then falls 25 a second: ${p.momentum}`);
  // Whirl spends it all and travels 1 + 5 x momentum / 100 m along the move input.
  const go = (m) => {
    const r = sandbox({ classId: 'blade' }), q = r.player;
    q.momentum = m; q.momT = 0;
    run(r, 1 / 60, { ...idle, mx: 1, aimX: q.x, aimZ: q.z - 5, m2: true });
    const x0 = q.x; // the dash starts moving on the next step
    run(r, 0.4);
    assert.equal(q.momentum, 0);
    return q.x - x0;
  };
  near(go(100), 6, 'full momentum'); near(go(0), 1, 'none');
  // An Exposed body it hits is consumed, shoved 4 m and takes 1.5 times damage.
  const r = sandbox({ classId: 'blade' }), q = r.player;
  const w = r.spawnEnemy('walker', q.x + 2.5, q.z, { state: 'hunt' });
  w.hp = w.maxHp = 1e6; w.speed = 0; w.atkCd = 99; w.st.exposedT = 5;
  const wx = w.x;
  run(r, 1 / 60, { ...idle, aimX: q.x, aimZ: q.z + 5, m2: true });
  near(w.maxHp - w.hp, 50 * 1.5);
  assert.equal(w.st.exposedT, 0);
  run(r, 1);
  assert.ok(w.x - wx > 3.6, `shoved ${(w.x - wx).toFixed(2)} m`);
});

test('blade: a fresh opening knocks one plate fragment loose; its barrier refreshes, never stacks (64 Package 2)', () => {
  const raid = sandbox({ classId: 'blade' }), p = raid.player;
  const cut3 = () => { p.face = 0; p.combo = 2; p.dash = null; castSkill(raid, 'm1', { ...idle, aimX: p.x + 5, aimZ: p.z }); };
  const a = bag(raid, 1.6);
  cut3();
  assert.equal(raid.fragments.length, 1);
  const f = raid.fragments[0];
  near(f.x, a.x + a.r + 1.5, 'beyond the body'); near(f.z, a.z);
  cut3();
  assert.equal(raid.fragments.length, 1, 'an open guard opens once');
  a.st.exposedT = 0; cut3();
  assert.equal(raid.fragments.length, 1, 'one on the floor per hostile');
  for (const dz of [-1, -0.4, 0.6, 1.1]) { const e = raid.spawnEnemy('dummy', p.x + 1.3, p.z + dz); e.hp = e.maxHp = 1e6; }
  cut3();
  assert.equal(raid.fragments.length, 3, 'three on the floor at most');
  // Crossing one gives 15% of maximum health for 4 s; a second refreshes it and does not stack.
  const share = p.maxHp * 0.15;
  p.x = raid.fragments[0].x; p.z = raid.fragments[0].z;
  run(raid, 1 / 60);
  assert.equal(raid.fragments.length, 2);
  near(p.shield, share);
  run(raid, 1);
  near(p.shield, share, 'no Hardlight does not wipe a granted barrier');
  p.shield = share / 2;
  p.x = raid.fragments[0].x; p.z = raid.fragments[0].z;
  run(raid, 1 / 60);
  near(p.shield, share, 'refreshed, not stacked');
  near(p.shieldT, 4);
  run(raid, 5);
  assert.equal(p.shield, 0, 'then it runs out');
  assert.equal(raid.fragments.length, 0, 'and fragments leave the floor after 6 s');
  // Never from a disguised figure, and a disguise pays no momentum.
  const r2 = sandbox({ classId: 'blade' }), q = r2.player;
  const d = r2.spawnEnemy('walker', q.x + 1.6, q.z, { state: 'disguised' });
  d.hp = d.maxHp = 1e6; d.waitT = 1e9;
  q.face = 0; q.combo = 2;
  castSkill(r2, 'm1', { ...idle, aimX: q.x + 5, aimZ: q.z });
  assert.equal(d.state, 'revealing');
  assert.deepEqual([r2.fragments.length, q.momentum], [0, 0]);
});

test('summoner: post, pack and recall carried sentries; an Order bursts on the first sentry shot (64 Package 2)', () => {
  const raid = sandbox({ classId: 'summoner' }), p = raid.player;
  const m2 = (dx, dz) => { p.cd.m2 = 0; p.face = Math.atan2(dz, dx); return raid.castM2({ ...idle, aimX: p.x + dx, aimZ: p.z + dz }); };
  assert.equal(p.carried, 2);
  m2(5, 0);
  const s1 = raid.summons[0];
  assert.deepEqual([p.carried, s1.post, s1.t, s1.lane], [1, true, Infinity, 0], 'posted facing the aim, with no lifetime');
  m2(0, 5);
  assert.equal(p.carried, 0);
  run(raid, 30);
  assert.equal(raid.summons.length, 2, 'posts stay');
  assert.equal(m2(-4, 0), true);
  assert.ok(!raid.summons.includes(s1), 'with none carried, M2 recalls the oldest');
  assert.equal(p.carried, 0);
  run(raid, 4.1);
  assert.equal(p.carried, 1, 'it is back after 4 s');
  const s2 = raid.summons[0];
  p.x = s2.x + 1; p.z = s2.z;
  m2(5, 0);
  assert.deepEqual([p.carried, raid.summons.length], [2, 0], 'within 2 m, M2 packs the post');
  // Radio: a ready radio rides on the grenade as an Order on the hostile nearest the impact.
  const r = sandbox({ classId: 'summoner' }), q = r.player;
  // (A wall stands 8 m east of the insertion point; keep the lane inside it.)
  const t = bag(r, 6.3), side = r.spawnEnemy('dummy', q.x + 6.3, q.z + 1.5), behind = r.spawnEnemy('dummy', q.x - 4.3, q.z + 0.2);
  for (const e of [side, behind]) e.hp = e.maxHp = 1e6;
  q.face = 0;
  castSkill(r, 'm1', { ...idle, aimX: t.x, aimZ: t.z });
  run(r, 0.5);
  assert.ok(t.st.orderT > 0 && side.st.orderT === 0, 'one Order, on the nearest');
  assert.ok(q.radioT > 3.4, 'the radio recovers for 4 s');
  q.cd.m2 = 0; q.face = 0; r.castM2({ ...idle, aimX: q.x + 2.2, aimZ: q.z + 0.1 });
  run(r, 0.4);
  near(t.maxHp - t.hp, 26 + 9 * 1.4, 'the grenade, then the first sentry shot at +40%');
  near(side.maxHp - side.hp, 26 + 20, 'the grenade, then the Order burst');
  assert.equal(t.st.orderT, 0, 'an Order is answered once');
  run(r, 2);
  assert.equal(behind.hp, behind.maxHp, 'nothing outside the lane is shot');
});

test('toxic: a Wither Cloud ruptures each Venomed host once for the Venom still to come (64 Package 2)', () => {
  for (const [stacks, expected] of [[1, 12.6], [5, 63]]) {
    const raid = sandbox({ classId: 'toxic' }), e = bag(raid, 6), m2 = raid.skillBuild.slots.m2.params, hits = [];
    e.st.venom = stacks; e.st.venomT = 6 + DT; // six seconds left at contact
    witherCloudArea(raid, e.x, e.z, m2.radius, m2.duration, m2.dps, m2, { m2: true });
    for (let i = 0; i < 90; i++) { stepRaid(raid, DT, idle); for (const ev of raid.events) if (ev.t === 'dmg' && !ev.dot) hits.push(ev.amount); raid.events.length = 0; }
    assert.equal(hits.length, 1, 'once per cloud');
    near(hits[0], expected, `rupture from ${stacks}`);
    assert.equal(e.st.venom, 0, 'and the Venom is cleared');
  }
});

test('toxic: Plague Burst moves the leader\'s stacks one a hop instead of setting every host to five (64 Package 2)', () => {
  const raid = sandbox({ classId: 'toxic' }), p = raid.player;
  const lead = bag(raid, 6), hosts = [9, 12, 15].map((dx) => bag(raid, dx));
  lead.st.venom = 2; lead.st.venomT = 5;
  castSkill(raid, 'r', { ...idle, aimX: lead.x, aimZ: lead.z });
  run(raid, 2);
  assert.deepEqual([lead, ...hosts].map((e) => e.st.venom), [0, 1, 1, 0]);
  assert.ok(hosts.every((e) => e.st.plagueT > 0), 'the plague itself still hops');
  assert.equal(p.dead, false);
});

test('items: the six Charge items are gone and never offered (64 Package 2)', () => {
  const gone = ['capacitor', 'overflow', 'feedback', 'catalyst', 'afterglow', 'echo'];
  for (const id of gone) assert.ok(!ITEM_IDS.includes(id) && !ITEMS[id], id);
  const raid = new Raid({ world: city, seed: 31 });
  for (let i = 0; i < 300; i++) { raid.nl = (i % 10) / 10; for (const id of levelChoices(raid)) assert.ok(ITEMS[id] && !gone.includes(id), id); }
  const rng = new Rng(3);
  for (let i = 0; i < 2000; i++) assert.ok(!gone.includes(rollRunItem(rng, 5, i % 4)));
});

test('profile: old gear with Charge affixes and retired Aspects loads and does the new thing or nothing (64 Package 2)', () => {
  const p = P.newProfile();
  p.equipped.weapon = { ...p.equipped.weapon, uid: 'old-w', starter: false, rarity: 3, aspect: 'twinned', affixes: [{ k: 'charge', v: 9 }, { k: 'cgain', v: 50 }, { k: 'spend', v: 10 }] };
  p.equipped.backpack = { ...p.equipped.backpack, uid: 'old-b', starter: false, rarity: 2, aspect: 'scavenger', affixes: [] };
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  P.saveProfile(storage, p);
  const st = P.profileStats(P.loadProfile(storage));
  assert.ok(st.aspects.includes('scavenger') && st.charge === 9);
  const raid = new Raid({ world: city, seed: 5, mode: 'sandbox', classId: 'blade', gear: st });
  near(raid.player.cgain, 1.5, 'Charge gain is now class resource gain');
  raid.addMomentum(10);
  near(raid.player.momentum, 15);
  near(raid.damagePool('skill', { m2: true }) - raid.damagePool('skill'), 0.1, 'Spender damage is now M2 damage');
  assert.equal(GEAR_AFFIX_IDS.includes('charge'), false, 'and Max Charge is never rolled again');
});

test('damage: like lines share one pool, then one crit factor (doc 64 Package 1, doc 53)', () => {
  // Worked example: +15% weapon damage, raid level 6 (+10%), two Spike Gloves and a crit.
  const raid = geared({ dmg: 15 }), p = raid.player;
  p.level = 6; raid.giveItem('spike_gloves', true); raid.giveItem('spike_gloves', true);
  p.crit = 1;
  const pool = 1 + 0.15 + 0.10 + stackStat(0.1, 2);
  near(raid.playerHit(bag(raid), 100, 'melee'), 100 * pool * 1.75, 'melee crit'); // 250.6; multiplied lines gave 261.6
  // Doc 53's shot: Piercing Line with three Suppression (base 80.5), +15% gear and +10% raid lines.
  p.crit = 0;
  const e = bag(raid, 6);
  e.st.supp = 3; e.st.suppT = 4;
  run(raid, 0.05, { ...idle, aimX: e.x, aimZ: e.z, m2: true });
  near(e.maxHp - e.hp, 46 * 1.75 * 1.25, 'piercing line');
  // The old "Spender damage" affix is now M2 damage: it no longer reaches other skill hits.
  const m2 = geared({ spend: 10 }), t = bag(m2, 6);
  near(m2.playerHit(bag(m2), 100, 'skill', { noProc: true }), 100, 'a non-M2 skill hit');
  t.st.supp = 3; t.st.suppT = 4;
  run(m2, 0.05, { ...idle, aimX: t.x, aimZ: t.z, m2: true });
  near(t.maxHp - t.hp, 46 * 1.75 * 1.1, 'M2 hit');
});

test('damage: gear adds at most +150% to a pool; other lines still add (doc 64 Package 1)', () => {
  const raid = geared({ dmg: 120, skill: 60 }), p = raid.player;
  near(raid.playerHit(bag(raid), 100, 'skill'), 250);
  p.level = 11; raid.recalc(); p.crit = 0;
  near(raid.playerHit(bag(raid), 100, 'skill'), 100 * (1 + 1.5 + 0.18), 'the raid level line passes the gear cap');
  near(geared({ dmg: 40 }).playerHit(bag(raid), 100, 'ballistic'), 140, 'under the cap gear adds in full');
});

test('damage: the Armored plate takes half a hit, never more than it has left (doc 64 Package 1)', () => {
  const raid = sandbox(), p = raid.player;
  const e = raid.spawnEnemy('walker', p.x + 4, p.z, { elite: ['armored'] });
  e.hp = e.maxHp = 1e4;
  e.plate = 100;
  near(raid.damageEnemy(e, 100), 50, 'full plate');
  near(e.plate, 50);
  e.plate = 10;
  near(raid.damageEnemy(e, 100), 90, 'a thin plate absorbs only what it has');
  assert.equal(e.plate, 0);
  assert.equal(e.plateT, 8, 'and breaks');
});

test('damage: a copied cast reuses the crit its original rolled (doc 64 Package 1)', () => {
  for (const first of [true, false]) {
    const raid = geared({ aspects: ['twinned'] }), p = raid.player, e = bag(raid, 6);
    p.cells = 3; p.crit = first ? 1 : 0; // Twinned repeats an M2 cast at full resource
    run(raid, 1 / 60, { ...idle, aimX: e.x, aimZ: e.z, m2: true });
    const original = e.maxHp - e.hp;
    near(original, 46 * (first ? 1.75 : 1));
    p.crit = first ? 0 : 1; // the copy must not roll with the new chance
    run(raid, 0.5, { ...idle, aimX: e.x, aimZ: e.z });
    near(e.maxHp - e.hp - original, 46 * 0.4 * (first ? 1.75 : 1), `copy after a ${first ? '' : 'non-'}crit`);
  }
});

test('damage: a spent Brand is removed after its hit and is not a vulnerability for it (doc 53)', () => {
  const raid = sandbox({ classId: 'blade' }), p = raid.player;
  raid.skillBuild.stats.brandBonus = 0.3; // a Catalyst-style line; no run item grants one since Package 2
  const open = bag(raid, 2), both = raid.spawnEnemy('dummy', p.x - 2, p.z);
  both.hp = both.maxHp = 1e6;
  open.st.exposedT = 5; both.st.exposedT = 5; both.st.markT = 5;
  run(raid, 1 / 60, { ...idle, aimX: open.x, aimZ: open.z, m2: true });
  near(open.maxHp - open.hp, 50 * 1.5, 'the Exposed the swing spends is its x1.5, not also a vulnerability');
  near(both.maxHp - both.hp, 50 * 1.5 * 1.3, 'a Mark it does not spend still is');
  assert.equal(open.st.exposedT, 0);
});

test('damage: a Wither Cloud copy keeps the power it was cast with (doc 64 Package 1)', () => {
  const raid = sandbox({ classId: 'toxic' }), p = raid.player, e = bag(raid, 6), ticks = [];
  raid.powerMul = 0.4;
  castSkill(raid, 'm2', { ...idle, aimX: e.x, aimZ: e.z });
  raid.powerMul = 1;
  for (let i = 0; i < 60; i++) { stepRaid(raid, DT, idle); for (const ev of raid.events) if (ev.t === 'dmg' && ev.dot) ticks.push(ev.amount); raid.events.length = 0; }
  assert.ok(ticks.length >= 2);
  for (const d of ticks) near(d, 14 * 0.25 * 0.4);
  assert.equal(p.dead, false);
});

test('gear: Rare items roll an Aspect for their slot and it takes effect when worn (doc 24, 64 Package 2)', () => {
  const rng = new Rng(21);
  for (let i = 0; i < 40; i++) {
    const g = rollGear(rng, { source: 'elite', zone: 2 });
    // The backpack's only Aspect, Scavenger, left with Charge.
    if (g.rarity >= 2 && g.slot !== 'backpack') assert.equal(ASPECTS[g.aspect].slot, g.slot); else assert.equal(g.aspect, null);
    assert.ok(g.affixes.every((a) => a.k !== 'charge'), 'Max Charge is never rolled');
  }
  const eq = Object.fromEntries(['weapon', 'body', 'rig', 'backpack'].map((s) => [s, starterItem(s)]));
  eq.rig = { ...eq.rig, aspect: 'primed', rarity: 2 };
  eq.weapon = { ...eq.weapon, aspect: 'twinned', rarity: 2 };
  const raid = new Raid({ world: city, seed: 5, mode: 'sandbox', gear: gearStats(eq) });
  const p = raid.player;
  assert.equal(p.cells, 3, 'Primed starts the raid with the resource full');
  const e = raid.spawnEnemy('dummy', p.x + 6, p.z); e.hp = e.maxHp = 1e6;
  let casts = 0;
  for (let i = 0; i < 60; i++) { stepRaid(raid, DT, { ...idle, aimX: e.x, aimZ: e.z, m2: i < 2 }); casts += raid.events.filter((v) => v.t === 'skill' && v.slot === 'm2').length; raid.events.length = 0; }
  assert.equal(casts, 2, 'Twinned repeats an M2 cast made at full resource');
  // Bulwark: each M2 gives a barrier of 6% of maximum health, even with no Hardlight.
  const bw = geared({ aspects: ['bulwark'] }), b = bw.player;
  bw.castM2({ ...idle, aimX: b.x + 5, aimZ: b.z });
  run(bw, 0.5);
  near(b.shield, b.maxHp * 0.06);
});

test('horde: a Surge rings the operator every minute and a Titan comes at five', () => {
  const raid = new Raid({ world: city, seed: 10 });
  const p = raid.player;
  p.invuln = true; p.x = OUT.x; p.z = OUT.z;
  raid.pressT = 59.5;
  const before = raid.enemies.length;
  let surge = false;
  for (let i = 0; i < 90; i++) { stepRaid(raid, DT, idle); if (raid.events.some((e) => e.t === 'banner' && e.title === 'SURGE')) surge = true; raid.events.length = 0; }
  assert.ok(surge);
  const added = raid.enemies.length - before;
  assert.ok(added >= 4 && added <= 12 + 14, `a Surge adds up to 12 (plus at most one wave): ${added}`);
  raid.pressT = 299.9; raid.surgeT = 1e9;
  run(raid, 0.5);
  assert.ok(raid.enemies.some((e) => e.kind === 'titan'));
});

test('levels: each level-up in a raid offers three distinct run items', () => {
  const raid = new Raid({ world: city, seed: 12 });
  raid.addXp(raid.xpNeed(1));
  assert.equal(raid.player.level, 2);
  stepRaid(raid, DT, idle);
  assert.ok(raid.choice, 'the raid pauses on a choice');
  assert.equal(new Set(raid.choice.ids).size, 3);
  const time = raid.time;
  stepRaid(raid, DT, idle);
  assert.equal(raid.time, time, 'paused until a card is picked');
  raid.pickChoice(1);
  assert.equal(raid.player.itemCount, 1);
  stepRaid(raid, DT, idle);
  assert.ok(raid.time > time);
});

test('run items: the horde tools hit enemies on their own', () => {
  for (const id of ['arc_emitter', 'orbit_blades', 'nova_core']) {
    const raid = sandbox();
    const p = raid.player;
    const e = raid.spawnEnemy('dummy', p.x + 2.6, p.z); e.hp = e.maxHp = 5000;
    raid.giveItem(id, true);
    run(raid, 7);
    assert.ok(e.hp < e.maxHp, id);
  }
  const raid = sandbox();
  const p = raid.player;
  raid.giveItem('piercer', true);
  const a = raid.spawnEnemy('dummy', p.x + 2.5, p.z), b = raid.spawnEnemy('dummy', p.x + 4.5, p.z), c = raid.spawnEnemy('dummy', p.x + 6.5, p.z);
  for (const e of [a, b, c]) e.hp = e.maxHp = 500;
  raid.fireBullet(p.x + 1, p.z, 1, 0, { dmg: 10 });
  run(raid, 0.5);
  assert.ok(a.hp < 500 && b.hp < 500 && c.hp < 500, 'a Tungsten Core shot passes through three targets');
});

test('monsters: a Mote beam hits along its locked line and can be sidestepped', () => {
  const shot = (dodge) => {
    const raid = sandbox();
    const p = raid.player, hp = p.hp;
    const e = raid.spawnEnemy('mote', p.x + 12, p.z, { state: 'hunt' });
    e.atkCd = 0; e.speed = 0; e.los = true; e.losT = 5;
    run(raid, 0.3);
    assert.ok(e.windupT > 0, 'the Mote charges');
    run(raid, 1.2, { ...idle, mz: dodge ? 1 : 0, aimX: p.x, aimZ: p.z - 5 });
    return hp - p.hp;
  };
  assert.ok(shot(false) > 0);
  assert.equal(shot(true), 0);
});
