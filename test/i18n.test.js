import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { itemName, message, selectLanguage, setLanguage, t } from '../src/i18n/index.js';
import zhCN from '../src/i18n/zh-CN.js';
import { ASPECTS, CLASSES, ITEMS, SLOT_LABEL, SLOT_BASE, GEAR_NAMES, PACKS, DRONES, SELLABLES, RARITY } from '../src/sim/data.js';
import { loadProfile, newProfile, saveProfile } from '../src/sim/profile.js';
import { CLASS_TREES } from '../src/sim/skill-data.js';
import { treeReason } from '../src/sim/progress.js';

test('language selection prefers an explicit choice over the browser language', () => {
  assert.equal(selectLanguage('en', 'zh-CN'), 'en');
  assert.equal(selectLanguage('zh-CN', 'en-US'), 'zh-CN');
  assert.equal(selectLanguage(null, 'zh-SG'), 'zh-CN');
  assert.equal(selectLanguage('unsupported', 'fr-FR'), 'en');
});

test('dynamic messages translate nested names and fall back to English', () => {
  const contract = message('Contract ready: {contract} (pays on extraction)', { contract: message('Kill 2 elites') });
  try {
    setLanguage('zh-CN');
    assert.equal(t(contract), '合约已达成：击杀 2 名精英（撤离后结算）');
    assert.equal(t('Missing translation for {name}', { name: 'test' }), 'Missing translation for test');
    setLanguage('en');
    assert.equal(t(contract), 'Contract ready: Kill 2 elites (pays on extraction)');
  } finally {
    setLanguage('en');
  }
});

test('existing gear names localize without rewriting the saved profile', () => {
  const saved = new Map();
  const storage = { getItem: saved.get.bind(saved), setItem: saved.set.bind(saved), removeItem: saved.delete.bind(saved) };
  const original = newProfile();
  const armor = { ...original.equipped.body, uid: 'legacy-armor', name: 'Resonant Weave Coat', rarity: 2, starter: false };
  original.stash.push(armor);
  saveProfile(storage, original);
  const loaded = loadProfile(storage);
  try {
    setLanguage('zh-CN');
    assert.equal(itemName(loaded.equipped.weapon), '制式卡宾枪');
    assert.equal(itemName(loaded.stash[0]), '共振织甲外套');
    assert.equal(itemName({ ...loaded.stash[0], unid: true }), '密封稀有装备', 'a sealed piece is named by its quality alone');
    setLanguage('en');
    assert.equal(itemName(loaded.stash[0]), 'Resonant Weave Coat');
    assert.deepEqual(loaded, original);
  } finally {
    setLanguage('en');
  }
});

test('the Chinese catalogue covers static controls and gameplay descriptions', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
  const records = [
    ...Object.values(CLASSES).flatMap((record) => [record, ...record.skills]),
    ...Object.values(ITEMS),
    ...Object.values(ASPECTS),
  ];
  for (const record of records) keys.push(...[record.name, record.role, record.blurb, record.desc, record.tag].filter(Boolean));
  // Worn slots, their base stats and names, field packs, drones and salvage.
  keys.push(...Object.values(SLOT_LABEL), ...Object.values(SLOT_BASE).map((b) => b.label), ...Object.values(GEAR_NAMES).flat());
  keys.push(...Object.values(PACKS).map((d) => d.name), ...Object.values(DRONES).map((d) => d.name), ...SELLABLES.map((s) => s.name), ...RARITY.map((r) => r.name));
  // Class trees: branch and node names, their texts, and every refusal reason (doc 64, Package 7).
  for (const branches of Object.values(CLASS_TREES)) for (const b of branches) keys.push(b.name, ...[b.enh, ...b.pair, b.passive].flatMap((n) => [n.name, n.desc]));
  for (const code of ['unknown', 'rank', 'parent', 'exclusive', 'gate', 'points', 'other']) keys.push(treeReason('rifleman', { code, id: 'broadAperture', need: 'lingeringFire', other: 'crowdBurst', branch: 1 }).source);
  for (const key of keys) assert.ok(Object.hasOwn(zhCN, key) && zhCN[key], `Missing translation: ${key}`);
});

test('door, container and route text has Chinese entries', () => {
  const keys = new Set(['Locked door', 'No surveyed way through', 'Nothing but stale biscuits', 'Nothing worth taking', 'north', 'south', 'west', 'east', 'shop', 'bar', 'office', 'flat',
    'FOLLOW A ROUTE', 'G next · X clear', 'No route', 'Route: {name}', 'Route cleared', 'here', '{m} m on foot']);
  for (const file of ['doors', 'containers', 'route']) {
    const src = readFileSync(new URL(`../src/sim/${file}.js`, import.meta.url), 'utf8');
    for (const re of [/message\('([^']+)'/g, /toast\('([^']+)'/g, /label(?::| =) '([^']+)'/g, /lockLabel: '([^']+)'/g, /return '([^']+)'/g]) for (const m of src.matchAll(re)) keys.add(m[1]);
  }
  assert.ok(keys.size > 40);
  for (const key of keys) assert.ok(Object.hasOwn(zhCN, key) && zhCN[key], `Missing translation: ${key}`);
});
