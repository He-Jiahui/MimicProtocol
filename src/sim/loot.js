// Gear and run-item generation (docs 18, 19, 23). Pure functions of an Rng.

import {
  ITEMS, ITEM_IDS, itemRarityWeights, SLOTS, SLOT_WEIGHTS, SLOT_BASE, GEAR_AFFIXES, GEAR_AFFIX_IDS, AFFIX_COUNT,
  GEAR_NAMES, GEAR_PREFIX, DROP_TABLES, RARITY, TIERS, SELLABLES, gearRating, ASPECTS, ASPECT_IDS,
  SEALED, SEALED_BID, PRIME_CHANCE, BOSS_PRIME_CHANCE, PACKS, WEAR, LATENTS, DRONES,
} from './data.js';

let uidCounter = 0;
const uid = (rng) => `g${(rng.int(0x7fffffff)).toString(36)}${(uidCounter++).toString(36)}`;

export function affixRange(k, ilvl) {
  const a = GEAR_AFFIXES[k], s = Math.sqrt(ilvl / 10);
  return [a.lo * s, a.hi * s];
}

// A line is rolled once: its place in the final range (r) is saved with the roll-table version,
// and the value shown and applied is resolved from it (doc 26, section 4). A Prime piece draws
// every line in the top tenth of the range (doc 23). Lines saved before r existed keep their
// exact value and have no known percentile.
export const ROLL_TABLE = 2;
export function rollAffix(rng, k, ilvl, prime = false) {
  const [lo, hi] = affixRange(k, ilvl);
  const r = Math.round((prime ? rng.range(0.9, 1) : rng.float()) * 1000) / 1000;
  return { k, r, tv: ROLL_TABLE, v: Math.round((lo + (hi - lo) * r) * 10) / 10 };
}
// Where a line sits in its range, 0 to 1; null for a legacy line.
export const affixRoll = (a) => (a.r === undefined ? null : a.r);
// How strongly a piece rolled, 0 to 1: the mean of its lines (a legacy line is placed by its
// value). A piece with no lines counts as average.
export function rollStrength(item) {
  if (!item.affixes || !item.affixes.length) return 0.5;
  let sum = 0;
  for (const a of item.affixes) {
    if (a.r !== undefined) { sum += a.r; continue; }
    const [lo, hi] = affixRange(a.k, item.ilvl);
    sum += Math.max(0, Math.min(1, (a.v - lo) / (hi - lo || 1)));
  }
  return sum / item.affixes.length;
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
  const prime = rng.chance(boss ? BOSS_PRIME_CHANCE : PRIME_CHANCE);
  const pool = rng.shuffle(GEAR_AFFIX_IDS.slice());
  const affixes = [];
  for (let i = 0; i < AFFIX_COUNT[rarity]; i++) affixes.push(rollAffix(rng, pool[i], ilvl, prime));
  // Rare and better gear carries one Aspect for its slot (doc 24), where the slot has any.
  const aspects = ASPECT_IDS.filter((id) => ASPECTS[id].slot === slot);
  const aspect = rarity >= 2 && aspects.length ? rng.pick(aspects) : null;
  const item = {
    uid: uid(rng), kind: 'gear', slot, rarity, ilvl, affixes, enh: 0, prime,
    name: `${GEAR_PREFIX[rarity]} ${rng.pick(GEAR_NAMES[slot])}`,
    aspect,
    // Every find is sealed, container gear included: Process reveals it at the hub (doc 63).
    unid: true,
  };
  item.value = gearValue(item);
  return item;
}

// Identified worth follows how the lines rolled: 85% at the bottom of their ranges, 115% at the top.
export const strengthPrice = (s) => 0.85 + 0.3 * s;
export function gearValue(item) {
  return Math.round((item.aspect ? 1.2 : 1) * (item.latent ? 1.3 : 1) * item.ilvl * (3 + item.rarity * 5) * RARITY[item.rarity].q * (1 + 0.15 * (item.enh || 0)) * (item.prime ? 1.5 : 1) * strengthPrice(rollStrength(item)));
}

// The Matron's signature piece (doc 23): a Legendary weapon with a fixed Latent Power, rolled
// like any other boss piece and sealed like any other find.
export function rollSignature(rng, o = {}) {
  const L = LATENTS.hollow_heart, item = rollGear(rng, { ...o, source: 'boss', boss: true, slot: L.slot, rarity: 4 });
  item.name = L.item; item.latent = 'hollow_heart';
  item.value = gearValue(item);
  return item;
}
// A sealed drone case: cargo now, a drone for a later deployment once the Lab opens it (doc 62).
export function droneCase(rng) {
  const id = rng.chance(0.25) ? 'hauler' : 'courier';
  return { uid: uid(rng), kind: 'drone', drone: id, unid: true, name: 'Sealed Drone Case', value: Math.round(DRONES[id].cash * 0.4) };
}

