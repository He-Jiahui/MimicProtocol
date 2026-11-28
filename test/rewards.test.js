// Reward rules settled after the Codex review of the build against notes 23, 26, 62 and 63.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { Rng } from '../src/core/rng.js';
import { ASPECTS, ASPECT_IDS, SLOTS, LATENTS, SIGNATURE, DRONES, DRONE_CASE, GEAR_AFFIX_IDS } from '../src/sim/data.js';
import { rollGear, rollAffix, affixRange, rollStrength, gearValue, sealedBid, gearStats, rollSignature, droneCase, starterItem, ROLL_TABLE } from '../src/sim/loot.js';
import { footprint } from '../src/sim/pack.js';
import { compareGear, sheet } from '../src/sim/compare.js';
import { bossKilled } from '../src/sim/boss.js';
import * as P from '../src/sim/profile.js';

const city = generateWorld(20261125);
const DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false, aimHeld: false };
const run = (raid, seconds, input = idle) => { for (let i = 0; i < seconds * 60 && !raid.over; i++) { stepRaid(raid, DT, input); raid.events.length = 0; } };
const kit = (o = {}) => { const e = {}; for (const s of SLOTS) e[s] = starterItem(s); return { ...e, ...o }; };
const worn = (slot, aspect, extra = {}) => ({ ...starterItem(slot), uid: `t-${aspect}`, starter: false, rarity: 2, aspect, ...extra });
const sandbox = (gear, o = {}) => { const r = new Raid({ world: city, seed: 5, mode: 'sandbox', gear: gearStats(gear), ...o }); r.player.crit = 0; return r; };

test('aspects: every worn slot offers at least two, each on its own kind of decision (63)', () => {
  for (const slot of SLOTS) assert.ok(ASPECT_IDS.filter((id) => ASPECTS[id].slot === slot).length >= 2, `${slot} has two Aspects`);
  // Nothing on the new slots refills a class resource for free.
  for (const id of ['braced', 'longshot', 'quickdraw', 'steadfast', 'loadbearer', 'longstep', 'tracer']) {
    for (const e of ASPECTS[id].effects || []) assert.ok(!(e.type === 'trigger' && (e.action === 'fill' || e.action === 'resource')), `${id} pays no resource`);
  }
  const rng = new Rng(4);
  for (let i = 0; i < 300; i++) { const g = rollGear(rng, { source: 'elite' }); if (g.rarity >= 2) assert.equal(ASPECTS[g.aspect].slot, g.slot); }
});

test('hands: Braced Grip and Long Sight raise a deliberate weapon hit and nothing else (63)', () => {
  const hit = (aspect, setup, o = { aimed: true }, type = 'ballistic') => {
    const raid = sandbox(kit({ hands: worn('hands', aspect) })), p = raid.player;
    const e = raid.spawnEnemy('dummy', p.x + 6, p.z); e.hp = e.maxHp = 9999; e.state = 'hunt';
    setup(raid, e);
    return raid.playerHit(e, 100, type, o);
  };
  // Both are lines in the hit's damage pool, so on a base of 100 they add 25 and 20.
  const base = hit(null, () => {}), m2 = hit(null, () => {}, { aimed: true, m2: true });
  const near = (v, want, why) => assert.ok(Math.abs(v - want) < 0.01, `${why}: ${v.toFixed(2)} vs ${want.toFixed(2)}`);
  near(hit('braced', (r) => { r.player.stillT = 0.7; }), base + 25, 'still for 0.6 s');
  near(hit('braced', (r) => { r.player.stillT = 0.2; }), base, 'not yet braced');
  near(hit('braced', (r) => { r.player.stillT = 2; }, { aimed: false }), base, 'sentries, splash and copies get nothing');
  near(hit('braced', (r) => { r.player.stillT = 2; }, { aimed: true, m2: true }), m2, 'nor does M2');
  near(hit('longshot', (r, e) => { e.x = r.player.x + 19; }), base + 20, '18 m or more');
  near(hit('longshot', (r, e) => { e.x = r.player.x + 10; }), base, 'closer than 18 m');
  // Standing still is tracked by the raid itself.
  const raid = sandbox(kit({ hands: worn('hands', 'braced') }));
  run(raid, 0.8);
  assert.ok(raid.player.stillT >= 0.6);
  run(raid, 0.1, { ...idle, mx: 1 });
  assert.ok(raid.player.stillT < 0.1, 'a step resets it');
});

