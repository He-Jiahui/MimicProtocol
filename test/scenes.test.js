// The two interior scenes on the height model (doc 64 Package 8; docs 32 and 44): the laundry
// court a level below its street, and the records tower with its mezzanine, breakable window
// and evacuation cabinet. Both are on the demo seed, reachable, and on the map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, reachNear, HMARK } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { findRoute } from '../src/sim/route.js';
import { t, setLanguage } from '../src/i18n/index.js';
import { Hud } from '../src/ui/hud.js';

const city = generateWorld(20261125);
const S = city.size;
const court = city.scenes.find((s) => s.kind === 'laundry'), tower = city.scenes.find((s) => s.kind === 'tower');
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const cells = (r, f) => { const out = []; for (let z = r[1]; z < r[3]; z++) for (let x = r[0]; x < r[2]; x++) out.push(f(x, z)); return out; };
function sandbox(x, z) { const raid = new Raid({ world: city, seed: 7, mode: 'sandbox' }); const p = raid.player; p.x = x; p.z = z; raid.world.place(p); return raid; }
const run = (raid, s, input = idle) => { for (let i = 0; i < s * 60 && !raid.over; i++) stepRaid(raid, 1 / 60, typeof input === 'function' ? input(raid) : input); };

test('scenes: both are on the demo seed, named on the map and reachable on foot', () => {
  assert.ok(court && tower, 'the laundry court and the records tower');
  const names = city.pois.filter((p) => p.type === 'scene').map((p) => p.name).sort();
  assert.deepEqual(names, ['Laundry Court', 'Records Tower']);
  for (const p of city.pois.filter((q) => q.type === 'scene')) assert.equal(city.cell(p.x, p.z) === 2, false, 'a map label, not an obstacle');
  assert.ok(reachNear(city, city.reach, court.x, court.z, 2), 'down in the court');
  const [mx, mz] = [(tower.mez[0] + tower.mez[2]) / 2, (tower.mez[1] + tower.mez[3]) / 2];
  assert.ok(reachNear(city, city.reach, mx, mz, 3), 'up on the mezzanine');
  try { setLanguage('zh-CN'); assert.equal(t('Laundry Court'), '洗衣庭院'); assert.equal(t('Records Tower'), '档案大楼'); } finally { setLanguage('en'); }
});

test('laundry court: a level below its street, by a short tenants\' stair, with its van, tree pit, room and basket', () => {
  for (const f of cells(court.court, (x, z) => city.floorAt(x + 0.5, z + 0.5))) assert.equal(f, -2);
  // The tenants' stair: four rows of 0.5 m down from the passage.
  const rows = new Set(cells(court.stair, (x, z) => city.floorAt(x + 0.5, z + 0.5)));
  assert.deepEqual([...rows].sort((a, b) => a - b), [-2, -1.5, -1, -0.5]);
  assert.ok(cells(court.stair, (x, z) => city.hmark[z * S + x]).every((m) => m === HMARK.STAIR));
  // The van stands on the court floor, the tree in its pit, the basket by the room door.
  const van = city.vehicles.find((v) => v.kind === 'van' && Math.hypot(v.x - court.van[0], v.z - court.van[1]) < 1.5);
  assert.ok(van && city.floorAt(van.x, van.z) === -2, 'the laundry van is down in the court');
  assert.equal(city.cell(...court.tree), 2);
  assert.equal(court.basket.kind, 'basket');
  assert.ok(city.containers.includes(court.basket), 'the lost-property basket survives the reach check');
  assert.equal(city.floorAt(court.basket.x, court.basket.z), -2);
  // The unloading room's door is at the court's level, and opens like any other.
  const d = court.door;
  assert.ok(d && d.kind === 'closed');
  assert.equal(city.floorAt(d.x - d.nx * 0.5, d.z - d.nz * 0.5), -2);
  const inside = city.containers.filter((c) => c.indoor && Math.hypot(c.x - d.x, c.z - d.z) < 8 && city.floorAt(c.x, c.z) === -2);
  assert.ok(inside.length >= 2, 'a locker and a crate in the unloading room');
  // Walk it: from the street through the passage, down the stair, into the court.
  const r = findRoute(sandbox(court.x, court.z), court.x, court.z, { x: court.basket.x, z: court.basket.z, reach: 2 });
  assert.equal(r.ok, true);
  const raid = sandbox(court.x, court.z);
  assert.equal(raid.player.fy, -2);
  const route = findRoute(raid, d.x + d.nx * 3, d.z + d.nz * 3, { x: d.x - d.nx * 2, z: d.z - d.nz * 2, reach: 1.2, los: false });
  assert.equal(route.ok, true, 'into the room through its door');
});

