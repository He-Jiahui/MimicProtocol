// What the operator carries and keeps (doc 64, package 4): sealed finds, worn slots,
// the field pack, endings, the hub economy and wear. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid } from '../src/sim/raid.js';
import { Rng } from '../src/core/rng.js';
import { RARITY, SLOTS, SLOT_LABEL, SLOT_BASE, GEAR_NAMES, GEAR_AFFIXES, ASPECTS, CLASSES, ENEMIES, SEALED, SEALED_BID, SELLABLES, PACKS, DRONES } from '../src/sim/data.js';
import { rollGear, sealedBid, sealedView, expectedValue, worth, gearStats, gearValue, starterItem, packItem } from '../src/sim/loot.js';
import { footprint, weight, speedMul, packAll } from '../src/sim/pack.js';
import { itemName, t } from '../src/i18n/index.js';
import { itemTip, compareHtml, stashView, keepInView } from '../src/ui/hub.js';
import { compareGear } from '../src/sim/compare.js';
import { bagHtml } from '../src/ui/bag.js';
import { stepRaid } from '../src/sim/raid.js';
import * as P from '../src/sim/profile.js';
import { makeBot } from './bot.js';

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

const sell = (name) => ({ uid: `${name}-${Math.random()}`, kind: 'loot', name, value: SELLABLES.find((s) => s.name === name).value });
// A carried piece pinned to a cell, for laying out a pack by hand.
const at = (it, x, y, r = 0) => Object.assign(it, { at: { x, y, r } });
const near = (raid, items) => {
  const c = city.containers.find((k) => k.zone === 1), st = raid.cont[c.id];
  st.opened = true; st.items = items;
  raid.player.x = c.x; raid.player.z = c.z;
  return st;
};

test('pack: Package 4 footprints and weights; every sellable and consumable weighs something', () => {
  const size = (it) => { const f = footprint(it); return `${f.w}x${f.h}`; };
  assert.equal(size(loud()), '2x2');
  assert.equal(weight(loud()), 3);
  for (const n of ['Ration Pack', 'Power Cell', 'Black-Market Chips']) assert.equal(size(sell(n)), '1x1', n);
  for (const n of ['Sealed Data Case', 'Corporate Ledger', 'Optics Bundle']) assert.equal(size(sell(n)), '1x2', n);
  assert.equal(size(sell('Sensor Array')), '1x3');
  assert.equal(size(sell('Medical Crate')), '2x2');
  assert.equal(size({ kind: 'med' }), '1x1');
  for (const s of SELLABLES) assert.ok(s.kg > 0, s.name);
  assert.ok(weight({ kind: 'med' }) > 0 && weight({ kind: 'loot', name: 'Intel Shard' }) > 0);
  const raid = sandbox();
  assert.deepEqual([raid.player.pack.w, raid.player.pack.h], [4, 4], 'the starter pack is 4 by 4');
  assert.deepEqual(raid.player.pockets.map((m) => m && m.kind), ['med', 'med'], 'two quick pockets, both stocked');
  assert.deepEqual([PACKS.patrol.w, PACKS.patrol.h, PACKS.ranger.w, PACKS.ranger.h], [4, 5, 5, 5]);
  const found = packItem(new Rng(1), 'ranger');
  assert.equal(found.kind, 'pack');
  assert.ok(!('affixes' in found) && !('rarity' in found) && !('ilvl' in found), 'a pack has no rating or affixes');
});

