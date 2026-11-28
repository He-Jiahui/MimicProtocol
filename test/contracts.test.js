// Hub contracts and sector states (doc 21, scaled by doc 64): the board, what a raid does
// with the contracts it carries, what an extraction commits and a death loses, the gate on
// the lair, and what each Intel level changes in the next raid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import * as P from '../src/sim/profile.js';
import {
  SECTORS, OPS, CONTRACTS, LAIR_SECTOR, ensureOps, eligible, refreshBoard, acceptContract, abandonContract, opsForRaid, commitOrders,
  sectorEffects, orderLines, orderTargets, carried, heldCount, securedCount,
} from '../src/sim/contracts.js';
import { routeTargets } from '../src/sim/route.js';
import { SCAN_COOLDOWN } from '../src/sim/data.js';

const city = generateWorld(20261125), DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const run = (raid, s, input = idle) => { for (let i = 0; i < Math.round(s / DT); i++) stepRaid(raid, DT, input); };
const quiet = (o = {}) => { const raid = new Raid({ world: city, seed: 7, classId: 'rifleman', ...o }); raid.noLethal = true; raid.waveT = 1e9; raid.surgeT = 1e9; raid.eliteT = 1e9; raid.titanT = 1e9; raid.evts.dropAt = 1e9; raid.evts.debrisAt = 1e9; return raid; };
const clear = (raid) => { for (const m of raid.enemies) if (raid.isHostile(m)) raid.killEnemy(m); };
const order = (type, sector, left = CONTRACTS[type].need) => ({ id: `t-${type}`, type, sector, left });
const out = (raid, outcome = 'extracted') => { raid.finish(outcome); return raid.result; };

test('sectors: the district is five quarters, and every block of it belongs to one', () => {
  assert.equal(SECTORS.length, 5);
  const seen = new Set();
  for (let i = 0; i < city.n * city.n; i++) seen.add(city.style[i]);
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4]);
  assert.equal(city.styleAt(city.boss.x, city.boss.z), LAIR_SECTOR, 'the Matron lives in the Reliquary Quarter');
  assert.equal(city.styleAt(city.insertion.x, city.insertion.z), 0, 'the Shelter is in Old Town');
});

test('board: a new operator holds the two gate contracts; five offers; three held at most; abandon is free', () => {
  const p = P.newProfile(), O = p.ops;
  assert.deepEqual(O.sectors, [0, 0, 0, 0, 0]);
  assert.equal(O.lair, false);
  assert.deepEqual(O.active.map((c) => [c.type, c.sector, c.pinned]), [['survey', 0, false], ['deliver', 1, true]]);
  assert.equal(O.board.length, OPS.OFFERS);
  for (const c of O.board) assert.ok(c.type === 'survey' || c.type === 'hunt', 'nothing deeper than a survey before a survey');
  assert.ok(!O.board.some((c) => c.type === 'survey' && c.sector === 0), 'never what is already held');
  // The same record shows the same board.
  const again = JSON.parse(JSON.stringify(p)); refreshBoard(again);
  assert.deepEqual(again.ops.board.map((c) => [c.type, c.sector]), O.board.map((c) => [c.type, c.sector]));
  assert.equal(heldCount(p), 1);
  assert.ok(acceptContract(p, O.board[0].id).ok); assert.ok(acceptContract(p, O.board[0].id).ok);
  assert.equal(heldCount(p), 3);
  const refused = acceptContract(p, O.board[0].id);
  assert.equal(refused.ok, false); assert.match(refused.why, /three contracts/);
  assert.equal(abandonContract(p, O.active.find((c) => c.pinned).id).ok, false, 'the pinned one stays');
  const drop = O.active.find((c) => !c.pinned && c.sector !== 0);
  assert.ok(abandonContract(p, drop.id).ok);
  assert.equal(heldCount(p), 2);
  assert.ok(O.board.some((c) => c.type === drop.type && c.sector === drop.sector), 'and is offered again');
});

test('board: an operator from before contracts who has killed the Matron keeps the lair open', () => {
  const p = P.newProfile();
  delete p.ops; p.stats.bossKills = 2;
  ensureOps(p);
  assert.equal(p.ops.lair, true);
  assert.equal(p.ops.sectors[LAIR_SECTOR], 3);
  assert.ok(!p.ops.active.some((c) => c.type === 'deliver'));
});

