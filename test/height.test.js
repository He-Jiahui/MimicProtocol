// Height in the simulation (doc 64 Package 8, doc 29): the step rule, walls from below and
// edges from above, one-way drops and their falls, enemies that never climb, a flow field
// and a route that find the stair, and sight lines and rounds that the ground stops.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, reachable } from '../src/sim/world.js';
import { heightYard, heightYardEdges, slope, level, HMARK } from '../src/sim/height.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { findRoute } from '../src/sim/route.js';
import { chargeLane } from '../src/sim/behave.js';
import { castSkill } from '../src/sim/skills.js';

const DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const X = 100, Z = 80; // the yard's terrace corner

// The training annex, cleared and laid with the height yard (src/sim/height.js).
function yard(edges = true) {
  const w = generateWorld(7, { annex: true });
  w.fillRect(41, 61, 159, 139, 0);
  const Y = heightYard(w, X, Z);
  if (edges) heightYardEdges(w, X, Z);
  return { w, Y };
}
function sandbox(w, x, z) {
  const raid = new Raid({ world: w, seed: 3, mode: 'sandbox' });
  const p = raid.player;
  p.x = x; p.z = z; raid.world.place(p); p.crit = 0;
  raid.computeField();
  return raid;
}
const run = (raid, seconds, input = idle) => { for (let i = 0; i < seconds * 60 && !raid.over; i++) stepRaid(raid, DT, typeof input === 'function' ? input(raid) : input); };
const walk = (dx, dz) => ({ ...idle, mx: dx, mz: dz });

test('height: the floor map defaults flat, and the demo district is flat until a scene raises it', () => {
  const w = generateWorld(7, { annex: true });
  assert.equal(w.hasHeight, false);
  assert.equal(w.floorAt(100, 100), 0);
  const { w: y } = yard();
  assert.equal(y.hasHeight, true);
  assert.equal(y.floorAt(X + 3, Z + 10), 4);
  assert.equal(y.floorAt(X + 2, Z + 2), 8);
  assert.equal(y.floorAt(X + 25, Z + 8), -2);
  // A stair rises 0.5 m a cell; its top row meets the terrace flush.
  for (let z = Z + 16; z < Z + 24; z++) assert.equal(y.floorAt(X + 7, z), 4 - 0.5 * (z - Z - 16), `stair row ${z}`);
  assert.equal(y.hmark[(Z + 20) * y.size + X + 7], HMARK.STAIR);
  assert.throws(() => slope(y, 0, 0, 3, 3, 'x+', 0, 4), /cannot rise/, 'a stair shorter than its rise needs is refused');
  // The raid's overlay shares the floor until it takes its own copy.
  const raid = new Raid({ world: y, seed: 1, mode: 'sandbox' });
  assert.equal(raid.world.floor, y.floor);
  raid.world.ownDrop()[5] = 1;
  assert.equal(y.drop[5], 0, 'a drop made in one raid stays in that raid');
});

test('height: a stair is walked up and down; a taller face is a wall from below', () => {
  const { w } = yard();
  // From the street at the foot of the stair, north up it onto the terrace.
  const up = sandbox(w, X + 7.5, Z + 26);
  run(up, 3, walk(0, -1));
  assert.equal(up.player.fy, 4, 'on the terrace');
  assert.ok(up.player.z < Z + 16);
  // And back down.
  run(up, 0.2, walk(0, 1)); // turn round
  up.player.x = X + 7.5; up.player.z = Z + 14;
  run(up, 3, walk(0, 1));
  assert.equal(up.player.fy, 0, 'back in the street');
  // The face beside the stair stops the operator: no climbing 4 m.
  const wall = sandbox(w, X + 2.5, Z + 19);
  run(wall, 2, walk(0, -1));
  assert.equal(wall.player.fy, 0);
  assert.ok(wall.player.z >= Z + 16 + wall.player.r - 1e-6, `held at the face (${wall.player.z})`);
});

test('height: from above a tall edge cannot be stepped off, parapet or not', () => {
  for (const edges of [true, false]) {
    const { w } = yard(edges);
    const raid = sandbox(w, X + 12.5, Z + 13.5);
    assert.equal(raid.player.fy, 4);
    run(raid, 2, walk(1, 0));
    assert.equal(raid.player.fy, 4, `still on the terrace (parapets ${edges})`);
    assert.ok(raid.player.x <= X + 16, 'held at the edge');
    assert.equal(raid.player.hp, raid.player.maxHp);
  }
  // A parapet stands on the terrace's edge cells, but not on the stair or the drop cell.
  const { w } = yard();
  assert.equal(w.grid[(Z + 13) * w.size + X + 15], 2, 'parapet on the east edge');
  assert.equal(w.grid[(Z + 15) * w.size + X + 2], 2, 'parapet on the south edge');
  assert.equal(w.grid[(Z + 10) * w.size + X + 15], 0, 'the drop cell is open');
  assert.equal(w.grid[(Z + 15) * w.size + X + 7], 0, 'the stair head is open');
});

