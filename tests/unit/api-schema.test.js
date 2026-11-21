'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, SCHEMA } = require('../../src/core/api-schema');
const { makeApi, sampleItems } = require('../helpers');

test('schema: good arguments pass, bad ones name the problem', () => {
  assert.equal(validate('items.delete', { id: 'it_abc123' }), null);
  assert.match(validate('items.delete', {}), /Missing "id"/);
  for (const bad of ['../x', '', 'a/b', 'a b', 5, null, {}, 'x'.repeat(101)]) assert.match(validate('items.delete', { id: bad }) || '', /Missing|Invalid/, String(bad));
  assert.match(validate('items.deleteMany', { ids: ['ok', '../no'] }), /Invalid "ids"/);
  assert.match(validate('items.star', { ids: [], starred: 'yes' }), /Invalid "starred"/);
  assert.equal(validate('items.save', { text: 'new entry without an id' }), null);          // id is optional when creating
  assert.equal(validate('unknown.call', 5), null);                                           // calls without a rule are left alone
  for (const bad of [null, [], 'x', 7]) assert.equal(validate('cv.get', bad), 'Bad request.');
});

test('schema: every rule refers to a real call', () => {
  const { api } = makeApi();
  for (const name of Object.keys(SCHEMA)) assert.equal(typeof api[name], 'function', name);
});

test('schema: the wrapped api rejects bad calls before touching data', async () => {
  const { api } = makeApi(); const items = sampleItems(); await api['items.saveMany']({ items });
  await assert.rejects(() => api['items.delete']({ id: '../../escape' }), /Invalid "id"/);
  await assert.rejects(() => api['import.text']({ text: 'x'.repeat(500000) }), /Invalid "text"/);
  await assert.rejects(() => api['export.run']({ id: items[0].id }), /Missing "format"/);
  assert.equal((await api['items.list']()).length, items.length);
});
