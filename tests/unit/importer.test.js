'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const I = require('../../src/core/importer');
const { tmpDir } = require('../helpers');

const write = (name, body) => { const f = path.join(tmpDir('dossier-imp-'), name); fs.writeFileSync(f, body); return f; };

const PASTED = `EDUCATION
B.Sc. Statistics, Delhi University 2019 - 2022

WORK EXPERIENCE
Analyst, NPCI  Jan 2023 - Present
- Led a team of five analysts to cut reporting time by 40%
- Built an automated dashboard used by 30 managers

PROJECTS
Demand forecasting
- Forecasting model with 91% accuracy on held-out data

SKILLS
Python, SQL, Excel`;

test('pasted text with headings becomes typed candidates', () => {
  const r = I.importPastedText(PASTED, []);
  assert.ok(r.candidates.length >= 4, 'got ' + r.candidates.length);
  assert.ok(r.candidates.some(c => c.type === 'work'));
  assert.ok(r.candidates.every(c => c.tempId && c.source === 'pasted text'));
});

test('pasted text without headings falls back to one entry per line', () => {
  const r = I.importPastedText('Did a long and interesting thing for a client\nAnother substantial accomplishment worth noting', []);
  assert.equal(r.candidates.length, 2); assert.ok(r.warnings.length);
});

test('empty, whitespace and symbol-only input gives zero candidates, not an error', () => {
  for (const t of ['', '   \n\n  ', '----', null, undefined]) assert.doesNotThrow(() => I.importPastedText(t, []), String(t));
});

test('duplicates of existing entries are flagged', () => {
  const existing = [{ id: 'it_1', text: 'Led a team of five analysts to cut reporting time by 40%', title: '' }];
  const r = I.importPastedText(PASTED, existing);
  assert.ok(r.candidates.some(c => c.dupOf === 'it_1'));
});

test('parseCSV handles quotes, commas, newlines and CRLF', () => {
  const rows = I.parseCSV('a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n');
  assert.equal(rows.length, 1); assert.deepEqual(rows[0], { a: 'x, y', b: 'he said "hi"', c: 'line1\nline2' });
  assert.doesNotThrow(() => I.parseCSV('')); assert.doesNotThrow(() => I.parseCSV('"unterminated'));
});

test('JSON Resume files import', async () => {
  const f = write('resume.json', JSON.stringify({ basics: { name: 'A B', email: 'a@b.co' }, work: [{ name: 'Acme', position: 'Dev', startDate: '2020-01-01', summary: 'Did work', highlights: ['Shipped X'] }], education: [{ institution: 'Uni', studyType: 'BSc', startDate: '2016', endDate: '2019' }], skills: [{ name: 'Web', keywords: ['JS'] }] }));
  const r = await I.importFile(f, []); assert.equal(r.header.name, 'A B'); assert.ok(r.candidates.length >= 3);
});

test('broken inputs are rejected with an error that can be shown to the user', async () => {
  for (const [name, body] of [['bad.json', '{not json'], ['empty.json', ''], ['garbage.pdf', 'this is not a pdf'], ['empty.pdf', ''], ['bad.zip', 'PK-not-really'], ['notes.docx', 'plain text pretending to be docx']]) {
    const f = write(name, body);
    await assert.rejects(() => I.importFile(f, []), (e) => { assert.ok(e && typeof e.message === 'string' && e.message.length > 0, name + ': no message'); assert.ok(!/at Object\.|node_modules/.test(e.message), name + ': raw stack in message'); return true; }, name);
  }
});

test('plain text files import', async () => {
  const f = write('cv.txt', PASTED); const r = await I.importFile(f, []); assert.ok(r.candidates.length >= 3);
});

test('huge text input is handled in reasonable time', () => {
  const big = Array.from({ length: 3000 }, (_, i) => '- Delivered project number ' + i + ' on time and under budget').join('\n');
  const t0 = Date.now(); I.importPastedText('WORK EXPERIENCE\nAnalyst, Acme 2020 - 2021\n' + big, []); assert.ok(Date.now() - t0 < 8000, 'took ' + (Date.now() - t0));
});

test('date parsing', () => {
  for (const s of ['Jan 2020 - Present', '2019 - 2022', 'June 2021 – Aug 2021', '03/2020 - 05/2021', 'nonsense']) assert.doesNotThrow(() => I.parseDates(s), s);
  const d = I.parseDates('Jan 2020 - Present'); assert.ok(d && String(d.start).startsWith('2020'));
});

test('oversized and empty files are refused before parsing', async () => {
  const big = write('big.txt', Buffer.alloc(I.MAX_FILE_BYTES + 1, 97));
  await assert.rejects(() => I.importFile(big, []), /too large/);
  await assert.rejects(() => I.importFile(write('zero.txt', ''), []), /empty/);
});

test('a zip with too many entries is refused', async () => {
  const JSZip = require('jszip'); const z = new JSZip(); for (let i = 0; i < 3100; i++) z.file('f' + i + '.txt', 'x');
  const f = write('many.zip', await z.generateAsync({ type: 'nodebuffer' }));
  await assert.rejects(() => I.importFile(f, []), /too many files/);
});