test('pack: a 2 by 2 parcel needs a 2 by 2 hole; turning a piece buys a different fit (61)', () => {
  const raid = sandbox(), p = raid.player;
  // The doc 61 patch: columns 0 and 2 taken for three rows. Six cells free in those rows, no 2 by 2.
  for (const x of [0, 2]) p.inv.push(at(sell('Sensor Array'), x, 0));
  for (const x of [1, 3]) p.inv.push(at(sell('Sealed Data Case'), x, 0));
  raid.reweigh();
  assert.equal(raid.addInv(loud()), false, 'no 2 by 2 hole: the parcel does not go in');
  assert.equal(p.inv.length, 4);
  // The bottom row is a 4 by 1 strip: a Sensor Array only fits turned.
  const bar = sell('Sensor Array');
  assert.ok(raid.addInv(bar));
  assert.deepEqual(bar.at, { x: 0, y: 3, r: 1 });
  assert.equal(raid.bagMove(bar.uid, 0, 3, 0), false, 'upright it would leave the grid');
  // Drop the case in column 1 and the array in column 0, then slide the column 2 array into
  // column 0: the middle opens into a 2 by 2.
  assert.ok(raid.bagDrop(p.inv[2].uid) && raid.bagDrop(p.inv[0].uid));
  assert.ok(raid.bagMove(p.inv[0].uid, 0, 0, 0), 'a piece moves to a free cell');
  assert.ok(raid.addInv(loud()), 'with a column cleared, the parcel fits');
});

test('pack: what does not fit stays in the container, with a fit preview and loaded speed first (61)', () => {
  const raid = sandbox(), p = raid.player;
  const parcel = loud(), crate = sell('Medical Crate'), chips = sell('Black-Market Chips');
  const st = near(raid, [chips, crate, parcel]);
  let offer = raid.findInteract();
  assert.equal(offer.type, 'take');
  assert.ok(offer.ok);
  const before = t(offer.label);
  assert.match(before, /Take 3 pieces · \+7\.2 kg · \d+\.\d m\/s/);
  assert.ok(before.includes(raid.loadedSpeed(7.2).toFixed(1)), 'the prompt shows the loaded speed before taking');
  // Leave room for one 2 by 2 only: the most valuable by public worth goes first.
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3]]) p.inv.push(at(sell('Ration Pack'), x, y));
  raid.reweigh();
  offer = raid.findInteract();
  assert.match(t(offer.label), /Take 2 of 3/);
  raid.completeInteract(offer);
  assert.ok(p.inv.includes(parcel) && p.inv.includes(chips) && !p.inv.includes(crate));
  assert.deepEqual(st.items, [crate], 'the crate stays in the container');
  offer = raid.findInteract();
  assert.equal(offer.ok, false);
  assert.equal(t(offer.label), 'No room in the pack for Medical Crate (2x2)');
});

test('pack: after a search, taking needs a fresh press of E, so the preview is read first (61)', () => {
  const raid = sandbox(), p = raid.player, c = city.containers.find((k) => k.zone === 1);
  p.x = c.x; p.z = c.z;
  const idle = { mx: 0, mz: 0, aimX: p.x, aimZ: p.z - 1 }, hold = { ...idle, interact: true };
  for (let i = 0; i < 150; i++) raid.updateInteract(1 / 60, hold);
  assert.ok(raid.cont[c.id].opened, 'the search completed');
  assert.equal(p.inv.length, 0, 'holding E on does not run into a take');
  assert.equal(raid.prompt.type, 'take');
  raid.updateInteract(1 / 60, idle);
  for (let i = 0; i < 30; i++) raid.updateInteract(1 / 60, hold);
  assert.ok(p.inv.length > 0, 'a fresh press takes what fits');
});

test('pack: weight slows walking: 10 kg free, 2.5% a kilogram, never below 75% (64)', () => {
  assert.equal(speedMul(0), 1);
  assert.equal(speedMul(10), 1);
  assert.ok(Math.abs(speedMul(14) - 0.9) < 1e-12);
  assert.equal(speedMul(30), 0.75);
  const walk = (load) => {
    const raid = sandbox(), p = raid.player;
    for (const it of load) assert.ok(raid.addInv(it));
    const x0 = p.x;
    for (let i = 0; i < 30; i++) raid.updatePlayer(1 / 60, { mx: 1, mz: 0, aimX: p.x + 5, aimZ: p.z });
    return { d: p.x - x0, raid };
  };
  // A full 4 by 4: three 2 by 2s, a case and two cells, plus the pack and two medkits.
  const light = walk([]), heavy = walk([loud(), loud(), sell('Medical Crate'), sell('Sealed Data Case'), sell('Power Cell'), sell('Power Cell')]);
  assert.ok(Math.abs(heavy.raid.player.kg - (1 + 0.8 + 6 + 4 + 1.5 + 2)) < 1e-9, `load ${heavy.raid.player.kg}`);
  assert.ok(Math.abs(heavy.raid.player.loadMul - speedMul(15.3)) < 1e-12);
  assert.ok(Math.abs(heavy.d / light.d - heavy.raid.player.loadMul) < 0.02, 'the loaded operator walks slower by the rule');
  assert.ok(heavy.raid.loadedSpeed() > ENEMIES.walker.speed, 'a full load still outpaces a Husk');
});

