// Combat feel and encounters (doc 64, Package 3) and raid items (Package 4). Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { chargeLane, inLane, CHARGE_LEN } from '../src/sim/behave.js';
import { t } from '../src/i18n/index.js';

const city = generateWorld(20261125);
const DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const sandbox = (o = {}) => { const r = new Raid({ world: city, seed: 5, mode: 'sandbox', ...o }); r.player.crit = 0; return r; };
const run = (raid, seconds, input = idle) => { for (let i = 0; i < seconds * 60 && !raid.over; i++) stepRaid(raid, DT, typeof input === 'function' ? input(raid, DT) : input); };
const near = (actual, expected, msg = '') => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg} ${actual} vs ${expected}`);
// The first direction from (x, z) with `len` metres of clear floor, 3 m wide.
const clear = (x, z, a, len) => {
  for (const k of [-1.5, 0, 1.5]) for (let s = 0; s <= len; s += 0.2) if (city.cell(x - Math.sin(a) * k + Math.cos(a) * s, z + Math.cos(a) * k + Math.sin(a) * s) !== 0) return false;
  return true;
};
const openDir = (x, z, len) => { for (let a = 0; a < 6.283; a += 0.05) if (clear(x, z, a, len) && clear(x, z, a + Math.PI, 6)) return a; return null; };

test('brute: the charge lane is a rectangle, body + operator + 0.4 m wide, to the first wall or 16.25 m (64 Package 3)', () => {
  const raid = sandbox(), p = raid.player;
  const b = raid.spawnEnemy('brute', p.x, p.z, { state: 'hunt' });
  const L = chargeLane(raid, b, openDir(p.x, p.z, 20));
  near(L.len, CHARGE_LEN, 'an open lane'); near(CHARGE_LEN, 16.25);
  near(L.hw, b.r + p.r + 0.4, 'half-width');
  // A wall stands 8 m east of the insertion point.
  const W = chargeLane(raid, b, 0);
  assert.ok(W.len > 6 && W.len < 9, `the lane stops at the wall: ${W.len}`);
  const at = (along, side) => [L.x + L.ux * along - L.uz * side, L.z + L.uz * along + L.ux * side];
  assert.ok(inLane(L, ...at(10, L.hw - 0.05)) && !inLane(L, ...at(10, L.hw + 0.05)) && !inLane(L, ...at(16.4, 0)));
});

test('brute: the lane predicts contact, and the blown recovery reads Overextended (64 Package 3)', () => {
  // The Brute charges an operator 12 m down an open street; standing in the lane is a hit.
  const charge = (sidestep) => {
    const raid = sandbox(), p = raid.player, a = openDir(p.x, p.z, 20);
    const b = raid.spawnEnemy('brute', p.x + Math.cos(a) * 12, p.z + Math.sin(a) * 12, { state: 'hunt' });
    b.chargeCd = 0; b.atkCd = 99; b.speed = 0;
    let hp = p.hp, lane = null;
    for (let i = 0; i < 60 * 4 && !(b.mode === 'recover'); i++) {
      stepRaid(raid, DT, idle); raid.events.length = 0;
      if (!lane && b.lane && b.windupT > 0) {
        lane = b.lane;
        assert.ok(raid.areas.some((k) => k.kind === 'tele' && k.lane === lane), 'the lane is on the floor');
        if (sidestep) { p.x += lane.uz * (lane.hw + 0.3); p.z -= lane.ux * (lane.hw + 0.3); }
      }
    }
    assert.ok(lane, 'it committed to a charge');
    return { hit: p.hp < hp, b };
  };
  const inside = charge(false), outside = charge(true);
  assert.equal(inside.hit, true, 'inside the lane');
  assert.equal(outside.hit, false, 'a step out of the lane');
  assert.ok(outside.b.winded && outside.b.mode === 'recover', 'Overextended during the recovery');
  // Recovery: 2.0 s after a wall, 1.3 s at the end of an open lane.
  const recover = (angle) => {
    const raid = sandbox(), p = raid.player;
    const b = raid.spawnEnemy('brute', p.x, p.z, { state: 'hunt' });
    p.x -= 30; p.invuln = true;
    b.mode = 'charge'; b.modeT = 1.25; b.charge = { vx: Math.cos(angle) * 13, vz: Math.sin(angle) * 13, hit: false };
    for (let i = 0; i < 120 && b.mode === 'charge'; i++) { stepRaid(raid, DT, idle); raid.events.length = 0; }
    return [b.mode, b.winded, Number(b.modeT.toFixed(1))];
  };
  assert.deepEqual(recover(0), ['recover', true, 2.0], 'into the wall');
  assert.deepEqual(recover(openDir(city.insertion.x, city.insertion.z, 20)), ['recover', true, 1.3], 'out of lane');
});

test('brute: the frontal plate takes 70% inside 60 degrees, not on a flank, a heavy hit or a recovery (64 Package 3)', () => {
  const raid = sandbox(), p = raid.player;
  const b = raid.spawnEnemy('brute', p.x + 4, p.z, { state: 'hunt' });
  b.hp = b.maxHp = 1000; b.face = Math.PI; // facing the operator
  near(raid.damageEnemy(b, 100), 30, 'front');
  assert.ok(raid.events.some((e) => e.t === 'ring') && raid.events.some((e) => e.t === 'sfx' && e.name === 'clank'), 'the plate rings');
  assert.ok(raid.events.some((e) => e.t === 'dmg' && e.guard && e.amount > 0), 'and the hit still shows damage, not immunity');
  b.face = Math.PI - 55 * Math.PI / 180; near(raid.damageEnemy(b, 100), 30, 'at 55 degrees');
  b.face = Math.PI / 2; near(raid.damageEnemy(b, 100), 100, 'flank');
  b.face = Math.PI;
  near(raid.damageEnemy(b, 130), 130, 'one hit over 12% of maximum health punches through');
  near(raid.damageEnemy(b, 10, { dot: true }), 10, 'ticks are not hits');
  near(raid.damageEnemy(b, 100, { fx: b.x + 3, fz: b.z }), 100, 'a round from behind');
  b.mode = 'recover';
  near(raid.damageEnemy(b, 100), 100, 'recovering');
});

test('clean dodge: the readout names the class payout actually received, zero at capacity (64 Package 3)', () => {
  const dodge = (classId, setup) => {
    const raid = sandbox({ classId }), p = raid.player;
    setup(p);
    p.iframes = 0.3; raid.time = 1;
    raid.damagePlayer(10, p.x + 1, p.z);
    const e = raid.events.find((v) => v.t === 'dodged');
    return t(e.gain);
  };
  assert.equal(dodge('rifleman', (p) => { p.cells = 3; }), '+0 rounds');
  assert.equal(dodge('rifleman', () => {}), '+8 rounds');
  assert.equal(dodge('blade', (p) => { p.momentum = 90; }), '+10 momentum');
  assert.equal(dodge('summoner', (p) => { p.radioT = 2; }), 'Radio ready');
  assert.equal(dodge('summoner', () => {}), 'Radio already ready');
  assert.equal(dodge('toxic', () => {}), 'Venom on 0');
});
