// Persistent class progression (doc 64, Package 7): experience and levels, kept per class and
// on death. Pure functions of the profile record; nothing here reads a raid in progress.

import { CLASS_IDS, stackStat } from './data.js';
import { CLASS_TREES, TREE_GATES } from './skill-data.js';
import { message } from '../i18n/index.js';

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
// + 150 for a boss + 60 for extracting, plus 25 a star for field jobs (doc 34). A boss killed
// before dying still counts.
export function raidXp({ level = 1, kills = 0, elites = 0, boss = false, extracted = false, jobs = 0 } = {}) {
  const parts = { level: 20 * Math.max(0, level - 1), kills: 2 * kills, elites: 30 * elites, boss: boss ? 150 : 0, extract: extracted ? 60 : 0, jobs };
  return { ...parts, total: parts.level + parts.kills + parts.elites + parts.boss + parts.extract + parts.jobs };
}

// ---- the class tree (doc 27 structure, doc 64 Package 7) ----
// One point per level gained, up to level 17: 16 points, exactly enough for every branch with one
// side of each pair. Knowing what a node does (the compiler) is kept apart from who may take it (here).
export const TREE_LAST_LEVEL = 17;
export const treePoints = (level) => Math.max(0, Math.min(level, TREE_LAST_LEVEL) - 1);

// Every node by its stable id, with its place: class, branch, kind, ranks, parent and pair sibling.
export const TREE_NODES = {};
for (const [classId, branches] of Object.entries(CLASS_TREES)) {
  branches.forEach((b, branch) => {
    const add = (n, kind, extra = {}) => {
      if (TREE_NODES[n.id]) throw new Error(`Duplicate tree node id: ${n.id}`);
      TREE_NODES[n.id] = { ...n, classId, branch, slot: b.slot, kind, ranks: n.ranks || 1, parent: null, sibling: null, ...extra };
    };
    add(b.enh, 'enh');
    b.pair.forEach((n, i) => add(n, 'pair', { parent: b.enh.id, sibling: b.pair[1 - i].id }));
    add(b.passive, 'passive');
  });
}
// Canonical order: branch by branch, Enhancement, the pair, the passive. Taking nodes in this order
// never needs a node that comes later.
export const treeOrder = (classId) => CLASS_TREES[classId].flatMap((b) => [b.enh.id, ...b.pair.map((n) => n.id), b.passive.id]);
export const treeSpent = (alloc) => Object.values(alloc || {}).reduce((a, r) => a + r, 0);
export function branchSpent(alloc) {
  const s = [0, 0, 0, 0];
  for (const [id, r] of Object.entries(alloc || {})) if (TREE_NODES[id]) s[TREE_NODES[id].branch] += r;
  return s;
}

// The first thing wrong with an allocation, or null. Ownership, ranks, prerequisites, exclusivity
// and gates follow from the allocation alone; the point budget needs the class level.
export function treeIssue(classId, alloc, points = Infinity) {
  if (!alloc || typeof alloc !== 'object' || Array.isArray(alloc)) return { code: 'shape' };
  for (const [id, r] of Object.entries(alloc)) {
    const n = TREE_NODES[id];
    if (!n || n.classId !== classId) return { code: 'unknown', id };
    if (!Number.isInteger(r) || r < 1 || r > n.ranks) return { code: 'rank', id };
  }
  for (const id of Object.keys(alloc)) {
    const n = TREE_NODES[id];
    if (n.parent && !alloc[n.parent]) return { code: 'parent', id, need: n.parent };
    if (n.sibling && alloc[n.sibling]) return { code: 'exclusive', id, other: n.sibling };
  }
  const spent = branchSpent(alloc);
  for (let b = 1, earlier = spent[0]; b < spent.length; earlier += spent[b++]) {
    if (spent[b] > 0 && earlier < TREE_GATES[b]) return { code: 'gate', branch: b, need: TREE_GATES[b], have: earlier };
  }
  const total = treeSpent(alloc);
  if (total > points) return { code: 'points', need: total, have: points };
  return null;
}

const nodeName = (id) => message(TREE_NODES[id]?.name || id);
// A player-facing reason for an issue, naming the node or the threshold.
export function treeReason(classId, issue) {
  if (!issue) return null;
  switch (issue.code) {
    case 'unknown': return message('Unknown node');
    case 'rank': return message('{node} is at its highest rank', { node: nodeName(issue.id) });
    case 'parent': return message('{node} needs {parent}', { node: nodeName(issue.id), parent: nodeName(issue.need) });
    case 'exclusive': return message('{node} and {other} exclude each other', { node: nodeName(issue.id), other: nodeName(issue.other) });
    case 'gate': return message('{branch} needs {need} points in earlier branches ({have} spent)', { branch: message(CLASS_TREES[classId][issue.branch].name), need: issue.need, have: issue.have });
    case 'points': return message('No tree points left ({have} earned)', { have: issue.have });
    default: return message('Not a valid tree');
  }
}
const verdict = (classId, alloc, points, extra = {}) => {
  const issue = treeIssue(classId, alloc, points);
  return issue ? { ok: false, issue, why: treeReason(classId, issue) } : { ok: true, alloc, ...extra };
};

