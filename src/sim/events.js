// In-raid events (doc 20), scaled to the one 500 m district (doc 64). Seven kinds stand at
// anchors seeded for each raid, so the same streets ask something different every night:
// a Swarm Siren, a Cursed Cache, a Wager Terminal, a Reprinter, a Compactor, a Static Shrine
// and a Greed Shrine. Two more arrive on their own: a Supply Drop Command sends once the
// operator is out in the district, and a Debris Fall late in the night in the worst zones.
//
// Scale (doc 64): six anchors a raid, none within 60 m of another or 40 m of an exit, none
// in the Shelter; each kind at most twice; at most two events running at once. An event is
// seen from 60 m, or from the start in a sector Command has surveyed (doc 21).
//
// Doc 34's caution holds: an event pays with a choice, never with a pile. The field jobs of
// jobs.js cover doc 20's rescue and relay; the fixed Signal Shrine is its Blood Shrine.

import { dist } from '../core/math.js';
import { ITEMS, ITEM_IDS, AUTO_CAP } from './data.js';
import { rollRunItem, rollGear } from './loot.js';
import { advancePressure } from './jobs.js';
import { message } from '../i18n/index.js';

export const EVENT = {
  ANCHORS: 6, APART: 60, CLEAR: 40, SEE: 60, MAX_ACTIVE: 2,
  SIREN_WAVES: [6, 9, 12], SIREN_LEASH: 30, SIREN_AWAY: 8, SIREN_GAP: 25, SIREN_NOISE: 45,
  WAGER: 40, WAGER_UP: 1.25, WAGER_MAX: 3, WAGER_ODDS: { proto: 0.08, enhanced: 0.32, refund: 0.2, nothing: 0.25, ambush: 0.15 },
  REPRINTS: 2, COMPACT: 3, STATIC_PRESS: 20, STATIC_BURST: 4,
  DROP_FALL: 20, DROP_HOLD: 30, DROP_LIFE: 240, DROP_R: 5, DROP_WAVE: 10, DROP_AFTER: [110, 170],
  DEBRIS_NL: 0.4, DEBRIS_ZONE: 3, DEBRIS_FALL: 20, DEBRIS_HOLD: 30, DEBRIS_R: 5, DEBRIS_BLAST: 7, DEBRIS_WAVE: 10, DEBRIS_AFTER: [40, 100],
};
export const EVENT_NAMES = {
  siren: 'Swarm Siren', cursed: 'Cursed Cache', wager: 'Wager Terminal', reprinter: 'Reprinter', compactor: 'Compactor',
  static: 'Static Shrine', greed: 'Greed Shrine', drop: 'Supply Drop', debris: 'Debris Fall',
};
// One colour a kind: the same on the ground, on the map and in the tracker.
export const EVENT_COL = { siren: [1.0, 0.82, 0.25], cursed: [0.78, 0.5, 1.0], wager: [0.45, 0.9, 1.0], reprinter: [0.4, 1.0, 0.75], compactor: [1.0, 0.62, 0.2], static: [0.5, 0.7, 1.0], greed: [1.0, 0.78, 0.2], drop: [0.5, 0.9, 1.0], debris: [1.0, 0.5, 0.15] };
// What each asks and pays, said before the operator commits.
export const EVENT_TERMS = {
  siren: 'Sound it and hold within 30 m through three waves. The cache pays one item of three.',
  cursed: 'Take one of three curses until you leave the district. Two sealed pieces and a Prototype choice.',
  wager: 'Pay Credits and turn one card of three. The price rises with each wager.',
  reprinter: 'Trade one run item for a different one of its grade. Two uses.',
  compactor: 'Feed three run items of one grade for one of the next. One use.',
  static: 'The horde moves up 20 s and four answer at once. Choose one item of three.',
  greed: 'A Wanted pack answers. Kill it for a Prototype item.',
  drop: 'Stand by the crate for 30 s while they converge. It is recalled after 4 minutes.',
  debris: 'Stand clear of the impact, then stay by the core for 30 s. Lab Samples and a sealed Rare piece.',
};
// Zones each anchored kind may stand in, and how often it is picked.
const KINDS = {
  siren: { z: [1, 4], w: 3 }, cursed: { z: [2, 4], w: 2 }, wager: { z: [2, 4], w: 2 }, reprinter: { z: [1, 3], w: 2 },
  compactor: { z: [2, 4], w: 1.5 }, static: { z: [2, 4], w: 2 }, greed: { z: [3, 4], w: 1.5 },
};
// Curses last until extraction (doc 20, section 4). Their effects are read where they bite:
// Raid.recalc (Frail), noise (Loud), the cooldown start (Sluggish), heal and barrier (Brittle).
export const CURSES = {
  frail: { name: 'Frail', desc: 'Maximum health -25%' },
  loud: { name: 'Loud', desc: 'Everything you do is heard half as far again' },
  sluggish: { name: 'Sluggish', desc: 'Skill cooldowns +25%' },
  hunted: { name: 'Hunted', desc: 'An Alpha Hunt comes for you within a minute' },
  brittle: { name: 'Brittle', desc: 'Barriers and healing -40%' },
};
export const CURSE_IDS = Object.keys(CURSES);
export const hasCurse = (raid, id) => !!(raid.evts && raid.evts.curses.has(id));

