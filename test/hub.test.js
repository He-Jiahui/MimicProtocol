// The Command Hub as a place (sim/hubworld.js): a hall the operator walks, six staffed
// stations and the deployment lift, and one plain panel a station. Rendered into a stub DOM
// and driven through the same handlers a click reaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/world.js';
import { Raid, stepRaid } from '../src/sim/raid.js';
import { STATION_IDS, HUB } from '../src/sim/hubworld.js';
import * as P from '../src/sim/profile.js';

const el = { innerHTML: '', classList: { add() {}, remove() {}, toggle() {} } };
globalThis.document ??= { getElementById: () => el, querySelectorAll: () => [] };
const { showStation, closeStation, nextStation, hubBar } = await import('../src/ui/hub.js');
const text = () => el.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const acts = () => [...el.innerHTML.matchAll(/data-act="([a-z]+)"/gi)].map((m) => m[1]);
const click = (act, extra = {}) => { const target = { dataset: { act, ...extra }, disabled: false, closest: () => target }; el.onclick({ target }); };

const hub = generateWorld(20261125, { hub: true }), DT = 1 / 60;
const idle = { mx: 0, mz: 0, aimX: 50, aimZ: 40, m1: false, m2: false, dodge: false, ult: false, scan: false, interact: false, quick1: false };

test('hub: a walled hall with six staffed stations and a lift, nothing hostile in it', () => {
  const st = hub.pois.filter((p) => p.type === 'station');
  assert.deepEqual(st.map((p) => p.station).sort(), [...STATION_IDS].sort());
  assert.equal(hub.pois.filter((p) => p.type === 'deploy').length, 1);
  assert.equal(hub.containers.length, 0, 'nothing to search');
  for (const p of st) {
    assert.ok(hub.isFree(p.x, p.z), `${p.station}: the operator's mark is open floor`);
    assert.ok(Math.hypot(p.x - p.nx, p.z - p.nz) > 2 && Math.hypot(p.x - p.nx, p.z - p.nz) < 3.2, `${p.station}: staff stand across a counter`);
    assert.ok(p.x > HUB.X0 && p.x < HUB.X1 && p.z > HUB.Z0 && p.z < HUB.Z1);
  }
  const raid = new Raid({ world: hub, seed: 1, mode: 'hub' });
  for (let i = 0; i < 600; i++) stepRaid(raid, DT, idle);
  assert.equal(raid.enemies.length, 0);
  assert.equal(raid.contracts.length, 0);
  assert.equal(raid.jobs.list.length, 0);
});

test('hub: every station and the lift is walked to from the middle of the hall and answers the interact key', () => {
  const raid = new Raid({ world: hub, seed: 1, mode: 'hub' }), p = raid.player;
  for (const q of hub.pois) {
    p.x = 50; p.z = 52;          // the ring in the middle bay: a clear line to every mark
    let t = 0;
    for (; t < 20; t += DT) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < 0.6) break; stepRaid(raid, DT, { ...idle, mx: (q.x - p.x) / d, mz: (q.z - p.z) / d }); }
    assert.ok(t < 12, `${q.station || q.type} reached in ${t.toFixed(1)} s`);
    raid.events.length = 0;
    let got = null;
    for (let i = 0; i < 150 && !got; i++) { stepRaid(raid, DT, { ...idle, interact: true }); got = raid.events.find((e) => e.t === 'station' || e.t === 'deploy'); raid.events.length = 0; }
    assert.ok(got, `${q.station || q.type} answers`);
    if (q.type === 'station') assert.equal(got.id, q.station); else assert.equal(got.t, 'deploy');
    for (let i = 0; i < 5; i++) stepRaid(raid, DT, idle);
  }
});

test('hub: the lift waits for the checklist and says so', () => {
  const raid = new Raid({ world: hub, seed: 1, mode: 'hub' }), p = raid.player, gate = hub.pois.find((q) => q.type === 'deploy');
  p.x = gate.x; p.z = gate.z;
  raid.deployBlock = 'Deployment Lift: finish the checklist with Relay first';
  for (let i = 0; i < 180; i++) stepRaid(raid, DT, { ...idle, interact: true });
  assert.equal(raid.prompt.ok, false);
  assert.match(raid.prompt.label.source || raid.prompt.label, /checklist/);
  assert.ok(!raid.events.some((e) => e.t === 'deploy'));
  raid.deployBlock = null;
  for (let i = 0; i < 180; i++) stepRaid(raid, DT, { ...idle, interact: true });
  assert.ok(raid.events.some((e) => e.t === 'deploy'));
});

function setup() {
  const p = P.newProfile();
  P.syncHubTutorial(p);
  const game = { profile: p, hud: { tips: {} }, audio: { play() {} }, saved: 0, save() { this.saved++; }, changed: 0, onHubChange() { this.changed++; } };
  return { p, game };
}

