// Field jobs and conditional exits (doc 34; doc 64 Package 3, "Pressure and exits").
//
// A job has a place and a beneficiary: a clinic that must move its patients, a van that
// cannot leave its ramp, a relay that has to stand on the open quay. None needs a
// particular class. Finishing one well brings the later raid closer (the horde's pressure
// timer, never the clock) and what it pays is information, transport or a way out, not
// combat power. A marked exit is a destination, not permission to leave: each one states
// its boarding condition after Command clears extraction.

import { Rng } from '../core/rng.js';
import { ZONES, EXTRACT_TIME, AUTO_CAP, SCAN_RANGE } from './data.js';
import { SURF } from './emit.js';
import { rollGear, rollSellable } from './loot.js';
import { message } from '../i18n/index.js';

export const JOB = {
  PRESS_PER_STAR: 20,     // seconds of horde pressure per star above the first
  FIND_RANGE: 45,         // a job is noticed from this far, or by a scan that reaches it
  PATIENTS: 4, ESCORT_TIME: 240, PATIENT_HP: 40, PATIENT_SPEED: 3.6, FOLLOW: 22, MAUL: 12,
  VAN_WAIT: 90, VAN_INTRO: 60, VAN_FAST: 150, VAN_CLEAN: 0.25, RAMP_PACK: 6,
  RELAY_HOLD: 60, RELAY_R: 9, RELAY_HP: 300, RELAY_WAVES: 3, RELAY_BITE: 20,
  FLARE: 60, FLARE_WAIT: 20, RAIL_CYCLE: 180, RAIL_OPEN: 45,
};
const RELAY_PACK = ['walker', 'walker', 'mite', 'mite', 'skitter'];
export const JOB_NAMES = { escort: 'Clinic escort', van: 'Evacuation van', relay: 'Field relay' };
// Star conditions are told before the job is taken.
export const JOB_TERMS = {
  escort: ['Lead the patients to the Shelter before the clinic lights go out.', '3 stars: all four arrive. 2 stars: two or three. 1 star: one.'],
  van: ['Clear the loading ramp and bring the driver the dispatch radio; the van then waits for you.', '3 stars: ready inside 2:30 and hurt for less than a quarter of your health. 2 stars: one of those.'],
  relay: ['Stand the relay on the quay and hold it through three waves; the Dock Boat answers.', '3 stars: mast above 70% and never more than 5 s away. 2 stars: mast above 35%.'],
};

