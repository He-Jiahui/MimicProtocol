// Hub contracts and sector states (doc 21), scaled to the one district (doc 64). The 500 m
// district is five sectors, its five quarters. Each has an Intel level from 0 to 3 that is
// fixed when a raid is generated and changes what that raid is like. Contracts taken at the
// hub span raids: their progress counts only when the operator extracts, and a death loses
// what that raid added. One story contract is always pinned: Command will not open the
// Reliquary until Old Town is surveyed and three Power Cells have come home.
//
// Pure data and rules. The first half is the profile's side (board, accept, commit); the
// second is what a raid does with the contracts it was sent out with.

import { Rng } from '../core/rng.js';
import { dist } from '../core/math.js';
import { ZONES, AUTO_CAP } from './data.js';
import { rollGear } from './loot.js';
import { message } from '../i18n/index.js';

export const SECTORS = [
  { id: 0, name: 'Old Town' }, { id: 1, name: 'Neon Strip' }, { id: 2, name: 'Arcology Heights' }, { id: 3, name: 'Reliquary Quarter' }, { id: 4, name: 'Dockside' },
];
export const LAIR_SECTOR = 3;
// What each level changes in the next raid (doc 21, section 3). Zone levels never change.
export const INTEL = [
  { name: 'Unknown', effects: [] },
  { name: 'Surveyed', effects: ['Its activities, events and Key Supplies are on the map from the start'] },
  { name: 'Instrumented', effects: ['Its exits are known from the start', 'Hosts are 20% rarer and its loot is 15% better'] },
  { name: 'Secured', effects: ['Half as many elites, with one affix at most', 'One container in four holds an extra find'] },
];
export const OPS = {
  HOLD: 3, OFFERS: 5, SURVEY_R: 12, SENSOR_HOLD: 20, SENSOR_NOISE: 15, SENSOR_WAVE: 6, BROOD_WAKE: 45, CELL_SPARE: 1,
  HOST_L2: 0.8, LOOT_L2: 1.15, ELITE_L3: 0.5, EXTRA_L3: 0.25,
};
// need: how much of the task there is. intel: the level a finished contract leaves the sector at.
export const CONTRACTS = {
  survey: { title: 'Survey {sector}', task: 'Pulse the scan within 12 m of each survey mark in {sector}.', need: 3, cash: 250, samples: 1, intel: 1 },
  sensor: { title: 'Instrument {sector}', task: 'Set Sensor Probes on the marked nodes in {sector}: 20 s each, loud, and a wave answers.', need: 2, cash: 400, samples: 2, intel: 2 },
  purge: { title: 'Purge {sector}', task: 'Destroy the marked broods in {sector}.', need: 2, samples: 3, gear: 1, intel: 3 },
  hunt: { title: 'Hunt in {sector}', task: 'Kill elites in {sector}.', need: 3, cash: 350, gear: 0 },
  deliver: { title: 'Power for the Reliquary gate', task: 'Bring Power Cells home from containers in {sector}.', need: 3, cash: 400, pinned: true },
  boss: { title: 'The Matron of Hollows', task: 'Kill her in the Reliquary works.', need: 1, samples: 2, intel: 3, pinned: true },
};
export const contractTitle = (c) => message(CONTRACTS[c.type].title, { sector: message(SECTORS[c.sector].name) });
export const contractTask = (c) => message(CONTRACTS[c.type].task, { sector: message(SECTORS[c.sector].name) });
export const tierPay = (tier) => 1 + 0.15 * (tier - 1);
// What a contract pays, as parts for the interface to translate and join.
export function rewardParts(c, tier = 1) {
  const T = CONTRACTS[c.type], out = [];
  if (T.cash) out.push(`${Math.round(T.cash * tierPay(tier))}¤`);
  if (T.samples) out.push(`${T.samples}⬢`);
  if (T.gear !== undefined) out.push(message(T.gear ? '1 sealed piece, Enhanced or better' : '1 sealed piece'));
  if (c.type === 'deliver') out.push(message('powers the Reliquary gate'));
  return out;
}

