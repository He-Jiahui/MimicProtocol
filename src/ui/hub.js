// Title, hub and debrief screens (docs 16 and 19). The hub is a character sheet:
// equipment slots, a paged stash with filters, item tooltips, and a detail panel for the
// selected item that repeats the comparison, so touch users get it without hover.
// Screens that spend a resource show its stock (doc 12).

import {
  CLASSES, CLASS_IDS, RARITY, SLOTS, SLOT_LABEL, SLOT_BASE, GEAR_AFFIXES, TIERS, ZONES, enhanceCost, REROLL_CASH, REROLL_SAMPLES,
  PROCESS_SAMPLES, gearRating, ASPECTS, DRONES, CREDIT_CASH,
} from '../sim/data.js';
import { packAll, dims } from '../sim/pack.js';
import { pieceFacts } from './bag.js';
import { slotBaseValue, gearStats, sealedBid, sealedView, issuePack, worth } from '../sim/loot.js';
import { compareGear } from '../sim/compare.js';
import { itemName, t, upper } from '../i18n/index.js';
import {
  totalRating, sellItem, processItem, equipItem, enhanceItem, rerollAffix, setClass, setTier, choosePack, activePack,
  buyDrone, assignDrone, deployedDrone, resolveLift, salePrice,
  hubChecklist, hubReady, hubTutorialActive, syncHubTutorial,
} from '../sim/profile.js';

const screen = () => document.getElementById('screen');
const SLOT_GLYPH = { weapon: '⚔', head: '⌬', body: '♜', hands: '❖', waist: '≡', shoes: '⌓' };
const CLASS_SIG = { rifleman: '⁝', blade: '⚔', summoner: '♜', toxic: '☣' };
const fmtAffix = (a) => `+${a.v}${GEAR_AFFIXES[a.k].unit} ${t(GEAR_AFFIXES[a.k].label)}`;
const fmtNum = (v, unit) => v.toFixed(unit === '/s' ? 2 : 1);
const fmtBase = (it, v = slotBaseValue(it)) => `+${fmtNum(v, SLOT_BASE[it.slot].unit)}${SLOT_BASE[it.slot].unit} ${t(SLOT_BASE[it.slot].label)}`;
const fmtClock = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const fmtRow = (v, unit) => unit === '%' ? `${v.toFixed(1)}%` : unit === 's' ? `${v.toFixed(2)} s` : unit ? `${v.toFixed(2)} ${unit}` : `${Math.round(v)}`;
export const STASH_PAGE = 40;

// The stash as shown (doc 38): filters apply across every page, then pages of 40. A sealed
// piece's slot is unknown, so a slot filter never lists it, and sorting reads visible facts only.
export function stashView(stash, f = {}, page = 0) {
  const { slot = 'all', state = 'all', quality = 'all' } = f;
  const list = stash.filter((it) => {
    const gear = it.kind === 'gear', sealed = gear && it.unid;
    if (slot === 'salvage' ? it.kind !== 'loot' : slot === 'packs' ? it.kind !== 'pack' : slot !== 'all' && (!gear || sealed || it.slot !== slot)) return false;
    if (state === 'sealed' ? !sealed : state === 'identified' && sealed) return false;
    return quality === 'all' || (gear && it.rarity === Number(quality));
  });
  const rank = (it) => (it.kind === 'gear' ? (it.unid ? 1 : 0) : it.kind === 'pack' ? 2 : 3);
  list.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) : 0)
    || (b.rarity ?? 0) - (a.rarity ?? 0) || (b.ilvl ?? 0) - (a.ilvl ?? 0) || worth(b) - worth(a));
  const pages = Math.max(1, Math.ceil(list.length / STASH_PAGE)), pg = Math.max(0, Math.min(pages - 1, page));
  return { items: list.slice(pg * STASH_PAGE, (pg + 1) * STASH_PAGE), all: list, page: pg, pages, total: list.length };
}

// An identified piece against the worn one in its slot, same class, no raid buffs: the rows
// that change, with units, then the rules gained and lost. Never one score (docs 26, 63).
export function compareHtml(p, it) {
  const C = it.kind === 'gear' && !it.unid ? compareGear(p.classId, p.equipped, it) : null;
  if (!C || (C.worn && C.worn.uid === it.uid)) return '';
  const head = t('If worn instead of {item} · {class}, no raid buffs', { item: C.worn ? itemName(C.worn) : t('nothing'), class: t(CLASSES[p.classId].name) });
  const rows = C.rows.map((r) => {
    const better = r.low ? r.to < r.from : r.to > r.from;
    return `<div class="tipStat"><span>${t(r.label)}</span><span>${fmtRow(r.from, r.unit)} → <b class="${better ? 'up' : 'down'}">${fmtRow(r.to, r.unit)}</b></span></div>`;
  }).join('');
  const rule = (id, sign) => `<div class="cmpRule ${sign === '+' ? 'up' : 'down'}">${sign} ✦ ${t(ASPECTS[id].name)}: ${t(ASPECTS[id].desc)}</div>`;
  const rules = C.gained.map((id) => rule(id, '+')).join('') + C.lost.map((id) => rule(id, '−')).join('');
  return `<div class="tipCmp cmp">${head}${rows || rules ? `${rows}${rules}` : `<div class="tipBody">${t('No stat or rule changes')}</div>`}</div>`;
}

