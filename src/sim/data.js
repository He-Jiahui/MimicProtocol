import { SKILL_KITS } from './skill-data.js';
export { CHARGE } from './skill-data.js';

// Static game data for the web demo. Numbers follow docs 17, 18, 19 and 23 where
// they are stated; everything else is a tuning guess marked (Proposal) in spirit.

export const BLOCK = 100;          // metres per city block (doc 17)
export const BLOCKS = 5;           // 5 x 5 blocks = a 500 m square, built densely
export const ROAD_HALF = 7;        // road half width at each block edge
export const CLOCK_START = 18.5;   // 18:30
export const CLOCK_HOURS = 7.5;    // until 02:00
export const RAID_SECONDS = 30 * 60;
export const SCAN_RANGE = 35;
export const SCAN_TIME = 4;
export const SCAN_COOLDOWN = 8;
export const PASSIVE_RANGE = 12;
export const EXTRACT_TIME = 6;
export const HOSTILE_CAP = 48;      // hard cap on hostile enemies
export const AUTO_CAP = 32;         // the director stops reinforcing at this many
// Global tuning applied to every regular enemy on top of the per-archetype numbers.
export const ENEMY_HP = 0.75, ENEMY_DMG = 0.7, ELITE_HP = 3, ELITE_DMG = 1.15;
export const SUMMON_CAP = 6;

// ---- Danger zones (doc 17, section 3) ----
export const ZONES = [
  { id: 0, name: 'Shelter', label: 'Z0 SAFE', hp: 1.0, dmg: 1.0, elite: 0.0, loot: 0.5, host: 0.0, color: [0.45, 0.75, 1.0], css: '#7ac4ff', mimics: [] },
  { id: 1, name: 'Calm', label: 'Z1 LOW', hp: 1.0, dmg: 1.0, elite: 0.03, loot: 1.0, host: 1.0, color: [0.3, 0.95, 0.5], css: '#55e88a', mimics: ['walker', 'walker', 'walker', 'spitter'] },
  { id: 2, name: 'Contested', label: 'Z2 ELEVATED', hp: 1.3, dmg: 1.15, elite: 0.06, loot: 1.4, host: 1.3, color: [1.0, 0.9, 0.25], css: '#ffe04a', mimics: ['walker', 'walker', 'spitter', 'skitter', 'skitter'] },
  { id: 3, name: 'Hot', label: 'Z3 HIGH', hp: 1.7, dmg: 1.35, elite: 0.09, loot: 1.9, host: 1.6, color: [1.0, 0.55, 0.15], css: '#ff9230', mimics: ['walker', 'walker', 'spitter', 'skitter', 'skitter', 'brute'] },
  { id: 4, name: 'Core', label: 'Z4 CRITICAL', hp: 2.2, dmg: 1.6, elite: 0.12, loot: 2.6, host: 2.0, color: [1.0, 0.2, 0.25], css: '#ff3d4d', mimics: ['walker', 'spitter', 'skitter', 'skitter', 'brute', 'hollow', 'hollow'] },
];

// Chance that an ambient pedestrian is a disguised Mimic, by zone.
export const MIMIC_SHARE = [0, 0.3, 0.4, 0.5, 0.62];

// ---- Threat Tiers (demo: T1 to T3). hp 1.2^(T-1) gives the 1.44 of doc 17. ----
export const TIERS = [
  null,
  { id: 1, hp: 1.0, dmg: 1.0, elite: 0.0, rare: 1.0, pay: 1.0 },
  { id: 2, hp: 1.2, dmg: 1.15, elite: 0.03, rare: 1.25, pay: 1.15 },
  { id: 3, hp: 1.44, dmg: 1.32, elite: 0.06, rare: 1.5, pay: 1.3 },
];

export const BANDS = [
  { name: 'Dusk', from: 18.5 },
  { name: 'Nightfall', from: 20.5 },
  { name: 'Night', from: 22.5 },
  { name: 'Deep Night', from: 24.5 },
];