// ---------------------------------------------------------------- the profile's side
const make = (p, type, sector) => ({ id: `c${p.ops.seq++}`, type, sector, need: CONTRACTS[type].need, have: 0, pinned: !!CONTRACTS[type].pinned });
// The record a profile keeps. A save from before contracts gets one; an operator who has
// already killed the Matron is not sent back to earn the gate.
export function ensureOps(p) {
  if (p.ops && Array.isArray(p.ops.sectors) && p.ops.sectors.length === SECTORS.length) return p.ops;
  p.ops = { sectors: SECTORS.map(() => 0), lair: false, active: [], board: [], seq: 1, completed: 0 };
  if (p.stats && p.stats.bossKills > 0) { p.ops.lair = true; p.ops.sectors[0] = 1; p.ops.sectors[LAIR_SECTOR] = 3; }
  else { p.ops.active.push(make(p, 'survey', 0), make(p, 'deliver', 1)); }
  refreshBoard(p);
  return p.ops;
}
const has = (O, type, sector) => O.active.some((c) => c.type === type && c.sector === sector);
// Every contract Command could offer now: the next Intel step for each sector, and hunts.
export function eligible(p) {
  const O = p.ops, out = [];
  for (const S of SECTORS) {
    const lv = O.sectors[S.id], next = lv === 0 ? 'survey' : lv === 1 ? 'sensor' : lv === 2 && S.id !== LAIR_SECTOR ? 'purge' : null;
    if (next && !has(O, next, S.id)) out.push({ type: next, sector: S.id });
    if (S.id >= 2 && !has(O, 'hunt', S.id)) out.push({ type: 'hunt', sector: S.id });
  }
  return out;
}
// Five offers, redrawn after every raid from the profile's own counter, so a reload shows the same board.
export function refreshBoard(p) {
  const O = p.ops, rng = new Rng((p.seq * 2654435761 + O.completed * 97) >>> 0).fork('board');
  O.board = rng.shuffle(eligible(p)).slice(0, OPS.OFFERS).map((o) => make(p, o.type, o.sector));
  return O.board;
}
export const heldCount = (p) => p.ops.active.filter((c) => !c.pinned).length;
export function acceptContract(p, id) {
  const O = ensureOps(p), i = O.board.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, why: 'That contract is no longer offered' };
  if (heldCount(p) >= OPS.HOLD) return { ok: false, why: 'You hold three contracts: abandon one first' };
  const c = O.board[i];
  if (has(O, c.type, c.sector)) return { ok: false, why: 'You already hold that contract' };
  O.board.splice(i, 1);
  O.active.push(c);
  return { ok: true };
}
export function abandonContract(p, id) {
  const O = ensureOps(p), i = O.active.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, why: 'No such contract' };
  if (O.active[i].pinned) return { ok: false, why: 'Command keeps that one on the board' };
  const c = O.active.splice(i, 1)[0];
  // It goes back on the board as it was offered, its progress forgotten.
  if (!O.board.some((b) => b.type === c.type && b.sector === c.sector)) O.board.push({ ...c, have: 0 });
  return { ok: true };
}
// What a raid is generated with: the sector levels, whether the lair answers, and the work.
export function opsForRaid(p) {
  const O = ensureOps(p);
  return { sectors: Object.fromEntries(O.sectors.map((lv, i) => [i, lv])), lair: O.lair, orders: O.active.map((c) => ({ id: c.id, type: c.type, sector: c.sector, left: c.need - c.have })) };
}
// The effects the next raid will get, sector by sector, for the hub.
export function sectorEffects(p) {
  const O = ensureOps(p);
  return SECTORS.map((S) => ({ ...S, level: O.sectors[S.id], intel: INTEL[O.sectors[S.id]].name, effects: INTEL.slice(1, O.sectors[S.id] + 1).flatMap((I) => I.effects) }));
}
// Commit a raid's contract work (doc 21, section 5): only an extraction counts. Returns the
// lines the debrief shows. The board is redrawn either way.
export function commitOrders(p, res) {
  const O = ensureOps(p), out = [];
  const extracted = res.outcome === 'extracted';
  for (const r of res.orders || []) {
    const c = O.active.find((k) => k.id === r.id);
    if (!c) continue;
    const T = CONTRACTS[c.type], line = { title: contractTitle(c), gained: r.gained, have: c.have, need: c.need, done: false, kept: extracted, reward: [] };
    if (extracted && r.gained > 0) {
      c.have = Math.min(c.need, c.have + r.gained);
      line.have = c.have;
      if (c.have >= c.need) {
        line.done = true; line.reward = rewardParts(c, res.tier);
        if (T.cash) p.cash += Math.round(T.cash * tierPay(res.tier));
        if (T.samples) p.samples += T.samples;
        if (T.gear !== undefined) {
          const rng = new Rng((p.seq * 7919 + O.completed * 31 + 5) >>> 0).fork('contract');
          let g = rollGear(rng, { tier: res.tier, zone: 2, nl: 0.3, source: 'elite' });
          if (T.gear && g.rarity < T.gear) g = rollGear(rng, { tier: res.tier, zone: 2, nl: 0.3, source: 'elite', rarity: T.gear });
          p.stash.push(g);
        }
        if (T.intel) O.sectors[c.sector] = Math.max(O.sectors[c.sector], T.intel);
        O.active.splice(O.active.indexOf(c), 1);
        O.completed++;
      }
    }
    out.push(line);
  }
  // The gate: Old Town surveyed and the cells delivered. Then the Matron is the pinned work.
  if (!O.lair && O.sectors[0] >= 1 && !O.active.some((c) => c.type === 'deliver')) {
    O.lair = true;
    if (!(p.stats.bossKills > 0)) O.active.push(make(p, 'boss', LAIR_SECTOR));
    out.push({ title: message('The Reliquary gate has power'), gained: 0, have: 1, need: 1, done: true, kept: true, reward: [message('the lair will answer')] });
  }
  refreshBoard(p);
  return out;
}
export const securedCount = (p) => ensureOps(p).sectors.filter((lv) => lv >= 3).length;

