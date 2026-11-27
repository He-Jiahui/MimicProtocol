// Training Annex script (doc 16, Phase A). Stages A1 to A8, guided by Relay.
// Lines fire on objective state, never on a timer; an idle player gets a repeat.

import { dist } from '../core/math.js';
import { controlHint, message } from '../i18n/index.js';

const CASE = () => ({ kind: 'loot', name: 'Sealed Data Case', value: 100, tutorial: true });
// Fixed Rare roll so tests and screenshots are stable (doc 16, section 4).
const CARAPACE = () => ({
  uid: 'tutorial-carapace', kind: 'gear', slot: 'body', rarity: 2, ilvl: 12, enh: 0, prime: false, unid: true, tutorial: true,
  name: 'Resonant Carapace', value: 195, affixes: [{ k: 'hp', v: 8.4 }, { k: 'dr', v: 3.9 }],
});

export const trainingContainerItem = (index) => index === 1 ? CARAPACE() : { ...CASE(), uid: `tutorial-case-${index}` };

export function makeTutorial() {
  const S = {
    stage: 0, t: 0, idle: 0, n: 0, sub: 0, prog: 0, shots: 0, blockExtract: true, cameraToggled: false, opened: 0,
    dummies: [], mimics: [], elite: null, strikes: 0, strikeT: 0, pendingStrike: false, scanSeen: false,
  };
  const STAGES = [
    { id: 'A1', title: 'Move and aim', line: controlHint(
      'Relay: Comms check. WASD to move, mouse to aim. Reach the three markers, then press V to change camera.',
      'Relay: Left stick to move, right stick to aim and fire. Reach three markers, then open the menu and toggle camera.') },
    { id: 'A2', title: 'Search', line: controlHint(
      'Relay: Hold E to search. Open all three containers. Locked ones take longer.',
      'Relay: Hold Use to search all three containers.') },
    { id: 'A3', title: 'Attack and skill', line: controlHint(
      'Relay: Left mouse paints Suppression. Hit all five dummies, then right mouse: Piercing Line bursts around every Suppressed body it crosses.',
      'Relay: Aim and fire at five dummies to paint Suppression. Tap Skill: Piercing Line bursts around every Suppressed body it crosses.') },
    { id: 'A4', title: 'Dodge', line: controlHint(
      'Relay: Red ground means incoming. Press Shift to roll through or out of two strikes.',
      'Relay: Tap Dodge to roll through or out of two strikes.') },
    { id: 'A5', title: 'Cells and ultimate', line: controlHint(
      'Relay: Every 24 rounds that land load a rifle cell: the pips under your reticle. While Piercing Line cools, right mouse again spends a cell to fire at once. R: the Barrage takes every cell.',
      'Relay: Every 24 rounds that land load a rifle cell: the pips under your reticle. While Skill cools, tap it again to spend a cell. Ultimate: the Barrage takes every cell.') },
    { id: 'A6', title: 'Scan and first kills', line: controlHint(
      'Relay: Mimics look human. Press C to scan. The link works both ways: they will turn. Kill three.',
      'Relay: Tap Scan in the east bay to reveal the Mimics, then kill three.') },
    { id: 'A7', title: 'Elite', line: 'Relay: Elite. Armored plate soaks half your damage until it breaks. Burst it down.' },
    { id: 'A8', title: 'Extraction', line: controlHint(
      'Relay: Good. Stand in the green ring and hold E for six seconds. Damage interrupts the channel.',
      'Relay: Stand in the green ring and hold Use for six seconds. Damage interrupts extraction.') },
  ];

  const begin = (raid, i) => {
    S.stage = i; S.t = 0; S.idle = 0; S.n = 0; S.sub = 0;
    const st = STAGES[i], A = raid.world.annexData;
    raid.relay(st.line);
    raid.sfx('contract');
    raid.markers = null;
    if (i === 0) raid.markers = A.waypoints.map((w) => ({ ...w, r: 2.2 }));
    if (i === 1) raid.markers = A.containers.map((c) => ({ x: c.x, z: c.z, r: 1.4, col: [0.3, 0.9, 1] }));
    if (i === 2 || i === 4) {
      for (const d of S.dummies) d.dead = true;
      S.dummies = A.dummies.map((d) => { const e = raid.spawnEnemy('dummy', d.x, d.z, { state: 'static' }); e.face = -Math.PI / 2; e.hp = e.maxHp = 400; e.noDrop = true; return e; });
    }
    if (i === 3) { S.strikes = 0; S.strikeT = 1.5; raid.markers = [{ x: A.strike.x, z: A.strike.z, r: 5, col: [1, 0.6, 0.2] }]; }
    if (i === 5) {
      for (const d of S.dummies) d.dead = true;
      S.scanBase = raid.scanFx;
      S.mimics = A.mimics.map((m) => { const e = raid.spawnEnemy('walker', m.x, m.z, { state: 'disguised', flat: true }); e.waitT = 1e9; e.flip = 2.2; return e; });
      for (const [x, z] of [[130, 112], [146, 110]]) { const c = raid.spawnEnemy('walker', x, z, { state: 'civ', isMimic: false, flat: true }); c.waitT = 1e9; c.hp = c.maxHp = 40; c.xp = 0; c.credits = 0; }
    }
    if (i === 6) { S.elite = raid.spawnEnemy('walker', A.elite.x, A.elite.z, { state: 'revealing', flat: true, elite: ['armored'] }); S.elite.revealT = 1; }
    if (i === 7) { S.blockExtract = false; raid.markers = [{ x: A.extract.x, z: A.extract.z, r: 2, col: [0.2, 1, 0.45] }]; }
  };

  return Object.assign(S, {
    stages: STAGES,
    start(raid) { raid.banner('TRAINING ANNEX', 'Command liaison: Relay', '#7ac4ff'); begin(raid, 0); },
    note(what) { if (what === 'camera') S.cameraToggled = true; },
    onContainer(raid, c) {
      // Guaranteed items: 2 Sealed Data Cases and 1 Unidentified Mimic Carapace (doc 16, A2).
      const A = raid.world.annexData, idx = A.containers.indexOf(c);
      if (idx < 0) return false;
      raid.addInv(trainingContainerItem(idx));
      S.opened++;
      return true;
    },
    objective() {
      const st = STAGES[S.stage];
      let prog = '';
      if (S.stage === 0) prog = S.cameraToggled ? message('{count}/3 markers, camera done', { count: S.n })
        : controlHint('{count}/3 markers, press V', '{count}/3 markers, then Menu → Toggle camera', { count: S.n });
      if (S.stage === 1) prog = message('{count}/3 containers', { count: S.opened });
      if (S.stage === 2) prog = S.sub === 0 ? message('{count}/5 dummies hit', { count: S.n }) : controlHint('Use right mouse (M2)', 'Tap Skill');
      if (S.stage === 3) prog = message('{count}/2 strikes avoided', { count: S.strikes });
      if (S.stage === 4) prog = S.sub === 0 ? message('{count}/24 rounds to a cell', { count: Math.floor(S.prog) })
        : S.sub === 1 ? controlHint('Right mouse while Piercing Line cools', 'Tap Skill while it cools') : controlHint('Press R', 'Tap Ultimate');
      if (S.stage === 5) prog = S.sub === 0 ? controlHint('Enter the east bay and press C to scan', 'Enter the east bay and tap Scan') : message('{count}/3 Mimics killed', { count: S.n });
      if (S.stage === 6) prog = 'Kill the elite';
      if (S.stage === 7) prog = controlHint('Hold E in the green ring', 'Hold Use in the green ring');
      return { id: st.id, title: st.title, progress: prog, index: S.stage, total: STAGES.length };
    },
    update(raid, dt) {
      const p = raid.player, A = raid.world.annexData;
      S.t += dt; S.idle += dt;
      // After 20 s idle on a step Relay repeats the hint (doc 16, section 2).
      if (S.idle > 20) { S.idle = 0; raid.relay(STAGES[S.stage].line); }
      switch (S.stage) {
        case 0: {
          if (raid.markers && raid.markers.length) {
            const before = raid.markers.length;
            raid.markers = raid.markers.filter((m) => dist(p.x, p.z, m.x, m.z) > 2.2);
            if (raid.markers.length < before) { S.n += before - raid.markers.length; S.idle = 0; raid.sfx('pickup'); }
          }
          if (S.n >= 3 && S.cameraToggled) begin(raid, 1);
          break;
        }
        case 1: {
          raid.markers = A.containers.filter((c) => !raid.cont[c.id].opened).map((c) => ({ x: c.x, z: c.z, r: 1.4, col: [0.3, 0.9, 1] }));
          if (S.opened >= 3) begin(raid, 2);
          break;
        }
        case 2: {
          if (S.sub === 0) {
            S.n = S.dummies.filter((d) => d.hp < d.maxHp).length;
            if (S.n >= 5) { S.sub = 1; S.idle = 0; raid.relay(controlHint('Relay: Stacks are on. Right mouse to spend them.', 'Relay: Stacks are on. Tap Skill to spend them.')); }
          } else if (p.cd.m2 > 0) begin(raid, 3);
          break;
        }
        case 3: {
          S.strikeT -= dt;
          if (S.strikeT <= 0 && !S.pendingStrike) {
            S.pendingStrike = true;
            let hit = false;
            raid.enemyBlast(p.x, p.z, 3.6, 1.3, 14, [1, 0.15, 0.1], {
              onHit: () => { hit = true; },
              after: () => {
                S.pendingStrike = false; S.strikeT = 1.6;
                if (!hit) { S.strikes++; S.idle = 0; raid.toast('Strike avoided', '#8fffb0', 'complete'); } else raid.relay(controlHint('Relay: That one landed. Roll with Shift as the ring fills.', 'Relay: Tap Dodge as the ring fills.'));
              },
            });
          }
          if (S.strikes >= 2 && !S.pendingStrike) begin(raid, 4);
          break;
        }
        case 4: {
          // Load a cell, spend it through the cooldown, then the Barrage. The steps guide, never
          // block: the Barrage always moves on.
          S.prog = p.cellProg;
          if (S.sub === 0 && p.cells > 0) { S.sub = 1; S.idle = 0; S.shots = p.cellShots; raid.relay(controlHint('Relay: Cell loaded. Fire Piercing Line, then right mouse again while it cools.', 'Relay: Cell loaded. Tap Skill, then tap it again while it cools.')); }
          else if (S.sub === 1 && p.cellShots > S.shots) { S.sub = 2; S.idle = 0; raid.relay(controlHint('Relay: That shot cost a cell, not a cooldown. Now press R.', 'Relay: That shot cost a cell, not a cooldown. Now tap Ultimate.')); }
          if (p.cd.r > 0 && !p.channel) begin(raid, 5);
          break;
        }
        case 5: {
          // The step needs a scan that actually opens links: the pulse reaches 35 m.
          if (S.sub === 0 && S.mimics.some((m) => m.linkT > 0 || m.state !== 'disguised')) { S.sub = 1; S.idle = 0; raid.relay('Relay: Three contacts. Civilians read as HUMAN: do not shoot them.'); }
          else if (S.sub === 0 && raid.scanFx && raid.scanFx !== S.scanBase) { S.scanBase = raid.scanFx; raid.relay('Relay: Nothing in range. The pulse reaches 35 metres: move into the east bay and scan again.'); }
          S.n = S.mimics.filter((m) => m.dead).length;
          if (S.n >= 3) begin(raid, 6);
          break;
        }
        case 6: if (S.elite && S.elite.dead) begin(raid, 7); break;
        default: break;
      }
    },
  });
}
