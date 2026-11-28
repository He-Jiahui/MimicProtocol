// Entry point: boot WebGPU, generate the worlds, run the fixed-step loop and
// switch between title, training annex, hub, raid and debrief.

import { Renderer } from './render/gpu.js';
import { Scene } from './render/scene.js';
import { generateWorld } from './sim/world.js';
import { Raid, stepRaid } from './sim/raid.js';
import { makeTutorial } from './sim/tutorial.js';
import { gearStats, starterItem } from './sim/loot.js';
import { SLOTS, CLASS_IDS } from './sim/data.js';
import { newProfile, loadProfile, saveProfile, applyRaidResult, syncHubTutorial, activePack, deployedDrone, deployment, PROFILE_KEY } from './sim/profile.js';
import { Input } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { AudioSys } from './ui/audio.js';
import { showTitle, showHub, showDebrief, showLift, clearScreen } from './ui/hub.js';
import { LANGUAGE_KEY, LANGUAGES, selectLanguage, setLanguage, t } from './i18n/index.js';

const STEP = 1 / 60;
const CITY_SEED = 20261125; // the first raid uses one fixed district seed (doc 17)
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

function updateLanguage(locale) {
  const language = setLanguage(locale);
  document.documentElement.lang = language;
  document.title = t('MIMIC PROTOCOL');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  $('language').value = language;
}

function initLanguage() {
  let stored;
  try { stored = localStorage.getItem(LANGUAGE_KEY); } catch { stored = null; }
  const select = $('language');
  for (const [locale, label] of Object.entries(LANGUAGES)) select.add(new Option(label, locale));
  updateLanguage(selectLanguage(stored, navigator.language));
  select.onchange = () => {
    updateLanguage(select.value);
    try { localStorage.setItem(LANGUAGE_KEY, select.value); } catch {}
    game.refreshLanguage();
  };
}

function fatal(msg) {
  const el = $('fatal');
  el.textContent = msg;
  el.classList.remove('hidden');
}