export function clearScreen() { screen().innerHTML = ''; screen().oncontextmenu = null; }

export function showTitle(game) {
  const p = game.profile, fresh = !p.tutorial.annex;
  screen().innerHTML = `
  <div class="title">
    <h1>${t('MIMIC PROTOCOL')}</h1>
    <div class="tag">${t('EXTRACTION · SURVIVAL · ROGUELITE')}</div>
    <div class="rule"></div>
    <p>${t('An alien vessel hangs in high orbit. Mimics walk among the crowd and only your sense rig can see them. The link works both ways: when you see them, they see you. Search the city, outlast the horde, and extract alive.')}</p>
    <div>
      <button class="primary" data-act="begin">${t(fresh ? 'BEGIN TRAINING' : 'CONTINUE')}</button>
      <button data-act="${fresh ? 'skip' : 'training'}">${t(fresh ? 'SKIP TRAINING' : 'REPLAY TRAINING')}</button>
      <button data-act="settings">${t('SETTINGS')}</button>
    </div>
    <div class="foot"><span class="touchOnly">Left stick to move · Right stick to aim and fire · Menu for camera, map and bag</span><span class="keyDesktop">${t('WASD move · mouse aim · LMB / RMB / Shift / R skills · C scan · E interact · V camera')}</span></div>
  </div>`;
  screen().onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    game.audio.start();
    if (act === 'begin') { if (fresh) game.startTutorial(); else game.openHub(); }
    if (act === 'skip') game.skipTutorial();
    if (act === 'training') game.startTutorial();
    if (act === 'settings') game.openSettings();
  };
}

// Tooltip body for any item, with the comparison against the worn piece for identified gear.
export function itemTip(p, it, equipped = false) {
  if (it.kind === 'loot') {
    return `<div class="tipName">${itemName(it)}</div><div class="tipType">${t('Salvage')}</div><div class="tipBody">${t('Sells to the Quartermaster.')}</div><div class="tipFoot"><span>${t('Sell value')}</span><span>${it.value}¤</span></div>`;
  }
  if (it.kind === 'pack') return `<div class="tipName">${itemName(it)}</div><div class="tipType">${packInfo(it)}</div><div class="tipBody">${t('A field pack is carried, not worn. It drops on death.')}</div><div class="tipFoot"><span>${t('Sell value')}</span><span>${it.value || 0}¤</span></div>`;
  const col = RARITY[it.rarity].css;
  // Sealed: quality, Item Power, footprint, weight and the public bid. No slot, name, Prime,
  // Aspect, affix, stored value or comparison until Process (doc 63).
  if (it.unid) {
    return `<div class="tipName" style="color:${col}">${itemName(it)}</div><div class="tipType">${sealedInfo(it)}</div>
      <div class="tipBody">${t('Tainted Mimic gear. The Containment Lab must process it before it can be worn.')}</div><div class="tipFoot"><span>${t('Process')} ${PROCESS_SAMPLES}⬢</span><span>${t('Sealed bid')} ${sealedBid(it)}¤</span></div>`;
  }
  const cmp = equipped ? '' : compareHtml(p, it);
  return `<div class="tipName" style="color:${col}">${itemName(it)}${it.enh ? ` +${it.enh}` : ''}</div>
    <div class="tipType">${it.prime ? `<span style="color:#ffc23d">${t('Prime')}</span> ` : ''}${gearInfo(it)}</div>
    <div class="tipBase">${fmtBase(it)}</div>
    ${it.affixes.map((a) => `<div class="tipAff">${fmtAffix(a)}</div>`).join('') || `<div class="tipBody" style="color:#5d5446">${t('No affixes')}</div>`}
    ${it.aspect ? `<div class="tipCmp"><b style="color:#ffb347">✦ ${t(ASPECTS[it.aspect].name)}</b><br>${t(ASPECTS[it.aspect].desc)}</div>` : ''}
    ${cmp}
    <div class="tipFoot"><span>${t('Gear Rating')} ${gearRating(it).toFixed(1)}</span><span>${salePrice(it)}¤</span></div>`;
}

function sealedInfo(it) {
  const v = sealedView(it);
  return t('Item Power {power} · {w}x{h} cells · {kg} kg', { power: v.ilvl, w: v.w, h: v.h, kg: v.kg });
}

function packInfo(it) {
  return t('Field pack · {w}x{h} cells · {kg} kg empty', { w: it.w, h: it.h, kg: it.kg });
}

