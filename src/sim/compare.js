// Hub comparison (docs 26, 63): an identified piece against the one worn in its slot, on the
// same class as it will deploy: its training and class tree are part of the baseline on both
// sides, with no raid buffs (level 1, no run items). It lists the stat rows that change,
// with units, and the rules gained and lost. It never folds them into a single score.

import { CLASSES, SLOTS, GEAR_AFFIXES } from './data.js';
import { gearStats } from './loot.js';
import { compileSkills } from './skill-build.js';

// Rows derived from the whole sheet. `low` marks rows where less is better.
const SHEET = [
  { label: 'Max health', unit: '', get: (c, g, b, d) => Math.round((c.hp + (d.training.hp || 0)) * (1 + g.hp / 100)) },
  { label: 'Damage', unit: '%', get: (c, g) => g.dmg },
  { label: 'Skill damage', unit: '%', get: (c, g) => g.skill },
  { label: 'Attack speed', unit: '%', get: (c, g, b) => (b.attackSpeed - 1) * 100 },
  { label: 'Critical chance', unit: '%', get: (c, g) => 5 + g.crit },
  { label: 'Damage reduction', unit: '%', get: (c, g) => Math.min(75, c.dr * 100 + g.dr) },
  { label: 'Move speed', unit: 'm/s', get: (c, g) => c.speed * (1 + g.move / 100) },
  { label: 'Health regen', unit: '/s', get: (c, g) => g.regen },
  { label: 'Cooldown reduction', unit: '%', get: (c, g) => g.cdr },
  { label: 'M2 cooldown', unit: 's', low: true, get: (c, g, b) => b.slots.m2?.params.cd },
  { label: 'S cooldown', unit: 's', low: true, get: (c, g, b) => b.slots.s?.params.cd },
  { label: 'R cooldown', unit: 's', low: true, get: (c, g, b) => b.slots.r?.params.cd },
];
const COVERED = new Set(['hp', 'dmg', 'skill', 'aspd', 'crit', 'dr', 'move', 'regen', 'cdr']);

// The hub sheet for a class wearing this kit: every row, then the rules (Aspects) it carries.
const NO_DEP = { tree: {}, training: {} };
// dep: the deployment snapshot from profile.deployment (tree and converted training), if any.
export function sheet(classId, equipped, dep = null) {
  const d = { tree: (dep && dep.tree) || NO_DEP.tree, training: (dep && dep.training) || NO_DEP.training };
  const c = CLASSES[classId], g = gearStats(equipped), b = compileSkills(classId, { gear: g, tree: d.tree, direct: d.training, preview: true });
  const rows = SHEET.map((r) => ({ label: r.label, unit: r.unit, low: !!r.low, value: r.get(c, g, b, d) ?? 0 }));
  // Any other affix line appears under its own label, so renamed lines follow automatically.
  for (const [k, a] of Object.entries(GEAR_AFFIXES)) if (!COVERED.has(k)) rows.push({ label: a.label, unit: a.unit, low: false, value: g[k] || 0 });
  // Rules: slot Aspects and any Latent Power, each named apart (doc 63).
  return { rows, rules: [...new Set(g.aspects)], latents: [...new Set(g.latents)] };
}

export function compareGear(classId, equipped, candidate, dep = null) {
  const slot = candidate.slot;
  if (!SLOTS.includes(slot)) return null;
  const a = sheet(classId, equipped, dep), b = sheet(classId, { ...equipped, [slot]: candidate }, dep);
  const rows = [];
  b.rows.forEach((r, i) => { const from = a.rows[i].value; if (Math.abs(r.value - from) > 1e-6) rows.push({ label: r.label, unit: r.unit, low: r.low, from, to: r.value }); });
  return {
    slot, worn: equipped[slot] || null, rows,
    gained: b.rules.filter((id) => !a.rules.includes(id)),
    lost: a.rules.filter((id) => !b.rules.includes(id)),
    latentGained: b.latents.filter((id) => !a.latents.includes(id)),
    latentLost: a.latents.filter((id) => !b.latents.includes(id)),
  };
}