const sealed = (raid, zone, o = {}) => rollGear(raid.rLoot, { tier: raid.tier, zone, nl: raid.nl, source: 'elite', ...o });
// n different run items of at least a grade (0 Common, 1 Enhanced, 3 Prototype).
function pickItems(raid, n, min, zone) {
  const out = [];
  for (let k = 0; k < 40 && out.length < n; k++) { const id = rollRunItem(raid.rLoot, raid.quality(zone), min); if (!out.includes(id)) out.push(id); }
  return out;
}

// ---------------------------------------------------------------- seeding
export function initEvents(raid) {
  const E = raid.evts = { list: [], curses: new Set(), dropAt: Infinity, debrisAt: Infinity, dropped: false, fallen: false, done: 0 };
  if (raid.mode !== 'raid') return;
  const w = raid.world, rng = raid.rEvent;
  E.dropAt = rng.range(...EVENT.DROP_AFTER);
  E.debrisAt = rng.range(...EVENT.DEBRIS_AFTER);
  // Anchors: open, reachable pavement out in the district, clear of the exits, the Shelter,
  // the lair and the field jobs.
  const keep = [w.insertion, ...w.extractions.filter(Boolean), ...w.pois.filter((p) => p.type === 'boss' || p.type === 'nest' || p.type === 'broker'), ...(raid.jobs ? raid.jobs.list : [])];
  const cands = [];
  for (const b of w.blocks) for (const q of b.ped) {
    const zone = w.zoneAt(q.x, q.z);
    if (zone < 1 || !w.circleFree(q.x, q.z, 1.5) || (w.hasHeight && w.floorAt(q.x, q.z) !== 0)) continue;
    if (w.boss && Math.abs(q.x - w.boss.x) < (w.boss.hx || w.boss.r) + 6 && Math.abs(q.z - w.boss.z) < (w.boss.hz || w.boss.r) + 8) continue;
    if (keep.some((k) => dist(k.x, k.z, q.x, q.z) < EVENT.CLEAR)) continue;
    cands.push({ x: q.x, z: q.z, zone });
  }
  rng.shuffle(cands);
  const count = {}, spots = [];
  for (const c of cands) {
    if (spots.length >= EVENT.ANCHORS) break;
    if (spots.some((s) => dist(s.x, s.z, c.x, c.z) < EVENT.APART)) continue;
    const ids = Object.keys(KINDS).filter((k) => c.zone >= KINDS[k].z[0] && c.zone <= KINDS[k].z[1] && (count[k] || 0) < 2);
    if (!ids.length) continue;
    // A kind not yet placed is preferred, so a raid shows a spread and not six sirens.
    const kind = ids[rng.weighted(ids.map((k) => KINDS[k].w / (1 + 3 * (count[k] || 0))))];
    count[kind] = (count[kind] || 0) + 1;
    spots.push(c);
    add(raid, kind, c.x, c.z, { state: raid.sectorLevel(c.x, c.z) >= 1 ? 'known' : 'hidden' });
    w.fillRect(c.x - 0.5, c.z - 0.5, c.x + 0.5, c.z + 0.5, 2);     // the device stands on its cell, in this raid's grid
  }
}
function add(raid, kind, x, z, extra = {}) {
  const E = raid.evts, e = { id: E.list.length, kind, name: EVENT_NAMES[kind], x, z, zone: Math.max(1, raid.world.zoneAt(x, z)), state: 'hidden', t: 0, uses: 0, progress: 0, ...extra };
  E.list.push(e);
  return e;
}
export const eventsOf = (raid, kind) => (raid.evts ? raid.evts.list.filter((e) => e.kind === kind) : []);
const running = (e) => e.state === 'active' || e.state === 'falling' || e.state === 'landed';
export const activeEvents = (raid) => (raid.evts ? raid.evts.list.filter(running).length : 0);
const room = (raid, want) => Math.max(0, Math.min(want, AUTO_CAP - raid.aliveHostile));