test('pack: quick pockets hold the medkits key 1 uses; one deep in the pack must be moved first (38, 61)', () => {
  const raid = sandbox(), p = raid.player;
  p.hp = p.maxHp * 0.5;
  raid.updatePlayer(1 / 60, { mx: 0, mz: 0, aimX: p.x, aimZ: p.z - 1, quick1: true });
  assert.equal(p.medkits, 1);
  raid.stowMedkit();
  raid.stowMedkit();
  assert.equal(p.medkits, 2, 'the free pocket fills first');
  const deep = p.inv.find((i) => i.kind === 'med');
  assert.ok(deep, 'with both pockets full the third medkit goes deep in the pack');
  p.pockets[0] = null; raid.reweigh();
  assert.equal(p.medkits, 1, 'a medkit in cargo is not ready');
  assert.ok(raid.bagPocket(deep.uid, 0) && p.medkits === 2 && !p.inv.includes(deep));
  assert.equal(raid.bagPocket(p.inv[0]?.uid, 0), false);
});

test('pack: a found pack is swapped in the street; the old one and leftovers stay on the floor (61)', () => {
  const raid = sandbox(), p = raid.player;
  for (const it of [loud(), loud(), loud(), loud()]) assert.ok(raid.addInv(it));
  const big = packItem(new Rng(2), 'ranger');
  const k = raid.dropPickup('pack', p.x, p.z, { item: big });
  const offer = raid.findInteract();
  assert.equal(offer.type, 'swap');
  assert.match(t(offer.label), /Swap to the 5x5 pack · 4 of 4 pieces move/);
  raid.completeInteract(offer);
  assert.equal(p.pack.uid, big.uid);
  assert.equal(p.inv.length, 4, 'everything moved across');
  assert.ok(!raid.pickups.includes(k) && raid.pickups.some((q) => q.kind === 'pack' && q.item.starter), 'the issue pack stays on the floor');
  raid.finish('extracted');
  assert.equal(raid.result.pack.uid, big.uid);
  // At home: the found pack joins the stash and is chosen for next time.
  const prof = P.newProfile();
  prof.tutorial.done = true;
  P.applyRaidResult(prof, raid.result);
  assert.ok(prof.stash.some((i) => i.uid === big.uid) && prof.pack === big.uid);
  assert.equal(P.activePack(prof).uid, big.uid);
  // Deployed again and lost: the stash copy goes with it.
  const again = new Raid({ world: city, seed: 6, mode: 'sandbox', pack: P.activePack(prof) });
  assert.deepEqual([again.player.pack.w, again.player.pack.h], [5, 5]);
  again.finish('dead');
  P.applyRaidResult(prof, again.result);
  assert.ok(!prof.stash.some((i) => i.uid === big.uid) && prof.pack === null);
});

test('bot: with a full pack it drops cheap cargo for a better piece and does not stall (61)', () => {
  const raid = sandbox(), p = raid.player;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) p.inv.push(at(sell('Ration Pack'), x, y));
  raid.reweigh();
  const prize = loud({ ilvl: 30, rarity: 4 });
  const st = near(raid, [prize]);
  const bot = makeBot({ goal: { x: p.x, z: p.z } });
  for (let i = 0; i < 120; i++) { stepRaid(raid, 1 / 60, bot(raid, 1 / 60)); raid.events.length = 0; }
  assert.ok(p.inv.includes(prize), 'the bot made room and took the better piece');
  assert.equal(st.items.length, 0);
  const dropped = raid.pickups.filter((k) => k.kind === 'loot').length;
  assert.ok(dropped >= 4 && dropped <= 8, `dropped ${dropped} rations`);
  assert.ok(raid.carryValue() > 16 * 25, 'the trade raised the carried value');
});

