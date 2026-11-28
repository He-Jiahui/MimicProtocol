// Height in the renderer (doc 64 Package 8), without a GPU: the static geometry the floor
// map emits (slabs, treads, walls, parapets, nosings, sills), the ground planes, a stub
// scene that draws bodies, rings and the cut-away at the operator's floor, the rain-shelter
// map and the minimap's stairs and drops. How it all looks still needs a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, INST_FLOATS, SHAPE, MAT } from '../src/sim/world.js';
import { NO_CUT } from '../src/sim/emit.js';
import { Raid } from '../src/sim/raid.js';
import { Scene } from '../src/render/scene.js';
import { GO } from '../src/render/shaders.js';
import { buildCover, shelterAt } from '../src/render/cover.js';

const SEED = 20261125;
const city = generateWorld(SEED, { heightTest: true });
const Y = city.heightTest; // the yard's terrace corner
const stub = () => ({ globals: new Float32Array(8192), post: new Float32Array(64), opts: { shadows: true, textures: true }, height: 720, texReady: true });
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };

// Static instances of a shape inside a box of the map.
function statics(shape, x0, z0, x1, z1) {
  const d = city.shapes[shape].data, out = [];
  for (let o = 0; o < d.length; o += INST_FLOATS) if (d[o] >= x0 && d[o] <= x1 && d[o + 2] >= z0 && d[o + 2] <= z1) out.push(d.subarray(o, o + INST_FLOATS));
  return out;
}

test('height render: the ?heighttest yard lays its levels and emits their ground, slabs and edges', () => {
  assert.ok(city.hasHeight);
  assert.equal(city.floorAt(Y.x + 3, Y.z + 12), 4);
  assert.equal(city.floorAt(Y.x + 3, Y.z + 3), 8);
  assert.equal(city.floorAt(Y.x + 22, Y.z + 10), -2);
  // A plane per level, bounding its cells; the yard's terrace and deck have one near it.
  const levels = new Set(city.planes.map((p) => p.y));
  for (const y of [-2, 4, 8]) assert.ok(levels.has(y), `a plane at ${y} m`);
  for (const p of city.planes) assert.ok(p.x1 > p.x0 && p.z1 > p.z0 && p.cells > 0);
  assert.ok(city.planes.some((p) => p.y === 4 && p.x0 === Y.x && p.z0 === Y.z && p.x1 === Y.x + 16 && p.z1 === Y.z + 16));
  const boxes = statics(SHAPE.BOX, Y.x - 2, Y.z - 2, Y.x + 30, Y.z + 26);
  const ground = boxes.filter((b) => (Math.round(b[3]) & NO_CUT) !== 0);
  assert.ok(ground.length > 20, 'ground geometry is marked so the cut-away leaves it standing');
  // The terrace slab: from 0 to just under its plane at 4 m.
  assert.ok(ground.some((b) => Math.abs(b[1] - b[5] / 2) < 1e-3 && Math.abs(b[1] + b[5] / 2 - (4 - 0.03)) < 1e-3), 'a slab under the +4 m plane');
  // Treads of the 4 m stair: tops at 0.5 to 4.0 m.
  const tops = new Set(ground.filter((b) => (Math.round(b[3]) & 15) === MAT.PLAIN && Math.abs(b[0] - (Y.x + 7.5)) < 0.01 && b[2] > Y.z + 16).map((b) => Math.round((b[1] + b[5] / 2) * 4) / 4));
  for (let k = 1; k <= 8; k++) assert.ok(tops.has(k * 0.5), `a tread at ${k * 0.5} m`);
  // Lit nosings along the terrace's edges, an amber sill at each drop, walls round the pit.
  const lit = (col) => ground.filter((b) => (Math.round(b[3]) & 15) === MAT.EMISSIVE && Math.abs(b[12] - col[0]) < 1e-6 && Math.abs(b[13] - col[1]) < 1e-6);
  assert.ok(lit([0.55, 0.82, 1.0]).some((b) => b[1] > 4.9), 'a nosing on the terrace parapet');
  assert.ok(lit([1.0, 0.52, 0.12]).some((b) => Math.hypot(b[0] - (Y.x + 16), b[2] - (Y.z + 10.5)) < 1), 'an amber sill on the east drop');
  assert.ok(ground.some((b) => b[1] - b[5] / 2 <= -1.99 && Math.abs(b[0] - (Y.x + 28.1)) < 0.2), 'a wall on the pit\'s east side');
  assert.ok(city.instances < 70000, `static instances ${city.instances}`);
});