// ---- Mimic archetypes (doc 03, section 3) ----
export const ENEMIES = {
  // windup: seconds of telegraph before the hit; recover: seconds it is winded afterwards.
  walker: { name: 'Husk', hp: 48, dmg: 9, speed: 4.2, r: 0.5, xp: 6, credits: 3, range: 1.9, windup: 0.75, cd: 1.6, recover: 0.9 },
  mite: { name: 'Mite', hp: 15, dmg: 5, speed: 5.2, r: 0.32, xp: 5, credits: 1, range: 3.2, windup: 0.5, cd: 1.8, recover: 0.9 },
  spitter: { name: 'Bloat', hp: 46, dmg: 11, speed: 3.6, r: 0.5, xp: 10, credits: 5, range: 16, windup: 0.9, cd: 3.2, recover: 0.3 },
  skitter: { name: 'Skitter', hp: 36, dmg: 9, speed: 7.0, r: 0.45, xp: 9, credits: 6, range: 6.5, windup: 0.6, cd: 2.4, recover: 1.1 },
  brute: { name: 'Brute', hp: 280, dmg: 26, speed: 3.1, r: 0.9, xp: 30, credits: 16, range: 3.6, windup: 1.3, cd: 3.0, poise: 60, recover: 1.2 },
  mote: { name: 'Mote', hp: 34, dmg: 14, speed: 4.2, r: 0.45, xp: 9, credits: 4, range: 16, windup: 1.4, cd: 4.0, recover: 0.6 },
  lobber: { name: 'Lobber', hp: 90, dmg: 18, speed: 2.8, r: 0.7, xp: 14, credits: 7, range: 23, windup: 1.0, cd: 4.2, recover: 0.8 },
  titan: { name: 'Titan', hp: 1700, dmg: 30, speed: 3.2, r: 1.5, xp: 160, credits: 60, range: 5.2, windup: 1.4, cd: 3.2, poise: 300, recover: 1.4 },
  hollow: { name: 'Hollow', hp: 30, dmg: 22, speed: 5.6, r: 0.42, xp: 7, credits: 4, range: 2.4, windup: 1.0, cd: 9, recover: 0 },
  // Boss and boss parts (doc 22, B1)
  matron: { name: 'Matron of Hollows', hp: 3900, dmg: 22, speed: 3.4, r: 2.2, xp: 400, credits: 150, range: 7, windup: 1.4, cd: 3.2, poise: 320, boss: true },
  cyst: { name: 'Brood Cyst', hp: 220, dmg: 0, speed: 0, r: 1.3, xp: 12, credits: 0, range: 0, windup: 0, cd: 0, structure: true },
  dummy: { name: 'Target Dummy', hp: 120, dmg: 0, speed: 0, r: 0.5, xp: 0, credits: 0, range: 0, windup: 0, cd: 0, structure: true },
};

// ---- Elite affixes (doc 18, section 4) ----
export const AFFIXES = {
  armored: { name: 'Armored', color: [0.45, 0.65, 1.0], css: '#74a6ff' },
  blazing: { name: 'Blazing', color: [1.0, 0.5, 0.1], css: '#ff8a1e' },
  voltaic: { name: 'Voltaic', color: [0.6, 0.9, 1.0], css: '#9ee6ff' },
  leeching: { name: 'Leeching', color: [0.3, 1.0, 0.4], css: '#56ff6e' },
  hivebound: { name: 'Hivebound', color: [0.9, 0.8, 0.3], css: '#e8cc4c' },
  phasing: { name: 'Phasing', color: [0.85, 0.4, 1.0], css: '#d966ff' },
};
export const AFFIX_IDS = Object.keys(AFFIXES);

