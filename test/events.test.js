// In-raid events (doc 20, scaled by doc 64): seeding, the cap on running events, each device's
// rule, curses, the Wager Terminal's odds and its pity, the two that fall from the sky.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { ITEMS, RAID_SECONDS } from '../src/sim/data.js';
import { EVENT, CURSES, CURSE_IDS, eventsOf, activeEvents, eventLines, eventTargets, takeCurse, wagerResult, wagerCost, hasCurse } from '../src/sim/events.js';
import { routeTargets } from '../src/sim/route.js';

const city = generateWorld(20261125), DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };
const hold = { ...idle, interact: true };
const run = (raid, s, input = idle) => { for (let i = 0; i < Math.round(s / DT); i++) stepRaid(raid, DT, input); };
const quiet = (seed = 3, o = {}) => { const raid = new Raid({ world: city, seed, classId: 'rifleman', ...o }); raid.noLethal = true; raid.waveT = 1e9; raid.surgeT = 1e9; raid.eliteT = 1e9; raid.titanT = 1e9; raid.evts.dropAt = 1e9; raid.evts.debrisAt = 1e9; return raid; };
// A raid that has an anchored event of the kind, and the operator standing at it.
function at(kind, o = {}) {
  for (let seed = 1; seed < 80; seed++) {
    const raid = quiet(seed, o), e = eventsOf(raid, kind)[0];
    if (!e) continue;
    const p = raid.player;
    p.x = e.x + 1.4; p.z = e.z;
    run(raid, 0.2);
    assert.equal(e.state, 'known', 'seen from beside it');
    return { raid, e, p };
  }
  assert.fail(`no ${kind} in 80 seeds`);
}
const clear = (raid) => { for (const m of raid.enemies) if (raid.isHostile(m)) raid.killEnemy(m); };

test('events: six anchors a raid, spread out, clear of exits, never in the Shelter, at most two of a kind', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const raid = new Raid({ world: city, seed }), L = raid.evts.list;
    assert.equal(L.length, EVENT.ANCHORS, `seed ${seed}`);
    const n = {};
    for (const e of L) {
      kinds.add(e.kind); n[e.kind] = (n[e.kind] || 0) + 1;
      assert.ok(city.zoneAt(e.x, e.z) >= 1);
      for (const x of city.extractions) assert.ok(Math.hypot(x.x - e.x, x.z - e.z) >= EVENT.CLEAR);
      for (const o of L) if (o !== e) assert.ok(Math.hypot(o.x - e.x, o.z - e.z) >= EVENT.APART);
      assert.equal(e.state, 'hidden');
      assert.equal(raid.world.cell(e.x, e.z), 2, 'the device stands on its cell');
      assert.equal(city.cell(e.x, e.z), 0, 'in this raid only');
    }
    for (const k in n) assert.ok(n[k] <= 2, `${k} x${n[k]}`);
    if (seed > 1) continue;
    const again = new Raid({ world: city, seed });
    assert.deepEqual(again.evts.list.map((e) => [e.kind, e.x, e.z]), L.map((e) => [e.kind, e.x, e.z]), 'the same seed lays the same night');
  }
  assert.deepEqual([...kinds].sort(), ['compactor', 'cursed', 'greed', 'reprinter', 'siren', 'static', 'wager']);
  assert.equal(new Raid({ world: city, seed: 1, mode: 'tutorial' }).evts.list.length, 0, 'none in training');
});

test('events: seen from 60 m, followed as a route, and known from the start in a surveyed sector', () => {
  const raid = quiet(4), e = raid.evts.list[0], p = raid.player;
  assert.equal(eventTargets(raid).length, 0);
  p.x = e.x + EVENT.SEE - 2; p.z = e.z;
  run(raid, 0.1);
  assert.equal(e.state, 'known');
  assert.ok(routeTargets(raid).some((t) => t.key === `event:${e.id}`));
  const sector = raid.sectorAt(e.x, e.z);
  const surveyed = quiet(4, { sectors: { [sector]: 1 } });
  for (const q of surveyed.evts.list) assert.equal(q.state, surveyed.sectorAt(q.x, q.z) === sector ? 'known' : 'hidden');
});

