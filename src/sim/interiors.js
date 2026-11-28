// Street buildings and public vertical routes. Each walkable level has its own cells:
// stairs, lift landings, sills and tunnels all use the raid's normal height/occupancy map.
import { MAT, SUB, SURF, STYLE, boxMM, light } from './emit.js';
import { level, slope, dropCells, marks, HMARK } from './height.js';
import { lotFrame } from './scenes.js';

const stone = [0.19, 0.185, 0.175], steel = [0.105, 0.135, 0.15], tile = [0.31, 0.36, 0.36];
const brass = [0.45, 0.31, 0.17], amber = [1, 0.68, 0.32], ice = [0.46, 0.84, 0.92];

// Author in street coordinates, with the same bounds for collision and geometry.
function room(w, F) {
  const r = F.rect, at = (u, v) => { const [x, z] = F.pt(u, v); return { x, z }; };
  const panel = (u0, v0, u1, v1, lo, hi, mat = MAT.PLAIN, col = stone, ...params) =>
    boxMM(w, ...r(u0, v0, u1, v1), lo, hi, mat, col, ...params);
  const solid = (u0, v0, u1, v1, lo, hi, mat, col, sub = SUB.WALL, cell = 1) => {
    w.fillRect(...r(u0, v0, u1, v1), cell); panel(u0, v0, u1, v1, lo, hi, mat, col, 0, sub);
  };
  const floor = (u0, v0, u1, v1, y) => level(w, ...r(u0, v0, u1, v1), y);
  const stair = (u0, v0, u1, v1, y0, y1) => slope(w, ...r(u0, v0, u1, v1), F.inward, y0, y1);
  const sill = (u0, v0, u1, v1) => dropCells(w, ...r(u0, v0, u1, v1));
  const lamp = (u, v, y, col, reach) => { const [x, z] = F.pt(u, v); light(w, x, y, z, col, reach, 1.6); };
  return { at, panel, solid, floor, stair, sill, lamp };
}

// Two faces of one shaft. A held interaction transfers only the operator; paths for
// walkers and route previews continue to use the adjacent public stair in both directions.
function lift(w, F, u, v, y, addPoi) {
  const { at, panel, solid } = room(w, F);
  const stops = [at(u + 1.5, v - 1.6), at(u + 1.5, v + 1.6)];
  if (stops.some(p => w.zoneAt(p.x, p.z) === 0)) return; // The Shelter has no raid interactions.
  solid(u, v - 1, u + 3, v + 1, 0, y + 2.8, MAT.PLAIN, steel, SUB.METAL);
  for (let i = 0; i < 2; i++) {
    const z = i ? v + 1 : v - 1.09, h = i * y, p = stops[i];
    panel(u + 0.28, z, u + 2.72, z + 0.09, h, h + 2.4, MAT.GLOSS, steel);
    panel(u + 1.46, z - 0.01, u + 1.54, z + 0.1, h, h + 2.4, MAT.PLAIN, brass);
    panel(u + 0.28, z - 0.02, u + 2.72, z + 0.11, h + 2.4, h + 2.53, MAT.EMISSIVE, ice, 2.5);
    addPoi(w, 'lift', p.x, p.z, { up: !i, to: stops[1 - i] });
  }
}

