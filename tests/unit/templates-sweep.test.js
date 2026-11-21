'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TP = require('../../src/core/templates');
const X = require('../../src/core/exporters');
const M = require('../../src/core/model');
const { sampleItems, sampleCV } = require('../helpers');

const EVIL = '<script>alert(1)</script><img src=x onerror=alert(2)> {{header.name}} {{{raw}}} &amp; "q"';
function cases() {
  const base = sampleItems();
  const huge = [M.newItem({ type: 'work', text: 'word '.repeat(3000), org: 'O'.repeat(400), role: 'R'.repeat(300), start: '2020-01', end: 'present' })];
  const many = Array.from({ length: 150 }, (_, i) => M.newItem({ type: i % 2 ? 'work' : 'project', text: 'Line ' + i + ' did a thing', org: 'Org ' + (i % 9), role: 'Role', start: '2010-0' + (1 + i % 9), end: '2012-01' }));
  const evil = [M.newItem({ type: 'work', text: EVIL, org: EVIL, role: EVIL, start: '2020', end: '2021' }), M.newItem({ type: 'skill', title: EVIL }), M.newItem({ type: 'education', title: EVIL, org: EVIL })];
  const out = [];
  out.push(['normal', base, sampleCV(base)]);
  out.push(['empty', [], M.newCV()]);
  out.push(['huge text', huge, sampleCV(huge)]);
  out.push(['150 entries', many, sampleCV(many)]);
  out.push(['hostile text', evil, sampleCV(evil, { header: { name: EVIL, email: EVIL, phone: '', headline: EVIL, address: '', dob: '', links: [EVIL, 'javascript:alert(1)'], photo: '' } })]);
  out.push(['letter + privacy', base, sampleCV(base, { privacy: true, opts: { pageSize: 'Letter', margin: 5 } })]);
  out.push(['photo, qr, labels', base, sampleCV(base, { header: { name: 'A', email: 'a@b.co', phone: '1', headline: 'h', address: 'x', dob: '2000-01-01', links: ['github.com/a'], photo: 'data:image/png;base64,iVBORw0KGgo=' }, li: { on: true, url: 'https://www.linkedin.com/in/a' }, opts: { photo: true, labels: true } })]);
  out.push(['dangling refs', base, sampleCV(base, { selected: [{ itemId: 'nope', versionId: 'zzz' }, ...base.map(i => ({ itemId: i.id, versionId: 'missing-version' }))] })]);
  return out;
}