// ---------------------------------------------------------------- the clock
export function updateEvents(raid, dt) {
  const E = raid.evts;
  if (!E || raid.mode !== 'raid') return;
  const p = raid.player, scanned = raid.scanFx && raid.scanFx.t < 0.25;
  timed(raid, E);
  for (const e of E.list) {
    if (e.state === 'hidden') {
      const d = dist(e.x, e.z, p.x, p.z);
      if (d < EVENT.SEE || (scanned && d < raid.scanFx.r + 20)) { e.state = 'known'; raid.emit({ t: 'event', id: e.id, state: 'known' }); }
      continue;
    }
    if (!running(e)) continue;
    e.t += dt;
    if (e.kind === 'siren') sirenTick(raid, e, dt);
    else if (e.kind === 'greed') { if (raid.groups[e.g].alive <= 0) { raid.giveItem(rollRunItem(raid.rLoot, raid.quality(e.zone), 3)); finish(raid, e, 'The pack is dead: the shrine pays'); } }
    else fallTick(raid, e, dt);
  }
}
function finish(raid, e, text, ok = true) {
  e.state = ok ? 'done' : 'failed';
  if (ok) raid.evts.done++;
  const detail = typeof text === 'string' ? message(text) : text;
  raid.toast(message('{name}: {text}', { name: message(e.name), text: detail }), ok ? '#ffd76a' : '#ff9a8f', ok ? 'complete' : 'warning');
  raid.emit({ t: 'event', id: e.id, state: e.state });
  raid.sfx(ok ? 'win' : 'lose');
}

// A Supply Drop once the operator is out in the district; a Debris Fall late, in the worst zones.
function timed(raid, E) {
  const zone = raid.zone, fight = raid.boss && raid.boss.active;
  if (fight || activeEvents(raid) >= EVENT.MAX_ACTIVE) return;
  const fall = (kind) => {
    const p = raid.player, s = raid.hiddenSpot(p.x, p.z, 26, 42);
    if (!s || dist(s.x, s.z, p.x, p.z) < 12 || raid.world.zoneAt(s.x, s.z) < 1) return null;
    const e = add(raid, kind, s.x, s.z, { state: 'falling', waveT: 0, life: 0 });
    raid.emit({ t: 'event', id: e.id, state: 'falling' });
    return e;
  };
  if (!E.dropped && raid.pressT >= E.dropAt && zone >= 1 && zone <= 3) {
    const e = fall('drop');
    if (e) {
      E.dropped = true;
      raid.banner('SUPPLY DROP', message('Command marked a crate at {ref}. It lands in {s} s.', { ref: raid.world.refAt(e.x, e.z), s: EVENT.DROP_FALL }), '#7fe9ff');
      raid.relay(message('Relay: Supply crate inbound at {ref}. {terms}', { ref: raid.world.refAt(e.x, e.z), terms: message(EVENT_TERMS.drop) }));
      raid.sfx('banner');
    }
  } else if (!E.fallen && raid.nl >= EVENT.DEBRIS_NL && zone >= EVENT.DEBRIS_ZONE) {
    if (E.debrisFrom === undefined) E.debrisFrom = raid.pressT;
    if (raid.pressT - E.debrisFrom < E.debrisAt) return;
    const e = fall('debris');
    if (e) {
      E.fallen = true;
      raid.banner('DEBRIS FALL', message('Something is coming down at {ref}. Impact in {s} s.', { ref: raid.world.refAt(e.x, e.z), s: EVENT.DEBRIS_FALL }), '#ff9230');
      raid.relay(message('Relay: A piece of the vessel is falling at {ref}. {terms}', { ref: raid.world.refAt(e.x, e.z), terms: message(EVENT_TERMS.debris) }));
      // The crater is marked from the first second; whatever stands in it pays for it.
      raid.enemyBlast(e.x, e.z, EVENT.DEBRIS_BLAST, EVENT.DEBRIS_FALL, raid.player.maxHp * 0.45, [1, 0.5, 0.15], { shake: 0.9 });
      raid.sfx('boss');
    }
  }
}

