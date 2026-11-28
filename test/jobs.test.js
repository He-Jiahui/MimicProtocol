// Field jobs and conditional exits (docs/designs/34, 64 Package 3). Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { JOB, jobOf, exitInfo, jobLines, jobTargets, advancePressure } from '../src/sim/jobs.js';
import { routeTargets } from '../src/sim/route.js';
import { raidXp } from '../src/sim/progress.js';
import { setRoute, routeTargets as targets } from '../src/sim/route.js';
import { revealJobs } from '../src/sim/jobs.js';
import { makeBot } from './bot.js';

const city = generateWorld(20261125);
const DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false, aimHeld: false };
const run = (raid, seconds, input = idle) => { for (let i = 0; i < seconds * 60 && !raid.over; i++) { stepRaid(raid, DT, input); raid.events.length = 0; } };
const hold = { ...idle, interact: true };
// A raid in which nothing hunts the operator unless a test asks for it.
const quiet = (seed = 3, o = {}) => { const r = new Raid({ world: city, seed, ...o }); r.player.invuln = true; r.autoPick = true; return r; };
// A free spot in plain sight of the operator, a few metres off.
const inSight = (raid, d) => { const p = raid.player, w = raid.world; for (let a = 0; a < 6.3; a += 0.3) { const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (w.circleFree(x, z, 0.6) && w.hasLos(x, z, p.x, p.z) && (!w.hasHeight || w.walkLine(x, z, p.x, p.z))) return { x, z }; } return null; };
const at = (raid, x, z) => { const p = raid.player; p.x = x; p.z = z; raid.world.resolveCircle(p, 0.5); if (raid.world.hasHeight) raid.world.place(p); raid.zone = raid.world.zoneAt(p.x, p.z); };
const reach = (w, x, z) => w.reach[Math.floor(z) * w.size + Math.floor(x)];

test('jobs: every raid offers an escort, a van and a quay relay at reachable places (34)', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const raid = new Raid({ world: city, seed });
    assert.deepEqual(raid.jobs.list.map((j) => j.kind), ['escort', 'van', 'relay'], `seed ${seed}`);
    for (const j of raid.jobs.list) {
      assert.ok(reach(city, j.x, j.z), `${j.kind} site is reachable on seed ${seed}`);
      assert.ok(j.zone >= 1, 'no job starts inside the Shelter');
      assert.equal(j.state, 'hidden');
    }
    const van = jobOf(raid, 'van'), relay = jobOf(raid, 'relay'), dock = city.extractions[1];
    assert.ok(van.run >= 26, 'the van has a clear street to leave by');
    assert.ok(van.radio >= 0 && !city.containers[van.radio].indoor, 'its radio is in something out in the street');
    assert.ok(Math.hypot(relay.x - dock.x, relay.z - dock.z) < 75, 'the relay stands near the Dock Boat');
    if (city.hasHeight) assert.ok(city.floorAt(relay.x, relay.z) < 0, 'on the sunken quay');
  }
  // The training annex and the sandbox have none.
  assert.equal(new Raid({ world: city, seed: 1, mode: 'sandbox' }).jobs.list.length, 0);
});

test('jobs: found by walking near, with the terms told before the job is taken (34)', () => {
  const raid = quiet(), j = jobOf(raid, 'escort');
  run(raid, 0.2);
  assert.equal(j.state, 'hidden');
  at(raid, j.x + JOB.FIND_RANGE - 5, j.z);
  const events = [];
  for (let i = 0; i < 6; i++) { stepRaid(raid, DT, idle); events.push(...raid.events); raid.events.length = 0; }
  assert.equal(j.state, 'known');
  assert.ok(events.some((e) => e.t === 'relay' && /horde forward/.test(e.text.source)), 'the cost of a clean finish is said up front');
  const line = jobLines(raid).find((l) => l.kind === 'escort');
  assert.equal(line.state, 'known');
  assert.equal(line.terms.length, 2);
  assert.ok(jobTargets(raid).some((t) => t.kind === 'job' && t.id === j.id), 'and it can be followed as a route');
  assert.ok(routeTargets(raid).some((t) => t.key === `job:${j.id}`));
});

