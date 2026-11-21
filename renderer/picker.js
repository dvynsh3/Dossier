'use strict';
// Shared item picker (check / hide) and the "New CV" window with Browse / Repository / LinkedIn tabs.
(function () {
  const { h, clear, tryCall, modal, icon } = UI;
  const M = window.CVModel, TP = window.CVTemplates;
  const S = App.state;

  // ---------- picker ----------
  // o: { sel:Set, hid:Set, note, onChange }
  App.makePicker = function (o) {
    const sel0 = () => [...(o.sel || [])];
    const sel = o.sel || new Set(), hid = o.hid || new Set();
    const st = { sort: 'date', dir: 'desc', group: 'all', q: '', tag: '', arch: 'not', star: !o.addTo && S.items.some(i => i.starred && !i.archived) ? 'only' : 'all', moreOpen: !o.addTo && S.items.some(i => i.starred && !i.archived) };
    const inCv = new Set(o.addTo ? sel0() : []); let showCv = false;
    let showSel = null, showHid = null, allMode = false;
    const root = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } });
    const listEl = h('div', { class: 'list', style: { padding: '12px 4px 20px' } });
    const countEl = h('span', { class: 'muted small' });
    const changed = () => { if (o.onChange) o.onChange(sel, hid); };
    const visible = () => UI.applyFilters(S.items, st).filter(i => (o.addTo && !showCv ? !inCv.has(i.id) : true) && (showSel === 'sel' ? sel.has(i.id) : showSel === 'unsel' ? !sel.has(i.id) : true) && (allMode ? true : showHid === 'hid' ? hid.has(i.id) : showHid === 'unhid' ? !hid.has(i.id) : !hid.has(i.id)));
    const draw = () => {
      const top = listEl.scrollTop; clear(listEl);
      const items = visible();
      countEl.textContent = items.length + ' shown | ' + sel.size + ' selected | ' + hid.size + ' hidden';
      if (!items.length) listEl.append(h('div', { class: 'empty' }, S.items.length ? 'Nothing matches the filters.' : 'Your repository is empty. Add entries or import a CV first.'));
      for (const it of items) {
        const eye = h('button', { class: 'icon-btn sm' + (hid.has(it.id) ? ' on' : ''), onclick: (e) => { e.stopPropagation(); if (hid.has(it.id)) hid.delete(it.id); else hid.add(it.id); changed(); draw(); } }, icon(hid.has(it.id) ? 'eyeOff' : 'eye'));
        UI.tipAttrs(eye, hid.has(it.id) ? 'Hidden from your working list. Click to show it again.' : 'Hide this entry so it stops cluttering the list. It stays in your repository.');
        const toggle = () => { if (sel.has(it.id)) sel.delete(it.id); else sel.add(it.id); changed(); draw(); };
        listEl.append(App.itemCard(it, { sel: sel.has(it.id), hidden: hid.has(it.id), onToggle: toggle, onOpen: toggle, onCtx: (e) => e.preventDefault(), addToCv: false, actions: [eye], keepActs: hid.has(it.id) }));
      }
      listEl.scrollTop = top;
    };
    const fb = UI.filterBar(st, draw, { noPersonal: true });
    const cyc = (cur, a, b) => cur === null ? a : cur === a ? b : null;
    const showRow = h('div', { class: 'showrow' });
    const drawShow = () => {
      clear(showRow);
      const all = h('button', { class: allMode ? 'on' : '', onclick: () => { allMode = !allMode; if (allMode) { showSel = null; showHid = null; } drawShow(); draw(); } }, 'All');
      const bs = h('button', { class: showSel ? 'on' : '', onclick: () => { allMode = false; showSel = cyc(showSel, 'sel', 'unsel'); drawShow(); draw(); } }, icon('check'), showSel === 'unsel' ? 'Unselected only' : 'Selected only');
      const bh = h('button', { class: showHid ? 'on' : '', onclick: () => { allMode = false; showHid = cyc(showHid, 'hid', 'unhid'); drawShow(); draw(); } }, icon(showHid === 'unhid' ? 'eye' : 'eyeOff'), showHid === 'unhid' ? 'Unhidden only' : 'Hidden only');
      const bc = o.addTo ? h('button', { class: 'cur' + (showCv ? ' on' : ''), onclick: () => { showCv = !showCv; drawShow(); draw(); } }, icon('layers'), 'Currently in CV') : null;
      if (bc) UI.tipAttrs(bc, 'Off: only entries that are not in this CV yet. On: every entry, with the ones already in the CV ticked.');
      UI.tipAttrs(all, 'Click to show every entry, including the ones you hid. Click again to go back to your working list (hidden ones tucked away).'); UI.tipAttrs(bs, 'Click to show only selected entries; click again for only the unselected ones; once more to turn it off.'); UI.tipAttrs(bh, 'Click to show only hidden entries; click again for only the ones you have not hidden; once more to turn it off.');
      showRow.append(
        h('div', { class: 'srl' }, h('button', { class: 'btn small', onclick: () => { visible().forEach(i => sel.add(i.id)); changed(); draw(); } }, 'Select all shown'),
          h('button', { class: 'btn small', onclick: () => { visible().forEach(i => sel.delete(i.id)); changed(); draw(); } }, 'Unselect all shown')),
        h('div', { class: 'src' }, countEl),
        h('div', { class: 'srr' }, h('span', { class: 'muted', style: { fontWeight: 600 } }, 'Show:'), h('div', { class: 'seg sm' }, all, bs, bh, bc)));
    };
    drawShow();
    root.append(o.note ? h('div', { class: 'cursorbar', style: { marginBottom: '10px' } }, icon('info'), h('span', { style: { flex: 1 } }, o.note)) : null,
      h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, fb.search), h('div', { style: { marginBottom: '8px' } }, fb.bar), showRow, listEl);
    draw();
    return { el: root, sel, hid, redraw: draw };
  };

  // ---------- New CV window ----------
  // o.mode: 'new' (default) or 'addTo' with o.cv
  App.newCvModal = async function (o) {
    o = o || {}; const addTo = o.mode === 'addTo' && o.cv;
    await Promise.all([App.reloadCvs(), App.reloadItems()]);
    const profiles = await tryCall('liprofiles.list', {}, true) || [];
    let tab = addTo ? 'repo' : 'browse'; let box = null; let liChoice = null;
    const picker = App.makePicker({ addTo, sel: new Set(addTo ? o.cv.selected.map(s => s.itemId) : []), hid: new Set(addTo ? (o.cv.hidden || []) : []), note: addTo ? 'Tick the entries to add to "' + o.cv.name + '". They go into their sections automatically. Turn on "Currently in CV" to see what is already in it (unticking removes an entry).' : 'Tick the entries to build the new CV from, and hide the ones you do not want to see. Your repository entries are not changed.', onChange: () => footer() });
    const root = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } });
    const tabsEl = h('div', { class: 'seg' }); const body = h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto', paddingTop: '12px' } }); const foot = h('div', { class: 'row', style: { paddingTop: '14px', borderTop: '1px solid var(--line)', marginTop: '10px' } });
    const close = (v) => box && box.close(v);
    const note = (t) => h('div', { class: 'cursorbar', style: { marginBottom: '12px' } }, icon('info'), h('span', null, t));

    const drawTabs = () => {
      clear(tabsEl);
      if (addTo) return;
      [['browse', 'Browse CVs', 'grid'], ['repo', 'Repository', 'folder'], ['li', 'LinkedIn', 'link']].forEach(([k, l, ic]) => tabsEl.append(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; drawTabs(); drawBody(); footer(); } }, icon(ic), l)));
    };
    const drawBody = () => {
      clear(body); body.style.overflow = tab === 'repo' ? 'hidden' : 'auto';
      if (tab === 'repo') { body.append(picker.el); picker.redraw(); return; }
      if (tab === 'browse') {
        body.append(note('Clicking a CV makes a copy of it and opens the copy in the editor. The original CV is never changed.'));
        const grid = h('div', { class: 'cvgrid' }); body.append(grid);
        if (!S.cvs.length) grid.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, 'No CVs yet. Use the Repository tab to build your first one.'));
        for (const c of S.cvs) {
          const thumb = h('div', { class: 'thumb', 'data-id': c.id }, h('div', { class: 'empty small' }, 'Loading...'));
          const card = h('div', { class: 'cvcard', onclick: async () => { const n = await tryCall('cv.duplicate', { id: c.id }); if (!n) return; await App.reloadCvs(); close(true); S.editor.blockMode = false; S.editor.panelOpen = false; App.openCV(n.id); } }, thumb, h('div', { class: 'info' }, h('b', null, c.name), h('div', { class: 'muted small' }, [c.targetRole, c.company].filter(Boolean).join(' - ') || 'No target set')));
          grid.append(card); App.cvThumb && App.cvThumb(c.id, thumb);
        }
        return;
      }
      body.append(note('Pick a stored LinkedIn profile. A new CV is built from its entries only. The stored profile is not changed.'));
      if (!profiles.length) {
        body.append(h('div', { class: 'card' }, h('h3', { style: { marginTop: 0 } }, 'No LinkedIn profile stored yet'),
          h('ol', { style: { lineHeight: 1.8, paddingLeft: '20px' } }, h('li', null, 'On LinkedIn open Settings & Privacy, then Data privacy.'), h('li', null, 'Choose "Get a copy of your data", tick the items you want (Profile, Positions, Education, Skills...) and request the archive.'), h('li', null, 'LinkedIn emails you a link, usually within minutes to a day. Download the ZIP.'), h('li', null, 'Drop that ZIP on the Import tab. It is stored here as "Your name linkedin profile - date".')),
          h('button', { class: 'btn primary', onclick: () => { close(false); App.go('import'); } }, icon('inbox'), 'Go to Import')));
        return;
      }
      const list = h('div', { class: 'cols' });
      for (const p of profiles) { const on = liChoice === p.id; list.append(h('div', { class: 'card', style: { cursor: 'pointer', borderColor: on ? 'var(--accent)' : null, background: on ? 'var(--accent-weak)' : null }, onclick: () => { liChoice = p.id; drawBody(); footer(); } }, h('div', { class: 'row' }, UI.pick(on, null), h('div', { style: { flex: 1 } }, h('b', null, p.name), h('div', { class: 'muted small' }, p.itemIds.filter(id => S.byId[id]).length + ' entries - stored ' + new Date(p.created).toLocaleDateString()))))); }
      body.append(list);
    };
    const footer = () => {
      clear(foot);
      const n = picker.sel.size;
      let label, can, fn;
      if (addTo) { label = 'Update "' + o.cv.name + '"'; can = true; fn = applyAddTo; }
      else if (tab === 'repo') { label = n ? 'Create new CV with ' + n + ' entr' + (n === 1 ? 'y' : 'ies') : 'Create blank CV'; can = true; fn = createFromRepo; }
      else if (tab === 'li') { label = 'Create new CV from profile'; can = !!liChoice; fn = createFromProfile; }
      else { label = 'Create new CV'; can = false; fn = null; }
      foot.append(tab === 'browse' && !addTo ? h('span', { class: 'muted small' }, 'Click a CV above to start from a copy of it, or use the Repository or LinkedIn tab.') : h('span', { class: 'muted small' }, ''), h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => close(false) }, 'Cancel'), h('button', { class: 'btn primary', disabled: !can, onclick: fn || (() => {}) }, label));
    };
    // a freshly made CV opens in the editor with block select on and the side panel closed
    async function openNewCv(cv) { await App.reloadCvs(); close(true); S.cv = cv; S.editor.blockMode = true; S.editor.panelOpen = false; S.editor.block = null; S.editor.mode = 'cv'; S.editor.cursor = null; App.go('editor'); }
    async function createFromRepo() {
      const ids = [...picker.sel];
      const cv = await tryCall('cv.create', { name: 'New CV ' + new Date().toISOString().slice(0, 10), selected: ids.map(id => ({ itemId: id, versionId: null })), hidden: [...picker.hid] });
      if (!cv) return; await openNewCv(cv);
    }
    async function createFromProfile() {
      const p = profiles.find(x => x.id === liChoice); if (!p) return;
      const ids = p.itemIds.filter(id => S.byId[id]);
      const cv = await tryCall('cv.create', { name: p.name.replace(/ linkedin profile.*/i, '') + ' from LinkedIn', selected: ids.map(id => ({ itemId: id, versionId: null })), header: Object.assign({}, S.settings.header || {}, p.header || {}) });
      if (!cv) return; await openNewCv(cv);
    }
    async function applyAddTo() {
      const cv = o.cv; const want = picker.sel; const have = new Set(cv.selected.map(s => s.itemId));
      cv.selected = cv.selected.filter(s => want.has(s.itemId));
      const secOf = (id) => { const it = S.byId[id]; return it && (cv.sections || []).find(x => !x.pb && (x.types || []).includes(it.type)); };
      for (const id of want) {
        if (have.has(id)) continue;
        // date order sorts itself; a hand-ordered CV gets the entry at the bottom of its section
        let at = cv.selected.length;
        if (cv.sortMode === 'manual') { const sec = secOf(id); let last = -1; if (sec) cv.selected.forEach((s, i) => { const it = S.byId[s.itemId]; if (it && sec.types.includes(it.type)) last = i; }); if (last >= 0) at = last + 1; }
        cv.selected.splice(at, 0, { itemId: id, versionId: null });
      }
      cv.hidden = [...picker.hid]; close(true); if (o.onDone) o.onDone(cv);
    }
    drawTabs(); drawBody(); footer();
    root.append(h('div', { class: 'row' }, h('h2', { style: { margin: 0, flex: 1 } }, addTo ? 'Add entries from the repository' : 'Create a new CV'), tabsEl, h('button', { class: 'icon-btn', onclick: () => close(false) }, icon('x'))), body, foot);
    return modal('', root, { huge: true, noTitle: true, buttons: [], focus: false, onOpen: (b) => { box = b; } });
  };
})();
