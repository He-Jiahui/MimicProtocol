// The Matron's home (doc 45; doc 64 Package 8): the Reliquary cable works and her swing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { WORKS } from '../src/sim/works.js';
import { swing, SWING, arenaClamp, arenaOutside, arenaSpot } from '../src/sim/boss.js';

const city = generateWorld(20261125), A = city.boss, DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: A.x, aimZ: A.z, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const run = (raid, s, input = idle) => { for (let i = 0; i < Math.round(s / DT); i++) stepRaid(raid, DT, input); };
function fight() {
  const raid = new Raid({ world: city, seed: 5, classId: 'rifleman' }), p = raid.player, gate = city.pois.find((q) => q.type === 'boss');
  raid.noLethal = true; raid.autoPick = true;
  p.x = gate.x; p.z = gate.z;
  run(raid, 3.3, { ...idle, interact: true });
  assert.ok(raid.boss && raid.boss.active);
  run(raid, 2.8);                       // her entrance
  raid.boss.atkT = 99;                  // hold her own rotation: the test calls the move
  raid.boss.busy = 0;
  raid.events.length = 0;
  return raid;
}

test('works: a walled winding hall, 60 m by 32 m, entered by one gate in the south wall', () => {
  assert.equal(A.hx, WORKS.HX); assert.equal(A.hz, WORKS.HZ);
  const x0 = A.x - A.hx, x1 = A.x + A.hx, z0 = A.z - A.hz, z1 = A.z + A.hz;
  // Walls all round, except the gate.
  for (let x = x0; x < x1; x++) {
    assert.equal(city.cell(x + 0.5, z0 - 0.5), 1, `north wall at ${x}`);
    const gate = Math.abs(x + 0.5 - A.x) < WORKS.GATE;
    assert.equal(city.cell(x + 0.5, z1 + 0.5), gate ? 0 : 1, `south wall at ${x}`);
  }
  for (let z = z0; z < z1; z++) { assert.equal(city.cell(x0 - 0.5, z + 0.5), 1); assert.equal(city.cell(x1 + 0.5, z + 0.5), 1); }
  // Eight drum stands and nothing else on the floor; the roll-out strip down the middle is bare.
  let blocked = 0;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (city.cell(x + 0.5, z + 0.5) !== 0) blocked++;
  assert.equal(A.pillars.length, 8);
  assert.equal(blocked, 8 * 16, `${blocked} blocked cells: the stands and nothing else`);
  for (let x = x0; x < x1; x++) for (const dz of [-2, -1, 0, 1]) assert.equal(city.cell(x + 0.5, A.z + dz + 0.5), 0, 'the strip is bare');
  for (const s of A.pillars) assert.ok(Math.abs(s.z - A.z) >= 8, 'stands keep to the long walls');
  // The gate is walked to from the street, and the place she is woken is just inside it.
  const gate = city.pois.find((q) => q.type === 'boss');
  assert.ok(city.reach[Math.floor(gate.z) * city.size + Math.floor(gate.x)]);
  assert.ok(gate.z < z1 && gate.z > z1 - 8 && Math.abs(gate.x - A.x) < 1);
  assert.equal(A.landings.length, 6);
  for (const q of A.landings) { assert.ok(city.circleFree(q.x, q.z, 2.2), 'a landing is open floor'); assert.ok(!arenaOutside(A, q.x, q.z, -SWING.REACH), 'and its mark fits inside the walls'); }
});

test('works: places in the hall are a bearing and a share of the way to the wall; a bare arena is still a circle', () => {
  for (let k = 0; k < 16; k++) { const q = arenaSpot(A, k * 0.39, 0.84); assert.ok(!arenaOutside(A, q.x, q.z, -1)); }
  assert.deepEqual(arenaClamp(A, { x: A.x + 99, z: A.z - 99 }, 3), { x: A.x + A.hx - 3, z: A.z - A.hz + 3 });
  const C = { x: 10, z: 10, r: 20 };
  assert.equal(arenaOutside(C, 10, 31), true); assert.equal(arenaOutside(C, 10, 29), false);
  const q = arenaClamp(C, { x: 10, z: 60 }, 1);
  assert.ok(Math.abs(q.z - 29) < 1e-9 && q.x === 10);
  assert.deepEqual(arenaSpot(C, 0, 0.5), { x: 20, z: 10 });
});