export const JOB_REACH = 1.4;   // extra reach of a job interaction over an ordinary one
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
// The van stands in the street as cover until it drives off: 5 m by 2 m along its heading.
function vanCells(raid, j, v) {
  const hl = 2.6, hw = 1.0, ax = Math.abs(j.dx) > 0;
  raid.world.fillRect(j.x - (ax ? hl : hw), j.z - (ax ? hw : hl), j.x + (ax ? hl : hw), j.z + (ax ? hw : hl), v);
}
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------------------------------------------------------------- sites
// Sites are chosen per raid from what the district already has, so the same streets ask
// different things on different nights.
function clinicSite(raid, rng) {
  const w = raid.world, ins = w.insertion, S = w.size, cands = [];
  for (const d of w.doors || []) {
    if (raid.doors[d.id].state !== 'closed' || w.zoneAt(d.x, d.z) < 1) continue;
    const far = dist(d.x, d.z, ins.x, ins.z);
    if (far < 90 || far > 230) continue;
    // The pavement side of the doorway: reachable ground that is not the shop floor.
    for (const s of [1, -1]) {
      const x = d.x + (d.nx || 0) * 3 * s, z = d.z + (d.nz || 0) * 3 * s;
      const xi = Math.floor(x), zi = Math.floor(z);
      if (xi < 4 || zi < 4 || xi >= S - 4 || zi >= S - 4) continue;
      if (!w.reach[zi * S + xi] || w.surface[zi * S + xi] === SURF.FLOOR || !w.circleFree(x, z, 1.2) || w.floorAt(x, z) !== 0) continue;
      cands.push({ x, z, door: d.id });
    }
  }
  if (cands.length) return rng.pick(cands);
  const far = pedSite(raid, rng, 90, 230, 1);
  return far && { ...far, door: -1 };
}
// A reachable pavement point at a distance band from the Shelter.
function pedSite(raid, rng, dmin, dmax, zmin) {
  const w = raid.world, ins = w.insertion, cands = [];
  for (const b of w.blocks) for (const q of b.ped) {
    const far = dist(q.x, q.z, ins.x, ins.z);
    if (far >= dmin && far <= dmax && w.zoneAt(q.x, q.z) >= zmin && w.floorAt(q.x, q.z) === 0 && w.circleFree(q.x, q.z, 1.2)) cands.push({ x: q.x, z: q.z });
  }
  return cands.length ? rng.pick(cands) : null;
}
// A stretch of carriageway with at least 26 m of clear road ahead for the drive out.
function vanSite(raid, rng) {
  const w = raid.world, S = w.size, ins = w.insertion;
  const road = (x, z) => { const s = w.surface[Math.floor(z) * S + Math.floor(x)]; return s === SURF.ROAD || (s >= SURF.XWALK_X && s <= SURF.LANE_Z); };
  let best = null;
  for (let t = 0; t < 900; t++) {
    const x = rng.irange(12, S - 12) + 0.5, z = rng.irange(12, S - 12) + 0.5;
    if (!road(x, z) || !w.reach[Math.floor(z) * S + Math.floor(x)] || w.floorAt(x, z) !== 0) continue;
    const zone = w.zoneAt(x, z), far = dist(x, z, ins.x, ins.z);
    if (w.passage && dist(x, z, w.passage.x, w.passage.z) < 12) continue;
    if (zone < 1 || far < 130 || !w.circleFree(x, z, 2.8)) continue;
    for (const [dx, dz] of rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
      let run = 0;
      while (run < 40) { const qx = x + dx * (run + 1), qz = z + dz * (run + 1); if (qx < 4 || qz < 4 || qx > S - 4 || qz > S - 4 || !road(qx, qz) || w.cell(qx, qz) === 1) break; run++; }
      // A van needs a lane, not an alley: three clear metres across where it stands.
      const wide = road(x - dz * 1.5, z - dx * 1.5) && road(x + dz * 1.5, z + dx * 1.5);
      if (run < 26 || !wide) continue;
      // A seat out belongs in the contested middle of the district, not its worst corner.
      const score = -Math.abs(zone - 2.5) * 40 + Math.min(far, 260) * 0.2 + rng.float() * 20;
      if (!best || score > best.score) best = { x, z, dx, dz, run, score };
      break;
    }
  }
  return best;
}
// The radio is in something out in the street, a short walk from the van.
function radioContainer(raid, rng, site) {
  const w = raid.world, cands = [];
  for (const c of w.containers) {
    const st = raid.cont[c.id], far = dist(c.x, c.z, site.x, site.z);
    if (c.indoor || st.host || st.locked || c.key >= 0 || far < 35 || far > 130 || w.floorAt(c.x, c.z) !== 0) continue;
    cands.push(c);
  }
  return cands.length ? rng.pick(cands).id : -1;
}
// Open quay beside the water, as near the Dock Boat as there is room.
function relaySite(raid) {
  const w = raid.world, S = w.size, dock = w.extractions[1], cx = w.net ? w.net.canalX : S * 0.83;
  if (!dock) return null;
  let best = null, bd = Infinity;
  for (let z = Math.max(6, Math.floor(dock.z - 70)); z < Math.min(S - 6, dock.z + 70); z += 2) {
    for (let x = Math.floor(cx - 20); x <= cx + 20; x++) {
      if (!w.reach[z * S + x] || w.grid[z * S + x] !== 0 || w.surface[z * S + x] === SURF.WATER) continue;
      if (w.hasHeight ? w.floorAt(x + 0.5, z + 0.5) >= 0 : Math.abs(x - cx) > 18) continue;
      if (!w.circleFree(x + 0.5, z + 0.5, 1.6)) continue;
      const d = dist(x, z, dock.x, dock.z);
      if (d < bd && d > 14) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
    }
  }
  return best;
}

