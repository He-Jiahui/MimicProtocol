// Combat behaviors for the four-slot kits. Each class has its own resource (doc 64, Package 2):
// Rifleman cells, Blade momentum, Summoner hardware and radio, Venom on the Handler's hosts.
// Every new payoff skips figures that are not valid targets and pays nothing for them.

import { angleDiff, dist } from '../core/math.js';
import { VENOM_DPS } from './skill-data.js';

const aimDir = (p) => [Math.cos(p.face), Math.sin(p.face)];
const clampAim = (p, input, max) => {
  let dx = input.aimX - p.x, dz = input.aimZ - p.z;
  const l = Math.hypot(dx, dz) || 1;
  if (l > max) { dx = dx / l * max; dz = dz / l * max; }
  return [p.x + dx, p.z + dz];
};
// Pull a landing point back to open ground if the aim is inside a wall.
const landing = (raid, p, x, z) => {
  const t = raid.world.raycast(p.x, p.z, x, z);
  if (t < 1) { const k = Math.max(0, t - 0.04); return [p.x + (x - p.x) * k, p.z + (z - p.z) * k]; }
  return [x, z];
};

// Roll, Hop and Slide share directional movement; their class payoffs run at
// cast time or on landing. Lunge instead follows aim and hits along its path.
function dodge(raid, input, params, onLand) {
  const [dx, dz] = raid.dodgeDir(input);
  raid.startDash(dx, dz, params.distance, params.duration, params.iframes, onLand);
  raid.setCd('s', params.cd);
}

const TOX = [0.55, 1.0, 0.35], SUPP = [0.5, 0.9, 1];

// The Rifleman's mark burst: a follow-up with its own base, 20 x (1 + 0.25 x Suppression), on every
// other valid body within 2.5 m of the Suppressed one.
function markBurst(raid, e, stacks, params, share = 1, m2 = false) {
  raid.emit({ t: 'explode', x: e.x, z: e.z, r: params.burstRadius, col: SUPP, shake: 0.05 });
  raid.forRadius(e.x, e.z, params.burstRadius, (o) => {
    if (o !== e && raid.isTarget(o)) raid.playerHit(o, params.burstDamage * (1 + params.burstPerStack * stacks) * share, 'skill', { noProc: true, m2 });
  });
}

function burstRifle(raid, p, _input, params) {
  p.cd.m1 = params.interval;
  for (let i = 0; i < params.shots; i++) {
    raid.after(i * params.spacing, () => {
      if (p.dead || p.hidden) return;
      const a = p.face + raid.rCombat.range(-params.spread, params.spread);
      const dx = Math.cos(a), dz = Math.sin(a);
      let landed = false; // a round counts once toward a cell, however many bodies it passes through
      raid.fireBullet(p.x + dx * 0.9, p.z + dz * 0.9, dx, dz, {
        dmg: params.damage, range: params.range,
        onHit: (e, valid) => {
          if (raid.isTarget(e)) { e.st.supp = Math.min(params.brandCap, e.st.supp + 1); e.st.suppT = params.brandTime; }
          if (valid && !landed) { landed = true; raid.cellRounds(1); }
        },
      });
      raid.emit({ t: 'muzzle', x: p.x + dx, z: p.z + dz });
      raid.sfx('shot');
    });
  }
  raid.noise(p.x, p.z, params.noise);
}

// Line Discharge (tree): one discharge runs on down the line from the last Suppressed body, sized by
// that body's stacks, striking every valid body within dischargeWidth of the line. A follow-up with its
// own base, like the round burst it replaces.
function lineDischarge(raid, p, dx, dz, from, at, stacks, params, share) {
  const sx = p.x + dx * at, sz = p.z + dz * at, len = params.dischargeLength;
  const L = len * raid.world.raycast(sx, sz, sx + dx * len, sz + dz * len);
  let n = 0;
  for (const e of raid.enemies) {
    if (e === from || !raid.isTarget(e)) continue;
    const t = (e.x - sx) * dx + (e.z - sz) * dz;
    if (t < 0 || t > L || Math.abs((e.x - sx) * dz - (e.z - sz) * dx) > e.r + params.dischargeWidth) continue;
    raid.playerHit(e, params.burstDamage * (1 + params.burstPerStack * stacks) * share, 'skill', { noProc: true, m2: true });
    n++;
  }
  raid.emit({ t: 'beam', x: sx, z: sz, x2: sx + dx * L, z2: sz + dz * L, col: SUPP, life: 0.3, w: 0.5, k: 5 });
  return n;
}

