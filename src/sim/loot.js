// Gear and run-item generation (docs 18, 19, 23). Pure functions of an Rng.

import {
  ITEMS, ITEM_IDS, itemRarityWeights, SLOTS, SLOT_WEIGHTS, SLOT_BASE, GEAR_AFFIXES, GEAR_AFFIX_IDS, AFFIX_COUNT,
  GEAR_NAMES, GEAR_PREFIX, DROP_TABLES, RARITY, TIERS, SELLABLES, gearRating, ASPECTS, ASPECT_IDS,
} from './data.js';

let uidCounter = 0;
const uid = (rng) => `g${(rng.int(0x7fffffff)).toString(36)}${(uidCounter++).toString(36)}`;

export function affixRange(k, ilvl) {
  const a = GEAR_AFFIXES[k], s = Math.sqrt(ilvl / 10);
  return [a.lo * s, a.hi * s];
}

export function rollAffix(rng, k, ilvl, prime = false) {
  const [lo, hi] = affixRange(k, ilvl);
  // Values roll between 70% and 100% of the range; Prime rolls sit in the top 10% (doc 23).
  const f = prime ? rng.range(0.9, 1) : rng.range(0.7, 1);
  const v = lo + (hi - lo) * ((f - 0.7) / 0.3);
  return { k, v: Math.round(v * 10) / 10 };
}

// source: 'container' | 'mimic' | 'elite' | 'boss'
export function rollGear(rng, { tier = 1, zone = 1, nl = 0, source = 'container', slot = null, rarity = null, boss = false } = {}) {
  const ilvl = 10 * tier + 2 * zone + Math.floor(5 * nl) + (boss ? 3 : 0);
  if (rarity === null) {
    const w = DROP_TABLES[source].slice();
    const rare = TIERS[tier].rare;
    for (let i = 2; i < w.length; i++) w[i] *= rare;
    rarity = rng.weighted(w);
    // Bosses roll Legendary separately (doc 23, section 3).
    if (boss && rng.chance(0.06 * rare)) rarity = 4;
  }
  if (!slot) slot = SLOTS[rng.weighted(SLOT_WEIGHTS)];
  const prime = rng.chance(boss ? 0.08 : 0.04);
  const pool = rng.shuffle(GEAR_AFFIX_IDS.slice());
  const affixes = [];
  for (let i = 0; i < AFFIX_COUNT[rarity]; i++) affixes.push(rollAffix(rng, pool[i], ilvl, prime));
  // Rare and better gear carries one Aspect for its slot (doc 24).
  const aspect = rarity >= 2 ? rng.pick(ASPECT_IDS.filter((id) => ASPECTS[id].slot === slot)) : null;
  const item = {
    uid: uid(rng), kind: 'gear', slot, rarity, ilvl, affixes, enh: 0, prime,
    name: `${GEAR_PREFIX[rarity]} ${rng.pick(GEAR_NAMES[slot])}`,
    // Gear from containers is identified and clean; Mimic, nest and boss gear is not.
    aspect,
    unid: source !== 'container',
  };
  item.value = gearValue(item);
  return item;
}

export function gearValue(item) {
  return Math.round((item.aspect ? 1.2 : 1) * item.ilvl * (3 + item.rarity * 5) * RARITY[item.rarity].q * (1 + 0.15 * (item.enh || 0)) * (item.prime ? 1.5 : 1));
}

export function starterItem(slot) {
  return { uid: `starter-${slot}`, kind: 'gear', slot, rarity: 0, ilvl: 10, affixes: [], enh: 0, prime: false, name: `Issue ${GEAR_NAMES[slot][0]}`, unid: false, value: 10, starter: true };
}

// Aggregate the stats of the four equipped items into percentages.
export function gearStats(equipped) {
  const s = { dmg: 0, hp: 0, skill: 0, credits: 0, aspd: 0, crit: 0, dr: 0, cdr: 0, move: 0, regen: 0, dot: 0, summon: 0, charge: 0, cgain: 0, spend: 0, rating: 0, aspects: [] };
  for (const slot of SLOTS) {
    const it = equipped && equipped[slot];
    if (!it) continue;
    const base = SLOT_BASE[slot];
    s[base.k] += it.ilvl * base.per * RARITY[it.rarity].q * (1 + 0.08 * (it.enh || 0));
    for (const a of it.affixes) s[a.k] += a.v;
    if (it.aspect && !it.unid) s.aspects.push(it.aspect);
    s.rating += gearRating(it);
  }
  return s;
}

export function slotBaseValue(item) {
  const base = SLOT_BASE[item.slot];
  return item.ilvl * base.per * RARITY[item.rarity].q * (1 + 0.08 * (item.enh || 0));
}

// Run item roll with quality Q (doc 18): Common 70, Enhanced 25Q, Prototype 5Q^1.5.
export function rollRunItem(rng, Q, minRarity = 0, exclude = null) {
  const w = itemRarityWeights(Q);
  if (minRarity >= 1) w[0] = 0;
  if (minRarity >= 3) w[1] = 0;
  const r = [0, 1, 3][rng.weighted(w)];
  const pool = ITEM_IDS.filter((id) => ITEMS[id].rarity === r && id !== exclude);
  return rng.pick(pool);
}

// names: limit the roll to the sellables a kind of container holds (containers.js).
export function rollSellable(rng, zone, lootMul = 1, names = null) {
  const list = names ? SELLABLES.filter((s) => names.includes(s.name)) : SELLABLES;
  // Deeper zones weight the list toward the valuable end.
  const bias = Math.min(list.length - 1, Math.floor(Math.pow(rng.float(), Math.max(0.45, 1.5 - zone * 0.28)) * list.length));
  const base = list[bias];
  return { uid: uid(rng), kind: 'loot', name: base.name, value: Math.round(base.value * (0.8 + 0.1 * zone) * lootMul) };
}