function gearInfo(it) {
  return t('{rarity} {slot} · Item Power {power}', { rarity: t(RARITY[it.rarity].name), slot: t(SLOT_LABEL[it.slot]), power: it.ilvl });
}

function cell(game, it, opts = {}) {
  const p = game.profile, tips = game.hud.tips;
  if (!it) return `<div class="cell empty">${opts.slot ? `<span style="opacity:.3">${SLOT_GLYPH[opts.slot]}</span><span class="slotName">${upper(SLOT_LABEL[opts.slot])}</span>` : ''}</div>`;
  tips[`it-${it.uid}`] = itemTip(p, it, opts.equipped);
  // No upgrade arrow: a single score hides what would change (doc 26).
  const gear = it.kind === 'gear', col = gear ? RARITY[it.rarity].css : it.kind === 'pack' ? '#c9a45c' : '#8c7f6a';
  return `<div class="cell${game.hubSel === it.uid ? ' sel' : ''}" data-act="select" data-uid="${it.uid}" data-tip="it-${it.uid}" style="--rar:${col}">
    ${gear && it.unid ? '?' : gear ? SLOT_GLYPH[it.slot] : it.kind === 'pack' ? '▦' : '▪'}${it.enh ? `<span class="lv">+${it.enh}</span>` : ''}${it.prime && !it.unid ? '<span class="tag">P</span>' : ''}
    ${opts.slot ? `<span class="slotName">${upper(SLOT_LABEL[opts.slot])}</span>` : ''}</div>`;
}

function detail(game) {
  const p = game.profile, uid = game.hubSel;
  const free = hubTutorialActive(p), fee = (cost) => free ? t('FREE') : cost;
  let it = p.stash.find((i) => i.uid === uid), equipped = false;
  if (!it) { it = SLOTS.map((s) => p.equipped[s]).find((i) => i && i.uid === uid); equipped = !!it; }
  if (!it) return `<div class="empty">${t('Select an item to inspect it. Right-click a stash item to equip or sell it.')}</div>`;
  if (it.kind === 'loot') return `<div class="detail"><div class="nm">${itemName(it)}</div><div class="meta">${t('Salvage')}</div><div class="acts"><button data-act="sell" data-uid="${it.uid}">${t('SELL')} ${it.value}¤</button></div></div>`;
  if (it.kind === 'pack') {
    const on = p.pack === it.uid;
    return `<div class="detail"><div class="nm">${itemName(it)}</div><div class="meta">${packInfo(it)}${on ? ` · ${t('deploying')}` : ''}</div>
      <div class="acts">${on ? `<button data-act="pack" data-uid="">${t('USE THE ISSUE PACK')}</button>` : `<button class="primary" data-act="pack" data-uid="${it.uid}">${t('TAKE ON NEXT DEPLOYMENT')}</button>`}
      <button data-act="sell" data-uid="${it.uid}">${t('SELL')} ${it.value || 0}¤</button></div></div>`;
  }
  const col = RARITY[it.rarity].css;
  if (it.unid) {
    return `<div class="detail"><div class="nm" style="color:${col}">${itemName(it)}</div><div class="meta">${sealedInfo(it)} · ${t('Sealed bid')} ${sealedBid(it)}¤</div>
      <div class="tipBody" style="margin:6px 0">${t('Sell it as-is for the bid, or process it to learn what is inside.')}</div>
      <div class="acts"><button class="primary" data-act="process" data-uid="${it.uid}" ${free || p.samples >= PROCESS_SAMPLES ? '' : 'disabled'}>${upper('Process')} · ${fee(`${PROCESS_SAMPLES}⬢`)}</button>
      <button data-act="sell" data-uid="${it.uid}">${t('SELL SEALED')} ${sealedBid(it)}¤</button></div></div>`;
  }
  const lvl = it.enh || 0, cost = enhanceCost(lvl), needCore = lvl >= 5;
  const canEnh = lvl < 8 && (free || (p.cash >= cost && (!needCore || p.cores > 0)));
  const canRe = free || (p.cash >= REROLL_CASH && p.samples >= REROLL_SAMPLES);
  return `<div class="detail">
    <div class="nm" style="color:${col}">${itemName(it)}${lvl ? ` +${lvl}` : ''}</div>
    <div class="meta">${gearInfo(it)} · ${t('Gear Rating')} ${gearRating(it).toFixed(1)}${equipped ? ` · ${t('equipped')}` : ''}</div>
    <div class="aff"><span style="color:#fff">${fmtBase(it)}</span></div>
    ${it.aspect ? `<div class="aff"><span style="color:#ffb347">✦ ${t(ASPECTS[it.aspect].name)}: ${t(ASPECTS[it.aspect].desc)}</span></div>` : ''}
    ${it.affixes.map((a, i) => `<div class="aff"><span>◆ ${fmtAffix(a)}</span><button class="small" data-act="reroll" data-uid="${it.uid}" data-i="${i}" ${canRe ? '' : 'disabled'}>${t('REROLL')} · ${fee(`${REROLL_CASH}¤ ${REROLL_SAMPLES}⬢`)}</button></div>`).join('')}
    ${equipped ? '' : compareHtml(p, it)}
    <div class="acts">
      ${equipped ? '' : `<button class="primary" data-act="equip" data-uid="${it.uid}">${t('EQUIP')}</button>`}
      <button data-act="enhance" data-uid="${it.uid}" ${canEnh ? '' : 'disabled'}>${lvl >= 8 ? t('MAX LEVEL') : `${t('ENHANCE')} +${lvl + 1} · ${fee(`${cost}¤${needCore ? ' ◆' : ''}`)}`}</button>
      ${equipped ? '' : `<button data-act="sell" data-uid="${it.uid}">${t('SELL')} ${salePrice(it)}¤</button>`}
    </div></div>`;
}

