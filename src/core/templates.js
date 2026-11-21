'use strict';
// Template engine + built-in templates + CV model builder. Runs in Node and in the renderer.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model'), require('./templates-extra'), require('./qr'));
  else root.CVTemplates = factory(root.CVModel, root.CVTemplatesExtra, root.QR);
})(typeof self !== 'undefined' ? self : this, function (M, EXTRA, QRLIB) {

  // ---------- mustache-lite ----------
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function parse(tpl) {
    const re = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([#^\/&]?)\s*([^}]*?)\s*\}\}/g;
    const root = { type: 'root', kids: [] }; const stack = [root]; let last = 0, m;
    while ((m = re.exec(tpl))) {
      const top = stack[stack.length - 1];
      if (m.index > last) top.kids.push({ type: 'text', v: tpl.slice(last, m.index) });
      last = re.lastIndex;
      if (m[1] != null) top.kids.push({ type: 'raw', k: m[1] });
      else if (m[2] === '#' || m[2] === '^') { const n = { type: m[2] === '#' ? 'sec' : 'inv', k: m[3], kids: [] }; top.kids.push(n); stack.push(n); }
      else if (m[2] === '/') { if (stack.length > 1) stack.pop(); }
      else if (m[2] === '&') top.kids.push({ type: 'raw', k: m[3] });
      else top.kids.push({ type: 'var', k: m[3] });
    }
    if (last < tpl.length) stack[stack.length - 1].kids.push({ type: 'text', v: tpl.slice(last) });
    return root;
  }
  function lookup(ctx, key) {
    if (key === '.') return ctx[ctx.length - 1];
    const parts = key.split('.');
    for (let i = ctx.length - 1; i >= 0; i--) {
      let v = ctx[i];
      if (v == null || typeof v !== 'object') continue;
      if (!(parts[0] in v)) continue;
      for (const p of parts) { v = v == null ? undefined : v[p]; }
      return v;
    }
    return undefined;
  }
  function renderNode(n, ctx) {
    let out = '';
    for (const k of n.kids) {
      if (k.type === 'text') out += k.v;
      else if (k.type === 'var') out += esc(lookup(ctx, k.k));
      else if (k.type === 'raw') { const v = lookup(ctx, k.k); out += v == null ? '' : String(v); }
      else if (k.type === 'sec') {
        const v = lookup(ctx, k.k);
        if (Array.isArray(v)) for (const e of v) out += renderNode(k, ctx.concat([e]));
        else if (v) out += renderNode(k, typeof v === 'object' ? ctx.concat([v]) : ctx);
      } else if (k.type === 'inv') {
        const v = lookup(ctx, k.k);
        if (!v || (Array.isArray(v) && !v.length)) out += renderNode(k, ctx);
      }
    }
    return out;
  }
  function render(tpl, data) { return renderNode(parse(tpl), [data]); }

  // ---------- model ----------
  function sortKey(it) {
    const e = it.end === 'present' ? 9999 * 12 : M.dateNum(it.end || it.start, true);
    return e == null ? -1 : e;
  }
  function eduYear(it) { return M.fmtRange(it.start ? it.start.slice(0, 4) : '', it.end && it.end !== 'present' ? it.end.slice(0, 4) : (it.end || ''), 'short'); }

  // emails and web addresses become real links in the PDF / HTML (the visible text does not change)
  function linkify(html) {
    const MAILRE = /([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
    let inA = 0, inHead = 0;
    return html.split(/(<[^>]*>)/).map(seg => {
      if (seg[0] === '<') { if (/^<a[\s>]/i.test(seg)) inA++; else if (/^<\/a>/i.test(seg)) inA = Math.max(0, inA - 1); if (/^<(style|script|title)/i.test(seg)) inHead++; else if (/^<\/(style|script|title)/i.test(seg)) inHead = Math.max(0, inHead - 1); return seg; }
      if (inA || inHead || !/[@.]/.test(seg)) return seg;
      return seg.replace(MAILRE, '<a href="mailto:$1">$1</a>').replace(/(^|[^">=\/])((?:https?:\/\/|www\.)[^\s<>"'|,;)]+|\b(?:[a-z0-9-]+\.)?(?:linkedin|github)\.com\/[^\s<>"'|,;)]+)/gi, (m, pre, u) => pre + '<a href="' + (/^https?:/i.test(u) ? u : 'https://' + u) + '">' + u.replace(/^https?:\/\//i, '').replace(/^www\./i, '') + '</a>');
    }).join('');
  }
  function ageFromDob(dob) {
    const t = String(dob || '').trim(); if (!t) return '';
    let y, mo, d, m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(t))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(t))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else { const dt = new Date(t); if (isNaN(dt)) return ''; y = dt.getFullYear(); mo = dt.getMonth() + 1; d = dt.getDate(); }
    const now = new Date(); let a = now.getFullYear() - y; if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) a--;
    return a >= 5 && a < 110 ? String(a) : '';
  }
  function buildModel(cv, items, settings, opts) {
    opts = opts || {};
    const byId = {}; for (const it of items) byId[it.id] = it;
    const o = Object.assign({}, M.DEFAULT_OPTS, cv.opts || {});
    const dfmt = ['apos', 'numeric', 'long', 'longapos', 'iso'].includes(o.dateFormat) ? o.dateFormat : 'short';
    const H = Object.assign({}, cv.header || {});
    const priv = !!cv.privacy;
    // header details: grouped rows, optionally with labels ("Email: x" vs "x"); age and gender go next to the name
    const lab = !!o.labels; const L = (t, v) => (lab ? t + ': ' : '') + v;
    const norm = (u) => String(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
    const siteLabel = (u) => { const h0 = norm(u).split('/')[0]; if (/linkedin/.test(h0)) return 'LinkedIn'; if (/github/.test(h0)) return 'GitHub'; if (/behance/.test(h0)) return 'Behance'; if (/twitter|x\.com/.test(h0)) return 'X'; if (/medium/.test(h0)) return 'Medium'; return 'Website'; };
    const row1 = [], row2 = [], extra = [];
    if (!priv) { if (H.email) row1.push(L('Email', H.email)); if (H.phone) row1.push(L('Phone', H.phone)); if (H.address) row1.push(L('Address', H.address)); if (H.dob) row2.push(L('DOB', H.dob)); }
    const linkTxt = [];
    for (const l of H.links || []) if (l) linkTxt.push(l);
    if (cv.li && cv.li.on && cv.li.url) { const short = norm(cv.li.url); if (!linkTxt.some(c => norm(c) === short)) linkTxt.push(String(cv.li.url).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '')); }
    const hrefOf = new Map(); const bare = (u) => String(u).replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
    const logos = new Map(((settings && settings.links) || []).filter(x => x && x.logo).map(x => [norm(x.url), x.logo]));
    const iconOf = new Map();   // with labels on, a link's fetched site icon stands in for its name (LinkedIn:, GitHub:...)
    for (const l of linkTxt) { const t = L(siteLabel(l), bare(l)); hrefOf.set(t, /^https?:/i.test(l) ? l : 'https://' + l); if (lab && logos.has(norm(l))) iconOf.set(t, { src: logos.get(norm(l)), name: siteLabel(l), text: bare(l) }); row2.push(t); } row2.sort((a, b) => /^(DOB)/.test(a) - /^(DOB)/.test(b));
    if (!priv) { if (H.age) extra.push(L('Age', H.age)); if (H.gender) extra.push(L('Gender', H.gender)); }
    const rows = [row1, row2].filter(r => r.length);
    const contact = row1.concat(row2);
    const contactHtml = rows.map(r => '<p class="cr">' + r.map(x => '<span class="ci">' + (hrefOf.has(x) ? '<a href="' + esc(hrefOf.get(x)) + '">' + (iconOf.has(x) ? '<img class="li" alt="' + esc(iconOf.get(x).name) + '" src="' + esc(iconOf.get(x).src) + '"> ' + esc(iconOf.get(x).text) : esc(x)) + '</a>' : esc(x)) + '</span>').join(' ') + '</p>').join('');
    const header = {
      name: H.name || '', headline: H.headline || '', nameExtra: extra.join(' \u00B7 '), contact, contactLine: contact.join(' | '), contactHtml, rows,
      photo: !priv && o.photo && H.photo ? H.photo : '', showPhoto: !priv && !!o.photo && !!H.photo,
      email: priv ? '' : (H.email || ''), phone: priv ? '' : (H.phone || ''), address: priv ? '' : (H.address || '')
    };
    const sel = (cv.selected || []).map(s => {
      let it = byId[s.itemId]; if (!it) return null;
      if (s.own) it = Object.assign({}, it, s.own);
      const text = s.override != null && s.override !== '' ? s.override : M.itemText(it, s.versionId);
      return { it, text, id: it.id };
    }).filter(Boolean);

    const skillMeta = (settings && settings.skills) || {};
    const sections = [];
    let pendBreak = false;
    for (const sec of cv.sections || []) {
      if (sec.pb) { if (sec.visible === true) pendBreak = true; continue; }   // a switched-on Page Break makes the next shown section start a new page
      if (sec.visible === false) continue;
      const mine = sel.filter(r => sec.types.includes(r.it.type));
      const S = { breakBefore: pendBreak, key: sec.key, label: sec.label, side: false, isSkills: false, isList: false, groups: [], skillGroups: [], list: '' };
      if (sec.key === 'skills') {
        const cats = new Map();
        const add = (name, cat) => { cat = cat || 'Skills'; if (!cats.has(cat)) cats.set(cat, []); if (!cats.get(cat).includes(name)) cats.get(cat).push(name); };
        const catIds = new Map();
        for (const r of mine) { const c0 = (r.it.extra && r.it.extra.category) || 'Skills'; add(r.it.title || r.text, r.it.extra && r.it.extra.category); if (!catIds.has(c0)) catIds.set(c0, []); catIds.get(c0).push(r.id); }
        if (cv.autoSkills) for (const r of sel) for (const s of r.it.skills || []) add(s, (skillMeta[s] && skillMeta[s].category) || 'Skills');
        S.isSkills = true;
        S.skillGroups = [...cats].map(([category, names], gi) => ({ gid: 'skills:' + gi, ids: (catIds.get(category) || []).join(','), category, names: names.slice(), list: names.join(', '), showCat: cats.size > 1 || category !== 'Skills' }));
        if (!S.skillGroups.length) continue;
      } else if (sec.key === 'language') {
        if (!mine.length) continue;
        S.isList = true;
        S.list = mine.map(r => (r.it.title || r.text) + (r.it.extra && r.it.extra.level ? ' (' + r.it.extra.level + ')' : '')).join(', ');
        S.gid = 'language:0'; S.ids = mine.map(r => r.id).join(',');
      } else {
        if (!mine.length) continue;
        const groups = new Map(); const order = [];
        for (const r of mine) {
          const k = M.groupKey(r.it);
          if (!groups.has(k)) { groups.set(k, []); order.push(k); }
          groups.get(k).push(r);
        }
        let gl = order.map(k => ({ k, rs: groups.get(k) }));
        if (cv.sortMode !== 'manual') gl = gl.map((g, i) => ({ g, i })).sort((a, b) => (sortKey(b.g.rs[0].it) - sortKey(a.g.rs[0].it)) || (a.i - b.i)).map(x => x.g);
        const flat = [];
        for (const { rs } of gl) {
          const it = rs[0].it;
          const isEdu = it.type === 'education';
          const head = isEdu ? (it.title || '') : (it.role || it.title || '');
          const org = it.org || '';
          if (!isEdu && !head && !org) {
            for (const r of rs) flat.push({ id: r.id, text: r.text, date: M.fmtRange(r.it.start, r.it.end, dfmt), _s: sortKey(r.it) });
            continue;
          }
          const ex = it.extra || {};
          const dates = isEdu ? eduYear(it) : M.fmtRange(it.start, it.end, dfmt);
          S.groups.push({
            gid: sec.key + ':' + S.groups.length, ids: rs.map(r => r.id).join(','),
            head, org, loc: it.location || '', role: it.role || '', title: it.title || '',
            sub: [org, it.location].filter(Boolean).join(', '),
            titleExtra: !isEdu && it.role && it.title ? it.title : '',
            dates, isEdu, score: ex.score || '', remarks: ex.remarks || '',
            bullets: rs.filter(r => r.text && r.text.trim()).map(r => ({ id: r.id, text: r.text, date: '' })),
            hasBullets: rs.some(r => r.text && r.text.trim()), flat: false
          });
        }
        if (flat.length) {
          if (cv.sortMode !== 'manual') flat.sort((a, b) => b._s - a._s);
          S.groups.push({ gid: sec.key + ':flat', ids: flat.map(b => b.id).join(','), flat: true, head: '', org: '', sub: '', dates: '', bullets: flat, hasBullets: true, isEdu: false });
        }
        S.hasEdu = S.groups.some(g => g.isEdu);
      }
      pendBreak = false; sections.push(S);
    }
    return {
      header, sections, opts: o, cvName: cv.name || '',
      page: pageGeom(o), mode: { preview: opts.mode === 'preview', print: opts.mode === 'print', png: opts.mode === 'png' },
      accent: o.accent, font: o.font, fontSize: o.fontSize, spacing: o.spacing,
      upper: o.headingCase !== 'normal'
    };
  }
  function pageGeom(o) {
    const letter = o.pageSize === 'Letter';
    return { size: letter ? 'Letter' : 'A4', w: letter ? '215.9mm' : '210mm', h: letter ? '279.4mm' : '297mm', wpx: letter ? 816 : 794, hpx: letter ? 1056 : 1123, margin: o.margin };
  }

  // ---------- built-in templates ----------
  const BASE_CSS = `a{color:inherit;text-decoration:none}
*{box-sizing:border-box}
img.ph{width:58pt;height:58pt;object-fit:cover;border-radius:50%;flex:none;display:block}.hd:has(>img.ph){display:flex;gap:12pt;align-items:center}.hd:has(>img.ph)>:not(img){flex:1;min-width:0}
@page{size:{{page.size}};margin:{{page.margin}}mm}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body,body *{font-variant-ligatures:none;font-feature-settings:"liga" 0,"clig" 0,"dlig" 0;text-rendering:optimizeSpeed;font-kerning:none}
body{margin:0;font-family:{{{font}}};font-size:{{fontSize}}pt;line-height:1.35;color:#111}
{{#mode.preview}}html{background:#cfd3d9}body{width:{{page.w}};min-height:{{page.h}};margin:14px auto;padding:{{page.margin}}mm;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.25)}{{/mode.preview}}
{{#mode.png}}body{width:{{page.w}};padding:{{page.margin}}mm;background:#fff}{{/mode.png}}
h1,h2,h3,p,ul,li{margin:0;padding:0}
.nx{font-size:1em!important;font-style:italic;opacity:.85;margin-top:1pt}.ct .cr+.cr{margin-top:1.5pt}.ci{display:inline-block;max-width:100%;overflow-wrap:anywhere}.ci+.ci{margin-left:12pt}.cr img.li{width:1em;height:1em;object-fit:contain;vertical-align:-.15em;margin-right:2pt;border-radius:2px}.ct .pi{opacity:.75;font-size:.9em}
ul{list-style:none}
a{color:inherit;text-decoration:none}
.sec{margin-top:calc(9pt*{{spacing}})}
.grp{margin-top:calc(4.5pt*{{spacing}})}
li,.row,h2{break-inside:avoid}h2,.row{break-after:avoid}
.grp li{margin-top:calc(1.5pt*{{spacing}})}
.row{display:flex;justify-content:space-between;gap:10pt;align-items:baseline}
.date{white-space:nowrap}
li[data-id]{cursor:default}
`;
  const SECTION_MACRO_UL = `<ul>{{#bullets}}<li data-id="{{id}}">{{text}}{{#date}} <span class="date">{{date}}</span>{{/date}}</li>{{/bullets}}</ul>`;

  const stackBody = (extra) => `
<header class="hd">{{#header.showPhoto}}<img class="ph" src="{{{header.photo}}}" alt="">{{/header.showPhoto}}<div class="hdt"><h1>{{header.name}}</h1>{{#header.headline}}<p class="hl">{{header.headline}}</p>{{/header.headline}}<div class="ct">{{{header.contactHtml}}}</div></div></header>
{{#sections}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2>
{{#isSkills}}{{#skillGroups}}<p class="sk">{{#showCat}}<b>{{category}}:</b> {{/showCat}}{{list}}</p>{{/skillGroups}}{{/isSkills}}
{{#isList}}<p class="sk">{{list}}</p>{{/isList}}
{{#groups}}{{#flat}}<div class="grp">${SECTION_MACRO_UL}</div>{{/flat}}
{{^flat}}<div class="grp"><div class="row"><div class="gh">{{#isEdu}}<b>{{head}}</b>{{#sub}}, {{sub}}{{/sub}}{{#score}} | {{score}}{{/score}}{{#remarks}} | {{remarks}}{{/remarks}}{{/isEdu}}{{^isEdu}}{{#head}}<b>{{head}}</b>{{/head}}{{#titleExtra}} | {{titleExtra}}{{/titleExtra}}{{#sub}}{{#head}}, {{/head}}<i>{{sub}}</i>{{/sub}}{{/isEdu}}</div><div class="date">{{dates}}</div></div>
{{#hasBullets}}${SECTION_MACRO_UL}{{/hasBullets}}</div>{{/flat}}{{/groups}}
</section>{{/sections}}${extra || ''}`;

  const CLASSIC_CSS = `.hd{text-align:center}.hd h1{font-size:2.1em;letter-spacing:.02em;color:{{accent}}}.hl{font-style:italic}.ct{margin-top:3pt;font-size:.95em}
h2{font-size:1.05em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.03em;border-bottom:1.2pt solid {{accent}};color:{{accent}};padding-bottom:1.5pt;margin-bottom:2pt}
.grp li{padding-left:11pt;position:relative}.grp li:before{content:"\\2022";position:absolute;left:2pt}.sk{margin-top:2pt}`;
  const MODERN_CSS = `.hd{background:{{accent}};color:#fff;padding:12pt 14pt;margin:-2pt -2pt 0;display:flex;gap:12pt;align-items:center}.hd h1{font-size:2.2em;font-weight:700}.hl{opacity:.95}.ct{font-size:.92em;margin-top:2pt}.ph{width:62pt;height:62pt;object-fit:cover;border-radius:50%}
h2{font-size:1.05em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.03em;color:{{accent}};border-left:4pt solid {{accent}};padding-left:7pt;margin-bottom:3pt}
.grp li{padding-left:11pt;position:relative}.grp li:before{content:"\\25AA";position:absolute;left:1pt;color:{{accent}}}.sk{margin-top:2pt}`;
  const COMPACT_CSS = `body{font-size:{{fontSize}}pt;line-height:1.25}.hd{display:flex;justify-content:space-between;align-items:baseline;gap:12pt;border-bottom:1pt solid #333;padding-bottom:3pt}.hd h1{font-size:1.7em}.ct{font-size:.9em;text-align:right}.hl{display:none}.hdt{display:flex;justify-content:space-between;align-items:baseline;width:100%;gap:10pt}
.sec{margin-top:calc(6pt*{{spacing}})}h2{font-size:.95em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.03em;background:#eee;padding:1pt 4pt;margin-bottom:1pt}
.grp{margin-top:calc(2.5pt*{{spacing}})}.grp li{padding-left:9pt;position:relative;margin-top:0}.grp li:before{content:"-";position:absolute;left:1pt}`;
  const ACADEMIC_CSS = `body{font-family:{{#opts}}"Cambria","Times New Roman",Times,serif{{/opts}};font-size:{{fontSize}}pt;line-height:1.4}.hd{text-align:center;margin-bottom:4pt}.hd h1{font-size:1.9em;font-weight:600}.ct{font-size:.95em}
h2{font-size:1.05em;{{#upper}}text-transform:uppercase;{{/upper}}border-bottom:.6pt solid #000;margin-bottom:2pt;font-weight:700}.hl{font-style:italic}
.grp li{padding-left:12pt;position:relative}.grp li:before{content:"\\2013";position:absolute;left:0}.gh b{font-weight:700}`;
  const ATSPLAIN_CSS = `body{font-family:Arial,Helvetica,sans-serif;font-size:{{fontSize}}pt;line-height:1.35}.hd h1{font-size:1.7em;font-weight:700}.ct{margin-top:2pt}
h2{font-size:1em;font-weight:700;{{#upper}}text-transform:uppercase;{{/upper}}margin-bottom:2pt;border-bottom:.5pt solid #000}.grp li{padding-left:10pt;position:relative}.grp li:before{content:"-";position:absolute;left:0}`;

  const SIDEBAR_HTML = `
<header class="hd">{{#header.showPhoto}}<img class="ph" src="{{{header.photo}}}" alt="">{{/header.showPhoto}}<div><h1>{{header.name}}</h1>{{#header.headline}}<p class="hl">{{header.headline}}</p>{{/header.headline}}</div></header>
<div class="cols">
<aside class="side"><section class="sec"><h2>Contact</h2>{{#header.contact}}<p>{{.}}</p>{{/header.contact}}</section>
{{#sections}}{{#side}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2>
{{#isSkills}}{{#skillGroups}}<p class="sk">{{#showCat}}<b>{{category}}:</b> {{/showCat}}{{list}}</p>{{/skillGroups}}{{/isSkills}}{{#isList}}<p class="sk">{{list}}</p>{{/isList}}
{{#groups}}<div class="grp">{{#head}}<p><b>{{head}}</b></p>{{/head}}{{#sub}}<p>{{sub}}</p>{{/sub}}{{#dates}}<p class="date">{{dates}}</p>{{/dates}}{{#hasBullets}}${SECTION_MACRO_UL}{{/hasBullets}}</div>{{/groups}}</section>{{/side}}{{/sections}}</aside>
<main class="main">{{#sections}}{{^side}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2>
{{#isSkills}}{{#skillGroups}}<p class="sk">{{#showCat}}<b>{{category}}:</b> {{/showCat}}{{list}}</p>{{/skillGroups}}{{/isSkills}}{{#isList}}<p class="sk">{{list}}</p>{{/isList}}
{{#groups}}{{#flat}}<div class="grp">${SECTION_MACRO_UL}</div>{{/flat}}{{^flat}}<div class="grp"><div class="row"><div class="gh">{{#isEdu}}<b>{{head}}</b>{{#sub}}, {{sub}}{{/sub}}{{#score}} | {{score}}{{/score}}{{/isEdu}}{{^isEdu}}{{#head}}<b>{{head}}</b>{{/head}}{{#sub}}{{#head}}, {{/head}}<i>{{sub}}</i>{{/sub}}{{/isEdu}}</div><div class="date">{{dates}}</div></div>{{#hasBullets}}${SECTION_MACRO_UL}{{/hasBullets}}</div>{{/flat}}{{/groups}}</section>{{/side}}{{/sections}}</main></div>`;
  const SIDEBAR_CSS = `.hd{display:flex;gap:12pt;align-items:center;border-bottom:3pt solid {{accent}};padding-bottom:6pt}.hd h1{font-size:2.1em;color:{{accent}}}.ph{width:60pt;height:60pt;object-fit:cover;border-radius:50%}
.cols{display:grid;grid-template-columns:31% 1fr;gap:14pt;margin-top:6pt}.side{background:#f1f4f8;padding:6pt 9pt;font-size:.95em}.side p{margin-top:1.5pt;overflow-wrap:anywhere}
h2{font-size:1em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.03em;color:{{accent}};margin-bottom:2pt;border-bottom:.8pt solid {{accent}}}
.grp li{padding-left:10pt;position:relative}.grp li:before{content:"\\2022";position:absolute;left:1pt}`;

  const TIMELINE_HTML = `
<header class="hd"><h1>{{header.name}}</h1>{{#header.headline}}<p class="hl">{{header.headline}}</p>{{/header.headline}}<div class="ct">{{{header.contactHtml}}}</div></header>
{{#sections}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2>
{{#isSkills}}{{#skillGroups}}<p class="sk">{{#showCat}}<b>{{category}}:</b> {{/showCat}}{{list}}</p>{{/skillGroups}}{{/isSkills}}{{#isList}}<p class="sk">{{list}}</p>{{/isList}}
{{#groups}}{{#flat}}<div class="grp flat">{{#bullets}}<div class="it"><p class="body" data-id="{{id}}">{{text}}</p><p class="dt">{{date}}</p></div>{{/bullets}}</div>{{/flat}}
{{^flat}}<div class="grp tl"><p class="head">{{#isEdu}}<b>{{head}}</b>{{#sub}}, {{sub}}{{/sub}}{{#score}} | {{score}}{{/score}}{{#remarks}} | {{remarks}}{{/remarks}}{{/isEdu}}{{^isEdu}}{{#head}}<b>{{head}}</b>{{/head}}{{#sub}}{{#head}}, {{/head}}<i>{{sub}}</i>{{/sub}}{{/isEdu}}</p><p class="dt">{{dates}}</p>{{#hasBullets}}<div class="bl">${SECTION_MACRO_UL}</div>{{/hasBullets}}</div>{{/flat}}{{/groups}}</section>{{/sections}}`;
  const TIMELINE_CSS = `.hd h1{font-size:2.2em;color:{{accent}};font-weight:300;letter-spacing:.04em}.ct{font-size:.95em;margin-top:2pt}
h2{font-size:1.1em;{{#upper}}text-transform:uppercase;{{/upper}}color:{{accent}};font-weight:700;margin-bottom:3pt}
.tl{display:grid;grid-template-columns:1fr 24%;grid-template-areas:"head dt" "bl bl";gap:0 10pt;padding-left:10pt;border-left:2.5pt solid {{accent}}}.tl .head{grid-area:head}.tl .dt{grid-area:dt;text-align:right;color:#444;white-space:nowrap}.tl .bl{grid-area:bl}
.flat .it{display:grid;grid-template-columns:1fr 24%;gap:10pt;margin-top:1.5pt;padding-left:10pt;border-left:2.5pt solid {{accent}}}.flat .dt{text-align:right;color:#444}
.grp li{padding-left:10pt;position:relative}.grp li:before{content:"\\2022";position:absolute;left:1pt}`;

  // Layout inspired by the original table-style CV: label column, bullets, right-hand dates. Built from CSS grid, not <table>.
  const GRIDCV_HTML = `
<header class="hd"><h1>{{header.name}}</h1>{{#header.headline}}<p>{{header.headline}}</p>{{/header.headline}}<div class="ct">{{{header.contactHtml}}}</div></header>
{{#sections}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2>
{{#isSkills}}{{#skillGroups}}<p class="sk">{{#showCat}}<b>{{category}}:</b> {{/showCat}}{{list}}</p>{{/skillGroups}}{{/isSkills}}{{#isList}}<p class="sk">{{list}}</p>{{/isList}}
{{#hasEdu}}<div class="er eh"><span>Degree</span><span>Year</span><span>Institute</span><span>Score</span><span>Remarks</span></div>{{/hasEdu}}
{{#groups}}{{#flat}}{{#bullets}}<div class="fl"><p data-id="{{id}}">{{text}}</p><p class="dt">{{date}}</p></div>{{/bullets}}{{/flat}}
{{^flat}}{{#isEdu}}<div class="er"><span><b>{{head}}</b></span><span>{{dates}}</span><span>{{org}}</span><span>{{score}}</span><span>{{remarks}}</span></div>{{/isEdu}}
{{^isEdu}}<div class="gr"><div class="lb"><b>{{head}}</b>{{#sub}}<br>{{sub}}{{/sub}}</div><div class="bl">{{#hasBullets}}${SECTION_MACRO_UL}{{/hasBullets}}</div><div class="dt">{{dates}}</div></div>{{/isEdu}}{{/flat}}{{/groups}}</section>{{/sections}}`;
  const GRIDCV_CSS = `.hd h1{font-size:1.8em;font-weight:700}.ct{margin-top:2pt}
h2{background:{{accent}};color:#fff;font-size:.95em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.03em;padding:1.5pt 5pt;margin-bottom:3pt}
.er{display:grid;grid-template-columns:20% 12% 1fr 14% 20%;gap:6pt;border-bottom:.5pt solid #bbb;padding:1.5pt 0}.eh{font-weight:700}
.gr{display:grid;grid-template-columns:19% 1fr 12%;gap:8pt;border-bottom:.5pt solid #ddd;padding:2.5pt 0}.gr .dt{text-align:right}.gr .lb{font-size:.95em}
.fl{display:grid;grid-template-columns:1fr 11%;gap:8pt;padding:1pt 0 1pt 10pt}.fl .dt{text-align:right}.fl p:first-child:before{content:"\\2022 ";margin-left:-10pt;padding-right:4pt}
.gr li{padding-left:10pt;position:relative;margin-top:0}.gr li:before{content:"\\2022";position:absolute;left:1pt}`;

  const BUILTIN = [
    { id: 'classic', name: 'Classic', ats: 'safe', description: 'Single column, centered header, ruled headings. The safe default.', html: stackBody(), css: CLASSIC_CSS },
    { id: 'ats-plain', name: 'ATS Plain', ats: 'safe', description: 'Plain Arial, no colour, simplest possible structure for strict parsers.', html: stackBody(), css: ATSPLAIN_CSS },
    { id: 'modern', name: 'Modern band', ats: 'safe', description: 'Coloured header band, accent headings. Single column, fully linear text.', html: stackBody(), css: MODERN_CSS },
    { id: 'compact', name: 'Compact one-page', ats: 'safe', description: 'Dense layout for fitting a lot on one page.', html: stackBody(), css: COMPACT_CSS },
    { id: 'academic', name: 'Academic serif', ats: 'safe', description: 'Serif type, ruled headings, built to run to several pages.', html: stackBody(), css: ACADEMIC_CSS },
    { id: 'timeline', name: 'Timeline', ats: 'safe', description: 'Accent rule on the left, dates in a right column; text order stays linear.', html: TIMELINE_HTML, css: TIMELINE_CSS },
    { id: 'gridcv', name: 'Label grid', ats: 'safe', description: 'Role label column, bullets, dates on the right, drawn with CSS grid instead of tables.', html: GRIDCV_HTML, css: GRIDCV_CSS },
    { id: 'sidebar', name: 'Sidebar', ats: 'tolerant', description: 'Two columns. Reads correctly in modern parsers, but some older ATS may interleave columns. A single-column twin is recommended for applications.', html: SIDEBAR_HTML, css: SIDEBAR_CSS, sidebar: ['skills', 'language', 'certification'] }
  ];

  (EXTRA || []).forEach(t => BUILTIN.push(t));
  // every group wrapper carries data-gid / data-ids so the editor can outline blocks and map them to items
  const BLK = ' data-gid="{{gid}}" data-ids="{{ids}}"';
  BUILTIN.forEach(t => { t.html = t.html.replace(/<\/h1>/, '</h1>{{#header.nameExtra}}<p class="nx">{{header.nameExtra}}</p>{{/header.nameExtra}}').replace(/<(div|p) class="(grp|g|gr|er|fl|sk)((?: [^"]*)?)"/g, (m, tag, c, rest) => '<' + tag + BLK + ' class="' + c + rest + '"'); });
  function allTemplates(custom) { return BUILTIN.concat(custom || []); }
  function findTemplate(id, custom) { return allTemplates(custom).find(t => t.id === id) || BUILTIN[0]; }

  function renderDocument(cv, items, settings, custom, ropts) {
    ropts = ropts || {};
    const tpl = ropts.template || findTemplate(cv.templateId, custom);
    const model = buildModel(cv, items, settings, ropts);
    const side = tpl.sidebar || [];
    for (const s of model.sections) s.side = side.includes(s.key);
    if (ropts.dummy) { /* caller passes dummy cv/items */ }
    const css = render(BASE_CSS + '\n' + (tpl.css || ''), model);
    let tplHtml = tpl.html || '';
    if (ropts.edit) {   // editor only: every text part becomes its own editable span (organisation, role, dates, score, remarks, section names)
      tplHtml = tplHtml.replace(/\{\{(head|org|sub|dates|score|remarks|titleExtra)\}\}/g, (m, f) => '<span class="ef" data-f="' + f + '">' + m + '</span>').replace(/<h2>\{\{label\}\}<\/h2>/g, '<h2><span class="ef" data-f="sec">{{label}}</span></h2>');
    }
    const body = render(tplHtml, model);
    const title = esc(cv.name || model.header.name || 'CV');
    let extraHead = ropts.head || '';
    const bf = cv.blockFlags || {}; const rules = Object.keys(bf).map(g => { const f = bf[g] || {}; const gg = String(g).replace(/["\\]/g, ''); const sel = '[data-gid="' + gg + '"],[data-sgid="' + gg + '"]'; return (f.keep ? sel + '{break-inside:avoid;page-break-inside:avoid}' : ''); }).join('');
    const pbRules = model.sections.filter(x => x.breakBefore).map(x => '[data-sgid="sec:' + x.key + '"]{break-before:page;page-break-before:always}').join('');
    if (rules || pbRules) extraHead += '<style>' + rules + pbRules + '</style>';
    // optional QR code (cv.qr = { url, on, pos: 'hd' | 'br', size, swap }): sits in the header beside the photo, centred with it
    let qrHtml = '', bodyHtml = body;
    if (cv.qr && cv.qr.on && cv.qr.url && QRLIB) {
      try {
        const sz = Math.max(40, Math.min(120, +cv.qr.size || 64)); const src = QRLIB.svg(cv.qr.url);
        const isLi = /linkedin\.com/i.test(cv.qr.url);
        const hasPhoto = model.header.showPhoto, swap = !!cv.qr.swap;
        if (cv.qr.pos === 'br' || !/<header class="hd"[^>]*>/.test(body)) {
          const off = ropts.mode === 'print' ? '0' : model.page.margin + 'mm';
          { const im = `<img class="cvqr" alt="QR code" src="${src}" style="position:absolute;bottom:${off};right:${off};width:${sz}px;height:${sz}px">`; qrHtml = ropts.mode === 'print' ? `<a href="${esc(cv.qr.url)}">${im}</a>` : im; }
          extraHead += '<style>body{position:relative}</style>';
        } else {
          const qOrder = hasPhoto ? (swap ? 0 : 2) : (swap ? 2 : 0), pOrder = hasPhoto ? (swap ? 2 : 0) : 0;
          const logo = cv.qr.logo && /^data:image\/(png|jpeg|jpg|svg\+xml|x-icon|vnd\.microsoft\.icon|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(cv.qr.logo) ? cv.qr.logo : '';
          const label = esc(cv.qr.label || (isLi ? 'LinkedIn' : ''));
          const cap = (logo || label) ? `<span class="cvqrcap">${logo ? `<img class="cvqrlogo" alt="" src="${logo}">` : (isLi ? '<b>in</b> ' : '')}${label}</span>` : '';
          const link = (inner) => ropts.mode === 'print' ? `<a href="${esc(cv.qr.url)}">${inner}</a>` : inner;
          const wrap = `<div class="cvqrw">${link(`<img class="cvqr" alt="QR code" src="${src}" style="width:${sz}px;height:${sz}px">`)}${cap}</div>`;
          bodyHtml = body.replace(/(<header class="hd"[^>]*>)/, '$1' + wrap);
          extraHead += `<style>.hd:has(>.cvqrw){display:flex!important;gap:12pt;align-items:center!important}.hd:has(>.cvqrw)>*{order:1}.hd:has(>.cvqrw)>:not(img):not(.cvqrw){flex:1;min-width:0}.hd>.cvqrw{order:${qOrder};flex:none!important;display:flex;flex-direction:column;align-items:center;gap:2px}.hd>img.ph{order:${pOrder}}.cvqrw img{display:block;background:#fff;border-radius:3px}.cvqrcap{font-size:6.5pt;line-height:1;white-space:nowrap}.cvqrcap{display:flex;align-items:center;gap:2pt}.cvqrcap b{background:#0a66c2;color:#fff;border-radius:2px;padding:0 2px;font-size:6.5pt}.cvqrlogo{width:8pt!important;height:8pt!important;border-radius:1.5pt}</style>`;
        }
      } catch (e) { /* link too long: no code */ }
    }
    if (ropts.mode === 'print') bodyHtml = linkify(bodyHtml);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>${extraHead}</head><body>${qrHtml}${bodyHtml}</body></html>`;
  }

  // Plain model-driven text, used for DOCX/ATS preview fallback
  function plainText(cv, items, settings) {
    const m = buildModel(cv, items, settings);
    const out = [m.header.name + (m.header.nameExtra ? ' (' + m.header.nameExtra + ')' : ''), m.header.headline, m.header.contactLine].filter(Boolean);
    for (const s of m.sections) {
      out.push('', s.label.toUpperCase());
      if (s.isSkills) for (const g of s.skillGroups) out.push((g.showCat ? g.category + ': ' : '') + g.list);
      else if (s.isList) out.push(s.list);
      else for (const g of s.groups) {
        if (!g.flat) out.push([g.head, g.sub, g.dates, g.score, g.remarks].filter(Boolean).join(' | '));
        for (const b of g.bullets) out.push('- ' + b.text + (b.date ? ' (' + b.date + ')' : ''));
      }
    }
    return out.join('\n');
  }

  // Placeholder content for previews and the template editor: deliberately generic. The bullets follow the usual
  // "action verb + what you did + result" pattern recommended by university career services (e.g. Harvard OCS resume guides).
  const DUMMY = {
    header: { name: 'Jordan Taylor', headline: 'Professional Title', email: 'name@example.com', phone: '+00 000 000 0000', address: 'City, Country', dob: '', links: ['example.com/in/name'], photo: '' },
    items: [
      M.newItem({ id: 'd1', type: 'education', title: 'Master\'s Degree', org: 'Example University', start: '2019', end: '2021', extra: { score: 'GPA 3.8/4.0', remarks: 'Honours' } }),
      M.newItem({ id: 'd2', type: 'education', title: 'Bachelor\'s Degree', org: 'Sample College', start: '2015', end: '2019', extra: { score: 'GPA 3.6/4.0' } }),
      M.newItem({ id: 'd3', type: 'work', role: 'Job Title', org: 'Company Name', location: 'City', start: '2021-06', end: 'present', text: 'Led a team of 5 to deliver a key project two weeks ahead of schedule.' }),
      M.newItem({ id: 'd4', type: 'work', role: 'Job Title', org: 'Company Name', location: 'City', start: '2021-06', end: 'present', text: 'Streamlined a reporting process, reducing turnaround time by 25%.' }),
      M.newItem({ id: 'd5', type: 'internship', role: 'Intern', org: 'Another Company', start: '2020-06', end: '2020-08', text: 'Supported the team with research and presentations for 10+ clients.' }),
      M.newItem({ id: 'd6', type: 'project', title: 'Project Title', org: 'Example University', start: '2020', end: '2020', text: 'Designed and presented a study of 200 survey responses to a panel of faculty.' }),
      M.newItem({ id: 'd7', type: 'certification', text: 'Certificate in Project Management, Example Institute.', start: '2022', end: '2022' }),
      M.newItem({ id: 'd8', type: 'award', text: 'Dean\'s List for four consecutive semesters.', start: '2018', end: '2019' }),
      M.newItem({ id: 'd9', type: 'position', role: 'Committee Member', org: 'Student Association', start: '2018', end: '2019', text: 'Organised 6 events attended by 300+ students.' }),
      M.newItem({ id: 'd10', type: 'skill', title: 'Skill One', extra: { category: 'Category A' } }),
      M.newItem({ id: 'd11', type: 'skill', title: 'Skill Two', extra: { category: 'Category A' } }),
      M.newItem({ id: 'd12', type: 'skill', title: 'Skill Three', extra: { category: 'Category B' } })
    ]
  };
  function dummyCV(templateId, opts) {
    const cv = M.newCV({ id: 'dummy', name: 'Sample', templateId: templateId || 'classic', header: DUMMY.header, selected: DUMMY.items.map(i => ({ itemId: i.id })) });
    if (opts) cv.opts = Object.assign({}, cv.opts, opts);
    return { cv, items: DUMMY.items };
  }

  return { render, parse, esc, buildModel, BUILTIN, allTemplates, findTemplate, renderDocument, plainText, dummyCV, BASE_CSS, ageFromDob };
});
