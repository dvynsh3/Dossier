'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { bootUi } = require('../helpers');

const home = async (ui) => { await ui.pg.evaluate(() => App.go('browse')); await ui.wait(700); };

test('home: the Applications view survives odd and missing data', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, api, errors, dir } = ui;
  // a saved list with junk entries, a missing CV, no dates and an unknown status
  await api('applications.save', { list: [null, 5, { id: 'a1', company: '', role: '', status: 'Strange', cvId: 'gone', jds: null, letter: { body: '' } }, { id: 'a2', company: 'Acme', applied: '', followUp: '2000-01-01', status: 'Applied', cvId: ui.cv.id, jds: [], letter: null }] });
  assert.equal((await api('applications.list')).length, 2);
  await home(ui); await pg.evaluate(() => App.tabs.browse.addApplication()); await wait(900);
  assert.ok(await pg.evaluate(() => document.querySelectorAll('.apptbl tbody tr').length) >= 3);
  for (const col of ['CV', 'Cover', 'JD', 'Status', 'Applied on', 'Company']) { await pg.click('.apptbl th:has-text("' + col + '")'); await wait(80); await pg.click('.apptbl th:has-text("' + col + '")'); await wait(80); }
  assert.deepEqual(errors, []);
});

test('home: edits typed just before leaving the tab are not lost', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  await home(ui); await pg.evaluate(() => App.tabs.browse.addApplication()); await wait(900);
  await pg.fill('.apptbl tbody tr:first-child td:first-child input', 'Quick Corp');
  await pg.evaluate(() => App.go('repo')); await wait(300);   // well inside the 400 ms pause
  await pg.evaluate(() => App.go('browse')); await wait(800);
  assert.ok((await api('applications.list')).some(a => a.company === 'Quick Corp'));
  assert.deepEqual(errors, []);
});

test('home: a corrupt applications file reads as an empty list, and bad lists are refused', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { api, dir } = ui;
  fs.writeFileSync(path.join(dir, 'applications.json'), '{"not":"a list"}');
  assert.deepEqual(await api('applications.list'), []);
  fs.writeFileSync(path.join(dir, 'applications.json'), '[1,"x",{"id":"k"}]');
  assert.deepEqual(await api('applications.list'), [{ id: 'k' }]);
  await assert.rejects(() => api('applications.save', { list: { id: 1 } }));
});

test('home: job description and cover letter with nothing filled in do not crash', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await home(ui); await pg.evaluate(() => App.tabs.browse.addApplication()); await wait(900);
  await pg.evaluate(() => { document.querySelector('.apptbl tbody tr:first-child button[data-tip="Cover letter"]').click(); }); await wait(600);
  await pg.click('.letterwrap .sidebtn:has-text("JD")'); await wait(200);
  await pg.click('.letterwrap .sidebtn:has-text("CV")'); await wait(200);
  await pg.click('button:has-text("Export PDF")'); await wait(400);   // empty letter: a hint, no crash
  assert.match(await pg.evaluate(() => document.body.innerText), /Write the letter first/);
  await pg.click('button:has-text("Close")'); await wait(300);
  assert.deepEqual(errors, []);
});

test('home: a CV card whose CV vanished shows a placeholder, deleting a CV used by an application is fine', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  await api('applications.save', { list: [{ id: 'z', company: 'Gone Ltd', role: 'X', status: 'Applied', cvId: ui.cv.id, jds: [], letter: null }] });
  await api('cv.delete', { id: ui.cv.id });
  await home(ui); await pg.evaluate(() => App.tabs.browse.addApplication()); await wait(900);
  assert.match(await pg.evaluate(() => document.querySelector('.apptbl').innerText), /Gone Ltd|Applied/);
  assert.deepEqual(errors, []);
});