test('height: stepping off a drop costs 15% to 4 m, 40% to 8 m, and beyond that is lethal', () => {
  const { w, Y } = yard();
  const fall = (x, z, fy, dx, dz, o = {}) => {
    const raid = sandbox(w, x, z);
    const p = raid.player;
    p.fy = fy; p.fc = Math.floor(z) * w.size + Math.floor(x);
    Object.assign(raid, o.raid || {}); Object.assign(p, o.player || {});
    const hp = p.hp;
    run(raid, 1.5, walk(dx, dz));
    return { raid, p, lost: (hp - p.hp) / p.maxHp };
  };
  const a = fall(Y.drop.x - 2, Y.drop.z, 4, 1, 0);
  assert.equal(a.p.fy, 0, 'landed in the street');
  assert.ok(Math.abs(a.lost - 0.15) < 1e-9, `4 m: ${a.lost}`);
  assert.ok(a.raid.events.some((e) => e.t === 'fall' && e.m === 4));
  const b = fall(Y.deckDrop.x + 2, Y.deckDrop.z, 8, -1, 0);
  assert.equal(b.p.fy, 0);
  assert.ok(Math.abs(b.lost - 0.4) < 1e-9, `8 m: ${b.lost}`);
  const c = fall(Y.post.x - 1.5, Y.post.z, 12, 1, 0);
  assert.equal(c.raid.over, true, 'a 12 m fall ends the raid');
  assert.equal(c.raid.result.outcome, 'dead');
  // Where nothing may kill (the tutorial, god mode), it leaves one point of health.
  const d = fall(Y.post.x - 1.5, Y.post.z, 12, 1, 0, { raid: { noLethal: true } });
  assert.equal(d.raid.over, false);
  assert.equal(d.p.hp, 1);
  // A clip-on descent line takes one drop of up to 12 m for nothing.
  const e = fall(Y.post.x - 1.5, Y.post.z, 12, 1, 0, { player: { descentLines: 1 } });
  assert.equal(e.lost, 0);
  assert.equal(e.p.descentLines, 0);
  assert.equal(e.p.fy, 0);
});

test('height: enemies never climb more than a step; the flow field takes them round to the stair', () => {
  const { w } = yard();
  const raid = sandbox(w, X + 3.5, Z + 12.5);   // the operator on the terrace
  const e = raid.spawnEnemy('walker', X + 3.5, Z + 18.5, { state: 'hunt' });
  assert.equal(e.fy, 0);
  // At the foot of the face, the field does not point into it.
  raid.computeField();
  raid.chaseDir(e);
  assert.ok(raid.dirZ > -0.7, `the chase does not run at the wall (${raid.dirX.toFixed(2)}, ${raid.dirZ.toFixed(2)})`);
  let onStair = false, maxRise = 0, last = e.fy;
  run(raid, 14, () => {
    if (w.hmark[Math.floor(e.z) * w.size + Math.floor(e.x)] === HMARK.STAIR) onStair = true;
    maxRise = Math.max(maxRise, e.fy - last); last = e.fy;
    return idle;
  });
  assert.ok(onStair, 'it came up the stair');
  assert.equal(e.fy, 4, 'and stands on the terrace');
  assert.ok(maxRise <= 0.5, `never more than a step at a time (${maxRise})`);
  // Pushed straight at a 4 m face, nothing goes up it.
  const other = sandbox(w, X + 3.5, Z + 30);
  const b = other.spawnEnemy('brute', X + 3.5, Z + 18.5, { state: 'hunt' });
  for (let i = 0; i < 120; i++) other.moveEnemy(b, 0, -1, 6, DT);
  assert.equal(b.fy, 0);
  assert.ok(b.z > Z + 16);
  // A Skitter's leap at it slides along the face; a charge lane ends there.
  const s = other.spawnEnemy('skitter', X + 12.5, Z + 18.5, { state: 'hunt' });
  s.leap = { vx: 0, vz: -21, t: 0.38, hit: true };
  for (let i = 0; i < 30; i++) other.updateHunter(s, DT, 0, 0, 30);
  assert.equal(s.fy, 0);
  const L = chargeLane(other, b, -Math.PI / 2);
  assert.ok(L.len < 3.5, `the charge lane stops at the face (${L.len})`);
});

