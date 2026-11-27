// What the operator carries and keeps (doc 64, package 4): sealed finds, worn slots,
// the field pack, endings, the hub economy and wear. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid } from '../src/sim/raid.js';
import { Rng } from '../src/core/rng.js';
import { RARITY, SLOTS, SLOT_LABEL, SLOT_BASE, GEAR_NAMES, GEAR_AFFIXES, ASPECTS, CLASSES, SEALED, SEALED_BID } from '../src/sim/data.js';
import { rollGear, sealedBid, sealedView, expectedValue, worth, gearStats, starterItem } from '../src/sim/loot.js';
import { itemName } from '../src/i18n/index.js';
import { itemTip } from '../src/ui/hub.js';
import * as P from '../src/sim/profile.js';

const city = generateWorld(20261125);
const sandbox = (o = {}) => new Raid({ world: city, seed: 5, mode: 'sandbox', ...o });
// A sealed piece with every hidden property set, so a leak of any of them is visible.
const loud = (o = {}) => ({
  uid: 'loud', kind: 'gear', slot: 'weapon', rarity: 3, ilvl: 24, enh: 0, prime: true, aspect: 'twinned', unid: true,
  name: 'Anomalous Launcher', affixes: [{ k: 'crit', v: 6.6 }, { k: 'summon', v: 11.1 }, { k: 'dot', v: 10.2 }], value: 4321, ...o,
});

test('sealed: identical grades get identical bids, below the expected identified value (63, 38)', () => {
  const a = loud(), b = loud({ uid: 'quiet', slot: 'body', prime: false, aspect: 'bulwark', affixes: [{ k: 'hp', v: 3 }], value: 12, name: 'Anomalous Shell' });
  assert.equal(sealedBid(a), sealedBid(b));
  assert.equal(sealedBid(a), Math.round(SEALED_BID * expectedValue(3, 24)));
  assert.ok(sealedBid(loud({ ilvl: 25 })) > sealedBid(a) && sealedBid(loud({ rarity: 4 })) > sealedBid(a), 'grade alone moves the bid');
  // Rolled drops of one grade all bid the same, whatever their slot, Aspect or Prime.
  const rng = new Rng(8), bids = new Map();
  for (let i = 0; i < 300; i++) {
    const g = rollGear(rng, { tier: 2, zone: 2, source: 'elite' });
    const key = `${g.rarity}/${g.ilvl}`;
    if (!bids.has(key)) bids.set(key, new Set());
    bids.get(key).add(sealedBid(g));
    assert.ok(sealedBid(g) < expectedValue(g.rarity, g.ilvl));
  }
  for (const [key, set] of bids) assert.equal(set.size, 1, key);
});

test('sealed: only quality, Item Power, footprint and weight show in the raid and the stash (63)', () => {
  const it = loud();
  assert.deepEqual(Object.keys(sealedView(it)).sort(), ['bid', 'h', 'ilvl', 'kg', 'kind', 'rarity', 'uid', 'unid', 'w']);
  assert.deepEqual([sealedView(it).w, sealedView(it).h, sealedView(it).kg], [SEALED.w, SEALED.h, SEALED.kg]);
  assert.equal(itemName(it), 'Sealed Prototype equipment');
  // The loot toast receives the public view only, and carry value uses the bid.
  const raid = sandbox();
  raid.addInv(it);
  const ev = raid.events.find((e) => e.t === 'loot');
  for (const k of ['slot', 'name', 'prime', 'aspect', 'affixes', 'value', 'enh']) assert.ok(!(k in ev.item), `toast leaks ${k}`);
  assert.equal(raid.carryValue(), sealedBid(it));
  assert.equal(worth(it), sealedBid(it));
  // The stash tooltip names neither slot, name, Prime, Aspect, affixes, stored value nor a comparison.
  const html = itemTip(P.newProfile(), it);
  const leaks = [SLOT_LABEL[it.slot], it.name, 'Launcher', 'Prime', ASPECTS[it.aspect].name, ...it.affixes.map((a) => GEAR_AFFIXES[a.k].label), `${it.value}`, 'Compared', 'Gear Rating'];
  for (const word of leaks) assert.ok(!html.includes(word), `stash tooltip leaks ${word}`);
  assert.ok(html.includes(RARITY[3].name) && html.includes('Item Power 24') && html.includes(`${sealedBid(it)}`));
});