test('survey: three marks in the sector, each taken by a Scan Pulse within 12 m; it counts on extraction', () => {
  const raid = quiet({ orders: [order('survey', 0)] }), p = raid.player, marks = raid.ops.marks;
  assert.equal(marks.length, 3);
  for (const m of marks) { assert.equal(raid.sectorAt(m.x, m.z), 0); assert.ok(city.isFree(m.x, m.z)); }
  assert.ok(routeTargets(raid).some((t) => t.kind === 'order'), 'a mark can be followed');
  p.x = marks[0].x + OPS.SURVEY_R + 6; p.z = marks[0].z;
  run(raid, 0.2, { ...idle, scan: true });
  assert.equal(marks[0].done, false, 'too far');
  for (const m of marks) { p.x = m.x + 3; p.z = m.z; run(raid, SCAN_COOLDOWN + 0.3); run(raid, 0.1, { ...idle, scan: true }); }
  assert.ok(marks.every((m) => m.done));
  assert.deepEqual(orderLines(raid).map((l) => [l.have, l.need, l.done]), [[3, 3, true]]);
  assert.equal(orderTargets(raid).length, 0);
  const res = out(raid);
  assert.deepEqual(res.orders, [{ id: 't-survey', type: 'survey', sector: 0, gained: 3, tried: 3 }]);
});

test('sensor: two probes in the pack, 20 s at a node with a wave at the half, nothing without a probe', () => {
  const raid = quiet({ orders: [order('sensor', 1)] }), p = raid.player, nodes = raid.ops.marks;
  assert.equal(nodes.length, 2);
  assert.equal(carried(raid, 'probe'), 2);
  assert.equal(raid.sellableValue(), 0, 'a broker cannot buy a probe');
  p.x = nodes[0].x + 1.4; p.z = nodes[0].z;
  run(raid, 0.2);
  assert.match(raid.prompt.label.source || raid.prompt.label, /Sensor Probe/);
  let waved = 0;
  for (let i = 0; i < 60 * (OPS.SENSOR_HOLD + 0.5) && !nodes[0].done; i++) {
    stepRaid(raid, DT, { ...idle, interact: true });
    if (!waved && raid.enemies.some((m) => raid.isHostile(m))) waved = i / 60;
    clear(raid);
  }
  assert.ok(nodes[0].done);
  assert.ok(Math.abs(waved - OPS.SENSOR_HOLD / 2) < 1, `the wave came at ${waved.toFixed(1)} s`);
  assert.equal(carried(raid, 'probe'), 1);
  p.inv = p.inv.filter((i) => i.key !== 'probe');
  p.x = nodes[1].x + 1.4; p.z = nodes[1].z;
  run(raid, 0.5, { ...idle, interact: true });
  assert.equal(raid.prompt.ok, false);
  assert.match(raid.prompt.label.source || raid.prompt.label, /no probe/);
  assert.equal(out(raid).orders[0].gained, 1);
});

test('purge and hunt: a marked brood wakes when approached; elites count only in the named sector', () => {
  const raid = quiet({ orders: [order('purge', 2), order('hunt', 4)] }), p = raid.player, broods = raid.ops.marks;
  assert.equal(broods.length, 2);
  p.x = broods[0].x + 10; p.z = broods[0].z;
  run(raid, 0.2);
  const pack = raid.enemies.filter((m) => m.group === broods[0].g);
  assert.equal(pack.length, 5);
  assert.equal(pack.filter((m) => m.elite).length, 1);
  for (const m of pack) raid.killEnemy(m);
  run(raid, 0.1);
  assert.equal(broods[0].done, true);
  // That elite died in Arcology Heights: the Dockside hunt did not move.
  const lines = orderLines(raid);
  assert.deepEqual(lines.map((l) => l.have), [1, 0]);
  const dock = city.extractions[1];
  for (let k = 0; k < 3; k++) { const e = raid.spawnEnemy('walker', dock.x + k, dock.z, { state: 'hunt', elite: raid.rollAffixes() }); raid.killEnemy(e); }
  assert.equal(orderLines(raid)[1].have, 3);
});

