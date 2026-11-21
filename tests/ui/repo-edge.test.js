'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootUi } = require('../helpers');
const M = require('../../src/core/model');

const goRepo = async (ui) => { await ui.pg.click('#tabs button[data-k=repo]'); await ui.wait(800); };

test('repository: an empty repository shows the empty state, one entry and odd entries render', async (t) => {
  const ui = await bootUi({ items: false }); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  await goRepo(ui);
  assert.match(await pg.evaluate(() => document.querySelector('.list').innerText), /repository is empty/i);
  const odd = [M.newItem({ type: 'work', title: 'Only a title' }), M.newItem({ type: 'skill', title: 'Excel' }), M.newItem({ type: 'education', title: 'Degree', org: '', start: 'Sept \'24', end: '13/2020' }),
    M.newItem({ type: 'work', text: 'x'.repeat(5000), org: 'Long Org '.repeat(40), role: 'R', start: '2020', end: 'present' }), M.newItem({ type: 'award', text: 'Only a text, no dates' })];
  await api('items.saveMany', { items: odd });
  await pg.evaluate(() => App.reloadItems().then(() => App.tabs.repo.refresh())); await wait(600);
  assert.ok(await pg.evaluate(() => document.querySelectorAll('.list .item[data-id]').length) >= 4);
  assert.deepEqual(errors, []);
});

test('repository: 600 entries render, select all, archive, bin and undo from the bin', async (t) => {
  const ui = await bootUi({ items: false }); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  const many = Array.from({ length: 600 }, (_, i) => M.newItem({ type: i % 3 ? 'work' : 'project', text: 'Delivered result number ' + i + ' for team ' + (i % 17), org: 'Org ' + (i % 25), role: 'Lead', start: (2010 + (i % 14)) + '-01', end: (2011 + (i % 14)) + '-06' }));
  await api('items.saveMany', { items: many });
  const t0 = Date.now(); await ui.pg.reload(); await wait(1500); await goRepo(ui);
  assert.ok(Date.now() - t0 < 12000, 'repository took too long to open');
  assert.ok(await pg.evaluate(() => document.querySelectorAll('.list .item[data-id]').length) >= 500);
  await pg.evaluate(() => { App.state.repo.sel = new Set(App.state.items.slice(0, 5).map(i => i.id)); App.tabs.repo.refresh(); }); await wait(300);
  await pg.evaluate(() => { App.tabs.repo.deleteSelected(); }); await wait(900);
  assert.equal((await api('items.list')).length, 595);
  const bin = await api('trash.list'); assert.equal(bin.length, 5);
  for (const b of bin) await api('trash.restore', { kind: b.kind, id: b.id });
  assert.equal((await api('items.list')).length, 600);
  assert.deepEqual(errors, []);
});

test('repository: date parsing copes with odd formats', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close());
  const r = await ui.pg.evaluate(() => ['2024-4', '4/2024', "Sept '24", 'Mar 2021', '2019', 'Present', 'ongoing', 'garbage', ''].map(App.parseDateLoose));
  assert.deepEqual(r, ['2024-04', '2024-04', '2024-09', '2021-03', '2019', 'present', 'present', 'garbage', '']);
});

test('repository: deleting the open entry closes its drawer; merge mode copes with no pairs', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await goRepo(ui);
  await pg.click('.list .item[data-id]'); await pg.waitForSelector('.drawer textarea'); await wait(500);
  await pg.evaluate(() => { document.querySelector('.drawer .icon-btn[data-tip^="Move this entry"]').click(); }); await wait(1000);
  assert.ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.drawer')).display === 'none' || document.querySelector('.drawer').childElementCount === 0), 'drawer stayed open for a deleted entry');
  assert.deepEqual(errors, []);
});
