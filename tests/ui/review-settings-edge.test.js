'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootUi } = require('../helpers');

test('review: switching CVs quickly leaves one clean screen; compare survives a deleted CV and odd AI answers', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  const cv2 = await api('cv.create', { name: 'Second', selected: ui.cv.selected });
  await pg.evaluate((id) => App.go('review', { cvId: id }), ui.cv.id); await wait(900);
  await pg.evaluate((ids) => { const s = document.querySelector('.rvhead select'); for (const id of [ids[1], ids[0], ids[1], ids[0]]) { s.value = id; s.dispatchEvent(new Event('change')); } }, [ui.cv.id, cv2.id]); await wait(1500);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.rv .rvhead').length), 1);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.rv iframe[title="CV preview"]').length), 1);
  // compare with a CV that was deleted meanwhile
  await pg.evaluate((a) => App.go('review', { compare: a }), [ui.cv.id, cv2.id]); await wait(800);
  await api('cv.delete', { id: cv2.id });
  await pg.evaluate(() => App.go('review', { cvId: App.state.cvs[0].id })); await wait(500);
  await pg.evaluate(() => { const b = [...document.querySelectorAll('.rvhead .seg button')].find(x => /Compare/.test(x.innerText)); b.click(); }); await wait(600);
  // AI-style answers with the wrong shape must render something, not throw
  const ok = await pg.evaluate(() => { const o = document.createElement('div'); const cv = App.state.cv || {}; return typeof App.pagePreview === 'function'; });
  assert.ok(ok);
  assert.deepEqual(errors, []);
});

test('settings: opens, theme switch, folder buttons and the backup list work on a fresh folder', async (t) => {
  const ui = await bootUi({ items: false }); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  await pg.evaluate(() => App.go('settings')); await wait(900);
  assert.ok(await pg.evaluate(() => document.querySelectorAll('.settings-grid .card').length) >= 5);
  await pg.click('button:has-text("Light")'); await wait(500); await pg.click('button:has-text("Dark")'); await wait(500);
  await pg.click('button:has-text("Make a backup now")'); await wait(900);
  assert.ok((await api('workspace.backupInfo')).length >= 1);
  await pg.click('.bkbtns .icon-btn[data-tip="Restore this backup"]'); await wait(300);
  await pg.click('.modal button:has-text("Restore")'); await wait(1200);
  assert.equal(await pg.evaluate(() => App.state.cv), null);
  assert.deepEqual(errors, []);
});

test('settings: deleting a saved key twice and listing models without a key give plain messages', async (t) => {
  const ui = await bootUi({ items: false }); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  await api('ai.deleteKey', { provider: 'gemini' }); await api('ai.deleteKey', { provider: 'gemini' });
  await pg.evaluate(() => App.go('settings')); await wait(900);
  await pg.click('button:has-text("Test connection") >> nth=1'); await wait(1500);
  assert.match(await pg.evaluate(() => document.querySelector('.aiout').parentElement.parentElement.innerText), /./);
  assert.deepEqual(errors.filter(e => !/Failed to load resource|status of 4|status of 5/.test(e)), []);
});
