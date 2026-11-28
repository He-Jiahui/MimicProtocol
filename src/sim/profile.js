// Persistent profile and hub economy (docs 16, 19). Storage is injected so the
// same code runs in Node tests with an in-memory store.

import { Rng } from '../core/rng.js';
import { SLOTS, GEAR_AFFIX_IDS, enhanceCost, REROLL_CASH, REROLL_SAMPLES, PROCESS_SAMPLES, gearRating, CLASS_IDS, PACKS, DRONES, CREDIT_CASH, WEAR } from './data.js';
import { starterItem, rollAffix, gearValue, gearStats, worth, publicView, sealedBid, condition, repairCost } from './loot.js';
import { packAll } from './pack.js';
import { trainingContainerItem } from './tutorial.js';
import {
  cleanClasses, gainClassXp, treeIssue, treeReason, treeTake, treeRefund, treeBudget, classLevel, treePoints,
  APTITUDES, trainingFree, trainingAssigned, trainingStats,
} from './progress.js';
import { message } from '../i18n/index.js';

// Own storage root; never reads or writes the StormBound key (doc 13, section 6). The key
// stays put across record versions so an old save is found and migrated, not orphaned.
export const PROFILE_KEY = 'mimicprotocol.profile.v1';
export const PROFILE_VERSION = 2;

export function newProfile() {
  const equipped = {};
  for (const s of SLOTS) equipped[s] = starterItem(s);
  return {
    v: PROFILE_VERSION, seq: 1,
    cash: 300, samples: 2, cores: 0,
    classId: 'rifleman', tier: 1, tierUnlocked: 1,
    classes: cleanClasses({}),   // per-class experience, kept on death (doc 64, Package 7)
    equipped, stash: [],
    pack: null,            // uid of the stash pack chosen for the next deployment; null = issue pack
    drones: { courier: 0, hauler: 0 }, drone: null,   // owned insurance drones and the one assigned
    pendingLift: null,     // a death's frozen cargo waiting for the player to pack the drone bay
    stats: { raids: 0, extractions: 0, deaths: 0, kills: 0, elites: 0, bossKills: 0, bestValue: 0 },
    tutorial: { annex: false, sold: 0, processed: false, equipped: false, enhanced: false, rerolled: false, classPicked: false, tierPicked: false, done: false },
    lastDebrief: null,
  };
}

export function loadProfile(storage) {
  try {
    const raw = storage.getItem(PROFILE_KEY);
    if (!raw) return null;
    let p = JSON.parse(raw);
    if (p && p.v === 1 && p.equipped && Array.isArray(p.stash)) p = migrateV1(p);
    if (!p || p.v !== PROFILE_VERSION || !p.equipped || !Array.isArray(p.stash)) return null;
    return withDefaults(p);
  } catch {
    return null;
  }
}

// Fields added after a record was written default here, so older v2 saves still load.
function withDefaults(p) {
  for (const s of SLOTS) if (!p.equipped[s]) p.equipped[s] = starterItem(s);
  if (!('pack' in p)) p.pack = null;
  if (!p.drones) p.drones = { courier: 0, hauler: 0 };
  if (!('drone' in p)) p.drone = null;
  if (!('pendingLift' in p)) p.pendingLift = null;
  // A save from before class levels opens with every class at level 1; records are checked on load.
  p.classes = cleanClasses(p.classes);
  return p;
}

// A v1 backpack becomes a field pack item. Packs have no rating or affixes, so the old
// rolled lines are kept aside under `legacy`; uid, enhancement, hidden state and value stay.
function packFromBackpack(it) {
  const { uid, name, enh, unid, value, tutorial, ...rest } = it;
  const d = PACKS[(it.rarity || 0) >= 2 ? 'ranger' : 'patrol'];
  return { uid, kind: 'pack', pack: (it.rarity || 0) >= 2 ? 'ranger' : 'patrol', name, w: d.w, h: d.h, kg: d.kg, value, enh, unid, ...(tutorial ? { tutorial } : {}), legacy: rest };
}
const fromV1 = (it) => it.kind !== 'gear' ? it : it.slot === 'rig' ? { ...it, slot: 'head' } : it.slot === 'backpack' ? packFromBackpack(it) : it;