export function initJobs(raid) {
  raid.jobs = { list: [], xp: 0, flare: 0, flareT: 0, exit: null };
  if (raid.mode !== 'raid') return;
  const rng = new Rng(raid.seed).fork('raid').fork('jobs'), w = raid.world, J = raid.jobs;
  const add = (kind, site, extra) => { if (site) J.list.push({ id: J.list.length, kind, name: JOB_NAMES[kind], x: site.x, z: site.z, zone: w.zoneAt(site.x, site.z), state: 'hidden', stars: 0, t: 0, why: null, ...extra }); };
  const clinic = clinicSite(raid, rng);
  add('escort', clinic, { door: clinic ? clinic.door : -1, patients: [], arrived: 0, lost: 0 });
  const van = vanSite(raid, rng);
  if (van) add('van', van, { dx: van.dx, dz: van.dz, run: van.run, group: 'jobvan', radio: radioContainer(raid, rng, van), cleared: false, delivered: false, ready: false, waitT: 0, hurt0: 0, gone: false });
  add('relay', relaySite(raid), { hp: JOB.RELAY_HP, meter: 0, wave: 0, away: 0, biteT: 0 });
  const v = jobOf(raid, 'van');
  if (v) vanCells(raid, v, 2);
  // In a sector Command has surveyed, the job is on the map before the operator finds it (doc 21, L1).
  for (const j of J.list) if (raid.sectorLevel(j.x, j.z) >= 1) j.state = 'known';
}
export const jobOf = (raid, kind) => raid.jobs.list.find((j) => j.kind === kind);

// ---------------------------------------------------------------- conditional exits
// Clearance applies to every ordinary exit before its individual boarding condition.
export function exitInfo(raid, poi) {
  if (raid.mode !== 'raid' || !poi) return { open: true, cond: null };
  if (!raid.extractUnlocked) return { open: false, cond: 'Locked: hack an Intel Terminal or finish a field contract' };
  const J = raid.jobs;
  switch (poi.idx) {
    case 1: {
      const j = jobOf(raid, 'relay');
      if (!j) return { open: true, cond: null };
      return j.state === 'done' ? { open: true, cond: 'The boat is answering the relay' }
        : { open: false, cond: j.state === 'failed' ? 'No boat: the relay was lost' : 'Needs the field relay raised on the quay' };
    }
    case 2: {
      const ph = raid.time % JOB.RAIL_CYCLE, opens = JOB.RAIL_CYCLE - JOB.RAIL_OPEN;
      return ph >= opens ? { open: true, cond: message('Train at the platform for {time}', { time: fmt(JOB.RAIL_CYCLE - ph) }) }
        : { open: false, cond: message('Next train in {time}', { time: fmt(opens - ph) }) };
    }
    case 3:
      if (J.flare === 2) return { open: true, cond: 'The dropship is holding over the pad' };
      if (J.flare === 1) return { open: false, cond: message('Dropship inbound: {time}', { time: fmt(J.flareT) }) };
      return { open: false, cond: message('Needs a flare: {cost} Credits at the pad', { cost: JOB.FLARE }), flare: true };
    default: return { open: true, cond: null };
  }
}

