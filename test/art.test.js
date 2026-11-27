import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSES, ITEM_IDS } from '../src/sim/data.js';
import { icon } from '../src/ui/icons.js';

test('every live skill and inventory item has a distinct atlas cell', () => {
  const skills = Object.values(CLASSES).flatMap(cls => cls.skills.map(s => s.behavior));
  for (const keys of [[...skills, 'scan'], [...ITEM_IDS, 'medkit']]) {
    const cells = keys.map(icon);
    assert.ok(cells.every(Boolean), 'missing art for a live entry');
    assert.equal(new Set(cells).size, keys.length, 'two entries share a cell');
  }
});
