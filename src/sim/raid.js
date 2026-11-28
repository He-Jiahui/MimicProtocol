// Raid simulation: fixed-step, renderer-free, seeded (doc 13, section 4).
// HUD, audio and VFX read state and drain `events`; they never write here.

import { Rng } from '../core/rng.js';
import { clamp, angleDiff, dist } from '../core/math.js';
import {
  ZONES, TIERS, BANDS, ENEMIES, AFFIXES, AFFIX_IDS, CLASSES, ITEMS, RARITY, MIMIC_SHARE, stackStat, stackChance,
  CLOCK_START, CLOCK_HOURS, RAID_SECONDS, SCAN_RANGE, SCAN_TIME, SCAN_COOLDOWN, PASSIVE_RANGE, EXTRACT_TIME, SUMMON_CAP,
  ENEMY_HP, ENEMY_DMG, ELITE_HP, ELITE_DMG, POCKETS, PACK_CHANCE, BROKER_SHARE, CREDIT_CASH, CARRY_FREE_KG, CHEST, LOW_TOP,
  LATENTS, DRONE_FIND,
} from './data.js';
import { gearStats, rollGear, rollRunItem, rollSellable, worth, publicView, issuePack, packItem, droneCase } from './loot.js';
import { footprint, weight, occupancy, mark, fitsAt, findSpot, planFit, loadKg, speedMul } from './pack.js';
import { castSkill, tickBarrage, witherCloudArea } from './skills.js';
import { SUMMON_SHOTS, CLASS_RESOURCE, DODGE_REFUND, VENOM_DPS } from './skill-data.js';
import { compileSkills } from './skill-build.js';
import { raidXp, NO_TRAINING } from './progress.js';
import { startBoss, updateBoss, bossDamaged, bossKilled, sacBurst, arenaClamp } from './boss.js';
import { updateHorde, hordeStrike, titanTick, updateRunItems, levelChoices } from './horde.js';
import { hunterBrain, assignRole, lurkerTick, flierTick, FLY, CHARGE_SPEED, CHARGE_TIME } from './behave.js';
import { initDoors, updateDoors, doorInteract, completeDoor, takeKey, breakWindow, PASSABLE } from './doors.js';
import { containerPrompt, kindContents } from './containers.js';
import { updateRoute } from './route.js';
import { JOB_REACH, initJobs, updateJobs, patientTick, jobInteract, completeJobInteract, exitInfo, flareInteract, fireFlare, radioIn, revealJobs } from './jobs.js';
import { STEP, FLOOR_UNIT, FALL_HURT, FALL_SERIOUS, FALL_SHARE } from './world.js';
import { controlHint, message } from '../i18n/index.js';

const FIELD = 160;                       // flow field window, cells (1 m)
export const DESCENT_REACH = 12;         // a clip-on descent line takes one drop of up to 12 m (doc 32)
// Melee hostiles that must reach the operator's level before they can strike.
const MELEE = new Set(['walker', 'mite', 'skitter', 'brute', 'titan', 'hollow']);
const SPAWN_COST = { walker: 6, spitter: 8, skitter: 7, brute: 20, hollow: 6 };
const ZONE_RATE = [0, 1.0, 1.3, 1.7, 2.2];
// Damage pipeline (doc 64, Package 1): gear may add at most +150% to a hit's pool; crits are x1.75.
export const GEAR_CAP = 1.5, CRIT_MUL = 1.75;
const ORDER_COL = [1, 0.72, 0.18], FRAGMENT_COL = [1, 0.35, 0.5];
const VENOM_DRAIN = 1.5; // health a second per stack of the Matron's venom on the operator (start)
// Lines of fire (doc 33, doc 64 Package 9), all start values: a round holding a lower aim height
// falls at most HOLD_DIVE per metre it flies; no line rises or falls more than MAX_SLOPE per
// metre; a beam is traced in STEP_FIRE steps; a touch snap looks SNAP_LANE either side of the
// bearing. CHEST, LOW_TOP and MELEE_UP live in data.js.
const HOLD_DIVE = 1.5, MAX_SLOPE = 3, STEP_FIRE = 0.25, SNAP_LANE = 0.9;
const NO_INPUT = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };

export class Raid {
  constructor({ world, seed = 1, classId = 'rifleman', tier = 1, gear = null, tree = {}, training = null, mode = 'raid', clockScale = 1, firstBossKill = true, signature = null, script = null, pack = null, drone = null, warning = 1 }) {
    this.world = world.overlay();   // own grid: doors open in this raid only
    // Warning length (doc 64, Package 3): Normal 1.0, Longer 1.35, Longest 1.8.
    this.warnScale = warning;
    this.mode = mode;
    this.tier = tier;
    this.T = TIERS[tier];
    this.seed = seed;
    const root = new Rng(seed).fork('raid');
    this.rSpawn = root.fork('spawn'); this.rLoot = root.fork('loot'); this.rAi = root.fork('ai'); this.rCombat = root.fork('combat');
    this.time = 0;            // simulated seconds
    this.raidTime = 0;        // seconds of raid clock (scaled)
    this.clockScale = clockScale;
    this.clock = CLOCK_START; this.nl = 0; this.band = 0;
    this.events = [];
    this.enemies = []; this.projectiles = []; this.areas = []; this.summons = []; this.pickups = []; this.timers = [];
    this.fragments = []; // Blade's plate fragments: combat remnants on the floor, never loot
    this.nextId = 1;
    this.gear = gear || gearStats(null);
    this.firstBossKill = firstBossKill;
    this.script = script;

    // Per-raid variation on the fixed district: Hosts and locks (doc 17, Q-24).
    const rVar = root.fork('variation');
    this.cont = world.containers.map((c) => ({
      opened: false, progress: 0, hostKnown: false,
      host: mode === 'raid' && rVar.chance(0.1 * ZONES[c.zone].host),
      locked: mode === 'raid' && rVar.chance(0.15),
    }));
    this.poi = world.pois.map((p) => ({ used: false, progress: 0, active: false, open: true, known: p.type !== 'extract' || p.idx === 0 }));
    initDoors(this);
    initJobs(this);

    // The class tree is a snapshot of the validated allocation taken at deployment: nothing in a raid
    // can spend or return a point (doc 64, Package 7).
    this.tree = Object.freeze({ ...tree });
    // Training's direct stats, converted once at deployment; recalc adds each to its pool once.
    this.training = Object.freeze({ ...NO_TRAINING, ...(training || {}) });
    this.triggerReady = new Map();
    this.player = {
      classId, x: world.insertion.x, z: world.insertion.z, face: -Math.PI / 2, r: 0.45,
      // barrier regrows to barrierMax (Hardlight); shield is granted barrier (fragment, Bulwark) on its own timer.
      hp: 1, maxHp: 1, barrier: 0, barrierMax: 0, barrierT: 0, shield: 0, shieldT: 0,
      vDrain: 0, vDrainT: 0, vSlowT: 0, vSusT: 0, // the Matron's venom: three statuses, never multiplied together
      cd: { m1: 0, m2: 0, s: 0, r: 0, scan: 0, med: 0 }, cdMax: { scan: SCAN_COOLDOWN },
      iframes: 0, hurtT: 0, dodgeT: 0, swingT: 0, slowT: 0, animT: 0, moving: false, dead: false, hidden: false, invuln: false,
      dash: null, channel: null, combo: 0, comboT: 0,
      level: 1, xp: 0, credits: 0, items: {}, itemCount: 0, heart: 0, medkits: 2, medT: 0,
      // Class resources (doc 64, Package 2): Rifleman cells, Blade momentum, Summoner hardware and radio.
      cells: 0, cellProg: 0, cellShots: 0, momentum: 0, momT: 0,
      carried: CLASS_RESOURCE.summoner.carried, recalls: [], radioT: 0, radioMax: 1,
      inv: [],
    };
    this.initPack(pack);
    this.drone = drone;       // insurance drone type assigned at the hub, or null (doc 62)
    this.taken = 0;           // health lost to hits: it wears the body piece (doc 63)
    this.kills = 0; this.elites = 0; this.civKills = 0; this.searched = 0; this.intel = 0;
    this.zmax = 0; this.samples = 0; this.cores = 0; this.bossKilled = false; this.bossCash = 0;
    this.zone = world.zoneAt(this.player.x, this.player.z);
    this.cachePrice = 25;
    this.contracts = mode === 'raid' ? [
      { id: 'elites', label: 'Kill 2 elites', need: 2, have: 0 },
      { id: 'intel', label: 'Hack 1 Intel Terminal', need: 1, have: 0 },
      { id: 'search', label: 'Search 8 containers', need: 8, have: 0 },
    ] : [];
    // Horde director state.
    this.pressT = 0; this.spawnAcc = 0; this.surgeT = 60; this.eliteT = 150; this.titanT = 300; this.aliveHostile = 0; this.aliveAmbient = 0;
    this.waveT = 8; this.waveN = 0; this.holding = false; this.pouncers = 0; this.enemyShots = 0; this.chargingMotes = 0;
    this.attackers = 0; this.divers = 0; this.pendingLevels = 0; this.autoPick = false; this.threat = { heat: 0, alive: 0, target: 0, surgeIn: 60, zone: 0 };
    this.budget = 12; this.dirT = 0; this.fieldT = 0; this.dotT = 0; this.links = 0; this.passive = 0;
    this.field = new Uint16Array(FIELD * FIELD);
    this.fieldQ = new Int32Array(FIELD * FIELD);
    this.fieldX0 = 0; this.fieldZ0 = 0;
    this.scanFx = null; this.boss = null; this.bossArena = null; this.choice = null; this.prompt = null; this.markers = null;
    this.interactKey = null; this.interactT = 0;
    this.groups = {};
    this.over = false; this.result = null;
    this.noLethal = mode === 'tutorial' || mode === 'hub';
    this.asp = new Set(this.gear.aspects || []);
    this.latent = new Set(this.gear.latents || []);
    this.signature = signature; this.signatureDropped = false; this.payoffs = {};
    this.powerMul = 1; this.copying = false; this.cleanT = 0; this.m2Down = false; this.itemT = {}; this.aimedBlow = false;
    this.recalc();
    this.player.hp = this.player.maxHp;
    for (const slot of ['m2', 's', 'r']) this.player.cdMax[slot] = this.skillBuild.slots[slot].params.cd;
    this.fireSkillEvent('start');
    this.computeField();
    if (mode === 'raid') {
      this.relay(controlHint('Relay: You are on the ground at the Shelter. Press C to scan. Mimics only turn when they sense you.', 'Relay: You are on the ground at the Shelter. Tap Scan. Mimics only turn when they sense you.'));
      this.banner('MERIDIAN SOUTH SECTOR', 'Dusk, 18:30. Curfew at 02:00.', ZONES[0].css);
    }
    if (script) script.start(this);
  }

  // ---- events ----
  emit(e) { this.events.push(e); }
  banner(title, sub = '', col = '#fff') { this.emit({ t: 'banner', title, sub, col }); }
  relay(text) { this.emit({ t: 'relay', text }); }
  toast(text, col = '#cfe', icon = '') { this.emit({ t: 'toast', text, col, icon }); }
  sfx(name, x, z) { this.emit({ t: 'sfx', name, x, z }); }
  after(delay, fn) { this.timers.push({ t: delay, fn }); }
  // A telegraph's length, resolved once when the enemy commits: wind-up, floor shape, off-screen
  // cue and hit all use it. Projectile flight, pools, recovery, dodge invulnerability and the
  // clock never go through here.
  warn(seconds) { return seconds * this.warnScale; }

  // ---- derived player stats ----
  recalc() {
    const p = this.player, g = this.gear, cls = CLASSES[p.classId], it = p.items, T = this.training;
    const n = (id) => it[id] || 0;
    const lvl = Math.min(p.level, 10) - 1; // the flat bonus stops at level 10 (doc 18, Q-23)
    // Pool lines as fractions, summed per hit in playerHit. Gear is kept apart for its cap;
    // item stacks resolve through stackStat before they enter.
    p.lvlDmg = 0.02 * lvl;
    p.gearDmg = { all: g.dmg / 100, skill: g.skill / 100, m2: (g.spend || 0) / 100, dot: g.dot / 100, summon: g.summon / 100 };
    p.itemDmg = { melee: stackStat(0.1, n('spike_gloves')), dot: stackStat(0.15, n('venom_sac')), summon: stackStat(0.1, n('overwatch')) };
    const oldMax = p.maxHp;
    // Conditioning's health is flat on the class base, before every percentage (doc 64, Package 7).
    p.maxHp = Math.round((cls.hp + T.hp) * (1 + g.hp / 100) * (1 + 0.03 * lvl) * (1 + stackStat(0.12, n('plating'))));
    if (oldMax > 1 && p.maxHp > oldMax) p.hp += p.maxHp - oldMax;
    p.hp = Math.min(p.hp, p.maxHp);
    this.skillBuild = compileSkills(p.classId, { gear: g, items: it, tree: this.tree, direct: T }); // Handling's M1 rate joins the rate sum there
    p.aspd = this.skillBuild.attackSpeed;
    p.searchRate = 1 + T.searchRate; // search times divide by this
    p.hackRate = 1 + T.terminalRate;  // and terminal hacks by this
    p.summonDur = 1 + stackStat(0.15, n('overwatch')) + T.summonDur;
    p.credMul = 1 + g.credits / 100 + stackStat(0.08, n('salvage_eye'));
    p.crit = Math.min(1, 0.05 + g.crit / 100);
    p.dr = Math.min(0.75, cls.dr + g.dr / 100);
    p.speed = cls.speed * (1 + g.move / 100);
    p.regen = g.regen;
    p.barrierMax = Math.round(p.maxHp * stackStat(0.1, n('hardlight')));
    p.flipMul = Math.pow(1.25, n('ghost_signal'));
    p.magnet = 4.5 * (1 + 0.4 * n('magnet'));
    // Class resource gain: more cell progress or momentum, faster radio recovery, longer Venom.
    p.cgain = 1 + (g.cgain || 0) / 100;
    p.venomDur = p.cgain + T.venomDur; // Systems lengthens Venom in the same pool
    p.pierce = n('piercer');
    // Conditioning's free carry; a pack already packed is weighed again against it.
    p.freeKg = CARRY_FREE_KG + T.freeKg + (this.asp && this.asp.has('loadbearer') ? 4 : 0);
    if (p.pockets) this.reweigh();
  }

  giveItem(id, silent = false) {
    const p = this.player;
    p.items[id] = (p.items[id] || 0) + 1;
    p.itemCount++;
    this.recalc();
    const d = ITEMS[id];
    if (!silent) this.emit({ t: 'item', id, name: d.name, desc: d.desc, col: RARITY[d.rarity].css, count: p.items[id] });
    this.sfx('item');
  }
  // Evaluate transient conditions against raid time; recompiling numbers must
  // not reset an internal cooldown or pay a start-of-raid benefit again.
  // `at` is the body the event happened to (a kill, a Consume), when there is one.
  fireSkillEvent(event, at = null) {
    const rules = this.skillBuild.triggers[event];
    if (!rules) return;
    const p = this.player;
    for (const rule of rules) {
      if (rule.icd) {
        if (this.time < (this.triggerReady.get(rule.id) ?? 0)) continue;
        this.triggerReady.set(rule.id, this.time + rule.icd);
      }
      switch (rule.action) {
        case 'fill': this.fillResource(); break;
        case 'resource': this.resourceTick(rule.value, at); break;
        case 'healFraction': this.heal(p.maxHp * rule.value); break;
        default: throw new Error(`Unknown skill trigger action: ${rule.action}`);
      }
    }
  }

  // ---- class resources (doc 64, Package 2) ----
  // Rifleman: landed M1 rounds load cells, which never decay.
  cellRounds(n) {
    const p = this.player, R = CLASS_RESOURCE.rifleman;
    if (p.classId !== 'rifleman' || p.cells >= R.cells) return;
    const need = this.skillBuild.slots.m1.params.roundsPerCell; // Quick Load (tree) lowers it
    p.cellProg += n * p.cgain;
    while (p.cellProg >= need && p.cells < R.cells) { p.cellProg -= need; p.cells++; this.emit({ t: 'cell', n: p.cells }); this.sfx('pickup'); }
    if (p.cells >= R.cells) p.cellProg = 0;
  }
  // Blade: aimed contact builds momentum; it ebbs once 2 s pass without one.
  addMomentum(n) {
    const p = this.player;
    if (p.classId !== 'blade') return;
    p.momentum = Math.min(CLASS_RESOURCE.blade.max, p.momentum + n * p.cgain);
    p.momT = this.time;
  }
  // Toxic: Venom rides on its host; class resource gain makes it last longer.
  addVenom(e, n, params) {
    e.st.venom = Math.min(params.venomStacks, e.st.venom + n);
    e.st.venomT = this.venomTime(params);
  }
  venomTime(params) { return params.venomTime * this.player.venomDur; }
  // Summoner: a ready radio rides on the next grenade as an Order, then recovers. Under Post (tree)
  // the Order is held until its target walks into a sentry's lane, where the shot answers it.
  radioReady() { return this.player.radioT <= 0; }
  giveOrder(e, params) {
    const p = this.player;
    e.st.orderT = this.skillBuild.rules.orders === 'post' ? Infinity : params.orderTime;
    p.radioMax = params.radioTime / p.cgain; p.radioT = p.radioMax;
    this.emit({ t: 'ring', x: e.x, z: e.z, r: 1.8, col: ORDER_COL, life: 0.4, k: 3 });
    this.sfx('warn', e.x, e.z);
  }
  // Who answers an Order. Base: a sentry covering it, else a drone. Post keeps Orders on the
  // emplacement (drones never take one); Escort sends them with the drones first (doc 58).
  answersOrder(s, e) {
    if (!(e.st.orderT > 0)) return false;
    const rule = this.skillBuild.rules.orders;
    if (s.kind === 'sentry') return rule !== 'escort' || !this.droneCovers(e);
    if (rule === 'post') return false;
    return rule === 'escort' || !this.sentryCovers(e);
  }
  droneCovers(e) {
    for (const s of this.summons) if (s.kind === 'drone' && dist(s.x, s.z, e.x, e.z) < s.shot.shotRange && this.world.hasLos(s.x, s.z, e.x, e.z)) return true;
    return false;
  }
  // Full resource, for Twinned. Venom has no meter: full means a host carrying every stack under the cloud's aim.
  resourceFull(input) {
    const p = this.player;
    switch (p.classId) {
      case 'rifleman': return p.cells >= CLASS_RESOURCE.rifleman.cells;
      case 'blade': return p.momentum >= CLASS_RESOURCE.blade.max;
      case 'summoner': return p.carried >= CLASS_RESOURCE.summoner.carried;
      default: {
        const m2 = this.skillBuild.slots.m2.params, dx = input.aimX - p.x, dz = input.aimZ - p.z, k = Math.max(1, Math.hypot(dx, dz) / m2.range);
        return !!this.nearestTarget(p.x + dx / k, p.z + dz / k, m2.radius, (e) => e.st.venom >= this.skillBuild.slots.m1.params.venomStacks);
      }
    }
  }
  // Primed. The Summoner already starts with both sentries; the Handler carries nothing to fill.
  fillResource() {
    const p = this.player;
    if (p.classId === 'rifleman') { p.cells = CLASS_RESOURCE.rifleman.cells; p.cellProg = 0; }
    else if (p.classId === 'blade') this.addMomentum(CLASS_RESOURCE.blade.max);
    else if (p.classId === 'summoner') p.radioT = 0;
  }
  // A small tick (Siphoning per kill, Return Circuit per Consume): cell progress, momentum,
  // radio recovery, or one Venom stack on the hostile nearest the event.
  resourceTick(n, at) {
    const p = this.player, R = CLASS_RESOURCE[p.classId];
    if (p.classId === 'rifleman') this.cellRounds(R.tickRounds * n);
    else if (p.classId === 'blade') this.addMomentum(R.tick * n);
    else if (p.classId === 'summoner') p.radioT = Math.max(0, p.radioT - R.tick * n);
    else {
      const from = at || p, host = this.nearestTarget(from.x, from.z, R.tickRange, (e) => e !== at);
      if (host) this.addVenom(host, n, this.skillBuild.slots.m1.params);
    }
  }
  // The class half of a clean dodge; the S refund is paid in damagePlayer. Returns what was
  // actually received, zero at capacity included, for the "Clean dodge" readout.
  dodgePayout() {
    const p = this.player, R = CLASS_RESOURCE[p.classId];
    if (p.classId === 'rifleman') {
      const before = p.cells * R.roundsPerCell + p.cellProg;
      this.cellRounds(R.dodgeRounds);
      return message('+{count} rounds', { count: Math.round(p.cells * R.roundsPerCell + p.cellProg - before) });
    }
    if (p.classId === 'blade') {
      const before = p.momentum;
      this.addMomentum(R.dodge);
      return message('+{count} momentum', { count: Math.round(p.momentum - before) });
    }
    if (p.classId === 'summoner') {
      const was = p.radioT > 0;
      p.radioT = 0;
      return was ? 'Radio ready' : 'Radio already ready';
    }
    const m1 = this.skillBuild.slots.m1.params;
    let n = 0;
    this.forRadius(p.x, p.z, R.dodgeRadius, (e) => { if (this.isTarget(e)) { this.addVenom(e, 1, m1); n++; } });
    return message('Venom on {count}', { count: n });
  }
  // Granted barrier (fragment, Bulwark): rises to `cap` at most and lasts `time`; it refreshes, never stacks past the cap.
  grantShield(amount, time, cap = amount) {
    const p = this.player;
    p.shield = Math.max(p.shield, Math.min(cap, p.shield + amount));
    p.shieldT = Math.max(p.shieldT, time);
  }

