// Persistent class progression (doc 64, Package 7): levels, experience kept on death.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid } from '../src/sim/raid.js';
import { makeTutorial } from '../src/sim/tutorial.js';
import { CLASS_IDS } from '../src/sim/data.js';
import * as P from '../src/sim/profile.js';
import { CLASS_MAX_LEVEL, XP_CAP, xpToNext, xpForLevel, classLevel, raidXp } from '../src/sim/progress.js';

const city = generateWorld(20261125);
const annex = generateWorld(20261125, { annex: true });
const memory = (entries = []) => { const store = new Map(entries); return { store, getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }; };
const result = (o = {}) => ({
  mode: 'raid', outcome: 'dead', tier: 1, classId: 'rifleman', value: 0, bonus: 0, contractPay: 0, bossCash: 0, credits: 0, creditCash: 0, drone: null, taken: 0,
  penalty: 0, inv: [], cargo: [], lost: 0, pack: null, packOut: null, samples: 0, cores: 0, bossKilled: false, kills: 0, elites: 0, civKills: 0, items: 0, level: 1,
  zmax: 0, nl: 0, clock: 18.5, seconds: 60, searched: 0, contracts: [], ...o,
});

test('levels: the next level needs 120 x level^1.4 and the demo stops at 20 (doc 64 Package 7)', () => {
  assert.deepEqual([1, 2, 3, 10, 19].map(xpToNext), [120, 317, 559, 3014, 7403]);
  assert.equal(xpToNext(CLASS_MAX_LEVEL), 0);
  assert.deepEqual(classLevel(0), { level: 1, xp: 0, need: 120, max: false });
  assert.deepEqual(classLevel(119), { level: 1, xp: 119, need: 120, max: false });
  assert.deepEqual(classLevel(120), { level: 2, xp: 0, need: 317, max: false });
  assert.equal(classLevel(xpForLevel(17)).level, 17);
  assert.equal(classLevel(xpForLevel(17) - 1).level, 16);
  assert.deepEqual(classLevel(XP_CAP * 3), { level: 20, xp: 0, need: 0, max: true });
});

test('experience: 20 x (raid level - 1) + 2 x kills + 30 x elites + 150 boss + 60 extraction', () => {
  assert.equal(raidXp({ level: 6, kills: 40, elites: 2, boss: true, extracted: true }).total, 100 + 80 + 60 + 150 + 60);
  assert.equal(raidXp({ level: 1, kills: 0 }).total, 0);
  // The raid reports it on every ending; dying keeps it, a boss killed before dying included.
  const raid = new Raid({ world: city, seed: 3, classId: 'blade' });
  raid.player.level = 4; raid.kills = 25; raid.elites = 1; raid.bossKilled = true;
  raid.finish('dead');
  assert.deepEqual(raid.result.classXp, { level: 60, kills: 50, elites: 30, boss: 150, extract: 0, jobs: 0, total: 290 });
  assert.equal(raidXp({ jobs: 75 }).total, 75, 'field jobs pay 25 a star');
  assert.equal(raid.result.bossKilled, false, 'the boss bounty still needs an extraction');
});

test('experience is banked on the class that ran, kept on death, and shown at debrief', () => {
  const p = P.newProfile();
  const d = P.applyRaidResult(p, result({ classId: 'blade', level: 5, kills: 21, elites: 1 })); // 80 + 42 + 30
  assert.equal(p.classes.blade.xp, 152);
  assert.equal(p.classes.rifleman.xp, 0, 'switching class transfers nothing');
  assert.deepEqual([d.classXp.gain, d.classXp.from, d.classXp.to, d.classXp.xp, d.classXp.need], [152, 1, 2, 32, 317]);
  const d2 = P.applyRaidResult(p, result({ classId: 'blade', outcome: 'extracted', level: 1 }));
  assert.deepEqual([d2.classXp.gain, d2.classXp.from, d2.classXp.to], [60, 2, 2]);
  // Capped at level 20: no experience banks past it.
  p.classes.toxic.xp = XP_CAP - 10;
  const d3 = P.applyRaidResult(p, result({ classId: 'toxic', kills: 500 }));
  assert.equal(p.classes.toxic.xp, XP_CAP);
  assert.deepEqual([d3.classXp.to, d3.classXp.max], [20, true]);
  // The training annex pays none.
  const tut = new Raid({ world: annex, seed: 1, mode: 'tutorial', script: makeTutorial() });
  tut.finish('extracted');
  P.applyRaidResult(p, tut.result);
  assert.equal(p.classes.rifleman.xp, 0);
});

test('profile: a save from before class levels opens with every class at level 1, and round trips', () => {
  const old = P.newProfile();
  delete old.classes;
  const storage = memory([[P.PROFILE_KEY, JSON.stringify(old)]]);
  const p = P.loadProfile(storage);
  assert.equal(p.v, 2, 'no version bump');
  for (const id of CLASS_IDS) assert.equal(classLevel(p.classes[id].xp).level, 1, id);
  p.classes.summoner.xp = 500;
  P.saveProfile(storage, p);
  assert.deepEqual(P.loadProfile(storage), p);
  // A damaged record is repaired on load rather than trusted.
  storage.store.set(P.PROFILE_KEY, JSON.stringify({ ...p, classes: { blade: { xp: -40 }, toxic: { xp: 'lots' } } }));
  const q = P.loadProfile(storage);
  assert.deepEqual(CLASS_IDS.map((id) => q.classes[id].xp), [0, 0, 0, 0]);
});