// What leaves the hub with the operator besides the worn kit: the field pack and at most one
// insurance drone (docs 61, 62).
function quartermaster(game) {
  const p = game.profile, pk = activePack(p) || issuePack(), on = deployedDrone(p), guided = hubTutorialActive(p);
  const stat = (a, b) => `<div class="statline"><span>${t(a)}</span><span>${b}</span></div>`;
  const drones = Object.entries(DRONES).map(([id, D]) => {
    const have = p.drones?.[id] || 0;
    return `<div class="drone${on === id ? ' sel' : ''}"><div><b>${t(D.name)}</b> ×${have}<small>${t('Bay {w}x{h} · returns up to {credits} Credits', { w: D.w, h: D.h, credits: D.credits })}</small></div>
      <span><button class="small" data-act="buydrone" data-id="${id}" ${!guided && p.cash >= D.cash ? '' : 'disabled'}>${t('BUY')} ${D.cash}¤</button>${have ? `<button class="small" data-act="drone" data-id="${on === id ? '' : id}">${t(on === id ? 'UNASSIGN' : 'ASSIGN')}</button>` : ''}</span></div>`;
  }).join('');
  return `${stat('Field pack', `${itemName(pk)} · ${pk.w}x${pk.h}`)}${stat('Insurance drone', on ? t(DRONES[on].name) : t('none assigned'))}
    <div class="empty" style="margin:6px 0 8px">${t('Pick a found pack in the stash to deploy with it. It drops on death; the issue pack is always free.')}</div>
    ${drones}<div class="empty" style="margin-top:6px">${t(guided ? 'Drones are sold after the training checklist.' : 'One drone per deployment. If you die it lifts what fits its bay and is spent; after an extraction it comes back unused.')}</div>`;
}

// After a death with a drone: pack whole pieces into its bay, seeing only what a sealed piece
// discloses. Cards keep the carried order, never a ranking by hidden rolls (doc 62).
export function showLift(game, note = '') {
  const p = game.profile, L = p.pendingLift;
  if (!L) { showHub(game); return; }
  const D = DRONES[L.drone];
  game.liftSel = (game.liftSel || []).filter((uid) => L.cargo.some((i) => i.uid === uid));
  const sel = L.cargo.filter((i) => game.liftSel.includes(i.uid)), places = packAll(D.w, D.h, sel) || [];
  const cells = Array.from({ length: D.w * D.h }, () => '<div class="slot"></div>').join('');
  const pieces = sel.map((it, k) => {
    const F = pieceFacts(it), at = places[k], [w, h] = dims(it, at.r);
    return `<div class="piece" style="--rar:${F.col};--x:${at.x};--y:${at.y};--pw:${w};--ph:${h}"><span>${F.name}</span></div>`;
  }).join('');
  const cards = L.cargo.map((it) => {
    const F = pieceFacts(it), on = game.liftSel.includes(it.uid);
    return `<div class="near${on ? ' sel' : ''}" data-act="lift" data-uid="${it.uid}" style="--rar:${F.col}"><span>${F.name}<small>${F.facts} · ${F.value}</small></span><b class="${on ? 'up' : 'down'}">${t(on ? 'LIFT' : 'lost')}</b></div>`;
  }).join('');
  screen().innerHTML = `<div class="debrief"><div class="modalBox ornate">
    <h1 class="lose">${t('DRONE RECOVERY')}</h1>
    <div class="sub">${t(D.name)} · ${t('Bay {w}x{h} · returns up to {credits} Credits', { w: D.w, h: D.h, credits: D.credits })}</div>
    <p style="line-height:1.5">${t('Choose whole pieces for the bay. Only what fits comes home, still sealed; the rest is lost with the pack. The drone is spent either way.')}</p>
    <div class="lift"><div class="packGrid" style="--w:${D.w};--h:${D.h}">${cells}${pieces}</div><div class="liftList">${cards}</div></div>
    ${note ? `<div class="note" style="margin-top:10px">${t(note)}</div>` : ''}
    <div class="row"><button class="primary" data-act="confirm">${t('CONFIRM · LIFT {count}', { count: sel.length })}</button></div>
  </div></div>`;
  screen().onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'lift') {
      const uid = el.dataset.uid, i = game.liftSel.indexOf(uid);
      if (i >= 0) { game.liftSel.splice(i, 1); showLift(game); return; }
      const next = L.cargo.filter((it) => game.liftSel.includes(it.uid) || it.uid === uid);
      if (!packAll(D.w, D.h, next)) { showLift(game, 'That piece does not fit the bay with the others'); return; }
      game.liftSel.push(uid);
      showLift(game);
    } else if (el.dataset.act === 'confirm') {
      const res = resolveLift(p, game.liftSel);
      if (!res.ok) { showLift(game, res.why); return; }
      game.liftSel = [];
      game.save();
      showDebrief(game, p.lastDebrief);
    }
  };
}

