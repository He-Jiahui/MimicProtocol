import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDistrict, reachable, reachNear } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { CROSSING_SECONDS, DISTRICTS } from '../src/sim/districts.js';
import { EXTRACT_TIME } from '../src/sim/data.js';
import { exitInfo } from '../src/sim/jobs.js';
import { routeTargets, setRoute } from '../src/sim/route.js';
import { t, setLanguage } from '../src/i18n/index.js';

const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0 }, dt = 1 / 60;
function run(r, seconds, input = idle) { for (let i = 0; i < Math.ceil(seconds / dt); i++) stepRaid(r, dt, input); }
function place(r, site, dx = 0, dz = 0) { r.player.x = site.x + dx; r.player.z = site.z + dz; r.world.place(r.player); }
function deploy(seed, extra) { return new Raid({ seed, world: generateDistrict(seed), ...extra }); }
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('two city deployments land in different covered blocks; the first minute at insertion is quiet', () => {
  const a = deploy(2), b = deploy(3);
  assert.equal(a.world.preset, 'city'); assert.equal(b.world.preset, 'city');
  assert.ok(distance(a.player, b.player) > 100); assert.notEqual(a.world.pocket.name, b.world.pocket.name);
  assert.notDeepEqual(a.world.zone, b.world.zone);
  for (const r of [a, b]) {
    const w = r.world, p = r.player;
    assert.equal(w.zoneAt(p.x, p.z), 0); assert.ok(w.circleFree(p.x, p.z, 0.8));
    assert.ok(w.zone.includes(4));
    assert.ok(w.pois.filter(q => ['passage', 'nest', 'boss'].includes(q.type)).every(q => distance(q, p) > 55));
    run(r, 60);
    assert.equal(p.hp, p.maxHp); assert.equal(r.pressT, 0); assert.equal(r.waveN, 0); assert.ok(!r.gateGuard);
    assert.ok(r.enemies.filter(e => e.elite || r.isHostile(e)).every(e => distance(e, p) > 10));
  }
  // Same landing and same preset still allow a different hot front.
  const c = generateDistrict(15); assert.equal(c.preset, a.world.preset); assert.equal(c.insertion.x, a.world.insertion.x); assert.notDeepEqual(c.zone, a.world.zone);
  const repeat = generateDistrict(2); assert.deepEqual(repeat.zone, a.world.zone); assert.deepEqual(repeat.passage, a.world.passage);
});

test('leaving insertion cover early resumes the director; remaining in the covered approach lasts only one minute', () => {
  const r = deploy(2), w = r.world;
  function near(lo, hi) {
    for (let z = 3; z < w.size; z += 2) for (let x = 3; x < w.size; x += 2) {
      const d = distance({ x, z }, w.insertion);
      if (d >= lo && d <= hi && w.zoneAt(x, z) === 1 && w.reach[z * w.size + x] && w.circleFree(x, z, 1)) return { x, z };
    }
    assert.fail('no walkable approach');
  }
  const edge = near(53, 66); place(r, edge); run(r, 10);
  assert.equal(r.pressT, 0); assert.equal(r.waveN, 0); assert.equal(r.threat.approach, true);
  place(r, near(78, 95)); run(r, 1); assert.ok(r.pressT > 0.9);
  place(r, edge); r.time = 60; run(r, 1); assert.ok(r.pressT > 1.9); assert.equal(r.threat.approach, false);
});

