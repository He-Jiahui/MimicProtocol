// The Shrike, a flying Mimic (doc 33, doc 64 Package 9): it roosts under the viaduct and on lamp
// arms and gantries, takes wing when it senses the operator, circles 5 to 8 m up, and dives onto
// the spot where its shadow grew, then lies grounded and open. Fire reaches it in the air only
// at its height. It holds a dive token, comes in waves only in the Hot zones and never in the
// first minutes, is never a disguise, has an elite form, and every class's bot can deal with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/sim/world.js';
import { heightYard, heightYardEdges } from '../src/sim/height.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { FLY } from '../src/sim/behave.js';
import { pickKind } from '../src/sim/horde.js';
import { ENEMIES, ZONES, CLASS_IDS, ELITE_HP } from '../src/sim/data.js';
import { castSkill } from '../src/sim/skills.js';
import { Scene, BODY_TOP, bodyTop } from '../src/render/scene.js';
import { INST_FLOATS } from '../src/sim/world.js';
import { GO } from '../src/render/shaders.js';
import zh from '../src/i18n/zh-CN.js';
import { makeBot } from './bot.js';

const DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const city = generateWorld(20261125);
function yard() { const w = generateWorld(7, { annex: true }); w.fillRect(41, 61, 159, 139, 0); return w; }
function sandbox(w, o = {}) {
  const raid = new Raid({ world: w, seed: 3, mode: 'sandbox', ...o }), p = raid.player;
  p.x = 100; p.z = 100; raid.world.place(p); p.crit = 0;
  return raid;
}
const run = (raid, s, input = idle) => { for (let i = 0; i < s * 60 && !raid.over; i++) { stepRaid(raid, DT, typeof input === 'function' ? input(raid) : input); raid.events.length = 0; } };

test('shrike: its data, never a disguise, never in a Zone\'s ambient list', () => {
  const S = ENEMIES.shrike;
  assert.equal(S.flier, true);
  for (const k of ['hp', 'dmg', 'speed', 'r', 'xp', 'credits', 'range', 'windup', 'cd', 'recover', 'tall']) assert.ok(S[k] > 0, k);
  assert.ok(S.xp > ENEMIES.skitter.xp && S.xp < ENEMIES.lobber.xp, 'paid between a Skitter and a Lobber');
  for (const z of ZONES) assert.ok(!z.mimics.some((k) => ENEMIES[k].flier), `${z.name} lists no flier`);
  // The ambient crowd in the Core zone over a long while: no disguised flier among them.
  const raid = new Raid({ world: city, seed: 11 }), p = raid.player, core = city.containers.find((c) => c.zone === 4);
  p.x = core.x; p.z = core.z; raid.player.invuln = true; raid.pressT = 600;
  run(raid, 40);
  const human = raid.enemies.filter((e) => e.state === 'civ' || e.state === 'disguised' || e.state === 'suspicious' || e.state === 'flee');
  assert.ok(human.length > 5);
  assert.ok(human.every((e) => !e.flier && e.kind !== 'shrike'));
  // Even when spawned as one, it comes out of the street and takes wing.
  const odd = raid.spawnEnemy('shrike', p.x + 3, p.z, { state: 'disguised', isMimic: true });
  assert.equal(odd.state, 'hunt'); assert.equal(odd.mode, 'takeoff');
});