// A raid result through the profile, with a fresh profile past training unless one is given.
const settle = (raid, prof = Object.assign(P.newProfile(), { cash: 0 }), opts) => { prof.tutorial.done = true; P.applyRaidResult(prof, raid.result, opts); return prof; };

test('endings: extraction brings kit, pack and cargo home and converts unspent Credits at 50% (62, 64)', () => {
  const raid = sandbox({ drone: 'courier' }), p = raid.player;
  const parcel = loud(), crate = sell('Medical Crate');
  raid.addInv(parcel); raid.addInv(crate);
  p.credits = 91;
  raid.contracts = [{ id: 'x', label: 'x', need: 1, have: 1 }];
  raid.finish('extracted');
  const r = raid.result;
  assert.equal(r.creditCash, 45);
  assert.deepEqual(r.inv.map((i) => i.uid), [parcel.uid, crate.uid]);
  assert.ok(r.inv.every((i) => !('at' in i)), 'cargo goes home without its grid place');
  const prof = Object.assign(P.newProfile(), { cash: 0, drones: { courier: 1, hauler: 0 }, drone: 'courier' });
  settle(raid, prof);
  assert.equal(prof.cash, 45 + r.bonus + r.contractPay);
  assert.ok(prof.stash.some((i) => i.uid === parcel.uid && i.unid), 'the parcel arrives still sealed');
  assert.deepEqual([prof.drones.courier, prof.drone], [1, 'courier'], 'an unused drone comes back');
  assert.deepEqual(prof.equipped, P.newProfile().equipped);
});

test('endings: death or curfew without a drone keeps the kit, loses pack, cargo and Credits (62)', () => {
  for (const outcome of ['dead', 'curfew']) {
    const raid = sandbox(), p = raid.player;
    raid.addInv(loud());
    p.credits = 300;
    raid.finish(outcome);
    const prof = settle(raid);
    assert.equal(prof.stash.length, 0, outcome);
    assert.equal(prof.cash, 0, `${outcome}: no Credits come back`);
    assert.deepEqual(prof.equipped, P.newProfile().equipped, `${outcome}: the worn kit is kept`);
    assert.equal(prof.pendingLift, null);
  }
});

test('endings: an assigned drone lifts whole pieces that fit its bay plus Credits up to its allowance, then is spent (62)', () => {
  const dying = (drone, credits, load) => {
    const raid = sandbox({ drone }), p = raid.player;
    for (const it of load) assert.ok(raid.addInv(it));
    p.credits = credits;
    raid.finish('dead');
    return raid;
  };
  // Headless default: greedy by sealed bid. A Courier bay is 2 by 2: the best parcel, nothing else.
  const best = loud({ uid: 'best', rarity: 4, ilvl: 30 }), mid = loud({ uid: 'mid', rarity: 2, ilvl: 30 }), chip = sell('Black-Market Chips');
  let raid = dying('courier', 90, [mid, best, chip]);
  let prof = settle(raid, Object.assign(P.newProfile(), { cash: 0, drones: { courier: 1, hauler: 0 }, drone: 'courier' }));
  assert.deepEqual(prof.stash.map((i) => i.uid), ['best']);
  assert.ok(prof.stash[0].unid, 'a lift neither identifies nor cleans');
  assert.equal(prof.cash, 45, '90 Credits under a 150 allowance: all 90 return, converted once at 50%');
  assert.deepEqual([prof.drones.courier, prof.drone], [0, null], 'the drone is spent');
  // The player's own choice: a 2 by 3 Hauler bay takes a parcel and a 1 by 2 case, not two parcels.
  const caseA = sell('Sealed Data Case');
  raid = dying('hauler', 1000, [best, mid, caseA]);
  prof = settle(raid, Object.assign(P.newProfile(), { cash: 0, drones: { courier: 0, hauler: 2 }, drone: 'hauler' }), { choose: true });
  assert.ok(prof.pendingLift && prof.pendingLift.cargo.length === 3, 'the cargo waits for the player');
  assert.equal(prof.cash, 200, 'Credits stop at the 400 allowance');
  assert.equal(P.resolveLift(prof, ['best', 'mid', caseA.uid]).ok, false, 'two parcels and a case do not pack into 2 by 3');
  assert.ok(P.resolveLift(prof, ['mid', caseA.uid]).ok);
  assert.deepEqual(prof.stash.map((i) => i.uid).sort(), ['mid', caseA.uid].sort());
  assert.equal(prof.lastDebrief.lost, 1);
  assert.deepEqual([prof.drones.hauler, prof.drone], [1, 'hauler'], 'one spent, the next stays assigned');
  // Choosing nothing still spends the drone; curfew is the same ending.
  raid = sandbox({ drone: 'courier' }); raid.addInv(loud()); raid.finish('curfew');
  prof = settle(raid, Object.assign(P.newProfile(), { drones: { courier: 1, hauler: 0 }, drone: 'courier' }), { choose: true });
  assert.ok(P.resolveLift(prof, []).ok);
  assert.deepEqual([prof.stash.length, prof.drones.courier, prof.pendingLift], [0, 0, null]);
  // The bay is a packing problem, rotation included.
  assert.ok(packAll(2, 2, [sell('Sealed Data Case'), sell('Power Cell'), sell('Ration Pack')]));
  assert.equal(packAll(2, 2, [sell('Sensor Array')]), null, 'a rigid 1 by 3 never fits a 2 by 2 bay');
  assert.ok(packAll(2, 3, [sell('Sensor Array'), sell('Corporate Ledger'), sell('Power Cell')]));
});