  // Blade's third cut knocks a plate fragment beyond a freshly opened body: one per hostile, three on the floor.
  // A tree variant may throw it from somewhere else (`from`, `reach`): behind the operator, or ahead of a Whirl.
  dropFragment(e, dx, dz, from = null, reach = null) {
    const m1 = this.skillBuild.slots.m1.params, l = Math.hypot(dx, dz) || 1;
    if (this.fragments.length >= m1.fragMax || this.fragments.some((f) => f.src === e.id)) return null;
    const o = from || e, d = reach ?? e.r + m1.fragDistance;
    let x = o.x + dx / l * d, z = o.z + dz / l * d;
    const t = this.world.raycast(o.x, o.z, x, z);
    if (t < 1) { const k = Math.max(0, t - 0.05); x = o.x + (x - o.x) * k; z = o.z + (z - o.z) * k; }
    const f = { id: this.nextId++, x, z, fy: this.world.floorAt(x, z), t: m1.fragLife, life: m1.fragLife, src: e.id, face: Math.atan2(dz, dx) };
    this.fragments.push(f);
    this.emit({ t: 'ring', x, z, r: 1.2, col: FRAGMENT_COL, life: 0.3, k: 3 });
    this.sfx('break', x, z);
    return f;
  }
  // How often each class's signature payoff has happened this raid (measurement and tests).
  payoff(kind) { this.payoffs[kind] = (this.payoffs[kind] || 0) + 1; }
  updateFragments(dt) {
    const p = this.player, list = this.fragments;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      if ((f.t -= dt) <= 0) { list.splice(i, 1); continue; }
      // Crossing it, on foot or with Lunge, turns the guard into a brief barrier.
      if (p.dead || dist(f.x, f.z, p.x, p.z) > p.r + 0.6 || !this.sameLevel(f, p)) continue;
      list.splice(i, 1);
      const m1 = this.skillBuild.slots.m1.params;
      this.grantShield(p.maxHp * m1.fragBarrier, m1.fragBarrierTime);
      this.payoff('fragment');
      this.emit({ t: 'ring', x: p.x, z: p.z, r: 1.4, col: [0.3, 0.8, 1], life: 0.3, k: 4 });
      this.sfx('pickup');
    }
  }

  // `except` is the Brand a hit is spending: it does not also count as a vulnerability.
  branded(e, except = null) {
    const s = e.st;
    return (s.supp > 0 && except !== 'supp') || (s.exposedT > 0 && except !== 'exposed') || (s.markT > 0 && except !== 'mark') || (s.venom > 0 && except !== 'venom');
  }
  // A skill removed a Brand: fire the Consume synergies.
  consume(e) {
    const p = this.player;
    this.fireSkillEvent('consume', e);
    this.emit({ t: 'ring', x: e.x, z: e.z, r: 1.6, col: CLASSES[p.classId].color, life: 0.25, k: 3 });
    if (this.asp.has('rending')) {
      this.emit({ t: 'ring', x: e.x, z: e.z, r: 2.5, col: [1, 0.5, 0.3], life: 0.3, k: 3 });
      this.forRadius(e.x, e.z, 2.5, (o) => { if (o !== e && this.isTarget(o)) this.playerHit(o, 25, 'skill', { noProc: true }); }, this.around(e));
    }
  }
  // Cast M2; none costs a resource. `cell`: a Rifleman pressing M2 while it cools spends a cell
  // and fires at once, and the cooldown keeps running. Twinned repeats a cast made at full
  // resource at 40% power; a copy never makes another copy.
  castM2(input, cell = false) {
    const p = this.player, full = this.asp.has('twinned') && this.resourceFull(input), cd = p.cd.m2, cdm = p.cdMax.m2;
    this.powerMul = 1;
    // Record the crit each body rolled so a copy of this cast reuses it (stage 3).
    this.castCrits = new Map();
    const cast = castSkill(this, 'm2', input), crits = this.castCrits;
    this.castCrits = null;
    if (cast === false) return false;
    if (cell) { p.cells--; p.cellShots++; p.cd.m2 = cd; p.cdMax.m2 = cdm; }
    // Bulwark: each M2 gives a barrier of 6% of maximum health, up to 30%, for 8 s (start).
    if (this.asp.has('bulwark')) this.grantShield(p.maxHp * 0.06, 8, p.maxHp * 0.3);
    if (full) this.after(0.3, () => {
      if (p.dead || this.over) return;
      const cd2 = p.cd.m2, cdm2 = p.cdMax.m2;
      this.powerMul = 0.4; this.copyCrits = crits; this.copying = true;
      castSkill(this, 'm2', this.lastInput || input);
      this.powerMul = 1; this.copyCrits = null; this.copying = false; p.cd.m2 = cd2; p.cdMax.m2 = cdm2;
      this.emit({ t: 'skill', slot: 'm2' });
    });
    return true;
  }

  // Loot quality Q (doc 18): zone loot weight x (1 + NL) x tier rare weight.
  quality(zone = this.zone) { return ZONES[zone].loot * (1 + this.nl) * this.T.rare; }

  addCredits(n) {
    const v = Math.max(1, Math.round(n * this.player.credMul));
    this.player.credits += v;
    return v;
  }
  xpNeed(level) { return Math.round(12 + 10 * level + 0.8 * level * level); }
  addXp(n) {
    const p = this.player;
    p.xp += n;
    while (p.level < 60 && p.xp >= this.xpNeed(p.level)) {
      p.xp -= this.xpNeed(p.level);
      p.level++;
      this.recalc();
      this.heal(p.maxHp * 0.12);
      this.sfx('level');
      this.emit({ t: 'levelup', x: p.x, z: p.z, level: p.level });
      // In a raid each level offers a choice of three run items.
      if (this.mode === 'raid') this.pendingLevels++;
      else this.toast(message('Raid level {level}', { level: p.level }), '#9fe', 'level');
    }
  }
  // Sealed pieces count for their public bid, never their hidden roll (doc 63).
  carryValue() { let v = 0; for (const i of this.player.inv) v += worth(i); return v; }
  // Pack a piece into the active grid; false when it does not fit (it then stays where it was).
  addInv(item, at = null) {
    const p = this.player, g = occupancy(p.pack, p.inv);
    if (!at || !fitsAt(p.pack, g, item, at.x, at.y, at.r)) at = findSpot(p.pack, g, item);
    if (!at) return false;
    item.at = { x: at.x, y: at.y, r: at.r };
    p.inv.push(item);
    this.reweigh();
    // Medkits announce themselves through stowMedkit.
    if (item.kind !== 'med') this.emit({ t: 'loot', item: publicView(item), col: item.kind === 'gear' ? RARITY[item.rarity].css : '#cfd8e0' });
    return true;
  }
  // A tick in a venom pool (doc 64, Package 3): three separate statuses, each with its own job
  // and none multiplying another. The drain stacks up to 5 and runs 4 s; the slow (to 70%) lasts
  // 2 s; the susceptibility (+25% from fresh hits) 3 s. All start values.
  envenom() {
    const p = this.player;
    p.vDrain = Math.min(5, p.vDrain + 1); p.vDrainT = 4;
    p.vSlowT = 2; p.vSusT = 3;
  }
  // Harm that goes straight to health: no barrier, no reduction, no clean dodge.
  drain(amount) {
    const p = this.player;
    if (p.dead || p.invuln || this.over || amount <= 0) return;
    if (this.noLethal) amount = Math.min(amount, Math.max(0, p.hp - 1));
    p.hp -= amount;
    if (p.hp <= 0) { p.hp = 0; this.finish('dead'); }
  }
  heal(n) {
    const p = this.player;
    if (p.dead) return;
    p.hp = Math.min(p.maxHp, p.hp + n);
  }

  // ---- queries ----
  isTarget(e) { return !e.dead && !e.untargetable && (e.state === 'hunt' || e.state === 'revealing' || e.state === 'static' || e.state === 'boss'); }
  isHostile(e) { return !e.dead && (e.state === 'hunt' || e.state === 'revealing' || e.state === 'boss'); }
  // With needLos, a body aloft is judged by a 3D line from height y (default eye height there).
  nearestTarget(x, z, range, pred = null, needLos = false, y = undefined) {
    let best = null, bd = range * range;
    for (const e of this.enemies) {
      if (!this.isTarget(e) || (pred && !pred(e))) continue;
      const d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
      if (d < bd && (!needLos || (this.aloft(e) ? this.seesBody(x, z, y ?? this.world.floorAt(x, z) + CHEST, e) : this.world.hasLos(x, z, e.x, e.z)))) { bd = d; best = e; }
    }
    return best;
  }
  // The height a summon's gun fires from: a sentry's head, or a drone in its orbit.
  summonGunY(s) { return (s.fy ?? this.world.floorAt(s.x, s.z)) + (s.kind === 'drone' ? 2.3 : 1.05); }
  // Everything alive within a radius, including disguised Mimics and civilians. With height
  // only bodies within 2.5 m of the floor at the centre: a blast does not reach a terrace above.
  // A body aloft is caught only where it comes down within `up` of that floor (a blade reaches
  // 2.2 m over the operator's floor). o.y puts the centre in the air: a grenade that met a flier.
  forRadius(x, z, r, fn, o = null) {
    const H = this.world.hasHeight, fy = o && o.y !== undefined ? o.y : H ? this.world.floorAt(x, z) : 0, up = (o && o.up) || 2.5;
    const vert = H || (o && o.y !== undefined);
    for (const e of this.enemies) {
      if (e.dead || e.untargetable) continue;
      if ((vert || e.ay !== undefined) && !this.inReachY(e, fy, up)) continue;
      const rr = r + e.r;
      if ((e.x - x) * (e.x - x) + (e.z - z) * (e.z - z) <= rr * rr) fn(e);
    }
  }
  // ---- aim height (doc 33, doc 64 Package 9) ----
  // A body may be off the ground: e.ay is the height of its base in metres (a flier). Its span
  // is what a round, a beam or a blade has to pass through. Bodies on the ground keep the
  // generous span rounds have always used, 0.6 m under their floor to 2.6 m over it.
  bodySpan(e) {
    const s = e.scale || 1;
    if (e.ay !== undefined) return [e.ay - 0.3, e.ay + (ENEMIES[e.kind] && ENEMIES[e.kind].tall || 1.4) * s];
    const f = this.bodyY(e);
    return [f - 0.6, f + 2.6 * s];
  }
  // Where a deliberate shot at this body is aimed: the chest, or the middle of a body aloft.
  aimHeightOf(e) { return e.ay !== undefined ? e.ay + 0.55 * (e.scale || 1) : this.bodyY(e) + CHEST; }
  // Off the ground by more than `up` metres over its own floor (out of reach of a blade at 2.2).
  aloft(e, up = 0.6) { return e.ay !== undefined && e.ay - 0.3 > this.bodyY(e) + up; }
  // Is a body within reach of floor fy: a ground body within 2.5 m of it (a terrace is not), one
  // aloft only where its span comes down to `up` over it and has not passed far under it.
  inReachY(e, fy, up = 2.5) {
    if (e.ay === undefined) return Math.abs(this.bodyY(e) - fy) <= 2.5;
    const s = this.bodySpan(e);
    return s[0] <= fy + up && s[1] >= fy - 2.5;
  }
  // A burst centred on a body happens where it is: in the air round one aloft.
  around(e) { return this.aloft(e) ? { y: e.ay } : null; }
  // A clear 3D line from a point at height y to the body's aim height.
  seesBody(x, z, y, e) { return this.world.hasLos(x, z, e.x, e.z, y, this.aimHeightOf(e)); }
  // The vertical path of a line of fire from (x, z) at height y0 (doc 33): k, the rise per metre
  // of a straight line, or hold, a lower height it settles onto. `at` is a body that automatic
  // fire chose; otherwise the operator's aim decides. In the shoulder view (aim.line) the camera
  // pitch drives it: the straight line through the point under the crosshair, on past it. In the
  // tactical view the aim takes the height of what is under the cursor; down onto lower ground it
  // holds that height, level or up it is the straight line. Nothing here turns the bearing.
  lineOfFire(x, z, y0, at = null) {
    let ax, az, ay, line = false;
    if (at) { ax = at.x; az = at.z; ay = this.aimHeightOf(at); line = true; }
    else {
      const inp = this.lastInput || NO_INPUT;
      ax = inp.aimX; az = inp.aimZ; line = !!inp.aimLine;
      if (Number.isFinite(inp.aimY)) ay = inp.aimY;
      else {
        // No height given (a script, a test): the body nearest the aim point, else the floor there.
        const tgt = this.nearestTarget(ax, az, 2.2, null) || this.enemies.find((e) => !e.dead && dist(e.x, e.z, ax, az) < 1.2);
        ay = tgt ? this.aimHeightOf(tgt) : this.world.floorAt(ax, az) + CHEST;
      }
    }
    const ad = Math.hypot(ax - x, az - z);
    if (!(ad > 1.5)) return { k: 0 };
    if (!line && ay < y0 - 0.05 && this.world.hasHeight) return { k: 0, hold: ay };
    return { k: clamp((ay - y0) / ad, -MAX_SLOPE, MAX_SLOPE) };
  }
  // The height after a step of ds to (nx, nz) along a line of fire: the straight line, or holding
  // a lower height (down toward it, never under chest height over the ground ahead, and never up
  // over ground that rises: that face stops it instead).
  // It starts down only over the lower ground itself: the step it leaves a terrace (and the
  // parapet on its edge) on still counts the terrace.
  stepFire(f, y, ds, nx, nz, x = nx, z = nz) {
    if (f.hold === undefined) return y + f.k * ds;
    const w = this.world, want = Math.max(f.hold, Math.max(w.floorAt(x, z), w.floorAt(nx, nz)) + CHEST);
    return want < y ? Math.max(want, y - HOLD_DIVE * ds) : y;
  }
  // A beam's line of fire marched to the first wall, floor or low obstacle in its way: its length
  // and the heights along it (every STEP_FIRE metres from the muzzle).
  traceFire(x, z, y0, dx, dz, range, at = null) {
    const f = this.lineOfFire(x, z, y0, at), w = this.world, ys = [y0];
    let y = y0, s = 0;
    while (s < range) {
      const ds = Math.min(STEP_FIRE, range - s), x0 = x + dx * s, z0 = z + dz * s, x1 = x0 + dx * ds, z1 = z0 + dz * ds, y1 = this.stepFire(f, y, ds, x1, z1, x0, z0);
      const t = w.raycast(x0, z0, x1, z1, y, y1, true, LOW_TOP);
      if (t < 1) { s += ds * t; ys.push(y + (y1 - y) * t); return { L: s, ys }; }
      s += ds; y = y1; ys.push(y);
    }
    return { L: s, ys };
  }
  // Height of a traced line of fire at distance s from its muzzle.
  fireY(tr, s) { const i = Math.max(0, s) / STEP_FIRE, k = Math.min(tr.ys.length - 2, Math.floor(i)); return k < 0 ? tr.ys[0] : tr.ys[k] + (tr.ys[k + 1] - tr.ys[k]) * Math.min(1, i - k); }
  // Touch aim (doc 64 Package 9): the height of the nearest valid target along the bearing the
  // stick set, within a narrow lane of it and in sight. The bearing is the player's.
  snapAlong(x, z, dx, dz, range = 32) {
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, y0 = this.bodyY(this.player) + CHEST;
    let best = null, bd = range;
    for (const e of this.enemies) {
      if (!this.isTarget(e)) continue;
      const along = (e.x - x) * ux + (e.z - z) * uz;
      if (along < 0.5 || along >= bd || Math.abs((e.x - x) * uz - (e.z - z) * ux) > e.r + SNAP_LANE) continue;
      if (this.seesBody(x, z, y0, e)) { bd = along; best = e; }
    }
    return best ? { e: best, along: bd } : null;
  }
  // ---- height (doc 64 Package 8) ----
  // The floor a body stands on, in metres; and whether two things are within reach of each
  // other's level (a hand, a blade, a pickup: 1.5 m, about three steps of a stair).
  bodyY(b) { return b.fy ?? this.world.floorAt(b.x, b.z); }
  sameLevel(a, b, reach = 1.5) { return !this.world.hasHeight || Math.abs(this.bodyY(a) - this.bodyY(b)) <= reach; }
  // Can a hostile here walk to the operator? The flow field knows, inside its window.
  reachesPlayer(x, z) {
    if (!this.world.hasHeight) return true;
    const fx = Math.floor(x) - this.fieldX0, fz = Math.floor(z) - this.fieldZ0;
    if (fx < 0 || fz < 0 || fx >= FIELD || fz >= FIELD) return true;
    return this.field[fz * FIELD + fx] !== 65535;
  }
  // A fall the operator committed to off a drop cell: 15% of maximum health up to 4 m, 40%
  // up to 8 m, lethal beyond (start). A clip-on descent line takes one drop of up to 12 m.
  fall(m) {
    const p = this.player;
    if (m <= STEP * FLOOR_UNIT || p.dead || this.over) return;
    this.noise(p.x, p.z, 9);
    this.sfx('slam', p.x, p.z);
    if ((p.descentLines || 0) > 0 && m <= DESCENT_REACH) {
      p.descentLines--;
      this.emit({ t: 'fall', m, line: true, x: p.x, z: p.z });
      this.toast(message('Descent line: a clean {m} m drop', { m: Math.round(m) }), '#9fe8ff', 'complete');
      return;
    }
    const share = m <= FALL_HURT ? FALL_SHARE[0] : m <= FALL_SERIOUS ? FALL_SHARE[1] : 1;
    this.emit({ t: 'fall', m, share, x: p.x, z: p.z });
    if (share >= 1 && !this.noLethal) {
      p.hp = 0;
      this.emit({ t: 'hurt', amount: p.maxHp, angle: 0, heavy: true });
      this.toast(message('A {m} m fall: nobody walks away from that', { m: Math.round(m) }), '#ff5a5a', 'warning');
      this.finish('dead');
      return;
    }
    let amount = p.maxHp * share;
    if (this.noLethal) amount = Math.min(amount, Math.max(0, p.hp - 1));
    p.hp -= amount;
    this.taken += amount;
    p.hurtT = 0.25;
    this.emit({ t: 'hurt', amount, angle: Math.PI / 2, heavy: true });
    this.emit({ t: 'shake', amount: share > 0.2 ? 0.6 : 0.35 });
    this.toast(message('Hard landing from {m} m: {pct}% health', { m: Math.round(m), pct: Math.round(share * 100) }), '#ffb86a', 'warning');
    if (p.hp <= 0) { p.hp = 0; this.finish('dead'); }
  }
  hostileCount() { let n = 0; for (const e of this.enemies) if (this.isHostile(e)) n++; return n; }

  // ---- damage ----
  // Player-sourced damage, stages 2 and 3 of the pipeline (doc 64, Package 1); damageEnemy is stage 4.
  // type: 'ballistic' | 'melee' | 'skill' | 'dot' | 'summon'. `base` already holds stage 1: the
  // action's number, the Brand term read at contact and a copied cast's share. Options: skill and
  // melee add that line to another type, m2 marks the M2 cast, spend names the Brand the hit spends,
  // bonus is a pool line the action itself pays (Execution's spent momentum).
  playerHit(e, base, type = 'ballistic', o = {}) {
    if (e.dead) return 0;
    const p = this.player, dot = type === 'dot';
    // A deliberate aimed hit: never a tick, a copy, a sentry, an arc or any other follow-up.
    const aimed = !!o.aimed && !dot && !this.copying && !o.noProc;
    // Raid items answer only such a hit on a revealed hostile (judged before this hit can reveal it).
    const procs = aimed && this.isTarget(e);
    // Hands Aspects (doc 63) are pool lines that a deliberate weapon hit earns: never M2, never a skill.
    const weapon = aimed && !o.m2 && type !== 'skill';
    let grip = 0;
    if (weapon) {
      if (this.asp.has('braced') && p.stillT >= 0.6) grip += 0.25;
      if (this.asp.has('longshot') && dist(p.x, p.z, e.x, e.z) >= 18) grip += 0.2;
    }
    let d = base * (this.damagePool(type, o) + grip);
    // Ticks never crit. A copied cast does not roll again: it reuses the original's roll on that body.
    let crit = false;
    if (!dot) {
      if (this.copyCrits && !o.noProc) crit = this.copyCrits.get(e.id) === true;
      else {
        crit = this.rCombat.chance(p.crit);
        if (this.castCrits && !o.noProc && !this.castCrits.has(e.id)) this.castCrits.set(e.id, crit);
      }
      if (crit) d *= CRIT_MUL;
    }
    // A kill by this hit counts as a deliberate kill for the on-kill items (see killEnemy).
    this.aimedBlow = procs;
    const dealt = this.damageEnemy(e, d, { crit, dot, nonLethal: o.nonLethal, spend: o.spend, fx: o.fx, fz: o.fz, aimed: !!o.aimed && !dot && !this.copying });
    this.aimedBlow = false;
    // Hollow Heart (doc 23): a deliberate weapon kill may burst the body. Its own kills never do.
    if (e.dead && weapon && procs && this.latent.has('hollow_heart') && this.rCombat.chance(LATENTS.hollow_heart.chance)) this.hollowBurst(e);
    if (dealt > 0 && type !== 'dot') {
      this.emit({ t: 'hitmark', kill: e.dead, crit });
      if (procs) this.itemsOnHit(e);
    }
    return dealt;
  }

  hollowBurst(e) {
    const L = LATENTS.hollow_heart;
    this.emit({ t: 'explode', x: e.x, z: e.z, r: L.radius, col: [1, 0.35, 0.5], shake: 0.2 });
    this.forRadius(e.x, e.z, L.radius, (o) => { if (o !== e && this.isTarget(o)) this.playerHit(o, L.damage, 'skill', { noProc: true }); }, this.around(e));
    this.noise(e.x, e.z, L.noise);   // the drawback: it is heard a long way off
  }
  // Raid items that answer a deliberate hit (doc 64, Package 4; doc 59). Each judges the aimed
  // attack, not each body or round: at most once per item in its own interval, so a burst landing
  // three rounds or a grenade catching a pack starts one sequence. Their own hits, ticks and
  // patches never start another. Every number is a start value.
  itemReady(id, interval) {
    if (this.time < (this.itemT[id] ?? -1)) return false;
    this.itemT[id] = this.time + interval;
    return true;
  }
  // A chain from `from` to the nearest other revealed hostile with a clear line; `hops` links.
  arc(from, range, damage, hops, col) {
    const done = new Set([from.id]);
    let at = from;
    for (let h = 0; h < hops; h++) {
      const next = this.nearestTarget(at.x, at.z, range, (t) => !done.has(t.id) && this.world.hasLos(at.x, at.z, t.x, t.z));
      if (!next) break;
      done.add(next.id);
      this.emit({ t: 'beam', x: at.x, z: at.z, x2: next.x, z2: next.z, col, life: 0.18, w: 0.14, k: 6 });
      this.playerHit(next, damage, 'skill', { noProc: true, fx: at.x, fz: at.z });
      at = next;
    }
    if (at !== from) this.sfx('sentry', from.x, from.z);
  }
  itemsOnHit(e) {
    const p = this.player, n = (id) => p.items[id] || 0;
    p.aimedT = this.time; // primes the tools that work for a while after a deliberate hit
    // Static Coil: 8% (more with stacks) to arc to one other revealed hostile within 9 m, for 20.
    if (n('static_coil') && this.itemReady('static_coil', 0.25) && this.rCombat.chance(stackChance(0.08, n('static_coil')))) this.arc(e, 9, 20, 1, [0.6, 0.9, 1]);
    // Arc Lead: every attack arcs on within 6 m for 12; each find adds a hop, up to three.
    if (n('arc_lead') && this.itemReady('arc_lead', 0.6)) this.arc(e, 6, 12, Math.min(3, n('arc_lead')), [0.75, 0.8, 1]);
    // Anticoagulant: the wound bleeds 8 a second for 4 s; more finds lengthen it with less each time.
    // Striking again renews the one wound; it never opens a second or repays elapsed ticks.
    if (n('anticoagulant') && this.itemReady('anticoagulant', 0.25)) {
      e.st.bleedT = Math.max(e.st.bleedT, 4 * (1 + stackStat(0.5, n('anticoagulant') - 1)));
      e.st.bleedDps = 8;
    }
    // Thermite Tips: a burning patch under the target, every 1.5 s at most.
    if (n('thermite') && this.itemReady('thermite', 1.5)) {
      this.addArea({
        kind: 'fire', x: e.x, z: e.z, r: 1.6, life: 2.5 * (1 + stackStat(0.3, n('thermite') - 1)), col: [1, 0.55, 0.15],
        onTick: (o) => this.playerHit(o, 12 * 0.25, 'dot'),
      });
    }
  }

  // 1 + the pool sum for a hit of this kind. Like lines enter once; gear's part is capped.
  damagePool(type, o = {}) {
    const p = this.player, G = p.gearDmg, I = p.itemDmg, dot = type === 'dot', summon = type === 'summon';
    const skill = type === 'skill' || o.skill, melee = type === 'melee' || o.melee;
    const gear = G.all + (skill ? G.skill : 0) + (o.m2 ? G.m2 : 0) + (dot ? G.dot : 0) + (summon ? G.summon : 0);
    return 1 + Math.min(GEAR_CAP, gear) + p.lvlDmg + p.heart + (melee ? I.melee : 0) + (dot ? I.dot : 0) + (summon ? I.summon : 0) + (o.bonus || 0);
  }
  // What a Wither Cloud would rupture from this host now, before crit and the recipient (HUD preview).
  rupturePreview(e) {
    const m2 = this.skillBuild.slots.m2.params;
    return m2.ruptureMul * e.st.venom * VENOM_DPS * e.st.venomT * this.damagePool('skill', { m2: true });
  }

  // Civilians and disguised Mimics (doc 64 section 1, doc 37). Anything that looks human has
  // 40 health and answers only a deliberate aimed hit; splash, chains, pools, sentries and item
  // effects pass it by. A lesser wound sends it fleeing for 6 s, a disguise still a disguise.
  // The hit that finishes a disguise exposes the living Mimic: no kill and no drop for the shape.
  humanLooking(e) { return e.state === 'civ' || e.state === 'flee' || e.state === 'disguised' || e.state === 'suspicious' || e.state === 'patient'; }
  hitHuman(e, amount, o) {
    if (!o.aimed) return 0;
    e.hitFlash = 0.15;
    if (e.isMimic) {
      e.cover -= amount;
      if (e.cover <= 0) { this.reveal(e, true); return amount; }
      e.state = 'flee'; e.fleeT = 6;
      return amount;
    }
    e.hp -= amount;
    if (!e.patient) { e.state = 'flee'; e.fleeT = 6; }   // a patient stays with the escort
    if (e.hp <= 0) {
      e.dead = true;
      this.civKills++;
      this.emit({ t: 'kill', x: e.x, z: e.z, col: [0.7, 0.1, 0.1], body: { id: e.id, kind: 'civ', face: e.face, scale: 1, look: e.look, animT: e.animT, r: e.r } });
      this.toast('Civilian killed: Command penalty -50 Cash', '#ff6a6a', 'penalty');
    }
    return amount;
  }

  damageEnemy(e, amount, o = {}) {
    if (e.dead || e.invuln || amount <= 0) return 0;
    if (this.humanLooking(e)) return this.hitHuman(e, amount, o);
    if (e.kind === 'matron') amount = bossDamaged(this, e, amount);
    if (amount <= 0) return 0;
    // Recipient: stagger is its own factor; "takes more" lines (Catalyst, the Matron's torn
    // carapace) share one vulnerability sum. A Brand being spent is not also a vulnerability.
    const bonus = this.skillBuild.stats.brandBonus;
    amount *= (e.stagger || 1) * (1 + (e.vuln || 0) + (bonus && this.branded(e, o.spend) ? bonus : 0));
    // Mitigation: a facing plate takes most of a hit (the remainder is never zero).
    const guard = o.dot ? 0 : this.frontGuard(e, amount, o);
    amount *= 1 - guard;
    // Armored: the plate takes half of a hit, never more than it has left; it regrows after 8 s.
    if (e.plate > 0) {
      const ab = Math.min(e.plate, amount * 0.5);
      e.plate -= ab; amount -= ab;
      if (e.plate <= 0) { e.plate = 0; e.plateT = 8; this.emit({ t: 'ring', x: e.x, z: e.z, r: 2.5, col: AFFIXES.armored.color, k: 3 }); this.sfx('break', e.x, e.z); }
    }
    if (o.nonLethal) amount = Math.min(amount, Math.max(0, e.hp - 1));
    if (amount <= 0) return 0;
    e.hp -= amount;
    e.hitFlash = 0.12;
    this.emit({ t: 'dmg', x: e.x, z: e.z, h: e.kind === 'matron' ? 4.5 : e.ay !== undefined ? e.ay - this.world.floorAt(e.x, e.z) + 1.2 * (e.scale || 1) : 2 * (e.scale || 1), amount, crit: !!o.crit, dot: !!o.dot, guard: guard > 0 });
    if (!o.dot && e.speed > 0) {
      // Impact: light bodies are shoved back and lose their wind-up; heavy ones barely move.
      const pl = this.player, mass = e.kind === 'brute' ? 6 : e.kind === 'titan' || e.kind === 'matron' ? 30 : e.kind === 'lobber' ? 3 : e.kind === 'mite' ? 0.6 : e.elite ? 2.2 : e.flier ? 1.6 : 1;
      const kx = e.x - (o.fx ?? pl.x), kz = e.z - (o.fz ?? pl.z), kl = Math.hypot(kx, kz) || 1;
      const push = Math.min(9, 2 + (amount / e.maxHp) * 16) / mass * (o.crit ? 1.4 : 1);
      e.kx = (e.kx || 0) + kx / kl * push; e.kz = (e.kz || 0) + kz / kl * push;
      if (mass <= 1 && e.state === 'hunt' && !e.leap && amount > e.maxHp * 0.18) { e.stunT = 0.22; if (e.windupT > 0 && e.kind !== 'hollow') { e.windupT = 0; e.atkCd = Math.max(e.atkCd, 0.6); this.cancelTele(e); } }
    }
    if (!o.dot) {
      this.emit({ t: 'hit', x: e.x, z: e.z, col: [1, 0.3, 0.6], big: !!o.crit });
      // Phasing: blink after three hits and leave a decoy.
      if (e.elite && e.elite.includes('phasing') && ++e.phaseHits >= 3 && e.hp > 0) this.phaseBlink(e);
    }
    if (e.hp <= 0) this.killEnemy(e);
    return amount;
  }

  // The Brute's frontal plate and the Matron's shell (doc 64, Package 3): 70% less from hits
  // inside 60 degrees of the facing, unless one hit passes the heavy threshold (Brute 12% of
  // maximum health, Matron 3%, both start values) or the body is recovering or staggered; flanks
  // take full damage. It rings; it never reads as immunity. Returns the share of the hit it takes.
  frontGuard(e, amount, o) {
    const heavy = e.kind === 'brute' ? 0.12 : e.kind === 'matron' ? 0.03 : 0;
    if (!heavy || amount > e.maxHp * heavy) return 0;
    if (e.kind === 'brute' && (e.state !== 'hunt' || e.mode === 'recover')) return 0;
    if (e.kind === 'matron' && e.staggerT > 0) return 0;
    const sx = o.fx ?? this.player.x, sz = o.fz ?? this.player.z;
    if (Math.abs(angleDiff(e.face, Math.atan2(sz - e.z, sx - e.x))) > Math.PI / 3) return 0;
    if (this.time - (e.guardT ?? -1) > 0.12) {
      e.guardT = this.time;
      this.emit({ t: 'ring', x: e.x + Math.cos(e.face) * e.r, z: e.z + Math.sin(e.face) * e.r, r: 1.3, col: [0.75, 0.82, 0.95], life: 0.2, k: 3 });
      this.sfx('clank', e.x, e.z);
    }
    return 0.7;
  }

  // Remove the warning of an attack that was interrupted.
  cancelTele(e) { for (const a of this.areas) if (a.kind === 'tele' && a.src === e && !a.end) a.t = a.life; }

  phaseBlink(e) {
    e.phaseHits = 0;
    const spot = this.world.randomFree(this.rAi, e.x, e.z, 5, 8, e.r);
    if (!spot) return;
    // A blink never climbs: it may land level or lower, as a hostile may only drop.
    if (this.world.hasHeight && !e.flier && this.world.floorAt(spot.x, spot.z) > this.bodyY(e) + STEP * FLOOR_UNIT) return;
    this.emit({ t: 'blink', x: e.x, z: e.z });
    const decoy = this.spawnEnemy(e.kind, e.x, e.z, { flat: true });
    decoy.hp = decoy.maxHp = 1; decoy.dmg = 0; decoy.decoyT = 4; decoy.xp = 0; decoy.credits = 0; decoy.noDrop = true; decoy.face = e.face;
    if (e.flier) { decoy.ay = e.ay; decoy.mode = e.mode === 'grounded' ? 'grounded' : 'circle'; decoy.modeT = 4; }
    e.x = spot.x; e.z = spot.z;
    if (this.world.hasHeight) this.world.place(e);
    if (e.flier && e.ay < this.bodyY(e)) e.ay = this.bodyY(e);
    this.emit({ t: 'blink', x: e.x, z: e.z });
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    // On-kill items answer only a kill by a deliberate aimed hit (doc 59): never a tick, sentry or copy.
    const aimedKill = this.aimedBlow;
    const p = this.player, big = !!e.elite || e.kind === 'brute' || e.kind === 'matron' || e.kind === 'titan';
    this.emit({ t: 'kill', x: e.x, z: e.z, y: e.ay, big, elite: !!e.elite || e.kind === 'matron', col: e.kind === 'spitter' ? [0.4, 1, 0.2] : e.kind === 'hollow' ? [1, 0.5, 0.1] : e.flier ? [0.75, 0.25, 1] : [1, 0.15, 0.55], body: { id: e.id, kind: e.kind, face: e.face, scale: e.scale, look: e.look, animT: e.animT, r: e.r, ay: e.ay, mode: e.mode } });
    this.sfx(big ? 'killbig' : 'kill', e.x, e.z);
    if (e.group && this.groups[e.group]) this.groups[e.group].alive--;
    if (e.noDrop) return;
    this.kills++;
    // Kills drop XP shards to collect (in a raid); elsewhere XP is granted at once.
    if (e.xp) { if (this.mode === 'raid') this.dropXp(e.x, e.z, e.xp); else this.addXp(e.xp); }
    const frag = aimedKill ? p.items.frag_rounds || 0 : 0;
    if (frag && this.rCombat.chance(stackChance(0.2, frag))) {
      this.emit({ t: 'explode', x: e.x, z: e.z, r: 3, col: [1, 0.7, 0.3], shake: 0.05 });
      this.forRadius(e.x, e.z, 3, (o) => { if (o !== e && this.isTarget(o)) this.playerHit(o, 40, 'skill', { noProc: true }); }, this.around(e));
    }
    if (e.credits) { const c = this.addCredits(e.credits); this.emit({ t: 'credits', x: e.x, z: e.z, amount: c }); }
    const zone = this.world.zoneAt(e.x, e.z);
    if (e.elite) {
      this.elites++;
      this.progress('elites');
      const affixes = e.elite.map((a) => message(AFFIXES[a].name));
      this.toast(message('Elite down: {affixes} {enemy}', { affixes, enemy: message(ENEMIES[e.kind].name) }), '#ffd76a', 'elite');
      // A hunted alpha or an unmasked lurker always pays: an Enhanced-or-better item and gear.
      const sure = e.wanted || e.lurker;
      if (this.rLoot.chance(0.35) || sure) this.dropPickup('item', e.x, e.z, { id: rollRunItem(this.rLoot, this.quality(zone), sure ? 1 : 0) });
      if (this.rLoot.chance(0.6) || sure) this.dropPickup('gear', e.x + 0.8, e.z, { item: rollGear(this.rLoot, { tier: this.tier, zone, nl: this.nl, source: 'elite' }) });
      if (e.radio) { this.stow({ uid: `radio${e.id}`, kind: 'loot', name: 'Dispatch Radio', value: Math.round(140 * (1 + 0.1 * zone)) }, e.x, e.z); this.toast('Dispatch Radio recovered', '#ffd76a', 'loot'); }
      if (this.rLoot.chance(0.5)) this.dropPickup('sample', e.x - 0.8, e.z);
      // Blazing: fire burst on death, telegraphed.
      if (e.elite.includes('blazing')) this.enemyBlast(e.x, e.z, 4.2, this.warn(0.7), e.dmg * 1.2, AFFIXES.blazing.color);
    } else if (e.kind === 'titan') {
      this.toast('Titan down', '#ffd76a', 'elite');
      this.dropPickup('item', e.x, e.z, { id: rollRunItem(this.rLoot, this.quality(zone), 3) });
      this.dropPickup('gear', e.x + 1, e.z, { item: rollGear(this.rLoot, { tier: this.tier, zone, nl: this.nl, source: 'elite' }) });
      this.dropPickup('med', e.x - 1, e.z);
    } else if (!ENEMIES[e.kind].structure && e.kind !== 'matron') {
      // A Shrike is harder to bring down than a Husk and pays a little better (start).
      const r = this.rLoot.float() * (e.kind === 'mite' ? 3 : e.flier ? 0.75 : 1);
      if (r < 0.05) this.dropPickup('gear', e.x, e.z, { item: rollGear(this.rLoot, { tier: this.tier, zone, nl: this.nl, source: 'mimic' }) });
      else if (r < 0.085) this.dropPickup('med', e.x, e.z);
      else if (r < 0.115) this.dropPickup('sample', e.x, e.z);
    }
    // Plague: infected deaths release a small cloud.
    if (e.st.plagueT > 0) {
      const params = e.st.plagueParams;
      witherCloudArea(this, e.x, e.z, params.cloudRadius, params.cloudTime, params.cloudDps, params);
    }
    // On-kill items.
    const hc = aimedKill ? p.items.hive_core || 0 : 0;
    if (hc && this.rCombat.chance(stackChance(0.06, hc))) this.addSummon('drone', p.x, p.z, 10);
    const mh = aimedKill ? p.items.mimic_heart || 0 : 0;
    if (mh) {
      this.heal(p.maxHp * 0.01 * mh);
      if (p.heart < 0.1) { p.heart = Math.min(0.1, p.heart + 0.005 * mh); this.recalc(); }
    }
    this.fireSkillEvent('kill', e);
    if (e.kind === 'matron') bossKilled(this, e);
    if (e.kind === 'sac' && this.boss) sacBurst(this, e);
  }

  damagePlayer(amount, sx, sz, o = {}) {
    const p = this.player;
    if (p.dead || p.invuln || this.over) return false;
    if (p.iframes > 0 && !o.unavoidable) {
      // A clean dodge: the roll took a telegraphed strike or a projectile. It gives back 40% of
      // the S cooldown still running plus the class payout; pools and fire trails never pay.
      if (!o.area && this.time - this.cleanT > 0.5) {
        this.cleanT = this.time;
        p.cd.s *= 1 - DODGE_REFUND;
        const gain = this.dodgePayout();
        this.fireSkillEvent('cleanDodge');
        this.emit({ t: 'dodged', x: p.x, z: p.z, gain });
        this.sfx('clean');
      }
      return false;
    }
    // Venom susceptibility: a fresh hit (not a pool or the drain) lands 25% harder (start).
    if (p.vSusT > 0 && !o.area) amount *= 1.25;
    amount *= 1 - p.dr;
    if (p.medT > 0 && this.asp.has('steadfast')) amount *= 0.7;   // Field Dressing: covered while treating a wound
    p.barrierT = 8;
    // Granted barrier soaks first, then Hardlight.
    if (p.shield > 0) { const ab = Math.min(p.shield, amount); p.shield -= ab; amount -= ab; }
    if (p.barrier > 0) { const ab = Math.min(p.barrier, amount); p.barrier -= ab; amount -= ab; }
    if (this.noLethal) amount = Math.min(amount, Math.max(0, p.hp - 1));
    p.hp -= amount;
    this.taken += amount;
    p.hurtT = 0.25;
    this.emit({ t: 'hurt', amount, angle: Math.atan2(sz - p.z, sx - p.x), heavy: amount >= p.maxHp * 0.15 });
    this.sfx('hurt');
    if (p.hp <= 0) { p.hp = 0; this.finish('dead'); }
    return true;
  }

  // Telegraphed enemy area attack: a warning ring, then damage if the player is inside.
  enemyBlast(x, z, r, delay, dmg, col = [1, 0.15, 0.1], o = {}) {
    const a = this.addArea({ kind: 'tele', x, z, r, life: delay, col, half: o.half || 0, angle: o.angle || 0 });
    a.end = () => {
      if (o.cancel && o.cancel()) return;
      const p = this.player;
      this.emit({ t: 'explode', x, z, r, col, shake: o.shake ?? 0.2 });
      this.sfx('blast', x, z);
      let inside = dist(p.x, p.z, x, z) <= r + p.r * 0.5;
      if (inside && o.half) inside = Math.abs(angleDiff(o.angle, Math.atan2(p.z - z, p.x - x))) <= o.half;
      // A blast on one level does not reach a terrace above it or a quay below.
      if (inside && this.world.hasHeight) inside = Math.abs(this.world.floorAt(x, z) - this.bodyY(p)) <= 2;
      if (inside) { const hit = this.damagePlayer(dmg, x, z); if (hit && o.onHit) o.onHit(); }
      if (o.pool) this.addArea({ kind: 'pool', x, z, r: r * 0.8, life: o.pool, col: [0.5, 1, 0.2], owner: 'enemy', dps: dmg * 0.25, venom: !!o.venom });
      if (o.after) o.after();
    };
    return a;
  }

  // ---- spawning ----
  // Health and damage multipliers for a body at (x, z) at this hour.
  scaleAt(kind, x, z, o = {}) {
    const base = ENEMIES[kind], zone = ZONES[this.world.zoneAt(x, z)];
    let hpMul = 1, dmgMul = 1;
    if (base.boss) { hpMul = this.T.hp * (1 + 0.3 * this.nl); dmgMul = this.T.dmg * (1 + 0.2 * this.nl); }
    else if (!base.structure && !o.flat) {
      // Total health multiplier = zone x night x tier, capped at 8 (doc 17).
      hpMul = Math.min(8, zone.hp * (1 + 0.6 * this.nl) * this.T.hp) * ENEMY_HP;
      dmgMul = zone.dmg * (1 + 0.4 * this.nl) * this.T.dmg * ENEMY_DMG;
      // Sustained pressure: the horde hardens the longer the operator stays out.
      if (this.mode === 'raid' && !o.noHeat) { const heat = this.threat.heat; hpMul *= 1 + 0.15 * heat; dmgMul *= 1 + 0.05 * heat; }
    }
    return { hpMul, dmgMul };
  }
  spawnEnemy(kind, x, z, o = {}) {
    const base = ENEMIES[kind], { hpMul, dmgMul } = this.scaleAt(kind, x, z, o);
    const e = {
      id: this.nextId++, kind, x, z, r: base.r, face: this.rAi.range(-3.14, 3.14),
      hp: base.hp * hpMul, maxHp: base.hp * hpMul, dmg: base.dmg * dmgMul, speed: base.speed,
      state: o.state || (base.structure ? 'static' : 'hunt'), isMimic: o.isMimic ?? true,
      aware: 0, linkT: 0, flip: this.rAi.range(2, 5), outlineT: 0, humanT: 0, shimmer: 0, revealT: 0, noiseT: 0,
      animT: this.rAi.range(0, 6), moving: false, look: this.rAi.int(64), scale: 1,
      atkCd: this.rAi.range(0.6, 1.6), windupT: 0, windupMax: 0, hitFlash: 0, losT: this.rAi.range(0, 0.2), los: false,
      elite: null, plate: 0, plateT: 0, phaseHits: 0, affT: 0, hiveKids: 0, trailT: 0, cover: 40, // a disguise's apparent body
      st: { supp: 0, suppT: 0, exposedT: 0, markT: 0, orderT: 0, venom: 0, venomT: 0, slowT: 0, plagueT: 0, plagueDps: 0, bleedT: 0, bleedDps: 0 },
      node: null, tx: x, tz: z, waitT: 0, fleeT: 0, strafe: this.rAi.chance(0.5) ? 1 : -1, leap: null,
      xp: base.xp, credits: base.credits, group: o.group || null, dead: false, age: 0, farT: 0,
    };
    if (this.world.hasHeight) this.world.place(e);
    assignRole(this, e);
    if (base.flier) this.launch(e, o);
    if (o.elite) this.makeElite(e, o.elite);
    if (e.group && this.groups[e.group]) this.groups[e.group].alive++;
    this.enemies.push(e);
    return e;
  }

  // A Shrike starts on a roost (o.perch), or rising out of the street where it was called up, or
  // already on the wing. It is never a disguise.
  launch(e, o) {
    e.flier = true; e.isMimic = true; e.orbit = this.rAi.chance(0.5) ? 1 : -1; e.vuln = 0;
    if (o.perch) { e.x = o.perch.x; e.z = o.perch.z; this.world.place(e); e.ay = o.perch.y; e.mode = 'perch'; e.perch = o.perch; e.state = 'hunt'; return; }
    if (e.state !== 'hunt') { e.state = 'hunt'; e.ay = this.bodyY(e); e.mode = 'takeoff'; return; }
    e.ay = this.bodyY(e) + FLY.alt + FLY.altSpan * 0.5; e.mode = 'circle';
  }
  // Air movement for a Shrike aloft: walls and closed doors stand as high as it flies, nothing
  // lower stops it, the step rule does not apply, and it keeps out of the Shelter's field.
  moveFlier(e, dx, dz, speed, dt) {
    const w = this.world, x0 = e.x, z0 = e.z, r = e.r * 0.8;
    e.x += dx * speed * dt; e.z += dz * speed * dt;
    for (let iter = 0; iter < 2; iter++) {
      for (let zi = Math.floor(e.z - r); zi <= Math.floor(e.z + r); zi++) {
        for (let xi = Math.floor(e.x - r); xi <= Math.floor(e.x + r); xi++) {
          if (!(w.cell(xi, zi) & 1)) continue;
          const nx = clamp(e.x, xi, xi + 1), nz = clamp(e.z, zi, zi + 1), ox = e.x - nx, oz = e.z - nz, d2 = ox * ox + oz * oz;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2) || 1e-4;
          e.x = nx + ox / d * r; e.z = nz + oz / d * r;
        }
      }
    }
    // Ground that stands as high as it flies is a wall to it too; the Shelter's field is out of bounds.
    if ((this.mode === 'raid' && w.zoneAt(e.x, e.z) === 0) || w.floorAt(e.x, e.z) > e.ay - 0.8) { e.x = x0; e.z = z0; }
    const moved = Math.hypot(e.x - x0, e.z - z0);
    e.blocked = moved < speed * dt * 0.35 ? (e.blocked || 0) + dt : 0;
    w.place(e);
    if (e.ay < e.fy) e.ay = e.fy;
    e.moving = true;
    e.animT += dt * speed * 2.2;
  }
  // The first Shrike that takes wing near the operator gets one line on the relay.
  shrikeSeen() {
    if (this.shrikeTold || this.mode !== 'raid') return;
    this.shrikeTold = true;
    this.relay('Relay: Shrikes on the wing. Watch the ground: one lands where its shadow grows.');
  }
  // Roosts (doc 33): from the Hot zone on, after three minutes under pressure, the director seats
  // a Shrike or two on roosts 24 to 50 m out (start values).
  roost() {
    const p = this.player, w = this.world, n = w.n;
    let alive = 0;
    for (const e of this.enemies) if (!e.dead && e.flier) alive++;
    if (alive >= 3 || !w.perches || !w.perches.length) return 0;
    const bx = clamp(Math.floor(p.x / 100), 0, n - 1), bz = clamp(Math.floor(p.z / 100), 0, n - 1), cands = [];
    for (let z = Math.max(0, bz - 1); z <= Math.min(n - 1, bz + 1); z++) {
      for (let x = Math.max(0, bx - 1); x <= Math.min(n - 1, bx + 1); x++) {
        for (const k of w.blocks[z * n + x].perches) {
          const d = dist(k.x, k.z, p.x, p.z);
          if (d >= 24 && d <= 50 && w.zoneAt(k.x, k.z) >= 3 && !this.enemies.some((e) => !e.dead && e.perch === k)) cands.push(k);
        }
      }
    }
    let made = 0;
    const want = Math.min(cands.length, 3 - alive, this.rSpawn.chance(0.5) ? 2 : 1);
    for (let i = 0; i < want; i++) {
      const k = cands.splice(this.rSpawn.int(cands.length), 1)[0];
      const elite = this.rSpawn.chance(this.eliteShare(w.zoneAt(k.x, k.z)) * 0.5) ? this.rollAffixes() : null;
      this.spawnEnemy('shrike', k.x, k.z, { perch: k, elite });
      made++;
    }
    return made;
  }

  rollAffixes(two = false) {
    const ids = this.rSpawn.shuffle(AFFIX_IDS.slice());
    // One affix until NL 0.5, then up to two (doc 18, section 4).
    const n = two || (this.nl >= 0.5 && this.rSpawn.chance(0.5)) ? 2 : 1;
    return ids.slice(0, n);
  }
  makeElite(e, affixes) {
    e.elite = affixes;
    e.maxHp *= ELITE_HP; e.hp = e.maxHp; e.dmg *= ELITE_DMG; e.scale = 1.25; e.r *= 1.2; e.xp *= 4; e.credits *= 4;
    if (affixes.includes('armored')) e.plate = e.maxHp * 0.2;
    e.affT = this.rAi.range(2, 5);
  }
  eliteShare(zone) { return ZONES[zone].elite + 0.12 * this.nl + this.T.elite; }

  spawnPack(cx, cz, kinds, o = {}) {
    const out = [];
    for (const k of kinds) {
      const spot = this.world.randomFree(this.rSpawn, cx, cz, 0, o.spread ?? 5, 0.7) || { x: cx, z: cz };
      const elite = o.elite && out.length === 0 ? o.elite : (!o.noElite && ['walker', 'spitter', 'skitter', 'brute', 'shrike'].includes(k) && this.rSpawn.chance(this.eliteShare(this.world.zoneAt(cx, cz))) ? this.rollAffixes() : null);
      const e = this.spawnEnemy(k, spot.x, spot.z, { state: o.state || 'revealing', elite, group: o.group });
      if (e.state === 'revealing') e.revealT = 0.6;
      out.push(e);
    }
    return out;
  }
  // A wave that arrives from out of sight and hunts the player.
  spawnWave(count, o = {}) {
    const p = this.player, zone = ZONES[Math.max(1, this.world.zoneAt(p.x, p.z))];
    const kinds = [];
    for (let i = 0; i < count; i++) kinds.push(o.exact ? o.exact[i % o.exact.length] : this.rSpawn.pick(o.kinds || zone.mimics));
    const spot = this.hiddenSpot(o.near ? o.near.x : p.x, o.near ? o.near.z : p.z, o.rmin ?? 16, o.rmax ?? 30);
    return this.spawnPack(spot.x, spot.z, kinds, { state: 'hunt', ...o });
  }
  hiddenSpot(cx, cz, rmin, rmax) {
    const p = this.player;
    let fallback = null;
    for (let i = 0; i < 24; i++) {
      const s = this.world.randomFree(this.rSpawn, cx, cz, rmin, rmax, 0.8, 4);
      if (!s) continue;
      if (this.world.zoneAt(s.x, s.z) === 0 && this.mode === 'raid') continue;
      // A hunter that arrives must be able to walk to the operator (no sealed court, no terrace without a stair).
      if (!this.reachesPlayer(s.x, s.z)) continue;
      fallback = s;
      if (!this.world.hasLos(p.x, p.z, s.x, s.z)) return s;
    }
    return fallback || { x: cx, z: cz };
  }

  dropPickup(kind, x, z, data = {}) {
    const spot = this.world.isFree(x, z) ? { x, z } : (this.world.randomFree(this.rLoot, x, z, 0.5, 2.5, 0.3) || { x, z });
    const rarity = kind === 'gear' ? data.item.rarity : kind === 'item' ? ITEMS[data.id].rarity : 0;
    const col = kind === 'med' ? [0.3, 1, 0.5] : kind === 'sample' ? [0.7, 0.4, 1] : kind === 'core' ? [1, 0.5, 0.2] : kind === 'loot' ? [0.75, 0.7, 0.6] : kind === 'pack' ? [1, 0.75, 0.35] : null;
    const k = { id: this.nextId++, kind, x: spot.x, z: spot.z, rarity, col, t: 0, ...data };
    if (this.world.hasHeight) k.fy = this.world.floorAt(k.x, k.z);
    this.pickups.push(k);
    return k;
  }

  // XP shards merge with a nearby shard so a horde does not flood the pickup list.
  dropXp(x, z, amount) {
    const list = this.pickups;
    const H = this.world.hasHeight, fy = H ? this.world.floorAt(x, z) : 0;
    for (let i = list.length - 1, n = 0; i >= 0 && n < 24; i--, n++) {
      const k = list[i];
      if (k.kind === 'xp' && Math.abs(k.x - x) < 1.2 && Math.abs(k.z - z) < 1.2 && (!H || k.fy === fy)) { k.amount += amount; return; }
    }
    if (list.length > 500) { this.addXp(amount); return; }
    const k = { id: this.nextId++, kind: 'xp', x, z, amount, rarity: 0, col: [0.35, 0.9, 1.0], t: 0 };
    if (H) k.fy = fy;
    list.push(k);
  }

  addArea(a) {
    const area = { id: this.nextId++, t: 0, tick: 0, owner: 'player', dps: 0, col: [1, 1, 1], ...a };
    if (this.world.hasHeight && area.fy === undefined) area.fy = area.follow ? this.bodyY(area.follow) : this.world.floorAt(area.x, area.z);
    this.areas.push(area);
    return area;
  }
  // o.pow: a copied cast's share; o.post: carried hardware with no lifetime; o.lane: the facing a
  // sentry holds (drones have none and orbit the operator).
  addSummon(kind, x, z, life, shot = SUMMON_SHOTS[kind] || SUMMON_SHOTS.drone, o = {}) {
    const p = this.player;
    const s = {
      id: this.nextId++, kind, x, z, face: o.lane ?? p.face, t: life * p.summonDur, cd: 0.3, buffT: 0, shot, orbit: this.rCombat.range(0, 6.28),
      pow: o.pow ?? 1, post: !!o.post, lane: kind === 'sentry' ? (o.lane ?? p.face) : null,
    };
    if (this.world.hasHeight) s.fy = kind === 'drone' ? this.bodyY(p) : this.world.floorAt(x, z);
    this.summons.push(s);
    // Summon cap of 6: the oldest retires (doc 18, 18-A-03). Posted sentries are carried hardware and never do.
    while (this.summons.length > SUMMON_CAP) {
      const i = this.summons.findIndex((k) => !k.post);
      if (i < 0) break;
      this.removeSummon(this.summons[i]);
    }
    return s;
  }
  removeSummon(s) {
    const i = this.summons.indexOf(s);
    if (i >= 0) this.summons.splice(i, 1);
    this.emit({ t: 'pickup', x: s.x, z: s.z, col: [0.6, 0.6, 0.7] });
  }
  // A sentry covers a body inside its range and lane, in sight.
  sentryCovers(e) {
    for (const s of this.summons) {
      if (s.kind !== 'sentry' || dist(s.x, s.z, e.x, e.z) >= s.shot.shotRange) continue;
      if (Math.abs(angleDiff(s.lane, Math.atan2(e.z - s.z, e.x - s.x))) <= s.shot.halfArc && this.world.hasLos(s.x, s.z, e.x, e.z)) return true;
    }
    return false;
  }

  // Loud events raise Awareness on nearby disguised Mimics and scare civilians.
  noise(x, z, r) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d2 = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
      if (d2 > r * r) continue;
      if (e.state === 'civ') { e.state = 'flee'; e.fleeT = 5; } else if ((e.state === 'disguised' || e.state === 'suspicious') && e.noiseT <= 0) { e.aware += 0.34; e.noiseT = 1.2; }
      else if (e.mode === 'perch') e.woken = true; // gunfire under a roost puts it up
    }
  }

  reveal(e, fast = false) {
    if (!e.isMimic || (e.state !== 'disguised' && e.state !== 'suspicious' && e.state !== 'flee')) return;
    e.state = 'revealing';
    e.wasDisguised = true;
    e.revealT = fast ? 0.35 : 1.0;
    e.aware = 1;
    // A lurker comes out as an elite of this zone and hour, not of the moment it was rolled.
    if (e.lurker) {
      const base = ENEMIES[e.kind], { hpMul, dmgMul } = this.scaleAt(e.kind, e.x, e.z);
      e.maxHp = e.hp = base.hp * hpMul * ELITE_HP; e.dmg = base.dmg * dmgMul * ELITE_DMG;
      if (e.elite.includes('armored')) e.plate = e.maxHp * 0.2;
      e.lurkT = 0;
    }
    this.emit({ t: 'reveal', x: e.x, z: e.z });
    this.sfx('reveal', e.x, e.z);
    // Shared alarm: nearby Mimics gain partial Awareness (doc 03, section 1).
    for (const o of this.enemies) {
      if (o === e || o.dead || (o.state !== 'disguised' && o.state !== 'suspicious')) continue;
      if (dist(o.x, o.z, e.x, e.z) < 10) o.aware += 0.3;
    }
  }

  // ---- main step ----
  step(dt, input = NO_INPUT) {
    if (this.over) return;
    if (this.choice) { if (this.autoPick) this.pickChoice(0); else return; }
    if (this.pendingLevels > 0) {
      this.pendingLevels--;
      this.offerChoice(message('LEVEL {level}: choose an upgrade', { level: this.player.level - this.pendingLevels }), levelChoices(this), (id) => this.giveItem(id));
      if (!this.autoPick) return;
      this.pickChoice(0);
    }
    this.time += dt;
    this.updateClock(dt);
    if (this.over) return;
    this.updatePlayer(dt, input);
    this.useSkills(dt, input);
    this.fieldT -= dt;
    if (this.fieldT <= 0) { this.fieldT = 0.2; this.computeField(); }
    this.updateEnemies(dt);
    updateDoors(this, dt);
    this.updateProjectiles(dt);
    this.updateAreas(dt);
    this.updateSummons(dt);
    this.updatePickups(dt);
    this.updateFragments(dt);
    this.updateDots(dt);
    updateRunItems(this, dt);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    if (this.mode === 'raid') this.updateDirector(dt);
    this.updateInteract(dt, input);
    if (this.boss) updateBoss(this, dt);
    if (this.script) this.script.update(this, dt, input);
    updateJobs(this, dt);
    updateRoute(this, dt);
    if (this.scanFx) this.scanFx.t += dt;
    // Sweep the dead.
    if (this.enemies.length && (this.sweep = (this.sweep || 0) + 1) % 30 === 0) this.enemies = this.enemies.filter((e) => !e.dead);
  }

  updateClock(dt) {
    if (this.mode !== 'raid') return;
    this.raidTime += dt * this.clockScale;
    this.nl = clamp(this.raidTime / RAID_SECONDS, 0, 1);
    this.clock = CLOCK_START + this.nl * CLOCK_HOURS;
    let band = 0;
    for (let i = 0; i < BANDS.length; i++) if (this.clock >= BANDS[i].from) band = i;
    if (band !== this.band) {
      this.band = band;
      const p = this.player, ex = this.nearestExtraction();
      this.banner(BANDS[band].name.toUpperCase(), 'Mimics grow stronger. Drops improve.', '#ffb86a');
      // Decision gates at 22:30 and 00:30: facts only, no advice (doc 19, section 4).
      if (band >= 2) this.relay(message('Relay: Carrying {value} value. Exit bonus x{bonus}. Nearest exit {distance} m.', {
        value: this.carryValue(), bonus: (0.05 * this.zmax + 0.25 * this.nl).toFixed(2), distance: Math.round(dist(p.x, p.z, ex.x, ex.z)),
      }));
      this.sfx('banner');
    }
    if (this.raidTime >= RAID_SECONDS) {
      this.banner('CURFEW', 'Command has cut the link.', '#ff5a5a');
      this.finish('curfew');
    }
  }

  nearestExtraction() {
    const p = this.player;
    let best = null, bd = Infinity;
    for (const e of this.world.extractions) {
      if (!e || !this.poi[e.id].known) continue;
      const d = dist(p.x, p.z, e.x, e.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best || this.world.extractions[0];
  }

  // ---- player ----
  updatePlayer(dt, input) {
    const p = this.player, w = this.world;
    for (const k in p.cd) if (p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - dt);
    p.iframes = Math.max(0, p.iframes - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.dodgeT = Math.max(0, p.dodgeT - dt);
    p.swingT = Math.max(0, p.swingT - dt); p.slowT = Math.max(0, p.slowT - dt); p.comboT = Math.max(0, p.comboT - dt);
    if (p.comboT <= 0) p.combo = 0;
    if (!p.hidden) p.face = Math.atan2(input.aimZ - p.z, input.aimX - p.x);
    // Slows never multiply each other: the strongest one applies (acid 0.6, venom 0.7, a lurker's sap 0.8).
    if (p.sapT > 0) p.sapT = Math.max(0, p.sapT - dt);
    let speed = p.speed * p.loadMul * Math.min(p.slowT > 0 ? 0.6 : 1, p.sapT > 0 ? 0.8 : 1, p.vSlowT > 0 ? 0.7 : 1) * (p.channel ? p.channel.moveMul : 1);
    if (p.dash) {
      const d = p.dash;
      const step = Math.min(dt, d.t);
      p.x += d.vx * step; p.z += d.vz * step;
      d.t -= dt;
      if (d.onStep) d.onStep();
      if (d.t <= 0) { p.dash = null; if (d.onEnd) d.onEnd(); }
      p.moving = true;
    } else if (!p.hidden) {
      const l = Math.hypot(input.mx, input.mz);
      if (l > 0.05) {
        const k = speed * dt / Math.max(1, l);
        p.x += input.mx * k; p.z += input.mz * k;
        p.lastMx = input.mx / l; p.lastMz = input.mz / l;
        p.moving = true;
      } else p.moving = false;
      p.stillT = p.moving || p.dash ? 0 : (p.stillT || 0) + dt;   // Braced Grip reads how long the operator has stood
    }
    w.resolveCircle(p, p.r);
    // Stepping off a drop cell (doc 64 Package 8): the landing costs health.
    if (p.fell > 0) this.fall(p.fell);
    // Sealed boss arena.
    const A = this.bossArena;
    if (A && A.sealed) arenaClamp(A, p, 0.6);
    if (p.moving) p.animT += dt * 11;
    // Regen, barrier, medkit. Hardlight regrows to its cap; granted barrier runs out on its own
    // timer, so having no Hardlight must not wipe it.
    if (p.regen > 0) this.heal(p.regen * dt);
    if (p.barrierMax > 0) {
      p.barrierT -= dt;
      if (p.barrierT <= 0 && p.barrier < p.barrierMax) p.barrier = Math.min(p.barrierMax, p.barrier + p.barrierMax * dt * 0.5);
    }
    if (p.shieldT > 0 && (p.shieldT -= dt) <= 0) { p.shieldT = 0; p.shield = 0; }
    // The Matron's venom: the drain ticks on its own and is never raised by the susceptibility.
    if (p.vDrainT > 0) {
      this.drain(p.vDrain * VENOM_DRAIN * dt);
      if ((p.vDrainT -= dt) <= 0) { p.vDrainT = 0; p.vDrain = 0; }
    }
    if (p.vSlowT > 0) p.vSlowT = Math.max(0, p.vSlowT - dt);
    if (p.vSusT > 0) p.vSusT = Math.max(0, p.vSusT - dt);
    // The same heal over a shorter application with Quick Webbing: less time exposed, not more health.
    const medTime = this.asp.has('quickdraw') ? 0.9 : 1.5;
    if (p.medT > 0) { const step = Math.min(dt, p.medT); p.medT -= dt; this.heal(p.maxHp * 0.45 * step / medTime); }
    if (input.quick1 && p.cd.med <= 0 && p.medkits > 0 && p.hp < p.maxHp) {
      this.useMedkit(); p.medT = medTime; p.cd.med = 2;
      this.emit({ t: 'heal' }); this.sfx('heal');
    }
    if (input.scan && p.cd.scan <= 0) this.doScan();
    // Class resources: momentum ebbs after 2 s without a hit, the radio recovers, recalled sentries return.
    const B = CLASS_RESOURCE.blade;
    if (p.momentum > 0 && this.time - p.momT > B.decayDelay) p.momentum = Math.max(0, p.momentum - B.decay * dt);
    if (p.radioT > 0) p.radioT = Math.max(0, p.radioT - dt);
    for (let i = p.recalls.length - 1; i >= 0; i--) if ((p.recalls[i] -= dt) <= 0) { p.recalls.splice(i, 1); p.carried++; this.sfx('deploy'); }
    // Zone tracking and banners (doc 17, minimap marking).
    const z = w.zoneAt(p.x, p.z);
    if (z !== this.zone) {
      this.zone = z;
      const Z = ZONES[z];
      if (this.mode === 'raid') {
        const title = message('{zone}: {name}', { zone: Z.label, name: message(Z.name.toUpperCase()) });
        const sub = z === 0 ? 'No Mimics inside the Shelter.' : message('Health x{hp}  Damage x{damage}  Loot x{loot}', {
          hp: Z.hp.toFixed(1), damage: Z.dmg.toFixed(2), loot: Z.loot.toFixed(1),
        });
        this.banner(title, sub, Z.css);
        this.sfx('zone');
      }
    }
    this.zmax = Math.max(this.zmax, z);
  }

  startDash(dx, dz, distance, time, iframes, onEnd = null, onStep = null) {
    const p = this.player, l = Math.hypot(dx, dz) || 1;
    p.dash = { vx: dx / l * distance / time, vz: dz / l * distance / time, t: time, onEnd, onStep };
    p.iframes = Math.max(p.iframes, iframes);
    p.dodgeT = time;
    this.sfx('dash');
  }
  dodgeDir(input) {
    const p = this.player, l = Math.hypot(input.mx, input.mz);
    if (l > 0.1) return [input.mx / l, input.mz / l];
    return [Math.cos(p.face), Math.sin(p.face)];
  }

  useSkills(dt, input) {
    const p = this.player;
    if (p.dead) return;
    if (p.channel) tickBarrage(this, p, dt);
    if (p.hidden) return;
    if (input.dodge && p.cd.s <= 0 && !p.dash) { castSkill(this, 's', input); this.emit({ t: 'skill', slot: 's' }); }
    if (p.dash) return;
    this.lastInput = input;
    // A fresh M2 press (not a held button) is what spends a Rifleman cell.
    const press = !!input.m2 && !this.m2Down;
    this.m2Down = !!input.m2;
    if (input.ult && p.cd.r <= 0 && !p.channel) { this.powerMul = 1; if (castSkill(this, 'r', input) !== false) this.emit({ t: 'skill', slot: 'r' }); }
    if (input.m2 && !p.channel) {
      if (p.cd.m2 <= 0) { if (this.castM2(input)) this.emit({ t: 'skill', slot: 'm2' }); }
      else if (press && p.classId === 'rifleman' && p.cells > 0 && this.castM2(input, true)) this.emit({ t: 'skill', slot: 'm2', cell: true });
    }
    if (input.m1 && p.cd.m1 <= 0 && !p.channel) { castSkill(this, 'm1', input); this.emit({ t: 'skill', slot: 'm1' }); }
  }
  setCd(slot, seconds) {
    const p = this.player;
    p.cd[slot] = seconds;
    p.cdMax[slot] = seconds;
  }

  // Scan Pulse: reveals Mimics through walls and opens a Resonance Link to each (doc 03).
  doScan() {
    const p = this.player;
    const tracer = this.asp.has('tracer');   // a longer trace, a slower next scan (doc 63)
    p.cd.scan = p.cdMax.scan = SCAN_COOLDOWN + (tracer ? 2 : 0);
    this.scanFx = { x: p.x, z: p.z, t: 0 };
    this.sfx('scan');
    let links = 0, humans = 0;
    for (const e of this.enemies) {
      if (e.dead || dist(e.x, e.z, p.x, p.z) > SCAN_RANGE) continue;
      if (e.isMimic) {
        e.outlineT = SCAN_TIME + (tracer ? 4 : 0);
        if (e.state === 'disguised' || e.state === 'suspicious') { e.linkT = SCAN_TIME; links++; }
      } else { e.humanT = SCAN_TIME; humans++; }
    }
    const w = this.world, n = w.n, bx = Math.floor(p.x / 100), bz = Math.floor(p.z / 100);
    let hosts = 0;
    for (let z = Math.max(0, bz - 1); z <= Math.min(n - 1, bz + 1); z++) {
      for (let x = Math.max(0, bx - 1); x <= Math.min(n - 1, bx + 1); x++) {
        for (const c of w.blocks[z * n + x].containers) {
          const st = this.cont[c.id];
          if (st.host && !st.opened && !st.hostKnown && dist(c.x, c.z, p.x, p.z) <= SCAN_RANGE) { st.hostKnown = true; hosts++; }
        }
      }
    }
    this.emit({ t: 'scan', links, humans, hosts });
    if (this.boss) this.boss.scanned = true;
  }

  // ---- enemies ----
  computeField() {
    const p = this.player, w = this.world, F = this.field, Q = this.fieldQ, S = w.size, G = w.grid;
    const x0 = Math.floor(p.x) - FIELD / 2, z0 = Math.floor(p.z) - FIELD / 2;
    this.fieldX0 = x0; this.fieldZ0 = z0;
    F.fill(65535);
    let head = 0, tail = 0;
    const start = (FIELD / 2) * FIELD + FIELD / 2;
    F[start] = 0; Q[tail++] = start;
    // Closed doors carry the field: a pursuer walks up to one and shoves it open (doors.js).
    const W = PASSABLE;
    if (w.hasHeight) {
      // The same search with the step rule, run from the operator backwards: a cell joins
      // when a hostile there could walk to the cell it was reached from, or drop to it off an
      // authored drop cell. Nothing climbs more than a step.
      const FL = w.floor, DR = w.drop;
      const ok = (from, to) => { const d = FL[to] - FL[from]; return (d <= STEP && d >= -STEP) || (d < 0 && DR[from] === 1); };
      while (head < tail) {
        const i = Q[head++], fx = i % FIELD, fz = (i / FIELD) | 0, d = F[i] + 1;
        const wx = fx + x0, wz = fz + z0, wi = wz * S + wx;
        if (fx > 0 && F[i - 1] === 65535 && wx - 1 >= 0 && W[G[wi - 1]] && ok(wi - 1, wi)) { F[i - 1] = d; Q[tail++] = i - 1; }
        if (fx < FIELD - 1 && F[i + 1] === 65535 && wx + 1 < S && W[G[wi + 1]] && ok(wi + 1, wi)) { F[i + 1] = d; Q[tail++] = i + 1; }
        if (fz > 0 && F[i - FIELD] === 65535 && wz - 1 >= 0 && W[G[wi - S]] && ok(wi - S, wi)) { F[i - FIELD] = d; Q[tail++] = i - FIELD; }
        if (fz < FIELD - 1 && F[i + FIELD] === 65535 && wz + 1 < S && W[G[wi + S]] && ok(wi + S, wi)) { F[i + FIELD] = d; Q[tail++] = i + FIELD; }
      }
      return;
    }
    while (head < tail) {
      const i = Q[head++], fx = i % FIELD, fz = (i / FIELD) | 0, d = F[i] + 1;
      const wx = fx + x0, wz = fz + z0;
      if (fx > 0 && F[i - 1] === 65535 && wx - 1 >= 0 && W[G[wz * S + wx - 1]]) { F[i - 1] = d; Q[tail++] = i - 1; }
      if (fx < FIELD - 1 && F[i + 1] === 65535 && wx + 1 < S && W[G[wz * S + wx + 1]]) { F[i + 1] = d; Q[tail++] = i + 1; }
      if (fz > 0 && F[i - FIELD] === 65535 && wz - 1 >= 0 && W[G[(wz - 1) * S + wx]]) { F[i - FIELD] = d; Q[tail++] = i - FIELD; }
      if (fz < FIELD - 1 && F[i + FIELD] === 65535 && wz + 1 < S && W[G[(wz + 1) * S + wx]]) { F[i + FIELD] = d; Q[tail++] = i + FIELD; }
    }
  }
  // Direction toward the player along the flow field. Writes into this.dir.
  chaseDir(e) {
    const p = this.player, F = this.field;
    const cx = Math.floor(e.x), cz = Math.floor(e.z);
    const fx = cx - this.fieldX0, fz = cz - this.fieldZ0;
    let dx = p.x - e.x, dz = p.z - e.z;
    const w = this.world, H = w.hasHeight;
    // Straight at the operator when in sight and close, unless the way is not level.
    const direct = e.los && dx * dx + dz * dz < 144 && (!H || w.walkLine(e.x, e.z, p.x, p.z));
    if (fx >= 1 && fz >= 1 && fx < FIELD - 1 && fz < FIELD - 1 && !direct) {
      const i = fz * FIELD + fx, S = w.size, wi = cz * S + cx;
      // With height a lower neighbour may sit beyond an edge this body cannot step down.
      const can = (ox, oz) => !H || w.stepOK(wi, wi + oz * S + ox, true);
      let best = F[i], bx = 0, bz = 0;
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oz) continue;
          const v = F[i + oz * FIELD + ox];
          if (v < best) {
            // Do not cut corners diagonally through walls.
            if (ox && oz && (F[i + ox] === 65535 || F[i + oz * FIELD] === 65535)) continue;
            if (H && (!can(ox, oz) || (ox && oz && (!can(ox, 0) || !can(0, oz))))) continue;
            best = v; bx = ox; bz = oz;
          }
        }
      }
      if (bx || bz) { dx = cx + bx + 0.5 - e.x; dz = cz + bz + 0.5 - e.z; }
    }
    const l = Math.hypot(dx, dz) || 1;
    this.dirX = dx / l; this.dirZ = dz / l;
  }
  moveEnemy(e, dx, dz, speed, dt, faceMove = true) {
    if (e.st.slowT > 0) speed *= 0.6;
    e.x += dx * speed * dt; e.z += dz * speed * dt;
    this.world.resolveCircle(e, e.r * 0.8);
    e.moving = true;
    e.animT += dt * speed * 2.2;
    if (faceMove) e.face += angleDiff(e.face, Math.atan2(dz, dx)) * Math.min(1, dt * 10);
  }

  updateEnemies(dt) {
    const p = this.player, w = this.world;
    let links = 0, passive = 0;
    // Attack tokens: count who is already winding up before anyone decides this frame.
    let attackers = 0, pouncers = 0, motes = 0, divers = 0;
    for (const e of this.enemies) {
      if (e.dead || e.state !== 'hunt') continue;
      // A Shrike holds its dive token from the flare to the landing.
      if (e.flier) { if (e.windupT > 0 || e.mode === 'dive') divers++; continue; }
      if (e.windupT > 0) { if (e.kind === 'mite') pouncers++; else if (e.kind === 'mote') motes++; else if (e.kind === 'walker' || e.kind === 'brute' || e.kind === 'titan') attackers++; }
    }
    this.attackers = attackers; this.pouncers = pouncers; this.chargingMotes = motes; this.divers = divers;
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.age += dt;
      e.moving = false;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.outlineT > 0) e.outlineT -= dt;
      if (e.humanT > 0) e.humanT -= dt;
      if (e.noiseT > 0) e.noiseT -= dt;
      const st = e.st;
      if (st.suppT > 0 && (st.suppT -= dt) <= 0) st.supp = 0;
      if (st.venomT > 0 && (st.venomT -= dt) <= 0) st.venom = 0;
      if (st.exposedT > 0) st.exposedT -= dt;
      if (st.markT > 0) st.markT -= dt;
      if (st.orderT > 0) st.orderT -= dt;
      if (st.slowT > 0) st.slowT -= dt;
      if (st.plagueT > 0) st.plagueT -= dt;
      if (st.bleedT > 0) st.bleedT -= dt;
      if (e.decoyT !== undefined && (e.decoyT -= dt) <= 0) { e.dead = true; this.emit({ t: 'blink', x: e.x, z: e.z }); continue; }
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);

      switch (e.state) {
        case 'civ': case 'disguised': case 'suspicious': {
          if (e.isMimic) {
            // Passive sense: shimmer inside 12 m, no identification.
            e.shimmer = d < PASSIVE_RANGE ? 1 - d / PASSIVE_RANGE : 0;
            if (e.shimmer > 0) passive = Math.max(passive, e.shimmer);
            if (e.linkT > 0) {
              e.linkT -= dt;
              links++;
              // The link is two-way: Awareness climbs while it is open.
              e.aware += dt / (e.flip * (1 - 0.3 * this.nl) * p.flipMul);
              if (d > SCAN_RANGE * 1.3) e.linkT = 0;
            } else if (d < 5.5 && !p.dead) {
              e.losT -= dt;
              if (e.losT <= 0) { e.losT = 0.25; e.los = w.hasLos(e.x, e.z, p.x, p.z); }
              if (e.los) e.aware += dt * 0.085;
            } else e.aware = Math.max(0, e.aware - dt * 0.05);
            if (e.aware >= 1) { this.reveal(e); break; }
            e.state = e.aware > 0.55 ? 'suspicious' : 'disguised';
            // A lurker works the street while it still looks human (doc 64, Package 3).
            if (e.lurker && lurkerTick(this, e, dt, d)) break;
          }
          if (e.state === 'suspicious') {
            // Stops and tracks the operator with its head.
            e.face += angleDiff(e.face, Math.atan2(dz, dx)) * Math.min(1, dt * 4);
            break;
          }
          if (e.waitT > 0) { e.waitT -= dt; break; }
          const tx = e.tx - e.x, tz = e.tz - e.z, tl = Math.hypot(tx, tz);
          e.stuckT = (e.stuckT || 0) + dt;
          if (tl < 1.2 || e.stuckT > 9) {
            // Stroll to another pedestrian point, preferring one in a straight line.
            e.stuckT = 0;
            for (let k = 0; k < 5; k++) {
              const t = w.pedNear(this.rAi, e.x, e.z, 1);
              if (!t || (e.isMimic && w.zoneAt(t.x, t.z) === 0)) continue;
              e.tx = t.x; e.tz = t.z;
              if (w.hasLos(e.x, e.z, t.x, t.z) && (!w.hasHeight || w.walkLine(e.x, e.z, t.x, t.z))) break;
            }
            if (this.rAi.chance(0.25)) e.waitT = this.rAi.range(1, 4);
          } else this.moveEnemy(e, tx / tl, tz / tl, 1.45, dt);
          if (d > 140) e.dead = true;
          break;
        }
        case 'patient': patientTick(this, e, dt, d); break;
        case 'flee': {
          e.fleeT -= dt;
          if (d > 0.1) this.moveEnemy(e, -dx / d, -dz / d, 4.6, dt);
          // A wounded disguise that got away is still a disguise.
          if (e.fleeT <= 0) { e.state = e.isMimic ? 'disguised' : 'civ'; e.node = null; e.tx = e.x; e.tz = e.z; }
          if (d > 140) e.dead = true;
          break;
        }
        case 'revealing': {
          e.revealT -= dt;
          e.face += angleDiff(e.face, Math.atan2(dz, dx)) * Math.min(1, dt * 8);
          if (e.revealT <= 0) { e.state = 'hunt'; e.outlineT = Math.max(e.outlineT, 0); }
          break;
        }
        case 'hunt': this.updateHunter(e, dt, dx, dz, d); break;
        default: break; // 'static' and 'boss' are driven elsewhere
      }
    }
    this.links = links;
    this.passive = passive;
    // Shot budget: enemy projectiles in the air plus shells and spits being wound up.
    let shots = 0;
    for (const pr of this.projectiles) if (pr.owner === 'enemy') shots++;
    for (const e of list) if (!e.dead && e.windupT > 0 && (e.kind === 'spitter' || e.kind === 'lobber')) shots++;
    this.enemyShots = shots;
    // Separation between hunters so packs do not stack on one point.
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.state !== 'hunt' || this.aloft(a)) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.state !== 'hunt' || this.aloft(b)) continue;
        const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push;
        }
      }
    }
  }

  updateHunter(e, dt, dx, dz, d) {
    const p = this.player, w = this.world, base = ENEMIES[e.kind];
    e.losT -= dt;
    if (e.losT <= 0) { e.losT = 0.2; e.los = d < 60 && w.hasLos(e.x, e.z, p.x, p.z); }
    if (e.atkCd > 0) e.atkCd -= dt;
    // Despawn hunters that fall far behind.
    // The horde recycles: anything left far behind is removed and re-enters closer.
    if (d > 62 && !e.group && !e.elite && e.kind !== 'titan') { e.farT += dt; if (e.farT > 2.5) { e.dead = true; } return; }
    if (d > 130) { e.farT += dt; if (e.farT > 6) { e.dead = true; if (e.group && this.groups[e.group]) this.groups[e.group].alive--; } return; }
    // The Shelter field burns anything hostile that crosses into it.
    if (this.mode === 'raid' && w.zoneAt(e.x, e.z) === 0 && e.kind !== 'matron') { e.noDrop = true; this.damageEnemy(e, e.maxHp * 0.9 * dt + 40 * dt, { dot: true }); if (e.dead) return; }
    if (e.kind === 'titan') titanTick(this, e, dt, d);
    e.farT = 0;
    if (e.elite) this.updateAffixes(e, dt, d);
    // A Shrike flies its own way: no flow field, no step rule, no doors (behave.js flierTick).
    if (e.flier) { flierTick(this, e, dt, dx, dz, d); return; }
    const nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0;
    const faceP = () => { e.face += angleDiff(e.face, Math.atan2(dz, dx)) * Math.min(1, dt * 9); };

    // Knockback slides the body; a stagger cancels the wind-up of anything light.
    if (e.kx || e.kz) {
      e.x += e.kx * dt; e.z += e.kz * dt;
      w.resolveCircle(e, e.r * 0.8);
      const k = Math.max(0, 1 - dt * 9);
      e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) + Math.abs(e.kz) < 0.2) { e.kx = 0; e.kz = 0; }
    }
    if (e.stunT > 0) { e.stunT -= dt; return; }
    // A wind-up in progress commits the attack.
    if (e.windupT > 0) {
      e.windupT -= dt;
      if (e.kind === 'hollow') this.moveEnemy(e, nx, nz, e.speed * 0.4, dt);
      if (e.windupT <= 0) {
        if (e.pending === 'charge') {
          e.pending = null; e.mode = 'charge'; e.modeT = CHARGE_TIME; e.face = e.atkAngle;
          e.charge = { vx: Math.cos(e.atkAngle) * CHARGE_SPEED, vz: Math.sin(e.atkAngle) * CHARGE_SPEED, hit: false };
        } else {
          this.enemyStrike(e, d);
          const rec = ENEMIES[e.kind].recover;
          if (rec && !e.dead) { e.mode = 'recover'; e.modeT = rec * this.rAi.range(0.85, 1.25); }
        }
      }
      return;
    }
    if (e.leap) {
      const L = e.leap;
      e.x += L.vx * dt; e.z += L.vz * dt;
      w.resolveCircle(e, e.r * 0.8);
      e.animT += dt * 30; e.moving = true;
      L.t -= dt;
      if (!L.hit && dist(e.x, e.z, p.x, p.z) < e.r + p.r + 0.35 && this.sameLevel(e, p)) { L.hit = true; if (this.damagePlayer(e.dmg, e.x, e.z)) this.leech(e, e.dmg); }
      if (L.t <= 0) e.leap = null;
      return;
    }
    if (p.dead) return;
    // A melee hostile on another level cannot strike from where it is: it takes the way round
    // the flow field knows (a stair, a ramp, a drop) until it stands level with the operator.
    if (w.hasHeight && MELEE.has(e.kind) && e.mode !== 'charge' && !this.sameLevel(e, p)) {
      e.face += angleDiff(e.face, Math.atan2(dz, dx)) * Math.min(1, dt * 4);
      this.chaseDir(e); this.moveEnemy(e, this.dirX, this.dirZ, e.speed, dt);
      return;
    }
    hunterBrain(this, e, dt, dx, dz, d, nx, nz);
  }

  leech(e, dealt) {
    if (e.elite && e.elite.includes('leeching') && !e.dead) {
      e.hp = Math.min(e.maxHp, e.hp + dealt * 0.3 * 4);
      this.emit({ t: 'beam', x: this.player.x, z: this.player.z, x2: e.x, z2: e.z, col: AFFIXES.leeching.color, life: 0.25, w: 0.1, k: 3 });
    }
  }

  enemyStrike(e, d) {
    const p = this.player, base = ENEMIES[e.kind];
    e.atkCd = base.cd * this.rAi.range(0.85, 1.2);
    // A blow struck from another level reaches nobody (the leap and the burst still go off).
    if (this.world.hasHeight && MELEE.has(e.kind) && e.kind !== 'mite' && e.kind !== 'skitter' && !this.sameLevel(e, p)) d = Infinity;
    switch (e.kind) {
      case 'mite':
        // Pounce along the line locked at the start of the crouch.
        e.leap = { vx: Math.cos(e.atkAngle) * 15, vz: Math.sin(e.atkAngle) * 15, t: 0.28, hit: false };
        e.face = e.atkAngle;
        break;
      case 'walker':
        this.emit({ t: 'slash', x: e.x, z: e.z, r: 2.2 * e.scale, half: 0.8, angle: e.face, col: [1, 0.2, 0.5] });
        if (d < 2.5 * e.scale + p.r && Math.abs(angleDiff(e.atkAngle ?? e.face, Math.atan2(p.z - e.z, p.x - e.x))) < 0.8) { if (this.damagePlayer(e.dmg, e.x, e.z)) this.leech(e, e.dmg); }
        break;
      case 'brute': case 'titan': {
        const r = e.kind === 'titan' ? 8 : 4.8 * e.scale;
        this.emit({ t: 'explode', x: e.x + Math.cos(e.atkAngle) * 2, z: e.z + Math.sin(e.atkAngle) * 2, r: 2.5, col: [1, 0.25, 0.1], shake: 0.3 });
        this.sfx('slam', e.x, e.z);
        if (d < r + p.r && Math.abs(angleDiff(e.atkAngle, Math.atan2(p.z - e.z, p.x - e.x))) < 0.9) { if (this.damagePlayer(e.dmg, e.x, e.z)) this.leech(e, e.dmg); }
        break;
      }
      case 'spitter': {
        const a = Math.atan2(p.z - e.z, p.x - e.x), y = this.world.hasHeight ? this.bodyY(e) + 1.4 : 1.4;
        this.projectiles.push({ id: this.nextId++, kind: 'spit', owner: 'enemy', x: e.x, z: e.z, y, vy: this.aimVy(y, e.x, e.z, this.bodyY(p) + 1.4, p.x, p.z, 11), vx: Math.cos(a) * 11, vz: Math.sin(a) * 11, life: 1.9, dmg: e.dmg, r: 0.4, col: [0.5, 1, 0.2], size: 1.0, pool: true, src: e });
        e.mode = 'relocate'; e.modeT = this.rAi.range(1.6, 2.6); if (this.rAi.chance(0.5)) e.orbit *= -1;
        this.sfx('spit', e.x, e.z);
        break;
      }
      case 'skitter': {
        const a = e.atkAngle ?? Math.atan2(p.z - e.z, p.x - e.x);
        e.leap = { vx: Math.cos(a) * 21, vz: Math.sin(a) * 21, t: 0.38, hit: false };
        e.face = a;
        break;
      }
      case 'hollow': {
        // Suicide burst.
        this.emit({ t: 'explode', x: e.x, z: e.z, r: 3.5, col: [1, 0.5, 0.1], shake: 0.35 });
        this.sfx('blast', e.x, e.z);
        if (dist(e.x, e.z, p.x, p.z) < 3.5 + p.r && d !== Infinity) this.damagePlayer(e.dmg, e.x, e.z);
        e.noDrop = true;
        this.killEnemy(e);
        break;
      }
      default: hordeStrike(this, e, d); break;
    }
  }

  updateAffixes(e, dt, d) {
    const p = this.player;
    if (e.plateT > 0 && (e.plateT -= dt) <= 0) e.plate = e.maxHp * 0.2;
    if (e.elite.includes('blazing')) {
      e.trailT -= dt;
      if (e.trailT <= 0 && e.moving !== undefined && !this.aloft(e)) { e.trailT = 0.45; this.addArea({ kind: 'fire', x: e.x, z: e.z, r: 1.3, life: 2.4, col: AFFIXES.blazing.color, owner: 'enemy', dps: e.dmg * 0.55 }); }
    }
    e.affT -= dt;
    if (e.affT > 0) return;
    if (e.elite.includes('voltaic') && d < 26) {
      // Three seeking arc orbs after a one second spark (doc 18).
      const spark = this.warn(1);
      this.emit({ t: 'ring', x: e.x, z: e.z, r: 3, col: AFFIXES.voltaic.color, life: spark, k: 3 });
      this.sfx('charge', e.x, e.z);
      this.after(spark, () => {
        if (e.dead) return;
        for (let k = -1; k <= 1; k++) {
          const a = Math.atan2(p.z - e.z, p.x - e.x) + k * 0.7;
          this.projectiles.push({ id: this.nextId++, kind: 'orb', owner: 'enemy', x: e.x, z: e.z, y: e.ay !== undefined ? e.ay + 0.6 : this.world.hasHeight ? this.bodyY(e) + 1.5 : 1.5, vx: Math.cos(a) * 7.5, vz: Math.sin(a) * 7.5, life: 5, dmg: e.dmg * 0.8, r: 0.45, col: AFFIXES.voltaic.color, size: 0.9, seek: 2.6 });
        }
      });
      e.affT = 6;
    } else if (e.elite.includes('hivebound') && e.hiveKids < 6) {
      for (let k = 0; k < 2; k++) {
        const s = this.world.randomFree(this.rSpawn, e.x, e.z, 1, 3, 0.6) || e;
        const kid = this.spawnEnemy('walker', s.x, s.z, { state: 'revealing' });
        kid.revealT = 0.5; kid.xp = 2; kid.credits = 1;
        e.hiveKids++;
      }
      this.emit({ t: 'ring', x: e.x, z: e.z, r: 3, col: AFFIXES.hivebound.color, k: 3 });
      e.affT = 10;
    } else e.affT = 2;
  }

  // ---- projectiles ----
  // A round leaves the muzzle at the operator's chest along its line of fire (lineOfFire): the
  // straight line through what the aim holds, or a lower height it settles onto, so a cursor
  // placed beyond a target down on the quay still meets it at chest height. o.at: the body an
  // automatic weapon chose. Range and speed are along the line, so a round fired up climbs.
  fireBullet(x, z, dx, dz, o) {
    const sp = o.speed || 85, y = this.bodyY(this.player) + CHEST, f = this.lineOfFire(x, z, y, o.at || null), h = sp / Math.hypot(1, f.k);
    const pr = {
      id: this.nextId++, kind: o.kind || 'bullet', owner: 'player', x, z, y, vx: dx * h, vz: dz * h, vy: f.k * h, k: f.k, life: (o.range || 45) / sp,
      dmg: o.dmg, type: o.type || 'ballistic', r: o.r || 0.25, col: o.col || [1, 0.85, 0.55], size: o.size || 0.5, pierce: (o.pierce || 0) + (o.kind ? 0 : this.player.pierce + 1), onHit: o.onHit || null, hitIds: null,
      aimed: o.aimed ?? true, // a deliberate aimed round unless the caller fires automatically
    };
    if (f.hold !== undefined) pr.hold = f.hold;
    this.projectiles.push(pr);
  }
  // Lobbed projectile that lands at a point after `time` seconds.
  lob(x0, z0, x1, z1, time, col, onLand, height = 3.2) {
    const pr = { id: this.nextId++, kind: 'lob', owner: 'player', x: x0, z: z0, y: 1.3, x0, z0, x1, z1, T: time, life: time, h: height, col, size: 0.6, onLand, vx: 0, vz: 0 };
    // From the operator's chest down to the floor where it lands.
    if (this.world.hasHeight) { pr.ya = this.bodyY(this.player) + 1.3; pr.yb = this.world.floorAt(x1, z1) + 0.1; pr.y = pr.ya; }
    this.projectiles.push(pr);
  }
  // Vertical speed that carries a shot from height y0 at (x0, z0) to height y1 at (x1, z1).
  aimVy(y0, x0, z0, y1, x1, z1, speed) {
    if (!this.world.hasHeight) return 0;
    const d = Math.hypot(x1 - x0, z1 - z0);
    return d > 0.5 ? clamp((y1 - y0) / d, -1.2, 1.2) * speed : 0;
  }

  updateProjectiles(dt) {
    const w = this.world, p = this.player, list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const pr = list[i];
      let dead = false;
      if (pr.kind === 'lob') {
        pr.life -= dt;
        const s = clamp(1 - pr.life / pr.T, 0, 1);
        pr.x = pr.x0 + (pr.x1 - pr.x0) * s; pr.z = pr.z0 + (pr.z1 - pr.z0) * s;
        pr.y = pr.ya === undefined ? 1.3 + 4 * s * (1 - s) * pr.h - 1.2 * s : pr.ya + (pr.yb - pr.ya) * s + 4 * s * (1 - s) * pr.h;
        // A grenade that meets a body aloft on its arc bursts on it, in the air (doc 64 Package 9).
        if (pr.owner === 'player' && pr.life > 0) {
          for (const e of this.enemies) {
            if (e.dead || e.untargetable || !this.aloft(e) || dist(e.x, e.z, pr.x, pr.z) > e.r + 0.35) continue;
            const sp = this.bodySpan(e);
            if (pr.y >= sp[0] && pr.y <= sp[1]) { dead = true; pr.onLand(pr.x, pr.z, pr.y); break; }
          }
        }
        if (!dead && pr.life <= 0) { dead = true; pr.onLand(pr.x1, pr.z1); }
      } else {
        if (pr.seek && !p.dead) {
          // Seeking orbs turn toward the operator; walls kill them.
          const sp = Math.hypot(pr.vx, pr.vz), a = Math.atan2(pr.vz, pr.vx);
          const na = a + clamp(angleDiff(a, Math.atan2(p.z - pr.z, p.x - pr.x)), -pr.seek * dt, pr.seek * dt);
          pr.vx = Math.cos(na) * sp; pr.vz = Math.sin(na) * sp;
          if (w.hasHeight) pr.vy = clamp(this.bodyY(p) + 1.4 - pr.y, -3, 3) * 2;
        }
        const nx = pr.x + pr.vx * dt, nz = pr.z + pr.vz * dt;
        // A round carries its height (doc 64 Package 8): the ground and a terrace face stop it.
        // The operator's rounds always do, on flat ground too (a flier is in the air), and a low
        // obstacle stops them below LOW_TOP: a parapet catches a low shot, a level one passes.
        const H = w.hasHeight, mine = pr.owner === 'player', vert = H || mine;
        let ny = pr.y;
        if (mine) {
          ny = this.stepFire(pr, pr.y, Math.hypot(nx - pr.x, nz - pr.z), nx, nz, pr.x, pr.z);
          pr.vy = (ny - pr.y) / dt; // drawn as it moves; the line of fire, not this, steers it
        } else if (H) ny = pr.y + (pr.vy || 0) * dt;
        const tWall = vert ? w.raycast(pr.x, pr.z, nx, nz, pr.y, ny, true, mine ? LOW_TOP : 0) : w.raycast(pr.x, pr.z, nx, nz);
        const ex = pr.x + (nx - pr.x) * tWall, ez = pr.z + (nz - pr.z) * tWall, ey = pr.y + (ny - pr.y) * tWall;
        // Height of the round at fraction t of this step, and whether that is inside a body.
        const inBody = (b, t) => { if (!vert && b.ay === undefined) return true; const y = pr.y + (ey - pr.y) * t, s = this.bodySpan(b); return y >= s[0] && y <= s[1]; };
        if (pr.owner === 'player') {
          // Segment against every living body in the path, nearest first.
          const sx = ex - pr.x, sz = ez - pr.z, sl2 = sx * sx + sz * sz || 1e-6;
          let hits = null;
          for (const e of this.enemies) {
            if (e.dead || e.untargetable || (pr.hitIds && pr.hitIds.has(e.id))) continue;
            const t = clamp(((e.x - pr.x) * sx + (e.z - pr.z) * sz) / sl2, 0, 1);
            const cx = pr.x + sx * t - e.x, cz = pr.z + sz * t - e.z, rr = e.r + pr.r;
            if (cx * cx + cz * cz <= rr * rr && inBody(e, t)) (hits || (hits = [])).push([t, e]);
          }
          if (hits) {
            hits.sort((a, b) => a[0] - b[0]);
            for (const [, e] of hits) {
              // Automatic fire passes anyone who looks human; an aimed round stops in the first one.
              const human = this.humanLooking(e);
              if (human && !pr.aimed) continue;
              // onHit learns whether the body was a valid target before this hit could reveal it.
              const valid = this.isTarget(e);
              this.playerHit(e, pr.dmg, pr.type, { fx: pr.x - pr.vx * 0.05, fz: pr.z - pr.vz * 0.05, aimed: pr.aimed });
              if (pr.onHit) pr.onHit(e, valid);
              if (pr.pierce > 0 && !human) { pr.pierce--; (pr.hitIds || (pr.hitIds = new Set())).add(e.id); } else { dead = true; break; }
            }
          }
        } else if (!p.dead) {
          const sx = ex - pr.x, sz = ez - pr.z, sl2 = sx * sx + sz * sz || 1e-6;
          const t = clamp(((p.x - pr.x) * sx + (p.z - pr.z) * sz) / sl2, 0, 1);
          const cx = pr.x + sx * t - p.x, cz = pr.z + sz * t - p.z, rr = p.r + pr.r;
          if (cx * cx + cz * cz <= rr * rr && inBody(p, t)) {
            if (this.damagePlayer(pr.dmg, pr.x, pr.z)) { dead = true; if (pr.pool) this.addArea({ kind: 'pool', x: p.x, z: p.z, r: 2.1, life: 4, col: [0.5, 1, 0.2], owner: 'enemy', dps: pr.dmg * 0.45 }); }
          }
        }
        pr.x = ex; pr.z = ez;
        if (vert) pr.y = ey;
        pr.life -= dt;
        if (!dead && tWall < 1) { dead = true; this.emit(vert ? { t: 'wallhit', x: ex, z: ez, y: ey } : { t: 'wallhit', x: ex, z: ez }); }
        if (!dead && pr.life <= 0) {
          dead = true;
          if (pr.pool) this.addArea({ kind: 'pool', x: pr.x, z: pr.z, r: 2.1, life: 4, col: [0.5, 1, 0.2], owner: 'enemy', dps: pr.dmg * 0.45 });
        }
      }
      if (dead) list.splice(i, 1);
    }
  }

  // ---- areas ----
  updateAreas(dt) {
    const p = this.player, list = this.areas;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      a.t += dt;
      if (a.follow && !a.follow.dead) { a.x = a.follow.x; a.z = a.follow.z; if (a.fy !== undefined) a.fy = this.bodyY(a.follow); }
      if (a.kind !== 'tele') {
        a.tick -= dt;
        if (a.tick <= 0) {
          a.tick = 0.25;
          if (a.owner === 'enemy') {
            if (!p.dead && dist(p.x, p.z, a.x, a.z) < a.r + p.r * 0.5 && (a.fy === undefined || Math.abs(a.fy - this.bodyY(p)) <= 1.5)) { if (this.damagePlayer(a.dps * 0.25, a.x, a.z, { area: true }) && a.venom) this.envenom(); if (a.slow) p.slowT = 0.5; }
          } else if (a.onTick) {
            this.forRadius(a.x, a.z, a.r, (e) => { if (this.isTarget(e)) a.onTick(e); });
          }
        }
      }
      if (a.t >= a.life) { list.splice(i, 1); if (a.end) a.end(); }
    }
  }

  // ---- summons ----
  updateSummons(dt) {
    const p = this.player, list = this.summons;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      s.t -= dt;
      if (s.t <= 0) { list.splice(i, 1); this.emit({ t: 'pickup', x: s.x, z: s.z, col: [0.6, 0.6, 0.7] }); continue; }
      if (s.buffT > 0) s.buffT -= dt;
      s.cd -= dt * (s.buffT > 0 ? s.buffSpeed : 1);
      const range = s.shot.shotRange;
      if (s.kind === 'drone') {
        s.orbit += dt * 1.6;
        const home = s.anchor || p, tx = home.x + Math.cos(s.orbit) * 2.2, tz = home.z + Math.sin(s.orbit) * 2.2; // Picket: a fixed home
        s.x += (tx - s.x) * Math.min(1, dt * 6); s.z += (tz - s.z) * Math.min(1, dt * 6);
        if (s.fy !== undefined) s.fy += (this.bodyY(p) - s.fy) * Math.min(1, dt * 6);
      }
      if (s.cd > 0) continue;
      if (s.kind === 'healer') {
        s.cd = 0.5; this.heal(p.maxHp * 0.01);
        continue;
      }
      // A sentry holds its lane: range 18 m, 0.9 rad either side of its facing. Drones have no lane,
      // and answer an Order only when no sentry covers it.
      // They aim in three dimensions (doc 64 Package 9): a body aloft is in range by its true
      // distance from the gun, and only with a clear line to its height. Ground bodies as before.
      const gy = this.summonGunY(s);
      const inLane = (e) => (s.lane === null || Math.abs(angleDiff(s.lane, Math.atan2(e.z - s.z, e.x - s.x))) <= s.shot.halfArc)
        && (!this.aloft(e) || Math.hypot(e.x - s.x, this.aimHeightOf(e) - gy, e.z - s.z) < range);
      const answers = (e) => this.answersOrder(s, e);
      // Priority: an Order it answers, then a Mark, then the nearest (doc 18, Summoner kit).
      const tgt = this.nearestTarget(s.x, s.z, range, (e) => inLane(e) && answers(e), true, gy)
        || this.nearestTarget(s.x, s.z, range, (e) => inLane(e) && e.st.markT > 0, true, gy) || this.nearestTarget(s.x, s.z, range, inLane, true, gy);
      if (!tgt) { s.cd = 0.15; continue; }
      s.face = Math.atan2(tgt.z - s.z, tgt.x - s.x);
      s.cd = s.shot.shotInterval;
      const col = CLASSES[p.classId].color;
      this.emit({ t: 'tracer', x: s.x, y: gy, z: s.z, x2: tgt.x, y2: this.aimHeightOf(tgt), z2: tgt.z, col, life: 0.06, w: 0.05, k: 4 });
      this.sfx('sentry', s.x, s.z);
      // A Mark or an answered Order gives +40%, read at contact. The Mark is a Brand and is consumed;
      // only the Order also bursts, and only for its first shot.
      const marked = tgt.st.markT > 0, ordered = answers(tgt);
      this.playerHit(tgt, s.shot.damage * (marked || ordered ? s.shot.markMul : 1) * s.pow, 'summon', { m2: s.kind === 'sentry', spend: marked ? 'mark' : null });
      if (marked) { tgt.st.markT = 0; this.consume(tgt); }
      if (ordered) {
        this.payoff('order');
        tgt.st.orderT = 0;
        this.emit({ t: 'explode', x: tgt.x, z: tgt.z, r: s.shot.orderRadius, col: ORDER_COL, shake: 0.05 });
        this.forRadius(tgt.x, tgt.z, s.shot.orderRadius, (o) => { if (o !== tgt && this.isTarget(o)) this.playerHit(o, s.shot.orderBurst, 'summon', { noProc: true }); }, this.around(tgt));
      }
    }
  }

  updatePickups(dt) {
    const p = this.player, list = this.pickups;
    if (p.dead) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const k = list[i];
      k.t += dt;
      // Cargo on the floor is taken by hand, after a fit preview (findInteract).
      if (k.item) continue;
      // A medkit with nowhere to go stays put.
      const room = k.kind !== 'med' || this.medRoom();
      const d = dist(k.x, k.z, p.x, p.z);
      // Nothing is drawn up or down a terrace edge: only what lies on the operator's level.
      if (k.fy !== undefined && !this.sameLevel(k, p)) continue;
      if (room && d < p.magnet * (k.kind === 'xp' ? 1.3 : 1) && k.t > 0.3) {
        const pull = Math.min(d, dt * (k.kind === 'xp' ? 16 : 9));
        k.x += (p.x - k.x) / (d || 1) * pull; k.z += (p.z - k.z) / (d || 1) * pull;
        if (k.fy !== undefined) k.fy = this.world.floorAt(k.x, k.z);
      }
      if (d > 1.1 || k.t < 0.3 || !room) continue;
      list.splice(i, 1);
      if (k.kind === 'xp') { this.fireSkillEvent('shard'); this.addXp(k.amount); this.emit({ t: 'pickup', x: k.x, z: k.z, col: k.col, small: true }); this.sfx('xp'); continue; }
      this.emit({ t: 'pickup', x: k.x, z: k.z, col: k.col || RARITY[k.rarity].color });
      this.sfx('pickup');
      if (k.kind === 'item') this.giveItem(k.id);
      else if (k.kind === 'med') this.stowMedkit();
      else if (k.kind === 'sample') { this.samples++; this.toast('Lab Sample +1', '#c79bff', 'sample'); }
      else if (k.kind === 'core') { this.cores++; this.toast('Boss Core +1', '#ff9a4a', 'core'); }
    }
  }

  // Damage over time ticks at 4 Hz on the shared status layer (doc 04, section 4).
  updateDots(dt) {
    this.dotT -= dt;
    if (this.dotT > 0) return;
    this.dotT = 0.25;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const st = e.st;
      // Venom is non-lethal; plague (Wither) and an item's bleed can kill. Ticks start nothing.
      if (st.venom > 0) this.playerHit(e, st.venom * VENOM_DPS * 0.25, 'dot', { nonLethal: true });
      if (st.plagueT > 0 && !e.dead) this.playerHit(e, st.plagueDps * 0.25, 'dot', { skill: true });
      if (st.bleedT > 0 && !e.dead) this.playerHit(e, st.bleedDps * 0.25, 'dot');
    }
  }

  // ---- spawn director (doc 03, section 6) ----
  updateDirector(dt) { updateHorde(this, dt); }

  // ---- interaction (hold E) ----
  progress(id, n = 1) {
    const c = this.contracts.find((k) => k.id === id);
    if (!c || c.have >= c.need) return;
    c.have = Math.min(c.need, c.have + n);
    if (c.have >= c.need) { this.toast(message('Contract ready: {contract} (pays on extraction)', { contract: message(c.label) }), '#8fffb0', 'complete'); this.sfx('contract'); }
  }

  findInteract() {
    const p = this.player, w = this.world;
    let best = null, bd = 2.3;
    // Every block within reach, not only the one the operator stands in: a container or an
    // exit just across a block line must still answer.
    const near = [];
    for (const [ox, oz] of [[0, 0], [-7, 0], [7, 0], [0, -7], [0, 7], [-7, -7], [7, -7], [-7, 7], [7, 7]]) { const b = w.blockIndex(p.x + ox, p.z + oz); if (!near.includes(b)) near.push(b); }
    // A take that cannot fit ranks behind everything else, so a full pack never hides a
    // search or a piece that would fit.
    let rank = Infinity;
    const consider = (d, offer) => { const r = d + (offer.ok === false ? 50 : 0); if (r < rank) { rank = r; best = offer; if (offer.ok !== false) bd = d; } };
    // With height nothing is worked from another level: no searching a terrace from below.
    const H = w.hasHeight, py = H ? this.bodyY(p) : 0, level = (x, z) => !H || Math.abs(w.floorAt(x, z) - py) <= 1.5;
    for (const bi of near) for (const c of w.blocks[bi].containers) {
      const st = this.cont[c.id];
      const d = dist(c.x, c.z, p.x, p.z);
      if (d >= 2.3 || !level(c.x, c.z)) continue;
      if (!st.opened) consider(d, { key: 'cont' + c.id, type: 'container', c, st, ...containerPrompt(c, st, p.searchRate) });
      else if (st.items && st.items.length) consider(d, this.takeOffer('take' + c.id, st, st.items));
    }
    for (const k of this.pickups) {
      if (!k.item) continue;
      const d = dist(k.x, k.z, p.x, p.z);
      if (d < 1.8 && (k.fy === undefined || this.sameLevel(k, p))) consider(d, k.kind === 'pack' ? this.swapOffer(k) : this.takeOffer('floor' + k.id, k, [k.item], k));
    }
    const door = doorInteract(this);
    if (door && door.dist < bd) { bd = door.dist; best = door; }
    // A job is worked from beside a van or a mast, so it reaches a little further than a drawer.
    const job = jobInteract(this);
    if (job && job.dist - JOB_REACH < bd) { bd = Math.max(0, job.dist - JOB_REACH); best = job; }
    for (const bi of near) for (const poi of w.blocks[bi].pois) {
      const st = this.poi[poi.id];
      const d = dist(poi.x, poi.z, p.x, p.z);
      const reach = poi.type === 'extract' || poi.type === 'boss' || poi.type === 'deploy' ? poi.r : poi.type === 'broker' ? 3.2 : 2.3;
      if (d > reach || (st.used && poi.type !== 'broker') || poi.type === 'nest' || !level(poi.x, poi.z)) continue;
      if (d >= bd && poi.type !== 'extract' && poi.type !== 'boss' && poi.type !== 'deploy') continue;
      let label = '', need = 1, ok = true;
      switch (poi.type) {
        case 'cache': {
          need = 0.6; ok = p.credits >= this.cachePrice;
          label = message(ok ? 'Supply Cache: {cost} Credits' : 'Supply Cache: {cost} Credits (not enough)', { cost: this.cachePrice });
          break;
        }
        case 'shrine': label = 'Signal Shrine: pay 25% health for an item'; need = 0.8; ok = p.hp > p.maxHp * 0.1; break;
        case 'terminal': label = 'Hack Intel Terminal (loud)'; need = 8 / p.hackRate; break;
        case 'broker': {
          const value = this.sellableValue();
          need = 0.6; ok = value > 0;
          label = ok ? message('Broker: sell salvage for {credits} Credits', { credits: Math.round(value * BROKER_SHARE) }) : 'Broker: nothing to sell';
          break;
        }
        case 'extract': {
          // A marked exit is a destination, not permission to leave (doc 34): each states its condition.
          const ex = exitInfo(this, poi);
          if (!ex.open) {
            if (ex.flare && d < 3.5) { bd = Math.min(bd, d); best = flareInteract(this, poi); continue; }
            label = message('{name}: {cond}', { name: message(poi.name), cond: message(ex.cond) }); need = EXTRACT_TIME; ok = false; break;
          }
          label = this.boss && this.boss.active ? 'Extraction blocked during the fight' : message('Extract: {name}', { name: message(poi.name) }); need = EXTRACT_TIME; ok = !(this.boss && this.boss.active) && !(this.script && this.script.blockExtract); break;
        }
        case 'boss': label = message('Awaken: {name}', { name: message(poi.name) }); need = 3; break;
        // The Command Hub (hubworld.js): staff answer at once, the lift takes a held second.
        case 'station': label = message('Talk: {name}', { name: message(poi.name) }); need = 0.12; break;
        case 'deploy': ok = !this.deployBlock; label = ok ? message('Deploy: {where}', { where: message(this.deployLabel || 'Meridian South Sector') }) : message(this.deployBlock); need = 1.4; break;
        default: continue;
      }
      bd = Math.min(bd, d);
      best = { key: poi.type + poi.id, type: poi.type, poi, st, need, label, ok };
    }
    return best;
  }
  sellableValue() { let v = 0; for (const i of this.player.inv) if (i.kind === 'loot') v += i.value; return v; }

  // ---- field pack (docs 61, 64 package 4) ----
  initPack(pack) {
    const p = this.player;
    p.pack = pack ? { ...pack } : issuePack();
    this.packOut = p.pack.starter ? null : p.pack.uid;   // the pack that left the hub
    this.cargoSeq = 0;
    p.pockets = [];
    for (let i = 0; i < POCKETS; i++) p.pockets.push(i < p.medkits ? this.medkit() : null);
    this.reweigh();
  }
  medkit() { return { uid: `med${this.cargoSeq++}`, kind: 'med', name: 'Medkit' }; }
  reweigh() {
    const p = this.player;
    p.kg = loadKg(p.pack, p.inv, p.pockets);
    p.loadMul = speedMul(p.kg, p.freeKg);
    p.medkits = p.pockets.filter((m) => m && m.kind === 'med').length;
  }
  // Walking speed with this much extra weight: what a take or a swap would leave.
  loadedSpeed(extraKg = 0) { const p = this.player; return p.speed * speedMul(p.kg + extraKg, p.freeKg); }
  medRoom() { const p = this.player; return p.pockets.includes(null) || !!findSpot(p.pack, occupancy(p.pack, p.inv), { kind: 'med' }); }
  // A medkit goes to a free quick pocket, or deep in the pack where it must be moved before use.
  stowMedkit(med = this.medkit()) {
    const p = this.player, i = p.pockets.indexOf(null);
    if (i >= 0) { p.pockets[i] = med; this.reweigh(); this.toast(controlHint('Medkit +1 (press 1)', 'Medkit +1'), '#7dffa0', 'medkit'); return true; }
    if (!this.addInv(med)) return false;
    this.toast('Medkit packed: move it to a quick pocket to use it', '#7dffa0', 'medkit');
    return true;
  }
  useMedkit() {
    const p = this.player, i = p.pockets.findIndex((m) => m && m.kind === 'med');
    if (i >= 0) p.pockets[i] = null;
    this.reweigh();
  }
  cargoName(it) {
    return it.kind === 'gear' && it.unid ? message('Sealed {quality} equipment', { quality: message(RARITY[it.rarity].name) }) : message(it.name);
  }
  floorKind(it) { return it.kind === 'gear' ? 'gear' : it.kind === 'pack' ? 'pack' : 'loot'; }
  // Pack a piece or leave it on the floor where it stood; the prompt then says why.
  stow(item, x, z) {
    if (this.addInv(item)) return true;
    this.dropPickup(this.floorKind(item), x, z, { item });
    this.toast(message('No room in the pack: {item} left on the floor', { item: this.cargoName(item) }), '#ffb86a', 'warning');
    return false;
  }
  // Fit preview for taking pieces, most valuable first by public worth.
  takePlan(items) {
    const p = this.player, list = items.filter((i) => i.kind !== 'pack').sort((a, b) => worth(b) - worth(a));
    const plan = planFit(p.pack, p.inv, list), fit = plan.filter((e) => e.at);
    const kg = fit.reduce((a, e) => a + weight(e.item), 0);
    return { plan, fit, kg, speed: this.loadedSpeed(kg) };
  }
  takeOffer(key, st, items, pickup = null) {
    const P = this.takePlan(items), n = P.fit.length, m = P.plan.length;
    const one = m === 1 ? P.plan[0].item : null, f = one && footprint(one), speed = P.speed.toFixed(1), kg = P.kg.toFixed(1);
    const label = n === 0
      ? (one ? message('No room in the pack for {item} ({w}x{h})', { item: this.cargoName(one), w: f.w, h: f.h }) : message('No room in the pack: {count} pieces left here', { count: m }))
      : one ? message('Take {item} · +{kg} kg · {speed} m/s', { item: this.cargoName(one), kg, speed })
      : n === m ? message('Take {count} pieces · +{kg} kg · {speed} m/s', { count: n, kg, speed })
      : message('Take {count} of {total} · +{kg} kg · {speed} m/s · no room for the rest', { count: n, total: m, kg, speed });
    // `want` is the best public worth that does not fit: a reason to make room.
    const want = P.plan.filter((e) => !e.at).reduce((a, e) => Math.max(a, worth(e.item)), 0);
    return { key, type: 'take', st, need: 0.35, label, ok: n > 0, items, pickup, want };
  }
  // Swapping packs: pieces keep their place where the new grid allows, then take the first
  // free spot; what is left over stays on the floor with the old pack.
  swapPlan(pack) {
    const p = this.player, g = new Uint8Array(pack.w * pack.h), all = [];
    for (const it of p.inv) if (it.at && fitsAt(pack, g, it, it.at.x, it.at.y, it.at.r)) { mark(pack, g, it, it.at); all.push({ item: it, at: it.at }); }
    for (const it of p.inv) {
      if (all.some((e) => e.item === it)) continue;
      const at = findSpot(pack, g, it);
      if (at) mark(pack, g, it, at);
      all.push({ item: it, at });
    }
    const left = all.filter((e) => !e.at), kg = loadKg(pack, all.filter((e) => e.at).map((e) => e.item), p.pockets);
    return { all, left, kg, speed: p.speed * speedMul(kg, p.freeKg) };
  }
  swapOffer(k) {
    const S = this.swapPlan(k.item), total = this.player.inv.length;
    const label = message('Swap to the {w}x{h} pack · {moved} of {total} pieces move · {speed} m/s', { w: k.item.w, h: k.item.h, moved: total - S.left.length, total, speed: S.speed.toFixed(1) });
    return { key: 'swap' + k.id, type: 'swap', st: k, need: 1.0, label, ok: true, pickup: k };
  }
  removePickup(k) { const i = this.pickups.indexOf(k); if (i >= 0) this.pickups.splice(i, 1); }
  // Take pieces from a searched container or the floor. `only` limits it to one piece and
  // `at` asks for a place (the bag screen); otherwise the take plan decides.
  take(items, pickup = null, only = null, at = null) {
    let taken = 0;
    if (only) { if (this.addInv(only, at)) taken = 1; }
    else for (const e of this.takePlan(items).fit) if (this.addInv(e.item, e.at)) taken++;
    if (!taken) return 0;
    for (let i = items.length - 1; i >= 0; i--) if (items[i].at) items.splice(i, 1);
    if (pickup && !items.length) this.removePickup(pickup);
    this.sfx('pickup');
    const left = items.filter((i) => i.kind !== 'pack').length;
    if (left && !only) this.toast(message('No room for {count} more: left here', { count: left }), '#ffb86a', 'warning');
    return taken;
  }
  swapPack(k) {
    const p = this.player, old = p.pack, S = this.swapPlan(k.item);
    this.removePickup(k);
    p.pack = { ...k.item };
    p.inv = S.all.filter((e) => e.at).map((e) => { e.item.at = { ...e.at }; return e.item; });
    for (const e of S.left) { delete e.item.at; this.dropPickup(this.floorKind(e.item), p.x, p.z, { item: e.item }); }
    this.dropPickup('pack', p.x, p.z, { item: old });
    this.reweigh();
    this.sfx('pickup');
    this.toast(message('Now carrying the {w}x{h} pack', { w: p.pack.w, h: p.pack.h }), '#ffd76a', 'carry');
  }

  // ---- bag screen actions: the HUD calls these between steps; all deterministic ----
  findCargo(uid) {
    const p = this.player;
    const i = p.inv.findIndex((it) => it.uid === uid);
    if (i >= 0) return { item: p.inv[i], where: 'inv', i };
    const j = p.pockets.findIndex((it) => it && it.uid === uid);
    return j >= 0 ? { item: p.pockets[j], where: 'pocket', i: j } : null;
  }
  // Move a carried piece to a grid cell, turned or not.
  bagMove(uid, x, y, r = 0) {
    const p = this.player, f = this.findCargo(uid);
    if (!f) return false;
    if (!fitsAt(p.pack, occupancy(p.pack, p.inv, f.item), f.item, x, y, r)) return false;
    if (f.where === 'pocket') { p.pockets[f.i] = null; p.inv.push(f.item); }
    f.item.at = { x, y, r };
    this.reweigh();
    return true;
  }
  // Quick pockets hold medkits only: that is what key 1 reaches for.
  bagPocket(uid, slot) {
    const p = this.player, f = this.findCargo(uid);
    if (!f || f.item.kind !== 'med' || slot < 0 || slot >= POCKETS || p.pockets[slot]) return false;
    if (f.where === 'inv') { p.inv.splice(f.i, 1); delete f.item.at; } else p.pockets[f.i] = null;
    p.pockets[slot] = f.item;
    this.reweigh();
    return true;
  }
  bagDrop(uid) {
    const p = this.player, f = this.findCargo(uid);
    if (!f) return false;
    if (f.where === 'inv') p.inv.splice(f.i, 1); else p.pockets[f.i] = null;
    delete f.item.at;
    if (f.item.kind === 'med') this.dropPickup('med', p.x, p.z);
    else this.dropPickup(this.floorKind(f.item), p.x, p.z, { item: f.item });
    this.reweigh();
    return true;
  }
  // Searched containers and floor cargo within reach, for the bag screen.
  nearby() {
    const p = this.player, w = this.world, out = [];
    for (const c of w.blocks[w.blockIndex(p.x, p.z)].containers) {
      const st = this.cont[c.id];
      if (st.opened && st.items && st.items.length && dist(c.x, c.z, p.x, p.z) < 2.3) for (const item of st.items) out.push({ ref: 'c' + c.id, item, items: st.items, pickup: null });
    }
    for (const k of this.pickups) if (k.item && dist(k.x, k.z, p.x, p.z) < 2.3) out.push({ ref: 'f' + k.id, item: k.item, items: [k.item], pickup: k });
    return out;
  }
  bagTake(ref, uid, at = null) {
    const n = this.nearby().find((e) => e.ref === ref && e.item.uid === uid);
    if (!n) return false;
    if (n.item.kind === 'pack') { this.swapPack(n.pickup); return true; }
    // A chosen cell is a request, not a hint: refuse rather than pack it somewhere else.
    const p = this.player;
    if (at && !fitsAt(p.pack, occupancy(p.pack, p.inv), n.item, at.x, at.y, at.r)) return false;
    return this.take(n.items, n.pickup, n.item, at) > 0;
  }
  cheapestCargo() { let best = null; for (const it of this.player.inv) if (!best || worth(it) < worth(best)) best = it; return best; }
  atBroker() {
    const p = this.player, w = this.world;
    return w.blocks[w.blockIndex(p.x, p.z)].pois.some((poi) => poi.type === 'broker' && dist(poi.x, poi.z, p.x, p.z) <= 3.2);
  }
  // The street broker pays 80% of a piece's public bid in raid Credits (doc 64).
  brokerPrice(it) { return Math.round(worth(it) * BROKER_SHARE); }
  brokerSell(uid, quiet = false) {
    const p = this.player, f = this.findCargo(uid);
    if (!f || f.where !== 'inv' || f.item.kind === 'med' || (!quiet && !this.atBroker())) return 0;
    const credits = this.brokerPrice(f.item);
    p.inv.splice(f.i, 1);
    p.credits += credits;
    this.reweigh();
    if (!quiet) { this.toast(message('Broker paid {credits} Credits (at risk until you extract)', { credits }), '#ffd76a', 'credits'); this.sfx('coin'); }
    return credits;
  }

  updateInteract(dt, input) {
    const p = this.player;
    if (p.dead || p.hidden) { this.prompt = null; return; }
    const it = this.findInteract();
    this.holding = false;
    if (!it) { this.prompt = null; this.resetInteract(); return; }
    if (this.interactKey !== it.key) { this.resetInteract(); this.interactKey = it.key; this.interactRef = it.st; }
    const can = it.ok !== false;
    // A take or a swap waits for a fresh press of E after the last interaction, so the
    // preview (what fits, the added weight, the loaded speed) is read first (doc 61).
    if (!input.interact) this.interactHold = false;
    const fresh = !this.interactHold || (it.type !== 'take' && it.type !== 'swap' && it.type !== 'station');
    if (input.interact && can && fresh) {
      // Reinforcements pause while the operator is committed to an interaction.
      this.holding = true;
      this.interactT += dt;
      if (it.type === 'terminal' && Math.floor(this.interactT) !== Math.floor(this.interactT - dt)) this.noise(p.x, p.z, 22);
      if (it.onHold) it.onHold(dt, this.interactT);
      if (it.type === 'extract' && this.interactT - dt <= 0) this.sfx('extract');
    } else this.interactT = Math.max(0, this.interactT - dt * 2);
    it.st.progress = clamp(this.interactT / it.need, 0, 1);
    this.prompt = { label: it.label, progress: it.st.progress, ok: can, type: it.type, want: it.want || 0, uids: it.items ? it.items.map((i) => i.uid) : null };
    if (this.interactT >= it.need) { this.completeInteract(it); this.resetInteract(); this.interactHold = true; }
  }
  resetInteract() {
    if (this.interactRef) this.interactRef.progress = 0;
    this.interactKey = null; this.interactRef = null; this.interactT = 0;
  }

  completeInteract(it) {
    const p = this.player, rl = this.rLoot;
    switch (it.type) {
      case 'container': this.openContainer(it.c, it.st); break;
      case 'take': this.take(it.items, it.pickup); break;
      case 'swap': this.swapPack(it.pickup); break;
      case 'cache': {
        p.credits -= this.cachePrice;
        this.cachePrice = Math.round(this.cachePrice * 1.35);
        it.st.used = true;
        this.giveItem(rollRunItem(rl, this.quality(it.poi.zone)));
        this.emit({ t: 'pickup', x: it.poi.x, z: it.poi.z, col: [0.2, 0.9, 1] });
        break;
      }
      case 'shrine': {
        // Blood Shrine: 25% of current health for an Enhanced-or-better item, plus a small burst.
        it.st.used = true;
        p.hp = Math.max(1, p.hp * 0.75);
        this.emit({ t: 'hurt', amount: 5, angle: 0 });
        this.giveItem(rollRunItem(rl, this.quality(it.poi.zone), 1));
        this.spawnWave(3, { near: it.poi, rmin: 10, rmax: 18 });
        break;
      }
      case 'terminal': {
        it.st.used = true;
        this.intel++;
        this.progress('intel');
        this.stow({ uid: `intel${it.poi.id}`, kind: 'loot', name: 'Intel Shard', value: Math.round(120 * (1 + 0.1 * it.poi.zone)) }, it.poi.x, it.poi.z);
        let revealed = 0;
        for (const e of this.world.extractions) if (e && !this.poi[e.id].known) { this.poi[e.id].known = true; revealed++; }
        revealJobs(this);   // the terminal also lists who is asking for help
        this.relay(revealed ? 'Relay: Terminal cracked. All extraction points are on your map. Contacts inbound.' : 'Relay: Intel secured. Contacts inbound.');
        this.spawnWave(rl.irange(3, 6), { near: it.poi });
        this.sfx('contract');
        break;
      }
      case 'broker': {
        // Proceeds are raid Credits, at risk until extraction: the broker is not a second exit (doc 60).
        let credits = 0;
        for (const i of p.inv.filter((k) => k.kind === 'loot')) credits += this.brokerSell(i.uid, true);
        this.toast(message('Broker paid {credits} Credits (at risk until you extract)', { credits }), '#ffd76a', 'credits');
        this.sfx('coin');
        break;
      }
      case 'extract': this.jobs.exit = it.poi.name; this.finish('extracted'); break;
      case 'job': completeJobInteract(this, it); break;
      case 'flare': fireFlare(this); break;
      case 'boss': it.st.used = true; startBoss(this); break;
      case 'station': this.emit({ t: 'station', id: it.poi.station }); break;
      case 'deploy': this.emit({ t: 'deploy' }); break;
      case 'door': completeDoor(this, it); break;
      case 'window': breakWindow(this, it.win); break;
      default: break;
    }
  }

  openContainer(c, st) {
    const p = this.player, rl = this.rLoot;
    st.opened = true;
    this.searched++;
    this.progress('search');
    this.noise(c.x, c.z, 7);
    this.sfx('open', c.x, c.z);
    takeKey(this, c);
    const Z = ZONES[Math.max(c.zone, 0)];
    if (this.script && this.script.onContainer && this.script.onContainer(this, c)) return;
    if (st.host) {
      // Hosts belong to the enemy: opening one triggers an ambush (doc 08, R-11).
      this.toast('HOST! The container was colonised.', '#b6ff5a', 'host');
      this.emit({ t: 'explode', x: c.x, z: c.z, r: 2.5, col: [0.5, 1, 0.3], shake: 0.25 });
      const kinds = [];
      for (let i = 0; i < rl.irange(2, 3); i++) kinds.push(rl.pick(['walker', 'skitter', 'walker']));
      this.spawnPack(c.x, c.z, kinds, { state: 'revealing', spread: 3, noElite: true });
    }
    // Contents: sellables, sometimes gear, credits, the odd medkit. Cargo waits in the
    // container until it is taken; what does not fit stays there (doc 61). Small
    // containers and vehicle compartments roll their own tables.
    st.items = [];
    radioIn(this, c, st);
    if (kindContents(this, c, st)) {
      if (st.items.length) this.toast(message('Searched: {count} pieces inside', { count: st.items.length }), '#cfd8e0', 'loot');
      return;
    }
    const count = 1 + (rl.chance(0.3) ? 1 : 0) + (st.host ? 1 : 0) + (st.locked ? 1 : 0);
    for (let i = 0; i < count; i++) st.items.push(rollSellable(rl, c.zone, 0.4 + 0.12 * Z.loot));
    const gearChance = (st.locked ? 0.3 : 0.14) * (0.8 + 0.2 * Z.loot);
    if (rl.chance(gearChance)) st.items.push(rollGear(rl, { tier: this.tier, zone: c.zone, nl: this.nl, source: 'container' }));
    if (rl.chance(0.5)) { const cr = this.addCredits(rl.irange(6, 14) * (1 + 0.3 * c.zone)); this.toast(message('+{count} Credits', { count: cr }), '#7fe9ff', 'credits'); }
    if (rl.chance(0.1)) { const med = this.medkit(); if (!this.stowMedkit(med)) st.items.push(med); }
    if (st.host && rl.chance(0.6)) { this.samples++; this.toast('Lab Sample +1', '#c79bff', 'sample'); }
    // A found pack sets down beside the container, its grid and weight in plain view.
    if (rl.chance(DRONE_FIND * (1 + 0.3 * c.zone))) st.items.push(droneCase(rl));
    if (rl.chance(PACK_CHANCE)) this.dropPickup('pack', c.x, c.z, { item: packItem(rl, rl.chance(0.25 + 0.1 * c.zone) ? 'ranger' : 'patrol') });
    if (st.items.length) this.toast(message('Searched: {count} pieces inside', { count: st.items.length }), '#cfd8e0', 'loot');
  }

  // Nests start their wave when the player walks in (doc 17, section 4).
  checkNests() {
    const p = this.player, w = this.world;
    for (const poi of w.blocks[w.blockIndex(p.x, p.z)].pois) {
      if (poi.type !== 'nest') continue;
      const st = this.poi[poi.id];
      if (st.used) continue;
      if (!st.active && dist(p.x, p.z, poi.x, poi.z) < poi.r) {
        st.active = true;
        const g = `nest${poi.id}`;
        this.groups[g] = { alive: 0 };
        this.banner('NEST CLEARING', 'Kill everything that crawls out.', '#ff4d9a');
        const zm = ZONES[poi.zone].mimics;
        const kinds = [];
        for (let i = 0; i < 7; i++) kinds.push(this.rSpawn.pick(zm));
        this.spawnPack(poi.x, poi.z + 5, kinds, { state: 'revealing', spread: 9, group: g, noElite: true });
        this.spawnPack(poi.x, poi.z - 5, ['brute'], { state: 'revealing', spread: 3, group: g, elite: this.rollAffixes() });
      } else if (st.active && this.groups[`nest${poi.id}`].alive <= 0) {
        st.used = true; st.active = false;
        this.toast('Nest cleared', '#ff8ac0', 'complete');
        this.dropPickup('gear', poi.x + 3, poi.z + 3, { item: rollGear(this.rLoot, { tier: this.tier, zone: poi.zone, nl: this.nl, source: 'elite' }) });
        this.dropPickup('sample', poi.x + 4, poi.z + 2);
        this.dropPickup('sample', poi.x + 2, poi.z + 4);
        this.dropPickup('item', poi.x + 4, poi.z + 4, { id: rollRunItem(this.rLoot, this.quality(poi.zone), 1) });
      }
    }
  }

  // ---- choices (boss cache) ----
  offerChoice(title, ids, onPick) {
    this.choice = { title, ids, onPick };
    this.emit({ t: 'choice' });
  }
  pickChoice(i) {
    const c = this.choice;
    if (!c) return;
    this.choice = null;
    c.onPick(c.ids[i]);
  }

  // ---- end of raid ----
  finish(outcome) {
    if (this.over) return;
    const p = this.player;
    this.over = true;
    p.dead = outcome !== 'extracted';
    const value = this.carryValue();
    const extracted = outcome === 'extracted';
    // Extraction Bonus = V x (0.05 x Zmax + 0.25 x NL at exit) (doc 19, section 4).
    const bonus = extracted ? Math.round(value * (0.05 * this.zmax + 0.25 * this.nl)) : 0;
    const payMul = (1 + 0.1 * this.zmax) * (1 + 0.15 * (this.tier - 1)) * (1 + this.gear.credits / 100);
    let contractPay = 0;
    if (extracted) for (const c of this.contracts) if (c.have >= c.need) contractPay += Math.round(100 * payMul);
    // Cargo goes home without its grid place; medkits are raid supplies and stay behind.
    // Extracting brings the pack, its cargo and the Credits (converted once); any other ending
    // freezes the cargo for an assigned drone and loses the pack (doc 62).
    const cargo = p.inv.filter((i) => i.kind !== 'med').map(({ at, ...it }) => it);
    this.result = {
      mode: this.mode, outcome, tier: this.tier, classId: p.classId,
      value, bonus, contractPay, bossCash: extracted ? this.bossCash : 0,
      credits: p.credits, creditCash: extracted ? Math.floor(p.credits * CREDIT_CASH) : 0, drone: this.drone, taken: Math.round(this.taken),
      penalty: this.civKills * 50, inv: extracted ? cargo : [], cargo: extracted ? [] : cargo, lost: extracted ? 0 : cargo.length,
      pack: extracted ? { ...p.pack } : null, packOut: this.packOut,
      samples: extracted ? this.samples : 0, cores: extracted ? this.cores : 0, bossKilled: extracted && this.bossKilled,
      kills: this.kills, elites: this.elites, civKills: this.civKills, items: p.itemCount, level: p.level,
      // Class experience is earned on any ending, a boss killed before dying included (doc 64, Package 7).
      classXp: raidXp({ level: p.level, kills: this.kills, elites: this.elites, boss: this.bossKilled, extracted, jobs: this.jobs.xp }),
      signature: this.signatureDropped, payoffs: { ...this.payoffs }, exit: extracted ? this.jobs.exit : null, jobs: this.jobs.list.filter((j) => j.state === 'done' || j.state === 'failed').map((j) => ({ name: j.name, stars: j.stars, failed: j.state === 'failed' })),
      zmax: this.zmax, nl: this.nl, clock: this.clock, seconds: this.time, searched: this.searched,
      contracts: this.contracts.map((c) => ({ label: c.label, done: c.have >= c.need })),
    };
    this.emit({ t: 'over', outcome });
    this.sfx(extracted ? 'win' : 'lose');
  }
}

// Convenience wrapper so tests and the game share one stepping contract.
export function stepRaid(raid, dt, input) {
  raid.step(dt, input);
  if (raid.mode === 'raid' && !raid.over) raid.checkNests();
}
