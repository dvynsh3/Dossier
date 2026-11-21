'use strict';
// Import (left third) + LinkedIn window (right two thirds). The LinkedIn pane is a persistent <webview> per account:
// it keeps running while you visit other tabs, and each account has its own saved sign-in (separate session partition).
(function () {
  const { h, clear, tryCall, toast, modal, confirmBox, ctxMenu, icon } = UI;
  const M = window.CVModel; const S = App.state;
  const T = App.tabs.import = {};
  const LI_HOME = 'https://www.linkedin.com/login';
  const desktop = !!window.cvDesktop;
  let root, left, rightHost, cands = [], header = {}, warnings = [], raw = '', sel = new Set(), fromLinkedIn = false, layer = null;

  // ---------- persistent LinkedIn pane ----------
  // The LinkedIn window lives in a permanent layer that is never moved in the DOM (moving a <webview> reloads it).
  // It is simply laid over the Import tab's right column while that tab is open and parked off-screen otherwise.
  const holder = h('div', { id: 'lihold', style: { position: 'fixed', left: '-20000px', top: '0', width: '1100px', height: '800px', zIndex: 20, overflow: 'hidden', borderRadius: '17px', background: 'var(--bg2)' } });
  document.body.append(holder);
  let placeRO = null;
  function place() {
    if (!rightHost || !rightHost.isConnected) return;
    if (layer) { holder.style.left = '-20000px'; return; }   // the review covers the page: keep the LinkedIn window out of sight
    const r = rightHost.getBoundingClientRect();
    const st = holder.style; st.left = (Math.round(r.left) + 1) + 'px'; st.top = (Math.round(r.top) + 1) + 'px'; st.width = (Math.round(r.width) - 2) + 'px'; st.height = (Math.round(r.height) - 2) + 'px';
  }
  // The LinkedIn window floats above the page, so it must step aside while the import review covers the page.
  // (moved off screen rather than hidden: the web page inside keeps its own visibility setting)
  function syncLiVisible() { place(); }
  function park() { if (placeRO) { placeRO.disconnect(); placeRO = null; } window.removeEventListener('resize', place); holder.style.left = '-20000px'; holder.style.visibility = 'hidden'; Object.values(wv).forEach(x => { try { x.setAudioMuted(true); } catch (e) { /* not ready */ } }); }
  // Each profile has its own LinkedIn accounts and its own browser sessions (cookies, sign-ins). The Main profile keeps the
  // original storage names so existing sign-ins survive; every other profile gets names that include its id.
  // The sign-ins made before profiles had their own sessions live under the original names. They belong to ONE profile:
  // Main when it exists, otherwise the first profile in the list (Main can be deleted). The choice is remembered.
  function legacyOwner() {
    try { const o = localStorage.getItem('cvb.lilegacy'); if (o) return o; } catch (e) { /* read below */ }
    const list = App.profileList || []; if (!list.length) return 'main';
    const o = (list.find(p => p.id === 'main') || list[0]).id;
    try { localStorage.setItem('cvb.lilegacy', o); } catch (e) { /* not remembered */ }
    return o;
  }
  // Every Dossier profile owns its own LinkedIn accounts (each with its own browser session). The account menu also lists the
  // signed-in accounts of the other profiles: picking one makes this profile use that account's browser (a shared sign-in).
  // Picking one of this profile's own accounts, or adding a new one, goes back to a separate browser.
  let pid = 'main', activeId = '', lists = {};   // lists: profile id -> that profile's own accounts
  const listKey = (p) => (p === legacyOwner() ? 'cvb.liaccts' : 'cvb.liaccts.' + p);
  const keyOf = (base) => pid === legacyOwner() ? base : base + '.' + pid;
  const readList = (p) => { try { const a = JSON.parse(localStorage.getItem(listKey(p)) || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x === 'object' && typeof x.id === 'string') : []; } catch (e) { return []; } };
  function loadAccts() {
    lists = {}; activeId = '';
    const ids = new Set((App.profileList || []).map(p => p.id).concat([pid]));
    for (const p of ids) lists[p] = readList(p).map(a => Object.assign(a, { owner: p, pic: /^data:image\//.test(a.pic || '') ? a.pic : '' }));   // web addresses cannot be shown (local images only): they are fetched again as small embedded pictures
    try { activeId = localStorage.getItem(keyOf('cvb.liactive')) || ''; } catch (e) { /* start empty */ }
  }
  loadAccts();
  const mine = () => lists[pid] || (lists[pid] = []);
  const others = () => Object.keys(lists).filter(p => p !== pid).flatMap(p => lists[p].filter(a => a.ok || a.id === activeId));
  const allAccts = () => mine().concat(others());
  const profName = (p) => { const f = (App.profileList || []).find(x => x.id === p); return (f && f.name) || p; };
  const saveAccts = (a) => { try { const o = a && a.owner ? a.owner : pid; localStorage.setItem(listKey(o), JSON.stringify((lists[o] || []).map(x => { const c = Object.assign({}, x); delete c.owner; return c; }))); localStorage.setItem(keyOf('cvb.liactive'), activeId); } catch (e) { /* ignore */ } };
  const wv = {};   // id -> webview element
  const part = (a) => 'persist:li-' + (a.owner === legacyOwner() ? '' : String(a.owner).replace(/[^a-z0-9_-]/gi, '') + '-') + a.id;
  // Switching profile: close every LinkedIn page of the old profile (they keep running in the background otherwise) and start clean.
  let loadedFor = null; const started = new Set(), closed = new Set();   // started: accounts opened in this session (a signed-out account waits behind a button); closed: accounts the person shut with the X button
  function setProfile(next) {
    next = next || 'main'; if (next === pid && loadedFor === pid) return;
    for (const k of Object.keys(wv)) { try { wv[k].remove(); } catch (e) { /* already gone */ } delete wv[k]; }
    started.clear(); closed.clear(); pid = next; loadedFor = next; loadAccts(); if (stage) clear(stage); if (rightHost && rightHost.isConnected) { ensureAccount(); mountActive(); }
  }
  const cur = () => allAccts().find(a => a.id === activeId) || mine()[0];
  let pane, bar, stage;

  const newAcct = () => ({ id: M.uid('a').replace(/[^a-z0-9_-]/gi, ''), name: '', pic: '', url: '', ok: false, owner: pid });
  function ensureAccount() { if (!mine().length) { mine().push(newAcct()); if (!activeId) activeId = mine()[0].id; saveAccts(); } if (!allAccts().find(a => a.id === activeId)) activeId = mine()[0].id; }

  function makeView(a) {
    const v = document.createElement('webview');
    v.setAttribute('src', a.last || LI_HOME); v.setAttribute('partition', part(a));
    v.addEventListener('did-navigate', () => onNav(a, v)); v.addEventListener('did-navigate-in-page', () => onNav(a, v));
    v.addEventListener('did-stop-loading', () => { onNav(a, v); probe(a, v); });
    v.addEventListener('page-title-updated', () => syncBar());
    return v;
  }
  function onNav(a, v) { try { a.last = v.getURL(); } catch (e) { /* ignore */ } saveAccts(a); if (a.id === activeId) syncBar(); }
  const PROFILE_RE = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%.]{3,100}\/?$/i;
  const cleanProfile = u => { try { const x = new URL(u); x.search = ''; x.hash = ''; let t = x.toString(); if (!t.endsWith('/')) t += '/'; return t; } catch (e) { return ''; } };
  const isProfile = u => PROFILE_RE.test(cleanProfile(u).replace(/\/$/, '')) && !/\/in\/me\/?$/i.test(u);
  const loggedInUrl = u => /^https:\/\/([a-z]{2,3}\.|www\.)?linkedin\.com\/(feed|in\/|mynetwork|jobs|messaging|notifications|company|school|pulse|search|sales|learning|psettings|mypreferences|settings)/i.test(u || '');
  async function probe(a, v) {
    let u = ''; try { u = v.getURL(); } catch (e) { return; }
    if (/\/(login|checkpoint|uas|signup|authwall)\b/i.test(u)) { if (a.ok) { a.ok = false; saveAccts(a); syncBar(); } return; }
    if (!loggedInUrl(u)) return;
    try {
      const info = await v.executeJavaScript(`(async()=>{
        let url=''; try{const r=await fetch('/in/me/',{credentials:'include',redirect:'follow'}); if(/\\/in\\/[^/]+/.test(r.url)&&!/\\/in\\/me\\/?$/.test(r.url)&&!/login|authwall/.test(r.url)) url=r.url.split('?')[0];}catch(e){}
        const img=document.querySelector('img.global-nav__me-photo, [class*="global-nav__me"] img, img[src*="profile-displayphoto"]');
        let name=(img&&img.alt)||''; if(!name){const t=document.title||''; if(/\\|\\s*LinkedIn/.test(t)&&location.pathname.startsWith('/in/')) name=t.split('|')[0].replace(/^\\(\\d+\\)\\s*/,'').trim();}
        let pic=''; try{ if(img&&img.src){ const b=await (await fetch(img.src)).blob(); const bm=await createImageBitmap(b); const c=document.createElement('canvas'); c.width=c.height=96; const g=c.getContext('2d'); const m=Math.min(bm.width,bm.height); g.drawImage(bm,(bm.width-m)/2,(bm.height-m)/2,m,m,0,0,96,96); pic=c.toDataURL('image/jpeg',.82); } }catch(e){}
        return {url, name, pic};})()`);
      if (!info) return;
      if (info.url) a.ok = true; else if (!a.ok && !/\/feed|\/in\//.test(u)) return; else a.ok = true;
      if (info.name && !/^(photo|profile)/i.test(info.name)) a.name = info.name.replace(/^Photo of\s*/i, '').trim(); if (info.pic && /^data:image\/jpeg;base64,/.test(info.pic) && info.pic.length < 60000) a.pic = info.pic;
      if (info.url && isProfile(info.url)) a.url = cleanProfile(info.url);
      saveAccts(a); syncBar();
      if (a.url && !S.settings.linkedinUrl) App.saveSettings({ linkedinUrl: a.url });
    } catch (e) { /* page not ready */ }
  }

  function getView(a) { if (!wv[a.id]) { wv[a.id] = makeView(a); } return wv[a.id]; }
  const actView = () => { const a = cur(); return a && wv[a.id]; };

  function buildPane() {
    pane = h('div', { class: 'lipane', style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } });
    bar = h('div', { class: 'libar' }); stage = h('div', { class: 'liwrap' });
    pane.append(bar, stage); holder.append(pane);
  }
  let barKey = '';
  function syncBar() {
    if (!bar) return; const a = cur(); const v = actView();
    let u = ''; try { u = v ? v.getURL() : ''; } catch (e) { /* not ready */ }
    const gb = (f) => { try { return v ? !!v[f]() : false; } catch (e) { return false; } };
    // the bar is only rebuilt when something it shows has changed: rebuilding it under the pointer made the tooltips flicker
    const key = JSON.stringify([a && a.id, a && a.ok, a && a.name, a && !!a.pic, a && a.url, S.settings.linkedinUrl, allAccts().length, u, gb('canGoBack'), gb('canGoForward'), !!v, bar.isConnected]);
    if (key === barKey && bar.firstChild) return; barKey = key; clear(bar);
    const nm = a && a.ok && a.name ? a.name : (a && a.ok ? 'Signed in' : 'Not signed in');
    const av = a && a.pic ? h('img', { src: a.pic, alt: '' }) : h('div', { class: 'av' }, (nm[0] || '?').toUpperCase());
    const ib = (ic, tip, fn, dis) => h('button', { class: 'icon-btn', 'data-tip': tip, disabled: dis, onclick: fn }, icon(ic));
    const canBack = v && (() => { try { return v.canGoBack(); } catch (e) { return false; } })(), canFwd = v && (() => { try { return v.canGoForward(); } catch (e) { return false; } })();
    const cur2 = (() => { try { return v ? v.getURL() : ''; } catch (e) { return ''; } })();
    const canSave = isProfile(cur2) && !(a && a.url);
    bar.append(...[
      h('div', { class: 'acct', 'data-tip': 'Switch or add LinkedIn accounts', onclick: openAcctMenu }, av, h('div', null, h('div', { style: { fontSize: '12.5px', fontWeight: 600, lineHeight: 1.1 } }, nm), h('div', { class: 'muted', style: { fontSize: '10.5px' } }, allAccts().length > 1 ? allAccts().length + ' accounts' : 'LinkedIn')), icon('chevD') ),
      ib('home', 'Home: back to your profile page', () => { if (!v) return; v.loadURL(a && a.url ? a.url : 'https://www.linkedin.com/in/me/'); }), ib('back', 'Back', () => v && v.goBack(), !canBack), ib('fwd', 'Forward', () => v && v.goForward(), !canFwd), ib('refresh', 'Reload this page', () => v && v.reload()),
      h('div', { class: 'url', title: u }, u || 'linkedin.com'),
      canSave ? h('button', { class: 'btn small primary', 'data-tip': 'Use the page you are on as your profile link', onclick: () => saveProfile(cleanProfile(cur2)) }, icon('save'), 'Save as my profile') : null,
      !a.url && !canSave ? h('button', { class: 'btn small', 'data-tip': 'Open your profile page, or paste its link', onclick: manualProfile }, icon('link'), 'Set profile link') : null,
      a && a.url ? h('button', { class: 'btn small', 'data-tip': 'Copy your LinkedIn profile link: ' + a.url, onclick: () => { copyText(a.url); toast('Profile link copied'); } }, icon('copy'), 'Profile link') : null,
      a && a.url && S.settings.linkedinUrl !== a.url ? h('button', { class: 'btn small', 'data-tip': 'Put this link on your CVs (header)', onclick: async () => { await App.saveSettings({ linkedinUrl: a.url }); toast('This link will be used on your CVs'); syncBar(); } }, 'Use on CVs') : null,
      ib('external', 'Open this page in your normal browser', () => u && window.cvDesktop.openExternal(u), !u),
      ib('info', 'How this works', showInfo),
      h('button', { class: 'icon-btn danger', 'data-tip': 'Reset: sign out and erase everything this window stored for this account', onclick: resetAcct }, icon('trash')),
      ib('x', 'Close LinkedIn (you stay signed in)', closeLi)].filter(Boolean));
  }
  function saveProfile(u) {
    const a = cur(); if (!isProfile(u)) return toast('That is not a LinkedIn profile link (it should look like linkedin.com/in/your-name)', { err: true });
    a.url = cleanProfile(u); a.ok = true; saveAccts(a); syncBar(); App.saveSettings({ linkedinUrl: a.url }); toast('Saved as your profile link');
  }
  async function manualProfile() {
    const u = await UI.promptBox('Your LinkedIn profile link', 'Paste it here, e.g. https://www.linkedin.com/in/your-name/'); if (!u) return;
    saveProfile(/^https?:/i.test(u) ? u.replace(/^http:/i, 'https:') : 'https://' + u.replace(/^\/+/, ''));
  }
  function copyText(t) { try { navigator.clipboard.writeText(t); } catch (e) { const ta = h('textarea', { value: t }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); } }
  function openAcctMenu(ev) {
    const r = ev.currentTarget.getBoundingClientRect();
    const ent = (a, i, foreign) => ({ label: ((a.ok && a.name) || ('Account ' + (i + 1) + (a.ok ? '' : ' (not signed in)'))) + (foreign ? '  \u00B7  ' + profName(a.owner) : ''), img: a.pic || '', initial: ((a.name || '?')[0] || '?').toUpperCase(), check: a.id === activeId, fn: () => switchTo(a.id) });
    const own = mine().map((a, i) => ent(a, i, false)), oth = others().map((a, i) => ent(a, i, true));
    const items = [{ header: 'This profile' }].concat(own);
    if (oth.length) items.push('-', { header: 'Signed in under other profiles (shares that browser)' }, ...oth);
    items.push('-', { label: 'Add another account', fn: addAcct });
    if (cur() && cur().owner === pid && mine().length > 1) items.push({ label: 'Remove this account...', fn: removeAcct });
    ctxMenu(r.left, r.bottom + 6, items);
  }
  function switchTo(id) { activeId = id; closed.delete(id); saveAccts(); started.add(id); mountActive(); }
  function addAcct() { const a = newAcct(); mine().push(a); activeId = a.id; started.add(a.id); saveAccts(a); mountActive(); }
  async function removeAcct() {
    const a = cur(); if (mine().length < 2 || !await confirmBox('Remove account', 'This signs out "' + (a.name || 'this account') + '" and erases its saved session from this app. Your CV data is not touched.', 'Remove', true)) return;
    try { await window.cvDesktop.linkedinReset(part(a)); } catch (e) { /* ignore */ }
    if (wv[a.id]) { wv[a.id].remove(); delete wv[a.id]; } lists[pid] = mine().filter(x => x.id !== a.id); activeId = mine()[0].id; saveAccts(); mountActive();
  }
  // closes the page (it stops running) but keeps the saved sign-in; the account opens again from the button or the account menu
  function closeLi() { const a = cur(); if (!a) return; if (wv[a.id]) { try { wv[a.id].remove(); } catch (e) { /* already gone */ } delete wv[a.id]; } started.delete(a.id); closed.add(a.id); mountActive(); }
  async function resetAcct() {
    const a = cur();
    if (!await confirmBox('Reset this LinkedIn window?', 'This signs out ' + (a.name || 'this account') + ' and deletes every cookie, login and cached file this window saved for it. Your CV data and imported LinkedIn profiles are not touched. You will be back at the first sign-in page.', 'Reset and sign out', true)) return;
    try { await window.cvDesktop.linkedinReset(part(a)); } catch (e) { return toast('Could not reset: ' + e.message, { err: true }); }
    const v = wv[a.id]; a.ok = false; a.name = ''; a.pic = ''; a.url = ''; a.last = ''; saveAccts(a); if (v) v.loadURL(LI_HOME); barKey = ''; syncBar(); toast('Reset. Sign in again when ready.');
  }
  function showInfo() {
    const li = (...x) => h('li', { style: { marginBottom: '6px' } }, ...x);
    modal('How the LinkedIn window works', h('div', { style: { lineHeight: 1.6 } },
      h('p', null, 'This is a normal LinkedIn page running inside the app. You sign in yourself; the app never types or clicks anything for you, and your password is never stored by the app (LinkedIn keeps the sign-in in this window, like a browser would).'),
      h('h3', null, 'Using it'),
      h('ul', null,
        li('Switch to another tab and come back: the page stays exactly where you left it.'),
        li('Edit your CV in the Editor, copy text, come back here and paste it straight into LinkedIn (headline, About, an experience, anything). This is the quickest way to keep LinkedIn up to date with your CV.'),
        li('The account menu on the left lets you add another LinkedIn account. Each account has its own sign-in and they stay signed in at the same time.'),
        li('"Profile link" copies your public profile address; "Use on CVs" puts it in the header of your CVs.'),
        li('Reset signs out and erases everything this window stored for that account.')),
      h('h3', null, 'Getting your LinkedIn data into the repository'),
      h('ol', null,
        li('In the window, open Settings & Privacy > Data privacy > Get a copy of your data.'),
        li('Choose "Want something in particular?" and tick Profile, Positions, Education, Skills, Certifications, Projects, etc. (or choose the full archive) and press Request archive.'),
        li('LinkedIn emails you when it is ready (a few minutes up to a day). Download the .zip.'),
        li('Drop the .zip on the left. It is stored as "<Your name> linkedin profile - <date>" and also appears in New CV > LinkedIn, so you can start a CV from it as-is.'))), { wide: true, buttons: [{ label: 'Got it', value: 1, cls: 'primary' }] });
  }

  // A signed-out account does not load LinkedIn by itself: the page (and the Windows passkey prompt it can trigger) only
  // starts when the person presses "Open LinkedIn". Signed-in accounts open straight away.
  function drawGate(on, a) {
    const old = stage && stage.querySelector('.ligate'); if (old) old.remove(); if (!on || !stage) return;
    stage.append(h('div', { class: 'ligate' }, h('div', { class: 'gin' }, icon('liglyph', { size: 44 }), h('h2', null, 'LinkedIn is not open'),
      h('button', { class: 'btn primary', onclick: () => { closed.delete(a.id); started.add(a.id); mountActive(); } }, icon('external'), 'Open LinkedIn'))));
  }
  function mountActive() {
    ensureAccount(); const a = cur();
    if (!rightHost) return;
    const gate = closed.has(a.id) || (!a.ok && !started.has(a.id) && !wv[a.id]);
    const v = gate ? null : getView(a);
    Object.values(wv).forEach(x => { if (x.parentNode !== stage) stage.append(x); const on = x === v; x.style.visibility = on ? 'visible' : 'hidden'; x.style.pointerEvents = on ? 'auto' : 'none'; });
    drawGate(gate, a); syncBar();
  }

  T.leave = function () { park(); layer = null; };
  T.profileChanged = function () { setProfile(App.profileId); };

  // ---------- page ----------
  T.render = async function (v, arg) {
    if (!App.profileId) await App.refreshAvatar();
    setProfile(App.profileId);
    ensureAccount(); if (!pane) buildPane();
    root = h('div', { style: { position: 'relative', height: '100%' } }); clear(v).append(root);
    left = h('div', { class: 'left' });
    rightHost = h('div', { class: 'right' });
    const rcol = h('div', { class: 'rightcol' }, h('div', { class: 'sh' }, h('div', { class: 'lilogo li' }, icon('liglyph', { size: 30 })), h('div', null, h('h1', null, 'LinkedIn'), h('p', null, 'Your own account, inside the app. Copy from your CVs and paste straight in.'))), rightHost);
    root.append(h('div', { class: 'split' }, left, rcol));
    if (desktop) { mountActive(); requestAnimationFrame(() => { holder.style.visibility = 'visible'; place(); if (placeRO) placeRO.disconnect(); placeRO = new ResizeObserver(place); placeRO.observe(rightHost); window.addEventListener('resize', place); Object.values(wv).forEach(x => { try { x.setAudioMuted(false); } catch (e) { /* not ready */ } }); }); } else rightHost.append(h('div', { class: 'liwrap' }, h('div', { class: 'msg' }, h('div', null, h('div', { style: { fontSize: '17px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' } }, 'LinkedIn window'), 'Available in the desktop app. In this browser test mode only importing works.'))));
    drawLeft();
    if (cands.length) drawReview();
    if (arg && arg.pick) pickAndRun();
    if (arg && arg.files) setTimeout(() => run(arg.files), 30);
  };

  async function pickAndRun() { const f = await UI.pickFiles({ multi: true, accept: '.pdf,.docx,.txt,.md,.html,.json,.zip', filters: [{ name: 'CVs and exports', extensions: ['pdf', 'docx', 'txt', 'md', 'html', 'htm', 'json', 'zip'] }] }); if (f.length) run(f); }

  function drawLeft() {
    clear(left);
    const drop = h('div', { class: 'drop' }, h('div', { style: { color: 'var(--accent)', marginBottom: '6px' } }, icon('upload', { size: 28 })), h('div', { style: { fontSize: '16px', fontWeight: 650, color: 'var(--text)' } }, 'Drop files here'),
      h('div', { class: 'small', style: { margin: '6px 0 12px' } }, 'Old CVs (PDF, Word, text, HTML, JSON Resume) or a LinkedIn data export (.zip)'), h('button', { class: 'btn primary', onclick: pickAndRun }, 'Choose files...'));
    ['dragover', 'dragenter'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); drop.classList.add('over'); }));
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', () => drop.classList.remove('over'));
    const ta = h('textarea', { rows: 9, placeholder: 'Or paste CV text here, one achievement per line...' });
    left.append(h('div', { class: 'sh' }, h('div', { class: 'lilogo', style: { background: 'var(--accent-weak)', color: 'var(--accent)' } }, icon('inbox')), h('div', null, h('h1', null, 'Import'), h('p', null, 'Nothing is added until you review the list.'))), drop, ta,
      h('button', { class: 'btn', onclick: async () => { if (ta.value.trim().length < 10) return toast('Paste some text first'); const r = await tryCall('import.text', { text: ta.value }); if (r) accept(r, ta.value, false); } }, 'Read pasted text'),
      h('div', { class: 'card small muted', style: { lineHeight: 1.55 } }, icon('info', { size: 14 }), ' Want your LinkedIn data? Use the window on the right: sign in, request your data copy, then drop the downloaded .zip here. The (i) button there explains each step.'));
  }

  T.runFiles = (f) => run(f);
  async function run(files) {
    const rd = UI.busy('Reading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '...', { note: 'Pulling out entries, dates and skills' });
    let all = null, li = false;
    for (const f of files) {
      const r = await tryCall(f.path ? 'import.file' : 'import.buffer', f.path ? { file: f.path } : { name: f.name, b64: f.b64 });
      if (!r) continue;
      if (/\.zip$/i.test(f.name) || (r.candidates || []).some(c => c.section === 'LinkedIn')) li = true;
      r.candidates.forEach(c => { c.source = c.source || f.name; });
      if (!all) all = r; else { all.candidates = all.candidates.concat(r.candidates); all.warnings = (all.warnings || []).concat(r.warnings || []); all.raw = (all.raw || '') + '\n' + (r.raw || ''); all.header = Object.assign({}, r.header, all.header); }
    }
    rd.remove();
    if (!all) return;
    accept(all, all.raw || all.text || '', li);
  }
  function accept(r, rawText, li) {
    fromLinkedIn = !!li;
    cands = r.candidates.map(c => Object.assign({ include: true, action: c.dupOf && !li ? 'nest' : 'add' }, c)); header = r.header || {}; warnings = r.warnings || []; raw = r.raw || r.text || rawText || ''; sel = new Set();
    if (!cands.length) return toast('Nothing recognisable was found. Check the raw text view.', { err: true });
    drawReview();
  }

  // ---------- review layer (covers the whole page) ----------
  const tick = (on, fn, tip) => h('button', { class: 'tk' + (on ? ' on' : ''), 'data-tip': tip, onclick: fn }, on ? icon('check') : null);
  function drawReview() {
    if (!root) return; if (layer) layer.remove();
    layer = h('div', { class: 'reviewlayer' }); root.append(layer); syncLiVisible();
    const inc = cands.filter(c => c.include).length;
    const apply = h('input', { type: 'checkbox', checked: true }); layer._apply = apply;
    layer.append(h('div', { class: 'row wrap', style: { marginBottom: '10px' } }, h('h2', { style: { margin: 0 } }, fromLinkedIn ? 'Review your LinkedIn data' : 'Review before importing'), h('span', { class: 'muted' }, cands.length + ' found, ' + inc + ' included'), h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => { cands = []; layer.remove(); layer = null; syncLiVisible(); } }, 'Cancel'), h('button', { class: 'btn primary', onclick: commit }, icon('check'), 'Add ' + inc + ' to repository')));
    if (fromLinkedIn) layer.append(h('div', { class: 'card small', style: { marginBottom: '8px' } }, 'This is a LinkedIn export. After adding, it is also saved as a LinkedIn profile you can start new CVs from (New CV > LinkedIn).'));
    if (warnings.length) layer.append(h('div', { class: 'card', style: { margin: '8px 0' } }, warnings.map(w => h('div', { class: 'small' }, w))));
    const hk = Object.keys(header).filter(k => header[k] && (typeof header[k] === 'string' || (Array.isArray(header[k]) && header[k].length)));
    if (hk.length) layer.append(h('div', { class: 'card', style: { margin: '8px 0' } }, h('b', null, 'Contact details found'), h('div', { class: 'small' }, hk.map(k => k + ': ' + (Array.isArray(header[k]) ? header[k].map(x => x.url || x.label || x).join(', ') : header[k])).join('  |  ')), h('label', { class: 'small' }, apply, ' Fill empty header fields with these')));
    const bt = h('select', null, [h('option', { value: '' }, 'Set type of selected...')].concat(M.TYPES.map(t => h('option', { value: t.key }, t.label))));
    bt.onchange = () => { if (!bt.value) return; cands.forEach(c => { if (sel.has(c.tempId)) c.type = bt.value; }); drawReview(); };
    const bo = h('input', { type: 'text', placeholder: 'Set organisation of selected, press Enter' });
    bo.onkeydown = e => { if (e.key === 'Enter') { cands.forEach(c => { if (sel.has(c.tempId)) c.org = bo.value; }); drawReview(); } };
    const B = (l, fn) => h('button', { class: 'btn small', onclick: fn }, l);
    layer.append(h('div', { class: 'row wrap', style: { margin: '8px 0' } }, B('Select all', () => { cands.forEach(c => sel.add(c.tempId)); drawReview(); }), B('Select none', () => { sel.clear(); drawReview(); }), B('Exclude selected', () => { cands.forEach(c => { if (sel.has(c.tempId)) c.include = false; }); drawReview(); }), B('Include selected', () => { cands.forEach(c => { if (sel.has(c.tempId)) c.include = true; }); drawReview(); }), bt, bo,
      h('div', { class: 'spacer' }), B('Re-read with AI', aiExtract), B('Raw text', () => modal('Raw text read from the file', h('pre', { class: 'raw', style: { maxHeight: '60vh' } }, raw || '(none)'), { wide: true, buttons: [{ label: 'Close', value: 1 }] }))));
    const tb = h('tbody');
    cands.forEach(c => {
      const dup = c.dupOf && S.byId[c.dupOf];
      const f = (k, w, ph) => h('input', { type: 'text', value: c[k] || '', placeholder: ph, style: { width: w }, oninput: e => { c[k] = e.target.value; } });
      tb.append(h('tr', { class: c.include ? '' : 'dim' },
        h('td', null, tick(sel.has(c.tempId), e => { sel.has(c.tempId) ? sel.delete(c.tempId) : sel.add(c.tempId); e.currentTarget.classList.toggle('on'); e.currentTarget.replaceChildren(...(sel.has(c.tempId) ? [icon('check')] : [])); }, 'Select this row for the bulk actions above')),
        h('td', null, tick(c.include, () => { c.include = !c.include; drawReview(); }, c.include ? 'Included. Click to leave this out.' : 'Left out. Click to include.')),
        h('td', null, h('select', { onchange: e => { c.type = e.target.value; } }, M.TYPES.map(t => h('option', { value: t.key, selected: t.key === c.type }, t.label)))),
        h('td', null, h('div', { class: 'stackf' }, f('title', '170px', 'title / degree / name'), f('role', '170px', 'role'), f('org', '170px', 'organisation'))),
        h('td', null, h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, f('start', '72px', 'start'), '-', f('end', '72px', 'end'))),
        h('td', { style: { minWidth: '320px' } }, h('textarea', { rows: 2, style: { width: '100%' }, oninput: e => { c.text = e.target.value; } }, c.text || ''), c.needsReview ? h('span', { class: 'pill warn' }, 'check') : null, c.section ? h('span', { class: 'small muted' }, ' ' + c.section) : null),
        h('td', null, dup ? [h('div', { class: 'small' }, 'Similar to: ' + UI.textOf(dup).slice(0, 60)), h('select', { onchange: e => { c.action = e.target.value; } }, [['add', 'Add anyway'], ['nest', 'Add as alternative version'], ['skip', 'Skip']].map(([v, l]) => h('option', { value: v, selected: c.action === v }, l)))] : h('span', { class: 'muted small' }, 'new'))));
    });
    layer.append(h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['', 'Use', 'Type', 'Title, role, organisation', 'Dates', 'Text', 'Duplicates'].map(x => h('th', null, x)))), tb)));
  }

  async function aiExtract() {
    if (!raw) return toast('No text to send');
    const sel2 = App.aiProviderSelect('extract'); const ok = await modal('Re-read with AI', h('div', null, h('p', null, 'Uses the model chosen for importing (Settings). Ollama keeps everything on this computer; Gemini sends the text to Google.'), sel2), { buttons: [{ label: 'Cancel', value: false }, { label: 'Run', value: true, cls: 'primary' }] });
    if (!ok) return;
    const r = await App.aiRun('extract', { text: raw }, sel2.value); if (!r) return;
    const arr = Array.isArray(r.data) ? r.data : (r.data && r.data.items) || [];
    if (!arr.length) return toast('The model returned nothing usable', { err: true });
    const mine = arr.map(x => Object.assign({ tempId: M.uid('c'), include: true, action: 'add', source: 'AI read', needsReview: true }, x));
    cands = cands.concat(mine); drawReview(); toast(mine.length + ' items added from the AI read; check them');
  }

  async function commit() {
    const list = cands.filter(c => c.include);
    if (!list.length) return toast('Nothing selected');
    const r = await tryCall('import.commit', { candidates: list, applyHeader: !!(layer && layer._apply && layer._apply.checked), header });
    if (!r) return;
    if (fromLinkedIn) {
      const nm = header.name || (S.settings.header && S.settings.header.name) || (cur() && cur().name) || 'LinkedIn';
      const d = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const prof = await tryCall('liprofiles.save', { name: nm + ' linkedin profile - ' + d, itemIds: r.ids, header });
      if (prof) toast('Saved as "' + prof.name + '"');
    }
    cands = []; if (layer) { layer.remove(); layer = null; } syncLiVisible();
    await App.reloadItems(); await App.reloadSettings();
    toast(r.created + ' added, ' + r.nested + ' nested as versions, ' + r.skipped + ' skipped', { action: { label: 'Open repository', fn: () => App.go('repo') } });
    drawLeft();
  }
})();