test('siren: three waves inside its leash, then a cache of one item of three', () => {
  const { raid, e, p } = at('siren');
  assert.match(raid.prompt.label.source || raid.prompt.label, /Swarm Siren/);
  run(raid, 1.6, hold);
  assert.equal(e.state, 'active');
  assert.equal(activeEvents(raid), 1);
  let waves = 0, most = 0;
  for (let i = 0; i < 60 * 120 && e.state === 'active'; i++) {
    stepRaid(raid, DT, idle);
    if (e.wave > waves) { waves = e.wave; most = Math.max(most, raid.groups[e.g].alive); }
    if (i % 30 === 0) clear(raid);
  }
  assert.equal(waves, 3);
  assert.ok(most >= EVENT.SIREN_WAVES[0], `a wave of ${most}`);
  assert.equal(e.state, 'done');
  assert.ok(raid.choice && raid.choice.ids.length === 3 && new Set(raid.choice.ids).size === 3);
  for (const id of raid.choice.ids) assert.ok(ITEMS[id].rarity >= 1, 'Enhanced or better');
  const had = p.itemCount;
  raid.pickChoice(1);
  assert.equal(p.itemCount, had + 1);
  assert.ok(p.credits > 0);
  assert.equal(raid.evts.done, 1);
});

test('siren: walking off for more than 8 s forfeits the cache', () => {
  const { raid, e, p } = at('siren');
  run(raid, 1.6, hold);
  p.x = e.x + EVENT.SIREN_LEASH + 5;
  if (!raid.world.isFree(p.x, p.z)) raid.world.resolveCircle(p, 1);
  for (let i = 0; i < 60 * (EVENT.SIREN_AWAY + 1) && e.state === 'active'; i++) { p.x = e.x + EVENT.SIREN_LEASH + 5; p.z = e.z; stepRaid(raid, DT, idle); }
  assert.equal(e.state, 'failed');
  assert.equal(raid.choice, null);
});

test('events: no more than two run at once, and the third says so', () => {
  const raid = quiet(9), p = raid.player;
  raid.evts.list.push({ id: 90, kind: 'drop', name: 'Supply Drop', x: 0, z: 0, zone: 1, state: 'landed', t: 0, life: 0, progress: 0, waveT: 99 }, { id: 91, kind: 'drop', name: 'Supply Drop', x: 0, z: 0, zone: 1, state: 'landed', t: 0, life: 0, progress: 0, waveT: 99 });
  assert.equal(activeEvents(raid), 2);
  const e = raid.evts.list.find((q) => q.kind === 'siren' || q.kind === 'greed') || Object.assign(raid.evts.list[0], { kind: 'siren' });
  e.state = 'known'; p.x = e.x + 1.4; p.z = e.z;
  run(raid, 2.5, hold);
  assert.equal(raid.prompt.ok, false);
  assert.match(raid.prompt.label.source || raid.prompt.label, /Two events are already running/);
  assert.equal(e.state, 'known');
  // The timed events wait as well.
  raid.evts.dropAt = 0; raid.pressT = 500; raid.zone = 2;
  run(raid, 0.5);
  assert.equal(raid.evts.dropped, false);
});

test('cursed cache: a curse of three until the raid ends, two sealed pieces and a Prototype choice', () => {
  const { raid, e, p } = at('cursed');
  const hp0 = p.maxHp, inv0 = p.inv.length;
  run(raid, 1.1, hold);
  assert.equal(e.state, 'done');
  assert.ok(raid.choice && raid.choice.ids.length === 3 && raid.choice.ids.every((id) => CURSES[id]));
  assert.ok(raid.choice.cards[raid.choice.ids[0]].desc, 'the card says what the curse does');
  raid.choice.ids[0] = 'frail';
  raid.pickChoice(0);
  assert.ok(hasCurse(raid, 'frail'));
  assert.equal(p.maxHp, Math.round(hp0 * 0.75));
  assert.ok(p.hp <= p.maxHp);
  const got = p.inv.length - inv0 + raid.pickups.filter((k) => k.kind === 'gear').length;
  assert.equal(got, 2, 'two sealed pieces, in the pack or on the floor beside it');
  run(raid, 0.7);
  assert.ok(raid.choice && raid.choice.ids.length === 2 && raid.choice.ids.every((id) => ITEMS[id].rarity === 3));
  raid.pickChoice(0);
  run(raid, 30);
  assert.ok(hasCurse(raid, 'frail'), 'it does not wear off');
});

