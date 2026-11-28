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
        damage: 9, range: 46, brandCap: 3, brandTime: 4, noise: 18, roundsPerCell: CLASS_RESOURCE.rifleman.roundsPerCell }),
    // dischargeLength and dischargeWidth shape Line Discharge (tree); unused by the base shot.
    slot('M2', 'piercingLine', 'Piercing Line',
      'Piercing shot, +25% per Suppression stack. Each Suppressed body it hits bursts within 2.5 m. While it cools, spends a cell to fire at once.',
      { cd: 5, damage: 46, range: 42, width: 0.7, perStack: 0.25, ...markBurst, noise: 24, dischargeLength: 12, dischargeWidth: 1.2 }),
    // towardMul (within towardArc of a Suppressed enemy) equals remainingMul until a tree node changes it.
    slot('S', 'tacticalRoll', 'Tactical Roll',
      '5 m roll with invulnerability. Refunds 30% of M2 near suppressed enemies.',
      { cd: 5, distance: 5, duration: 0.26, iframes: 0.3, refundRange: 10, remainingMul: 0.7, towardMul: 0.7, towardArc: Math.PI / 3 }),
    slot('R', 'barrage', 'Suppressive Barrage',
      '4 s channel firing at the nearest enemies in a cone. Takes every cell: each makes the next four rounds that strike a Suppressed body burst.',
      { cd: 40, duration: 4, moveMul: 0.5, interval: 0.08,
        seekRange: 28, halfArc: 0.75, spread: 0.2, damage: 11, range: 34, noise: 22, burstRounds: 4, ...markBurst, pierce: 0 }),
  ],
  blade: [
    slot('M1', 'threeStrike', 'Three-Strike Combo',
      'Three melee hits, +9 momentum per enemy struck (two a swing). The third applies Exposed and knocks a plate fragment loose beyond a fresh target.',
      { interval: 0.3, finisherInterval: 0.5, damage: 22, finisherDamage: 36,
        gain: 9, builderTargets: 2, range: 3.4, closeRange: 1.1, halfArc: 1.05,
        brandTime: 6, comboTime: 1.3, stepSpeed: 9, stepTime: 0.07, noise: 8, soloGain: 0,
        fragDistance: 1.5, fragBehind: 2, fragLife: 6, fragMax: 3, fragBarrier: 0.15, fragBarrierTime: 4 }),
    slot('M2', 'whirlSlash', 'Whirl Slash',
      'Spin that spends all momentum to travel 1 to 6 m along your movement. Exposed bodies it hits are consumed, shoved 4 m and take 1.5x damage.',
      { cd: 4, radius: 4.3, damage: 50, travel: 1, travelPer: 5, duration: 0.2, exposedMul: 1.5, shove: 4, noise: 10 }),
    slot('S', 'lunge', 'Lunge Dash',
      '6 m dash through enemies. A hit starts the next combo at strike 2. Crossing a plate fragment, on foot or lunging, gives a barrier of 15% health for 4 s.',
      { cd: 4, distance: 6, duration: 0.18, iframes: 0.28, radius: 1.4, damage: 30, comboTime: 1.6, exposeTime: 0, missMul: 1 }),
    slot('R', 'execution', 'Execution',
      'Strike up to 5 Exposed targets in turn. Spends momentum for +0.5% damage a point. Kills restore 5% health.',
      { cd: 45, markedRange: 18, range: 12, markedTargets: 5, targets: 3,
        delay: 0.12, spacing: 0.2, recover: 0.2, damage: 150, healFraction: 0.05, momentumBonus: 0.005 }),
  ],
  summoner: [
    slot('M1', 'markerGrenade', 'Marker Grenade',
      'Arcing grenade that Marks enemies for 5 s. With the radio ready it also puts an Order on the hostile nearest the impact.',
      { interval: 0.62, range: 22, flight: 0.42, radius: 3,
        damage: 26, targets: 5, brandTime: 5, noise: 14, orderTime: 5, radioTime: 4, orders: 1 }),
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
      { interval: 0.3, spread: 0.04, speed: 32, range: 14, damage: 10, radius: 0.4, ...venom, noise: 9, dose: 1, splash: 0 }),
    slot('M2', 'witherCloud', 'Wither Cloud',
      'Lethal cloud, +20% per Venom stack. Its first tick on each Venomed host ruptures the Venom still to come into one burst.',
      { cd: 5, range: 16, flight: 0.4, radius: 4.5, duration: 5, dps: 14, ...wither, spreadRadius: 2.5 }),
    slot('S', 'acidSlide', 'Acid Slide',
      '5 m slide leaving an acid pool that slows and applies Venom.',
      { cd: 5, distance: 5, duration: 0.3, iframes: 0.22,
        radius: 3, poolTime: 5, slowTime: 0.5, ticksPerStack: 2, ...venom, landRadius: 0 }),
    slot('R', 'plagueBurst', 'Plague Burst',
      'Infection hops between up to 8 enemies, moving one of the first target\'s Venom stacks with each hop.',
      { cd: 45, aimRadius: 6, seekRange: 20, range: 26,
        duration: 6, dps: 18, hops: 8, hopTime: 0.5, hopRange: 12, moveStacks: 1, ...venom,
        cloudRadius: 3, cloudTime: 3, cloudDps: 10, ...wither }),
  ],
};

