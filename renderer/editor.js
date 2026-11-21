'use strict';
(function () {
  const { h, $, clear, call, tryCall, toast, confirmBox, ctxMenu, debounce, icon } = UI;
  const M = window.CVModel, TP = window.CVTemplates;
  const S = App.state;
  const T = App.tabs.editor = {};
  const E = () => S.editor;
  let hist = [], histIdx = -1, saved = true, saveInfo = null;
  let nameIn, roleIn, iframe, stage, wrap, pageInfo, leftEl, rightEl, centerEl, listEl, editorEl, tplPill, blockBtn, fitBtn, viewBtn;
  let customFull = [], editingEl = null, pendingTop = null, pendingFrame = null;

  // ---------- state / history ----------
  function snapshot() { return JSON.stringify(S.cv); }
  function undoState() { const u = document.getElementById('btnUndo'), r = document.getElementById('btnRedo'); if (u) u.disabled = histIdx <= 0; if (r) r.disabled = histIdx >= hist.length - 1; }
  function pushHist() { hist = hist.slice(0, histIdx + 1); hist.push(snapshot()); if (hist.length > 60) hist.shift(); histIdx = hist.length - 1; undoState(); }
  function mutate(fn, opt) {
    opt = opt || {};
    if (!opt.noHist) { if (histIdx < 0) pushHist(); }
    fn(S.cv);
    if (tplPill && tplPill.setValue) tplPill.setValue(S.cv.templateId);
    if (!opt.noHist) pushHist();
    saved = false; setSaveInfo();
    scheduleSave();
    if (!opt.noPreview) schedulePreview();
    if (opt.panel !== false) K.drawLeftList();
  }
  T.undo = function () { if (histIdx > 0) { const prev = S.cv; histIdx--; S.cv = JSON.parse(hist[histIdx]); afterJump(prev); } };
  T.redo = function () { if (histIdx < hist.length - 1) { const prev = S.cv; histIdx++; S.cv = JSON.parse(hist[histIdx]); afterJump(prev); } };
  // update only what the undone change touched: nothing is rebuilt, so panels and scroll stay put
  function afterJump(prev) {
    undoState(); saved = false; scheduleSave();
    if (!wrap || !leftEl || !rightEl) return T.render($('#view'));
    const rest = (c) => { const x = Object.assign({}, c); delete x.selected; delete x.hidden; delete x.blockFlags; delete x.updated; delete x.name; delete x.targetRole; return JSON.stringify(x); };
    if (nameIn && nameIn.value !== (S.cv.name || '')) nameIn.value = S.cv.name || '';
    if (roleIn && roleIn.value !== (S.cv.targetRole || '')) roleIn.value = S.cv.targetRole || '';
    if (tplPill && tplPill.setValue) tplPill.setValue(S.cv.templateId);
    if (rest(prev) !== rest(S.cv)) K.drawRight();
    if (JSON.stringify(prev.selected) !== JSON.stringify(S.cv.selected) || JSON.stringify(prev.hidden) !== JSON.stringify(S.cv.hidden) || JSON.stringify(prev.blockFlags) !== JSON.stringify(S.cv.blockFlags)) K.drawLeftList();
    pendingTop = wrap.scrollTop; renderPreview();
  }
  const scheduleSave = debounce(() => T.saveNow(false), 700);
  T.saveNow = async function (toastIt) {
    if (!S.cv) return;
    scheduleSave.cancel();
    try { const c = await call('cv.save', S.cv); S.cv.updated = c.updated; saved = true; setSaveInfo(); await App.reloadCvs(); if (toastIt) toast('Saved'); } catch (e) { toast(e.message, { err: true }); }
  };
  function setSaveInfo() { if (saveInfo) { saveInfo.textContent = saved ? 'Saved' : 'Saving...'; saveInfo.style.opacity = saved ? .6 : 1; } }
  T.leave = function () {
    if (wrap && wrap.isConnected && S.cv) { E().scrollTop = wrap.scrollTop; E().scrollFor = S.cv.id; }   // coming back puts the preview where it was
    if (S.cv && !saved) T.saveNow(false);
  };
  const schedulePreview = debounce(() => renderPreview(), 40);

  // ---------- selection operations ----------
  const isChosen = (id) => S.cv.selected.some(s => s.itemId === id);
  function addItem(id, at) {
    if (isChosen(id)) return;
    mutate(cv => {
      let idx = cv.selected.length;
      if (typeof at === 'number') idx = at;
      else if (E().cursor) { const ci = cv.selected.findIndex(s => s.itemId === E().cursor); if (ci >= 0) idx = ci + 1; }
      cv.selected.splice(idx, 0, { itemId: id, versionId: null });
      if (typeof at !== 'number' && E().cursor) E().cursor = id;
    });
  }
  function removeItem(id) { mutate(cv => { cv.selected = cv.selected.filter(s => s.itemId !== id); if (E().cursor === id) E().cursor = null; }); }
  // Delete removes the selected block (every line in it) or, failing that, the selected line; both can be undone
  T.deleteCursor = function () {
    const b = E().block; if (b && !editingEl) { const ids = (b.ids || []).filter(isChosen); if (ids.length) { mutate(cv => { cv.selected = cv.selected.filter(s => !ids.includes(s.itemId)); }); E().block = null; E().cursor = null; K.drawLeftList(); toast('Block taken out of this CV (' + ids.length + (ids.length === 1 ? ' line' : ' lines') + ')', { action: { label: 'Undo', fn: T.undo } }); return; } }
    const id = E().cursor; if (id && isChosen(id) && !editingEl) { removeItem(id); toast('Taken out of this CV', { action: { label: 'Undo', fn: T.undo } }); } };
  // Freeze the on-screen order into cv.selected so manual moves start from what the user sees.
  // ids in the order the CV shows them (sections, then blocks, then lines)
  function cvOrder() {
    const m = TP.buildModel(S.cv, S.items, S.settings); const order = []; const add = (ids) => { for (const id of String(ids || '').split(',')) if (id) order.push(id); };
    for (const sec of m.sections) { if (sec.isSkills) (sec.skillGroups || []).forEach(g => add(g.ids)); else if (sec.isList) add(sec.ids); else for (const g of sec.groups || []) add(g.ids); }
    return order;
  }
  function freezeOrder() {
    if (S.cv.sortMode === 'manual') return;
    const order = cvOrder();
    const pos = new Map(order.map((id, i) => [id, i]));
    S.cv.selected = S.cv.selected.map((x, i) => ({ x, i })).sort((a, b) => ((pos.has(a.x.itemId) ? pos.get(a.x.itemId) : 1e6 + a.i) - (pos.has(b.x.itemId) ? pos.get(b.x.itemId) : 1e6 + b.i))).map(o => o.x);
    S.cv.sortMode = 'manual';
  }
  const effective = (id) => { const e = selEntry(id), it = S.byId[id]; return it ? Object.assign({}, it, (e && e.own) || {}) : null; };
  // ---- reorder animation: the side list and the preview both glide to their new places ----
  const ANIM_MS = 260, ANIM_EASE = 'cubic-bezier(.2,.8,.2,1)';   // the app-wide animation speed and curve
  let pendingFlip = null;
  const snapList = (root, sel, key) => { const m = new Map(); if (root) root.querySelectorAll(sel).forEach(el => m.set(el.dataset[key], el.getBoundingClientRect().top)); return m; };
  function playList(root, sel, key, before, moved) {
    if (!root) return;
    root.querySelectorAll(sel).forEach(el => {
      const o = before.get(el.dataset[key]); const dy = o == null ? 0 : o - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) el.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: ANIM_MS, easing: ANIM_EASE });
      if (moved && moved.includes(el.dataset[key])) el.animate([{ backgroundColor: 'rgba(123,155,255,.38)' }, { backgroundColor: 'rgba(123,155,255,0)' }], { duration: 800, easing: 'ease-out' });
    });
  }
  const FLIP_SEL = '[data-id],[data-gid],.sec[data-sec]';
  // blocks are keyed by the lines they hold: their gid is only a position number and changes when blocks swap places
  const flipKey = (el) => el.dataset.id ? 'i:' + el.dataset.id : el.dataset.ids ? 'g:' + el.dataset.ids : el.dataset.sec ? 's:' + el.dataset.sec : null;
  function reorder(kind, movedIds, fn) {
    const useItems = !!(listEl && listEl.querySelector('.blk[data-id]')); const sel = useItems ? '.blk[data-id]' : '.blk[data-ids]', key = useItems ? 'id' : 'ids';
    const before = snapList(listEl, sel, key);
    const sideMoved = kind === 'blk' && !useItems ? [(movedIds || []).join(',')] : movedIds;
    try {
      const d = iframe && iframe.contentDocument; const map = new Map();
      if (d) d.querySelectorAll(FLIP_SEL).forEach(el => { const k = flipKey(el), r = el.getBoundingClientRect(); if (k) map.set(k, { x: r.left, y: r.top }); });
      pendingFlip = { map, moved: (movedIds || []).map(x => kind === 'sec' ? 's:' + x : 'i:' + x).concat(kind === 'blk' ? ['g:' + (movedIds || []).join(',')] : []) };
    } catch (e) { pendingFlip = null; }
    fn();
    playList(listEl, sel, key, before, kind === 'blk' || kind === 'line' ? sideMoved : null);
  }
  // every section, block and line glides from where it was. A child only plays the part of the move its parent did not already carry.
  function playPreviewFlip(d) {
    const f = pendingFlip; pendingFlip = null; if (!f) return;
    // measure everything first: once a parent's animation has started, its children measure as already shifted by it
    const els = [...d.querySelectorAll(FLIP_SEL)].map(el => ({ el, k: flipKey(el), r: el.getBoundingClientRect() })).filter(x => x.k);
    const applied = new Map(); const plays = [];
    for (const { el, k, r } of els) {
      let pd = { x: 0, y: 0 }; for (let a = el.parentElement; a; a = a.parentElement) if (applied.has(a)) { pd = applied.get(a); break; }
      const o = f.map.get(k); const raw = o ? { x: o.x - r.left, y: o.y - r.top } : pd; applied.set(el, raw);
      plays.push({ el, k, dx: raw.x - pd.x, dy: raw.y - pd.y });
    }
    for (const { el, k, dx, dy } of plays) {
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: ANIM_MS, easing: ANIM_EASE });
      if (f.moved.includes(k)) el.animate([{ backgroundColor: 'rgba(91,125,255,.38)' }, { backgroundColor: 'rgba(91,125,255,0)' }], { duration: 900, easing: 'ease-out' });
    }
  }
  // Move a line next to another one. If it lands in a different group it becomes a CV-only copy of the line with that group's details.
  function moveLine(id, targetId, after) {
    if (id === targetId) return;
    reorder('line', [id], () => mutate(cv => {
      freezeOrder();
      const i = cv.selected.findIndex(s => s.itemId === id); if (i < 0) return;
      const [x] = cv.selected.splice(i, 1);
      let j = cv.selected.findIndex(s => s.itemId === targetId); if (j < 0) j = cv.selected.length; else if (after) j++;
      cv.selected.splice(j, 0, x);
      const a = effective(id), b = effective(targetId);
      const plain = (t) => t && !['skill', 'language', 'education'].includes(t);
      if (a && b && plain(a.type) && plain(b.type) && M.groupKey(a) !== M.groupKey(b)) x.own = { type: b.type, org: b.org, role: b.role, title: b.title, location: b.location, start: b.start, end: b.end };
    }));
  }
  // move a whole block (all its entries) before/after another block
  function moveBlock(ids, targetIds, after) {
    ids = ids.filter(Boolean); targetIds = targetIds.filter(Boolean); if (!ids.length || !targetIds.length || ids.some(x => targetIds.includes(x))) return;
    reorder('blk', ids, () => mutate(cv => {
      freezeOrder();
      const moved = cv.selected.filter(s => ids.includes(s.itemId)); if (!moved.length) return;
      cv.selected = cv.selected.filter(s => !ids.includes(s.itemId));
      let at; if (after) { at = -1; cv.selected.forEach((s, i) => { if (targetIds.includes(s.itemId)) at = i; }); at = at < 0 ? cv.selected.length : at + 1; } else { at = cv.selected.findIndex(s => targetIds.includes(s.itemId)); if (at < 0) at = cv.selected.length; }
      cv.selected.splice(at, 0, ...moved);
    }));
  }
  function moveSection(fromKey, toKey, after) {
    if (fromKey === toKey) return;
    reorder('sec', [fromKey], () => mutate(cv => { const i = cv.sections.findIndex(x => x.key === fromKey); if (i < 0) return; const [x] = cv.sections.splice(i, 1); let j = cv.sections.findIndex(y => y.key === toKey); if (j < 0) j = cv.sections.length; else if (after) j++; cv.sections.splice(j, 0, x); }));
  }
  function selEntry(id) { return S.cv.selected.find(s => s.itemId === id); }
  function textFor(id) { const e = selEntry(id), it = S.byId[id]; if (!it) return ''; return e && e.override ? e.override : M.itemText(it, e && e.versionId); }

  // ---------- render ----------
  T.render = async function (view) {
    if (!S.cv) {
      clear(view).append(h('div', { class: 'empty', style: { paddingTop: '120px' } }, Logo.el('flat', 72), h('h3', null, 'No CV open'), h('p', null, 'Start a new CV from your repository, or open one you already made.'), h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => App.newCV() }, icon('plus'), 'New CV'), h('button', { class: 'btn', onclick: () => App.go('browse') }, icon('grid'), 'Your CVs'))));
      return;
    }
    customFull = [];
    for (const t of S.templates.filter(t => t.custom)) { const full = await tryCall('templates.get', { id: t.id }, true); if (full) customFull.push(full); }
    if (histIdx < 0 || !hist.length) { hist = [snapshot()]; histIdx = 0; }
    if (E().mode === 'template') { if (App.renderTopActions) App.renderTopActions(); return K.renderTemplateEditor(view); }
    editorEl = h('div', { class: 'editor' }); clear(view).append(editorEl);
    leftEl = h('div', { class: 'panel left' });
    centerEl = h('div', { class: 'center' });
    rightEl = h('div', { class: 'panel right' });
    leftEl.classList.toggle('closed', !E().panelOpen); rightEl.classList.toggle('closed', !E().rightOpen);   // start in the final state: panels sliding at load would resize the preview under the fit
    editorEl.append(leftEl, centerEl, rightEl);
    K.drawLeft(); drawCenter(); K.drawRight(); syncPanels();
    if (E().scrollFor === S.cv.id && E().scrollTop) pendingTop = E().scrollTop;
    renderPreview(); if (App.renderTopActions) App.renderTopActions();
  };
  function syncPanels(animate) {
    leftEl.classList.toggle('closed', !E().panelOpen); rightEl.classList.toggle('closed', !E().rightOpen);
    const pl = $('#btnPanelL'), pr = $('#btnPanelR'); if (pl) pl.classList.toggle('on', E().panelOpen); if (pr) pr.classList.toggle('on', E().rightOpen);
    if (stage && animate) { stage.classList.add('zanim'); clearTimeout(stage._za); stage._za = setTimeout(() => stage.classList.remove('zanim'), 900); }
    setTimeout(() => { if (E().fit !== 'manual') applyFit(); }, 320);
  }
  T.togglePanel = function () { E().panelOpen = !E().panelOpen; if (E().panelOpen) K.drawLeft(); syncPanels(true); };
  function toggleRight() { E().rightOpen = !E().rightOpen; syncPanels(true); }
  function setBlockMode(v) {
    E().blockMode = v; E().block = null;
    try { iframe.contentDocument.body.classList.toggle('blk', v); K.markBlock(); } catch (e) { /* not ready */ }
    if (blockBtn) blockBtn.classList.toggle('on', v);
    K.drawLeftList();
  }

  // ---------- center ----------
  function drawCenter() {
    clear(centerEl);
    nameIn = h('input', { class: 'name', type: 'text', value: S.cv.name, 'data-tip': 'Name of this CV', oninput: e => mutate(cv => cv.name = e.target.value, { noPreview: true, panel: false }) });
    roleIn = h('input', { type: 'text', value: S.cv.targetRole || '', placeholder: 'Target role / company', style: { flex: '1 1 110px', minWidth: '80px', maxWidth: '190px' }, oninput: e => mutate(cv => cv.targetRole = e.target.value, { noPreview: true, panel: false }) });
    tplPill = h('button', { class: 'icon-btn sm', 'data-tip': 'Template', onclick: () => { const r = tplPill.getBoundingClientRect(); ctxMenu(r.left, r.bottom + 6, S.templates.map(t => ({ label: t.name, check: S.cv.templateId === t.id, fn: () => { mutate(cv => cv.templateId = t.id, { panel: false }); K.drawRight(); } }))); } }, icon('layers'));
    tplPill.setValue = (v) => { const t = S.templates.find(x => x.id === v); tplPill.setAttribute('data-tip', 'Template: ' + (t ? t.name : v)); };
    tplPill.setValue(S.cv.templateId);
    pageInfo = h('span', { class: 'pill', 'data-tip': 'Pages in the preview and how full the last page is.' }, '...');
    saveInfo = h('span', { class: 'muted small savei' }, 'Saved'); saved = true;
    const ib = (ic, tip, fn, id) => { const b = h('button', { class: 'icon-btn sm', id, onclick: fn, 'data-tip': tip }, icon(ic)); return b; };
    const FITS = ['width', 'height', 'page', '100'];
    const FIT_L = { width: 'Fit width', height: 'Fit height', page: 'Fit whole page', '100': '100% (Word-style size)', manual: 'Zoomed by hand' };
    fitBtn = h('button', { class: 'icon-btn sm', onclick: () => { const i = FITS.indexOf(E().fit); E().fit = FITS[(i + 1) % FITS.length]; applyFit(); drawFitLabel(); },
      oncontextmenu: (e) => { e.preventDefault(); const r = fitBtn.getBoundingClientRect(); ctxMenu(r.left, r.bottom + 6, FITS.map(k => ({ label: FIT_L[k], check: E().fit === k, fn: () => { E().fit = k; applyFit(); drawFitLabel(); } }))); } });
    const drawFitLabel = () => { clear(fitBtn); fitBtn.append(icon(E().fit === 'height' ? 'fitH' : E().fit === 'width' ? 'fitW' : 'fit')); fitBtn.setAttribute('data-tip', (FIT_L[E().fit] || 'Fit') + (E().fit === 'manual' ? ' (' + Math.round(E().zoom * 100) + '%)' : '') + '. Click to change, right-click to choose.'); };
    drawFitLabel(); T.drawFitLabel = drawFitLabel;
    const VIEWS = [['flow', 'Continuous'], ['stack', 'Paged - Vertical'], ['side', 'Paged - Horizontal']];
    viewBtn = h('button', { class: 'icon-btn sm', 'data-tip': 'How the pages are shown', onclick: () => { const r = viewBtn.getBoundingClientRect(); ctxMenu(r.left, r.bottom + 6, VIEWS.map(([k, l]) => ({ label: l, check: E().view === k, fn: () => { E().view = k; E().fit = k === 'side' ? 'page' : 'width'; renderPreview(); drawFitLabel(); } }))); } }, icon('doc'));
    blockBtn = h('button', { class: 'icon-btn sm' + (E().blockMode ? ' on' : ''), onclick: () => setBlockMode(!E().blockMode), 'data-tip': 'Block select: outline each part of the CV and work on it from the side panel.' }, icon('blocks'));
    centerEl.append(h('div', { class: 'ebar' },
      h('button', { class: 'icon-btn sm on', id: 'btnPanelL', onclick: () => T.togglePanel(), 'data-tip': 'Items panel (Ctrl+Q)' }, icon('panelL')), nameIn, roleIn, tplPill, pageInfo, h('div', { class: 'spacer' }), saveInfo, h('span', { class: 'sep' }),
      ib('undo', 'Undo (Ctrl+Z)', T.undo, 'btnUndo'), ib('redo', 'Redo (Ctrl+Y)', T.redo, 'btnRedo'), h('span', { class: 'sep' }),
      ib('zoomOut', 'Zoom out', () => { E().fit = 'manual'; E().zoom = Math.max(.3, zoomNow() - .1); applyFit(); drawFitLabel(); }), fitBtn, ib('zoomIn', 'Zoom in', () => { E().fit = 'manual'; E().zoom = Math.min(2.5, zoomNow() + .1); applyFit(); drawFitLabel(); }), viewBtn, blockBtn, h('span', { class: 'sep' }),
      h('button', { class: 'icon-btn sm on', id: 'btnPanelR', onclick: () => toggleRight(), 'data-tip': 'Style panel' }, icon('panelR'))));
    undoState();
    wrap = h('div', { class: 'pgwrap', onclick: (e) => { if (e.target === wrap || e.target === stage) { K.setCursor(null); if (E().blockMode && E().block) K.selectBlock(null); } } });
    stage = h('div', { class: 'pgstage' });
    iframe = h('iframe', { title: 'CV preview', sandbox: 'allow-same-origin', scrolling: 'no' });
    wrap.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); zoomAt(e.clientX, e.clientY, pinchFactor(e)); }, { passive: false });
    stage.append(iframe); wrap.append(stage); centerEl.append(wrap);
    new ResizeObserver(() => fitSoon()).observe(wrap);
  }
  T.atsCheck = () => K.atsCheck();
  T.topActions = () => S.cv && E().mode !== 'template' ? [
    { icon: 'x', tip: 'Close this CV and go back to Home (it is kept)', fn: async () => { await T.saveNow(false); S.cv = null; App.go('browse'); } },
    { icon: 'print', tip: 'Print preview', fn: () => T.printPreview() },
    { icon: 'review', tip: 'Review this CV', fn: () => { T.leave(); App.go('review', { cvId: S.cv.id }); } },
    { icon: 'trash', tip: 'Delete this CV', fn: async () => { const cv = S.cv; if (!cv || !await confirmBox('Delete this CV?', '"' + cv.name + '" moves to the recycle bin (kept for 30 days). Its entries stay in your repository.', 'Delete CV', true)) return; await call('cv.delete', { id: cv.id }); S.cv = null; await App.reloadCvs(); toast('Moved to the recycle bin', { action: { label: 'Undo', fn: async () => { await call('trash.restore', { kind: 'cv', id: cv.id }); await App.reloadCvs(); } } }); App.go('browse'); } },
    { icon: 'upload', label: 'Export', tip: 'Export as PDF, Word, PNG, HTML or JSON (Ctrl+E). The first time for a CV, the ATS check opens first.', cls: 'primary', fn: () => T.exportClick(),
      drop: (b) => { const r = b.getBoundingClientRect(); ctxMenu(r.right - 190, r.bottom + 6, [{ label: 'ATS check', fn: () => K.atsCheck() }, { label: 'Export options...', fn: () => T.exportDialog() }]); } }] : [];
  T.exportClick = function () { if (!S.cv) return; if (!S.cv.atsSeen) K.atsCheck({ fromExport: true }); else T.exportDialog(); };
  async function pushToRepo() { await T.saveNow(false); const r = await tryCall('cv.pushToRepo', { id: S.cv.id }); if (r) { await App.reloadItems(); toast(r.created + ' new entr' + (r.created === 1 ? 'y' : 'ies') + ' added to the repository, ' + r.skipped + ' already there.'); } }
  const fitSoon = debounce(() => { if (E().fit !== 'manual') applyFit(); }, 80);
  function applyFit() {
    if (!wrap || !stage || !iframe) return;
    const pw = (S.cv && S.cv.opts && S.cv.opts.pageSize === 'Letter') ? 816 : 794, ph = (S.cv && S.cv.opts && S.cv.opts.pageSize === 'Letter') ? 1056 : 1123;
    const iw = parseInt(iframe.style.width) || pw + 28, ih = E().view === 'side' ? (parseInt(iframe.style.height) || ph + 28) : ph + 28; const fw = (wrap.clientWidth - 48) / iw, fh = (wrap.clientHeight - 32) / ih;
    const m = E().fit;
    if (m === 'width') E().zoom = fw; else if (m === 'height') E().zoom = fh; else if (m === 'page') E().zoom = Math.min(fw, fh); else if (m === '100') E().zoom = 1;
    if (m !== 'manual') E().zoom = Math.max(.3, Math.min(2.5, Math.round(E().zoom * 100) / 100));
    const z = E().zoom; const w = parseInt(iframe.style.width) || pw + 28; const hgt = parseInt(iframe.style.height) || ph + 28;
    stage.style.width = (w * z) + 'px'; stage.style.height = (hgt * z) + 'px';
    iframe.style.transformOrigin = 'top left'; iframe.style.transform = 'scale(' + z + ')';
    const br = stage.querySelector('.pgbreaks'); if (br) { br.style.transformOrigin = 'top left'; br.style.transform = 'scale(' + z + ')'; }
    if (T.drawFitLabel) T.drawFitLabel();
  }
  const EDIT_CSS = '<style id="cvb-edit">.ef{cursor:text}body:not(.blk) .ef:hover{outline:1px dashed rgba(124,92,255,.7);outline-offset:1px}.ef[contenteditable=true]{outline:2px solid #7c5cff;outline-offset:1px;background:rgba(124,92,255,.12);text-transform:none}[data-id]{cursor:grab}[data-id]:active{cursor:grabbing}body:not(.blk) [data-id]:hover{background:rgba(70,110,255,.10)}body.blk .sec>h2{cursor:grab}body.blk [data-gid]{cursor:grab;border-radius:3px;transition:background .15s,box-shadow .15s}body.blk [data-gid]:hover,.cvb-hover{background:rgba(70,110,255,.09)!important;box-shadow:0 0 0 2px rgba(99,132,255,.75)}.cvb-blocksel{background:rgba(70,110,255,.13)!important;box-shadow:0 0 0 2px #5b7dff!important}.cvb-cursor{outline:2px solid #5b7dff;outline-offset:1px;background:rgba(70,110,255,.16)!important}[contenteditable=true],[contenteditable=true].cvb-cursor{outline:2px dashed #f59e0b!important;outline-offset:2px;background:#fff7e0!important;box-shadow:0 0 0 5px rgba(245,158,11,.22);cursor:text;border-radius:2px}.cvb-before{box-shadow:0 -3px 0 #5b7dff!important}.cvb-after{box-shadow:0 3px 0 #5b7dff!important}li[data-id][draggable=true]{-webkit-user-drag:element}.cvb-drag{opacity:.35!important;transition:opacity .15s}.cvb-before,.cvb-after{transition:box-shadow .1s}</style>';
  function renderPreview() {
    if (!iframe || !S.cv) return;
    const top = pendingTop != null ? pendingTop : (wrap ? wrap.scrollTop : 0); pendingTop = null;
    const html = TP.renderDocument(S.cv, S.items, S.settings, customFull, { mode: 'preview', head: EDIT_CSS, edit: true });
    // The new page is built in a second, invisible frame stacked on the old one. The old page stays on screen until the new one is
    // loaded, laid out and scaled; then the two swap in a single paint. (Replacing srcdoc on the visible frame blanks it while the
    // browser parses the new document, which is the white flash.)
    if (!iframe.dataset.loaded) { iframe.onload = () => { iframe.dataset.loaded = '1'; try { onPreviewLoaded(top); } catch (e) { console.error(e); } }; iframe.srcdoc = html; return; }
    if (pendingFrame) { pendingFrame.remove(); pendingFrame = null; }
    const old = iframe, nf = h('iframe', { title: 'CV preview', sandbox: 'allow-same-origin', scrolling: 'no' });
    nf.style.cssText = 'position:absolute;left:0;top:0;opacity:0;pointer-events:none;width:' + old.style.width + ';height:' + old.style.height + ';transform-origin:top left;transform:' + (old.style.transform || 'none');
    pendingFrame = nf;
    nf.onload = () => {
      if (pendingFrame !== nf) return; try { const b = nf.contentDocument && nf.contentDocument.body; if (!b || !b.childElementCount) return; } catch (e) { return; }   // ignore the empty page every new frame reports first
      pendingFrame = null; nf.dataset.loaded = '1';
      iframe = nf; nf.style.position = nf.style.left = nf.style.top = nf.style.opacity = nf.style.pointerEvents = '';
      try { onPreviewLoaded(top); } catch (e) { console.error(e); }
      old.remove();
    };
    nf.srcdoc = html; stage.append(nf);
  }
  function onPreviewLoaded(top) {
    const d = iframe.contentDocument; const body = d.body;
    body.classList.toggle('blk', !!E().blockMode);
    const model = TP.buildModel(S.cv, S.items, S.settings); const pg = model.page;
    if (E().view === 'flow' && window.Pager && (Object.values(S.cv.blockFlags || {}).some(f => f && f.keep) || S.cv.sections.some(q => q.pb && q.visible === true))) { try { Pager.flagsOnly(d, pg); } catch (x) { console.error(x); } }
    let height = Math.max(d.documentElement.scrollHeight, body.offsetHeight + 28);
    iframe.style.width = (pg.wpx + 28) + 'px'; iframe.style.height = height + 'px';
    stage.querySelectorAll('.pgbreaks').forEach(x => x.remove());
    const bodyH = body.offsetHeight; let pages = Math.max(1, Math.ceil((bodyH - 2) / pg.hpx));
    const paged = E().view === 'stack' || E().view === 'side';
    if (paged && window.Pager) { try { const r = Pager.apply(d, pg, E().view); pages = r.pages; iframe.style.width = r.width + 'px'; iframe.style.height = r.height + 'px'; height = r.height; } catch (e) { console.error(e); } }
    const br = h('div', { class: 'pgbreaks', style: { position: 'absolute', left: 0, top: 0, width: (pg.wpx + 28) + 'px', height: height + 'px', pointerEvents: 'none' } });
    if (!paged) for (let i = 1; i < pages; i++) br.append(h('div', { class: 'pgbreak', style: { top: (14 + i * pg.hpx) + 'px' } }, h('span', null, 'page ' + (i + 1) + ' starts')));
    stage.append(br);
    let used = 0; const last = body.lastElementChild; if (last) used = (last.getBoundingClientRect().bottom - body.getBoundingClientRect().top - parseFloat(getComputedStyle(body).paddingTop));
    const usable = pg.hpx - 2 * pg.margin * 3.78; const lastFill = Math.round(((used % usable) / usable) * 100) || 100;
    const target = S.cv.targetPages || 0;
    pageInfo.textContent = pages + (pages === 1 ? ' page' : ' pages') + (pages > 1 ? ' (last ' + lastFill + '% full)' : ' (' + Math.min(100, Math.round(used / usable * 100)) + '% full)');
    pageInfo.className = 'pill ' + (target && pages > target ? 'bad' : (pages > 1 ? 'warn' : 'good'));
    applyFit(); if (top) wrap.scrollTop = top;
    stage.classList.add('ready');
    wirePreview(d); playPreviewFlip(d);
    if (E().cursor) K.setCursor(E().cursor);
    K.markBlock();
  }
  const allItemEls = (d) => [...d.querySelectorAll('[data-id]')];
  function nearestItemEl(d, y) {
    let best = null, bd = 1e9;
    for (const el of allItemEls(d)) { const r = el.getBoundingClientRect(); const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0; if (dist < bd) { bd = dist; best = el; } }
    return best;
  }
  function clearDrop(d) { d.querySelectorAll('.cvb-before,.cvb-after').forEach(x => x.classList.remove('cvb-before', 'cvb-after')); }
  function wirePreview(d) {
    d.addEventListener('keydown', (e) => { if (App.onKey && (e.ctrlKey || e.metaKey) && !e.defaultPrevented) App.onKey(e); });
    d.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); const ir = iframe.getBoundingClientRect(), z = zoomNow(); zoomAt(ir.left + e.clientX * z, ir.top + e.clientY * z, pinchFactor(e)); }, { passive: false });
    const itemEl = (t) => t.closest ? t.closest('[data-id]') : null;
    allItemEls(d).forEach(el => { if (el.tagName === 'LI' || el.tagName === 'P' || el.tagName === 'DIV') el.setAttribute('draggable', 'true'); });
    const secOf = (t) => { const h2 = t.closest && t.closest('.sec > h2'); return h2 ? h2.parentElement : null; };
    d.addEventListener('mousedown', () => UI.closeCtx(), true);
    d.addEventListener('mouseover', (e) => { if (!E().blockMode) return; const sc = secOf(e.target); d.querySelectorAll('.cvb-hover[data-sgid]').forEach(x => { if (x !== sc) x.classList.remove('cvb-hover'); }); if (sc) sc.classList.add('cvb-hover'); });
    d.addEventListener('mouseout', (e) => { if (!E().blockMode) return; const sc = secOf(e.target); if (sc && !(e.relatedTarget && secOf(e.relatedTarget) === sc)) sc.classList.remove('cvb-hover'); });
    d.addEventListener('click', (e) => {
      if (E().blockMode && !editingEl) { const sc = secOf(e.target); if (sc) { const ids = [...new Set([...sc.querySelectorAll('[data-ids]')].flatMap(x => x.dataset.ids.split(',')).concat([...sc.querySelectorAll('[data-id]')].map(x => x.dataset.id)).filter(Boolean))]; K.selectBlock(sc.dataset.sgid, ids, (sc.querySelector('h2') || {}).textContent || 'Section'); e.preventDefault(); return; } }
      if (editingEl) { if (!editingEl.contains(e.target)) editingEl.blur(); else return; }
      const g = e.target.closest ? e.target.closest('[data-gid]') : null; const el = itemEl(e.target);
      if (E().blockMode) {
        if (g && g.dataset.ids) K.selectBlock(g.dataset.gid, g.dataset.ids.split(',').filter(Boolean));
        else if (el) K.selectBlock('i:' + el.dataset.id, [el.dataset.id]); else K.selectBlock(null);
        e.preventDefault();
      } else { if (el) { K.setCursor(el.dataset.id); e.preventDefault(); } else K.setCursor(null); }
    });
    d.addEventListener('dblclick', (e) => {
      const t = e.target; if (!t || !t.closest) return;
      if (t.closest('.hd, .side .sec:first-child') && !itemEl(t)) { openPersonal(); return; }   // header text lives in the Personal tab
      const f = t.closest('[data-f]'); if (f) { startField(f); return; }
      const el = itemEl(t); if (el) startInline(el);
    });
    d.addEventListener('keydown', (e) => { if (e.key === 'Delete' && !editingEl && (E().cursor || E().block)) { e.preventDefault(); T.deleteCursor(); } });
    // Right-click works everywhere in the preview, also on the grab-cursor blocks and headings that can be dragged:
    // a line opens its own menu, a one-line block opens that line's menu, any other block or heading opens the keep-together menu.
    d.addEventListener('contextmenu', (e) => {
      const t = e.target; if (!t || !t.closest) return;
      const z = zoomNow(), r0 = iframe.getBoundingClientRect(), X = r0.left + e.clientX * z, Y = r0.top + e.clientY * z;
      const el = itemEl(t); if (el) { e.preventDefault(); itemMenu(el.dataset.id, X, Y, el); return; }
      const sc = t.closest('.sec'), g = t.closest('[data-gid][data-ids]');
      if (t.closest('.sec > h2') && sc) { e.preventDefault(); keepMenu(sc.dataset.sgid, X, Y); return; }
      if (g) {
        e.preventDefault(); const ids = g.dataset.ids.split(',').filter(Boolean); const one = ids.length === 1 ? d.querySelector('[data-id="' + ids[0] + '"]') : null;
        if (one) itemMenu(ids[0], X, Y, one); else keepMenu(g.dataset.gid, X, Y); return;
      }
      if (sc) { e.preventDefault(); keepMenu(sc.dataset.sgid, X, Y); }
    });
    d.querySelectorAll('[data-gid][data-ids], .sec > h2').forEach(el => el.setAttribute('draggable', 'true'));
    const fade = (el) => { if (el) setTimeout(() => el.classList.add('cvb-drag'), 0); };
    d.addEventListener('dragstart', (e) => {
      if (editingEl) { e.preventDefault(); return; }
      const t = e.target && e.target.closest ? e.target : null; if (!t) return;
      { const h2 = E().blockMode && t.closest('.sec > h2'); const g = E().blockMode && t.closest('[data-gid][data-ids]'); fade(h2 ? h2.parentElement : g || (!E().blockMode && itemEl(t))); }
      if (E().blockMode) {
        const h2 = t.closest('.sec > h2'); if (h2) { e.dataTransfer.setData('text/cv-sec', h2.parentElement.dataset.sec || ''); e.dataTransfer.effectAllowed = 'move'; return; }
        const g = t.closest('[data-gid][data-ids]'); if (g) { e.dataTransfer.setData('text/cv-block', g.dataset.ids); e.dataTransfer.effectAllowed = 'move'; return; }
        e.preventDefault(); return;
      }
      const el = itemEl(t); if (!el) { e.preventDefault(); return; } e.dataTransfer.setData('text/cv-item', el.dataset.id); e.dataTransfer.effectAllowed = 'move';
    });
    const nearestOf = (sel, y) => { let best = null, bd = 1e9; for (const el of d.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0; if (dist < bd) { bd = dist; best = el; } } return best; };
    d.addEventListener('dragover', (e) => {
      const ty = [...e.dataTransfer.types]; clearDrop(d);
      if (ty.includes('text/cv-item')) { e.preventDefault(); const el = nearestItemEl(d, e.clientY); if (!el) return; const r = el.getBoundingClientRect(); el.classList.add(e.clientY > r.top + r.height / 2 ? 'cvb-after' : 'cvb-before'); }
      else if (ty.includes('text/cv-block')) { e.preventDefault(); const el = nearestOf('[data-gid][data-ids]', e.clientY); if (!el) return; const r = el.getBoundingClientRect(); el.classList.add(e.clientY > r.top + r.height / 2 ? 'cvb-after' : 'cvb-before'); }
      else if (ty.includes('text/cv-sec')) { e.preventDefault(); const el = nearestOf('.sec[data-sec]', e.clientY); if (!el) return; const r = el.getBoundingClientRect(); el.classList.add(e.clientY > r.top + r.height / 2 ? 'cvb-after' : 'cvb-before'); }
    });
    d.addEventListener('dragleave', (e) => { if (!e.relatedTarget) clearDrop(d); });
    d.addEventListener('dragend', () => { clearDrop(d); d.querySelectorAll('.cvb-drag').forEach(x => x.classList.remove('cvb-drag')); });
    d.addEventListener('drop', (e) => {
      const ty = [...e.dataTransfer.types]; clearDrop(d);
      if (ty.includes('text/cv-block')) { e.preventDefault(); const ids = e.dataTransfer.getData('text/cv-block').split(','); const el = nearestOf('[data-gid][data-ids]', e.clientY); if (!el) return; const r = el.getBoundingClientRect(); moveBlock(ids, el.dataset.ids.split(','), e.clientY > r.top + r.height / 2); return; }
      if (ty.includes('text/cv-sec')) { e.preventDefault(); const k = e.dataTransfer.getData('text/cv-sec'); const el = nearestOf('.sec[data-sec]', e.clientY); if (!el) return; const r = el.getBoundingClientRect(); moveSection(k, el.dataset.sec, e.clientY > r.top + r.height / 2); return; }
      const id = e.dataTransfer.getData('text/cv-item'); if (!id) return; e.preventDefault();
      const el = nearestItemEl(d, e.clientY); let after = false, tid = null;
      if (el) { const r = el.getBoundingClientRect(); after = e.clientY > r.top + r.height / 2; tid = el.dataset.id; }
      if (isChosen(id)) { if (tid) moveLine(id, tid, after); }
      else { const i = tid ? S.cv.selected.findIndex(s => s.itemId === tid) : -1; addItem(id, i >= 0 ? (after ? i + 1 : i) : S.cv.selected.length); }
    });
  }
  function openPersonal() { E().rtab = 'contact'; E().rightOpen = true; K.drawRight(); syncPanels(); }
  const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function parseDatePart(t) {
    t = String(t || '').trim().replace(/[.,]/g, ''); if (!t) return '';
    if (/^(present|now|current|ongoing)$/i.test(t)) return 'present';
    let m;
    if ((m = /^([A-Za-z]{3,9})\s*['\u2019]?\s*(\d{2}|\d{4})$/.exec(t))) { const mi = MONTHS3.indexOf(m[1].slice(0, 3).toLowerCase()); if (mi >= 0) { const y = m[2].length === 2 ? '20' + m[2] : m[2]; return y + '-' + String(mi + 1).padStart(2, '0'); } }
    if ((m = /^(\d{4})$/.exec(t))) return m[1];
    if ((m = /^(\d{1,2})[\/-](\d{4})$/.exec(t))) return m[2] + '-' + m[1].padStart(2, '0');
    if ((m = /^(\d{4})-(\d{1,2})$/.exec(t))) return m[1] + '-' + m[2].padStart(2, '0');
    return null;
  }
  function parseDates(txt) {
    const parts = String(txt).split(/\s*[\u2013\u2014-]\s*|\s+to\s+/i).map(x => x.trim()).filter(Boolean); if (!parts.length || parts.length > 2) return null;
    const a = parseDatePart(parts[0]), b = parts.length === 2 ? parseDatePart(parts[1]) : a; if (a === null || b === null) return null; return { start: a, end: b };
  }
  // changes one text part of a group of entries, for this CV only (the repository keeps its own copy until "Add all entries to the repository")
  function applyField(ids, f, txt) {
    if (f === 'dates') { const r = parseDates(txt); if (!r) { toast('Could not read those dates. Use something like Apr 2024 - Jun 2024, or 2019 - 2022.', { err: true }); renderPreview(); return; } }
    mutate(cv => {
      for (const id of ids) {
        const s = cv.selected.find(x => x.itemId === id); if (!s) continue; const it = effective(id); if (!it) continue; const own = Object.assign({}, s.own || {});
        if (f === 'head') { if (it.type === 'education') own.title = txt; else if (it.role || !it.title) own.role = txt; else own.title = txt; }
        else if (f === 'titleExtra') own.title = txt;
        else if (f === 'org') own.org = txt;
        else if (f === 'sub') { const loc = it.location || '', i = txt.lastIndexOf(', '); if (loc && txt.endsWith(', ' + loc)) own.org = txt.slice(0, txt.length - loc.length - 2); else if (loc && i > 0) { own.org = txt.slice(0, i); own.location = txt.slice(i + 2); } else own.org = txt; }
        else if (f === 'score' || f === 'remarks') own.extra = Object.assign({}, it.extra, { [f]: txt });
        else if (f === 'dates') { const r = parseDates(txt); own.start = r.start; own.end = r.end; }
        s.own = own;
      }
    });
    toast('Edited for this CV only. "Add all entries to the repository" in the menu copies edits back.');
  }
  function startField(el) {
    if (editingEl) return;
    const f = el.dataset.f, g = el.closest('[data-gid]'), secEl = el.closest('[data-sec]'); const original = el.textContent; editingEl = el;
    el.contentEditable = 'true'; el.spellcheck = true; el.focus();
    const sel = iframe.contentWindow.getSelection(); sel.selectAllChildren(el);
    let cancelled = false;
    const done = () => {
      el.contentEditable = 'false'; el.removeEventListener('blur', done); editingEl = null;
      const txt = el.textContent.replace(/\s+/g, ' ').trim();
      if (cancelled || txt === original.replace(/\s+/g, ' ').trim() || (!txt && f !== 'score' && f !== 'remarks')) { renderPreview(); return; }
      if (f === 'sec') { const key = secEl && secEl.dataset.sec; mutate(cv => { const sc = cv.sections.find(x => x.key === key); if (sc) sc.label = txt; }); return; }
      const ids = g && g.dataset.ids ? g.dataset.ids.split(',').filter(Boolean) : []; if (!ids.length) { renderPreview(); return; }
      applyField(ids, f, txt);
    };
    el.addEventListener('blur', done);
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { cancelled = true; el.blur(); } else if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  }
  function startInline(el) {
    if (editingEl) return;
    const id = el.dataset.id; const original = el.textContent; editingEl = el;
    el.setAttribute('draggable', 'false'); el.contentEditable = 'true'; el.spellcheck = true; el.focus();
    const sel = iframe.contentWindow.getSelection(); sel.selectAllChildren(el); sel.collapseToEnd();
    let cancelled = false;
    const done = () => {
      el.contentEditable = 'false'; el.removeEventListener('blur', done); editingEl = null;
      const txt = el.textContent.replace(/\s+/g, ' ').trim();
      if (cancelled || txt === original.replace(/\s+/g, ' ').trim() || !txt) { renderPreview(); return; }
      mutate(cv => { const s = cv.selected.find(x => x.itemId === id); if (s) s.override = txt; });
      toast('Edited for this CV only. Right-click the line to save it as a new version.', { action: { label: 'Save as version', fn: () => saveOverrideAsVersion(id) } });
    };
    el.addEventListener('blur', done);
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { cancelled = true; el.blur(); } else if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  }
  async function saveOverrideAsVersion(id) {
    const s = selEntry(id); if (!s || !s.override) return toast('No edit to save');
    const r = await tryCall('items.addVersion', { id, text: s.override, source: 'manual', label: 'from CV edit' });
    if (r) { await App.reloadItems(); mutate(cv => { const x = cv.selected.find(q => q.itemId === id); x.versionId = r.version.id; x.override = ''; }); toast('Saved as a new version of that item'); }
  }
  function itemMenu(id, x, y, el) {
    const it = S.byId[id]; if (!it) return; const s = selEntry(id) || {};
    const entries = [];
    const vs = K.versionOpts(id).map(o => ({ label: o.label, check: o.active, fn: o.fn })); vs.push('-'); vs.push({ label: 'Rephrase with AI...', fn: () => K.rephraseFor(id) });
    entries.push({ label: 'Other versions', sub: vs });
    entries.push({ label: 'Edit text here', fn: () => startInline(el) });
    if (s.override) { entries.push({ label: 'Save as new version', fn: () => saveOverrideAsVersion(id) }); entries.push({ label: 'Revert to original', fn: () => mutate(cv => { cv.selected.find(z => z.itemId === id).override = ''; }) }); }
    entries.push('-');
    const eff = effective(id) || {};
    const secs = S.cv.sections.filter(q => !q.pb && q.visible !== false && !['skills', 'language'].includes(q.key)).map(sec => ({ label: sec.label, check: !!eff.type && sec.types.includes(eff.type), fn: () => mutate(cv => { freezeOrder(); const q = cv.selected.find(z => z.itemId === id); q.own = Object.assign({}, q.own || {}, { type: sec.types[0] }); }) }));
    if (s.own) { secs.push('-'); secs.push({ label: 'Put back to its original place', fn: () => mutate(cv => { delete cv.selected.find(z => z.itemId === id).own; }) }); }
    entries.push({ label: 'Move to section', sub: secs });
    const g = el.closest ? el.closest('[data-gid][data-ids]') : null;
    if (g && g.dataset.ids.split(',').filter(Boolean).length > 1) { const gid = g.dataset.gid; entries.push({ label: 'Keep together', check: !!K.flagOf(gid).keep, keep: true, fn: () => K.toggleKeep(gid) }); }
    entries.push('-');
    entries.push({ label: 'Remove from this CV', fn: () => removeItem(id) });
    ctxMenu(x, y, entries);
  }
  function keepMenu(gid, x, y) { ctxMenu(x, y, [{ label: 'Keep together', check: !!K.flagOf(gid).keep, keep: true, fn: () => K.toggleKeep(gid) }]); }

  // ---------- zoom ----------
  const zoomNow = () => E().zoom || 1;
  // zoom so the point under the cursor stays under the cursor (pinch / Ctrl+wheel)
  function zoomAt(sx, sy, factor) {
    const z = zoomNow(); const sr = stage.getBoundingClientRect(); const cx = (sx - sr.left) / z, cy = (sy - sr.top) / z;
    E().fit = 'manual'; E().zoom = Math.max(.3, Math.min(2.5, z * factor)); applyFit();
    const sr2 = stage.getBoundingClientRect(); wrap.scrollLeft += sr2.left + cx * E().zoom - sx; wrap.scrollTop += sr2.top + cy * E().zoom - sy;
  }
  const pinchFactor = (e) => Math.exp(-e.deltaY * (e.deltaMode ? 0.02 : 0.0035));

  // ---------- shared with the other editor files (editor-left, editor-right, editor-export, editor-template) ----------
  const K = App.edKit = {
    E, mutate, applyFit, cvOrder, isChosen, moveBlock, moveLine, schedulePreview, selEntry, startInline, textFor, scheduleSave, pushToRepo, zoomNow,
    get iframe() { return iframe; }, get stage() { return stage; }, get wrap() { return wrap; }, get leftEl() { return leftEl; }, get rightEl() { return rightEl; },
    get listEl() { return listEl; }, set listEl(v) { listEl = v; }, get customFull() { return customFull; }, get saved() { return saved; }, set saved(v) { saved = v; }
  };
})();
