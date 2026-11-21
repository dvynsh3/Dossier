'use strict';
// Shared test helpers: temporary workspaces, a ready-made API, sample data and the headless browser harness.
const fs = require('fs');
const os = require('os');
const path = require('path');
const M = require('../src/core/model');
const { Workspace } = require('../src/core/storage');
const { createApi } = require('../src/core/api');

const tmpDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'dossier-'));

// A workspace plus the API on top of it, backed by a throw-away folder.
function makeApi(opts) {
  opts = opts || {};
  const dir = opts.dir || tmpDir('dossier-ws-');
  const ws = new Workspace(dir);
  const secrets = {}; // in-memory stand-in for the encrypted key store
  const ctx = { ws, platform: 'test', engine: null, secrets: { get: async (id) => secrets[id] || '', set: async (id, k) => { if (k) secrets[id] = k; else delete secrets[id]; } }, pickSavePath: async () => null, openWorkspace: async () => {} };
  return { dir, ws, ctx, api: createApi(ctx), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// Sample entries covering every section type.
function sampleItems() {
  const mk = (p) => M.newItem(p);
  return [
    mk({ type: 'education', title: 'B.Sc. Statistics', org: 'Delhi University', start: '2019', end: '2022', extra: { score: '8.5 CGPA' } }),
    mk({ type: 'work', text: 'Led a team of five analysts to cut reporting time by 40%.', org: 'NPCI', role: 'Analyst', start: '2023-01', end: 'present' }),
    mk({ type: 'work', text: 'Built an automated dashboard used by 30 managers.', org: 'NPCI', role: 'Analyst', start: '2023-01', end: 'present' }),
    mk({ type: 'internship', text: 'Cleaned and modelled 2M rows of payment data.', org: 'Acme Corp', role: 'Intern', start: '2022-05', end: '2022-08' }),
    mk({ type: 'project', text: 'Forecasting model with 91% accuracy on held-out data.', title: 'Demand forecasting', start: '2021', end: '2021' }),
    mk({ type: 'skill', title: 'Python', extra: { category: 'Programming' } }),
    mk({ type: 'language', title: 'English', extra: { level: 'Fluent' } }),
    mk({ type: 'award', text: 'Won the national case competition (1st of 300 teams).', org: 'IIM', start: '2022' })
  ];
}

function sampleCV(items, over) {
  return Object.assign(M.newCV({ name: 'Test CV', header: { name: 'Asha Rao', email: 'asha@example.com', phone: '+91 90000 00000', headline: '', address: '', dob: '', links: [], photo: '' } }), { selected: items.map(i => ({ itemId: i.id, versionId: null })) }, over || {});
}

// Headless browser harness (UI tests). Starts the dev server on a random port with a workspace holding the sample data.
async function bootUi(opts) {
  opts = opts || {};
  const { start } = require('../dev/server');
  const { chromium } = require('playwright');
  const dir = tmpDir('dossier-ui-');
  const s = await start({ workspace: dir, port: 0, secretsFile: path.join(dir, '.secrets.json') });
  const base = 'http://127.0.0.1:' + s.port;
  const api = async (n, a) => { const r = await (await fetch(base + '/api/' + n, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dossier': '1' }, body: JSON.stringify(a || {}) })).json(); if (!r.ok) throw new Error(n + ': ' + r.error); return r.data; };
  const items = opts.items === false ? [] : sampleItems();
  if (items.length) await api('items.saveMany', { items });
  let cv = null;
  if (opts.cv !== false && items.length) cv = await api('cv.create', { name: 'Test CV', selected: items.map(i => ({ itemId: i.id, versionId: null })) });
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: opts.viewport || { width: 1440, height: 900 } });
  pg.setDefaultTimeout(8000);
  const errors = [];
  pg.on('pageerror', e => errors.push('PAGE ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Blocked script|favicon/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
  await pg.goto(base + '/');
  await pg.waitForSelector('#tabs button');
  const wait = (ms) => pg.waitForTimeout(ms);
  return { pg, api, cv, items, base, errors, wait, dir, close: async () => { await browser.close(); await s.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

module.exports = { tmpDir, makeApi, sampleItems, sampleCV, bootUi };