// Version 1 wore weapon, body, rig and backpack (doc 26, section 4). The rig's lines now
// belong to the head; the backpack is no longer worn. Nothing else about a piece changes.
export function migrateV1(old) {
  const eq = old.equipped, equipped = {};
  for (const s of SLOTS) equipped[s] = starterItem(s);
  if (eq.weapon) equipped.weapon = eq.weapon;
  if (eq.body) equipped.body = eq.body;
  if (eq.rig) equipped.head = eq.rig.starter ? starterItem('head') : fromV1(eq.rig);
  const stash = old.stash.map(fromV1);
  // The issue backpack is replaced by the always-available issue pack; a found one is kept.
  if (eq.backpack && !eq.backpack.starter) stash.push(packFromBackpack(eq.backpack));
  return { ...old, v: 2, equipped, stash };
}

export function saveProfile(storage, p) {
  // Write to a staging key, verify it parses, then switch (doc 13: atomic commit).
  const json = JSON.stringify(p);
  storage.setItem(PROFILE_KEY + '.staging', json);
  JSON.parse(storage.getItem(PROFILE_KEY + '.staging'));
  const prev = storage.getItem(PROFILE_KEY);
  if (prev) storage.setItem(PROFILE_KEY + '.backup', prev);
  storage.setItem(PROFILE_KEY, json);
  storage.removeItem(PROFILE_KEY + '.staging');
}

const rngFor = (p, name) => new Rng((p.seq++ * 2654435761) >>> 0).fork(name);
const findStash = (p, uid) => p.stash.findIndex((i) => i.uid === uid);

export function totalRating(p) {
  let r = 0;
  for (const s of SLOTS) if (p.equipped[s]) r += gearRating(p.equipped[s]);
  return Math.round(r);
}
export const profileStats = (p) => gearStats(p.equipped);

// What the Quartermaster pays: a sealed piece sells as-is for its public bid, an identified one
// for its stored value, which the Armory's guards keep at or below gearValue (docs 38, 63).
export function salePrice(it) {
  if (it.kind !== 'gear') return it.value || 0;
  return it.unid ? sealedBid(it) : Math.min(it.value, gearValue(it));
}

export function sellItem(p, uid) {
  const i = findStash(p, uid);
  if (i < 0) return { ok: false, why: 'Item not found' };
  const it = p.stash[i], cash = salePrice(it);
  p.stash.splice(i, 1);
  if (p.pack === uid) p.pack = null;
  p.cash += cash;
  if (it.tutorial && it.kind === 'loot') p.tutorial.sold++;
  return { ok: true, cash };
}

// Process = appraise plus decontaminate in one action (doc 15, overrides).
export function processItem(p, uid) {
  const i = findStash(p, uid);
  if (i < 0) return { ok: false, why: 'Item not found' };
  const it = p.stash[i];
  if (it.kind !== 'gear' && it.kind !== 'drone') return { ok: false, why: 'Not gear' };
  if (!it.unid) return { ok: false, why: 'Already identified' };
  if (!hubTutorialActive(p)) {
    if (p.samples < PROCESS_SAMPLES) return { ok: false, why: 'Not enough Lab Samples' };
    p.samples -= PROCESS_SAMPLES;
  }
  // A drone case opens into a drone for a later deployment (doc 62).
  if (it.kind === 'drone') {
    p.stash.splice(i, 1);
    p.drones[it.drone] = (p.drones[it.drone] || 0) + 1;
    return { ok: true, drone: it.drone };
  }
  // Appraisal reveals the roll made at drop; nothing is rolled again (doc 63).
  it.unid = false;
  it.value = gearValue(it);
  p.tutorial.processed = true;
  return { ok: true, item: it };
}

export function equipItem(p, uid) {
  const i = findStash(p, uid);
  if (i < 0) return { ok: false, why: 'Item not found' };
  const it = p.stash[i];
  if (it.kind !== 'gear') return { ok: false, why: 'Not gear' };
  if (it.unid) return { ok: false, why: 'Process it at the Lab first' };
  const old = p.equipped[it.slot];
  p.stash.splice(i, 1);
  p.equipped[it.slot] = it;
  if (old && !old.starter) p.stash.push(old);
  p.tutorial.equipped = true;
  return { ok: true };
}