test('waist: a medkit goes on faster or under cover, with the same heal and no free kit (63)', () => {
  const heal = (aspect) => {
    const raid = sandbox(kit(aspect ? { waist: worn('waist', aspect) } : {})), p = raid.player;
    p.hp = 1; const kits = p.medkits;
    let t = 0;
    stepRaid(raid, DT, { ...idle, quick1: true });
    while (p.medT > 0 && t < 5) { stepRaid(raid, DT, idle); t += DT; }
    return { gained: p.hp - 1 - (p.regen || 0) * t, t, used: kits - p.medkits, max: p.maxHp };
  };
  const plain = heal(null), quick = heal('quickdraw');
  assert.equal(plain.used, 1); assert.equal(quick.used, 1);
  assert.ok(Math.abs(plain.t - 1.5) < 0.05 && Math.abs(quick.t - 0.9) < 0.05);
  assert.ok(Math.abs(plain.gained - quick.gained) < plain.max * 0.02, 'the same health over less time');
  const raid = sandbox(kit({ waist: worn('waist', 'steadfast') })), p = raid.player;
  p.hp = p.maxHp; raid.damagePlayer(20, p.x + 1, p.z);
  const open = p.maxHp - p.hp;
  p.hp = p.maxHp; p.medT = 1; raid.damagePlayer(20, p.x + 1, p.z);
  assert.ok(Math.abs((p.maxHp - p.hp) / open - 0.7) < 0.01, 'treating a wound under Field Dressing takes 30% less');
});

test('shoes and head: a further dash, a heavier free load, a longer trace for a slower scan (63)', () => {
  const s0 = sandbox(kit()), far = sandbox(kit({ shoes: worn('shoes', 'longstep') })), load = sandbox(kit({ shoes: worn('shoes', 'loadbearer') }));
  assert.ok(Math.abs(far.skillBuild.slots.s.params.distance - s0.skillBuild.slots.s.params.distance - 1.5) < 1e-9);
  assert.equal(far.skillBuild.slots.s.params.cd, s0.skillBuild.slots.s.params.cd, 'no cooldown or charges with it');
  assert.equal(load.player.freeKg, s0.player.freeKg + 4);
  const plain = sandbox(kit()), tr = sandbox(kit({ head: worn('head', 'tracer') }));
  for (const r of [plain, tr]) { const e = r.spawnEnemy('walker', r.player.x + 6, r.player.z, { state: 'disguised' }); r.doScan(); r.seen = e; }
  assert.equal(tr.seen.outlineT - plain.seen.outlineT, 4);
  assert.equal(tr.player.cd.scan - plain.player.cd.scan, 2);
});

test('rolls: a line saves its place and table version; Prime sits in the top tenth (23, 26)', () => {
  const rng = new Rng(11);
  for (let i = 0; i < 400; i++) {
    const k = rng.pick(GEAR_AFFIX_IDS), prime = i % 2 === 0, a = rollAffix(rng, k, 24, prime), [lo, hi] = affixRange(k, 24);
    assert.equal(a.tv, ROLL_TABLE);
    assert.ok(a.r >= 0 && a.r <= 1);
    assert.ok(Math.abs(a.v - (lo + (hi - lo) * a.r)) <= 0.051, 'the value is the place in the range');
    if (prime) assert.ok(a.r >= 0.9, `Prime line at ${a.r}`);
  }
  // A reroll on a Prime piece keeps the floor.
  const p = P.newProfile(); p.tutorial.done = true; p.cash = 9999; p.samples = 99;
  const g = rollGear(new Rng(3), { source: 'elite', rarity: 3 }); g.prime = true; g.unid = false; g.affixes = g.affixes.map((a) => rollAffix(new Rng(9), a.k, g.ilvl, true));
  p.stash.push(g);
  for (let i = 0; i < 12; i++) { const res = P.rerollAffix(p, g.uid, i % g.affixes.length); assert.ok(res.ok); assert.ok(res.affix.r >= 0.9); }
  // A legacy line keeps its exact value and still prices.
  const old = { ...g, uid: 'old', prime: false, affixes: [{ k: 'dmg', v: 7.3 }] };
  assert.equal(gearStats(kit({ weapon: { ...old, slot: 'weapon' } })).dmg >= 7.3, true);
  assert.ok(rollStrength(old) >= 0 && rollStrength(old) <= 1);
});