// ---------------------------------------------------------------- the raid's side
const inSector = (raid, x, z, s) => raid.sectorAt(x, z) === s;
// Spread points on open pavement in a sector, clear of what is already marked.
function spots(raid, sector, n, apart, taken) {
  const w = raid.world, rng = raid.rEvent.fork(`ops${sector}:${n}:${taken.length}`), cands = [], out = [];
  for (const b of w.blocks) for (const q of b.ped) {
    if (w.passage && dist(q.x, q.z, w.passage.x, w.passage.z) < 8) continue;
    if (w.styleAt(q.x, q.z) !== sector || w.zoneAt(q.x, q.z) < 1 || !w.circleFree(q.x, q.z, 1.2) || (w.hasHeight && w.floorAt(q.x, q.z) !== 0)) continue;
    cands.push(q);
  }
  rng.shuffle(cands);
  for (let gap = apart; gap >= 8 && out.length < n; gap *= 0.6) {
    for (const q of cands) {
      if (out.length >= n) break;
      if (out.includes(q) || [...taken, ...out].some((t) => dist(t.x, t.z, q.x, q.z) < gap)) continue;
      out.push(q);
    }
  }
  return out.map((q) => ({ x: q.x, z: q.z }));
}
const probe = (raid) => ({ uid: `probe${raid.cargoSeq++}`, kind: 'loot', name: 'Sensor Probe', value: 0, key: 'probe' });
const cell = (raid, c) => ({ uid: `cell${raid.districtStep}:${c.id}`, kind: 'loot', name: 'Power Cell', value: 0, key: 'cell' });