test('height: an enemy drops where a drop is authored, and only there', () => {
  const { w, Y } = yard();
  // The operator in the street east of the terrace; a walker on the terrace by the drop cell.
  const raid = sandbox(w, X + 22, Z + 10.5);
  const e = raid.spawnEnemy('walker', Y.drop.x - 3, Y.drop.z, { state: 'hunt' });
  assert.equal(e.fy, 4);
  const hp = e.hp;
  run(raid, 4);
  assert.equal(e.fy, 0, 'it stepped off the drop cell to come for the operator');
  assert.equal(e.hp, hp, 'a hostile takes no fall damage of its own');
  // The field leads off the drop, not along the terrace to the stair and round.
  const r2 = sandbox(w, X + 22, Z + 10.5), e2 = r2.spawnEnemy('walker', Y.drop.x - 1, Y.drop.z, { state: 'hunt' });
  r2.computeField(); r2.chaseDir(e2);
  assert.ok(r2.dirX > 0.7, 'toward the drop');
});

test('height: a terrace edge blocks sight from below; from its edge one sees down at a sensible angle', () => {
  const { w } = yard();
  // From the street at the foot of the face to the middle of the terrace: no.
  assert.equal(w.hasLos(X + 2.5, Z + 18, X + 2.5, Z + 8), false);
  // From the terrace one cell in from its edge to the street 8 m out: yes, over the parapet.
  assert.equal(w.hasLos(X + 10.5, Z + 14.5, X + 10.5, Z + 24), true);
  // But not to the foot of the face right under it.
  assert.equal(w.hasLos(X + 10.5, Z + 14.5, X + 10.5, Z + 16.8), false);
  // On one level, as before.
  assert.equal(w.hasLos(X + 9, Z + 9, X + 14, Z + 14), true);
  // The deck's own edge hides the terrace close under it.
  assert.equal(w.hasLos(X + 2, Z + 2, X + 9, Z + 9), false);
  assert.equal(w.hasLos(X - 20, Z + 30, X - 10, Z + 40), true);
});

test('height: rounds carry their height: a terrace stops them from below, they hit down from its edge', () => {
  const { w } = yard();
  const shoot = (px, pz, ex, ez) => {
    const raid = sandbox(w, px, pz);
    const e = raid.spawnEnemy('dummy', ex, ez); e.hp = e.maxHp = 1000;
    const dx = ex - px, dz = ez - pz, l = Math.hypot(dx, dz);
    raid.lastInput = { ...idle, aimX: ex, aimZ: ez };
    raid.fireBullet(px + dx / l * 0.9, pz + dz / l * 0.9, dx / l, dz / l, { dmg: 20 });
    run(raid, 1, { ...idle, aimX: ex, aimZ: ez });
    return { hit: e.hp < 1000, raid };
  };
  assert.equal(shoot(X + 2.5, Z + 20, X + 2.5, Z + 9).hit, false, 'from below into the terrace face');
  assert.equal(shoot(X + 10.5, Z + 14.5, X + 10.5, Z + 23).hit, true, 'from the terrace edge down into the street');
  assert.equal(shoot(X + 2.5, Z + 9, X + 12.5, Z + 9).hit, true, 'level across the terrace');
  const r = shoot(X + 2.5, Z + 20, X + 2.5, Z + 9).raid;
  assert.ok(r.events.some((e) => e.t === 'wallhit' && e.y !== undefined && e.y < 4.1), 'the round struck the face');
});

