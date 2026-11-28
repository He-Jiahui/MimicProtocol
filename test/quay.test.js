// The sunken quay and the market street (doc 64 Package 8, doc 29): both quays a level down
// with the water below them, a stair at every bridge abutment, a freight ramp on each side,
// the quay dressing moved down with them, and a market street along the top of the west wall.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, reachable, reachNear, INST_FLOATS, SHAPE, MAT, HMARK, QUAY_IN, QUAY_OUT, QUAY_Y, WATER_Y, MARKET_W } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { findRoute } from '../src/sim/route.js';

const city = generateWorld(20261125);
const { canalX } = city.net, S = city.size;
const bridges = city.net.bridges, market = city.net.market;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const at = (x, z) => Math.floor(z) * S + Math.floor(x);
const statics = (shape, f) => { const d = city.shapes[shape].data, out = []; for (let o = 0; o < d.length; o += INST_FLOATS) if (f(d, o)) out.push(d.subarray(o, o + INST_FLOATS)); return out; };

test('quay: both quays sit 2 m down, the water below them, the bridges at street level', () => {
  assert.ok(bridges.length >= 2);
  const z = (bridges[0].z + bridges[1].z) / 2;
  for (const s of [-1, 1]) {
    assert.equal(city.floorAt(canalX + s * (QUAY_IN + 2.5), z), QUAY_Y, 'the quay');
    assert.equal(city.floorAt(canalX + s * (QUAY_OUT + 2.5), z), 0, 'the street or lot above it');
  }
  assert.equal(city.floorAt(canalX, z), WATER_Y, 'the water, below the quays');
  for (const b of bridges) {
    assert.equal(city.floorAt(canalX, b.z), 0, 'the deck');
    assert.equal(city.hmark[at(canalX, b.z)], HMARK.DECK);
    for (const s of [-1, 1]) assert.equal(city.floorAt(canalX + s * (QUAY_IN + 3), b.z), 0, 'the abutment');
  }
  // The water is still water: a low obstacle that stops feet, not shots.
  assert.equal(city.cell(canalX, z), 2);
});

test('quay: a stair at every bridge abutment, a freight ramp on each side', () => {
  let stairs = 0;
  const ramps = { [-1]: 0, [1]: 0 };
  for (const b of bridges) {
    for (const s of [-1, 1]) {
      for (const dir of [-1, 1]) {
        const z0 = dir < 0 ? b.z - b.t - 1 : b.z + b.t;
        if (z0 < 8 || z0 > S - 8) continue;
        // The water-side column always holds a stair: 0.5 m a row down to the quay.
        const x = canalX + s * (QUAY_IN + 1.5);
        for (let k = 0; k < 4; k++) {
          const zz = z0 + dir * k;
          assert.equal(city.hmark[at(x, zz)], HMARK.STAIR, `stair row ${k} at bridge ${b.z} side ${s} dir ${dir}`);
          assert.equal(city.floorAt(x, zz), -0.5 * (k + 1));
        }
        stairs++;
        const lx = canalX + s * (QUAY_OUT - 1.5);
        if (city.hmark[at(lx, z0)] === HMARK.RAMP) {
          ramps[s]++;
          for (let k = 0; k < 8; k++) assert.equal(city.floorAt(lx, z0 + dir * k), -0.25 * (k + 1), 'a ramp drops 0.25 m a row');
        }
      }
    }
  }
  assert.ok(stairs >= bridges.length * 4 - 2, `${stairs} stairs`);
  assert.equal(ramps[-1], 1, 'one freight ramp on the west quay');
  assert.equal(ramps[1], 1, 'one on the east');
});

test('quay: the quays can be walked to and back by their stairs; the Dock Boat stays reachable', () => {
  const seen = city.reach, mid = (bridges[0].z + bridges[1].z) / 2;
  for (const s of [-1, 1]) assert.ok(reachNear(city, seen, canalX + s * (QUAY_IN + 3), mid, 2), `quay ${s} reachable`);
  const boat = city.extractions[1];
  assert.equal(boat.name, 'Dock Boat');
  assert.ok(city.reach[at(boat.x, boat.z)]);
  // From the quay back up: the reach map from a quay cell finds the insertion again.
  const back = reachable(city, null, { x: canalX - QUAY_IN - 3, z: mid });
  assert.ok(back[at(city.insertion.x, city.insertion.z)], 'the way back up');
  // A route from the street to the quay takes a stair.
  const raid = new Raid({ world: city, seed: 5, mode: 'sandbox' });
  const r = findRoute(raid, canalX - QUAY_OUT - 4, mid, { x: canalX - QUAY_IN - 3, z: mid, reach: 1.5 });
  assert.equal(r.ok, true);
  assert.ok(r.length > r.straight + 20, 'round by a stair, not over the railing');
});

