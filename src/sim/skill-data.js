// Active kits keep doc 18's four slots; each class has its own resource (doc 64, Package 2).
// Distances are meters, times are seconds and bonus fractions are additive unless named Mul.
// Numbers the plan marks (start) are tuning guesses, not tested results.
export const CLASS_RESOURCE = {
  // Cells: one per 24 landed M1 rounds (start), no decay. A clean dodge pays 8 rounds.
  rifleman: { cells: 3, roundsPerCell: 24, dodgeRounds: 8, tickRounds: 4 },
  // Momentum: falls 25 a second after 2 s without a hit. A clean dodge pays 25.
  blade: { max: 100, decayDelay: 2, decay: 25, dodge: 25, tick: 5 },
  // Two carried sentries and a radio. A clean dodge readies the radio at once.
  summoner: { carried: 2, tick: 0.5 },
  // Venom lives on the host and has no meter. A clean dodge Venoms every hostile within 4 m.
  toxic: { dodgeRadius: 4, tickRange: 6 },
};
// A clean dodge also gives back this share of the S cooldown still running.
export const DODGE_REFUND = 0.4;

const slot = (key, behavior, name, desc, params) => ({ key, behavior, name, desc, params });
// Sentry and drone shots: +40% on a Marked or Ordered target; only an Order also bursts.
const callShot = { markMul: 1.4, orderBurst: 20, orderRadius: 2 };
export const SUMMON_SHOTS = {
  sentry: { shotRange: 18, shotInterval: 0.3, damage: 9, halfArc: 0.9, ...callShot },
  drone: { shotRange: 14, shotInterval: 0.26, damage: 7, ...callShot },
};
export const VENOM_DPS = 3; // per stack; Venom ticks at 4 Hz
const venom = { venomStacks: 5, venomTime: 6 };
const wither = { perStack: 0.2, ruptureMul: 0.7 };
// The Rifleman's mark burst: 20 x (1 + 0.25 x Suppression) within 2.5 m of the body.
const markBurst = { burstDamage: 20, burstPerStack: 0.25, burstRadius: 2.5 };

export const SKILL_KITS = {
  rifleman: [
    slot('M1', 'burstRifle', 'Burst Rifle',
      'Three-round bursts. Each hit adds Suppression (max 3); every 24 rounds that land load a cell (max 3).',
      { interval: 0.42, shots: 3, spacing: 0.07, spread: 0.022,
        damage: 9, range: 46, brandCap: 3, brandTime: 4, noise: 18 }),
    slot('M2', 'piercingLine', 'Piercing Line',
      'Piercing shot, +25% per Suppression stack. Each Suppressed body it hits bursts within 2.5 m. While it cools, spends a cell to fire at once.',
      { cd: 5, damage: 46, range: 42, width: 0.7, perStack: 0.25, ...markBurst, noise: 24 }),
    slot('S', 'tacticalRoll', 'Tactical Roll',
      '5 m roll with invulnerability. Refunds 30% of M2 near suppressed enemies.',
      { cd: 5, distance: 5, duration: 0.26, iframes: 0.3, refundRange: 10, remainingMul: 0.7 }),
    slot('R', 'barrage', 'Suppressive Barrage',
      '4 s channel firing at the nearest enemies in a cone. Takes every cell: each makes the next four rounds that strike a Suppressed body burst.',
      { cd: 40, duration: 4, moveMul: 0.5, interval: 0.08,
        seekRange: 28, halfArc: 0.75, spread: 0.2, damage: 11, range: 34, noise: 22, burstRounds: 4, ...markBurst }),
  ],
  blade: [
    slot('M1', 'threeStrike', 'Three-Strike Combo',
      'Three melee hits, +9 momentum per enemy struck (two a swing). The third applies Exposed and knocks a plate fragment loose beyond a fresh target.',
      { interval: 0.3, finisherInterval: 0.5, damage: 22, finisherDamage: 36,
        gain: 9, builderTargets: 2, range: 3.4, closeRange: 1.1, halfArc: 1.05,
        brandTime: 6, comboTime: 1.3, stepSpeed: 9, stepTime: 0.07, noise: 8,
        fragDistance: 1.5, fragLife: 6, fragMax: 3, fragBarrier: 0.15, fragBarrierTime: 4 }),
    slot('M2', 'whirlSlash', 'Whirl Slash',
      'Spin that spends all momentum to travel 1 to 6 m along your movement. Exposed bodies it hits are consumed, shoved 4 m and take 1.5x damage.',
      { cd: 4, radius: 4.3, damage: 50, travel: 1, travelPer: 5, duration: 0.2, exposedMul: 1.5, shove: 4, noise: 10 }),
    slot('S', 'lunge', 'Lunge Dash',
      '6 m dash through enemies. A hit starts the next combo at strike 2. Crossing a plate fragment, on foot or lunging, gives a barrier of 15% health for 4 s.',
      { cd: 4, distance: 6, duration: 0.18, iframes: 0.28, radius: 1.4, damage: 30, comboTime: 1.6 }),
    slot('R', 'execution', 'Execution',
      'Strike up to 5 Exposed targets in turn. Spends momentum for +0.5% damage a point. Kills restore 5% health.',
      { cd: 45, markedRange: 18, range: 12, markedTargets: 5, targets: 3,
        delay: 0.12, spacing: 0.2, recover: 0.2, damage: 150, healFraction: 0.05, momentumBonus: 0.005 }),
  ],
  summoner: [
    slot('M1', 'markerGrenade', 'Marker Grenade',
      'Arcing grenade that Marks enemies for 5 s. With the radio ready it also puts an Order on the hostile nearest the impact.',
      { interval: 0.62, range: 22, flight: 0.42, radius: 3,
        damage: 26, targets: 5, brandTime: 5, noise: 14, orderTime: 5, radioTime: 4 }),
    slot('M2', 'deploySentry', 'Deploy Sentry',
      'Post a carried sentry facing your aim (two carried). Within 2 m of a sentry, pack it; with none carried, recall the oldest, back in 4 s.',
      { cd: 3, range: 12, packRange: 2, recallTime: 4, duration: 20, ...SUMMON_SHOTS.sentry }),
    slot('S', 'tacticalHop', 'Tactical Hop',
      '4 m hop. Sentries within 8 m turn to your aim and gain +40% attack speed for 3 s.',
      { cd: 5, distance: 4, duration: 0.22, iframes: 0.24, buffRange: 8, buffTime: 3, buffSpeed: 1.4 }),
    slot('R', 'hiveDrones', 'Hive Drones',
      '3 follower drones for 15 s. They answer an Order no sentry covers.',
      { cd: 40, count: 3, duration: 15, ...SUMMON_SHOTS.drone }),
  ],
  toxic: [
    slot('M1', 'toxicSpit', 'Toxic Spit',
      'Short-range spit that applies Venom (max 5).',
      { interval: 0.3, spread: 0.04, speed: 32, range: 14, damage: 10, radius: 0.4, ...venom, noise: 9 }),
    slot('M2', 'witherCloud', 'Wither Cloud',
      'Lethal cloud, +20% per Venom stack. Its first tick on each Venomed host ruptures the Venom still to come into one burst.',
      { cd: 5, range: 16, flight: 0.4, radius: 4.5, duration: 5, dps: 14, ...wither }),
    slot('S', 'acidSlide', 'Acid Slide',
      '5 m slide leaving an acid pool that slows and applies Venom.',
      { cd: 5, distance: 5, duration: 0.3, iframes: 0.22,
        radius: 3, poolTime: 5, slowTime: 0.5, ticksPerStack: 2, ...venom }),
    slot('R', 'plagueBurst', 'Plague Burst',
      'Infection hops between up to 8 enemies, moving one of the first target\'s Venom stacks with each hop.',
      { cd: 45, aimRadius: 6, seekRange: 20, range: 26,
        duration: 6, dps: 18, hops: 8, hopTime: 0.5, hopRange: 12, ...venom,
        cloudRadius: 3, cloudTime: 3, cloudDps: 10, ...wither }),
  ],
};