test('height: a cursor placed well beyond a target on lower ground still meets it at chest height', () => {
  const { w } = yard();
  const shoot = (px, pz, ex, ez, ax, az) => {
    const raid = sandbox(w, px, pz);
    const e = raid.spawnEnemy('dummy', ex, ez); e.hp = e.maxHp = 1000;
    const dx = ax - px, dz = az - pz, l = Math.hypot(dx, dz), aim = { ...idle, aimX: ax, aimZ: az };
    raid.lastInput = aim;
    raid.fireBullet(px + dx / l * 0.9, pz + dz / l * 0.9, dx / l, dz / l, { dmg: 20 });
    let low = Infinity;
    for (let i = 0; i < 60 && raid.projectiles.length; i++) { stepRaid(raid, DT, aim); for (const pr of raid.projectiles) if (pr.z > Z + 17) low = Math.min(low, pr.y); }
    return { hit: e.hp < 1000, low };
  };
  // From the terrace's south edge down to a Husk in the street, the cursor 13 m past it.
  const far = shoot(X + 10.5, Z + 14.5, X + 10.5, Z + 21, X + 10.5, Z + 34);
  assert.equal(far.hit, true, 'the round settles to chest height over the street and meets it');
  assert.ok(Math.abs(far.low - 1.3) < 0.05, `and holds chest height there (${far.low.toFixed(2)})`);
  // The cursor on it, as before; and level fire on the terrace is untouched.
  assert.equal(shoot(X + 10.5, Z + 14.5, X + 10.5, Z + 21, X + 10.5, Z + 21).hit, true);
  assert.equal(shoot(X + 2.5, Z + 9, X + 9.5, Z + 9, X + 14.5, Z + 9).hit, true);
  // Holding a lower height never digs under the ground it crosses: from the deck over the
  // terrace (4 m below it) toward the street beyond, it keeps over the terrace.
  const raid = sandbox(w, X + 3.5, Z + 3.5);
  const aim = { ...idle, aimX: X + 3.5, aimZ: Z + 40 };
  raid.lastInput = aim;
  raid.fireBullet(X + 3.5, Z + 4.4, 0, 1, { dmg: 20 });
  for (let i = 0; i < 20; i++) { stepRaid(raid, DT, aim); for (const pr of raid.projectiles) if (pr.z < Z + 15) assert.ok(pr.y >= w.floorAt(pr.x, pr.z) + 1.29, `above the ground at ${pr.z.toFixed(1)}`); }
});

test('height: Execution blinks only where a walk could go; a drop it takes costs the fall', () => {
  const { w, Y } = yard();
  const execute = (px, pz, ex, ez) => {
    const raid = new Raid({ world: w, seed: 3, mode: 'sandbox', classId: 'blade' }), p = raid.player;
    p.x = px; p.z = pz; raid.world.place(p); p.crit = 0;
    const e = raid.spawnEnemy('dummy', ex, ez); e.hp = e.maxHp = 1e6; e.st.exposedT = 5;
    const hp = p.hp;
    castSkill(raid, 'r', idle);
    run(raid, 1);
    return { p, struck: e.hp < 1e6, lost: (hp - p.hp) / p.maxHp };
  };
  // From the street at the foot of the face, a Husk up on the terrace: no blink up the face.
  const up = execute(X + 3.5, Z + 20.5, X + 3.5, Z + 12.5);
  assert.equal(up.p.fy, 0, 'still in the street');
  assert.ok(up.p.z > Z + 16, `held below the face (${up.p.z.toFixed(1)})`);
  assert.equal(up.struck, false, 'and the cut falls short');
  // From the terrace over a plain edge to the street below: refused too.
  const off = execute(X + 12.5, Z + 13.5, X + 12.5, Z + 20.5);
  assert.equal(off.p.fy, 4);
  assert.equal(off.struck, false);
  // Across the east drop cell it goes, and lands 4 m down with the usual 15%.
  const drop = execute(Y.drop.x - 3, Y.drop.z, Y.drop.x + 4, Y.drop.z);
  assert.equal(drop.p.fy, 0, 'down in the street');
  assert.equal(drop.struck, true);
  assert.ok(Math.abs(drop.lost - 0.15) < 1e-9, `a 4 m drop (${drop.lost})`);
  // On one level nothing changes: it reaches and strikes.
  const flat = execute(X + 10.5, Z + 12.5, X + 10.5, Z + 5.5);
  assert.equal(flat.p.fy, 4);
  assert.ok(flat.p.z < Z + 8, 'it blinked across the terrace');
  assert.equal(flat.struck, true);
});

test('height: a blast does not reach a terrace; what lies on another level is not worked from below', () => {
  const { w } = yard();
  const c = w.addContainer(X + 4.5, Z + 14.5, 'crate', false);
  w.blocks[c.block].containers.push(c);
  const raid = sandbox(w, X + 4.5, Z + 16.6);
  assert.equal(raid.player.fy, 0);
  assert.ok(Math.hypot(c.x - raid.player.x, c.z - raid.player.z) < 2.3);
  raid.updateInteract(DT, idle);
  assert.ok(!raid.prompt || raid.prompt.type !== 'container', 'not searched from the street below');
  const top = sandbox(w, X + 4.5, Z + 12.5);
  top.updateInteract(DT, idle);
  assert.equal(top.prompt && top.prompt.type, 'container');
  // A floor blast in the street misses the operator on the terrace above it.
  const hit = sandbox(w, X + 4.5, Z + 15.0), hp = hit.player.hp;
  hit.enemyBlast(X + 4.5, Z + 17.5, 4, 0.1, 30);
  run(hit, 0.3);
  assert.equal(hit.player.hp, hp);
  // Enemies on the terrace are not caught by a slash in the street.
  const r3 = sandbox(w, X + 4.5, Z + 17.5), up = r3.spawnEnemy('dummy', X + 4.5, Z + 15.0);
  let caught = 0;
  r3.forRadius(X + 4.5, Z + 17.5, 4, (e) => { if (e === up) caught++; });
  assert.equal(caught, 0);
});