test('every built-in template renders every edge-case CV without leftovers or injected markup', () => {
  const settings = {};
  for (const t of TP.BUILTIN) for (const [name, items, cv0] of cases()) {
    const cv = Object.assign({}, cv0, { templateId: t.id });
    let html; try { html = TP.renderDocument(cv, items, settings, [], { mode: 'print' }); } catch (e) { assert.fail(t.id + ' / ' + name + ': ' + e.message); }
    assert.ok(html.length > 200, t.id + ' / ' + name + ' produced nothing');
    assert.ok(!/\{\{/.test(html.replace(/\{\{header\.name\}\}|\{\{\{raw\}\}\}/g, '')), t.id + ' / ' + name + ': template tag left in output');
    if (name === 'hostile text') {
      assert.ok(!/<script>alert/i.test(html), t.id + ': script from user text got through');
      assert.ok(!/<img src=x/i.test(html), t.id + ': img from user text got through');
      assert.ok(!/href="javascript:/i.test(html), t.id + ': javascript link');
    }
    const txt = TP.plainText(cv, items, settings); assert.equal(typeof txt, 'string');
  }
});

test('every built-in template keeps the same look in preview, print and png modes (same text, no errors)', () => {
  const items = sampleItems(); const cv = sampleCV(items);
  for (const t of TP.BUILTIN) for (const mode of ['preview', 'print', 'png']) {
    const html = TP.renderDocument(Object.assign({}, cv, { templateId: t.id }), items, {}, [], { mode });
    assert.match(html, /Asha Rao/); assert.match(html, /Forecasting model/);
  }
});

test('DOCX, JSON Resume and native export cope with every edge-case CV', async () => {
  for (const [name, items, cv] of cases()) {
    await assert.doesNotReject(X.buildDocx(cv, items, {}), 'docx / ' + name);
    assert.doesNotThrow(() => X.toJsonResume(cv, items, {}), 'jsonresume / ' + name);
    assert.doesNotThrow(() => JSON.stringify(X.nativeCvExport(cv, items)), 'native / ' + name);
  }
});

test('custom templates: scripts, event handlers, remote loads and odd tags are stripped; broken tags do not hang', () => {
  const G = require('../../src/core/guards');
  const h = G.sanitizeTemplateHtml('<h1 onclick="x()">{{header.name}}</h1><script>1</script><iframe src="https://e.com"></iframe><img src="https://e.com/a.png"><a href="javascript:alert(1)">x</a>{{#sections}}<p>{{label}}');
  assert.ok(!/<script|onclick|<iframe|https:\/\/e\.com|javascript:/i.test(h), h);
  const c = G.sanitizeTemplateCss('@import url(https://e.com/a.css);body{background:url(https://e.com/x.png);behavior:url(x.htc)}h1{color:red}');
  assert.ok(!/https:\/\/e\.com|@import|behavior/i.test(c), c); assert.match(c, /color:red/);
  const t0 = Date.now(); TP.render('{{#a}}'.repeat(2000) + 'x', { a: [1] }); TP.render('{{'.repeat(5000), {}); assert.ok(Date.now() - t0 < 2000);
  assert.doesNotThrow(() => TP.render('{{/x}}{{/y}}{{#z}}', {}));
});

test('HTML, JSON and Word files are written for an empty CV and for a hostile CV, with odd file names', async () => {
  const fs = require('fs'); const { makeApi } = require('../helpers');
  const w0 = makeApi(); const w = { api: (n, a) => w0.api[n](a || {}), cleanup: w0.cleanup }; try {
    const evil = M.newItem({ type: 'work', text: EVIL, org: EVIL, role: 'r', start: '2020', end: '2021' });
    await w.api('items.saveMany', { items: [evil] });
    const names = ['', 'a/b\\c:d*e?f"g<h>i|j', 'x'.repeat(400), 'CON'];
    for (const [i, name] of names.entries()) {
      const cv = await w.api('cv.create', { name, selected: i ? [{ itemId: evil.id, versionId: null }] : [] });
      for (const format of ['html', 'json', 'docx']) {
        const r = await w.api('export.run', { id: cv.id, format });
        assert.ok(r.files.length && fs.existsSync(r.files[0]), format + ' / ' + JSON.stringify(name).slice(0, 20));
        assert.ok(require('path').basename(r.files[0]).length < 200);
        if (format === 'html') assert.ok(!/<script>alert/i.test(fs.readFileSync(r.files[0], 'utf8')));
      }
    }
  } finally { w.cleanup(); }
});

test('Word file: photo and QR code are placed in the header table for every layout, and A4 is the page', async () => {
  const JSZip = require('jszip'); const QR = require('../../src/core/qr');
  const photo = 'data:image/png;base64,' + QR.png('https://example.com', 4).toString('base64');
  for (const id of ['classic', 'modern', 'sidebar', 'darkside', 'timeline']) {
    const items = sampleItems();
    const cv = sampleCV(items, { templateId: id, header: { name: 'A B', email: 'a@b.co', phone: '', headline: 'h', address: '', dob: '', links: [], photo }, qr: { on: true, url: 'https://www.linkedin.com/in/a', size: 64 }, opts: { photo: true } });
    const z = await JSZip.loadAsync(await X.buildDocx(cv, items, {})); const xml = await z.file('word/document.xml').async('string');
    assert.equal((xml.match(/<w:drawing>/g) || []).length, 2, id + ': photo and QR');
    assert.match(xml, /<w:pgSz w:w="11906" w:h="16838"/, id + ': A4');
    const cv2 = Object.assign({}, cv, { privacy: true }); const x2 = await (await JSZip.loadAsync(await X.buildDocx(cv2, items, {}))).file('word/document.xml').async('string');
    assert.equal((x2.match(/<w:drawing>/g) || []).length, 0, id + ': privacy mode leaves them out');
  }
});

test('HTML export has page margins on screen; the bin lists deleted CVs in full and can remove one for good', async () => {
  const fs = require('fs'); const { makeApi } = require('../helpers');
  const w0 = makeApi(); const A = (n, a) => w0.api[n](a || {});
  try {
    const cv = await A('cv.create', { name: 'Margins' });
    const r = await A('export.run', { id: cv.id, format: 'html' }); const html = fs.readFileSync(r.files[0], 'utf8');
    assert.match(html, /@media screen\{html\{background/); assert.match(html, /padding:14mm!important/);
    await A('cv.delete', { id: cv.id });
    const bin = await A('trash.cvs'); assert.equal(bin.length, 1); assert.equal(bin[0].name, 'Margins'); assert.ok(bin[0].deletedAt);
    assert.equal(await A('trash.purge', { kind: 'cv', id: cv.id }), true); assert.equal((await A('trash.cvs')).length, 0);
    await assert.rejects(() => A('trash.purge', { kind: 'cv', id: '../x' }));
  } finally { w0.cleanup(); }
});

test('ATS text comparison ignores spaces around hyphens, curly quotes, capitals and soft hyphens', () => {
  const { atsNorm } = require('../../src/core/ats-text');
  const item = "Collaborated with NPCI CXOs, researched global net-banking solutions, and proposed the CEO's plan";
  const pdf = "COLLABORATED with  NPCI CXOs, researched global net - banking solutions, and proposed the CEO’s plan";
  assert.ok(atsNorm(pdf).includes(atsNorm(item)));
  assert.ok(atsNorm('end – to – end').includes(atsNorm('end-to-end')));
  assert.ok(atsNorm('exam­ple').includes('example'));
  // a genuinely broken word is still a difference
  assert.ok(!atsNorm('analyt- ics report').includes(atsNorm('analytics report')));
  assert.ok(!atsNorm('net banking').includes(atsNorm('net-banking')));
});