test('curses: each bites where it says', () => {
  const raid = quiet(5), p = raid.player;
  // Loud: noise carries half as far again.
  const m = raid.spawnEnemy('walker', p.x + 28, p.z, { state: 'disguised' }); m.waitT = 1e9;
  raid.noise(p.x, p.z, 20);
  assert.equal(m.aware, 0);
  takeCurse(raid, 'loud');
  raid.noise(p.x, p.z, 20);
  assert.ok(m.aware > 0);
  // Sluggish: skill cooldowns a quarter longer; the basic attack and the scan are not skills.
  raid.setCd('s', 4); assert.equal(p.cd.s, 4);
  takeCurse(raid, 'sluggish');
  raid.setCd('s', 4); assert.equal(p.cd.s, 5);
  raid.setCd('scan', 4); assert.equal(p.cd.scan, 4);
  // Brittle: healing and granted barrier at 60%.
  p.hp = 10; raid.heal(20); assert.equal(p.hp, 30);
  takeCurse(raid, 'brittle');
  p.hp = 10; raid.heal(20); assert.equal(p.hp, 22);
  p.shield = 0; raid.grantShield(50, 5); assert.equal(p.shield, 30);
  // Hunted: the Alpha Hunt is brought to within a minute.
  raid.eliteT = 900; raid.pressT = 100;
  takeCurse(raid, 'hunted');
  assert.equal(raid.eliteT, 145);
  assert.equal(raid.evts.curses.size, 4);
  assert.equal(CURSE_IDS.length, 5);
});

test('wager terminal: the price climbs, three cards a terminal, and the odds are the posted ones', () => {
  const { raid, e, p } = at('wager');
  assert.equal(raid.prompt.ok, false, 'no Credits, no card');
  p.credits = 500;
  const costs = [];
  for (let k = 0; k < 3; k++) {
    costs.push(wagerCost(e));
    const before = p.credits;
    run(raid, 0.2);
    run(raid, 0.9, hold);
    assert.equal(before - p.credits >= 0 || e.last === 'refund', true);
    assert.ok(raid.choice && raid.choice.ids.length === 3 && raid.choice.cards.card1);
    raid.pickChoice(k);
    clear(raid);
    run(raid, 0.1);
  }
  assert.deepEqual(costs, [40, 50, 63]);
  assert.equal(e.state, 'done');
  // Ten thousand cards, by the roll alone.
  const T = quiet(6), t = { id: 0, kind: 'wager', x: T.player.x, z: T.player.z, zone: 2, uses: 1 }, n = { proto: 0, enhanced: 0, refund: 0, nothing: 0, ambush: 0 };
  T.autoPick = true;
  for (let i = 0; i < 10000; i++) { t.miss = 0; n[wagerResult(T, t, (i + 0.5) / 10000)]++; if (i % 50 === 0) clear(T); }
  for (const k in n) assert.ok(Math.abs(n[k] / 10000 - EVENT.WAGER_ODDS[k]) < 0.02, `${k} ${n[k]}`);
  // Two blanks at one terminal make the third pay.
  t.miss = 0;
  assert.equal(wagerResult(T, t, 0.7), 'nothing'); assert.equal(wagerResult(T, t, 0.99), 'ambush');
  assert.equal(wagerResult(T, t, 0.99), 'enhanced');
  assert.equal(t.miss, 0);
});