// ---- class trees (doc 64, Package 7; structure from doc 27) ----
// Four branches, one per button, opening at 0, 1, 3 and 5 points spent in earlier branches. A
// branch is an Enhancement, an exclusive pair that needs it, and a two-rank passive. A node changes
// where the operator aims, moves or spends with the same four buttons: no flat health or damage,
// nothing from another class, nothing paid for sitting at a full resource.
// Effects use the compiler's vocabulary (param, stat, trigger) plus `rule`, a named switch a
// behavior reads. Text placeholders come from the compiled build: {from} and {to} are the node's
// first numeric effect (or `show`) without and with it, other names the branch slot's params,
// and `vals(B, A)` adds or overrides values from the build with it (B) and without it (A).
export const TREE_GATES = [0, 1, 3, 5];
// Every switch a rule effect may set, with its allowed values.
export const TREE_RULES = {
  m2Burst: ['line'], roll: ['cover'], barragePaint: [true], fragment: ['ahead', 'behind'], execution: ['return'],
  orders: ['post', 'escort'], hop: ['pack'], drones: ['picket'], cloud: ['spread', 'cultivate'],
};
const P = (slot, key, add) => ({ type: 'param', slot, key, add });
const rule = (key, value) => ({ type: 'rule', key, value });
const node = (id, name, desc, effects, o = {}) => ({ id, name, desc, effects, ...o });
const branch = (slot, name, enh, pair, passive) => ({ slot, name, enh, pair, passive });
const pct = (v) => Math.round(v * 100);
const sp = (B, slot) => B.slots[slot].params;

