// Hit-stop (doc 64, Package 3; doc 25, section 2). During a hold the simulation runs at 10%
// speed while input, the reticle and rendering carry on at full rate. Only hits a player can
// identify hold: 30 ms for a crit, 50 ms for a hit taken of 15% of maximum health or more,
// 80 ms for an elite kill or a poise break; ordinary hits and ticks never do. The strongest
// request wins and holds never stack; at most 100 ms of hold in any real second, so sustained
// fire cannot stall the raid. A dodge press during a hold is kept for the next simulation step.
// No DOM here, so the rules are tested in Node.

export const HOLD = { crit: 0.03, heavyHurt: 0.05, eliteKill: 0.08, poise: 0.08 };
export const HOLD_SPEED = 0.1, HOLD_BUDGET = 0.1;

export class HitStop {
  constructor() { this.enabled = true; this.reset(); }
  // Pause, a new raid or the end of one: drop any hold and any kept press.
  reset() { this.hold = 0; this.now = 0; this.spent = []; this.dodge = false; }
  request(seconds) { if (this.enabled) this.hold = Math.max(this.hold, seconds); }
  // The raid's events of a frame, read for the moments worth a hold.
  fromEvents(events) {
    for (const e of events) {
      if (e.t === 'hitmark' && e.crit) this.request(HOLD.crit);
      else if (e.t === 'hurt' && e.heavy) this.request(HOLD.heavyHurt);
      else if (e.t === 'kill' && e.elite) this.request(HOLD.eliteKill);
      else if (e.t === 'poise') this.request(HOLD.poise);
    }
  }
  get holding() { return this.hold > 0; }
  // Real seconds in, simulated seconds out.
  advance(dt) {
    this.now += dt;
    while (this.spent.length && this.now - this.spent[0][0] >= 1) this.spent.shift();
    if (!this.enabled || this.hold <= 0) { this.hold = 0; return dt; }
    let used = 0;
    for (const [, s] of this.spent) used += s;
    const held = Math.min(dt, this.hold, Math.max(0, HOLD_BUDGET - used));
    // What the budget cannot cover is dropped, not deferred.
    this.hold = held < Math.min(dt, this.hold) ? 0 : this.hold - held;
    if (held > 0) this.spent.push([this.now, held]);
    return dt - held + held * HOLD_SPEED;
  }
  // One Shift press is kept through a hold, consumed by the next simulation step.
  pressDodge() { this.dodge = true; }
  takeDodge() { const d = this.dodge; this.dodge = false; return d; }
}