export function showHub(game, note = '') {
  const p = game.profile, ready = hubReady(p), guided = hubTutorialActive(p);
  const balance = (value, symbol) => `${guided ? '∞' : value}${symbol}`;
  const checklist = hubChecklist(p), next = checklist.find((s) => !s.done);
  const cls = CLASSES[p.classId], st = gearStats(p.equipped);
  game.hud.tips = {};
  const classes = CLASS_IDS.map((id) => {
    const c = CLASSES[id];
    game.hud.tips[`cls-${id}`] = `<div class="tipName" style="color:${c.css}">${t(c.name)}</div><div class="tipType">${t(c.role)} · ${t('{hp} health', { hp: c.hp })}</div><div class="tipBody">${t(c.blurb)}</div>${c.skills.map((s) => `<div class="tipCmp"><b style="color:#c9a45c">${s.key}</b> ${t(s.name)}${s.params.cd ? ` · ${t('{seconds}s', { seconds: s.params.cd })}` : ''}<br><span style="color:#8c7f6a">${t(s.desc)}</span></div>`).join('')}`;
    return `<div class="cls${p.classId === id ? ' sel' : ''}" style="color:${c.css}" data-act="class" data-id="${id}" data-tip="cls-${id}"><span class="sig">${CLASS_SIG[id]}</span><div><div class="nm">${upper(c.name)}</div><div class="rl">${t(c.role)}</div></div></div>`;
  }).join('');
  const tiers = [1, 2, 3].map((tier) => {
    const T = TIERS[tier], locked = tier > p.tierUnlocked;
    return `<div class="tier${p.tier === tier && p.tutorial.tierPicked ? ' sel' : ''}${locked ? ' locked' : ''}" data-act="tier" data-id="${tier}"><span>${t('TIER {tier}', { tier: ['I', 'II', 'III'][tier - 1] })} ${locked ? '🔒' : ''}</span><small>${t('hp x{hp} · dmg x{damage} · rare x{rare}', { hp: T.hp.toFixed(2), damage: T.dmg.toFixed(2), rare: T.rare.toFixed(2) })}</small></div>`;
  }).join('');
  const loot = p.stash.filter((i) => i.kind === 'loot');
  const lootValue = loot.reduce((a, i) => a + i.value, 0);
  game.hubFilter ||= { slot: 'all', state: 'all', quality: 'all' };
  const V = stashView(p.stash, game.hubFilter, game.hubPage || 0);
  game.hubPage = V.page;
  const opt = (k, v, label) => `<option value="${v}" ${game.hubFilter[k] === v ? 'selected' : ''}>${t(label)}</option>`;
  const filters = `<div class="filters">
    <select data-filter="slot" aria-label="${t('Slot')}">${opt('slot', 'all', 'All slots')}${SLOTS.map((s) => opt('slot', s, SLOT_LABEL[s])).join('')}${opt('slot', 'packs', 'Packs')}${opt('slot', 'salvage', 'Salvage')}</select>
    <select data-filter="state" aria-label="${t('State')}">${opt('state', 'all', 'Sealed and identified')}${opt('state', 'sealed', 'Sealed')}${opt('state', 'identified', 'Identified')}</select>
    <select data-filter="quality" aria-label="${t('Quality')}">${opt('quality', 'all', 'Any quality')}${RARITY.map((r, i) => opt('quality', String(i), r.name)).join('')}</select></div>`;
  const pager = V.pages > 1 ? `<div class="pager"><button class="small" data-act="page" data-id="-1" ${V.page ? '' : 'disabled'}>‹</button><span>${t('Page {page} of {pages}', { page: V.page + 1, pages: V.pages })}</span><button class="small" data-act="page" data-id="1" ${V.page < V.pages - 1 ? '' : 'disabled'}>›</button></div>` : '';
  const stat = (a, b) => `<div class="statline"><span>${t(a)}</span><span>${b}</span></div>`;
  const d = p.lastDebrief;
  const guide = (ids) => (guided && next && ids.includes(next.id) ? ' guide' : '');

  screen().innerHTML = `
  <div class="hub">
    <div class="hubHead">
      <h1>${t('COMMAND HUB')}</h1>
      <span class="res">${t('Cash')} <b>${balance(p.cash, '¤')}</b></span><span class="res">${t('Lab Samples')} <b>${balance(p.samples, '⬢')}</b></span><span class="res">${t('Boss Cores')} <b>${balance(p.cores, '◆')}</b></span><span class="sp"></span>
      <button class="small" data-act="settings">${t('SETTINGS')}</button><button class="small" data-act="training">${t('REPLAY TRAINING')}</button><button class="small danger" data-act="reset">${t('RESET PROFILE')}</button>
    </div>
    ${note ? `<div class="note">${t(note)}</div>` : ''}
    <div class="hubGrid">
      <div class="hubCol">
        <h3>${t('OPERATOR')}</h3>
        <div class="box${guide(['equip', 'enhance', 'reroll'])}">
          <div class="doll" style="--cls:${cls.css}">
            ${cell(game, p.equipped.weapon, { equipped: true, slot: 'weapon' })}
            <div class="emblem"><div><div class="sig">${CLASS_SIG[p.classId]}</div><div class="nm">${upper(cls.name)}</div><div class="gr">${t('Gear Rating')} ${totalRating(p)}</div></div></div>
            ${SLOTS.slice(1).map((s) => cell(game, p.equipped[s], { equipped: true, slot: s })).join('')}
          </div>
          <div style="margin-top:26px">
            ${stat('Health', Math.round(cls.hp * (1 + st.hp / 100)))}${stat('Damage', `+${st.dmg.toFixed(1)}%`)}${stat('Skill damage', `+${st.skill.toFixed(1)}%`)}
            ${stat('Attack speed', `+${st.aspd.toFixed(1)}%`)}${stat('Critical chance', `${(5 + st.crit).toFixed(1)}%`)}${stat('Damage reduction', `${(cls.dr * 100 + st.dr).toFixed(1)}%`)}
            ${stat('Cooldown reduction', `${st.cdr.toFixed(1)}%`)}${stat('Move speed', `+${st.move.toFixed(1)}%`)}${stat('Health regen', `${st.regen.toFixed(2)}/s`)}${stat('Credits', `+${st.credits.toFixed(1)}%`)}
          </div>
        </div>
        <h3>${t('BARRACKS')}</h3>
        <div class="box${guide(['class'])}">${classes}</div>
      </div>
      <div class="hubCol">
        <h3>${t('STASH')} <span style="color:#5d5446;letter-spacing:.06em;font-family:var(--sans)">${t('{count} items', { count: p.stash.length })}</span></h3>
        <div class="box${guide(['sell', 'process'])}">
          ${p.stash.length ? filters : ''}
          <div class="grid">${V.items.map((i) => cell(game, i)).join('')}${p.stash.length ? (V.total ? '' : `<div class="empty" style="grid-column:1/-1">${t('Nothing matches these filters.')}</div>`) : `<div class="empty" style="grid-column:1/-1">${t('The stash is empty. Extract with loot to fill it.')}</div>`}</div>
          ${pager}
          ${loot.length > 1 ? `<div style="text-align:right;margin-top:8px"><button class="small" data-act="sellall">${t('SELL ALL SALVAGE')} · ${lootValue}¤</button></div>` : ''}
        </div>
        <h3>${t('ARMORY · LAB · QUARTERMASTER')}</h3>
        <div class="box">${detail(game)}</div>
      </div>
      <div class="hubCol">
        ${guided ? `<h3>${t('RELAY · FIRST VISIT')}</h3><div class="box guide"><div class="empty">${t('Training resources are unlimited and reset to zero when the checklist is complete.')}</div>${checklist.map((s) => `<div class="check${s.done ? ' done' : s === next ? ' next' : ''}">${s.done ? '◆' : s === next ? '▶' : '◇'} ${t(s.label)}</div>`).join('')}</div>` : ''}
        <h3>${t('QUARTERMASTER')}</h3>
        <div class="box">${quartermaster(game)}</div>
        <h3>${t('THREAT CONSOLE')}</h3>
        <div class="box${guide(['tier'])}">${tiers}<div class="empty" style="margin-top:6px">${t('Each tier opens after an extraction on the one before.')}</div></div>
        <button class="primary deploy${ready ? ' pulse' : ''}" data-act="deploy" ${ready ? '' : 'disabled'}>${t('DEPLOY')}</button>
        <div class="empty" style="margin:7px 0 14px;text-align:center">${ready ? `${t('Meridian South Sector')} · ${t(cls.name)} · ${t('Tier {tier}', { tier: p.tier })} · ${itemName(activePack(p) || issuePack())}${deployedDrone(p) ? ` · ${t(DRONES[deployedDrone(p)].name)}` : ''}` : t('Finish the checklist to unlock the first raid.')}</div>
        <h3>${t('RECORD')}</h3>
        <div class="box">
          ${stat('Raids', p.stats.raids)}${stat('Extractions', p.stats.extractions)}${stat('Mimics killed', p.stats.kills)}${stat('Elites killed', p.stats.elites)}
          ${stat('Matron kills', p.stats.bossKills)}${stat('Best haul', p.stats.bestValue)}
          ${d && d.mode !== 'tutorial' ? stat('Last raid', t('{outcome} at {time}', { outcome: t(d.outcome), time: fmtClock(d.clock) })) : ''}
        </div>
      </div>
    </div>
  </div>`;

  const act = (name, uid, id, i) => {
    let res = null;
    switch (name) {
      case 'select': game.hubSel = uid; res = { ok: true }; break;
      case 'page': game.hubPage = (game.hubPage || 0) + Number(id); res = { ok: true }; break;
      case 'class': res = setClass(p, id); break;
      case 'pack': res = choosePack(p, uid || null); break;
      case 'buydrone': res = buyDrone(p, id); if (res.ok) game.audio.play('coin'); break;
      case 'drone': res = assignDrone(p, id || null); break;
      case 'tier': res = setTier(p, Number(id)); break;
      case 'sell': res = sellItem(p, uid); if (res.ok) game.audio.play('coin'); break;
      case 'sellall': for (const it of p.stash.filter((s) => s.kind === 'loot')) sellItem(p, it.uid); game.audio.play('coin'); res = { ok: true }; break;
      // Process keeps the piece selected and in view, even under a Sealed filter (doc 63).
      case 'process': res = processItem(p, uid); if (res.ok) { game.audio.play('scan'); game.hubSel = uid; keepInView(game, uid); } break;
      case 'equip': res = equipItem(p, uid); if (res.ok) game.audio.play('deploy'); break;
      case 'enhance': res = enhanceItem(p, uid); if (res.ok) game.audio.play('level'); break;
      case 'reroll': res = rerollAffix(p, uid, Number(i)); if (res.ok) game.audio.play('item'); break;
      case 'deploy': game.startRaid(); return;
      case 'training': game.startTutorial(); return;
      case 'settings': game.openSettings(); return;
      case 'reset': if (confirm(t('Erase this profile and start over?'))) game.resetProfile(); return;
      default: return;
    }
    document.getElementById('tooltip').classList.add('hidden');
    if (res.ok) syncHubTutorial(p);
    game.save();
    showHub(game, res && !res.ok ? res.reason || res.why : '');
  };
  screen().onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    act(el.dataset.act, el.dataset.uid, el.dataset.id, el.dataset.i);
  };
  screen().onchange = (e) => {
    const k = e.target.dataset?.filter;
    if (!k) return;
    game.hubFilter[k] = e.target.value;
    game.hubPage = 0;
    showHub(game);
  };
  // Right-click is the quick action: equip gear, process unidentified gear, sell salvage.
  screen().oncontextmenu = (e) => {
    const el = e.target.closest('.grid [data-uid]');
    if (!el) return;
    const it = p.stash.find((i) => i.uid === el.dataset.uid);
    if (!it) return;
    game.hubSel = it.uid;
    act(it.kind === 'loot' ? 'sell' : it.unid ? 'process' : 'equip', it.uid);
  };
}

