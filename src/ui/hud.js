// Raid HUD (doc 12). Reads simulation state and events; never writes them, except for
// answering a pending choice through raid.pickChoice and the bag screen's raid.bag* actions.

import { CLASSES, ZONES, BANDS, ITEMS, RARITY, ENEMIES, AFFIXES, TIERS } from '../sim/data.js';
import { CLASS_RESOURCE } from '../sim/skill-data.js';
import { HUD_ATLASES, icon, drawSignal } from './icons.js';
import { assetUrl } from '../asset-source.js';
import { clamp } from '../core/math.js';
import { BODY_TOP } from '../render/scene.js';
import { BagScreen } from './bag.js';
import { itemName, message, t, upper } from '../i18n/index.js';
import { routeTargets, setRoute } from '../sim/route.js';

const inputHint = (hint, touch) => touch && hint?.touch ? t(hint.touch, hint.values) : t(hint);

const $ = (id) => document.getElementById(id);
const SLOT_KEYS = ['LMB', 'RMB', 'SHIFT', 'R'];
const SLOT_IDS = ['m1', 'm2', 's', 'r'];
const fmtClock = (h) => {
  const hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export class Hud {
  constructor() {
    this.root = $('hud');
    for (const [sheet, path] of Object.entries(HUD_ATLASES)) {
      const url = assetUrl(path);
      document.documentElement.style.setProperty(`--art-${sheet}`, `url("${url}")`);
      if (sheet === 'signal') { this.signals = new Image(); this.signals.src = url; }
    }
    $('touchMenu').innerHTML = icon('menu');
    for (const key of ['credits', 'carry', 'link']) $(key + 'Icon').innerHTML = icon(key);
    this.overlay = $('overlay');
    this.ctx = this.overlay.getContext('2d');
    this.mini = $('minimap').getContext('2d');
    this.big = $('bigMap').getContext('2d');
    this.cache = {};
    this.nums = []; this.arcs = []; this.hitT = 0; this.hitKill = false; this.hitCrit = false; this.spread = 0;
    this.toastQ = []; this.relayQ = []; this.relayT = 0; this.bannerT = 0;
    this.toastRenderers = new WeakMap();
    this.scr = [0, 0, 0];
    this.mapOpen = false; this.invOpen = false;
    this.skillEls = [];
    this.tip = $('tooltip');
    $('touchSkills').ontoggle = () => { if ($('touchSkills').open) this.renderSkillGuide(); };
    this.tips = {};
    // Tooltips: anything with data-tip inside the HUD shows a panel on hover.
    document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && this.tips[el.dataset.tip]) this.showTip(el, this.tips[el.dataset.tip]); });
    document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) this.tip.classList.add('hidden'); });
    $('bigMap').addEventListener('pointermove', (e) => this.mapHover(e));
    $('bigMap').addEventListener('pointerdown', (e) => this.mapHover(e));
    this.bag = new BagScreen(this);
    // Route choice on the map screen: the list under the map, or a click near a marker.
    $('bigMap').addEventListener('click', (e) => this.mapPick(e));
    $('mapRoutes').onclick = (e) => this.pickRoute(e);
  }

  set(id, prop, value) {
    const k = id + prop;
    if (this.cache[k] === value) return;
    this.cache[k] = value;
    const el = $(id);
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'class') el.className = value;
    else if (prop.startsWith('--')) el.style.setProperty(prop, value);
    else el.style[prop] = value;
  }
  showTip(el, html) {
    const t = this.tip, r = el.getBoundingClientRect();
    t.innerHTML = html;
    t.classList.remove('hidden');
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    t.style.top = `${Math.max(8, r.top - h - 10)}px`;
  }
  show(id, on) { this.set(id, 'class', (this.baseClass?.[id] || '') + (on ? '' : ' hidden')); }

  setRaid(raid, minimap) {
    this.raid = raid; this.minimap = minimap;
    this.cache = {}; this.nums.length = 0; this.arcs.length = 0; this.toastQ.length = 0; this.relayQ.length = 0; this.relayT = 0; this.bannerT = 0;
    this.bannerEvent = null; this.relayLine = null;
    $('banner').classList.add('hidden'); $('relay').classList.add('hidden');
    $('touchSkills').open = false;
    $('toasts').innerHTML = ''; $('itemRow').innerHTML = '';
    this.baseClass = {};
    this.tips = {};
    const cls = CLASSES[raid.player.classId];
    document.documentElement.style.setProperty('--kit', cls.css);
    this.skillDefs = cls.skills.map((skill, i) => ({ k: SLOT_KEYS[i], n: skill.name, art: skill.behavior, slot: SLOT_IDS[i] }));
    this.skillDefs.push({ k: 'C', n: 'Scan Pulse', art: 'scan', slot: 'scan' });
    const bar = $('skillBar');
    // A transparent touch target uses the same visible slot and simulation state as the desktop key.
    const touchTarget = (action, label) => `<button class="slotTrigger touchOnly" data-action="${action}" data-label="${label}"><span></span></button>`;
    const actions = { m2: ['m2', 'Skill'], s: ['dodge', 'Dodge'], r: ['ult', 'Ultimate'], scan: ['scan', 'Scan'] };
    bar.innerHTML = this.skillDefs.map((d) => `<div class="skill" data-slot="${d.slot}" data-tip="skill-${d.slot}"><span class="g">${icon(d.art)}</span><div class="cdm"></div><div class="cdt"></div><span class="k">${d.k}</span>${actions[d.slot] ? touchTarget(...actions[d.slot]) : ''}</div>`).join('')
      + `<div class="skill potion" data-tip="skill-med"><span class="g">${icon('medkit')}</span><div class="cdm"></div><div class="cdt" id="medCount"></div><span class="k">1</span>${touchTarget('quick1', 'Medkit')}</div>`;
    this.updateTouchLabels();
    $('aimGlyph').innerHTML = icon(cls.skills[0].behavior);
    this.buildSkillTips();
    this.skillEls = [...bar.children].slice(0, 5).map((el) => ({ el, slot: el.dataset.slot, cdm: el.querySelector('.cdm'), cdt: el.querySelector('.cdt'), last: -1, ready: null }));
    this.root.classList.remove('hidden');
    this.closeModals();
  }
  updateTouchLabels() {
    for (const button of $('skillBar').querySelectorAll('button')) {
      const slot = button.parentElement.dataset.slot;
      button.setAttribute('aria-label', t(this.skillDefs.find((d) => d.slot === slot)?.n || 'Medkit'));
      button.firstElementChild.textContent = t(button.dataset.label);
    }
  }
  buildSkillTips() {
    const cls = CLASSES[this.raid.player.classId];
    this.tipBuild = this.raid.skillBuild;
    this.skillDefs.forEach((d, i) => {
      const sk = cls.skills[i] || { name: 'Scan Pulse', desc: 'Reveals Mimics through walls for 4 s and opens a Resonance Link to each: they sense you back.', cd: 8 };
      const params = this.tipBuild.slots[d.slot]?.params || sk;
      const cooldown = params.cd ? ` · ${t('{seconds}s cooldown', { seconds: Number(params.cd.toFixed(2)) })}` : '';
      this.tips[`skill-${d.slot}`] = `<div class="tipName" style="color:${d.slot === 'scan' ? 'var(--sense)' : cls.css}">${t(sk.name)}</div><div class="tipType">${t(['Basic', 'Core', 'Evade', 'Ultimate', 'Sense Rig'][i])}<span class="keyDesktop"> · ${d.k}</span>${cooldown}</div><div class="tipBody">${t(sk.desc)}</div>`;
    });
    this.tips['skill-med'] = `<div class="tipName" style="color:#ff5a6a">${t('Medkit')}</div><div class="tipType">${t('Consumable')}<span class="keyDesktop"> · 1</span></div><div class="tipBody">${t('Restores 45% of maximum health over 1.5 seconds.')}</div>`;
  }

  renderSkillGuide() {
    $('touchSkillGuide').innerHTML = [...this.skillDefs.map((d) => d.slot), 'med'].map((slot) => this.tips[`skill-${slot}`]).join('');
  }
  refreshLanguage() {
    this.cache = {};
    this.updateTouchLabels();
    this.buildSkillTips();
    for (const el of $('toasts').children) el.innerHTML = this.toastRenderers.get(el)();
    if (this.bannerEvent) this.updateBannerText(this.bannerEvent);
    if ($('touchSkills').open) this.renderSkillGuide();
    if (this.raid.choice) this.openChoice();
    if (this.invOpen) this.renderInv();
    if (this.mapOpen) { $('mapTip').textContent = ''; this.renderRoutes(); }
  }
  hide() { this.root.classList.add('hidden'); this.closeModals(); this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height); }
  closeModals() { for (const id of ['choice', 'mapModal', 'invModal']) $(id).classList.add('hidden'); this.mapOpen = this.invOpen = false; }

  toast(col, render) {
    const box = $('toasts'), el = document.createElement('div');
    el.className = 'toast';
    el.style.borderRightColor = col;
    this.toastRenderers.set(el, render);
    el.innerHTML = render();
    box.prepend(el);
    while (box.children.length > 7) box.lastChild.remove();
    setTimeout(() => el.remove(), 4200);
  }

  updateBannerText(event) {
    $('bannerTitle').textContent = t(event.title);
    $('bannerSub').textContent = t(event.sub);
  }

  handleEvents(events) {
    for (const e of events) {
      switch (e.t) {
        case 'dmg': {
          // Merge rapid damage-over-time ticks on the same spot into one number.
          const last = this.nums.length ? this.nums[this.nums.length - 1] : null;
          if (e.dot && last && last.dot && Math.abs(last.x - e.x) < 0.5 && Math.abs(last.z - e.z) < 0.5 && last.t < 0.3) { last.amount += e.amount; break; }
          this.nums.push({ x: e.x + (Math.random() - 0.5) * 0.6, z: e.z, h: e.h, amount: e.amount, crit: e.crit, dot: e.dot, t: 0 });
          if (this.nums.length > 60) this.nums.shift();
          break;
        }
        case 'credits': this.nums.push({ x: e.x, z: e.z, h: 1, amount: e.amount, credit: true, t: 0 }); break;
        case 'dodged': this.nums.push({ x: e.x, z: e.z, h: 2.2, text: 'DODGED', t: 0 }); break;
        case 'hitmark': this.hitT = 0.14; this.hitKill = e.kill; this.hitCrit = e.crit; this.spread = Math.min(1, this.spread + 0.25); break;
        case 'hurt': this.arcs.push({ angle: e.angle, t: 0 }); break;
        case 'toast': this.toast(e.col, () => `${icon(e.icon)} ${inputHint(e.text, this.touchMode)}`); break;
        // The sim sends only the public view of a sealed piece; show its bid, not a value.
        case 'loot': this.toast(e.col, () => `${icon(e.item.unid ? 'unknown' : e.item.kind === 'gear' ? 'gear' : 'loot')} ${itemName(e.item)}<small>${e.item.unid ? e.item.bid : e.item.value}</small>`); break;
        case 'item': this.toast(e.col, () => `${icon(e.id)} <b style="color:${e.col}">${t(e.name)}</b>${e.count > 1 ? ' x' + e.count : ''}<small>${t(e.desc)}</small>`); this.cache.items = null; break;
        case 'banner': {
          this.bannerEvent = e;
          this.updateBannerText(e); $('bannerTitle').style.color = e.col;
          const b = $('banner'); b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
          this.bannerT = 3;
          break;
        }
        case 'relay': this.relayQ.push(e.text); if (this.relayQ.length > 2) this.relayQ.shift(); this.relayT = Math.min(this.relayT, 1.2); break;
        case 'scan': this.toast('var(--sense)', () => `${icon('scan')} ${t('Scan: {count} link{plural} opened', { count: e.links, plural: e.links === 1 ? '' : 's' })}${e.humans ? t(', {count} human', { count: e.humans }) : ''}${e.hosts ? t(', {count} Host', { count: e.hosts }) : ''}`); break;
        case 'skill': { const s = this.skillEls.find((k) => k.slot === e.slot); if (s) { s.el.classList.remove('flash'); void s.el.offsetWidth; s.el.classList.add('flash'); } break; }
        case 'choice': this.openChoice(); break;
        case 'cell': this.gainT = 0.4; break;
        case 'wave': this.toast('#ff8a80', () => `${icon('warning')} ${t('Wave {wave}: {count} hostiles inbound', { wave: e.n, count: e.size })}`); break;
        case 'route': if (!e.quiet) { const tg = e.target; this.toast('#4ff2d8', () => `${icon('link')} ${t(tg ? message('Route: {name}', { name: tg.label }) : 'Route cleared')}`); } break;
        default: break;
      }
    }
  }

  openChoice() {
    const raid = this.raid, c = raid.choice;
    if (!c) return;
    $('choiceTitle').textContent = t(c.title);
    const box = $('choiceCards');
    box.innerHTML = c.ids.map((id, i) => {
      const d = ITEMS[id];
      const have = raid.player.items[id] || 0;
      return `<div class="card" data-i="${i}" style="--rar:${RARITY[d.rarity].css}"><div class="num">${i + 1}</div><div class="g">${icon(id)}</div><div class="t">${t(d.name)}</div><div class="r">${t(RARITY[d.rarity].name)} · ${t(d.tag)}</div><div class="d">${t(d.desc)}</div><div class="own">${have ? t('Owned x{count}', { count: have }) : t('New')}</div></div>`;
    }).join('');
    for (const el of box.children) el.onclick = () => { $('choice').classList.add('hidden'); raid.pickChoice(Number(el.dataset.i)); };
    $('choice').classList.remove('hidden');
  }

  toggleMap() { this.mapOpen = !this.mapOpen; $('mapModal').classList.toggle('hidden', !this.mapOpen); if (this.mapOpen) { this.minimap.drawFull(this.big, 640, this.raid); this.renderRoutes(); } }
  // The known activities the operator can follow, nearest first (doc 36).
  renderRoutes() {
    const raid = this.raid, p = raid.player, cur = raid.route && raid.route.target;
    this.routeList = routeTargets(raid);
    this.routeShown = cur ? cur.key : '';
    const items = this.routeList.map((o, i) => `<button data-i="${i}" class="${cur && cur.key === o.key ? 'on' : ''}">${t(o.label)}<small>${Math.round(Math.hypot(o.x - p.x, o.z - p.z))} m</small></button>`).join('');
    $('mapRoutes').innerHTML = `<div class="rtTitle">${t('FOLLOW A ROUTE')}<span class="keyDesktop"> · ${t('G next · X clear')}</span></div>${items}<button data-i="-1" class="${cur ? '' : 'on'}">${t('No route')}</button>`;
  }
  pickRoute(e) {
    const b = e.target.closest('button[data-i]');
    if (!b || !this.raid) return;
    const i = Number(b.dataset.i);
    setRoute(this.raid, i >= 0 ? this.routeList[i] : null);
    this.renderRoutes();
    this.minimap.drawFull(this.big, 640, this.raid);
  }
  // A click on the full map follows the known activity nearest to it.
  mapPick(e) {
    if (!this.raid) return;
    const r = e.target.getBoundingClientRect(), w = this.raid.world;
    const x = (e.clientX - r.left) / r.width * w.size, z = (e.clientY - r.top) / r.height * w.size;
    let best = null, bd = 14;
    for (const o of routeTargets(this.raid)) { const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; } }
    if (!best) return;
    setRoute(this.raid, best);
    this.renderRoutes();
    this.minimap.drawFull(this.big, 640, this.raid);
  }
  mapHover(e) {
    const r = e.target.getBoundingClientRect(), w = this.raid.world;
    const x = (e.clientX - r.left) / r.width * w.size, z = (e.clientY - r.top) / r.height * w.size;
    const Z = ZONES[w.zoneAt(x, z)], T = TIERS[this.raid.tier];
    $('mapTip').textContent = t('{zone} {name}: health x{hp}  elite share {elite}%  loot x{loot}', {
      zone: Z.label, name: t(Z.name), hp: (Z.hp * T.hp).toFixed(2), elite: Math.round((Z.elite + 0.12 * this.raid.nl + T.elite) * 100), loot: Z.loot.toFixed(1),
    });
  }
  toggleInv() {
    this.invOpen = !this.invOpen;
    $('invModal').classList.toggle('hidden', !this.invOpen);
    if (this.invOpen) this.bag.open();
  }
  renderInv() { this.bag.render(); }

  update(raid, scene, dt, input) {
    const p = raid.player, cam = scene.cam;
    if (this.tipBuild !== raid.skillBuild) this.buildSkillTips();
    if (input.touchMode !== this.touchMode) {
      this.touchMode = input.touchMode;
      for (const el of $('toasts').children) el.innerHTML = this.toastRenderers.get(el)();
    }
    // ---- DOM ----
    this.set('clockTime', 'text', raid.mode === 'raid' ? fmtClock(raid.clock) : t('TRAINING'));
    this.set('clockBand', 'text', raid.mode === 'raid' ? upper(BANDS[raid.band].name) : t('ANNEX'));
    this.set('nightFill', 'width', `${(raid.nl * 100).toFixed(1)}%`);
    const hpf = clamp(p.hp / p.maxHp, 0, 1);
    this.set('hpFill', '--fill', `${(hpf * 100).toFixed(1)}%`);
    const barrier = p.barrier + p.shield;
    this.set('hpOrb', 'class', `orb${hpf < 0.3 ? ' low' : ''}${barrier > 0 ? ' shield' : ''}`);
    this.updateResource(raid, dt);
    this.set('medCount', 'text', String(p.medkits));
    this.set('hpText', 'text', `${Math.ceil(p.hp)}${barrier > 0 ? ` +${Math.ceil(barrier)}` : ''}`);
    this.set('medkits', 'text', '');
    this.set('creditsValue', 'text', String(p.credits));
    this.set('carryValue', 'text', String(raid.carryValue()));
    // Loaded walking speed: the pack's weight is felt on the way out (doc 61).
    this.set('loadValue', 'text', t('{speed} m/s', { speed: (p.speed * p.loadMul).toFixed(1) }));
    this.set('load', 'class', p.loadMul < 1 ? 'slow' : '');
    this.set('levelText', 'text', String(p.level));
    this.set('xpFill', 'width', `${(clamp(p.xp / raid.xpNeed(p.level), 0, 1) * 100).toFixed(1)}%`);
    // Pressure meter: how hard the horde is leaning on the operator.
    const th = raid.threat;
    if (raid.mode === 'raid') {
      const label = th.zone === 0 ? t('SHELTER · no pressure') : th.paused
        ? t('REINFORCEMENTS PAUSED · {alive} hostile', { alive: th.alive })
        : t('WAVE {wave} · next {seconds}s · {alive}/{target} hostile', { wave: th.wave, seconds: Math.ceil(th.nextWave), alive: th.alive, target: th.target });
      this.set('threatLabel', 'text', label);
      this.set('threatFill', 'width', `${(clamp(th.target ? th.alive / th.target : 0, 0, 1) * 100).toFixed(0)}%`);
      this.set('threat', 'class', (th.nextWave < 3 || th.surgeIn < 6) && th.zone > 0 && !th.paused ? 'warn' : '');
    } else this.set('threat', 'class', 'hidden');
    const Z = ZONES[raid.zone], T = TIERS[raid.tier];
    if (raid.mode === 'raid') {
      const details = t('T{tier} {zone}  HP x{hp}  LOOT x{loot}', {
        tier: raid.tier, zone: Z.label, hp: Math.min(8, Z.hp * (1 + 0.6 * raid.nl) * T.hp).toFixed(2), loot: Z.loot.toFixed(1),
      });
      this.set('zoneChip', 'text', this.touchMode ? `T${raid.tier} ${Z.label}` : details);
      this.set('mapZoneDetail', 'text', details);
      this.set('zoneChip', 'color', Z.css);
    } else {
      const details = t('TRAINING ANNEX: no lethal damage');
      this.set('zoneChip', 'text', this.touchMode ? '' : details);
      this.set('mapZoneDetail', 'text', details);
    }
    // Contracts or tutorial objective.
    if (raid.script && raid.script.objective) {
      const o = raid.script.objective();
      this.set('questTitle', 'text', t('TRAINING {step}/{total}', { step: o.index + 1, total: o.total }));
      this.set('objective', 'html', `<b>${t(o.title)}</b><div class="prog">${inputHint(o.progress, this.touchMode)}</div>`);
      this.show('objective', true); this.show('contracts', false);
    } else {
      this.show('objective', false); this.show('contracts', raid.contracts.length > 0);
      this.set('questTitle', 'text', t('CONTRACTS'));
      this.set('contracts', 'html', raid.contracts.map((c) => `<div class="c${c.have >= c.need ? ' done' : ''}"><span>${t(c.label)}</span><span>${c.have}/${c.need}</span></div>`).join(''));
    }
    this.set('linkText', 'text', raid.links > 0 ? t('{count} RESONANCE LINK{plural} OPEN', { count: raid.links, plural: raid.links > 1 ? 'S' : '' }) : '');
    this.set('links', 'class', raid.links > 0 ? '' : 'hidden');
    // Route guidance: the walk to the followed activity, or to where it stops and why.
    const R = raid.route, rr = R && R.target ? R.result : null;
    this.set('routeChip', 'class', R && R.target ? (rr && !rr.ok ? 'blocked' : '') : 'hidden');
    if (R && R.target) {
      this.set('routeName', 'text', t(R.target.label));
      this.set('routeDist', 'text', !rr ? '' : rr.arrived ? t('here') : t('{m} m on foot', { m: Math.round(rr.length) }));
      this.set('routeWhy', 'text', rr && rr.reason ? t(rr.reason) : '');
    }
    // The map stays still while it is open, so a new route redraws it here.
    if (this.mapOpen && (R && R.target ? R.target.key : '') !== this.routeShown) { this.renderRoutes(); this.minimap.drawFull(this.big, 640, raid); }
    // Skills.
    for (const s of this.skillEls) {
      const cd = p.cd[s.slot] || 0, max = s.slot === 'm1' ? 0 : (p.cdMax[s.slot] || 1);
      const frac = max > 0 ? clamp(cd / max, 0, 1) : 0;
      const shown = cd > 0.05 && max > 0 ? Math.ceil(cd) : 0;
      if (shown !== s.last) {
        s.last = shown; s.cdt.textContent = shown ? String(shown) : '';
      }
      const deg = Math.round(frac * 360);
      if (deg !== s.deg) { s.deg = deg; s.cdm.style.background = deg ? `conic-gradient(rgba(0,0,0,0.78) ${deg}deg, transparent 0)` : 'none'; }
      const ready = frac === 0;
      // A Rifleman's M2 still fires while it cools when a cell is loaded.
      if (s.slot === 'm2') { const armed = !ready && p.cells > 0 && p.classId === 'rifleman'; if (armed !== s.armed) { s.armed = armed; s.el.classList.toggle('armed', armed); } }
      if (ready !== s.ready) { s.ready = ready; s.el.classList.toggle('ready', ready); }
    }
    // Run items.
    if (this.cache.items !== p.itemCount) {
      this.cache.items = p.itemCount;
      $('itemRow').innerHTML = Object.entries(p.items).map(([id, n]) => {
        const d = ITEMS[id], c = RARITY[d.rarity].css;
        this.tips[`item-${id}`] = `<div class="tipName" style="color:${c}">${t(d.name)}${n > 1 ? ` x${n}` : ''}</div><div class="tipType">${t('{rarity} run item', { rarity: t(RARITY[d.rarity].name) })} · ${t(d.tag)}</div><div class="tipBody">${t(d.desc)}</div>`;
        return `<div class="item" data-tip="item-${id}" style="border-color:${c};color:${c}">${icon(id)}${n > 1 ? `<u>${n}</u>` : ''}</div>`;
      }).join('');
    }
    // Prompt.
    const pr = raid.prompt;
    this.set('prompt', 'class', pr ? (pr.ok ? '' : 'bad') : 'hidden');
    if (pr) { this.set('promptText', 'text', t(pr.label)); this.set('promptFill', 'width', `${(pr.progress * 100).toFixed(0)}%`); }
    // Banner and Relay.
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) $('banner').classList.add('hidden');
    if (this.relayT > 0) this.relayT -= dt;
    if (this.relayT <= 0) {
      if (this.relayQ.length) {
        this.relayLine = this.relayQ.shift();
        const line = inputHint(this.relayLine, this.touchMode);
        $('relay').classList.remove('hidden');
        this.relayT = Math.max(4, line.length * 0.055);
      } else $('relay').classList.add('hidden');
    }
    if (this.relayT > 0) this.set('relayText', 'text', inputHint(this.relayLine, this.touchMode));
    // Boss bar.
    const B = raid.boss;
    const bossOn = !!(B && B.active && !B.e.dead);
    this.set('bossBar', 'class', bossOn ? '' : 'hidden');
    if (bossOn) {
      this.set('bossName', 'text', `${upper(ENEMIES[B.e.kind].name)}  ·  ${t('PHASE {phase}', { phase: B.phase })}`);
      this.set('bossFill', 'width', `${(clamp(B.e.hp / B.e.maxHp, 0, 1) * 100).toFixed(1)}%`);
      this.set('bossPoiseFill', 'width', `${B.e.staggerT > 0 ? 100 : (clamp(B.poise / (B.e.maxHp * 0.07), 0, 1) * 100).toFixed(0)}%`);
      this.set('bossHint', 'text', t(B.e.staggerT > 0 ? 'STAGGERED' : B.hint));
    }
    this.set('camHint', 'text', t(cam.shoulder ? '[V] top-down view' : '[V] shoulder view · [wheel] zoom · [M] map · [Tab] bag'));
    // Minimap (10 Hz is plenty).
    this.miniT = (this.miniT || 0) - dt;
    if (this.miniT <= 0) { this.miniT = 0.1; this.minimap.draw(this.mini, 208, raid, raid.world.annex ? 80 : 110); if (this.mapOpen) this.minimap.drawFull(this.big, 640, raid); }

    this.drawOverlay(raid, scene, dt, input);
  }

  // Right instrument: the class resource (doc 64, Package 2). Cells fill a three-part bar with a pip
  // each; momentum is a plain bar; the Summoner shows carried sentries and a radio light. Venom
  // lives on its hosts, so the Handler's panel only counts them.
  updateResource(raid, dt) {
    const p = raid.player, R = CLASS_RESOURCE[p.classId], pip = (cls) => `<i class="pip${cls ? ' ' + cls : ''}"></i>`;
    let fill = 0, text = '', cap = '', pips = '', ready = false;
    if (p.classId === 'rifleman') {
      fill = (p.cells + p.cellProg / R.roundsPerCell) / R.cells; text = `${p.cells}/${R.cells}`; cap = 'CELLS'; ready = p.cells > 0;
      for (let i = 0; i < R.cells; i++) pips += pip(i < p.cells ? 'on' : '');
    } else if (p.classId === 'blade') {
      fill = p.momentum / R.max; text = String(Math.floor(p.momentum)); cap = 'MOMENTUM'; ready = p.momentum >= R.max;
    } else if (p.classId === 'summoner') {
      // Filled: carried. Blinking: on its way back. Hollow: posted in the room.
      const posted = raid.summons.filter((s) => s.post).length;
      for (let i = 0; i < p.carried; i++) pips += pip('on');
      for (let i = 0; i < p.recalls.length; i++) pips += pip('back');
      for (let i = 0; i < posted; i++) pips += pip('out');
      ready = p.radioT <= 0;
      pips += pip(`radio${ready ? ' on' : ''}`);
      fill = ready ? 1 : 1 - p.radioT / p.radioMax; cap = 'SENTRIES'; text = ready ? t('RADIO') : p.radioT.toFixed(1);
    } else {
      let n = 0;
      for (const e of raid.enemies) if (e.st.venom > 0 && raid.isTarget(e)) n++;
      cap = 'INFECTED'; text = String(n); ready = n > 0;
    }
    if (this.gainT > 0) this.gainT -= dt;
    this.set('ultFill', '--fill', `${(clamp(fill, 0, 1) * 100).toFixed(1)}%`);
    this.set('ultOrb', 'class', `orb ult res-${p.classId}${ready ? ' ready' : ''}${this.gainT > 0 ? ' gain' : ''}`);
    this.set('ultText', 'text', text);
    this.set('ultCap', 'text', t(cap));
    this.set('ultPips', 'html', pips);
  }

  // The same resource beside the reticle, where the player is already looking.
  drawResourceCue(g, raid, x, y, r, col) {
    const p = raid.player, R = CLASS_RESOURCE[p.classId], dim = 'rgba(255,255,255,0.28)';
    g.lineCap = 'butt';
    if (p.classId === 'blade') {
      // Momentum: an arc under the reticle that fills from the left.
      const a0 = Math.PI * 0.8, span = Math.PI * 0.6, f = clamp(p.momentum / R.max, 0, 1);
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(x, y, r, a0, a0 - span, true); g.stroke();
      if (f > 0) { g.lineWidth = 2.5; g.strokeStyle = f >= 1 ? '#fff' : col; g.beginPath(); g.arc(x, y, r, a0, a0 - span * f, true); g.stroke(); }
      return;
    }
    const sq = (px, on, hollow) => {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(px - 1, y + r + 2, 7, 7);
      if (on) { g.fillStyle = col; g.fillRect(px, y + r + 3, 5, 5); } else { g.strokeStyle = hollow ? col : dim; g.lineWidth = 1; g.strokeRect(px + 0.5, y + r + 3.5, 4, 4); }
    };
    if (p.classId === 'rifleman') {
      // Cells: three pips under the reticle, with a hairline for the next one.
      for (let i = 0; i < R.cells; i++) sq(x - 13 + i * 9, i < p.cells, false);
      if (p.cells < R.cells && p.cellProg > 0) { g.fillStyle = col; g.fillRect(x - 13, y + r + 11, 23 * p.cellProg / R.roundsPerCell, 1.5); }
    } else if (p.classId === 'summoner') {
      // Carried sentries as pips, posted ones hollow, and the radio as a dot that turns green when ready.
      const posted = raid.summons.filter((s) => s.post).length, n = p.carried + p.recalls.length + posted;
      let px = x - (n * 9 + 8) / 2;
      for (let i = 0; i < n; i++, px += 9) sq(px, i < p.carried, i >= p.carried + p.recalls.length);
      const ready = p.radioT <= 0;
      g.fillStyle = ready ? '#7dff9a' : 'rgba(255,184,61,0.5)'; g.beginPath(); g.arc(px + 3, y + r + 5.5, 3, 0, 6.283); g.fill();
      if (!ready) { g.strokeStyle = '#ffb83d'; g.lineWidth = 1.5; g.beginPath(); g.arc(px + 3, y + r + 5.5, 4.5, -Math.PI / 2, -Math.PI / 2 + 6.283 * (1 - p.radioT / p.radioMax)); g.stroke(); }
    }
  }

  // ---- world-space overlay: bars, awareness arcs, numbers, reticle ----
  drawOverlay(raid, scene, dt, input) {
    const cv = this.overlay, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.floor(W * dpr) || cv.height !== Math.floor(H * dpr)) { cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr); }
    const g = this.ctx, s = this.scr, p = raid.player, cam = scene.cam;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';

    // Passive sense: faint shimmer at the screen edge, no identification (doc 12, section 3).
    if (raid.passive > 0.02) {
      const a = raid.passive * (0.12 + 0.08 * Math.sin(scene.time * 9));
      const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
      gr.addColorStop(0, 'rgba(255,46,154,0)'); gr.addColorStop(1, `rgba(255,46,154,${a.toFixed(3)})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }

    for (const e of raid.enemies) {
      if (e.dead || e.untargetable) continue;
      const hostile = e.state === 'hunt' || e.state === 'revealing' || e.state === 'static';
      const linked = e.isMimic && (e.state === 'disguised' || e.state === 'suspicious') && (e.linkT > 0 || e.outlineT > 0 || e.aware > 0.08);
      if (!hostile && !linked && !(e.humanT > 0)) continue;
      // Bars hang just over each creature's real height, the same table the Order cone uses.
      const top = (BODY_TOP[e.kind] || 2.1) * (e.scale || 1) + 0.25;
      if (!scene.toScreen(e.x, top, e.z, W, H, s)) continue;
      const x = s[0], y = s[1];
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      if (hostile) {
        if (e.hp < e.maxHp || e.elite) {
          const bw = e.elite ? 58 : e.kind === 'brute' ? 48 : 34;
          g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - bw / 2 - 1, y - 4, bw + 2, 6);
          g.fillStyle = e.elite ? '#ffd76a' : '#ff4d6e'; g.fillRect(x - bw / 2, y - 3, bw * clamp(e.hp / e.maxHp, 0, 1), 4);
          if (e.plate > 0) { g.fillStyle = '#74a6ff'; g.fillRect(x - bw / 2, y - 6, bw * clamp(e.plate / (e.maxHp * 0.2), 0, 1), 2); }
        }
        if (e.elite) {
          g.font = '600 10px ui-sans-serif, system-ui'; g.fillStyle = AFFIXES[e.elite[0]].css;
          g.fillText(e.elite.map((a) => upper(AFFIXES[a].name)).join(' · '), x, y - 13);
        }
        // Status pips: Suppression, Exposed, Mark, Order, Venom.
        const st = e.st; let px = x - 14;
        const pip = (n, col) => { for (let i = 0; i < n; i++) { g.fillStyle = col; g.fillRect(px, y + 5, 4, 4); px += 6; } };
        if (st.supp > 0) pip(st.supp, '#5cd0ff');
        if (st.exposedT > 0) pip(1, '#ff5c84');
        if (st.markT > 0) pip(1, '#ffcf4a');
        if (st.orderT > 0) { g.fillStyle = '#ffb83d'; g.beginPath(); g.moveTo(px, y + 4); g.lineTo(px + 6, y + 4); g.lineTo(px + 3, y + 10); g.fill(); px += 8; }
        if (st.venom > 0) pip(st.venom, '#8dff5a');
        if (st.plagueT > 0) pip(1, '#d966ff');
        // What a Wither Cloud would rupture from this host now.
        if (st.venom > 0 && p.classId === 'toxic') { g.font = '600 10px ui-monospace, Menlo'; g.fillStyle = '#c8ff9a'; g.textAlign = 'left'; g.fillText(String(Math.round(raid.rupturePreview(e))), px + 1, y + 7); g.textAlign = 'center'; }
      } else if (linked) {
        // Awareness arc that fills while the Resonance Link is open.
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(x, y - 4, 9, 0, 6.283); g.stroke();
        g.strokeStyle = e.aware > 0.7 ? '#ff4d5a' : '#ff2e9a';
        g.beginPath(); g.arc(x, y - 4, 9, -Math.PI / 2, -Math.PI / 2 + 6.283 * clamp(e.aware, 0, 1)); g.stroke();
        if (e.outlineT > 0) {
          g.font = '600 10px ui-sans-serif, system-ui'; g.fillStyle = '#ff8ac6';
          const label = `${upper(ENEMIES[e.kind].name)} ${Math.round(e.aware * 100)}%`;
          if (e.elite) drawSignal(g, this.signals, 'elite', x - g.measureText(label).width / 2 - 13, y - 32, 12);
          g.fillText(label, x, y - 22);
        }
      } else {
        g.font = '600 10px ui-sans-serif, system-ui'; g.fillStyle = '#b8c8d6';
        g.fillText(t('HUMAN'), x, y - 4);
      }
    }

    // Floating numbers.
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      const life = n.text ? 0.8 : 0.75;
      if (n.t > life) { this.nums.splice(i, 1); continue; }
      if (!scene.toScreen(n.x, n.h + n.t * 1.6, n.z, W, H, s)) continue;
      const a = clamp(1 - (n.t / life) ** 3, 0, 1);
      g.globalAlpha = a;
      if (n.text) { g.font = '700 12px ui-sans-serif, system-ui'; g.fillStyle = '#9fe8ff'; g.fillText(t(n.text), s[0], s[1]); }
      else if (n.credit) { g.font = '600 11px ui-monospace, Menlo'; g.fillStyle = '#7fe9ff'; g.fillText(`+${n.amount}`, s[0], s[1]); }
      else {
        g.font = `${n.crit ? '800 17px' : n.dot ? '600 11px' : '700 13px'} ui-monospace, Menlo`;
        g.fillStyle = n.crit ? '#ffd76a' : n.dot ? '#a8ff7a' : '#ffffff';
        g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 3;
        const txt = String(Math.max(1, Math.round(n.amount)));
        g.strokeText(txt, s[0], s[1]); g.fillText(txt, s[0], s[1]);
      }
      g.globalAlpha = 1;
    }

    // Screen direction of a world offset (top-down is north-up; shoulder follows yaw).
    const yaw = cam.shoulder ? cam.yaw : 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const toDir = (dx, dz) => [dx * cy + dz * sy, -(dx * sy - dz * cy)];

    // Damage direction ring around the operator.
    if (scene.toScreen(p.x, 1.2, p.z, W, H, s)) {
      const cx = cam.shoulder ? W / 2 : s[0], cyy = cam.shoulder ? H / 2 : s[1];
      for (let i = this.arcs.length - 1; i >= 0; i--) {
        const a = this.arcs[i];
        a.t += dt;
        if (a.t > 0.9) { this.arcs.splice(i, 1); continue; }
        const d = toDir(Math.cos(a.angle), Math.sin(a.angle)), ang = Math.atan2(d[1], d[0]);
        g.strokeStyle = `rgba(255,60,70,${(0.85 * (1 - a.t / 0.9)).toFixed(3)})`;
        g.lineWidth = 5;
        g.beginPath(); g.arc(cx, cyy, 62, ang - 0.4, ang + 0.4); g.stroke();
      }
    }

    // Edge arrow to the nearest known extraction point.
    if (raid.mode === 'raid') {
      const ex = raid.nearestExtraction();
      const dx = ex.x - p.x, dz = ex.z - p.z, dd = Math.hypot(dx, dz);
      const on = scene.toScreen(ex.x, 1, ex.z, W, H, s) && s[0] > 60 && s[0] < W - 60 && s[1] > 60 && s[1] < H - 60;
      if (!on && dd > 12) {
        const d = toDir(dx / dd, dz / dd);
        const ax = W / 2 + d[0] * (W / 2 - 70), ay = H / 2 + d[1] * (H / 2 - 90);
        g.save(); g.translate(ax, ay); g.rotate(Math.atan2(d[1], d[0]));
        g.fillStyle = '#52f08a'; g.beginPath(); g.moveTo(12, 0); g.lineTo(-7, -7); g.lineTo(-3, 0); g.lineTo(-7, 7); g.closePath(); g.fill();
        g.restore();
        g.font = '600 11px ui-monospace, Menlo'; g.fillStyle = '#52f08a';
        g.fillText(`${upper(ex.name)} ${Math.round(dd)} m`, ax - d[0] * 46, ay - d[1] * 22);
      }
    }

    // Threat awareness: an arrow on a ring around the screen centre for every hostile that is
    // off screen or behind the camera. One that is winding up an attack turns white and pulses.
    {
      const ring = Math.min(W, H) * 0.34, list = [];
      for (const e of raid.enemies) {
        if (e.dead || !(e.state === 'hunt' || e.state === 'revealing' || e.state === 'boss')) continue;
        const dx = e.x - p.x, dz = e.z - p.z, dd = Math.hypot(dx, dz);
        if (dd > 34 || dd < 0.5) continue;
        const on = scene.toScreen(e.x, 1.2, e.z, W, H, s) && s[0] > 20 && s[0] < W - 20 && s[1] > 20 && s[1] < H - 150;
        if (on) {
          // On screen: an exclamation over anything about to strike.
          if (e.windupT > 0 && scene.toScreen(e.x, (e.kind === 'brute' ? 3.9 : e.kind === 'titan' ? 6 : 2.6) * (e.scale || 1), e.z, W, H, s)) {
            g.fillStyle = '#681516'; g.fillRect(s[0] - 10, s[1] - 18, 20, 20);
            drawSignal(g, this.signals, 'warning', s[0] - 10, s[1] - 18, 20);
          }
          continue;
        }
        list.push([dd, dx / dd, dz / dd, e]);
      }
      list.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < Math.min(12, list.length); i++) {
        const [dd, ux, uz, e] = list[i], d = toDir(ux, uz), ang = Math.atan2(d[1], d[0]);
        const warn = e.windupT > 0, near = 1 - Math.min(1, dd / 34), big = e.elite || e.kind === 'brute' || e.kind === 'titan';
        const sz = (big ? 14 : 10) + near * 5 + (warn ? 5 : 0), rr = ring + (warn ? Math.sin(scene.time * 30) * 4 : 0);
        g.save(); g.translate(W / 2 + d[0] * rr, H / 2 + d[1] * rr * (H / W < 0.7 ? 0.82 : 1)); g.rotate(ang);
        g.globalAlpha = warn ? 1 : 0.6 + near * 0.4;
        g.fillStyle = warn ? '#ffffff' : big ? '#ffd76a' : '#ff4d5a'; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(sz, 0); g.lineTo(-sz * 0.6, -sz * 0.62); g.lineTo(-sz * 0.25, 0); g.lineTo(-sz * 0.6, sz * 0.62); g.closePath(); g.stroke(); g.fill();
        g.restore(); g.globalAlpha = 1;
      }
    }

    // Edge arrows to tutorial markers that are off screen.
    if (raid.markers) {
      for (const m of raid.markers) {
        const dx = m.x - p.x, dz = m.z - p.z, dd = Math.hypot(dx, dz);
        const on = scene.toScreen(m.x, 1, m.z, W, H, s) && s[0] > 40 && s[0] < W - 40 && s[1] > 40 && s[1] < H - 40;
        if (on || dd < 4) continue;
        const d = toDir(dx / dd, dz / dd);
        const ax = W / 2 + d[0] * (W / 2 - 60), ay = H / 2 + d[1] * (H / 2 - 110);
        g.save(); g.translate(ax, ay); g.rotate(Math.atan2(d[1], d[0]));
        g.fillStyle = '#58d8ff'; g.beginPath(); g.moveTo(12, 0); g.lineTo(-7, -7); g.lineTo(-3, 0); g.lineTo(-7, 7); g.closePath(); g.fill();
        g.restore();
        g.font = '600 11px ui-monospace, Menlo'; g.fillStyle = '#58d8ff';
        g.fillText(`${Math.round(dd)} m`, ax - d[0] * 30, ay - d[1] * 20);
      }
    }

    // Reticle: a spread ring that widens while firing and moving (doc 04, section 2).
    this.spread = Math.max(0, this.spread - dt * 2.2);
    if (this.hitT > 0) this.hitT -= dt;
    if (!p.dead) {
      const rx = (1 + input.ndcX) * W / 2, ry = (1 - input.ndcY) * H / 2;
      const rr = 9 + this.spread * 9 + (p.moving ? 3 : 0);
      const col = CLASSES[p.classId].css;
      if (cam.shoulder) {
        // Crosshair: four ticks that open with spread, a centre dot, and the class resource.
        const gap = 5 + this.spread * 9 + (p.moving ? 3 : 0), len = 8;
        for (const pass of [0, 1]) {
          g.strokeStyle = pass ? '#fff' : 'rgba(0,0,0,0.7)'; g.lineWidth = pass ? 2 : 4.5; g.lineCap = 'round';
          g.beginPath();
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(rx + ax * gap, ry + ay * gap); g.lineTo(rx + ax * (gap + len), ry + ay * (gap + len)); }
          g.stroke();
        }
        g.fillStyle = col; g.beginPath(); g.arc(rx, ry, 2, 0, 6.283); g.fill();
        this.drawResourceCue(g, raid, rx, ry, gap + len + 6, col);
      } else {
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3.5; g.beginPath(); g.arc(rx, ry, rr, 0, 6.283); g.stroke();
        g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.arc(rx, ry, rr, 0, 6.283); g.stroke();
        g.fillStyle = '#fff'; g.fillRect(rx - 1, ry - 1, 2, 2);
        this.drawResourceCue(g, raid, rx, ry, rr + 6, col);
      }
      if (this.hitT > 0) {
        g.strokeStyle = this.hitKill ? '#ff4d5a' : this.hitCrit ? '#ffd76a' : '#ffffff';
        g.lineWidth = 2;
        const a = 5, b = 11;
        g.beginPath();
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.moveTo(rx + sx * a, ry + sz * a); g.lineTo(rx + sx * b, ry + sz * b); }
        g.stroke();
      }
    }
  }
}

