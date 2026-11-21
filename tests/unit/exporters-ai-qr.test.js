'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const X = require('../../src/core/exporters');
const AI = require('../../src/core/ai');
const QR = require('../../src/core/qr');
const M = require('../../src/core/model');
const { sampleItems, sampleCV } = require('../helpers');

test('DOCX export builds a valid zip with the CV text', async () => {
  const items = sampleItems(); const buf = await X.buildDocx(sampleCV(items), items, {});
  const zip = await JSZip.loadAsync(buf); const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('Asha Rao')); assert.ok(xml.includes('Forecasting model'));
});

test('DOCX export with a Page Break puts a page break before the next section', async () => {
  const items = sampleItems(); const cv = sampleCV(items); const pb = cv.sections.splice(cv.sections.findIndex(s => s.pb), 1)[0]; pb.visible = true; cv.sections.splice(1, 0, pb);
  const xml = await (await JSZip.loadAsync(await X.buildDocx(cv, items, {}))).file('word/document.xml').async('string');
  assert.match(xml, /w:pageBreakBefore/);
});

test('DOCX export copes with an empty CV and with markup characters', async () => {
  await assert.doesNotReject(X.buildDocx(M.newCV(), [], {}));
  const items = [M.newItem({ type: 'work', text: '<b>&</b> \u0000 😀', org: 'A&B' })];
  await assert.doesNotReject(X.buildDocx(sampleCV(items), items, {}));
});

test('JSON Resume export', () => {
  const items = sampleItems(); const j = X.toJsonResume(sampleCV(items), items, {});
  assert.equal(j.basics.name, 'Asha Rao'); assert.ok(Array.isArray(j.work));
});

test('native export contains only the entries the CV uses', () => {
  const items = sampleItems(); const cv = sampleCV(items.slice(0, 3)); const out = X.nativeCvExport(cv, items);
  assert.equal(out.kind, 'cvbuilder-cv'); assert.equal(out.items.length, 3);
});

test('AI redact removes contact details', () => {
  const t = AI.redact('Mail asha@example.com or call +91 90000 00000, see https://www.linkedin.com/in/asha-rao', { name: 'Asha Rao', links: [] });
  assert.ok(!/asha@example\.com|90000|linkedin\.com/.test(t), t);
});

test('AI parseJSON copes with wrapped, fenced and think-tagged replies', () => {
  assert.deepEqual(AI.parseJSON('{"a":1}'), { a: 1 });
  assert.deepEqual(AI.parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(AI.parseJSON('<think>hmm</think>Here you go: {"a":[1,2]}'), { a: [1, 2] });
  assert.doesNotThrow(() => AI.parseJSON('')); assert.doesNotThrow(() => AI.parseJSON('not json at all'));
});

test('QR codes: svg for text of many lengths, errors for text that is too long', () => {
  for (const t of ['a', 'https://example.com', 'x'.repeat(200), '中文']) assert.match(QR.svg(t), /^data:image\/svg\+xml;base64,/);
  assert.throws(() => QR.svg('x'.repeat(5000)));
  assert.doesNotThrow(() => QR.svg(''));
});

test('DOCX export follows the template: banner header and heading bar for Modern, plain for ATS', async () => {
  const items = sampleItems(); const xmlOf = async (tpl) => { const cv = sampleCV(items); cv.templateId = tpl; return (await (await JSZip.loadAsync(await X.buildDocx(cv, items, {}))).file('word/document.xml').async('string')); };
  const modern = await xmlOf('modern'), ats = await xmlOf('ats-plain'), classic = await xmlOf('classic');
  assert.match(modern, /w:shd[^>]*w:fill="[0-9A-F]{6}"/);          // coloured header band
  assert.match(modern, /<w:left [^>]*w:sz="36"/);                  // bar beside section headings
  assert.doesNotMatch(ats, /w:shd /);
  assert.match(ats, /Arial/);
  assert.notEqual(modern, classic);
});
