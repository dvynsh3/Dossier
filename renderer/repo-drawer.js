'use strict';
// Repository entry drawer: view / edit / new entry, versions, proof, autosave. Shares its state (RS) and redraw functions with repo.js.
(function () {
  const { h, clear, call, tryCall, toast, modal, promptBox } = UI;
  const M = window.CVModel, R = window.CVReview;
  const S = App.state;
  const { parseDateLoose, csv, skillTable, diffNodes } = App;
  const T = App.tabs.repo; const K = App.repoKit; const { RS, drawToolbar, drawBulk, drawList } = K;
  // ---------- drawer: view / edit / new ----------
  // the details drawer slides in from the right (the list narrows with it) and slides back out
  const SLIDE = { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' };
  function slideDrawer(show) {
    if (!RS.drawerEl || !RS.drawerEl.animate) return Promise.resolve();
    RS.drawerEl.classList.add('sliding');
    const fr = show ? [{ width: '0px', marginLeft: '-14px', opacity: 0, paddingLeft: '0px', paddingRight: '0px', borderWidth: '0px' }, { width: '440px', marginLeft: '0px', opacity: 1, paddingLeft: '18px', paddingRight: '18px', borderWidth: '1px' }]
      : [{ width: '440px', marginLeft: '0px', opacity: 1, paddingLeft: '18px', paddingRight: '18px', borderWidth: '1px' }, { width: '0px', marginLeft: '-14px', opacity: 0, paddingLeft: '0px', paddingRight: '0px', borderWidth: '0px' }];
    const a = RS.drawerEl.animate(fr, SLIDE);
    return a.finished.catch(() => {}).then(() => RS.drawerEl.classList.remove('sliding'));
  }
  const markOpen = (on) => { const p = RS.drawerEl && RS.drawerEl.parentNode; if (p) p.classList.toggle('dopen', on); };   // the toolbar narrows to icons while the drawer is open
  T.openItem = function (id) { markOpen(true); const was = RS.drawerEl && RS.drawerEl.style.display !== 'none'; const keepTab = RS.drawerState && RS.drawerState.id === id ? RS.drawerState.tab : undefined; RS.drawerState = { id, draft: JSON.parse(JSON.stringify(S.byId[id])), tab: keepTab }; drawDrawer(); if (!was) slideDrawer(true); };
  T.toggleItem = function (id) { if (RS.drawerState && RS.drawerState.id === id) closeDrawer(); else T.openItem(id); };
  T.openNew = function (preset) {
    if (S.tab !== 'repo') { App.go('repo'); }
    const draft = M.newItem(Object.assign({ type: 'work' }, preset || {}));
    markOpen(true); const was = RS.drawerEl && RS.drawerEl.style.display !== 'none'; RS.drawerState = { id: null, draft, multi: false }; if (!RS.drawerEl) return; drawDrawer(); if (!was) slideDrawer(true);
  };
  function closeDrawer() { RS.drawerState = null; markOpen(false); if (!RS.drawerEl) return; const el = RS.drawerEl; if (el.style.display === 'none') return; slideDrawer(false).then(() => { if (!RS.drawerState) { el.style.display = 'none'; clear(el); } }); }
  T.closeDrawer = closeDrawer;
  let drawTok = 0;   // drawing the drawer waits for data, so two overlapping draws must not both add their pages (the later one wins)
  async function drawDrawer() {
    if (!RS.drawerEl) return; const tok = ++drawTok;
    const d = RS.drawerState.draft, isNew = !RS.drawerState.id;
    RS.drawerEl.style.display = ''; clear(RS.drawerEl);
    const F = (label, el) => h('label', { class: 'f' }, label, el);
    const inp = (key, ph, parse) => h('input', { type: 'text', value: d[key] || '', placeholder: ph || '', onchange: e => { d[key] = parse ? parse(e.target.value) : e.target.value; if (parse) e.target.value = d[key]; } });
    const typeSel = h('select', { onchange: e => { d.type = e.target.value; drawDrawer(); } }, M.TYPES.map(t => h('option', { value: t.key, selected: d.type === t.key }, t.label)));
    const text = h('textarea', { rows: 4, spellcheck: true, oninput: e => d.text = e.target.value }); text.value = d.text || '';
    const isEdu = d.type === 'education', isSkill = d.type === 'skill', isLang = d.type === 'language';
    d.extra = d.extra || {};
    const tab = isNew ? 'details' : (RS.drawerState.tab || 'details');
    const main = h('div', { class: 'dtab' }), ver = h('div', { class: 'dtab' });
    const saveNote = h('span', { class: 'small muted', style: { opacity: 0, transition: 'opacity .3s' } }, 'Saved');
    RS.drawerState.note = saveNote;
    RS.drawerEl.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h2', { style: { flex: 1, margin: 0 } }, isNew ? 'New entry' : 'Entry details'), isNew ? null : saveNote,
      !isNew ? h('button', { class: 'icon-btn sm bold', 'data-tip': d.archived ? 'Unarchive this entry' : 'Archive this entry (kept, but out of the way)', onclick: async () => { await call('items.archive', { ids: [d.id], archived: !d.archived }); await App.reloadItems(); closeDrawer(); T.refresh(); } }, UI.icon('folder')) : null,
      !isNew ? h('button', { class: 'icon-btn sm bold', 'data-tip': 'Move this entry to the bin', style: { color: 'var(--bad)' }, onclick: async () => { S.repo.sel = new Set([d.id]); await T.deleteSelected(); } }, UI.icon('trash')) : null,
      h('button', { class: 'icon-btn sm bold', onclick: closeDrawer, 'data-tip': 'Close' }, UI.icon('x'))));
    const starCircle = () => { const b = h('button', { class: 'starcircle' + (d.starred ? ' on' : ''), onclick: async () => { const v = !d.starred; d.starred = v; const mem = S.byId[d.id]; if (mem) mem.starred = v; await call('items.star', { ids: [d.id], starred: v }); clear(b).append(UI.icon('star', { filled: v })); b.classList.toggle('on', v); UI.tipAttrs(b, v ? 'Starred. Click to remove the star.' : 'Star this entry so it is easy to find later.'); document.querySelectorAll('.item[data-id="' + d.id + '"]').forEach(row => { row.classList.toggle('starred', v); const st = row.querySelector('.starstack'); if (st) st.classList.toggle('on', v); const sb = row.querySelector('.starbtn'); if (sb) { sb.classList.toggle('on', v); clear(sb).append(UI.icon('star', { filled: v })); } }); } }, UI.icon('star', { filled: !!d.starred })); UI.tipAttrs(b, d.starred ? 'Starred. Click to remove the star.' : 'Star this entry so it is easy to find later.'); return b; };
    if (!isNew) RS.drawerEl.append(h('div', { class: 'detailhead' }, h('div', { class: 'dstar' }, starCircle()), h('div', { class: 'pillrow', style: { margin: 0 } }, [['details', 'Details'], ['versions', 'Versions']].map(([k, l]) => h('button', { class: 'dpill' + (tab === k ? ' on' : ''), onclick: () => { RS.drawerState.tab = k; drawDrawer(); } }, l, k === 'versions' && (d.versions || []).length ? h('small', null, (d.versions.length + 1) + '') : null)))));
    main.append(F('Type', typeSel), h('div', { class: 'sp' }));
    if (isSkill || isLang) main.append(F(isSkill ? 'Skill name' : 'Language', h('input', { type: 'text', value: d.title || '', onchange: e => d.title = e.target.value })), h('div', { class: 'sp' }));
    else main.append(F(isEdu ? 'Degree / qualification (optional text below)' : 'Text (your original wording)', isEdu ? h('input', { type: 'text', value: d.title || '', onchange: e => d.title = e.target.value }) : text), h('div', { class: 'sp' }));
    if (isEdu) main.append(F('Notes line (optional bullet)', text), h('div', { class: 'sp' }));
    if (isNew && !isSkill && !isLang && !isEdu) main.append(UI.toggle('Each line is a separate item (they share the fields below)', RS.drawerState.multi, (v) => { RS.drawerState.multi = v; }), h('div', { class: 'sp' }));
    if (!isSkill && !isLang) main.append(
      h('div', { class: 'grid2' }, F(isEdu ? 'Institute' : 'Organisation', inp('org')), F(isEdu ? '(unused)' : 'Role', isEdu ? h('input', { disabled: true }) : inp('role'))),
      h('div', { class: 'grid2' }, F('Title / project name', inp('title')), F('Location', inp('location'))),
      h('div', { class: 'grid2' }, F('Start (YYYY-MM or YYYY)', inp('start', 'e.g. 2024-04', parseDateLoose)), F('End', d.end === 'present' ? h('input', { disabled: true, value: 'Present' }) : inp('end', 'e.g. 2024-06', parseDateLoose))),
      UI.toggle('Still ongoing (end date shows as Present)', d.end === 'present', (v) => { d.end = v ? 'present' : ''; drawDrawer(); }));
    if (isEdu) main.append(h('div', { class: 'grid2' }, F('Score', h('input', { type: 'text', value: d.extra.score || '', onchange: e => d.extra.score = e.target.value })), F('Remarks', h('input', { type: 'text', value: d.extra.remarks || '', onchange: e => d.extra.remarks = e.target.value }))));
    if (isSkill) main.append(h('div', { class: 'grid2' }, F('Category', h('input', { type: 'text', value: d.extra.category || '', onchange: e => d.extra.category = e.target.value })), F('Proficiency', h('input', { type: 'text', value: d.extra.level || '', onchange: e => d.extra.level = e.target.value }))));
    if (isLang) main.append(F('Level', h('input', { type: 'text', value: d.extra.level || '', placeholder: 'Native, Fluent...', onchange: e => d.extra.level = e.target.value })));
    main.append(h('div', { class: 'sp' }),
      F('Tags (comma separated)', h('input', { type: 'text', value: (d.tags || []).join(', '), onchange: e => d.tags = csv(e.target.value) })),
      F('Skills used (comma separated)', h('input', { type: 'text', value: (d.skills || []).join(', '), list: 'allSkills', onchange: e => d.skills = csv(e.target.value) })),
      h('datalist', { id: 'allSkills' }, skillTable().map(s => h('option', { value: s.name }))),
      F('Link', inp('link')), F('Notes (private, never on a CV)', h('textarea', { rows: 2, onchange: e => d.notes = e.target.value }, d.notes || '')));
    // proof
    const pr = d.proof;
    const proofBox = h('details', { class: 'acc', open: !!pr }, h('summary', null, 'Proof / certificate (optional)'), h('div', null,
      pr ? h('div', null, h('span', { class: 'pill good' }, pr.file || 'link only'), ' ', pr.file ? h('button', { class: 'btn small', onclick: async () => { const p = await call('attachments.path', { name: pr.file }); UI.openPath(p); } }, 'Open file') : null, ' ', h('button', { class: 'btn small danger', onclick: () => { d.proof = null; drawDrawer(); } }, 'Remove')) : null,
      h('button', { class: 'btn small', onclick: async () => { const fs = await UI.pickFiles({ multi: false, title: 'Attach a certificate or proof file' }); if (!fs.length) return; const f = fs[0]; const r = f.path ? await tryCall('attachments.add', { src: f.path }) : await tryCall('attachments.addBuffer', { name: f.name, b64: f.b64 }); if (r) { d.proof = Object.assign({ issued: '', expires: '', credentialUrl: '' }, d.proof || {}, { file: r.name }); drawDrawer(); } } }, pr && pr.file ? 'Replace file...' : 'Attach file...'),
      h('div', { class: 'grid2' }, F('Issued', h('input', { type: 'text', value: (pr && pr.issued) || '', placeholder: 'YYYY-MM', onchange: e => { d.proof = Object.assign({}, d.proof || {}, { issued: parseDateLoose(e.target.value) }); } })), F('Expires', h('input', { type: 'text', value: (pr && pr.expires) || '', placeholder: 'YYYY-MM', onchange: e => { d.proof = Object.assign({}, d.proof || {}, { expires: parseDateLoose(e.target.value) }); } }))),
      F('Credential URL', h('input', { type: 'text', value: (pr && pr.credentialUrl) || '', onchange: e => { d.proof = Object.assign({}, d.proof || {}, { credentialUrl: e.target.value }); } })),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: async () => { const u = (d.proof && d.proof.credentialUrl) || d.link; if (!u) return toast('Add a credential URL or link first'); const r = await tryCall('net.checkUrl', { url: u }); if (r) toast(r.ok ? 'Link works (' + r.status + ')' : 'Link problem: ' + (r.error || r.status), { err: !r.ok }); } }, 'Check link (uses internet)'))));
    main.append(proofBox);
    if (isNew) main.append(h('div', { class: 'sp' }), h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: saveDrawer }, 'Add to repository'), h('button', { class: 'btn', onclick: () => saveDrawer(null, true) }, 'Add and next')));
    if (!isNew && !isSkill && !isLang) ver.append(versionsBlock(d));
    if (!isNew) { const use = await tryCall('cv.usage', {}, true); const u = use && use[d.id]; if (RS.drawerState && RS.drawerState.draft === d) main.append(h('div', { class: 'sp' }), h('div', { class: 'small muted' }, 'Used in: ' + (u && u.length ? u.map(x => x.name).join(', ') : 'no CVs yet'), ' - added ' + new Date(d.addedAt).toLocaleDateString())); }
    if (!isNew && d.source) { const box = h('div', { class: 'card', style: { marginTop: '10px', padding: '10px 12px' } }, h('div', { class: 'row' }, UI.icon('doc'), h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'small muted' }, 'Added from'), h('div', { style: { overflowWrap: 'anywhere' } }, d.source)), d.sourceFile ? h('button', { class: 'btn small', onclick: async () => { const pth = await tryCall('import.path', { name: d.sourceFile }); if (pth) UI.openPath(pth); } }, UI.icon('external'), 'Open document') : null)); if (RS.drawerState && RS.drawerState.draft === d) main.append(box); }
    if (tok !== drawTok || !RS.drawerState) return;
    RS.drawerEl.append(h('div', { class: 'dscroll' }, tab === 'versions' ? ver : main));
    RS.drawerEl.oninput = RS.drawerEl.onchange = (e) => { if (!isNew && !(e && e.target && e.target.closest && e.target.closest('[data-nosave]'))) autoSave(); };
  }
  let autoT = null;
  function autoSave() {
    clearTimeout(autoT);
    autoT = setTimeout(async () => {
      if (!RS.drawerState || !RS.drawerState.id) return; const d = RS.drawerState.draft;
      try { await call('items.save', d); await App.reloadItems(); if (!RS.drawerState || RS.drawerState.id !== d.id) return; drawToolbar(); drawBulk(); drawList(); if (RS.drawerState && RS.drawerState.note) { RS.drawerState.note.style.opacity = 1; setTimeout(() => { if (RS.drawerState && RS.drawerState.note) RS.drawerState.note.style.opacity = 0; }, 1200); } } catch (err) { toast(err.message, { err: true }); }
    }, 600);
  }
  function versionsBlock(d) {
    const box = h('div');
    const add = h('textarea', { rows: 3, placeholder: 'Type a new wording to add, or text for the AI to rephrase...' });
    // the new wording slides in as one more card; nothing else is rebuilt, so the page keeps its place and nothing flashes
    async function addTyped() {
      const text = add.value.trim(); if (!text) return toast('Type a wording first');
      const r = await tryCall('items.addVersion', { id: d.id, text, source: 'manual' }); if (!r) return;
      await App.reloadItems(); const fresh = S.byId[d.id]; if (!fresh || !RS.drawerState || RS.drawerState.id !== d.id) return;
      const known = new Set((d.versions || []).map(v => v.id)); const added = (fresh.versions || []).filter(v => !known.has(v.id));
      d.versions = JSON.parse(JSON.stringify(fresh.versions || [])); add.value = '';
      for (const v of added) {
        const el = mk(v.id, 'Version', v.text, v.source); box.insertBefore(el, composer);
        const hgt = el.offsetHeight;
        if (el.animate) { el.style.overflow = 'hidden'; el.animate([{ height: '0px', opacity: 0, transform: 'translateY(-10px) scale(.98)', marginBottom: '0px' }, { height: hgt + 'px', opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => { el.style.overflow = ''; }; }
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      drawList();
    }
    const composer = h('div', { class: 'composer', 'data-nosave': '1' }, add, h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => addTyped() }, UI.icon('plus'), 'Add as version'),
      h('button', { class: 'btn small primary', onclick: () => App.rephrase(d, add.value.trim() || d.text, async () => { T.refresh(); T.openItem(d.id); }) }, UI.icon('sparkles'), 'Rephrase with AI'),
      h('span', { class: 'small muted' }, 'Empty box: the AI rephrases the original.')));
    box.append(h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, 'The main wording is used by default. Each CV can still choose its own.'));
    const mk = (vid, label, txt, source) => {
      const isMain = (d.mainVersion || null) === vid;
      const el = h('div', { class: 'ver' + (isMain ? ' main' : '') },
        h('label', { class: 'row small' }, h('input', { type: 'radio', name: 'mainv', checked: isMain, onchange: async () => { const it = await tryCall('items.setMain', { id: d.id, versionId: vid }); if (it) { d.mainVersion = vid; await App.reloadItems(); T.refresh(); } } }), h('b', null, isMain ? label + ' - main' : label), h('span', { class: 'pill' }, source || 'manual')),
        h('div', { style: { whiteSpace: 'pre-wrap', margin: '4px 0' } }, txt),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn small', onclick: async () => { const v = await promptBox('Edit wording', '', txt, { multiline: true, ok: 'Save' }); if (v != null && v.trim()) { const it = await tryCall('items.editVersion', { id: d.id, versionId: vid, text: v.trim() }); if (it) { await App.reloadItems(); T.openItem(d.id); T.refresh(); } } } }, 'Edit'),
          vid ? h('button', { class: 'btn small', onclick: async () => { const it = await tryCall('items.promoteVersion', { id: d.id, versionId: vid }); if (it) { await App.reloadItems(); T.refresh(); T.openItem(d.id); } } }, 'Make this the original') : null,
          vid ? h('button', { class: 'btn small', onclick: () => diffModal(d.text, txt) }, 'Compare with original') : null,
          vid ? h('button', { class: 'btn small danger', onclick: async () => { const it = await tryCall('items.deleteVersion', { id: d.id, versionId: vid }); if (it) { await App.reloadItems(); T.refresh(); T.openItem(d.id); } } }, 'Delete') : null));
      return el;
    };
    box.append(mk(null, 'Original', d.text || '(empty)', 'yours'));
    for (const v of d.versions || []) box.append(mk(v.id, 'Version', v.text, v.source + (v.label && v.source === 'ai' ? ': ' + v.label : '')));
    box.append(composer);
    return box;
  }
  function diffModal(a, b) {
    const diff = R.diffWords(a, b);
    modal('Original to version', h('div', { class: 'card diff' }, diffNodes(diff)));
  }
  App.diffModal = diffModal;
  async function saveDrawer(e, again) {
    const d = RS.drawerState.draft; const isNew = !RS.drawerState.id;
    try {
      if (isNew && RS.drawerState.multi) {
        const lines = (d.text || '').split(/\n+/).map(s => s.trim()).filter(Boolean); if (!lines.length) return toast('Nothing to add', { err: true });
        const items = lines.map(t => Object.assign(M.newItem(d), { id: M.uid('it'), text: t })); await call('items.saveMany', { items });
        toast(items.length + ' items added');
      } else {
        const it = await call('items.save', d);
        toast(isNew ? 'Added' : 'Saved');
        if (!isNew) RS.drawerState.draft = JSON.parse(JSON.stringify(it));
      }
    } catch (err) { return toast(err.message, { err: true }); }
    await App.reloadItems();
    if (isNew) { if (again) { const keep = { type: d.type, org: d.org, role: d.role, location: d.location, start: d.start, end: d.end, tags: d.tags }; RS.drawerState = { id: null, draft: M.newItem(keep), multi: false }; } else RS.drawerState = null; }
    T.refresh();
  }
  K.drawDrawer = drawDrawer;
})();
