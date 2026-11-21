'use strict';
// Shared UI helpers. Everything hangs off window.App / window.UI.
window.App = { state: {}, tabs: {} };
(function () {
  const M = window.CVModel;

  // ---------- API ----------
  async function call(name, args) {
    if (window.cvDesktop) {
      const r = await window.cvDesktop.call(name, args || {});
      if (!r.ok) throw new Error(r.error);
      return r.data;
    }
    const res = await fetch('/api/' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dossier': '1' }, body: JSON.stringify(args || {}) });
    const r = await res.json();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }
  async function tryCall(name, args, quiet) {
    try { return await call(name, args); } catch (e) { if (!quiet) toast(e.message, { err: true }); return undefined; }
  }

  // ---------- DOM ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
    // an icon-only button is named by its tooltip, so screen readers say what it does
    if (tag === 'button' && attrs && attrs['data-tip'] && !attrs['aria-label'] && !el.textContent.trim()) el.setAttribute('aria-label', attrs['data-tip']);
    return el;
  }
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function debounce(fn, ms) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; }

  // ---------- toasts ----------
  function toast(msg, o) {
    o = o || {};
    const t = h('div', { class: 'toast' + (o.err ? ' err' : ''), role: o.err ? 'alert' : 'status' }, h('span', null, msg));
    for (const ac of (o.actions || (o.action ? [o.action] : []))) t.append(h('button', { onclick: () => { ac.fn(); t.remove(); } }, ac.label));
    $('#toasts').append(t);
    setTimeout(() => t.remove(), o.ms || (o.err ? 7000 : (o.action ? 8000 : 3500)));
    return t;
  }

  // ---------- modal ----------
  function modal(title, body, o) {
    o = o || {};
    return new Promise(resolve => {
      // every dialog gets its own layer, so dialogs opened on top of each other can never leave a stuck copy behind
      const ov = h('div', { class: 'ovl on' }); document.body.append(ov);
      const opener = document.activeElement;
      const box = h('div', { class: 'modal' + (o.wide ? ' wide' : '') + (o.huge ? ' huge' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.noTitle ? 'Dialog' : String(title || 'Dialog') });
      let done = false;
      const close = (v) => { if (done) return; done = true; document.removeEventListener('keydown', onKey, true); ov.classList.add('out'); setTimeout(() => ov.remove(), 140); try { if (opener && opener.isConnected && opener.focus && !document.querySelector('.ovl:not(.out)')) opener.focus(); } catch (x) { /* ignore */ } resolve(v); };
      const top = () => { const all = document.querySelectorAll('.ovl'); return all[all.length - 1] === ov; };
      const onKey = (e) => {
        if (e.key === 'Tab' && top()) {   // keyboard focus stays inside the open dialog
          const f = [...box.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
          if (f.length) { const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); } }
        }
        else if (e.key === 'Escape' && top()) { e.stopPropagation(); if (o.dismiss !== false) close(undefined); }
        else if (e.key === 'Enter' && top() && !e.shiftKey && !e.isComposing) {   // Enter confirms small one- or two-field dialogs
          const t = e.target; if (!t || t.tagName !== 'INPUT' || !/^(text|search|url|email|number|)$/.test(t.type || '') || !box.contains(t)) return;
          if (box.querySelector('textarea') || box.querySelectorAll('input[type=text],input:not([type])').length > 2) return;
          const ok = box.querySelector('.actions .btn.primary'); if (ok) { e.preventDefault(); e.stopPropagation(); ok.click(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      box.append(o.noTitle ? '' : h('h2', null, title), o.huge ? h('div', { class: 'mbody' }, body) : body);
      const btns = o.buttons === undefined ? [{ label: 'Close', value: true }] : o.buttons;
      if (btns.length) {
        const act = h('div', { class: 'actions' });
        if (o.extra) act.append(o.extra);   // e.g. a disabled "Working..." button to the left of Close
        for (const b of btns) act.append(h('button', { class: 'btn ' + (b.cls || ''), onclick: async () => { if (b.onclick) { const r = await b.onclick(); if (r === false) return; } close(b.value); } }, b.label));
        box.append(act);
      }
      ov.append(box);
      let downOnOv = false; ov.onmousedown = (e) => { downOnOv = e.target === ov; }; ov.onclick = (e) => { if (downOnOv && e.target === ov && o.dismiss !== false) close(undefined); };
      const first = box.querySelector('[autofocus]') || box.querySelector('input,textarea');
      const startEl = first || box.querySelector('.actions .btn.primary') || box.querySelector('.actions .btn');
      if (startEl && o.focus !== false) setTimeout(() => startEl.focus(), 20);
      box.close = close;
      if (o.onOpen) o.onOpen(box, close);
    });
  }
  async function confirmBox(title, text, okLabel, danger) {
    return !!(await modal(title, h('p', null, text), { buttons: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', value: true, cls: danger ? 'danger' : 'primary' }] }));
  }
  async function promptBox(title, label, value, o) {
    o = o || {};
    const inp = o.multiline ? h('textarea', { rows: 6, value: value || '', placeholder: o.placeholder || '', autofocus: true }) : h('input', { type: 'text', value: value || '', placeholder: o.placeholder || '', autofocus: true, style: { width: '100%' } });
    const r = await modal(title, h('div', null, h('p', { class: 'muted' }, label), inp), { buttons: [{ label: 'Cancel', value: null }, { label: o.ok || 'OK', value: 'ok', cls: 'primary' }] });
    return r === 'ok' ? inp.value : null;
  }

  // ---------- context menu ----------
  let ctxEl = null;
  let ctxSubs = [];
  function closeSubs(from) { ctxSubs = ctxSubs.filter(x => { if (from == null || x.lvl >= from) { x.el.remove(); return false; } return true; }); }
  function closeCtx() { closeSubs(); if (ctxEl) { ctxEl.querySelectorAll('button').forEach(b => { clearTimeout(b._t); clearTimeout(b._c); }); ctxEl.remove(); ctxEl = null; } }
  // toggle behaviour: pressing the same arrow/button that opened a menu closes it (instead of closing then re-opening)
  let ctxTrigger = null, suppress = null;
  function evTarget() { const ev = window.event; return ev && ev.type === 'click' && ev.target && ev.target.nodeType === 1 ? ev.target : null; }
  // one menu level. Entries: '-', {header}, {label, fn, check (tick, for toggles), sel (highlight, for the chosen value), keep (stay open), sub: [entries] (nested menu)}
  function fillCtx(el, entries, lvl) {
    for (const e of entries) {
      if (e === '-') { el.append(h('div', { class: 'sep' })); continue; }
      if (e.header) { el.append(h('div', { class: 'hd' }, e.header)); continue; }
      const lab = (e.check ? '\u2713 ' : (e.check === false ? '   ' : '')) + e.label;
      const b = h('button', { role: 'menuitem', disabled: e.disabled, class: (e.sel ? 'sel ' : '') + (e.sub ? 'hassub ' : '') + (e.cls || '') });
      if (e.img) b.append(h('img', { class: 'cimg', src: e.img, alt: '' })); else if (e.initial) b.append(h('span', { class: 'cini' }, e.initial));
      b.append(h('span', { class: 'cl' }, lab)); if (e.sub) b.append(h('span', { class: 'subarrow' }, '\u203A'));
      if (e.sub) {
        let subEl = null;
        const shut = () => { if (!subEl) return; closeSubs(lvl + 1); subEl = null; b.classList.remove('open'); };
        // close this submenu once the pointer is neither on its button nor inside it (or anything nested under it)
        const check = () => { clearTimeout(b._c); b._c = setTimeout(() => { if (!subEl || !subEl.isConnected) { b.classList.remove('open'); return; } const inside = b.matches(':hover') || ctxSubs.some(x => x.lvl > lvl && x.el.matches(':hover')); if (!inside) shut(); }, 170); };
        const open = () => {
          if (b.disabled || !b.isConnected || !ctxEl) return; el.querySelectorAll('button.open').forEach(x => { if (x !== b) x.classList.remove('open'); }); closeSubs(lvl + 1);
          const sub = h('div', { class: 'ctx sub' }); fillCtx(sub, e.sub, lvl + 1); sub.style.maxHeight = Math.min(innerHeight - 24, 340) + 'px'; document.body.append(sub); ctxSubs.push({ el: sub, lvl: lvl + 1, owner: b }); subEl = sub;
          sub.addEventListener('mouseleave', check);
          b.classList.add('open'); const r = b.getBoundingClientRect(), w = sub.offsetWidth, hh = sub.offsetHeight;
          let left = r.right + 4; if (left + w > innerWidth - 8) left = Math.max(6, r.left - w - 4);
          sub.style.left = left + 'px'; sub.style.top = Math.max(8, Math.min(r.top - 6, innerHeight - hh - 12)) + 'px';
        };
        b.onclick = (ev) => { ev.stopPropagation(); open(); };
        b.onmouseenter = () => { clearTimeout(b._c); clearTimeout(b._t); b._t = setTimeout(open, 90); };
        b.onmouseleave = () => { clearTimeout(b._t); check(); };
      } else {
        b.onmouseenter = () => { if (ctxSubs.some(x => x.lvl > lvl)) closeSubs(lvl + 1); el.querySelectorAll('button.open').forEach(x => x.classList.remove('open')); };
        b.onclick = () => { if (e.keep) { const r = e.fn && e.fn(); if (r !== undefined) { e.check = !!r; b.firstChild.textContent = (e.check ? '\u2713 ' : '   ') + e.label; } return; } closeCtx(); e.fn && e.fn(); };
      }
      el.append(b);
    }
  }
  function ctxMenu(x, y, entries, o) {
    o = o || {};
    const trig = evTarget();
    if (suppress && Date.now() < suppress.until && suppress.trigger && trig && (suppress.trigger.contains(trig) || trig.contains(suppress.trigger))) { suppress = null; return; }
    suppress = null; closeCtx();
    const el = h('div', { class: 'ctx', role: 'menu' });
    if (o.minWidth) el.style.minWidth = o.minWidth + 'px';
    fillCtx(el, entries, 0);
    el.style.maxHeight = (innerHeight - 16) + 'px';
    document.body.append(el); ctxEl = el; ctxTrigger = trig ? (trig.closest('button,.pillsel,.dd') || trig) : null;
    const w = el.offsetWidth, hh = el.offsetHeight;
    el.style.left = Math.max(6, Math.min(x, innerWidth - w - 8)) + 'px';
    let top = y; if (top + hh > innerHeight - 8) top = o.flipY != null && o.flipY - hh - 6 >= 8 ? o.flipY - hh - 6 : innerHeight - hh - 8;
    el.style.top = Math.max(8, top) + 'px';
    el.tabIndex = -1; try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }   // keys now go to the menu, not to whatever page (the CV preview) was clicked
    return el;
  }
  document.addEventListener('mousedown', (e) => { if (ctxEl && !ctxEl.contains(e.target) && !(e.target.closest && e.target.closest('.ctx.sub'))) { suppress = { trigger: ctxTrigger && ctxTrigger.contains(e.target) ? ctxTrigger : null, until: Date.now() + 400 }; closeCtx(); } }, true);
  window.addEventListener('blur', closeCtx);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCtx();
    else if (ctxEl && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {   // arrow keys walk the open menu
      const menus = [...document.querySelectorAll('.ctx')]; const m = menus[menus.length - 1]; if (!m) return;
      const bs = [...m.querySelectorAll(':scope > button:not(:disabled)')]; if (!bs.length) return; e.preventDefault(); e.stopPropagation();
      const i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
    }
  });

  // ---------- rounded dropdowns: every native <select> keeps working (value, options, change) but shows a styled button + menu ----------
  function enhanceSelect(sel) {
    if (sel.dataset.enh || sel.multiple || sel.size > 1) return; sel.dataset.enh = '1';
    const btn = h('button', { type: 'button', class: 'dd ' + (sel.className || '') });
    const label = () => { const o = sel.options[sel.selectedIndex]; return o ? o.textContent : ''; };
    const draw = () => { btn.textContent = ''; btn.append(h('span', { class: 'ddl' }, label()), icon('chevD')); btn.disabled = sel.disabled; if (sel.style.width) btn.style.width = sel.style.width; };
    btn.onclick = (e) => { e.preventDefault(); const r = btn.getBoundingClientRect(); ctxMenu(r.left, r.bottom + 6, [...sel.options].map(o => ({ label: o.textContent, sel: o.value === sel.value, cls: o.className || ('st-' + o.value), disabled: o.disabled, fn: () => { sel.value = o.value; draw(); sel.dispatchEvent(new Event('change', { bubbles: true })); } })), { minWidth: r.width, flipY: r.top }); };
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(sel, 'value', { get() { return desc.get.call(sel); }, set(v) { desc.set.call(sel, v); draw(); }, configurable: true });
    sel.style.display = 'none'; sel.after(btn); draw();
    new MutationObserver(draw).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    sel.addEventListener('change', draw);
  }
  (function () {
    const scan = (root) => { if (root.nodeType !== 1) return; if (root.tagName === 'SELECT') enhanceSelect(root); else root.querySelectorAll && root.querySelectorAll('select').forEach(enhanceSelect); };
    new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(scan); }).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => scan(document.body));
  })();
  // app-wide date format for full dates (applications etc.)
  function fmtDate(d) { return M.fmtFull(d, (App.state.settings || {}).dateFormat || 'dmy-long'); }

  // ---------- files ----------
  function pickFilesWeb(accept, multi) {
    return new Promise(res => {
      const i = h('input', { type: 'file', accept: accept || '', multiple: !!multi, style: { display: 'none' } });
      i.onchange = () => res([...i.files]); document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000);
    });
  }
  const b64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
  // Returns [{path} | {name, b64}]
  async function pickFiles(o) {
    o = o || {};
    if (window.cvDesktop) { const ps = await window.cvDesktop.pickFiles({ multi: !!o.multi, filters: o.filters, title: o.title }); return ps.map(p => ({ path: p, name: p.split(/[\\/]/).pop() })); }
    const fs = await pickFilesWeb(o.accept, o.multi); return Promise.all(fs.map(async f => ({ name: f.name, b64: await b64(f) })));
  }
  async function fromDropped(fileList) {
    const out = [];
    for (const f of fileList) {
      const p = window.cvDesktop ? window.cvDesktop.pathForFile(f) : '';
      out.push(p ? { path: p, name: f.name } : { name: f.name, b64: await b64(f) });
    }
    return out;
  }
  function download(name, text, mime) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime || 'application/json' })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  async function openPath(p) { if (window.cvDesktop) return window.cvDesktop.openPath(p); toast('Saved at ' + p); }
  async function showInFolder(p) { if (!window.cvDesktop) return toast('Saved at ' + p); try { await window.cvDesktop.showInFolder(p); } catch (e) { toast('Could not open the folder: ' + String(e && e.message || e).replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, ''), { err: true }); } }

  // ---------- item helpers ----------
  const TYPE_ORDER = M.TYPES.map(t => t.key);
  function typeLabel(k) { return M.TYPE_LABEL[k] || k; }
  function datesOf(it) { return it.type === 'education' ? yearsOf(it) : M.fmtRange(it.start, it.end, 'short'); }
  function yearsOf(it) { return M.fmtRange(it.start ? it.start.slice(0, 4) : '', it.end && it.end !== 'present' ? it.end.slice(0, 4) : (it.end || ''), 'short'); }
  function textOf(it) { return M.itemText(it) || it.title || ''; }
  function metaLine(it) { return [it.role, it.title && it.text ? it.title : '', it.org, it.location, datesOf(it)].filter(Boolean); }
  function endKey(it) { const e = it.end === 'present' ? 9999 * 12 : M.dateNum(it.end || it.start, true); return e == null ? -1 : e; }
  function startKey(it) { const s = M.dateNum(it.start || it.end); return s == null ? -1 : s; }
  function isWorkLike(it) { return ['work', 'internship', 'position', 'volunteering'].includes(it.type); }

  // sort keys: the comparator is written ascending; the direction button reverses it. [label, ascending comparator, default direction, [label asc, label desc]]
  const SORT_BASE = {
    date: ['Month-year', (a, b) => endKey(a) - endKey(b) || startKey(a) - startKey(b), 'desc', ['Oldest first', 'Newest first']],
    added: ['Time added', (a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''), 'desc', ['Oldest first', 'Newest first']],
    org: ['Organisation', (a, b) => (a.org || '\uffff').toLowerCase().localeCompare((b.org || '\uffff').toLowerCase()) || endKey(b) - endKey(a), 'asc', ['A to Z', 'Z to A']],
    type: ['Type', (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || endKey(b) - endKey(a), 'asc', ['Work first', 'Work last']],
    edited: ['Last edited', (a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''), 'desc', ['Oldest first', 'Newest first']]
  };
  // old saved values like 'date-desc' still work
  function sortSpec(state) { let k = String((state && state.sort) || 'date'), d = state && state.dir; const m = /^(.*)-(asc|desc)$/.exec(k); if (m) { k = m[1]; d = d || m[2]; } if (k === 'added') k = 'added'; if (!SORT_BASE[k]) k = 'date'; return { key: k, dir: d || SORT_BASE[k][2] }; }
  function sortFn(state) { const sp = sortSpec(state), f = SORT_BASE[sp.key][1]; return sp.dir === 'desc' ? (a, b) => f(b, a) : f; }
  const SORTS = { 'date-desc': ['Month-year, newest first', sortFn({ sort: 'date-desc' })] };
  // filter presets: which entry types each group button shows. Editable in Settings (an ordered list, so more can be added).
  const PRESET_DEFAULTS = [{ id: 'work', label: 'Work', types: ['work', 'position', 'internship'] }, { id: 'education', label: 'Education', types: ['education', 'certification'] }, { id: 'initiatives', label: 'Initiatives', types: ['project', 'extracurricular', 'publication', 'volunteering', 'initiative'] }, { id: 'achievements', label: 'Achievements', types: ['award'] }];
  function presets() { const c = (App.state.settings || {}).filterPresets; return Array.isArray(c) && c.length ? c : PRESET_DEFAULTS.map(p => Object.assign({}, p, { types: p.types.slice() })); }
  function customTypes(st) { if (st && Array.isArray(st.types)) return st.types; const used = new Set(presets().flatMap(p => p.types)); return M.TYPES.map(t => t.key).filter(k => !used.has(k) && k !== 'skill'); }
  function groupOf(it) { return ['work', 'internship', 'position', 'volunteering'].includes(it.type) ? 'work' : (it.type === 'education' ? 'education' : 'other'); }
  function matches(it, f) {
    if (!f) return true;
    const arch = f.arch || (f.archived ? 'all' : 'not');
    if (arch === 'not' && it.archived) return false; if (arch === 'only' && !it.archived) return false;
    if (f.star === 'only' && !it.starred) return false; if (f.star === 'not' && it.starred) return false;
    if (f.group === 'personal') return false;
    if (f.group && f.group !== 'all') { const g = f.group === 'other' ? 'custom' : f.group; if (g === 'custom') { if (!customTypes(f).includes(it.type)) return false; } else { const P = presets().find(p => p.id === g); if (P && !P.types.includes(it.type)) return false; } }
    if (f.tag && !(it.tags || []).includes(f.tag) && !(it.skills || []).includes(f.tag)) return false;
    if (f.q) {
      const hay = [M.itemText(it), it.title, it.org, it.role, it.location, (it.tags || []).join(' '), (it.skills || []).join(' '), (it.versions || []).map(v => v.text).join(' '), it.notes].join(' ').toLowerCase();
      for (const w of f.q.toLowerCase().split(/\s+/).filter(Boolean)) if (!hay.includes(w)) return false;
    }
    return true;
  }

  // ---------- small components ----------
  const icon = (name, o) => window.Icons.svg(name, o);
  function tipAttrs(el, text, eg) { if (text) { el.dataset.tip = text; if (eg) el.dataset.eg = eg; } return el; }
  function toggle(label, checked, onchange, tip, eg) {
    const inp = h('input', { type: 'checkbox', checked: !!checked, onchange: e => onchange && onchange(e.target.checked) });
    const el = h('label', { class: 'sw' }, inp, label ? h('span', null, label) : null); if (tip) tipAttrs(el, tip, eg); el.input = inp; return el;
  }
  function seg(options, value, onchange, o) {
    o = o || {}; const el = h('div', { class: 'seg' + (o.sm ? ' sm' : '') + (o.hero ? ' hero' : '') });
    const draw = () => { clear(el); for (const [v, label, ic, tip, eg] of options) { const b = h('button', { class: value === v ? 'on' : '', onclick: () => { value = v; draw(); onchange && onchange(v); } }, ic ? icon(ic) : null, label ? h('span', null, label) : null); if (tip) tipAttrs(b, tip, eg); el.append(b); } };
    draw(); el.set = (v) => { value = v; draw(); }; return el;
  }
  function pillSelect(key, options, value, onchange, tip, eg, ic) {
    const lab = () => (options.find(o => o[0] === value) || [value, value])[1];
    const el = h('button', { class: 'pillsel', onclick: () => { const r = el.getBoundingClientRect(); ctxMenu(r.left, r.bottom + 6, options.map(([v, l]) => ({ label: l, sel: v === value, fn: () => { value = v; draw(); onchange && onchange(v); } }))); } });
    const draw = () => { clear(el); if (ic) el.append(icon(ic)); el.append(h('span', { class: 'k' }, key), h('b', null, lab()), icon('chevD')); el.classList.toggle('active', ic !== 'sort' && !!value && value !== 'all' && value !== ''); };
    draw(); if (tip) tipAttrs(el, tip, eg); return el;
  }
  // tooltip
  (function () {
    let tipEl = null, timer = null, cur = null;
    const ensure = () => { if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'tip'; document.body.append(tipEl); } return tipEl; };
    const hide = () => { clearTimeout(timer); cur = null; if (tipEl) tipEl.classList.remove('on'); };
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (t === cur) return; hide(); if (!t) return; cur = t;
      timer = setTimeout(() => {
        const el = ensure(); clear(el); el.append(h('div', null, t.dataset.tip)); if (t.dataset.eg) el.append(h('div', { class: 'eg' }, 'e.g. ' + t.dataset.eg));
        el.style.left = '0px'; el.style.top = '0px'; el.classList.add('on');
        const r = t.getBoundingClientRect(), b = el.getBoundingClientRect();
        el.style.left = Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2)) + 'px';
        el.style.top = (r.bottom + 8 + b.height > innerHeight ? r.top - b.height - 8 : r.bottom + 8) + 'px';
      }, 900);
    });
    document.addEventListener('mousedown', hide, true); document.addEventListener('scroll', hide, true);
  })();
  function pick(on, onclick, tip) { const b = h('button', { class: 'pick' + (on ? ' on' : ''), onclick: (e) => { e.stopPropagation(); onclick && onclick(e); } }, icon('check')); if (tip) tipAttrs(b, tip); return b; }

  // Reusable filter/sort bar. Returns { search, bar } (DOM nodes) bound to `state`.
  // 3-state pill: all (hollow) / only (filled) / not (hollow, greyed, struck-through text)
  function triPill(label, ic, mode, onchange, gold, noun) {
    const el = h('button', { class: 'tpill' + (gold ? ' gold' : '') });
    const tipOf = (m) => 'Showing: ' + (m === 'all' ? 'All entries' : m === 'only' ? 'only ' + noun + ' entries' : 'Only not ' + noun + ' entries') + '. Click to change.';
    const draw = () => { clear(el); el.className = 'tpill' + (gold ? ' gold' : '') + ' m-' + mode; el.append(ic ? icon(ic) : null, h('span', { class: 'tl' }, label), h('span', { class: 'tbx' }, mode === 'only' ? '\u2713' : mode === 'not' ? '\u2212' : '')); el.dataset.tip = tipOf(mode); };
    el.onclick = () => { mode = mode === 'all' ? 'only' : mode === 'only' ? 'not' : 'all'; draw(); onchange(mode); };
    draw(); return el;
  }
  function filterBar(state, onChange, o) {
    o = o || {};
    const tags = [...new Set(App.state.items.flatMap(i => (i.tags || []).concat(i.skills || [])))].sort();
    if (state.group === 'other') state.group = 'custom'; if (o.noPersonal && state.group === 'personal') state.group = 'all'; if (!state.star) state.star = 'all'; if (!state.arch) state.arch = state.archived ? 'all' : 'not';
    const q = h('input', { type: 'search', placeholder: 'Search text, organisation, tags...', value: state.q || '', oninput: debounce(() => { state.q = q.value; onChange(); }, 120) });
    q.dataset.role = 'search';
    const search = h('div', { class: 'searchbox' }, icon('search'), q); tipAttrs(search, 'Find entries by any words in the text, organisation, role, tags or skills.', 'SCADA, or NPCI intern');
    const bar = h('div', { class: 'row wrap', style: { gap: '8px', width: '100%', justifyContent: 'space-between' } });
    const tipFor = { all: 'Show every entry.', custom: 'Pick exactly which entry types to show.' };
    // sort: the dropdown picks WHAT to sort by, the round arrow button flips the direction
    const sp0 = sortSpec(state); state.sort = sp0.key; state.dir = sp0.dir;
    const sortWrap = h('div', { class: 'row', style: { gap: '6px' } });
    const drawSort = () => {
      clear(sortWrap); const sp = sortSpec(state);
      const pill = pillSelect('Sort', Object.entries(SORT_BASE).map(([k, v]) => [k, v[0]]), sp.key, (v) => { state.sort = v; state.dir = SORT_BASE[v][2]; drawSort(); onChange(); }, 'Choose what the list is sorted by.', "'Organisation' keeps all NPCI entries together", 'sort');
      const names = SORT_BASE[sp.key][3]; const dirBtn = h('button', { class: 'dirbtn', onclick: () => { state.dir = sp.dir === 'desc' ? 'asc' : 'desc'; drawSort(); onChange(); } }, icon(sp.dir === 'desc' ? 'arrowDown' : 'arrowUp'));
      tipAttrs(dirBtn, (sp.dir === 'desc' ? names[1] : names[0]) + '. Click to reverse.', null);
      sortWrap.append(dirBtn, pill);
    };
    drawSort();
    const tagP = pillSelect('Tag', [['', 'Any']].concat(tags.map(t => [t, t])), state.tag || '', (v) => { state.tag = v; onChange(); }, 'Show entries that carry a tag or use a skill.', 'Excel'); tagP.classList.add('tagpill');
    // "All entries" reveals the Starred and Archived pills
    const moreBox = h('div', { class: 'row', style: { gap: '6px' } });
    const allBtn = h('button', { class: 'btn small allbtn' }); const drawAll = () => { const f = state.star !== 'all' || state.arch !== 'not'; clear(allBtn).append(icon('layers'), f ? 'Filtered' : 'All entries', icon(state.moreOpen ? 'chevU' : 'chevD')); allBtn.classList.toggle('on', f || !!state.moreOpen); allBtn.classList.toggle('flt', f); };
    const drawMore = () => { clear(moreBox); if (!state.moreOpen) return; moreBox.append(triPill('Starred', 'star', state.star, (m) => { state.star = m; drawAll(); onChange(); }, true, 'starred'), triPill('Archived', 'archive', state.arch, (m) => { state.arch = m; drawAll(); onChange(); }, false, 'archived')); };
    const TRI = (k, label, onSet) => [['all', 'All'], ['only', label + ' only'], ['not', 'Not ' + label.toLowerCase()]].map(([v, l]) => ({ label: l, sel: state[k] === v, fn: () => { state[k] = v; onSet(); } }));
    allBtn.onclick = () => {
      if (allBtn.closest('.dopen')) {   // narrow toolbar (entry details open): the two filters live in a dropdown
        const r = allBtn.getBoundingClientRect(); const redo = () => { drawAll(); onChange(); };
        ctxMenu(r.left, r.bottom + 6, [{ header: 'Starred' }, ...TRI('star', 'Starred', redo), '-', { header: 'Archived' }, ...TRI('arch', 'Archived', redo)]); return;
      }
      state.moreOpen = !state.moreOpen; drawAll(); drawMore();
    }; tipAttrs(allBtn, 'Show the Starred and Archived filters.', null); drawAll(); drawMore();
    // groups. Personal details sits apart in its own card but is part of the same one-choice group
    const persBox = h('div', { class: 'seg sm' }), grpBox = h('div', { class: 'seg sm' }), typesBtn = h('button', { class: 'btn small', style: { display: 'none' } });
    const cycBtn = h('button', { class: 'btn small cycbtn' }); grpBox.classList.add('grpfull');
    const grp = h('div', { class: 'row wrap', style: { gap: '8px' } }, o.noPersonal ? null : persBox, grpBox, cycBtn, typesBtn);
    const drawTypes = () => { const n = customTypes(state).length; clear(typesBtn).append(icon('sliders'), 'Types', h('span', { class: 'muted', style: { marginLeft: '4px' } }, String(n)), icon('chevD')); typesBtn.style.display = (state.group || 'all') === 'custom' ? '' : 'none'; };
    const drawGroups = () => {
      clear(persBox); clear(grpBox); const cur = state.group || 'all';
      const mk = (k, label, tip, short) => { const b = h('button', { class: cur === k ? 'on' : '', onclick: () => { state.group = k; if (k === 'personal' && o.onPersonal) o.onPersonal(); drawGroups(); onChange(); } }, short ? [h('span', { class: 'lg' }, label), h('span', { class: 'shortlbl' }, short)] : h('span', null, label)); tipAttrs(b, tip, null); return b; };
      if (!o.noPersonal) persBox.append(mk('personal', 'Personal details', 'Your name, contact details and photo. These are added to every new CV.', 'Personal'));
      grpBox.append(mk('all', 'All', tipFor.all));
      for (const p of presets()) grpBox.append(mk(p.id, p.label, p.types.map(t => (M.TYPE_LABEL || {})[t] || t).join(', ')));
      grpBox.append(mk('custom', 'Custom', tipFor.custom));
      // narrow toolbar: only the chosen group shows, and clicking it moves on to the next one
      const order = ['all'].concat(presets().map(p => p.id), ['custom']); const at = order.indexOf(cur);
      const curLabel = cur === 'all' ? 'All' : cur === 'custom' ? 'Custom' : ((presets().find(p => p.id === cur) || {}).label || 'All');
      clear(cycBtn).append(icon('filter'), curLabel); cycBtn.style.display = cur === 'personal' ? 'none' : '';
      cycBtn.onclick = () => { state.group = order[(Math.max(at, 0) + 1) % order.length]; drawGroups(); onChange(); };
      tipAttrs(cycBtn, 'Showing: ' + curLabel + '. Click to switch to the next group.', null);
      drawTypes();
    };
    typesBtn.onclick = () => { const r = typesBtn.getBoundingClientRect(); const cur = new Set(customTypes(state)); ctxMenu(r.left, r.bottom + 6, [{ header: 'Show these types' }].concat(M.TYPES.map(t => ({ label: t.label, check: cur.has(t.key), keep: true, fn: () => { if (cur.has(t.key)) cur.delete(t.key); else cur.add(t.key); state.types = M.TYPES.map(x => x.key).filter(k => cur.has(k)); drawTypes(); onChange(); return cur.has(t.key); } })))); };
    tipAttrs(typesBtn, 'Choose which entry types the Custom group shows.', null);
    drawGroups();
    moreBox.classList.add('moreBox');
    const pills = h('div', { class: 'row wrap', style: { gap: '8px', marginLeft: 'auto', justifyContent: 'flex-end', alignItems: 'center' } }, sortWrap, tagP, allBtn, moreBox);
    bar.append(grp, pills);
    return { search, bar, q, grp, pills };
  }
  function applyFilters(items, state) {
    const f = { q: state.q, group: state.group, types: state.types, tag: state.tag, star: state.star, arch: state.arch || (state.archived ? 'all' : 'not') };
    return items.filter(it => matches(it, f)).sort(sortFn(state));
  }

  // Floating "working" card with a looping spinner, a moving bar and a seconds counter. Returns { remove() }.
  // centred "working" card with a spinner, a moving bar and a seconds counter. Returns { remove(), set(text) }.
  function busy(text, o) {
    o = o || {}; const note = o.note == null ? '' : o.note;
    let stopped = false, resolveC; const canceled = new Promise(r => { resolveC = r; });
    const t0 = Date.now(); const sec = h('span', { class: 'muted' }, '0 s'); const title = h('div', { class: 'bt' }, text);
    const el = h('div', { class: 'busyov' }, h('div', { class: 'busy' }, h('div', { class: 'spin big' }), title, h('div', { class: 'small' }, sec, h('span', { class: 'muted' }, note ? '  ' + note : '')), h('div', { class: 'bar' }, h('i')), o.cancel ? h('div', { class: 'actions', style: { marginTop: '12px', justifyContent: 'center' } }, h('button', { class: 'btn', onclick: () => { stopped = true; resolveC(); } }, 'Cancel')) : null));
    document.body.append(el); requestAnimationFrame(() => el.classList.add('on'));
    const iv = setInterval(() => { sec.textContent = Math.round((Date.now() - t0) / 1000) + ' s'; }, 500);
    return { remove() { clearInterval(iv); el.classList.remove('on'); setTimeout(() => el.remove(), 250); }, set(t) { title.textContent = t; }, canceled, get stopped() { return stopped; } };
  }
  // swap content without a blank frame: the browser keeps showing the old picture until the new one is ready, then cross-fades
  async function transition(fn) {
    if (!document.startViewTransition || document.hidden) return fn();
    // The animation must not wait for slow screens: the browser aborts a transition whose update takes longer than ~4 s
    // ("DOM update timed out"). So the transition is released after 1.5 s at the latest while the update carries on.
    const work = Promise.resolve().then(fn);
    try { const t = document.startViewTransition(() => Promise.race([work.catch(() => {}), new Promise(r => setTimeout(r, 1500))])); t.ready.catch(() => {}); t.finished.catch(() => {}); await t.updateCallbackDone; } catch (e) { /* interrupted by another transition: the update still ran */ }
    return work;
  }
  window.UI = { sortSpec, presets, PRESET_DEFAULTS, customTypes, triPill, sortFn, SORT_BASE, transition, fmtDate, enhanceSelect, busy, icon, tipAttrs, toggle, seg, pillSelect, pick, filterBar, call, tryCall, h, $, $$, clear, debounce, toast, modal, confirmBox, promptBox, ctxMenu, closeCtx, pickFiles, fromDropped, download, openPath, showInFolder, b64, typeLabel, datesOf, textOf, metaLine, endKey, startKey, SORTS, matches, applyFilters, groupOf, isWorkLike, yearsOf };
})();