// ---------------------------------------------------------------- per step
function discover(raid, j, how) {
  j.state = 'known';
  raid.toast(message('Job found: {name}, {ref}', { name: message(j.name), ref: raid.world.refAt(j.x, j.z) }), '#ffd76a', 'complete');
  if (how !== 'quiet') raid.relay(message('Relay: {terms} A clean finish brings the horde forward.', { terms: message(JOB_TERMS[j.kind][0]) }));
  raid.emit({ t: 'job', id: j.id, state: 'known' });
}
// Told by something other than the operator's own eyes: a terminal, another job.
export function revealJobs(raid, kind = null) {
  for (const j of raid.jobs.list) if (j.state === 'hidden' && (!kind || j.kind === kind)) discover(raid, j, 'quiet');
}

export function updateJobs(raid, dt) {
  const J = raid.jobs, p = raid.player;
  if (!J || !J.list.length && !J.flare) return;
  if (J.flare === 1 && (J.flareT -= dt) <= 0) {
    J.flare = 2;
    raid.banner('DROPSHIP ON STATION', 'The rooftop pad is open.', '#55e88a'); raid.sfx('extract');
  }
  raid.relayHold = false;
  const scanned = raid.scanFx && raid.scanFx.t < 0.25;
  for (const j of J.list) {
    if (j.state === 'hidden') {
      const d = dist(j.x, j.z, p.x, p.z);
      if (d < JOB.FIND_RANGE || (scanned && d < SCAN_RANGE * 2)) discover(raid, j);
      continue;
    }
    if (j.state !== 'active') { if (j.kind === 'van') vanWait(raid, j, dt); continue; }
    j.t += dt;
    if (j.kind === 'escort') escortTick(raid, j, dt);
    else if (j.kind === 'van') vanTick(raid, j, dt);
    else relayTick(raid, j, dt);
  }
}

function escortTick(raid, j, dt) {
  const w = raid.world, ins = w.insertion;
  let alive = 0;
  for (const e of j.patients) {
    if (e.dead) continue;
    if (w.zoneAt(e.x, e.z) === 0 && dist(e.x, e.z, ins.x, ins.z) < 24) { e.dead = true; e.arrived = true; j.arrived++; raid.toast(message('Patient safe: {n} of {total}', { n: j.arrived, total: JOB.PATIENTS }), '#7dffa0', 'complete'); continue; }
    alive++;
  }
  j.lost = JOB.PATIENTS - alive - j.arrived;
  if (alive === 0 || j.t >= JOB.ESCORT_TIME) {
    for (const e of j.patients) if (!e.dead) e.dead = true;   // those still out turn back for the clinic
    if (j.arrived === 0) failJob(raid, j, alive === 0 ? 'No patient reached the Shelter' : 'The clinic lights went out');
    else completeJob(raid, j, j.arrived >= JOB.PATIENTS ? 3 : j.arrived >= 2 ? 2 : 1);
  }
}
// A patient keeps close behind the operator and has no fight in them. Called from the
// enemy update for bodies in state 'patient'.
export function patientTick(raid, e, dt, d) {
  const p = raid.player;
  e.losT -= dt;
  if (e.losT <= 0) { e.losT = 0.3; e.los = raid.world.hasLos(e.x, e.z, p.x, p.z); }
  e.moving = false;
  if (d > 2.6 && d < JOB.FOLLOW && !p.dead) { raid.chaseDir(e); raid.moveEnemy(e, raid.dirX, raid.dirZ, JOB.PATIENT_SPEED, dt); }
  // Anything hunting that reaches them mauls them: the operator has to hold the crossing.
  e.biteT = (e.biteT || 0) - dt;
  if (e.biteT > 0) return;
  e.biteT = 0.8;
  for (const h of raid.enemies) {
    if (h === e || !raid.isHostile(h) || h.airborne || dist(h.x, h.z, e.x, e.z) > 1.3 + h.r) continue;
    e.hp -= JOB.MAUL; e.hitFlash = 0.15;
    raid.emit({ t: 'hit', x: e.x, z: e.z, col: [1, 0.3, 0.3], big: false });
    if (e.hp <= 0) {
      e.dead = true;
      raid.emit({ t: 'kill', x: e.x, z: e.z, col: [0.7, 0.1, 0.1], body: { id: e.id, kind: 'civ', face: e.face, scale: 1, look: e.look, animT: e.animT, r: e.r } });
      raid.toast('A patient was killed', '#ff6a6a', 'warning');
    }
    return;
  }
}

