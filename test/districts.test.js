import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDistrict, generateWorld, reachable, reachNear, requiredPlaces, FALLBACK, INST_FLOATS, SURF } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { CROSSING_SECONDS, DISTRICTS, NAMES, GLOW, MARK_EVERY, BANK_WALK, districtPlan, landingFor } from '../src/sim/districts.js';
import { EXTRACT_TIME } from '../src/sim/data.js';
import { exitInfo } from '../src/sim/jobs.js';
import { routeTargets, setRoute, findRoute } from '../src/sim/route.js';
import { t, setLanguage } from '../src/i18n/index.js';
import { Scene, AIR } from '../src/render/scene.js';
import { buildCover } from '../src/render/cover.js';
import { rampSlabs } from '../src/render/ramps.js';

const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0 }, dt = 1 / 60;
function run(r, seconds, input = idle) { for (let i = 0; i < Math.ceil(seconds / dt); i++) stepRaid(r, dt, input); }
function place(r, site, dx = 0, dz = 0) { r.player.x = site.x + dx; r.player.z = site.z + dz; r.world.place(r.player); }
function deploy(seed, extra) { return new Raid({ seed, world: generateDistrict(seed), ...extra }); }
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// One sample raid per preset: the seed, its first district and the places it must name.
const SAMPLES = [
  [2, 'city', ['Tideglass Hotel', 'Pilot Well', 'Vane Arcade']],
  [0, 'homes', ['Kettle Walk', 'Hemlock Close', 'Sparrow Mews', 'Linen Gallery', 'Cistern Green', 'Overflow Conduit']],
  [1, 'fringe', ['Rill Garden', 'Heron Boards', 'Fernlight House', 'Furrow Plots', 'Spillbank Steps']],
  [16, 'harbor', ['Lantern Apron', 'Gauge House', 'Tally Light', 'Seal Yard', 'Brine Locker', 'Keel Slip']],
  [8, 'yards', ['Turnback Shed', 'Hasp Sidings', 'Lever Cabin', 'Quarter Table', 'Grit Hoppers']],
];
const worlds = new Map();
const sample = (seed) => worlds.get(seed) || worlds.set(seed, generateDistrict(seed)).get(seed);
const shut = (d) => d.kind === 'closed';

// The scripted operator: ordinary movement along a route, aimed fire at what comes near, a
// held Interact at the goal, and a held Interact on a closed door in the way, as a player
// would. Returns after one tick.
function operate(r, path, goal, wants = () => false, toward = goal) {
  const p = r.player, it = r.findInteract(), input = { ...idle, quick1: p.hp < p.maxHp / 2 };
  const door = it?.type === 'door' && it.st.state === 'closed';
  if (door || (it && (it.poi === goal || wants(it)))) input.interact = it.ok !== false;
  else {
    const aim = path.slice(1).find(q => distance(p, q) > 0.6) || path[path.length - 1] || toward || p;
    const d = distance(p, aim) || 1; input.mx = (aim.x - p.x) / d; input.mz = (aim.z - p.z) / d;
  }
  const enemy = r.nearestTarget(p.x, p.z, 28, null, true);
  if (enemy) Object.assign(input, { aimX: enemy.x, aimZ: enemy.z, m1: true, m2: true, ult: r.hostileCount() >= 4 });
  stepRaid(r, dt, input);
  r.events.length = 0;
}
// Walk to a point on foot within a time limit; true once the operator stands within reach.
function walkTo(r, to, seconds = 40, reach = 1.1) {
  const p = r.player;
  let route = null;
  for (let i = 0; i < seconds / dt && !r.over; i++) {
    if (distance(p, to) <= reach && Math.abs(p.fy - r.world.floorAt(to.x, to.z)) < 0.3) return true;
    if (i % 20 === 0) route = findRoute(r, p.x, p.z, { x: to.x, z: to.z, reach: Math.max(0.8, reach - 0.2), los: false });
    operate(r, route.path, null, undefined, to);
  }
  return false;
}
// Walk to the nearest unopened container on this floor and hold Interact until it is searched.
function search(r, seconds = 12) {
  const p = r.player, w = r.world;
  const c = w.containers.filter(k => !r.cont[k.id].opened && Math.abs(w.floorAt(k.x, k.z) - p.fy) < 0.3).sort((a, b) => distance(a, p) - distance(b, p))[0];
  if (!c || distance(c, p) > 12 || !walkTo(r, c, 12, 1.8)) return null;
  for (let i = 0; i < seconds / dt && !r.cont[c.id].opened; i++) operate(r, [], null, q => q.type === 'container' && q.c === c, p);
  return r.cont[c.id].opened ? c : null;
}

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
  const c = generateDistrict(35); assert.equal(c.preset, a.world.preset); assert.equal(c.insertion.x, a.world.insertion.x); assert.notDeepEqual(c.zone, a.world.zone);
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

