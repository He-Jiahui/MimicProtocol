import { ASPECTS, ITEMS, stackStat } from './data.js';
import { SKILL_KITS, SKILL_TUNING } from './skill-data.js';

/**
 * @typedef {'m1'|'m2'|'s'|'r'} Slot
 * @typedef {{type: 'param', slot: Slot, key: string, add: number}} ParamEffect
 * @typedef {{type: 'stat', key: string, add: number, cap?: number}} StatEffect
 * @typedef {{type: 'trigger', event: 'start'|'kill'|'shard'|'consume'|'cleanDodge',
 *   action: 'fill'|'resource'|'healFraction', value?: number, icd?: number, id?: string}} TriggerEffect
 */

// No raid, timers or RNG here. Numerical effects add per stack (cap is per
// source); a trigger is registered once, regardless of the number of stacks.
// A tuning entry maps one slot to 'enhanced' or one of its upgrade IDs.
export function compileSkills(classId, { gear = {}, items = {}, tuning = {} } = {}) {
  const slots = Object.fromEntries(SKILL_KITS[classId].map(({ key, behavior, params }) =>
    [key.toLowerCase(), { behavior, params: { ...params } }]));
  // brandBonus: "Branded enemies take more", a vulnerability line with no source in the item pool today.
  // rRate: extra cooldown rate for R alone.
  const stats = { brandBonus: 0, rRate: 0 };
  const triggers = {};
  /** @param {(ParamEffect|StatEffect|TriggerEffect)[]} effects */
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
        default: throw new Error(`Unknown skill effect: ${effect.type}`);
      }
    }
  }
  for (const id of new Set(gear.aspects)) apply(ASPECTS[id]?.effects);
  for (const [id, stacks] of Object.entries(items)) if (stacks > 0) apply(ITEMS[id]?.effects, stacks);
  for (const [slot, choice] of Object.entries(tuning)) {
    const powers = SKILL_TUNING[slots[slot]?.behavior];
    if (typeof choice !== 'string' || !powers || (choice !== 'enhanced' && !Object.hasOwn(powers.upgrades, choice))) {
      throw new Error(`Invalid tuning for ${classId}.${slot}: ${choice}`);
    }
    apply(powers.enhancement.effects);
    if (choice !== 'enhanced') apply(powers.upgrades[choice].effects);
  }
  const attackSpeed = 1 + (gear.aspd || 0) / 100 + stackStat(0.08, items.hair_trigger || 0);
  const builder = slots.m1.params;
  builder.interval /= attackSpeed;
  if (builder.finisherInterval !== undefined) builder.finisherInterval /= attackSpeed;
  // Rates divide (doc 64, Package 1): time = base / (1 + rate sum). Gear's cooldown rate is capped
  // at +100%; Coolant stacks resolve through stackStat first.
  const cdRate = 1 + Math.min(1, (gear.cdr || 0) / 100) + stackStat(0.06, items.coolant || 0);
  for (const [key, { params }] of Object.entries(slots)) if (params.cd !== undefined) params.cd /= cdRate + (key === 'r' ? stats.rRate : 0);
  return { slots, stats, triggers, attackSpeed };
}
