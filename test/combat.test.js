// Combat feel and encounters (doc 64, Package 3) and raid items (Package 4). Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { chargeLane, inLane, CHARGE_LEN } from '../src/sim/behave.js';
import { t } from '../src/i18n/index.js';
import { startBoss, chainRoar } from '../src/sim/boss.js';
import { HitStop } from '../src/ui/hitstop.js';
import { Hud } from '../src/ui/hud.js';
import { castSkill } from '../src/sim/skills.js';

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

test('warnings: Longer and Longest stretch the wind-up, floor shape and hit, and nothing else (64 Package 3)', () => {
  for (const warning of [1, 1.35, 1.8]) {
    const raid = sandbox({ warning }), p = raid.player;
    const w = raid.spawnEnemy('walker', p.x + 1.5, p.z, { state: 'hunt' });
    w.atkCd = 0; w.role = 'rusher';
    let committed = -1, hit = -1;
    for (let i = 0; i < 240 && hit < 0; i++) {
      stepRaid(raid, DT, idle);
      if (committed < 0 && w.windupT > 0) {
        committed = i;
        near(w.windupMax, 0.75 * warning, 'wind-up');
        near(raid.areas.find((a) => a.kind === 'tele' && a.src === w).life, w.windupMax, 'floor shape');
      }
      if (raid.events.some((e) => e.t === 'hurt')) hit = i;
      raid.events.length = 0;
    }
    assert.ok(Math.abs((hit - committed) / 60 - 0.75 * warning) < 0.04, `the hit lands as the warning ends (${warning})`);
    assert.ok(w.mode === 'recover' && w.modeT <= 0.9 * 1.25, 'recovery is never stretched');
  }
  // Chain Roar stretches only its lead-in; the 0.9 s beat between slams is authored.
  const raid = sandbox({ warning: 1.8 });
  startBoss(raid);
  chainRoar(raid, raid.boss);
  const lifes = raid.areas.filter((a) => a.kind === 'tele').map((a) => Number(a.life.toFixed(3)));
  assert.deepEqual(lifes, [1.8, 2.7, 3.6]);
  // Never stretched: projectile flight, pools, dodge invulnerability, the clock.
  const slow = new Raid({ world: city, seed: 9, warning: 1.8 }), q = slow.player;
  const s = slow.spawnEnemy('spitter', q.x + 10, q.z, { state: 'hunt' });
  slow.enemyStrike(s, 10);
  const spit = slow.projectiles.find((k) => k.owner === 'enemy');
  near(Math.hypot(spit.vx, spit.vz), 11); near(spit.life, 1.9);
  slow.addArea({ kind: 'pool', x: q.x, z: q.z, r: 2, life: 4, owner: 'enemy', dps: 1 });
  near(slow.areas.at(-1).life, 4);
  q.cd.s = 0;
  stepRaid(slow, DT, { ...idle, dodge: true });
  near(q.iframes, 0.3);
  const clock = slow.raidTime;
  run(slow, 1);
  near(slow.raidTime - clock, 1, 'the raid clock');
});

test('hit-stop: holds only for named moments, the strongest wins, 10% speed, 100 ms a second, an Off setting (64 Package 3)', () => {
  const hs = new HitStop();
  hs.fromEvents([{ t: 'hitmark', crit: false }, { t: 'hurt', heavy: false }, { t: 'kill', elite: false, big: true }, { t: 'dmg', dot: true }]);
  assert.equal(hs.hold, 0, 'ordinary hits, kills, hurts and ticks never hold');
  hs.fromEvents([{ t: 'hitmark', crit: true }]); near(hs.hold, 0.03, 'crit');
  hs.fromEvents([{ t: 'hurt', heavy: true }]); near(hs.hold, 0.05, 'a heavy hit taken');
  hs.fromEvents([{ t: 'kill', elite: true }]); near(hs.hold, 0.08, 'an elite kill: the strongest wins');
  hs.fromEvents([{ t: 'hitmark', crit: true }]); near(hs.hold, 0.08, 'a weaker request neither stacks nor shortens');
  let sim = 0;
  for (let i = 0; i < 8; i++) sim += hs.advance(0.01);
  near(sim, 0.008, '80 ms of real time move the raid 8 ms');
  near(hs.advance(0.01), 0.01, 'then full speed');
  // However often it is asked, no more than 100 ms of hold in a real second.
  const busy = new HitStop();
  let held = 0;
  for (let i = 0; i < 100; i++) { busy.fromEvents([{ t: 'poise' }]); held += (0.01 - busy.advance(0.01)) / 0.9; }
  assert.ok(Math.abs(held - 0.1) < 1e-9, `held ${held}`);
  const off = new HitStop();
  off.enabled = false; off.request(0.08);
  near(off.advance(0.016), 0.016, 'Off');
  // One Shift press is kept through a hold, consumed once, and dropped on pause or raid end.
  const keep = new HitStop();
  keep.request(0.08); keep.pressDodge();
  assert.equal(keep.takeDodge(), true); assert.equal(keep.takeDodge(), false);
  keep.pressDodge(); keep.reset();
  assert.equal(keep.takeDodge(), false);
  // The raid marks the moments: a heavy hit taken and an elite kill.
  const raid = sandbox(), p = raid.player;
  raid.damagePlayer(p.maxHp * 0.2, p.x + 1, p.z);
  assert.ok(raid.events.some((e) => e.t === 'hurt' && e.heavy));
  const el = raid.spawnEnemy('walker', p.x + 3, p.z, { elite: ['blazing'] });
  raid.killEnemy(el);
  assert.ok(raid.events.some((e) => e.t === 'kill' && e.elite));
});