function vanTick(raid, j, dt) {
  const g = raid.groups[j.group];
  if (!j.cleared && g && g.alive <= 0) { j.cleared = true; raid.toast('Loading ramp clear', '#7dffa0', 'complete'); }
  if (j.cleared && j.delivered) {
    const p = raid.player, fast = j.t <= JOB.VAN_FAST, clean = raid.taken - j.hurt0 < p.maxHp * JOB.VAN_CLEAN;
    const intro = jobOf(raid, 'escort');
    j.ready = true;
    j.waitT = JOB.VAN_WAIT + (intro && intro.state === 'done' && intro.stars >= 2 ? JOB.VAN_INTRO : 0);
    completeJob(raid, j, fast && clean ? 3 : fast || clean ? 2 : 1);
    raid.banner('VAN READY', message('It leaves in {time}. Board it to extract.', { time: fmt(j.waitT) }), '#55e88a');
  }
}
// The seat does not wait for ever. Missing it is not a death: the exit simply closes.
function vanWait(raid, j, dt) {
  if (!j.ready || j.gone) return;
  j.waitT -= dt;
  if (j.waitT <= 0) { j.gone = true; vanCells(raid, j, 0); raid.toast('The evacuation van has left', '#ffb86a', 'warning'); raid.emit({ t: 'job', id: j.id, state: 'gone' }); }
}

function relayTick(raid, j, dt) {
  const p = raid.player, inside = dist(p.x, p.z, j.x, j.z) <= JOB.RELAY_R && !p.dead;
  // While the ring is held the relay's own waves are the pressure: the director sends no others.
  raid.relayHold = inside;
  if (inside) j.meter = Math.min(1, j.meter + dt / JOB.RELAY_HOLD); else j.away += dt;
  // Each third of the broadcast is answered by a wave from out of sight.
  if (j.wave < JOB.RELAY_WAVES && j.meter >= j.wave / JOB.RELAY_WAVES) {
    j.wave++;
    // Modest local work, not a boss fight (doc 34): four, five, then six, a little more late in the night.
    const room = Math.max(0, AUTO_CAP - raid.aliveHostile), n = Math.min(room, 3 + j.wave + Math.round(raid.pressT / 180));
    // They come for the mast: bodies that close on the ring, with one that stands off and
    // spits from the second wave and two in the third. A ring held against a firing line
    // would be a different job, and no job for a blade.
    const exact = [];
    for (let i = 0; i < n; i++) exact.push(i > 0 && i < j.wave ? 'spitter' : raid.rSpawn.pick(RELAY_PACK));
    if (n > 0) raid.aliveHostile += raid.spawnWave(n, { near: j, rmin: 18, rmax: 28, exact }).length;
    raid.banner(message('RELAY WAVE {n} OF {total}', { n: j.wave, total: JOB.RELAY_WAVES }), 'They heard the broadcast. Hold the mast.', '#ffd76a');
    raid.sfx('wave');
  }
  // Hostiles that reach the mast tear at it.
  j.biteT -= dt;
  if (j.biteT <= 0) {
    j.biteT = 0.8;
    for (const h of raid.enemies) if (raid.isHostile(h) && !h.airborne && dist(h.x, h.z, j.x, j.z) < 1.6 + h.r) { j.hp -= JOB.RELAY_BITE; raid.emit({ t: 'hit', x: j.x, z: j.z, col: [1, 0.7, 0.2], big: false }); }
  }
  if (j.hp <= 0) { j.hp = 0; failJob(raid, j, 'The relay was destroyed'); raid.emit({ t: 'explode', x: j.x, z: j.z, r: 3, col: [1, 0.6, 0.2], shake: 0.3 }); return; }
  if (j.meter >= 1) {
    const f = j.hp / JOB.RELAY_HP;
    completeJob(raid, j, f >= 0.7 && j.away < 5 ? 3 : f >= 0.35 ? 2 : 1);
    for (const ex of raid.world.extractions) if (ex) raid.poi[ex.id].known = true;
    raid.banner('BOAT ANSWERING', 'The Dock Boat is on its way to the quay.', '#55e88a');
  }
}