test('shrike: roosts under the viaduct deck and on lamp arms and gantries, and wakes to the operator', () => {
  const hang = city.perches.filter((k) => k.hang), sit = city.perches.filter((k) => !k.hang);
  assert.ok(hang.length >= 20 && hang.every((k) => Math.abs(k.z - city.net.railZ) < 4 && k.y > 7 && k.y < 8.9), 'under the deck, below its 8.9 m underside');
  assert.ok(sit.length >= 60 && sit.every((k) => k.y > 6.9 && k.y < 7.4), 'on lamp arms and gantries');
  const k = hang.find((q) => city.cell(q.x, q.z) === 0);
  const raid = new Raid({ world: city, seed: 4, mode: 'sandbox' }), p = raid.player;
  p.x = k.x + 40; p.z = k.z + 6; raid.world.place(p);
  const e = raid.spawnEnemy('shrike', k.x, k.z, { perch: k });
  assert.deepEqual([e.mode, e.ay], ['perch', k.y]);
  run(raid, 2);
  assert.equal(e.mode, 'perch', 'still roosting with the operator 40 m off');
  assert.equal(e.x, k.x);
  // Gunfire under it puts it up, as does the operator walking within 22 m in sight.
  raid.noise(k.x, k.z, 18);
  run(raid, 0.1);
  assert.notEqual(e.mode, 'perch');
  const r2 = new Raid({ world: city, seed: 4, mode: 'sandbox' }), q = r2.player, e2 = r2.spawnEnemy('shrike', k.x, k.z, { perch: k });
  q.x = k.x + 12; q.z = k.z + 6; r2.world.place(q);
  run(r2, 0.5);
  assert.notEqual(e2.mode, 'perch', 'it sensed the operator');
});

test('shrike: it circles 5 to 8 m up over the ground, clear of walls, and keeps out of the Shelter', () => {
  const w = yard(), raid = sandbox(w), p = raid.player, e = raid.spawnEnemy('shrike', 110, 100, { state: 'hunt' });
  e.atkCd = 1e9;
  let lo = Infinity, hi = -Infinity, near = Infinity, far = 0;
  run(raid, 3);
  for (let i = 0; i < 60 * 12; i++) {
    stepRaid(raid, DT, idle); raid.events.length = 0;
    const alt = e.ay - w.floorAt(e.x, e.z), d = Math.hypot(e.x - p.x, e.z - p.z);
    lo = Math.min(lo, alt); hi = Math.max(hi, alt); near = Math.min(near, d); far = Math.max(far, d);
    assert.equal(w.cell(e.x, e.z) & 1, 0, 'never inside a wall');
  }
  assert.ok(lo >= FLY.alt - 0.05 && hi <= FLY.alt + FLY.altSpan + 0.05, `between 5 and 8 m (${lo.toFixed(2)} to ${hi.toFixed(2)})`);
  assert.ok(hi - lo > 1.5, 'rising and falling as it goes');
  assert.ok(near > 5 && far < 12, `round the operator at about 8.5 m (${near.toFixed(1)} to ${far.toFixed(1)})`);
  // In a raid it holds off the Shelter's field rather than burning in it.
  const r2 = new Raid({ world: city, seed: 6 }), q = r2.player;
  q.invuln = true;
  const s2 = r2.spawnEnemy('shrike', q.x, Math.floor(q.z / 100) * 100 - 5, { state: 'hunt' }); // just north of the Shelter's block
  assert.notEqual(city.zoneAt(s2.x, s2.z), 0);
  run(r2, 6);
  assert.ok(!s2.dead && city.zoneAt(s2.x, s2.z) !== 0, 'it never crossed into the Shelter');
});