function piercingLine(raid, p, _input, params) {
  const [dx, dz] = aimDir(p), range = params.range;
  let L = range * raid.world.raycast(p.x, p.z, p.x + dx * range, p.z + dz * range);
  const hits = [];
  for (const e of raid.enemies) {
    if (e.dead || e.untargetable) continue;
    const proj = (e.x - p.x) * dx + (e.z - p.z) * dz;
    if (proj < 0 || proj > L) continue;
    if (Math.abs((e.x - p.x) * dz - (e.z - p.z) * dx) <= e.r + params.width) hits.push(e);
  }
  // Nearest first. It is a piercing round: it stops in the first body that looks human.
  const along = (e) => (e.x - p.x) * dx + (e.z - p.z) * dz;
  hits.sort((a, b) => along(a) - along(b));
  const stop = hits.findIndex((e) => raid.humanLooking(e));
  if (stop >= 0) { hits.length = stop + 1; L = Math.min(L, along(hits[stop])); }
  const share = raid.powerMul, line = raid.skillBuild.rules.m2Burst === 'line';
  let bursts = 0, last = null, lastAt = -1, lastStacks = 0;
  for (const e of hits) {
    // Suppression read at contact is the base term and sizes the burst; the Brand goes once the hit
    // resolves, then each Suppressed body bursts (this replaces the old ricochet).
    const stacks = e.st.supp;
    raid.playerHit(e, params.damage * (1 + params.perStack * stacks) * share, 'skill', { m2: true, aimed: true, spend: stacks > 0 ? 'supp' : null });
    if (stacks <= 0) continue;
    e.st.supp = 0; raid.consume(e); bursts++;
    if (!line) { markBurst(raid, e, stacks, params, share, true); continue; }
    const at = (e.x - p.x) * dx + (e.z - p.z) * dz;
    if (at > lastAt) { last = e; lastAt = at; lastStacks = stacks; }
  }
  const discharged = last ? lineDischarge(raid, p, dx, dz, last, lastAt, lastStacks, params, share) : 0;
  raid.emit({ t: 'beam', x: p.x + dx, z: p.z + dz, x2: p.x + dx * L, z2: p.z + dz * L, col: SUPP, life: 0.22, w: 0.22, k: 7 });
  raid.emit({ t: 'muzzle', x: p.x + dx, z: p.z + dz, col: SUPP });
  raid.sfx('rail');
  raid.noise(p.x, p.z, params.noise);
  raid.setCd('m2', params.cd);
  raid.lastM2 = { hits: hits.length, bursts, discharged };
}

function tacticalRoll(raid, p, input, params) {
  const [rx, rz] = raid.dodgeDir(input);
  dodge(raid, input, params);
  const near = raid.nearestTarget(p.x, p.z, params.refundRange, (e) => e.st.supp > 0);
  if (!near) return;
  // Refund 30% of M2 if a suppressed enemy is within 10 m; rolling at it may give back more (tree).
  if (p.cd.m2 > 0) {
    const d = dist(near.x, near.z, p.x, p.z) || 1, toward = ((near.x - p.x) * rx + (near.z - p.z) * rz) / d >= Math.cos(params.towardArc);
    p.cd.m2 *= toward ? params.towardMul : params.remainingMul;
  }
  // Covering Roll (tree): every Suppressed body in reach is restored to the full time.
  if (raid.skillBuild.rules.roll === 'cover') {
    const full = raid.skillBuild.slots.m1.params.brandTime;
    for (const e of raid.enemies) if (raid.isTarget(e) && e.st.supp > 0 && dist(e.x, e.z, p.x, p.z) <= params.refundRange) e.st.suppT = full;
  }
}

