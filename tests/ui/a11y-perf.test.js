'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootUi } = require('../helpers');

test('dialogs: role, focus trap, Escape and focus return; menus: arrow keys; icon buttons have names', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  const unnamed = await pg.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title && b.dataset.tip).length);
  assert.equal(unnamed, 0);
  await pg.evaluate(() => { document.querySelector('#btnGear').focus(); UI.confirmBox('Delete it?', 'Really?', 'Delete', true); }); await wait(200);
  assert.equal(await pg.evaluate(() => document.querySelector('.modal').getAttribute('role')), 'dialog');
  assert.equal(await pg.evaluate(() => document.querySelector('.modal').getAttribute('aria-label')), 'Delete it?');
  for (let i = 0; i < 5; i++) { await pg.keyboard.press('Tab'); assert.ok(await pg.evaluate(() => !!document.activeElement.closest('.modal')), 'focus left the dialog'); }
  await pg.keyboard.press('Escape'); await wait(400);
  assert.equal(await pg.evaluate(() => document.activeElement && document.activeElement.id), 'btnGear');
  await pg.evaluate(() => UI.ctxMenu(300, 300, [{ label: 'One', fn() {} }, { label: 'Two', fn() {} }, { label: 'Three', fn() {} }])); await wait(150);
  assert.equal(await pg.evaluate(() => document.querySelector('.ctx').getAttribute('role')), 'menu');
  await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowDown');
  assert.equal(await pg.evaluate(() => document.activeElement.innerText.trim()), 'Two');
  await pg.keyboard.press('Escape'); await wait(100);
  assert.deepEqual(errors, []);
});

test('start-up loads only the small logo file; the other logo styles load when needed, and About shows the version', async (t) => {
  const ui = await bootUi({ items: false }); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  assert.equal(await pg.evaluate(() => Object.keys(window.LOGOS).join(',')), 'paper');
  await pg.evaluate(() => App.go('settings')); await wait(1500);
  assert.ok(await pg.evaluate(() => Object.keys(window.LOGOS).length) >= 9);
  assert.equal(await pg.evaluate(() => [...document.querySelectorAll('.logoopt img')].filter(i => !i.src.startsWith('data:')).length), 0);
  assert.match(await pg.evaluate(() => document.body.innerText), /About Dossier[\s\S]*Version \d+\.\d+\.\d+/i);
  assert.deepEqual(errors, []);
});