test('slots: six worn pieces, each with its Package 4 base stat per Item Power (63, 64)', () => {
  assert.deepEqual(SLOTS, ['weapon', 'head', 'body', 'hands', 'waist', 'shoes']);
  const piece = (slot) => ({ uid: slot, kind: 'gear', slot, rarity: 0, ilvl: 20, affixes: [], enh: 0 });
  const expect = { weapon: ['dmg', 20], head: ['skill', 18], body: ['hp', 24], hands: ['crit', 2.4], waist: ['regen', 0.4], shoes: ['move', 2.4] };
  for (const [slot, [k, v]] of Object.entries(expect)) {
    const g = gearStats({ [slot]: piece(slot) });
    assert.ok(Math.abs(g[k] - v) < 1e-9, `${slot} gives ${v} ${k}, got ${g[k]}`);
    assert.equal(SLOT_BASE[slot].k, k);
    assert.ok(GEAR_NAMES[slot].length >= 3 && starterItem(slot).starter, `${slot} has names and an issue piece`);
  }
  const raid = sandbox({ gear: gearStats(Object.fromEntries(Object.keys(expect).map((s) => [s, piece(s)]))) }), p = raid.player;
  assert.ok(Math.abs(p.crit - (0.05 + 0.024)) < 1e-9 && Math.abs(p.regen - 0.4) < 1e-9);
  assert.ok(Math.abs(p.speed - CLASSES.rifleman.speed * 1.024) < 1e-9);
  // The rig's lines moved to the head; no backpack slot, Credits base stat or Scavenger.
  assert.ok(!('rig' in SLOT_BASE) && !('backpack' in SLOT_BASE) && !('scavenger' in ASPECTS));
  for (const id of ['overclocked', 'primed']) assert.equal(ASPECTS[id].slot, 'head');
  const rng = new Rng(3), seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(rollGear(rng, { source: 'elite' }).slot);
  assert.deepEqual([...seen].sort(), [...SLOTS].sort());
  assert.equal(P.totalRating(P.newProfile()), 60);
});

test('slots: the contract-pay multiplier comes from the Credits affix alone (64)', () => {
  const pay = (gear) => { const r = sandbox({ gear }); r.zmax = 2; r.contracts = [{ id: 'x', label: 'x', need: 1, have: 1 }]; r.finish('extracted'); return r.result.contractPay; };
  const kit = Object.fromEntries(SLOTS.map((s) => [s, starterItem(s)]));
  assert.equal(gearStats(kit).credits, 0, 'the issue kit pays no Credits bonus');
  assert.equal(pay(gearStats(kit)), Math.round(100 * 1.2));
  kit.waist = { ...kit.waist, starter: false, affixes: [{ k: 'credits', v: 10 }] };
  assert.equal(pay(gearStats(kit)), Math.round(100 * 1.2 * 1.1));
});

