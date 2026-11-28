// The Barracks screen (doc 64, Package 7), rendered into a stub DOM and driven through the same
// click handler a mouse or a tap reaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/sim/profile.js';
import { xpForLevel } from '../src/sim/progress.js';
import { gearStats } from '../src/sim/loot.js';
import { setLanguage } from '../src/i18n/index.js';

const el = { innerHTML: '', classList: { add() {}, remove() {}, toggle() {} } };
globalThis.document ??= { getElementById: () => el, querySelectorAll: () => [] };
const { showBarracks, showHub } = await import('../src/ui/hub.js');
const text = () => el.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const click = (act, id) => { const target = { dataset: { act, id }, disabled: false, closest: () => target }; el.onclick({ target }); };
function setup() {
  const p = P.newProfile();
  p.tutorial.done = true;
  p.classes.rifleman.xp = xpForLevel(7);
  const game = { profile: p, hud: { tips: {} }, audio: { play() {} }, saved: 0, save() { this.saved++; }, barracksClass: 'rifleman', treeDrafts: {} };
  return { p, game };
}

test('barracks: four branches, compiled numbers, state and what a pair gives up; preview before apply', () => {
  const { p, game } = setup();
  showBarracks(game);
  assert.equal((el.innerHTML.match(/class="branch box/g) || []).length, 4);
  assert.equal((el.innerHTML.match(/class="node /g) || []).length, 16);
  let s = text();
  assert.ok(s.includes('Points 6 earned · 0 spent · 6 unspent'));
  assert.ok(s.includes('Piercing Line hits bodies within 0.95 m of its line instead of 0.7 m.'), 'numbers from the compiled build');
  assert.ok(s.includes('Locked: Conversion needs 1 points in earlier branches (0 spent)'));
  assert.ok(s.includes('Gives up Line Discharge'), 'a pair says what it gives up');
  click('take', 'lingeringFire'); click('take', 'broadAperture'); click('take', 'crowdBurst');
  s = text();
  assert.ok(s.includes('Preview, not applied: + Lingering Fire, + Broad Aperture, + Crowd Burst'));
  assert.deepEqual(p.classes.rifleman.tree, {}, 'nothing is saved before APPLY');
  click('refund', 'broadAperture');
  assert.ok(text().includes('Crowd Burst needs Broad Aperture'), 'a refused refund says why');
  click('take', 'lineDischarge');
  assert.ok(text().includes('+ Line Discharge') && !text().includes('+ Crowd Burst'), 'the swap is previewed');
  click('apply');
  assert.deepEqual(p.classes.rifleman.tree, { lingeringFire: 1, broadAperture: 1, lineDischarge: 1 });
  assert.equal(game.saved, 1);
  click('treeReset');
  assert.ok(text().includes('Points 6 earned · 0 spent · 6 unspent'), 'reset previews every earned point back');
  click('cancel');
  assert.ok(text().includes('Points 6 earned · 3 spent · 3 unspent'));
  // Gear is part of the compiled numbers: a cooldown rate shortens what the card shows.
  p.equipped.hands = { ...p.equipped.hands, uid: 'cdr-gloves', starter: false, affixes: [{ k: 'cdr', v: 100 }] };
  game.barracksClass = 'summoner';
  p.classes.summoner.xp = xpForLevel(17);
  click('bclass', 'summoner');
  assert.ok(text().includes('Hive Drones are ready again after 19 s instead of 20 s.'), text().slice(0, 200));
  click('back');
  assert.ok(text().includes('OPEN CLASS TREE'));
});

test('barracks: training shows trained points, the converted stats and worn gear apart, and re-assigns', () => {
  const { p, game } = setup();
  p.equipped.hands = { ...p.equipped.hands, uid: 'gloves', starter: false, affixes: [{ k: 'aspd', v: 10 }] };
  showBarracks(game);
  let s = text();
  assert.ok(s.includes('Free points 2 earned · 0 assigned · 2 left'), 'levels 3 and 6');
  assert.ok(s.includes('Handling primary 6'));
  assert.ok(s.includes('Basic attack rate +6.0% +10.0% attack speed'), 'training, then gear, on one row');
  const g = gearStats(p.equipped);
  assert.ok(s.includes(`Health +7.5 on the class base of 110 +${g.hp.toFixed(1)}% max health`));
  assert.ok(s.includes('Free carry +1.25 kg (11.25 kg) none'));
  assert.ok(/fall back/.test(s), 'the tree above still renders');
  const target = (i) => ({ dataset: { act: 'train', id: 'conditioning', i }, disabled: false, closest() { return this; } });
  el.onclick({ target: target('1') });
  s = text();
  assert.ok(s.includes('Conditioning 4') || s.includes('3 starting + 1 assigned'), s.slice(s.indexOf('TRAINING'), s.indexOf('TRAINING') + 300));
  assert.deepEqual(p.classes.rifleman.train, { handling: 0, conditioning: 1, systems: 0 });
  assert.equal(game.saved, 1, 'training applies at once');
  el.onclick({ target: target('1') }); el.onclick({ target: target('1') });
  assert.ok(text().includes('No training points left (2 earned)'));
  click('trainReset');
  assert.deepEqual(p.classes.rifleman.train, { handling: 0, conditioning: 0, systems: 0 });
  showHub(game);
  assert.ok(text().includes('Training Handling 6 · Conditioning 3 · Systems 3 · 2 free'));
  assert.ok(text().includes(`Health ${Math.round(117.5 * (1 + g.hp / 100))}`), 'the hub sheet counts Conditioning like the raid does');
});

test('barracks: the Chinese screen has no English left in it', () => {
  const { game } = setup();
  try {
    setLanguage('zh-CN');
    for (const id of ['rifleman', 'blade', 'summoner', 'toxic']) {
      game.barracksClass = id;
      showBarracks(game);
      const words = (text().match(/[A-Za-z]{3,}/g) || []).filter((w) => !['rad'].includes(w));
      assert.deepEqual(words, [], id);
    }
    showHub(game);
    assert.ok(text().includes('打开职业天赋'));
  } finally {
    setLanguage('en');
  }
});