test('all five 500 m recipes have reachable named ground, dispatch, guarding and boarding sites', () => {
  for (const [seed, preset, names] of SAMPLES) {
    const r = deploy(seed), w = r.world, publicWalk = reachable(w, shut);
    assert.equal(w.preset, preset); assert.equal(w.size, 500);
    if (preset === 'city') assert.deepEqual([w.boss.hx * 2, w.boss.hz * 2], [60, 32]);
    for (const site of [...names.map(name => w.pois.find(q => q.name === name)), w.dispatch, w.passage, ...w.extractions]) {
      assert.ok(site && reachNear(w, publicWalk, site.x, site.z, site.r || 2), `${seed}: ${site?.name || site?.type}`);
    }
    for (const kind of DISTRICTS[preset].features) assert.ok(w.places.some(q => q.kind === kind && q.named && q.name === NAMES[kind]), `${preset} books ${kind}`);
    assert.ok(w.instances < 75000, `${preset}: ${w.instances} static instances`);
    const list = routeTargets(r);
    for (const site of [w.passage, w.dispatch]) {
      const target = list.find(q => q.kind === site.type && q.id === site.id);
      assert.ok(target); setRoute(r, target, true); run(r, dt); assert.ok(r.route.result.ok, `${target.kind} has a route`);
    }
  }
});

test('the itinerary is fair to all five presets, and the yards deploy like any other district', () => {
  const pairs = new Map(), first = {}, second = {};
  for (let seed = 0; seed < 2000; seed++) {
    const [a, b] = districtPlan(seed);
    assert.notEqual(a.preset, b.preset);
    first[a.preset] = (first[a.preset] || 0) + 1; second[b.preset] = (second[b.preset] || 0) + 1;
    pairs.set(`${a.preset}>${b.preset}`, (pairs.get(`${a.preset}>${b.preset}`) || 0) + 1);
  }
  assert.equal(pairs.size, 20, 'every ordered pair of two different districts occurs');
  for (const n of pairs.values()) assert.ok(n > 60 && n < 140, `a pair in twenty: ${n} of 2000`);
  for (const k of Object.keys(DISTRICTS)) { assert.ok(first[k] > 330 && first[k] < 470, `${k} first ${first[k]}`); assert.ok(second[k] > 330 && second[k] < 470, `${k} second ${second[k]}`); }
  // The four original presets keep the legs they had before the yards joined the tour.
  assert.deepEqual([2, 5, 1, 16].map(seed => districtPlan(seed).map(q => q.preset).join('>')), ['city>harbor', 'homes>city', 'fringe>city', 'harbor>homes']);
  // A yards deployment: a named landing in cover, a marked terminal, a guarded crossing, a locked gate.
  const r = deploy(8), w = r.world, p = r.player;
  assert.equal(w.preset, 'yards'); assert.equal(t(DISTRICTS.yards.name), 'Clinker Yards'); assert.equal(w.pocket.name, landingFor(8).name);
  assert.equal(w.zoneAt(p.x, p.z), 0); assert.ok(w.circleFree(p.x, p.z, 0.8));
  assert.ok(w.dispatch.dispatched && w.passage && w.nextDistrict === 'harbor' && distance(w.passage, w.insertion) > 140);
  assert.ok(w.extractions[0] && exitInfo(r, w.extractions[0]).open === false);
  assert.ok(routeTargets(r).some(q => q.kind === 'passage' && t(q.label).includes('Sounding Basin')));
  // The street plan kept in reserve for each preset is one that deploys as generated.
  assert.deepEqual(Object.keys(FALLBACK).sort(), Object.keys(DISTRICTS).sort());
  for (const [preset, seed] of Object.entries(FALLBACK)) { const f = generateDistrict(seed); assert.equal(f.preset, preset); assert.equal(f.seed, seed, `${preset}: no re-roll`); }
  // And as a second district: no crossing onward, the same landing rules.
  const far = generateDistrict(7, 1); assert.equal(far.preset, 'yards'); assert.ok(!far.passage && far.dispatch && far.extractions[0]);
});