test('reprinter: one item for a different one of its grade, twice', () => {
  const { raid, e, p } = at('reprinter');
  assert.equal(raid.prompt.ok, false, 'nothing to trade');
  raid.giveItem('plating'); raid.giveItem('static_coil');
  const hp = p.maxHp;
  run(raid, 0.9, hold);
  assert.deepEqual([...raid.choice.ids].sort(), ['plating', 'static_coil']);
  raid.pickChoice(raid.choice.ids.indexOf('plating'));
  assert.ok(!p.items.plating && p.itemCount === 2);
  const got = Object.keys(p.items).find((id) => id !== 'static_coil');
  assert.ok(got !== 'plating' && ITEMS[got].rarity === 0);
  assert.ok(p.maxHp < hp || got === 'plating', 'the old item stops working');
  assert.equal(e.state, 'known');
  run(raid, 0.2); run(raid, 0.9, hold);
  raid.pickChoice(0);
  assert.equal(e.state, 'done');
  assert.equal(p.itemCount, 2);
});

test('compactor: three of one grade become one of the next, and it can be declined', () => {
  const { raid, e, p } = at('compactor');
  assert.equal(raid.prompt.ok, false);
  for (const id of ['static_coil', 'venom_sac', 'venom_sac', 'plating']) raid.giveItem(id);
  run(raid, 0.9, hold);
  assert.ok(raid.choice.ids.includes('keep') && !raid.choice.ids.includes('plating'), 'only a grade with three to give');
  raid.pickChoice(raid.choice.ids.indexOf('keep'));
  assert.equal(e.state, 'known'); assert.equal(p.itemCount, 4);
  run(raid, 0.2); run(raid, 0.9, hold);
  raid.pickChoice(raid.choice.ids.indexOf('venom_sac'));
  assert.ok(!raid.choice.ids.includes('keep'), 'once fed, it finishes');
  raid.pickChoice(raid.choice.ids.indexOf('venom_sac'));
  raid.pickChoice(raid.choice.ids.indexOf('static_coil'));
  assert.equal(e.state, 'done');
  assert.equal(p.itemCount, 2);
  assert.ok(Object.keys(p.items).some((id) => ITEMS[id].rarity === 3), 'three Enhanced made a Prototype');
});

test('static shrine: the horde moves up 20 s, four answer, one item of three', () => {
  const { raid, e } = at('static');
  const press = raid.pressT;
  run(raid, 0.9, hold);
  assert.equal(e.state, 'done');
  assert.ok(Math.abs(raid.pressT - press - EVENT.STATIC_PRESS - 0.9) < 0.2);
  assert.equal(raid.enemies.filter((m) => raid.isHostile(m)).length, EVENT.STATIC_BURST);
  assert.equal(raid.choice.ids.length, 3);
});

test('greed shrine: a Wanted pack with a two-affix leader; the Prototype comes when it is dead', () => {
  const { raid, e, p } = at('greed');
  run(raid, 0.9, hold);
  assert.equal(e.state, 'active');
  const pack = raid.enemies.filter((m) => m.group === e.g);
  assert.equal(pack.length, 4);
  assert.equal(pack.filter((m) => m.elite && m.elite.length === 2).length, 1);
  assert.match(eventLines(raid)[0].line.source, /Wanted pack/);
  for (const m of pack) raid.killEnemy(m);
  run(raid, 0.1);
  assert.equal(e.state, 'done');
  assert.ok(Object.keys(p.items).some((id) => ITEMS[id].rarity === 3));
});

