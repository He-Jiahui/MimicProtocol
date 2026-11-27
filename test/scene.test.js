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