const game = {
  state: 'boot', profile: null, renderer: null, scene: null, hud: null, input: null, audio: new AudioSys(),
  raid: null, idle: null, city: null, annex: null, minimap: null, paused: false, acc: 0, overT: 0, last: 0, fps: 0, hitStop: 0,

  save() { try { saveProfile(localStorage, this.profile); } catch (e) { console.warn('Profile save failed', e); } },

  // ---- graphics settings: presets plus individual controls, kept across sessions ----
  PRESETS: {
    low: { scale: 0.6, shadows: false, textures: false, bloom: 0.8, dof: false, distort: false, rain: 0.3, reach: 0.6, shake: 1 },
    medium: { scale: 0.8, shadows: true, textures: true, bloom: 1, dof: false, distort: true, rain: 0.6, reach: 0.8, shake: 1 },
    high: { scale: 1, shadows: true, textures: true, bloom: 1, dof: true, distort: true, rain: 1, reach: 1, shake: 1 },
    ultra: { scale: 1, shadows: true, textures: true, bloom: 1.1, dof: true, distort: true, rain: 1.4, reach: 1.4, shake: 1 },
  },
  settings: null,
  loadSettings() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('mimicprotocol.settings.v1')); } catch { /* use defaults */ }
    this.settings = { preset: 'high', fps: params.has('debug'), volume: 0.6, ...this.PRESETS.high, ...(s || {}) };
    this.applySettings();
  },
  applySettings() {
    const s = this.settings, r = this.renderer, sc = this.scene;
    r.quality = s.scale; r.opts.shadows = s.shadows; r.opts.textures = s.textures; r.opts.reach = s.reach;
    Object.assign(sc.opts, { shake: s.shake, distort: s.distort, dof: s.dof, rain: s.rain, bloom: s.bloom });
    r.resize();
    this.audio.setVolume(s.volume);
    $('fps').classList.toggle('hidden', !s.fps);
    try { localStorage.setItem('mimicprotocol.settings.v1', JSON.stringify(s)); } catch { /* private mode */ }
  },
  buildSettingsUI() {
    const s = this.settings, el = $('gfx');
    const slider = (k, label, min, max) => `<label>${t(label)}<span><input type="range" data-k="${k}" min="${min}" max="${max}" value="${Math.round(s[k] * 100)}"><output>${Math.round(s[k] * 100)}%</output></span></label>`;
    const check = (k, label) => `<label>${t(label)}<input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}></label>`;
    el.innerHTML = `<div class="presets">${Object.keys(this.PRESETS).map((p) => `<button data-preset="${p}" class="${s.preset === p ? 'on' : ''}">${t(p.toUpperCase())}</button>`).join('')}</div>`
      + slider('scale', 'Render scale', 40, 100) + slider('reach', 'Draw distance', 50, 150) + slider('bloom', 'Bloom', 0, 150) + slider('rain', 'Rain density', 0, 150) + slider('shake', 'Camera shake', 0, 150)
      + check('shadows', 'Shadows') + check('textures', 'Surface textures') + check('dof', 'Depth of field') + check('distort', 'Shock distortion') + check('fps', 'FPS counter');
    el.onclick = (e) => { const p = e.target.dataset.preset; if (!p) return; Object.assign(s, this.PRESETS[p], { preset: p }); this.applySettings(); this.buildSettingsUI(); };
    el.oninput = (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      if (e.target.type === 'checkbox') s[k] = e.target.checked; else { s[k] = Number(e.target.value) / 100; e.target.nextElementSibling.textContent = `${e.target.value}%`; }
      s.preset = 'custom';
      this.applySettings();
    };
    $('volume').value = Math.round(s.volume * 100);
  },
  openSettings() {
    this.settingsOnly = true;
    this.buildSettingsUI();
    this.updatePauseLabels();
    $('touchNav').classList.add('hidden');
    $('pause').classList.remove('hidden');
  },
  updatePauseLabels() {
    $('pauseTitle').textContent = t(this.settingsOnly ? 'SETTINGS' : 'PAUSED');
    $('resumeBtn').textContent = t(this.settingsOnly ? 'Close' : 'Resume');
    $('abandonBtn').textContent = t(this.state === 'tutorial' ? 'Leave training' : 'Abandon raid');
    $('abandonBtn').classList.toggle('hidden', this.settingsOnly);
  },
  refreshLanguage() {
    this.updatePauseLabels();
    this.buildSettingsUI();
    $('tooltip').classList.add('hidden');
    if (this.state === 'title') showTitle(this);
    if (this.state === 'hub') { if (this.profile.pendingLift) showLift(this); else showHub(this); }
    if (this.raid) this.hud.refreshLanguage();
  },
  resetProfile() {
    localStorage.removeItem(PROFILE_KEY);
    this.profile = newProfile();
    this.save();
    this.toTitle();
  },

  useWorld(world) {
    if (this.renderer.world !== world) this.renderer.setWorld(world);
  },
  // Backdrop behind menus: a slow turn at street level in the Neon Strip.
  backdrop() {
    this.useWorld(this.city);
    this.raid = null;
    this.hud.hide();
    this.input.touch.reset();
    this.input.releaseLock();
    const c = this.scene.cam;
    c.mode = 'shoulder'; c.blend = 1; c.pitch = -0.2;
  },
  toTitle() { this.state = 'title'; this.backdrop(); showTitle(this); },
  openHub() {
    if (syncHubTutorial(this.profile)) this.save();
    this.state = 'hub';
    this.backdrop();
    // A death's drone lift left unfinished (a closed tab) is offered again before anything else.
    if (this.profile.pendingLift) showLift(this); else showHub(this);
  },
  skipTutorial() {
    this.profile.tutorial.annex = true; this.profile.tutorial.done = true;
    this.save();
    this.openHub();
  },

  begin(raid, world) {
    clearScreen();
    this.input.touch.reset();
    this.input.touch.direction = { x: 0, y: -1 };
    this.useWorld(world);
    this.raid = raid;
    this.minimap = new Minimap(world);
    this.hud.setRaid(raid, this.minimap);
    const c = this.scene.cam;
    c.mode = 'top'; c.blend = 0; c.dist = world.annex ? 30 : 36; c.pitch = 0.18;
    this.scene.px = raid.player.x; this.scene.pz = raid.player.z;
    this.paused = false; this.acc = 0; this.overT = 0;
    $('pause').classList.add('hidden');
    this.audio.start();
  },
  startTutorial() {
    const eq = {};
    for (const s of SLOTS) eq[s] = starterItem(s);
    const raid = new Raid({ world: this.annex, seed: 1, classId: 'rifleman', tier: 1, gear: gearStats(eq), mode: 'tutorial', script: makeTutorial() });
    this.state = 'tutorial';
    this.begin(raid, this.annex);
  },
  startRaid() {
    const p = this.profile;
    const seed = (Date.now() ^ (p.seq++ * 7919)) >>> 0;
    const classId = CLASS_IDS.includes(params.get('class')) ? params.get('class') : p.classId;
    // The class tree leaves as a snapshot of the validated allocation (doc 64, Package 7).
    const dep = deployment(p, classId);
    const raid = new Raid({
      world: this.city, seed, classId, tier: p.tier, gear: gearStats(p.equipped), tree: dep.tree, mode: 'raid', pack: activePack(p), drone: deployedDrone(p),
      clockScale: Number(params.get('clock')) || 1, firstBossKill: p.stats.bossKills === 0,
    });
    if (params.has('tp')) { const [x, z] = params.get('tp').split(',').map(Number); raid.player.x = x; raid.player.z = z; this.city.resolveCircle(raid.player, 1); }
    if (params.has('god')) raid.noLethal = true;
    this.state = 'raid';
    this.begin(raid, this.city);
  },
  endRaid() {
    // The loss is saved at once; the drone lift, if any, is chosen next and saved on confirm.
    const d = applyRaidResult(this.profile, this.raid.result, { choose: true });
    this.save();
    this.state = 'debrief';
    this.backdrop();
    if (this.profile.pendingLift) showLift(this); else showDebrief(this, d);
  },

  setPaused(on) {
    if (this.state !== 'raid' && this.state !== 'tutorial') return;
    this.paused = on;
    this.settingsOnly = false;
    if (on) { this.input.touch.reset(); this.buildSettingsUI(); }
    $('touchNav').classList.remove('hidden');
    this.updatePauseLabels();
    $('pause').classList.toggle('hidden', !on);
    if (on) this.input.releaseLock(); else if (this.scene.cam.mode === 'shoulder') this.input.requestLock();
  },
  toggleCamera() {
    const c = this.scene.cam, p = this.raid.player;
    if (c.mode === 'top') {
      c.mode = 'shoulder';
      c.yaw = Math.atan2(Math.cos(p.face), -Math.sin(p.face));
      c.pitch = 0.16;
      this.input.requestLock();
    } else { c.mode = 'top'; this.input.releaseLock(); }
    if (this.raid.script && this.raid.script.note) this.raid.script.note('camera');
  },

  frame(now) {
    this.tick(now);
    requestAnimationFrame((t) => this.frame(t));
  },
  // One frame of work. Split from the rAF loop so tools can drive time directly.
  tick(now) {
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05;
    const r = this.renderer, scene = this.scene, input = this.input;
    const aspect = r.canvas.clientWidth / Math.max(1, r.canvas.clientHeight);

    if (this.state === 'raid' || this.state === 'tutorial') {
      const raid = this.raid;
      // UI keys.
      if (input.take('Escape')) this.setPaused(!this.paused);
      // Level-up and cache choices: number keys pick a card.
      if (raid.choice) for (let k = 0; k < raid.choice.ids.length; k++) if (input.take(`Digit${k + 1}`)) { document.getElementById('choice').classList.add('hidden'); raid.pickChoice(k); break; }
      if (!this.paused && !raid.over) {
        if (input.take('KeyV')) this.toggleCamera();
        // Left Alt (hold) is the temporary Aim view: start it looking where the operator faces.
        if (input.take('AltLeft') && scene.cam.mode === 'top') { const f = raid.player.face; scene.cam.yaw = Math.atan2(Math.cos(f), -Math.sin(f)); scene.cam.pitch = 0.16; }
        if (input.take('KeyM')) this.hud.toggleMap();
        if (input.take('Tab')) this.hud.toggleInv();
        if (this.hud.invOpen && input.take('KeyR')) this.hud.bag.action('rotate');
      }
      const blocked = this.paused || this.hud.mapOpen || this.hud.invOpen || raid.choice || raid.over;
      if (blocked) input.touch.reset();
      input.touch.blocked = !!blocked;
      this.hud.root.classList.toggle('controlsBlocked', !!blocked);
      const sim = input.build(scene, raid, dt);
      const frozen = this.paused || this.hud.mapOpen || this.hud.invOpen;
      // Hit-stop: a few frozen frames sell the weight of a heavy hit.
      if (this.hitStop > 0) this.hitStop -= dt;
      if (!frozen && this.hitStop <= 0) {
        this.acc = Math.min(this.acc + dt, 0.25);
        while (this.acc >= STEP) { stepRaid(raid, STEP, sim); input.touch.consumed(); this.acc -= STEP; }
      }
      const ev = raid.events;
      if (ev.length) {
        scene.handleEvents(ev);
        this.hud.handleEvents(ev);
        const p = raid.player;
        for (const e of ev) {
          if (e.t === 'sfx') this.audio.play(e.name, e.x === undefined ? 0 : Math.hypot(e.x - p.x, e.z - p.z));
          else if (e.t === 'kill' && e.big) this.hitStop = Math.max(this.hitStop, 0.075);
          else if (e.t === 'hitmark' && e.crit) this.hitStop = Math.max(this.hitStop, 0.022);
          else if (e.t === 'hurt') this.hitStop = Math.max(this.hitStop, 0.045);
        }
        ev.length = 0;
      }
      r.render(scene.build(raid, sim, frozen ? 0 : dt, aspect));
      this.hud.update(raid, scene, frozen ? 0 : dt, input);
      this.audio.setAmbient(raid.world.annex ? 0 : 0.6 + 0.4 * raid.nl);
      if (raid.over) {
        this.overT += dt;
        if (this.overT > 2.2) this.endRaid();
      }
    } else if (this.idle) {
      // Menu backdrop.
      const c = scene.cam;
      c.yaw += dt * 0.045;
      const idle = this.idle;
      idle.nl = 0.55 + 0.25 * Math.sin(now / 40000);
      r.render(scene.build(idle, { aimX: idle.player.x, aimZ: idle.player.z - 10, aimHeld: false }, dt, aspect));
    }
    // Frame counter: refreshed twice a second so it is readable.
    this.fpsT = (this.fpsT || 0) + dt;
    if (this.settings && this.settings.fps && this.fpsT > 0.5) {
      this.fpsT = 0;
      $('fps').textContent = t('{fps} FPS · {ms} ms · {instances} instances · {width}x{height}', {
        fps: this.fps.toFixed(0), ms: (1000 / Math.max(1, this.fps)).toFixed(1), instances: r.stats.inst, width: r.width, height: r.height,
      });
    }
    if (this.debugEl) this.debugEl.textContent = `${this.fps.toFixed(0)} fps · ${r.stats.draws} draws · ${r.stats.inst} instances · ${r.stats.sprites} sprites`;
    input.endFrame();
  },
};

