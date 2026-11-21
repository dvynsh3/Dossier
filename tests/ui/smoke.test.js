'use strict';
// Walks the real renderer in headless Chromium and fails on any page error.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootUi } = require('../helpers');

const TABS = ['browse', 'repo', 'editor', 'review', 'import'];

for (const scenario of [{ name: 'with data', opts: {} }, { name: 'empty workspace', opts: { items: false, cv: false } }]) {
  test('UI smoke: ' + scenario.name, async (t) => {
    const ui = await bootUi(scenario.opts);
    t.after(() => ui.close());
    const { pg, errors, wait } = ui;
    await wait(1200);
    for (const k of TABS) { await pg.click('#tabs button[data-k=' + k + ']'); await wait(350); }
    await pg.click('#btnGear'); await wait(350);
    for (const k of TABS) { await pg.click('#tabs button[data-k=' + k + ']'); await wait(200); }
    assert.deepEqual(errors, []);
  });
}

test('UI: editor renders the CV in the preview frame and Ctrl+Tab cycles tabs', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close());
  const { pg, errors, wait } = ui;
  await wait(1200);
  await pg.evaluate((id) => App.openCV(id), ui.cv.id);
  await pg.waitForSelector('iframe', { state: 'attached' });
  await wait(1500);
  const text = await pg.evaluate(() => [...document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument.body.innerText; } catch (e) { return ''; } }).join('\n'));
  assert.match(text, /Asha Rao|NPCI/);
  const before = await pg.evaluate(() => document.querySelector('#tabs .on, #tabs .active, #tabs [aria-selected=true]')?.dataset.k);
  await pg.keyboard.press('Control+Tab'); await wait(500);
  const after = await pg.evaluate(() => document.querySelector('#tabs .on, #tabs .active, #tabs [aria-selected=true]')?.dataset.k);
  assert.notEqual(before, after);
  assert.deepEqual(errors, []);
});

test('UI: a hostile entry text does not run script in the preview or the repository', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close());
  const { pg, api, errors, wait } = ui;
  const M = require('../../src/core/model');
  const evil = M.newItem({ type: 'work', text: '<img src=x onerror="window.__pwn=1"><script>window.__pwn=1</script>', org: '"><svg onload="window.__pwn=1">', role: 'x' });
  await api('items.saveMany', { items: [evil] });
  await pg.reload(); await pg.waitForSelector('#tabs button'); await wait(1000);
  await pg.click('#tabs button[data-k=repo]'); await wait(700);
  assert.equal(await pg.evaluate(() => window.__pwn), undefined);
  assert.equal(errors.filter(e => /__pwn/.test(e)).length, 0);
});

test('UI: the Review tab has the same top-bar buttons as the editor (Edit instead of Review)', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close());
  const { pg, wait, errors } = ui;
  await wait(1000);
  await pg.evaluate((id) => App.go('review', { cvId: id }), ui.cv.id); await wait(1200);
  const tips = await pg.evaluate(() => [...document.querySelectorAll('#topActions > *')].map(n => (n.dataset.tip || n.title || n.textContent || '').trim()));
  assert.equal(tips.length, 5, tips.join(' | '));
  assert.match(tips.join(' | '), /Close.*Print preview.*Edit.*Delete.*Export/i);
  await pg.evaluate((id) => App.openCV(id), ui.cv.id); await wait(1200);
  assert.equal((await pg.evaluate(() => document.querySelectorAll('#topActions > *').length)), 5);
  assert.deepEqual(errors, []);
});