test('supply drop: marked, lands after 20 s, opens to whoever stands by it for 30 s, recalled after 4 min', () => {
  const raid = quiet(11), p = raid.player, E = raid.evts;
  p.x = city.extractions[0].x - 30; p.z = city.extractions[0].z;
  raid.world.resolveCircle(p, 1);
  run(raid, 0.5);
  assert.ok(raid.zone >= 1 && raid.zone <= 3, `zone ${raid.zone}`);
  E.dropAt = raid.pressT + 1;
  run(raid, 1.5);
  const e = eventsOf(raid, 'drop')[0];
  assert.ok(e && e.state === 'falling' && E.dropped);
  const d = Math.hypot(e.x - p.x, e.z - p.z);
  assert.ok(d >= 12 && d <= 44, `marked ${d.toFixed(0)} m off`);
  assert.match(eventLines(raid)[0].line.source, /Lands in/);
  run(raid, EVENT.DROP_FALL);
  assert.equal(e.state, 'landed');
  run(raid, 5);
  assert.equal(e.progress, 0, 'nothing happens from a distance');
  p.x = e.x + 1.5; p.z = e.z;
  const med = p.inv.filter((i) => i.kind === 'med').length + p.pockets.filter(Boolean).length;
  for (let i = 0; i < 60 * (EVENT.DROP_HOLD + 2) && e.state === 'landed'; i++) { stepRaid(raid, DT, idle); if (i % 20 === 0) clear(raid); }
  assert.equal(e.state, 'done');
  assert.ok(raid.choice && raid.choice.ids.length === 2);
  assert.ok(p.inv.filter((i) => i.kind === 'med').length + p.pockets.filter(Boolean).length >= med, 'medkits where there is room');
  assert.equal(raid.world.cell(e.x, e.z), 0, 'the crate is gone from the grid');
  // Left alone, it is recalled.
  const R = quiet(12), q = R.player;
  q.x = city.extractions[0].x - 30; q.z = city.extractions[0].z; R.world.resolveCircle(q, 1);
  run(R, 0.5); R.evts.dropAt = R.pressT; run(R, 1);
  const c = eventsOf(R, 'drop')[0];
  c.state = 'landed'; c.life = EVENT.DROP_LIFE - 0.5; c.t = 0;
  run(R, 1);
  assert.equal(c.state, 'failed');
});

test('debris fall: only late and deep; the crater is marked, then the core is held for samples and a Rare piece', () => {
  const raid = quiet(13), p = raid.player, E = raid.evts, deep = city.pois.find((q) => q.type === 'nest');
  p.x = deep.x; p.z = deep.z + 20; raid.world.resolveCircle(p, 1);
  E.debrisAt = 0;
  // Night Level is the raid clock: 0.3 is nine minutes in, 0.45 thirteen and a half.
  const keepNl = (v) => { raid.raidTime = v * RAID_SECONDS; };
  keepNl(0.3);
  for (let i = 0; i < 120; i++) { stepRaid(raid, DT, idle); keepNl(0.3); }
  assert.ok(raid.zone >= EVENT.DEBRIS_ZONE, `zone ${raid.zone}`);
  assert.equal(eventsOf(raid, 'debris').length, 0, 'not before Night Level 0.4');
  for (let i = 0; i < 120 && !E.fallen; i++) { keepNl(0.45); stepRaid(raid, DT, idle); }
  const e = eventsOf(raid, 'debris')[0];
  assert.ok(e && e.state === 'falling');
  const mark = raid.areas.find((a) => a.kind === 'tele' && a.x === e.x && a.z === e.z);
  assert.ok(mark && mark.r === EVENT.DEBRIS_BLAST && Math.abs(mark.life - EVENT.DEBRIS_FALL) < 1e-9, 'the crater is marked for the whole fall');
  for (let i = 0; i < 60 * (EVENT.DEBRIS_FALL + 0.2); i++) { stepRaid(raid, DT, idle); clear(raid); }
  assert.equal(e.state, 'landed');
  p.x = e.x + 1.5; p.z = e.z;
  const inv = p.inv.length;
  for (let i = 0; i < 60 * (EVENT.DEBRIS_HOLD + 2) && e.state === 'landed'; i++) { stepRaid(raid, DT, idle); if (i % 20 === 0) clear(raid); }
  assert.equal(e.state, 'done');
  const gear = [...p.inv.slice(inv), ...raid.pickups.filter((k) => k.kind === 'gear').map((k) => k.item)].find((i) => i.kind === 'gear');
  assert.ok(gear && gear.rarity >= 2 && gear.unid, 'a sealed Rare or better');
  assert.ok(raid.pickups.filter((k) => k.kind === 'sample').length + raid.samples >= 4);
});