async function boot() {
  initLanguage();
  const canvas = $('gpu');
  try {
    game.renderer = await Renderer.create(canvas);
  } catch (e) {
    const help = {
      insecure: 'Open the demo over trusted HTTPS. For local Wi-Fi, run npm run dev:lan on the host and open its HTTPS address on the phone. Plain HTTP on a LAN address cannot enable WebGPU.',
      unsupported: 'Open the HTTPS page directly in an updated browser. This browser or embedded viewer does not provide the WebGPU API.',
      adapter: 'The browser could not supply a core or compatibility adapter. Check for OS and browser updates, or try a device with WebGPU support.',
      device: 'The browser found a GPU but could not start it. Reload the page or try another WebGPU device.',
    }[e.code] || 'The WebGPU renderer could not start on this device.';
    fatal(`${t('This demo needs WebGPU.')}\n\n${t(e.message)}\n\n${t(help)}`);
    return;
  }
  game.renderer.device.addEventListener('uncapturederror', (e) => console.error('WebGPU error:', e.error.message));
  game.scene = new Scene(game.renderer);
  game.hud = new Hud();
  game.input = new Input(canvas);
  game.input.onLockLost = () => game.setPaused(true);

  // Worlds: the fixed district and the training annex. Generation is fast enough
  // to do up front (about 30 ms), so no streaming is needed for the demo.
  game.city = generateWorld(CITY_SEED);
  game.annex = generateWorld(CITY_SEED, { annex: true });
  game.idle = new Raid({ world: game.city, seed: 1, mode: 'idle' });
  game.idle.player.hidden = true;
  // The menu backdrop looks down an avenue in the middle of the district.
  const mid = { x: game.city.net.xs[Math.floor(game.city.net.xs.length / 2)], z: game.city.size * 0.52 };
  game.idle.player.x = mid.x; game.idle.player.z = mid.z;
  game.scene.px = mid.x; game.scene.pz = mid.z;

  game.profile = loadProfile(localStorage) || newProfile();

  $('touchMenu').onclick = () => game.setPaused(true);
  $('touchView').onclick = () => { game.setPaused(false); game.toggleCamera(); };
  $('touchMap').onclick = () => { game.setPaused(false); game.hud.toggleMap(); };
  $('touchInv').onclick = () => { game.setPaused(false); game.hud.toggleInv(); };
  $('openMap').onclick = () => game.hud.toggleMap();
  $('closeMap').onclick = () => game.hud.toggleMap();
  $('closeInv').onclick = () => game.hud.toggleInv();
  $('resumeBtn').onclick = () => { if (game.settingsOnly) { game.settingsOnly = false; $('pause').classList.add('hidden'); } else game.setPaused(false); };
  game.loadSettings();
  $('abandonBtn').onclick = () => {
    $('pause').classList.add('hidden');
    if (game.state === 'tutorial') { game.toTitle(); return; }
    game.raid.finish('dead');
    game.paused = false;
  };
  $('volume').oninput = (e) => { game.settings.volume = Number(e.target.value) / 100; game.applySettings(); };
  addEventListener('resize', () => game.renderer.resize());
  if (params.has('debug')) {
    game.debugEl = document.createElement('div');
    game.debugEl.style.cssText = 'position:fixed;left:12px;bottom:70px;z-index:30;font:11px ui-monospace,Menlo;color:#8f8;pointer-events:none';
    document.body.append(game.debugEl);
  }
  window.__game = game; // handy for debugging from the console

  if (params.has('raid')) { game.profile.tutorial.annex = true; game.profile.tutorial.done = true; game.startRaid(); }
  else if (params.has('tutorial')) game.startTutorial();
  else if (params.has('hub')) game.openHub();
  else game.toTitle();
  game.last = performance.now();
  requestAnimationFrame((t) => game.frame(t));
}

boot().catch((e) => fatal(`${t('Failed to start.')}\n\n${e.stack || e.message}`));