test('exits: the Shelter Gate is always open; the others state their condition (34)', () => {
  const raid = quiet(), ex = city.extractions;
  for (let t = 0; t < 400; t += 37) { raid.time = t; assert.equal(exitInfo(raid, ex[0]).open, true, 'the Shelter Gate asks nothing'); }
  raid.time = 0;
  assert.equal(exitInfo(raid, ex[1]).open, false);
  assert.match(exitInfo(raid, ex[1]).cond, /relay/);
  // The Rail Platform keeps a timetable: 45 s of every 180.
  assert.equal(exitInfo(raid, ex[2]).open, false);
  raid.time = JOB.RAIL_CYCLE - JOB.RAIL_OPEN + 1;
  assert.equal(exitInfo(raid, ex[2]).open, true);
  raid.time = JOB.RAIL_CYCLE + 5;
  assert.equal(exitInfo(raid, ex[2]).open, false);
  // The Rooftop Dropship answers a flare bought at the pad.
  raid.time = 0;
  assert.equal(exitInfo(raid, ex[3]).open, false);
  at(raid, ex[3].x + 1, ex[3].z);
  run(raid, 0.1, hold);
  assert.equal(raid.prompt.ok, false, 'no Credits, no flare');
  raid.player.credits = 100;
  run(raid, 1.6, hold);
  assert.equal(raid.jobs.flare, 1);
  assert.equal(raid.player.credits, 100 - JOB.FLARE);
  assert.equal(exitInfo(raid, ex[3]).open, false, 'the dropship is still inbound');
  run(raid, JOB.FLARE_WAIT + 0.5);
  assert.equal(exitInfo(raid, ex[3]).open, true);
  run(raid, EXTRACT + 0.5, hold);
  assert.equal(raid.result.outcome, 'extracted');
  assert.equal(raid.result.exit, 'Rooftop Dropship');
  // A closed exit cannot be held: standing in the Dock Boat's ring does nothing.
  const r2 = quiet(4);
  at(r2, ex[1].x + 1, ex[1].z);
  run(r2, EXTRACT + 2, hold);
  assert.equal(r2.over, false);
});
const EXTRACT = 6;

test('relay: three waves while the operator holds the ring, then the Dock Boat answers (34)', () => {
  const raid = quiet(5), j = jobOf(raid, 'relay'), dock = city.extractions[1];
  at(raid, j.x + 1.5, j.z);
  run(raid, 0.3);
  assert.equal(j.state, 'known');
  const banners = [];
  for (let i = 0; i < 2.3 * 60; i++) { stepRaid(raid, DT, hold); for (const e of raid.events) if (e.t === 'banner') banners.push(e.title.source || e.title); raid.events.length = 0; }
  assert.equal(j.state, 'active');
  const press0 = raid.pressT, clock0 = raid.raidTime;
  for (let i = 0; i < (JOB.RELAY_HOLD + 3) * 60 && j.state === 'active'; i++) {
    // Keep the pack off the mast so the hold is a clean one.
    for (const e of raid.enemies) if (raid.isHostile(e) && Math.hypot(e.x - j.x, e.z - j.z) < 6) raid.killEnemy(e);
    stepRaid(raid, DT, idle);
    for (const e of raid.events) if (e.t === 'banner') banners.push(e.title.source || e.title);
    raid.events.length = 0;
  }
  assert.equal(j.state, 'done');
  assert.equal(j.wave, 3);
  assert.equal(banners.filter((b) => /RELAY WAVE/.test(b)).length, 3, 'each wave is announced');
  assert.equal(j.stars, 3);
  assert.equal(exitInfo(raid, dock).open, true, 'the boat answers');
  assert.ok(raid.poi[city.extractions[3].id].known, 'and Command plots the other exits');
  // A three-star clear moves the horde's timer on by 40 s and leaves the clock alone.
  // The horde's own clock stood still while the ring was held, so nothing fell overdue.
  const stepped = raid.pressT - press0;
  assert.ok(Math.abs(stepped - 2 * JOB.PRESS_PER_STAR) < 1.5, `pressure moved ${stepped.toFixed(1)} s`);
  assert.ok(raid.raidTime - clock0 > JOB.RELAY_HOLD - 1, 'the raid clock kept running');
  assert.ok(banners.includes('PRESSURE ADVANCED'));
  assert.equal(raid.jobs.xp, 75);
});

test('relay: the meter waits while the operator is away, and a mast torn down fails the job (34)', () => {
  const raid = quiet(6), j = jobOf(raid, 'relay');
  at(raid, j.x + 1.5, j.z); run(raid, 0.3); run(raid, 2.3, hold);
  run(raid, 5);
  const m = j.meter;
  assert.ok(m > 0.05);
  at(raid, j.x + JOB.RELAY_R + 12, j.z);
  for (const e of raid.enemies) e.dead = true;
  run(raid, 3);
  assert.ok(Math.abs(j.meter - m) < 1e-9, 'no progress from outside the ring');
  assert.ok(j.away >= 2.9);
  j.hp = 1;
  const e = raid.spawnEnemy('walker', j.x + 0.8, j.z); e.state = 'hunt'; e.speed = 0; e.atkCd = 99;
  run(raid, 1.2);
  assert.equal(j.state, 'failed');
  assert.equal(exitInfo(raid, city.extractions[1]).open, false, 'no relay, no boat');
  assert.equal(exitInfo(raid, city.extractions[0]).open, true, 'the Shelter Gate is still there');
});