export function keepInView(game, uid) {
  const p = game.profile, f = game.hubFilter;
  if (!stashView(p.stash, f).all.some((i) => i.uid === uid)) f.state = 'all';
  if (!stashView(p.stash, f).all.some((i) => i.uid === uid)) Object.assign(f, { slot: 'all', quality: 'all' });
  const i = stashView(p.stash, f).all.findIndex((x) => x.uid === uid);
  if (i >= 0) game.hubPage = Math.floor(i / STASH_PAGE);
}

function suggestGoals(p, d) {
  const goals = [];
  const unid = p.stash.filter((i) => i.unid).length;
  if (unid) goals.push(t('Process {count} sealed piece{plural} at the Containment Lab.', { count: unid, plural: unid > 1 ? 's' : '' }));
  const w = p.equipped.weapon;
  if ((w.enh || 0) < 5) goals.push(t('Enhance your weapon to +{level} ({cost} Cash).', { level: (w.enh || 0) + 1, cost: enhanceCost(w.enh || 0) }));
  if (p.tierUnlocked < 2) goals.push('Extract from a Tier I raid to unlock Tier II.');
  if (d.zmax < 2) goals.push('Push into an Elevated zone (Z2): loot weight x1.4.');
  else if (d.zmax < 3) goals.push('Reach a High zone (Z3) and clear a Nest for guaranteed Mimic gear.');
  if (!p.stats.bossKills) goals.push('Find the Matron of Hollows in Z3 (magenta diamond on the map).');
  if (d.seconds < 300) goals.push('Survive five minutes of pressure and bring down a Titan.');
  goals.push('Reach level 15 in one raid.');
  return goals.slice(0, 3);
}