// Replace a blind street facade with an open shop or workshop. The taller half sits
// behind the sales floor; a separate stair aisle leaves a clear approach to the counter.
export function streetInterior(w, rng, foot, sides, h, col, style, K) {
  const choices = sides.map(s => lotFrame(...foot, s)).filter(F => F.W >= 7 && F.D >= 12);
  // Prefer a full stair and a deep landing; reject a frontage that looks across a party wall.
  choices.sort((a, b) => Math.min(b.D, 23) - Math.min(a.D, 23));
  const F = choices.find(f => {
    const u = Math.floor(f.W / 2);
    return [0.5, 1.5].every(d => w.isFree(...f.pt(u, -d)) && w.floorAt(...f.pt(u, -d)) === 0);
  });
  if (!F) return null;
  const { W, D, rect } = F, { at, panel, solid, floor, stair, lamp, sill } = room(w, F);
  const c = Math.floor(W / 2), tall = h >= 35 && D >= 22 && W >= 12;
  const y = tall ? 6 : Math.min(3.5, (D - 7) / 2), back = Math.max(3 + y * 2, Math.floor(D * 0.56));
  const ceiling = y + 3, warm = style === STYLE.OLDTOWN || style === STYLE.DOCK;
  const workshop = style === STYLE.DOCK, accent = warm ? amber : ice;
  w.paint(...foot, SURF.FLOOR);
  solid(0, 0, c - 1, 1, 0, ceiling, MAT.PLAIN, col);
  solid(c + 2, 0, W, 1, 0, ceiling, MAT.PLAIN, col);
  solid(0, 1, 1, D, 0, ceiling, MAT.PLAIN, col); solid(W - 1, 1, W, D, 0, ceiling, MAT.PLAIN, col);
  solid(1, D - 1, W - 1, D, 0, ceiling, MAT.PLAIN, col);
  panel(c - 1, 0, c + 2, 1, 3, ceiling, MAT.PLAIN, col);
  panel(c - 1.35, -0.12, c + 2.35, 0.2, 2.85, 3, MAT.EMISSIVE, accent, 2.3);
  panel(0, 0, W, D, ceiling, Math.max(h, ceiling + 0.35), MAT.FACADE, col, 1, rng.float() * 997, 0.38, 2.8, rng.int(8));
  K.addRoof(w, rng, ...foot, Math.max(h, ceiling + 0.35));
  floor(1, back, W - 1, D - 1, y); stair(1, back - 2 * y, 4, back, 0, y);
  const dropU = tall ? W - 8 : W - 4;
  sill(dropU, back, dropU + 3, back + 1);
  // A porcelain counter or tool bench and a searchable cabinet up on the gallery.
  panel(W - 2, 2, W - 1, Math.min(back - 1, 6), 0, 0.96, MAT.PLAIN, workshop ? steel : stone, 0, workshop ? SUB.METAL : SUB.TILE);
  w.fillRect(...rect(W - 2, 2, W - 1, Math.min(back - 1, 6)), 2);
  const bin = at(1.5, D - 1.5);
  w.addContainer(bin.x, bin.z, workshop ? 'crate' : warm ? 'tin' : 'locker', true, { yaw: F.yawIn });
  // Recessed display bays in the rear wall leave the landing clear for a fight.
  for (let u = 4; u + 3 < W - 1; u += 6) {
    panel(u, D - 1.09, u + 3, D - 0.98, y, y + 1.9, MAT.PLAIN, workshop ? steel : stone, 0, workshop ? SUB.METAL : SUB.TIMBER);
    panel(u + 0.1, D - 1.16, u + 2.9, D - 1, y + 1.45, y + 1.54, MAT.PLAIN, steel);
    for (const a of [u + 0.4, u + 1.6]) panel(a, D - 1.15, a + 0.76, D - 1.09, y + 1.54, y + 1.92, MAT.PLAIN, workshop ? brass : tile, 0, workshop ? SUB.METAL : SUB.FABRIC);
  }
  panel(1.15, D - 1.15, W - 1.15, D - 1, y + 1.65, y + 1.8, MAT.EMISSIVE, accent, 1.6);
  lamp(c, 2, 2.9, accent, 10); lamp(c, D - 2, y + 2.4, accent, 11);
  if (tall) lift(w, F, W - 5, back, y, K.addPoi);
  const entry = at(c + 0.5, 0.5), front = rng.fork('front');
  K.addSigns(w, front, ...foot, h, style, [F.s]);
  // Display bays stay in the wall line: an alley or a doorway across it is someone else's route.
  for (let u = 1; u + 2 < W; u += 4) {
    if (u < c + 2 && u + 2 > c - 1) continue;
    panel(u, -0.08, u + 2, 0.02, 0.86, 2.6, MAT.PLAIN, steel, 0, SUB.METAL);
    panel(u + 0.09, -0.1, u + 1.91, -0.08, 1, 2.45, MAT.GLOSS, col);
    panel(u + 0.08, -0.11, u + 1.92, -0.09, 2.39, 2.45, MAT.EMISSIVE, accent, 1.4);
  }
  return { kind: workshop ? 'workshop' : 'shopGallery', foot, entry, upper: at(2.5, back + 1.5) };
}