test('shrike: the dive lands on the spot its shadow showed, after a warning the setting stretches', () => {
  for (const warning of [1, 1.8]) {
    const w = yard(), raid = sandbox(w, { warning }), p = raid.player, e = raid.spawnEnemy('shrike', 108, 100, { state: 'hunt' });
    e.atkCd = 0;
    let tele = null, beat = false, t0 = -1, landed = null;
    const hp = p.hp;
    for (let i = 0; i < 60 * 6 && !landed; i++) {
      stepRaid(raid, DT, idle);
      for (const ev of raid.events) if (ev.t === 'sfx' && ev.name === 'wingbeat') beat = true;
      raid.events.length = 0;
      if (!tele) { tele = raid.areas.find((a) => a.kind === 'tele' && a.src === e) || null; if (tele) t0 = raid.time; }
      if (e.mode === 'grounded') landed = { x: e.x, z: e.z, t: raid.time - t0 };
    }
    assert.ok(tele && beat, 'a wingbeat and a shape on the floor');
    assert.ok(Math.abs(e.windupMax - ENEMIES.shrike.windup * warning) < 1e-9, `the warning is ${warning} x the base`);
    assert.ok(Math.abs(tele.life - (e.windupMax + FLY.dive)) < 1e-9, 'the floor shape lasts the warning and the stoop');
    assert.ok(Math.abs(landed.t - tele.life) < 0.05, `it lands as the shape completes (${landed.t.toFixed(2)} s)`);
    assert.ok(Math.hypot(landed.x - tele.x, landed.z - tele.z) < 0.3, 'on the spot the shadow showed');
    assert.ok(Math.abs(e.ay - w.floorAt(e.x, e.z)) < 1e-9, 'on the ground');
    assert.ok(p.hp < hp, 'it struck the operator, who stood still');
  }
  // Grounded it is open: in a blade's reach and taking +30%, until it takes wing again.
  const w = yard(), raid = sandbox(w, { classId: 'blade' }), p = raid.player, e = raid.spawnEnemy('shrike', p.x, p.z - 1.6, { state: 'hunt' });
  e.ay = e.fy; e.mode = 'grounded'; e.modeT = ENEMIES.shrike.recover; e.vuln = FLY.vuln; e.hp = e.maxHp = 1e4;
  p.face = -Math.PI / 2;
  castSkill(raid, 'm1', { ...idle, aimX: p.x, aimZ: p.z - 5 });
  const cut = 1e4 - e.hp;
  assert.ok(Math.abs(cut - 22 * 1.3) < 1e-6, `a plain cut lands 30% harder (${cut})`);
  run(raid, ENEMIES.shrike.recover + 1.5);
  assert.notEqual(e.mode, 'grounded'); assert.equal(e.vuln, 0);
  assert.ok(e.ay - e.fy > 2.2, 'back in the air, out of reach');
  const hp2 = e.hp;
  castSkill(raid, 'm1', { ...idle, aimX: e.x, aimZ: e.z });
  assert.equal(e.hp, hp2, 'a blade does not reach it up there');
});

test('shrike: a clean dodge through the landing, and at most two dive at once', () => {
  const w = yard(), raid = sandbox(w), p = raid.player, e = raid.spawnEnemy('shrike', 108, 100, { state: 'hunt' });
  e.atkCd = 0;
  const hp = p.hp;
  let dodged = false;
  for (let i = 0; i < 60 * 5 && e.mode !== 'grounded'; i++) {
    const tele = raid.areas.find((a) => a.kind === 'tele' && a.src === e), roll = !!tele && tele.life - tele.t < 0.25 && !dodged;
    if (roll) dodged = true;
    stepRaid(raid, DT, { ...idle, mx: roll ? 1 : 0, dodge: roll });
    raid.events.length = 0;
  }
  assert.equal(p.hp, hp, 'rolled through it');
  // Four Shrikes ready at once: no more than two flare or stoop together.
  const r2 = sandbox(yard()), q = r2.player;
  q.invuln = true;
  const all = [0, 1, 2, 3].map((k) => r2.spawnEnemy('shrike', q.x + 9 * Math.cos(k * 1.57), q.z + 9 * Math.sin(k * 1.57), { state: 'hunt' }));
  let peak = 0;
  for (let i = 0; i < 60 * 12; i++) { for (const s of all) if (s.mode === 'circle') s.atkCd = Math.min(s.atkCd, 0); stepRaid(r2, DT, idle); r2.events.length = 0; peak = Math.max(peak, all.filter((s) => s.windupT > 0 || s.mode === 'dive').length); }
  assert.equal(peak, FLY.tokens);
});