export function initOrders(raid, orders, previous = null) {
  const O = raid.ops = { list: [], marks: [] };
  if (raid.mode !== 'raid' || !orders) return;
  const w = raid.world, taken = raid.evts ? raid.evts.list.map((e) => ({ x: e.x, z: e.z })) : [];
  for (const o of orders) {
    if (!(o.left > 0) || !CONTRACTS[o.type]) continue;
    const c = { ...o, name: CONTRACTS[o.type].title, gained: previous?.list.find(c => c.id === o.id)?.gained || 0, marks: [] };
    if (o.type === 'survey' || o.type === 'sensor' || o.type === 'purge') {
      c.marks = spots(raid, o.sector, o.left - c.gained, o.type === 'purge' ? 60 : 45, taken).map((q, k) => ({ ...q, id: `${o.id}:${k}`, kind: o.type, order: c, done: false, progress: 0 }));
      taken.push(...c.marks);
      O.marks.push(...c.marks);
      if (o.type === 'sensor') for (const m of c.marks) { if (!previous) raid.addInv(probe(raid)); w.fillRect(m.x - 0.5, m.z - 0.5, m.x + 0.5, m.z + 0.5, 2); }
    } else if (o.type === 'deliver') {
      // The cells wait in ordinary containers of the sector: one spare, so a Host or a bad
      // street does not end the errand. Guaranteed every raid (doc 21, section 5).
      const rng = raid.rEvent.fork(`cells${o.sector}`), pool = rng.shuffle(w.containers.filter((k) => w.styleAt(k.x, k.z) === o.sector && !raid.cont[k.id].host));
      for (const k of pool.slice(0, o.left + OPS.CELL_SPARE)) { raid.cont[k.id].cell = true; if (raid.sectorLevel(k.x, k.z) >= 1) raid.cont[k.id].cellKnown = true; }
    }
    O.list.push(c);
  }
}
const of = (raid, type) => (raid.ops ? raid.ops.list.filter((c) => c.type === type) : []);

export function updateOrders(raid, dt) {
  const O = raid.ops, p = raid.player;
  if (!O || !O.list.length) return;
  for (const m of O.marks) {
    if (m.kind !== 'purge' || m.done) continue;
    if (!m.g) {
      // The brood wakes when the operator comes near: a pack round a led elite.
      if (dist(m.x, m.z, p.x, p.z) > OPS.BROOD_WAKE) continue;
      m.g = `brood${m.id}`;
      raid.groups[m.g] = { alive: 0 };
      const zone = Math.max(1, raid.world.zoneAt(m.x, m.z)), kinds = [];
      for (let k = 0; k < 4; k++) kinds.push(raid.rSpawn.pick(ZONES[zone].mimics));
      raid.spawnPack(m.x, m.z + 3, kinds, { state: 'revealing', spread: 6, group: m.g, noElite: true });
      raid.spawnPack(m.x, m.z - 3, ['walker'], { state: 'revealing', spread: 2, group: m.g, elite: raid.rollAffixes(), wanted: true });
      raid.emit({ t: 'order', id: m.order.id });
    } else if (raid.groups[m.g].alive <= 0) credit(raid, m);
  }
  for (const c of of(raid, 'boss')) if (raid.bossKilled && !c.gained) { c.gained = 1; note(raid, c); }
}
function credit(raid, m) {
  if (m.done) return;
  m.done = true;
  m.order.gained++;
  note(raid, m.order);
  raid.emit({ t: 'pickup', x: m.x, z: m.z, col: [0.4, 1, 0.8] });
}
function note(raid, c) {
  const full = c.gained >= c.left;
  raid.toast(message(full ? '{title}: done here. It counts when you extract.' : '{title}: {have} of {need}', { title: message(c.name, { sector: message(SECTORS[c.sector].name) }), have: c.gained, need: c.left }), '#9fe8ff', full ? 'complete' : undefined);
  raid.emit({ t: 'order', id: c.id });
  if (full) { raid.unlockExtraction(); raid.sfx('level'); }
}
// A Scan Pulse reaches every survey mark within 12 m.
export function ordersOnScan(raid) {
  if (!raid.ops) return;
  const p = raid.player;
  for (const m of raid.ops.marks) if (m.kind === 'survey' && !m.done && dist(m.x, m.z, p.x, p.z) <= OPS.SURVEY_R) credit(raid, m);
}
export function ordersOnKill(raid, e) {
  if (!e.elite) return;
  for (const c of of(raid, 'hunt')) if (c.gained < c.left && inSector(raid, e.x, e.z, c.sector)) { c.gained++; note(raid, c); }
}
// A Power Cell waits in its container with the rest of the contents.
export function ordersOnOpen(raid, c, st) {
  if (st.cell) { st.items.push(cell(raid, c)); raid.toast('A Power Cell: Command wants it home', '#9fe8ff'); }
}
export const carried = (raid, key) => raid.player.inv.filter((i) => i.key === key).length;

