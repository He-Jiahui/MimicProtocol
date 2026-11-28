// Aim height (doc 33, doc 64 Package 9): the line of fire has a bearing the player sets and a
// height the aim takes. In the shoulder view the camera's pitch drives the muzzle; from above
// the aim takes the height of what is under the cursor (a body, a flier's ground shadow) or chest
// height over the floor there; a touch stick snaps only the height. Rounds, the Piercing Line,
// grenades, blades, sentries and drones all meet bodies in three dimensions, and low obstacles
// have a height. A body aloft here is a target dummy lifted to e.ay, as a flier will be.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { castSkill } from '../src/sim/skills.js';
import { LOW_TOP } from '../src/sim/data.js';
import { Scene } from '../src/render/scene.js';

const DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const stub = () => ({ globals: new Float32Array(8192), post: new Float32Array(64), opts: { shadows: true, textures: true }, height: 720, texReady: true });
// The training annex with its inner walls cleared: a flat yard 118 x 78 m.
function yard() { const w = generateWorld(7, { annex: true }); w.fillRect(41, 61, 159, 139, 0); return w; }
function sandbox(w, o = {}) {
  const raid = new Raid({ world: w, seed: 3, mode: 'sandbox', ...o }), p = raid.player;
  p.x = 60; p.z = 100; raid.world.place(p); p.crit = 0;
  return raid;
}
const bag = (raid, x, z, ay) => { const e = raid.spawnEnemy('dummy', x, z); e.hp = e.maxHp = 1e6; if (ay !== undefined) e.ay = ay; return e; };
const hurt = (e) => e.hp < e.maxHp;
// Fire one round from the operator along the bearing to (ax, az) with the given aim; step until it is gone.
function shot(raid, aim) {
  const p = raid.player, dx = aim.aimX - p.x, dz = aim.aimZ - p.z, l = Math.hypot(dx, dz), input = { ...idle, ...aim };
  raid.lastInput = input;
  raid.fireBullet(p.x + dx / l * 0.9, p.z + dz / l * 0.9, dx / l, dz / l, { dmg: 10, range: 46 });
  const pr = raid.projectiles[raid.projectiles.length - 1];
  let top = pr.y, steps = 0, wall = null;
  while (raid.projectiles.includes(pr) && steps < 200) {
    stepRaid(raid, DT, input); steps++; top = Math.max(top, pr.y);
    for (const ev of raid.events) if (ev.t === 'wallhit') wall = ev;
    raid.events.length = 0;
  }
  return { top, steps, wall };
}
// A frame-built scene looking at the raid, in either camera.
function view(raid, mode, o = {}) {
  const scene = new Scene(stub()), c = scene.cam;
  c.mode = mode; Object.assign(c, o);
  for (let i = 0; i < 30; i++) scene.build(raid, { aimX: raid.player.x + 1, aimZ: raid.player.z - 4, aimHeld: false }, DT, 16 / 9);
  return scene;
}
// The screen point (as ndc) of a world point.
function ndc(scene, x, y, z) { const o = [0, 0, 0]; assert.ok(scene.toScreen(x, y, z, 1600, 900, o)); return [o[0] / 1600 * 2 - 1, 1 - o[1] / 900 * 2]; }

test('aim: in the shoulder view the camera pitch drives the muzzle: aiming up fires up, on until range', () => {
  const w = yard(), raid = sandbox(w), p = raid.player;
  const scene = view(raid, 'shoulder', { yaw: Math.PI / 2, pitch: -0.6 });
  assert.equal(scene.cam.shoulder, true);
  const a = scene.aimPoint(0, 0, raid);
  assert.ok(a[0] > p.x + 20, 'the crosshair looks east');
  assert.ok(a[2] > 20, `and up: the aim is high in the air (${a[2].toFixed(1)} m), not flattened to the street`);
  const up = shot(raid, { aimX: a[0], aimZ: a[1], aimY: a[2], aimLine: true });
  assert.ok(up.top > 12, `the round climbs (${up.top.toFixed(1)} m)`);
  assert.equal(up.wall, null, 'nothing stops it in the open air');
  assert.ok(up.steps >= Math.floor(46 / 85 * 60) - 1, 'it keeps flying to its range');
  // A body up there on the crosshair is picked, and the round meets it.
  const flier = bag(raid, p.x + 12, p.z, 6);
  const s2 = view(raid, 'shoulder', { yaw: Math.PI / 2, pitch: 0 });
  const b = s2.aimPoint(...ndc(s2, flier.x, raid.aimHeightOf(flier), flier.z), raid);
  assert.equal(b[3], flier, 'the crosshair is on it');
  shot(raid, { aimX: b[0], aimZ: b[1], aimY: b[2], aimLine: true });
  assert.ok(hurt(flier), 'hit at its height');
  // Level fire passes under it.
  const under = bag(raid, p.x + 12, p.z + 3, 6);
  shot(raid, { aimX: under.x, aimZ: under.z, aimY: 1.3, aimLine: true });
  assert.ok(!hurt(under), 'a level round goes under a body aloft');
});