test('deliver: cells wait in the sector\'s containers with one spare, ride as cargo, and are Command\'s on the way out', () => {
  const raid = quiet({ orders: [order('deliver', 1)] }), p = raid.player;
  const holds = city.containers.filter((c) => raid.cont[c.id].cell);
  assert.equal(holds.length, 3 + OPS.CELL_SPARE);
  for (const c of holds) { assert.equal(city.styleAt(c.x, c.z), 1); assert.ok(!raid.cont[c.id].host, 'never in a Host'); }
  assert.equal(orderTargets(raid).length, 0, 'unmarked in a sector Command has not surveyed');
  for (const c of holds) raid.openContainer(c, raid.cont[c.id]);
  const cells = holds.flatMap((c) => raid.cont[c.id].items.filter((i) => i.key === 'cell'));
  assert.equal(cells.length, 4);
  for (const it of cells) assert.ok(raid.addInv(it));
  assert.deepEqual(orderLines(raid).map((l) => [l.have, l.need]), [[3, 3]]);
  const res = out(raid);
  assert.equal(res.orders[0].gained, 3);
  assert.ok(!res.inv.some((i) => i.key), 'no cell reaches the stash');
  // With the sector surveyed, the containers are marked.
  const known = quiet({ orders: [order('deliver', 1)], sectors: { 1: 1 } });
  assert.equal(orderTargets(known).filter((t) => t.kind === 'cell').length, 4);
  // Dying with them: nothing counted, and no cell for a drone to lift.
  const lost = quiet({ orders: [order('deliver', 1)] });
  for (const c of city.containers.filter((k) => lost.cont[k.id].cell)) { lost.openContainer(c, lost.cont[c.id]); for (const it of lost.cont[c.id].items.filter((i) => i.key)) lost.addInv(it); }
  const dead = out(lost, 'dead');
  assert.equal(dead.orders[0].gained, 0);
  assert.ok(!dead.cargo.some((i) => i.key));
});

test('commit: only an extraction counts; a finished contract pays, raises the sector and leaves the board', () => {
  const p = P.newProfile(), O = p.ops, survey = O.active.find((c) => c.type === 'survey');
  p.tutorial.done = true;
  const base = { mode: 'raid', tier: 2, classId: 'rifleman', value: 0, bonus: 0, contractPay: 0, bossCash: 0, credits: 0, creditCash: 0, penalty: 0, inv: [], cargo: [], samples: 0, cores: 0, kills: 0, elites: 0, civKills: 0, bossKilled: false, taken: 0, pack: null, packOut: null, classXp: { gain: 0 }, jobs: [], contracts: [], zmax: 1, nl: 0, clock: 19, seconds: 60 };
  const cash = p.cash, samples = p.samples;
  let d = P.applyRaidResult(p, { ...base, outcome: 'dead', orders: [{ id: survey.id, gained: 0, tried: 3 }] });
  assert.equal(survey.have, 0); assert.equal(O.sectors[0], 0);
  assert.equal(d.ops[0].kept, false);
  d = P.applyRaidResult(p, { ...base, outcome: 'extracted', orders: [{ id: survey.id, gained: 2 }] });
  assert.equal(survey.have, 2, 'progress is kept between raids');
  assert.equal(O.sectors[0], 0);
  p.seq++;
  d = P.applyRaidResult(p, { ...base, outcome: 'extracted', orders: [{ id: survey.id, gained: 1 }] });
  assert.equal(O.sectors[0], 1);
  assert.ok(!O.active.includes(survey));
  assert.equal(p.cash - cash, Math.round(250 * 1.15), 'paid at the tier it was finished on');
  assert.equal(p.samples - samples, 1);
  assert.ok(d.ops[0].done && d.ops[0].reward.length === 2);
  assert.ok(d.cashGain >= Math.round(250 * 1.15), 'and the debrief counts it');
  assert.ok(O.board.some((c) => c.type === 'sensor' && c.sector === 0) || eligible(p).some((c) => c.type === 'sensor' && c.sector === 0), 'the next step is offered');
  assert.equal(sectorEffects(p)[0].intel, 'Surveyed');
  assert.equal(sectorEffects(p)[0].effects.length, 1);
});

