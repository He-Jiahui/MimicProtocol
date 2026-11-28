// Training (docs 52, 54; doc 64 Package 7): three aptitudes, converted once at deployment into
// direct stats that enter their existing pools once; nothing found in a raid writes back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid } from '../src/sim/raid.js';
import { stackStat } from '../src/sim/data.js';
import { gearStats } from '../src/sim/loot.js';
import { castSkill } from '../src/sim/skills.js';
import { speedMul } from '../src/sim/pack.js';
import { trainingBase, trainingFree, trainingStats, xpForLevel } from '../src/sim/progress.js';
import * as P from '../src/sim/profile.js';
import { t } from '../src/i18n/index.js';

const city = generateWorld(20261125);
const near = (actual, expected, msg = '') => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg} ${actual} vs ${expected}`);
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const memory = () => { const store = new Map(); return { store, getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }; };
const deploy = (p, classId, o = {}) => {
  const d = P.deployment(p, classId);
  return new Raid({ world: city, seed: 5, mode: 'sandbox', classId, tree: d.tree, training: d.training, gear: gearStats(p.equipped), ...o });
};
// The starting sheet: everything recalc derives before the first step.
const sheet = (raid) => {
  const p = raid.player;
  return { hp: p.hp, maxHp: p.maxHp, aspd: p.aspd, speed: p.speed, crit: p.crit, dr: p.dr, searchRate: p.searchRate, hackRate: p.hackRate,
    summonDur: p.summonDur, venomDur: p.venomDur, freeKg: p.freeKg, loadMul: p.loadMul, cells: p.cells, build: raid.skillBuild };
};

test('training: primary 6, others 3, one free point at levels 3, 6, 9, 12, 15 and 18', () => {
  assert.deepEqual(trainingBase('rifleman'), { handling: 6, conditioning: 3, systems: 3 });
  assert.deepEqual(trainingBase('blade'), { handling: 3, conditioning: 6, systems: 3 });
  assert.deepEqual(trainingBase('summoner'), { handling: 3, conditioning: 3, systems: 6 });
  assert.deepEqual(trainingBase('toxic'), { handling: 3, conditioning: 3, systems: 6 });
  assert.deepEqual([1, 2, 3, 5, 6, 17, 18, 20].map(trainingFree), [0, 0, 1, 1, 2, 5, 6, 6]);
  // Converted through e x n / (1 + 0.1 (n - 1)): later points are worth less.
  const { points, direct } = trainingStats('rifleman', { handling: 2, conditioning: 0, systems: 0 });
  assert.deepEqual(points, { handling: 8, conditioning: 3, systems: 3 });
  near(direct.m1Rate, 0.015 * 8 / 1.7); near(direct.searchRate, 0.03 * 8 / 1.7);
  near(direct.hp, 3 * 3 / 1.2); near(direct.freeKg, 0.5 * 3 / 1.2);
  near(direct.summonDur, 0.025 * 3 / 1.2); near(direct.venomDur, 0.025 * 3 / 1.2); near(direct.terminalRate, 0.03 * 3 / 1.2);
  assert.ok(stackStat(0.015, 12) < 0.015 * 12 && stackStat(0.015, 12) - stackStat(0.015, 11) < 0.015);
});

test('training: re-assignable in the hub within the free points; a damaged record is cleared on load', () => {
  const p = P.newProfile();
  assert.equal(t(P.trainPoint(p, 'blade', 'handling', 1).why), 'No training points left (0 earned)');
  p.classes.blade.xp = xpForLevel(6);
  assert.ok(P.trainPoint(p, 'blade', 'handling', 1).ok && P.trainPoint(p, 'blade', 'systems', 1).ok);
  assert.equal(P.trainPoint(p, 'blade', 'conditioning', 1).ok, false, 'two free points at level 6');
  assert.equal(P.trainPoint(p, 'blade', 'conditioning', -1).ok, false, 'the starting split is the class\'s own');
  assert.ok(P.trainPoint(p, 'blade', 'systems', -1).ok && P.trainPoint(p, 'blade', 'conditioning', 1).ok, 'free to move');
  assert.deepEqual(P.trainingState(p, 'blade').points, { handling: 4, conditioning: 7, systems: 3 });
  assert.equal(P.trainingState(p, 'rifleman').free, 0, 'points belong to the class that earned them');
  P.resetTraining(p, 'blade');
  assert.equal(P.trainingState(p, 'blade').left, 2);
  const storage = memory();
  p.classes.toxic = { xp: xpForLevel(4), tree: {}, train: { handling: 3, conditioning: 0, systems: 0 } };
  p.classes.summoner = { xp: xpForLevel(9), tree: {}, train: { handling: 1.5, conditioning: -2, systems: 2 } };
  storage.setItem(P.PROFILE_KEY, JSON.stringify(p));
  const q = P.loadProfile(storage);
  assert.deepEqual(q.classes.toxic.train, { handling: 0, conditioning: 0, systems: 0 }, 'three assigned with one earned: cleared');
  assert.deepEqual(q.classes.summoner.train, { handling: 0, conditioning: 0, systems: 2 });
});

test('training enters each pool once: flat health before percentages, M1 rate and duration sums', () => {
  const p = P.newProfile();
  p.classes.rifleman.xp = xpForLevel(9);
  for (const a of ['handling', 'handling', 'conditioning']) assert.ok(P.trainPoint(p, 'rifleman', a, 1).ok);
  const D = trainingStats('rifleman', p.classes.rifleman.train).direct;
  p.equipped.body = { ...p.equipped.body, uid: 'coat', starter: false, affixes: [{ k: 'hp', v: 10 }] };
  p.equipped.hands = { ...p.equipped.hands, uid: 'gloves', starter: false, affixes: [{ k: 'aspd', v: 10 }, { k: 'cgain', v: 20 }] };
  const g = gearStats(p.equipped), raid = deploy(p, 'rifleman'), r = raid.player;
  assert.equal(r.maxHp, Math.round((110 + D.hp) * (1 + g.hp / 100)), 'Conditioning is flat on the base, then gear\'s percentage');
  near(raid.skillBuild.attackSpeed, 1 + g.aspd / 100 + D.m1Rate, 'one rate sum with gear');
  near(raid.skillBuild.slots.m1.params.interval, 0.42 / (1 + g.aspd / 100 + D.m1Rate));
  raid.giveItem('hair_trigger', true);
  near(raid.skillBuild.attackSpeed, 1 + g.aspd / 100 + D.m1Rate + 0.08, 'a run item joins the same sum, training still once');
  near(r.searchRate, 1 + D.searchRate); near(r.hackRate, 1 + D.terminalRate);
  near(r.venomDur, 1 + g.cgain / 100 + D.venomDur, 'Venom duration shares the class resource gain pool');
  near(r.freeKg, 10 + D.freeKg);
  near(speedMul(10 + D.freeKg, r.freeKg), 1, 'free carry is free');
  // The same lines reach the actions they speed up or lengthen.
  const c = city.containers.find((k) => k.zone === 1);
  r.x = c.x; r.z = c.z;
  const base = new Raid({ world: city, seed: 5, mode: 'sandbox' });
  base.player.x = c.x; base.player.z = c.z;
  near(base.findInteract().need / raid.findInteract().need, 1 + D.searchRate, 'container search');
  const term = city.pois.find((k) => k.type === 'terminal');
  for (const q of [r, base.player]) { q.x = term.x; q.z = term.z; }
  const ti = raid.findInteract(), tb = base.findInteract();
  assert.deepEqual([ti.type, tb.type], ['terminal', 'terminal']);
  near(tb.need / ti.need, 1 + D.terminalRate, 'terminal hack');
  const sm = deploy(p, 'summoner');
  castSkill(sm, 'r', idle);
  near(sm.summons[0].t, 15 * (1 + trainingStats('summoner', {}).direct.summonDur), 'drones stay longer on Systems 6');
  const tx = deploy(p, 'toxic'), host = tx.spawnEnemy('dummy', tx.player.x + 4, tx.player.z);
  tx.addVenom(host, 1, tx.skillBuild.slots.m1.params);
  near(host.st.venomT, 6 * (1 + g.cgain / 100 + trainingStats('toxic', {}).direct.venomDur));
});

test('training: the same profile always produces the same starting sheet, and a raid writes nothing back', () => {
  const p = P.newProfile();
  p.classes.summoner.xp = xpForLevel(12);
  for (const a of ['systems', 'conditioning', 'handling']) P.trainPoint(p, 'summoner', a, 1);
  for (const id of ['wideMarker', 'longToss', 'wideLane', 'post']) assert.ok(P.takeNode(p, 'summoner', id).ok, id);
  const before = JSON.parse(JSON.stringify(p.classes.summoner)), dep = P.deployment(p, 'summoner');
  assert.deepEqual(P.deployment(p, 'summoner'), dep);
  assert.ok(Object.isFrozen(dep.training));
  const a = deploy(p, 'summoner'), b = deploy(p, 'summoner');
  assert.deepEqual(sheet(a), sheet(b));
  // An exceptional raid: run items, levels, Mimic Heart stacks, a boss. None of it is training.
  for (const id of ['plating', 'plating', 'hair_trigger', 'overwatch', 'mimic_heart']) a.giveItem(id, true);
  a.addXp(5000); a.player.heart = 0.1; a.recalc();
  a.kills = 300; a.elites = 9; a.bossKilled = true;
  a.finish('extracted');
  P.applyRaidResult(p, a.result);
  assert.ok(p.classes.summoner.xp > before.xp, 'the raid paid class experience');
  assert.deepEqual(p.classes.summoner.train, before.train, 'and nothing else');
  assert.deepEqual(p.classes.summoner.tree, before.tree);
  assert.deepEqual(P.deployment(p, 'summoner').training, dep.training);
  assert.deepEqual(sheet(deploy(p, 'summoner')), sheet(b), 'the next deployment starts from the same sheet');
});