test('endings: the street broker pays 80% of a piece\'s bid in raid Credits, not banked Cash (60, 64)', () => {
  const raid = sandbox(), p = raid.player, broker = city.pois.find((k) => k.type === 'broker');
  p.x = broker.x; p.z = broker.z;
  const a = sell('Sensor Array'), b = sell('Corporate Ledger'), parcel = loud();
  raid.addInv(a); raid.addInv(b); raid.addInv(parcel);
  const offer = raid.findInteract();
  assert.equal(offer.type, 'broker');
  raid.completeInteract(offer);
  assert.equal(p.credits, Math.round(0.8 * a.value) + Math.round(0.8 * b.value));
  assert.deepEqual(p.inv, [parcel], 'salvage is sold; the sealed parcel stays unless sold on its own');
  assert.equal(raid.brokerSell(parcel.uid), Math.round(0.8 * sealedBid(parcel)));
  assert.equal(p.inv.length, 0);
  const credits = p.credits;
  raid.finish('dead');
  assert.ok(!('banked' in raid.result));
  assert.equal(settle(raid).cash, 0, `the ${credits} broker Credits died with the operator`);
});

test('drones: bought at the Quartermaster for Cash, one assigned per deployment (62, 64)', () => {
  const prof = P.newProfile();
  assert.equal(P.buyDrone(prof, 'courier').ok, false, 'not during the training checklist');
  prof.tutorial.done = true; prof.cash = 500;
  assert.ok(P.buyDrone(prof, 'courier').ok && P.buyDrone(prof, 'hauler').ok);
  assert.equal(prof.cash, 500 - 120 - 300);
  assert.equal(P.buyDrone(prof, 'hauler').ok, false, 'needs 300 Cash');
  assert.equal(P.deployedDrone(prof), 'courier', 'the first drone bought is assigned');
  assert.ok(P.assignDrone(prof, 'hauler').ok);
  assert.equal(P.deployedDrone(prof), 'hauler');
  assert.ok(P.assignDrone(prof, null).ok && P.deployedDrone(prof) === null);
  assert.deepEqual([DRONES.courier.w, DRONES.courier.h, DRONES.courier.credits, DRONES.hauler.w, DRONES.hauler.h, DRONES.hauler.credits], [2, 2, 150, 2, 3, 400]);
});