const ownedItem = (p, uid) => {
  for (const s of SLOTS) if (p.equipped[s] && p.equipped[s].uid === uid) return p.equipped[s];
  const i = findStash(p, uid);
  return i >= 0 ? p.stash[i] : null;
};

export function enhanceItem(p, uid) {
  const it = ownedItem(p, uid);
  if (!it || it.kind !== 'gear') return { ok: false, why: 'Item not found' };
  if (it.unid) return { ok: false, why: 'Process it first' };
  const lvl = it.enh || 0;
  if (lvl >= 8) return { ok: false, why: 'Maximum level' };
  const cost = hubTutorialActive(p) ? 0 : enhanceCost(lvl);
  if (cost) {
    if (p.cash < cost) return { ok: false, why: `Needs ${cost} Cash`, reason: message('Needs {cost} Cash', { cost }) };
    if (lvl >= 5) {
      if (p.cores < 1) return { ok: false, why: 'Needs a Boss Core' };
      p.cores -= 1;
    }
    p.cash -= cost;
  }
  it.enh = lvl + 1;
  // Enhancing adds at most half the Cash spent to the sale price, or the Armory prints Cash (doc 26).
  it.value = Math.min(gearValue(it), (it.value || 0) + Math.floor(cost / 2));
  p.tutorial.enhanced = true;
  return { ok: true, level: it.enh };
}

export function rerollAffix(p, uid, index) {
  const it = ownedItem(p, uid);
  if (!it || it.kind !== 'gear' || it.unid) return { ok: false, why: 'Item not found' };
  if (!it.affixes[index]) return { ok: false, why: 'No such affix' };
  if (!hubTutorialActive(p)) {
    if (p.cash < REROLL_CASH) return { ok: false, why: `Needs ${REROLL_CASH} Cash`, reason: message('Needs {cost} Cash', { cost: REROLL_CASH }) };
    if (p.samples < REROLL_SAMPLES) return { ok: false, why: 'Needs a Lab Sample' };
    p.cash -= REROLL_CASH;
    p.samples -= REROLL_SAMPLES;
  }
  const rng = rngFor(p, 'reroll');
  const taken = new Set(it.affixes.map((a) => a.k));
  const pool = GEAR_AFFIX_IDS.filter((k) => !taken.has(k));
  // A Prime piece keeps its floor: the new line is also drawn in the top tenth (doc 23).
  it.affixes[index] = rollAffix(rng, rng.pick(pool), it.ilvl, !!it.prime);
  // A reroll never raises the sale price.
  it.value = Math.min(it.value, gearValue(it));
  p.tutorial.rerolled = true;
  return { ok: true, affix: it.affixes[index] };
}

// The field pack for the next deployment: a found pack from the stash, or null for the issue pack.
export const activePack = (p) => (p.pack && p.stash.find((i) => i.uid === p.pack && i.kind === 'pack')) || null;
export function choosePack(p, uid = null) {
  if (uid && !p.stash.some((i) => i.uid === uid && i.kind === 'pack')) return { ok: false, why: 'Not a field pack' };
  p.pack = uid;
  return { ok: true };
}
// The deployed pack comes home on extraction, unless it was swapped in the street for the one
// carried out; any other ending loses it. The issue pack costs nothing to lose.
function settlePack(p, res) {
  const home = res.pack && !res.pack.starter ? res.pack : null;
  if (res.packOut && (!home || home.uid !== res.packOut)) { const i = findStash(p, res.packOut); if (i >= 0) p.stash.splice(i, 1); }
  if (home && home.uid !== res.packOut) p.stash.push(home);
  p.pack = home ? home.uid : null;
}