function barrage(raid, p, _input, params) {
  // R takes every cell: each makes the next four rounds that strike a Suppressed body burst.
  p.channel = { kind: 'barrage', t: params.duration, moveMul: params.moveMul, params: params, acc: 0, bursts: p.cells * params.burstRounds };
  p.cells = 0;
  raid.setCd('r', params.cd);
  raid.sfx('ult');
}

export function tickBarrage(raid, p, dt) {
  const c = p.channel;
  if (!c || c.kind !== 'barrage') return;
  const params = c.params;
  c.t -= dt; c.acc -= dt;
  while (c.acc <= 0) {
    c.acc += params.interval;
    // Nearest enemy inside the cone, re-targeting after each kill.
    const tgt = raid.nearestTarget(p.x, p.z, params.seekRange, (e) => Math.abs(angleDiff(p.face, Math.atan2(e.z - p.z, e.x - p.x))) < params.halfArc, true);
    const a = tgt ? Math.atan2(tgt.z - p.z, tgt.x - p.x) : p.face + raid.rCombat.range(-params.spread, params.spread);
    const dx = Math.cos(a), dz = Math.sin(a);
    // Barrage rounds never load cells; while cells were spent on it, they burst on Suppressed bodies.
    // Barrage aims itself, so its rounds pass by anyone who looks human. Painting Barrage (tree)
    // also has them paint Suppression, after the burst check.
    const paint = !!raid.skillBuild.rules.barragePaint, m1 = raid.skillBuild.slots.m1.params;
    raid.fireBullet(p.x + dx * 0.9, p.z + dz * 0.9, dx, dz, {
      dmg: params.damage, range: params.range, col: [1, 0.7, 0.35], aimed: false, pierce: params.pierce,
      onHit: c.bursts > 0 || paint ? (e, valid) => {
        if (c.bursts > 0 && valid && e.st.supp > 0) { c.bursts--; markBurst(raid, e, e.st.supp, params); }
        if (paint && valid && raid.isTarget(e)) { e.st.supp = Math.min(m1.brandCap, e.st.supp + 1); e.st.suppT = m1.brandTime; }
      } : null,
    });
    raid.emit({ t: 'muzzle', x: p.x + dx, z: p.z + dz });
    raid.sfx('shot');
  }
  raid.noise(p.x, p.z, params.noise);
  if (c.t <= 0) p.channel = null;
}

function threeStrike(raid, p, _input, params) {
  const step = p.combo, dmg = step === 2 ? params.finisherDamage : params.damage, a = p.face, range = params.range;
  const frag = raid.skillBuild.rules.fragment;
  let built = 0, struck = 0, behind = false; // momentum counts at most two enemies a swing
  const inSwing = (e, d) => d <= params.closeRange || Math.abs(angleDiff(a, Math.atan2(e.z - p.z, e.x - p.x))) <= params.halfArc;
  // The deliberate cut lands on the one body nearest the aim line; only it can wound someone who looks human.
  let aimed = null, best = Infinity;
  raid.forRadius(p.x, p.z, range, (e) => {
    const d = dist(e.x, e.z, p.x, p.z), off = Math.abs(angleDiff(a, Math.atan2(e.z - p.z, e.x - p.x))) + d * 0.01;
    if (inSwing(e, d) && off < best) { best = off; aimed = e; }
  });
  raid.forRadius(p.x, p.z, range, (e) => {
    const d = dist(e.x, e.z, p.x, p.z);
    if (!inSwing(e, d)) return;
    // Judge the body before the cut can reveal it: a disguise pays no momentum and drops no fragment.
    const valid = raid.isTarget(e), fresh = e.st.exposedT <= 0;
    raid.playerHit(e, dmg, 'melee', { aimed: e === aimed });
    if (valid) struck++;
    if (valid && built++ < params.builderTargets) raid.addMomentum(params.gain);
    // The third strike applies Exposed for 6 s; a fresh opening knocks a plate fragment beyond the body.
    // Forward Guard leaves it to the Whirl; Exit Guard sets one down behind the operator each swing.
    if (step === 2 && raid.isTarget(e)) {
      e.st.exposedT = params.brandTime;
      if (!valid || !fresh || frag === 'ahead') return;
      if (frag === 'behind') { if (!behind && raid.dropFragment(e, -Math.cos(a), -Math.sin(a), p, params.fragBehind)) behind = true; }
      else raid.dropFragment(e, d > 0.05 ? e.x - p.x : Math.cos(a), d > 0.05 ? e.z - p.z : Math.sin(a));
    }
  });
  // Duelist (tree): a swing that struck exactly one enemy pays more.
  if (params.soloGain > 0 && struck === 1) raid.addMomentum(params.soloGain);
  raid.emit({ t: 'slash', x: p.x, z: p.z, r: range, half: params.halfArc, angle: a, col: step === 2 ? [1, 0.8, 0.9] : [1, 0.35, 0.5] });
  raid.sfx(step === 2 ? 'slash3' : 'slash');
  p.swingT = 0.2;
  p.combo = (step + 1) % 3; p.comboT = params.comboTime;
  p.cd.m1 = step === 2 ? params.finisherInterval : params.interval;
  if (!p.dash) p.dash = { vx: Math.cos(a) * params.stepSpeed, vz: Math.sin(a) * params.stepSpeed, t: params.stepTime };
  raid.noise(p.x, p.z, params.noise);
}

