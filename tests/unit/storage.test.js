'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Workspace, writeJson, readJson, safeName } = require('../../src/core/storage');
const M = require('../../src/core/model');
const { tmpDir, sampleItems, sampleCV } = require('../helpers');

const fresh = () => { const dir = tmpDir('dossier-st-'); return { dir, ws: new Workspace(dir) }; };

test('a new workspace creates its folders', () => {
  const { dir } = fresh();
  for (const d of ['items', 'cvs', 'templates', 'backups', 'attachments']) assert.ok(fs.existsSync(path.join(dir, d)), d);
});

test('items and CVs round-trip through disk', () => {
  const { dir, ws } = fresh(); const items = sampleItems();
  ws.saveItems(items); ws.saveCV(sampleCV(items));
  const again = new Workspace(dir);
  assert.equal(again.listItems().length, items.length);
  assert.equal(again.listCVs().length, 1);
});

test('writeJson is atomic: no temp files are left behind and a failed write keeps the old file', () => {
  const dir = tmpDir('dossier-aw-'); const f = path.join(dir, 'a.json');
  writeJson(f, { v: 1 });
  assert.deepEqual(fs.readdirSync(dir), ['a.json']);
  const circular = {}; circular.self = circular;
  assert.throws(() => writeJson(f, circular));
  assert.deepEqual(readJson(f), { v: 1 });
  assert.deepEqual(fs.readdirSync(dir).filter(n => n !== 'a.json'), [], 'temp file left over');
});

test('readJson returns the fallback for missing, empty and corrupt files', () => {
  const dir = tmpDir('dossier-rj-');
  for (const [name, body] of [['empty.json', ''], ['bad.json', '{not json'], ['trunc.json', '{"a":[1,2']]) fs.writeFileSync(path.join(dir, name), body);
  for (const n of ['empty.json', 'bad.json', 'trunc.json', 'missing.json']) assert.equal(readJson(path.join(dir, n), 'fb'), 'fb', n);
});

test('a corrupt item file does not stop the workspace from opening', () => {
  const { dir, ws } = fresh(); ws.saveItems(sampleItems());
  fs.writeFileSync(path.join(dir, 'items', 'broken.json'), '{oops');
  const again = new Workspace(dir);
  assert.equal(again.listItems().length, sampleItems().length);
});

test('deleting moves to the trash and restore brings it back', () => {
  const { ws } = fresh(); const [it] = sampleItems(); ws.saveItem(it);
  ws.deleteItem(it.id); assert.equal(ws.getItem(it.id), null);
  assert.ok(ws.listTrash().some(t => t.id === it.id));
  ws.restore('item', it.id); assert.ok(ws.getItem(it.id));
});

test('trash: emptying and expiry', () => {
  const { dir, ws } = fresh(); const [a, b] = sampleItems(); ws.saveItems([a, b]); ws.deleteItem(a.id); ws.deleteItem(b.id);
  const old = path.join(dir, 'trash', 'items', a.id + '.json'); const rec = readJson(old); rec.deletedAt = new Date(Date.now() - 40 * 864e5).toISOString(); writeJson(old, rec);
  ws.purgeTrash(); assert.ok(!fs.existsSync(old)); assert.ok(fs.existsSync(path.join(dir, 'trash', 'items', b.id + '.json')));
  ws.emptyTrash(); assert.equal(ws.listTrash().length, 0);
});

test('duplicateCV makes an independent copy', () => {
  const { ws } = fresh(); const items = sampleItems(); const cv = ws.saveCV(sampleCV(items));
  const copy = ws.duplicateCV(cv.id); assert.notEqual(copy.id, cv.id); copy.selected.pop();
  assert.equal(ws.getCV(cv.id).selected.length, items.length);
});

test('older CVs without sections or the Page Break still load and gain the Page Break', () => {
  const { dir, ws } = fresh(); const items = sampleItems(); const cv = sampleCV(items); cv.sections = cv.sections.filter(s => !s.pb);
  fs.writeFileSync(path.join(dir, 'cvs', cv.id + '.json'), JSON.stringify(cv));
  const again = new Workspace(dir); const got = again.getCV(cv.id);
  assert.ok(got.sections.some(s => s.pb));
});