// ---- insurance drones (doc 62) ----
export const deployedDrone = (p) => (p.drone && p.drones?.[p.drone] > 0 ? p.drone : null);
export function buyDrone(p, type) {
  const D = DRONES[type];
  if (!D) return { ok: false, why: 'Unknown drone' };
  // Training balances are unlimited, so nothing bought there may outlive the checklist.
  if (hubTutorialActive(p)) return { ok: false, why: 'Finish the checklist first' };
  if (p.cash < D.cash) return { ok: false, why: `Needs ${D.cash} Cash`, reason: message('Needs {cost} Cash', { cost: D.cash }) };
  p.cash -= D.cash;
  p.drones[type] = (p.drones[type] || 0) + 1;
  if (!deployedDrone(p)) p.drone = type;
  return { ok: true };
}
export function assignDrone(p, type = null) {
  if (type && !(p.drones?.[type] > 0)) return { ok: false, why: 'No drone of that kind' };
  p.drone = type;
  return { ok: true };
}
// The headless default: most valuable first by public worth (the sealed bid), while the bay packs.
export function greedyLift(cargo, type) {
  const D = DRONES[type], pick = [];
  for (const it of cargo.slice().sort((a, b) => worth(b) - worth(a))) if (packAll(D.w, D.h, [...pick, it])) pick.push(it);
  return pick;
}
// Settle a death's drone lift: whole pieces that pack into the bay come home, still sealed;
// the rest of the frozen cargo is lost. With no choice given, lift greedily.
export function resolveLift(p, uids = null) {
  const L = p.pendingLift;
  if (!L) return { ok: false, why: 'Nothing to lift' };
  const D = DRONES[L.drone], pick = uids ? L.cargo.filter((i) => uids.includes(i.uid)) : greedyLift(L.cargo, L.drone);
  if (!packAll(D.w, D.h, pick)) return { ok: false, why: 'Those pieces do not fit the bay' };
  p.stash.push(...pick);
  p.pendingLift = null;
  if (p.lastDebrief) Object.assign(p.lastDebrief, { lifted: pick.map(publicView), kept: pick.length, lost: L.cargo.length - pick.length });
  return { ok: true, lifted: pick };
}

// ---- wear (doc 63) ----
// The kit that deployed pays for the trip: 3 a deployment, 6 more for dying (curfew counts),
// and the body piece 1 per 100 damage taken, up to 8. Issue gear never wears.
function applyWear(p, res) {
  const died = res.outcome !== 'extracted', out = [];
  for (const s of SLOTS) {
    const it = p.equipped[s];
    if (!it || it.starter) continue;
    const from = condition(it);
    let cost = WEAR.deploy + (died ? WEAR.death : 0);
    if (s === 'body') cost += Math.min(WEAR.bodyMax, Math.floor((res.taken || 0) / WEAR.bodyPer));
    it.cond = Math.max(0, from - cost);
    out.push({ slot: s, uid: it.uid, name: it.name, rarity: it.rarity, starter: false, from, to: it.cond });
  }
  return out;
}
// Repair restores serviceability without touching the roll.
export function repairItem(p, uid) {
  const it = ownedItem(p, uid);
  if (!it || it.kind !== 'gear' || it.starter) return { ok: false, why: 'Item not found' };
  const cost = repairCost(it);
  if (!cost) return { ok: false, why: 'Already in full repair' };
  if (p.cash < cost) return { ok: false, why: `Needs ${cost} Cash`, reason: message('Needs {cost} Cash', { cost }) };
  p.cash -= cost;
  it.cond = 100;
  return { ok: true, cost };
}

export function setClass(p, classId) {
  if (!CLASS_IDS.includes(classId)) return { ok: false, why: 'Unknown class' };
  p.classId = classId;
  p.tutorial.classPicked = true;
  return { ok: true };
}