function whirlSlash(raid, p, input, params) {
  // Spend all momentum: the spin travels 1 + 5 x momentum / 100 m along the move input, cutting
  // everything it passes once.
  const share = raid.powerMul, travel = params.travel + params.travelPer * p.momentum / 100, [dx, dz] = raid.dodgeDir(input);
  const out = raid.lastM2 = { stacksSpent: 0, travel };
  const hit = new Set();
  p.momentum = 0;
  const sweep = () => raid.forRadius(p.x, p.z, params.radius, (e) => {
    if (hit.has(e.id)) return;
    hit.add(e.id);
    // Exposed read at contact gives x1.5; the Brand goes once the swing resolves.
    const exposed = e.st.exposedT > 0;
    raid.playerHit(e, params.damage * (exposed ? params.exposedMul : 1) * share, 'skill', { melee: true, m2: true, spend: exposed ? 'exposed' : null });
    if (!exposed) return;
    e.st.exposedT = 0; out.stacksSpent++;
    raid.consume(e);
    // Forward Guard (tree): the spent guard falls ahead along the spin, where the operator is going.
    if (raid.skillBuild.rules.fragment === 'ahead') raid.dropFragment(e, dx, dz);
    // Shove the opened body 4 m aside; knockback velocity decays at 9 a second.
    const kx = e.x - p.x, kz = e.z - p.z, kl = Math.hypot(kx, kz) || 1;
    if (!e.dead && e.state === 'hunt') { e.kx = kx / kl * params.shove * 9; e.kz = kz / kl * params.shove * 9; }
  });
  sweep();
  raid.startDash(dx, dz, travel, params.duration, 0, sweep, sweep);
  raid.emit({ t: 'ring', x: p.x, z: p.z, r: params.radius, col: [1, 0.35, 0.5], life: 0.25, k: 4 });
  raid.emit({ t: 'slash', x: p.x, z: p.z, r: params.radius, half: 3.2, angle: p.face, col: [1, 0.5, 0.65] });
  raid.sfx('whirl');
  p.swingT = 0.2;
  raid.setCd('m2', params.cd);
  raid.noise(p.x, p.z, params.noise);
}