// ---- deliberate reveal and lurkers ----
const civ = (raid, dx, dz) => { const e = raid.spawnEnemy('walker', raid.player.x + dx, raid.player.z + dz, { state: 'civ', isMimic: false }); e.waitT = 1e9; e.hp = e.maxHp = 40; return e; };
const disguise = (raid, dx, dz, o = {}) => { const e = raid.spawnEnemy('walker', raid.player.x + dx, raid.player.z + dz, { state: 'disguised', ...o }); e.waitT = 1e9; return e; };
const dummy = (raid, dx, dz = 0) => { const e = raid.spawnEnemy('dummy', raid.player.x + dx, raid.player.z + dz); e.hp = e.maxHp = 1e6; return e; };
// Out on the avenue north of the Shelter, where lurkers work.
const OUT = city.resolveCircle({ x: city.insertion.x, z: city.insertion.z - 60 }, 1);
const street = (o = {}) => { const r = sandbox(o); r.player.x = OUT.x; r.player.z = OUT.z; return r; };
const castSkillAt = (raid, x, z) => { raid.player.cd.m1 = 0; castSkill(raid, 'm1', { ...idle, aimX: x, aimZ: z }); };

test('reveal: anything that looks human has 40 health and only a deliberate aimed hit wounds it (64 section 1)', () => {
  const raid = sandbox({ classId: 'blade' }), p = raid.player;
  const d = disguise(raid, 2, 0), c = civ(raid, -2, 0);
  assert.deepEqual([d.cover, c.hp], [40, 40]);
  run(raid, 1 / 60, { ...idle, aimX: p.x, aimZ: p.z - 5, m2: true }); // Whirl: an area
  assert.deepEqual([d.cover, d.state, c.hp], [40, 'disguised', 40], 'a spin touches nobody who looks human (the noise still scares a civilian off)');
  // A grenade burst never wounds a bystander; one that lands on the body does.
  const g = street({ classId: 'summoner' }), near = civ(g, 8, 0);
  castSkillAt(g, near.x + 2, near.z);
  run(g, 0.6);
  assert.equal(near.hp, 40, 'the burst passes a civilian 2 m away');
  const h = street({ classId: 'summoner' }), hit = civ(h, 8, 0);
  castSkillAt(h, hit.x, hit.z);
  run(h, 0.6);
  assert.deepEqual([hit.hp, hit.state], [40 - 26, 'flee'], 'a grenade landing on the body is deliberate');
});

test('reveal: aimed rounds stop in the first human-looking body; automatic fire passes it (64 section 1)', () => {
  const raid = sandbox(), p = raid.player;
  raid.giveItem('piercer', true);
  const c = civ(raid, 2, 0), behind = dummy(raid, 4);
  raid.fireBullet(p.x + 1, p.z, 1, 0, { dmg: 10 });
  run(raid, 0.3);
  assert.equal(c.hp, 30, 'the aimed round wounds the civilian');
  assert.equal(behind.hp, behind.maxHp, 'and stops there, Tungsten Core or not');
  raid.fireBullet(p.x + 1, p.z, 1, 0, { dmg: 10, aimed: false });
  run(raid, 0.3);
  assert.equal(c.hp, 30, 'automatic fire passes by');
  assert.equal(behind.maxHp - behind.hp, 10, 'and hits what is behind');
  // Piercing Line is a piercing round too: it finishes a disguise in its way and stops.
  const line = sandbox(), q = line.player;
  const d = disguise(line, 3, 0), far = dummy(line, 6);
  run(line, 1 / 60, { ...idle, aimX: far.x, aimZ: far.z, m2: true });
  assert.equal(d.state, 'revealing', '46 finishes a 40-health disguise');
  assert.equal(far.hp, far.maxHp);
  assert.equal(line.kills, 0, 'the discarded shape is no kill');
  void q;
});

test('reveal: a melee swing can wound only the body nearest the aim line (64 section 1)', () => {
  const raid = sandbox({ classId: 'blade' }), p = raid.player;
  const target = dummy(raid, 1.6), c = civ(raid, 1.4, 1.0);
  p.face = 0;
  castSkill(raid, 'm1', { ...idle, aimX: p.x + 5, aimZ: p.z });
  assert.ok(target.hp < target.maxHp);
  assert.equal(c.hp, 40, 'the civilian beside the target is not cut');
  const alone = sandbox({ classId: 'blade' }), q = alone.player, c2 = civ(alone, 1.6, 0);
  q.face = 0;
  castSkill(alone, 'm1', { ...idle, aimX: q.x + 5, aimZ: q.z });
  assert.deepEqual([c2.hp, c2.state], [40 - 22, 'flee'], 'aimed straight at one, the cut is deliberate');
});

