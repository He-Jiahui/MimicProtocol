// Active kits keep doc 18's four slots and doc 24's shared resource. Distances are
// meters, times are seconds and bonus fractions are additive unless named Mul.
export const CHARGE = { max: 100, regen: 1.5, cost: 30, dodge: 20, consume: 6, consumeCap: 18, overdrive: 6 };

const slot = (key, behavior, name, desc, params) => ({ key, behavior, name, desc, params });
const markBurst = { markMul: 1.4, burstRadius: 2, burstDamage: 20 };
export const SUMMON_SHOTS = {
  sentry: { shotRange: 18, shotInterval: 0.3, damage: 9, ...markBurst },
  drone: { shotRange: 14, shotInterval: 0.26, damage: 7, ...markBurst },
};
const venom = { venomStacks: 5, venomTime: 6 };
const wither = { perStack: 0.2, ruptureStacks: 5, ruptureDamage: 40 };

export const SKILL_KITS = {
  rifleman: [
    slot('M1', 'burstRifle', 'Burst Rifle',
      'Builder. Three-round bursts. Each hit adds Suppression (max 3) and 4 Charge.',
      { interval: 0.42, gain: 4, shots: 3, spacing: 0.07, spread: 0.022,
        damage: 9, range: 46, brandCap: 3, brandTime: 4, noise: 18 }),
    slot('M2', 'piercingLine', 'Piercing Line',
      'Spender. Piercing shot that consumes Suppression: +25% damage per stack, ricochets at 3.',
      { cd: 2.5, cost: CHARGE.cost, damage: 46, range: 42, width: 0.7,
        perStack: 0.25, ricochetStacks: 3, ricochetRange: 13, ricochetMul: 1.2, noise: 24 }),
    slot('S', 'tacticalRoll', 'Tactical Roll',
      '5 m roll with invulnerability. Refunds 30% of M2 near suppressed enemies.',
      { cd: 5, distance: 5, duration: 0.26, iframes: 0.3, refundRange: 10, remainingMul: 0.7 }),
    slot('R', 'barrage', 'Suppressive Barrage',
      '4 s channel firing at the nearest enemies in a cone.',
      { cd: 40, duration: 4, moveMul: 0.5, interval: 0.08,
        seekRange: 28, halfArc: 0.75, spread: 0.2, damage: 11, range: 34, noise: 22 }),
  ],
  blade: [
    slot('M1', 'threeStrike', 'Three-Strike Combo',
      'Builder. Three melee hits, 9 Charge per enemy struck. The third applies Exposed.',
      { interval: 0.3, finisherInterval: 0.5, damage: 22, finisherDamage: 36,
        gain: 9, builderTargets: 2, range: 3.4, closeRange: 1.1, halfArc: 1.05,
        brandTime: 6, comboTime: 1.3, stepSpeed: 9, stepTime: 0.07, noise: 8 }),
    slot('M2', 'whirlSlash', 'Whirl Slash',
      'Spender. Spin that consumes Exposed: each refunds 15% of M2 and S.',
      { cd: 2, cost: CHARGE.cost, radius: 4.3, damage: 50, refund: 0.15, refundCap: 0.45, noise: 10 }),
    slot('S', 'lunge', 'Lunge Dash',
      '6 m dash through enemies. A hit starts the next combo at strike 2.',
      { cd: 4, distance: 6, duration: 0.18, iframes: 0.28, radius: 1.4, damage: 30, comboTime: 1.6 }),
    slot('R', 'execution', 'Execution',
      'Strike up to 5 Exposed targets in turn. Kills restore 5% health.',
      { cd: 45, markedRange: 18, range: 12, markedTargets: 5, targets: 3,
        delay: 0.12, spacing: 0.2, recover: 0.2, damage: 150, healFraction: 0.05 }),
  ],
  summoner: [
    slot('M1', 'markerGrenade', 'Marker Grenade',
      'Builder. Arcing grenade that Marks enemies for 5 s. 10 Charge on a hit.',
      { interval: 0.62, gain: 10, range: 22, flight: 0.42, radius: 3,
        damage: 26, targets: 5, brandTime: 5, noise: 14 }),
    slot('M2', 'deploySentry', 'Deploy Sentry',
      'Spender. Turret (max 2, 20 s). Its shots consume Mark for +40% and a burst.',
      { cd: 3, cost: CHARGE.cost, range: 12, limit: 2, duration: 20, ...SUMMON_SHOTS.sentry }),
    slot('S', 'tacticalHop', 'Tactical Hop',
      '4 m hop. Nearby sentries gain +40% attack speed for 3 s.',
      { cd: 5, distance: 4, duration: 0.22, iframes: 0.24, buffRange: 8, buffTime: 3, buffSpeed: 1.4 }),
    slot('R', 'hiveDrones', 'Hive Drones',
      '3 follower drones for 15 s.',
      { cd: 40, count: 3, duration: 15, ...SUMMON_SHOTS.drone }),
  ],
  toxic: [
    slot('M1', 'toxicSpit', 'Toxic Spit',
      'Builder. Short-range spit that applies Venom (max 5). 5 Charge per hit.',
      { interval: 0.3, gain: 5, spread: 0.04, speed: 32, range: 14, damage: 10, radius: 0.4, ...venom, noise: 9 }),
    slot('M2', 'witherCloud', 'Wither Cloud',
      'Spender. Lethal cloud, +20% per Venom stack. At 5 Venom it Ruptures the target.',
      { cd: 3, cost: CHARGE.cost, range: 16, flight: 0.4, radius: 4.5, duration: 5, dps: 14, ...wither }),
    slot('S', 'acidSlide', 'Acid Slide',
      '5 m slide leaving an acid pool that slows and applies Venom.',
      { cd: 5, distance: 5, duration: 0.3, iframes: 0.22,
        radius: 3, poolTime: 5, slowTime: 0.5, ticksPerStack: 2, ...venom }),
    slot('R', 'plagueBurst', 'Plague Burst',
      'Infection hops between up to 8 enemies.',
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
      returnCircuit: { name: 'Return Circuit', effects: [{ type: 'trigger', event: 'consume', action: 'charge', value: 2, icd: 1, id: 'returnCircuit' }] },
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