// ---- class trees (doc 64, Package 7) ----
// Every change is validated against the class's earned points; refunds are free in the hub. The
// stored record is node ids and ranks only, never compiled numbers.
const classRec = (p, classId) => (CLASS_IDS.includes(classId) ? p.classes[classId] : null);
export function treeState(p, classId = p.classId) {
  const rec = classRec(p, classId);
  return rec ? { classId, alloc: { ...rec.tree }, ...treeBudget(rec) } : null;
}
// Apply a whole allocation (a previewed draft), all or nothing.
export function setTree(p, classId, alloc) {
  const rec = classRec(p, classId);
  if (!rec) return { ok: false, why: 'Unknown class' };
  const issue = treeIssue(classId, alloc, treePoints(classLevel(rec.xp).level));
  if (issue) return { ok: false, issue, why: treeReason(classId, issue) };
  rec.tree = { ...alloc };
  return { ok: true };
}
export function takeNode(p, classId, id) {
  const rec = classRec(p, classId);
  if (!rec) return { ok: false, why: 'Unknown class' };
  const res = treeTake(classId, rec.tree, id, treeBudget(rec).earned);
  if (res.ok) rec.tree = res.alloc;
  return res;
}
export function refundNode(p, classId, id) {
  const rec = classRec(p, classId);
  if (!rec) return { ok: false, why: 'Unknown class' };
  const res = treeRefund(classId, rec.tree, id, treeBudget(rec).earned);
  if (res.ok) rec.tree = res.alloc;
  return res;
}
// A full reset returns exactly the earned points; the base kit needs none.
export function resetTree(p, classId) {
  const rec = classRec(p, classId);
  if (!rec) return { ok: false, why: 'Unknown class' };
  rec.tree = {};
  return { ok: true, points: treeBudget(rec).earned };
}
// ---- training (doc 52, doc 64 Package 7): free points re-assign at no cost in the hub ----
export function trainingState(p, classId = p.classId) {
  const rec = classRec(p, classId);
  if (!rec) return null;
  const free = trainingFree(classLevel(rec.xp).level), assigned = trainingAssigned(rec.train);
  return { classId, free, assigned, left: free - assigned, train: { ...rec.train }, ...trainingStats(classId, rec.train) };
}
export function trainPoint(p, classId, apt, delta) {
  const rec = classRec(p, classId);
  if (!rec || !APTITUDES.includes(apt) || (delta !== 1 && delta !== -1)) return { ok: false, why: 'Not an aptitude' };
  const free = trainingFree(classLevel(rec.xp).level);
  if (delta > 0 && trainingAssigned(rec.train) >= free) return { ok: false, why: message('No training points left ({free} earned)', { free }) };
  if (delta < 0 && !(rec.train[apt] > 0)) return { ok: false, why: 'Only assigned points can be taken back' };
  rec.train = { ...rec.train, [apt]: rec.train[apt] + delta };
  return { ok: true };
}
export function resetTraining(p, classId) {
  const rec = classRec(p, classId);
  if (!rec) return { ok: false, why: 'Unknown class' };
  rec.train = Object.fromEntries(APTITUDES.map((a) => [a, 0]));
  return { ok: true };
}

// What leaves the hub with the operator: a frozen copy of the validated allocation and training's
// direct stats, converted once. The same profile always gives the same deployment; the raid never
// sees the profile itself, so nothing found in it can write back to the tree or to training.
export function deployment(p, classId = p.classId) {
  const rec = classRec(p, classId);
  return Object.freeze({
    classId, level: classLevel(rec.xp).level, tree: Object.freeze({ ...rec.tree }),
    training: Object.freeze(trainingStats(classId, rec.train).direct),
    // The Matron's signature is certain until a kill has been banked by extraction (doc 23).
    signature: Object.freeze({ sure: p.stats.bossKills === 0, pity: (p.pity && p.pity.matron) || 0 }),
  });
}

export function setTier(p, tier) {
  if (tier < 1 || tier > 3) return { ok: false, why: 'Not in the demo' };
  if (tier > p.tierUnlocked) return { ok: false, why: 'Locked' };
  p.tier = tier;
  p.tutorial.tierPicked = true;
  return { ok: true };
}

export function hubChecklist(p) {
  const t = p.tutorial;
  return [
    { id: 'sell', label: 'Quartermaster: sell the 2 Sealed Data Cases', done: t.sold >= 2 },
    { id: 'process', label: 'Containment Lab: process the sealed Rare piece', done: t.processed },
    { id: 'equip', label: 'Armory: equip the processed piece', done: t.equipped },
    { id: 'enhance', label: 'Armory: enhance any item to +1', done: t.enhanced },
    { id: 'reroll', label: 'Armory: reroll one affix', done: t.rerolled },
    { id: 'class', label: 'Barracks: confirm a class', done: t.classPicked },
    { id: 'tier', label: 'Threat Console: select a Threat Tier', done: t.tierPicked },
  ];
}
export const hubReady = (p) => p.tutorial.done || hubChecklist(p).every((s) => s.done);
export const hubTutorialActive = (p) => !p.tutorial.done;

