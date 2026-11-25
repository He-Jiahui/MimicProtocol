// Dev aid: drives the real input layer (keys and mouse) so a session can be
// exercised end to end without a human. Load from the console:
//   const auto = await import('/tools/autoplay.js'); auto.tutorial(); auto.fight();
// It only writes to game.input, exactly as the keyboard and mouse would.

const g = () => window.__game;
let timer = null;
const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyC', 'ShiftLeft', 'Digit1'];

export function stop() {
  clearInterval(timer); timer = null;
  const i = g().input;
  for (const k of KEYS) i.keys.delete(k);
  i.mouse.l = i.mouse.r = false;
}
let current = null;
function run(fn) { stop(); current = fn; timer = setInterval(() => { try { fn(g()); } catch (e) { console.error('autoplay', e); stop(); } }, 16); }

// Fast-forward: run the current policy and the game loop synchronously for a number
// of simulated seconds. Useful when the tab is throttled in the background.
export function fast(seconds, policy = current) {
  clearInterval(timer); timer = null;
  const game = g();
  let t = Math.max(game.last, performance.now());
  for (let i = 0; i < seconds * 60; i++) {
    if (policy && game.raid && !game.raid.over) policy(game);
    t += 1000 / 60;
    game.tick(t);
    if (game.state !== 'raid' && game.state !== 'tutorial') break;
  }
  return game.state;
}

function walk(game, x, z, stopAt = 0.6) {
  const p = game.raid.player, i = game.input, dx = x - p.x, dz = z - p.z;
  const set = (k, on) => (on ? i.keys.add(k) : i.keys.delete(k));
  const far = Math.hypot(dx, dz) > stopAt;
  set('KeyD', far && dx > 0.35); set('KeyA', far && dx < -0.35); set('KeyS', far && dz > 0.35); set('KeyW', far && dz < -0.35);
  return !far;
}
function aim(game, x, z) {
  const out = [0, 0, 0];
  if (game.scene.toScreen(x, 1.2, z, innerWidth, innerHeight, out)) { game.input.mouse.x = out[0]; game.input.mouse.y = out[1]; }
}
// Route around the annex half walls through their gaps.
function annexWalk(game, x, z, stopAt) {
  const p = game.raid.player;
  for (const wx of [80.5, 120.5]) {
    if ((p.x < wx - 1 && x > wx + 1) || (p.x > wx + 1 && x < wx - 1)) {
      if (Math.abs(p.z - 100) > 5) return walk(game, p.x < wx ? wx - 3 : wx + 3, 100, 0.8) && false;
      return walk(game, x > p.x ? wx + 3 : wx - 3, 100, 0.5) && false;
    }
  }
  return walk(game, x, z, stopAt);
}

export function tutorial() {
  let toggled = 0;
  run((game) => {
    const raid = game.raid;
    if (!raid || raid.mode !== 'tutorial' || raid.over) return;
    const S = raid.script, p = raid.player, i = game.input, A = raid.world.annexData;
    for (const k of ['KeyE', 'KeyR', 'KeyC', 'ShiftLeft']) i.keys.delete(k);
    i.mouse.l = i.mouse.r = false;
    const tgt = raid.nearestTarget(p.x, p.z, 40);
    if (S.stage > 0 && game.scene.cam.mode !== 'top') game.toggleCamera();
    switch (S.stage) {
      case 0:
        if (raid.markers && raid.markers.length) annexWalk(game, raid.markers[0].x, raid.markers[0].z, 0.5);
        else if (toggled < 2) { game.toggleCamera(); toggled++; }
        break;
      case 1: {
        const c = A.containers.find((k) => !raid.cont[k.id].opened);
        if (c && annexWalk(game, c.x, c.z + 1.4, 0.5)) i.keys.add('KeyE');
        break;
      }
      case 2: {
        if (!annexWalk(game, 102, 112, 1)) break;
        const d = S.dummies.find((k) => k.hp >= k.maxHp) || S.dummies[2];
        aim(game, d.x, d.z);
        if (S.sub === 0) i.mouse.l = true; else i.mouse.r = true;
        break;
      }
      case 3: {
        walk(game, A.strike.x, A.strike.z, 3);
        for (const a of raid.areas) if (a.kind === 'tele' && a.life - a.t < 0.2) i.keys.add('ShiftLeft');
        break;
      }
      case 4: aim(game, 102, 126); i.keys.add('KeyR'); break;
      case 5: case 6: {
        if (!annexWalk(game, 128, 100, 2)) break;
        if (S.stage === 5 && S.sub === 0) i.keys.add('KeyC');
        if (tgt) { aim(game, tgt.x, tgt.z); i.mouse.l = true; i.mouse.r = true; if (raid.hostileCount() > 1) i.keys.add('KeyR'); }
        for (const a of raid.areas) if (a.kind === 'tele' && a.life - a.t < 0.2) i.keys.add('ShiftLeft');
        break;
      }
      case 7: if (annexWalk(game, A.extract.x, A.extract.z, 1.5)) i.keys.add('KeyE'); break;
      default: break;
    }
  });
}

// Stand and fight: aim at the nearest hostile, fire, scan, dodge telegraphs.
export function fight({ scan = true, goal = null } = {}) {
  let scanT = 0;
  run((game) => {
    const raid = game.raid;
    if (!raid || raid.over) return;
    const p = raid.player, i = game.input;
    for (const k of ['KeyE', 'KeyR', 'KeyC', 'ShiftLeft', 'Digit1']) i.keys.delete(k);
    const tgt = raid.nearestTarget(p.x, p.z, 30, null, true);
    i.mouse.l = i.mouse.r = !!tgt;
    if (tgt) {
      aim(game, tgt.x, tgt.z);
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z), melee = p.classId === 'blade';
      if (melee) walk(game, tgt.x, tgt.z, 2.2); else if (d < 7) walk(game, p.x - (tgt.x - p.x), p.z - (tgt.z - p.z), 0); else walk(game, p.x, p.z);
      if (raid.hostileCount() >= 3) i.keys.add('KeyR');
    } else if (goal) { if (walk(game, goal.x, goal.z, 1.5) && raid.prompt) i.keys.add('KeyE'); } else walk(game, p.x, p.z);
    for (const a of raid.areas) if (a.kind === 'tele' && Math.hypot(a.x - p.x, a.z - p.z) < a.r + 0.6 && a.life - a.t < 0.25) i.keys.add('ShiftLeft');
    if (p.hp < p.maxHp * 0.4) i.keys.add('Digit1');
    if (scan && (scanT -= 0.016) <= 0) { scanT = 10; i.keys.add('KeyC'); }
  });
}