test('shrike: fire reaches it in the air only at its height; on the ground anything does', () => {
  const w = yard(), raid = sandbox(w), p = raid.player, e = raid.spawnEnemy('shrike', 100, 90, { state: 'hunt' });
  e.atkCd = 1e9; e.hp = e.maxHp = 1e4;
  const fire = (aim) => {
    raid.lastInput = { ...idle, aimX: e.x, aimZ: e.z, ...aim };
    const dx = e.x - p.x, dz = e.z - p.z, l = Math.hypot(dx, dz), hp = e.hp;
    raid.fireBullet(p.x + dx / l * 0.9, p.z + dz / l * 0.9, dx / l, dz / l, { dmg: 10 });
    for (let i = 0; i < 20; i++) raid.updateProjectiles(DT);
    return hp - e.hp;
  };
  const hold = () => { e.x = 100; e.z = 90; raid.world.place(e); };
  hold(); e.ay = e.fy + 6.5;
  assert.equal(fire({ aimY: 1.3, aimLine: true }), 0, 'a chest-height round passes under it');
  assert.ok(fire({ aimY: raid.aimHeightOf(e), aimLine: true }) > 0, 'one raised to it meets it');
  assert.ok(fire({}) > 0, 'with no height given, the aim on its shadow takes its height');
  e.mode = 'grounded'; e.ay = e.fy;
  assert.ok(fire({ aimY: 1.3, aimLine: true }) > 0, 'grounded, a level round finds it');
  // Its health bar and marks follow it up.
  e.ay = e.fy + 6.5;
  assert.ok(Math.abs(bodyTop(e) - (e.ay + BODY_TOP.shrike)) < 1e-9);
  void castSkill;
});

test('shrike: waves bring it only in the Hot zones after three minutes; the director roosts it; it has an elite form', () => {
  const raid = new Raid({ world: city, seed: 21 });
  const count = (heat, zone) => { let n = 0; for (let i = 0; i < 600; i++) if (pickKind(raid, heat, zone) === 'shrike') n++; return n; };
  assert.equal(count(10, 1) + count(10, 2), 0, 'never in the Calm or Contested zones');
  assert.equal(count(2.5, 4), 0, 'never in the first minutes, even in the Core');
  assert.ok(count(5, 3) > 0 && count(5, 4) > 0, 'a share of the waves later on');
  // Roosts: in a Hot block, a Shrike or two settles 24 to 50 m out.
  const p = raid.player, k = city.perches.find((q) => city.zoneAt(q.x, q.z) >= 3);
  p.x = k.x + 30; p.z = k.z; city.resolveCircle(p, 1);
  let made = 0;
  for (let i = 0; i < 4 && !made; i++) made = raid.roost();
  const roosting = raid.enemies.filter((e) => e.flier);
  assert.ok(made >= 1 && roosting.every((e) => e.mode === 'perch' && Math.hypot(e.x - p.x, e.z - p.z) >= 24 && Math.hypot(e.x - p.x, e.z - p.z) <= 50), 'roosting at a distance');
  // Elite: bigger, tougher, better paid; its affix marks hang over it in the air.
  const el = raid.spawnEnemy('shrike', p.x, p.z, { state: 'hunt', elite: ['armored'] }), plain = raid.spawnEnemy('shrike', p.x, p.z, { state: 'hunt' });
  assert.ok(Math.abs(el.maxHp / plain.maxHp - ELITE_HP) < 1e-9 && el.xp === plain.xp * 4 && el.scale > 1);
});

