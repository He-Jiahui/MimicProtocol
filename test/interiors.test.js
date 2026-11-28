import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, reachNear, requiredPlaces } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { findRoute } from '../src/sim/route.js';
import { HMARK } from '../src/sim/height.js';
import { SCAN_RANGE } from '../src/sim/data.js';
import { t, setLanguage } from '../src/i18n/index.js';

const city = generateWorld(20261125), hotel = city.scenes.find(s => s.kind === 'hotel');
const dt = 1 / 60, idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0 };
const offset = (a, dir, d) => ({ x: a.x + dir.x * d, z: a.z + dir.z * d });
const direction = (a, b) => { const d = Math.hypot(b.x - a.x, b.z - a.z); return { x: (b.x - a.x) / d, z: (b.z - a.z) / d }; };
const cell = (w, p) => w.size * Math.floor(p.z) + Math.floor(p.x);
function sandbox(point) {
  const raid = new Raid({ world: city, seed: 9, mode: 'sandbox' });
  raid.player.x = point.x; raid.player.z = point.z; raid.world.place(raid.player); raid.computeField(); return raid;
}
// Only supply movement input after spawning. A bad riser, gap or invisible obstacle
// fails with the actual cell and elevation where the body got stuck.
function walk(raid, point) {
  const p = raid.player, limit = 60 * (2 + Math.ceil(Math.hypot(point.x - p.x, point.z - p.z) / p.speed));
  for (let n = 0; n < limit; n++) {
    const dx = point.x - p.x, dz = point.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.10) return;
    stepRaid(raid, dt, { mx: dx / d, mz: dz / d, aimX: point.x, aimZ: point.z });
  }
  assert.fail(`Walking to ${point.x},${point.z} stopped at ${p.x.toFixed(1)},${p.z.toFixed(1)} on floor ${p.fy}`);
}

test('a majority of building footprints have a reachable entry and most of those lead upstairs', () => {
  for (const w of [city, generateWorld(14), generateWorld(20261128)]) {
    const open = w.buildings.filter(b => b.entry && w.reach[cell(w, b.entry)]);
    const upper = open.filter(b => b.upper && w.reach[cell(w, b.upper)] && w.floorAt(b.upper.x, b.upper.z) > 0);
    assert.ok(open.length > w.buildings.length / 2 && upper.length > open.length / 2, `seed ${w.seed}: ${upper.length} climbable, ${open.length} entered, ${w.buildings.length} total`);
    const hotel = w.scenes.find(s => s.kind === 'hotel');
    assert.ok(hotel?.bridges.every(p => w.reach[cell(w, p)]), 'a fitting lot for both spans');
    for (const p of requiredPlaces(w)) assert.ok(reachNear(w, w.reach, p.x, p.z, p.type === 'nest' ? p.r : 2), p.type);
  }
});

test('a street shop and dock workshop can both be entered and climbed by the operator', () => {
  for (const kind of ['shopGallery', 'workshop']) {
    const b = city.buildings.find(b => b.kind === kind), [x0, z0, x1, z1] = b.foot;
    const a = b.entry, inward = { x: +(a.x === x0 + 0.5) - +(a.x === x1 - 0.5), z: +(a.z === z0 + 0.5) - +(a.z === z1 - 0.5) };
    const raid = sandbox(offset(a, inward, -1));
    walk(raid, offset(a, inward, 1.5));
    const p = raid.player, r = findRoute(raid, p.x, p.z, { ...b.upper, reach: 0.9 });
    assert.ok(r.ok); for (const point of r.path) walk(raid, point);
    assert.ok(p.fy >= 2.5 && p.hp === p.maxHp, `${kind}: reached a walkable gallery`);
  }
});