function sirenTick(raid, e, dt) {
  const p = raid.player, G = raid.groups[e.g];
  if (dist(p.x, p.z, e.x, e.z) > EVENT.SIREN_LEASH) { e.away += dt; if (e.away > EVENT.SIREN_AWAY) { finish(raid, e, 'left unanswered: the cache stays shut', false); return; } } else e.away = 0;
  e.nextT -= dt;
  const waves = EVENT.SIREN_WAVES;
  if (e.wave < waves.length && (e.wave === 0 || G.alive <= 2 || e.nextT <= 0)) {
    const n = room(raid, waves[e.wave]);
    e.wave++; e.nextT = EVENT.SIREN_GAP;
    if (n > 0) raid.aliveHostile += raid.spawnWave(n, { near: e, rmin: 16, rmax: 26, group: e.g }).length;
    // Late in the night the last wave is led (doc 20).
    if (e.wave === waves.length && raid.nl >= 0.5 && room(raid, 1)) {
      const s = raid.hiddenSpot(e.x, e.z, 16, 26);
      raid.aliveHostile += raid.spawnPack(s.x, s.z, ['walker'], { state: 'hunt', group: e.g, elite: raid.rollAffixes() }).length;
    }
    raid.banner(message('SIREN WAVE {n} OF {total}', { n: e.wave, total: waves.length }), 'They are answering the siren.', '#ffd76a');
    raid.sfx('wave');
    e.progress = (e.wave - 1) / waves.length;
    return;
  }
  if (e.wave >= waves.length && G.alive <= 0) {
    const credits = raid.addCredits(Math.round(30 * (1 + 0.3 * e.zone)));
    finish(raid, e, message('the cache opens · +{credits} Credits', { credits }));
    raid.offerChoice('SIREN CACHE: choose one', pickItems(raid, 3, 1, e.zone), (id) => raid.giveItem(id));
  }
}

// A crate or a core: it falls, then is held by standing next to it while they converge.
function fallTick(raid, e, dt) {
  const p = raid.player, drop = e.kind === 'drop';
  if (e.state === 'falling') {
    e.progress = Math.min(1, e.t / (drop ? EVENT.DROP_FALL : EVENT.DEBRIS_FALL));
    if (e.progress < 1) return;
    e.state = 'landed'; e.t = 0; e.progress = 0; e.life = 0; e.waveT = 3;
    raid.world.fillRect(e.x - 0.5, e.z - 0.5, e.x + 0.5, e.z + 0.5, 2);
    raid.emit({ t: 'explode', x: e.x, z: e.z, r: drop ? 3 : EVENT.DEBRIS_BLAST, col: drop ? [0.5, 0.9, 1] : [1, 0.5, 0.15], shake: drop ? 0.25 : 0 });
    raid.noise(e.x, e.z, drop ? 25 : 40);
    raid.toast(message(drop ? 'The crate is down at {ref}' : 'The core is exposed at {ref}', { ref: raid.world.refAt(e.x, e.z) }), drop ? '#7fe9ff' : '#ff9230');
    return;
  }
  e.life += dt;
  const hold = drop ? EVENT.DROP_HOLD : EVENT.DEBRIS_HOLD, inside = !p.dead && dist(p.x, p.z, e.x, e.z) <= (drop ? EVENT.DROP_R : EVENT.DEBRIS_R);
  if (inside) {
    e.progress = Math.min(1, e.progress + dt / hold);
    e.waveT -= dt;
    if (e.waveT <= 0) {
      e.waveT = drop ? EVENT.DROP_WAVE : EVENT.DEBRIS_WAVE;
      const n = room(raid, drop ? 4 : 5);
      if (n > 0) raid.aliveHostile += raid.spawnWave(n, { near: e, rmin: 16, rmax: 26 }).length;
    }
  }
  if (e.progress >= 1) {
    raid.world.fillRect(e.x - 0.5, e.z - 0.5, e.x + 0.5, e.z + 0.5, 0);
    if (drop) {
      for (let k = 0; k < 2; k++) if (raid.medRoom()) raid.addInv(raid.medkit());
      finish(raid, e, 'opened · 2 medkits');
      raid.offerChoice('SUPPLY DROP: choose one', pickItems(raid, 2, 1, e.zone), (id) => raid.giveItem(id));
    } else {
      for (let k = 0; k < 4; k++) raid.dropPickup('sample', e.x + Math.cos(k * 1.57) * 1.6, e.z + Math.sin(k * 1.57) * 1.6);
      let g = sealed(raid, e.zone);
      if (g.rarity < 2) g = sealed(raid, e.zone, { rarity: 2 });
      raid.stow(g, e.x, e.z);
      finish(raid, e, 'the core is yours · 4 Lab Samples and a sealed piece');
    }
  } else if (drop && e.life >= EVENT.DROP_LIFE) {
    raid.world.fillRect(e.x - 0.5, e.z - 0.5, e.x + 0.5, e.z + 0.5, 0);
    finish(raid, e, 'recalled unopened', false);
  }
}