function failJob(raid, j, why) {
  j.state = 'failed'; j.why = why;
  raid.toast(message('{name} failed: {why}', { name: message(j.name), why: message(why) }), '#ff6a6a', 'warning');
  raid.emit({ t: 'job', id: j.id, state: 'failed' });
  raid.sfx('lose');
}

// What a finished job pays, and what it costs the rest of the night.
export function completeJob(raid, j, stars) {
  j.state = 'done'; j.stars = stars; raid.unlockExtraction();
  const zone = Math.max(j.zone, 1), rl = raid.rLoot;
  const credits = raid.addCredits(Math.round(40 * stars * (1 + 0.3 * zone)));
  raid.jobs.xp += 25 * stars;
  raid.toast(message('{name}: {stars} · +{credits} Credits', { name: message(j.name), stars: '★'.repeat(stars) + '☆'.repeat(3 - stars), credits }), '#ffd76a', 'complete');
  // Something to carry home, not something to fight with (doc 34).
  if (stars >= 3) raid.stow(rollGear(rl, { tier: raid.tier, zone, nl: raid.nl, source: 'elite' }), j.x, j.z);
  else if (stars === 2) raid.stow(rollSellable(rl, zone, 1.2), j.x, j.z);
  if (j.kind === 'escort' && stars >= 2) revealJobs(raid, 'van');      // an introduction to the driver
  raid.emit({ t: 'job', id: j.id, state: 'done', stars });
  raid.sfx('win');
  if (stars >= 2) advancePressure(raid, JOB.PRESS_PER_STAR * (stars - 1));
}
// An exceptional clear is evidence the present opposition is mastered: the horde's own
// timer moves on, and the operator is told what is now closer. The clock does not move.
export function advancePressure(raid, seconds) {
  raid.pressT += seconds;
  const next = [['Surge', raid.surgeT], ['Alpha Hunt', raid.eliteT], ['Titan', raid.titanT]]
    .map(([name, at]) => ({ name, left: at - raid.pressT })).sort((a, b) => a.left - b.left)[0];
  raid.banner('PRESSURE ADVANCED', message('The horde moves up {s} s. Next: {what} in {time}.', { s: seconds, what: message(next.name), time: fmt(next.left) }), '#ff9230');
}