export function hotelTowers(w, rng, L, K) {
  const lot = lotFrame(L.x0, L.z0, L.x1, L.z1, L.side), tw = 14, gap = 8;
  const left = Math.floor((lot.W - 2 * tw - gap) / 2), front = 2, bridgeV = 31;
  w.paint(...lot.rect(0, 0, lot.W, lot.D), SURF.PLAZA);
  const towers = [];
  for (let n = 0; n < 2; n++) {
    const offset = left + n * (tw + gap), foot = lot.rect(offset, front, offset + tw, front + 36);
    const frame = lotFrame(...foot, L.side);
    // Mirror one wing so both stairs and both lounge doors face the service court.
    const F = n ? frame : { ...frame, pt: (u, v) => frame.pt(tw - u, v), rect: (a, b, c, d) => frame.rect(tw - c, b, tw - a, d) };
    const { at, panel, solid, floor, stair, sill, lamp } = room(w, F);
    const h = n ? 54 : 72, upper = 12, ceiling = upper + 3.6, facade = n ? [0.095, 0.125, 0.14] : [0.13, 0.145, 0.16];
    const wall = (u0, v0, u1, v1) => solid(u0, v0, u1, v1, 0, ceiling, MAT.PLAIN, facade);
    w.paint(...foot, SURF.FLOOR);
    wall(0, 0, 5, 1); wall(9, 0, tw, 1); panel(5, 0, 9, 1, 3.6, ceiling, MAT.PLAIN, facade);
    for (const u of [0, tw - 1]) {
      if (u === 0) {
        wall(u, 1, u + 1, 14); floor(u, 14, u + 1, 17, 6);
        wall(u, 17, u + 1, bridgeV); floor(u, bridgeV, u + 1, bridgeV + 4, upper);
        wall(u, bridgeV + 4, u + 1, 36);
      } else wall(u, 1, u + 1, 36);
    }
    wall(1, 35, 6, 36); wall(10, 35, tw - 1, 36);
    // A lit street portico and a setback crown over the public floors.
    panel(3, -1.5, 11, 1, 3.55, 3.8, MAT.PLAIN, brass, 0, SUB.METAL);
    panel(3, -1.52, 11, -1.48, 3.56, 3.66, MAT.EMISSIVE, amber, 2.1);
    panel(0, 0, tw, 36, ceiling, ceiling + 2.5, MAT.FACADE, facade, 1, 73 + n, 0.4, 3, 3);
    panel(1, 2, tw - 1, 34, ceiling + 2.5, h, MAT.FACADE, facade, 1, 83 + n, 0.55, 2.6, 3);
    K.addRoof(w, rng, ...F.rect(1, 2, tw - 1, 34), h);
    for (const u of [1, tw - 1.18]) panel(u, 1.94, u + 0.18, 2.05, ceiling + 2.5, h, MAT.EMISSIVE, ice, 1.8);
    // Two public flights, a half landing overlooking reception, then the sky lounge.
    stair(1, 2, 4, 14, 0, 6); floor(1, 14, 7, 17, 6); stair(1, 17, 4, 29, 6, upper);
    floor(1, 29, tw - 1, 35, upper); floor(6, 35, 10, 36, upper);
    lift(w, F, 9, 29, upper, K.addPoi);
    // Brass inlays lead from the portico past reception to the two-faced lift shaft.
    for (const u of [6.1, 8.8]) panel(u, 1, u + 0.07, 27, 0.009, 0.025, MAT.PLAIN, brass, 0, SUB.METAL);
    solid(9, 8, 12, 9, 0, 1.1, MAT.PLAIN, stone, SUB.TILE, 2);
    panel(8.9, 7.9, 12.1, 9.1, 1.1, 1.18, MAT.GLOSS, brass);
    panel(2.15, 34.90, 4.85, 35.01, upper + 1.25, upper + 2.15, MAT.SIGN, amber, 1.2, rng.float());
    solid(2, 34, 5, 35, upper, upper + 0.5, MAT.PLAIN, brass, SUB.FABRIC, 2);
    panel(2, 34.7, 5, 35, upper + 0.5, upper + 0.94, MAT.PLAIN, brass, 0, SUB.FABRIC);
    lamp(7, 6, 3.5, amber, 14); lamp(5, 32, upper + 3, ice, 14);
    // A recessed escape balcony onto a lower service roof, then onto the rear apron.
    sill(6, 35, 10, 36); floor(5, 36, 11, 40, 6); sill(6, 39, 10, 40);
    for (const u of [5, 10.9]) panel(u, 36, u + 0.1, 40, 6, 7, MAT.PLAIN, steel, 0, SUB.BARS);
    const tower = { kind: 'hotel', foot, entry: at(7, 0.5), upper: at(5.5, 32.5),
      escape: at(8, 34.5), roof: at(8, 37.5), street: at(8, 42), stairFoot: at(2.5, 1.5) };
    towers.push(tower); w.buildings.push(tower);
  }
  const bridges = [hotelSpan(w, lot, left + tw, front + 14, gap, 3, 6),
    hotelSpan(w, lot, left + tw, front + bridgeV, gap, 4, 12)];
  K.addPoi(w, 'scene', towers[0].entry.x, towers[0].entry.z, { name: 'Tideglass Hotel' });
  return { kind: 'hotel', ...towers[0].entry, towers, bridges };
}

