'use strict';
// Repository tab: toolbar, bulk actions, the list (timeline / list / organisations), skills, merge-similar. The entry drawer is in repo-drawer.js.
(function () {
  const { h, clear, call, tryCall, toast, modal, promptBox, ctxMenu } = UI;
  const M = window.CVModel, R = window.CVReview;
  const S = App.state;
  const { parseDateLoose, csv, skillTable, diffNodes } = App;

  // ---------- Repository tab ----------
  const T = App.tabs.repo = {};
  const RS = { drawerEl: null, drawerState: null };   // shared with repo-drawer.js: the drawer element and what it is showing { id | null, draft }
  let root, listEl, bulkEl, toolbarEl, countEl;
  let pairIndex = 0, pairs = [];

  T.topActions = () => S.root ? [{ icon: 'plus', label: 'New entry', tip: 'Add an entry to your repository', fn: () => App.newEntry() }, { icon: 'sparkles', label: 'Refine', cls: 'primary', tip: 'Let the AI tidy the whole repository: categories, repetitions, skills and alternative wordings.', fn: () => App.refineDialog() }] : [];
  T.render = function (view) {
    root = h('div', { class: 'repo' }); clear(view).append(root);
    T.refresh();
  };
  T.refresh = function () {
    if (!root) return;
    clear(root);
    const main = h('div', { class: 'repo-main' });
    toolbarEl = h('div', { class: 'toolbar' }); bulkEl = h('div'); listEl = h('div', { class: 'list' });
    main.append(toolbarEl, bulkEl, listEl);
    root.append(main);
    RS.drawerEl = h('div', { class: 'drawer', style: { display: 'none' } }); root.append(RS.drawerEl);
    drawToolbar(); drawBulk(); drawList();
    if (RS.drawerState) { root.classList.add('dopen'); App.repoKit.drawDrawer(); }
  };
  function drawToolbar() {
    clear(toolbarEl);
    const st = S.repo;
    if (st.merge) {
      toolbarEl.append(h('div', { class: 'r1' }, h('b', { style: { fontSize: '15px' } }, 'Merge similar items'), h('span', { class: 'muted small' }, 'Pairs that look alike: same organisation and type, overlapping dates, similar wording.'), h('div', { class: 'spacer' }), h('button', { class: 'btn on', onclick: () => { st.merge = false; T.refresh(); } }, UI.icon('merge'), 'Merge mode: on')));
      return;
    }
    const fb = UI.filterBar(st, () => { drawList(); drawBulk(); countUpdate(); }, { onPersonal: () => T.closeDrawer && T.closeDrawer() });
    countEl = h('span', { class: 'muted small' });
    const views = UI.seg([['timeline', 'Timeline', 'timeline', 'Group the list by year, newest first.', 'see 2024 together'], ['list', 'List', 'list', 'One flat list in the chosen sort order.'], ['org', 'Organisations', 'building', 'Group the list under each organisation.', 'everything from NPCI in one place']], st.view === 'skills' ? 'timeline' : st.view, (v) => { st.view = v; drawList(); }, { sm: true }); views.classList.add('viewseg');
    const mk = (ic, label, tip, eg, fn) => { const b = h('button', { class: 'btn small', onclick: fn }, UI.icon(ic), h('span', { class: 'lbl' }, label)); return UI.tipAttrs(b, tip, eg); };
    toolbarEl.append(
      h('div', { class: 'r1 r1c' }, h('div', { class: 'r1l' }, views, countEl), h('div', { class: 'r1m' }, fb.search),
        h('div', { class: 'r1r' }, mk('merge', 'Merge similar', 'Find entries that look like near-duplicates and decide to delete one or keep it as an alternative wording.', 'two slightly different "Led a team of 5" bullets', startMerge),
          mk('sliders', 'Smart rules', 'Saved rules that pick entries by tag, skill or recency in one click inside the editor.', "'last 3 years + data'", App.rulesDialog),
          mk('trash', 'Bin', 'Deleted entries stay here for 30 days before they are removed for good.', null, App.binDialog))),
      h('div', { class: 'r2' }, fb.bar));
    countUpdate();
  }
  function countUpdate() { if (countEl) countEl.textContent = UI.applyFilters(S.items, S.repo).length + ' of ' + S.items.filter(i => !i.archived).length + ' items'; }
  function drawBulk() {
    clear(bulkEl);
    const n = S.repo.sel.size; if (!n || S.repo.merge) return;
    bulkEl.append(h('div', { class: 'bulkbar' }, h('b', null, n + ' selected'), h('button', { class: 'btn small', onclick: () => { UI.applyFilters(S.items, S.repo).forEach(i => S.repo.sel.add(i.id)); drawBulk(); drawList(); } }, 'Select all shown'),
      h('button', { class: 'btn small', onclick: bulkTag }, 'Tag...'),
      h('button', { class: 'btn small', onclick: bulkSetField }, 'Set organisation / role / dates...'),
      h('button', { class: 'btn small', onclick: bulkAddToCv }, 'Add to a CV...'),
      h('button', { class: 'btn small', onclick: () => archiveSel(true) }, 'Archive'),
      h('button', { class: 'btn small', onclick: T.deleteSelected }, 'Move to bin'),
      h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => { S.repo.sel.clear(); drawBulk(); drawList(); } }, 'Clear selection')));
  }
  async function bulkTag() {
    const v = await promptBox('Add tags to ' + S.repo.sel.size + ' items', 'Comma separated tags', ''); if (!v) return;
    const tags = csv(v); const items = [...S.repo.sel].map(id => S.byId[id]).filter(Boolean).map(i => Object.assign({}, i, { tags: [...new Set((i.tags || []).concat(tags))] }));
    await call('items.saveMany', { items }); await App.reloadItems(); T.refresh(); toast('Tagged');
  }
  async function bulkSetField() {
    const org = h('input', { type: 'text', placeholder: 'leave blank to keep' }), role = h('input', { type: 'text', placeholder: 'leave blank to keep' }), start = h('input', { type: 'text', placeholder: 'YYYY-MM' }), end = h('input', { type: 'text', placeholder: 'YYYY-MM or present' }), type = h('select', null, [h('option', { value: '' }, 'keep')].concat(M.TYPES.map(t => h('option', { value: t.key }, t.label))));
    const ok = await modal('Set fields on ' + S.repo.sel.size + ' items', h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Type', type), h('label', { class: 'f' }, 'Organisation', org), h('label', { class: 'f' }, 'Role / label', role), h('div'), h('label', { class: 'f' }, 'Start', start), h('label', { class: 'f' }, 'End', end)), { buttons: [{ label: 'Cancel', value: false }, { label: 'Apply', value: true, cls: 'primary' }] });
    if (!ok) return;
    const items = [...S.repo.sel].map(id => S.byId[id]).filter(Boolean).map(i => { const c = Object.assign({}, i); if (type.value) c.type = type.value; if (org.value.trim()) c.org = org.value.trim(); if (role.value.trim()) c.role = role.value.trim(); if (start.value.trim()) c.start = parseDateLoose(start.value); if (end.value.trim()) c.end = parseDateLoose(end.value); return c; });
    await call('items.saveMany', { items }); await App.reloadItems(); T.refresh(); toast('Updated ' + items.length + ' items');
  }
  async function bulkAddToCv() {
    await App.reloadCvs();
    const sel = h('select', null, [h('option', { value: '' }, 'Choose a CV...')].concat(S.cvs.map(c => h('option', { value: c.id }, c.name))));
    const ok = await modal('Add ' + S.repo.sel.size + ' items to a CV', sel, { buttons: [{ label: 'Cancel', value: false }, { label: 'Add', value: true, cls: 'primary' }] });
    if (!ok || !sel.value) return;
    const cv = await call('cv.get', { id: sel.value }); const have = new Set(cv.selected.map(s => s.itemId));
    for (const id of S.repo.sel) if (!have.has(id)) cv.selected.push({ itemId: id, versionId: null });
    await call('cv.save', cv); toast('Added to ' + cv.name);
  }
  async function archiveSel(a) { await call('items.archive', { ids: [...S.repo.sel], archived: a }); S.repo.sel.clear(); await App.reloadItems(); T.refresh(); toast(a ? 'Archived' : 'Restored from archive'); }
  T.deleteSelected = async function () {
    const ids = [...S.repo.sel]; if (!ids.length) return;
    await call('items.deleteMany', { ids }); S.repo.sel.clear(); RS.drawerState = null; await App.reloadItems();
    T.refresh();
    toast(ids.length + ' item(s) moved to the recycle bin', { action: { label: 'Undo', fn: async () => { for (const id of ids) await tryCall('trash.restore', { kind: 'item', id }); await App.reloadItems(); T.refresh(); } } });
  };

  // ---------- list rendering ----------
  // One entry as a card made of up to three small cards: when | who | what
  function itemCard(it, o) {
    o = o || {};
    const sel = o.sel != null ? o.sel : S.repo.sel.has(it.id);
    const isEdu = it.type === 'education';
    const who = h('div', { class: 'mini who' },
      isEdu && it.title ? h('div', { class: 'org' }, it.title) : null,
      !isEdu && it.org ? h('div', { class: 'org' }, it.org) : null,
      isEdu && it.org ? h('div', { class: 'role' }, it.org) : null,
      it.role ? h('div', { class: 'role' }, it.role) : null,
      !isEdu && it.title && it.text ? h('div', { class: 'role' }, it.title) : null,
      it.location ? h('div', { class: 'role' }, it.location) : null);
    const hasWho = who.childNodes.length > 0;
    const text = M.itemText(it) || (it.type === 'skill' || it.type === 'language' ? it.title : '');
    const what = h('div', { class: 'mini what' },
      text ? h('div', { class: 'txt' }, text) : (isEdu ? h('div', { class: 'muted small' }, [it.extra && it.extra.score, it.extra && it.extra.remarks].filter(Boolean).join('  |  ') || 'No notes') : h('i', { class: 'muted' }, '(no text)')),
      (it.tags || []).length || (it.skills || []).length || it.proof || (it.versions || []).length ? h('div', { class: 'tags' }, (it.versions || []).length ? h('span', { class: 'pill accent' }, (it.versions.length + 1) + ' wordings') : null, (it.tags || []).map(t => h('span', { class: 'pill' }, t)), (it.skills || []).map(t => h('span', { class: 'pill accent' }, t)), it.proof ? h('span', { class: 'pill good' }, 'proof' + (it.proof.expires ? ' - expires ' + it.proof.expires : '')) : null) : null);
    const when = h('div', { class: 'mini when' }, h('span', { class: 'type t-' + it.type }, UI.typeLabel(it.type)), h('div', { class: 'dates' }, UI.datesOf(it) || (it.type === 'skill' ? '' : h('span', { class: 'muted small' }, 'no dates'))));
    const acts = h('div', { class: 'acts' + (o.keepActs ? ' keep' : '') });
    // star (always available) with the add-to-CV button stacked under it
    const hasAdd = !!(S.cv && o.addToCv !== false);
    const stack = h('div', { class: 'starstack' + (it.starred ? ' on' : '') + (hasAdd ? ' hasadd' : '') });
    const starB = h('button', { class: 'icon-btn sm starbtn' + (it.starred ? ' on' : ''), onclick: async (e) => { e.stopPropagation(); const v = !it.starred; it.starred = v; stack.classList.toggle('on', v); starB.classList.toggle('on', v); if (el) el.classList.toggle('starred', v); clear(starB).append(UI.icon('star', { filled: v })); await call('items.star', { ids: [it.id], starred: v }); const mem = S.byId[it.id]; if (mem) mem.starred = v; } }, UI.icon('star', { filled: !!it.starred }));
    UI.tipAttrs(starB, it.starred ? 'Starred. Click to remove the star.' : 'Star this entry so it is easy to find later.'); stack.append(starB);
    if (hasAdd) {
      const inCv = S.cv.selected.some(x => x.itemId === it.id);
      const b = h('button', { class: 'icon-btn sm addbtn' + (inCv ? ' on' : ''), onclick: async (e) => { e.stopPropagation(); await addToCurrentCv(it.id, !inCv); if (o.onChange) o.onChange(); else T.refresh(); } }, UI.icon(inCv ? 'check' : 'plus'));
      UI.tipAttrs(b, inCv ? 'In "' + S.cv.name + '". Click to take it out.' : 'Add to the CV you have open: "' + S.cv.name + '".'); stack.append(b);
    }
    for (const a of o.actions || []) acts.append(a);
    const el = h('div', { class: 'item' + (sel ? ' sel' : '') + (it.archived ? ' archived' : '') + (it.starred ? ' starred' : '') + (o.hidden ? ' hid' : ''), 'data-id': it.id, onclick: o.onOpen || (() => T.toggleItem(it.id)), oncontextmenu: o.onCtx || ((e) => { e.preventDefault(); ctxMenu(e.clientX, e.clientY, [{ label: 'Open details', fn: () => T.openItem(it.id) }, { label: it.archived ? 'Unarchive' : 'Archive', fn: async () => { await call('items.archive', { ids: [it.id], archived: !it.archived }); await App.reloadItems(); T.refresh(); } }, { label: 'Rephrase with AI...', fn: () => App.rephrase(it, null, () => T.refresh()) }, '-', { label: 'Move to bin', fn: async () => { S.repo.sel = new Set([it.id]); T.deleteSelected(); } }]); }) },
      h('div', { class: 'lead' }, UI.pick(sel, (e) => { if (o.onToggle) return o.onToggle(); if (S.repo.sel.has(it.id)) S.repo.sel.delete(it.id); else S.repo.sel.add(it.id); drawBulk(); el.classList.toggle('sel', S.repo.sel.has(it.id)); e.currentTarget.classList.toggle('on', S.repo.sel.has(it.id)); }, 'Select this entry for bulk actions')),
      h('div', { class: 'cards' }, when, hasWho ? who : null, what), stack, acts);
    return el;
  }
  App.itemCard = itemCard;
    async function addToCurrentCv(id, add) {
    const cv = S.cv; if (!cv) return;
    if (add) { if (!cv.selected.some(x => x.itemId === id)) cv.selected.push({ itemId: id, versionId: null }); } else cv.selected = cv.selected.filter(x => x.itemId !== id);
    await call('cv.save', cv); toast(add ? 'Added to "' + cv.name + '"' : 'Removed from "' + cv.name + '"');
  }
  function drawList() {
    clear(listEl);
    if (S.repo.group === 'personal' && !S.repo.merge) {
      const skBtn = h('button', { class: 'btn small' + (S.repo.skillsOpen ? ' primary' : ''), 'data-tip': 'Show or hide your skills, grouped by category.', onclick: () => { S.repo.skillsOpen = !S.repo.skillsOpen; drawList(); } }, UI.icon('sparkles'), 'Skills');
      const save = UI.debounce(() => App.saveSettings({ header: Object.assign({}, S.settings.header) }), 400);
      listEl.append(App.personalPanel({ getHeader: () => S.settings.header, set: (k, v) => { S.settings.header[k] = v; save(); },
        apply: (d) => { Object.assign(S.settings.header, d); App.saveSettings({ header: Object.assign({}, S.settings.header) }); },
        setPhoto: (d) => { S.settings.header.photo = d; save(); }, setLinks: (arr) => { S.settings.header.links = arr; save(); },
        headExtra: skBtn, title: 'Personal details', note: 'These are added to every new CV. Existing CVs keep their own copy, which you edit in the Editor.' }));
      if (S.repo.skillsOpen) { const card = h('div', { class: 'card skillscard' }, h('h3', { style: { margin: '0 0 8px' } }, 'Skills')); listEl.append(card); drawSkills(card); }
      return;
    }
    if (S.repo.merge) return drawMerge();
    const st = S.repo;
    const items = UI.applyFilters(S.items, st).filter(i => i.type !== 'skill' || (st.group === 'custom' && Array.isArray(st.types) && st.types.includes('skill')));
    if (!S.items.length) { listEl.append(h('div', { class: 'empty' }, Logo.el('flat', 72), h('h3', null, 'Your repository is empty'), h('p', null, 'Add an entry, or import your existing CVs.'), h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => T.openNew() }, UI.icon('plus'), 'Add entry'), h('button', { class: 'btn', onclick: () => App.go('import', { pick: true }) }, UI.icon('inbox'), 'Import a CV')))); return; }
    if (!items.length) { listEl.append(h('div', { class: 'empty' }, 'Nothing matches these filters.')); return; }
    if (st.view === 'org') {
      const g = new Map(); for (const it of items) { const k = it.org || '(no organisation)'; if (!g.has(k)) g.set(k, []); g.get(k).push(it); }
      for (const [k, arr] of g) { listEl.append(h('div', { class: 'groupHead' }, UI.icon('building'), k, h('span', { class: 'muted small' }, arr.length + ' items'))); arr.forEach(i => listEl.append(itemCard(i))); }
    } else if (st.view === 'timeline') {
      const g = new Map(); for (const it of items) { const y = (it.end === 'present' ? 'Present' : ((it.end || it.start || '').slice(0, 4) || 'Undated')); if (!g.has(y)) g.set(y, []); g.get(y).push(it); }
      const keys = [...g.keys()].sort((a, b) => (a === 'Present' ? 1 : 0) - (b === 'Present' ? 1 : 0) === 0 ? (b > a ? 1 : -1) : (a === 'Present' ? -1 : 1));
      { const sp = UI.sortSpec(st); if (sp.dir !== UI.SORT_BASE[sp.key][2]) keys.reverse(); }   // the direction button flips the year order too
      for (const k of keys) { listEl.append(h('div', { class: 'yearhead' }, h('span', null, k), h('span', { class: 'muted small', style: { fontWeight: 400, marginLeft: 0 } }, g.get(k).length + (g.get(k).length === 1 ? ' entry' : ' entries')))); const box = h('div', { class: 'timeline' }); g.get(k).forEach(i => box.append(itemCard(i))); listEl.append(box); }
    } else items.forEach(i => listEl.append(itemCard(i)));
  }
  function drawSkills(listEl) {
    const skills = skillTable();
    if (!skills.length) { listEl.append(h('div', { class: 'empty' }, 'No skills yet. Add skills to items (the "Skills" field) or add items of type Skill.')); return; }
    const cats = new Map(); for (const s of skills) { if (!cats.has(s.category)) cats.set(s.category, []); cats.get(s.category).push(s); }
    for (const [c, arr] of [...cats].sort((a, b) => a[0].localeCompare(b[0]))) {
      listEl.append(h('div', { class: 'groupHead' }, c, h('span', { class: 'muted small' }, arr.length + ' skills')));
      const wrap = h('div'); const detail = h('div');
      arr.sort((a, b) => b.items.length - a.items.length).forEach(s => wrap.append(h('span', { class: 'chip', onclick: () => showSkill(s, detail) }, s.name, h('small', null, (s.years ? s.years + 'y' : '') + (s.level ? ' ' + s.level : '') + ' ' + s.items.length + ' items'))));
      listEl.append(wrap, detail);
    }
  }
  function showSkill(s, box) {
    clear(box);
    const cat = h('input', { type: 'text', list: 'catlist', value: s.category === 'Uncategorised' ? '' : s.category, placeholder: 'Category' });
    const lvl = h('select', null, ['', 'Beginner', 'Intermediate', 'Advanced', 'Expert'].map(l => h('option', { value: l, selected: l === s.level }, l || 'Proficiency')));
    box.append(h('div', { class: 'card', style: { margin: '6px 0 12px' } }, h('div', { class: 'row wrap' }, h('b', null, s.name), h('span', { class: 'muted small' }, (s.years ? '~' + s.years + ' years across dated items' : 'no dated items')), cat, lvl, h('button', { class: 'btn small primary', onclick: async () => { await call('skills.set', { name: s.name, category: cat.value.trim() || 'Uncategorised', level: lvl.value }); await App.reloadSettings(); drawList(); toast('Saved'); } }, 'Save')), h('datalist', { id: 'catlist' }, [...new Set(skillTable().map(x => x.category))].map(c => h('option', { value: c }))), h('div', { class: 'sp' }), s.items.length ? s.items.map(i => itemCard(i)) : h('div', { class: 'muted small' }, 'Not yet linked to any item.')));
  }

  // ---------- merge similar ----------
  async function startMerge() {
    pairs = await tryCall('dup.find'); if (!pairs) return;
    S.repo.merge = true; pairIndex = 0; T.refresh();
  }
  function drawMerge() {
    if (!pairs.length) { listEl.append(h('div', { class: 'empty' }, h('h3', null, 'No similar items found'), h('p', null, 'Nothing looks like a duplicate right now.'), h('button', { class: 'btn', onclick: () => { S.repo.merge = false; T.refresh(); } }, 'Back to the list'))); return; }
    if (pairIndex >= pairs.length) pairIndex = pairs.length - 1;
    const p = pairs[pairIndex]; const a = S.byId[p.keep], b = S.byId[p.other];
    if (!a || !b) { pairs.splice(pairIndex, 1); return drawMerge(); }
    const side = (it, keep, label) => h('div', { class: 'pairside' + (keep ? ' keep' : '') }, h('div', { class: 'row' }, h('b', null, label), h('span', { class: 'type' }, UI.typeLabel(it.type)), (it.versions || []).length ? h('span', { class: 'pill accent' }, (it.versions.length + 1) + ' versions') : null), h('p', { style: { whiteSpace: 'pre-wrap' } }, UI.textOf(it)), h('div', { class: 'meta muted small' }, UI.metaLine(it).join(' - ')), h('div', { class: 'meta muted small' }, 'added ' + new Date(it.addedAt).toLocaleDateString() + (it.source ? ' - from ' + it.source : '')));
    const diff = R.diffWords(UI.textOf(a), UI.textOf(b));
    const next = () => { pairs.splice(pairIndex, 1); if (pairIndex >= pairs.length) pairIndex = Math.max(0, pairs.length - 1); redrawMerge(); };
    const act = async (keep, other, action) => { const r = await tryCall('dup.resolve', { keep, other, action, key: p.key }); if (!r) return; await App.reloadItems(); next(); };
    const sug = p.suggestion === 'delete' ? 'These read as the same item. Suggested: delete the right-hand one.' : 'Same achievement, different wording. Suggested: keep the left item and store the right-hand wording as an alternative version.';
    listEl.append(
      h('div', { class: 'row', style: { marginBottom: '8px' } }, h('b', null, 'Pair ' + (pairIndex + 1) + ' of ' + pairs.length), h('span', { class: 'pill' }, Math.round(p.textSimilarity * 100) + '% similar wording'), p.reasons.map(r => h('span', { class: 'pill accent' }, r)), h('div', { class: 'spacer' }), h('button', { class: 'btn small', disabled: pairIndex === 0, onclick: () => { pairIndex--; redrawMerge(); } }, 'Previous'), h('button', { class: 'btn small', disabled: pairIndex >= pairs.length - 1, onclick: () => { pairIndex++; redrawMerge(); } }, 'Skip')),
      h('div', { class: 'card', style: { marginBottom: '10px', background: 'var(--accent-weak)' } }, sug),
      h('div', { class: 'pair' }, side(a, true, 'Keep (A)'), side(b, false, 'Other (B)')),
      h('h3', null, 'Differences, A to B'), h('div', { class: 'card diff' }, diffNodes(diff)),
      h('div', { class: 'row wrap', style: { marginTop: '12px' } },
        h('button', { class: 'btn primary', onclick: () => act(p.keep, p.other, 'nest') }, 'Nest B under A as alternative version'),
        h('button', { class: 'btn', onclick: () => act(p.other, p.keep, 'nest') }, 'Nest A under B instead'),
        h('button', { class: 'btn danger', onclick: () => act(p.keep, p.other, 'delete') }, 'Delete B (keep A)'),
        h('button', { class: 'btn danger', onclick: () => act(p.other, p.keep, 'delete') }, 'Delete A (keep B)'),
        h('button', { class: 'btn', onclick: () => act(p.keep, p.other, 'both') }, 'Keep both, stop asking')));
  }
  function redrawMerge() { clear(listEl); drawMerge(); }
  App.repoKit = { RS, drawToolbar, drawBulk, drawList, itemCard };
})();