// ---- Run items (doc 18, section 5) ----
export const RARITY = [
  { name: 'Common', css: '#b9c4cf', color: [0.75, 0.8, 0.85], q: 1.0 },
  { name: 'Enhanced', css: '#4de1ff', color: [0.3, 0.9, 1.0], q: 1.1 },
  { name: 'Rare', css: '#6c8cff', color: [0.45, 0.55, 1.0], q: 1.25 },
  { name: 'Prototype', css: '#ffc23d', color: [1.0, 0.78, 0.25], q: 1.45 },
  { name: 'Legendary', css: '#ff5e3a', color: [1.0, 0.4, 0.2], q: 1.7 },
];
// Run item rarity index: 0 Common, 1 Enhanced, 3 Prototype (shares the gear palette).
export const ITEMS = {
  hair_trigger: { name: 'Hair Trigger', rarity: 0, tag: 'Ballistic', desc: '+8% attack speed' },
  spike_gloves: { name: 'Spike Gloves', rarity: 0, tag: 'Melee', desc: '+10% melee damage' },
  plating: { name: 'Reinforced Plating', rarity: 0, tag: 'Defense', desc: '+12% max health' },
  coolant: { name: 'Coolant Loop', rarity: 0, tag: 'Utility', desc: '-6% skill cooldowns' },
  salvage_eye: { name: 'Salvage Eye', rarity: 0, tag: 'Economy', desc: '+8% Credits' },
  static_coil: { name: 'Static Coil', rarity: 1, tag: 'Elemental', desc: '8% on hit: arc lightning for 120% damage' },
  venom_sac: { name: 'Venom Sac', rarity: 1, tag: 'DoT', desc: '+15% damage over time; ticks can spread a stack' },
  overwatch: { name: 'Overwatch Node', rarity: 1, tag: 'Summon', desc: 'Summons last +15% longer, deal +10% damage' },
  hardlight: { name: 'Hardlight Barrier', rarity: 1, tag: 'Defense', desc: 'Barrier of 10% max health, returns after 8 s' },
  hive_core: { name: 'Hive Core', rarity: 3, tag: 'Summon', desc: '6% on kill: spawn a drone for 10 s' },
  mimic_heart: { name: 'Mimic Heart', rarity: 3, tag: 'Sustain', desc: 'Kills heal 1% and add +0.5% damage (max +10%)' },
  ghost_signal: { name: 'Ghost Signal', rarity: 3, tag: 'Sense', desc: 'Resonance Link flip time +25%' },
  // Horde tools: these fire on their own.
  piercer: { name: 'Tungsten Core', rarity: 0, tag: 'Ballistic', desc: 'Shots pierce +1 enemy' },
  magnet: { name: 'Salvage Magnet', rarity: 0, tag: 'Utility', desc: '+40% pickup range' },
  frag_rounds: { name: 'Frag Rounds', rarity: 1, tag: 'Explosive', desc: 'Kills have a 20% chance to burst for 40 damage' },
  orbit_blades: { name: 'Orbit Blades', rarity: 1, tag: 'Melee', desc: 'Blades circle you and cut what they touch' },
  arc_emitter: { name: 'Arc Emitter', rarity: 1, tag: 'Elemental', desc: 'Chain lightning strikes nearby enemies every 2.4 s' },
  nova_core: { name: 'Nova Core', rarity: 3, tag: 'Elemental', desc: 'A shock nova bursts from you every 6 s and slows' },
  // Synergy items: they key off Charge, Builders, Spenders, Brands, Consume and Overdrive (doc 24).
  capacitor: { name: 'Capacitor', rarity: 0, tag: 'Charge', desc: '+25 max Charge',
    effects: [{ type: 'stat', key: 'capacity', add: 25 }] },
  overflow: { name: 'Overflow Valve', rarity: 0, tag: 'Builder', desc: 'At full Charge, Builders deal +25% damage',
    effects: [{ type: 'stat', key: 'fullBuilderBonus', add: 0.25 }] },
  feedback: { name: 'Feedback Loop', rarity: 1, tag: 'Consume', desc: 'Each Consume refunds +5 Charge and deals 20 damage' },
  catalyst: { name: 'Catalyst', rarity: 1, tag: 'Brand', desc: 'Branded enemies take +10% damage from every source',
    effects: [{ type: 'stat', key: 'brandBonus', add: 0.1, cap: 0.3 }] },
  afterglow: { name: 'Afterglow', rarity: 1, tag: 'Overdrive', desc: 'Overdrive lasts +2 s; kills during it extend it',
    effects: [{ type: 'stat', key: 'overdriveTime', add: 2 }, { type: 'trigger', event: 'kill', when: 'overdrive', action: 'extend', value: 0.3, cap: 4 }] },
  echo: { name: 'Echo Chamber', rarity: 3, tag: 'Spender', desc: 'Every third Spender is cast again, free, at 60% power' },
};
export const ITEM_IDS = Object.keys(ITEMS);

// Stat item stacking: e*s / (1 + 0.1(s-1)), limited to 10e (doc 18).
export const stackStat = (e, s) => (s <= 0 ? 0 : Math.min(10 * e, (e * s) / (1 + 0.1 * (s - 1))));
export const stackChance = (p, s) => 1 - Math.pow(1 - p, s);

// Rarity odds for a run item given quality Q (doc 18, end of section 5).
export function itemRarityWeights(Q) {
  return [70, 25 * Q, 5 * Math.pow(Q, 1.5)];
}

