'use strict';
(function () {
  const { h, $, clear, call, tryCall, toast } = UI;
  const M = window.CVModel, R = window.CVReview;
  const S = App.state;
  const T = App.tabs.review = {};
  let cvId = null, mode = 'checks', cmpB = null, root, shell, layout = 'split', pv = null;
  const TP = window.CVTemplates;
  const DEF_W = 50, ALT_W = 33.333;
  // zoom, fit mode and scroll position survive leaving the tab (Settings, Home...) and coming back
  const memo = { fit: '100', zoom: 1, vmode: 'stack', sx: 0, sy: 0, cvId: null, restore: false, mode: '' };
  // opening size depends on how much room the preview has: full screen = 1:1, half = fit width, third = fit one page
  const sizeMode = () => (layout === 'full' ? 'full' : (getW() < 40 ? 'third' : 'half'));
  const DEF_FIT = { full: '100', half: 'width', third: 'page' };
  const getW = () => { try { const v = parseFloat(localStorage.getItem('cvb.rvw2')); return v > 18 && v < 70 ? v : DEF_W; } catch (e) { return DEF_W; } };

  // ---------- read-only page preview (zoom, scroll, no editing) ----------
  function pagePreview(opts) {
    opts = opts || {};
    const wrap = h('div', { class: 'pvwrap', tabindex: '0' }), inner = h('div', { class: 'pvin' }), stage = h('div', { class: 'pvstage' });
    const fr = h('iframe', { sandbox: 'allow-same-origin', title: 'CV preview' }); stage.append(fr); inner.append(stage); wrap.append(inner);
    let fit = memo.fit, zoom = memo.zoom, dim = { w: 822, h: 1151, page: 1151 }, pages = 1, lastCv = null, vmode = opts.sideOption ? memo.vmode : 'stack';
    const clampZ = z => Math.max(.2, Math.min(3, z || 1));
    let tween = 0;
    const apply = (keep, anim) => {
      const old = keep ? { x: (wrap.scrollLeft + wrap.clientWidth / 2) / (dim.w * zoom), y: (wrap.scrollTop + wrap.clientHeight / 2) / (dim.h * zoom) } : null;
      const fw = (wrap.clientWidth - 24) / dim.w, fh = (wrap.clientHeight - 24) / dim.page;
      if (fit === 'page') zoom = Math.min(fw, fh); else if (fit === 'width') zoom = fw; else if (fit === '100') zoom = 1;
      zoom = clampZ(zoom);
      const l0 = wrap.scrollLeft, t0 = wrap.scrollTop;
      if (anim) { stage.classList.add('zanim'); clearTimeout(stage._za); stage._za = setTimeout(() => stage.classList.remove('zanim'), 320); }
      fr.style.transform = 'scale(' + zoom + ')'; fr.style.transformOrigin = 'top left'; stage.style.width = dim.w * zoom + 'px'; stage.style.height = dim.h * zoom + 'px';
      if (old) {
        const tl = old.x * dim.w * zoom - wrap.clientWidth / 2, tt = old.y * dim.h * zoom - wrap.clientHeight / 2;
        if (!anim) { wrap.scrollLeft = tl; wrap.scrollTop = tt; }
        else { cancelAnimationFrame(tween); const st = performance.now(); const step = (now) => { const k = Math.min(1, (now - st) / 260), e = 1 - Math.pow(1 - k, 3); wrap.scrollLeft = l0 + (tl - l0) * e; wrap.scrollTop = t0 + (tt - t0) * e; if (k < 1) tween = requestAnimationFrame(step); }; tween = requestAnimationFrame(step); }
      }
      lab.textContent = Math.round(zoom * 100) + '%'; memo.fit = fit; memo.zoom = zoom; drawFit();
    };
    new ResizeObserver(() => { if (fit !== 'manual') apply(); }).observe(wrap);
    wrap.addEventListener('scroll', () => { if (!wrap.dataset.hold) { memo.sx = wrap.scrollLeft; memo.sy = wrap.scrollTop; } });
    const setZoom = (z) => { fit = 'manual'; zoom = clampZ(z); apply(true, true); };
    // wheel: plain wheel always scrolls (also sideways when pages sit side by side); pinch / ctrl+wheel zooms gently
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) { const sr = stage.getBoundingClientRect(); const cx = (e.clientX - sr.left) / zoom, cy = (e.clientY - sr.top) / zoom; fit = 'manual'; zoom = clampZ(zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.02 : 0.0035))); apply(false); const s2 = stage.getBoundingClientRect(); wrap.scrollLeft += s2.left + cx * zoom - e.clientX; wrap.scrollTop += s2.top + cy * zoom - e.clientY; return; }
      const k = e.deltaMode === 1 ? 32 : 1; const noV = wrap.scrollHeight <= wrap.clientHeight + 1;
      if (noV && !e.deltaX) wrap.scrollLeft += e.deltaY * k; else { wrap.scrollTop += e.deltaY * k; wrap.scrollLeft += e.deltaX * k; }
    }, { passive: false });
    // drag to pan
    wrap.addEventListener('mousedown', e => { if (e.button !== 0 || e.target.closest('.pvtools')) return; const sx = e.clientX, sy = e.clientY, l = wrap.scrollLeft, t = wrap.scrollTop; wrap.classList.add('pan'); const mv = ev => { wrap.scrollLeft = l - (ev.clientX - sx); wrap.scrollTop = t - (ev.clientY - sy); }; const up = () => { wrap.classList.remove('pan'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); });
    wrap.addEventListener('keydown', e => { const m = { ArrowDown: [0, 60], ArrowUp: [0, -60], ArrowRight: [60, 0], ArrowLeft: [-60, 0], PageDown: [0, wrap.clientHeight * .9], PageUp: [0, -wrap.clientHeight * .9] }[e.key]; if (m) { e.preventDefault(); wrap.scrollLeft += m[0]; wrap.scrollTop += m[1]; } });
    const zb = (ic, tip, fn) => h('button', { class: 'icon-btn pvb', 'data-tip': tip, onclick: fn }, UI.icon(ic));
    const lab = h('span', { class: 'pvlab' }, '100%');
    const modeBtn = opts.sideOption ? h('button', { class: 'icon-btn pvb' + (vmode === 'side' ? ' on' : ''), 'data-tip': vmode === 'side' ? 'Show pages one under another' : 'Show pages side by side', onclick: () => { vmode = vmode === 'stack' ? 'side' : 'stack'; memo.vmode = vmode; modeBtn.classList.toggle('on', vmode === 'side'); modeBtn.setAttribute('data-tip', vmode === 'side' ? 'Show pages one under another' : 'Show pages side by side'); fit = 'page'; stage.classList.add('swapin'); if (lastCv) load(lastCv); setTimeout(() => stage.classList.remove('swapin'), 900); } }, UI.icon('blocks')) : null;
    // one button that cycles 1:1 > fit width > fit one page
    const CYC = ['100', 'width', 'page'], CYC_L = { '100': 'Actual size (1:1)', width: 'Fit to width', page: 'Fit one page', manual: 'Zoomed by hand' };
    const fitBtn = h('button', { class: 'icon-btn pvb', onclick: () => { const nx = CYC[(CYC.indexOf(fit) + 1) % CYC.length]; fit = nx === fit ? CYC[0] : nx; apply(true, true); } });
    function drawFit() { const nx = CYC[(CYC.indexOf(fit) + 1) % CYC.length]; clear(fitBtn); if (fit === '100') fitBtn.append(h('span', { class: 'fit11' }, '1:1')); else fitBtn.append(UI.icon(fit === 'width' ? 'fitW' : 'fit')); fitBtn.setAttribute('data-tip', (CYC_L[fit] || 'Fit') + '. Click for ' + CYC_L[fit === 'manual' ? '100' : nx] + '.'); }
    const tools = h('div', { class: 'pvtools' }, modeBtn, zb('zoomIn', 'Zoom in', () => setZoom(zoom * 1.15)), lab, zb('zoomOut', 'Zoom out', () => setZoom(zoom / 1.15)), fitBtn);
    const el = h('div', { class: 'pv' }, wrap, tools);
    async function load(cv) {
      lastCv = cv;
      if (!cv) { fr.srcdoc = ''; return; }
      const custom = []; for (const t of S.templates.filter(t => t.custom)) { const full = await tryCall('templates.get', { id: t.id }, true); if (full) custom.push(full); }
      const html = TP.renderDocument(cv, S.items, S.settings, custom, { mode: 'preview' });
      fr.onload = () => {
        const d0 = fr.contentDocument;
        const measure = () => {
          try { const d = fr.contentDocument; const pg = TP.buildModel(cv, S.items, S.settings).page; const r = Pager.apply(d, pg, vmode); pages = r.pages; if (opts.onpages) opts.onpages(pages); fr.style.width = r.width + 'px'; fr.style.height = r.height + 'px'; dim = { w: r.width, h: r.height, page: pg.hpx + 28 }; }
          catch (e) {   // an older CV that the pager cannot read: still show it, scrollable, as one tall page
            console.error(e); try { const d = fr.contentDocument; const w = Math.max(d.documentElement.scrollWidth, 822), hh = Math.max(d.documentElement.scrollHeight, 1151); fr.style.width = w + 'px'; fr.style.height = hh + 'px'; dim = { w, h: hh, page: Math.min(hh, 1151) }; } catch (e2) { /* ignore */ }
          }
          apply(); stage.classList.add('ready');
          if (memo.restore && memo.cvId === cv.id) { wrap.dataset.hold = '1'; wrap.scrollLeft = memo.sx; wrap.scrollTop = memo.sy; setTimeout(() => { delete wrap.dataset.hold; }, 60); } memo.restore = false; memo.cvId = cv.id;
        };
        // measure once the fonts are in (never before, never twice): Pager.apply resets itself, so a later re-measure is safe
        let fontsReady = Promise.resolve(); try { if (d0.fonts && d0.fonts.ready) fontsReady = Promise.race([d0.fonts.ready, new Promise(r => setTimeout(r, 700))]); } catch (e) { /* ignore */ }
        fontsReady.then(() => { if (fr.contentDocument === d0) measure(); });
      };
      stage.classList.remove('ready'); fr.srcdoc = html;
    }
    return { el, load, setFit: (f) => { fit = f; apply(); } };
  }

  App.pagePreview = pagePreview;

  const onEsc = (e) => { if (e.key === 'Escape' && S.tab === 'review' && !document.querySelector('.ovl,.ctx') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) App.go('browse'); };
  document.addEventListener('keydown', onEsc);
  // Top-bar buttons: the same set as the editor (they reuse the editor's own actions), with Edit in place of Review.
  // The reviewed CV becomes the open CV first, so print preview, ATS check and export act on it.
  const useCv = async () => { const cv = cvId ? await tryCall('cv.get', { id: cvId }) : null; if (cv) S.cv = cv; return cv; };
  T.topActions = () => cvId && S.cvs.some(c => c.id === cvId) ? [
    { icon: 'x', tip: 'Close this review and go back to Home', fn: () => App.go('browse') },
    { icon: 'print', tip: 'Print preview', fn: async () => { if (await useCv()) App.tabs.editor.printPreview(); } },
    { icon: 'pencil', tip: 'Edit this CV in the editor', fn: async () => { if (await useCv()) App.go('editor'); } },
    { icon: 'trash', tip: 'Delete this CV', fn: async () => { const cv = await useCv(); if (!cv || !await UI.confirmBox('Delete this CV?', '"' + cv.name + '" moves to the recycle bin (kept for 30 days). Its entries stay in your repository.', 'Delete CV', true)) return; await call('cv.delete', { id: cv.id }); S.cv = null; cvId = null; await App.reloadCvs(); toast('Moved to the recycle bin', { action: { label: 'Undo', fn: async () => { await call('trash.restore', { kind: 'cv', id: cv.id }); await App.reloadCvs(); } } }); App.go('browse'); } },
    { icon: 'upload', label: 'Export', tip: 'Export as PDF, Word, PNG, HTML or JSON (Ctrl+E). The first time for a CV, the ATS check opens first.', cls: 'primary', fn: async () => { if (await useCv()) App.tabs.editor.exportClick(); },
      drop: async (b) => { const r = b.getBoundingClientRect(); if (!await useCv()) return; UI.ctxMenu(r.right - 190, r.bottom + 6, [{ label: 'ATS check', fn: () => App.tabs.editor.atsCheck() }, { label: 'Export options...', fn: () => App.tabs.editor.exportDialog() }]); } }] : [];
  T.render = async function (v, arg) {
    arg = arg || {};
    await App.reloadCvs();
    if (arg.cvId) cvId = arg.cvId; else if (!cvId || !S.cvs.find(c => c.id === cvId)) cvId = S.cv ? S.cv.id : (S.cvs[0] && S.cvs[0].id);
    if (arg.compare) { cvId = arg.compare[0]; cmpB = arg.compare[1]; mode = 'compare'; }
    memo.restore = !!cvId && memo.cvId === cvId && !arg.cvId && !arg.compare;
    if (arg.cvId || arg.compare) memo.mode = '';
    if (arg.full) layout = 'full'; else if (arg.cvId || arg.compare) layout = 'split';
    shell = h('div', { class: 'rv' }); clear(v).append(shell);
    drawShell(); App.renderTopActions();
  };

  let shellTok = 0, drawTok = 0;
  async function drawShell() {
    const tok = ++shellTok; const sh = shell;
    const cv = cvId ? await tryCall('cv.get', { id: cvId }, true) : null;
    if (tok !== shellTok || sh !== shell) return;   // a newer redraw (or another tab) took over while this one loaded
    clear(shell);
    const sel = h('select', { style: { flex: 1, minWidth: 0 }, onchange: () => { cvId = sel.value; drawShell(); } }, S.cvs.length ? S.cvs.map(c => h('option', { value: c.id, selected: c.id === cvId }, c.name)) : [h('option', null, 'No CVs yet')]);
    const modes = [['checks', 'Checks', 'check'], ['compare', 'Compare and diff', 'merge'], ['ai', 'AI critique', 'sparkles']];
    const modeBtns = h('div', { class: 'seg sm' }, modes.map(([k, l, ic]) => h('button', { class: layout === 'split' && mode === k ? 'on' : '', onclick: () => { mode = k; if (layout === 'full') { layout = 'split'; drawShell(); } else { shell.querySelectorAll('.seg button').forEach((b, i) => b.classList.toggle('on', modes[i][0] === k)); draw(); } } }, UI.icon(ic), h('span', null, l))));
    const layBtn = h('button', { class: 'icon-btn boxed', 'data-tip': layout === 'full' ? 'Show the review next to the preview' : 'Show the preview full screen', onclick: () => { layout = layout === 'full' ? 'split' : 'full'; drawShell(); } }, UI.icon(layout === 'full' ? 'panelL' : 'fit'));
    const edBtn = cvId ? h('button', { class: 'btn small', onclick: () => App.openCV(cvId) }, UI.icon('pencil'), 'Open in editor') : null;
    { const m = sizeMode(); if (memo.mode !== m) { memo.mode = m; memo.fit = DEF_FIT[m]; memo.restore = false; } }
    pv = pagePreview({ sideOption: layout === 'full' });
    const head = h('div', { class: 'rvhead' }, h('div', { class: 'row' }, sel, h('div', { class: 'spacer' }), edBtn, layBtn), modeBtns);
    if (!cvId || !cv) { shell.append(h('div', { class: 'empty', style: { margin: 'auto' } }, Logo.el('flat', 72), h('h3', null, 'No CV to review'), h('p', null, 'Create a CV first, or choose one on the home page.'))); return; }
    if (layout === 'full') {
      shell.classList.add('full'); shell.append(h('div', { class: 'lcol', style: { flex: 1 } }, head, pv.el));
    } else {
      shell.classList.remove('full');
      const lcol = h('div', { class: 'lcol', style: { width: getW() + '%' } }, head, pv.el);
      const div = h('div', { class: 'rvdiv', 'data-tip': 'Drag to resize. Double-click to switch between half and one third.' });
      div.onmousedown = (e) => { e.preventDefault(); const total = shell.getBoundingClientRect(); document.body.classList.add('resizing'); const mv = (ev) => { const pct = Math.max(20, Math.min(65, (ev.clientX - total.left) / total.width * 100)); lcol.style.width = pct + '%'; try { localStorage.setItem('cvb.rvw2', String(pct)); } catch (x) { /* ignore */ } }; const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); };
      div.ondblclick = () => { const cur = parseFloat(lcol.style.width) || DEF_W; const nx = Math.abs(cur - DEF_W) < 2 ? ALT_W : DEF_W; lcol.style.width = nx + '%'; try { localStorage.setItem('cvb.rvw2', String(nx)); } catch (x) { /* ignore */ } const m = sizeMode(); memo.mode = m; pv.setFit(DEF_FIT[m]); };
      root = h('div', { class: 'rcol' }); shell.append(lcol, div, root);
      draw();
    }
    pv.load(cv);
  }
  async function draw() {
    const tok = ++drawTok; clear(root);
    if (!cvId) return;
    const cv = await tryCall('cv.get', { id: cvId }); if (!cv || tok !== drawTok) return;
    if (mode === 'checks') drawChecks(cv); else if (mode === 'compare') drawCompare(cv); else drawAI(cv);
  }

  // ---------- local checks ----------
  const KINDS = { gap: ['Dates and structure', 'bad'], overlap: ['Dates and structure', 'info'], 'missing-end': ['Dates and structure', ''], 'no-metric': ['Numbers and metrics', 'tip'], 'weak-verb': ['Writing', ''], tense: ['Writing', ''], 'dup-word': ['Writing', ''], spacing: ['Writing', 'tip'], long: ['Length', ''], short: ['Length', 'tip'], orphan: ['Length', 'tip'] };
  function drawChecks(cv) {
    const res = R.review(cv, S.items);
    const b = res.budget; const target = cv.targetPages || 1;
    const groups = {}; for (const i of res.issues) { const g = (KINDS[i.kind] || ['Other', ''])[0]; (groups[g] = groups[g] || []).push(i); }
    root.append(h('div', { class: 'card', style: { marginBottom: '12px' } }, h('div', { class: 'row' }, h('b', null, 'Line budget'), h('span', { class: 'muted small' }, 'about ' + b.lines + ' of ' + b.budget + ' lines for ' + target + ' page' + (target > 1 ? 's' : '') + ' (estimate; the editor shows the exact page count)'), h('div', { class: 'spacer' }), b.over > 0 ? h('span', { class: 'pill bad' }, b.over + ' lines over') : h('span', { class: 'pill good' }, (b.budget - b.lines) + ' lines spare')), h('div', { class: 'meter' + (b.over > 0 ? ' over' : ''), style: { marginTop: '6px' } }, h('div', { style: { width: Math.min(100, b.lines / b.budget * 100) + '%' } }))));
    const tiles = h('div', { class: 'cols', style: { marginBottom: '12px' } });
    for (const g of ['Dates and structure', 'Numbers and metrics', 'Writing', 'Length']) tiles.append(h('div', { class: 'card' }, h('div', { class: 'muted small' }, g), h('div', { style: { fontSize: '26px', fontWeight: 700, color: (groups[g] || []).length ? 'var(--warn)' : 'var(--good)' } }, (groups[g] || []).length), h('div', { class: 'small muted' }, (groups[g] || []).length ? 'to look at' : 'all clear')));
    root.append(tiles);
    if (res.missing.length) root.append(h('div', { class: 'card', style: { marginBottom: '12px' } }, h('b', null, 'Missing basics'), res.missing.map(m => h('div', { class: 'issue' }, m))));
    if (!cv.selected.length) root.append(h('div', { class: 'empty' }, 'This CV has no items yet.'));
    for (const g of Object.keys(groups)) {
      root.append(h('h2', { class: 'sec' }, g + ' (' + groups[g].length + ')'));
      groups[g].forEach(i => {
        const it = S.byId[i.itemId];
        root.append(h('div', { class: 'issue ' + (KINDS[i.kind] || ['', ''])[1] }, h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, h('div', null, i.msg), i.text ? h('div', { class: 'small muted', style: { marginTop: '3px' } }, '"' + i.text.slice(0, 160) + (i.text.length > 160 ? '...' : '') + '"') : (it ? h('div', { class: 'small muted' }, UI.metaLine(it).join(' - ')) : null)),
          it ? h('button', { class: 'btn small', onclick: async () => { S.cv = cv; S.editor.cursor = it.id; App.go('editor'); } }, 'Show in editor') : null,
          it && i.text ? h('button', { class: 'btn small', onclick: () => App.rephrase(it, i.text, async () => { await App.reloadItems(); toast('Versions added. Choose one in the editor (right-click the line).'); }) }, 'Rephrase') : null)));
      });
    }
    if (!res.issues.length && cv.selected.length) root.append(h('div', { class: 'card', style: { background: 'var(--accent-weak)' } }, 'No issues found by the automatic checks. Spell-checking happens as you type (red underline) in text boxes.'));
    root.append(h('h2', { class: 'sec' }, 'ATS readability'), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => atsRun(cv) }, 'Run ATS check'), h('span', { class: 'small muted' }, 'Exports to PDF and reads the text back like an applicant tracking system.')), h('div', { id: 'atsout' }));
  }
  async function atsRun(cv) {
    const out = $('#atsout'); clear(out).append(h('p', { class: 'muted' }, 'Checking...'));
    const r = await tryCall('ats.check', { id: cv.id }); if (!r) return clear(out);
    clear(out).append(h('div', { class: 'card', style: { marginTop: '8px' } }, h('b', null, r.ok ? 'Readable: no problems found' : 'Problems found'), r.problems.map(x => h('div', { class: 'issue bad' }, x)), (r.warnings || []).map(x => h('div', { class: 'issue' }, x)), r.passed.map(x => h('div', { class: 'issue tip' }, x)), h('details', null, h('summary', null, 'Text a parser reads'), h('pre', { class: 'raw' }, r.text))));
  }

  // ---------- compare / diff ----------
  async function drawCompare(cv) {
    const other = S.cvs.filter(c => c.id !== cv.id);
    const selB = h('select', { onchange: () => { cmpB = selB.value; draw(); } }, [h('option', { value: '' }, 'Choose a CV to compare with...')].concat(other.map(c => h('option', { value: c.id, selected: c.id === cmpB }, c.name))));
    root.append(h('div', { class: 'row wrap' }, h('b', null, 'Compare "' + cv.name + '" with'), selB));
    if (cmpB) {
      const B = await tryCall('cv.get', { id: cmpB }); if (B) {
        const text = (c, s) => { const it = S.byId[s.itemId]; return it ? (s.override || M.itemText(it, s.versionId)) : ''; };
        const mapA = new Map(cv.selected.map(s => [s.itemId, text(cv, s)])), mapB = new Map(B.selected.map(s => [s.itemId, text(B, s)]));
        const onlyA = [...mapA].filter(([id]) => !mapB.has(id)), onlyB = [...mapB].filter(([id]) => !mapA.has(id));
        const both = [...mapA].filter(([id]) => mapB.has(id)); const diffs = both.filter(([id, t]) => t !== mapB.get(id)); const same = both.length - diffs.length;
        const list = (arr) => arr.length ? arr.map(([id, t]) => h('div', { class: 'item' }, h('div', { class: 'body' }, h('div', null, t.slice(0, 200)), h('div', { class: 'meta' }, UI.metaLine(S.byId[id] || {}).join(' - '))))) : h('div', { class: 'muted small' }, 'None');
        root.append(h('div', { class: 'cols', style: { marginTop: '12px' } }, h('div', { class: 'card' }, h('div', { class: 'muted small' }, 'Same in both'), h('div', { style: { fontSize: '26px', fontWeight: 700 } }, same)), h('div', { class: 'card' }, h('div', { class: 'muted small' }, 'Template'), h('div', null, cv.templateId + '  vs  ' + B.templateId)), h('div', { class: 'card' }, h('div', { class: 'muted small' }, 'Items'), h('div', null, cv.selected.length + '  vs  ' + B.selected.length))));
        root.append(h('h2', { class: 'sec' }, 'Only in "' + cv.name + '" (' + onlyA.length + ')'), list(onlyA), h('h2', { class: 'sec' }, 'Only in "' + B.name + '" (' + onlyB.length + ')'), list(onlyB), h('h2', { class: 'sec' }, 'Different wording in each (' + diffs.length + ')'));
        if (!diffs.length) root.append(h('div', { class: 'muted small' }, 'None'));
        for (const [id, t] of diffs) root.append(h('div', { class: 'card diff', style: { marginBottom: '6px' } }, R.diffWords(t, mapB.get(id)).map(d => d.op === 'same' ? d.t : (d.op === 'add' ? h('ins', null, d.t) : h('del', null, d.t)))));
      }
    }
    // versions of one item
    root.append(h('h2', { class: 'sec' }, 'Compare two wordings of one item'));
    const withV = S.items.filter(i => (i.versions || []).length);
    if (!withV.length) { root.append(h('div', { class: 'muted small' }, 'No item has alternative versions yet.')); return; }
    const itSel = h('select', { onchange: () => fill() }, withV.map(i => h('option', { value: i.id }, UI.textOf(i).slice(0, 70))));
    const a = h('select', { onchange: () => show() }), b = h('select', { onchange: () => show() }), out = h('div', { class: 'card diff', style: { marginTop: '8px' } });
    const fill = () => { const it = S.byId[itSel.value]; const opts = [{ id: '', t: 'Original: ' + it.text }].concat(it.versions.map((v, i) => ({ id: v.id, t: 'Version ' + (i + 1) + ': ' + v.text }))); [a, b].forEach((s, k) => { clear(s); opts.forEach((o, i) => s.append(h('option', { value: o.id, selected: i === (k === 0 ? 0 : 1) }, o.t.slice(0, 80)))); }); show(); };
    const show = () => { const it = S.byId[itSel.value]; const get = (id) => { const v = id ? it.versions.find(v => v.id === id) : null; return v ? v.text : (it.text || ''); }; clear(out).append(...R.diffWords(get(a.value), get(b.value)).map(d => d.op === 'same' ? d.t : (d.op === 'add' ? h('ins', null, d.t) : h('del', null, d.t)))); };
    root.append(itSel, h('div', { class: 'row', style: { marginTop: '6px' } }, a, h('span', null, 'to'), b), out); fill();
  }

  // ---------- AI ----------
  function provBox(task) { const s = App.aiProviderSelect(task); const prov = () => S.settings.ai.providers[s.value]; const note = h('div', { class: 'small muted' }); const upd = () => { note.textContent = prov() && !prov().remote && (task === 'critique' || task === 'tailor') ? 'A small local model can do this but the feedback is usually shallow. A larger hosted model is recommended.' : (prov() && prov().remote ? 'Sent over the internet to ' + prov().label + ' after you confirm a preview.' : 'Stays on this computer.'); }; s.onchange = upd; upd(); return { s, note }; }
  const aiCache = {};   // results survive switching tabs; a Close button clears one
  function keep(o, key, fn, r, extra) { aiCache[cvId + ':' + key] = { fn, r, extra }; o.classList.add('aiout2'); fn(o, r, extra); addClose(o, key); }
  function addClose(o, key) { o.prepend(h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, h('button', { class: 'btn small', onclick: () => { delete aiCache[cvId + ':' + key]; clear(o); } }, UI.icon('x', { size: 13 }), 'Close'))); }
  function replay(o, key) { const c = aiCache[cvId + ':' + key]; if (c) { c.fn(o, c.r, c.extra); addClose(o, key); } }
  function drawAI(cv) {
    const resolved = R.resolveSelected(cv, S.byId);
    const wrap = (title, desc, ctrl, body) => h('div', { class: 'card', style: { marginBottom: '12px' } }, h('b', null, title), h('p', { class: 'small muted', style: { margin: '4px 0 8px' } }, desc), ctrl, body);
    const whole = provBox('critique'), items = provBox('critique'), tpl = provBox('critique'), tail = provBox('tailor');
    const o1 = h('div'), o2 = h('div'), o3 = h('div'), o4 = h('div');
    const plain = () => window.CVTemplates.plainText(cv, S.items, S.settings);
    replay(o1, 'cv'); replay(o2, 'items'); replay(o3, 'tpl'); replay(o4, 'tail');
    root.append(h('p', { class: 'small muted' }, 'Everything here is optional and runs only when you click. Local models are fine for rewriting; critique and job matching work better with a hosted model.'));
    root.append(wrap('Critique the whole CV', 'Score, strengths, weaknesses, missing sections, section order.', h('div', { class: 'row wrap' }, whole.s, h('button', { class: 'btn primary', onclick: async () => { const r = await App.aiRun('critique', { mode: 'cv', text: plain() }, whole.s.value); if (r) keep(o1, 'cv', renderCv, r); } }, 'Critique CV')), h('div', null, whole.note, o1)));
    root.append(wrap('Critique each line item', 'Scores every chosen line and proposes a stronger rewrite using only your facts.', h('div', { class: 'row wrap' }, items.s, h('button', { class: 'btn primary', onclick: async () => { const list = resolved.slice(0, 25).map(r => ({ id: r.id, text: r.text })).filter(x => x.text); if (!list.length) return toast('No items in this CV'); const r = await App.aiRun('critique', { mode: 'items', items: list }, items.s.value); if (r) keep(o2, 'items', renderItems, r); } }, 'Critique items (first 25)')), h('div', null, items.note, o2)));
    root.append(wrap('Critique the template and formatting', 'Looks at hierarchy, density, readability and ATS risk. Hosted vision models also see the rendered page.', h('div', { class: 'row wrap' }, tpl.s, h('button', { class: 'btn primary', onclick: async () => { await call('cv.save', cv); const snap = await tryCall('template.snapshot', { id: cv.id }); if (!snap) return; const t = S.templates.find(x => x.id === cv.templateId) || {}; const r = await App.aiRun('critique', { mode: 'template', name: t.name || cv.templateId, notes: t.description, text: snap.text, image: snap.image }, tpl.s.value); if (r) keep(o3, 'tpl', renderTpl, r); } }, 'Critique template')), h('div', null, tpl.note, o3)));
    const job = h('textarea', { rows: 6, placeholder: 'Paste the job description here, or fetch it from a link...' }); const url = h('input', { type: 'text', placeholder: 'https://... (optional)', style: { flex: 1 } });
    root.append(wrap('Tailor to a job description', 'Finds the keywords, scores your repository items for relevance, and can pre-select the best ones into a new CV.', h('div', null, job, h('div', { class: 'row', style: { margin: '6px 0' } }, url, h('button', { class: 'btn small', onclick: async () => { if (!url.value) return; const r = await tryCall('net.fetchText', { url: url.value }); if (r) job.value = r.text; } }, 'Fetch page (uses internet)')), h('div', { class: 'row wrap' }, tail.s, h('button', { class: 'btn primary', onclick: async () => { if (job.value.trim().length < 40) return toast('Paste the job description first', { err: true }); const pool = S.items.filter(i => !i.archived && !['skill', 'language'].includes(i.type)).sort(UI.SORTS['date-desc'][1]).slice(0, 80).map(i => ({ id: i.id, type: i.type, text: M.itemText(i) || i.title })); const r = await App.aiRun('tailor', { job: job.value, items: pool }, tail.s.value); if (r) keep(o4, 'tail', renderTail, r, cv); } }, 'Match items'))), h('div', null, tail.note, o4)));
  }
  const list = (arr) => h('ul', { style: { margin: '4px 0 8px 18px' } }, (Array.isArray(arr) ? arr : arr ? [arr] : []).map(x => h('li', null, typeof x === 'string' ? x : JSON.stringify(x))));
  function renderCv(o, r) { clear(o); const d = r.data; if (!d || typeof d !== 'object') return o.append(h('pre', { class: 'raw' }, r.raw)); o.append(h('div', { style: { marginTop: '8px' } }, h('div', { class: 'row' }, h('span', { style: { fontSize: '28px', fontWeight: 700 } }, d.score != null ? d.score + '/100' : ''), h('span', { class: 'small muted' }, r.provider + ' ' + r.model)), h('p', null, d.summary), d.strengths ? [h('b', null, 'Strengths'), list(d.strengths)] : null, d.weaknesses ? [h('b', null, 'Weaknesses'), list(d.weaknesses)] : null, d.missing ? [h('b', null, 'Missing'), list(d.missing)] : null, d.topFixes ? [h('b', null, 'Top fixes'), list(d.topFixes)] : null, d.sectionOrder ? h('p', null, h('b', null, 'Section order: '), d.sectionOrder) : null)); }
  function renderTpl(o, r) { clear(o); const d = r.data; if (!d || typeof d !== 'object') return o.append(h('pre', { class: 'raw' }, r.raw)); o.append(h('div', { style: { marginTop: '8px' } }, h('span', { style: { fontSize: '28px', fontWeight: 700 } }, d.score != null ? d.score + '/100' : ''), ' ', h('span', { class: 'pill ' + (d.atsRisk === 'low' ? 'good' : d.atsRisk === 'high' ? 'bad' : 'warn') }, 'ATS risk: ' + d.atsRisk), ['readability', 'hierarchy', 'density', 'atsNotes'].map(k => d[k] ? h('p', null, h('b', null, k + ': '), d[k]) : null), d.suggestions ? [h('b', null, 'Suggestions'), list(d.suggestions)] : null)); }
  function renderItems(o, r) {
    clear(o); const arr = Array.isArray(r.data) ? r.data : (r.data && r.data.items) || []; if (!arr.length) return o.append(h('pre', { class: 'raw' }, r.raw));
    o.append(h('table', { class: 'tbl', style: { marginTop: '8px' } }, h('thead', null, h('tr', null, ['Item', 'Score', 'Issue', 'Suggested rewrite', ''].map(x => h('th', null, x)))), h('tbody', null, arr.map(x => { const it = S.byId[x.id]; return h('tr', null, h('td', null, it ? UI.textOf(it).slice(0, 120) : x.id), h('td', null, x.score), h('td', null, x.issue), h('td', null, x.suggestion), h('td', null, it && x.suggestion ? h('button', { class: 'btn small', onclick: async () => { await call('items.addVersion', { id: it.id, text: x.suggestion, source: 'ai', label: r.provider }); await App.reloadItems(); toast('Added as a version'); } }, 'Keep as version') : null)); }))));
  }
  function renderTail(o, r, cv) {
    clear(o); const d = r.data; if (!d || typeof d !== 'object') return o.append(h('pre', { class: 'raw' }, r.raw));
    const scores = (Array.isArray(d.scores) ? d.scores : []).filter(s => s && S.byId[s.id]).sort((a, b) => (+b.score || 0) - (+a.score || 0));
    o.append(h('div', { style: { marginTop: '8px' } }, d.summary ? h('p', null, d.summary) : null, h('b', null, 'Keywords in the job'), h('div', null, (Array.isArray(d.keywords) ? d.keywords : []).map(k => h('span', { class: 'chip' }, k))), h('b', null, 'Not covered by your items'), h('div', null, (Array.isArray(d.missingKeywords) ? d.missingKeywords : []).map(k => h('span', { class: 'chip', style: { borderColor: 'var(--warn)' } }, k))),
      h('div', { class: 'row', style: { margin: '10px 0' } }, h('input', { type: 'number', min: 1, max: 10, value: 6, id: 'tailmin', style: { width: '70px' } }), h('span', { class: 'small' }, 'minimum score'), h('button', { class: 'btn primary', onclick: async () => { const min = +$('#tailmin').value || 6; const ids = scores.filter(s => s.score >= min).map(s => s.id); const keepBasics = S.items.filter(i => i.type === 'education' && !i.archived).map(i => i.id); const cv2 = await tryCall('cv.create', { name: 'Tailored ' + new Date().toISOString().slice(0, 10), selected: [...new Set(keepBasics.concat(ids))].map(id => ({ itemId: id, versionId: null })) }); if (cv2) { await App.reloadCvs(); S.cv = cv2; toast(ids.length + ' items pre-selected (plus education)'); App.go('editor'); } } }, 'Create a CV from the best matches')),
      h('table', { class: 'tbl' }, h('tbody', null, scores.map(s => h('tr', null, h('td', { style: { width: '50px' } }, h('b', null, s.score)), h('td', null, UI.textOf(S.byId[s.id]).slice(0, 140)), h('td', { class: 'muted small' }, s.why || '')))))));
  }
})();