test('all four 500 m recipes have reachable named ground, dispatch, guarding and boarding sites', () => {
  const cases = [[2, 'city', ['Tideglass Hotel']], [0, 'homes', ['Kettle Walk', 'Hemlock Close', 'Sparrow Mews', 'Overflow Conduit']], [1, 'fringe', ['Rill Garden']], [16, 'harbor', ['Lantern Apron', 'Gauge House', 'Tally Light', 'Seal Yard']]];
  for (const [seed, preset, names] of cases) {
    const r = deploy(seed), w = r.world, publicWalk = reachable(w, d => d.kind === 'closed');
    assert.equal(w.preset, preset); assert.equal(w.size, 500);
    if (preset === 'city') assert.deepEqual([w.boss.hx * 2, w.boss.hz * 2], [60, 32]);
    for (const site of [...names.map(name => w.pois.find(q => q.name === name)), w.dispatch, w.passage, ...w.extractions]) {
      assert.ok(site && reachNear(w, publicWalk, site.x, site.z, site.r || 2), `${seed}: ${site?.name || site?.type}`);
    }
    const list = routeTargets(r);
    for (const site of [w.passage, w.dispatch]) {
      const target = list.find(q => q.kind === site.type && q.id === site.id);
      assert.ok(target); setRoute(r, target, true); run(r, dt); assert.ok(r.route.result.ok, `${target.kind} has a route`);
    }
  }
});

test('passage hold requires the actual elite kill; transition preserves the run and adds live horde heat', () => {
  const orders = [{ type: 'survey', sector: 0, left: 3, id: 'survey-A' }];
  const r = deploy(2, { orders }), w = r.world, g = w.passage, p = r.player;
  r.autoPick = true;
  const mark = r.ops.marks[0]; assert.ok(mark); place(r, mark); r.doScan();
  assert.equal(r.ops.list[0].gained, 1);
  const hold = { ...idle, interact: true };
  place(r, g, 0, 1.4); run(r, 2, hold);
  assert.equal(r.districtStep, 0); assert.equal(r.prompt.ok, false); assert.match(t(r.prompt.label), /guard/i);
  const guard = r.gateGuard; assert.ok(guard.elite && r.isHostile(guard));
  place(r, w.insertion); run(r, 8); assert.ok(!guard.dead); assert.equal(r.districtStep, 0);
  place(r, g, 0, 2); run(r, dt);
  for (let i = 0; i < 900 && !guard.dead; i++) stepRaid(r, dt, { ...idle, aimX: guard.x, aimZ: guard.z, m1: true, m2: true });
  assert.ok(guard.dead && r.gateCleared); assert.equal(r.elites, 1);
  p.credits = 51; r.stow({ uid: 'carry-out', name: 'Brass Coil', kind: 'loot', value: 35 }, p.x, p.z);
  place(r, g); r.updatePlayer(0, idle);
  const press = r.pressT, clock = r.raidTime;
  r.after(10, () => assert.fail('a timer crossed the district boundary'));
  run(r, 1.3, hold);
  assert.equal(r.districtStep, 0); p.hp = 81;
  run(r, 0.3, hold);
  assert.equal(r.world.preset, 'harbor'); assert.notEqual(r.world, w); assert.equal(r.districtStep, 1);
  assert.ok(!r.world.passage); assert.ok(r.world.circleFree(p.x, p.z, p.r));
  assert.ok(r.pressT >= press + CROSSING_SECONDS && r.pressT < press + CROSSING_SECONDS + 2);
  assert.ok(r.raidTime < clock + 2); assert.equal(r.threat.heat, r.pressT / 60);
  const x = r.world.dispatch.x, z = r.world.dispatch.z;
  assert.ok(r.scaleAt('walker', x, z).hpMul > r.scaleAt('walker', x, z, { noHeat: true }).hpMul);
  assert.ok(r.events.some(e => e.t === 'banner' && t(e.sub).includes(`+${CROSSING_SECONDS}`)));
  assert.equal(p.hp, 81); assert.ok(p.credits >= 51 && p.inv.some(k => k.uid === 'carry-out'));
  assert.equal(r.ops.list[0].gained, 1); assert.equal(r.ops.marks.length, 2); assert.equal(r.extractUnlocked, false);
  assert.ok(!r.enemies.includes(guard)); run(r, 11);
});

