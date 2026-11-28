// Raid bag screen (docs 38, 61): the field pack as a real grid. Mouse and touch share one
// model: select a piece, then a cell (dragging is the same move, and a right-click or the
// Rotate button turns it). Every change goes through the raid's bag actions; the screen
// otherwise only reads state, and a sealed piece only ever shows its public view.

import { RARITY, ITEMS } from '../sim/data.js';
import { publicView, worth } from '../sim/loot.js';
import { footprint, dims, occupancy, fitsAt } from '../sim/pack.js';
import { icon } from './icons.js';
import { itemName, t } from '../i18n/index.js';

const $ = (id) => document.getElementById(id);
const GAP = 3;
const colour = (v) => v.kind === 'gear' ? RARITY[v.rarity].css : v.kind === 'med' ? '#7dffa0' : v.kind === 'pack' ? '#c9a45c' : '#8c7f6a';
const glyph = (v) => icon(v.kind === 'gear' ? 'unknown' : v.kind === 'med' ? 'medkit' : v.kind === 'pack' ? 'carry' : 'loot');

// What a piece shows: name, handling facts and worth. Sealed pieces show quality and Item
// Power only (doc 63), and their worth is the public bid.
export function pieceFacts(it) {
  const v = publicView(it), f = footprint(it);
  const facts = v.kind === 'gear' && v.unid ? t('Item Power {power} · {w}x{h} cells · {kg} kg', { power: v.ilvl, w: v.w, h: v.h, kg: v.kg })
    : v.kind === 'pack' ? t('Field pack · {w}x{h} cells · {kg} kg empty', { w: v.w, h: v.h, kg: v.kg })
    : t('{w}x{h} cells · {kg} kg', { w: f.w, h: f.h, kg: f.kg });
  const value = v.kind === 'gear' && v.unid ? `${t('Sealed bid')} ${v.bid}` : v.kind === 'med' ? t('Raid supply') : `${worth(v)}`;
  return { name: itemName(v), facts, value, col: colour(v), v };
}

export function bagHtml(raid, sel = null, note = '', tips = {}) {
  const p = raid.player, pk = p.pack;
  const piece = (it, src, x, y) => {
    const F = pieceFacts(it), [w, h] = dims(it, it.at?.r || 0);
    tips[`bag-${it.uid}`] = `<div class="tipName" style="color:${F.col}">${F.name}</div><div class="tipType">${F.facts}</div><div class="tipFoot"><span></span><span>${F.value}</span></div>`;
    const label = w * h >= 2 ? `<span>${F.v.kind === 'gear' && F.v.unid ? t(RARITY[F.v.rarity].name) : F.name}</span>` : '';
    return `<div class="piece${sel?.uid === it.uid ? ' sel' : ''}" data-uid="${it.uid}" data-src="${src}" data-tip="bag-${it.uid}" style="--rar:${F.col};--x:${x};--y:${y};--pw:${w};--ph:${h}">${glyph(F.v)}${label}</div>`;
  };
  const cells = [];
  for (let y = 0; y < pk.h; y++) for (let x = 0; x < pk.w; x++) cells.push(`<div class="slot" data-cell="${x},${y}"></div>`);
  const placed = p.inv.filter((it) => it.at).map((it) => piece(it, 'inv', it.at.x, it.at.y)).join('');
  const pockets = p.pockets.map((m, i) => `<div class="pocket" data-pocket="${i}">${m ? piece(m, 'pocket', 0, 0) : ''}</div>`).join('');
  const speed = raid.loadedSpeed(0);
  const load = t('{kg} kg · {speed} m/s ({pct}% of base)', { kg: p.kg.toFixed(1), speed: speed.toFixed(1), pct: Math.round(p.loadMul * 100) });
  // The selection line repeats the tooltip for touch, where there is no hover.
  const chosen = sel && (raid.findCargo(sel.uid)?.item || raid.nearby().find((n) => n.item.uid === sel.uid)?.item);
  const info = chosen ? (() => { const F = pieceFacts(chosen); return `<b style="color:${F.col}">${F.name}</b> · ${F.facts} · ${F.value}`; })() : '';
  const carried = sel && raid.findCargo(sel.uid);
  // At the street broker a carried piece sells for 80% of its public bid, in raid Credits.
  const sale = carried && carried.where === 'inv' && carried.item.kind !== 'med' && raid.atBroker()
    ? `<button class="small" data-bag="sell">${t('SELL · {credits} CREDITS', { credits: raid.brokerPrice(carried.item) })}</button>` : '';
  const near = raid.nearby().map((n) => {
    const F = pieceFacts(n.item);
    let preview, ok, btn;
    if (n.item.kind === 'pack') {
      const S = raid.swapPlan(n.item), total = p.inv.length;
      ok = true;
      preview = t('Swap: {moved} of {total} pieces move · {speed} m/s', { moved: total - S.left.length, total, speed: S.speed.toFixed(1) });
      btn = t('SWAP PACK');
    } else {
      const P = raid.takePlan([n.item]);
      ok = P.fit.length > 0;
      preview = ok ? t('Fits · {speed} m/s', { speed: P.speed.toFixed(1) }) : t('No room in the pack');
      btn = t('TAKE');
    }
    return `<div class="near${sel?.uid === n.item.uid ? ' sel' : ''}" data-uid="${n.item.uid}" data-src="${n.ref}" style="--rar:${F.col}"><span>${glyph(F.v)} ${F.name}<small>${F.facts} · ${F.value}</small><small class="${ok ? 'up' : 'down'}">${preview}</small></span><button class="small" data-bag="take" data-ref="${n.ref}" data-uid="${n.item.uid}" ${ok ? '' : 'disabled'}>${btn}</button></div>`;
  }).join('') || `<div class="empty">${t('Nothing within reach. Search a container or stand by cargo on the floor.')}</div>`;
  const items = Object.entries(p.items).map(([id, n]) => `<div class="rowItem" style="border-color:${RARITY[ITEMS[id].rarity].css}"><span>${icon(id)} ${t(ITEMS[id].name)} x${n}<small>${t(ITEMS[id].desc)}</small></span></div>`).join('') || `<div class="empty">${t('No run items yet. Buy from Supply Caches.')}</div>`;
  return `<div class="bagMain">
      <h3>${t('FIELD PACK {w}x{h}', { w: pk.w, h: pk.h })} <small>${load}</small></h3>
      <div class="packGrid" style="--w:${pk.w};--h:${pk.h}">${cells.join('')}${placed}</div>
      <div class="pockets"><span>${t('QUICK POCKETS')}</span>${pockets}</div>
      <div class="bagTools"><button class="small" data-bag="rotate" ${sel ? '' : 'disabled'}>${t('ROTATE')}</button><button class="small" data-bag="drop" ${carried ? '' : 'disabled'}>${t('DROP')}</button>${sale}<span class="bagValue">${t('Carried value {value}', { value: raid.carryValue() })}</span></div>
      <div class="bagInfo">${info}</div>
      <div class="bagNote">${note}</div>
    </div>
    <div class="bagSide"><h3>${t('WITHIN REACH')}</h3>${near}<h3>${t('RUN ITEMS')}</h3>${items}</div>`;
}