test('a seeded survey of both legs: every preset in both places, every marked site and parcel gate reachable', () => {
  const first = new Set(), second = new Set();
  for (let seed = 20; seed < 44; seed++) for (const step of [0, 1]) {
    const w = generateDistrict(seed, step), walk = reachable(w, shut), tag = `${seed}/${step} ${w.preset}`;
    (step ? second : first).add(w.preset);
    assert.equal(w.preset, districtPlan(seed)[step].preset); assert.equal(w.size, 500);
    assert.ok(w.dispatch && w.extractions[0] && (step === 1) === !w.passage, `${tag}: terminal, gate and crossing`);
    for (const q of requiredPlaces(w)) assert.ok(reachNear(w, walk, q.x, q.z, q.type === 'nest' ? q.r : q.r || 2), `${tag}: ${q.type} ${q.name || ''}`);
    for (const kind of DISTRICTS[w.preset].features) assert.ok(w.places.some(q => q.kind === kind && q.named), `${tag}: ${kind}`);
    if (w.preset === 'city') assert.ok(w.scenes.some(q => q.kind === 'hotel') && w.boss.hx === 30, `${tag}: hotel and Reliquary`);
    for (const q of w.places) for (const g of q.gates || []) assert.ok(reachNear(w, walk, g.x, g.z, 2.5), `${tag}: a ${q.kind} path ends at a wall near ${g.x | 0}, ${g.z | 0}`);
    if (w.passage) assert.ok(distance(w.passage, w.insertion) > 140);
    assert.ok(w.pois.filter(q => ['passage', 'nest', 'boss'].includes(q.type)).every(q => distance(q, w.insertion) > 55), `${tag}: a quiet landing`);
  }
  assert.equal(first.size, 5); assert.equal(second.size, 5);
});

test('painted route marks lead from the landing to the terminal, the crossing and the known gate without a door', () => {
  for (const [seed] of SAMPLES) {
    const w = sample(seed), S = w.size, doorless = reachable(w, () => false);
    for (const [goal, site] of [['terminal', w.dispatch], ['passage', w.passage], ['extract', w.extractions[0]]]) {
      const marks = w.waymarks.filter(m => m.goal === goal), route = w.routes[goal];
      assert.ok(route && marks.length >= 3, `${seed}: marks to the ${goal}`);
      assert.ok(route.length >= distance(w.insertion, site) - 8, 'the marked walk is a real one');
      // The chain starts by the landing, never breaks for long, and ends near its goal.
      assert.ok(distance(marks[0], w.insertion) < 30); assert.ok(distance(marks[marks.length - 1], site) < 2.6 * MARK_EVERY);
      for (let k = 1; k < marks.length; k++) assert.ok(distance(marks[k], marks[k - 1]) < 3.1 * MARK_EVERY, `${seed} ${goal}: a gap of ${distance(marks[k], marks[k - 1]) | 0} m`);
      for (const m of marks) {
        const i = Math.floor(m.z) * S + Math.floor(m.x);
        assert.equal(w.grid[i], 0); assert.ok(doorless[i], 'a mark stands on ground reached without opening anything');
        assert.notEqual(w.surface[i], SURF.WATER);
      }
    }
  }
  // The undeployed city carries no marks and keeps its blind alleys.
  assert.equal(generateWorld(20261125).waymarks, undefined);
});

test('each preset wears its own light, floor and air', () => {
  const colours = new Set();
  for (const [seed, preset] of SAMPLES) {
    const w = sample(seed);
    // Street lamps (25 m reach): the commonest colour is the preset's own, except in the core.
    const tally = new Map();
    for (const b of w.blocks) for (const l of b.lights) if (l[3] === 25) { const k = l.slice(4, 7).map(v => v.toFixed(2)).join(); tally.set(k, (tally.get(k) || 0) + 1); }
    const top = [...tally].sort((a, b) => b[1] - a[1])[0][0];
    if (preset !== 'city') assert.equal(top, GLOW[preset].map(v => v.toFixed(2)).join(), `${preset} lamps`);
    colours.add(top);
    assert.ok(AIR[preset].every(v => v > 0.85 && v < 1.15));
    assert.equal(w.look.length, w.style.length);
    if (preset === 'homes') assert.ok(w.look.every(v => v === 0)); if (preset === 'harbor' || preset === 'yards') assert.ok(w.look.every(v => v === 4));
    // The sector map contracts read is the surveyed one, whatever the district wears.
    assert.deepEqual([...w.style], [...generateWorld(20261125).style]);
  }
  assert.ok(colours.size >= 4, 'housing, fringe, harbour and yards are told apart by their lamps');
});