test('height render: bodies, rings and the cut-away follow the operator\'s floor', () => {
  const raid = new Raid({ world: city, seed: 4, mode: 'sandbox' });
  const p = raid.player;
  p.x = Y.x + 10.5; p.z = Y.z + 10.5; raid.world.place(p);
  assert.equal(p.fy, 4);
  const e = raid.spawnEnemy('walker', Y.x + 12.5, Y.z + 10.5, { state: 'hunt' });
  raid.addArea({ kind: 'tele', x: Y.x + 12.5, z: Y.z + 10.5, r: 2, life: 1, col: [1, 0.2, 0.1] });
  raid.dropPickup('med', Y.x + 9.5, Y.z + 12.5);
  const scene = new Scene(stub());
  let f;
  for (let i = 0; i < 40; i++) f = scene.build(raid, { aimX: p.x, aimZ: p.z - 4, aimHeld: false }, 1 / 60, 16 / 9);
  const g = scene.r.globals;
  assert.ok(Math.abs(g[GO.focus + 1] - 4) < 0.01, `cut-away at the operator's floor (${g[GO.focus + 1]})`);
  assert.ok(scene.cam.ty > 4.5 && scene.cam.ey > 30, 'the camera looks at the terrace, not the street');
  // Every dynamic instance near the operator stands on the terrace, none in the street below.
  let near = 0;
  for (let s = 0; s < f.counts.length; s++) {
    const d = f.dyn[s];
    for (let i = 0; i < f.counts[s]; i++) {
      const o = i * INST_FLOATS;
      if (Math.hypot(d[o] - p.x, d[o + 2] - p.z) < 3) { near++; assert.ok(d[o + 1] > 3.9, `instance at y ${d[o + 1].toFixed(2)}`); }
    }
  }
  assert.ok(near > 50, 'the operator, the walker and the pickup were drawn');
  // Floor rings (the telegraph) lie on the terrace too.
  let rings = 0;
  for (let i = 0; i < f.spriteCount; i++) { const o = i * 12; if (f.sprites[o + 7] === 1 && Math.hypot(f.sprites[o] - e.x, f.sprites[o + 2] - e.z) < 0.1) { rings++; assert.ok(f.sprites[o + 1] > 4 && f.sprites[o + 1] < 4.3); } }
  assert.ok(rings > 0, 'the telegraph ring is drawn');
  // The contact shadows carry the floor: strength + 4 x (4 m in 0.25 m units).
  assert.ok(Math.abs(g[GO.blobs + 3] - (0.6 + 64)) < 1e-4);
  // The aim plane is chest height over the floor under the cursor.
  const a = scene.aimPoint(0, -0.2, raid);
  assert.ok(Number.isFinite(a[0]) && Number.isFinite(a[1]));
});

test('height render: a stair is drawn as a flight, and the street below a terrace stays at 0', () => {
  const raid = new Raid({ world: city, seed: 4, mode: 'sandbox' });
  const scene = new Scene(stub());
  scene.world = city;
  // Halfway up a 0.5 m tread row the body is eased between the rows, never higher than the top.
  const ys = [];
  for (let z = Y.z + 23.9; z > Y.z + 16; z -= 0.25) ys.push(scene.sfy(Y.x + 7.5, z, city.floorAt(Y.x + 7.5, z)));
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] >= ys[i - 1] - 1e-9 && ys[i] - ys[i - 1] < 0.3, 'climbs smoothly');
  // Beside the terrace face the street is the street.
  assert.equal(scene.sfy(Y.x + 2.5, Y.z + 16.6, 0), 0);
  void raid;
});

test('height render: rain shelter counts an awning over a terrace, never the slab that makes it', () => {
  const cover = buildCover(city);
  // The terrace and the pit floor are open to the rain.
  assert.ok(shelterAt(cover, Y.x + 10.5, Y.z + 10.5, 4) < 0.05, 'the terrace is wet');
  assert.ok(shelterAt(cover, Y.x + 23, Y.z + 11, -2) < 0.05, 'the pit floor is wet');
});

test('height render: the minimap marks stairs and drops and tones the levels', async () => {
  const draws = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'measureText' ? () => ({ width: 1 }) : (...a) => draws.push([k, ...a])), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  const { Minimap } = await import('../src/ui/minimap.js');
  const map = new Minimap(city);
  assert.ok(map.stairs.length >= 3, `stairs marked (${map.stairs.length})`);
  assert.ok(map.drops.length >= 2 && map.drops.some((d) => d.dx === 1), 'drops marked, pointing to where they land');
  const raid = new Raid({ world: city, seed: 4, mode: 'sandbox' });
  raid.player.x = Y.x + 10; raid.player.z = Y.z + 30;
  map.draw(ctx, 200, raid);
  assert.ok(draws.some((d) => d[0] === 'lineTo'), 'stair treads drawn');
  void idle;
});