// Death or curfew: what was kept, what the drone brought home and what was lost (doc 62).
function ending(d, line) {
  const out = [line('Worn kit', t('kept')), line('Lost', t('the pack and {count} carried piece{plural}', { count: d.lost, plural: d.lost === 1 ? '' : 's' }), '#e0453f')];
  if (d.drone && DRONES[d.drone]) {
    out.push(line(t('{drone} lifted', { drone: t(DRONES[d.drone].name) }), (d.lifted || []).map((i) => itemName(i)).join(', ') || t('nothing'), '#6fe08a'));
    out.push(line('Credits recovered by the drone', `${d.droneCredits} → +${Math.floor(d.droneCredits * CREDIT_CASH)}¤`, '#6fe08a'));
  } else out.push(line('No drone assigned', t('{credits} raid Credits lost', { credits: d.credits }), '#e0453f'));
  return out.join('');
}

export function showDebrief(game, d) {
  const p = game.profile;
  const win = d.outcome === 'extracted', tut = d.mode === 'tutorial';
  const title = tut ? 'TRAINING COMPLETE' : win ? 'EXTRACTED' : d.outcome === 'curfew' ? 'CURFEW' : 'KILLED IN ACTION';
  const line = (a, b, col = '') => `<div class="statline"><span>${t(a)}</span><span style="${col ? `color:${col}` : ''}">${b}</span></div>`;
  let body;
  if (tut) {
    body = `<p style="line-height:1.55;text-align:center">${t('Relay: "Adequate. You carried out 2 Sealed Data Cases and 1 sealed Rare piece. Report to the hub: sell the cases, process the sealed piece, then gear up for Meridian South."')}</p>`;
  } else {
    body = `
      ${line('Survived', t('{minutes}m {seconds}s · exit {time}', { minutes: Math.floor(d.seconds / 60), seconds: Math.floor(d.seconds % 60), time: fmtClock(d.clock) }))}
      ${line('Deepest zone', `${ZONES[d.zmax].label}`, ZONES[d.zmax].css)}
      ${line('Kills / elites', `${d.kills} / ${d.elites}`)}
      ${line('Level / run items', `${d.level} / ${d.items}`)}
      ${line('Carried value', `${d.value}`, '#ffc23d')}
      ${win ? line(`${t('Extraction Bonus')}  V x (0.05 x ${d.zmax} + 0.25 x ${d.nl.toFixed(2)})`, `+${d.bonus}¤`, '#6fe08a') : ending(d, line)}
      ${win ? line(t('Raid Credits converted ({pct}%)', { pct: CREDIT_CASH * 100 }), `${d.credits} → +${d.creditCash}¤`, '#6fe08a') : ''}
      ${d.contracts.map((c) => line(t('Contract: {name}', { name: t(c.label) }), t(c.done ? (win ? 'paid' : 'forfeit') : 'not done'), c.done && win ? '#6fe08a' : '#8c7f6a')).join('')}
      ${win && d.contractPay ? line('Contract payouts', `+${d.contractPay}¤`, '#6fe08a') : ''}
      ${d.bossCash ? line('Matron bounty', `+${d.bossCash}¤`, '#6fe08a') : ''}
      ${d.penalty ? line(`${t('Civilian penalty')} (${d.civKills})`, `-${d.penalty}¤`, '#e0453f') : ''}
      ${win && (d.samples || d.cores) ? line('Lab Samples / Boss Cores', `+${d.samples}⬢  +${d.cores}◆`) : ''}
      <div style="margin:10px 0 2px" class="statline"><span>${t('Cash change')}</span><span class="big">${d.cashGain >= 0 ? '+' : ''}${d.cashGain}¤</span></div>
      ${line('Gear Rating', `${d.ratingAfter}${p.stash.some((i) => i.kind === 'gear') ? ` · ${t('new gear is waiting in the stash')}` : ''}`)}
      <h3>${t('NEXT GOALS')}</h3>
      <ul class="goals">${suggestGoals(p, d).map((g) => `<li>${t(g)}</li>`).join('')}</ul>`;
  }
  screen().innerHTML = `<div class="debrief"><div class="modalBox ornate">
    <h1 class="${win ? 'win' : 'lose'}">${t(title)}</h1>
    <div class="sub">${tut ? t('TRAINING ANNEX') : `${t('MERIDIAN SOUTH SECTOR')} · ${t('TIER {tier}', { tier: d.tier })} · ${upper(CLASSES[d.classId].name)}`}</div>
    ${body}
    <div class="row"><button class="primary" data-act="hub">${t('RETURN TO HUB')}</button></div>
  </div></div>`;
  screen().onclick = (e) => { if (e.target.closest('[data-act="hub"]')) game.openHub(); };
}
