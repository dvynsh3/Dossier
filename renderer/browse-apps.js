'use strict';
// Applications: the tracker table, job descriptions and cover letters. Home (browse.js) only draws the tabs around it.
(function () {
  const { h, clear, call, tryCall, toast, modal, confirmBox, ctxMenu } = UI;
  const M = window.CVModel;
  const S = App.state;
  const A = App.apps = {};
  let appsCache = [];
  let pendingFocus = false;
  // every added or changed application gets an "updated" stamp so the overview can show the latest ones
  let snap = new Map();
  const keyOf = (a) => JSON.stringify(Object.assign({}, a, { updated: 0 }));
  const takeSnap = () => { snap = new Map(appsCache.map(a => [a.id, keyOf(a)])); };
  const stampApps = (list) => { const now = new Date().toISOString(); for (const a of list) if (snap.get(a.id) !== keyOf(a)) a.updated = now; snap = new Map(list.map(a => [a.id, keyOf(a)])); };
  let dirty = false;
  const write = () => { dirty = false; stampApps(appsCache); return call('applications.save', { list: appsCache }); };
  const saveApps = (() => { const d = UI.debounce(write, 400); const f = () => { dirty = true; d(); }; f.flush = () => { if (dirty) { d.cancel(); return write(); } }; return f; })();
  const clean = (l) => (Array.isArray(l) ? l : []).filter(a => a && typeof a === 'object' && a.id);
  // writes any edit still waiting for its 400 ms pause (leaving the tab, reloading the list)
  A.flush = () => saveApps.flush();
  A.load = async () => { await A.flush(); appsCache = clean(await tryCall('applications.list', {}, true)); takeSnap(); return appsCache; };
  A.list = () => appsCache;
  A.blank = async (cvId, role) => {   // a new, empty application at the top of the list
    await A.flush();
    const list = clean(await tryCall('applications.list', {}, true));
    appsCache = list; takeSnap();
    appsCache.unshift({ id: M.uid('ap'), company: '', role: role || '', applied: new Date().toISOString().slice(0, 10), status: 'Applied', cvId: cvId || '', followUp: '', notes: '', jds: [], letter: null });
    stampApps(appsCache); await call('applications.save', { list: appsCache }); asort = { key: null, dir: 1 }; pendingFocus = true;
  };
  A.orgsFor = (id) => [...new Set(appsCache.filter(a => a.cvId === id && a.company && String(a.company).trim()).map(a => String(a.company).trim()))];

  // ---------- job descriptions ----------
  const jdNames = (a) => (a.jds || []).map(j => j.name);
  const usedElsewhere = (file, a) => appsCache.some(x => x !== a && (x.jds || []).some(j => j.file === file));
  async function jdText(file) { const r = await tryCall('jd.text', { file }); return r ? r.text : ''; }
  // asks for a file (browse / drop / paste a copied file) or pasted text. Returns { text } | { file } | null
  async function askJd(title) {
    let picked = null; const ta = h('textarea', { rows: 9, placeholder: 'Paste the job description text here...' });
    const drop = h('div', { class: 'jddrop' }, UI.icon('doc', { size: 20 }), h('div', null, h('b', null, 'Drag a PDF or Word file here'), h('div', { class: 'small muted' }, 'or press Ctrl+V with a copied file')), h('button', { class: 'btn small', onclick: async () => { const f = await UI.pickFiles({ accept: '.pdf,.docx,.txt,.md', filters: [{ name: 'Job description', extensions: ['pdf', 'docx', 'txt', 'md'] }], title: 'Attach a job description' }); if (f[0]) { picked = f[0]; box.close('file'); } } }, 'Browse...'));
    let box = null;
    const take = async (files) => { const fl = [...files]; if (!fl.length) return false; const one = (fl[0].path || fl[0].b64) ? fl[0] : (await UI.fromDropped([fl[0]]))[0]; picked = one; box.close('file'); return true; };
    App.dropHandler = async (fl) => { if (!fl.length) return false; picked = fl[0]; box.close('file'); return true; };
    App.pasteHandler = take;
    const r = await modal(title, h('div', null, drop, h('div', { class: 'sp' }), ta), { wide: true, buttons: [{ label: 'Cancel', value: null }, { label: 'Save pasted text', value: 'text', cls: 'primary', onclick: () => { if (!ta.value.trim()) { toast('Paste some text first, or browse for a file.'); return false; } } }], onOpen: (b) => { box = b; } });
    App.dropHandler = null; App.pasteHandler = null;
    if (r === 'file' && picked) return { file: picked };
    if (r === 'text') return { text: ta.value };
    return null;
  }
  // add a JD to an application (asks replace / keep both when one exists). Returns true when something changed.
  async function addJd(a) {
    const got = await askJd(a.jds && a.jds.length ? 'Add another job description' : 'Attach the job description'); if (!got) return false;
    let mode = 'keep';
    if (a.jds && a.jds.length) { const m = await modal('Replace or keep both?', h('p', null, 'This application already has a job description (' + jdNames(a).join(', ') + ').'), { buttons: [{ label: 'Cancel', value: null }, { label: 'Keep both', value: 'keep' }, { label: 'Replace it', value: 'replace', cls: 'primary' }] }); if (!m) return false; mode = m; }
    const label = 'Job description - ' + ([a.company, a.role].filter(Boolean).join(' - ') || 'pasted') + '.txt';
    const f = got.file;
    if (got.text == null && !(f && (f.path || f.b64))) { toast('That file could not be read. Try another, or paste the text.', { err: true }); return false; }
    if (got.text != null && !String(got.text).trim()) return false;
    const rec = got.text != null ? await tryCall('jd.add', { name: label, text: got.text }) : await tryCall('jd.add', f.path ? { name: f.name || 'Job description', file: f.path } : { name: f.name || 'Job description', b64: f.b64 });
    if (!rec) return false;
    if (mode === 'replace') for (const j of a.jds || []) if (!usedElsewhere(j.file, a)) await tryCall('jd.delete', { file: j.file }, true);
    a.jds = (mode === 'replace' ? [] : (a.jds || [])).concat([rec]); saveApps(); return true;
  }
  async function viewJd(a, refresh) {
    let idx = (a.jds || []).length - 1; const body = h('div');
    const drawBody = async () => {
      clear(body); const js = a.jds || []; if (!js.length) { body.append(h('p', { class: 'muted' }, 'No job description attached.')); }
      else {
        if (idx >= js.length) idx = js.length - 1; const j = js[idx];
        if (js.length > 1) body.append(UI.seg(js.map((x, i) => [i, x.name]), idx, (v) => { idx = v; drawBody(); }, { sm: true }));
        const pre = h('pre', { class: 'jdtext' }, 'Loading...'); jdText(j.file).then(t => { pre.textContent = t || '(No readable text found. Use "Open original".)'; });
        body.append(h('div', { class: 'row small', style: { margin: '8px 0 6px' } }, h('b', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, j.name), h('button', { class: 'btn small', onclick: async () => { const p = await tryCall('jd.path', { file: j.file }); if (p) UI.openPath(p); } }, 'Open original'),
          h('button', { class: 'btn small danger', onclick: async () => { if (!await confirmBox('Remove job description', 'Remove "' + j.name + '" from this application?', 'Remove', true)) return; a.jds.splice(idx, 1); if (!usedElsewhere(j.file, a)) await tryCall('jd.delete', { file: j.file }, true); saveApps(); refresh(); drawBody(); } }, UI.icon('trash'))), pre);
      }
      body.append(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn', onclick: async () => { if (await addJd(a)) { idx = a.jds.length - 1; refresh(); drawBody(); } } }, UI.icon('plus'), 'Add new')));
    };
    await drawBody();
    await modal('Job description' + (a.company ? ' - ' + a.company : ''), body, { wide: true });
  }
  function jdButton(a, refresh) {
    const has = (a.jds || []).length;
    return h('button', { class: 'jdbtn' + (has ? ' has' : ''), 'data-tip': has ? jdNames(a).join(', ') : 'Attach a job description', onclick: async () => { if (!has) { if (await addJd(a)) refresh(); } else viewJd(a, refresh); } }, h('span', null, 'JD'));
  }

  // ---------- application tracker ----------
  const STATUS = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];
  const STIC = { Wishlist: '☆', Applied: '➤', Interview: '\u{1F399}\uFE0E', Offer: '✓', Rejected: '✕', Withdrawn: '⊘' };
  const DONE = ['Offer', 'Rejected', 'Withdrawn'];
  const COLS = [['company', 'Company', '', 'w-main'], ['role', 'Role', '', 'w-main'], ['applied', 'Applied on', 'date', 'w-date'], ['followUp', 'Next follow up', 'date', 'w-date'], ['notes', 'Notes', 'nosort', 'w-main'], ['cv', 'CV', 'nosort', 'w-icon'], ['letter', 'Cover', 'nosort', 'w-icon'], ['jd', 'JD', 'nosort', 'w-icon'], ['status', 'Status', '', 'w-status']];
  let asort = { key: null, dir: 1 };
  function sortKeyOf(a, k) {
    if (k === 'cv') { const c = S.cvs.find(x => x.id === a.cvId); return c ? String(c.name || '').toLowerCase() : ''; }
    if (k === 'letter') return a.letter && a.letter.body ? 1 : 0;
    if (k === 'jd') return (a.jds || []).length;
    if (k === 'status') return STATUS.indexOf(a.status);
    return String(a[k] || '').toLowerCase();
  }
  async function drawApps(page, opt) {
    opt = opt || {};
    const body = h('div'); page.append(body);
    const today = new Date().toISOString().slice(0, 10);
    const overdue = (a) => a.followUp && a.followUp <= today && !DONE.includes(a.status);
    const dateCell = (a, k) => {
      const inp = h('input', { type: 'date', value: a[k] || '', class: 'hiddate', tabindex: '-1', oninput: () => { a[k] = inp.value; saveApps(); txt.textContent = a[k] ? UI.fmtDate(a[k]) : 'Set date'; txt.classList.toggle('muted', !a[k]); } });
      const txt = h('span', { class: a[k] ? '' : 'muted' }, a[k] ? UI.fmtDate(a[k]) : 'Set date');
      return h('div', { class: 'datecell', onclick: () => { try { inp.showPicker(); } catch (e) { inp.focus(); } } }, UI.icon('calendar', { size: 14 }), txt, inp);
    };
    const render = () => {
      clear(body);
      const due = appsCache.filter(overdue).length;
      if (!opt.limit) body.append(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('button', { class: 'btn primary', onclick: () => { appsCache.unshift({ id: M.uid('ap'), company: '', role: '', applied: today, status: 'Applied', cvId: '', followUp: '', notes: '', jds: [], letter: null }); asort = { key: null, dir: 1 }; saveApps(); render(); } }, '+ Add application'), due ? h('span', { class: 'pill bad' }, due + ' follow-up(s) due') : h('span', { class: 'muted small' }, 'Right-click a row to duplicate or delete it.')));
      if (!appsCache.length) { body.append(h('div', { class: 'empty' }, 'No applications logged yet.')); return; }
      let rows = appsCache.slice();
      if (opt.limit) rows = rows.sort((x, y) => (y.updated || '').localeCompare(x.updated || '')).slice(0, opt.limit);
      else if (asort.key) { const d = asort.dir; rows.sort((x, y) => { const a = sortKeyOf(x, asort.key), b = sortKeyOf(y, asort.key); const ea = a === '' || a === undefined, eb = b === '' || b === undefined; if (ea !== eb) return ea ? 1 : -1; return (a < b ? -1 : a > b ? 1 : 0) * d; }); }
      const tbl = h('table', { class: 'tbl apptbl' }, h('thead', null, h('tr', null, COLS.map(([k, l, t, wc]) => { const on = asort.key === k; const th = h('th', { class: wc + (['company', 'role', 'notes'].includes(k) ? '' : ' ctr') + ' ' + (t === 'nosort' ? '' : 'sortable' + (on ? ' on' : '')), onclick: t === 'nosort' ? null : () => { asort = on ? { key: k, dir: -asort.dir } : { key: k, dir: t === 'date' ? -1 : 1 }; render(); } }, l, on ? h('span', { class: 'sarrow' }, asort.dir === 1 ? '▲' : '▼') : null); return th; }))));
      const tb = h('tbody'); tbl.append(tb);
      rows.forEach((a) => {
        const f = (k) => h('input', { type: 'text', value: a[k] || '', oninput: e => { a[k] = e.target.value; saveApps(); } });
        const cv = S.cvs.find(c => c.id === a.cvId);
        const cvBtn = h('button', { class: 'jdbtn' + (cv ? ' has' : ''), 'data-tip': cv ? cv.name : (a.cvId ? 'The CV used here was deleted. Choose another.' : 'Choose the CV used'), onclick: () => { const r = cvBtn.getBoundingClientRect(); const E = []; if (cv) E.push({ label: 'Open this CV', fn: () => App.go('review', { cvId: cv.id, full: true }) }, '-'); E.push({ header: 'Use this CV' }); S.cvs.forEach(c => E.push({ label: c.name, check: c.id === a.cvId, fn: () => { a.cvId = c.id; saveApps(); render(); } })); if (cv) E.push('-', { label: 'Clear', fn: () => { a.cvId = ''; saveApps(); render(); } }); ctxMenu(r.left, r.bottom + 6, E, { flipY: r.top }); } }, UI.icon('doc', { size: 14 }));
        const letterBtn = h('button', { class: 'jdbtn' + (a.letter && a.letter.body ? ' has' : ''), 'data-tip': 'Cover letter', onclick: async () => { await coverLetter(cv || null, a); render(); } }, UI.icon('letter', { size: 14 }));
        tb.append(h('tr', { style: overdue(a) ? { background: 'rgba(179,38,30,.08)' } : null, oncontextmenu: (e) => { e.preventDefault(); ctxMenu(e.clientX, e.clientY, [
          { label: 'Duplicate', fn: () => { const n = JSON.parse(JSON.stringify(a)); n.id = M.uid('ap'); appsCache.splice(appsCache.indexOf(a) + 1, 0, n); saveApps(); render(); } },
          { label: 'Delete', fn: async () => { if (!await confirmBox('Delete application', 'Delete this application' + (a.company ? ' (' + a.company + ')' : '') + '? Its cover letter is removed too.', 'Delete', true)) return; appsCache.splice(appsCache.indexOf(a), 1); for (const j of a.jds || []) if (!usedElsewhere(j.file, a)) await tryCall('jd.delete', { file: j.file }, true); saveApps(); render(); } }]); } },
          h('td', null, f('company')), h('td', null, f('role')), h('td', null, dateCell(a, 'applied')), h('td', null, dateCell(a, 'followUp')), h('td', null, f('notes')),
          h('td', { class: 'ctr' }, cvBtn), h('td', { class: 'ctr' }, letterBtn), h('td', { class: 'ctr' }, jdButton(a, render)),
          h('td', null, h('select', { class: 'st-' + a.status, onchange: e => { a.status = e.target.value; saveApps(); render(); } }, STATUS.map(s => h('option', { value: s, selected: a.status === s }, STIC[s] + ' ' + s))))));
      });
      body.append(tbl);
      if (pendingFocus) { pendingFocus = false; const first = tbl.querySelector('tbody tr input[type=text]'); if (first) setTimeout(() => first.focus(), 30); }
    };
    render();
  }

  // ---------- cover letter ----------
  async function coverLetter(c, app) {
    const cvId = c ? c.id : (app && app.cvId);
    const cvFull = cvId ? await tryCall('cv.get', { id: cvId }, true) : null;
    const hd = cvFull ? cvFull.header : (S.cv ? S.cv.header : S.settings.header);
    const L = (app && app.letter) || {};
    const persist = () => { if (app) { app.letter = { recipient: recip.value, company: comp.value, subject: subj.value, body: bodyTa.value }; saveApps(); } };
    const f = (l, v, ph) => { const i = h('input', { type: 'text', value: v || '', placeholder: ph || '', oninput: persist }); return [h('label', { class: 'f' }, l, i), i]; };
    const roleName = (app && app.role) || (c && c.targetRole) || '';
    const [l1, recip] = f('Addressee', L.recipient, 'Hiring Manager'), [l2, comp] = f('Company', L.company != null ? L.company : (app ? app.company : (c ? c.company : ''))), [l3, subj] = f('Subject line', L.subject != null ? L.subject : (roleName ? 'Application for ' + roleName : ''));
    const bodyTa = h('textarea', { rows: 13, spellcheck: true, placeholder: 'Dear ...\n\nWrite your letter here. Separate paragraphs with a blank line.', oninput: persist }); bodyTa.value = L.body || '';
    let cvText = null, pastedJd = '', panel = null;
    const getCv = async () => { if (cvText == null) { const r = cvId ? await tryCall('cv.plainText', { id: cvId }, true) : null; cvText = r ? r.text : ''; } return cvText; };
    const getJd = async () => { if (app && (app.jds || []).length) return await jdText(app.jds[app.jds.length - 1].file); return pastedJd; };
    const ref = h('div', { class: 'lref', style: { display: 'none' } });
    const btnCv = h('button', { class: 'sidebtn', 'data-tip': 'Show the CV this letter is for' }, 'CV'), btnJd = h('button', { class: 'sidebtn', 'data-tip': 'Show the job description' }, 'JD');
    const showPanel = async (which) => {
      if (panel === which) { panel = null; ref.style.display = 'none'; btnCv.classList.remove('on'); btnJd.classList.remove('on'); return; }
      panel = which; ref.style.display = ''; btnCv.classList.toggle('on', which === 'cv'); btnJd.classList.toggle('on', which === 'jd'); clear(ref);
      if (which === 'cv') { const t = await getCv(); ref.append(h('div', { class: 'small muted' }, 'CV text'), h('pre', { class: 'jdtext' }, t || 'No CV is attached to this letter. Choose one in Applications, or open the letter from a CV card.')); }
      else {
        const t = await getJd(); const pre = h('pre', { class: 'jdtext' }, t || 'No job description yet.');
        ref.append(h('div', { class: 'small muted' }, 'Job description'), pre);
        if (!t) { if (app) ref.append(h('button', { class: 'btn small', onclick: async () => { if (await addJd(app)) { panel = null; showPanel('jd'); } } }, 'Attach or paste one...')); else { const ta = h('textarea', { rows: 6, placeholder: 'Paste the job description to use it for this letter...', oninput: () => { pastedJd = ta.value; } }); ref.append(ta); } }
      }
    };
    btnCv.onclick = () => showPanel('cv'); btnJd.onclick = () => showPanel('jd');
    const provSel = App.aiProviderSelect('cover', 'local');
    const aiBtn = h('button', { class: 'btn small', 'data-tip': 'Writes a first draft from this CV and the job description. Nothing is invented: it only uses what the CV says.', onclick: async () => {
      const r = await App.aiRun('cover', { cv: await getCv(), jd: await getJd(), company: comp.value, role: roleName || subj.value.replace(/^Application for\s*/i, ''), addressee: recip.value }, provSel.value);
      if (r && r.raw) { bodyTa.value = String(r.raw).replace(/^```\w*\s*|\s*```$/g, '').trim(); persist(); }
    } }, UI.icon('sparkles'), 'Draft with AI');
    const exp = async (fmt) => { if (!bodyTa.value.trim()) return toast('Write the letter first', { err: true }); const r = await tryCall('letter.export', { header: hd || {}, recipient: recip.value, company: comp.value, subject: subj.value, body: bodyTa.value, format: fmt }); if (r) toast('Saved ' + r.files[0].split(/[\\/]/).pop(), { action: { label: 'Show', fn: () => UI.showInFolder(r.files[0]) } }); };
    const main = h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'grid3' }, l1, l2, l3), h('div', { class: 'sp' }), bodyTa, h('div', { class: 'row', style: { marginTop: '8px' } }, aiBtn, provSel, h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => exp('pdf') }, 'Export PDF'), h('button', { class: 'btn', onclick: () => exp('docx') }, 'Export Word'), h('button', { class: 'btn', onclick: () => exp('html') }, 'Export HTML')));
    await modal('Cover letter' + (cvFull ? ' for "' + cvFull.name + '"' : ''), h('div', { class: 'letterwrap' }, main, ref, h('div', { class: 'sidebtns' }, btnCv, btnJd)), { wide: true, buttons: [{ label: 'Close', value: true }, { label: 'Save', cls: 'primary', value: 'save', onclick: () => { persist(); toast(app ? 'Cover letter saved with the application' : 'Saved (open it from Applications to keep it)'); } }] });
    persist();
  }

  A.draw = drawApps; A.coverLetter = coverLetter;
  App.coverLetter = coverLetter;
})();