test('shrike: doors, the flow field and the step rule are not its business; kills drop where it falls', () => {
  // Over a terrace face and back without a stair: it flies, and its floor follows the ground.
  const w = generateWorld(7, { annex: true });
  w.fillRect(41, 61, 159, 139, 0);
  heightYard(w, 100, 80); heightYardEdges(w, 100, 80);
  const raid = new Raid({ world: w, seed: 3, mode: 'sandbox' }), p = raid.player;
  p.x = 110.5; p.z = 89.5; raid.world.place(p);
  assert.equal(p.fy, 4, 'the operator on the terrace');
  const e = raid.spawnEnemy('shrike', 110.5, 108, { state: 'hunt' });
  e.atkCd = 1e9;
  let over = false, maxJump = 0, last = e.ay;
  for (let i = 0; i < 60 * 8; i++) {
    stepRaid(raid, DT, idle); raid.events.length = 0;
    if (w.floorAt(e.x, e.z) > 0) over = true;
    assert.ok(e.ay >= w.floorAt(e.x, e.z) + 0.8 - 1e-9, 'never into the raised ground');
    maxJump = Math.max(maxJump, Math.abs(e.ay - last)); last = e.ay;
  }
  assert.ok(over, 'it came over the terrace');
  assert.ok(e.ay - 4 >= FLY.alt - 0.2, 'and circles over the operator\'s level, not under the edge');
  assert.ok(maxJump < 0.1, 'its height is continuous across the edge');
  // A closed door: a Shrike pressed against it does not shove it open.
  const d = city.doors.find((k) => k.kind === 'closed');
  const r2 = new Raid({ world: city, seed: 5, mode: 'sandbox' }), s = r2.spawnEnemy('shrike', d.x + d.nx * 0.9, d.z + d.nz * 0.9, { state: 'hunt' });
  s.atkCd = 1e9; s.mode = 'grounded'; s.modeT = 9; s.ay = s.fy;
  r2.player.x = d.x + d.nx * 6; r2.player.z = d.z + d.nz * 6;
  run(r2, 2);
  assert.equal(r2.doors[d.id].state, 'closed');
  // Killed in the air, what it carried lands on the street under it, and its body falls from its height.
  const r3 = new Raid({ world: yard(), seed: 3 }), k = r3.spawnEnemy('shrike', 100, 92, { state: 'hunt' });
  k.ay = 6.5; k.credits = 0; k.xp = 13;
  r3.damageEnemy(k, 1e6);
  const kill = r3.events.find((ev) => ev.t === 'kill'), shard = r3.pickups.find((q) => q.kind === 'xp');
  assert.ok(kill && kill.body.ay === 6.5, 'the falling body starts at its height');
  assert.ok(shard && Math.hypot(shard.x - 100, shard.z - 92) < 1e-6);
});

test('shrike: each class\'s bot deals with two of them and lives', () => {
  for (const classId of CLASS_IDS) {
    const raid = sandbox(yard(), { classId }), p = raid.player;
    const pair = [raid.spawnEnemy('shrike', 112, 100, { state: 'hunt' }), raid.spawnEnemy('shrike', 88, 96, { state: 'hunt' })];
    for (const e of pair) e.hp = e.maxHp = 100; // a Hot-zone Shrike's health
    const bot = makeBot({ goal: { x: 100, z: 100 }, scanEvery: 0 });
    let air = 0;
    for (let i = 0; i < 60 * 60 && pair.some((e) => !e.dead) && !raid.over; i++) {
      stepRaid(raid, DT, bot(raid, DT));
      for (const ev of raid.events) if (ev.t === 'dmg' && ev.h > 3) air += ev.amount;
      raid.events.length = 0;
    }
    assert.ok(pair.every((e) => e.dead), `${classId} brought both down`);
    assert.equal(raid.over, false, `${classId} lived`);
    assert.ok(p.hp > p.maxHp * 0.5, `${classId} kept out of most dives (${Math.round(p.hp)}/${p.maxHp})`);
    if (classId === 'blade') assert.equal(air, 0, 'the Blade cut them down on the ground');
    else assert.ok(air > 0, `${classId} hit them in the air`);
  }
});

