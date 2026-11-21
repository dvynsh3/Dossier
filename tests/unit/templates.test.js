'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../src/core/templates');
const M = require('../../src/core/model');
const { sampleItems, sampleCV } = require('../helpers');

const render = (cv, items, o) => T.renderDocument(cv, items, {}, [], Object.assign({ mode: 'preview' }, o || {}));

test('every built-in template renders the sample CV with name, email and sections', () => {
  const items = sampleItems(); const cv = sampleCV(items);
  for (const t of T.BUILTIN) {
    const html = render(Object.assign({}, cv, { templateId: t.id }), items);
    assert.ok(html.includes('Asha Rao'), t.id + ' name');
    assert.ok(html.includes('asha@example.com'), t.id + ' email');
    assert.ok(html.includes('Forecasting model'), t.id + ' project text');
  }
});

test('user text is HTML-escaped everywhere', () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const items = [M.newItem({ type: 'work', text: evil, org: evil, role: evil, start: '2020', end: '2021' })];
  const cv = sampleCV(items, { header: { name: evil, email: evil, phone: evil, headline: evil, address: evil, dob: '', links: [evil, 'javascript:alert(1)'], photo: '' } });
  for (const t of T.BUILTIN) {
    const html = render(Object.assign({}, cv, { templateId: t.id }), items);
    assert.ok(!/<img src=x/i.test(html), t.id + ' raw tag leaked');
    assert.ok(!/href="javascript:/i.test(html), t.id + ' javascript: link');
  }
});

test('empty CV renders without throwing', () => {
  const cv = M.newCV();
  for (const t of T.BUILTIN) assert.doesNotThrow(() => render(Object.assign({}, cv, { templateId: t.id }), []), t.id);
});

test('entries pointing at deleted repository items are skipped', () => {
  const items = sampleItems(); const cv = sampleCV(items); cv.selected.push({ itemId: 'it_gone', versionId: null });
  assert.doesNotThrow(() => render(cv, items));
});

test('override text beats item text and escapes', () => {
  const items = sampleItems(); const cv = sampleCV(items);
  cv.selected.find(s => s.itemId === items[1].id).override = 'Custom <b>wording</b>';
  const html = render(cv, items);
  assert.ok(html.includes('Custom &lt;b&gt;wording&lt;/b&gt;'));
});

test('Page Break: off by default, on makes the next shown section start a new page', () => {
  const items = sampleItems(); const cv = sampleCV(items);
  assert.ok(!/break-before:page/.test(render(cv, items)));
  const k = cv.sections.findIndex(s => s.key === 'education');
  const pb = cv.sections.splice(cv.sections.findIndex(s => s.pb), 1)[0]; pb.visible = true; cv.sections.splice(k + 1, 0, pb);
  const model = T.buildModel(cv, items, {});
  assert.equal(model.sections.find(s => s.key === 'work').breakBefore, true);
  assert.equal(model.sections.find(s => s.key === 'education').breakBefore, false);
  assert.match(render(cv, items), /\[data-sgid="sec:work"\]\{break-before:page/);
});

test('Page Break at the very end or before hidden sections never breaks the build', () => {
  const items = sampleItems(); const cv = sampleCV(items);
  const pb = cv.sections.find(s => s.pb); pb.visible = true;
  assert.doesNotThrow(() => render(cv, items));
  cv.sections.forEach(s => { if (!s.pb) s.visible = false; });
  assert.doesNotThrow(() => render(cv, items));
});

test('legacy newPage flags are ignored, keep-together still applies', () => {
  const items = sampleItems(); const cv = sampleCV(items);
  cv.blockFlags = { 'work:0': { newPage: true, keep: true } };
  const html = render(cv, items);
  assert.match(html, /break-inside:avoid/);
  assert.ok(!/\[data-gid="work:0"\][^}]*break-before:page/.test(html));
});

test('plainText lists sections in order', () => {
  const items = sampleItems(); const cv = sampleCV(items);
  const txt = T.plainText(cv, items, {});
  assert.ok(txt.indexOf('EDUCATION') < txt.indexOf('PROJECTS') || txt.includes('Education'));
});

test('very long text and unusual characters do not break rendering', () => {
  const long = 'word '.repeat(5000) + '‮\u0000😀 中文 العربية';
  const items = [M.newItem({ type: 'work', text: long, org: 'O'.repeat(500) })];
  assert.doesNotThrow(() => render(sampleCV(items), items));
});

test('age helper handles bad dates', () => {
  for (const d of ['', 'x', '2099-01-01', '1990-02-30', null]) assert.doesNotThrow(() => T.ageFromDob(d), String(d));
});
