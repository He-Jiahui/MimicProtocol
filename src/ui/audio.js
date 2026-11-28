// Synthesised WebAudio only: no audio files (doc 13, section 10 leaves this open).

export class AudioSys {
  constructor() { this.ctx = null; this.vol = 0.6; this.last = {}; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    // Shared noise buffer.
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.04 * w) / 1.04; d[i] = w * 0.5 + b * 3; }
    this.noiseBuf = buf;
    // Ambient bed: rain hiss and a low city drone.
    const rain = ctx.createBufferSource(); rain.buffer = buf; rain.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 2600; rf.Q.value = 0.4;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0.05;
    rain.connect(rf); rf.connect(this.rainGain); this.rainGain.connect(this.master); rain.start();
    const drone = ctx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 46;
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 120;
    const dg = ctx.createGain(); dg.gain.value = 0.05;
    drone.connect(df); df.connect(dg); dg.connect(this.master); drone.start();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  setAmbient(wet) { if (this.rainGain) this.rainGain.gain.value = 0.015 + 0.06 * wet; }

  tone(freq, dur, type = 'sine', gain = 0.2, to = null, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, gain = 0.2, freq = 1800, type = 'bandpass', delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = 0.7;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  // dist: metres from the listener, used for a simple falloff.
  play(name, dist = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || 0) < 0.035) return;
    this.last[name] = now;
    const a = 1 / (1 + (dist * dist) / 500);
    if (a < 0.04) return;
    switch (name) {
      case 'shot': this.noise(0.07, 0.22 * a, 2400); this.tone(190, 0.06, 'square', 0.08 * a, 70); break;
      case 'sentry': this.noise(0.05, 0.1 * a, 3200); break;
      case 'rail': this.tone(900, 0.3, 'sawtooth', 0.16 * a, 90); this.noise(0.25, 0.2 * a, 1200); break;
      case 'slash': this.noise(0.1, 0.16 * a, 4200, 'highpass'); break;
      case 'slash3': this.noise(0.16, 0.22 * a, 3000, 'highpass'); this.tone(520, 0.12, 'triangle', 0.08 * a, 180); break;
      case 'whirl': this.noise(0.3, 0.2 * a, 2200); this.tone(300, 0.3, 'sawtooth', 0.07 * a, 700); break;
      case 'dash': this.noise(0.18, 0.12, 900, 'lowpass'); break;
      case 'thump': this.tone(140, 0.12, 'sine', 0.2, 60); break;
      case 'pop': this.noise(0.18, 0.22 * a, 700, 'lowpass'); this.tone(90, 0.18, 'sine', 0.2 * a, 40); break;
      case 'spit': this.noise(0.12, 0.12 * a, 1500); this.tone(420, 0.1, 'sine', 0.06 * a, 200); break;
      case 'hiss': this.noise(0.5, 0.1 * a, 5200, 'highpass'); break;
      case 'deploy': this.tone(320, 0.08, 'square', 0.1, 640); this.tone(640, 0.1, 'square', 0.08, 640, 0.08); break;
      case 'hurt': this.tone(160, 0.16, 'sawtooth', 0.2, 60); this.noise(0.1, 0.14, 500, 'lowpass'); break;
      case 'kill': this.noise(0.16, 0.16 * a, 900, 'lowpass'); this.tone(260, 0.14, 'triangle', 0.1 * a, 70); break;
      case 'killbig': this.noise(0.45, 0.3 * a, 500, 'lowpass'); this.tone(120, 0.5, 'sawtooth', 0.16 * a, 30); break;
      case 'blast': this.noise(0.4, 0.3 * a, 420, 'lowpass'); this.tone(80, 0.4, 'sine', 0.3 * a, 30); break;
      case 'slam': this.noise(0.3, 0.3 * a, 300, 'lowpass'); this.tone(60, 0.35, 'sine', 0.35 * a, 28); break;
      case 'fuse': this.tone(600, 0.5, 'square', 0.07 * a, 1800); break;
      // A Shrike: heavy wingbeats as it flares over its mark (the dive warning, audible under a
      // roof), a shorter clap as it takes off, and a rising tear of air as it stoops.
      case 'wingbeat': for (let k = 0; k < 3; k++) { this.noise(0.16, (0.16 + k * 0.06) * a, 260, 'lowpass', k * 0.2); this.tone(70, 0.14, 'sine', (0.12 + k * 0.04) * a, 45, k * 0.2); } break;
      case 'flap': for (let k = 0; k < 2; k++) this.noise(0.12, 0.12 * a, 380, 'lowpass', k * 0.14); break;
      case 'dive': this.noise(0.36, 0.2 * a, 1400, 'bandpass'); this.tone(520, 0.34, 'sawtooth', 0.05 * a, 1500); break;
      case 'charge': this.tone(180, 0.9, 'sawtooth', 0.07 * a, 900); break;
      case 'break': this.noise(0.25, 0.25 * a, 3600, 'highpass'); this.tone(1200, 0.2, 'triangle', 0.1 * a, 300); break;
      case 'clank': this.tone(1700, 0.12, 'square', 0.05 * a, 1400); this.noise(0.06, 0.12 * a, 4200, 'highpass'); break;
      case 'reveal': this.tone(700, 0.35, 'sawtooth', 0.09 * a, 110); this.noise(0.3, 0.1 * a, 2600); break;
      case 'scan': this.tone(240, 0.7, 'sine', 0.16, 1500); this.tone(1500, 0.5, 'sine', 0.05, 300, 0.15); break;
      case 'pickup': this.tone(880, 0.08, 'sine', 0.12, 1320); break;
      case 'warn': this.tone(1500, 0.07, 'square', 0.05 * a, 1900); break;
      case 'wave': this.tone(98, 0.7, 'sawtooth', 0.1, 70); this.tone(196, 0.5, 'triangle', 0.06, 147, 0.1); break;
      case 'clean': this.tone(880, 0.09, 'sine', 0.12, 1760); this.tone(1320, 0.14, 'sine', 0.08, null, 0.07); break;
      case 'xp': this.tone(1320 + Math.random() * 300, 0.05, 'sine', 0.05, 1900); break;
      case 'coin': this.tone(1240, 0.07, 'square', 0.07); this.tone(1660, 0.12, 'square', 0.07, null, 0.07); break;
      case 'item': this.tone(520, 0.1, 'triangle', 0.14); this.tone(780, 0.1, 'triangle', 0.14, null, 0.09); this.tone(1040, 0.2, 'triangle', 0.14, null, 0.18); break;
      case 'level': this.tone(440, 0.12, 'square', 0.08); this.tone(660, 0.12, 'square', 0.08, null, 0.1); this.tone(880, 0.25, 'square', 0.08, null, 0.2); break;
      case 'open': this.noise(0.14, 0.14 * a, 700, 'lowpass'); this.tone(300, 0.08, 'square', 0.05 * a, 200); break;
      case 'door': this.noise(0.2, 0.12 * a, 500, 'lowpass'); this.tone(170, 0.18, 'triangle', 0.06 * a, 120); break;
      case 'rattle': this.noise(0.22, 0.2 * a, 1800, 'bandpass'); this.tone(95, 0.2, 'square', 0.05 * a, 80); break;
      case 'contract': this.tone(660, 0.12, 'sine', 0.12); this.tone(990, 0.22, 'sine', 0.12, null, 0.12); break;
      case 'banner': case 'zone': this.tone(110, 0.9, 'sawtooth', 0.09, 55); this.tone(330, 0.6, 'sine', 0.06, 220); break;
      case 'heal': this.tone(500, 0.3, 'sine', 0.12, 1000); break;
      case 'ult': this.tone(200, 0.5, 'sawtooth', 0.12, 800); this.noise(0.4, 0.12, 1600); break;
      case 'extract': this.tone(330, 0.6, 'sine', 0.1, 660); break;
      case 'boss': this.tone(55, 1.6, 'sawtooth', 0.22, 38); this.noise(1.2, 0.2, 240, 'lowpass'); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.14, null, i * 0.13)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.1, null, i * 0.18)); break;
      default: break;
    }
  }
}
