'use strict';
(function () {
  let showKeys = false, pre = { kinfo: { keys: [], file: '' }, bk: [] }, keysHost = null;
  const { h, clear, call, tryCall, toast, confirmBox } = UI; const S = App.state;
  const T = App.tabs.settings = {};
  let root;
  T.leave = function () { showKeys = false; };
  T.render = async function (v) { root = h('div', { class: 'page' }); clear(v).append(root); await draw(); };
  const sec = (t, ic, ...k) => h('div', { class: 'card' }, h('h3', { class: 'row', style: { margin: '0 0 12px', gap: '8px' } }, icon(ic, { size: 18 }), t), ...k);
  const icon = UI.icon;
  const CHANGES = ['1.10: Bin and Archive on Home, no-drop cursor, tidier Applications, fade between every tab, LinkedIn Close button, compact repository toolbar, Word export with photo and QR, cleaner export dialog.', '1.9: keyboard and screen-reader improvements (dialogs trap focus, menus work with arrow keys, icon buttons are named), faster start-up (logo styles load on demand), About card.', '1.8: templates and exports checked with edge cases; custom templates can no longer load anything from the internet.', '1.7: Applications, job descriptions and cover letters tidied; no edits lost when switching tabs quickly; safer Review and Settings.', '1.6: repository code reorganised; merge-similar is much faster.', '1.5: editor improvements (undo/redo state, right-click everywhere, bullets animate, ATS locate), DOCX follows the template, LinkedIn accounts shared across profiles.', 'Earlier: full security, data-safety and recovery pass (backups, bin, migrations, quarantine of damaged files).'];

  async function draw() {
    const st = S.settings; const [ws0, kinfo0, bk0] = await Promise.all([tryCall('workspace.state', {}, true), tryCall('ai.keys', {}, true), tryCall('workspace.backupInfo', {}, true)]); const ws = ws0 || {}; pre = { kinfo: kinfo0 || { keys: [], file: '' }, bk: bk0 || [] };
    const grid = h('div', { class: 'settings-grid' });
    const head = h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Settings'), h('p', null, 'Folder, appearance, AI models and backups.')));
    const folderCard = sec('Working folder', 'folder', h('div', { class: 'row wrap' }, h('code', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, ws.root || st.root || ''), h('button', { class: 'btn small', onclick: () => App.changeFolder() }, 'Change...'), h('button', { class: 'btn small', onclick: () => { if (ws.root || st.root) UI.openPath(ws.root || st.root); else toast('No folder is open yet', { err: true }); } }, 'Show in Explorer')),
      h('p', { class: 'small muted' }, 'Everything lives here as plain JSON: items, CVs, templates, attachments, imports, exports, backups, bin.'));
    const brandCard = () => { const c = h('div', { class: 'card brandcard' }, Logo.el(Logo.current(), 132), h('div', { class: 'brandname' }, 'Dossier')); return c; };
    const appearCard = sec('Appearance', 'sun', h('div', { class: 'row wrap', style: { gap: '18px' } }, UI.seg([['dark', 'Dark', 'moon'], ['light', 'Light', 'sun'], ['auto', 'Match Windows']], st.theme || 'dark', async t => { await App.saveSettings({ theme: t }); App.renderChrome(); draw(); }), dateFormatPicker()), h('p', { class: 'small muted' }, 'Ctrl + and Ctrl - zoom the whole app; Ctrl 0 resets.'), logoPicker());
    grid.append(h('div', { class: 'topgrid' }, h('div', { class: 'stackcol' }, folderCard, appearCard), brandCard()));
    const ai = aiSection(); ai.classList.add('wide'); grid.append(ai);
    keysHost = h('div', { class: 'slidehost wide' + (showKeys ? ' open' : '') }, h('div', { class: 'inner' })); grid.append(keysHost);
    if (showKeys) keysHost.firstChild.append(keysSection());
    const fp = presetSection(); fp.classList.add('wide'); grid.append(fp);
    const d = dataSection(); d.classList.add('wide'); grid.append(d);
    clear(root).append(head, grid);
    const keys = [['Ctrl+N', 'New CV'], ['Ctrl+Shift+N', 'New entry'], ['Ctrl+S', 'Save'], ['Ctrl+Shift+S', 'Save a copy of the CV'], ['Ctrl+E', 'Export'], ['Ctrl+I', 'Import'], ['Ctrl+F', 'Search'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo in the editor'], ['Ctrl+Q', 'Show or hide the left panel'], ['Ctrl+P', 'Print preview'], ['Ctrl+1 to 6', 'Switch tabs'], ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous tab'], ['Ctrl+V', 'Paste a copied file anywhere to import it'], ['Ctrl + / Ctrl -', 'Zoom the app'], ['Ctrl+0', 'Reset zoom to 100%'], ['Delete', 'Remove the selected block, line or entry (undo brings it back)']];
    const half = Math.ceil(keys.length / 2);
    const tbl = (arr) => h('table', { class: 'tbl' }, h('tbody', null, arr.map(([k, dd]) => h('tr', null, h('td', { style: { whiteSpace: 'nowrap' } }, h('code', null, k)), h('td', null, dd)))));
    const net = sec('Internet and limits', 'lock',
      h('p', { class: 'small muted', style: { marginTop: 0, lineHeight: 1.55 } }, 'Dossier works fully offline. These features use the internet, and only when you use them:'),
      h('ul', { class: 'small muted', style: { lineHeight: 1.55 } }, h('li', null, 'AI help from Gemini or Groq (Ollama stays on this computer). You see a preview first, and your name and contact details can be removed before sending.'), h('li', null, 'Fetching a job page in Review, and the site icon and name when you add a link in Personal details.'), h('li', null, 'The LinkedIn window in the Import tab.')),
      h('label', { class: 'row small', style: { margin: '8px 0' } }, UI.toggle('', !!st.linkCheck, v => App.saveSettings({ linkCheck: v })), h('span', null, 'Also check that credential and proof links still open (off by default)')),
      h('div', { class: 'small muted', style: { fontWeight: 600, margin: '10px 0 4px' } }, 'Limits'),
      h('ul', { class: 'small muted', style: { lineHeight: 1.55, margin: 0 } }, h('li', null, 'Scanned PDFs or images are not read (no OCR).'), h('li', null, 'Old .doc files are not supported; save as .docx or PDF.'), h('li', null, 'Import grouping is best-effort; always check the review screen.')));
    const about = await tryCall('app.about', {}, true) || {};
    const aboutCard = sec('About Dossier', 'info', h('p', { class: 'small', style: { margin: '0 0 6px' } }, h('b', null, 'Version ' + (about.version || '?')), '  ', h('span', { class: 'muted' }, 'by dvynsh3')),
      h('p', { class: 'small muted', style: { lineHeight: 1.55, margin: '0 0 8px' } }, 'Everything stays on this computer unless you use an internet feature (AI help, fetching a job page, the LinkedIn window). Your data is plain JSON in your working folder, so you can always open, copy or back it up yourself.'),
      h('details', null, h('summary', { class: 'small' }, 'What\'s new'), h('ul', { class: 'small muted', style: { lineHeight: 1.55 } }, CHANGES.map(c => h('li', null, c)))),
      about.electron ? h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, 'Electron ' + about.electron + ' - Node ' + about.node + ' - ' + about.platform) : null);
    grid.append(aboutCard); aboutCard.classList.add('wide');
    grid.append(h('div', { class: 'setrow' }, sec('Keyboard shortcuts', 'sliders', h('div', { class: 'keycols' }, tbl(keys.slice(0, half)), h('div', { class: 'kdiv' }), tbl(keys.slice(half)))), net));
  }

  // choose which Dossier logo the top bar shows
  function dateFormatPicker() {
    const today = new Date().toISOString().slice(0, 10), M = window.CVModel;
    const sel = h('select', { onchange: async () => { await App.saveSettings({ dateFormat: sel.value }); toast('Date format updated'); } }, Object.keys(M.FULL_FORMATS).map(k => h('option', { value: k, selected: (S.settings.dateFormat || 'dmy-long') === k }, M.fmtFull(today, k))));
    const w = h('div', { class: 'row', 'data-tip': 'Used for dates shown across the app, such as in Applications.' }, h('b', { style: { fontSize: '13px' } }, 'Date format'), sel); return w;
  }
  function logoPicker() {
    const cur = Logo.current(); const row = h('div', { class: 'logopick' });
    Logo.KINDS.forEach(([k, l]) => row.append(h('button', { class: 'logoopt' + (cur === k ? ' on' : ''), 'data-tip': 'Use the ' + l + ' logo in the top bar', onclick: async () => { await App.saveSettings({ logoByTheme: { [Logo.themeNow()]: k } }); App.renderChrome(); draw(); } }, Logo.el(k, 44), h('span', null, l), k === Logo.defaultFor() ? h('em', { class: 'dtag' }, 'default') : null)));
    return h('div', null, h('div', { class: 'small muted', style: { margin: '10px 0 4px', fontWeight: 600 } }, 'Logo'), h('p', { class: 'small muted', style: { margin: '0 0 8px', lineHeight: 1.5 } }, 'Each theme has its own default (Paper in dark, Classic in light) and remembers the logo you pick for it; the logo switches by itself when the theme changes. It shows in the top bar and, right away, as the Dossier window and taskbar icon while the app is open (no restart). Windows keeps its own copy of the icon for the .exe file, desktop shortcuts, the Start menu and a pinned taskbar item; that copy is the Paper logo and only changes when the app is rebuilt or reinstalled.'), row);
  }
  const copyText = (t) => { try { navigator.clipboard.writeText(t); } catch (e) { const ta = h('textarea', { value: t }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); } toast('Copied'); };
  const openUrl = (u) => window.cvDesktop ? window.cvDesktop.openExternal(u) : window.open(u, '_blank');
  // best default from a model list: newest "flash" that is not a special-purpose variant
  const bestFlash = (names) => { const ok = names.filter(n => /flash/i.test(n) && !/lite|image|tts|live|audio|thinking|exp|preview|8b/i.test(n)); const ver = n => (/(\d+(?:\.\d+)?)/.exec(n) || [0, 0])[1] * 1; return ok.sort((x, y) => ver(y) - ver(x))[0] || names.find(n => /flash/i.test(n)) || names[0]; };
  // turn a raw failure into something a person can act on
  function explain(msg, key) {
    const m = String(msg || ''); const code = (/\((\d{3})\)/.exec(m) || [])[1];
    if (code === '503' || code === '429') return { ok: true, text: 'Connected. The key was accepted, but Google says this model is busy right now (' + code + '). Try again in a moment, or pick another model.' };
    if (code === '401' || code === '403') return { ok: false, text: 'The server refused the key (' + code + '). Check that the whole key was pasted and Save key was pressed.' };
    if (code === '404') return { ok: false, text: 'The server does not know that model or address (404). Press "List models" and pick one.' };
    if (/No API key/i.test(m)) return { ok: false, text: 'No key saved yet. Paste it above and press Save key.' };
    if (/Could not reach|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(m)) return { ok: false, text: key === 'local' ? 'Could not reach Ollama. Start it from the Start menu, or press the command prompt button and run the copied command.' : 'Could not reach the server. Check your internet connection and the address.' };
    return { ok: false, text: 'Failed: ' + m.slice(0, 260) };
  }

  function aiSection() {
    const st = S.settings, ai = st.ai; const body = h('div');
    const tasks = [['rephrase', 'Rephrase line items'], ['extract', 'Read imported CVs'], ['critique', 'Critique CV, items, template'], ['tailor', 'Tailor to a job'], ['cover', 'Draft cover letters']];
    body.append(h('table', { class: 'tbl' }, h('tbody', null, tasks.map(([k, l]) => h('tr', null, h('td', null, l), h('td', null, (() => { const sl = App.aiProviderSelect(k); sl.onchange = () => App.saveSettings({ ai: { tasks: { [k]: sl.value } } }); return sl; })()))))));
    body.append(h('label', { class: 'row small', style: { margin: '10px 0' } }, UI.toggle('', ai.redact !== false, v => App.saveSettings({ ai: { redact: v } })), h('span', null, 'Remove name, email, phone and links before sending text to Gemini or Groq')));
    const cols = h('div', { class: 'settings-grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))' } });
    for (const key of Object.keys(ai.providers)) {
      const p = ai.providers[key]; const keyIn = h('input', { type: 'password', placeholder: 'Paste API key (stored encrypted on this PC)', style: { flex: 1 } });
      const base = h('input', { type: 'text', value: p.baseUrl || '', style: { width: '100%' } }), model = h('input', { type: 'text', value: p.model || '', style: { width: '100%' } });
      const save = async () => { await App.saveSettings({ ai: { providers: { [key]: { baseUrl: base.value.trim(), model: model.value.trim() } } } }); };
      const listBox = h('div', { style: { marginTop: '8px' } }); const out = h('div', { class: 'small aiout' });
      let names = [], open = true;
      const drawPills = () => {
        clear(listBox); if (!names.length) return;
        listBox.append(h('div', { class: 'row', style: { marginBottom: '6px' } }, h('span', { class: 'small muted', style: { flex: 1 } }, names.length + ' model' + (names.length === 1 ? '' : 's') + (open ? '. Click one to use it.' : '')), h('button', { class: 'btn small', onclick: () => { open = !open; drawPills(); } }, icon(open ? 'chevU' : 'chevD'), open ? 'Hide list' : 'Show list')));
        if (open) listBox.append(h('div', { class: 'pilllist' }, names.map(n => h('button', { class: 'chip' + (model.value === n ? ' on' : ''), onclick: async () => { model.value = n; await save(); drawPills(); cmdBtnLabel(); toast('Model set to ' + n); } }, n))));
      };
      const say = (ok, text) => { clear(out).append(h('span', { class: ok ? 'okmsg' : 'badmsg' }, text)); };
      const listBtn = h('button', { class: 'btn small', onclick: async () => {
        await save(); const b = UI.busy('Listing models...', { note: '', cancel: true });
        try {
          const r = await Promise.race([call('ai.models', { provider: key }), b.canceled.then(() => { throw new Error('Cancelled'); })]); names = r.slice().sort(); open = true;
          if (key === 'gemini' && !names.includes(model.value)) { const best = bestFlash(names); if (best) { model.value = best; await save(); say(true, 'Your model is not offered any more; switched to ' + best + '.'); } } else say(true, '');
        } catch (e) { if (b.stopped) say(true, 'Cancelled.'); else { const x = explain(e.message, key); say(x.ok, x.text); } } finally { b.remove(); }
        drawPills(); cmdBtnLabel();
      } }, icon('list'), 'List models');
      const testBtn = h('button', { class: 'btn small', onclick: async () => {
        await save(); const t0 = Date.now(); const b = UI.busy('Testing ' + p.label + '...', { note: key === 'local' ? 'The first reply from a local model can take a minute while it loads.' : '', cancel: true });
        try { const r = await Promise.race([call('ai.test', { provider: key }), b.canceled.then(() => { throw new Error('Cancelled'); })]); const sec = ((Date.now() - t0) / 1000).toFixed(1); say(true, 'Works. ' + (model.value || 'The model') + ' answered in ' + sec + ' s' + (r.reply ? ': "' + r.reply + '"' : '.')); }
        catch (e) { if (b.stopped) say(true, 'Cancelled.'); else { const x = explain(e.message, key); say(x.ok, x.text); } } finally { b.remove(); }
      } }, icon('check'), 'Test connection');
      const cmdText = () => 'ollama run ' + (model.value.trim() || p.model || 'qwen3.5:4b');
      const cmdBtn = key === 'local' ? h('button', { class: 'btn small', 'data-tip': 'Copies the command and opens a command prompt. Right-click inside it to paste, then press Enter.', onclick: async () => { await save(); const c = cmdText(); if (window.cvDesktop && window.cvDesktop.openCmd) { await window.cvDesktop.openCmd(c); toast('Copied. In the black window: right-click to paste, then press Enter.'); } else copyText(c); } }, icon('terminal'), cmdText()) : null;
      function cmdBtnLabel() { if (!cmdBtn) return; clear(cmdBtn); cmdBtn.append(icon('terminal'), 'Copy "' + cmdText() + '" and open command prompt'); }
      cmdBtnLabel(); model.addEventListener('input', cmdBtnLabel);
      const keyRow = p.needsKey ? h('div', { class: 'row', style: { margin: '8px 0 0' } }, keyIn, h('button', { class: 'btn small', onclick: async () => { if (!keyIn.value) { await revealKeys(); return; } await call('ai.setKey', { provider: key, key: keyIn.value.trim() }); keyIn.value = ''; toast('Key saved'); T.refresh(); } }, icon('save'), 'Save key')) : null;
      const gemHelp = key === 'gemini' ? h('div', { class: 'row wrap', style: { margin: '6px 0 2px' } }, h('button', { class: 'btn small', onclick: () => openUrl('https://aistudio.google.com/apikey') }, icon('external'), 'Get a key: aistudio.google.com/apikey'), h('span', { class: 'small muted' }, 'Free to create. Text you send is processed by Google.')) : null;
      cols.append(h('div', { class: 'card', style: { background: 'var(--surface2)' } }, h('div', { class: 'row', style: { marginBottom: '6px' } }, h('b', null, p.label), h('span', { class: 'pill ' + (p.remote ? 'warn' : 'good') }, p.remote ? 'internet' : 'on this computer')), gemHelp,
        h('label', { class: 'small muted' }, 'Address'), base, h('label', { class: 'small muted' }, 'Model'), model, keyRow,
        h('div', { class: 'row wrap', style: { marginTop: '10px' } }, listBtn, testBtn, cmdBtn), out, listBox));
    }
    body.append(cols);
    return sec('AI models', 'sparkles', h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Ollama runs on this computer (private, free). Gemini is stronger and needs an API key. Pick which one handles each job.'), body);
  }

  T.refresh = () => UI.transition(draw);
  // the saved-keys card slides in under the AI section; everything below it glides down
  async function revealKeys() {
    if (showKeys || !keysHost) return; showKeys = true;
    const k = await tryCall('ai.keys', {}, true); if (k) pre.kinfo = k;
    keysHost.firstChild.append(keysSection()); void keysHost.offsetHeight; keysHost.classList.add('open');
    setTimeout(() => { try { keysHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ } }, 200);
  }
  function keysSection() {
    const info = pre.kinfo; const box = h('div');
    const rows = info.keys.map(k => { const val = h('code', null, k.set ? k.masked : 'not saved'); let shown = false;
      return h('div', { class: 'row', style: { padding: '8px 0', borderBottom: '1px solid var(--line)' } }, h('b', { style: { width: '210px' } }, k.label), h('div', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, val),
        k.set ? h('button', { class: 'btn small', onclick: async function () { shown = !shown; if (shown) { const r = await tryCall('ai.revealKey', { provider: k.provider }); val.textContent = r ? r.key : ''; this.textContent = 'Hide'; } else { val.textContent = k.masked; this.textContent = 'Show'; } } }, 'Show') : null,
        k.set ? h('button', { class: 'btn small', onclick: async () => { const r = await tryCall('ai.revealKey', { provider: k.provider }); if (r) copyText(r.key); } }, icon('copy'), 'Copy') : null,
        k.set ? h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox('Delete key', 'Delete the saved ' + k.label + ' key from this computer?', 'Delete', true)) { await tryCall('ai.deleteKey', { provider: k.provider }); toast('Key deleted'); T.refresh(); } } }, icon('trash'), 'Delete') : null); });
    box.append(...rows, h('p', { class: 'small muted', style: { lineHeight: 1.6 } }, 'Keys are encrypted by Windows (tied to your Windows login) and saved in a separate file, never in your working folder, so exporting or backing up your CVs never includes them. File: ', h('code', null, info.file || 'AppData\\Roaming\\cv-builder\\secrets.json'), '  ', info.file && window.cvDesktop ? h('button', { class: 'btn small', onclick: () => UI.showInFolder(info.file) }, 'Show in Explorer') : null));
    return sec('Saved API keys', 'key', box);
  }

  // which entry types each repository filter button (Work, Education, ...) shows
  function presetSection() {
    const TY = window.CVModel.TYPES.filter(t => t.key !== 'skill'); const body = h('div');
    body.append(h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Each button above the repository list shows a group of entry types. Open a group\'s dropdown to choose which types it treats as its defaults. Add more groups with the last card; they appear before Custom. Double-click a name to rename it.'));
    const grid = h('div', { class: 'presetgrid' }); body.append(grid);
    const save = async (arr) => { await App.saveSettings({ filterPresets: arr }); draw(); };
    const draw = () => {
      clear(grid); const list = UI.presets().map(p => ({ id: p.id, label: p.label, types: p.types.slice() }));
      list.forEach((p, i) => {
        const name = h('b', { class: 'pname', 'data-tip': 'Double-click to rename', ondblclick: async () => { const n = await UI.promptBox('Rename group', 'Name', p.label); if (n && n.trim()) { list[i].label = n.trim(); save(list); } } }, p.label);
        const dd = h('button', { class: 'btn small pdd' }, UI.icon('sliders'), 'Types', h('span', { class: 'muted' }, String(p.types.length)), UI.icon('chevD'));
        dd.onclick = () => { const r = dd.getBoundingClientRect(); const cur = new Set(p.types); UI.ctxMenu(r.left, r.bottom + 6, [{ header: 'Types in ' + p.label }].concat(TY.map(t => ({ label: t.label, check: cur.has(t.key), keep: true, fn: () => { if (cur.has(t.key)) cur.delete(t.key); else cur.add(t.key); list[i].types = TY.map(x => x.key).filter(k => cur.has(k)); App.saveSettings({ filterPresets: list }); clear(dd).append(UI.icon('sliders'), 'Types', h('span', { class: 'muted' }, String(list[i].types.length)), UI.icon('chevD')); return cur.has(t.key); } })))); };
        const del = h('button', { class: 'icon-btn sm pdel', 'data-tip': 'Remove this group', onclick: () => { list.splice(i, 1); save(list.length ? list : null); } }, UI.icon('x', { size: 13 }));
        grid.append(h('div', { class: 'card presetcard' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, name, del), dd, h('div', { class: 'small muted pcount' }, p.types.slice(0, 3).map(k => (window.CVModel.TYPE_LABEL || {})[k] || k).join(', ') + (p.types.length > 3 ? ' +' + (p.types.length - 3) : ''))));
      });
      grid.append(h('button', { class: 'card presetcard presetadd', onclick: async () => { const n = await UI.promptBox('New filter group', 'Name for the new group', ''); if (!n || !n.trim()) return; list.push({ id: 'g' + Date.now().toString(36), label: n.trim(), types: [] }); save(list); } }, UI.icon('plus', { size: 20 }), h('span', null, 'Add more')));
    };
    draw();
    body.append(h('button', { class: 'btn small', style: { marginTop: '10px' }, onclick: async () => { await App.saveSettings({ filterPresets: null }); draw(); } }, 'Reset to defaults'));
    return sec('Repository filter groups', 'sliders', body);
  }
  const fmtStamp = (iso) => { const d = new Date(iso), p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
  function dataSection() {
    const out = h('div'); const bk = pre.bk;
    out.append(h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: async () => { await call('workspace.snapshot'); toast('Backup made'); T.refresh(); } }, 'Make a backup now'), h('button', { class: 'btn', onclick: () => App.binDialog() }, 'Recycle bin'),
      h('button', { class: 'btn', onclick: async () => { const r = await tryCall('workspace.exportAll', { saveAs: true }); if (r) { toast('Exported'); if (r.file) UI.showInFolder(r.file); } } }, 'Export whole repository'),
      h('button', { class: 'btn', onclick: async () => { const f = await UI.pickFiles({ accept: '.json', filters: [{ name: 'JSON', extensions: ['json'] }] }); if (f[0] && f[0].path) { const r = await tryCall('workspace.importAll', { file: f[0].path, merge: true }); if (r) { await App.reloadItems(); await App.reloadCvs(); toast('Merged'); } } else if (f[0]) toast('Use the Import tab for JSON files', { err: true }); } }, 'Merge a repository file')));
    const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
    const total = bk.reduce((a, b) => a + (b.size || 0), 0);
    out.append(h('p', { class: 'small muted' }, 'Backups are made when you open the folder and automatically while you edit (at most every 30 minutes), so you can go back about two days. ' + bk.length + ' stored, ' + fmtSize(total) + ' in total.'));
    out.append(h('div', { class: 'bkgrid' }, bk.map(b => h('div', { class: 'bkcard' },
      h('div', { class: 'bkinfo' }, h('div', { class: 'bkt' }, fmtStamp(b.at)), h('div', { class: 'small muted' }, (b.reason === 'auto' ? 'Automatic' : b.reason === 'manual' ? 'Manual' : b.reason.replace(/-/g, ' ')) + ' · ' + fmtSize(b.size))),
      h('div', { class: 'bkbtns' },
        h('button', { class: 'icon-btn sm', 'data-tip': 'Restore this backup', onclick: async () => { if (await confirmBox('Restore backup', 'This replaces your current data with this backup. A backup of the current state is made first.', 'Restore', true)) { if (!await tryCall('workspace.restoreBackup', { name: b.name })) return; S.cv = null; await App.reloadItems(); await App.reloadCvs(); toast('Restored'); T.refresh(); } } }, icon('undo')),
        h('button', { class: 'icon-btn sm', 'data-tip': 'Delete this backup', onclick: async () => { if (await confirmBox('Delete backup', 'Delete this backup permanently?', 'Delete', true)) { await tryCall('workspace.deleteBackup', { name: b.name }); T.refresh(); } } }, icon('trash')))))));
    if (window.cvDesktop && window.cvDesktop.testCrash) out.append(h('div', { class: 'row wrap', style: { marginTop: '12px' } }, h('button', { class: 'btn small', onclick: async () => { if (await confirmBox('Test crash recovery', 'The window will stop on purpose, then offer to reload. Your data is saved, nothing is lost.', 'Test it')) window.cvDesktop.testCrash(); } }, 'Test crash recovery'), h('span', { class: 'small muted' }, 'Checks the dialog that appears if the window ever stops working.')));
    return sec('Data and backups', 'layers', out);
  }
})();
