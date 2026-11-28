// Smooth ramps in the renderer (doc 64 Package 8): one sloping slab per ramp laid over the
// stepped treads, and the treads lowered under it in the copy sent to the GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, INST_FLOATS, SHAPE } from '../src/sim/world.js';
import { HMARK, FLOOR_UNIT } from '../src/sim/height.js';
import { rampSlabs, lowerRampTreads, RAMP_SLAB } from '../src/render/ramps.js';

const city = generateWorld(20261125);
const U = FLOOR_UNIT;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const qrot = (q, v) => { const t = cross(q, v).map((x, i) => x + q[3] * v[i]); const c = cross(q, t); return v.map((x, i) => x + 2 * c[i]); };
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];

function rampCells() {
  const out = [];
  for (let z = 0; z < city.size; z++) for (let x = 0; x < city.size; x++) if (city.hmark[z * city.size + x] === HMARK.RAMP) out.push([x, z]);
  return out;
}

test('ramps: every ramp cell lies under one slab whose top passes through its floor at the centre', () => {
  const cells = rampCells(), slabs = rampSlabs(city);
  assert.ok(cells.length > 0, 'the city has ramps');
  assert.ok(slabs.length > 0 && slabs.length < cells.length, 'cells merge into whole ramps');
  for (const [x, z] of cells) {
    const p = [x + 0.5, 0, z + 0.5];
    const hit = slabs.filter((s) => {
      const l = qrot(conj(s[3]), [p[0] - s[0], 0, p[2] - s[2]]);
      return Math.abs(l[0]) <= s[4] / 2 && Math.abs(l[2]) <= s[5] / 2 + 0.05;
    });
    assert.equal(hit.length, 1, `one slab over the ramp cell ${x},${z}`);
    const s = hit[0], N = qrot(s[3], [0, 1, 0]), top = [0, 1, 2].map((i) => s[i] + N[i] * RAMP_SLAB.sy / 2);
    const y = top[1] - (N[0] * (p[0] - top[0]) + N[2] * (p[2] - top[2])) / N[1];
    assert.ok(Math.abs(y - city.fl(x, z) * U) < 1e-3, `slab top ${y.toFixed(3)} at the floor of ${x},${z}`);
  }
});

test('ramps: treads drop half a unit under the slab, nothing else moves', () => {
  const d = city.shapes[SHAPE.BOX].data, low = lowerRampTreads(city, d);
  assert.notEqual(low, d, 'a copy, the world keeps its own data');
  let moved = 0;
  for (let o = 0; o < d.length; o += INST_FLOATS) {
    const same = [0, 1, 2, 3, 4, 5, 6].every((k) => low[o + k] === d[o + k]);
    if (same) continue;
    moved++;
    const x = Math.floor(d[o]), z = Math.floor(d[o + 2]);
    assert.equal(city.hmark[z * city.size + x], HMARK.RAMP);
    assert.ok(Math.abs(low[o + 1] + low[o + 5] / 2 - (city.fl(x, z) * U - U / 2)) < 1e-4);
    assert.ok(Math.abs(low[o + 1] - low[o + 5] / 2 - (d[o + 1] - d[o + 5] / 2)) < 1e-4, 'its foot stays put');
  }
  assert.ok(moved >= rampCells().length / 4);
});
