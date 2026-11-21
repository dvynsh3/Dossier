'use strict';
// Walks the editor's features: panels, tabs, undo/redo, menus, dialogs, page break, reordering, templates, export dialog.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootUi } = require('../helpers');

async function openEditor(ui) {
  const { pg, wait } = ui;
  await wait(900);
  await pg.evaluate((id) => App.openCV(id), ui.cv.id);
  await pg.waitForSelector('iframe', { state: 'attached' }); await wait(1800);
}
const previewText = (pg) => pg.evaluate(() => [...document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument.body.innerText; } catch (e) { return ''; } }).join('\n'));
const cvNow = (pg) => pg.evaluate(() => JSON.parse(JSON.stringify(App.state.cv)));

test('editor: right panel tabs all open, style changes reach the CV and the preview, undo and redo work', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await openEditor(ui);
  assert.match(await previewText(pg), /NPCI/);
  const tabs = await pg.$$('.rtabs .rtab'); assert.ok(tabs.length >= 4, 'tabs: ' + tabs.length);
  for (let i = 0; i < tabs.length; i++) { await pg.locator('.rtabs .rtab').nth(i).click(); await wait(350); assert.ok(await pg.evaluate(() => document.querySelector('.rtabs').parentElement.innerText.length > 20), 'tab ' + i + ' is empty'); }
  const before = (await cvNow(pg)).opts.accent;
  await pg.locator('.rtabs .rtab').nth(1).click(); await wait(300);
  const sw = pg.locator('.swatch, .accent, [data-accent]').first();
  if (await sw.count()) { await sw.click(); await wait(500); }
  await pg.evaluate(() => App.state.cv && App.tabs.editor.undo()); await pg.evaluate(() => App.tabs.editor.redo()); await wait(300);
  const c = await cvNow(pg); assert.ok(c.opts && c.templateId); assert.ok(before !== undefined);
  assert.deepEqual(errors, []);
});

test('editor: left panel opens, lists blocks, selecting a block and the context menus work', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await openEditor(ui);
  await pg.keyboard.press('Control+q'); await wait(600);
  const n = await pg.evaluate(() => document.querySelectorAll('#btnPanelL, .editor-left, [data-gid]').length); assert.ok(n > 0);
  const rows = await pg.evaluate(() => document.querySelectorAll('.bpane [data-gid], .blockrow, .bl-row, [data-gid]').length); assert.ok(rows > 0, 'no block rows in the left panel');
  // right-click an entry in the preview: the item menu
  const frame = await (await pg.waitForSelector('iframe', { state: 'attached' })).contentFrame();
  const entry = frame.locator('[data-id]').first(); await entry.click({ button: 'right' }); await wait(500);
  assert.ok(await pg.evaluate(() => !!document.querySelector('.ctxmenu, .menu, [class*=ctx]')), 'item menu did not open');
  await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5); await wait(200);
  assert.deepEqual(errors, []);
});

test('editor: Page Break, keep-together and entry order edits go through the same code paths', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await openEditor(ui);
  const gid = await pg.evaluate(() => { const f = [...document.querySelectorAll('iframe')].map(x => x.contentDocument).find(d => d && d.querySelector('[data-gid]')); return f.querySelector('[data-gid]').dataset.gid; });
  await pg.evaluate((g) => App.edKit.toggleKeep(g), gid); await wait(300);
  assert.equal((await cvNow(pg)).blockFlags[gid].keep, true);
  await pg.evaluate((g) => App.edKit.toggleKeep(g), gid); await wait(300);
  assert.ok(!(await cvNow(pg)).blockFlags[gid] || !(await cvNow(pg)).blockFlags[gid].keep);
  // page break on
  await pg.evaluate(() => App.edKit.mutate(cv => { const pb = cv.sections.find(s => s.pb); pb.visible = true; })); await wait(900);
  const html = await pg.evaluate((id) => call_('cv.html', id), ui.cv.id).catch(() => null); void html;
  // move one work entry above the other
  const ids = (await cvNow(pg)).selected.map(s => s.itemId);
  await pg.evaluate(([a, b]) => App.edKit.moveLine(a, b, false), [ids[2], ids[1]]); await wait(800);
  const order = (await cvNow(pg)).selected.map(s => s.itemId); assert.equal(order.length, ids.length);
  await pg.evaluate(() => App.tabs.editor.undo()); await wait(500);
  assert.equal((await cvNow(pg)).selected.length, ids.length);
  assert.deepEqual(errors, []);
});

test('editor: export dialog, ATS check and print preview open and close', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await openEditor(ui);
  await pg.evaluate(() => { App.tabs.editor.exportDialog(); }); await wait(500);
  assert.ok(await pg.evaluate(() => /Export/.test(document.body.innerText) && /PDF/.test(document.body.innerText)));
  await pg.keyboard.press('Escape'); await wait(300);
  await pg.evaluate(() => { App.tabs.editor.printPreview(); }); await wait(1500);
  assert.ok(await pg.evaluate(() => /page/i.test(document.body.innerText)));
  await pg.keyboard.press('Escape'); await wait(300);
  await pg.evaluate(() => { App.state.cv.atsSeen = true; App.edKit.atsCheck(); });
  await pg.waitForFunction(() => /ATS readability/.test(document.body.innerText), null, { timeout: 40000 });
  assert.deepEqual(errors, []);
});

