// Title, hub and debrief screens (docs 16 and 19). The hub is a character sheet:
// equipment slots, a stash grid, item tooltips with comparisons, and a detail panel
// for the selected item. Screens that spend a resource show its stock (doc 12).

import {
  CLASSES, CLASS_IDS, RARITY, SLOTS, SLOT_LABEL, SLOT_BASE, GEAR_AFFIXES, TIERS, ZONES, enhanceCost, REROLL_CASH, REROLL_SAMPLES,
  PROCESS_SAMPLES, gearRating, ASPECTS,
} from '../sim/data.js';
import { slotBaseValue, gearStats, sealedBid, sealedView, issuePack } from '../sim/loot.js';
import { itemName, t, upper } from '../i18n/index.js';
import {
  totalRating, sellItem, processItem, equipItem, enhanceItem, rerollAffix, setClass, setTier, choosePack, activePack,
  hubChecklist, hubReady, hubTutorialActive, syncHubTutorial,
} from '../sim/profile.js';

const screen = () => document.getElementById('screen');
const SLOT_GLYPH = { weapon: '⚔', head: '⌬', body: '♜', hands: '❖', waist: '≡', shoes: '⌓' };
const CLASS_SIG = { rifleman: '⁝', blade: '⚔', summoner: '♜', toxic: '☣' };
const fmtAffix = (a) => `+${a.v}${GEAR_AFFIXES[a.k].unit} ${t(GEAR_AFFIXES[a.k].label)}`;
const fmtNum = (v, unit) => v.toFixed(unit === '/s' ? 2 : 1);
const fmtBase = (it, v = slotBaseValue(it)) => `+${fmtNum(v, SLOT_BASE[it.slot].unit)}${SLOT_BASE[it.slot].unit} ${t(SLOT_BASE[it.slot].label)}`;
const fmtClock = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

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