// ---- Classes (doc 18, section 3) ----
export const CLASSES = {
  rifleman: {
    name: 'Rifleman', role: 'Ranged rifleman', color: [0.35, 0.8, 1.0], css: '#5cd0ff', hp: 110, speed: 6.3, dr: 0,
    blurb: 'Build Suppression with bursts, spend it with a piercing shot, roll to reset.',
    skills: SKILL_KITS.rifleman,
  },
  blade: {
    name: 'Blade', role: 'Melee blade', color: [1.0, 0.35, 0.5], css: '#ff5c84', hp: 135, speed: 6.9, dr: 0.2,
    blurb: 'Three strikes Expose, Whirl spends Exposed for refunds, Lunge keeps the chain alive.',
    skills: SKILL_KITS.blade,
  },
  summoner: {
    name: 'Summoner', role: 'Summoner', color: [1.0, 0.8, 0.3], css: '#ffcf4a', hp: 100, speed: 6.1, dr: 0,
    blurb: 'Mark with grenades, let sentries focus marks, hop to overclock them.',
    skills: SKILL_KITS.summoner,
  },
  toxic: {
    name: 'Toxic Handler', role: 'Damage over time', color: [0.55, 1.0, 0.35], css: '#8dff5a', hp: 105, speed: 6.2, dr: 0,
    blurb: 'Stack Venom, convert it with Wither Cloud, then spread it with Plague Burst.',
    skills: SKILL_KITS.toxic,
  },
};
export const CLASS_IDS = Object.keys(CLASSES);

// ---- Gear (docs 19, 23, 63) ----
// Six worn slots. The rig's lines live on the head; the backpack is a field pack, not worn.
export const SLOTS = ['weapon', 'head', 'body', 'hands', 'waist', 'shoes'];
export const SLOT_LABEL = { weapon: 'Weapon', head: 'Head', body: 'Body', hands: 'Hands', waist: 'Waist', shoes: 'Shoes' };
export const SLOT_WEIGHTS = [30, 16, 22, 12, 10, 10];
// Base stat granted by each slot per Item Power (doc 64, package 4, start). crit is in
// percentage points, regen in health a second, the rest in percent.
export const SLOT_BASE = {
  weapon: { k: 'dmg', per: 1.0, label: 'Damage', unit: '%' },
  head: { k: 'skill', per: 0.9, label: 'Skill damage', unit: '%' },
  body: { k: 'hp', per: 1.2, label: 'Max health', unit: '%' },
  hands: { k: 'crit', per: 0.12, label: 'Critical chance', unit: '%' },
  waist: { k: 'regen', per: 0.02, label: 'Health regen', unit: '/s' },
  shoes: { k: 'move', per: 0.12, label: 'Move speed', unit: '%' },
};
// Affix pool: value range at item level 10; scales with sqrt(ilvl / 10).
export const GEAR_AFFIXES = {
  dmg: { label: 'Damage', lo: 4, hi: 9, unit: '%' },
  aspd: { label: 'Attack speed', lo: 3, hi: 8, unit: '%' },
  crit: { label: 'Critical chance', lo: 3, hi: 7, unit: '%' },
  hp: { label: 'Max health', lo: 5, hi: 11, unit: '%' },
  dr: { label: 'Damage reduction', lo: 2, hi: 6, unit: '%' },
  cdr: { label: 'Cooldown reduction', lo: 3, hi: 7, unit: '%' },
  move: { label: 'Move speed', lo: 2, hi: 6, unit: '%' },
  regen: { label: 'Health regen', lo: 0.4, hi: 1.0, unit: '/s' },
  dot: { label: 'Damage over time', lo: 6, hi: 12, unit: '%' },
  summon: { label: 'Summon damage', lo: 6, hi: 12, unit: '%' },
  credits: { label: 'Credits', lo: 5, hi: 12, unit: '%' },
  charge: { label: 'Max Charge', lo: 5, hi: 12, unit: '' },
  cgain: { label: 'Charge gain', lo: 6, hi: 14, unit: '%' },
  spend: { label: 'Spender damage', lo: 5, hi: 11, unit: '%' },
};
export const GEAR_AFFIX_IDS = Object.keys(GEAR_AFFIXES);
export const AFFIX_COUNT = [0, 1, 2, 3, 3];
// Aspects: one fixed rule on Rare or better gear, by slot.
export const ASPECTS = {
  twinned: { slot: 'weapon', name: 'Twinned', desc: 'A Spender cast at full Charge fires a second time at 40% power' },
  siphoning: { slot: 'weapon', name: 'Siphoning', desc: 'Kills grant 3 Charge',
    effects: [{ type: 'trigger', event: 'kill', action: 'charge', value: 3 }] },
  rending: { slot: 'weapon', name: 'Rending', desc: 'Each Consume deals 25 damage to enemies within 2.5 m' },
  bulwark: { slot: 'body', name: 'Bulwark', desc: 'Spending Charge grants barrier: 0.4% max health per point' },
  second_wind: { slot: 'body', name: 'Second Wind', desc: 'A clean dodge heals 4% max health',
    effects: [{ type: 'trigger', event: 'cleanDodge', action: 'healFraction', value: 0.04 }] },
  overclocked: { slot: 'head', name: 'Overclocked', desc: 'Overdrive lasts +2 s',
    effects: [{ type: 'stat', key: 'overdriveTime', add: 2 }] },
  primed: { slot: 'head', name: 'Primed', desc: 'Start the raid with full Charge and +20 max Charge',
    effects: [{ type: 'stat', key: 'capacity', add: 20 }, { type: 'trigger', event: 'start', action: 'fill' }] },
};
export const ASPECT_IDS = Object.keys(ASPECTS);
export const GEAR_NAMES = {
  weapon: ['Carbine', 'Edge', 'Launcher', 'Injector', 'Sidearm'],
  body: ['Carapace', 'Plate Vest', 'Weave Coat', 'Shell'],
  head: ['Sense Visor', 'Relay Hood', 'Coil Helm', 'Signal Mask'],
  hands: ['Grip Gloves', 'Braced Gauntlets', 'Trigger Wraps'],
  waist: ['Med Webbing', 'Utility Belt', 'Harness'],
  shoes: ['Field Boots', 'Runners', 'Tread Boots'],
};
// Field packs (docs 61, 64): one is active, carried rather than worn, with no rating or
// affixes. The issue pack is always available, so losing a found pack never blocks a search.
export const PACKS = {
  issue: { name: 'Issue Field Pack', w: 4, h: 4, kg: 1, value: 0 },
  patrol: { name: 'Patrol Pack', w: 4, h: 5, kg: 1.4, value: 80 },
  ranger: { name: 'Long-Range Pack', w: 5, h: 5, kg: 1.8, value: 160 },
};
export const GEAR_PREFIX = ['Standard', 'Tuned', 'Resonant', 'Anomalous', 'Lantern-Touched'];
export const SIGNAL_CLASS = ['Dull', 'Faint', 'Strong', 'Intense', 'Anomalous'];