test('shrike: it draws in every pose at its height, wings wide, and its shadow is put on the ground', () => {
  const raid = new Raid({ world: city, seed: 4, mode: 'sandbox' }), p = raid.player;
  const stub = { globals: new Float32Array(8192), post: new Float32Array(64), opts: { shadows: true, textures: true }, height: 720, texReady: true };
  const scene = new Scene(stub);
  const e = raid.spawnEnemy('shrike', p.x + 4, p.z - 6, { state: 'hunt' });
  e.atkCd = 1e9;
  const poses = [
    () => { e.mode = 'circle'; e.windupT = 0; e.ay = e.fy + 6.5; },
    () => { e.mode = 'circle'; e.windupT = 0.4; e.windupMax = 1.1; e.dive = { x: p.x, z: p.z, y: 0 }; },
    () => { e.mode = 'dive'; e.windupT = 0; e.ay = e.fy + 2; },
    () => { e.mode = 'grounded'; e.ay = e.fy; },
    () => { e.mode = 'perch'; e.perch = { x: e.x, z: e.z, y: 7.6, hang: true }; e.ay = 7.6; },
    () => { e.mode = 'perch'; e.perch = { x: e.x, z: e.z, y: 7.27, hang: false }; e.ay = 7.27; },
  ];
  for (const pose of poses) {
    pose();
    scene.counts.fill(0); scene.ns = 0; scene.world = raid.world; scene.by = raid.world.floorAt(e.x, e.z);
    scene.drawEnemy(e, 1.3);
    let n = 0, lo = Infinity, x0 = Infinity, x1 = -Infinity;
    for (let s = 0; s < scene.counts.length; s++) {
      const d = scene.dyn[s];
      for (let i = 0; i < scene.counts[s]; i++) {
        const o = i * INST_FLOATS;
        for (let k = 0; k < INST_FLOATS; k++) assert.ok(Number.isFinite(d[o + k]), `${e.mode}: finite`);
        n++; lo = Math.min(lo, d[o + 1]); x0 = Math.min(x0, d[o]); x1 = Math.max(x1, d[o]);
      }
    }
    assert.ok(n > 40, `${e.mode}: a full model (${n})`);
    if (e.mode === 'circle' && !(e.windupT > 0)) {
      assert.ok(lo > e.ay - 1, `drawn up at its height (${lo.toFixed(2)})`);
      assert.ok(x1 - x0 > 3, `wings wide enough to read from above (${(x1 - x0).toFixed(1)} m)`);
    }
    if (e.mode === 'perch' && e.perch.hang) assert.ok(lo > 6 && lo < 8.9, 'hanging under the deck');
  }
  // Built into a frame, its shadow comes before the other bodies' and grows through the warning.
  e.mode = 'circle'; e.windupT = 0; e.ay = e.fy + 6.5;
  const calm = scene.shrikeShadow(e);
  e.windupT = 0.1; e.windupMax = 1.1;
  const warn = scene.shrikeShadow(e);
  assert.ok(warn.r > calm.r && warn.k > calm.k, 'larger and darker through the warning');
  e.x = p.x + 25; e.z = p.z; raid.world.place(e); e.ay = e.fy + 6.5; e.windupT = 0;   // beyond the 14 m other bodies get
  scene.build(raid, { aimX: p.x, aimZ: p.z - 4, aimHeld: false }, DT, 16 / 9);
  const g = scene.r.globals, n = g[GO.misc + 1];
  let found = null;
  for (let i = 0; i < n; i++) { const o = GO.blobs + i * 4; if (Math.hypot(g[o] - e.x, g[o + 1] - e.z) < 1e-3) found = i; }
  assert.equal(found, 1, 'its shadow, right after the operator\'s');
});

test('shrike: its name, its relay line and its grounded mark have Chinese entries', () => {
  for (const k of ['Shrike', 'Grounded']) assert.ok(zh[k], k);
  const src = readFileSync(new URL('../src/sim/raid.js', import.meta.url), 'utf8');
  const relay = src.match(/this\.relay\('(Relay: Shrikes[^']+)'\)/);
  assert.ok(relay && zh[relay[1]], 'the relay line');
});
