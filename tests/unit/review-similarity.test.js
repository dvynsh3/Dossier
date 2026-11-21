'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../src/core/review');
const S = require('../../src/core/similarity');
const M = require('../../src/core/model');
const { sampleItems, sampleCV } = require('../helpers');

test('review runs on the sample CV and on an empty CV', () => {
  const items = sampleItems();
  const r = R.review(sampleCV(items), items, {});
  assert.ok(Array.isArray(r.issues) && r.budget);
  assert.doesNotThrow(() => R.review(M.newCV(), [], {}));
});

test('lineCount grows with text and never returns NaN', () => {
  assert.ok(R.lineCount('a'.repeat(400)) > R.lineCount('a'));
  for (const v of ['', null, undefined, 12]) assert.ok(Number.isFinite(R.lineCount(v)), String(v));
});

test('diffWords marks additions and removals', () => {
  const d = R.diffWords('led a team of five', 'managed a team of eight');
  assert.ok(Array.isArray(d) && d.length > 0);
  assert.doesNotThrow(() => R.diffWords('', ''));
});

test('textSim: identical = 1, unrelated is low, safe on empty', () => {
  assert.equal(S.textSim('Led a team of five analysts', 'Led a team of five analysts'), 1);
  assert.ok(S.textSim('Led a team of five analysts', 'Painted the fence blue') < 0.4);
  assert.doesNotThrow(() => S.textSim('', ''));
});

test('findDuplicates pairs near-identical entries only', () => {
  const a = M.newItem({ type: 'work', org: 'NPCI', text: 'Led a team of five analysts to cut reporting time by 40%.' });
  const b = M.newItem({ type: 'work', org: 'NPCI', text: 'Led a team of 5 analysts and cut reporting time by 40 percent.' });
  const c = M.newItem({ type: 'award', org: 'IIM', text: 'Won the national case competition.' });
  const pairs = S.findDuplicates([a, b, c]);
  assert.ok(pairs.length >= 1);
  assert.ok(pairs.every(p => !(JSON.stringify(p).includes(c.id))));
});

test('findDuplicates handles 400 entries in reasonable time', () => {
  const items = Array.from({ length: 400 }, (_, i) => M.newItem({ type: 'work', org: 'Org' + (i % 20), text: 'Did thing number ' + i + ' for the team and shipped result ' + (i * 7) }));
  const t0 = Date.now(); S.findDuplicates(items); assert.ok(Date.now() - t0 < 5000, 'took ' + (Date.now() - t0) + 'ms');
});

test('findDuplicates: 400 entries finish quickly, empty and odd lists are fine', () => {
  const S = require('../../src/core/similarity'); const M = require('../../src/core/model');
  assert.deepEqual(S.findDuplicates([]), []);
  assert.deepEqual(S.findDuplicates([M.newItem({ type: 'work' }), M.newItem({ type: 'work', text: '' })]), []);
  const its = Array.from({ length: 400 }, (_, i) => M.newItem({ type: 'work', org: 'Org ' + (i % 20), role: 'Lead', text: 'Delivered project number ' + (i % 37) + ' for the team across region ' + (i % 11) + ' with measurable impact ' + i, start: '2020-01', end: '2021-01' }));
  const t0 = Date.now(); S.findDuplicates(its); assert.ok(Date.now() - t0 < 2500, 'too slow: ' + (Date.now() - t0) + ' ms');
});
