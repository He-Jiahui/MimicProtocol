import { ASPECTS, ITEMS, stackStat } from './data.js';
import { SKILL_KITS, TREE_RULES } from './skill-data.js';
import { TREE_NODES, treeIssue, treeOrder } from './progress.js';

/**
 * @typedef {'m1'|'m2'|'s'|'r'} Slot
 * @typedef {{type: 'param', slot: Slot, key: string, add: number}} ParamEffect
 * @typedef {{type: 'stat', key: string, add: number, cap?: number}} StatEffect
 * @typedef {{type: 'trigger', event: 'start'|'kill'|'shard'|'consume'|'cleanDodge',
 *   action: 'fill'|'resource'|'healFraction', value?: number, icd?: number, id?: string}} TriggerEffect
 * @typedef {{type: 'rule', key: string, value: string|boolean}} RuleEffect
 */

// No raid, timers or RNG here. Numerical effects add per stack (cap is per
// source); a trigger is registered once, regardless of the number of stacks;
// a rule is a named switch a behavior reads, and two sources may not disagree.
// `tree` is a class tree allocation {nodeId: rank}, validated before it reaches here: the
// compiler still refuses a broken one unless `preview` asks for a hypothetical build (the hub's
// "what would this node do"). Each owned node applies once per rank; a child never applies its
// parent again. `direct` holds training's converted stats (doc 52), entered once into their pools.
export function compileSkills(classId, { gear = {}, items = {}, tree = {}, direct = {}, preview = false } = {}) {
  const slots = Object.fromEntries(SKILL_KITS[classId].map(({ key, behavior, params }) =>
    [key.toLowerCase(), { behavior, params: { ...params } }]));
  // brandBonus: "Branded enemies take more", a vulnerability line with no source in the item pool today.
  // rRate: extra cooldown rate for R alone.
  const stats = { brandBonus: 0, rRate: 0 };
  const triggers = {};
  const rules = {};
  /** @param {(ParamEffect|StatEffect|TriggerEffect|RuleEffect)[]} effects */
  function apply(effects = [], stacks = 1) {
    for (const effect of effects) {
      switch (effect.type) {
        case 'param': {
          const params = slots[effect.slot].params;
          if (!Object.hasOwn(params, effect.key)) throw new Error(`Unknown ${effect.slot} parameter: ${effect.key}`);
          params[effect.key] += effect.add * stacks;
          break;
        }
        case 'stat':
          if (!Object.hasOwn(stats, effect.key)) throw new Error(`Unknown skill stat: ${effect.key}`);
          stats[effect.key] += Math.min(effect.add * stacks, effect.cap ?? Infinity);
          break;
        case 'trigger':
          if (effect.icd && !effect.id) throw new Error('A trigger with an internal cooldown needs a stable id');
          (triggers[effect.event] ??= []).push({ ...effect });
          break;
        case 'rule':
          if (!TREE_RULES[effect.key]?.includes(effect.value)) throw new Error(`Unknown skill rule: ${effect.key}=${effect.value}`);
          if (Object.hasOwn(rules, effect.key) && rules[effect.key] !== effect.value) throw new Error(`Conflicting skill rule: ${effect.key}`);
          rules[effect.key] = effect.value;
          break;
        default: throw new Error(`Unknown skill effect: ${effect.type}`);
      }
    }
  }
  for (const id of new Set(gear.aspects)) apply(ASPECTS[id]?.effects);
  for (const [id, stacks] of Object.entries(items)) if (stacks > 0) apply(ITEMS[id]?.effects, stacks);
  if (!preview) {
    const issue = treeIssue(classId, tree);
    if (issue) throw new Error(`Invalid tree for ${classId}: ${issue.code} ${issue.id || issue.branch || ''}`.trim());
  }
  for (const id of treeOrder(classId)) if (tree[id] > 0) apply(TREE_NODES[id].effects, Math.min(tree[id], TREE_NODES[id].ranks));
  const attackSpeed = 1 + (gear.aspd || 0) / 100 + stackStat(0.08, items.hair_trigger || 0) + (direct.m1Rate || 0);
  const builder = slots.m1.params;
  builder.interval /= attackSpeed;
  if (builder.finisherInterval !== undefined) builder.finisherInterval /= attackSpeed;
  // Rates divide (doc 64, Package 1): time = base / (1 + rate sum). Gear's cooldown rate is capped
  // at +100%; Coolant stacks resolve through stackStat first.
  const cdRate = 1 + Math.min(1, (gear.cdr || 0) / 100) + stackStat(0.06, items.coolant || 0);
  for (const [key, { params }] of Object.entries(slots)) if (params.cd !== undefined) params.cd /= cdRate + (key === 'r' ? stats.rRate : 0);
  return { slots, stats, triggers, rules, attackSpeed };
}

// A tree node in plain words with numbers from the compiled build (doc 64, Package 7). `alloc` is the
// allocation shown; the node is compared without it and with it (or, for one not yet at its top rank,
// at its next rank), against the same gear and training as the raid would compile.
export function describeNode(classId, alloc, id, inputs = {}) {
  const n = TREE_NODES[id], cur = alloc[id] || 0;
  const withRank = cur < n.ranks ? cur + 1 : cur, without = { ...alloc };
  if (withRank - 1 > 0) without[id] = withRank - 1; else delete without[id];
  const withAlloc = { ...without, [id]: withRank };
  if (n.sibling) { delete without[n.sibling]; delete withAlloc[n.sibling]; }
  const A = compileSkills(classId, { ...inputs, tree: without, preview: true });
  const B = compileSkills(classId, { ...inputs, tree: withAlloc, preview: true });
  const fx = n.effects.find((e) => e.type === 'param');
  const [slot, key] = n.show || (fx ? [fx.slot, fx.key] : [n.slot, null]);
  const vals = { ...B.slots[n.slot].params };
  if (key) { vals.from = A.slots[slot].params[key]; vals.to = B.slots[slot].params[key]; }
  Object.assign(vals, n.vals ? n.vals(B, A) : {});
  for (const k of Object.keys(vals)) if (typeof vals[k] === 'number') vals[k] = fmtNum(vals[k]);
  return { source: n.desc, values: vals, rank: withRank, next: cur < n.ranks };
}
// Three significant figures, no trailing zeros.
export const fmtNum = (v) => String(Number(Number(v).toPrecision(3)));
