'use strict';
// Editor: export, print and ATS dialogs.
// Part of the editor (see editor.js). It shares the editor's state and helpers through App.edKit.
(function () {
  const { h, tryCall, toast, modal } = UI;
  const TP = window.CVTemplates;
  const S = App.state;
  const T = App.tabs.editor;
  const K = App.edKit;
  const { scheduleSave } = K;
  // ---------- export / print / ats ----------
  T.exportDialog = function () {
    if (!S.cv) return; T.saveNow(false);
    const saveAs = h('input', { type: 'checkbox' });
    // JSON Resume (jsonresume.org) export is kept in the app's code (export format "jsonresume") but is not offered here for now
    const fmts = [['pdf', 'PDF', 'Best for applications'], ['docx', 'Word (DOCX)', 'Editable, simplified layout'], ['png', 'PNG image', 'One image of the whole CV'], ['html', 'HTML', 'Single self-contained file'], ['json', 'JSON (this app)', 'Full CV with its items']];
    // the disabled "Exporting..." button with a spinner sits to the left of Close while a file is being made
    const working = h('button', { class: 'btn working', disabled: true, style: { display: 'none' } }, h('span', { class: 'spin sm' }), 'Exporting...');
    let busyNow = false;
    const go = async (f) => {
      if (busyNow) return; busyNow = true; working.style.display = ''; body.classList.add('exporting');
      try {
        const r = await tryCall('export.run', { id: S.cv.id, format: f, saveAs: saveAs.checked && !!window.cvDesktop }); if (!r) return;
        const shown = (r.saved && r.saved.length ? r.saved : r.files); toast('Exported ' + shown.length + ' file(s) to ' + shown[0].split(/[\\/]/).slice(0, -1).join('/'), { action: { label: 'Show', fn: () => UI.showInFolder(shown[0]) } });
      } finally { busyNow = false; working.style.display = 'none'; body.classList.remove('exporting'); }
    };
    const body = h('div', null,
      h('p', { class: 'small muted', style: { margin: '0 0 12px' } }, 'Files are always kept in the exports folder of your working folder.'),
      h('div', { class: 'grid2' }, fmts.map(([k, l, d]) => h('button', { class: 'btn fmtbtn', onclick: () => go(k) }, h('b', null, l), h('div', { class: 'small muted' }, d)))),
      h('p', { class: 'small muted', style: { margin: '10px 0 0' } }, 'Word files are always a single column: side-bar and multi-column templates are flattened (use PDF to keep their layout).'),
      h('div', { class: 'sp' }), window.cvDesktop ? h('label', { class: 'row small' }, saveAs, 'Also copy to a location I choose') : null);
    modal('Export "' + S.cv.name + '"', body, { buttons: [{ label: 'Close', value: true }], extra: working });
  };
  T.printPreview = async function () {
    if (!S.cv) return;
    await T.saveNow(false);
    const info = h('span', { class: 'small muted' }, '');
    const pv = App.pagePreview({ sideOption: true, onpages: n => { info.textContent = n + (n === 1 ? ' page' : ' pages'); } });
    const holder = h('div', { style: { height: '68vh', position: 'relative', display: 'flex' } }, pv.el);
    setTimeout(() => pv.load(S.cv), 30);
    const r = await modal('Print preview', h('div', null, h('div', { class: 'row', style: { marginBottom: '6px' } }, h('span', { class: 'small muted', style: { flex: 1 } }, 'Pages as they will print. Use Export > PDF for a file.'), info), holder), { wide: true, buttons: [{ label: 'Close', value: false }, { label: 'Print...', value: true, cls: 'primary' }] });
    if (r) {
      const pf = h('iframe', { style: { position: 'fixed', left: '-9999px', width: '1px', height: '1px' }, sandbox: 'allow-same-origin allow-modals' });
      pf.onload = () => { try { pf.contentWindow.focus(); pf.contentWindow.print(); } catch (e) { toast('Printing is not available here. Export a PDF instead.', { err: true }); } setTimeout(() => pf.remove(), 60000); };
      pf.srcdoc = TP.renderDocument(S.cv, S.items, S.settings, K.customFull, { mode: 'print' }); document.body.append(pf);
    }
  };
  async function atsCheck(o) {
    o = o || {};
    await T.saveNow(false);
    const t = toast('Checking how a parser reads this CV...', { ms: 60000 });
    const r = await tryCall('ats.check', { id: S.cv.id }); t.remove(); if (!r) return;
    if (!S.cv.atsSeen) { S.cv.atsSeen = true; K.saved = false; scheduleSave(); }
    const raw = h('pre', { class: 'raw' }, r.text);
    // "where?": find the line in the parser text (the layout may have split it) and mark it until the reader clicks elsewhere in the dialog
    const norm1 = (c) => c === '\u2018' || c === '\u2019' ? "'" : c.toLowerCase();
    const locate = (text) => {
      const idx = []; let comp = ''; for (let i = 0; i < r.text.length; i++) { const c = r.text[i]; if (/\s/.test(c)) continue; idx.push(i); comp += norm1(c); }
      const want = [...String(text)].filter(c => !/\s/.test(c)).map(norm1).join(''); if (!want) return null;
      let at = comp.indexOf(want); if (at >= 0) return [idx[at], idx[at + want.length - 1] + 1];
      const n = Math.min(24, want.length); const head = want.slice(0, n), tail = want.slice(-n);
      const hi = comp.indexOf(head); if (hi < 0) { const ti = comp.indexOf(tail); return ti < 0 ? null : [idx[ti], idx[ti + n - 1] + 1]; }
      const ti = comp.indexOf(tail, hi); const end = ti >= 0 && ti - hi < want.length * 3 ? ti + n - 1 : hi + n - 1;
      return [idx[hi], idx[end] + 1];
    };
    const clearMark = () => { if (raw.querySelector('mark')) raw.textContent = r.text; };
    const mark = (text) => {
      const sp = locate(text); if (!sp) { toast('That line could not be found in the text below.'); return; }
      clearMark(); raw.textContent = '';
      const m = h('mark', { class: 'atsmark' }, r.text.slice(sp[0], sp[1]));
      raw.append(r.text.slice(0, sp[0]), m, r.text.slice(sp[1]));
      m.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const list = (arr, cls) => arr.map(x => /line item\(s\) do not extract/.test(x) && (r.brokenItems || []).length && cls === 'bad'
      ? h('div', { class: 'issue ' + cls + ' atsloc2', style: { cursor: 'pointer' }, 'data-tip': 'Click to jump to the first of these lines in the text below', onclick: () => mark(r.brokenItems[0]) }, x + ' (click to see where)')
      : h('div', { class: 'issue ' + cls }, x));
    const where = (r.brokenItems || []).length ? h('div', { class: 'atswhere' }, h('div', { class: 'small muted' }, 'Click a line to see where it breaks in the text below:'), (r.brokenItems || []).map(t => h('button', { class: 'atsloc', type: 'button', onclick: () => mark(t) }, t.length > 110 ? t.slice(0, 110) + '...' : t))) : null;
    const body = h('div', null, h('p', { class: 'small muted' }, 'Exports your CV to PDF and reads the text back the way an applicant tracking system would. Template: ' + r.template + ' (' + r.atsClass + ').'), list(r.problems, 'bad'), where, list(r.warnings || [], ''), list(r.passed, 'tip'), h('h3', null, 'Text as a parser sees it'), raw);
    // a click anywhere in the dialog outside the text box and the line buttons takes the highlight away
    setTimeout(() => { const box = body.closest('.modal'); if (box) box.addEventListener('click', (e) => { if (!e.target.closest('.raw') && !e.target.closest('.atsloc') && !e.target.closest('.atsloc2')) clearMark(); }); }, 0);
    const res = await modal('ATS readability: ' + (r.ok ? 'looks good' : 'needs attention'), body, { wide: true, buttons: o.fromExport ? [{ label: 'Close', value: false }, { label: 'Export options', value: true, cls: 'primary' }] : [{ label: 'Close', value: false }] });
    if (o.fromExport && res) T.exportDialog();
  }
  Object.assign(K, { atsCheck });
})();