function lunge(raid, p, _input, params) {
  const [dx, dz] = aimDir(p);
  const hit = new Set();
  let opened = false;
  // Clean Exit (tree): a Lunge that struck no body is ready again after missMul of its cooldown.
  const onEnd = params.missMul < 1 ? () => { if (!hit.size) p.cd.s = Math.max(0, p.cd.s - params.cd * (1 - params.missMul)); } : null;
  raid.startDash(dx, dz, params.distance, params.duration, params.iframes, onEnd, () => {
    raid.forRadius(p.x, p.z, params.radius, (e) => {
      if (hit.has(e.id)) return;
      hit.add(e.id);
      const valid = raid.isTarget(e);
      if (valid) p.momT = raid.time; // a landed hit holds momentum
      raid.playerHit(e, params.damage, 'melee', { aimed: true }); // lunge contact is deliberate
      // Opening Lunge (tree): the first valid body struck is Exposed, with no fragment of its own.
      if (valid && params.exposeTime > 0 && !opened && raid.isTarget(e)) { opened = true; e.st.exposedT = Math.max(e.st.exposedT, params.exposeTime); }
      // A hit makes the next M1 start at strike 2.
      p.combo = 1; p.comboT = params.comboTime;
    });
  });
  raid.emit({ t: 'beam', x: p.x, z: p.z, x2: p.x + dx * params.distance, z2: p.z + dz * params.distance, col: [1, 0.35, 0.5], life: 0.25, w: 0.3, k: 3 });
  raid.setCd('s', params.cd);
}

function execution(raid, p, _input, params) {
  let targets = raid.enemies.filter((e) => raid.isTarget(e) && e.st.exposedT > 0 && dist(e.x, e.z, p.x, p.z) < params.markedRange);
  if (!targets.length) targets = raid.enemies.filter((e) => raid.isTarget(e) && dist(e.x, e.z, p.x, p.z) < params.range);
  if (!targets.length) return false;
  targets.sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z));
  targets = targets.slice(0, targets[0].st.exposedT > 0 ? params.markedTargets : params.targets);
  // R spends momentum: +0.5% damage a point, one more line in each strike's pool.
  const bonus = p.momentum * params.momentumBonus;
  const home = { x: p.x, z: p.z }, back = raid.skillBuild.rules.execution === 'return';
  p.momentum = 0;
  p.invuln = true;
  raid.sfx('ult');
  targets.forEach((e, i) => {
    raid.after(params.delay + i * params.spacing, () => {
      if (e.dead || p.dead) return;
      const a = Math.atan2(e.z - p.z, e.x - p.x);
      const tx = e.x - Math.cos(a) * (e.r + 1), tz = e.z - Math.sin(a) * (e.r + 1);
      raid.emit({ t: 'beam', x: p.x, z: p.z, x2: tx, z2: tz, col: [1, 0.35, 0.5], life: 0.3, w: 0.35, k: 4 });
      if (raid.world.circleFree(tx, tz, p.r)) { p.x = tx; p.z = tz; }
      p.face = a; p.swingT = 0.2;
      raid.emit({ t: 'slash', x: p.x, z: p.z, r: 3.5, half: 1.2, angle: a, col: [1, 0.9, 0.95] });
      raid.sfx('slash3');
      raid.playerHit(e, params.damage, 'skill', { melee: true, bonus });
      if (e.dead) { raid.heal(p.maxHp * params.healFraction); raid.emit({ t: 'heal' }); }
    });
  });
  raid.after(params.recover + targets.length * params.spacing, () => {
    p.invuln = false;
    // Withdraw (tree): step back to where the sentence began.
    if (back && !p.dead && raid.world.circleFree(home.x, home.z, p.r)) {
      raid.emit({ t: 'beam', x: p.x, z: p.z, x2: home.x, z2: home.z, col: [1, 0.35, 0.5], life: 0.25, w: 0.3, k: 3 });
      p.x = home.x; p.z = home.z;
    }
  });
  raid.setCd('r', params.cd);
  return true;
}