// ---------------------------------------------------------------- interaction
const rarityCount = (p, r) => Object.entries(p.items).reduce((a, [id, n]) => a + (ITEMS[id].rarity === r ? n : 0), 0);
export const wagerCost = (e) => Math.round(EVENT.WAGER * Math.pow(EVENT.WAGER_UP, e.uses));
// The nearest device within reach, as an offer in the shape findInteract uses.
export function eventInteract(raid) {
  const E = raid.evts, p = raid.player;
  if (!E) return null;
  let best = null, bd = Infinity;
  for (const e of E.list) {
    if (e.state !== 'known' || !KINDS[e.kind]) continue;
    const d = dist(e.x, e.z, p.x, p.z);
    if (d > 2.6 || d >= bd) continue;
    const full = activeEvents(raid) >= EVENT.MAX_ACTIVE, starts = e.kind === 'siren' || e.kind === 'greed';
    let ok = true, need = 0.8, label;
    switch (e.kind) {
      case 'siren': need = 1.5; label = 'Sound the Swarm Siren (three waves, loud)'; break;
      case 'cursed': need = 1; label = 'Open the Cursed Cache (choose a curse)'; break;
      case 'wager': {
        const cost = wagerCost(e);
        ok = p.credits >= cost;
        label = message(ok ? 'Wager Terminal: {cost} Credits for a card' : 'Wager Terminal: {cost} Credits (not enough)', { cost });
        break;
      }
      case 'reprinter': ok = p.itemCount > 0; label = ok ? message('Reprinter: trade one run item ({left} left)', { left: EVENT.REPRINTS - e.uses }) : 'Reprinter: no run item to trade'; break;
      case 'compactor': ok = rarityCount(p, 0) >= EVENT.COMPACT || rarityCount(p, 1) >= EVENT.COMPACT; label = ok ? 'Compactor: feed three items of one grade' : 'Compactor: needs three run items of one grade'; break;
      case 'static': label = 'Static Shrine: draw the horde for one item of three'; break;
      default: label = 'Greed Shrine: call a Wanted pack for a Prototype'; break;
    }
    if (starts && full) { ok = false; label = 'Two events are already running'; }
    bd = d;
    best = { key: 'event' + e.id, type: 'event', ev: e, st: e, dist: d, need, ok, label };
  }
  return best;
}