export function syncHubTutorial(p) {
  if (!hubTutorialActive(p)) return false;
  if (hubReady(p)) {
    p.tutorial.done = true;
    if (p.stats.raids === 0) {
      p.cash = 0;
      p.samples = 0;
      p.cores = 0;
    }
    return true;
  }

  let changed = false;
  const cases = p.stash.filter((item) => item.tutorial && item.kind === 'loot');
  let missingCases = 2 - p.tutorial.sold - cases.length;
  for (const index of [0, 2]) {
    if (missingCases <= 0) break;
    const item = trainingContainerItem(index);
    if (findStash(p, item.uid) >= 0) continue;
    p.stash.push(item);
    missingCases--;
    changed = true;
  }

  if (!p.tutorial.processed || !p.tutorial.equipped || !p.tutorial.rerolled) {
    const carapace = trainingContainerItem(1);
    if (!ownedItem(p, carapace.uid)) {
      if (p.tutorial.processed) {
        carapace.unid = false;
        carapace.value = gearValue(carapace);
      }
      p.stash.push(carapace);
      changed = true;
    }
  }
  return changed;
}

// Apply a finished raid (or the tutorial annex) to the profile. After a death with a drone and
// cargo, `choose` leaves the lift to the player (p.pendingLift, settled by resolveLift);
// otherwise the headless default lifts at once.
export function applyRaidResult(p, res, { choose = false } = {}) {
  const before = totalRating(p);
  if (res.mode === 'tutorial') {
    p.tutorial.annex = true;
    const kept = res.inv.filter((item) => !item.tutorial || !ownedItem(p, item.uid));
    p.stash.push(...kept);
    p.lastDebrief = { ...res, inv: undefined, kept: kept.length, ratingBefore: before, ratingAfter: before };
    return p.lastDebrief;
  }
  p.stats.raids++;
  p.stats.kills += res.kills;
  p.stats.elites += res.elites;
  // Class experience is banked on every ending: dying keeps it.
  const classXp = gainClassXp(p.classes, res);
  // Unspent raid Credits convert to Cash once, on extraction (the raid computed the share).
  let cashGain = res.creditCash || 0, droneCredits = 0;
  if (res.outcome === 'extracted') {
    p.stats.extractions++;
    p.tutorial.done = true;
    cashGain += res.bonus + res.contractPay + res.bossCash;
    p.samples += res.samples;
    p.cores += res.cores;
    if (res.bossKilled) {
      p.stats.bossKills++;
      // Pity counts banked kills that did not drop the signature, and resets when one does.
      p.pity = p.pity || { matron: 0 };
      p.pity.matron = res.signature ? 0 : p.pity.matron + 1;
    }
    p.stats.bestValue = Math.max(p.stats.bestValue, res.value);
    // T2 opens after one T1 extraction; T3 after a T2 extraction (doc 15).
    if (res.tier >= p.tierUnlocked && p.tierUnlocked < 3) p.tierUnlocked = res.tier + 1;
  } else {
    p.stats.deaths++;
    // Death or curfew: the worn kit stays, the pack and cargo are lost. An assigned drone flies
    // and is spent even if it lifts nothing; it returns Credits up to its allowance (doc 62).
    if (res.drone && DRONES[res.drone] && p.drones?.[res.drone] > 0) {
      p.drones[res.drone]--;
      if (!p.drones[res.drone] && p.drone === res.drone) p.drone = null;
      droneCredits = Math.min(res.credits || 0, DRONES[res.drone].credits);
      cashGain += Math.floor(droneCredits * CREDIT_CASH);
      if (res.cargo.length) p.pendingLift = { drone: res.drone, cargo: res.cargo };
    }
  }
  cashGain -= res.penalty;
  p.cash = Math.max(0, p.cash + cashGain);
  for (const it of res.inv) p.stash.push(it);
  settlePack(p, res);
  const wear = applyWear(p, res);
  p.lastDebrief = { ...res, inv: undefined, cargo: undefined, kept: res.inv.length, lifted: [], droneCredits, cashGain, wear, classXp, ratingBefore: before, ratingAfter: totalRating(p) };
  if (p.pendingLift && !choose) resolveLift(p);
  return p.lastDebrief;
}