// Tooltip body for any item, with a comparison against the equipped piece.
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
  const base = SLOT_BASE[it.slot], cur = p.equipped[it.slot];
  let cmp = '';
  if (!equipped && cur) {
    const d = gearRating(it) - gearRating(cur), b = slotBaseValue(it) - slotBaseValue(cur);
    cmp = `<div class="tipCmp">${t('Compared with equipped')}<div class="tipStat"><span>${t('Gear Rating')}</span><b class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d.toFixed(1)}</b></div><div class="tipStat"><span>${t(base.label)}</span><b class="${b >= 0 ? 'up' : 'down'}">${b >= 0 ? '+' : ''}${fmtNum(b, base.unit)}${base.unit}</b></div></div>`;
  }
  return `<div class="tipName" style="color:${col}">${itemName(it)}${it.enh ? ` +${it.enh}` : ''}</div>
    <div class="tipType">${it.prime ? `<span style="color:#ffc23d">${t('Prime')}</span> ` : ''}${gearInfo(it)}</div>
    <div class="tipBase">${fmtBase(it)}</div>
    ${it.affixes.map((a) => `<div class="tipAff">${fmtAffix(a)}</div>`).join('') || `<div class="tipBody" style="color:#5d5446">${t('No affixes')}</div>`}
    ${it.aspect ? `<div class="tipCmp"><b style="color:#ffb347">✦ ${t(ASPECTS[it.aspect].name)}</b><br>${t(ASPECTS[it.aspect].desc)}</div>` : ''}
    ${cmp}
    <div class="tipFoot"><span>${t('Gear Rating')} ${gearRating(it).toFixed(1)}</span><span>${it.value}¤</span></div>`;
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
  const gear = it.kind === 'gear', col = gear ? RARITY[it.rarity].css : it.kind === 'pack' ? '#c9a45c' : '#8c7f6a';
  let mark = '';
  if (gear && !it.unid && !opts.equipped) { const d = gearRating(it) - gearRating(p.equipped[it.slot]); mark = `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'}</span>`; }
  return `<div class="cell${game.hubSel === it.uid ? ' sel' : ''}" data-act="select" data-uid="${it.uid}" data-tip="it-${it.uid}" style="--rar:${col}">
    ${gear && it.unid ? '?' : gear ? SLOT_GLYPH[it.slot] : it.kind === 'pack' ? '▦' : '▪'}${it.enh ? `<span class="lv">+${it.enh}</span>` : ''}${it.prime && !it.unid ? '<span class="tag">P</span>' : ''}${mark}
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
      <div class="acts"><button class="primary" data-act="process" data-uid="${it.uid}" ${free || p.samples >= PROCESS_SAMPLES ? '' : 'disabled'}>${upper('Process')} · ${fee(`${PROCESS_SAMPLES}⬢`)}</button></div></div>`;
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
    <div class="acts">
      ${equipped ? '' : `<button class="primary" data-act="equip" data-uid="${it.uid}">${t('EQUIP')}</button>`}
      <button data-act="enhance" data-uid="${it.uid}" ${canEnh ? '' : 'disabled'}>${lvl >= 8 ? t('MAX LEVEL') : `${t('ENHANCE')} +${lvl + 1} · ${fee(`${cost}¤${needCore ? ' ◆' : ''}`)}`}</button>
      ${equipped ? '' : `<button data-act="sell" data-uid="${it.uid}">${t('SELL')} ${it.value}¤</button>`}
    </div></div>`;
}

// What leaves the hub with the operator besides the worn kit: the field pack.
function quartermaster(game) {
  const p = game.profile, pk = activePack(p) || issuePack();
  const stat = (a, b) => `<div class="statline"><span>${t(a)}</span><span>${b}</span></div>`;
  return `${stat('Field pack', `${itemName(pk)} · ${pk.w}x${pk.h}`)}<div class="empty" style="margin-top:6px">${t('Pick a found pack in the stash to deploy with it. It drops on death; the issue pack is always free.')}</div>`;
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
  const loot = p.stash.filter((i) => i.kind === 'loot'), gear = p.stash.filter((i) => i.kind === 'gear'), packs = p.stash.filter((i) => i.kind === 'pack');
  const lootValue = loot.reduce((a, i) => a + i.value, 0);
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
          <div class="grid">${gear.map((i) => cell(game, i)).join('')}${packs.map((i) => cell(game, i)).join('')}${loot.map((i) => cell(game, i)).join('')}${p.stash.length ? '' : `<div class="empty" style="grid-column:1/-1">${t('The stash is empty. Extract with loot to fill it.')}</div>`}</div>
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
        <div class="empty" style="margin:7px 0 14px;text-align:center">${ready ? `${t('Meridian South Sector')} · ${t(cls.name)} · ${t('Tier {tier}', { tier: p.tier })}` : t('Finish the checklist to unlock the first raid.')}</div>
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
      case 'class': res = setClass(p, id); break;
      case 'pack': res = choosePack(p, uid || null); break;
      case 'tier': res = setTier(p, Number(id)); break;
      case 'sell': res = sellItem(p, uid); if (res.ok) game.audio.play('coin'); break;
      case 'sellall': for (const it of p.stash.filter((s) => s.kind === 'loot')) sellItem(p, it.uid); game.audio.play('coin'); res = { ok: true }; break;
      case 'process': res = processItem(p, uid); if (res.ok) game.audio.play('scan'); break;
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
      ${win ? line(`${t('Extraction Bonus')}  V x (0.05 x ${d.zmax} + 0.25 x ${d.nl.toFixed(2)})`, `+${d.bonus}¤`, '#6fe08a') : line('Lost on death', t('{lost} item{plural} (secure case kept {kept})', { lost: d.lost, plural: d.lost === 1 ? '' : 's', kept: d.kept }), '#e0453f')}
      ${d.contracts.map((c) => line(t('Contract: {name}', { name: t(c.label) }), t(c.done ? (win ? 'paid' : 'forfeit') : 'not done'), c.done && win ? '#6fe08a' : '#8c7f6a')).join('')}
      ${win && d.contractPay ? line('Contract payouts', `+${d.contractPay}¤`, '#6fe08a') : ''}
      ${d.banked ? line('Broker sales (banked)', `+${d.banked}¤`, '#6fe08a') : ''}
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