function markerGrenade(raid, p, input, params) {
  p.cd.m1 = params.interval;
  const [ax, az] = clampAim(p, input, params.range);
  const [tx, tz] = landing(raid, p, ax, az);
  raid.lob(p.x, p.z, tx, tz, params.flight, [1, 0.8, 0.3], (x, z) => {
    raid.emit({ t: 'explode', x, z, r: params.radius, col: [1, 0.8, 0.3], shake: 0.08 });
    raid.sfx('pop', x, z);
    raid.noise(x, z, params.noise);
    let marked = 0, struck = null, sd = Infinity;
    const near = [];
    // Only a body the grenade lands on is struck deliberately; the burst round it never wounds anyone who looks human.
    raid.forRadius(x, z, 0.2, (e) => { const d = dist(e.x, e.z, x, z); if (d < sd) { sd = d; struck = e; } });
    raid.forRadius(x, z, params.radius, (e) => {
      const valid = raid.isTarget(e);
      raid.playerHit(e, params.damage, 'ballistic', { aimed: e === struck, fx: x, fz: z });
      // Marks up to 5 enemies for 5 s.
      if (raid.isTarget(e) && marked < params.targets) { e.st.markT = params.brandTime; marked++; }
      if (valid && !e.dead) near.push([dist(e.x, e.z, x, z), e]);
    });
    // A ready radio rides on the grenade: an Order on the hostile nearest the impact (Twin Order: two).
    if (near.length && raid.radioReady()) {
      near.sort((a, b) => a[0] - b[0]);
      for (const [, e] of near.slice(0, params.orders)) raid.giveOrder(e, params);
    }
  });
  raid.sfx('thump');
}

function deploySentry(raid, p, input, params) {
  const [ax, az] = clampAim(p, input, params.range);
  let [x, z] = landing(raid, p, ax, az);
  if (!raid.world.circleFree(x, z, 0.5)) { x = p.x; z = p.z; }
  // A Twinned copy is not hardware: a 40% sentry for 20 s that is never carried (start).
  if (raid.copying) { raid.addSummon('sentry', x, z, params.duration, params, { pow: raid.powerMul, lane: p.face }); return; }
  const posts = raid.summons.filter((s) => s.post);
  let near = null, nd = params.packRange;
  for (const s of posts) { const d = dist(s.x, s.z, p.x, p.z); if (d <= nd) { nd = d; near = s; } }
  if (near) {
    // Within 2 m of a post: pack it. The unit is back at once and its lane falls silent.
    raid.removeSummon(near); p.carried++;
    raid.lastM2 = { action: 'pack' };
    x = near.x; z = near.z;
  } else if (p.carried > 0) {
    // Post a carried sentry facing the aim. It has no lifetime.
    p.carried--;
    raid.addSummon('sentry', x, z, Infinity, params, { post: true, lane: p.face });
    raid.lastM2 = { action: 'place' };
  } else if (posts.length) {
    // None carried: recall the oldest. It goes quiet at once and takes 4 s to come back.
    const old = posts[0];
    raid.removeSummon(old); p.recalls.push(params.recallTime);
    raid.lastM2 = { action: 'recall' };
    x = old.x; z = old.z;
  } else return false;
  raid.emit({ t: 'ring', x, z, r: 2, col: [1, 0.8, 0.3], k: 3 });
  raid.sfx('deploy');
  raid.setCd('m2', params.cd);
}

function tacticalHop(raid, p, input, params) {
  // Pack Hop (tree): landing within reach of a posted sentry packs it, as M2 would.
  const pack = raid.skillBuild.rules.hop === 'pack' ? () => {
    let near = null, nd = raid.skillBuild.slots.m2.params.packRange;
    for (const s of raid.summons) { if (!s.post) continue; const d = dist(s.x, s.z, p.x, p.z); if (d <= nd) { nd = d; near = s; } }
    if (near) { raid.removeSummon(near); p.carried++; raid.sfx('deploy'); }
  } : null;
  dodge(raid, input, params, pack);
  // Sentries within 8 m turn their lane toward the aim and gain +40% attack speed for 3 s.
  for (const s of raid.summons) {
    if (s.kind !== 'sentry' || dist(s.x, s.z, p.x, p.z) >= params.buffRange) continue;
    s.buffT = params.buffTime; s.buffSpeed = params.buffSpeed;
    const ax = input.aimX - s.x, az = input.aimZ - s.z;
    s.lane = s.face = Math.hypot(ax, az) > 1 ? Math.atan2(az, ax) : p.face;
    raid.emit({ t: 'ring', x: s.x, z: s.z, r: 1.6, col: [1, 0.9, 0.5], k: 3 });
  }
}

