// The minimap and full map draw on a 2D canvas; here a recording stub stands in for
// it, so the door ticks and the route line are checked without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid } from '../src/sim/raid.js';
import { routeTargets, setRoute } from '../src/sim/route.js';

// A context that records every stroke with the style it was drawn in.
function recorder() {
  const strokes = [];
  const ctx = new Proxy({ strokes, path: [] }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'moveTo' || key === 'lineTo') return (x, y) => { assert.ok(Number.isFinite(x) && Number.isFinite(y)); target.path.push([x, y]); };
      if (key === 'beginPath') return () => { target.path = []; };
      if (key === 'stroke') return () => strokes.push({ style: target.strokeStyle, points: target.path.slice() });
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return ctx;
}
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => recorder() }) };
const { Minimap } = await import('../src/ui/minimap.js');
const city = generateWorld(20261125);

test('minimap: seen doors are ticked in their state colour, and the route line is drawn whole', () => {
  const raid = new Raid({ world: city, seed: 5, mode: 'sandbox' }), map = new Minimap(city);
  for (const st of raid.doors.slice(0, 12)) st.seen = true;
  raid.doors[0].state = 'open';
  setRoute(raid, routeTargets(raid).find((o) => o.kind === 'extract'));
  for (const full of [false, true]) {
    const ctx = recorder();
    if (full) map.drawFull(ctx, 640, raid); else map.draw(ctx, 208, raid);
    const route = ctx.strokes.filter((s) => s.style === '#4ff2d8');
    assert.equal(route.length, 1, 'one teal route line');
    if (full) assert.equal(route[0].points.length, raid.route.result.path.length, 'every turn of it on the full map');
    if (full) assert.ok(ctx.strokes.some((s) => s.style === '#3f9f62') && ctx.strokes.filter((s) => s.style !== '#4ff2d8' && s.style !== '#000' && s.style !== 'rgba(0,0,0,0.7)').length >= 12, 'door ticks');
  }
  setRoute(raid, null);
  const ctx = recorder();
  map.drawFull(ctx, 640, raid);
  assert.equal(ctx.strokes.filter((s) => s.style === '#4ff2d8').length, 0, 'no line once dismissed');
});
