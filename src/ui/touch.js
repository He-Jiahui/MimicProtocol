// Each thumb owns its element until release, even when dragged outside the pad.
export class TouchControls {
  constructor(root) {
    this.root = root;
    this.owners = new Map();
    this.held = new Set();
    this.taps = new Set();
    this.move = { x: 0, y: 0 };
    this.aim = { x: 0, y: 0 };
    this.direction = { x: 0, y: -1 };
    root.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-stick], [data-action]');
      if (!el || this.owners.has(el) || e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.owners.set(el, e.pointerId);
      el.classList.add('held');
      if (el.dataset.stick) this.updateStick(el, e);
      if (el.dataset.action) {
        this.held.add(el.dataset.action);
        this.taps.add(el.dataset.action);
      }
    });
    root.addEventListener('pointermove', (e) => {
      const el = e.target;
      if (el.dataset.stick && this.owners.get(el) === e.pointerId) this.updateStick(el, e);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(type, (e) => {
      if (this.owners.get(e.target) === e.pointerId) this.release(e.target, type !== 'pointerup');
    });
    addEventListener('blur', () => this.reset());
    addEventListener('resize', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  updateStick(el, e) {
    const r = el.getBoundingClientRect(), radius = r.width * 0.34;
    const dx = (e.clientX - r.left - r.width / 2) / radius;
    const dy = (e.clientY - r.top - r.height / 2) / radius;
    const len = Math.hypot(dx, dy), v = this[el.dataset.stick];
    v.x = len < 0.12 ? 0 : dx / Math.max(1, len);
    v.y = len < 0.12 ? 0 : dy / Math.max(1, len);
    el.style.setProperty('--dx', `${v.x * radius}px`);
    el.style.setProperty('--dy', `${v.y * radius}px`);
    if (el.dataset.stick === 'aim' && len >= 0.12) this.direction = { x: dx / len, y: dy / len };
  }
  release(el, cancelled) {
    const id = this.owners.get(el);
    this.owners.delete(el);
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    el.classList.remove('held');
    if (el.dataset.stick) {
      this[el.dataset.stick].x = this[el.dataset.stick].y = 0;
      el.style.removeProperty('--dx'); el.style.removeProperty('--dy');
    }
    this.held.delete(el.dataset.action);
    if (cancelled) this.taps.delete(el.dataset.action);
  }
  reset() {
    for (const el of this.owners.keys()) this.release(el, true);
    this.taps.clear();
  }
  active(action) { return this.held.has(action) || this.taps.has(action); }
  // A quick press between fixed simulation steps must still reach one step.
  consumed() { this.taps.clear(); }
}
