// Measurement, not a test: runs the scripted bot through a full trip for each class and
// prints what happened. It is bot data, not play data: it shows whether a kit can make the
// walk, not whether the walk is fun.
//
//   node tools/trip.mjs            six seeds per class
//   node tools/trip.mjs 12         twelve seeds per class
//
// Trip: leave the Shelter, search containers until the pack is two thirds full by cells or
// over the free carry weight, then walk out by the Shelter Gate. Matron: start her fight at
// Tier 1 with issue gear and with a mid-game kit.

import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { setRoute } from '../src/sim/route.js';
import { CLASS_IDS, CLASSES, SLOTS } from '../src/sim/data.js';
import { gearStats, starterItem, rollGear } from '../src/sim/loot.js';
import { dims } from '../src/sim/pack.js';
import { Rng } from '../src/core/rng.js';
import { makeBot } from '../test/bot.js';

const N = Number(process.argv[2]) || 6, DT = 1 / 60, city = generateWorld(20261125);
const issue = () => Object.fromEntries(SLOTS.map((s) => [s, starterItem(s)]));
// A kit a few raids in: Rare pieces at Item Power 24, identified.
const mid = () => { const rng = new Rng(77); return Object.fromEntries(SLOTS.map((s) => [s, { ...rollGear(rng, { tier: 2, zone: 2, nl: 0, source: 'elite', slot: s, rarity: 2 }), unid: false }])); };
const cells = (p) => p.inv.reduce((a, it) => { const [w, h] = dims(it); return a + w * h; }, 0);
const follow = (raid, T) => { const cur = raid.route && raid.route.target; if (!cur || cur.key !== T.key) setRoute(raid, T, true); };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function trip(classId, seed) {
  const raid = new Raid({ world: city, seed, classId, gear: gearStats(issue()) });
  raid.autoPick = true;
  const bot = makeBot({ scanEvery: 0 }), p = raid.player, gate = city.extractions[0];
  let full = false, tried = new Set(), lastHurt = 'none';
  for (let t = 0; t < 900 && !raid.over; t += DT) {
    if (!full) full = cells(p) >= (p.pack.w * p.pack.h * 2) / 3 || p.kg > p.freeKg || t > 480;
    if (full) follow(raid, { kind: 'extract', id: gate.id, key: `extract:${gate.id}`, x: gate.x, z: gate.z, reach: 4, los: false });
    else {
      // Nearest unopened container out in the district that has not been given up on.
      let best = null, bd = Infinity;
      for (const c of city.containers) {
        if (raid.cont[c.id].opened || tried.has(c.id) || c.zone < 1) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) {
        follow(raid, { kind: 'trip', id: best.id, key: `trip:${best.id}`, x: best.x, z: best.z, reach: 2, los: false });
        const R = raid.route.result;
        if (R && !R.ok && !R.path) tried.add(best.id);
      }
    }
    for (const e of raid.events) if (e.t === 'hurt') lastHurt = raid.boss ? 'boss' : `zone ${raid.zone}`;
    raid.events.length = 0;
    stepRaid(raid, DT, bot(raid, DT));
  }
  if (!raid.over) raid.finish('curfew');
  const r = raid.result;
  return { out: r.outcome === 'extracted', time: r.seconds, kills: r.kills, value: r.value, speed: raid.loadedSpeed(), base: p.speed, cause: r.outcome === 'extracted' ? null : `${r.outcome} in ${lastHurt}`, payoffs: r.payoffs, searched: r.searched };
}

function matron(classId, gear, seed) {
  const raid = new Raid({ world: city, seed, classId, gear: gearStats(gear) });
  raid.autoPick = true;
  const bot = makeBot({ scanEvery: 0 }), p = raid.player, gate = city.pois.find((k) => k.type === 'boss');
  p.x = gate.x; p.z = gate.z; if (city.hasHeight) city.place(p);
  for (let i = 0; i < 4 * 60 && !raid.boss; i++) stepRaid(raid, DT, { mx: 0, mz: 0, aimX: 0, aimZ: 0, interact: true });
  const t0 = raid.time;
  for (let t = 0; t < 420 && !raid.over && !raid.bossKilled; t += DT) { raid.events.length = 0; stepRaid(raid, DT, bot(raid, DT)); }
  return { win: raid.bossKilled, time: raid.time - t0, hp: p.hp / p.maxHp };
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`Trip to a two-thirds pack and out by the Shelter Gate, issue gear, Tier 1, ${N} seeds a class (bot data)`);
console.log(pad('class', 15) + pad('extracted', 11) + pad('time', 8) + pad('kills', 7) + pad('searched', 10) + pad('value', 8) + pad('loaded m/s', 12) + pad('payoffs', 10) + 'deaths');
for (const id of CLASS_IDS) {
  const runs = []; for (let s = 1; s <= N; s++) runs.push(trip(id, 1000 + s));
  const ok = runs.filter((r) => r.out), sig = { rifleman: 'burst', blade: 'fragment', summoner: 'order', toxic: 'rupture' }[id];
  console.log(pad(CLASSES[id].name, 15) + pad(`${ok.length}/${N}`, 11) + pad(`${Math.round(median(ok.map((r) => r.time)))} s`, 8) + pad(Math.round(mean(runs.map((r) => r.kills))), 7)
    + pad(mean(runs.map((r) => r.searched)).toFixed(1), 10) + pad(Math.round(mean(ok.map((r) => r.value))), 8) + pad(`${mean(ok.map((r) => r.speed)).toFixed(1)} of ${runs[0].base.toFixed(1)}`, 12)
    + pad(Math.round(mean(runs.map((r) => (r.payoffs || {})[sig] || 0))), 10) + (runs.filter((r) => !r.out).map((r) => r.cause).join('; ') || 'none'));
}
console.log(`\nMatron of Hollows at Tier 1, ${Math.min(N, 4)} seeds a class (bot data)`);
console.log(pad('class', 15) + pad('kit', 8) + pad('wins', 7) + pad('fight', 9) + 'health left on a win');
for (const id of CLASS_IDS) for (const [name, kit] of [['issue', issue()], ['mid', mid()]]) {
  const runs = []; for (let s = 1; s <= Math.min(N, 4); s++) runs.push(matron(id, kit, 2000 + s));
  const w = runs.filter((r) => r.win);
  console.log(pad(CLASSES[id].name, 15) + pad(name, 8) + pad(`${w.length}/${runs.length}`, 7) + pad(`${Math.round(median((w.length ? w : runs).map((r) => r.time)))} s`, 9) + (w.length ? `${Math.round(100 * mean(w.map((r) => r.hp)))}%` : '-'));
}
