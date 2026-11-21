'use strict';
(function () {
  const { h, $, clear, call, tryCall, toast, modal, confirmBox, promptBox, ctxMenu } = UI;
  const M = window.CVModel, TP = window.CVTemplates;
  const S = App.state;
  const T = App.tabs.browse = {};
  T.cycle = () => swapView(view === 'overview' ? 'cvs' : view === 'cvs' ? 'apps' : 'overview');
  // the page content fades out, the new view slides up into place
  let swapping = false;
  async function swapView(v, page) {
    page = page || $('.page'); if (!page || swapping || v === view) return; swapping = true;
    try { if (page.animate) await page.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 110, easing: 'ease-in', fill: 'forwards' }).finished; view = v; draw(page); if (App.renderTopActions) App.renderTopActions(); page.getAnimations().forEach(a => a.cancel()); if (page.animate) page.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
    finally { swapping = false; }
  }
  T.topActions = () => S.root ? [
    { icon: 'folder', label: 'New entry', tip: 'Add an entry to your repository', fn: () => App.newEntry() },
    { icon: 'grid', label: 'New CV', tip: 'Build a new CV from your repository', fn: () => App.newCV() },
    { icon: 'apps', label: 'New application', tip: 'Log a job application', fn: () => T.addApplication() }] : [];
  const ICONS = ['★', '💼', '🎓', '🔬', '📊', '💻', '🎨', '🏥', '⚖️', '🌍', '🚀', '📝'];
  let filter = 'all', q = '', sort = 'updated', view = 'overview', customFull = [];
  const binMap = new Map();   // deleted CVs shown in the Bin view (id -> full record)
  const A = () => App.apps;
  const pdfCache = {}; // cvId -> { updated, file }

  T.render = async function (v) {
    await App.reloadCvs(); await App.reloadSettings();
    await A().load();
    customFull = []; for (const t of S.templates.filter(t => t.custom)) { const f = await tryCall('templates.get', { id: t.id }, true); if (f) customFull.push(f); }
    const page = h('div', { class: 'page' }); clear(v).append(page);
    draw(page);
  };
  function draw(page) {
    page = page || $('.page'); clear(page); if (App.renderTopActions) setTimeout(() => App.renderTopActions(), 0);
    page.append(h('div', { class: 'pagehead' }, h('div', { style: { flex: 1 } }, h('h1', null, view === 'overview' ? 'Overview' : view === 'cvs' ? 'Your CVs' : 'Applications'), h('p', null, view === 'overview' ? 'Your latest applications and the CVs you worked on most recently.' : view === 'cvs' ? S.cvs.length + ' CV' + (S.cvs.length === 1 ? '' : 's') + ' in your working folder. Click one to open it.' : 'Each application keeps its CV, cover letter, job description and details together.')),
      UI.seg([['overview', 'Overview', 'home'], ['cvs', 'CVs', 'grid'], ['apps', 'Applications', 'apps']], view, (v) => swapView(v, page), { hero: true })));
    if (view === 'overview') return drawOverview(page);
    if (view === 'apps') return A().draw(page);
    const profs = S.settings.profiles || [];
    const live = S.cvs.filter(c => !c.archived);
    const count = (id) => id === 'all' ? live.length : id === 'latest' ? latestIds().size : id === 'archive' ? S.cvs.filter(c => c.archived).length : live.filter(c => (c.profiles || []).includes(id)).length;
    const tile = (p, builtin) => h('div', { class: 'prof' + (filter === p.id ? ' on' : ''), 'data-pid': p.id === 'archive' ? '__archive' : p.id === 'all' ? '__all' : p.id === 'latest' ? '__latest' : p.id, title: builtin ? (p.id === 'latest' ? 'The CVs you edited most recently' : p.id === 'archive' ? 'Drop a CV here to archive it' : 'Show every CV. Drop an archived CV here to bring it back') : 'Right-click to rename or delete. Drop a CV here to add it.', onclick: () => { filter = p.id; draw(page); }, oncontextmenu: (e) => { if (builtin) return; e.preventDefault(); ctxMenu(e.clientX, e.clientY, [{ label: 'Rename', fn: () => profileDialog(p, page) }, { label: 'Delete category', fn: () => delProfile(p) }]); } }, h('div', { class: 'ic' }, p.icon), h('div', null, p.name), h('div', { class: 'muted small' }, count(p.id) + ' CVs'));
    const bar = h('div', { class: 'profbar' }, tile({ id: 'all', name: 'All', icon: '▦' }, true), tile({ id: 'latest', name: 'Latest', icon: '🕒' }, true), profs.map(p => tile(p, false)), tile({ id: 'archive', name: 'Archive', icon: '🗄' }, true),
      h('div', { class: 'prof', onclick: () => profileDialog(null, page), style: { borderStyle: 'dashed' } }, h('div', { class: 'ic' }, '+'), h('div', null, 'New category')));
    const binTile = h('div', { class: 'prof bintile' + (filter === 'bin' ? ' on' : ''), 'data-pid': '__bin', 'data-tip': 'Bin: deleted CVs. Drop a CV here to delete it', onclick: () => { filter = 'bin'; draw(page); } }, UI.icon('trash', { size: 22 }));
    page.append(h('div', { class: 'profwrap' }, bar, binTile));
    const search = h('input', { type: 'search', placeholder: 'Search CVs...', value: q, 'data-role': 'search', oninput: UI.debounce(() => { q = search.value; drawGrid(); }, 100) });
    const sortSel = h('select', { onchange: () => { sort = sortSel.value; drawGrid(); } }, [['updated', filter === 'bin' ? 'Recently deleted' : 'Recently edited'], ['name', 'Name'], ['created', 'Newest created']].map(([k, l]) => h('option', { value: k, selected: sort === k }, l)));
    page.append(h('div', { class: 'row', style: { marginBottom: '14px' } }, h('div', { class: 'searchbox' }, UI.icon('search'), search), sortSel));
    const grid = h('div', { class: 'cvgrid', id: 'cvgrid' }); page.append(grid); drawGrid();
  }
  const latestIds = () => new Set(S.cvs.filter(c => !c.archived).slice().sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6).map(c => c.id));
  async function drawBin(grid) {
    const recs = await tryCall('trash.cvs', {}, true) || []; if ($('#cvgrid') !== grid) return;
    binMap.clear(); recs.forEach(r => binMap.set(r.id, r));
    let list = recs.filter(c => !q || (c.name + ' ' + c.targetRole + ' ' + c.company).toLowerCase().includes(q.toLowerCase()));
    if (sort === 'name') list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))); else if (sort === 'created') list.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
    grid.append(h('div', { class: 'binnote' }, UI.icon('trash', { size: 16 }), 'Deleted CVs stay here for 30 days. Hover one to restore it, or drag it onto a category.', list.length ? h('button', { class: 'btn small danger', onclick: emptyBin }, 'Empty bin') : null));
    if (!list.length) { grid.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, recs.length ? 'No deleted CV matches your search.' : 'The bin is empty.')); return; }
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); loadThumb(e.target); } }, { rootMargin: '200px' });
    list.forEach(c => grid.append(binCard(c, io)));
  }
  async function emptyBin() { if (!await confirmBox('Empty the bin?', 'This permanently removes every deleted CV and entry in the bin.', 'Empty', true)) return; await call('trash.empty'); toast('Bin emptied'); draw(); }
  async function restoreCv(c) { await call('trash.restore', { kind: 'cv', id: c.id }); await App.reloadCvs(); draw(); toast('Restored "' + c.name + '"'); }
  async function purgeCv(c) { if (!await confirmBox('Delete for good?', '"' + c.name + '" cannot be brought back after this.', 'Delete for good', true)) return; await call('trash.purge', { kind: 'cv', id: c.id }); draw(); }
  function binCard(c, io) {
    const thumb = h('div', { class: 'thumb', 'data-id': c.id }, h('div', { class: 'empty small' }, 'Loading...')); io.observe(thumb);
    const tpl = S.templates.find(t => t.id === c.templateId) || { name: c.templateId, id: c.templateId };
    return h('div', { class: 'cvcard binned', onclick: (e) => { if (!e.target.closest('.hover') && !justDragged) toast('Restore it first to open it.'); }, oncontextmenu: (e) => { e.preventDefault(); ctxMenu(e.clientX, e.clientY, [{ label: 'Restore', fn: () => restoreCv(c) }, '-', { label: 'Delete for good...', fn: () => purgeCv(c) }]); }, onmousedown: (e) => cardMouseDown(c, e, true) }, thumb,
      h('div', { class: 'hover' }, h('button', { class: 'icon-btn', 'data-tip': 'Restore', onclick: (e) => { e.stopPropagation(); restoreCv(c); } }, UI.icon('undo')), h('button', { class: 'icon-btn', 'data-tip': 'Delete for good', onclick: (e) => { e.stopPropagation(); purgeCv(c); } }, UI.icon('trash'))),
      h('div', { class: 'info' }, h('b', null, c.name), h('div', { class: 'muted small forline' }, 'Deleted ' + (c.deletedAt ? new Date(c.deletedAt).toLocaleString() : '')), h('div', { class: 'row small muted', style: { marginTop: '4px' } }, h('span', { class: 'pill' }, tpl.name))));
  }
  function drawGrid() {
    const grid = $('#cvgrid'); if (!grid) return; clear(grid);
    if (filter === 'bin') { drawBin(grid); return; }
    const lat = latestIds();
    let list = S.cvs.filter(c => filter === 'archive' ? !!c.archived : (!c.archived && (filter === 'all' || (filter === 'latest' ? lat.has(c.id) : (c.profiles || []).includes(filter))))).filter(c => !q || (c.name + ' ' + c.targetRole + ' ' + c.company + ' ' + (c.notes || '')).toLowerCase().includes(q.toLowerCase()));
    list.sort((a, b) => sort === 'name' ? String(a.name || '').localeCompare(String(b.name || '')) : sort === 'created' ? b.created.localeCompare(a.created) : b.updated.localeCompare(a.updated));
    if (!list.length && S.cvs.length) { grid.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, filter === 'archive' ? 'Nothing archived. Drop a CV on Archive, or right-click it.' : 'No CVs in this category.')); return; }
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); loadThumb(e.target); } }, { rootMargin: '200px' });
    grid.append(h('div', { class: 'cvcard newtile', onclick: () => App.newCV() }, h('div', null, h('div', { class: 'plus' }, UI.icon('plus', { size: 26 })), h('b', null, 'New CV'), h('div', { class: 'small' }, 'Build one from your repository'))));
    list.forEach(c => grid.append(card(c, io)));
  }
  App.cvThumb = async function (id, el) { const cv = await tryCall('cv.get', { id }, true); if (!cv) { clear(el).append(h('div', { class: 'empty small' }, 'Preview unavailable')); return; } customFull = customFull.length ? customFull : await Promise.all(S.templates.filter(t => t.custom).map(t => tryCall('templates.get', { id: t.id }, true))).then(a => a.filter(Boolean)); const fr = h('iframe', { sandbox: 'allow-same-origin', tabindex: '-1', scrolling: 'no' }); fr.srcdoc = TP.renderDocument(cv, S.items, S.settings, customFull, { mode: 'png' }); clear(el).append(fr); };
  async function loadThumb(el) {
    const id = el.dataset.id; const cv = binMap.get(id) || await tryCall('cv.get', { id }, true); if (!cv) { clear(el).append(h('div', { class: 'empty small' }, 'Preview unavailable')); return; }
    const html = TP.renderDocument(cv, S.items, S.settings, customFull, { mode: 'png' });
    const fr = h('iframe', { sandbox: 'allow-same-origin', tabindex: '-1', scrolling: 'no' }); fr.srcdoc = html; clear(el).append(fr);
    const sc = (el.clientWidth || 238) / 794; fr.style.transform = 'scale(' + sc + ')'; el.style.height = Math.round(sc * 1123 * .78) + 'px';
  }

  // small layout glyph for each template, shown before its name
  const LAYOUT = { sidebar: 'left', darkside: 'left', rightside: 'right', gridcv: 'grid', timeline: 'timeline', gutter: 'timeline', swiss: 'swiss', modern: 'band', banner: 'band', executive: 'band', boxed: 'cards' };
  function tplIcon(id) {
    const k = LAYOUT[id] || 'single'; const r = (x, y, w, hh, o) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" rx="1" ' + (o ? 'fill="currentColor" opacity=".35" stroke="none"' : '') + '/>';
    const lines = (x, w) => [8, 11.5, 15, 18.5].map(y => '<path d="M' + x + ' ' + y + 'h' + w + '"/>').join('');
    const body = { single: r(4, 3, 16, 18) + lines(7, 10), left: r(4, 3, 16, 18) + r(4, 3, 6, 18, 1) + lines(12.5, 5), right: r(4, 3, 16, 18) + r(14, 3, 6, 18, 1) + lines(7, 5), grid: r(4, 3, 16, 18) + '<path d="M9.5 7v12M4 7.5h16"/>' + lines(11.5, 6), timeline: r(4, 3, 16, 18) + '<path d="M8 6v13"/>' + lines(11, 6), swiss: r(4, 3, 16, 18) + '<path d="M9 7h1M9 12h1M9 17h1"/>' + lines(12, 5), band: r(4, 3, 16, 18) + r(4, 3, 16, 5, 1) + lines(7, 10), cards: r(4, 3, 16, 18) + r(6.5, 7, 11, 5) + r(6.5, 14, 11, 5) }[k];
    const s = h('span', { class: 'tplic' }); s.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>'; return s;
  }
  const orgsFor = (id) => A().orgsFor(id);

  // ---- in-app drag (drop a CV on a category) -> leaving the window hands over to a real file drag ----
  let justDragged = false;
  // where a dragged CV may be dropped: Latest and All (unless the CV is archived) cannot take it
  const accepts = (pid, c, binned) => {
    if (binned) return pid !== '__bin' && pid !== '__archive' && pid !== '__latest' && pid !== '__all';
    if (pid === '__archive') return !c.archived; if (pid === '__bin') return true; if (pid === '__all') return !!c.archived; if (pid === '__latest') return false;
    return !!c.archived || !(c.profiles || []).includes(pid);
  };
  function cardMouseDown(c, e, binned) {
    if (e.button !== 0 || e.target.closest('.hover')) return;
    const sx = e.clientX, sy = e.clientY; let ghost = null, over = null, native = false;
    const target = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('.prof[data-pid]') : null; };
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
      if (native) return;
      if (!ghost) { ghost = h('div', { class: 'dragghost' }, UI.icon('doc', { size: 14 }), c.name); document.body.append(ghost); document.body.classList.add('cvdragging'); }
      ghost.style.left = (ev.clientX + 12) + 'px'; ghost.style.top = (ev.clientY + 10) + 'px';
      if (window.cvDesktop && (ev.clientX < 0 || ev.clientY < 0 || ev.clientX > innerWidth || ev.clientY > innerHeight)) {
        const p = pdfCache[c.id];
        if (p && p.updated === c.updated) { native = true; end(false); App.internalDrag = Date.now(); window.cvDesktop.dragStart(p.file); } else { toast('Preparing the PDF. Try dragging again in a moment.'); prepPdf(c); end(false); }
        return;
      }
      const t = target(ev.clientX, ev.clientY); const ok = !t || accepts(t.dataset.pid, c, binned); document.body.classList.toggle('nodrop', !ok);
      const tt = ok ? t : null; if (tt !== over) { if (over) over.classList.remove('dropon'); over = tt; if (over) over.classList.add('dropon'); }
    };
    const end = (drop, ev) => {
      window.removeEventListener('mousemove', move, true); window.removeEventListener('mouseup', up, true);
      document.body.classList.remove('cvdragging', 'nodrop'); if (over) over.classList.remove('dropon');
      if (ghost) { ghost.remove(); justDragged = true; setTimeout(() => { justDragged = false; }, 80); }
      if (drop && ghost && over) assignCategory(c, over.dataset.pid, binned);
    };
    const up = (ev) => end(true, ev);
    window.addEventListener('mousemove', move, true); window.addEventListener('mouseup', up, true);
  }
  async function setArchived(c, v) { const cv = await call('cv.get', { id: c.id }); cv.archived = v; await call('cv.save', cv); await App.reloadCvs(); draw(); toast(v ? 'Archived. Find it under Archive.' : 'Moved back to your CVs'); }
  async function assignCategory(c, pid, binned) {
    if (binned) { const p0 = (S.settings.profiles || []).find(x => x.id === pid); if (!p0) return; const r = await tryCall('trash.restore', { kind: 'cv', id: c.id }); if (!r) return; const cv = await call('cv.get', { id: c.id }); cv.profiles = (cv.profiles || []).concat(pid); await call('cv.save', cv); await App.reloadCvs(); draw(); return toast('Restored into ' + p0.name); }
    if (pid === '__archive') return setArchived(c, true);
    if (pid === '__all') return setArchived(c, false);
    if (pid === '__bin') return delCv(c);
    const p = (S.settings.profiles || []).find(x => x.id === pid); if (!p) return;
    const cv = await call('cv.get', { id: c.id }); cv.profiles = cv.profiles || [];
    if (!cv.profiles.includes(pid)) cv.profiles.push(pid); else if (!cv.archived) return toast('"' + c.name + '" is already in ' + p.name);
    const wasArchived = !!cv.archived; cv.archived = false;   // archive is its own place: dropping an archived CV on a category takes it out of the archive
    await call('cv.save', cv); await App.reloadCvs(); draw(); toast(wasArchived ? 'Moved out of Archive into ' + p.name : 'Added to ' + p.name);
  }
  async function delCv(c) { await call('cv.delete', { id: c.id }); await App.reloadCvs(); draw(); toast('Moved to the Bin', { action: { label: 'Undo', fn: async () => { await call('trash.restore', { kind: 'cv', id: c.id }); await App.reloadCvs(); draw(); } } }); }

  function card(c, io) {
    const profs = S.settings.profiles || [];
    const thumb = h('div', { class: 'thumb', 'data-id': c.id, 'data-tip': 'Drag and drop wherever to copy' }, h('div', { class: 'empty small' }, 'Loading...')); io.observe(thumb);
    const orgs = orgsFor(c.id); const tpl = S.templates.find(t => t.id === c.templateId) || { name: c.templateId, id: c.templateId };
    const el = h('div', { class: 'cvcard' + (S.cv && S.cv.id === c.id ? ' isopen' : ''), onclick: (e) => { if (justDragged) return; if (!e.target.closest('.hover')) App.go('review', { cvId: c.id, full: true }); },
      oncontextmenu: (e) => { e.preventDefault(); menu(c, e.clientX, e.clientY); },
      onmouseenter: () => prepPdf(c), onmousedown: (e) => cardMouseDown(c, e) },
      thumb,
      h('div', { class: 'hover' },
        h('button', { class: 'icon-btn', 'data-tip': 'Edit', onclick: (e) => { e.stopPropagation(); App.openCV(c.id); } }, UI.icon('pencil')),
        h('button', { class: 'icon-btn', 'data-tip': 'Duplicate', onclick: (e) => { e.stopPropagation(); dup(c); } }, UI.icon('copy')),
        h('button', { class: 'icon-btn', 'data-tip': 'Copy file to clipboard (paste into a folder or email)', onclick: (e) => { e.stopPropagation(); copyFile(c); } }, UI.icon('clip')),
        h('button', { class: 'icon-btn', 'data-tip': 'New application with this CV', style: { marginTop: '6px' }, onclick: (e) => { e.stopPropagation(); newApplication(c); } }, UI.icon('briefcase'))),
      h('div', { class: 'info', 'data-tip': 'Drag and drop wherever to copy' }, h('b', null, c.name),
        h('div', { class: 'muted small forline' }, orgs.length ? 'For: ' + orgs.join(', ') : 'Not used in an application yet'),
        h('div', { class: 'row small muted', style: { marginTop: '4px', flexWrap: 'wrap', gap: '4px' } }, S.cv && S.cv.id === c.id ? h('span', { class: 'pill openbadge', 'data-tip': 'This CV is open in the editor' }, UI.icon('pencil', { size: 11 }), 'Open in editor') : null, h('span', { class: 'pill' }, tplIcon(tpl.id), tpl.name), h('span', { class: 'pill' }, c.count + ' items'), (c.profiles || []).map(id => { const p = profs.find(x => x.id === id); return p ? h('span', { class: 'pill accent' }, p.icon + ' ' + p.name) : null; })), h('div', { class: 'muted small', style: { marginTop: '3px' } }, 'edited ' + new Date(c.updated).toLocaleString())));
    return el;
  }
  T.addApplication = async () => {   // from the + menu: a blank application, shown in the Applications list
    await A().blank('', ''); view = 'apps'; if (S.tab !== 'browse') await App.go('browse'); else draw();
  };
  async function newApplication(c) { await A().blank(c.id, c.targetRole || ''); view = 'apps'; draw(); }
  async function prepPdf(c) {
    if (!window.cvDesktop) return; const p = pdfCache[c.id]; if (p && p.updated === c.updated) return;
    pdfCache[c.id] = { updated: null, file: '' };
    const r = await tryCall('export.quickPdf', { id: c.id }, true); if (r) pdfCache[c.id] = { updated: c.updated, file: r.file };
  }
  async function copyFile(c) {
    const r = await tryCall('export.quickPdf', { id: c.id }); if (!r) return;
    const res = await tryCall('export.copyFile', { file: r.file }); if (res) toast(res.copied ? 'PDF copied. Paste it into a folder, desktop or email.' : (res.note || 'Copied'));
  }
  async function dup(c) { const n = await tryCall('cv.duplicate', { id: c.id }); if (n) { await App.reloadCvs(); toast('Duplicated as "' + n.name + '"'); draw(); } }
  function menu(c, x, y) {
    const profs = S.settings.profiles || [];
    const E = [
      { label: 'Review', fn: () => App.go('review', { cvId: c.id }) }, { label: 'Edit', fn: () => App.openCV(c.id) }, { label: 'Duplicate', fn: () => dup(c) }, { label: 'Copy file', fn: () => copyFile(c) }, '-',
      { label: 'Rename...', fn: async () => { const n = await promptBox('Rename CV', 'New name', c.name); if (n) { const cv = await call('cv.get', { id: c.id }); cv.name = n; await call('cv.save', cv); await App.reloadCvs(); draw(); } } },
      { label: 'Compare with another CV...', fn: () => compare(c) },
      { label: 'Add all its lines to the repository', fn: async () => { const r = await tryCall('cv.pushToRepo', { id: c.id }); if (r) { await App.reloadItems(); toast(r.created + ' new entr' + (r.created === 1 ? 'y' : 'ies') + ' added, ' + r.skipped + ' already there'); } } },
      { label: 'New application with this CV', fn: () => newApplication(c) },
      { label: c.archived ? 'Move back to your CVs' : 'Archive', fn: () => setArchived(c, !c.archived) }, '-',
      ];
    const catSub = profs.map(p => ({ label: p.icon + ' ' + p.name, check: (c.profiles || []).includes(p.id), fn: async () => { const cv = await call('cv.get', { id: c.id }); cv.profiles = cv.profiles || []; const i = cv.profiles.indexOf(p.id); if (i >= 0) cv.profiles.splice(i, 1); else cv.profiles.push(p.id); await call('cv.save', cv); await App.reloadCvs(); draw(); } }));
    E.push({ label: 'Categories', sub: catSub.length ? catSub : [{ label: '(no categories yet)', disabled: true }] });
    E.push({ label: 'Re-render in template', sub: S.templates.map(t => ({ label: t.name, sel: t.id === c.templateId, fn: async () => { const cv = await call('cv.get', { id: c.id }); cv.templateId = t.id; await call('cv.save', cv); await App.reloadCvs(); draw(); toast('Now using ' + t.name); } })) });
    E.push({ label: 'Export', sub: [['pdf', 'PDF'], ['docx', 'Word'], ['png', 'PNG'], ['html', 'HTML'], ['json', 'JSON']].map(([f, l]) => ({ label: l, fn: async () => { const r = await tryCall('export.run', { id: c.id, format: f }); if (r) toast('Exported ' + r.files.length + ' file(s)', { action: { label: 'Show', fn: () => UI.showInFolder(r.files[0]) } }); } })) });
    E.push('-', { label: 'Delete (to bin)', fn: () => delCv(c) });
    ctxMenu(x, y, E);
  }
  async function compare(c) {
    const sel = h('select', null, S.cvs.filter(x => x.id !== c.id).map(x => h('option', { value: x.id }, x.name)));
    if (!sel.options.length) return toast('You need at least two CVs to compare');
    const ok = await modal('Compare "' + c.name + '" with...', sel, { buttons: [{ label: 'Cancel', value: false }, { label: 'Compare', value: true, cls: 'primary' }] });
    if (ok) App.go('review', { compare: [c.id, sel.value] });
  }
  async function profileDialog(p, page) {
    const name = h('input', { type: 'text', value: p ? p.name : '', placeholder: 'e.g. Consulting', style: { width: '100%' } });
    let icon = p ? p.icon : ICONS[0]; const iconRow = h('div', { class: 'row wrap' });
    const draw2 = () => { clear(iconRow); ICONS.forEach(i => iconRow.append(h('span', { class: 'chip', style: icon === i ? { background: 'var(--accent-weak)', borderColor: 'var(--accent)', fontSize: '20px' } : { fontSize: '20px' }, onclick: () => { icon = i; draw2(); } }, i))); iconRow.append(h('input', { type: 'text', maxlength: 4, placeholder: 'or type one', style: { width: '90px' }, oninput: e => { if (e.target.value) icon = e.target.value; } })); };
    draw2();
    const ok = await modal(p ? 'Rename category' : 'New category', h('div', null, name, h('div', { class: 'sp' }), h('div', { class: 'small muted' }, 'Icon'), iconRow), { buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, cls: 'primary' }] });
    if (!ok || !name.value.trim()) return;
    const profs = (S.settings.profiles || []).slice();
    if (p) { const x = profs.find(q => q.id === p.id); x.name = name.value.trim(); x.icon = icon; } else profs.push({ id: M.uid('pf'), name: name.value.trim(), icon });
    await App.saveSettings({ profiles: profs }); draw();
  }
  async function delProfile(p) {
    if (!await confirmBox('Delete category "' + p.name + '"?', 'The CVs stay; they just leave this category.', 'Delete', true)) return;
    for (const c of S.cvs.filter(c => (c.profiles || []).includes(p.id))) { const cv = await call('cv.get', { id: c.id }); cv.profiles = cv.profiles.filter(x => x !== p.id); await call('cv.save', cv); }
    await App.saveSettings({ profiles: (S.settings.profiles || []).filter(x => x.id !== p.id) }); if (filter === p.id) filter = 'all'; await App.reloadCvs(); draw();
  }

  function drawOverview(page) {
    const wrap = h('div', { class: 'ovpage' }); page.append(wrap);
    // applications
    const ah = h('div', { class: 'ovhead' }, h('h2', null, 'Applications'), h('div', { class: 'spacer' }), A().list().length ? h('button', { class: 'btn small', onclick: () => swapView('apps', page) }, 'Show all', UI.icon('chevR')) : null);
    wrap.append(h('section', { class: 'ovsec' }, ah));
    const asec = wrap.lastChild;
    if (!A().list().length) asec.append(h('div', { class: 'ovempty' }, UI.icon('apps', { size: 28 }), h('b', null, 'No applications yet'), h('span', { class: 'muted' }, 'Log each job you apply to with its CV, cover letter and job description.'), h('button', { class: 'btn', onclick: () => swapView('apps', page) }, 'Go to Applications')));
    else A().draw(asec, { limit: 3 });
    // CVs
    const list = S.cvs.filter(c => !c.archived).slice().sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 5);
    const csec = h('section', { class: 'ovsec' }, h('div', { class: 'ovhead' }, h('h2', null, 'CVs'), h('div', { class: 'spacer' }), S.cvs.length ? h('span', { class: 'muted small' }, 'Most recently edited') : null)); wrap.append(csec);
    if (!list.length) { csec.append(h('div', { class: 'ovempty' }, UI.icon('grid', { size: 28 }), h('b', null, 'No CVs yet'), h('span', { class: 'muted' }, 'Build your first CV from the entries in your repository.'), h('button', { class: 'btn primary', onclick: () => App.newCV() }, UI.icon('plus'), 'New CV'))); return; }
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); loadThumb(e.target); } }, { rootMargin: '200px' });
    const row = h('div', { class: 'ovcvs' }); list.forEach(c => row.append(card(c, io)));
    row.append(h('button', { class: 'ovarrow', 'data-tip': 'Open all CVs', onclick: () => swapView('cvs', page) }, UI.icon('chevR', { size: 22 })));
    csec.append(row);
  }
})();