test('ordinary extracts refuse a full hold until the marked terminal is hacked; boarding retains its timer', () => {
  const r = deploy(5), w = r.world, ex = w.extractions[0], hold = { ...idle, interact: true };
  assert.ok(r.poi[ex.id].known); assert.ok(w.extractions.slice(1).every(q => !r.poi[q.id].known));
  for (const q of w.extractions) assert.equal(exitInfo(r, q).open, false);
  place(r, ex, 0, 1); run(r, EXTRACT_TIME + 1, hold);
  assert.equal(r.over, false); assert.equal(r.prompt.ok, false); assert.equal(r.prompt.progress, 0); assert.match(t(r.prompt.label), /hack an Intel Terminal/);
  place(r, w.dispatch, 0, 1.6); run(r, 8.2, hold);
  assert.ok(r.extractUnlocked && r.intel === 1); assert.ok(r.poi[ex.id].known);
  assert.equal(exitInfo(r, w.extractions[1]).open, false, 'the boat still needs its relay');
  place(r, ex); run(r, EXTRACT_TIME - 1, hold); assert.ok(!r.over && r.prompt.progress > 0.7);
  run(r, 1.1, hold); assert.equal(r.result.outcome, 'extracted'); assert.equal(r.result.exit, ex.name);
});

test('sibling clearance hook is idempotent, independent of reveal, and carried through the crossing', () => {
  const r = deploy(5), before = r.poi.map(s => s.known);
  r.unlockExtraction(); r.unlockExtraction(); assert.deepEqual(r.poi.map(s => s.known), before);
  assert.equal(r.events.filter(e => e.t === 'toast' && t(e.text).includes('Extraction cleared')).length, 1);
  r.evts.curses.add('brittle');
  const g = r.world.passage; place(r, g); r.updatePassage(); r.killEnemy(r.gateGuard); r.crossPassage();
  assert.equal(r.districtStep, 1); assert.ok(r.evts.curses.has('brittle')); assert.ok(exitInfo(r, r.world.extractions[0]).open);
  setLanguage('zh-CN');
  try { for (const k of [g.name, ...Object.values(DISTRICTS).map(d => d.name), 'Locked: hack an Intel Terminal or finish a field contract']) assert.notEqual(t(k), k); } finally { setLanguage('en'); }
});

test('operator can walk the marked route, earn clearance, defeat the guard and board in district two', () => {
  const r = deploy(2), p = r.player;
  r.autoPick = true;
  let phase = 'terminal';
  for (let i = 0; i < 150 / dt && !r.over; i++) {
    const w = r.world, goal = phase === 'terminal' ? w.dispatch : phase === 'passage' ? w.passage : w.extractions[0];
    const key = `${goal.type}:${goal.id}`;
    if (r.route?.target?.key !== key) setRoute(r, routeTargets(r).find(q => q.key === key), true);
    const it = r.findInteract(), input = { ...idle, quick1: p.hp < p.maxHp / 2 };
    if (it?.poi === goal) input.interact = it.ok !== false;
    else {
      const path = r.route?.result?.path || [], aim = path.slice(1).find(q => distance(p, q) > 1.2) || path[1] || goal;
      const d = distance(p, aim) || 1; input.mx = (aim.x - p.x) / d; input.mz = (aim.z - p.z) / d;
    }
    const enemy = r.nearestTarget(p.x, p.z, 28, null, true);
    if (enemy) Object.assign(input, { aimX: enemy.x, aimZ: enemy.z, m1: true, m2: true, ult: r.hostileCount() >= 4 });
    stepRaid(r, dt, input);
    if (phase === 'terminal' && r.extractUnlocked) phase = 'passage';
    if (phase === 'passage' && r.districtStep) phase = 'extract';
    r.events.length = 0;
  }
  assert.equal(r.intel, 1); assert.equal(r.districtStep, 1); assert.ok(r.elites >= 1);
  assert.equal(r.result?.outcome, 'extracted'); assert.ok(r.result.inv.some(q => q.name === 'Intel Shard'));
});
