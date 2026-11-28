// Kinds of searchable container (docs 31, 64 package 6): what the prompt says, how long a
// search takes and, for the small containers and vehicle compartments, what they hold.
// Crates, lockers and dumpsters keep the general table in raid.openContainer. Every kind
// can be a Host, and none shows it until a scan does.

import { ZONES } from './data.js';
import { rollGear, rollSellable } from './loot.js';
import { message } from '../i18n/index.js';

// loot: sell (names from SELLABLES this kind holds), items [min, max] sellables,
// gear chance, credits [chance, min, max], medkit chance.
export const CONTAINER_KINDS = {
  crate: {}, locker: {}, dumpster: {},
  tin: {
    label: 'Open the biscuit tin', lockLabel: 'Prise the stuck lid off the biscuit tin', need: 0.7, lockNeed: 1.4,
    loot: { sell: ['Ration Pack', 'Power Cell', 'Black-Market Chips'], items: [0, 1], gear: 0, credits: [0.9, 8, 22], medkit: 0.14 },
  },
  basket: {
    label: 'Search the lost-property basket', lockLabel: 'Cut the tie and search the lost-property basket', need: 1.0, lockNeed: 1.6,
    loot: { sell: ['Optics Bundle', 'Sealed Data Case', 'Corporate Ledger', 'Power Cell'], items: [1, 2], gear: 0.1, credits: [0.45, 6, 16], medkit: 0.05 },
  },
  cargo: {
    label: 'Open the rear doors', lockLabel: 'Break the lock on the rear doors', need: 1.4, lockNeed: 2.6,
    loot: { sell: ['Medical Crate', 'Power Cell', 'Optics Bundle', 'Sensor Array', 'Ration Pack'], items: [1, 2], gear: 0.2, credits: [0.25, 6, 14], medkit: 0.12 },
  },
  boot: {
    label: 'Search the boot', lockLabel: 'Jimmy the boot open', need: 1.0, lockNeed: 2.2,
    loot: { sell: ['Ration Pack', 'Optics Bundle', 'Power Cell', 'Sealed Data Case'], items: [1, 1], gear: 0.12, credits: [0.5, 6, 14], medkit: 0.18 },
  },
  wreck: {
    label: 'Prise open the burnt-out boot', lockLabel: 'Prise open the buckled boot', need: 1.8, lockNeed: 2.8,
    loot: { sell: ['Power Cell', 'Sensor Array', 'Black-Market Chips', 'Ration Pack'], items: [0, 1], gear: 0.15, credits: [0.2, 4, 10], medkit: 0.04 },
  },
  // The records mezzanine (doc 32): secure work went on up there, so its cabinets hold better
  // finds (the container's own `rich` weighting raises value and the gear chance).
  records: {
    label: 'Search the filing cabinet', lockLabel: 'Force the filing cabinet lock', need: 1.4, lockNeed: 2.6,
    loot: { sell: ['Sealed Data Case', 'Corporate Ledger', 'Optics Bundle', 'Sensor Array'], items: [1, 2], gear: 0.3, credits: [0.5, 10, 24], medkit: 0.03 },
  },
  // An evacuation cabinet beside an upper window: a clip-on descent line, and the odd first-aid kit.
  evac: {
    label: 'Open the evacuation cabinet', lockLabel: 'Break the evacuation cabinet glass', need: 0.9, lockNeed: 1.6,
    loot: { sell: ['Medical Crate', 'Power Cell'], items: [0, 1], gear: 0, credits: [0.3, 4, 10], medkit: 0.5, line: true },
  },
};

// Prompt and search time for raid.findInteract. Time divides by the operator's search rate.
export function containerPrompt(c, st, rate = 1) {
  const K = CONTAINER_KINDS[c.kind] || {};
  return {
    need: (st.locked ? K.lockNeed ?? 2.6 : K.need ?? 1.2) / rate,
    label: st.hostKnown ? 'Search (HOST detected)' : st.locked ? K.lockLabel || 'Pick lock and search' : K.label || 'Search',
  };
}

// Roll the contents of a kind with its own table into st.items, where cargo waits to be
// taken (doc 61). Returns false for the kinds that use the general table, so
// raid.openContainer carries on with it.
export function kindContents(raid, c, st) {
  const L = CONTAINER_KINDS[c.kind]?.loot;
  if (!L) return false;
  const rl = raid.rLoot, Z = ZONES[Math.max(c.zone, 0)], rich = c.rich || 1;
  const n = rl.irange(L.items[0], L.items[1]) + (st.host ? 1 : 0) + (st.locked ? 1 : 0);
  let found = n;
  for (let i = 0; i < n; i++) st.items.push(rollSellable(rl, c.zone, (0.4 + 0.12 * Z.loot) * rich * (raid.lootBoost || 1), L.sell));
  if (L.gear && rl.chance(L.gear * rich * (st.locked ? 1.6 : 1) * (0.8 + 0.2 * Z.loot))) { found++; st.items.push(rollGear(rl, { tier: raid.tier, zone: c.zone, nl: raid.nl, source: 'container' })); }
  // A clip-on descent line: one drop of up to 12 m that costs nothing (doc 32).
  if (L.line) { found++; raid.player.descentLines = (raid.player.descentLines || 0) + 1; raid.toast('Clip-on descent line: your next drop of up to 12 m costs nothing', '#9fe8ff', 'complete'); raid.emit({ t: 'line' }); }
  if (rl.chance(L.credits[0])) { found++; const cr = raid.addCredits(rl.irange(L.credits[1], L.credits[2]) * (1 + 0.3 * c.zone)); raid.toast(message('+{count} Credits', { count: cr }), '#7fe9ff', 'credits'); }
  if (rl.chance(L.medkit)) { found++; const med = raid.medkit(); if (!raid.stowMedkit(med)) st.items.push(med); }
  if (st.host && rl.chance(0.6)) { raid.samples++; raid.toast('Lab Sample +1', '#c79bff', 'sample'); }
  if (!found && !(c.key >= 0)) raid.toast(c.kind === 'tin' ? 'Nothing but stale biscuits' : 'Nothing worth taking', '#98adb3');
  return true;
}