test('swing: the landing is marked before she leaves the floor; she is out of reach while she hangs', () => {
  const raid = fight(), B = raid.boss, e = B.e, p = raid.player;
  p.x = A.x + 20; p.z = A.z + 5;                       // by the south-east landing
  const from = { x: e.x, z: e.z };
  assert.equal(swing(raid, B), true);
  const S = B.swing, L = A.landings.find((q) => q.x === S.x1 && q.z === S.z1);
  assert.ok(L, 'she makes for one of the six landings');
  assert.ok(Math.hypot(L.x - from.x, L.z - from.z) >= SWING.MIN, 'a real crossing');
  assert.equal(L, [...A.landings].filter((q) => Math.hypot(q.x - from.x, q.z - from.z) >= SWING.MIN).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0], 'the one nearest the operator');
  const marks = raid.areas.filter((a) => a.kind === 'tele');
  const land = marks.find((a) => a.x === L.x && a.z === L.z && a.r === SWING.REACH);
  assert.ok(land && Math.abs(land.life - (S.lead + SWING.HANG)) < 1e-9, 'the landing mark lasts the whole swing');
  assert.equal(marks.filter((a) => a.r === SWING.SAC).length, 1, 'one sac is shaken loose in the first phase');
  assert.ok(raid.events.some((ev) => ev.t === 'strand'), 'the strand is announced');
  assert.ok(e.strand && e.strand.y === A.railY);
  // The lead: still on the floor, still in reach.
  run(raid, S.lead * 0.6);
  assert.ok(!e.untargetable && !(e.hangY > 0) && e.x === from.x);
  // The crossing.
  let peak = 0, out = 0, n = 0;
  for (let i = 0; i < Math.round((S.lead * 0.4 + SWING.HANG) / DT) + 2 && B.swing; i++) { stepRaid(raid, DT, idle); n++; peak = Math.max(peak, e.hangY || 0); if (e.untargetable) out++; }
  assert.ok(peak > SWING.HEIGHT * 0.95, `she hangs ${peak.toFixed(1)} m up`);
  assert.ok(out / n > 0.6, 'out of reach for the crossing');
  assert.equal(B.swing, null);
  assert.ok(Math.hypot(e.x - L.x, e.z - L.z) < 0.01 && !e.untargetable && !e.hangY && !e.strand, 'down on the mark, in reach again');
  assert.ok(B.busy > 0.3, 'and a beat before her next move');
});

test('swing: two sacs in the frenzy, and standing on the mark is paid for', () => {
  const raid = fight(), B = raid.boss, p = raid.player;
  B.phase = 3;
  p.x = A.x - 16; p.z = A.z - 4;
  const hp = p.hp;
  swing(raid, B);
  assert.equal(raid.areas.filter((a) => a.kind === 'tele' && a.r === SWING.SAC).length, 2);
  p.x = B.swing.x1; p.z = B.swing.z1;
  run(raid, B.swing.lead + SWING.HANG + 0.1);
  assert.ok(p.hp < hp, 'the landing hurts whoever stood on its mark');
});

test('swing: a stagger cuts the strand and calls off the landing', () => {
  const raid = fight(), B = raid.boss, e = B.e, p = raid.player;
  p.x = A.x + 16; p.z = A.z + 5;
  swing(raid, B);
  const L = { x: B.swing.x1, z: B.swing.z1 }, at = { x: e.x, z: e.z };
  run(raid, 0.2);
  // What a poise break does.
  B.token++; e.staggerT = 4; e.windupT = 0; B.busy = 0;
  p.x = L.x; p.z = L.z;
  const hp = p.hp;
  run(raid, SWING.LEAD + SWING.HANG + 0.5);
  assert.equal(B.swing, null);
  assert.ok(!e.hangY && !e.strand && !e.untargetable);
  assert.ok(Math.hypot(e.x - at.x, e.z - at.z) < 0.01, 'she never left the floor');
  assert.equal(p.hp, hp, 'no landing, no blast');
});

test('works: once she nests, the webbed gate keeps the operator in', () => {
  const raid = fight(), p = raid.player;
  raid.bossArena.sealed = true;
  p.x = A.x; p.z = A.z + A.hz - 3;
  run(raid, 3, { ...idle, mz: 1 });
  assert.ok(p.z <= A.z + A.hz - 0.59, `held at ${p.z.toFixed(2)}`);
  raid.bossArena.sealed = false;
  run(raid, 2, { ...idle, mz: 1 });
  assert.ok(p.z > A.z + A.hz, 'and lets them out when she is dead');
});