// A sensor node: 20 s of loud work with a probe in hand, and a wave at the half.
export function orderInteract(raid) {
  const O = raid.ops, p = raid.player;
  if (!O) return null;
  let best = null, bd = Infinity;
  for (const m of O.marks) {
    if (m.kind !== 'sensor' || m.done) continue;
    const d = dist(m.x, m.z, p.x, p.z);
    if (d > 2.6 || d >= bd) continue;
    const ok = carried(raid, 'probe') > 0;
    bd = d;
    best = {
      key: 'node' + m.id, type: 'order', mark: m, st: m, dist: d, need: OPS.SENSOR_HOLD, ok, label: ok ? 'Set a Sensor Probe (20 s, loud)' : 'Sensor node: no probe left',
      onHold: (dt, T) => {
        if (Math.floor(T) !== Math.floor(T - dt)) raid.noise(m.x, m.z, OPS.SENSOR_NOISE);
        if (!m.waved && T >= OPS.SENSOR_HOLD / 2) {
          m.waved = true;
          const n = Math.max(0, Math.min(OPS.SENSOR_WAVE, AUTO_CAP - raid.aliveHostile));
          if (n) raid.aliveHostile += raid.spawnWave(n, { near: m, rmin: 16, rmax: 26 }).length;
          raid.sfx('wave');
        }
      },
    };
  }
  return best;
}
export function completeOrderInteract(raid, it) {
  const p = raid.player, i = p.inv.findIndex((k) => k.key === 'probe');
  if (i < 0) return;
  p.inv.splice(i, 1);
  raid.reweigh();
  credit(raid, it.mark);
}

// What goes home: the count for each contract, and the cargo with Command's own pieces taken
// out. Cells beyond what was asked are left with the quartermaster; spare probes are returned.
export function ordersResult(raid, cargo, extracted) {
  const O = raid.ops, out = [];
  if (!O) return { orders: out, cargo };
  let cells = cargo.filter((i) => i.key === 'cell').length;
  for (const c of O.list) {
    let gained = c.gained;
    if (c.type === 'deliver') { gained = Math.min(c.left, cells); cells -= gained; }
    out.push({ id: c.id, type: c.type, sector: c.sector, gained: extracted ? gained : 0, tried: gained });
  }
  return { orders: out, cargo: cargo.filter((i) => !i.key) };
}

// ---------------------------------------------------------------- what the HUD and the map show
export function orderLines(raid) {
  const out = [];
  if (!raid.ops) return out;
  for (const c of raid.ops.list) {
    const have = c.type === 'deliver' ? Math.min(c.left, carried(raid, 'cell')) : c.gained;
    out.push({ id: c.id, type: c.type, title: message(c.name, { sector: message(SECTORS[c.sector].name) }), have, need: c.left, done: have >= c.left,
      note: c.type === 'deliver' ? 'carried' : c.type === 'sensor' ? message('{count} probe{plural} in the pack', { count: carried(raid, 'probe'), plural: carried(raid, 'probe') === 1 ? '' : 's' }) : null });
  }
  return out;
}
// Marks, nodes and woken broods as route targets; a cell's container once Command knows of it.
export function orderTargets(raid) {
  const out = [];
  if (!raid.ops) return out;
  const names = { survey: 'Survey mark', sensor: 'Sensor node', purge: 'Marked brood' };
  for (const m of raid.ops.marks) if (!m.done) out.push({ kind: 'order', id: m.id, x: m.x, z: m.z, reach: m.kind === 'sensor' ? 2.4 : m.kind === 'survey' ? OPS.SURVEY_R - 2 : 8, los: false, label: message('{name}, {ref}', { name: message(names[m.kind]), ref: raid.world.refAt(m.x, m.z) }) });
  for (const c of raid.world.containers) { const st = raid.cont[c.id]; if (st.cell && st.cellKnown && !st.opened) out.push({ kind: 'cell', id: c.id, x: c.x, z: c.z, reach: 2, los: false, label: message('Power Cell, {ref}', { ref: raid.world.refAt(c.x, c.z) }) }); }
  return out;
}
export function orderTargetOn(raid, T) {
  if (T.kind === 'cell') return !raid.cont[T.id].opened;
  const m = raid.ops && raid.ops.marks.find((k) => k.id === T.id);
  return !!m && !m.done;
}
