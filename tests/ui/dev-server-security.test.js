'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { start } = require('../../dev/server');
const { tmpDir } = require('../helpers');

const raw = (port, opts, body) => new Promise((resolve, reject) => { const r = http.request(Object.assign({ host: '127.0.0.1', port }, opts), (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); }); r.on('error', reject); if (body) r.write(body); r.end(); });

test('dev server refuses foreign hosts, cross-site posts, odd actions and files outside the app folders', async (t) => {
  const dir = tmpDir('dossier-dev-'); const s = await start({ workspace: dir, port: 0, secretsFile: dir + '/s.json' }); t.after(() => s.close());
  const post = (name, headers, body) => raw(s.port, { method: 'POST', path: '/api/' + name, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) }, body || '{}');
  assert.equal((await post('items.list', { 'X-Dossier': '1' })).status, 200);
  assert.equal((await post('items.list', {})).status, 403);                                                       // no header: a plain cross-site form post
  assert.equal((await post('items.list', { 'X-Dossier': '1', Host: 'evil.example:' + s.port })).status, 403);     // DNS rebinding
  assert.equal((await post('items.list', { 'X-Dossier': '1', Origin: 'http://evil.example' })).status, 403);
  for (const name of ['constructor', 'toString', '__proto__']) { const r = JSON.parse((await post(name, { 'X-Dossier': '1' })).body); assert.equal(r.ok, false, name); }
  assert.equal(JSON.parse((await post('items.list', { 'X-Dossier': '1' }, '[1,2]')).body).ok, false);          // arguments must be an object
  for (const p of ['/package.json', '/main.js', '/dev/server.js', '/renderer/../main.js', '/%2e%2e/etc/passwd', '/src/core/../../package.json']) assert.equal((await raw(s.port, { method: 'GET', path: p })).status, 404, p);
  assert.equal((await raw(s.port, { method: 'GET', path: '/renderer/index.html' })).status, 200);
  assert.equal((await raw(s.port, { method: 'GET', path: '/renderer/index.html', headers: { Host: 'evil.example' } })).status, 403);
});