// A literal version 1 save, as the build at 81870a5 wrote it.
const V1 = {
  v: 1, seq: 41, cash: 812, samples: 3, cores: 1, classId: 'blade', tier: 2, tierUnlocked: 2,
  equipped: {
    weapon: { uid: 'g1a2b', kind: 'gear', slot: 'weapon', rarity: 2, ilvl: 16, affixes: [{ k: 'dmg', v: 6.1 }, { k: 'crit', v: 4.4 }], enh: 3, prime: false, name: 'Resonant Edge', aspect: 'rending', unid: false, value: 335 },
    body: { uid: 'starter-body', kind: 'gear', slot: 'body', rarity: 0, ilvl: 10, affixes: [], enh: 0, prime: false, name: 'Issue Carapace', unid: false, value: 10, starter: true },
    rig: { uid: 'g9z3c', kind: 'gear', slot: 'rig', rarity: 3, ilvl: 21, affixes: [{ k: 'cdr', v: 6.8 }, { k: 'charge', v: 13.9 }, { k: 'move', v: 5.1 }], enh: 1, prime: true, name: 'Anomalous Coil Rig', aspect: 'primed', unid: false, value: 1957 },
    backpack: { uid: 'gq7k4d', kind: 'gear', slot: 'backpack', rarity: 1, ilvl: 12, affixes: [{ k: 'credits', v: 7.2 }], enh: 2, prime: false, name: 'Tuned Courier Pack', unid: false, value: 156 },
  },
  stash: [
    { uid: 'gx1e5', kind: 'gear', slot: 'rig', rarity: 2, ilvl: 14, affixes: [{ k: 'hp', v: 7.7 }, { k: 'aspd', v: 5.0 }], enh: 0, prime: false, name: 'Resonant Harness', aspect: 'overclocked', unid: true, value: 273 },
    { uid: 'gm2f6', kind: 'gear', slot: 'backpack', rarity: 2, ilvl: 15, affixes: [{ k: 'summon', v: 9.9 }, { k: 'dot', v: 8.3 }], enh: 0, prime: true, name: 'Resonant Hauler', aspect: 'scavenger', unid: true, value: 439 },
    { uid: 'gb3g7', kind: 'gear', slot: 'body', rarity: 1, ilvl: 13, affixes: [{ k: 'dr', v: 3.3 }], enh: 4, prime: false, name: 'Tuned Plate Vest', unid: false, value: 168 },
    { uid: 'gl4h8', kind: 'loot', name: 'Sensor Array', value: 150 },
  ],
  stats: { raids: 9, extractions: 6, deaths: 3, kills: 912, elites: 21, bossKills: 1, bestValue: 2210 },
  tutorial: { annex: true, sold: 2, processed: true, equipped: true, enhanced: true, rerolled: true, classPicked: true, tierPicked: true, done: true },
  lastDebrief: null,
};
const memory = (entries = []) => {
  const store = new Map(entries);
  return { store, getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
};

test('profile: version 2 reads and migrates a version 1 save without losing anything (26 section 4)', () => {
  const storage = memory([[P.PROFILE_KEY, JSON.stringify(V1)]]);
  const p = P.loadProfile(storage);
  assert.equal(p.v, 2);
  for (const k of ['seq', 'cash', 'samples', 'cores', 'classId', 'tier', 'tierUnlocked']) assert.equal(p[k], V1[k], k);
  assert.deepEqual(p.stats, V1.stats);
  assert.deepEqual(p.tutorial, V1.tutorial);
  // Worn: weapon and body untouched, the rig is now head gear, the new slots wear issue pieces.
  assert.deepEqual(Object.keys(p.equipped).sort(), [...SLOTS].sort());
  assert.deepEqual(p.equipped.weapon, V1.equipped.weapon);
  assert.deepEqual(p.equipped.body, V1.equipped.body);
  assert.deepEqual(p.equipped.head, { ...V1.equipped.rig, slot: 'head' });
  for (const s of ['hands', 'waist', 'shoes']) assert.deepEqual(p.equipped[s], starterItem(s));
  // The worn and the stashed backpack became packs; uid, enhancement, hidden state and value survive.
  const byUid = Object.fromEntries(p.stash.map((i) => [i.uid, i]));
  assert.equal(p.stash.length, V1.stash.length + 1);
  const worn = byUid.gq7k4d, stashed = byUid.gm2f6;
  assert.deepEqual([worn.kind, worn.w, worn.h, worn.enh, worn.value, worn.unid, worn.name], ['pack', 4, 5, 2, 156, false, 'Tuned Courier Pack']);
  assert.deepEqual([stashed.kind, stashed.w, stashed.h, stashed.unid, stashed.value, stashed.name], ['pack', 5, 5, true, 439, 'Resonant Hauler']);
  assert.deepEqual(stashed.legacy.affixes, V1.stash[1].affixes, 'the old rolled lines are kept aside, not dropped');
  assert.deepEqual([stashed.legacy.aspect, stashed.legacy.prime, stashed.legacy.ilvl], ['scavenger', true, 15]);
  assert.deepEqual(byUid.gx1e5, { ...V1.stash[0], slot: 'head' }, 'a stashed rig is head gear, still sealed');
  assert.deepEqual(byUid.gb3g7, V1.stash[2]);
  assert.deepEqual(byUid.gl4h8, V1.stash[3]);
  // The sheet reads the migrated head; it saves as v2 and loads back unchanged.
  const st = P.profileStats(p);
  assert.ok(Math.abs(st.skill - 21 * 0.9 * RARITY[3].q * 1.08) < 1e-9 && st.aspects.includes('primed'));
  P.saveProfile(storage, p);
  assert.equal(JSON.parse(storage.store.get(P.PROFILE_KEY)).v, 2);
  assert.deepEqual(P.loadProfile(storage), p);
  storage.store.set(P.PROFILE_KEY, JSON.stringify({ ...V1, v: 7 }));
  assert.equal(P.loadProfile(storage), null, 'an unknown version is rejected');
});