test('price: strong rolls are worth more identified, equal grades bid the same sealed, a reroll never raises the price (26, 38)', () => {
  const mk = (r) => ({ uid: 'x' + r, kind: 'gear', slot: 'body', rarity: 2, ilvl: 30, enh: 0, prime: false, aspect: null, unid: true, affixes: [{ k: 'hp', r, tv: 2, v: 1 }, { k: 'dr', r, tv: 2, v: 1 }] });
  const low = mk(0.05), high = mk(0.95);
  assert.equal(sealedBid(low), sealedBid(high), 'sealed, the roll is not for sale');
  assert.ok(gearValue(high) > gearValue(low) * 1.25, 'identified, it is');
  assert.ok(sealedBid(low) < gearValue(mk(0.5)), 'the bid stays under an average piece');
  const p = P.newProfile(); p.tutorial.done = true; p.cash = 99999; p.samples = 999;
  const g = { ...mk(0.02), unid: false }; g.value = gearValue(g); p.stash.push(g);
  const before = P.salePrice(g);
  for (let i = 0; i < 30; i++) P.rerollAffix(p, g.uid, i % 2);
  assert.ok(rollStrength(g) > 0.1, 'the lines did get better');
  assert.ok(P.salePrice(g) <= before, 'but the price did not rise');
});

test('signature: the Matron drops Hollow Heart until one is banked, then by chance with pity (23)', () => {
  const kill = (signature, seed = 5) => {
    const raid = new Raid({ world: city, seed, signature }); raid.autoPick = true;
    raid.boss = { active: true }; raid.bossArena = { sealed: true, x: city.boss.x, z: city.boss.z, r: city.boss.r };
    const m = raid.spawnEnemy('matron', city.boss.x, city.boss.z);
    bossKilled(raid, m);
    return raid;
  };
  const sure = kill({ sure: true, pity: 0 });
  assert.equal(sure.signatureDropped, true);
  const piece = sure.pickups.map((k) => k.item).find((i) => i && i.latent);
  assert.equal(piece.latent, 'hollow_heart'); assert.equal(piece.rarity, 4); assert.equal(piece.slot, 'weapon'); assert.equal(piece.unid, true, 'sealed like any find');
  assert.ok(piece.aspect && ASPECTS[piece.aspect].slot === 'weapon', 'beside, not instead of, the slot Aspect');
  assert.equal(kill(null).signatureDropped, false, 'no profile, no signature');
  let drops = 0;
  for (let s = 1; s <= 200; s++) if (kill({ sure: false, pity: 0 }, s).signatureDropped) drops++;
  assert.ok(Math.abs(drops / 200 - SIGNATURE.chance) < 0.07, `${drops}/200 at the base chance`);
  assert.equal(kill({ sure: false, pity: 9 }).signatureDropped, true, 'pity makes it certain in the end');
  // The profile: sure until a kill is banked; pity counts banked kills without it and resets with it.
  const p = P.newProfile(); p.tutorial.done = true;
  assert.equal(P.deployment(p).signature.sure, true);
  const res = (signature, outcome = 'extracted') => ({ mode: 'raid', outcome, tier: 1, classId: 'rifleman', value: 0, bonus: 0, contractPay: 0, bossCash: 0, credits: 0, creditCash: 0, penalty: 0, inv: [], cargo: [], lost: 0, pack: null, samples: 0, cores: 0, bossKilled: outcome === 'extracted', kills: 0, elites: 0, civKills: 0, items: 0, level: 1, zmax: 1, nl: 0, clock: 19, seconds: 60, searched: 0, contracts: [], signature, taken: 0 });
  P.applyRaidResult(p, res(true, 'dead'));
  assert.equal(P.deployment(p).signature.sure, true, 'a kill that was not banked changes nothing');
  P.applyRaidResult(p, res(true));
  assert.deepEqual({ ...P.deployment(p).signature }, { sure: false, pity: 0 });
  P.applyRaidResult(p, res(false)); P.applyRaidResult(p, res(false));
  assert.equal(P.deployment(p).signature.pity, 2);
  P.applyRaidResult(p, res(true));
  assert.equal(P.deployment(p).signature.pity, 0);
});

test('Hollow Heart: a deliberate weapon kill may burst the body, loudly; its own kills never do (23, 26)', () => {
  const piece = { ...rollSignature(new Rng(2), {}), unid: false };
  const raid = sandbox(kit({ weapon: piece })), p = raid.player, L = LATENTS.hollow_heart;
  assert.ok(raid.latent.has('hollow_heart'));
  raid.rCombat.chance = () => true;      // every roll succeeds: the chance itself is data
  const mk = (dx, hp) => { const e = raid.spawnEnemy('walker', p.x + dx, p.z); e.state = 'hunt'; e.hp = e.maxHp = hp; e.speed = 0; return e; };
  const a = mk(6, 5), b = mk(7.5, 30), c = mk(8.5, 30), far = mk(6 + L.radius + 3, 30);
  let noise = 0; const n0 = raid.noise.bind(raid); raid.noise = (x, z, r) => { noise = Math.max(noise, r); n0(x, z, r); };
  raid.playerHit(a, 50, 'ballistic', { aimed: true });
  assert.equal(a.dead, true);
  assert.ok(b.dead && c.dead, 'the burst reaches 3 m');
  assert.equal(far.dead, false, 'and no further: the bodies it killed did not burst in turn');
  assert.equal(noise, L.noise, 'the drawback is the noise');
  // Not from a skill, a tick or anything not aimed.
  const d = mk(6, 5), e2 = mk(7, 30);
  raid.playerHit(d, 50, 'skill', { aimed: true, m2: true });
  assert.equal(d.dead, true); assert.equal(e2.dead, false);
});

