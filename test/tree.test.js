// Class trees (doc 64, Package 7; doc 27 structure): what may be taken, and what each choice does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { CLASS_IDS } from '../src/sim/data.js';
import { CLASS_TREES, TREE_RULES } from '../src/sim/skill-data.js';
import { compileSkills, describeNode } from '../src/sim/skill-build.js';
import { castSkill, witherCloudArea } from '../src/sim/skills.js';
import { TREE_NODES, treeOrder, treePoints, treeIssue, treeTake, treeRefund, treeSpent, xpForLevel } from '../src/sim/progress.js';
import * as P from '../src/sim/profile.js';
import { t } from '../src/i18n/index.js';

const city = generateWorld(20261125);
const DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const sandbox = (o = {}) => { const r = new Raid({ world: city, seed: 5, mode: 'sandbox', ...o }); r.player.crit = 0; return r; };
const run = (raid, seconds, input = idle) => { for (let i = 0; i < seconds * 60 && !raid.over; i++) stepRaid(raid, DT, input); };
const near = (actual, expected, msg = '') => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg} ${actual} vs ${expected}`);
const dummy = (raid, x, z) => { const e = raid.spawnEnemy('dummy', x, z); e.hp = e.maxHp = 1e6; return e; };
const taken = (e) => e.maxHp - e.hp;
const memory = () => { const store = new Map(); return { store, getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }; };
// Allocations that open each later branch: S needs 3 earlier points, R needs 5.
const OPEN = {
  rifleman: { s: { lingeringFire: 1, quickLoad: 2 }, r: { lingeringFire: 1, quickLoad: 2, broadAperture: 1, longRail: 1 } },
  blade: { s: { longCombo: 1, reach: 2 }, r: { longCombo: 1, reach: 2, carriedSpin: 1, lastingPlates: 1 } },
  summoner: { s: { wideMarker: 1, longToss: 2 }, r: { wideMarker: 1, longToss: 2, wideLane: 1, fastRecall: 1 } },
  toxic: { s: { longSpit: 1, fastSpit: 2 }, r: { longSpit: 1, fastSpit: 2, wideCloud: 1, longLob: 1 } },
};

test('trees: four branches of Enhancement, exclusive pair and two-rank passive; 16 points buy one side of every pair', () => {
  const ids = Object.keys(TREE_NODES);
  assert.equal(ids.length, 64);
  assert.deepEqual([1, 2, 17, 18, 20].map(treePoints), [0, 1, 16, 16, 16], 'one point per level gained up to 17');
  // Never a flat health or damage purchase: no node touches a damage number, and stats are rates only.
  const banned = /damage|dps|Dps|perStack|PerStack|exposedMul|markMul|orderBurst|ruptureMul|momentumBonus|heal|hp/i;
  for (const id of CLASS_IDS) {
    const tree = CLASS_TREES[id];
    assert.deepEqual(tree.map((b) => b.slot), ['m1', 'm2', 's', 'r'], id);
    const full = {};
    for (const b of tree) {
      assert.equal(b.pair.length, 2);
      assert.equal(TREE_NODES[b.passive.id].ranks, 2);
      for (const n of [b.enh, ...b.pair, b.passive]) {
        for (const fx of n.effects) {
          if (fx.type === 'param') assert.ok(!banned.test(fx.key), `${n.id} buys ${fx.key}`);
          if (fx.type === 'stat') assert.equal(fx.key, 'rRate', n.id);
          if (fx.type === 'rule') assert.ok(TREE_RULES[fx.key].includes(fx.value), n.id);
        }
      }
      full[b.enh.id] = 1; full[b.pair[0].id] = 1; full[b.passive.id] = 2;
    }
    assert.equal(treeSpent(full), treePoints(17), `${id}: the whole tree with one side of each pair`);
    assert.equal(treeIssue(id, full, 16), null);
    compileSkills(id, { tree: full });
    // Every node describes itself with numbers from the compiled build, no placeholder left over.
    for (const n of treeOrder(id)) assert.ok(!/\{\w+\}/.test(t(describeNode(id, {}, n))), `${n}: ${t(describeNode(id, {}, n))}`);
  }
  assert.equal(t(describeNode('rifleman', {}, 'lingeringFire')), 'Suppression lasts 5.5 s instead of 4 s: paint, fall back to cover, then spend it.');
  assert.equal(t(describeNode('rifleman', { quickLoad: 1 }, 'quickLoad')), 'A cell loads after 20 landed rounds instead of 22.', 'a passive previews its next rank');
});

test('trees: gates, prerequisites, exclusivity and the point budget refuse with a reason', () => {
  const R = 'rifleman';
  const why = (res) => t(res.why);
  assert.equal(why(treeTake(R, {}, 'broadAperture', 16)), 'Conversion needs 1 points in earlier branches (0 spent)');
  assert.equal(why(treeTake(R, { lingeringFire: 1 }, 'crowdBurst', 16)), 'Crowd Burst needs Broad Aperture');
  assert.equal(why(treeTake(R, { lingeringFire: 1 }, 'broadAperture', 1)), 'No tree points left (1 earned)');
  assert.equal(why(treeTake(R, { lingeringFire: 1, wideSweep: 1 }, 'longRoll', 16)), 'Maneuver needs 3 points in earlier branches (1 spent)');
  assert.equal(treeTake(R, { quickLoad: 2 }, 'quickLoad', 16).ok, false, 'two ranks at most');
  assert.equal(treeTake(R, {}, 'duelist', 16).ok, false, 'another class\'s node is not owned');
  assert.equal(treeIssue('blade', { broadAperture: 1 }).code, 'unknown');
  assert.equal(treeIssue(R, { lingeringFire: 1, broadAperture: 1, crowdBurst: 1, lineDischarge: 1 }).code, 'exclusive');
});

test('trees: refunds validate what remains, a pair swaps atomically, reset returns exactly the earned points', () => {
  const R = 'rifleman';
  const a5 = { lingeringFire: 1, broadAperture: 1, crowdBurst: 1, wideSweep: 1, pressingRoll: 1, paintingBarrage: 1 };
  assert.equal(treeIssue(R, a5, 6), null);
  let res = treeRefund(R, a5, 'broadAperture', 6);
  assert.equal(t(res.why), 'Crowd Burst needs Broad Aperture', 'names the dependent node');
  res = treeRefund(R, a5, 'pressingRoll', 6);
  assert.equal(t(res.why), 'Doctrine needs 5 points in earlier branches (4 spent)', 'names the threshold');
  res = treeRefund(R, a5, 'lingeringFire', 6);
  assert.equal(res.ok, false, 'the first point holds every later branch open');
  // Swapping one side of a pair for the other needs no spare point and never strands Doctrine.
  res = treeTake(R, a5, 'lineDischarge', 6);
  assert.ok(res.ok);
  assert.equal(res.swapped, 'crowdBurst');
  assert.deepEqual(res.alloc, { lingeringFire: 1, broadAperture: 1, lineDischarge: 1, wideSweep: 1, pressingRoll: 1, paintingBarrage: 1 });
  assert.deepEqual(a5.crowdBurst, 1, 'the input is never changed');
  assert.ok(treeRefund(R, a5, 'paintingBarrage', 6).ok);
  // In the profile: earned from the level, kept per class, reset returns all of it.
  const p = P.newProfile();
  p.classes.rifleman.xp = xpForLevel(7);
  for (const id of Object.keys(a5)) assert.ok(P.takeNode(p, R, id).ok, id);
  assert.equal(P.takeNode(p, R, 'longRail').ok, false, 'six points at level 7');
  assert.deepEqual(P.treeState(p, R).left, 0);
  assert.equal(P.setTree(p, R, { crowdBurst: 1 }).ok, false, 'a whole draft is applied all or nothing');
  assert.deepEqual(P.treeState(p, R).alloc, a5);
  assert.equal(P.refundNode(p, R, 'broadAperture').ok, false);
  assert.deepEqual(P.resetTree(p, R), { ok: true, points: 6 });
  assert.deepEqual(P.treeState(p, R).alloc, {});
  assert.equal(P.treeState(p, R).left, 6);
  assert.equal(P.treeState(p, 'blade').earned, 0, 'points belong to the class that earned them');
});

test('trees: loading drops unknown, removed, wrong-class or unaffordable nodes and returns their points', () => {
  const storage = memory(), p = P.newProfile();
  p.classes.rifleman = { xp: xpForLevel(4), tree: { lingeringFire: 1, broadAperture: 1, crowdBurst: 1, longRail: 2, retiredNode: 1 } };
  p.classes.blade = { xp: xpForLevel(3), tree: { broadAperture: 1, longCombo: 1 } };
  p.classes.toxic = { xp: xpForLevel(10), tree: { longSpit: 1, wideCloud: 1, spreadingRupture: 1, cultivate: 1, longLob: 'x' } };
  storage.setItem(P.PROFILE_KEY, JSON.stringify(p));
  const q = P.loadProfile(storage);
  assert.deepEqual(q.classes.rifleman.tree, { lingeringFire: 1, broadAperture: 1, crowdBurst: 1 }, 'three points at level 4');
  assert.deepEqual(q.classes.blade.tree, { longCombo: 1 });
  assert.equal(P.treeState(q, 'blade').left, 1, 'the dropped node returned its point');
  assert.deepEqual(q.classes.toxic.tree, { longSpit: 1, wideCloud: 1, spreadingRupture: 1 }, 'one side of a pair is kept');
});

test('trees: the raid gets a frozen snapshot at deployment and can neither spend nor return a point', () => {
  const p = P.newProfile();
  p.classes.rifleman.xp = xpForLevel(5);
  for (const id of ['lingeringFire', 'broadAperture', 'longRail', 'longRail']) assert.ok(P.takeNode(p, 'rifleman', id).ok);
  const dep = P.deployment(p, 'rifleman');
  assert.deepEqual(P.deployment(p, 'rifleman'), dep, 'the same profile deploys the same way');
  assert.ok(Object.isFrozen(dep.tree));
  const raid = sandbox({ tree: dep.tree });
  assert.ok(Object.isFrozen(raid.tree));
  assert.throws(() => { raid.tree.longRail = 0; }, TypeError);
  P.refundNode(p, 'rifleman', 'longRail');
  raid.giveItem('coolant', true); // a run item recompiles the build mid-raid
  assert.equal(raid.skillBuild.slots.m2.params.range, 50, 'the raid keeps what it left with');
  raid.finish('dead');
  P.applyRaidResult(p, raid.result);
  assert.deepEqual(p.classes.rifleman.tree, { lingeringFire: 1, broadAperture: 1, longRail: 1 }, 'the raid wrote nothing back');
});

test('rifleman M2 pair: Crowd Burst widens the round burst; Line Discharge sends it 12 m down the line instead', () => {
  function shoot(tree) {
    const raid = sandbox({ tree }), p = raid.player, x = p.x, z = p.z;
    p.face = -Math.PI / 2; // due north is open for 60 m
    const bodies = {
      a: dummy(raid, x, z - 10), side: dummy(raid, x + 2, z - 10), wide: dummy(raid, x - 3.5, z - 10),
      c: dummy(raid, x, z - 18), d: dummy(raid, x, z - 25), lane: dummy(raid, x + 1.5, z - 15),
    };
    bodies.a.st.supp = 3; bodies.a.st.suppT = 4;
    raid.castM2({});
    return { ...Object.fromEntries(Object.entries(bodies).map(([k, e]) => [k, taken(e)])), last: raid.lastM2 };
  }
  const burst = 20 * (1 + 0.25 * 3);
  const base = shoot({});
  assert.deepEqual([base.side, base.wide, base.c, base.d, base.lane], [burst, 0, 46, 46, 0]);
  const crowd = shoot({ lingeringFire: 1, broadAperture: 1, crowdBurst: 1 });
  assert.deepEqual([crowd.side, crowd.wide, crowd.lane], [burst, burst, 0], 'a 4 m burst reaches the flanker');
  const line = shoot({ lingeringFire: 1, broadAperture: 1, lineDischarge: 1 });
  near(line.a, 46 * 1.75, 'the line hit is unchanged');
  assert.deepEqual([line.side, line.wide], [0, 0], 'no round burst: the flanker beside the mark is missed');
  assert.deepEqual([line.c, line.lane, line.d], [46 + burst, burst, 46], 'the discharge runs 12 m past the mark, 1.2 m either side');
  assert.equal(line.last.discharged, 2);
});

test('blade M2 pair: Forward Guard knocks the fragment ahead of the Whirl; Exit Guard drops it 2 m behind', () => {
  const cut3 = (raid) => { const p = raid.player; p.face = -Math.PI / 2; p.combo = 2; p.dash = null; castSkill(raid, 'm1', { ...idle, aimX: p.x, aimZ: p.z - 5 }); };
  const ahead = sandbox({ classId: 'blade', tree: { longCombo: 1, carriedSpin: 1, forwardGuard: 1 } }), p = ahead.player;
  const e = dummy(ahead, p.x, p.z - 1.6);
  cut3(ahead);
  assert.ok(e.st.exposedT > 0);
  assert.equal(ahead.fragments.length, 0, 'the third cut drops nothing');
  p.cd.m2 = 0;
  ahead.castM2({ ...idle, mx: 1, aimX: p.x, aimZ: p.z - 5 });
  assert.equal(e.st.exposedT, 0, 'the Whirl consumed the opening');
  assert.equal(ahead.fragments.length, 1);
  near(ahead.fragments[0].x, e.x + e.r + 1.5, 'ahead along the spin'); near(ahead.fragments[0].z, e.z);
  const behind = sandbox({ classId: 'blade', tree: { longCombo: 1, carriedSpin: 1, exitGuard: 1 } }), q = behind.player;
  dummy(behind, q.x, q.z - 1.6); dummy(behind, q.x + 0.6, q.z - 1.5);
  cut3(behind);
  assert.equal(behind.fragments.length, 1, 'one a swing');
  near(behind.fragments[0].x, q.x); near(behind.fragments[0].z, q.z + 2, '2 m behind the operator');
});

test('summoner M2 pair: Post holds an Order for the lane and drones never take it; Escort gives it to the drones first', () => {
  function setup(tree) {
    const raid = sandbox({ classId: 'summoner', tree }), p = raid.player;
    p.face = -Math.PI / 2;
    raid.castM2({ ...idle, aimX: p.x, aimZ: p.z - 3 }); // a post facing north
    const sentry = raid.summons[0];
    castSkill(raid, 'r', idle);
    const drone = raid.summons.find((s) => s.kind === 'drone');
    return { raid, p, sentry, drone, m1: raid.skillBuild.slots.m1.params };
  }
  // Base: the sentry covering an Order answers it; a drone only takes one no sentry covers.
  let s = setup({});
  const inLane = dummy(s.raid, s.sentry.x, s.sentry.z - 6), outside = dummy(s.raid, s.p.x + 6, s.p.z + 3);
  s.raid.giveOrder(inLane, s.m1); s.raid.giveOrder(outside, s.m1);
  assert.deepEqual([s.raid.answersOrder(s.sentry, inLane), s.raid.answersOrder(s.drone, inLane), s.raid.answersOrder(s.drone, outside)], [true, false, true]);
  // Post: drones never take Orders, and an Order is held past its 5 s until its target enters a lane.
  s = setup({ wideMarker: 1, wideLane: 1, post: 1 });
  const walker = dummy(s.raid, s.p.x + 6, s.p.z + 3);
  s.raid.giveOrder(walker, s.m1);
  assert.equal(s.raid.answersOrder(s.drone, walker), false);
  run(s.raid, 7);
  assert.equal(walker.st.orderT, Infinity, 'held while no lane covers it');
  const hp = walker.hp, by = dummy(s.raid, s.sentry.x + 1, s.sentry.z - 8);
  walker.x = s.sentry.x; walker.z = s.sentry.z - 8;
  run(s.raid, 0.4);
  assert.equal(walker.st.orderT, 0, 'answered once it walked into the lane');
  assert.ok(hp - walker.hp >= 9 * 1.4 && taken(by) >= 20, 'with the +40% shot and the Order burst');
  // Escort: a drone in reach takes the Order even inside a sentry's lane; the sentry only without one.
  s = setup({ wideMarker: 1, wideLane: 1, escort: 1 });
  const t2 = dummy(s.raid, s.sentry.x, s.sentry.z - 6);
  s.raid.giveOrder(t2, s.m1);
  assert.deepEqual([s.raid.answersOrder(s.drone, t2), s.raid.answersOrder(s.sentry, t2)], [true, false]);
  for (const d of s.raid.summons.filter((k) => k.kind === 'drone')) s.raid.removeSummon(d);
  assert.equal(s.raid.answersOrder(s.sentry, t2), true, 'no drone out: the post answers');
});

test('toxic M2 pair: Spreading Rupture seeds the neighbours; Cultivate keeps the Venom over a pool, then ruptures', () => {
  const ruptures = (raid, seconds) => {
    const hits = [];
    for (let i = 0; i < seconds * 60; i++) { stepRaid(raid, DT, idle); for (const ev of raid.events) if (ev.t === 'dmg' && !ev.dot) hits.push(ev.amount); raid.events.length = 0; }
    return hits;
  };
  const spread = sandbox({ classId: 'toxic', tree: { longSpit: 1, wideCloud: 1, spreadingRupture: 1 } }), p = spread.player;
  const a = dummy(spread, p.x, p.z - 8), b = dummy(spread, p.x + 1.5, p.z - 8);
  a.st.venom = 2; a.st.venomT = 6;
  const m2 = spread.skillBuild.slots.m2.params;
  witherCloudArea(spread, a.x, a.z, m2.radius, m2.duration, m2.dps, m2, { m2: true });
  const hits = ruptures(spread, 1.5);
  assert.equal(hits.length, 2, 'the host, then the neighbour it seeded');
  assert.equal(b.st.venom, 0);
  // Cultivate: over the operator's acid pool the tick refreshes Venom instead of rupturing.
  const grow = sandbox({ classId: 'toxic', tree: { longSpit: 1, wideCloud: 1, cultivate: 1 } }), q = grow.player;
  const h = dummy(grow, q.x, q.z - 8);
  h.st.venom = 3; h.st.venomT = 1.5;
  grow.addArea({ kind: 'pool', x: h.x, z: h.z, r: 3, life: 10, col: [0, 1, 0] });
  const c2 = grow.skillBuild.slots.m2.params;
  witherCloudArea(grow, h.x, h.z, c2.radius, c2.duration, c2.dps, c2, { m2: true });
  assert.equal(ruptures(grow, 2).length, 0, 'no rupture over the pool');
  assert.equal(h.st.venom, 3);
  assert.ok(h.st.venomT > 5.5, `refreshed to the full time: ${h.st.venomT}`);
  grow.areas = grow.areas.filter((x) => x.kind !== 'pool'); // the host has left the prepared ground
  const late = ruptures(grow, 0.5);
  assert.equal(late.length, 1, 'it ruptures once it leaves the pool');
  assert.ok(late[0] > 0.7 * 3 * 3 * 5, 'with the Venom the pool kept');
  // Without the node the same host ruptures at once, pool or not.
  const plain = sandbox({ classId: 'toxic' }), r = plain.player, h2 = dummy(plain, r.x, r.z - 8);
  h2.st.venom = 3; h2.st.venomT = 1.5;
  plain.addArea({ kind: 'pool', x: h2.x, z: h2.z, r: 3, life: 10, col: [0, 1, 0] });
  const c3 = plain.skillBuild.slots.m2.params;
  witherCloudArea(plain, h2.x, h2.z, c3.radius, c3.duration, c3.dps, c3, { m2: true });
  assert.equal(ruptures(plain, 0.5).length, 1);
});

test('rifleman nodes: Quick Load, Pressing Roll, Covering Roll and Painting Barrage change the kit as written', () => {
  const ql = sandbox({ tree: { quickLoad: 2 } });
  ql.cellRounds(20);
  assert.equal(ql.player.cells, 1, 'a cell after 20 rounds');
  const roll = (tree, mx) => {
    const raid = sandbox({ tree }), p = raid.player, e = dummy(raid, p.x, p.z - 6), far = dummy(raid, p.x, p.z - 13);
    e.st.supp = 2; e.st.suppT = 0.5; far.st.supp = 1; far.st.suppT = 0.5;
    p.cd.m2 = 4;
    castSkill(raid, 's', { ...idle, mz: mx });
    return { cd: p.cd.m2, near: e.st.suppT, far: far.st.suppT };
  };
  const press = { ...OPEN.rifleman.s, wideSweep: 1, pressingRoll: 1 };
  near(roll({}, -1).cd, 2.8, 'base: 30% back');
  near(roll(press, -1).cd, 2, 'rolling at it: 50% back');
  near(roll(press, 1).cd, 2.8, 'rolling away: the usual 30%');
  const cover = roll({ ...OPEN.rifleman.s, wideSweep: 1, coveringRoll: 1 }, 1);
  assert.deepEqual([cover.near, cover.far], [5.5, 5.5], 'every Suppressed body within 14 m back to the full 5.5 s');
  assert.equal(roll({}, 1).near, 0.5);
  const paint = (tree) => {
    const raid = sandbox({ tree }), p = raid.player, e = dummy(raid, p.x, p.z - 8);
    run(raid, 0.5, { ...idle, aimX: e.x, aimZ: e.z, ult: true });
    return e.st.supp;
  };
  assert.equal(paint({}), 0);
  assert.equal(paint({ ...OPEN.rifleman.r, paintingBarrage: 1 }), 3);
});

test('blade nodes: Duelist pays for a lone target, Opening Lunge exposes, Clean Exit recovers faster, Withdraw returns', () => {
  const swing = (n) => {
    const raid = sandbox({ classId: 'blade', tree: { longCombo: 1, duelist: 1 } }), p = raid.player;
    for (let i = 0; i < n; i++) dummy(raid, p.x + 0.4 * i, p.z - 1.6);
    p.face = -Math.PI / 2; castSkill(raid, 'm1', { ...idle, aimX: p.x, aimZ: p.z - 5 });
    return p.momentum;
  };
  assert.deepEqual([swing(1), swing(2)], [15, 18]);
  const lunge = (extra, body) => {
    const raid = sandbox({ classId: 'blade', tree: { ...OPEN.blade.s, longLunge: 1, ...extra } }), p = raid.player;
    p.face = -Math.PI / 2;
    const e = body ? dummy(raid, p.x, p.z - 4) : null;
    castSkill(raid, 's', idle);
    run(raid, 0.3);
    return { exposed: e ? e.st.exposedT : 0, cd: p.cd.s };
  };
  assert.ok(lunge({ openingLunge: 1 }, true).exposed > 2.6);
  assert.equal(lunge({ cleanExit: 1 }, true).exposed, 0);
  near(lunge({ cleanExit: 1 }, false).cd, 4 * 0.6 - 0.3, 'a Lunge into nothing is back after 60%');
  near(lunge({ cleanExit: 1 }, true).cd, 4 - 0.3, 'one that strikes pays the full cooldown');
  const raid = sandbox({ classId: 'blade', tree: { ...OPEN.blade.r, longSentence: 1, withdraw: 1 } }), p = raid.player;
  const x0 = p.x, z0 = p.z, e = dummy(raid, p.x, p.z - 8);
  e.st.exposedT = 5;
  castSkill(raid, 'r', idle);
  run(raid, 1);
  assert.ok(taken(e) > 0);
  assert.deepEqual([p.x, p.z], [x0, z0], 'back where the sentence began');
});

test('summoner nodes: Twin Order calls two, Pack Hop collects a post, Picket drones keep their ground', () => {
  const raid = sandbox({ classId: 'summoner', tree: { wideMarker: 1, twinOrder: 1 } }), p = raid.player;
  const a = dummy(raid, p.x, p.z - 10), b = dummy(raid, p.x + 1.2, p.z - 10), c = dummy(raid, p.x - 2.5, p.z - 10);
  castSkill(raid, 'm1', { ...idle, aimX: a.x, aimZ: a.z });
  run(raid, 0.5);
  assert.deepEqual([a, b, c].map((e) => e.st.orderT > 0), [true, true, false]);
  const hop = sandbox({ classId: 'summoner', tree: { ...OPEN.summoner.s, longRelay: 1, packHop: 1 } }), q = hop.player;
  q.face = -Math.PI / 2;
  hop.castM2({ ...idle, aimX: q.x, aimZ: q.z - 4 });
  assert.equal(q.carried, 1);
  castSkill(hop, 's', { ...idle, mz: -1 });
  run(hop, 0.4);
  assert.equal(q.carried, 2, 'landing beside the post packed it');
  const pk = sandbox({ classId: 'summoner', tree: { ...OPEN.summoner.r, longPatrol: 1, picket: 1 } }), o = pk.player;
  const x0 = o.x, z0 = o.z;
  castSkill(pk, 'r', idle);
  o.z -= 20;
  run(pk, 1.5);
  const drones = pk.summons.filter((s) => s.kind === 'drone');
  assert.equal(drones.length, 3);
  for (const d of drones) assert.ok(Math.hypot(d.x - x0, d.z - z0) < 3, 'still circling the launch point');
  near(drones[0].t, 20 - 1.5 + DT * 0, 'Long Patrol: 20 s');
});

test('toxic nodes: Heavy Dose, Splatter, Dosing Slide and Heavy Hops move Venom as written', () => {
  const spit = (tree) => {
    const raid = sandbox({ classId: 'toxic', tree }), p = raid.player, e = dummy(raid, p.x, p.z - 6), o = dummy(raid, p.x + 1.4, p.z - 6.2);
    p.face = -Math.PI / 2; raid.rCombat = { range: () => 0, chance: () => false };
    castSkill(raid, 'm1', { ...idle, aimX: e.x, aimZ: e.z });
    run(raid, 0.4);
    return { host: e.st.venom, other: o.st.venom, interval: raid.skillBuild.slots.m1.params.interval };
  };
  assert.deepEqual(spit({}), { host: 1, other: 0, interval: 0.3 });
  const heavy = spit({ longSpit: 1, heavyDose: 1 });
  assert.deepEqual([heavy.host, heavy.other], [2, 0]); near(heavy.interval, 0.45);
  assert.deepEqual(spit({ longSpit: 1, splatter: 1 }), { host: 1, other: 1, interval: 0.3 });
  const slide = sandbox({ classId: 'toxic', tree: { ...OPEN.toxic.s, widePool: 1, dosingSlide: 1 } }), p = slide.player;
  const at = dummy(slide, p.x, p.z - 6.5);
  castSkill(slide, 's', { ...idle, mz: -1 });
  run(slide, 0.32);
  assert.ok(at.st.venom >= 1, 'the landing dosed the body beside it');
  const plague = sandbox({ classId: 'toxic', tree: { ...OPEN.toxic.r, longHops: 1, heavyHops: 1 } }), q = plague.player;
  const lead = dummy(plague, q.x, q.z - 6), hosts = [9, 12, 15].map((d) => dummy(plague, q.x, q.z - d));
  lead.st.venom = 4; lead.st.venomT = 5;
  castSkill(plague, 'r', { ...idle, aimX: lead.x, aimZ: lead.z });
  run(plague, 2);
  assert.deepEqual([lead, ...hosts].map((e) => e.st.venom), [0, 2, 2, 0], 'two stacks a hop');
});
