// Headless checks of the frame builder: no GPU, a stub renderer. They prove that the
// drawing code runs and emits finite instances with the right state colours; how it
// looks still needs a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, DOOR_COL, ROUTE_COL, ROUTE_STOP } from '../src/render/scene.js';
import { generateWorld, INST_FLOATS, SHAPE, MAT } from '../src/sim/world.js';
import { Raid } from '../src/sim/raid.js';
import { openDoor } from '../src/sim/doors.js';
import { routeTargets, setRoute, routeAhead } from '../src/sim/route.js';

const city = generateWorld(20261125);
const stub = () => ({ globals: new Float32Array(8192), post: new Float32Array(64), opts: { shadows: true, textures: true }, height: 720, texReady: true });
const input = (raid) => ({ aimX: raid.player.x, aimZ: raid.player.z - 4, aimHeld: false });
const outside = (d, k = 1.6) => ({ x: d.x + d.nx * k, z: d.z + d.nz * k });

function frame(scene, raid, dt = 1 / 60) {
  const f = scene.build(raid, input(raid), dt, 16 / 9);
  for (let s = 0; s < f.counts.length; s++) {
    const d = f.dyn[s];
    for (let i = 0; i < f.counts[s] * INST_FLOATS; i++) assert.ok(Number.isFinite(d[i]), `shape ${s} float ${i} is ${d[i]}`);
  }
  for (let i = 0; i < f.spriteCount * 12; i++) assert.ok(Number.isFinite(f.sprites[i]), `sprite float ${i}`);
  return f;
}
// Emissive boxes of a colour within r metres of a point.
function lit(f, col, x, z, r = 1.2) {
  const d = f.dyn[SHAPE.BOX];
  let n = 0;
  for (let i = 0; i < f.counts[SHAPE.BOX]; i++) {
    const o = i * INST_FLOATS;
    if (d[o + 3] !== MAT.EMISSIVE || Math.hypot(d[o] - x, d[o + 2] - z) > r) continue;
    if (Math.abs(d[o + 12] - col[0]) < 1e-6 && Math.abs(d[o + 13] - col[1]) < 1e-6 && Math.abs(d[o + 14] - col[2]) < 1e-6) n++;
  }
  return n;
}

// Draw one container on its own and return a copy of what it emitted.
function drawOne(scene, c, st, k) {
  scene.counts.fill(0); scene.ns = 0;
  scene.drawContainer(c, st, 1.5, k);
  return scene.dyn.map((d, s) => Array.from(d.subarray(0, scene.counts[s] * INST_FLOATS)));
}
const SEARCH = [0.2, 0.85, 1.0];
const hasLight = (dyn) => { const d = dyn[SHAPE.BOX]; for (let o = 0; o < d.length; o += INST_FLOATS) if (d[o + 3] === MAT.EMISSIVE && Math.abs(d[o + 12] - SEARCH[0]) < 1e-6 && Math.abs(d[o + 13] - SEARCH[1]) < 1e-6) return true; return false; };

test('scene: tins, baskets and vehicle compartments open, and a Host looks like any other', () => {
  const scene = new Scene(stub());
  for (const pick of [(c) => c.kind === 'tin' && c.indoor, (c) => c.kind === 'tin' && c.y, (c) => c.kind === 'basket', (c) => c.veh?.kind === 'van', (c) => c.veh?.kind === 'truck', (c) => c.kind === 'boot', (c) => c.kind === 'wreck' && Math.abs(c.veh.tip) > 0.5]) {
    const c = city.containers.find(pick);
    if (!c) continue;
    const shut = drawOne(scene, c, { opened: false, hostKnown: false, host: false }, 0);
    assert.ok(hasLight(shut), `${c.kind} shows its search light`);
    assert.deepEqual(drawOne(scene, c, { opened: false, hostKnown: false, host: true }, 0), shut, 'no tell until a scan');
    let last = null;
    for (const k of [0.25, 0.5, 1]) {
      const open = drawOne(scene, c, { opened: true, hostKnown: false, host: false }, k);
      for (const s of open) for (const v of s) assert.ok(Number.isFinite(v));
      assert.ok(!hasLight(open), 'an opened container is dark');
      assert.notDeepEqual(open, last, `${c.kind} moves while it opens`);
      last = open;
    }
  }
});