test('aim: from above the aim takes the height under the cursor: a body aloft, its shadow, else the floor at chest height', () => {
  const w = yard(), raid = sandbox(w), p = raid.player;
  const flier = bag(raid, p.x + 4, p.z - 9, 6.5);
  const scene = view(raid, 'top');
  // On its body as drawn: its height.
  const body = scene.aimPoint(...ndc(scene, flier.x, flier.ay + 0.6, flier.z), raid);
  assert.equal(body[3], flier);
  assert.ok(Math.abs(body[2] - raid.aimHeightOf(flier)) < 1e-6);
  assert.ok(Math.hypot(body[0] - flier.x, body[1] - flier.z) < flier.r + 0.2, 'the aim point is on it, not on the ground beyond');
  // On its shadow on the ground: its height too.
  const shadow = scene.aimPoint(...ndc(scene, flier.x + 0.3, 0, flier.z), raid);
  assert.equal(shadow[3], flier, 'the shadow is under the cursor');
  assert.ok(Math.abs(shadow[2] - raid.aimHeightOf(flier)) < 1e-6);
  // Open ground: chest height over the floor.
  const open = scene.aimPoint(...ndc(scene, p.x - 6, 1.2, p.z - 8), raid);
  assert.equal(open[3], null);
  assert.ok(Math.abs(open[2] - 1.3) < 1e-6);
  // Firing at the shadow puts the round into it; a pedestrian under the line is left alone.
  const civ = raid.spawnEnemy('walker', p.x + 2, p.z - 4.5, { state: 'civ', isMimic: false });
  civ.hp = civ.maxHp = 40;
  shot(raid, { aimX: shadow[0], aimZ: shadow[1], aimY: shadow[2] });
  assert.ok(hurt(flier), 'held at the higher angle, the round meets it');
  assert.equal(civ.hp, 40, 'and passes over the pedestrian under it');
  // Lowering the aim onto the ground is a deliberate change: now the pedestrian is in the way.
  shot(raid, { aimX: shadow[0], aimZ: shadow[1], aimY: 1.3 });
  assert.ok(civ.hp < 40, 'a deliberate aimed round at chest height stops in the first body');
  // Without a height given (a script) the body nearest the aim point decides, a shadow included.
  const f2 = bag(raid, p.x - 5, p.z - 9, 6);
  shot(raid, { aimX: f2.x, aimZ: f2.z });
  assert.ok(hurt(f2));
});

test('aim: a touch stick snaps the height to the nearest valid target on its bearing, never the bearing', () => {
  const w = yard(), raid = sandbox(w), p = raid.player;
  const civ = raid.spawnEnemy('walker', p.x + 5, p.z, { state: 'civ', isMimic: false });
  const high = bag(raid, p.x + 11, p.z + 0.4, 6), far = bag(raid, p.x + 20, p.z);
  const snap = raid.snapAlong(p.x, p.z, 1, 0);
  assert.equal(snap.e, high, 'the pedestrian is not a valid target; the nearest one beyond it is');
  assert.ok(Math.abs(snap.along - 11) < 1e-6, 'measured along the bearing');
  assert.equal(raid.snapAlong(p.x, p.z, 0, 1), null, 'nothing off the bearing is taken');
  assert.equal(raid.snapAlong(p.x, p.z, 1, 0.35), null, 'a target a few metres off the line is not snapped to');
  void civ; void far;
});

