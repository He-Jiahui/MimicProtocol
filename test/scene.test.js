// Headless checks of the frame builder: no GPU, a stub renderer. They prove that the
// drawing code runs and emits finite instances with the right state colours; how it
// looks still needs a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, DOOR_COL } from '../src/render/scene.js';
import { generateWorld, INST_FLOATS, SHAPE, MAT } from '../src/sim/world.js';
import { Raid } from '../src/sim/raid.js';
import { openDoor } from '../src/sim/doors.js';

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