export class BagScreen {
  constructor(hud) {
    this.hud = hud; this.sel = null; this.note = ''; this.drag = null; this.dragged = false;
    const body = $('invBody');
    body.addEventListener('click', (e) => this.click(e));
    body.addEventListener('pointerdown', (e) => this.down(e));
    body.addEventListener('pointermove', (e) => this.move(e));
    body.addEventListener('pointerup', (e) => this.up(e));
    body.addEventListener('pointercancel', () => { this.drag = null; this.render(); });
    body.addEventListener('contextmenu', (e) => { const el = e.target.closest('.piece[data-uid]'); if (!el) return; e.preventDefault(); this.select(el.dataset.uid, el.dataset.src); this.action('rotate'); });
  }
  get raid() { return this.hud.raid; }
  open() {
    this.sel = null;
    this.note = document.documentElement.classList.contains('touchUI')
      ? t('Tap a piece, then a cell to move it there. You can also drag it; Rotate turns it.')
      : t('Select a piece, then a cell to move it there. Drag with the mouse; right-click or Rotate turns it.');
    this.render();
  }
  render() {
    if (!this.raid) return;
    this.hud.tip.classList.add('hidden');
    $('invBody').innerHTML = bagHtml(this.raid, this.sel, this.note, this.hud.tips);
  }
  item(uid) { return this.raid.findCargo(uid)?.item || this.raid.nearby().find((n) => n.item.uid === uid)?.item || null; }
  select(uid, src) {
    const it = this.item(uid);
    this.sel = it ? { uid, src, r: it.at?.r || 0 } : null;
  }
  carried(s = this.sel) { return s && (s.src === 'inv' || s.src === 'pocket'); }
  click(e) {
    if (this.dragged) { this.dragged = false; return; }
    if (!this.raid) return;
    // A focused button would swallow Tab (input.js ignores keys aimed at buttons).
    document.activeElement?.blur?.();
    const btn = e.target.closest('[data-bag]');
    if (btn) { if (!btn.disabled) this.action(btn.dataset.bag, btn.dataset); return; }
    const pc = e.target.closest('.piece[data-uid], .near[data-uid]');
    if (pc) { if (this.sel?.uid === pc.dataset.uid) this.sel = null; else this.select(pc.dataset.uid, pc.dataset.src); this.note = ''; this.render(); return; }
    const cell = e.target.closest('[data-cell]');
    if (cell) { const [x, y] = cell.dataset.cell.split(',').map(Number); this.place(x, y); return; }
    const pocket = e.target.closest('[data-pocket]');
    if (pocket) this.pocket(Number(pocket.dataset.pocket));
  }
  place(x, y) {
    const s = this.sel, r = this.raid;
    if (!s) return;
    const ok = this.carried(s) ? r.bagMove(s.uid, x, y, s.r) : r.bagTake(s.src, s.uid, { x, y, r: s.r });
    this.note = ok ? '' : t('Does not fit there');
    if (ok) this.sel = null;
    this.render();
  }
  pocket(slot) {
    const s = this.sel, r = this.raid;
    if (!s) return;
    // A medkit within reach goes into the pack first, then into the pocket.
    if (!this.carried(s) && this.item(s.uid)?.kind === 'med') r.bagTake(s.src, s.uid);
    const ok = r.bagPocket(s.uid, slot);
    this.note = ok ? '' : t('Quick pockets hold medkits only');
    if (ok) this.sel = null;
    this.render();
  }
  action(name, ds = {}) {
    const r = this.raid, s = this.sel;
    if (name === 'take') { const ok = r.bagTake(ds.ref, ds.uid); this.note = ok ? '' : t('No room in the pack'); if (ok && s?.uid === ds.uid) this.sel = null; }
    if (name === 'drop' && this.carried(s)) { r.bagDrop(s.uid); this.sel = null; this.note = ''; }
    if (name === 'sell' && this.carried(s)) { if (r.brokerSell(s.uid)) this.sel = null; this.note = ''; }
    if (name === 'rotate' && s) {
      s.r = 1 - s.r;
      const f = r.findCargo(s.uid);
      // Turn in place when the turned piece fits there; otherwise carry the turn to the next cell chosen.
      this.note = f && f.where === 'inv' && r.bagMove(s.uid, f.item.at.x, f.item.at.y, s.r) ? '' : t('Turned: choose a cell where it fits');
    }
    this.render();
  }
  // ---- dragging: the same move as select-then-cell, for mouse and touch alike ----
  grid() { return $('invBody').querySelector('.packGrid'); }
  step(g) { const c = g.querySelector('.slot'); return c ? c.getBoundingClientRect().width + GAP : 46; }
  cellAt(px, py, d) {
    const g = this.grid();
    if (!g) return null;
    const rect = g.getBoundingClientRect(), st = this.step(g);
    if (px < rect.left || py < rect.top || px > rect.right || py > rect.bottom) return null;
    return { x: Math.floor((px - rect.left) / st) - d.ox, y: Math.floor((py - rect.top) / st) - d.oy };
  }
  down(e) {
    const el = e.target.closest('.piece[data-uid], .near[data-uid]');
    if (!el || e.button > 0 || e.target.closest('button')) return;
    const rect = el.getBoundingClientRect(), g = this.grid(), st = g ? this.step(g) : 46, isPiece = el.classList.contains('piece');
    this.drag = { uid: el.dataset.uid, src: el.dataset.src, el, x0: e.clientX, y0: e.clientY, id: e.pointerId, on: false,
      ox: isPiece ? Math.floor((e.clientX - rect.left) / st) : 0, oy: isPiece ? Math.floor((e.clientY - rect.top) / st) : 0 };
    el.setPointerCapture?.(e.pointerId);
  }
  move(e) {
    const d = this.drag;
    if (d && d.id === e.pointerId) {
      if (!d.on && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) {
        d.on = true;
        const keep = this.sel?.uid === d.uid ? this.sel.r : null;
        this.select(d.uid, d.src);
        if (keep !== null && this.sel) this.sel.r = keep;
        d.el.classList.add('drag');
      }
      if (d.on) { d.el.style.transform = `translate(${e.clientX - d.x0}px, ${e.clientY - d.y0}px)`; this.preview(e.clientX, e.clientY, d); }
    } else if (this.sel && e.pointerType === 'mouse') this.preview(e.clientX, e.clientY, { ox: 0, oy: 0 });
  }
  up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d || d.id !== e.pointerId || !d.on) return;
    this.dragged = true;   // swallow the click that follows a drag
    setTimeout(() => { this.dragged = false; }, 0);
    const c = this.cellAt(e.clientX, e.clientY, d), under = document.elementFromPoint(e.clientX, e.clientY);
    const pocket = under?.closest('[data-pocket]');
    if (c) this.place(c.x, c.y);
    else if (pocket) this.pocket(Number(pocket.dataset.pocket));
    else if (under?.closest('.bagSide') && this.carried()) { this.raid.bagDrop(d.uid); this.sel = null; this.note = ''; this.render(); }
    else this.render();
  }
  // Light the cells the selected piece would cover: green where it fits, red where it does not.
  preview(px, py, d) {
    const g = this.grid(), r = this.raid, s = this.sel;
    if (!g || !s) return;
    for (const el of g.querySelectorAll('.slot.ok, .slot.bad')) el.classList.remove('ok', 'bad');
    const c = this.cellAt(px, py, d), it = this.item(s.uid);
    if (!c || !it) return;
    const pk = r.player.pack, fits = fitsAt(pk, occupancy(pk, r.player.inv, it), it, c.x, c.y, s.r), [w, h] = dims(it, s.r);
    for (let y = c.y; y < c.y + h; y++) for (let x = c.x; x < c.x + w; x++) g.querySelector(`[data-cell="${x},${y}"]`)?.classList.add(fits ? 'ok' : 'bad');
  }
}