test('aim: the Piercing Line, grenades and blades meet bodies in three dimensions', () => {
  const w = yard();
  // Piercing Line: level, it passes under a body aloft and through one on the ground; raised, the reverse.
  const beam = (aim) => {
    const raid = sandbox(w), p = raid.player;
    const air = bag(raid, p.x, p.z - 10, 6), ground = bag(raid, p.x + 0.3, p.z - 5);
    p.face = -Math.PI / 2;
    raid.lastInput = { ...idle, aimX: p.x, aimZ: p.z - 10, ...aim };
    castSkill(raid, 'm2', raid.lastInput);
    return [hurt(air), hurt(ground), raid.events.filter((e) => e.t === 'beam')];
  };
  const level = beam({ aimY: 1.3 });
  assert.deepEqual(level.slice(0, 2), [false, true]);
  const raised = beam({ aimY: 6.55, aimLine: true });
  assert.deepEqual(raised.slice(0, 2), [true, false], 'raised to it, the beam is overhead at the body on the ground');
  assert.ok(raised[2].some((b) => b.y2 > b.y + 1), 'and is drawn climbing');
  // A grenade bursts on a body aloft in its arc; one landing on the ground does not reach one high up.
  const lob = (ay) => {
    const raid = sandbox(w, { classId: 'summoner' }), p = raid.player;
    const e = bag(raid, p.x, p.z - 6, ay);
    castSkill(raid, 'm1', { ...idle, aimX: p.x, aimZ: p.z - 12 });
    for (let i = 0; i < 40; i++) stepRaid(raid, DT, idle);
    return hurt(e);
  };
  assert.equal(lob(3.0), true, 'met on its arc');
  assert.equal(lob(7), false, 'over its arc and out of its burst');
  // A blade reaches 2.2 m over the operator's floor.
  const cut = (ay) => {
    const raid = sandbox(w, { classId: 'blade' }), p = raid.player, e = bag(raid, p.x, p.z - 1.6, ay);
    p.face = -Math.PI / 2;
    castSkill(raid, 'm1', { ...idle, aimX: p.x, aimZ: p.z - 5 });
    return hurt(e);
  };
  assert.equal(cut(1.5), true, 'low enough to cut');
  assert.equal(cut(3), false, 'out of reach');
});

test('aim: low obstacles have a height: a parapet catches a low shot while a level one passes', () => {
  const w = yard();
  w.fillRect(68, 99, 69, 102, 2); // a parapet across the line, three cells long
  assert.ok(w.raycast(62, 100.5, 76, 100.5, 0.6, 0.6, true, LOW_TOP) < 1, 'a round at 0.6 m is caught');
  assert.equal(w.raycast(62, 100.5, 76, 100.5, 1.3, 1.3, true, LOW_TOP), 1, 'one at chest height passes');
  assert.equal(w.raycast(62, 100.5, 76, 100.5, 0.6, 0.6), 1, 'sight lines and enemy shots still see past low cover');
  const raid = sandbox(w), p = raid.player;
  p.z = 100.5;
  const behind = bag(raid, 76, 100.5);
  const low = shot(raid, { aimX: 76, aimZ: 100.5, aimY: 0.4, aimLine: true });
  assert.ok(low.wall && low.wall.y < LOW_TOP && Math.abs(low.wall.x - 68) < 0.6, 'the low shot chips the parapet');
  assert.ok(!hurt(behind));
  shot(raid, { aimX: 76, aimZ: 100.5, aimY: 1.3, aimLine: true });
  assert.ok(hurt(behind), 'the level one passes over it');
});

test('aim: sentries, drones and the Barrage aim in three dimensions', () => {
  const w = yard();
  const raid = sandbox(w, { classId: 'summoner' }), p = raid.player;
  p.face = -Math.PI / 2;
  raid.castM2({ ...idle, aimX: p.x, aimZ: p.z - 3 }); // a post facing north
  const s = raid.summons[0];
  const near = bag(raid, s.x, s.z - 8, 6), high = bag(raid, s.x + 1, s.z - 15, 12); // 2D 15 m, true distance over 18 m
  let tracer = null;
  for (let i = 0; i < 90; i++) { stepRaid(raid, DT, idle); for (const ev of raid.events) if (ev.t === 'tracer' && !tracer) tracer = ev; raid.events.length = 0; }
  assert.ok(hurt(near), 'the sentry shoots the body aloft in its lane');
  assert.ok(!hurt(high), 'one out of its true range is left alone');
  assert.ok(tracer && Math.abs(tracer.y2 - raid.aimHeightOf(near)) < 1e-6 && tracer.y < 2, 'its tracer climbs from the gun to the body');
  // Drones too.
  castSkill(raid, 'r', idle);
  const drone = raid.summons.find((k) => k.kind === 'drone'), d = bag(raid, p.x - 6, p.z + 6, 5);
  for (let i = 0; i < 90; i++) { stepRaid(raid, DT, idle); raid.events.length = 0; }
  assert.ok(drone && hurt(d), 'a drone meets a body aloft');
  // The Barrage's rounds climb to the body it chose.
  const rf = sandbox(w), q = rf.player, up = bag(rf, q.x, q.z - 10, 6);
  q.face = -Math.PI / 2;
  for (let i = 0; i < 30; i++) { stepRaid(rf, DT, { ...idle, aimX: q.x, aimZ: q.z - 10, ult: i === 0 }); rf.events.length = 0; }
  assert.ok(hurt(up));
});
