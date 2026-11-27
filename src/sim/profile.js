// Persistent profile and hub economy (docs 16, 19). Storage is injected so the
// same code runs in Node tests with an in-memory store.

import { Rng } from '../core/rng.js';
import { SLOTS, GEAR_AFFIX_IDS, enhanceCost, REROLL_CASH, REROLL_SAMPLES, PROCESS_SAMPLES, gearRating, CLASS_IDS } from './data.js';
import { starterItem, rollAffix, gearValue, gearStats } from './loot.js';
import { trainingContainerItem } from './tutorial.js';
import { message } from '../i18n/index.js';

// Own storage root; never reads or writes the StormBound key (doc 13, section 6).
export const PROFILE_KEY = 'mimicprotocol.profile.v1';
export const PROFILE_VERSION = 1;

export function newProfile() {
  const equipped = {};
  for (const s of SLOTS) equipped[s] = starterItem(s);
  return {
    v: PROFILE_VERSION, seq: 1,
    cash: 300, samples: 2, cores: 0,
    classId: 'rifleman', tier: 1, tierUnlocked: 1,
    equipped, stash: [],
    stats: { raids: 0, extractions: 0, deaths: 0, kills: 0, elites: 0, bossKills: 0, bestValue: 0 },
    tutorial: { annex: false, sold: 0, processed: false, equipped: false, enhanced: false, rerolled: false, classPicked: false, tierPicked: false, done: false },
    lastDebrief: null,
  };
}

export function loadProfile(storage) {
  try {
    const raw = storage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.v !== PROFILE_VERSION || !p.equipped || !Array.isArray(p.stash)) return null;
    return p;
  } catch {
    return null;
  }
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

export function sellItem(p, uid) {
  const i = findStash(p, uid);
  if (i < 0) return { ok: false, why: 'Item not found' };
  const it = p.stash[i];
  if (it.unid) return { ok: false, why: 'Process it at the Lab first' };
  p.stash.splice(i, 1);
  p.cash += it.value;
  if (it.tutorial && it.kind === 'loot') p.tutorial.sold++;
  return { ok: true, cash: it.value };
}

// Process = appraise plus decontaminate in one action (doc 15, overrides).
export function processItem(p, uid) {
  const i = findStash(p, uid);
  if (i < 0) return { ok: false, why: 'Item not found' };
  const it = p.stash[i];
  if (!it.unid) return { ok: false, why: 'Already identified' };
  if (!hubTutorialActive(p)) {
    if (p.samples < PROCESS_SAMPLES) return { ok: false, why: 'Not enough Lab Samples' };
    p.samples -= PROCESS_SAMPLES;
  }
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
  if (!hubTutorialActive(p)) {
    const cost = enhanceCost(lvl);
    if (p.cash < cost) return { ok: false, why: `Needs ${cost} Cash`, reason: message('Needs {cost} Cash', { cost }) };
    if (lvl >= 5) {
      if (p.cores < 1) return { ok: false, why: 'Needs a Boss Core' };
      p.cores -= 1;
    }
    p.cash -= cost;
  }
  it.enh = lvl + 1;
  it.value = gearValue(it);
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
  it.affixes[index] = rollAffix(rng, rng.pick(pool), it.ilvl, false);
  p.tutorial.rerolled = true;
  return { ok: true, affix: it.affixes[index] };
}

export function setClass(p, classId) {
  if (!CLASS_IDS.includes(classId)) return { ok: false, why: 'Unknown class' };
  p.classId = classId;
  p.tutorial.classPicked = true;
  return { ok: true };
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

// Apply a finished raid (or the tutorial annex) to the profile.
export function applyRaidResult(p, res) {
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
  let cashGain = res.banked;
  if (res.outcome === 'extracted') {
    p.stats.extractions++;
    p.tutorial.done = true;
    cashGain += res.bonus + res.contractPay + res.bossCash;
    p.samples += res.samples;
    p.cores += res.cores;
    if (res.bossKilled) p.stats.bossKills++;
    p.stats.bestValue = Math.max(p.stats.bestValue, res.value);
    // T2 opens after one T1 extraction; T3 after a T2 extraction (doc 15).
    if (res.tier >= p.tierUnlocked && p.tierUnlocked < 3) p.tierUnlocked = res.tier + 1;
  } else {
    p.stats.deaths++;
  }
  cashGain -= res.penalty;
  p.cash = Math.max(0, p.cash + cashGain);
  for (const it of res.inv) p.stash.push(it);
  p.lastDebrief = { ...res, inv: undefined, kept: res.inv.length, cashGain, ratingBefore: before, ratingAfter: totalRating(p) };
  return p.lastDebrief;
}
