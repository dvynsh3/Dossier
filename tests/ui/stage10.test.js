'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootUi } = require('../helpers');

const go = async (ui, tab, arg) => { await ui.pg.evaluate(([t, a]) => App.go(t, a), [tab, arg]); await ui.wait(800); };
const drag = async (pg, fromSel, toSel, hold) => {
  const a = await pg.locator(fromSel).first().boundingBox(), b = await pg.locator(toSel).first().boundingBox();
  await pg.mouse.move(a.x + 40, a.y + 40); await pg.mouse.down(); await pg.mouse.move(a.x + 60, a.y + 60, { steps: 4 });
  await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await new Promise(r => setTimeout(r, 120));
  const state = await pg.evaluate(() => ({ nodrop: document.body.classList.contains('nodrop') }));
  if (hold) return state; await pg.mouse.up(); return state;
};

test('home: header buttons on every view; Latest/All refuse a drop; Archive is its own place; Bin shows deleted CVs dimmed', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  await go(ui, 'browse'); await pg.evaluate(() => App.tabs.browse.cycle()); await wait(600);   // CVs view
  assert.equal(await pg.evaluate(() => App.tabs.browse.topActions().length), 3);
  await pg.evaluate(() => App.tabs.browse.cycle()); await wait(600);   // Applications view
  assert.equal(await pg.evaluate(() => App.tabs.browse.topActions().length), 3);
  await pg.evaluate(() => App.tabs.browse.cycle()); await wait(500); await pg.evaluate(() => App.tabs.browse.cycle()); await wait(600);
  // drag over Latest and All: no-drop; over Archive: allowed
  assert.equal((await drag(ui.pg, '.cvcard:not(.newtile)', '.prof[data-pid="__latest"]', true)).nodrop, true); await pg.mouse.up(); await wait(200);
  assert.equal((await drag(ui.pg, '.cvcard:not(.newtile)', '.prof[data-pid="__all"]', true)).nodrop, true); await pg.mouse.up(); await wait(200);
  // archive by dropping, then drop it back out onto All
  await drag(pg, '.cvcard:not(.newtile)', '.prof[data-pid="__archive"]'); await wait(700);
  assert.equal((await api('cv.list')).filter(c => c.archived).length, 1);
  await pg.click('.prof[data-pid="__archive"]'); await wait(400);
  assert.equal((await drag(pg, '.cvcard:not(.newtile)', '.prof[data-pid="__all"]', true)).nodrop, false); await pg.mouse.up(); await wait(700);
  assert.equal((await api('cv.list')).filter(c => c.archived).length, 0);
  await pg.click('.prof[data-pid="__all"]'); await wait(400);
  // delete through the Bin tile, see it dimmed in the Bin, restore it
  await drag(pg, '.cvcard:not(.newtile)', '.prof[data-pid="__bin"]'); await wait(700);
  assert.equal((await api('cv.list')).length, 0);
  await pg.click('.prof[data-pid="__bin"]'); await wait(900);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.cvcard.binned').length), 1);
  await pg.hover('.cvcard.binned'); await pg.click('.cvcard.binned button[data-tip="Restore"]'); await wait(800);
  assert.equal((await api('cv.list')).length, 1);
  assert.deepEqual(errors, []);
});

test('applications: CV, Cover and JD columns do not sort and look alike; saving a cover letter closes it', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await go(ui, 'browse'); await pg.evaluate(() => App.tabs.browse.addApplication()); await wait(900);
  for (const c of ['CV', 'Cover', 'JD']) assert.equal(await pg.evaluate((c) => [...document.querySelectorAll('.apptbl th')].find(t => t.textContent.trim() === c).classList.contains('sortable'), c), false);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.apptbl tbody tr:first-child .jdbtn').length), 3);
  await pg.click('.apptbl tbody tr:first-child button[data-tip="Cover letter"]'); await wait(500);
  await pg.fill('.letterwrap textarea', 'Dear team'); await pg.click('.modal .actions button:has-text("Save")'); await wait(500);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.modal').length), 0);
  assert.deepEqual(errors, []);
});

test('repository: with the details drawer open the toolbar shrinks; Personal closes the drawer', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await go(ui, 'repo'); await pg.click('.list .item >> nth=0'); await wait(700);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.dopen')), true);
  assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('.cycbtn')).display !== 'none'), true);
  assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('.grpfull')).display), 'none');
  const before = await pg.evaluate(() => document.querySelector('.cycbtn').innerText.trim()); await pg.click('.cycbtn'); await wait(200);
  assert.notEqual(await pg.evaluate(() => document.querySelector('.cycbtn').innerText.trim()), before);
  await pg.click('.allbtn'); await wait(200); assert.equal(await pg.evaluate(() => document.querySelectorAll('.ctx').length), 1); await pg.keyboard.press('Escape');
  await pg.click('.seg button:has(.shortlbl)'); await wait(700);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.dopen')), false);
  assert.deepEqual(errors, []);
});

test('export dialog: options left aligned, no JSON Resume, folder note first, Word note, working button', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await pg.evaluate((id) => App.openCV(id), ui.cv.id); await wait(1200);
  await pg.evaluate(() => { App.tabs.editor.exportDialog(); }); await wait(400);
  const info = await pg.evaluate(() => { const m = document.querySelector('.modal'); const b = m.querySelector('.fmtbtn'); return { n: m.querySelectorAll('.fmtbtn').length, align: getComputedStyle(b).alignItems, txt: m.innerText, firstP: m.querySelector('p').innerText, work: !!m.querySelector('.actions .working') }; });
  assert.equal(info.n, 5); assert.equal(info.align, 'flex-start'); assert.ok(!/JSON Resume/i.test(info.txt));
  assert.match(info.firstP, /exports folder/); assert.match(info.txt, /single column/i); assert.equal(info.work, true);
  await pg.keyboard.press('Escape'); await wait(300);
  assert.deepEqual(errors, []);
});

test('editor: scroll position survives a tab switch; arrow keys walk the right-click menu instead of scrolling', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await pg.evaluate((id) => App.openCV(id), ui.cv.id); await wait(1500);
  await pg.evaluate(() => { const w = document.querySelector('.center .pwrap, .center [class*=wrap]') || document.querySelector('.center'); const sc = [...document.querySelectorAll('.center *')].find(e => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== 'visible'); window.__sc = sc; if (sc) sc.scrollTop = 120; });
  const had = await pg.evaluate(() => window.__sc ? window.__sc.scrollTop : -1);
  await go(ui, 'repo'); await go(ui, 'editor'); await wait(600);
  const now = await pg.evaluate(() => { const sc = [...document.querySelectorAll('.center *')].find(e => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== 'visible'); return sc ? sc.scrollTop : -1; });
  if (had > 0) assert.ok(Math.abs(now - had) < 4, 'scroll ' + had + ' -> ' + now);
  // menu opened from inside the preview
  await pg.evaluate(() => { const f = document.querySelector('iframe[title="CV preview"]'); const d = f.contentDocument; const el = d.querySelector('[data-id]') || d.body; el.dispatchEvent(new d.defaultView.MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 60, button: 2 })); }); await wait(300);
  if (await pg.evaluate(() => !!document.querySelector('.ctx'))) {
    await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowDown');
    assert.equal(await pg.evaluate(() => !!document.activeElement.closest('.ctx')), true);
  }
  assert.deepEqual(errors, []);
});