// ---------------------------------------------------------------- interaction
// The nearest thing a job or an exit offers within reach, in the shape findInteract uses.
export function jobInteract(raid) {
  const p = raid.player, J = raid.jobs;
  if (!J) return null;
  let best = null, bd = Infinity;
  const offer = (j, d, o) => { if (d < bd) { bd = d; best = { key: 'job' + j.id + o.act, type: 'job', job: j, st: j, dist: d, ok: true, ...o }; } };
  for (const j of J.list) {
    const d = dist(j.x, j.z, p.x, p.z);
    if (d > 3.6 || j.state === 'hidden' || j.state === 'failed') continue;
    if (j.kind === 'escort' && j.state === 'known') offer(j, d, { act: 'start', need: 1, label: 'Clinic: lead the patients to the Shelter' });
    else if (j.kind === 'relay' && j.state === 'known') offer(j, d, { act: 'start', need: 2, label: 'Deploy the field relay (three waves)' });
    else if (j.kind === 'van') {
      if (j.state === 'known') offer(j, d, { act: 'start', need: 1, label: 'Driver: offer to clear the ramp' });
      else if (j.state === 'active' && !j.delivered) {
        const has = p.inv.some((i) => i.name === 'Dispatch Radio');
        offer(j, d, { act: 'radio', need: 1, ok: has, label: has ? 'Hand over the dispatch radio' : 'Driver: "No radio, no dispatch. Find it."' });
      } else if (j.ready && !j.gone) {
        const fight = raid.boss && raid.boss.active;
        offer(j, d, { act: 'board', need: EXTRACT_TIME, ok: !fight, label: fight ? 'Extraction blocked during the fight' : message('Extract: Evacuation Van ({time} left)', { time: fmt(j.waitT) }) });
      }
    }
  }
  return best;
}
export function completeJobInteract(raid, it) {
  const j = it.job, p = raid.player;
  if (it.act === 'board') { raid.jobs.exit = 'Evacuation Van'; j.boarded = true; raid.finish('extracted'); return; }
  if (it.act === 'radio') {
    const i = p.inv.findIndex((k) => k.name === 'Dispatch Radio');
    if (i < 0) return;
    p.inv.splice(i, 1);
    j.delivered = true;
    raid.toast('Dispatch radio handed over', '#7dffa0', 'complete');
    return;
  }
  // Taking the job on.
  j.state = 'active'; j.t = 0;
  raid.emit({ t: 'job', id: j.id, state: 'active' });
  raid.sfx('banner');
  if (j.kind === 'escort') {
    for (let k = 0; k < JOB.PATIENTS; k++) {
      const s = raid.world.randomFree(raid.rSpawn, j.x, j.z, 0.5, 3, 0.5) || { x: j.x, z: j.z };
      const e = raid.spawnEnemy('walker', s.x, s.z, { state: 'patient', isMimic: false });
      e.patient = true; e.hp = e.maxHp = JOB.PATIENT_HP; e.speed = JOB.PATIENT_SPEED; e.xp = 0; e.credits = 0;
      j.patients.push(e);
    }
    raid.banner('CLINIC ESCORT', message('Four patients. {time} to reach the Shelter.', { time: fmt(JOB.ESCORT_TIME) }), '#7dffa0');
  } else if (j.kind === 'van') {
    j.hurt0 = raid.taken;
    raid.groups[j.group] = { alive: 0 };
    const zm = ZONES[Math.max(1, j.zone)].mimics, kinds = [];
    for (let k = 0; k < JOB.RAMP_PACK; k++) kinds.push(raid.rSpawn.pick(zm.filter((m) => m !== 'shrike')));
    if (j.zone >= 3) kinds.push('brute');
    const at = { x: j.x + j.dx * 9, z: j.z + j.dz * 9 };
    raid.spawnPack(at.x, at.z, kinds, { state: 'revealing', spread: 6, group: j.group, noElite: true });
    const c = raid.world.containers[j.radio];
    raid.banner('EVACUATION VAN', 'Clear the ramp. Find the dispatch radio.', '#ffd76a');
    if (c) raid.relay(message('Relay: The driver says the radio was left in {ref}. It is marked for you.', { ref: raid.world.refAt(c.x, c.z) }));
    else { j.delivered = true; raid.relay('Relay: The driver still has his radio. Just clear the ramp.'); }
  } else {
    raid.banner('FIELD RELAY', 'Stay inside the ring. Three waves will come.', '#ffd76a');
  }
}
// The Rooftop Dropship answers a flare.
export function flareInteract(raid, poi) {
  const p = raid.player, ok = p.credits >= JOB.FLARE;
  return { key: 'flare', type: 'flare', poi, st: raid.jobs, need: 1.2, ok, label: message(ok ? 'Fire a flare for the dropship: {cost} Credits' : 'Fire a flare for the dropship: {cost} Credits (not enough)', { cost: JOB.FLARE }) };
}
export function fireFlare(raid) {
  const J = raid.jobs, p = raid.player;
  if (J.flare || p.credits < JOB.FLARE) return;
  p.credits -= JOB.FLARE; J.flare = 1; J.flareT = JOB.FLARE_WAIT;
  raid.banner('FLARE UP', message('Dropship inbound: {time}. It will hold over the pad.', { time: fmt(JOB.FLARE_WAIT) }), '#ffd76a');
  raid.noise(p.x, p.z, 40);
  raid.emit({ t: 'flare', x: p.x, z: p.z });
  raid.sfx('banner');
}
// The van's radio waits in its container like any other cargo (doc 61).
export function radioIn(raid, c, st) {
  const j = jobOf(raid, 'van');
  if (!j || j.radio !== c.id || j.delivered || j.state !== 'active') return;
  st.items.push({ uid: `radio-job${raid.districtStep}:${j.id}`, kind: 'loot', name: 'Dispatch Radio', value: Math.round(140 * (1 + 0.1 * c.zone)) });
}

