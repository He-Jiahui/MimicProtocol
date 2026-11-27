// What the operator carries and keeps (doc 64, package 4): sealed finds, worn slots,
// the field pack, endings, the hub economy and wear. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid } from '../src/sim/raid.js';
import { Rng } from '../src/core/rng.js';
import { RARITY, SLOT_LABEL, GEAR_AFFIXES, ASPECTS, SEALED, SEALED_BID } from '../src/sim/data.js';
import { rollGear, sealedBid, sealedView, expectedValue, worth } from '../src/sim/loot.js';
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