function hotelSpan(w, lot, u, v, gap, width, y) {
  // The bridge crosses a fenced cooling plant, not a public street. Keep air below
  // the deck and put visible plant enclosures at the two non-walkable ground edges.
  const { panel, floor, solid, at } = room(w, lot);
  const span = lot.rect(u, v, u + gap, v + width); floor(u, v, u + gap, v + width, y);
  w.paint(...span, SURF.FLOOR);
  const M = marks(w);
  for (let z = span[1]; z < span[3]; z++) M.fill(HMARK.DECK, z * w.size + span[0], z * w.size + span[2]);
  panel(u, v, u + gap, v + width, y - 0.45, y - 0.03, MAT.PLAIN, steel, 0, SUB.METAL);
  for (const side of [v, v + width]) {
    const edge = side === v ? side - 1 : side;
    solid(u, edge, u + gap, edge + 1, 0, 2.7, MAT.PLAIN, steel, SUB.CORRUGATED, 2);
    panel(u, side - 0.05, u + gap, side + 0.05, y, y + 1.12, MAT.PLAIN, steel, 0, SUB.BARS);
    panel(u, side - 0.07, u + gap, side + 0.07, y + 1.12, y + 1.2, MAT.EMISSIVE, ice, 1.6);
    for (let a = u + 1; a < u + gap; a += 3) panel(a, side - 0.08, a + 0.12, side + 0.08, y, y + 3, MAT.PLAIN, steel);
  }
  panel(u, v - 0.2, u + gap, v + width + 0.2, y + 3, y + 3.22, MAT.PLAIN, steel, 0, SUB.METAL);
  return at(u + gap / 2, v + width / 2);
}

