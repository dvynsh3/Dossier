'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { makeApi, sampleItems } = require('../helpers');

const env = makeApi(); const { api } = env;
after(() => env.cleanup());

test('items: save, list, star, archive, delete, restore', async () => {
  const items = sampleItems(); await api['items.saveMany']({ items });
  assert.equal((await api['items.list']({})).length, items.length);
  const id = items[1].id;
  await api['items.star']({ ids: [id], starred: true }); assert.equal((await api['items.list']({})).find(i => i.id === id).starred, true);
  await api['items.archive']({ ids: [id], archived: true }); assert.equal((await api['items.list']({})).find(i => i.id === id).archived, true);
  await api['items.delete']({ id }); assert.ok(!(await api['items.list']({})).some(i => i.id === id));
  await api['trash.restore']({ kind: 'item', id }); assert.ok((await api['items.list']({})).some(i => i.id === id));
});

test('versions: add, set main, edit, promote, delete', async () => {
  const id = (await api['items.list']({}))[0].id;
  const r = await api['items.addVersion']({ id, text: 'a different wording', source: 'manual' });
  assert.ok(r.version && r.version.id);
  await api['items.setMain']({ id, versionId: r.version.id });
  await api['items.editVersion']({ id, versionId: r.version.id, text: 'edited wording' });
  const it = (await api['items.list']({})).find(x => x.id === id);
  assert.ok(it.versions.some(v => v.text === 'edited wording'));
  await api['items.deleteVersion']({ id, versionId: r.version.id });
  assert.ok(!(await api['items.list']({})).find(x => x.id === id).versions.some(v => v.id === r.version.id));
});

test('cvs: create, get, save, duplicate, delete, usage', async () => {
  const items = await api['items.list']({});
  const cv = await api['cv.create']({ name: 'API CV', selected: items.slice(0, 3).map(i => ({ itemId: i.id, versionId: null })) });
  assert.equal((await api['cv.get']({ id: cv.id })).selected.length, 3);
  cv.name = 'Renamed'; await api['cv.save'](cv); assert.equal((await api['cv.get']({ id: cv.id })).name, 'Renamed');
  const copy = await api['cv.duplicate']({ id: cv.id }); assert.notEqual(copy.id, cv.id);
  const use = await api['cv.usage']({}); assert.ok(use[items[0].id]);
  await api['cv.delete']({ id: copy.id }); assert.ok(!(await api['cv.list']({})).some(c => c.id === copy.id));
});

test('applications: save and list keep every field', async () => {
  const list = [{ id: 'ap_1', company: 'Acme', role: 'Analyst', applied: '2026-10-01', status: 'Applied', cvId: '', followUp: '', notes: 'n', jds: [], letter: null, updated: '2026-10-02T00:00:00Z' }];
  await api['applications.save']({ list }); assert.deepEqual((await api['applications.list']({}))[0], list[0]);
});

test('cv.html renders and cv.plainText works for a real CV', async () => {
  const cv = (await api['cv.list']({}))[0]; const html = await api['cv.html']({ id: cv.id, mode: 'preview' });
  assert.ok(String(html.html || html).includes('<'));
});

test('unknown ids give clean answers, not crashes', async () => {
  assert.equal(await api['cv.get']({ id: 'nope' }), null);
  await assert.doesNotReject(api['items.delete']({ id: 'nope' }));
  await assert.doesNotReject(api['trash.restore']({ kind: 'item', id: 'nope' }));
});

test('settings: deep merge keeps untouched values', async () => {
  await api['settings.set']({ theme: 'light', ai: { providers: { local: { model: 'm1' } } } });
  const s = await api['settings.get']({}); assert.equal(s.theme, 'light'); assert.equal(s.ai.providers.local.model, 'm1'); assert.ok(s.ai.providers.local.baseUrl, 'siblings preserved');
});

test('refine.apply and dup.find survive an empty list', async () => {
  await assert.doesNotReject(api['dup.find']({}));
});

test('net.fetchText refuses local-network addresses', async () => {
  const http = require('http'); let hit = false;
  const srv = http.createServer((q, r) => { hit = true; r.end('secret'); }); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try { await api['net.fetchText']({ url: 'http://127.0.0.1:' + srv.address().port + '/' }).catch(() => {}); assert.equal(hit, false, 'the app fetched a localhost address'); } finally { srv.close(); }
  await assert.rejects(api['net.fetchText']({ url: 'file:///etc/passwd' }));
});

const NETM = require('../../src/core/net');
test('net: private, loopback and link-local addresses are recognised', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) assert.equal(NETM.isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(NETM.isPrivateAddress(ip), false, ip);
});
test('net: only public http(s) links pass', async () => {
  for (const u of ['file:///etc/passwd', 'ftp://example.com', 'http://localhost:3000', 'http://127.0.0.1', 'http://[::1]/', 'http://user:pw@example.com', 'http://169.254.169.254/latest/meta-data', 'http://printer.local/', 'not a url', '']) await assert.rejects(NETM.assertPublicUrl(u), u);
});
test('net: a redirect to a local address is refused', async () => {
  const http = require('http'); let hit = false;
  const inner = http.createServer((q, r) => { hit = true; r.end('secret'); }); await new Promise(r => inner.listen(0, '127.0.0.1', r));
  NETM.use(async (u) => (u.includes('public.test') ? new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:' + inner.address().port + '/' } }) : fetch(u)));
  const dns = require('dns').promises; const orig = dns.lookup; dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  try { await assert.rejects(NETM.safeFetch('http://public.test/'), /local network/); assert.equal(hit, false); }
  finally { dns.lookup = orig; NETM.use((...a) => globalThis.fetch(...a)); inner.close(); }
});

test('templates are cleaned when saved and when listed', async () => {
  const { api, dir, ws } = makeApi();
  const tpl = await api['templates.save']({ name: 'T', html: '<div onclick="x()"><script>1</script>{{name}}</div>', css: '@import url(http://e.com/x.css);.a{color:red}' });
  assert.ok(!/script|onclick/.test(tpl.html)); assert.ok(!/@import/.test(tpl.css));
  const fs = require('fs'), path = require('path'); const f = path.join(dir, 'templates', tpl.id + '.json'); const raw = JSON.parse(fs.readFileSync(f, 'utf8')); raw.html = '<script>1</script>x'; fs.writeFileSync(f, JSON.stringify(raw));
  assert.ok(ws.listCustomTemplates().every(t => !/<script/.test(t.html || '')));
  await assert.rejects(() => api['templates.save']({ name: 'big', html: 'x'.repeat(600000) }), /too large/);
});