test('records tower: lobby at street level, mezzanine 4 m up by an interior stair, richer finds up there', () => {
  const [lx, lz] = tower.lobby;
  assert.equal(city.floorAt(lx, lz), 0);
  for (const f of cells(tower.mez, (x, z) => city.floorAt(x + 0.5, z + 0.5))) assert.equal(f, 4);
  const rows = [...new Set(cells(tower.stair, (x, z) => city.floorAt(x + 0.5, z + 0.5)))].sort((a, b) => a - b);
  assert.deepEqual(rows, [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], 'eight rows of 0.5 m');
  assert.equal(tower.door.kind, 'closed');
  // Three filing cabinets with the richer weighting, and the evacuation cabinet.
  assert.equal(tower.records.length, 3);
  for (const c of tower.records) { assert.equal(c.kind, 'records'); assert.ok(c.rich > 1); assert.equal(city.floorAt(c.x, c.z), 4); assert.ok(city.containers.includes(c)); }
  assert.equal(tower.evac.kind, 'evac');
  // Walking: the lobby door, the stair, the mezzanine.
  const raid = sandbox(lx, lz);
  const r = findRoute(raid, lx, lz, { x: tower.records[0].x, z: tower.records[0].z, reach: 2 });
  assert.equal(r.ok, true);
  assert.ok(r.path.some((q) => city.hmark[Math.floor(q.z) * S + Math.floor(q.x)] === HMARK.STAIR) || r.length > Math.hypot(tower.records[0].x - lx, tower.records[0].z - lz) + 4, 'by the interior stair');
  // Better loot weighting: a records cabinet pays more on average than a plain crate here.
  const value = (c) => { const rd = sandbox(lx, lz); let v = 0; for (let i = 0; i < 120; i++) { const st = { opened: false, progress: 0, host: false, locked: false }; rd.openContainer(c, st); for (const it of st.items) if (it.kind === 'loot') v += it.value; } return v; };
  const crate = city.containers.find((c) => c.kind === 'crate' && c.zone === tower.records[0].zone);
  assert.ok(value(tower.records[0]) > value(crate) * 1.3, 'richer than a crate of the same zone');
});

test('records tower: the window breaks loudly into a one-way drop; the descent line makes it free', () => {
  const win = tower.window, inward = { x: win.x - win.nx * 1.6, z: win.z - win.nz * 1.6 };
  assert.equal(city.cell(win.x, win.z), 1, 'whole: part of the wall');
  assert.equal(city.floorAt(win.x, win.z), 4);
  const drop = (line) => {
    const raid = sandbox(inward.x, inward.z), p = raid.player;
    assert.equal(p.fy, 4);
    // Someone disguised on the plaza hears it.
    const ear = raid.spawnEnemy('walker', win.x + win.nx * 8, win.z + win.nz * 8, { state: 'disguised' });
    if (line) {
      const st = raid.cont[tower.evac.id]; raid.openContainer(tower.evac, st);
      assert.equal(p.descentLines, 1, 'the cabinet holds a descent line');
      assert.deepEqual(Hud.prototype.statusChips.call({}, raid).map(([k]) => t(k)), ['DESCENT LINE x1'], 'carried, and shown');
    }
    raid.updateInteract(1 / 60, idle);
    assert.equal(raid.prompt && raid.prompt.type, 'window');
    run(raid, 1.2, { ...idle, interact: true });
    assert.equal(raid.windows[win.id].broken, true);
    assert.equal(raid.world.cell(win.x, win.z), 0);
    assert.equal(raid.world.drop[win.cell], 1, 'the sill is a drop cell now');
    assert.equal(city.drop[win.cell], 0, 'in this raid only');
    assert.equal(city.cell(win.x, win.z), 1);
    assert.ok(ear.aware > 0, 'it was heard');
    const hp = p.hp;
    run(raid, 2, { ...idle, mx: win.nx, mz: win.nz });
    assert.equal(p.fy, 0, 'down on the plaza');
    return { lost: (hp - p.hp) / p.maxHp, raid };
  };
  const plain = drop(false);
  assert.ok(Math.abs(plain.lost - 0.15) < 0.02, `a 4 m drop costs 15% (${plain.lost})`);
  const lined = drop(true);
  assert.equal(lined.lost, 0, 'the descent line takes the fall');
  assert.equal(lined.raid.player.descentLines, 0, 'and is used up');
  // A route never takes the window: from the mezzanine to the plaza it goes down the stair.
  const raid = sandbox(inward.x, inward.z);
  const r = findRoute(raid, inward.x, inward.z, { x: tower.plaza[0], z: tower.plaza[1], reach: 1.5 });
  assert.ok(r.length > 20, `round by the stair and the door (${r.length.toFixed(1)} m)`);
});

test('scenes: the full map names both places and the minimap marks them', async () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (tg, k) => (k in tg ? tg[k] : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'measureText' ? () => ({ width: 1 }) : (...a) => calls.push([k, ...a])), set: (tg, k, v) => { tg[k] = v; return true; } });
  globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  const { Minimap } = await import('../src/ui/minimap.js');
  const map = new Minimap(city), raid = new Raid({ world: city, seed: 7, mode: 'sandbox' });
  map.drawFull(ctx, 640, raid);
  const named = calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(named.includes('Laundry Court') && named.includes('Records Tower'), 'both named on the full map');
  calls.length = 0;
  raid.player.x = court.x; raid.player.z = court.z;
  map.draw(ctx, 208, raid);
  assert.ok(calls.some((c) => c[0] === 'fillRect' && c[3] > 4), 'the court marked on the minimap');
});