test('reveal: a lesser hit sends a disguise fleeing, still disguised; the finishing hit exposes the Mimic (64 section 1)', () => {
  const raid = sandbox(), p = raid.player;
  const d = disguise(raid, 6, 0), hp = d.hp;
  raid.fireBullet(p.x + 1, p.z, 1, 0, { dmg: 30 });
  run(raid, 0.2);
  assert.deepEqual([d.cover, d.state, d.isMimic], [10, 'flee', true]);
  run(raid, 6.1);
  assert.equal(d.state, 'disguised', 'after 6 s it is back in the crowd');
  raid.fireBullet(p.x + 1, p.z, (d.x - p.x - 1) / Math.hypot(d.x - p.x - 1, d.z - p.z), (d.z - p.z) / Math.hypot(d.x - p.x - 1, d.z - p.z), { dmg: 30, range: 200 });
  run(raid, 1);
  assert.equal(d.wasDisguised, true);
  assert.ok(d.state === 'revealing' || d.state === 'hunt');
  assert.equal(d.hp, hp, 'the Mimic inside is whole');
  assert.deepEqual([raid.kills, raid.pickups.length], [0, 0], 'no kill and no drop for the shape');
  // The Husk role once called "lurker" is now the stalker.
  const roles = new Set();
  for (let i = 0; i < 60; i++) roles.add(raid.spawnEnemy('walker', p.x + 30, p.z).role);
  assert.ok(roles.has('stalker') && !roles.has('lurker'));
});

test('lurkers: revealed, an elite of this zone and hour with a sure drop (64 Package 3)', () => {
  const raid = street(), p = raid.player;
  raid.nl = 0;
  const l = disguise(raid, 6, 0, { elite: ['armored'] });
  l.lurker = 'aura';
  raid.nl = 1;
  raid.fireBullet(p.x + 1, p.z, 1, 0, { dmg: 50 });
  run(raid, 0.2);
  const { hpMul, dmgMul } = raid.scaleAt('walker', l.x, l.z);
  near(l.maxHp, 48 * hpMul * 3, 'health of the hour');
  near(l.dmg, 9 * dmgMul * 1.15, 'damage of the hour');
  near(l.plate, l.maxHp * 0.2);
  raid.killEnemy(l);
  const kinds = raid.pickups.map((k) => k.kind);
  assert.ok(kinds.includes('item') && kinds.includes('gear'), kinds.join());
  assert.ok(raid.pickups.find((k) => k.kind === 'item').rarity >= 1, 'an Enhanced-or-better item');
});

test('lurkers: aura, assimilation, ambush and the radio thief each work the street (64 Package 3)', () => {
  // Aura: the operator's legs drag within 9 m; the HUD shows the status, not the source.
  const a = street(), p = a.player;
  assert.ok(city.zoneAt(p.x, p.z) > 0);
  disguise(a, 6, 0, { elite: ['blazing'] }).lurker = 'aura';
  run(a, 0.1);
  assert.ok(p.sapT > 0);
  assert.deepEqual(Hud.prototype.statusChips.call({}, a).map(([k]) => k), ['SAPPED']);
  const x0 = p.x;
  run(a, 0.3, { ...idle, mx: -1 });
  assert.ok(Math.abs(x0 - p.x - p.speed * 0.8 * 0.3) < 0.05, `slowed to 80%: ${x0 - p.x}`);
  // Assimilation: a civilian drawn close for 2.5 s rises as a hostile Husk.
  const s = street(), q = s.player;
  q.invuln = true;
  const lure = disguise(s, 10, 0, { elite: ['blazing'] }); lure.lurker = 'assimilate';
  const victim = civ(s, 16, 0);
  run(s, 9);
  assert.equal(victim.isMimic, true);
  assert.ok(victim.state === 'revealing' || victim.state === 'hunt', victim.state);
  assert.equal(lure.taken, 1);
  // Ambush: it comes up like anyone else; within 3.5 m the disguise drops and it strikes.
  const m = street(), r = m.player, hp = r.hp;
  const amb = disguise(m, 10, 0, { elite: ['blazing'] }); amb.lurker = 'ambush'; amb.waitT = 0;
  run(m, 6);
  assert.ok(amb.state === 'revealing' || amb.state === 'hunt', amb.state);
  assert.ok(r.hp < hp, 'the strike lands on an operator who did not move');
  // The thief hurries off with a stolen radio; bring it down to get the radio back.
  const th = street(), u = th.player;
  const thief = disguise(th, 8, 0, { elite: ['blazing'] }); thief.lurker = 'thief'; thief.radio = true;
  const d0 = Math.hypot(thief.x - u.x, thief.z - u.z);
  run(th, 2);
  assert.ok(Math.hypot(thief.x - u.x, thief.z - u.z) > d0 + 3, 'it runs');
  th.reveal(thief, true); th.killEnemy(thief);
  assert.ok(u.inv.some((i) => i.name === 'Dispatch Radio'));
});