test('a CV file with a missing selected list gets a safe default', () => {
  const { dir } = fresh(); fs.writeFileSync(path.join(dir, 'cvs', 'cv_x.json'), JSON.stringify({ id: 'cv_x', name: 'Odd' }));
  const ws = new Workspace(dir); const cv = ws.getCV('cv_x'); assert.ok(Array.isArray(cv.selected) && Array.isArray(cv.sections));
});

test('backups: snapshot, list, restore, prune', () => {
  const { ws } = fresh(); ws.saveItems(sampleItems()); const name = ws.snapshot('test');
  assert.ok(ws.listBackups().length >= 1);
  ws.deleteItem(ws.listItems()[0].id); ws.restoreBackup(path.basename(name || ws.listBackups()[0]));
  assert.equal(ws.listItems().length, sampleItems().length);
});

test('exportAll / importAll round-trip', () => {
  const a = fresh(), b = fresh(); const items = sampleItems(); a.ws.saveItems(items); a.ws.saveCV(sampleCV(items));
  b.ws.importAll(JSON.parse(JSON.stringify(a.ws.exportAll())), false);
  assert.equal(b.ws.listItems().length, items.length); assert.equal(b.ws.listCVs().length, 1);
});

test('safeName strips path characters and limits length', () => {
  assert.equal(safeName('a/b\\c:d*e?.pdf'), 'a_b_c_d_e_.pdf');
  assert.ok(safeName('x'.repeat(500)).length <= 120);
  assert.equal(safeName(''), 'file');
});

test('attachments cannot escape the attachments folder', () => {
  const { dir, ws } = fresh(); const name = ws.addAttachmentBuffer('../../evil.txt', Buffer.from('x'));
  assert.ok(fs.existsSync(path.join(dir, 'attachments', name)));
  assert.ok(!fs.existsSync(path.join(dir, '..', 'evil.txt')));
});

// Known gaps, fixed in Stage 2 (todo = shown in the report, does not fail the run)
test('ids that look like paths are rejected', () => {
  const { dir, ws } = fresh(); const outside = path.join(path.dirname(dir), 'escaped-' + path.basename(dir));
  const it = M.newItem({ id: '../escaped-' + path.basename(dir), text: 'x' });
  assert.throws(() => ws.saveItem(it));
  assert.ok(!fs.existsSync(outside + '.json'));
});

test('an unreadable item file is quarantined and reported, not silently dropped', () => {
  const { dir, ws } = fresh(); ws.saveItems(sampleItems()); fs.writeFileSync(path.join(dir, 'items', 'broken.json'), '{oops');
  const again = new Workspace(dir); assert.ok(fs.existsSync(path.join(dir, 'quarantine', 'broken.json')));
});

test('damaged files are reported once through notices', () => {
  const { dir, ws } = fresh(); ws.saveItems(sampleItems()); fs.writeFileSync(path.join(dir, 'cvs', 'bad.json'), '[1,2');
  const again = new Workspace(dir); const n = again.takeNotices();
  assert.equal(n.length, 1); assert.equal(n[0].kind, 'recovered'); assert.deepEqual(again.takeNotices(), []);
  assert.equal(again.listItems().length, 8);
});

test('old files are migrated on load and stamped on save; newer files are reported, not destroyed', () => {
  const { dir, ws } = fresh(); const it = sampleItems()[1];
  fs.writeFileSync(path.join(dir, 'items', 'old1.json'), JSON.stringify(Object.assign({}, it, { id: 'old1', type: 'custom' })));
  fs.writeFileSync(path.join(dir, 'items', 'new1.json'), JSON.stringify(Object.assign({}, it, { id: 'new1', schema: 999, futureField: 1 })));
  const again = new Workspace(dir);
  assert.equal(again.getItem('old1').type, 'initiative');
  assert.ok(again.takeNotices().some(n => n.kind === 'newer'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'items', 'new1.json'), 'utf8')).futureField, 1);
  again.saveItem(again.getItem('old1')); assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'items', 'old1.json'), 'utf8')).schema, 1);
});

test('failed writes give a readable error and keep the old file', () => {
  const { dir, ws } = fresh(); const it = ws.saveItem(sampleItems()[0]);
  const real = fs.renameSync; fs.renameSync = () => { const e = new Error('x'); e.code = 'ENOSPC'; throw e; };
  try { assert.throws(() => ws.saveItem(Object.assign({}, it, { title: 'changed' })), /disk is full/); } finally { fs.renameSync = real; }
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'items', it.id + '.json'), 'utf8')).title, it.title);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'items')).filter(f => f.endsWith('.tmp')), []);
});