test('quay: the operator walks down a quay stair; the railing over the quay holds', () => {
  const b = bridges.find((q) => q.z > 100 && q.z < 400) || bridges[0];
  const raid = new Raid({ world: city, seed: 5, mode: 'sandbox' });
  const p = raid.player;
  p.x = canalX - QUAY_IN - 1.5; p.z = b.z; raid.world.place(p);
  assert.equal(p.fy, 0);
  const walk = { ...idle, mz: 1, aimX: p.x, aimZ: p.z + 10 };
  for (let i = 0; i < 60 * 3; i++) stepRaid(raid, 1 / 60, walk);
  assert.equal(p.fy, QUAY_Y, 'down on the quay');
  assert.equal(p.hp, p.maxHp, 'by the stair, not a fall');
  if (market) {
    const r2 = new Raid({ world: city, seed: 5, mode: 'sandbox' }), q = r2.player;
    q.x = market.x1 - 2.5; q.z = (market.z0 + market.z1) / 2; r2.world.place(q);
    for (let i = 0; i < 60 * 2; i++) stepRaid(r2, 1 / 60, { ...idle, mx: 1, aimX: q.x + 10, aimZ: q.z });
    assert.equal(q.fy, 0, 'the market railing stops the walk at the top of the wall');
  }
});

test('quay: the moorings, skiffs and cranes went down with the quay and the water', () => {
  const bollards = statics(SHAPE.CYL, (d, o) => Math.abs(Math.abs(d[o] - canalX) - (QUAY_IN + 0.7)) < 0.05 && d[o + 5] < 0.6);
  assert.ok(bollards.length > 20);
  for (const b of bollards) assert.ok(b[1] - b[5] / 2 >= QUAY_Y - 0.01 && b[1] < QUAY_Y + 1, `bollard at ${b[1]}`);
  const skiffs = statics(SHAPE.BOX, (d, o) => Math.abs(Math.abs(d[o] - canalX) - (QUAY_IN - 0.9)) < 0.05 && Math.abs(d[o + 6] - 5.4) < 0.01);
  assert.ok(skiffs.length > 4);
  for (const s of skiffs) assert.ok(Math.abs(s[1] - (WATER_Y + 0.28)) < 0.01, 'a skiff floats on the water');
  // Nothing dressed for the street floats over the quay.
  const floating = statics(SHAPE.BOX, (d, o) => Math.abs(d[o] - canalX) > QUAY_IN + 0.5 && Math.abs(d[o] - canalX) < QUAY_OUT - 0.5 && city.floorAt(d[o], d[o + 2]) === QUAY_Y && d[o + 1] - d[o + 5] / 2 > -0.2 && d[o + 1] < 1.6 && d[o + 5] < 2);
  assert.equal(floating.length, 0, `${floating.length} street props hang over the quay`);
});

test('market: a market street of stalls, awnings and a lantern string runs along the top of the west quay wall', () => {
  assert.ok(market, 'the market stretch exists');
  assert.equal(market.x1 - market.x0, MARKET_W);
  assert.ok(market.z1 - market.z0 > 60);
  const mid = (market.z0 + market.z1) / 2;
  for (let x = market.x0; x < market.x1 - 1; x++) assert.equal(city.floorAt(x + 0.5, mid), 0, 'at street level');
  assert.equal(city.grid[at(market.x1 - 0.5, mid + 3)], 2, 'a railing along the wall');
  assert.ok(market.stalls >= 12, `${market.stalls} stalls`);
  const lanterns = statics(SHAPE.SPHERE, (d, o) => (Math.round(d[o + 3]) & 15) === MAT.EMISSIVE && d[o] > market.x0 && d[o] < market.x1 && d[o + 2] > market.z0 && d[o + 2] < market.z1 && d[o + 1] > 3.4);
  assert.ok(lanterns.length > 40, `${lanterns.length} lanterns on the string`);
  const awnings = statics(SHAPE.WEDGE, (d, o) => d[o] > market.x0 && d[o] < market.x1 && d[o + 2] > market.z0 && d[o + 2] < market.z1 && d[o + 1] > 2.5);
  assert.ok(awnings.length >= market.stalls, 'an awning over each stall');
  // People walk it, and a counter or two holds something to search.
  const peds = city.blocks.flatMap((b) => b.ped).filter((q) => q.x > market.x0 && q.x < market.x1 && q.z > market.z0 && q.z < market.z1);
  assert.ok(peds.length > 0, 'pedestrians stroll the market');
  // Its lots stepped back: no building stands on the market street.
  for (let z = market.z0; z < market.z1; z++) for (let x = market.x0; x < market.x1; x++) assert.notEqual(city.grid[z * S + x], 1, `wall at ${x},${z}`);
});
