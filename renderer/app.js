'use strict';
(function () {
  const { h, $, clear, call, tryCall, toast, ctxMenu, icon } = UI;
  const S = App.state;
  const TABS = [['browse', 'Home', 'home'], ['repo', 'Repository', 'folder'], ['editor', 'Editor', 'edit'], ['review', 'Review', 'review'], ['import', 'Import', 'inbox']];
  S.tab = 'browse'; S.items = []; S.byId = {}; S.cvs = []; S.templates = []; S.cv = null;
  S.repo = { sort: 'date', dir: 'desc', star: 'all', arch: 'not', group: 'all', view: 'timeline', q: '', sel: new Set(), merge: false };
  S.editor = { panelOpen: false, blockMode: true, block: null, panelView: 'selection', showMode: 'all', cursor: null, zoom: 1, fit: 'width', mode: 'cv', rightOpen: true, view: 'stack', rtab: 'template', ps: { sort: 'date-desc', group: 'all' } };

  App.reloadItems = async function () { S.items = await call('items.list'); S.byId = Object.fromEntries(S.items.map(i => [i.id, i])); };
  App.reloadCvs = async function () { S.cvs = await call('cv.list'); };
  App.reloadTemplates = async function () { S.templates = await call('templates.list'); };
  App.reloadSettings = async function () { S.settings = await call('settings.get'); applyTheme(); };
  App.saveSettings = async function (patch) { S.settings = await call('settings.set', patch); applyTheme(); if (patch && patch.header && patch.header.photo !== undefined) App.refreshAvatar(); return S.settings; };
  function applyTheme() { const t = (S.settings && S.settings.theme) || 'dark'; document.documentElement.setAttribute('data-theme', t === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t); if (App.renderChrome) App.renderChrome(); }
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (S.settings && S.settings.theme === 'auto') { applyTheme(); if (S.tab === 'settings' && App.tabs.settings.refresh) App.tabs.settings.refresh(); } }); } catch (e) { /* ignore */ }

  // ---------- zoom (Ctrl + / Ctrl -) ----------
  let zoom = 1;
  function setZoom(z) {
    zoom = Math.max(.6, Math.min(2, Math.round(z * 100) / 100));
    if (window.cvDesktop && window.cvDesktop.setZoom) window.cvDesktop.setZoom(zoom); else document.body.style.zoom = zoom;
    try { localStorage.setItem('cvb.zoom', String(zoom)); } catch (e) { /* ignore */ }
    toast('Zoom ' + Math.round(zoom * 100) + '%', { ms: 900 });
  }
  try { const z = parseFloat(localStorage.getItem('cvb.zoom')); if (z) { zoom = z; if (window.cvDesktop && window.cvDesktop.setZoom) window.cvDesktop.setZoom(z); else document.body.style.zoom = z; } } catch (e) { /* ignore */ }

  // ---------- chrome ----------
  const view = () => $('#view');
  let brandKey = '', navBuilt = false;
  function renderChrome() {
    const lk = Logo.current(); if (brandKey !== lk) { brandKey = lk; Logo.applyWindowIcon(); const brand = clear($('#brand')); brand.append(Logo.el(lk, 30), h('span', null, 'Dossier')); brand.onclick = null; }
    const nav = $('#tabs');
    if (!navBuilt) {   // built once; afterwards only the highlight moves, so nothing flickers when switching
      navBuilt = true; const keep = nav.querySelector('.ind') || h('div', { class: 'ind' }); clear(nav); nav.append(keep);
      TABS.forEach(([k, l, ic]) => nav.append(h('button', { 'data-k': k, onclick: () => { if (S.tab !== k) App.go(k); else if (k === 'browse' && App.tabs.browse.cycle) App.tabs.browse.cycle(); } }, icon(ic), h('span', null, l))));
    }
    TABS.forEach(([k, l, ic]) => { const b = nav.querySelector('button[data-k="' + k + '"]'); const on = S.tab === k; if (b && b._on !== on) { b._on = on; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); b.firstChild.replaceWith(icon(ic, { filled: on })); } });
    document.querySelectorAll('#topbar > button[data-tip]').forEach(b => { if (!b.getAttribute('aria-label') && !b.textContent.trim()) b.setAttribute('aria-label', b.dataset.tip); });
    moveInd(); renderTopActions();
    const gear = $('#btnGear'), on = S.tab === 'settings';
    if (gear._on !== on) { gear._on = on; clear(gear).append(icon('gear', { filled: on })); gear.classList.toggle('on', on); }
    gear.onclick = () => { if (S.tab !== 'settings') App.go('settings'); };
    const pb = $('#btnProfile'); pb.onclick = () => { if (document.querySelector('.pfmenu')) document.querySelectorAll('.pfmenu').forEach(x => x.remove()); else openProfileMenu(); };
    const plus = $('#btnPlus'); if (!plus.firstChild) plus.append(icon('plus'));
    plus.onclick = () => { const r = plus.getBoundingClientRect(); ctxMenu(r.right - 220, r.bottom + 8, [{ header: 'Create' }].concat(S.tab === 'repo' ? [] : [{ label: 'New entry...', fn: () => App.newEntry() }]).concat([{ label: 'New CV...', fn: () => App.newCV() }, { label: 'New application...', fn: () => App.tabs.browse.addApplication() }, '-', { label: 'Import a CV or LinkedIn export...', fn: () => App.go('import') }])); };
  }
  App.renderChrome = () => renderChrome();

  // ---------- global profiles (each profile is a complete, separate set of entries, CVs, applications and details) ----------
  let pfData = null;
  const avatarEl = (p, size) => { const el = h('span', { class: 'pfav', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * .46) + 'px' } }); if (p.photo) el.append(h('img', { src: p.photo, alt: '' })); else el.textContent = (p.name || '?').trim().charAt(0).toUpperCase(); return el; };
  App.refreshAvatar = async function () {
    const btn = $('#btnProfile'); if (!btn || !S.root) return;
    pfData = await tryCall('profiles.list', {}, true); if (!pfData) return;
    App.profileId = pfData.active;
    App.profileList = pfData.list;
    const a = pfData.list.find(x => x.id === pfData.active) || pfData.list[0]; clear(btn).append(avatarEl(a, 30)); btn.dataset.tip = 'Profile: ' + a.name;
  };
  async function reloadAll() { S.cv = null; await Promise.all([App.reloadSettings(), App.reloadItems(), App.reloadCvs(), App.reloadTemplates()]); await App.refreshAvatar(); if (App.tabs.import && App.tabs.import.profileChanged) App.tabs.import.profileChanged(); App.go('browse'); }
  async function switchTo(id) { await call('profiles.switch', { id }); await reloadAll(); }
  function openProfileMenu() {
    document.querySelectorAll('.pfmenu').forEach(x => x.remove()); if (!pfData) return;
    const btn = $('#btnProfile'), r = btn.getBoundingClientRect();
    const m = h('div', { class: 'pfmenu', style: { top: (r.bottom + 8) + 'px', right: Math.max(8, innerWidth - r.right) + 'px' } });
    const close = () => { m.remove(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', esc, true); };
    const off = (e) => { if (!m.contains(e.target) && !btn.contains(e.target)) close(); }; const esc = (e) => { if (e.key === 'Escape' && !m.querySelector('input')) close(); };
    const list = pfData.list.slice().sort((a, b) => (b.id === pfData.active) - (a.id === pfData.active));
    let pendingDup = null;
    const draw = () => {
      clear(m);
      list.forEach(p => {
        const row = h('div', { class: 'pfrow' + (p.id === pfData.active ? ' cur' : ''), 'data-tip': 'Right-click to rename', oncontextmenu: (e) => { e.preventDefault(); UI.promptBox('Rename profile', 'Name', p.name).then(async n => { if (n && n.trim()) { await call('profiles.rename', { id: p.id, name: n.trim() }); await App.refreshAvatar(); p.name = n.trim(); draw(); } }); } }, avatarEl(p, 30), h('span', { class: 'pfname' }, p.name), p.id === pfData.active ? h('span', { class: 'pfcheck' }, '✓') : null);
        const dup = h('button', { class: 'icon-btn sm', 'data-tip': 'Duplicate', onclick: (e) => { e.stopPropagation(); pendingDup = p.id; draw(); } }, UI.icon('copy', { size: 14 }));
        const del = list.length < 2 ? null : h('button', { class: 'icon-btn sm', 'data-tip': 'Delete', onclick: async (e) => { e.stopPropagation(); if (!await UI.confirmBox('Delete profile "' + p.name + '"?', 'All its entries, CVs, applications and details in its folder are deleted permanently.', 'Delete profile', true)) return; try { await call('profiles.delete', { id: p.id }); close(); await reloadAll(); } catch (er) { toast(er.message, { err: true }); } } }, UI.icon('trash', { size: 14 }));
        row.append(h('span', { class: 'pfacts' }, dup, del));
        row.onclick = async () => { if (row.querySelector('input')) return; close(); if (p.id !== pfData.active) await switchTo(p.id); };
        m.append(row);
        if (pendingDup === p.id) {   // the copy appears right below the original, name already in edit mode
          const inp = h('input', { type: 'text', value: p.name + ' copy', class: 'pfedit' });
          const nrow = h('div', { class: 'pfrow cur pfnewrow' }, avatarEl(p, 30), inp); m.append(nrow);
          setTimeout(() => { inp.focus(); inp.select(); try { nrow.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }, 0); let done = false;
          const ok = async () => { if (done) return; done = true; const n = inp.value.trim() || (p.name + ' copy'); const b = UI.busy('Duplicating profile...', { note: '' }); try { await call('profiles.create', { name: n, from: p.id }); close(); await reloadAll(); } catch (er) { toast(er.message, { err: true }); } finally { b.remove(); } };
          inp.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') ok(); else if (ev.key === 'Escape') { done = true; pendingDup = null; draw(); } }; inp.onblur = () => { if (!done) ok(); }; inp.onclick = (ev) => ev.stopPropagation();
        }
      });
      m.append(h('div', { class: 'pfsep' }), h('button', { class: 'pfnew', onclick: async () => { close(); const n = await UI.promptBox('New profile', 'Name for the new, empty profile', ''); if (!n || !n.trim()) return; await call('profiles.create', { name: n.trim() }); await reloadAll(); } }, UI.icon('plus', { size: 16 }), 'New profile'));
    };
    draw(); document.body.append(m); setTimeout(() => { document.addEventListener('mousedown', off, true); document.addEventListener('keydown', esc, true); }, 0);
  }
  let topKey = '', ghost = null;
  const nodeOf = (a, ta) => {
    const b = h('button', { class: a.label ? 'btn small' + (a.cls ? ' ' + a.cls : '') : 'icon-btn', 'data-tip': a.tip, onclick: () => a.fn(b) }, icon(a.icon), a.label ? h('span', null, a.label) : null);
    if (a.drop) { const d = h('button', { class: 'btn small ' + (a.cls || '') + ' dropbtn', 'data-tip': 'More: ATS check and export options', onclick: () => a.drop(grp) }, icon('chevD')); const grp = h('div', { class: 'splitbtn' }, b, d); return grp; }
    return b;
  };
  const natW = (ta) => { const w = ta.style.width, t = ta.style.transition; ta.style.transition = 'none'; ta.style.width = 'max-content'; const n = ta.offsetWidth; ta.style.width = w; void ta.offsetWidth; ta.style.transition = t; return n; };
  const dropGhost = () => { if (ghost) { try { ghost.getAnimations().forEach(x => x.cancel()); } catch (e) { /* ignore */ } ghost.remove(); ghost = null; } };
  // Closing: the buttons are lifted into a picture-like overlay that wipes away on the compositor (clip-path / opacity / transform), while the real strip
  // collapses at once. Nothing in the animation needs layout, so heavy work on the next tab cannot make it stutter.
  function closeStrip(withChevron) {
    const ta = $('#topActions'), cb = $('#btnCollapse'), tb = $('#topbar'); const W = ta.offsetWidth; dropGhost();
    if (!W || !ta.childNodes.length) return;
    const tr = ta.getBoundingClientRect(), br = tb.getBoundingClientRect(), cr = cb.getBoundingClientRect(); const pl = $('#btnPlus'), p0 = pl.getBoundingClientRect().left;
    ghost = h('div', { class: 'tghost', style: { left: (tr.left - br.left) + 'px', top: (tr.top - br.top) + 'px', height: tr.height + 'px', width: (withChevron ? cr.right - tr.left : W) + 'px' } });
    while (ta.firstChild) ghost.append(ta.firstChild);
    if (withChevron) { const c = cb.cloneNode(true); c.style.cssText = 'position:absolute;left:' + (cr.left - tr.left) + 'px;top:' + (cr.top - tr.top) + 'px;margin:0;opacity:1;width:30px'; ghost.append(c); }
    tb.append(ghost);
    ta.style.transition = 'none'; ta.style.width = '0px'; ta.classList.remove('open'); topKey = '';
    if (withChevron) { cb.style.transition = 'none'; cb.classList.remove('show'); }
    void ta.offsetWidth; ta.style.transition = ''; cb.style.transition = '';
    const g = ghost; const EASE = 'cubic-bezier(.4,0,.2,1)', DUR = 430;
    // the + button slides over to its new place while the old buttons are swept away from the left, right behind it
    const an = g.animate([{ clipPath: 'inset(0 0 0 0)', opacity: 1 }, { clipPath: 'inset(0 0 0 100%)', opacity: .2 }], { duration: DUR, easing: EASE, fill: 'forwards' });
    an.onfinish = () => { if (ghost === g) dropGhost(); };
    const dx = p0 - pl.getBoundingClientRect().left; if (dx) pl.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'none' }], { duration: DUR, easing: EASE });
  }
  // The action buttons grow out of the + button and shrink back into it. Switching between tabs that both have actions keeps the strip open:
  // its width glides from the old size to the new one while the buttons change (Refine becomes Export and the rest slide in).
  function renderTopActions() {
    const ta = $('#topActions'), cb = $('#btnCollapse'); if (!ta) return;
    const t = App.tabs[S.tab]; const acts = t && t.topActions && S.root ? t.topActions() : [];
    const key = S.tab + ':' + acts.map(a => a.icon).join(',');
    if (acts.length) {
      const open = !S.topCollapsed;
      if (!open && ta.childNodes.length && ta.offsetWidth) { closeStrip(false); clear(cb).append(icon('chevL')); cb.onclick = () => { S.topCollapsed = !S.topCollapsed; renderTopActions(); }; cb.classList.add('show'); return; }
      dropGhost();
      if (key !== topKey) {
        const had = ta.childNodes.length > 0 && ta.classList.contains('open'); const prevW = had ? ta.offsetWidth : 0;
        ta.style.transition = 'none'; clear(ta); acts.forEach(a => { const n = nodeOf(a, ta); n.classList.add('tin'); ta.append(n); }); topKey = key;
        const nat = natW(ta); ta.style.width = prevW + 'px'; void ta.offsetWidth; ta.style.transition = '';
        ta.classList.toggle('open', open); cb.classList.add('show');
        clear(cb).append(icon(S.topCollapsed ? 'chevL' : 'chevR')); cb.onclick = () => { S.topCollapsed = !S.topCollapsed; renderTopActions(); };
        requestAnimationFrame(() => { ta.style.width = (open ? nat : 0) + 'px'; });
      } else {
        clear(cb).append(icon(S.topCollapsed ? 'chevL' : 'chevR')); cb.onclick = () => { S.topCollapsed = !S.topCollapsed; renderTopActions(); };
        ta.classList.toggle('open', open); cb.classList.add('show'); const nat = natW(ta); requestAnimationFrame(() => { ta.style.width = (open ? nat : 0) + 'px'; });
      }
    } else if (ta.childNodes.length && ta.offsetWidth) closeStrip(true);
    else { cb.classList.remove('show'); dropGhost(); }
  }
  App.renderTopActions = renderTopActions;
  function moveInd() {
    const nav = $('#tabs'); const ind = nav.querySelector('.ind'); const on = nav.querySelector('button.on');
    if (!on) { ind.style.width = '0px'; return; }
    ind.style.left = on.offsetLeft + 'px'; ind.style.width = on.offsetWidth + 'px';
  }
  window.addEventListener('resize', moveInd);

  App.go = function (tab, arg) {
    if (tab === 'linkedin') tab = 'import';
    if (!S.root) return showGate();
    // the LinkedIn window cannot be captured for a cross-fade, so Import and Settings fade the page itself out and back in
    const heavy = tab === 'import' || S.tab === 'import' || tab === 'settings' || S.tab === 'settings';
    // every change of tab fades the page out and back in (the browser's own cross-fade did not run reliably on every PC)
    const fadeSwap = async (fn) => { const v = view(); try { if (v && v.animate && !document.hidden) await v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' }).finished; await fn(); if (v && v.getAnimations) { v.getAnimations().forEach(a => a.cancel()); v.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); } } catch (e) { await fn(); } };
    return (tab !== S.tab ? fadeSwap : heavy ? (fn) => fn() : UI.transition)(async () => {
      const prev = App.tabs[S.tab]; if (prev && prev.leave && tab !== S.tab) prev.leave();
      S.tab = tab;
      renderChrome();
      const v = view(); clear(v);
      const t = App.tabs[tab];
      if (t) await t.render(v, arg);
    });
  };
  App.newEntry = function () { App.go('repo'); setTimeout(() => App.tabs.repo.openNew && App.tabs.repo.openNew(), 30); };
  App.newCV = function () { return App.newCvModal(); };
  App.openCV = async function (id) {
    const cv = await tryCall('cv.get', { id });
    if (!cv) return;
    S.cv = cv; S.editor.cursor = null; S.editor.block = null; S.editor.mode = 'cv';
    App.go('editor');
  };
  App.openCvPicker = App.newCV;

  // ---------- working-folder gate (blocks everything until a folder is chosen) ----------
  function showGate() {
    App._gate = true;
    const g = $('#gate'); clear(g);
    g.append(h('div', { class: 'box' }, h('div', { class: 'gatelogo' }, Logo.el('flat', 84)), h('h1', null, 'Choose your working folder'),
      h('p', { class: 'muted', style: { lineHeight: 1.6 } }, 'Everything you create (entries, CVs, imports, exports, backups) is stored in one folder as plain files, so you can back it up or move it like any other folder. Pick an empty folder, or the one you used before.'),
      h('div', { class: 'sp' }), h('button', { class: 'btn primary', style: { padding: '11px 26px', fontSize: '15px' }, onclick: chooseFolder }, icon('folder'), 'Choose working folder...'),
      !window.cvDesktop ? h('div', { class: 'card', style: { marginTop: '18px', textAlign: 'left' } }, h('p', { class: 'small muted' }, 'Browser test mode: type a folder path on the server.'), h('div', { class: 'row' }, h('input', { id: 'wsPath', type: 'text', style: { flex: 1 }, placeholder: '/path/to/folder' }), h('button', { class: 'btn', onclick: () => { const v = $('#wsPath').value.trim(); if (v) openFolder(v); } }, 'Open'))) : null));
    g.classList.add('on'); if (window.hideSplash) window.hideSplash();
  }
  async function chooseFolder() { if (!window.cvDesktop) return; const f = await window.cvDesktop.pickFolder(); if (f) openFolder(f); }
  async function openFolder(folder) { const r = await tryCall('workspace.open', { folder }); if (r) { $('#gate').classList.remove('on'); await start(); } return !!r; }
  App.changeFolder = async function () { const f = window.cvDesktop ? await window.cvDesktop.pickFolder() : await UI.promptBox('Working folder', 'Folder path'); if (f) { const prev = S.cv; S.cv = null; if (!await openFolder(f)) S.cv = prev; } };

  // Tell the person when damaged files were set aside or data from a newer version was found.
  // Last-resort safety net: an unexpected error in the window shows one calm message (not a frozen screen) and is logged.
  let lastErr = 0;
  const onFatal = (msg) => {
    const now = Date.now(); if (now - lastErr < 4000) return; lastErr = now;
    try { toast('Something went wrong (' + String(msg).replace(/^Error:\s*/, '').slice(0, 90) + '). Your data is safe. If it keeps happening, restart Dossier.', { err: true }); } catch (e) { /* the UI itself is broken */ }
    try { tryCall('app.logError', { message: msg, source: location.pathname }, true); } catch (e) { /* offline log only */ }
  };
  // harmless browser noise that is not an app problem: layout observers and animations that were interrupted by another one
  const benign = (m, name) => /ResizeObserver|Transition was (skipped|aborted)|The operation was aborted|AbortError/i.test(String(m)) || name === 'AbortError';
  window.addEventListener('error', (ev) => { if (ev && ev.message && !benign(ev.message)) onFatal(ev.message); });
  window.addEventListener('unhandledrejection', (ev) => { const r = ev && ev.reason; if (benign(r && r.message ? r.message : r, r && r.name)) { ev.preventDefault(); return; } onFatal(r && r.message ? r.message : String(r)); });
  App.showNotices = async function () {
    const list = await tryCall('workspace.notices', {}, true); if (!Array.isArray(list) || !list.length) return;
    const bad = list.filter(n => n.kind === 'recovered'), newer = list.filter(n => n.kind === 'newer');
    if (bad.length) toast(bad.length + (bad.length === 1 ? ' file was' : ' files were') + ' damaged and moved to the "quarantine" folder in your working folder. Nothing was deleted.', { err: true });
    if (newer.length) toast(newer.length + ' file(s) were saved by a newer version of Dossier. Update the app before editing them.', { err: true });
  };
  async function start() {
    const st = await call('workspace.state'); S.root = st.root;
    if (!S.root) { renderChrome(); showGate(); return; }
    $('#gate').classList.remove('on');
    await Promise.all([App.reloadSettings(), App.reloadItems(), App.reloadCvs(), App.reloadTemplates()]); App.refreshAvatar();
    App.showNotices();
    const first = App._gate; App._gate = false;
    await App.go(first ? 'repo' : 'browse'); if (window.hideSplash) window.hideSplash();   // the very first start (after choosing the working folder) opens the Repository
  }

  // ---------- drag & drop import anywhere ----------
  let dragDepth = 0;
  window.addEventListener('mousemove', () => { if (App.internalDrag && Date.now() - App.internalDrag > 600) App.internalDrag = 0; });
  window.addEventListener('dragenter', (e) => { if (App.internalDrag) return; if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#dropveil div').textContent = App.dropHandler ? 'Drop the file here to attach it' : 'Drop CV files here to import them'; $('#dropveil').classList.add('on'); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropveil').classList.remove('on'); });
  window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    dragDepth = 0; $('#dropveil').classList.remove('on');
    if (App.internalDrag) { e.preventDefault(); App.internalDrag = 0; return; }
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault(); if (!S.root) return;
    const fl = await UI.fromDropped(e.dataTransfer.files);
    if (App.dropHandler && await App.dropHandler(fl)) return;
    if (S.tab === 'import' && App.tabs.import.runFiles) App.tabs.import.runFiles(fl); else App.go('import', { files: fl });
  });

  // ---------- paste a copied file (from the desktop, Explorer or a browser download) anywhere to import it ----------
  window.addEventListener('paste', async (e) => {
    const files = e.clipboardData && e.clipboardData.files; if (!files || !files.length || !S.root) return;
    if (App.pasteHandler && await App.pasteHandler(files)) { e.preventDefault(); return; }
    e.preventDefault();
    const fl = await UI.fromDropped(files);
    if (S.tab === 'import' && App.tabs.import.runFiles) App.tabs.import.runFiles(fl); else App.go('import', { files: fl });
  });

  // ---------- keyboard ----------
  const ORDER = ['browse', 'repo', 'editor', 'review', 'import', 'settings'];
  function cycleTab(shift) { const i = Math.max(0, ORDER.indexOf(S.tab)); App.go(ORDER[(i + (shift ? ORDER.length - 1 : 1)) % ORDER.length]); }
  // keys pressed while the LinkedIn window has focus are forwarded here by the desktop shell
  if (window.cvDesktop && window.cvDesktop.onKey) window.cvDesktop.onKey((k) => { if (!S.root) return; if (k.key === 'Tab') cycleTab(k.shift); else if (/^[1-6]$/.test(k.key)) App.go(ORDER[+k.key - 1]); });
  const typing = (ev) => { const a = ev && ev.target && ev.target.nodeType === 1 ? ev.target : document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable); };
  App.typing = typing;
  const onKey = (e) => {
    const ctrl = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
    if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); return setZoom(zoom + .1); }
    if (ctrl && (e.key === '-' || e.key === '_')) { e.preventDefault(); return setZoom(zoom - .1); }
    if (ctrl && e.key === '0') { e.preventDefault(); return setZoom(1); }
    if (!S.root) return;
    if (ctrl && e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey); return; }
    if (ctrl && !e.shiftKey && k === 'n') { e.preventDefault(); App.newCV(); }
    else if (ctrl && !e.shiftKey && k === 'o') { e.preventDefault(); App.go('browse'); }
    else if (ctrl && e.shiftKey && k === 'n') { e.preventDefault(); App.newEntry(); }
    else if (ctrl && !e.shiftKey && k === 's') { e.preventDefault(); if (S.tab === 'editor' && App.tabs.editor.saveNow) App.tabs.editor.saveNow(true); }
    else if (ctrl && e.shiftKey && k === 's') { e.preventDefault(); if (S.cv) tryCall('cv.duplicate', { id: S.cv.id }).then(async c => { if (c) { await App.reloadCvs(); const fp = await tryCall('cv.filePath', { id: c.id }); toast('Saved a copy: ' + c.name, { actions: [{ label: 'Open', fn: () => App.openCV(c.id) }].concat(fp && fp.file ? [{ label: 'Show', fn: () => UI.showInFolder(fp.file) }] : []) }); } }); }
    else if (ctrl && !e.shiftKey && k === 'e') { e.preventDefault(); if (S.cv) { App.go('editor'); setTimeout(() => App.tabs.editor.exportClick && App.tabs.editor.exportClick(), 50); } }
    else if (ctrl && !e.shiftKey && k === 'i') { e.preventDefault(); App.go('import'); }
    else if (ctrl && !e.shiftKey && k === 'f') { const s = $('[data-role=search]'); if (s) { e.preventDefault(); s.focus(); s.select(); } }
    else if (ctrl && !e.shiftKey && k === 'z' && S.tab === 'editor' && !typing(e)) { e.preventDefault(); App.tabs.editor.undo && App.tabs.editor.undo(); }
    else if (ctrl && (k === 'y' || (e.shiftKey && k === 'z')) && S.tab === 'editor' && !typing(e)) { e.preventDefault(); App.tabs.editor.redo && App.tabs.editor.redo(); }
    else if (ctrl && !e.shiftKey && k === 'q') { e.preventDefault(); if (S.tab === 'editor') App.tabs.editor.togglePanel && App.tabs.editor.togglePanel(); }
    else if (ctrl && !e.shiftKey && k === 'p') { e.preventDefault(); if (S.cv) { App.go('editor'); setTimeout(() => App.tabs.editor.printPreview && App.tabs.editor.printPreview(), 50); } }
    else if (ctrl && !e.shiftKey && /^[1-6]$/.test(k)) { e.preventDefault(); App.go(['browse', 'repo', 'editor', 'review', 'import', 'settings'][+k - 1]); }
    else if (e.key === 'Delete' && !typing(e) && S.tab === 'repo' && App.tabs.repo.deleteSelected) { App.tabs.repo.deleteSelected(); }
    else if (e.key === 'Delete' && !typing(e) && S.tab === 'editor' && App.tabs.editor.deleteCursor) { e.preventDefault(); App.tabs.editor.deleteCursor(); }
  };
  App.onKey = onKey; window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', (e) => { if (e.ctrlKey && !window.cvDesktop) { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? .1 : -.1)); } }, { passive: false });

  let booted = false;
  const boot = () => { if (booted) return; booted = true; renderChrome(); start().catch(e => { console.error(e); toast('Startup failed: ' + e.message, { err: true }); }); };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
})();
