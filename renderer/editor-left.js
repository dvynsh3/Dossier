'use strict';
// Editor: left panel (block list and block details).
// Part of the editor (see editor.js). It shares the editor's state and helpers through App.edKit.
(function () {
  const { h, clear, toast, icon } = UI;
  const TP = window.CVTemplates;
  const S = App.state;
  const K = App.edKit;
  const { E, mutate, cvOrder, isChosen, moveBlock, moveLine, schedulePreview, selEntry, startInline, textFor, zoomNow } = K;
  // ---------- left panel: the block list (and, for a selected block, its entries) ----------
  const headText = () => 'Blocks';
  function drawLeft() {
    clear(K.leftEl);
    K.leftEl.append(h('div', { class: 'phead' }, icon('blocks'), h('span', { class: 'ptitle', style: { flex: 1 } }, headText())));
    const body = h('div', { class: 'pbody' }); K.leftEl.append(body);
    K.listEl = h('div', { class: 'lp-list' }); body.append(K.listEl); drawBlockPane();
  }
  function drawLeftList() { if (!K.listEl || !K.leftEl) return; const t = K.leftEl.querySelector('.ptitle'); if (t) t.textContent = headText(); drawBlockPane(); }
  function modelBlocks() {
    const m = TP.buildModel(S.cv, S.items, S.settings); const out = [];
    for (const sec of m.sections) {
      const bl = [];
      if (sec.isSkills) sec.skillGroups.forEach(g => bl.push({ gid: g.gid, ids: String(g.ids || '').split(',').filter(Boolean), title: (g.showCat ? g.category + ': ' : 'Skills: ') + (g.list || '').slice(0, 60), sub: '' }));
      else if (sec.isList) bl.push({ gid: sec.gid, ids: String(sec.ids || '').split(',').filter(Boolean), title: sec.list.slice(0, 70), sub: '' });
      else for (const g of sec.groups) bl.push({ gid: g.gid, ids: String(g.ids || '').split(',').filter(Boolean), title: (g.isEdu ? g.head : (g.head || g.org || (g.bullets[0] && g.bullets[0].text) || '')).slice(0, 70) || '(entry)', sub: [g.isEdu ? g.org : g.org && g.head ? g.org : '', g.dates].filter(Boolean).join('  |  '), count: g.bullets.length });
      out.push({ label: sec.label, key: sec.key, blocks: bl });
    }
    return out;
  }
  function drawBlockPane() {
    clear(K.listEl);
    if (E().block) return drawBlockDetail();
    const secs = modelBlocks();
    K.listEl.append(h('div', { style: { display: 'flex', justifyContent: 'center', margin: '2px 0 8px' } }, h('button', { class: 'btn primary', onclick: () => openRepoPicker() }, icon('folder'), 'Add from repository')));
    if (!secs.length) { K.listEl.append(h('div', { class: 'empty' }, h('h3', null, 'This CV is empty'), h('p', null, 'Add entries from your repository to start.'), h('div', null, ''))); return; }
    for (const sec of secs) {
      K.listEl.append(h('div', { class: 'lp-sec' }, h('span', null, sec.label), h('span', null, sec.blocks.length)));
      for (const b of sec.blocks) K.listEl.append(h('div', { class: 'blk', draggable: 'true', style: { cursor: 'grab' }, 'data-gid': b.gid, 'data-ids': b.ids.join(','), ondragstart: (ev) => { ev.dataTransfer.setData('text/cv-block', b.ids.join(',')); ev.dataTransfer.effectAllowed = 'move'; const t = ev.currentTarget; setTimeout(() => t.classList.add('dragging'), 0); }, ondragend: (ev) => ev.currentTarget.classList.remove('dragging'), ondragover: (ev) => { if ([...ev.dataTransfer.types].includes('text/cv-block')) { ev.preventDefault(); const r = ev.currentTarget.getBoundingClientRect(); ev.currentTarget.classList.toggle('dropbefore', ev.clientY < r.top + r.height / 2); ev.currentTarget.classList.toggle('dropafter', ev.clientY >= r.top + r.height / 2); } }, ondragleave: (ev) => ev.currentTarget.classList.remove('dropbefore', 'dropafter'), ondrop: (ev) => { const el = ev.currentTarget; el.classList.remove('dropbefore', 'dropafter'); const ids = ev.dataTransfer.getData('text/cv-block'); if (!ids) return; ev.preventDefault(); const r = el.getBoundingClientRect(); moveBlock(ids.split(','), b.ids, ev.clientY >= r.top + r.height / 2); }, onclick: () => selectBlock(b.gid, b.ids), onmouseenter: () => hoverBlock(b.gid, true), onmouseleave: () => hoverBlock(b.gid, false) }, h('div', { class: 'bt' }, b.title), h('div', { class: 'bs' }, [b.sub, b.count ? b.count + (b.count === 1 ? ' line' : ' lines') : ''].filter(Boolean).join('  |  '))));
    }
  }
  const flagOf = (gid) => (S.cv.blockFlags || {})[gid] || {};
  function toggleKeep(gid) { const v = !flagOf(gid).keep; mutate(cv => { cv.blockFlags = cv.blockFlags || {}; cv.blockFlags[gid] = Object.assign({}, cv.blockFlags[gid] || {}, { keep: v, newPage: false }); }, { panel: false }); return v; }
  // every wording an entry can show: the original, then each K.saved version
  function versionOpts(id) {
    const it = S.byId[id], s = selEntry(id) || {}; const set = (v) => mutate(cv => { const q = cv.selected.find(z => z.itemId === id); q.versionId = v; q.override = ''; });
    const out = [{ label: 'Original: ' + (it.text || it.title || '').slice(0, 50), active: !s.override && (s.versionId === '__none' || (!s.versionId && !it.mainVersion)), fn: () => set('__none') }];
    (it.versions || []).forEach((v, i) => out.push({ label: 'Version ' + (i + 1) + ': ' + v.text.slice(0, 50), active: !s.override && (s.versionId === v.id || (!s.versionId && it.mainVersion === v.id)), fn: () => set(v.id) }));
    return out;
  }
  const rephraseFor = (id) => App.rephrase(S.byId[id], textFor(id), async () => { await App.reloadItems(); drawLeftList(); schedulePreview(); });
  function editInPreview(id) {
    const d = K.iframe && K.iframe.contentDocument; const el = d && d.querySelector('[data-id="' + id + '"]'); if (!el) return toast('That entry is not in the preview');
    setCursor(id, true); setTimeout(() => startInline(el), 60);
  }
  function entCard(id) {
    const it = S.byId[id]; const open = E().openVers === id; const wrapEl = h('div', { class: 'entwrap' });
    const clearMarks = () => card.classList.remove('dropbefore', 'dropafter');
    const vb = h('button', { class: 'icon-btn sm vbtn' + (open ? ' on' : ''), 'data-tip': 'Other wordings of this entry', onclick: (ev) => { ev.stopPropagation(); E().openVers = open ? null : id; drawLeftList(); } }, icon(open ? 'chevU' : 'chevD'));
    const card = h('div', { class: 'blk ent' + (E().cursor === id ? ' cur' : ''), draggable: 'true', 'data-id': id,
      ondragstart: (ev) => { ev.dataTransfer.setData('text/cv-item', id); ev.dataTransfer.effectAllowed = 'move'; setTimeout(() => card.classList.add('dragging'), 0); },
      ondragend: () => card.classList.remove('dragging'),
      ondragover: (ev) => { if ([...ev.dataTransfer.types].includes('text/cv-item')) { ev.preventDefault(); const r = card.getBoundingClientRect(), after = ev.clientY >= r.top + r.height / 2; card.classList.toggle('dropbefore', !after); card.classList.toggle('dropafter', after); } },
      ondragleave: clearMarks,
      ondrop: (ev) => { const r = card.getBoundingClientRect(), after = ev.clientY >= r.top + r.height / 2; clearMarks(); const mv = ev.dataTransfer.getData('text/cv-item'); if (!mv || !isChosen(mv)) return; ev.preventDefault(); ev.stopPropagation(); moveLine(mv, id, after); },
      onclick: () => { E().cursor = id; K.listEl.querySelectorAll('.blk.ent.cur').forEach(x => x.classList.remove('cur')); card.classList.add('cur'); setCursor(id, true); },
      ondblclick: (ev) => { ev.stopPropagation(); editInPreview(id); } },
      h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'bt' }, (textFor(id) || it.title || it.role || UI.textOf(it) || '(no text)').slice(0, 300)), h('div', { class: 'bs' }, [UI.typeLabel(it.type), it.org, UI.datesOf(it)].filter(Boolean).join('  |  '))), vb);
    wrapEl.append(card);
    if (open) {
      const box = h('div', { class: 'subcards' });
      for (const o of versionOpts(id)) box.append(h('div', { class: 'subcard' + (o.active ? ' on' : ''), onclick: () => o.fn() }, o.active ? icon('check') : null, h('span', null, o.label)));
      box.append(h('div', { class: 'subcard ai', onclick: () => rephraseFor(id) }, icon('sparkles'), h('span', null, 'Rephrase with AI')));
      wrapEl.append(box);
    }
    return wrapEl;
  }
  function drawBlockDetail() {
    const blk = E().block; const ord = new Map(cvOrder().map((id, i) => [id, i]));
    const ids = blk.ids.filter(id => S.byId[id] && isChosen(id)).sort((a, b) => (ord.has(a) ? ord.get(a) : 1e6) - (ord.has(b) ? ord.get(b) : 1e6));
    const base = S.byId[ids[0]];
    const title = blk.label ? blk.label : base ? (base.type === 'education' ? base.title : (base.role || base.title || base.org || UI.textOf(base))) : 'Block';
    K.listEl.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('button', { class: 'icon-btn sm', onclick: () => selectBlock(null), 'data-tip': 'Back to all blocks' }, icon('back')), h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontWeight: 650, overflowWrap: 'anywhere' } }, title), h('div', { class: 'muted small' }, blk.label ? 'Whole section' : [base && base.org, base && UI.datesOf(base)].filter(Boolean).join('  |  ')))));
    K.listEl.append(h('div', { class: 'lp-sec' }, h('span', null, 'Entries'), h('span', null, ids.length + (ids.length === 1 ? ' entry' : ' entries'))));
    ids.forEach(id => K.listEl.append(entCard(id)));
    if (ids.length > 1 || blk.label) K.listEl.append(h('div', { style: { padding: '8px 2px' } }, UI.toggle('Keep together', !!flagOf(blk.gid).keep, () => toggleKeep(blk.gid), 'The block either fits whole on the page or moves whole to the next one.')));
    K.listEl.append(h('div', { class: 'sp' }), h('button', { class: 'btn danger', style: { width: '100%' }, onclick: () => { mutate(cv => { cv.selected = cv.selected.filter(s => !ids.includes(s.itemId)); }); E().block = null; drawLeftList(); markBlock(); }, 'data-tip': 'Take every entry of this block out of the CV.' }, icon('trash'), blk.label ? 'Remove section entries' : 'Remove block'));
  }
  async function openRepoPicker() {
    await App.newCvModal({ mode: 'addTo', cv: JSON.parse(JSON.stringify(S.cv)), onDone: (cv) => { mutate(c => { c.selected = cv.selected; c.hidden = cv.hidden; }); } });
  }
  function selectBlock(gid, ids, label) {
    E().block = gid ? { gid, ids: ids || [], label: label || '' } : null; E().cursor = null; E().openVers = null;
    drawLeftList(); markBlock(true);
  }
  function markBlock(scroll) {
    try {
      const d = K.iframe.contentDocument; d.querySelectorAll('.cvb-blocksel').forEach(x => x.classList.remove('cvb-blocksel'));
      const b = E().block; if (!b) return;
      const els = [...d.querySelectorAll('[data-gid],[data-sgid]')].filter(x => (x.dataset.gid || x.dataset.sgid) === b.gid);
      els.forEach(x => x.classList.add('cvb-blocksel'));
      if (scroll && els[0]) { const r = els[0].getBoundingClientRect(); const z = zoomNow(); const y = r.top * z; if (y < K.wrap.scrollTop || y > K.wrap.scrollTop + K.wrap.clientHeight - 80) K.wrap.scrollTop = Math.max(0, y - 100); }
    } catch (e) { /* preview not ready */ }
  }
  function hoverBlock(gid, on) { try { K.iframe.contentDocument.querySelectorAll('[data-gid],[data-sgid]').forEach(x => { if ((x.dataset.gid || x.dataset.sgid) === gid) x.classList.toggle('cvb-hover', on); }); } catch (e) { /* ignore */ } }

  function setCursor(id, scroll) {
    E().cursor = id;
    try {
      const d = K.iframe && K.iframe.contentDocument; if (!d) return;
      d.querySelectorAll('.cvb-cursor').forEach(x => x.classList.remove('cvb-cursor'));
      if (id) { const el = d.querySelector('[data-id="' + id + '"]'); if (el) { el.classList.add('cvb-cursor'); if (scroll) { const r = el.getBoundingClientRect(); K.wrap.scrollTop = Math.max(0, r.top * zoomNow() - 120); } } }
    } catch (e) { /* preview not ready */ }
  }
  Object.assign(K, { drawLeft, drawLeftList, flagOf, markBlock, rephraseFor, selectBlock, setCursor, toggleKeep, versionOpts });
})();