export const CLASS_TREES = {
  rifleman: [
    branch('m1', 'Fieldcraft',
      node('lingeringFire', 'Lingering Fire', 'Suppression lasts {to} s instead of {from} s: paint, fall back to cover, then spend it.', [P('m1', 'brandTime', 1.5)]),
      [node('returnCircuit', 'Return Circuit', 'Each Consume loads {rounds} rounds of cell progress, at most once every {icd} s: spending Suppression feeds the next cell.',
        [{ type: 'trigger', event: 'consume', action: 'resource', value: 1, icd: 1, id: 'returnCircuit' }],
        { vals: () => ({ rounds: CLASS_RESOURCE.rifleman.tickRounds, icd: 1 }) }),
      node('sweepingBursts', 'Sweeping Bursts', 'Rounds fan {to} rad either side instead of {from}: fewer hits on one body, Suppression across a pack.', [P('m1', 'spread', 0.078)])],
      node('quickLoad', 'Quick Load', 'A cell loads after {to} landed rounds instead of {from}.', [P('m1', 'roundsPerCell', -2)], { ranks: 2 })),
    branch('m2', 'Conversion',
      node('broadAperture', 'Broad Aperture', 'Piercing Line hits bodies within {to} m of its line instead of {from} m.', [P('m2', 'width', 0.25)]),
      [node('crowdBurst', 'Crowd Burst', 'Each Suppressed body the line hits bursts within {to} m instead of {from} m: aim at the middle of the pack.', [P('m2', 'burstRadius', 1.5)]),
      node('lineDischarge', 'Line Discharge', 'No round bursts. Past the last Suppressed body the shot discharges {dischargeLength} m further down the line, striking every hostile within {dischargeWidth} m of it for that body\'s burst: roll for the angle that lines them up.', [rule('m2Burst', 'line')])],
      node('longRail', 'Long Rail', 'Piercing Line reaches {to} m instead of {from} m.', [P('m2', 'range', 4)], { ranks: 2 })),
    branch('s', 'Maneuver',
      node('wideSweep', 'Wide Sweep', 'The roll finds a Suppressed enemy for its M2 refund within {to} m instead of {from} m.', [P('s', 'refundRange', 4)]),
      [node('pressingRoll', 'Pressing Roll', 'Rolling toward a Suppressed enemy gives back {to}% of the M2 cooldown left instead of {from}%.', [P('s', 'towardMul', -0.2)],
        { vals: (B, A) => ({ to: pct(1 - sp(B, 's').towardMul), from: pct(1 - sp(A, 's').towardMul) }) }),
      node('coveringRoll', 'Covering Roll', 'A roll restores every Suppressed body within {refundRange} m to the full {brandTime} s, so the next Piercing Line still finds them.', [rule('roll', 'cover')],
        { vals: (B) => ({ brandTime: sp(B, 'm1').brandTime }) })],
      node('longRoll', 'Long Roll', 'The roll covers {to} m instead of {from} m.', [P('s', 'distance', 1)], { ranks: 2 })),
    branch('r', 'Doctrine',
      node('paintingBarrage', 'Painting Barrage', 'Barrage rounds paint Suppression like the rifle (they never load cells), setting up the next Piercing Line.', [rule('barragePaint', true)]),
      [node('walkingFire', 'Walking Fire', 'You move at {to}% speed while the Barrage fires instead of {from}%.', [P('r', 'moveMul', 0.35)],
        { vals: (B, A) => ({ to: pct(sp(B, 'r').moveMul), from: pct(sp(A, 'r').moveMul) }) }),
      node('narrowCone', 'Narrow Cone', 'The Barrage seeks targets {seekRange} m out inside {to} rad either side instead of {from} rad: a lane, not a fan.', [P('r', 'halfArc', -0.35), P('r', 'seekRange', 12)])],
      node('punchThrough', 'Punch Through', 'Each Barrage round passes through {to} bodies instead of {from}.', [P('r', 'pierce', 1)], { ranks: 2,
        vals: (B, A) => ({ to: sp(B, 'r').pierce + 1, from: sp(A, 'r').pierce + 1 }) })),
  ],
  blade: [
    branch('m1', 'Footwork',
      node('longCombo', 'Long Combo', 'The combo waits {to} s between strikes instead of {from} s: step out and back in without losing the third cut.', [P('m1', 'comboTime', 0.5)]),
      [node('crowdCutter', 'Crowd Cutter', 'Momentum counts {to} enemies a swing instead of {from}: cut into the pack.', [P('m1', 'builderTargets', 1)]),
      node('duelist', 'Duelist', 'A swing that strikes exactly one enemy pays {to} momentum more ({total} in all): isolate a target.', [P('m1', 'soloGain', 6)],
        { vals: (B) => ({ total: sp(B, 'm1').gain + sp(B, 'm1').soloGain }) })],
      node('reach', 'Reach', 'Cuts reach {to} m instead of {from} m.', [P('m1', 'range', 0.3)], { ranks: 2 })),
    branch('m2', 'Guard',
      node('carriedSpin', 'Carried Spin', 'Whirl Slash travels {to} m plus up to {travelPer} m on momentum, instead of {from} m.', [P('m2', 'travel', 1)]),
      [node('forwardGuard', 'Forward Guard', 'Protection on the way in: the third cut drops no fragment; instead each Exposed body Whirl Slash consumes knocks one {fragDistance} m ahead along the spin.', [rule('fragment', 'ahead')],
        { vals: (B) => ({ fragDistance: sp(B, 'm1').fragDistance }) }),
      node('exitGuard', 'Exit Guard', 'Protection on the way out: the third cut knocks its fragment {fragBehind} m behind you, to catch on the retreat.', [rule('fragment', 'behind')],
        { vals: (B) => ({ fragBehind: sp(B, 'm1').fragBehind }) })],
      node('lastingPlates', 'Lasting Plates', 'Fragments stay on the floor {to} s instead of {from} s.', [P('m1', 'fragLife', 2)], { ranks: 2 })),
    branch('s', 'Pursuit',
      node('longLunge', 'Long Lunge', 'Lunge dashes {to} m instead of {from} m.', [P('s', 'distance', 2)]),
      [node('openingLunge', 'Opening Lunge', 'The first enemy a Lunge strikes is Exposed for {to} s. A guard opened this way drops no fragment at the third cut.', [P('s', 'exposeTime', 3)]),
      node('cleanExit', 'Clean Exit', 'A Lunge that strikes nothing is ready again after {to} s instead of {from} s: an escape that costs less.', [P('s', 'missMul', -0.4)],
        { vals: (B, A) => ({ to: sp(B, 's').cd * sp(B, 's').missMul, from: sp(A, 's').cd * sp(A, 's').missMul }) })],
      node('wideLunge', 'Wide Lunge', 'Lunge strikes enemies within {to} m of its path instead of {from} m.', [P('s', 'radius', 0.3)], { ranks: 2 })),
    branch('r', 'Sentence',
      node('longSentence', 'Long Sentence', 'Execution finds Exposed targets within {to} m instead of {from} m.', [P('r', 'markedRange', 6)]),
      [node('massSentence', 'Mass Sentence', 'Execution strikes up to {to} Exposed targets instead of {from}: open more guards before you call it.', [P('r', 'markedTargets', 2)]),
      node('withdraw', 'Withdraw', 'After the last strike you return to where Execution began: finish the line and be gone.', [rule('execution', 'return')])],
      node('swiftSentence', 'Swift Sentence', 'Execution strikes land {to} s apart instead of {from} s.', [P('r', 'spacing', -0.04)], { ranks: 2 })),
  ],
  summoner: [
    branch('m1', 'Spotter',
      node('wideMarker', 'Wide Marker', 'Marker Grenade Marks within {to} m instead of {from} m.', [P('m1', 'radius', 0.75)]),
      [node('quickRadio', 'Quick Radio', 'The radio is ready again {to} s after an Order instead of {from} s: call Orders more often.', [P('m1', 'radioTime', -1)]),
      node('twinOrder', 'Twin Order', 'A ready radio Orders the {to} hostiles nearest the impact instead of {from}.', [P('m1', 'orders', 1)])],
      node('longToss', 'Long Toss', 'Marker Grenade lands up to {to} m away instead of {from} m.', [P('m1', 'range', 2)], { ranks: 2 })),
    branch('m2', 'Emplacement',
      node('wideLane', 'Wide Lane', 'A posted sentry covers {to} rad either side of its facing instead of {from} rad.', [P('m2', 'halfArc', 0.25)]),
      [node('post', 'Post', 'Orders stay with the emplacement: drones never take them, and an Order is held until its target walks into a sentry\'s lane.', [rule('orders', 'post')]),
      node('escort', 'Escort', 'Orders go out with the drones: a drone in reach takes an Order first; a sentry answers one only when no drone can.', [rule('orders', 'escort')])],
      node('fastRecall', 'Fast Recall', 'A recalled sentry is back after {to} s instead of {from} s.', [P('m2', 'recallTime', -1)], { ranks: 2 })),
    branch('s', 'Relay',
      node('longRelay', 'Long Relay', 'Tactical Hop re-aims sentries within {to} m instead of {from} m.', [P('s', 'buffRange', 4)]),
      [node('overclock', 'Overclock', 'Re-aimed sentries fire {to}% faster for {buffTime} s instead of {from}%.', [P('s', 'buffSpeed', 0.3)],
        { vals: (B, A) => ({ to: pct(sp(B, 's').buffSpeed - 1), from: pct(sp(A, 's').buffSpeed - 1) }) }),
      node('packHop', 'Pack Hop', 'Landing within {packRange} m of a posted sentry packs it: hop to your hardware, carry it to the next post.', [rule('hop', 'pack')],
        { vals: (B) => ({ packRange: sp(B, 'm2').packRange }) })],
      node('longHop', 'Long Hop', 'Tactical Hop covers {to} m instead of {from} m.', [P('s', 'distance', 1)], { ranks: 2 })),
    branch('r', 'Hive',
      node('longPatrol', 'Long Patrol', 'Hive Drones stay {to} s instead of {from} s.', [P('r', 'duration', 5)]),
      [node('picket', 'Picket', 'Drones hold the ground where you launched them instead of following you: leave them on a crossing.', [rule('drones', 'picket')]),
      node('closeWing', 'Close Wing', 'Drones fly with you and shoot {to} m out instead of {from} m.', [P('r', 'shotRange', 4)])],
      node('quickCall', 'Quick Call', 'Hive Drones are ready again after {to} s instead of {from} s.', [{ type: 'stat', key: 'rRate', add: 0.1 }], { ranks: 2, show: ['r', 'cd'] })),
  ],
  toxic: [
    branch('m1', 'Dosing',
      node('longSpit', 'Long Spit', 'Toxic Spit flies {to} m instead of {from} m.', [P('m1', 'range', 4)]),
      [node('splatter', 'Splatter', 'A spit that strikes a host also Venoms the nearest other hostile within {to} m: seed a pack.', [P('m1', 'splash', 2)]),
      node('heavyDose', 'Heavy Dose', 'Each spit lands {to} Venom stacks instead of {from}, but spits come {interval} s apart: dose one host fast.', [P('m1', 'dose', 1), P('m1', 'interval', 0.15)])],
      node('fastSpit', 'Fast Spit', 'Toxic Spit flies at {to} m/s instead of {from} m/s: easier to land on a runner.', [P('m1', 'speed', 6)], { ranks: 2 })),
    branch('m2', 'Culture',
      node('wideCloud', 'Wide Cloud', 'Wither Cloud covers {to} m instead of {from} m.', [P('m2', 'radius', 1)]),
      [node('spreadingRupture', 'Spreading Rupture', 'Spend it now: each rupture puts a Venom stack on every other hostile within {spreadRadius} m, which ruptures in turn if the cloud reaches it.', [rule('cloud', 'spread')]),
      node('cultivate', 'Cultivate', 'Keep it: where the cloud overlaps your acid pool, its tick refreshes a host\'s Venom to the full {venomTime} s instead of rupturing; the host ruptures once it leaves the pool inside the cloud.', [rule('cloud', 'cultivate')],
        { vals: (B) => ({ venomTime: sp(B, 'm1').venomTime }) })],
      node('longLob', 'Long Lob', 'Wither Cloud lands up to {to} m away instead of {from} m.', [P('m2', 'range', 3)], { ranks: 2 })),
    branch('s', 'Ground',
      node('widePool', 'Wide Pool', 'Acid Slide\'s pool covers {to} m instead of {from} m.', [P('s', 'radius', 0.75)]),
      [node('standingPool', 'Standing Pool', 'The pool lasts {to} s instead of {from} s: hold the ground.', [P('s', 'poolTime', 3)]),
      node('dosingSlide', 'Dosing Slide', 'Landing puts a Venom stack on every hostile within {to} m: slide in, not only away.', [P('s', 'landRadius', 2)])],
      node('longSlide', 'Long Slide', 'Acid Slide covers {to} m instead of {from} m.', [P('s', 'distance', 1)], { ranks: 2 })),
    branch('r', 'Plague',
      node('longHops', 'Long Hops', 'Plague Burst hops up to {to} m instead of {from} m.', [P('r', 'hopRange', 3)]),
      [node('longChain', 'Long Chain', 'The plague hops {to} times instead of {from}: thin infection across a crowd.', [P('r', 'hops', 2)]),
      node('heavyHops', 'Heavy Hops', 'Each hop moves {to} of the leader\'s Venom stacks instead of {from}: fewer hosts, heavier doses.', [P('r', 'moveStacks', 1)])],
      node('seedingDeath', 'Seeding Death', 'The cloud a plague death leaves covers {to} m instead of {from} m.', [P('r', 'cloudRadius', 0.75)], { ranks: 2 })),
  ],
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