function hiveDrones(raid, p, _input, params) {
  // Picket (tree): drones circle the launch point instead of the operator.
  const anchor = raid.skillBuild.rules.drones === 'picket' ? { x: p.x, z: p.z } : null;
  for (let i = 0; i < params.count; i++) { const s = raid.addSummon('drone', p.x, p.z, params.duration, params); if (anchor) s.anchor = anchor; }
  raid.emit({ t: 'ring', x: p.x, z: p.z, r: 4, col: [1, 0.8, 0.3], k: 3 });
  raid.sfx('ult');
  raid.setCd('r', params.cd);
}

// o.share is the power the cloud was cast with (a copy lands after the cast has reset it). o.m2
// marks a Wither Cloud cast: its ticks take the skill and M2 lines and it ruptures Venom; the small
// cloud a plague death leaves does neither.
// Inside one of the operator's acid pools (enemy pools belong to the enemy).
const inPool = (raid, e) => raid.areas.some((a) => a.kind === 'pool' && a.owner === 'player' && (e.x - a.x) ** 2 + (e.z - a.z) ** 2 <= (a.r + e.r) ** 2);

export function witherCloudArea(raid, x, z, r, life, dps, params, o = {}) {
  const share = o.share ?? 1, ruptured = new Set();
  return raid.addArea({
    kind: 'cloud', x, z, r, life, col: [0.6, 0.9, 0.3],
    // Wither: lethal ticks, +20% per Venom stack read at contact.
    onTick: (e) => {
      const stacks = e.st.venom, left = e.st.venomT, rule = raid.skillBuild.rules.cloud;
      let rupture = !!o.m2 && stacks > 0 && !ruptured.has(e.id);
      // Cultivate (tree): over the operator's pool the cloud keeps the infection instead of
      // releasing it; the host ruptures on a later tick, once it has left the pool.
      const keep = rupture && rule === 'cultivate' && inPool(raid, e);
      if (keep) rupture = false;
      raid.playerHit(e, dps * 0.25 * (1 + params.perStack * stacks) * share, 'dot', { m2: o.m2, skill: o.m2, spend: rupture ? 'venom' : null });
      if (keep && !e.dead) { e.st.venomT = Math.max(e.st.venomT, raid.venomTime(raid.skillBuild.slots.m1.params)); return; }
      if (!rupture) return;
      // Rupture, once per host per cloud: the Brand goes, then the Venom still to come bursts at
      // once, 0.7 x stacks x 3 a second x seconds left (13 from a fresh stack, 63 from five).
      ruptured.add(e.id);
      e.st.venom = 0; e.st.venomT = 0;
      raid.consume(e);
      raid.emit({ t: 'explode', x: e.x, z: e.z, r: 1.8, col: [0.6, 1, 0.3], shake: 0.05 });
      if (!e.dead) raid.playerHit(e, params.ruptureMul * stacks * VENOM_DPS * left * share, 'skill', { noProc: true, m2: true });
      // Spreading Rupture (tree): the release seeds one stack on each valid neighbour, which can
      // rupture in turn if this cloud reaches it (each host still ruptures once per cloud).
      if (rule === 'spread') {
        const m1 = raid.skillBuild.slots.m1.params;
        raid.forRadius(e.x, e.z, params.spreadRadius, (n) => { if (n !== e && raid.isTarget(n)) raid.addVenom(n, 1, m1); });
      }
    },
  });
}

function toxicSpit(raid, p, _input, params) {
  p.cd.m1 = params.interval;
  const a = p.face + raid.rCombat.range(-params.spread, params.spread), dx = Math.cos(a), dz = Math.sin(a);
  raid.fireBullet(p.x + dx * 0.8, p.z + dz * 0.8, dx, dz, {
    kind: 'tox', speed: params.speed, range: params.range, dmg: params.damage, r: params.radius, col: TOX, size: 0.55,
    onHit: (e) => {
      if (!raid.isTarget(e)) return;
      raid.addVenom(e, params.dose, params);
      // Splatter (tree): the nearest other hostile within reach takes a stack too.
      const o = params.splash > 0 && raid.nearestTarget(e.x, e.z, params.splash, (t) => t !== e);
      if (o) raid.addVenom(o, 1, params);
    },
  });
  raid.sfx('spit');
  raid.noise(p.x, p.z, params.noise);
}