test('drone case: found as cargo, opened at the Lab for a later deployment (62)', () => {
  const rng = new Rng(8), c = droneCase(rng);
  assert.equal(c.kind, 'drone'); assert.equal(c.unid, true);
  assert.deepEqual(footprint(c), DRONE_CASE);
  assert.ok(c.value < DRONES[c.drone].cash, 'cheaper sold sealed than a drone costs');
  // Carrying one out does nothing for this trip.
  const raid = new Raid({ world: city, seed: 3 });
  assert.ok(raid.addInv(c));
  assert.equal(raid.drone, null);
  raid.finish('extracted');
  const p = P.newProfile(); p.tutorial.done = true; p.samples = 1;
  P.applyRaidResult(p, raid.result);
  assert.ok(p.stash.some((i) => i.uid === c.uid));
  assert.equal(p.drones[c.drone], 0);
  const out = P.processItem(p, c.uid);
  assert.equal(out.ok, true);
  assert.equal(p.drones[c.drone], 1);
  assert.equal(p.samples, 0);
  assert.equal(p.stash.some((i) => i.uid === c.uid), false);
});

test('comparison: training and the class tree are in the baseline on both sides (26, 52)', () => {
  const p = P.newProfile(); p.tutorial.done = true; p.classId = 'blade';
  const dep = P.deployment(p);
  const bare = sheet('blade', p.equipped), trained = sheet('blade', p.equipped, dep);
  const hp = (s) => s.rows.find((r) => r.label === 'Max health').value;
  assert.ok(hp(trained) > hp(bare), 'Conditioning shows in Max health');
  const cand = { ...starterItem('body'), uid: 'cand', starter: false, rarity: 2, ilvl: 30, affixes: [{ k: 'hp', v: 10 }], aspect: 'second_wind' };
  const C = compareGear('blade', p.equipped, cand, dep), row = C.rows.find((r) => r.label === 'Max health');
  assert.equal(row.from, hp(trained), 'the worn side starts from the trained sheet');
  assert.deepEqual(C.gained, ['second_wind']);
  const sig = { ...rollSignature(new Rng(2), {}), unid: false };
  assert.deepEqual(compareGear('blade', p.equipped, sig, dep).latentGained, ['hollow_heart']);
});

// Note 58's test of a base kit: its signature must happen in an ordinary room, with no rare
// drop, talent or boss. Five Husks at Calm-zone Tier 1 numbers, M1, M2 and S only, 25 s.
import { makeBot } from './bot.js';
for (const [classId, sig, what] of [['rifleman', 'burst', 'a mark burst'], ['blade', 'fragment', 'a fragment barrier'], ['summoner', 'order', 'an Order burst'], ['toxic', 'rupture', 'a rupture']]) {
  test(`ordinary room: the ${classId} kit pays ${what} against five Husks (58)`, () => {
    const out = city.resolveCircle({ x: city.insertion.x, z: city.insertion.z - 60 }, 1);
    for (const seed of [11, 12, 13]) {
      const raid = new Raid({ world: city, seed, classId, mode: 'sandbox' });
      raid.autoPick = true;
      const p = raid.player, bot = makeBot({ scanEvery: 0 });
      p.x = out.x; p.z = out.z; if (city.hasHeight) city.place(p);
      for (let k = 0; k < 5; k++) { const e = raid.spawnEnemy('walker', out.x - 10 + k * 5, out.z - 9 - (k % 2) * 2); e.state = 'hunt'; }
      for (let t = 0; t < 25 && !raid.over && !raid.payoffs[sig]; t += DT) { const input = bot(raid, DT); input.ult = false; stepRaid(raid, DT, input); raid.events.length = 0; }
      assert.ok(raid.payoffs[sig] >= 1, `seed ${seed}: no ${sig} in 25 s (kills ${raid.kills}, payoffs ${JSON.stringify(raid.payoffs)})`);
    }
  });
}
