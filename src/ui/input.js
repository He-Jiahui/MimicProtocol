// Keyboard, mouse and touch to simulation input (doc 15, section 5).
// Q and Space are deliberately unassigned in the demo.

import { clamp } from '../core/math.js';
import { TouchControls } from './touch.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, l: false, r: false };
    this.wheel = 0;
    this.locked = false;
    this.lockWanted = false;
    this.touch = new TouchControls(document.getElementById('touchControls'));
    this.touchMode = matchMedia('(pointer: coarse)').matches;
    this.playerScreen = [0, 0, 0];
    document.addEventListener('pointerdown', (e) => { this.touchMode = e.pointerType !== 'mouse'; }, true);
    this.onLockLost = null;
    this.sim = { mx: 0, mz: 0, aimX: 0, aimZ: 0, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false, aimHeld: false };
    this.dyaw = 0; this.dpitch = 0;

    addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' && (e.target.closest?.('input, select, button') || !document.getElementById('pause').classList.contains('hidden'))) return;
      if (['Tab', 'AltLeft', 'AltRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.touchMode = false;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.locked) { this.dyaw += e.movementX; this.dpitch += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.touchMode) return;
      if (e.button === 0) this.mouse.l = true;
      if (e.button === 2) this.mouse.r = true;
      if (this.lockWanted && !this.locked) this.requestLock();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.lockWanted && this.onLockLost) this.onLockLost();
    });
  }

  requestLock() {
    if (this.touchMode) return;
    this.lockWanted = true;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not available */ }
  }
  releaseLock() {
    this.lockWanted = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  take(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.wheel = 0; this.dyaw = 0; this.dpitch = 0; }

  // Build the per-frame simulation input from device state and the camera.
  build(scene, raid, dt) {
    const s = this.sim, k = this.keys, c = scene.cam;
    const shoulder = c.blend > 0.5;
    const f = -this.touch.move.y + (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), r = this.touch.move.x + (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (shoulder) {
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      s.mx = sy * f + cy * r; s.mz = -cy * f + sy * r;
    } else { s.mx = r; s.mz = -f; }
    s.aimHeld = k.has('AltLeft');

    let ndcX = (this.mouse.x / innerWidth) * 2 - 1, ndcY = 1 - (this.mouse.y / innerHeight) * 2;
    if (shoulder) {
      if (this.touchMode) {
        c.yaw += this.touch.aim.x * 2.8 * dt;
        c.pitch = clamp(c.pitch + this.touch.aim.y * 1.5 * dt, -0.35, 0.87);
        ndcX = ndcY = 0;
      } else if (this.locked) {
        c.yaw += this.dyaw * 0.0024;
        c.pitch = clamp(c.pitch + this.dpitch * 0.002, -0.35, 0.87);
        ndcX = 0; ndcY = 0;
      } else {
        // Without pointer lock, the cursor near the screen edge turns the camera.
        if (Math.abs(ndcX) > 0.35) c.yaw += Math.sign(ndcX) * (Math.abs(ndcX) - 0.35) * 3.2 * dt;
        c.pitch = clamp(c.pitch + (Math.abs(ndcY) > 0.5 ? -Math.sign(ndcY) * (Math.abs(ndcY) - 0.5) * 1.6 * dt : 0), -0.35, 0.87);
      }
    } else if (this.wheel) c.dist = clamp(c.dist + this.wheel * 3, 24, 54);
    if (!shoulder && this.touchMode) {
      // Aim from the operator's projected position, even while the camera follows.
      const p = this.playerScreen, d = this.touch.direction, reach = Math.min(innerWidth, innerHeight) * 0.19;
      if (!scene.toScreen(raid.player.x, 1.2, raid.player.z, innerWidth, innerHeight, p)) { p[0] = innerWidth / 2; p[1] = innerHeight / 2; }
      ndcX = (p[0] + reach * d.x) * 2 / innerWidth - 1;
      ndcY = 1 - (p[1] + reach * d.y) * 2 / innerHeight;
    }
    const a = scene.aimPoint(ndcX, ndcY, raid);
    // A bad camera frame must not poison the aim (and through it, the next camera).
    if (!Number.isFinite(a[0]) || !Number.isFinite(a[1])) { a[0] = raid.player.x; a[1] = raid.player.z - 1; }
    s.aimX = a[0]; s.aimZ = a[1];
    s.m1 = this.mouse.l; s.m2 = this.mouse.r;
    s.dodge = k.has('ShiftLeft') || k.has('ShiftRight');
    s.ult = k.has('KeyR'); s.scan = k.has('KeyC'); s.interact = k.has('KeyE'); s.quick1 = k.has('Digit1');
    for (const action of ['m1', 'm2', 'dodge', 'ult', 'scan', 'interact', 'quick1']) s[action] ||= this.touch.active(action);
    this.ndcX = ndcX; this.ndcY = ndcY;
    return s;
  }
}