// ---------------------------------------------------------------- what the HUD and the map show
// One entry per known job: its state in a line, a meter where it has one, its terms.
export function jobLines(raid) {
  const out = [];
  if (!raid.jobs) return out;
  for (const j of raid.jobs.list) {
    if (j.state === 'hidden') continue;
    const e = { id: j.id, kind: j.kind, name: j.name, state: j.state, stars: j.stars, meter: null, line: null, terms: JOB_TERMS[j.kind] };
    if (j.state === 'known') e.line = message('Waiting at {ref}', { ref: raid.world.refAt(j.x, j.z) });
    else if (j.state === 'failed') e.line = j.why;
    else if (j.kind === 'escort') {
      if (j.state === 'active') { e.line = message('{safe} safe · {lost} lost · {time}', { safe: j.arrived, lost: j.lost, time: fmt(JOB.ESCORT_TIME - j.t) }); e.meter = j.arrived / JOB.PATIENTS; }
      else e.line = message('{safe} of {total} reached the Shelter', { safe: j.arrived, total: JOB.PATIENTS });
    } else if (j.kind === 'van') {
      if (j.state === 'active') e.line = message('Ramp {ramp} · radio {radio}', { ramp: message(j.cleared ? 'clear' : 'held'), radio: message(j.delivered ? 'delivered' : 'missing') });
      else e.line = j.gone ? 'The van has left' : message('Board within {time}', { time: fmt(j.waitT) });
    } else if (j.state === 'active') { e.line = message('Wave {n}/{total} · mast {hp}%', { n: j.wave, total: JOB.RELAY_WAVES, hp: Math.round(100 * j.hp / JOB.RELAY_HP) }); e.meter = j.meter; }
    else e.line = 'The Dock Boat is answering';
    out.push(e);
  }
  return out;
}
// Jobs as route targets (src/sim/route.js): the site, or for the van's radio its container.
export function jobTargets(raid) {
  const out = [];
  if (!raid.jobs) return out;
  for (const j of raid.jobs.list) {
    if (j.state === 'hidden' || j.state === 'failed' || (j.state === 'done' && !(j.kind === 'van' && !j.gone))) continue;
    out.push({ kind: 'job', id: j.id, x: j.x, z: j.z, reach: 3, los: false, label: message('{name}, {ref}', { name: message(j.name), ref: raid.world.refAt(j.x, j.z) }) });
    if (j.kind === 'van' && j.state === 'active' && !j.delivered) {
      const c = raid.world.containers[j.radio];
      if (c && !raid.cont[c.id].opened) out.push({ kind: 'jobradio', id: j.id, x: c.x, z: c.z, reach: 2, los: false, label: message('Dispatch radio, {ref}', { ref: raid.world.refAt(c.x, c.z) }) });
    }
  }
  return out;
}
export function jobTargetOn(raid, T) {
  const j = raid.jobs && raid.jobs.list[T.id];
  if (!j) return false;
  if (T.kind === 'jobradio') return j.state === 'active' && !j.delivered;
  return !(j.state === 'failed' || (j.state === 'done' && (j.kind !== 'van' || j.gone)));
}