test('height: walking reach and a route keep to the stairs', () => {
  const { w, Y } = yard();
  const seen = reachable(w, null, { x: X + 7.5, z: Z + 30 });
  const at = (x, z) => seen[Math.floor(z) * w.size + Math.floor(x)] === 1;
  assert.ok(at(X + 3.5, Z + 12.5), 'the terrace, by its stair');
  assert.ok(at(X + 2.5, Z + 2.5), 'the deck, by its own stair');
  assert.ok(at(X + 27, Z + 10), 'the pit, down its stair');
  assert.ok(!at(Y.post.x - 1, Y.post.z), 'the post: no way up');
  const raid = sandbox(w, X + 2.5, Z + 20);
  const r = findRoute(raid, X + 2.5, Z + 20, { x: X + 2.5, z: Z + 10, reach: 1.5 });
  assert.equal(r.ok, true);
  assert.ok(r.path.some((q) => q.x >= X + 6 && q.x <= X + 9 && q.z > Z + 15 && q.z < Z + 25), 'the route turns to the stair');
  assert.ok(r.length > r.straight + 6, `walked round, not up the face (${r.length.toFixed(1)} vs ${r.straight.toFixed(1)})`);
  // Never a drop: from the terrace to the street east of it, the route goes back down the stair.
  const down = findRoute(raid, Y.drop.x - 2, Y.drop.z, { x: X + 20, z: Z + 10.5, reach: 1.5 });
  assert.equal(down.ok, true);
  assert.ok(down.length > 20, `round by the stair (${down.length.toFixed(1)} m)`);
  // A level that is not split is untouched by height: a straight route stays straight.
  const flat = findRoute(raid, X - 15, Z + 40, { x: X + 25, z: Z + 40, reach: 1.5 });
  assert.ok(Math.abs(flat.length - flat.straight) < 0.5);
});

test('height: a door on a raised floor answers only from its own level', () => {
  const { w } = yard();
  level(w, X - 30, Z + 30, X - 20, Z + 40, 4);
  const raid = sandbox(w, X - 25, Z + 35);
  // A door laid in the raised block's south edge, on its floor.
  const d = { id: raid.world.doors.length, kind: 'closed', side: 1, horiz: true, back: false, x: X - 25, z: Z + 39.5, x0: X - 26, z0: Z + 39, x1: X - 24, z1: Z + 40, cells: [], nx: 0, nz: 1, use: 'shop', key: -1, ref: 'A1', block: 0, zone: 0 };
  assert.equal(w.floorAt(d.x, d.z), 4);
  raid.world.doors.push(d); raid.doors.push({ state: 'closed', progress: 0, openT: -1, seen: false, lead: false, push: 0, pushT: -1 });
  raid.world.blocks[raid.world.blockIndex(d.x, d.z)].doors.push(d);
  raid.player.x = X - 25; raid.player.z = Z + 41.2; raid.world.place(raid.player);
  raid.updateInteract(DT, idle);
  assert.ok(!raid.prompt || raid.prompt.type !== 'door', 'not from the street below');
  raid.player.z = Z + 38; raid.world.place(raid.player);
  raid.updateInteract(DT, idle);
  assert.equal(raid.prompt && raid.prompt.type, 'door');
});

test('height: every drop and fall line has a Chinese entry', async () => {
  const { readFileSync } = await import('node:fs');
  const zh = (await import('../src/i18n/zh-CN.js')).default;
  const src = readFileSync(new URL('../src/sim/raid.js', import.meta.url), 'utf8');
  const start = src.indexOf('  fall(m) {'), body = src.slice(start, src.indexOf('\n  }\n', start));
  const keys = [...body.matchAll(/message\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 3);
  for (const k of keys) assert.ok(Object.hasOwn(zh, k) && zh[k], `Missing translation: ${k}`);
});