function witherCloud(raid, p, input, params) {
  const [ax, az] = clampAim(p, input, params.range);
  const [tx, tz] = landing(raid, p, ax, az);
  const share = raid.powerMul;
  raid.lob(p.x, p.z, tx, tz, params.flight, TOX, (x, z) => { witherCloudArea(raid, x, z, params.radius, params.duration, params.dps, params, { share, m2: true }); raid.sfx('hiss', x, z); });
  raid.sfx('thump');
  raid.setCd('m2', params.cd);
}

function acidSlide(raid, p, input, params) {
  const sx = p.x, sz = p.z;
  dodge(raid, input, params, () => {
    // Acid pool along the slide: slows and applies Venom.
    raid.addArea({
      kind: 'pool', x: (sx + p.x) / 2, z: (sz + p.z) / 2, r: params.radius, life: params.poolTime, col: TOX, tick: 0,
      onTick: (e) => { e.st.slowT = params.slowTime; if ((e.poolT = (e.poolT || 0) + 1) % params.ticksPerStack === 0) raid.addVenom(e, 1, params); },
    });
    // Dosing Slide (tree): the landing Venoms every valid body within reach.
    if (params.landRadius > 0) raid.forRadius(p.x, p.z, params.landRadius, (e) => { if (raid.isTarget(e)) raid.addVenom(e, 1, params); });
  });
}

function plagueBurst(raid, p, input, params) {
  const first = raid.nearestTarget(input.aimX, input.aimZ, params.aimRadius) || raid.nearestTarget(p.x, p.z, params.seekRange, null, true);
  if (!first || dist(first.x, first.z, p.x, p.z) > params.range) return false;
  const infected = new Set();
  const infect = (e, from, hops) => {
    if (e.dead) return;
    infected.add(e.id);
    // Each hop moves one of the leader's Venom stacks (Heavy Hops: two), with the time it had left,
    // to the new host; harm that moves is harm the leader no longer holds.
    if (e !== first && first.st.venom > 0 && !first.dead) {
      const left = first.st.venomT, moved = Math.min(params.moveStacks, first.st.venom);
      if ((first.st.venom -= moved) <= 0) first.st.venomT = 0;
      e.st.venom = Math.min(params.venomStacks, e.st.venom + moved); e.st.venomT = Math.max(e.st.venomT, left);
    }
    e.st.plagueT = params.duration; e.st.plagueDps = params.dps;
    e.st.plagueParams = params;
    raid.emit({ t: 'beam', x: from.x, z: from.z, x2: e.x, z2: e.z, col: [0.7, 1, 0.3], life: 0.3, w: 0.14, k: 5 });
    raid.emit({ t: 'ring', x: e.x, z: e.z, r: 2, col: TOX, k: 3 });
    raid.sfx('hiss', e.x, e.z);
    if (hops <= 0) return;
    raid.after(params.hopTime, () => {
      const next = raid.nearestTarget(e.x, e.z, params.hopRange, (t) => !infected.has(t.id));
      if (next) infect(next, e, hops - 1);
    });
  };
  infect(first, p, params.hops);
  raid.sfx('ult');
  raid.setCd('r', params.cd);
  return true;
}

const behaviors = {
  burstRifle, piercingLine, tacticalRoll, barrage,
  threeStrike, whirlSlash, lunge, execution,
  markerGrenade, deploySentry, tacticalHop, hiveDrones,
  toxicSpit, witherCloud, acidSlide, plagueBurst,
};

export function castSkill(raid, slot, input) {
  const { behavior, params } = raid.skillBuild.slots[slot];
  return behaviors[behavior](raid, raid.player, input, params);
}
