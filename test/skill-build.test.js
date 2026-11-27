import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSkills } from '../src/sim/skill-build.js';
import { PLANNED_VARIANTS } from '../src/sim/skill-data.js';
import { gearStats } from '../src/sim/loot.js';
import { stackStat } from '../src/sim/data.js';
import { generateWorld } from '../src/sim/world.js';
import { Raid } from '../src/sim/raid.js';
import { Hud } from '../src/ui/hud.js';

const world = generateWorld(20261125);
const sandbox = (opts = {}) => new Raid({ world, mode: 'sandbox', ...opts });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} vs ${expected}`);

test('default kit timing and the M2 cooldowns of the class resources (doc 64 Package 2)', () => {
  const base = {
    rifleman: [0.42, 5, 5, 40], blade: [0.3, 4, 4, 45],
    summoner: [0.62, 3, 5, 40], toxic: [0.3, 5, 5, 45],
  };
  for (const [id, expected] of Object.entries(base)) {
    const { m1, m2, s, r } = compileSkills(id).slots;
    assert.deepEqual([m1.params.interval, m2.params.cd, s.params.cd, r.params.cd], expected);
    assert.equal(m2.params.cost, undefined, `${id}: no M2 costs a resource`);
  }
  // Rates divide: gear's cooldown rate stops at +100%, Coolant resolves through stackStat.
  const inputs = { gear: { cdr: 120, aspd: 20 }, items: { coolant: 2, hair_trigger: 1 } };
  const blade = compileSkills('blade', inputs);
  near(blade.slots.m1.params.finisherInterval, 0.5 / 1.28);
  near(blade.slots.m2.params.cd, 4 / (1 + 1 + stackStat(0.06, 2)));
  blade.slots.m2.params.cd = 0;
  near(compileSkills('blade', inputs).slots.m2.params.cd, 4 / (1 + 1 + stackStat(0.06, 2)));
});

test('an enhancement widens the live rail shot; upgrades include it and exclude each other', () => {
  function fire(choice) {
    const raid = sandbox({ skillTuning: choice ? { m2: choice } : {} }), p = raid.player;
    p.face = 0; p.crit = 0;
    const e = raid.spawnEnemy('dummy', p.x + 5, p.z + 1.3); // radius 0.5: outside base width 0.7
    raid.castM2({});
    return { damage: e.maxHp - e.hp, m2: raid.skillBuild.slots.m2.params, rules: raid.skillBuild.triggers };
  }
  assert.equal(fire().damage, 0);
  assert.equal(fire('enhanced').damage, 46);
  const long = fire('longRail'), circuit = fire('returnCircuit');
  assert.equal(long.damage, 46); assert.equal(long.m2.range, 50); assert.equal(long.rules.consume, undefined);
  assert.equal(circuit.damage, 46); assert.equal(circuit.m2.range, 42);
  assert.throws(() => fire(['longRail', 'returnCircuit']), /Invalid tuning/);
  assert.throws(() => compileSkills('blade', { tuning: { m2: 'longRail' } }), /Invalid tuning/);
});

test('Return Circuit pays a resource tick once per second across Consumes and stat recalculation', () => {
  const raid = sandbox({ skillTuning: { m2: 'returnCircuit' } }), p = raid.player;
  const e = raid.spawnEnemy('dummy', p.x + 4, p.z);
  raid.consume(e); raid.recalc(); raid.time = 0.99; raid.consume(e);
  assert.equal(p.cellProg, 4, 'one tick is four rounds of cell progress');
  raid.time = 1; raid.consume(e);
  assert.equal(p.cellProg, 8);
});

test('stacked items, distinct Aspects and event conditions pay the restated rules (doc 64 Package 2)', () => {
  // An old profile piece with Max Charge and the retired Scavenger still loads.
  const gear = { ...gearStats(null), charge: 5, aspects: ['primed', 'primed', 'siphoning', 'second_wind', 'scavenger', 'overclocked'] };
  const raid = sandbox({ gear }), p = raid.player;
  assert.equal(p.cells, 3, 'Primed starts the raid with every cell');
  near(p.cdMax.r, 40 * 0.85); // Overclocked: -15% R cooldown
  p.cells = 1;
  raid.giveItem('hair_trigger', true);
  assert.equal(p.cells, 1, 'Primed does not refill on rebuild');
  raid.killEnemy(raid.spawnEnemy('dummy', p.x + 3, p.z));
  assert.equal(p.cellProg, 4, 'Siphoning: a kill pays one small tick');
  p.hp = 30; p.iframes = 0.2; raid.time = 1;
  raid.damagePlayer(99, p.x + 1, p.z);
  near(p.hp, 30 + p.maxHp * 0.04);
  assert.equal(p.cellProg, 12, 'the clean dodge paid 8 rounds');
  raid.dropXp(p.x, p.z, 1); raid.updatePickups(0.31);
  assert.equal(p.cellProg, 12, 'Scavenger is retired: a shard pays nothing');
});

test('raid skill tooltip uses the same cooldown as the next cast and names no Charge cost', () => {
  const raid = sandbox();
  const hud = { raid, skillDefs: [{ k: 'LMB', slot: 'm1' }, { k: 'RMB', slot: 'm2' }], tips: {} };
  raid.giveItem('coolant', true);
  Hud.prototype.buildSkillTips.call(hud);
  raid.castM2({});
  near(raid.player.cd.m2, 5 / 1.06);
  assert.ok(hud.tips['skill-m2'].includes('4.72s cooldown'));
  assert.ok(!hud.tips['skill-m2'].includes('Charge'));
});

test('doc 18 B variants are catalog entries, never executable tuning choices', () => {
  const variants = {
    rifleman: ['Rail Slug', 'Overwatch Mark'], blade: ['Blade Cyclone', 'Phantom Blades'],
    summoner: ['Arc Pylon', 'Repair Swarm'], toxic: ['Rot Mines', 'Epidemic Bloom'],
  };
  for (const [id, names] of Object.entries(variants)) {
    assert.deepEqual(['m2', 'r'].map((slot) => PLANNED_VARIANTS[id][slot].name), names);
    for (const [slot, variant] of Object.entries(PLANNED_VARIANTS[id])) {
      assert.throws(() => compileSkills(id, { tuning: { [slot]: variant.name } }), /Invalid tuning/);
    }
  }
  assert.deepEqual(PLANNED_VARIANTS.rifleman.m2.params, { windup: 0.6, weakSpotMul: 2 });
  assert.deepEqual(PLANNED_VARIANTS.toxic.r.params, { radius: 8, duration: 6 });
});