test('scene: every kind of door draws with its state light, in both cameras', () => {
  for (const kind of ['closed', 'locked', 'jammed', 'dead']) {
    const d = city.doors.find((k) => k.kind === kind);
    const raid = new Raid({ world: city, seed: 5, mode: 'sandbox' }), scene = new Scene(stub());
    Object.assign(raid.player, outside(d, 3));
    for (const mode of ['top', 'shoulder']) {
      scene.cam.mode = mode;
      for (let i = 0; i < 25; i++) frame(scene, raid);
      assert.ok(lit(frame(scene, raid), DOOR_COL[kind], d.x, d.z) >= 4, `${kind} door lit in ${mode} view`);
    }
    raid.keys.add(d.id);
    if (kind === 'locked') assert.ok(lit(frame(scene, raid), DOOR_COL.keyed, d.x, d.z) >= 4, 'a locked door turns amber once its key is carried');
    if (openDoor(raid, d)) {
      for (let i = 0; i < 40; i++) { raid.time += 1 / 60; frame(scene, raid); }
      assert.ok(lit(frame(scene, raid), DOOR_COL.open, d.x, d.z) >= 4, `${kind} door shows open`);
    } else assert.equal(kind, 'dead');
  }
});

// Emissive boxes of a colour, as [x, z] centres.
function litAt(f, col) {
  const d = f.dyn[SHAPE.BOX], out = [];
  for (let i = 0; i < f.counts[SHAPE.BOX]; i++) {
    const o = i * INST_FLOATS;
    if (d[o + 3] === MAT.EMISSIVE && Math.abs(d[o + 12] - col[0]) < 1e-6 && Math.abs(d[o + 13] - col[1]) < 1e-6 && Math.abs(d[o + 14] - col[2]) < 1e-6) out.push([d[o], d[o + 2]]);
  }
  return out;
}

test('scene: route chevrons run along the stretch ahead, and a bar marks where it stops', () => {
  const raid = new Raid({ world: city, seed: 5, mode: 'sandbox' }), scene = new Scene(stub()), p = raid.player;
  setRoute(raid, routeTargets(raid).find((o) => o.kind === 'extract'));
  for (const mode of ['top', 'shoulder']) {
    scene.cam.mode = mode;
    for (let i = 0; i < 25; i++) frame(scene, raid);
    const marks = litAt(frame(scene, raid), ROUTE_COL), a = routeAhead(raid.route.result, p.x, p.z, 26);
    assert.ok(marks.length >= 6, `${marks.length} chevron strips in ${mode} view`);
    // Every strip lies along the stretch from the operator to the next turn, or is the turn's chevron.
    const ux = (a.x1 - a.x0) / a.len, uz = (a.z1 - a.z0) / a.len;
    for (const [x, z] of marks) {
      const along = (x - a.x0) * ux + (z - a.z0) * uz, off = Math.abs((x - a.x0) * uz - (z - a.z0) * ux);
      assert.ok((along > 0.5 && along < Math.min(26, a.len) + 0.5 && off < 0.6) || Math.hypot(x - a.x1, z - a.z1) < 1.6, `strip at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  }
  // A seen locked door in the way: the line turns amber and a bar stands in front of it.
  const d = city.doors.find((k) => k.kind === 'locked' && city.circleFree(k.x + k.nx * 4, k.z + k.nz * 4, 0.5) && city.circleFree(k.x - k.nx * 2.5, k.z - k.nz * 2.5, 0.5));
  Object.assign(p, outside(d, 4));
  raid.doors[d.id].seen = true; raid.doorVer++;
  setRoute(raid, { kind: 'test', key: 'test', x: d.x - d.nx * 2.5, z: d.z - d.nz * 2.5, reach: 1, label: 'test' });
  assert.ok(raid.route.result.blocked, 'the route stops at the door');
  for (let i = 0; i < 5; i++) frame(scene, raid);
  assert.ok(litAt(frame(scene, raid), ROUTE_STOP).some(([x, z]) => Math.hypot(x - d.x, z - d.z) < 1.5), 'a bar in front of the door');
  setRoute(raid, null);
  const f = frame(scene, raid);
  assert.equal(litAt(f, ROUTE_STOP).length + litAt(f, ROUTE_COL).length, 0, 'nothing once dismissed');
});
