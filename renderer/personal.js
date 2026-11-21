'use strict';
(function () {
  const { h, clear, call, tryCall, toast, modal, confirmBox, ctxMenu } = UI;
  const M = window.CVModel;
  const S = App.state;

  // Personal details: multi-value fields, saved profiles (combinations), links with site logos and QR codes.
  // ---------- personal details: multi-value fields, profiles (saved combinations), links ----------

  // text field with a dropdown of every value used across all profiles (no duplicates); whatever you type is saved as you type
  let optCache = null;
  const loadOpts = async () => { optCache = await tryCall('profiles.options', {}, true) || {}; };
  function multiField(k, label, o) {
    const inp = h('input', { type: 'text', value: o.getHeader()[k] || '', oninput: () => { o.set(k, inp.value); if (k === 'dob') autoAge(); } });
    const autoAge = () => { const a = window.CVTemplates.ageFromDob(inp.value); if (o.fields && o.fields.age) { o.fields.age.value = a; o.set('age', a); } };
    o.fields = o.fields || {}; o.fields[k] = inp;
    const arrow = h('button', { class: 'mfbtn', type: 'button', 'data-tip': 'Values from all your profiles', onclick: (e) => { e.stopPropagation(); showMenu(); } }, UI.icon('chevD', { size: 14 }));
    const showMenu = async () => {
      document.querySelectorAll('.mfmenu').forEach(x => x.remove()); if (!optCache) await loadOpts();
      const list = (optCache[k] || []).slice(); const cur = o.getHeader()[k]; if (cur && !list.includes(cur)) list.unshift(cur); const r = inp.getBoundingClientRect();
      const m = h('div', { class: 'mfmenu', style: { left: r.left + 'px', top: (r.bottom + 6) + 'px', minWidth: r.width + 'px' } }, list.length ? list.map(v => h('div', { class: 'mfrow' + (v === inp.value ? ' on' : ''), onclick: () => { inp.value = v; o.set(k, v); m.remove(); } }, h('span', null, v))) : [h('div', { class: 'small muted', style: { padding: '8px 12px' } }, 'Nothing saved yet.')]);
      document.body.append(m); const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } }; setTimeout(() => document.addEventListener('mousedown', off, true), 0);
    };
    return h('label', { class: 'f' }, label, h('div', { class: 'mf' }, inp, (k !== 'age' && k !== 'dob') ? h('div', { class: 'mfbtns' }, arrow) : null));
  }

  App.personalPanel = function (o) {
    const wrap = h('div', { class: 'card personal' }); loadOpts();
    const draw = () => {
      o.fields = {}; const H = o.getHeader();
      clear(wrap).append(
        h('div', { class: 'phead' }, h('div', { style: { flex: 1, minWidth: 0 } }, h('h3', { style: { margin: '0 0 4px' } }, o.title || 'Personal details'), o.note ? h('p', { class: 'small muted', style: { margin: 0 } }, o.note) : null), o.headExtra || null),
        h('div', { class: 'grid2' }, multiField('name', 'Name', o), multiField('headline', 'Headline (optional)', o), multiField('email', 'Email', o), multiField('phone', 'Phone', o), multiField('address', 'Address / city', o), multiField('gender', 'Gender (optional)', o), multiField('dob', 'Date of birth (optional)', o), multiField('age', 'Age (fills in from date of birth)', o)),
        h('div', { class: 'sp' }), App.linksPicker(o),
        h('div', { class: 'row', style: { marginTop: '12px', gap: '10px' } }, H.photo ? h('img', { src: H.photo, style: { width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' } }) : null, h('button', { class: 'btn small', onclick: () => pickPhoto(o) }, H.photo ? 'Change photo...' : 'Add photo...'), H.photo ? h('button', { class: 'btn small danger', onclick: () => { o.setPhoto(''); draw(); } }, 'Remove photo') : null));
      if (H.dob && !String(H.age || '').trim() && o.fields.age) { const a = window.CVTemplates.ageFromDob(H.dob); if (a) { o.fields.age.value = a; o.set('age', a); } }
    };
    o.redraw = draw; draw(); return wrap;
  };
  function pickPhoto(o) { const i = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }); i.onchange = async () => { const fl = i.files[0]; if (!fl) return; if (fl.size > 3e6) return toast('Choose an image under 3 MB', { err: true }); o.setPhoto('data:' + (fl.type || 'image/png') + ';base64,' + await UI.b64(fl)); o.redraw && o.redraw(); }; document.body.append(i); i.click(); setTimeout(() => i.remove(), 30000); }

  // links: paste one, press Add; the site's logo and name are fetched (editable). Repository mode manages the list, CV mode picks which ones this CV shows.
  App.linksPicker = function (o) {
    const box = h('div', { class: 'linkbox' }); const links = () => S.settings.links || [];
    const saveLinks = async (arr) => { await App.saveSettings({ links: arr, header: Object.assign({}, S.settings.header, { links: arr.filter(l => l.def).map(l => l.url) }) }); };
    const draw = () => {
      clear(box); const H = o.getHeader(); const mine = H.links || [];
      box.append(h('div', { class: 'small muted', style: { fontWeight: 600, marginBottom: '6px' } }, o.cv ? 'Links shown on this CV' : 'Links'));
      const rows = links().map(l => {
        const on = o.cv ? mine.includes(l.url) : !!l.def;
        const logo = l.logo ? h('img', { class: 'llogo', src: l.logo, alt: '' }) : h('span', { class: 'llogo ph' }, UI.icon('globe', { size: 14 }));
        const name = h('input', { type: 'text', value: l.name || '', class: 'lname', disabled: !!o.cv, onchange: () => saveLinks(links().map(x => x.id === l.id ? Object.assign({}, x, { name: name.value }) : x)) });
        return h('div', { class: 'lrow' }, UI.toggle('', on, v => { if (o.cv) { o.setLinks(v ? mine.concat([l.url]) : mine.filter(u => u !== l.url)); draw(); } else saveLinks(links().map(x => x.id === l.id ? Object.assign({}, x, { def: v }) : x)).then(draw); }, o.cv ? 'Show this link on this CV' : 'Add this link to every new CV'), logo, name, h('span', { class: 'lurl' }, l.url.replace(/^https?:\/\/(www\.)?/, '')),
          h('button', { class: 'icon-btn sm', 'data-tip': 'Show QR code', onclick: () => qrDialog(l) }, UI.icon('qr', { size: 15 })),
          o.cv ? null : h('button', { class: 'icon-btn sm', 'data-tip': 'Delete this link', onclick: async () => { if (await confirmBox('Delete link', 'Remove "' + (l.name || l.url) + '" from your saved links?', 'Delete', true)) { await saveLinks(links().filter(x => x.id !== l.id)); draw(); } } }, UI.icon('trash', { size: 15 })));
      });
      const extra = o.cv ? mine.filter(u => !links().some(l => l.url === u)).map(u => h('div', { class: 'lrow' }, UI.toggle('', true, () => { o.setLinks(mine.filter(x => x !== u)); draw(); }), h('span', { class: 'llogo ph' }, UI.icon('globe', { size: 14 })), h('span', { class: 'lurl', style: { flex: 1 } }, u), h('span', { class: 'small muted' }, 'this CV only'))) : [];
      box.append(...rows, ...extra); if (!rows.length && !extra.length) box.append(h('div', { class: 'small muted' }, o.cv ? 'No saved links yet. Add them under Repository > Personal.' : 'No links yet.'));
      const inp = h('input', { type: 'text', placeholder: 'Paste a link, e.g. linkedin.com/in/you', style: { flex: 1, minWidth: 0 } });
      const add = async (url) => {
        url = String(url || inp.value).trim(); if (!url) return; if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
        if (links().some(l => l.url.replace(/\/$/, '') === url.replace(/\/$/, ''))) return toast('That link is already saved');
        const b = UI.busy('Fetching the site logo...', { note: 'Needs the internet; the link is added either way' }); let meta = null;
        try { meta = await call('link.meta', { url }); } catch (e) { try { const host = new URL(url).hostname.replace(/^www\./, '').split('.')[0]; meta = { name: host.charAt(0).toUpperCase() + host.slice(1), url, logo: '' }; } catch (e2) { b.remove(); return toast('That does not look like a link', { err: true }); } } finally { b.remove(); }
        const rec = { id: M.uid('ln'), name: meta.name, url, logo: meta.logo || '', def: true };
        await saveLinks(links().concat([rec])); if (o.cv) o.setLinks((H.links || []).concat([url])); draw();
      };
      let accts = []; try { accts = JSON.parse(localStorage.getItem(App.profileId && App.profileId !== 'main' ? 'cvb.liaccts.' + App.profileId : 'cvb.liaccts') || '[]').filter(a => a.url && !links().some(l => l.url.replace(/\/$/, '') === a.url.replace(/\/$/, ''))); } catch (e) { /* ignore */ }
      const liBtn = accts.length ? h('button', { class: 'btn small', 'data-tip': 'Add a LinkedIn profile you signed in with on the Import tab', onclick: () => { const r = liBtn.getBoundingClientRect(); ctxMenu(r.left, r.bottom + 6, accts.map(a => ({ label: (a.name ? a.name + ' - ' : '') + a.url.replace(/^https?:\/\/(www\.)?/, ''), fn: () => add(a.url) }))); } }, UI.icon('liglyph', { size: 14 }), 'From LinkedIn accounts') : null;
      box.append(h('div', { class: 'row', style: { marginTop: '8px', gap: '8px' } }, inp, h('button', { class: 'btn small primary', onclick: () => add() }, UI.icon('plus', { size: 14 }), 'Add'), liBtn));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    };
    const qrDialog = (l) => { let src = ''; try { src = window.QR.svg(l.url); } catch (e) { return toast(e.message, { err: true }); } modal('QR code for ' + (l.name || l.url), h('div', { style: { textAlign: 'center' } }, h('img', { src, style: { width: '240px', height: '240px', borderRadius: '10px', background: '#fff' } }), h('div', { class: 'small muted', style: { marginTop: '8px', overflowWrap: 'anywhere' } }, l.url)), { buttons: [{ label: 'Close', value: true }] }); };
    draw(); return box;
  };
})();