test('escort: patients follow, die to what reaches them, and stars count who arrives (34)', () => {
  const raid = quiet(7), j = jobOf(raid, 'escort'), ins = city.insertion;
  at(raid, j.x + 1, j.z); run(raid, 0.3); run(raid, 1.3, hold);
  assert.equal(j.state, 'active');
  assert.equal(j.patients.length, JOB.PATIENTS);
  for (const e of j.patients) { assert.equal(e.state, 'patient'); assert.equal(raid.isTarget(e), false); assert.equal(raid.humanLooking(e), true); }
  // They close up on the operator and stop short.
  const p = raid.player, far = j.patients[0];
  const spot = inSight(raid, 8); far.x = spot.x; far.z = spot.z; if (raid.world.hasHeight) raid.world.place(far);
  const d0 = Math.hypot(far.x - p.x, far.z - p.z);
  run(raid, 1.5);
  assert.ok(Math.hypot(far.x - p.x, far.z - p.z) < d0 - 2, 'a patient follows');
  // Splash passes them by; a hunter that reaches one mauls it.
  assert.equal(raid.damageEnemy(far, 30, {}), 0, 'area damage does not touch a patient');
  const victim = j.patients[1], h = raid.spawnEnemy('walker', victim.x + 0.9, victim.z); h.state = 'hunt'; h.speed = 0; h.atkCd = 99;
  run(raid, 0.8 * Math.ceil(JOB.PATIENT_HP / JOB.MAUL) + 1);
  assert.equal(victim.dead, true);
  h.dead = true;
  // The other three reach the Shelter: two stars, the van's driver is introduced, pressure moves 20 s.
  const press0 = raid.pressT, t0 = raid.time;
  at(raid, ins.x, ins.z);
  for (const e of j.patients) if (!e.dead) { e.x = ins.x + 2; e.z = ins.z + 2; }
  run(raid, 0.5);
  assert.equal(j.state, 'done');
  assert.equal(j.arrived, 3);
  assert.equal(j.stars, 2);
  assert.equal(jobOf(raid, 'van').state, 'known', 'an introduction to the driver');
  assert.ok(raid.pressT - press0 >= JOB.PRESS_PER_STAR && raid.pressT - press0 < JOB.PRESS_PER_STAR + (raid.time - t0) + 0.1);
  assert.ok(raid.player.credits > 0);
});

test('escort: nobody home in time is a failure, with no reward and no pressure (34)', () => {
  const raid = quiet(8), j = jobOf(raid, 'escort');
  at(raid, j.x + 1, j.z); run(raid, 0.3); run(raid, 1.3, hold);
  at(raid, j.x + 60, j.z);            // walk off and leave them
  for (const e of raid.enemies) if (!e.patient) e.dead = true;
  j.t = JOB.ESCORT_TIME - 0.2;
  const press0 = raid.pressT, cr = raid.player.credits;
  run(raid, 0.5);
  assert.equal(j.state, 'failed');
  assert.equal(raid.player.credits, cr);
  assert.ok(raid.pressT - press0 < 1);
  assert.ok(j.patients.every((e) => e.dead), 'the patients turn back');
});