test('station panels: each offers its own verbs and names the station that owns the others', () => {
  const { p, game } = setup();
  const sealed = p.stash.find((i) => i.kind === 'gear' && i.unid), loot = p.stash.find((i) => i.kind === 'loot');
  assert.ok(sealed && loot, 'the first visit brings two cases and a sealed piece');
  // The Lab lists what is sealed and only processes.
  showStation(game, 'lab');
  assert.ok(el.innerHTML.includes(`data-uid="${sealed.uid}"`) && !el.innerHTML.includes(`data-uid="${loot.uid}"`));
  click('select', { uid: sealed.uid });
  assert.ok(acts().includes('process') && !acts().includes('sell') && !acts().includes('equip'));
  // The Quartermaster lists everything and buys; a sealed piece is sold sealed, not opened.
  showStation(game, 'quartermaster');
  assert.ok(el.innerHTML.includes(`data-uid="${loot.uid}"`) && el.innerHTML.includes(`data-uid="${sealed.uid}"`));
  click('select', { uid: sealed.uid });
  assert.ok(acts().includes('sell') && !acts().includes('process'));
  assert.ok(text().includes('The Containment Lab processes sealed pieces.'));
  // The Armory lists identified gear only, and wears, enhances, rerolls and repairs.
  showStation(game, 'armory');
  assert.ok(!el.innerHTML.includes(`data-uid="${sealed.uid}"`) && text().includes('Nothing identified on the shelf'));
  click('select', { uid: p.equipped.weapon.uid });
  assert.ok(acts().includes('enhance') && !acts().includes('sell') && !acts().includes('process'));
});

test('station panels: the first-visit checklist is walked station by station, then the lift opens', () => {
  const { p, game } = setup();
  assert.equal(nextStation(p), 'quartermaster');
  assert.ok(hubBar(game).includes('Quartermaster: sell the 2 Sealed Data Cases'));
  showStation(game, 'quartermaster');
  assert.ok(el.innerHTML.includes('stationBox guide'), 'the station the checklist points to is marked');
  for (const it of p.stash.filter((i) => i.kind === 'loot')) click('sell', { uid: it.uid });
  assert.equal(nextStation(p), 'lab');
  showStation(game, 'lab');
  const sealed = p.stash.find((i) => i.unid);
  click('process', { uid: sealed.uid });
  assert.ok(text().includes('Identified. The Armory will fit it'), 'the Lab shows what the piece turned out to be');
  assert.equal(nextStation(p), 'armory');
  showStation(game, 'armory');
  click('equip', { uid: sealed.uid });
  click('enhance', { uid: sealed.uid });
  click('reroll', { uid: sealed.uid, i: '0' });
  assert.equal(nextStation(p), 'barracks');
  showStation(game, 'barracks');
  click('class', { id: 'summoner' });
  assert.equal(p.classId, 'summoner');
  assert.equal(nextStation(p), 'dispatch');
  showStation(game, 'dispatch');
  assert.ok(/data-act="deploy" disabled/.test(el.innerHTML), 'no deployment before a tier is chosen');
  click('tier', { id: '1' });
  assert.ok(P.hubReady(p) && nextStation(p) === null);
  assert.ok(/data-act="deploy" >/.test(el.innerHTML) || !/data-act="deploy" disabled/.test(el.innerHTML));
  assert.ok(hubBar(game).includes('Deployment Lift'));
  // Leaving a panel tells the hall, so the figure and the strip follow the profile.
  click('leave');
  assert.equal(game.hubPanel, null);
  assert.ok(game.changed > 0);
  closeStation(game);
});

test('station panels: Relay keeps the record and the profile controls', () => {
  const { p, game } = setup();
  showStation(game, 'liaison');
  assert.ok(text().includes('FIRST VISIT') && text().includes('Armory: reroll one affix'));
  assert.ok(!acts().includes('accept'), 'the contract board waits for the checklist');
  p.tutorial.done = true;
  showStation(game, 'liaison');
  assert.ok(text().includes('OPERATIONS') && text().includes('SECTOR INTEL') && text().includes('Extractions'));
  assert.ok(acts().includes('settings') && acts().includes('reset'));
});

test('station panels: Relay\'s board shows what is held and offered; accept and abandon work from it', () => {
  const { p, game } = setup();
  p.tutorial.done = true;
  showStation(game, 'liaison');
  let s = text();
  assert.ok(s.includes('Survey Old Town') && s.includes('Power for the Reliquary gate') && s.includes('pinned by Command'));
  assert.ok(!s.includes('[object') && s.includes('powers the Reliquary gate'), 'rewards are spelled out');
  assert.ok(s.includes('Reliquary gate dark') && s.includes('Sectors secured 0/5'));
  assert.equal((el.innerHTML.match(/data-act="accept"/g) || []).length, 5);
  assert.equal((el.innerHTML.match(/data-act="abandon"/g) || []).length, 1, 'the pinned contract cannot be abandoned');
  const offer = p.ops.board[0];
  click('accept', { id: offer.id });
  assert.ok(p.ops.active.some((c) => c.id === offer.id));
  assert.equal(game.saved, 1);
  click('abandon', { id: offer.id });
  assert.ok(!p.ops.active.some((c) => c.id === offer.id));
  // The Threat Console says what the next raid will be like and why the lair is shut.
  showStation(game, 'dispatch');
  s = text();
  assert.ok(s.includes('CONTRACTS HELD') && s.includes('Old Town Unknown') && s.includes('The Reliquary is dark'));
  assert.ok(hubBar(game).includes('Power for the Reliquary gate · 0/3'), 'the hall\'s strip names the pinned contract');
  assert.ok(!text().includes('[object'));
});