test('bag screen: a sealed piece shows only its public facts in the raid grid (63)', () => {
  const raid = sandbox(), it = loud();
  assert.ok(raid.addInv(it));
  near(raid, [loud({ uid: 'other', name: 'Anomalous Sidearm' })]);
  const tips = {}, html = bagHtml(raid, { uid: it.uid, src: 'inv', r: 0 }, '', tips) + Object.values(tips).join('');
  for (const word of [SLOT_LABEL.weapon, 'Launcher', 'Sidearm', 'Prime', ASPECTS.twinned.name, GEAR_AFFIXES.crit.label, '4321']) assert.ok(!html.includes(word), `bag leaks ${word}`);
  assert.ok(html.includes('Sealed Prototype equipment') && html.includes(`${sealedBid(it)}`));
  assert.ok(html.includes('data-cell="3,3"') && html.includes('data-pocket="1"'), 'a 4 by 4 grid and two pockets');
  assert.ok(html.includes('--pw:2;--ph:2'), 'the parcel covers 2 by 2 cells');
});

// A stash piece at the hub, past training so normal costs apply.
const hub = () => Object.assign(P.newProfile(), { cash: 5000, samples: 5, cores: 3, tutorial: { ...P.newProfile().tutorial, done: true } });

test('hub: sell sealed for the bid or identified for its value; Process reveals the roll at drop (38, 63)', () => {
  const p = hub(), rng = new Rng(17);
  const a = rollGear(rng, { tier: 2, zone: 3, source: 'elite', rarity: 3 }), b = rollGear(rng, { tier: 2, zone: 3, source: 'elite', rarity: 3 });
  p.stash.push(a, b);
  const cash = p.cash, bid = sealedBid(a);
  assert.equal(sealedBid(b), bid);
  assert.deepEqual(P.sellItem(p, a.uid), { ok: true, cash: bid });
  assert.equal(p.cash, cash + bid);
  // Process: nothing about the roll changes; only the seal comes off.
  const before = JSON.parse(JSON.stringify(b));
  assert.ok(P.processItem(p, b.uid).ok);
  assert.deepEqual({ ...b, unid: true }, before, 'slot, name, affixes, Aspect, Prime and value are the ones rolled at drop');
  assert.equal(P.salePrice(b), gearValue(b));
  assert.equal(P.sellItem(p, b.uid).cash, gearValue(b));
});

test('hub: Process keeps the piece selected and in view; pages of 40 filter by slot, seal and quality (38)', () => {
  const p = hub(), rng = new Rng(23);
  for (let i = 0; i < 70; i++) p.stash.push(rollGear(rng, { tier: 1, zone: 2, source: 'elite' }));
  for (let i = 0; i < 15; i++) { const g = rollGear(rng, { tier: 1, zone: 2, source: 'elite' }); g.unid = false; p.stash.push(g); }
  for (let i = 0; i < 10; i++) p.stash.push(sell('Power Cell'));
  let V = stashView(p.stash);
  assert.deepEqual([V.items.length, V.pages, V.total], [40, 3, 95]);
  assert.equal(stashView(p.stash, {}, 2).items.length, 15);
  assert.ok(stashView(p.stash, {}, 0).items.slice(0, 15).every((i) => !i.unid), 'identified gear first, then sealed by visible grade');
  // A slot filter never lists a sealed piece: its slot is not known yet.
  V = stashView(p.stash, { slot: 'head' });
  assert.ok(V.all.every((i) => i.slot === 'head' && !i.unid));
  assert.equal(stashView(p.stash, { state: 'sealed' }).total, 70);
  assert.equal(stashView(p.stash, { state: 'identified', slot: 'salvage' }).total, 10);
  const q = stashView(p.stash, { quality: '1' });
  assert.ok(q.total > 0 && q.all.every((i) => i.kind === 'gear' && i.rarity === 1));
  // Sealed pieces sort by what shows: quality, then Item Power, never the hidden value.
  const sealed = stashView(p.stash, { state: 'sealed' }).all;
  for (let i = 1; i < sealed.length; i++) assert.ok(sealed[i - 1].rarity > sealed[i].rarity || (sealed[i - 1].rarity === sealed[i].rarity && sealed[i - 1].ilvl >= sealed[i].ilvl));
  // The hub keeps a processed piece selected and on the page that shows it.
  const game = { profile: p, hubFilter: { slot: 'all', state: 'sealed', quality: 'all' }, hubPage: 1, hubSel: null, hud: { tips: {} }, audio: { play() {} }, save() {} };
  const target = sealed[45];
  game.hubSel = target.uid;
  assert.ok(P.processItem(p, target.uid).ok);
  keepInView(game, target.uid);
  const page = stashView(p.stash, game.hubFilter, game.hubPage).items;
  assert.ok(page.some((i) => i.uid === target.uid) && game.hubSel === target.uid);
});

