'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const G = require('../../src/core/guards');
const { createLogger } = require('../../src/core/log');
const { tmpDir } = require('../helpers');

test('programs and scripts are never opened', () => {
  for (const f of ['a.exe', 'A.BAT', 'x.cmd', 'y.ps1', 'z.lnk', 'm.msi', 'p.js', 'q.vbs', 'r.hta', 'cv.pdf.exe', 'run.sh']) assert.equal(G.isBlockedFile(f), true, f);
  for (const f of ['cv.pdf', 'cv.docx', 'cv.png', 'cv.html', 'cv.json', 'letter.txt']) assert.equal(G.isBlockedFile(f), false, f);
});

test('path policy: only inside working folders or trusted choices', () => {
  const root = tmpDir('dossier-pol-'), other = tmpDir('dossier-other-');
  fs.mkdirSync(path.join(root, 'exports')); fs.writeFileSync(path.join(root, 'exports', 'cv.pdf'), 'x'); fs.writeFileSync(path.join(root, 'exports', 'bad.exe'), 'x'); fs.writeFileSync(path.join(other, 'secret.txt'), 'x');
  const pol = G.makePathPolicy(() => [root]);
  assert.equal(pol.allowsOpen(path.join(root, 'exports', 'cv.pdf')), true);
  assert.equal(pol.allowsOpen(path.join(root, 'exports', 'bad.exe')), false);          // inside, but a program
  assert.equal(pol.allowsOpen(path.join(other, 'secret.txt')), false);                 // outside
  assert.equal(pol.allowsOpen(path.join(root, '..', path.basename(other), 'secret.txt')), false);   // dot-dot trick
  assert.equal(pol.allowsOpen(root + '-evil/cv.pdf'), false);                          // same prefix, different folder
  for (const bad of ['', null, undefined, 'relative.pdf', 42, {}, 'a\0b']) assert.equal(pol.allows(bad), false, String(bad));
  pol.trust(path.join(other, 'secret.txt')); assert.equal(pol.allowsOpen(path.join(other, 'secret.txt')), true);
});

test('path policy: a link inside the folder that points outside is refused', (t) => {
  const root = tmpDir('dossier-pol-'), other = tmpDir('dossier-other-'); fs.writeFileSync(path.join(other, 'secret.txt'), 'x');
  try { fs.symlinkSync(other, path.join(root, 'link'), 'dir'); } catch (e) { return t.skip('symlinks not allowed here'); }
  assert.equal(G.makePathPolicy(() => [root]).allows(path.join(root, 'link', 'secret.txt')), false);
});

test('url checks', () => {
  assert.equal(G.isWebUrl('https://example.com/a'), true); assert.equal(G.isWebUrl('javascript:alert(1)'), false); assert.equal(G.isWebUrl('file:///c:/x'), false); assert.equal(G.isWebUrl(null), false);
  assert.equal(G.isLinkedInUrl('https://www.linkedin.com/in/x'), true); assert.equal(G.isLinkedInUrl('https://linkedin.com.evil.com/'), false); assert.equal(G.isLinkedInUrl('http://linkedin.com/'), false); assert.equal(G.isLinkedInUrl('https://evil.com/?u=linkedin.com'), false);
});

test('plain objects and own properties', () => {
  assert.equal(G.isPlainObject({}), true); assert.equal(G.isPlainObject(Object.create(null)), true);
  for (const v of [null, [], 'x', 5, new Date(), new (class A {})()]) assert.equal(G.isPlainObject(v), false);
  const api = { a: 1 }; assert.equal(G.hasOwn(api, 'a'), true); for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(G.hasOwn(api, k), false, k);
});

test('redact removes keys and personal folder names', () => {
  const r = G.redact('failed https://x/v1?key=AIzaSyA1234567890abcdefghijkl&alt=1 with Bearer abcdefghijklmnop1234 and gsk_abcdefghijklmnopqrst at C:\\Users\\Divyansh\\AppData\\x and /home/divyansh/a');
  assert.ok(!/AIza|abcdefghijklmnop|Divyansh|divyansh/.test(r), r);
  assert.equal(G.redact(null), ''); assert.equal(G.redact('plain text'), 'plain text');
});

test('logger writes redacted lines and rotates', () => {
  const dir = tmpDir('dossier-log-'); const log = createLogger(dir, { maxBytes: 300, keep: 2 });
  log.error('boom', new Error('bad key=AIzaSyA1234567890abcdefghijkl'));
  assert.ok(!/AIza/.test(fs.readFileSync(log.file, 'utf8')));
  for (let i = 0; i < 30; i++) log.info('line ' + i + ' '.repeat(20));
  const files = fs.readdirSync(dir); assert.ok(files.includes('app.1.log')); assert.ok(!files.includes('app.3.log'), files.join());
});

test('custom templates lose scripts, handlers and remote loads but keep layout', () => {
  const html = '<div class="a" onclick="x()"><script>alert(1)</script><iframe src="//e.com"></iframe><a href="javascript:alert(1)">hi</a><img src="x" onerror=alert(1)><h1>{{name}}</h1><link rel="stylesheet" href="http://e.com/x.css"></div>';
  const out = G.sanitizeTemplateHtml(html);
  assert.ok(!/script|iframe|onclick|onerror|javascript:|<link/i.test(out), out); assert.ok(out.includes('{{name}}') && out.includes('class="a"') && out.includes('<h1>'));
  const css = G.sanitizeTemplateCss('@import url(http://e.com/a.css); .a{background:url(https://e.com/t.png);color:red} .b{background:url(data:image/png;base64,AAA)}');
  assert.ok(!/e\.com|@import/.test(css), css); assert.ok(css.includes('color:red') && css.includes('data:image/png'));
});
