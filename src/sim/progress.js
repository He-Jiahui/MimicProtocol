// Persistent class progression (doc 64, Package 7): experience and levels, kept per class and
// on death. Pure functions of the profile record; nothing here reads a raid in progress.

import { CLASS_IDS } from './data.js';

export const CLASS_MAX_LEVEL = 20; // the demo's cap
// Experience for the next level (start): 120 x level^1.4, rounded. Nothing past the cap.
export const xpToNext = (level) => (level >= CLASS_MAX_LEVEL ? 0 : Math.round(120 * Math.pow(level, 1.4)));
// Total experience that stands at `level`, counted from level 1.
export function xpForLevel(level) {
  let total = 0;
  for (let l = 1; l < Math.min(level, CLASS_MAX_LEVEL); l++) total += xpToNext(l);
  return total;
}
export const XP_CAP = xpForLevel(CLASS_MAX_LEVEL);

// Level and progress into it from a class's banked experience.
export function classLevel(xp = 0) {
  let level = 1, left = Math.max(0, Math.floor(xp));
  while (level < CLASS_MAX_LEVEL && left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  return { level, xp: level >= CLASS_MAX_LEVEL ? 0 : left, need: xpToNext(level), max: level >= CLASS_MAX_LEVEL };
}

// Experience from one raid, kept on death: 20 x (raid level - 1) + 2 x kills + 30 x elites
// + 150 for a boss + 60 for extracting. A boss killed before dying still counts.
export function raidXp({ level = 1, kills = 0, elites = 0, boss = false, extracted = false } = {}) {
  const parts = { level: 20 * Math.max(0, level - 1), kills: 2 * kills, elites: 30 * elites, boss: boss ? 150 : 0, extract: extracted ? 60 : 0 };
  return { ...parts, total: parts.level + parts.kills + parts.elites + parts.boss + parts.extract };
}

// One record per class. Old profiles have none: every class starts at level 1.
export const newClassRecord = () => ({ xp: 0 });
export function cleanClassRecord(rec) {
  const xp = Number.isFinite(rec?.xp) ? Math.min(XP_CAP, Math.max(0, Math.floor(rec.xp))) : 0;
  return { ...(rec && typeof rec === 'object' ? rec : {}), xp };
}
export function cleanClasses(classes) {
  const out = {};
  for (const id of CLASS_IDS) out[id] = cleanClassRecord(classes?.[id]);
  return out;
}

// Bank a finished raid's experience on the class that ran it; the result says what was reached.
export function gainClassXp(classes, res) {
  const rec = classes[res.classId];
  if (!rec) return null;
  const parts = res.classXp || raidXp({ level: res.level, kills: res.kills, elites: res.elites, boss: res.bossKilled, extracted: res.outcome === 'extracted' });
  const from = classLevel(rec.xp);
  rec.xp = Math.min(XP_CAP, rec.xp + parts.total);
  const to = classLevel(rec.xp);
  return { ...parts, gain: parts.total, from: from.level, to: to.level, xp: to.xp, need: to.need, max: to.max };
}