// Share of drops whose slot can carry an Aspect, weighted by the slot odds.
const ASPECT_SHARE = SLOTS.reduce((a, s, i) => a + (ASPECT_IDS.some((id) => ASPECTS[id].slot === s) ? SLOT_WEIGHTS[i] : 0), 0)
  / SLOT_WEIGHTS.reduce((a, w) => a + w, 0);
// What an identified piece of this grade is worth on average. Slot, Aspect and Prime are
// hidden, so their multipliers are averaged over the drop odds: equal grades, equal bids.
export function expectedValue(rarity, ilvl) {
  const aspect = rarity >= 2 ? 1 + 0.2 * ASPECT_SHARE : 1;
  // An ordinary piece averages the middle of its ranges; a Prime one sits near the top of them.
  const prime = 1.5 * (AFFIX_COUNT[rarity] ? strengthPrice(0.95) : 1);
  return ilvl * (3 + rarity * 5) * RARITY[rarity].q * aspect * (1 + PRIME_CHANCE * (prime - 1));
}
export const sealedBid = (it) => Math.round(SEALED_BID * expectedValue(it.rarity, it.ilvl));
// What a piece counts for in carry value, toasts and sorting: never the hidden roll.
export const worth = (it) => (it.kind === 'gear' && it.unid ? sealedBid(it) : it.value || 0);
// The only facts a sealed piece discloses (doc 63): quality, Item Power, footprint, weight.
export function sealedView(it) {
  return { uid: it.uid, kind: 'gear', unid: true, rarity: it.rarity, ilvl: it.ilvl, w: SEALED.w, h: SEALED.h, kg: SEALED.kg, bid: sealedBid(it) };
}
export const publicView = (it) => (it.kind === 'gear' && it.unid ? sealedView(it) : it);

export function starterItem(slot) {
  return { uid: `starter-${slot}`, kind: 'gear', slot, rarity: 0, ilvl: 10, affixes: [], enh: 0, prime: false, name: `Issue ${GEAR_NAMES[slot][0]}`, unid: false, value: 10, starter: true };
}

// A field pack is its own kind of item: grid and empty weight show at once, no rating or affixes.
export function packItem(rng, type) {
  const d = PACKS[type];
  return { uid: uid(rng), kind: 'pack', pack: type, name: d.name, w: d.w, h: d.h, kg: d.kg, value: d.value };
}
export const issuePack = () => {
  const d = PACKS.issue;
  return { uid: 'issue-pack', kind: 'pack', pack: 'issue', name: d.name, w: d.w, h: d.h, kg: d.kg, value: d.value, starter: true };
};

// Aggregate the stats of the worn items into percentages.
export function gearStats(equipped) {
  const s = { dmg: 0, hp: 0, skill: 0, credits: 0, aspd: 0, crit: 0, dr: 0, cdr: 0, move: 0, regen: 0, dot: 0, summon: 0, charge: 0, cgain: 0, spend: 0, rating: 0, aspects: [], latents: [] };
  for (const slot of SLOTS) {
    const it = equipped && equipped[slot];
    if (!it) continue;
    const base = SLOT_BASE[slot];
    s[base.k] += slotBaseValue(it);
    for (const a of it.affixes) s[a.k] += a.v;
    if (it.aspect && !it.unid) s.aspects.push(it.aspect);
    if (it.latent && !it.unid) s.latents.push(it.latent);
    s.rating += gearRating(it);
  }
  return s;
}

// Condition 0 to 100 (doc 63). Issue gear never wears; a piece never worn is in full repair.
export const condition = (it) => (it.starter ? 100 : it.cond ?? 100);
// Wear only touches the base stat: worn down it gives x0.75, broken x0.5. The roll is untouched.
export function wearMul(it) {
  const c = condition(it);
  return c <= 0 ? WEAR.brokenMul : c <= WEAR.low ? WEAR.lowMul : 1;
}
export function slotBaseValue(item) {
  const base = SLOT_BASE[item.slot];
  return item.ilvl * base.per * RARITY[item.rarity].q * (1 + 0.08 * (item.enh || 0)) * wearMul(item);
}
// Armory repair: (100 - condition) x (0.4 + 0.03 x Item Power x quality factor) Cash (doc 64, start).
export const repairCost = (it) => Math.ceil((100 - condition(it)) * (0.4 + 0.03 * it.ilvl * RARITY[it.rarity].q));

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