// Rarity tables per drop source: [Common, Enhanced, Rare, Prototype, Legendary]
export const DROP_TABLES = {
  container: [70, 25, 5, 0, 0],
  mimic: [80, 18, 2, 0, 0],
  elite: [0, 50, 38, 11, 1],
  boss: [0, 25, 50, 25, 0],
};

// Every sealed find packs the same, so its footprint says nothing about the slot (doc 63).
export const SEALED = { w: 2, h: 2, kg: 3 };
export const SEALED_BID = 0.6;     // share of a grade's expected identified value (doc 64, start)
export const PRIME_CHANCE = 0.04, BOSS_PRIME_CHANCE = 0.08;

export const enhanceCost = (level) => Math.round(60 * Math.pow(1.6, level)); // cost to go from level to level+1
export const REROLL_CASH = 40;
export const REROLL_SAMPLES = 1;
export const PROCESS_SAMPLES = 1;

export function gearRating(item) {
  return item.ilvl * RARITY[item.rarity].q * (1 + 0.08 * (item.enh || 0));
}

// Sellable loot found in containers.
export const SELLABLES = [
  { name: 'Sealed Data Case', value: 100 },
  { name: 'Medical Crate', value: 60 },
  { name: 'Optics Bundle', value: 75 },
  { name: 'Power Cell', value: 45 },
  { name: 'Corporate Ledger', value: 130 },
  { name: 'Ration Pack', value: 25 },
  { name: 'Sensor Array', value: 160 },
  { name: 'Black-Market Chips', value: 210 },
];

// Neon palette shared by signage and lights (doc 11: magenta, amber, cyan against teal).
export const NEON = [
  [1.0, 0.15, 0.6], [0.1, 0.9, 1.0], [1.0, 0.65, 0.1], [0.55, 0.3, 1.0],
  [0.2, 1.0, 0.55], [1.0, 0.25, 0.2], [0.3, 0.5, 1.0], [1.0, 0.9, 0.5],
];
