import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bodyClass, firstSurface, shopHash, surfaceClass } from '../src/render/impacts.js';
import { INST_FLOATS, MAT, SHAPE, SHAPE_COUNT, SUB } from '../src/sim/emit.js';

// One block of 20 m holding boxes: [x, y, z, sx, sy, sz, mat, p0, emis].
function block(list) {
  const data = [];
  for (const [x, y, z, sx, sy, sz, mat, p0 = 0, emis = 0] of list) {
    const inst = new Array(INST_FLOATS).fill(0);
    inst.splice(0, 12, x, y, z, mat + 16, sx, sy, sz, emis, 0, 0, 0, 1);
    inst[16] = p0;
    data.push(...inst);
  }
  const shapes = Array.from({ length: SHAPE_COUNT }, (_, s) => ({ data: new Float32Array(s === SHAPE.BOX ? data : []), range: new Uint32Array(s === SHAPE.BOX ? [0, list.length] : [0, 0]) }));
  return { n: 1, size: 20, shapes };
}

test('a round finds the first face in its path and what it is made of', () => {
  const w = block([
    [4, 2, 10, 2, 4, 6, MAT.PLAIN, SUB.WALL],             // plaster wall, face at x = 5
    [5.05, 1.2, 12, 0.06, 2.2, 1.0, MAT.PLAIN, SUB.METAL], // steel door just proud of it
    [5.05, 1.5, 8, 0.06, 1.0, 0.8, MAT.SIGN, 0, 0.4],      // paper poster
    [12, 1.18, 10, 1.6, 0.52, 2.2, MAT.GLOSS],             // a car's glass cabin
  ]);
  const at = (z, from = 7) => { const h = firstSurface(w, from, 1.3, z, -1, 0, 0, 3); return h && surfaceClass(h, from - h.t, 1.3, z); };
  assert.equal(at(10), 'masonry');
  assert.equal(at(12), 'metal');
  assert.equal(at(8), 'soft');
  const h = firstSurface(w, 7, 1.3, 12, -1, 0, 0, 3);
  assert.ok(Math.abs(h.t - (7 - 5.08)) < 1e-4 && h.nx > 0.99, 'face position and outward normal');
  const car = firstSurface(w, 15, 1.3, 10, -1, 0, 0, 5);
  assert.equal(surfaceClass(car, 15 - car.t, 1.3, 10), 'glass');
  assert.equal(firstSurface(w, 7, 3.5, 12, -1, 0, 0, 1.5), null, 'above the door, short of the wall');
});

test('the open-shop hash is an integer function the shader can match exactly', () => {
  const v = shopHash(127, 0, 894.391, 20);
  assert.equal(v, shopHash(127, 0, Math.fround(894.391), 20));
  assert.ok(v >= 0 && v < 1);
  let open = 0;
  for (let c = 0; c < 2000; c++) if (shopHash(c, 0, 12.5, 20) >= 0.35) open++;
  assert.ok(open > 1200 && open < 1400, `about two thirds of shops open: ${open}`);
});

test('plates and shells face forward; a disguise bleeds like a person', () => {
  assert.equal(bodyClass('brute', 0, 1, 0, false), 'plate');
  assert.equal(bodyClass('brute', 0, -1, 0, false), 'flesh');
  assert.equal(bodyClass('skitter', 0, -1, 0, false), 'chitin');
  assert.equal(bodyClass('walker', 0, 1, 0, false), 'flesh');
  assert.equal(bodyClass('skitter', 0, 1, 0, true), 'flesh');
});