// Optional compiler input, with no player-facing unlock yet. Selecting either
// upgrade includes the enhancement; a slot has room for only one upgrade ID.
export const SKILL_TUNING = {
  piercingLine: {
    enhancement: { name: 'Broad Aperture', effects: [{ type: 'param', slot: 'm2', key: 'width', add: 0.25 }] },
    upgrades: {
      longRail: { name: 'Long Rail', effects: [{ type: 'param', slot: 'm2', key: 'range', add: 8 }] },
      returnCircuit: { name: 'Return Circuit', effects: [{ type: 'trigger', event: 'consume', action: 'resource', value: 1, icd: 1, id: 'returnCircuit' }] },
    },
  },
};

// Design catalog only. These B variants need new behaviors before they can be
// equipped. Omitted values are unspecified in doc 18, not zero-valued defaults.
export const PLANNED_VARIANTS = {
  rifleman: {
    m2: { name: 'Rail Slug', desc: 'Charge one guaranteed weak-spot shot and spend all Suppression.', params: { windup: 0.6, weakSpotMul: 2 } },
    r: { name: 'Overwatch Mark', desc: 'Mark targets for delayed detonation.', params: { targets: 5, delay: 3 } },
  },
  blade: {
    m2: { name: 'Blade Cyclone', desc: 'Keep moving through the spin.', params: { damageMul: 0.6 } },
    r: { name: 'Phantom Blades', desc: 'Afterimages strike the nearest enemies without Exposed.', params: { images: 3, targets: 3, strikes: 2 } },
  },
  summoner: {
    m2: { name: 'Arc Pylon', desc: 'Link pylons and Marked enemies with chain lightning instead of shots.', params: {} },
    r: { name: 'Repair Swarm', desc: 'Drones repair the operator and sentries instead of attacking.', params: {} },
  },
  toxic: {
    m2: { name: 'Rot Mines', desc: 'Proximity mines release Wither clouds.', params: { mines: 3 } },
    r: { name: 'Epidemic Bloom', desc: 'A ground bloom infects every enemy in range.', params: { radius: 8, duration: 6 } },
  },
};