test('van: clear the ramp, bring the radio, then ride it out or miss it (34, 31)', () => {
  const raid = quiet(9), j = jobOf(raid, 'van'), p = raid.player;
  at(raid, j.x - j.dz * 2.6, j.z + j.dx * 2.6); run(raid, 0.3); run(raid, 1.3, hold);
  assert.equal(j.state, 'active');
  const pack = raid.enemies.filter((e) => e.group === j.group);
  assert.ok(pack.length >= JOB.RAMP_PACK, 'something holds the ramp');
  // The driver will not take an empty hand.
  run(raid, 0.2, hold);
  assert.equal(raid.prompt.ok, false);
  // The radio is where the driver said, and comes out as cargo like anything else.
  const c = city.containers[j.radio], st = raid.cont[c.id];
  raid.openContainer(c, st);
  const radio = st.items.find((i) => i.name === 'Dispatch Radio');
  assert.ok(radio);
  st.items.splice(st.items.indexOf(radio), 1);
  assert.ok(raid.addInv(radio), 'it takes cells in the pack');
  assert.ok(jobTargets(raid).every((t) => t.kind !== 'jobradio'), 'the lead goes once the container is open');
  run(raid, 1.3, hold);
  assert.equal(j.delivered, true);
  assert.equal(p.inv.includes(radio), false);
  assert.equal(j.ready, false, 'the ramp is still held');
  for (const e of pack) raid.killEnemy(e);
  run(raid, 0.2);
  assert.equal(j.ready, true);
  assert.equal(j.state, 'done');
  assert.equal(j.stars, 3, 'quick and clean');
  assert.ok(Math.abs(j.waitT - JOB.VAN_WAIT) < 1);
  // Boarding is an extraction like any other, pack and all.
  const cargo = p.inv.length;
  run(raid, EXTRACT + 0.5, hold);
  assert.equal(raid.result.outcome, 'extracted');
  assert.equal(raid.result.exit, 'Evacuation Van');
  assert.equal(raid.result.inv.length, cargo);
  assert.deepEqual(raid.result.jobs, [{ name: 'Evacuation van', stars: 3, failed: false }]);
  assert.equal(raid.result.classXp.jobs, 75);
  assert.equal(raid.result.classXp.total, raidXp({ level: raid.player.level, kills: raid.kills, elites: raid.elites, extracted: true, jobs: 75 }).total);

  // Missing the van is not a death: the exit closes and the raid goes on.
  const r2 = quiet(9), v = jobOf(r2, 'van');
  at(r2, v.x - v.dz * 2.6, v.z + v.dx * 2.6); run(r2, 0.3); run(r2, 1.3, hold);
  v.delivered = true;
  for (const e of r2.enemies) if (e.group === v.group) r2.killEnemy(e);
  run(r2, 0.2);
  at(r2, v.x + 40, v.z + 40);
  for (const e of r2.enemies) e.dead = true;
  v.waitT = 0.3;
  run(r2, 1);
  assert.equal(v.gone, true);
  assert.equal(r2.over, false);
  at(r2, v.x - v.dz * 2.6, v.z + v.dx * 2.6);
  run(r2, 0.2, hold);
  assert.ok(!r2.prompt || r2.prompt.type !== 'job', 'nothing left to board');
});

test('pressure: an exceptional clear moves the horde timer and never the clock (34)', () => {
  const raid = quiet(10);
  const clock = raid.clock, raidTime = raid.raidTime, tier = raid.tier, zones = [...city.zone];
  const surgeIn = raid.surgeT - raid.pressT;
  const events = [];
  advancePressure(raid, 40);
  events.push(...raid.events);
  assert.equal(raid.surgeT - raid.pressT, surgeIn - 40, 'the Surge is 40 s nearer');
  assert.equal(raid.clock, clock); assert.equal(raid.raidTime, raidTime); assert.equal(raid.tier, tier);
  assert.deepEqual([...city.zone], zones);
  const b = events.filter((e) => e.t === 'banner').pop();
  assert.equal(b.title.source || b.title, 'PRESSURE ADVANCED');
  assert.match(JSON.stringify(b.sub), /Surge/, 'and names what is now closer');
});

test('bot: raises the relay on the quay, holds it and leaves by the Dock Boat (34)', () => {
  const raid = new Raid({ world: city, seed: 2026, classId: 'rifleman' });
  raid.autoPick = true;
  const bot = makeBot({ scanEvery: 0 }), j = jobOf(raid, 'relay'), p = raid.player, dock = city.extractions[1];
  revealJobs(raid, 'relay');
  const follow = (key) => { const T = targets(raid).find((t) => t.key === key); if (T && (!raid.route || !raid.route.target || raid.route.target.key !== key)) setRoute(raid, T, true); };
  let t = 0;
  for (; t < 600 && !raid.over; t += DT) {
    follow(j.state === 'done' ? `extract:${dock.id}` : `job:${j.id}`);
    const input = bot(raid, DT);
    // Hold the ring: fight from inside it rather than kiting out of it.
    const d = Math.hypot(p.x - j.x, p.z - j.z);
    if (j.state === 'active' && d > 7.5) { input.mx = (j.x - p.x) / d; input.mz = (j.z - p.z) / d; }
    stepRaid(raid, DT, input);
    raid.events.length = 0;
    if (j.state === 'failed') break;
  }
  assert.equal(j.state, 'done', `relay ${j.state} after ${t.toFixed(0)} s, mast ${j.hp}, meter ${j.meter.toFixed(2)}, hp ${p.hp.toFixed(0)}`);
  assert.ok(raid.over, `still out after ${t.toFixed(0)} s at ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
  assert.equal(raid.result.outcome, 'extracted');
  assert.equal(raid.result.exit, 'Dock Boat');
  assert.ok(raid.result.jobs.some((k) => k.name === 'Field relay' && k.stars >= 1));
});
