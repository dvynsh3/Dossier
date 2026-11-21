'use strict';
(function () {
  const { h, clear, call, toast, modal, confirmBox } = UI;
  const M = window.CVModel;
  const S = App.state;

  // Small tools shared by the repository, the editor and the settings: date parsing, skills table, smart rules, recycle bin, AI refine.
  function parseDateLoose(s) {
    s = String(s || '').trim(); if (!s) return '';
    if (/^(present|current|ongoing|now)$/i.test(s)) return 'present';
    let m = /^(\d{4})[-/.](\d{1,2})$/.exec(s); if (m) return m[1] + '-' + String(m[2]).padStart(2, '0');
    m = /^(\d{1,2})[-/.](\d{4})$/.exec(s); if (m) return m[2] + '-' + String(m[1]).padStart(2, '0');
    m = /^([A-Za-z]{3,9})\.?[\s’'-]*(\d{2,4})$/.exec(s);
    if (m) { const mi = M.MONTHS.findIndex(x => x.toLowerCase() === m[1].slice(0, 3).toLowerCase()); if (mi >= 0) { let y = m[2]; if (y.length === 2) y = '20' + y; return y + '-' + String(mi + 1).padStart(2, '0'); } }
    m = /^(\d{4})$/.exec(s); if (m) return m[1];
    return s;
  }
  App.parseDateLoose = parseDateLoose;
  const csv = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  App.csv = csv;
  // word diff as ins/del nodes (used by merge and by the version compare)
  App.diffNodes = (diff) => diff.map(d => d.op === 'same' ? d.t : (d.op === 'add' ? h('ins', null, d.t) : h('del', null, d.t)));

  // ---------- skills ----------
  function skillTable() {
    const map = new Map();
    const add = (name, it) => { if (!name) return; if (!map.has(name)) map.set(name, { name, items: [] }); if (it) map.get(name).items.push(it); };
    for (const it of S.items) {
      if (it.archived) continue;
      if (it.type === 'skill') add(it.title || it.text, null);
      for (const sk of it.skills || []) add(sk, it);
    }
    const meta = S.settings.skills || {};
    const now = new Date(); const nowN = now.getFullYear() * 12 + now.getMonth();
    for (const s of map.values()) {
      const m = meta[s.name] || {};
      const own = S.items.find(i => i.type === 'skill' && (i.title || i.text) === s.name);
      s.category = m.category || (own && own.extra && own.extra.category) || 'Uncategorised';
      s.level = m.level || (own && own.extra && own.extra.level) || '';
      const iv = s.items.map(i => { const a = M.dateNum(i.start || i.end); let b = i.end === 'present' ? nowN : M.dateNum(i.end || i.start, true); return a != null && b != null ? [a, Math.max(a, b)] : null; }).filter(Boolean).sort((x, y) => x[0] - y[0]);
      let total = 0, cur = null;
      for (const [a, b] of iv) { if (!cur) cur = [a, b]; else if (a <= cur[1]) cur[1] = Math.max(cur[1], b); else { total += cur[1] - cur[0] + 1; cur = [a, b]; } }
      if (cur) total += cur[1] - cur[0] + 1;
      s.years = Math.round(total / 12 * 10) / 10;
    }
    return [...map.values()];
  }
  App.skillTable = skillTable;

  // ---------- rules ----------
  App.ruleMatch = function (rule) {
    const now = new Date(); const nowN = now.getFullYear() * 12 + now.getMonth();
    return S.items.filter(it => {
      if (it.archived) return false;
      if (rule.types && rule.types.length && !rule.types.includes(it.type)) return false;
      const wantT = rule.tags || [], wantS = rule.skills || [];
      if (wantT.length || wantS.length) {
        const okT = wantT.some(t => (it.tags || []).includes(t)), okS = wantS.some(t => (it.skills || []).includes(t));
        if (!okT && !okS) return false;
      }
      if (rule.yearsBack) { const e = it.end === 'present' ? nowN : M.dateNum(it.end || it.start, true); if (e == null || e < nowN - rule.yearsBack * 12) return false; }
      return true;
    });
  };
  async function rulesDialog() {
    let rules = JSON.parse(JSON.stringify(S.settings.rules || []));
    const body = h('div');
    const draw = () => {
      clear(body);
      body.append(h('p', { class: 'small muted' }, 'A rule picks items automatically by tag, skill, type and how recent they are. Use it from the Editor panel ("Add by rule"). Tags and skills share one setup, so a rule can use either.'));
      rules.forEach((r, i) => {
        body.append(h('div', { class: 'card', style: { marginBottom: '8px' } },
          h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Rule name', h('input', { type: 'text', value: r.name, oninput: e => r.name = e.target.value })), h('label', { class: 'f' }, 'Only last N years (blank = any)', h('input', { type: 'number', min: 1, value: r.yearsBack || '', oninput: e => r.yearsBack = +e.target.value || '' }))),
          h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Tags (comma separated)', h('input', { type: 'text', value: (r.tags || []).join(', '), oninput: e => r.tags = csv(e.target.value) })), h('label', { class: 'f' }, 'Skills (comma separated)', h('input', { type: 'text', value: (r.skills || []).join(', '), oninput: e => r.skills = csv(e.target.value) }))),
          h('div', { class: 'row wrap small', style: { marginTop: '14px', gap: '6px 14px' } }, h('b', { style: { marginRight: '6px' } }, 'Types:'), M.TYPES.map(t => h('label', { class: 'row', style: { gap: '4px' } }, h('input', { type: 'checkbox', checked: (r.types || []).includes(t.key), onchange: e => { r.types = (r.types || []).filter(x => x !== t.key); if (e.target.checked) r.types.push(t.key); } }), t.label))),
          h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'muted small' }, () => ''), h('button', { class: 'btn small', onclick: () => { toast(App.ruleMatch(r).length + ' items match right now'); } }, 'Test'), h('button', { class: 'btn small danger', onclick: () => { rules.splice(i, 1); draw(); } }, 'Delete'))));
      });
      body.append(h('button', { class: 'btn', onclick: () => { rules.push({ id: M.uid('rl'), name: 'New rule', tags: [], skills: [], types: [], yearsBack: '' }); draw(); } }, '+ Add rule'));
    };
    draw();
    const ok = await modal('Smart rules', body, { wide: true, buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, cls: 'primary' }] });
    if (ok) { await App.saveSettings({ rules }); toast('Rules saved'); }
  }
  App.rulesDialog = rulesDialog;

  async function binDialog() {
    const body = h('div'); let list = [];
    const draw = async () => {
      list = await call('trash.list'); clear(body);
      body.append(h('p', { class: 'small muted' }, 'Deleted items stay here for 30 days, then are removed for good.'));
      if (!list.length) body.append(h('div', { class: 'empty' }, 'The recycle bin is empty.'));
      for (const t of list) body.append(h('div', { class: 'item' }, h('span', { class: 'type' }, t.kind), h('div', { class: 'body' }, h('div', null, (t.label || '(no text)').slice(0, 140)), h('div', { class: 'meta' }, 'deleted ' + new Date(t.deletedAt).toLocaleString(), t.mergedInto ? ' - merged into another item' : '')), h('button', { class: 'btn small', onclick: async () => { await call('trash.restore', { kind: t.kind, id: t.id }); await App.reloadItems(); await App.reloadCvs(); draw(); toast('Restored'); } }, 'Restore')));
    };
    await draw();
    await modal('Recycle bin', body, { wide: true, buttons: [{ label: 'Empty bin', value: 'empty', cls: 'danger' }, { label: 'Close', value: true }] }).then(async v => { if (v === 'empty' && await confirmBox('Empty the recycle bin?', 'This permanently removes everything in it.', 'Empty', true)) { await call('trash.empty'); toast('Bin emptied'); } });
    if (S.tab === 'repo') App.tabs.repo.refresh();
  }
  App.binDialog = binDialog;

  async function refineDialog() {
    const provSel = App.aiProviderSelect('rephrase'); const out = h('div'); let cancelled = false, proposal = null;
    const items = S.items.filter(i => !i.archived && i.type !== 'skill');
    if (!items.length) return toast('The repository has no entries to refine yet.');
    const stat = (label, n) => h('div', { class: 'rfstat' }, h('b', null, String(n)), h('span', null, label));
    const run = async () => {
      cancelled = false; clear(out);
      const bar = h('div', { class: 'bar' }, h('i')); const msg = h('div', { class: 'small muted' }, 'Looking for repeated entries...'); out.append(h('div', { class: 'rfwork' }, h('div', { class: 'spin big' }), msg, bar));
      const removes = [], gone = new Set(), changes = [], sk = new Map(); let failed = 0, lastErr = '';
      try {
        const dups = await call('dup.find'); for (const d of dups) { if (gone.has(d.other) || gone.has(d.keep)) continue; gone.add(d.other); removes.push({ keep: d.keep, other: d.other, nest: d.suggestion === 'nest' }); }
        const work = items.filter(i => !gone.has(i.id)); const B = 5;
        const ask = async (list) => {   // a batch the model garbles is split in half and asked again, down to single entries
          const batch = list.map(x => ({ id: x.id, type: x.type, role: x.role, org: x.org, title: x.title, text: M.itemText(x) }));
          const r = await call('ai.run', { task: 'refine', payload: { items: batch }, provider: provSel.value });
          const arr = (Array.isArray(r.data) ? r.data : (r.data && (r.data.items || r.data.entries)) || (r.data && r.data.id ? [r.data] : [])).filter(c => c && S.byId[c.id]);
          if (!arr.length && list.length > 1 && !cancelled) { const mid = Math.ceil(list.length / 2); return (await ask(list.slice(0, mid))).concat(await ask(list.slice(mid))); }
          if (!arr.length) { failed++; lastErr = 'The model did not return usable JSON for some entries.'; }
          return arr;
        };
        for (let i = 0; i < work.length && !cancelled; i += B) {
          msg.textContent = 'Reading entries ' + (i + 1) + '-' + Math.min(work.length, i + B) + ' of ' + work.length + '...';
          try {
            const arr = await ask(work.slice(i, i + B));
            for (const c of arr) { const skills = (c.skills || []).map(x => typeof x === 'string' ? { name: x, category: '' } : x).filter(x => x && x.name).slice(0, 6); skills.forEach(x => { const k = String(x.name).trim().toLowerCase(); if (!sk.has(k)) sk.set(k, { name: String(x.name).trim(), category: x.category || '' }); });
              changes.push({ id: c.id, type: c.type, versions: (c.versions || []).filter(t => typeof t === 'string'), skills: skills.map(x => String(x.name).trim()) }); }
          } catch (e) { failed++; lastErr = e.message; if (/No API key|\(401\)|\(403\)|Could not reach/.test(e.message)) break; }
          bar.firstChild.style.width = Math.min(100, Math.round((i + B) / work.length * 100)) + '%';
        }
      } catch (e) { lastErr = e.message; }
      if (cancelled) return;
      proposal = { changes, removes, newSkills: [...sk.values()] };
      const typed = changes.filter(c => c.type && S.byId[c.id] && c.type !== S.byId[c.id].type && M.TYPES.some(t => t.key === c.type)).length;
      clear(out);
      if (!changes.length && !removes.length) { out.append(h('div', { class: 'badmsg' }, 'Nothing came back. ' + (lastErr || '')), h('div', { class: 'small muted' }, 'Try again, or pick another model above.')); proposal = null; renderBtns(); return; }
      out.append(h('div', { class: 'rfstats' }, stat('repeated entries removed', removes.length), stat('entries re-categorised', typed), stat('alternative wordings added', changes.reduce((a, c) => a + Math.min(2, (c.versions || []).length), 0)), stat('skills created', proposal.newSkills.length)),
        failed ? h('div', { class: 'small muted' }, failed + ' batch(es) failed' + (lastErr ? ': ' + lastErr.slice(0, 160) : '') + '. The rest is ready.') : null,
        h('div', { class: 'small muted', style: { marginTop: '8px' } }, 'Nothing is changed until you choose one of the buttons below.')); renderBtns();
    };
    const acts = h('div', { class: 'actions' }); let box = null;
    const finish = async (mode) => {
      const b = UI.busy(mode === 'new' ? 'Creating the new profile...' : 'Saving changes...', { note: '' });
      try {
        if (mode === 'new') { const pl = await call('profiles.list'); const cur = pl.list.find(p => p.id === pl.active); await call('profiles.create', { name: (cur ? cur.name : 'Profile') + ' (refined)', from: pl.active }); }
        const r = await call('refine.apply', proposal); b.remove();
        if (mode === 'new') { S.cv = null; await Promise.all([App.reloadSettings(), App.reloadItems(), App.reloadCvs(), App.reloadTemplates()]); App.refreshAvatar(); }
        else await App.reloadItems();
        toast('Done: ' + r.removed + ' removed, ' + r.typed + ' re-categorised, ' + r.vers + ' wordings, ' + r.skillsMade + ' skills' + (mode === 'new' ? ' (in the new profile)' : ''));
        box.close(true); App.tabs.repo.refresh();
      } catch (e) { b.remove(); toast(e.message, { err: true }); }
    };
    let ran = false;
    const renderBtns = () => { clear(acts); acts.append(h('button', { class: 'btn', onclick: () => { cancelled = true; box.close(false); } }, 'Cancel')); if (proposal) acts.append(h('button', { class: 'btn', onclick: () => finish('new') }, 'Create new profile with these changes'), h('button', { class: 'btn primary', onclick: () => finish('here') }, 'Save in current profile')); else acts.append(h('button', { class: 'btn primary', onclick: () => { ran = true; run(); } }, UI.icon('sparkles'), ran ? 'Try again' : 'Start')); };
    out.append(h('p', { class: 'small muted', style: { lineHeight: 1.6 } }, 'Sends every entry (' + items.length + ') to the model you pick. It sorts each one into the right category, drops repeated entries, creates skills from your entries and assigns them, and writes 2 alternative wordings for each. You review the result before anything is saved.'));
    const m = modal('Refine the repository', h('div', null, h('div', { class: 'row', style: { marginBottom: '10px' } }, h('span', { class: 'small muted' }, 'Model'), provSel), out, acts), { wide: true, buttons: [], dismiss: false, onOpen: (b) => { box = b; renderBtns(); } });
    await m;
  }
  App.refineDialog = refineDialog;
})();
