import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCover, shelterAt } from '../src/render/cover.js';
import { INST_FLOATS, MAT, SHAPE, SHAPE_COUNT } from '../src/sim/emit.js';
import { generateWorld } from '../src/sim/world.js';

// A 20 m world holding the given static instances: [shape, x, y, z, sx, sy, sz, mat, p0, yaw].
function tinyWorld(list) {
  const per = Array.from({ length: SHAPE_COUNT }, () => []);
  for (const [shape, x, y, z, sx, sy, sz, mat, p0 = 0, yaw = 0] of list) {
    const inst = new Array(INST_FLOATS).fill(0);
    inst.splice(0, 12, x, y, z, mat + 16, sx, sy, sz, 0, 0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
    inst[16] = p0;
    per[shape].push(...inst);
  }
  return { size: 20, shapes: per.map((d) => ({ data: new Float32Array(d) })) };
}

test('an awning keeps the ground and the wall below it dry, but not the wall above', () => {
  // A 1.4 m deep awning at 3 m along a wall facing +x at x = 5, turned like the generator's.
  const cover = buildCover(tinyWorld([
    [SHAPE.BOX, 2.5, 4, 10, 5, 8, 20, MAT.FACADE],
    [SHAPE.WEDGE, 5.72, 3.0, 10, 6, 0.5, 1.4, MAT.PLAIN, 5, Math.PI / 2],
  ]));
  assert.ok(shelterAt(cover, 5.7, 10) > 0.9, 'under the awning');
  assert.ok(shelterAt(cover, 5.35, 10, 2) > 0.6, 'shopfront below the awning (soft edge)');
  assert.equal(shelterAt(cover, 5.4, 10, 3.6), 0, 'wall above the awning');
  assert.equal(shelterAt(cover, 8, 10), 0, 'open pavement');
  assert.equal(shelterAt(cover, 5.7, 15), 0, 'beyond the end of the awning');
});

test('masses standing on the ground, signs and lamps give no shelter; grates and leaves only some', () => {
  const cover = buildCover(tinyWorld([
    [SHAPE.BOX, 4, 3, 4, 4, 6, 4, MAT.FACADE],
    [SHAPE.BOX, 12, 3, 4, 3, 1, 3, MAT.SIGN],
    [SHAPE.SPHERE, 4, 2.5, 14, 0.4, 0.4, 0.4, MAT.EMISSIVE],
    [SHAPE.BOX, 12, 3.2, 14, 3, 0.07, 1.2, MAT.PLAIN, 11],
    [SHAPE.SPHERE, 16, 5, 16, 3, 2.5, 3, MAT.FOLIAGE],
  ]));
  assert.equal(shelterAt(cover, 6.2, 4), 0);
  assert.equal(shelterAt(cover, 12, 4), 0);
  assert.equal(shelterAt(cover, 4, 14), 0);
  const grate = shelterAt(cover, 12, 14), crown = shelterAt(cover, 16, 16);
  assert.ok(grate > 0.2 && grate < 0.5, `grated landing ${grate}`);
  assert.ok(crown > 0.35 && crown < 0.75, `tree crown ${crown}`);
});

test('the district has dry ground under its viaduct and a few awnings, and is mostly open', () => {
  const w = generateWorld(1234), cover = buildCover(w), rz = w.net.railZ;
  let open = 0, n = 0;
  for (let z = 2; z < w.size; z += 7) for (let x = 2; x < w.size; x += 7) { if (w.cell(x, z) !== 0) continue; n++; if (shelterAt(cover, x, z) < 0.5) open++; }
  assert.ok(open / n > 0.7, `open street share ${open / n}`);
  let under = 0, free = 0;
  for (let x = 4; x < w.size - 4; x += 3) { if (w.cell(x, rz + 2) !== 0) continue; free++; if (shelterAt(cover, x, rz + 2) > 0.5) under++; }
  assert.ok(under / free > 0.8, `under the viaduct ${under / free}`);
});
