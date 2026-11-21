'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { start } = require('../../dev/server');
const M = require('../../src/core/model');
const { tmpDir, sampleItems } = require('../helpers');

const pngSize = (f) => { const b = fs.readFileSync(f); assert.equal(b.slice(1, 4).toString(), 'PNG'); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const call = (base) => async (n, a) => { const r = await (await fetch(base + '/api/' + n, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dossier': '1' }, body: JSON.stringify(a || {}) })).json(); if (!r.ok) throw new Error(n + ': ' + r.error); return r.data; };

test('PNG export is one image of the whole CV, however long', async (t) => {
  const dir = tmpDir('dossier-png-'); const s = await start({ workspace: dir, port: 0, secretsFile: dir + '/s.json' }); t.after(() => s.close());
  const api = call('http://127.0.0.1:' + s.port);
  const many = sampleItems().concat(Array.from({ length: 150 }, (_, i) => M.newItem({ type: 'work', text: 'Delivered an initiative number ' + i + ' that took coordination across several teams and a lot of careful follow-up work.', org: 'Org ' + (i % 4), role: 'Lead', start: '2020-01', end: '2021-01' })));
  await api('items.saveMany', { items: many });
  const cv = await api('cv.create', { name: 'Long', selected: many.map(i => ({ itemId: i.id, versionId: null })) });
  const r = await api('export.run', { id: cv.id, format: 'png', scale: 1 });
  assert.equal(r.files.length, 1, 'expected a single image, got ' + r.files.length);
  const { w, h } = pngSize(r.files[0]);
  assert.ok(h > w * 2.2, 'the image is only ' + w + 'x' + h + ': not the whole CV');       // several A4 pages tall
  const short = await api('cv.create', { name: 'Short', selected: [{ itemId: many[1].id, versionId: null }] });
  const r2 = await api('export.run', { id: short.id, format: 'png', scale: 1 });
  const s2 = pngSize(r2.files[0]); assert.ok(s2.h >= s2.w * 1.3 && s2.h < h, 'short CV: ' + s2.w + 'x' + s2.h);
});