test('hub: comparison lists changed rows with units and rules gained and lost, never a score (26, 63)', () => {
  const p = hub();
  const worn = { uid: 'w', kind: 'gear', slot: 'head', rarity: 2, ilvl: 20, enh: 0, affixes: [{ k: 'cdr', v: 5 }], aspect: 'overclocked', unid: false, name: 'Resonant Coil Helm', value: 1 };
  const cand = { ...worn, uid: 'c', ilvl: 24, affixes: [{ k: 'crit', v: 4 }], aspect: 'primed', name: 'Resonant Signal Mask' };
  p.equipped.head = worn;
  const C = compareGear(p.classId, p.equipped, cand);
  const labels = C.rows.map((r) => r.label);
  assert.ok(labels.includes('Skill damage') && labels.includes('Critical chance') && labels.includes('Cooldown reduction'));
  assert.ok(labels.includes('M2 cooldown'), 'resolved cooldowns are rows too, in seconds');
  assert.ok(!labels.includes('Max health') && !labels.includes('Damage'), 'unchanged rows are left out');
  assert.deepEqual(C.rows.find((r) => r.label === 'Critical chance'), { label: 'Critical chance', unit: '%', low: false, from: 6.2, to: 10.2 }, 'base 5 + issue gloves 1.2, then +4');
  assert.equal(C.rows.find((r) => r.label === 'M2 cooldown').unit, 's');
  assert.deepEqual([C.gained, C.lost], [['primed'], ['overclocked']]);
  assert.ok(!Object.keys(C).some((k) => /score|rating|delta/i.test(k)), 'no single score');
  assert.deepEqual(compareGear(p.classId, p.equipped, { ...worn, uid: 'twin' }).rows, [], 'an identical piece changes nothing');
  // Hover (tooltip) and selection (detail panel) show the same panel.
  const panel = compareHtml(p, cand);
  assert.ok(panel.includes('Critical chance') && panel.includes('6.2% → ') && panel.includes('+ ✦ Primed') && panel.includes('− ✦ Overclocked'));
  assert.ok(itemTip(p, cand).includes(panel), 'the tooltip carries the panel');
  assert.ok(!itemTip(p, cand).includes('Compared with equipped') && !panel.includes('Gear Rating'));
  assert.equal(compareHtml(p, { ...cand, unid: true }), '', 'no comparison for a sealed piece');
});

test('hub: enhancing adds at most half the Cash spent to the sale price; a reroll never raises it (26, 38)', () => {
  const p = hub();
  const g = rollGear(new Rng(31), { tier: 3, zone: 4, nl: 1, source: 'elite', rarity: 4 });
  p.stash.push(g);
  P.processItem(p, g.uid);
  let price = P.salePrice(g), cash = p.cash;
  for (let lvl = 0; lvl < 5; lvl++) {
    assert.ok(P.enhanceItem(p, g.uid).ok);
    const spent = cash - p.cash;
    assert.ok(P.salePrice(g) - price <= Math.floor(spent / 2), `+${lvl + 1}: ${P.salePrice(g) - price} for ${spent} spent`);
    assert.ok(P.salePrice(g) <= gearValue(g));
    price = P.salePrice(g); cash = p.cash;
  }
  for (let i = 0; i < 4; i++) { assert.ok(P.rerollAffix(p, g.uid, 0).ok); assert.ok(P.salePrice(g) <= price, 'a reroll never raises it'); }
  // Enhance then sell never returns more than it cost, end to end.
  const q = hub(), h = rollGear(new Rng(32), { tier: 2, zone: 3, source: 'elite', rarity: 3 });
  q.stash.push(h); P.processItem(q, h.uid);
  const start = q.cash + P.salePrice(h);
  for (let i = 0; i < 4; i++) P.enhanceItem(q, h.uid);
  P.sellItem(q, h.uid);
  assert.ok(q.cash <= start, 'the Armory is not a mint');
});