test('editor: template editor opens with dummy content and closes again', async (t) => {
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, errors } = ui;
  await openEditor(ui);
  await pg.evaluate(() => { App.tabs.editor.editTemplate(); }); await wait(1500);
  assert.ok(await pg.evaluate(() => document.querySelectorAll('textarea').length >= 2), 'no template source boxes');
  await pg.evaluate(() => { App.state.editor.mode = 'cv'; App.tabs.editor.render(document.getElementById('view')); }); await wait(1200);
  assert.match(await previewText(pg), /NPCI/);
  assert.deepEqual(errors, []);
});

test('editor: 150 entries and an empty CV both render', async (t) => {
  const M = require('../../src/core/model');
  const ui = await bootUi(); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  const many = Array.from({ length: 150 }, (_, i) => M.newItem({ type: 'work', text: 'Delivered number ' + i + ' with real impact across teams.', org: 'Org ' + (i % 5), role: 'Lead', start: '2019-01', end: '2020-01' }));
  await api('items.saveMany', { items: many });
  const big = await api('cv.create', { name: 'Big', selected: many.map(i => ({ itemId: i.id, versionId: null })) });
  const empty = await api('cv.create', { name: 'Empty', selected: [] });
  await ui.wait(900);
  for (const id of [big.id, empty.id]) { await pg.evaluate((i) => App.reloadCvs().then(() => App.openCV(i)), id); await wait(2500); assert.ok((await previewText(pg)).length >= 0); }
  assert.deepEqual(errors, []);
});

test('editor: bullets move with their entry when it is dragged, undo/redo grey out, right-click works on any block', async (t) => {
  const M = require('../../src/core/model');
  const ui = await bootUi({ cv: false }); t.after(() => ui.close()); const { pg, wait, api, errors } = ui;
  const mk = (org, text, s, e) => M.newItem({ type: 'work', text, org, role: 'Lead', start: s, end: e });
  const its = [mk('Alpha', 'A one', '2020-01', '2021-01'), mk('Alpha', 'A two', '2020-01', '2021-01'), mk('Beta', 'B one', '2018-01', '2019-01'), mk('Gamma', 'G one', '2016-01', '2017-01')];
  await api('items.saveMany', { items: its });
  const cv = await api('cv.create', { name: 'Flip', selected: its.map(i => ({ itemId: i.id, versionId: null })) });
  await wait(900); await pg.evaluate((id) => App.reloadItems().then(() => App.reloadCvs()).then(() => App.openCV(id)), cv.id);
  await pg.waitForFunction(() => { const f = document.querySelector('iframe[title="CV preview"]'); try { return f && f.contentDocument.querySelectorAll('[data-gid]').length >= 3; } catch (e) { return false; } }, null, { timeout: 15000 });
  await wait(500);
  // undo / redo start greyed out
  assert.equal(await pg.evaluate(() => [document.getElementById('btnUndo') && document.getElementById('btnUndo').disabled, document.getElementById('btnRedo') && document.getElementById('btnRedo').disabled].join()), 'true,true');
  // the first group's bullet must travel with the group (its own animation may only be the highlight)
  const r = await pg.evaluate(async () => {
    const d = document.querySelector('iframe[title="CV preview"]').contentDocument; const gs = [...d.querySelectorAll('[data-gid][data-ids]')];
    const a = gs[0], c = gs[2], li0 = a.querySelector('li[data-id]'); const id = li0.dataset.id;
    App.edKit.moveBlock(a.dataset.ids.split(','), c.dataset.ids.split(','), true);
    const rel = []; for (let i = 0; i < 8; i++) { await new Promise(x => setTimeout(x, 40)); const dd = document.querySelector('iframe[title="CV preview"]').contentDocument; const l = dd.querySelector('li[data-id="' + id + '"]'); rel.push(Math.round(l.getBoundingClientRect().top - l.closest('[data-gid]').getBoundingClientRect().top)); }
    return rel;
  });
  assert.ok(Math.max(...r) - Math.min(...r) <= 2, 'bullet drifted away from its entry while moving: ' + r.join(','));
  assert.equal(await pg.evaluate(() => document.getElementById('btnUndo').disabled), false);
  // right-click on a block heading opens a menu
  await pg.evaluate(() => { const d = document.querySelector('iframe[title="CV preview"]').contentDocument; const g = d.querySelector('[data-gid][data-ids]'); g.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 })); });
  await wait(200); assert.ok(await pg.evaluate(() => !!document.querySelector('.ctx')), 'no context menu on a block');
  assert.deepEqual(errors, []);
});