test('Alder Spillbank keeps a public walk along the top of both quay walls', () => {
  const w = sample(1), S = w.size, walk = reachable(w, shut), c = w.net.canalX;
  for (const [x0, x1] of [[c - 18 - BANK_WALK.fringe, c - 18], [c + 18, c + 18 + BANK_WALK.fringe]]) {
    let paved = 0, reached = 0;
    for (let z = 3; z < S - 3; z++) {
      const row = []; for (let x = x0; x < x1; x++) row.push(z * S + x);
      if (row.some(i => w.surface[i] === SURF.WALK)) paved++;
      if (row.some(i => walk[i] && w.floor[i] === 0)) reached++;
    }
    assert.ok(paved > 0.6 * S, `a paved bank: ${paved} of ${S} m`); assert.ok(reached > 0.8 * S, `walked: ${reached} m`);
  }
  // Housing, harbour and yards build to the quay wall as before.
  assert.equal(BANK_WALK.homes, undefined); assert.equal(BANK_WALK.harbor, undefined);
  // The river steps start at the wall itself and land on the quay.
  const steps = w.places.find(q => q.kind === 'steps'); assert.ok(steps.foot[0] === c + 18 || steps.foot[2] === c - 18);
});

test('raised walks, sunken floors and rooms stand at their levels and are reached on foot', () => {
  const level = (w, q, y) => assert.equal(w.floorAt(q.x, q.z), y);
  const at = (seed, kind) => { const w = sample(seed), q = w.places.find(k => k.kind === kind && k.named); assert.ok(q, kind); return [w, q, reachable(w, shut)]; };
  for (const [seed, kind, keys] of [[0, 'gallery', ['upper', 'room']], [16, 'factory', ['upper', 'room']], [16, 'cold', ['upper', 'room', 'rear']], [16, 'berth', ['deck', 'gangway']],
    [8, 'cabin', ['upper', 'room', 'far']], [8, 'shed', ['room', 'pit']], [8, 'table', ['pit', 'pit2', 'upper']], [8, 'sidings', ['room']], [8, 'hoppers', ['under']],
    [1, 'steps', ['quay', 'head']], [1, 'glass', ['room']], [2, 'well', ['pit']]]) {
    const [w, q, walk] = at(seed, kind);
    for (const k of keys) { assert.ok(q[k], `${kind}.${k}`); assert.ok(reachNear(w, walk, q[k].x, q[k].z, 1.2), `${kind}.${k} is reached on foot`); if (q[k].y !== undefined) level(w, q[k], q[k].y); }
  }
  // Heights as built: the gallery a storey up, the dock a metre, the deck half a metre under
  // the street, the bridge four metres over the rakes, the pits a metre and a half down.
  assert.deepEqual([at(0, 'gallery')[1].upper.y, at(16, 'cold')[1].upper.y, at(16, 'berth')[1].deck.y, at(8, 'cabin')[1].upper.y, at(8, 'shed')[1].pit.y, at(2, 'well')[1].pit.y], [3, 1, -0.5, 4, -1.5, -2]);
  // The river steps come down onto the quay itself.
  { const [w, q] = at(1, 'steps'); assert.equal(w.floorAt(q.quay.x, q.quay.z), -2); assert.equal(w.floorAt(q.head.x, q.head.z), 0); }
  // Every room named above holds something to search, on its own floor.
  for (const [seed, kind] of [[0, 'gallery'], [8, 'cabin'], [8, 'sidings'], [1, 'glass']]) {
    const [w, q] = at(seed, kind);
    assert.ok(w.containers.some(c => distance(c, q.room) < 9 && w.floorAt(c.x, c.z) === q.room.y), `${kind}: a container in the room`);
  }
});