// Take one rank. Taking the other side of an owned pair swaps the two in one step: the point moves,
// so nothing that depends on the branch's total is stranded in between.
export function treeTake(classId, alloc, id, points) {
  const n = TREE_NODES[id];
  if (!n || n.classId !== classId) return { ok: false, issue: { code: 'unknown', id }, why: treeReason(classId, { code: 'unknown' }) };
  const cur = alloc[id] || 0;
  if (cur >= n.ranks) return { ok: false, issue: { code: 'rank', id }, why: treeReason(classId, { code: 'rank', id }) };
  const next = { ...alloc, [id]: cur + 1 };
  const swapped = n.sibling && next[n.sibling] ? n.sibling : null;
  if (swapped) delete next[swapped];
  return verdict(classId, next, points, { swapped });
}
// Return one rank, free in the hub. What remains must still stand: the refusal names the node that
// needs it or the branch whose threshold it would break, and nothing changes.
export function treeRefund(classId, alloc, id, points) {
  const cur = alloc[id] || 0;
  if (!cur) return { ok: false, issue: { code: 'unowned', id }, why: message('{node} is not owned', { node: nodeName(id) }) };
  const next = { ...alloc };
  if (cur > 1) next[id] = cur - 1; else delete next[id];
  return verdict(classId, next, points);
}
// On load or after a level change: unknown or removed nodes, broken prerequisites, both sides of a
// pair and points beyond the budget are dropped, which returns their points. What is kept is re-taken
// in canonical order, so the result always validates.
export function cleanTree(classId, alloc, points) {
  let out = {};
  if (!alloc || typeof alloc !== 'object') return out;
  for (const id of treeOrder(classId)) {
    const want = Number.isInteger(alloc[id]) ? Math.min(alloc[id], TREE_NODES[id].ranks) : 0, sib = TREE_NODES[id].sibling;
    if (sib && out[sib]) continue;
    for (let r = 1; r <= want; r++) {
      const next = { ...out, [id]: r };
      if (treeIssue(classId, next, points)) break;
      out = next;
    }
  }
  return out;
}

// ---- training (docs 52, 54; doc 64 Package 7) ----
// Three aptitudes. Each class starts with its primary at 6 and the others at 3, and earns one free
// point at class levels 3, 6, 9, 12, 15 and 18, re-assignable in the hub. Only the free points are
// stored; the starting split is the class's own.
export const APTITUDES = ['handling', 'conditioning', 'systems'];
export const PRIMARY = { rifleman: 'handling', blade: 'conditioning', summoner: 'systems', toxic: 'systems' };
export const TRAIN_LEVELS = [3, 6, 9, 12, 15, 18];
export const trainingFree = (level) => TRAIN_LEVELS.filter((l) => level >= l).length;
export const trainingBase = (classId) => Object.fromEntries(APTITUDES.map((a) => [a, a === PRIMARY[classId] ? 6 : 3]));
// What one point is worth (start), before the diminishing conversion.
export const TRAINING = {
  handling: { m1Rate: 0.015, searchRate: 0.03 },          // M1 rate; container search rate
  conditioning: { hp: 3, freeKg: 0.5 },                   // flat health on the class base; free carry
  systems: { summonDur: 0.025, venomDur: 0.025, terminalRate: 0.03 },
};
export const NO_TRAINING = Object.freeze({ m1Rate: 0, searchRate: 0, hp: 0, freeKg: 0, summonDur: 0, venomDur: 0, terminalRate: 0 });
const newTrain = () => Object.fromEntries(APTITUDES.map((a) => [a, 0]));
// Free points as stored, made whole: integers, never negative, never more than the level allows.
// An over-assigned record is cleared (every point back to unassigned) rather than guessed at.
export function cleanTrain(train, free) {
  const out = newTrain();
  for (const a of APTITUDES) if (Number.isInteger(train?.[a]) && train[a] > 0) out[a] = train[a];
  return APTITUDES.reduce((s, a) => s + out[a], 0) > free ? newTrain() : out;
}
export const trainingAssigned = (train) => APTITUDES.reduce((s, a) => s + (train?.[a] || 0), 0);
// Trained points per aptitude, and their direct stats, converted once through e x n / (1 + 0.1 (n - 1))
// (doc 54): later points are worth less and the total stays under 10 e.
export function trainingStats(classId, train) {
  const base = trainingBase(classId), points = {}, direct = { ...NO_TRAINING };
  for (const a of APTITUDES) {
    const n = points[a] = base[a] + (train?.[a] || 0);
    for (const [k, e] of Object.entries(TRAINING[a])) direct[k] += stackStat(e, n);
  }
  return { points, direct };
}

// One record per class. Old profiles have none: every class starts at level 1 with an empty tree
// and its starting training.
export const newClassRecord = () => ({ xp: 0, tree: {}, train: newTrain() });
export function cleanClassRecord(classId, rec) {
  const base = rec && typeof rec === 'object' ? rec : {};
  const xp = Number.isFinite(base.xp) ? Math.min(XP_CAP, Math.max(0, Math.floor(base.xp))) : 0;
  const level = classLevel(xp).level;
  return { ...base, xp, tree: cleanTree(classId, base.tree, treePoints(level)), train: cleanTrain(base.train, trainingFree(level)) };
}
export function cleanClasses(classes) {
  const out = {};
  for (const id of CLASS_IDS) out[id] = cleanClassRecord(id, classes?.[id]);
  return out;
}
// What a class may spend: earned from its level, spent by its validated allocation.
export function treeBudget(rec) {
  const level = classLevel(rec.xp).level, earned = treePoints(level), spent = treeSpent(rec.tree);
  return { level, earned, spent, left: earned - spent };
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
