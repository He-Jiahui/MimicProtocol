// Field pack grid (docs 61, 64 package 4). Pure helpers, no raid or RNG. A pack is
// {w, h, kg}; a carried piece keeps its place as `at = {x, y, r}`, r = 1 when turned a
// quarter. Turning buys a different fit, never extra cells.

import { SEALED, SELLABLES, MEDKIT, OTHER_CARGO, CARRY_FREE_KG, CARRY_SLOW_PER_KG, CARRY_MIN_SPEED, FOLDED_PACK } from './data.js';

const SELL = new Map(SELLABLES.map((s) => [s.name, s]));
const LOOSE = { w: 1, h: 1, kg: 0.5 };

// Footprint and weight. Every piece of equipment is a sealed 2 by 2 parcel; a spare pack folds flat.
export function footprint(it) {
  if (it.kind === 'gear') return SEALED;
  if (it.kind === 'med') return MEDKIT;
  if (it.kind === 'pack') return { ...FOLDED_PACK, kg: it.kg };
  return SELL.get(it.name) || OTHER_CARGO[it.name] || LOOSE;
}
export const weight = (it) => footprint(it).kg;
export function dims(it, r = 0) { const f = footprint(it); return r ? [f.h, f.w] : [f.w, f.h]; }

// Cells taken by every placed piece except `skip`.
export function occupancy(pack, items, skip = null) {
  const g = new Uint8Array(pack.w * pack.h);
  for (const it of items) if (it !== skip && it.at) mark(pack, g, it, it.at);
  return g;
}
export function mark(pack, g, it, at) {
  const [w, h] = dims(it, at.r);
  for (let y = at.y; y < at.y + h; y++) for (let x = at.x; x < at.x + w; x++) g[y * pack.w + x] = 1;
}
export function fitsAt(pack, g, it, x, y, r = 0) {
  const [w, h] = dims(it, r);
  if (x < 0 || y < 0 || x + w > pack.w || y + h > pack.h) return false;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy * pack.w + xx]) return false;
  return true;
}
// First free place, row by row, upright before turned.
export function findSpot(pack, g, it) {
  for (const r of [0, 1]) for (let y = 0; y < pack.h; y++) for (let x = 0; x < pack.w; x++) if (fitsAt(pack, g, it, x, y, r)) return { x, y, r };
  return null;
}

// Where several incoming pieces would go, in the given order, without moving what is packed.
export function planFit(pack, items, incoming) {
  const g = occupancy(pack, items);
  return incoming.map((it) => {
    const at = findSpot(pack, g, it);
    if (at) mark(pack, g, it, at);
    return { item: it, at };
  });
}

// Pack loose pieces into an empty bay in any order and turn (a drone bay is a few cells, so
// a full search is cheap). Returns one place per piece, or null when they cannot all fit.
export function packAll(w, h, pieces) {
  const bay = { w, h }, g = new Uint8Array(w * h), out = new Array(pieces.length);
  let area = 0;
  for (const it of pieces) { const [a, b] = dims(it); area += a * b; }
  if (area > w * h) return null;
  const order = pieces.map((it, i) => i).sort((a, b) => { const [aw, ah] = dims(pieces[a]), [bw, bh] = dims(pieces[b]); return bw * bh - aw * ah; });
  const place = (k) => {
    if (k === order.length) return true;
    const it = pieces[order[k]];
    for (const r of [0, 1]) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!fitsAt(bay, g, it, x, y, r)) continue;
      const at = { x, y, r };
      mark(bay, g, it, at);
      out[order[k]] = at;
      if (place(k + 1)) return true;
      const [pw, ph] = dims(it, r);
      for (let yy = y; yy < y + ph; yy++) for (let xx = x; xx < x + pw; xx++) g[yy * w + xx] = 0;
    }
    return false;
  };
  return place(0) ? out : null;
}

// Everything carried counts, the bag itself and ready supplies included (doc 61).
export function loadKg(pack, items, pockets = []) {
  let kg = pack.kg || 0;
  for (const it of items) kg += weight(it);
  for (const it of pockets) if (it) kg += weight(it);
  return Math.round(kg * 100) / 100;
}
// 10 kg ride free, then 2.5% slower a kilogram, never below 75% of base speed (doc 64, start).
export const speedMul = (kg) => Math.max(CARRY_MIN_SPEED, 1 - CARRY_SLOW_PER_KG * Math.max(0, kg - CARRY_FREE_KG));