test('both hotel skybridges can be crossed between wings; two committed drops lead back to the street', () => {
  const [a, b] = hotel.towers, inward = direction(a.roof, a.street);
  const raid = sandbox(offset(a.entry, inward, -2)), p = raid.player;
  walk(raid, offset(a.entry, inward, 1.5)); walk(raid, a.stairFoot);
  walk(raid, offset(a.stairFoot, inward, 14));
  walk(raid, hotel.bridges[0]); assert.equal(p.fy, 6);
  walk(raid, offset(b.stairFoot, inward, 14)); walk(raid, offset(b.stairFoot, inward, 31.5));
  walk(raid, hotel.bridges[1]); assert.equal(p.fy, 12);
  walk(raid, a.upper); walk(raid, a.escape); assert.equal(p.hp, p.maxHp);
  walk(raid, a.roof); assert.equal(p.fy, 6);
  const falls = () => raid.events.filter(e => e.t === 'fall');
  assert.equal(falls().length, 1); assert.ok(Math.abs(p.hp / p.maxHp - 0.6) < 0.01);
  walk(raid, a.street); assert.equal(p.fy, 0);
  assert.deepEqual(falls().map(e => [e.m, e.share]), [[6, 0.4], [6, 0.4]]);
  assert.ok(!raid.over && p.hp > 0, 'can walk away from the second landing');
});

test('holding the hotel lift moves the operator between its own landings, once per press', () => {
  const stop = city.pois.find(p => p.type === 'lift' && p.up && city.floorAt(p.to.x, p.to.z) === 12);
  const raid = sandbox(stop), p = raid.player;
  assert.equal(raid.findInteract().type, 'lift');
  const hold = n => { for (let k = 0; k < n; k++) stepRaid(raid, dt, { ...idle, interact: true }); };
  hold(15); assert.equal(p.fy, 0, 'passing the doors or tapping does not board');
  hold(180); assert.equal(p.fy, 12); assert.equal(p.fc, cell(city, stop.to));
  stepRaid(raid, dt, idle); hold(70); assert.equal(p.fy, 0); assert.equal(p.fc, cell(city, stop));
  assert.equal(p.hp, p.maxHp); assert.ok(!raid.events.some(e => e.t === 'fall'));
});

test('subway and sewer: enter from the street, traverse the covered passage and climb out the second mouth', () => {
  for (const kind of ['subway', 'sewer']) {
    const s = city.scenes.find(q => q.kind === kind), [a, b] = s.mouths;
    const raid = sandbox(a), p = raid.player;
    assert.ok(findRoute(raid, a.x, a.z, { ...s.passage, reach: 1 }).ok);
    walk(raid, s.landings[0]); walk(raid, s.passage); assert.equal(p.fy, -s.depth);
    walk(raid, s.landings[1]); walk(raid, b); assert.equal(p.fy, 0); assert.equal(p.hp, p.maxHp);
  }
});

test('a walker hunts up the hotel stairs without climbing a sheer face or using a lift; scanning retains its range', () => {
  const a = hotel.towers[0], raid = sandbox(a.upper), p = raid.player;
  const e = raid.spawnEnemy('walker', a.stairFoot.x, a.stairFoot.z, { state: 'hunt' });
  let steps = 0;
  for (let n = 0; n < 60 * 18 && e.fy < 12; n++) {
    const last = e.fy; stepRaid(raid, dt, idle);
    assert.ok(e.fy - last <= 0.5); if (e.fy > last && city.hmark[e.fc] === HMARK.STAIR) steps++;
  }
  assert.equal(e.fy, 12); assert.ok(steps >= 20, 'took both flights');
  const down = direction(a.roof, a.street), brute = raid.spawnEnemy('brute', a.street.x, a.street.z, { state: 'hunt' });
  for (let k = 0; k < 120; k++) raid.moveEnemy(brute, -down.x, -down.z, 5, dt);
  assert.equal(brute.fy, 0, 'the escape ledge cannot be climbed from below');
  const near = raid.spawnEnemy('walker', p.x, p.z + SCAN_RANGE - 2), far = raid.spawnEnemy('walker', p.x, p.z + SCAN_RANGE + 2);
  raid.doScan(); assert.ok(near.outlineT > 0 && !far.outlineT, 'pulse still uses the district radius');
});

test('the three map labels and both lift prompts have localized display text', () => {
  const keys = ['Tideglass Hotel', 'Siltline Station', 'Overflow Conduit', 'Ride lift to gallery', 'Ride lift to lobby'];
  const labels = city.pois.filter(p => p.type === 'scene').map(p => p.name);
  for (const key of keys.slice(0, 3)) assert.ok(labels.includes(key));
  try { setLanguage('zh-CN'); for (const key of keys) assert.match(t(key), /\p{Script=Han}/u); }
  finally { setLanguage('en'); }
});