export function completeEventInteract(raid, it) {
  const e = it.ev, p = raid.player, rl = raid.rLoot;
  const card = (name, desc, extra = {}) => ({ name, desc, ...extra });
  switch (e.kind) {
    case 'siren':
      e.state = 'active'; e.t = 0; e.wave = 0; e.away = 0; e.nextT = 0; e.g = `ev${e.id}`;
      raid.groups[e.g] = { alive: 0 };
      raid.noise(e.x, e.z, EVENT.SIREN_NOISE);
      raid.emit({ t: 'event', id: e.id, state: 'active' });
      raid.sfx('boss');
      break;
    case 'cursed': {
      const ids = rl.shuffle(CURSE_IDS.slice()).slice(0, 3);
      e.state = 'done'; raid.evts.done++;
      raid.offerChoice('CURSED CACHE: choose a curse', ids, (id) => {
        takeCurse(raid, id);
        for (let k = 0; k < 2; k++) raid.stow(sealed(raid, Math.min(4, e.zone + 1)), e.x, e.z);
        raid.toast(message('Cursed Cache: {curse} until you leave · 2 sealed pieces', { curse: message(CURSES[id].name) }), '#c79bff', 'warning');
        raid.after(0.5, () => raid.offerChoice('CURSED CACHE: choose one', pickItems(raid, 2, 3, e.zone), (item) => raid.giveItem(item)));
      }, Object.fromEntries(ids.map((id) => [id, card(CURSES[id].name, CURSES[id].desc, { tag: 'Curse', col: '#c79bff', glyph: '☠' })])));
      raid.emit({ t: 'event', id: e.id, state: 'done' });
      break;
    }
    case 'wager': {
      p.credits -= wagerCost(e);
      e.uses++;
      if (e.uses >= EVENT.WAGER_MAX) { e.state = 'done'; raid.evts.done++; }
      const ids = ['card1', 'card2', 'card3'];
      raid.offerChoice('WAGER: turn one card', ids, () => wagerResult(raid, e),
        Object.fromEntries(ids.map((id) => [id, card('Face down', 'Prototype 8% · Enhanced 32% · double back 20% · nothing 25% · ambush 15%', { tag: 'Wager', col: '#7fe9ff', glyph: '?' })])));
      break;
    }
    case 'reprinter': {
      const ids = Object.keys(p.items).filter((id) => p.items[id] > 0).sort((a, b) => ITEMS[b].rarity - ITEMS[a].rarity || p.items[b] - p.items[a]).slice(0, 9);
      raid.offerChoice('REPRINTER: feed one item', ids, (id) => {
        const next = rl.pick(ITEM_IDS.filter((k) => ITEMS[k].rarity === ITEMS[id].rarity && k !== id));
        raid.removeItem(id);
        raid.giveItem(next);
        e.uses++;
        if (e.uses >= EVENT.REPRINTS) { e.state = 'done'; raid.evts.done++; raid.emit({ t: 'event', id: e.id, state: 'done' }); }
      });
      break;
    }
    case 'compactor': compactStep(raid, e, null, 0); break;
    case 'static':
      e.state = 'done'; raid.evts.done++;
      advancePressure(raid, EVENT.STATIC_PRESS);
      raid.aliveHostile += raid.spawnWave(room(raid, EVENT.STATIC_BURST), { near: e, rmin: 10, rmax: 18 }).length;
      raid.offerChoice('STATIC SHRINE: choose one', pickItems(raid, 3, 1, e.zone), (id) => raid.giveItem(id));
      raid.emit({ t: 'event', id: e.id, state: 'done' });
      break;
    default: {
      // Greed: a Wanted pack on the spot, two affixes on its leader.
      e.state = 'active'; e.t = 0; e.g = `ev${e.id}`;
      raid.groups[e.g] = { alive: 0 };
      raid.spawnPack(e.x, e.z + 5, ['walker', 'skitter', 'skitter'], { state: 'revealing', spread: 6, group: e.g, noElite: true });
      raid.spawnPack(e.x, e.z - 5, [raid.nl >= 0.5 ? 'brute' : 'walker'], { state: 'revealing', spread: 3, group: e.g, elite: raid.rollAffixes(true), wanted: true });
      raid.banner('WANTED PACK', 'The shrine has been heard.', '#ffd76a');
      raid.emit({ t: 'event', id: e.id, state: 'active' });
      raid.sfx('banner');
    }
  }
}

export function takeCurse(raid, id) {
  raid.evts.curses.add(id);
  if (id === 'hunted') raid.eliteT = Math.min(raid.eliteT, raid.pressT + 45);
  raid.recalc();
  raid.emit({ t: 'curse', id });
}

