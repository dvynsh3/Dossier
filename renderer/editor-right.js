'use strict';
// Editor: right panel (template, style, sections, contact details, options).
// Part of the editor (see editor.js). It shares the editor's state and helpers through App.edKit.
(function () {
  const { h, clear, toast, icon } = UI;
  const M = window.CVModel, TP = window.CVTemplates;
  const S = App.state;
  const T = App.tabs.editor;
  const K = App.edKit;
  const { E, mutate, applyFit, pushToRepo, importTemplateFile, exportTemplateFile } = K;
  const FONTS = [['Calibri', 'Calibri, Carlito, Arial, sans-serif'], ['Arial', 'Arial, Helvetica, sans-serif'], ['Segoe UI', "'Segoe UI', Arial, sans-serif"], ['Verdana', 'Verdana, Geneva, sans-serif'], ['Georgia', "Georgia, 'Times New Roman', serif"], ['Times New Roman', "'Times New Roman', Times, serif"], ['Cambria', 'Cambria, Georgia, serif'], ['Garamond', "Garamond, 'Times New Roman', serif"]];
  const ACCENTS = ['#1f4e79', '#2457a6', '#0b6e4f', '#7a1f3d', '#444444', '#8a4b08', '#5b2a86', '#000000', '#c2410c', '#0e7490', '#be185d', '#4d7c0f'];
  // ---------- right panel ----------
  const tplCache = new Map();
  function tplThumb(t, holder) {
    const key = t.id + '|' + (S.cv.opts.accent || '') + '|' + (S.cv.opts.pageSize || '');
    const make = () => { let html = tplCache.get(key); if (!html) { const d = TP.dummyCV(t.id, { accent: S.cv.opts.accent, pageSize: S.cv.opts.pageSize, photo: false }); html = TP.renderDocument(d.cv, d.items, S.settings, K.customFull, { mode: 'png' }); tplCache.set(key, html); } const fr = h('iframe', { sandbox: 'allow-same-origin', tabindex: '-1', scrolling: 'no' }); fr.srcdoc = html; clear(holder).append(fr); };
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); make(); } }, { root: K.rightEl.querySelector('.pbody'), rootMargin: '200px' }); io.observe(holder); } else make();
  }
  function numSlider(label, min, max, step, value, set, tip) {
    const num = h('input', { type: 'number', min, max, step, value }); const rng = h('input', { type: 'range', min, max, step, value });
    const sync = (v, from) => { v = +v; if (isNaN(v)) return; if (from !== num) num.value = v; if (from !== rng) rng.value = v; set(v); };
    rng.oninput = () => sync(rng.value, rng); num.oninput = () => sync(num.value, num);
    const el = h('div', null, h('div', { class: 'small muted', style: { fontWeight: 600, marginBottom: '5px' } }, label), h('div', { class: 'numslider' }, rng, num)); if (tip) UI.tipAttrs(el, tip); return el;
  }
  const RTABS = [['template', 'Template', 'layers'], ['style', 'Style', 'sparkles'], ['sections', 'Sections', 'list'], ['contact', 'Contact details', 'user'], ['options', 'Options', 'sliders']];
  function drawRight() {
    const oldBody = K.rightEl.querySelector('.pbody'); const keepScroll = oldBody ? oldBody.scrollTop : 0;
    clear(K.rightEl);
    const tabs = h('div', { class: 'rtabs' }, RTABS.map(([k, l, ic]) => h('button', { class: 'rtab' + (E().rtab === k ? ' on' : ''), 'data-tip': l, onclick: () => { E().rtab = k; drawRight(); } }, icon(ic))));
    const rt = RTABS.find(x => x[0] === E().rtab) || RTABS[0];
    K.rightEl.append(tabs, h('div', { class: 'rtitle' }, rt[1]));
    const pbody = h('div', { class: 'pbody' }); K.rightEl.append(pbody);
    const secs = []; const body = { append: (det) => secs.push(det) };
    const opts = () => S.cv.opts;
    const setOpt = (k, v) => mutate(cv => { cv.opts[k] = v; }, { panel: false });
    const F = (l, el) => h('label', { class: 'f' }, l, el);
    const grid = h('div', { class: 'tplgrid' });
    S.templates.forEach(t => { const holder = h('div', { class: 'tplthumb' }); grid.append(h('div', { class: 'tplbtn' + (S.cv.templateId === t.id ? ' on' : ''), 'data-tip': t.description, onclick: () => { mutate(cv => cv.templateId = t.id, { panel: false }); grid.querySelectorAll('.tplbtn').forEach(x => x.classList.remove('on')); event.currentTarget.classList.add('on'); } }, holder, h('div', { class: 'tn' }, h('span', null, t.name), h('small', null, t.ats === 'safe' ? 'ATS safe' : t.ats === 'tolerant' ? '2-col' : 'custom')))); setTimeout(() => tplThumb(t, holder), 0); });
    body.append(h('details', { class: 'acc', open: true }, h('summary', null, 'Template (switches live)'), h('div', null, h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: () => T.editTemplate() }, 'Edit / New'), h('button', { class: 'btn small', onclick: importTemplateFile }, 'Import'), h('button', { class: 'btn small', onclick: exportTemplateFile }, 'Export')), grid)));
    // style
    const sw = h('div', { class: 'swatches' });
    const drawSw = () => { clear(sw); ACCENTS.forEach(c => sw.append(h('button', { class: 'swatch' + ((opts().accent || '').toLowerCase() === c ? ' on' : ''), style: { background: c }, onclick: () => { setOpt('accent', c); drawSw(); } }))); const custom = h('input', { type: 'color', value: opts().accent || '#1f4e79', 'data-tip': 'Pick any colour', oninput: e => setOpt('accent', e.target.value), onchange: () => drawSw() }); sw.append(custom); };
    drawSw();
    const fontSel = h('select', { onchange: e => setOpt('font', e.target.value) }, FONTS.map(([n, v]) => h('option', { value: v, selected: opts().font === v }, n)));
    body.append(h('details', { class: 'acc', open: true }, h('summary', null, 'Style'), h('div', null,
      h('div', null, h('div', { class: 'small muted', style: { fontWeight: 600, marginBottom: '6px' } }, 'Accent colour'), sw),
      F('Font (standard fonts only, for ATS)', fontSel),
      numSlider('Font size (pt)', 8, 13, .5, opts().fontSize, v => setOpt('fontSize', v)),
      numSlider('Margin (mm)', 6, 30, 1, opts().margin, v => setOpt('margin', v)),
      numSlider('Spacing (1 = normal)', .5, 1.8, .05, opts().spacing, v => setOpt('spacing', v), 'Space between sections and entries. Type a value or drag.'),
      h('div', { class: 'grid2' }, F('Page size', h('select', { onchange: e => { setOpt('pageSize', e.target.value); applyFit(); } }, ['A4', 'Letter'].map(p => h('option', { value: p, selected: opts().pageSize === p }, p)))), F('Target pages', h('select', { onchange: e => mutate(cv => cv.targetPages = +e.target.value || 0, { panel: false }) }, [0, 1, 2, 3].map(n => h('option', { value: n, selected: (S.cv.targetPages || 0) === n }, n ? n + ' page' + (n > 1 ? 's' : '') : 'no target'))))),
      h('div', { class: 'grid2' }, F('Date style', h('select', { onchange: e => setOpt('dateFormat', e.target.value) }, [['longapos', 'April ’24'], ['long', 'April 2024'], ['short', 'Apr 2024'], ['apos', 'Apr’24'], ['numeric', '04/2024'], ['iso', '2024-04']].map(([k, l]) => h('option', { value: k, selected: opts().dateFormat === k }, l)))), F('Headings', h('select', { onchange: e => setOpt('headingCase', e.target.value) }, [['upper', 'UPPERCASE'], ['normal', 'As typed']].map(([k, l]) => h('option', { value: k, selected: (opts().headingCase || 'upper') === k }, l)))))
    )));
    // sections
    const secBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
    const cv_pbCount = () => S.cv.sections.filter(q => q.pb).length;
    const drawSecs = () => {
      clear(secBox);
      S.cv.sections.forEach((s, i) => {
        const grip = h('span', { class: 'icon-btn sm grip', draggable: 'true', 'data-tip': 'Drag to move this section up or down' }, icon('updown'));
        const row = s.pb
          ? h('div', { class: 'secrow pbrow', 'data-i': i }, grip, UI.toggle('', s.visible === true, v => mutate(cv => cv.sections[i].visible = v), 'Off by default. Drag it under a section and switch it on: the next section then starts on a new page.'), h('span', { class: 'pbname', 'data-tip': 'This name cannot be changed' }, 'Page Break'),
            h('button', { class: 'icon-btn sm', 'data-tip': 'Add another Page Break', onclick: () => { mutate(cv => { const n = cv.sections.filter(q => q.pb).length + 1; cv.sections.splice(i + 1, 0, { key: 'pagebreak' + n + '_' + Date.now().toString(36), label: 'Page Break', types: [], visible: false, pb: true }); }, { panel: false }); drawSecs(); } }, icon('copy')),
            cv_pbCount() > 1 ? h('button', { class: 'icon-btn sm', 'data-tip': 'Remove this Page Break', onclick: () => { mutate(cv => { cv.sections.splice(i, 1); }); drawSecs(); } }, icon('x')) : null)
          : h('div', { class: 'secrow', 'data-i': i }, grip, UI.toggle('', s.visible !== false, v => mutate(cv => cv.sections[i].visible = v, { panel: false }), 'Show or hide this section on this CV.'), h('input', { type: 'text', value: s.label, 'data-tip': 'Rename this section on this CV only', oninput: e => mutate(cv => cv.sections[i].label = e.target.value, { panel: false }) }));
        grip.ondragstart = (ev) => { ev.dataTransfer.setData('text/cv-sec', String(i)); ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setDragImage(row, 20, 16); } catch (x) { /* ignore */ } setTimeout(() => row.classList.add('dragging'), 0); };
        grip.ondragend = () => { row.classList.remove('dragging'); secBox.querySelectorAll('.secrow').forEach(x => x.classList.remove('over-top', 'over-bot')); };
        row.ondragover = (ev) => { if (![...ev.dataTransfer.types].includes('text/cv-sec')) return; ev.preventDefault(); const r = row.getBoundingClientRect(); const top = ev.clientY < r.top + r.height / 2; row.classList.toggle('over-top', top); row.classList.toggle('over-bot', !top); };
        row.ondragleave = () => row.classList.remove('over-top', 'over-bot');
        row.ondrop = (ev) => { const from = parseInt(ev.dataTransfer.getData('text/cv-sec')); if (isNaN(from)) return; ev.preventDefault(); const r = row.getBoundingClientRect(); let to = i + (ev.clientY < r.top + r.height / 2 ? 0 : 1); if (from < to) to--; if (to === from) return drawSecs(); mutate(cv => { const [x] = cv.sections.splice(from, 1); cv.sections.splice(to, 0, x); }, { panel: false }); drawSecs(); };
        secBox.append(row);
      });
    };
    drawSecs();
    body.append(h('details', { class: 'acc' }, h('summary', null, 'Sections: show, rename, reorder'), h('div', null, h('p', { class: 'small muted', style: { margin: 0 } }, 'Work Experience is on by default. Switch off any section, including it, to leave it out of this CV.'), secBox, h('button', { class: 'btn small', onclick: () => { mutate(cv => { cv.sections = JSON.parse(JSON.stringify(M.DEFAULT_SECTIONS)); }, { panel: false }); drawSecs(); } }, 'Reset sections'))));
    // header
    const H = S.cv.header;
    const hf = (k, l, ph) => F(l, h('input', { type: 'text', value: H[k] || '', placeholder: ph || '', oninput: e => mutate(cv => cv.header[k] = e.target.value, { panel: false }) }));
    body.append(h('details', { class: 'acc', open: true }, h('summary', null, 'Header and contact details'), h('div', null,
      hf('name', 'Name'), hf('headline', 'Headline (optional)'), hf('email', 'Email'), hf('phone', 'Phone'), hf('address', 'Address / city'), hf('dob', 'Date of birth (optional)'), hf('age', 'Age (optional)'), hf('gender', 'Gender (optional)'),
      App.linksPicker({ cv: true, getHeader: () => S.cv.header, setLinks: (arr) => mutate(cv => { cv.header.links = arr; }, { panel: false }) }),
      qrBlock(),
      h('div', { class: 'row wrap', style: { marginBottom: '6px' } }, UI.toggle('Show labels (Email: x, Age: 25)', !!opts().labels, v => setOpt('labels', v), 'Writes "Email: ...", "Phone: ...", "LinkedIn: ..." in front of each detail instead of just the detail.')),
      h('div', { class: 'row wrap' }, UI.toggle('Show photo', !!opts().photo, v => setOpt('photo', v)), h('button', { class: 'btn small', onclick: pickPhoto }, H.photo ? 'Change photo...' : 'Add photo...')))));
    // options
    const profs = S.settings.profiles || [];
    body.append(h('details', { class: 'acc', open: true }, h('summary', null, 'Options'), h('div', null,
      UI.toggle('Privacy mode', !!S.cv.privacy, v => mutate(cv => cv.privacy = v, { panel: false }), 'Hides email, phone, address, date of birth and photo from this CV. Links stay. Off by default.', 'sharing a CV in a public folder'),
      UI.toggle('Build Skills from chosen entries', !!S.cv.autoSkills, v => mutate(cv => cv.autoSkills = v, { panel: false }), 'Fills the Skills section from the skills listed on the entries you chose.'),
      F('Order of entries', h('select', { onchange: e => mutate(cv => cv.sortMode = e.target.value, { panel: false }) }, [['date', 'Newest first within each section'], ['manual', 'My order (from dragging lines)']].map(([k, l]) => h('option', { value: k, selected: (S.cv.sortMode || 'date') === k }, l)))),
      h('div', { class: 'small muted', style: { fontWeight: 600 } }, 'Profiles this CV belongs to'),
      h('div', null, profs.map(p => h('span', { class: 'chip' + ((S.cv.profiles || []).includes(p.id) ? ' on' : ''), onclick: () => { mutate(cv => { cv.profiles = cv.profiles || []; const i = cv.profiles.indexOf(p.id); if (i >= 0) cv.profiles.splice(i, 1); else cv.profiles.push(p.id); }, { panel: false, noPreview: true }); drawRight(); } }, p.icon + ' ' + p.name))),
      F('Notes about this CV', h('textarea', { rows: 2, oninput: e => mutate(cv => cv.notes = e.target.value, { panel: false, noPreview: true }) }, S.cv.notes || '')),
      h('button', { class: 'btn small', 'data-tip': 'Copies every line of this CV into your repository as an entry, skipping the ones already there.', onclick: pushToRepo }, icon('folder'), 'Add all entries to the repository'))));
    const idx = RTABS.findIndex(x => x[0] === rt[0]); const det = secs[idx];
    if (det) { const content = det.children[1]; content.className = 'rcontent'; pbody.append(content); }
    pbody.scrollTop = keepScroll;
  }
  // LinkedIn link (like the photo): pick one of the accounts from the Import tab, show or hide it on this CV
  // link -> QR code, shown on the CV only while the toggle is on
  function qrBlock() {
    const q = S.cv.qr || {}; const H = S.cv.header;
    const known = [...new Set([...(H.links || []), ...(S.settings.links || []).map(l => l.url), S.settings.linkedinUrl].filter(Boolean))];
    const dl = h('datalist', { id: 'qrlinks' }, known.map(u => h('option', { value: u })));
    const urlIn = h('input', { type: 'text', value: q.url || '', placeholder: 'Paste a link, or pick one of this CV\'s links', list: 'qrlinks', style: { flex: 1, minWidth: 0 } });
    const make = () => {
      let u = urlIn.value.trim(); if (!u) return toast('Paste a link first', { err: true });
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
      try { QR.svg(u); } catch (e) { return toast(e.message, { err: true }); }
      mutate(cv => { cv.qr = Object.assign({ pos: 'hd', size: 64 }, cv.qr || {}, { url: u, on: true }); }, { panel: false }); drawRight(); toast('QR code made and added to this CV');
    };
    const box = h('div', { class: 'card', style: { padding: '12px', background: 'var(--surface2)' } }, h('div', { style: { fontWeight: 650, marginBottom: '8px' } }, 'QR code from a link'), dl,
      h('div', { class: 'row' }, urlIn, h('button', { class: 'btn small primary', onclick: make }, 'Make QR code')));
    if (q.url) {
      let img = null; try { img = h('img', { src: QR.svg(q.url), style: { width: '84px', height: '84px', borderRadius: '8px', background: '#fff' } }); } catch (e) { /* too long */ }
      box.append(h('div', { class: 'row', style: { marginTop: '10px', alignItems: 'flex-start', gap: '12px' } }, img,
        h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 } },
          h('div', { class: 'small muted', style: { overflowWrap: 'anywhere' } }, q.url),
          h('label', { class: 'f', style: { margin: 0 } }, 'Label under the QR code', h('input', { type: 'text', value: q.label || '', placeholder: 'e.g. LinkedIn', oninput: e => mutate(cv => { cv.qr.label = e.target.value; }, { panel: false }) })),
          UI.toggle('Show on this CV', !!q.on, v => { mutate(cv => { cv.qr.on = v; }, { panel: false }); }, 'Adds or removes the QR code on this CV. The link is kept.'),
          h('div', { class: 'row wrap' }, h('select', { onchange: e => mutate(cv => { cv.qr.pos = e.target.value; }, { panel: false }) }, [['hd', 'In the header'], ['br', 'Bottom right of page']].map(([k, l]) => h('option', { value: k, selected: (q.pos === 'br' ? 'br' : 'hd') === k }, l))),
            h('button', { class: 'btn small', 'data-tip': 'Swap the QR code and the photo (or move the QR to the other side)', onclick: () => mutate(cv => { cv.qr.swap = !cv.qr.swap; }, { panel: false }) }, icon('updown'), 'Swap with photo'),
            h('select', { onchange: e => mutate(cv => { cv.qr.size = +e.target.value; }, { panel: false }) }, [[52, 'Small'], [64, 'Medium'], [84, 'Large']].map(([k, l]) => h('option', { value: k, selected: (q.size || 64) === k }, l))),
            h('button', { class: 'btn small danger', onclick: () => { mutate(cv => { delete cv.qr; }, { panel: false }); drawRight(); } }, 'Remove')))));
    }
    return box;
  }
  function pickPhoto() {
    const i = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    i.onchange = async () => { const f = i.files[0]; if (!f) return; if (f.size > 3e6) return toast('Choose an image under 3 MB', { err: true }); const b = await UI.b64(f); mutate(cv => { cv.header.photo = 'data:' + (f.type || 'image/png') + ';base64,' + b; cv.opts.photo = true; }, { panel: false }); drawRight(); };
    document.body.append(i); i.click(); setTimeout(() => i.remove(), 30000);
  }
  Object.assign(K, { drawRight });
})();