test('the render side takes every preset: a frame, rain cover, ramp slabs', () => {
  const stub = () => ({ globals: new Float32Array(8192), post: new Float32Array(64), opts: { shadows: true, textures: true }, height: 720, texReady: true });
  for (const [seed, preset] of SAMPLES) {
    const r = new Raid({ seed, world: sample(seed) }), p = r.player, scene = new Scene(stub());
    let f;
    for (let i = 0; i < 6; i++) f = scene.build(r, { aimX: p.x, aimZ: p.z - 4, aimHeld: false }, 1 / 60, 16 / 9);
    assert.ok(f.counts.some(n => n > 0), `${preset}: a frame`);
    for (const s of r.world.shapes) for (let o = 0; o < s.data.length; o += INST_FLOATS) assert.ok(Number.isFinite(s.data[o] + s.data[o + 1] + s.data[o + 2] + s.data[o + 4] + s.data[o + 5] + s.data[o + 6] + s.data[o + 8] + s.data[o + 11]) && s.data[o + 4] > 0 && s.data[o + 5] > 0 && s.data[o + 6] > 0, `${preset}: a degenerate instance`);
    assert.ok(buildCover(r.world).size > 0);
    if (preset === 'harbor') assert.ok(rampSlabs(r.world).length > 0, 'the cold store ramp is a slab');
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
  try { for (const k of [g.name, ...Object.values(DISTRICTS).map(d => d.name), ...Object.values(NAMES), 'Tally Light', 'Locked: hack an Intel Terminal or finish a field contract']) assert.notEqual(t(k), k, k); } finally { setLanguage('en'); }
});

// Landing, clearance, crossing, extract: the whole marked route on foot.
function tour(seed, seconds = 150) {
  const r = deploy(seed), p = r.player;
  r.autoPick = true;
  let phase = 'terminal';
  for (let i = 0; i < seconds / dt && !r.over; i++) {
    const w = r.world, goal = phase === 'terminal' ? w.dispatch : phase === 'passage' ? w.passage : w.extractions[0];
    const key = `${goal.type}:${goal.id}`;
    if (r.route?.target?.key !== key) setRoute(r, routeTargets(r).find(q => q.key === key), true);
    operate(r, r.route?.result?.path || [p, goal], goal);
    if (phase === 'terminal' && r.extractUnlocked) phase = 'passage';
    if (phase === 'passage' && r.districtStep) phase = 'extract';
  }
  return r;
}

test('operator can walk the marked route, earn clearance, defeat the guard and board in district two', () => {
  const r = tour(2);
  assert.equal(r.intel, 1); assert.equal(r.districtStep, 1); assert.ok(r.elites >= 1);
  assert.equal(r.world.preset, 'harbor');
  assert.equal(r.result?.outcome, 'extracted'); assert.ok(r.result.inv.some(q => q.name === 'Intel Shard'));
});

test('operator can walk Clinker Yards from its landing: terminal, guarded crossing, and out through Sounding Basin', () => {
  const r = tour(8);
  assert.equal(r.intel, 1); assert.equal(r.districtStep, 1); assert.ok(r.elites >= 1);
  assert.equal(r.world.preset, 'harbor');
  assert.equal(r.result?.outcome, 'extracted'); assert.equal(r.result.exit, r.world.extractions[0].name);
});

test('operator can enter Clinker Yards by the crossing and leave by its own gate', () => {
  // Seed 7 crosses from Alder Spillbank into the yards.
  assert.deepEqual(districtPlan(7).map(q => q.preset), ['fringe', 'yards']);
  const r = tour(7, 170);
  assert.equal(r.districtStep, 1); assert.equal(r.world.preset, 'yards'); assert.equal(r.result?.outcome, 'extracted');
});

test('set pieces are walked with ordinary movement: Lever Walk, the survey vessel, Linen Gallery, Spillbank Steps', () => {
  const stand = (seed, kind) => { const r = deploy(seed), q = r.world.places.find(k => k.kind === kind && k.named); place(r, q.gates[0]); r.autoPick = true; return [r, q, r.player]; };
  // Lever Walk: up the stair, over two roads of wagons four metres up, into the cabin, down the far side.
  { const [r, q, p] = stand(8, 'cabin');
    assert.ok(walkTo(r, q.upper), 'onto the bridge'); assert.equal(p.fy, 4);
    assert.ok(walkTo(r, q.room), 'into the cabin'); assert.equal(p.fy, 4);
    const found = search(r); assert.ok(found && found.kind === 'locker', 'the cabin locker is searched');
    assert.ok(walkTo(r, q.far), 'down the far stair'); assert.equal(p.fy, 0); assert.ok(p.hp > 0); }
  // The survey vessel: along the quay, up the gangway, onto the aft deck, and back ashore.
  { const [r, q, p] = stand(16, 'berth');
    assert.equal(p.fy, -2); assert.ok(walkTo(r, q.deck), 'aboard'); assert.equal(p.fy, -0.5);
    assert.ok(search(r), 'something aboard is searched');
    assert.ok(walkTo(r, q.gangway), 'ashore again'); assert.equal(p.fy, -2); }
  // Linen Gallery: the stair, the gallery, the open flat.
  { const [r, q, p] = stand(0, 'gallery');
    assert.ok(walkTo(r, q.upper), 'onto the gallery'); assert.equal(p.fy, 3);
    assert.ok(walkTo(r, q.room), 'into the flat'); assert.equal(p.fy, 3); assert.ok(search(r)); }
  // Spillbank Steps: from the street, across the promenade, down to the water.
  { const [r, q, p] = stand(1, 'steps');
    assert.ok(walkTo(r, q.head), 'to the head of the steps'); assert.equal(p.fy, 0);
    assert.ok(walkTo(r, q.quay), 'down to the quay'); assert.equal(p.fy, -2); }
});
