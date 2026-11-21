'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../src/core/model');

test('uid is unique and prefixed', () => {
  const ids = new Set(Array.from({ length: 2000 }, () => M.uid('it')));
  assert.equal(ids.size, 2000);
  assert.ok([...ids].every(x => x.startsWith('it_')));
});

test('newItem fills every field with safe defaults', () => {
  const it = M.newItem();
  for (const k of ['id', 'type', 'text', 'title', 'org', 'role', 'location', 'start', 'end']) assert.equal(typeof it[k], 'string', k);
  assert.ok(Array.isArray(it.tags) && Array.isArray(it.skills) && Array.isArray(it.versions));
});

test('itemText prefers main version, falls back to text, survives bad input', () => {
  const it = M.newItem({ text: 'original', versions: [{ id: 'v1', text: 'alt' }], mainVersion: 'v1' });
  assert.equal(M.itemText(it), 'alt');
  assert.equal(M.itemText(it, '__none'), 'original');
  assert.equal(M.itemText(it, 'v1'), 'alt');
  assert.equal(M.itemText(null), '');
  assert.equal(M.itemText({}), '');
});

test('newCV has default sections including a hidden Page Break', () => {
  const cv = M.newCV();
  assert.ok(cv.sections.length >= 12);
  const pb = cv.sections.filter(s => s.pb);
  assert.equal(pb.length, 1);
  assert.equal(pb[0].visible, false);
  assert.equal(cv.sections.find(s => s.key === 'work').visible, true);
});

test('newCV does not share state between instances', () => {
  const a = M.newCV(), b = M.newCV();
  a.sections[0].label = 'changed';
  assert.notEqual(b.sections[0].label, 'changed');
  a.selected.push({ itemId: 'x' });
  assert.equal(b.selected.length, 0);
});

test('dateNum handles odd inputs', () => {
  for (const v of ['', null, undefined, 'present', 'Present', '2024', '2024-06', 'garbage', '13/2024']) assert.doesNotThrow(() => M.dateNum(v), String(v));
  assert.ok(M.dateNum('2024-06') > M.dateNum('2023-12'));
});

test('fmtRange never throws and handles open ranges', () => {
  for (const [a, b] of [['', ''], ['2020', ''], ['', '2021'], ['2020-01', 'present'], ['zzz', 'zzz'], [null, undefined]]) assert.doesNotThrow(() => M.fmtRange(a, b), a + '/' + b);
});

test('groupKey is stable and tolerant', () => {
  assert.equal(M.groupKey(M.newItem({ org: 'NPCI', role: 'Analyst', type: 'work' })), M.groupKey(M.newItem({ org: 'npci', role: 'analyst', type: 'work' })));
  assert.doesNotThrow(() => M.groupKey({}));
});
