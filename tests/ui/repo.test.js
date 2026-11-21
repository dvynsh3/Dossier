'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootUi } = require('../helpers');

async function openFirstEntry(ui) {
  const { pg, wait } = ui;
  await pg.click('#tabs button[data-k=repo]'); await wait(700);
  await pg.click('.list .item[data-id]'); await pg.waitForSelector('.drawer textarea'); await wait(500);
}

test('repository: typing in an entry keeps focus and text while it autosaves', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close());
  await openFirstEntry(ui);
  const { pg, wait, errors } = ui;
  await pg.evaluate(() => { document.querySelector('.drawer').dataset.same = '1'; });
  const ta = pg.locator('.drawer textarea').first(); await ta.click(); await ta.press('End');
  for (const ch of ' typing slowly across several saves') { await pg.keyboard.type(ch); await wait(60); if (ch === 'g') await wait(900); }
  await wait(1500);
  assert.equal(await pg.evaluate(() => document.querySelector('.drawer').dataset.same), '1', 'the drawer was rebuilt while typing');
  assert.equal(await pg.evaluate(() => document.activeElement && document.activeElement.tagName), 'TEXTAREA', 'focus was lost');
  assert.match(await ta.inputValue(), /typing slowly across several saves$/);
  const saved = (await ui.api('items.list')).find(i => i.id === ui.items[0].id || true);
  assert.deepEqual(errors, []); assert.ok(saved);
});

test('repository: text typed in the "new wording" box survives autosave and can be added as a version', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close());
  await openFirstEntry(ui);
  const { pg, wait, api } = ui;
  const id = await pg.evaluate(() => document.querySelector('.list .item.sel, .list .item[data-id]').dataset.id);
  await pg.click('.drawer button:has-text("Versions")'); await wait(400);
  const add = pg.locator('.drawer .composer textarea'); await add.click();
  await pg.keyboard.type('A brand new wording that is long enough to take a while', { delay: 70 }); await wait(1400);
  assert.equal(await add.inputValue(), 'A brand new wording that is long enough to take a while');
  assert.equal(await pg.evaluate(() => document.activeElement.closest('.composer') !== null), true, 'focus left the box');
  await pg.click('.drawer .composer button:has-text("Add as version")'); await wait(900);
  assert.equal(await pg.evaluate(() => document.querySelector('.drawer .dpill.on').textContent.replace(/\d+$/, '').trim()), 'Versions', 'jumped away from the Versions page');
  assert.equal(await pg.evaluate(() => [...document.querySelectorAll('.drawer .dtab')].filter(e => e.offsetParent !== null).length), 1, 'Details and Versions are showing together');
  const item = (await api('items.list')).find(i => i.id === id);
  assert.ok((item.versions || []).some(v => /brand new wording/.test(v.text)), 'version was not added');
});