// A station platform or an inspection conduit. The two flights run side by side into
// the lot and meet through a covered cross passage. The roofs are cut away by the
// normal tactical camera; feet, sight lines and loot all remain on the basement grid.
export function underpass(w, rng, L, K) {
  const F = lotFrame(L.x0, L.z0, L.x1, L.z1, L.side), station = L.kind === 'subway';
  const { at, panel, floor, stair, solid, lamp } = room(w, F), D = Math.min(F.D - 3, station ? 32 : 24);
  const W = Math.min(F.W - 4, station ? 42 : 27), start = Math.floor((F.W - W) / 2), end = start + W;
  const depth = station ? 4.5 : 3.5, flights = depth * 2, aisle = station ? 6 : 4, join = D - aisle;
  const accent = station ? ice : amber, cladding = station ? tile : steel;
  w.paint(...F.rect(0, 0, F.W, F.D), SURF.PLAZA);
  const mouths = [], landings = [];
  for (const a of [start, end - aisle]) {
    const mid = a + aisle / 2;
    w.paint(...F.rect(a, 2, a + aisle, D), SURF.FLOOR);
    stair(a, 2, a + aisle, 2 + flights, 0, -depth);
    floor(a, 2 + flights, a + aisle, D, -depth);
    // Street mouth: tiled cheeks, a light box and canopy; keep the full stair width free.
    for (const p of [a - 1, a + aisle]) {
      solid(p, 1, p + 1, join, 0, 1.05, MAT.PLAIN, cladding, station ? SUB.TILE : SUB.METAL);
      panel(p + 0.22, 1.1, p + 0.78, 1.6, 1.05, 3.4, MAT.PLAIN, steel);
    }
    panel(a - 1, 1, a + aisle + 1, 3.6, 3.4, 3.65, MAT.PLAIN, steel, 0, SUB.METAL);
    panel(a - 0.55, 0.89, a + aisle + 0.55, 1.02, 2.9, 3.42, MAT.SIGN, accent, 2.2, rng.float(), 1);
    // A curb-height line map remains visible when the overhead canopy cuts away.
    panel(a - 0.9, 1.05, a - 0.14, 1.18, 1.05, 2.25, MAT.ENAMEL, steel);
    panel(a - 0.58, 1.02, a - 0.5, 1.06, 1.25, 2.05, MAT.EMISSIVE, accent, 1.7);
    for (const y of [1.35, 1.65, 1.95]) panel(a - 0.66, 1, a - 0.43, 1.04, y, y + 0.08, MAT.EMISSIVE, accent, 2.0);
    panel(a, 2 + flights, a + aisle, join, 0.25, 0.55, MAT.PLAIN, cladding, 0, SUB.METAL);
    panel(a + 0.25, 2 + flights, a + 0.45, join, -1, -0.92, MAT.EMISSIVE, accent, 1.8);
    lamp(mid, 2, 2.7, accent, 12); lamp(mid, join - 2, -depth + 2.4, accent, 11);
    mouths.push(at(mid, 0.5)); landings.push(at(mid, join + aisle / 2));
  }
  floor(start, join, end, D, -depth); w.paint(...F.rect(start, join, end, D), SURF.FLOOR);
  panel(start, join, end, D, 0.25, 0.55, MAT.PLAIN, cladding, 0, SUB.METAL);
  // The cross passage also has a physical perimeter at street level: no invisible lip.
  for (const [a, b, c, d] of [[start - 1, join, start, D], [end, join, end + 1, D], [start - 1, D, end + 1, D + 1], [start + aisle, join - 1, end - aisle, join]]) {
    solid(a, b, c, d, 0, 1.05, MAT.PLAIN, cladding, SUB.WALL);
  }
  for (let u = start + 2; u < end - 1; u += station ? 5 : 4) {
    if (station) {
      // Enamel route boards in repeated bays and a continuous platform edge stripe.
      for (const s of [-1, 1]) {
        const a = u + (s < 0 ? -1.2 : 0.05);
        panel(a, D - 0.19, a + 1.15, D - 0.1, -depth, -depth + 2.55, MAT.ENAMEL, cladding);
        panel(a + 0.08, D - 0.23, a + 1.07, D - 0.18, -depth + 0.92, -depth + 2.3, MAT.GLOSS, steel);
      }
      panel(u - 1.2, D - 0.24, u + 1.2, D - 0.2, -depth + 2.57, -depth + 2.64, MAT.EMISSIVE, ice, 1.8);
      panel(u, D - 0.6, u + 0.2, D - 0.08, -depth, 0.26, MAT.PLAIN, steel, 0, SUB.METAL);
    } else {
      panel(u, D - 0.48, u + 0.18, D - 0.1, -depth + 1.3, -depth + 2.4, MAT.PLAIN, brass, 0, SUB.METAL);
    }
  }
  if (station) {
    // Sealed platform screen doors on the track side, with the public aisle to their front.
    panel(start, D - 0.15, end, D, -depth, -depth + 2.6, MAT.GLOSS, steel);
    panel(start, D - 1.2, end, D - 1, -depth + 0.01, -depth + 0.03, MAT.PLAIN, brass, 0, SUB.HAZARD);
  } else {
    for (const dy of [1.5, 1.95]) panel(start, D - 0.42, end, D - 0.15, -depth + dy, -depth + dy + 0.23, MAT.PLAIN, steel, 0, SUB.METAL);
    panel(start, D - 1.2, end, D - 0.65, -depth + 0.01, -depth + 0.05, MAT.PLAIN, steel, 0, SUB.BARS, 3);
  }
  const mid = Math.floor((start + end) / 2);
  lamp(mid, D - 2, -depth + 2.6, accent, 12);
  const bin = at(mid + 0.5, join + 0.5); w.addContainer(bin.x, bin.z, station ? 'basket' : 'crate', true);
  K.addPoi(w, 'scene', mouths[0].x, mouths[0].z, { name: station ? 'Siltline Station' : 'Overflow Conduit' });
  return { kind: L.kind, ...mouths[0], mouths, landings, depth, passage: at(mid, join + aisle / 2) };
}