// One card turned (doc 20, section 4). Two blanks in a row at one terminal make the third pay.
export function wagerResult(raid, e, roll = raid.rLoot.float()) {
  const O = EVENT.WAGER_ODDS, q = raid.quality(e.zone);
  let out;
  if ((e.miss || 0) >= 2) out = 'enhanced';
  else if (roll < O.proto) out = 'proto';
  else if (roll < O.proto + O.enhanced) out = 'enhanced';
  else if (roll < O.proto + O.enhanced + O.refund) out = 'refund';
  else if (roll < O.proto + O.enhanced + O.refund + O.nothing) out = 'nothing';
  else out = 'ambush';
  e.miss = out === 'nothing' || out === 'ambush' ? (e.miss || 0) + 1 : 0;
  e.last = out;
  const paid = Math.round(EVENT.WAGER * Math.pow(EVENT.WAGER_UP, e.uses - 1));
  if (out === 'proto') { raid.giveItem(rollRunItem(raid.rLoot, q, 3)); raid.toast('Wager: a Prototype', '#ffd76a', 'complete'); }
  else if (out === 'enhanced') { raid.giveItem(rollRunItem(raid.rLoot, q, 1)); raid.toast('Wager: it pays', '#7fe9ff', 'complete'); }
  else if (out === 'refund') { raid.player.credits += paid * 2; raid.toast(message('Wager: double back · +{credits} Credits', { credits: paid * 2 }), '#7fe9ff', 'credits'); }
  else if (out === 'nothing') raid.toast('Wager: a blank card', '#98adb3');
  else { raid.aliveHostile += raid.spawnWave(room(raid, raid.rLoot.irange(3, 5)), { near: e, rmin: 10, rmax: 18 }).length; raid.toast('Wager: the card was bait', '#ff9a8f', 'warning'); raid.sfx('wave'); }
  raid.emit({ t: 'wager', id: e.id, out });
  return out;
}

// Three picks, one after another; the first fixes the grade and may still be declined.
function compactStep(raid, e, grade, n) {
  const p = raid.player;
  if (n >= EVENT.COMPACT) {
    const up = grade === 0 ? 1 : 3;
    raid.giveItem(raid.rLoot.pick(ITEM_IDS.filter((id) => ITEMS[id].rarity === up)));
    e.state = 'done'; raid.evts.done++;
    raid.emit({ t: 'event', id: e.id, state: 'done' });
    return;
  }
  const grades = grade === null ? [0, 1].filter((r) => rarityCount(p, r) >= EVENT.COMPACT) : [grade];
  const ids = Object.keys(p.items).filter((id) => p.items[id] > 0 && grades.includes(ITEMS[id].rarity)).slice(0, 9);
  const cards = {};
  if (n === 0) { ids.push('keep'); cards.keep = { name: 'Keep everything', desc: 'Leave the Compactor unused', tag: 'Compactor', col: '#98adb3', glyph: '×' }; }
  raid.offerChoice(message('COMPACTOR: feed item {n} of {total}', { n: n + 1, total: EVENT.COMPACT }), ids, (id) => {
    if (id === 'keep') return;
    const g = ITEMS[id].rarity;
    raid.removeItem(id);
    compactStep(raid, e, g, n + 1);
  }, cards);
}

// ---------------------------------------------------------------- what the HUD and the map show
export function eventLines(raid) {
  const out = [];
  if (!raid.evts) return out;
  for (const e of raid.evts.list) {
    if (!running(e)) continue;
    const o = { id: e.id, kind: e.kind, name: e.name, state: e.state, meter: e.progress, terms: [EVENT_TERMS[e.kind]], line: null };
    if (e.kind === 'siren') o.line = message('Wave {n}/{total} · {left} left', { n: e.wave, total: EVENT.SIREN_WAVES.length, left: Math.max(0, raid.groups[e.g].alive) });
    else if (e.kind === 'greed') { o.line = message('Wanted pack: {left} left', { left: Math.max(0, raid.groups[e.g].alive) }); o.meter = null; }
    else if (e.state === 'falling') o.line = message('Lands in {s} s at {ref}', { s: Math.ceil((e.kind === 'drop' ? EVENT.DROP_FALL : EVENT.DEBRIS_FALL) - e.t), ref: raid.world.refAt(e.x, e.z) });
    else if (e.kind === 'drop') o.line = message('Hold by the crate · recalled in {s} s', { s: Math.ceil(EVENT.DROP_LIFE - e.life) });
    else o.line = 'Hold by the core';
    out.push(o);
  }
  return out;
}
// Known events as route targets (route.js).
export function eventTargets(raid) {
  const out = [];
  if (!raid.evts) return out;
  for (const e of raid.evts.list) {
    if (e.state === 'hidden' || e.state === 'done' || e.state === 'failed') continue;
    out.push({ kind: 'event', id: e.id, x: e.x, z: e.z, reach: 2.4, los: false, label: message('{name}, {ref}', { name: message(e.name), ref: raid.world.refAt(e.x, e.z) }) });
  }
  return out;
}
export function eventTargetOn(raid, T) {
  const e = raid.evts && raid.evts.list[T.id];
  return !!e && e.state !== 'done' && e.state !== 'failed';
}