test('gate: the lair stays dark until Old Town is surveyed and three cells are home; then the Matron is the pinned work', () => {
  const p = P.newProfile(), O = p.ops;
  assert.equal(opsForRaid(p).lair, false);
  const dark = quiet({ ...opsForRaid(p) }), gate = city.pois.find((q) => q.type === 'boss');
  dark.player.x = gate.x; dark.player.z = gate.z;
  run(dark, 4, { ...idle, interact: true });
  assert.equal(dark.boss, null, 'finding it does not wake her');
  assert.equal(dark.prompt.ok, false);
  assert.match(dark.prompt.label.source || dark.prompt.label, /Command has not powered/);
  const deliver = O.active.find((c) => c.type === 'deliver'), survey = O.active.find((c) => c.type === 'survey');
  commitOrders(p, { outcome: 'extracted', tier: 1, orders: [{ id: deliver.id, gained: 3 }] });
  assert.equal(O.lair, false, 'cells alone are not enough');
  const lines = commitOrders(p, { outcome: 'extracted', tier: 1, orders: [{ id: survey.id, gained: 3 }] });
  assert.equal(O.lair, true);
  assert.ok(lines.some((l) => /Reliquary gate/.test(l.title.source || l.title)));
  assert.deepEqual(O.active.filter((c) => c.pinned).map((c) => c.type), ['boss']);
  const open = quiet({ ...opsForRaid(p) });
  open.player.x = gate.x; open.player.z = gate.z;
  run(open, 3.3, { ...idle, interact: true });
  assert.ok(open.boss && open.boss.active);
  // Her death, carried home, secures the quarter.
  const boss = O.active.find((c) => c.type === 'boss');
  open.bossKilled = true; run(open, 0.1);
  assert.equal(orderLines(open).find((l) => l.type === 'boss').have, 1);
  commitOrders(p, { outcome: 'extracted', tier: 1, orders: [{ id: boss.id, gained: 1 }] });
  assert.equal(O.sectors[LAIR_SECTOR], 3);
  assert.equal(securedCount(p), 1);
  assert.ok(!eligible(p).some((c) => c.type === 'purge' && c.sector === LAIR_SECTOR));
});

test('intel: each level changes the next raid as posted', () => {
  // L1: the sector's fixed activities, its events and its field jobs are known from the start.
  const s1 = quiet({ sectors: { 4: 1 } });
  const relay = s1.jobs.list.find((j) => j.kind === 'relay');
  assert.equal(s1.sectorAt(relay.x, relay.z), 4);
  assert.equal(relay.state, 'known');
  assert.equal(quiet().jobs.list.find((j) => j.kind === 'relay').state, 'hidden');
  for (const q of city.pois) assert.equal(s1.surveyed.has(q.id), city.styleAt(q.x, q.z) === 4);
  // L2: its exits are known and its containers are Hosts less often.
  const s2 = quiet({ sectors: { 4: 2 } }), dock = city.extractions[1];
  assert.equal(s2.poi[dock.id].known, true);
  assert.equal(quiet().poi[dock.id].known, false);
  let plain = 0, wired = 0, n = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const a = new Raid({ world: city, seed }), b = new Raid({ world: city, seed, sectors: { 4: 2 } });
    for (const c of city.containers) { if (city.styleAt(c.x, c.z) !== 4) { assert.equal(a.cont[c.id].host, b.cont[c.id].host, 'other sectors are untouched'); continue; } n++; plain += a.cont[c.id].host; wired += b.cont[c.id].host; }
  }
  assert.ok(wired < plain && wired / plain > 0.6 && wired / plain < 0.95, `Hosts ${plain} -> ${wired} of ${n}`);
  // L3: half the elites, one affix at most, and one container in four with an extra find.
  const count = (o) => { const r = quiet(o); let e = 0, two = 0; for (let k = 0; k < 400; k++) for (const m of r.spawnPack(dock.x, dock.z, ['walker'], { state: 'hunt' })) { if (m.elite) { e++; if (m.elite.length > 1) two++; } m.dead = true; } return [e, two]; };
  const [e0] = count({}), [e3, two3] = count({ sectors: { 4: 3 } });
  assert.ok(e3 < e0 * 0.75 && e3 > 0, `elites ${e0} -> ${e3}`);
  assert.equal(two3, 0);
  const items = (o) => { const r = quiet(o); let k = 0; for (const c of city.containers) if (city.styleAt(c.x, c.z) === 4 && !r.cont[c.id].host) { r.openContainer(c, r.cont[c.id]); k += (r.cont[c.id].items || []).length; } return k; };
  assert.ok(items({ sectors: { 4: 3 } }) > items({}), 'a Secured sector pays in volume');
});
