'use strict';
const { atsNorm } = require('./ats-text');
// Every operation the UI can request. Pure Node (no Electron imports) so it can be tested headlessly.
// ctx = { ws, secrets, engine, openWorkspace(folder), pickSavePath?, platform }
const fs = require('fs');
const path = require('path');
const M = require('./model');
const T = require('./templates');
const ST = require('./storage');
const { safeName } = ST;
const Sim = require('./similarity');
const Imp = require('./importer');
const AI = require('./ai');
const NET = require('./net');
const G = require('./guards');
const Exp = require('./exporters');

function stamp() { return new Date().toISOString().slice(0, 10); }

function createApi(ctx) {
  const need = () => { if (!ctx.ws) throw new Error('No working folder is open yet.'); return ctx.ws; };
  const customTpls = () => need().listCustomTemplates();
  const cvAndItems = (cvOrId) => {
    const ws = need();
    const cv = typeof cvOrId === 'string' ? ws.getCV(cvOrId) : cvOrId;
    if (!cv) throw new Error('CV not found');
    return { cv, items: ws.listItems() };
  };
  // an exported HTML file opened on screen: the page margins and a white sheet on a grey desk (printing still uses the page's own margins)
  const withScreenMargins = (html, page) => html.replace('</head>', '<style>@media screen{html{background:#e9ebef}body{box-sizing:border-box!important;width:' + page.w + '!important;max-width:100%!important;min-height:' + page.h + ';margin:18px auto!important;padding:' + page.margin + 'mm!important;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.18)}}</style></head>');
  const htmlFor = (cv, items, mode) => T.renderDocument(cv, items, need().getSettings(), customTpls(), { mode });

  const api = {
    // ---------- workspace ----------
    'app.about': async () => { let v = ''; try { v = require('../../package.json').version; } catch (e) { /* ignore */ } return { version: v, platform: ctx.platform || process.platform, node: process.versions.node, electron: process.versions.electron || '' }; },
    'workspace.state': async () => ctx.ws ? { root: ctx.ws.base || ctx.ws.root, settings: ctx.ws.getSettings(), platform: ctx.platform || process.platform } : { root: null },
    'workspace.open': async ({ folder }) => { await ctx.openWorkspace(folder); return api['workspace.state'](); },
    'profiles.list': async () => { const ws = need(); return ST.profileList(ws.base || ws.root); },
    'profiles.switch': async ({ id }) => { const ws = need(); const base = ws.base || ws.root; ST.setActiveProfile(base, id); ctx.ws = ST.openWithProfiles(base); return api['workspace.state'](); },
    'profiles.create': async ({ name, from }) => { const ws = need(); const base = ws.base || ws.root; const id = ST.createProfile(base, name, from); ST.setActiveProfile(base, id); ctx.ws = ST.openWithProfiles(base); return { id }; },
    'profiles.rename': async ({ id, name }) => { const ws = need(); const base = ws.base || ws.root; ST.renameProfile(base, id, name); if (ws.profileId === id) ctx.ws = ST.openWithProfiles(base); return true; },
    'profiles.delete': async ({ id }) => { const ws = need(); const base = ws.base || ws.root; const wasActive = ws.profileId === id; ST.deleteProfile(base, id); if (wasActive) ctx.ws = ST.openWithProfiles(base); return true; },
    'profiles.options': async () => { const ws = need(); const out = {}; for (const p of ST.profileList(ws.base || ws.root).list) for (const k of ['name', 'headline', 'email', 'phone', 'address', 'gender']) { const v = (p.header[k] || '').trim(); if (v) { out[k] = out[k] || []; if (!out[k].includes(v)) out[k].push(v); } } return out; },
    // The window reports unexpected errors here so they end up in the log file (text only, trimmed and cleaned).
    'app.logError': async ({ message, source }) => { if (ctx.log) ctx.log.warn('renderer', G.redact(String(message || '')).slice(0, 600), G.redact(String(source || '')).slice(0, 200)); return true; },
    // Files that were recovered or are newer than this app; returned once, then cleared.
    'workspace.notices': async () => need().takeNotices(),
    'workspace.snapshot': async () => need().snapshot('manual'),
    'workspace.backups': async () => need().listBackups(),
    'workspace.backupInfo': async () => need().backupInfo(),
    'workspace.deleteBackup': async ({ name }) => need().deleteBackup(name),
    'workspace.restoreBackup': async ({ name }) => need().restoreBackup(name),
    'workspace.exportAll': async () => {
      const ws = need(); const f = ws.p('exports', 'repository_' + stamp() + '.json');
      fs.writeFileSync(f, JSON.stringify(ws.exportAll(), null, 2)); return { file: f };
    },
    'workspace.importAll': async ({ file, merge }) => need().importAll(JSON.parse(fs.readFileSync(file, 'utf8')), merge !== false),

    // ---------- settings ----------
    'settings.get': async () => need().getSettings(),
    'settings.set': async (patch) => need().setSettings(patch),

    // ---------- items ----------
    'items.list': async () => need().listItems(),
    'items.save': async (item) => need().saveItem(item),
    'items.saveMany': async ({ items }) => need().saveItems(items),
    'items.delete': async ({ id }) => need().deleteItem(id),
    'items.deleteMany': async ({ ids }) => { for (const id of ids) need().deleteItem(id); return true; },
    'items.star': async ({ ids, starred }) => { const ws = need(); return ids.map(id => { const it = ws.getItem(id); return it ? ws.saveItem(Object.assign({}, it, { starred: starred !== false })) : null; }); },
    'items.archive': async ({ ids, archived }) => { const ws = need(); return ids.map(id => { const it = ws.getItem(id); return it ? ws.saveItem(Object.assign({}, it, { archived: archived !== false })) : null; }); },
    'items.addVersion': async ({ id, text, source, label }) => {
      const ws = need(); const it = ws.getItem(id); if (!it) throw new Error('Item not found');
      const v = { id: M.uid('v'), text: String(text).trim(), source: source || 'manual', label: label || '', created: new Date().toISOString() };
      if (!v.text) throw new Error('Version text is empty');
      it.versions = (it.versions || []).concat([v]); ws.saveItem(it); return { item: it, version: v };
    },
    'items.addVersions': async ({ id, texts, source, label }) => {
      const ws = need(); const it = ws.getItem(id); if (!it) throw new Error('Item not found');
      const vs = texts.map(t => ({ id: M.uid('v'), text: String(t).trim(), source: source || 'ai', label: label || '', created: new Date().toISOString() })).filter(v => v.text);
      it.versions = (it.versions || []).concat(vs); ws.saveItem(it); return it;
    },
    'items.setMain': async ({ id, versionId }) => { const ws = need(); const it = ws.getItem(id); it.mainVersion = versionId || null; return ws.saveItem(it); },
    'items.editVersion': async ({ id, versionId, text }) => {
      const ws = need(); const it = ws.getItem(id);
      if (!versionId) it.text = text; else { const v = it.versions.find(x => x.id === versionId); if (v) v.text = text; }
      return ws.saveItem(it);
    },
    'items.deleteVersion': async ({ id, versionId }) => {
      const ws = need(); const it = ws.getItem(id);
      it.versions = (it.versions || []).filter(v => v.id !== versionId);
      if (it.mainVersion === versionId) it.mainVersion = null;
      for (const cv of ws.cvs.values()) { let ch = false; for (const s of cv.selected) if (s.versionId === versionId) { s.versionId = null; ch = true; } if (ch) ws.saveCV(cv, true); }
      return ws.saveItem(it);
    },
    // promote a version to be the original text (swap)
    'items.promoteVersion': async ({ id, versionId }) => {
      const ws = need(); const it = ws.getItem(id); const v = it.versions.find(x => x.id === versionId);
      if (!v) throw new Error('Version not found');
      const old = it.text; it.text = v.text; v.text = old; v.source = 'manual'; v.label = 'previous original';
      if (it.mainVersion === versionId) it.mainVersion = null;
      return ws.saveItem(it);
    },

    // ---------- trash ----------
    'trash.list': async () => need().listTrash(),
    'trash.cvs': async () => need().listTrashCvs(),
    'trash.purge': async ({ kind, id }) => need().purge(kind, id),
    'trash.restore': async ({ kind, id }) => need().restore(kind, id),
    'trash.empty': async () => need().emptyTrash(),

    // ---------- Refine: apply what the AI proposed ----------
    'refine.apply': async ({ changes, removes, newSkills }) => {
      const ws = need(); const valid = new Set(M.TYPES.map(t => t.key)); let typed = 0, vers = 0, removed = 0, skillsMade = 0, assigned = 0;
      for (const r of removes || []) { const k = ws.getItem(r.keep), o = ws.getItem(r.other); if (!k || !o) continue; if (r.nest) { k.versions = (k.versions || []).concat([{ id: M.uid('v'), text: M.itemText(o), source: 'merged', label: 'merged from duplicate', created: new Date().toISOString() }]).concat((o.versions || []).map(v => Object.assign({}, v, { id: M.uid('v') }))); ws.saveItem(k); } ws.deleteItem(r.other); removed++; }
      const have = new Map(ws.listItems().filter(i => i.type === 'skill').map(i => [String(i.title || '').toLowerCase(), i]));
      for (const sk of newSkills || []) { const key = String(sk.name || '').trim().toLowerCase(); if (!key || have.has(key)) continue; const it = M.newItem({ type: 'skill', title: sk.name.trim(), extra: { category: sk.category || 'Other' }, source: 'refine' }); ws.saveItem(it); have.set(key, it); skillsMade++; }
      for (const c of changes || []) {
        const it = ws.getItem(c.id); if (!it) continue; let dirty = false;
        if (c.type && valid.has(c.type) && c.type !== it.type && c.type !== 'skill') { it.type = c.type; typed++; dirty = true; }
        const known = new Set([M.itemText(it)].concat((it.versions || []).map(v => v.text)).map(t => String(t).trim().toLowerCase()));
        const add = (c.versions || []).map(t => String(t).trim()).filter(t => t && !known.has(t.toLowerCase())).slice(0, 2);
        if (add.length) { it.versions = (it.versions || []).concat(add.map(t => ({ id: M.uid('v'), text: t, source: 'ai', label: 'refine', created: new Date().toISOString() }))); vers += add.length; dirty = true; }
        const sk = [...new Set([...(it.skills || []), ...(c.skills || [])])]; if (sk.length !== (it.skills || []).length) { assigned += sk.length - (it.skills || []).length; it.skills = sk; dirty = true; }
        if (dirty) ws.saveItem(it);
      }
      return { typed, vers, removed, skillsMade, assigned };
    },

    // ---------- duplicates ----------
    'dup.find': async () => {
      const ws = need(); const dismissed = ws.getSettings().dismissedPairs || [];
      return Sim.findDuplicates(ws.listItems(), dismissed).slice(0, 200);
    },
    'dup.resolve': async ({ keep, other, action, key }) => {
      const ws = need(); const k = ws.getItem(keep), o = ws.getItem(other);
      if (action === 'dismiss' || action === 'both') {
        const d = (ws.getSettings().dismissedPairs || []).concat([key || Sim.pairKey(keep, other)]);
        ws.setSettings({ dismissedPairs: Array.from(new Set(d)) }); return { ok: true };
      }
      if (!k || !o) throw new Error('Item no longer exists');
      if (action === 'nest') {
        const vs = [{ id: M.uid('v'), text: M.itemText(o), source: 'merged', label: 'merged from duplicate', created: new Date().toISOString() }]
          .concat((o.versions || []).map(v => Object.assign({}, v, { id: M.uid('v'), source: v.source || 'merged' })));
        const have = new Set([k.text].concat((k.versions || []).map(v => v.text)));
        k.versions = (k.versions || []).concat(vs.filter(v => v.text && !have.has(v.text)));
        // keep the other item's metadata where ours is blank
        for (const f of ['org', 'role', 'title', 'location', 'start', 'end', 'link']) if (!k[f] && o[f]) k[f] = o[f];
        k.tags = Array.from(new Set((k.tags || []).concat(o.tags || []))); k.skills = Array.from(new Set((k.skills || []).concat(o.skills || [])));
        if (!k.proof && o.proof) k.proof = o.proof;
        ws.saveItem(k);
      }
      // repoint CV selections from the removed item to the kept one
      for (const cv of ws.cvs.values()) {
        const hasK = cv.selected.some(s => s.itemId === keep); let ch = false;
        cv.selected = cv.selected.filter(s => { if (s.itemId !== other) return true; ch = true; if (hasK) return false; s.itemId = keep; s.versionId = null; return true; });
        if (ch) ws.saveCV(cv, true);
      }
      ws.deleteItem(other, { mergedInto: keep });
      return { ok: true, kept: ws.getItem(keep) };
    },

    // ---------- CVs ----------
    'cv.list': async () => need().listCVs(),
    'cv.get': async ({ id }) => need().getCV(id),
    'cv.save': async (cv) => need().saveCV(cv),
    'cv.create': async (p) => {
      const ws = need(); const s = ws.getSettings();
      const cv = M.newCV(Object.assign({ header: JSON.parse(JSON.stringify(s.header || {})) }, p || {}));
      if (p && p.name == null) cv.name = 'New CV ' + stamp();
      return ws.saveCV(cv);
    },
    'cv.delete': async ({ id }) => need().deleteCV(id),
    'cv.duplicate': async ({ id }) => need().duplicateCV(id),
    'cv.filePath': async ({ id }) => { const ws = need(); if (!ws.cvs.get(id)) throw new Error('CV not found'); return { file: ws.p('cvs', id + '.json') }; },
    'cv.html': async ({ id, mode }) => { const { cv, items } = cvAndItems(id); return htmlFor(cv, items, mode || 'preview'); },

    'cv.usage': async () => { const ws = need(); const out = {}; for (const cv of ws.cvs.values()) for (const sel of cv.selected) (out[sel.itemId] = out[sel.itemId] || []).push({ id: cv.id, name: cv.name }); return out; },

    // ---------- optional internet helpers (only run when the user clicks) ----------
    'net.checkUrl': async ({ url }) => {
      try { await NET.assertPublicUrl(url); } catch (e) { return { status: 0, ok: false, error: e.message }; }
      try { let r = await NET.safeFetch(url, { method: 'HEAD', timeout: 15000 }); if (r.status === 405 || r.status === 403) r = await NET.safeFetch(url, { method: 'GET', timeout: 15000 }); return { status: r.status, ok: r.ok, finalUrl: r.url || url }; }
      catch (e) { return { status: 0, ok: false, error: e.name === 'AbortError' ? 'timed out' : 'could not connect' }; }
    },
    'net.fetchText': async ({ url }) => {
      const r = await NET.safeFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 CVBuilder' }, timeout: 20000 });
      if (!r.ok) throw new Error('The page returned ' + r.status + '. Paste the text instead.');
      const html = await NET.readText(r, 2000000);
      return { text: html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|li|h\d|br)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 20000) };
    },

    // ---------- application tracker ----------
    'applications.list': async () => { const f = need().p('applications.json'); try { const l = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(l) ? l.filter(a => a && typeof a === 'object' && !Array.isArray(a)) : []; } catch (e) { return []; } },
    'applications.save': async ({ list }) => { if (!Array.isArray(list)) throw new Error('The application list is not valid.'); require('./storage').writeJson(need().p('applications.json'), list.filter(a => a && typeof a === 'object' && !Array.isArray(a))); return true; },

    // ---------- links: name + site logo (favicon) fetched on request ----------
    'link.meta': async ({ url }) => {
      let u = String(url || '').trim(); if (!u) throw new Error('Paste a link first.'); if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
      const host = new URL(u).hostname.replace(/^www\./, '');
      const KNOWN = { 'linkedin.com': 'LinkedIn', 'github.com': 'GitHub', 'naukri.com': 'Naukri', 'twitter.com': 'Twitter', 'x.com': 'X', 'behance.net': 'Behance', 'kaggle.com': 'Kaggle', 'medium.com': 'Medium', 'leetcode.com': 'LeetCode', 'stackoverflow.com': 'Stack Overflow', 'dribbble.com': 'Dribbble', 'youtube.com': 'YouTube', 'instagram.com': 'Instagram', 'indeed.com': 'Indeed', 'glassdoor.com': 'Glassdoor' };
      const root = host.split('.').slice(-2).join('.');
      const name = KNOWN[root] || (root.split('.')[0].charAt(0).toUpperCase() + root.split('.')[0].slice(1));
      const grab = async (href) => { try { const r = await NET.safeFetch(href, { timeout: 4000 }); if (!r.ok) return ''; const ct = (r.headers.get('content-type') || '').split(';')[0] || 'image/x-icon'; if (!/^image\//i.test(ct)) return ''; const buf = Buffer.from(await r.arrayBuffer()); if (!buf.length || buf.length > 200000) return ''; return 'data:' + ct + ';base64,' + buf.toString('base64'); } catch (e) { return ''; } };
      let logo = '';
      try { const r = await NET.safeFetch('https://' + host + '/', { timeout: 5000 }); const html = (await NET.readText(r, 60000)); const links = [...html.matchAll(/<link[^>]+rel=["']([^"']*icon[^"']*)["'][^>]*>/gi)].map(m => { const href = /href=["']([^"']+)["']/i.exec(m[0]); return href ? { rel: m[1].toLowerCase(), href: new URL(href[1], r.url || ('https://' + host + '/')).toString() } : null; }).filter(Boolean); links.sort((a, b) => (/apple-touch/.test(b.rel) ? 1 : 0) - (/apple-touch/.test(a.rel) ? 1 : 0)); for (const l of links.slice(0, 3)) { logo = await grab(l.href); if (logo) break; } } catch (e) { /* try the defaults */ }
      if (!logo) logo = await grab('https://' + host + '/favicon.ico');
      if (!logo) logo = await grab('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64');
      return { name, url: u, logo };
    },

    // ---------- job descriptions (stored in the working folder, plain files) ----------
    'jd.add': async ({ name, file, b64, text }) => {
      const ws = need(); let base = safeName(name || (text ? 'Job description.txt' : path.basename(file || 'jd.txt')));
      if (text != null && !/\.(txt|md)$/i.test(base)) base += '.txt';
      let out = base, n = 2; while (fs.existsSync(ws.p('jds', out))) { const e = path.extname(base); out = path.basename(base, e) + '_' + (n++) + e; }
      if (text != null) fs.writeFileSync(ws.p('jds', out), String(text), 'utf8'); else if (file) fs.copyFileSync(file, ws.p('jds', out)); else fs.writeFileSync(ws.p('jds', out), Buffer.from(b64, 'base64'));
      return { file: out, name: out };
    },
    'jd.path': async ({ file }) => need().p('jds', path.basename(file)),
    'jd.text': async ({ file }) => { const f = need().p('jds', path.basename(file)); const ext = path.extname(f).toLowerCase(); if (ext === '.txt' || ext === '.md') return { text: fs.readFileSync(f, 'utf8') }; return { text: Imp.rawTextOf(await Imp.extractText(f)) }; },
    'jd.delete': async ({ file }) => { try { fs.unlinkSync(need().p('jds', path.basename(file))); } catch (e) { /* ignore */ } return true; },
    'cv.plainText': async ({ id }) => { const { cv, items } = cvAndItems(id); const h = cv.header || {}; const lines = [[h.name, h.headline].filter(Boolean).join(' - ')]; for (const s of cv.selected || []) { const b = items.find ? items.find(i => i.id === s.itemId) : null; const it = b || (Array.isArray(items) ? null : items[s.itemId]); if (it) lines.push('- ' + [it.role, it.org].filter(Boolean).join(', ') + ': ' + (s.override || M.itemText(Object.assign({}, it, s.own || {}), s.versionId))); } return { text: lines.join('\n') }; },

    // ---------- cover letter ----------
    'letter.export': async ({ header, recipient, company, role, subject, body, format, accent }) => {
      const ws = need(); const T2 = require('./templates'); const esc = T2.esc;
      const base = safeName('Cover letter_' + (company || 'draft') + '_' + stamp());
      const dir = ws.p('exports', base); fs.mkdirSync(dir, { recursive: true }); const files = [];
      const paras = String(body || '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
      const contact = [header.email, header.phone, header.address].filter(Boolean).join(' | ');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(base)}</title><style>@page{size:A4;margin:22mm}body{font-family:Calibri,Carlito,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111;font-variant-ligatures:none}h1{font-size:18pt;margin:0;color:${esc(accent || '#1f4e79')}}p{margin:0 0 9pt}.ct{color:#444;margin-bottom:18pt}</style></head><body><h1>${esc(header.name || '')}</h1><p class="ct">${esc(contact)}</p><p>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>${recipient ? `<p>${esc(recipient)}${company ? '<br>' + esc(company) : ''}</p>` : ''}${subject ? `<p><b>${esc(subject)}</b></p>` : ''}${paras.map(x => '<p>' + esc(x).replace(/\n/g, '<br>') + '</p>').join('')}</body></html>`;
      if (format === 'pdf') { const f = path.join(dir, base + '.pdf'); fs.writeFileSync(f, await ctx.engine.pdf(html, { pageSize: 'A4' })); files.push(f); }
      else if (format === 'html') { const f = path.join(dir, base + '.html'); fs.writeFileSync(f, html); files.push(f); }
      else if (format === 'docx') {
        const D = require('docx'); const f = path.join(dir, base + '.docx');
        const P = (t, o) => new D.Paragraph({ spacing: { after: 160 }, children: [new D.TextRun(Object.assign({ text: t, font: 'Calibri', size: 22 }, o || {}))] });
        const kids = [P(header.name || '', { bold: true, size: 36 }), P(contact), P(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))];
        if (recipient) kids.push(P(recipient + (company ? ', ' + company : ''))); if (subject) kids.push(P(subject, { bold: true })); for (const x of paras) kids.push(P(x));
        fs.writeFileSync(f, await D.Packer.toBuffer(new D.Document({ sections: [{ children: kids }] }))); files.push(f);
      } else throw new Error('Unknown format');
      return { files, dir };
    },

    // ---------- templates ----------
    'templates.list': async () => T.allTemplates(customTpls()).map(t => ({ id: t.id, name: t.name, ats: t.custom ? (t.ats || 'unchecked') : t.ats, description: t.description || '', custom: !!t.custom })),
    'templates.get': async ({ id }) => T.findTemplate(id, customTpls()),
    'templates.save': async (t) => need().saveTemplate(t),
    'templates.delete': async ({ id }) => need().deleteTemplate(id),

    // ---------- skills ----------
    'skills.set': async ({ name, category, level, years }) => {
      const ws = need(); const cur = Object.assign({}, ws.getSettings().skills || {});
      cur[name] = Object.assign({}, cur[name] || {}, { category, level, years });
      ws.setSettings({ skills: cur }); return cur;
    },

    // ---------- attachments ----------
    'attachments.add': async ({ src }) => ({ name: need().addAttachment(src) }),
    'attachments.addBuffer': async ({ name, b64 }) => ({ name: need().addAttachmentBuffer(name, Buffer.from(b64, 'base64')) }),
    'attachments.path': async ({ name }) => need().p('attachments', path.basename(name)),


    'import.path': async ({ name }) => need().p('imports', path.basename(name)),

    // ---------- push every line of a CV into the repository (skips lines that already exist) ----------
    'cv.pushToRepo': async ({ id }) => {
      const ws = need(); const cv = ws.getCV(id); if (!cv) throw new Error('CV not found');
      const items = ws.listItems(); const byId = {}; for (const it of items) byId[it.id] = it;
      const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
      const have = new Set(); for (const it of items) for (const t of [it.text].concat((it.versions || []).map(v => v.text))) if (t) have.add(norm(it.org) + '|' + norm(t));
      let created = 0, skipped = 0; const ids = [];
      for (const s of cv.selected) {
        const base = byId[s.itemId]; if (!base) continue;
        const eff = Object.assign({}, base, s.own || {});
        const text = s.override ? s.override : M.itemText(eff, s.versionId);
        if (!text || have.has(norm(eff.org) + '|' + norm(text))) { skipped++; continue; }
        const it = M.newItem({ type: eff.type, text, title: eff.title, org: eff.org, role: eff.role, location: eff.location, start: eff.start, end: eff.end, tags: (eff.tags || []).slice(), skills: (eff.skills || []).slice(), extra: Object.assign({}, eff.extra || {}), source: 'CV: ' + cv.name });
        ws.saveItem(it); have.add(norm(it.org) + '|' + norm(text)); created++; ids.push(it.id);
      }
      return { created, skipped, ids };
    },

    // ---------- stored LinkedIn profiles (from the LinkedIn data export) ----------
    'liprofiles.list': async () => { const ws = need(); const d = ws.p('linkedin'); return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => (b.created || '').localeCompare(a.created || '')); },
    'liprofiles.save': async ({ name, itemIds, header }) => { const ws = need(); const rec = { id: M.uid('lp'), name, itemIds: itemIds || [], header: header || {}, created: new Date().toISOString() }; fs.writeFileSync(ws.p('linkedin', rec.id + '.json'), JSON.stringify(rec, null, 2)); return rec; },
    'liprofiles.delete': async ({ id }) => { try { fs.unlinkSync(need().p('linkedin', path.basename(id) + '.json')); } catch (e) { /* ignore */ } return true; },

    // ---------- import ----------
    'import.file': async ({ file }) => {
      const ws = need();
      const res = await Imp.importFile(file, ws.listItems());
      const copy = Date.now() + '_' + safeName(path.basename(file));
      try { fs.copyFileSync(file, ws.p('imports', copy)); res.stored = copy; } catch (e) { /* ignore */ }
      for (const c of res.candidates || []) { c.stored = res.stored || ''; c.source = c.source || path.basename(file); }
      return res;
    },
    'import.buffer': async ({ name, b64 }) => {
      const ws = need(); const tmp = ws.p('imports', Date.now() + '_' + safeName(name));
      const bytes = Buffer.from(String(b64 || ''), 'base64'); if (bytes.length > Imp.MAX_FILE_BYTES) throw new Error('That file is too large to import (limit ' + Math.round(Imp.MAX_FILE_BYTES / 1048576) + ' MB).');
      fs.writeFileSync(tmp, bytes);
      const res = await Imp.importFile(tmp, ws.listItems()); res.stored = path.basename(tmp); for (const c of res.candidates || []) { c.stored = res.stored; c.source = c.source || name; } return res;
    },
    'import.text': async ({ text }) => Imp.importPastedText(text, need().listItems()),
    'import.commit': async ({ candidates, applyHeader, header }) => {
      const ws = need(); const created = []; let nested = 0, skipped = 0;
      for (const c of candidates) {
        if (c.action === 'skip') { skipped++; continue; }
        if (c.action === 'nest' && c.dupOf && ws.getItem(c.dupOf)) {
          const it = ws.getItem(c.dupOf); const have = new Set([it.text].concat((it.versions || []).map(v => v.text)));
          if (c.text && !have.has(c.text)) { it.versions = (it.versions || []).concat([{ id: M.uid('v'), text: c.text, source: 'import', label: 'from ' + (c.source || 'import'), created: new Date().toISOString() }]); ws.saveItem(it); }
          nested++; continue;
        }
        const it = M.newItem({ type: c.type || 'initiative', text: c.text || '', title: c.title || '', org: c.org || '', role: c.role || '', location: c.location || '', start: c.start || '', end: c.end || '', tags: c.tags || [], extra: c.extra || {}, link: c.link || '', source: c.source || '', sourceFile: c.stored || '', skills: c.skills || [] });
        if (!it.text && !it.title) { skipped++; continue; }
        created.push(ws.saveItem(it).id);
      }
      if (applyHeader && header) ws.setSettings({ header: Object.assign({}, ws.getSettings().header, Object.fromEntries(Object.entries(header).filter(([k, v]) => v && (!ws.getSettings().header[k] || (Array.isArray(v) && v.length))))) });
      return { created: created.length, nested, skipped, ids: created };
    },

    // ---------- AI ----------
    'ai.prepare': async ({ task, payload }) => AI.prepare(task, payload, need().getSettings()),
    'ai.run': async ({ task, payload, provider }) => {
      const s = need().getSettings();
      const r = await AI.run(task, Object.assign({ header: s.header }, payload), s, (id) => ctx.secrets.get(id), provider);
      if (task === 'rephrase') r.versions = AI.rephraseResult(r);
      return r;
    },
    'ai.keys': async () => { const st = need().getSettings(); const out = []; for (const [id, p] of Object.entries(st.ai.providers)) { if (!p.needsKey) continue; const k = await ctx.secrets.get(id); out.push({ provider: id, label: p.label, set: !!k, masked: k ? (k.length > 10 ? k.slice(0, 4) + '\u2026' + k.slice(-4) : '\u2022\u2022\u2022\u2022') : '' }); } return { keys: out, file: ctx.secrets.file ? ctx.secrets.file() : '' }; },
    'ai.revealKey': async ({ provider }) => ({ key: await ctx.secrets.get(provider) }),
    'ai.deleteKey': async ({ provider }) => { await ctx.secrets.set(provider, ''); return true; },
    'ai.ollamaStop': async () => { const p = need().getSettings().ai.providers.local; const base = p.baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, ''); const r = await fetch(base + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: p.model, keep_alive: 0 }) }); if (!r.ok) throw new Error('Ollama answered ' + r.status); return true; },
    'ai.models': async ({ provider }) => { const p = need().getSettings().ai.providers[provider]; return AI.listModels(p, p.needsKey ? await ctx.secrets.get(provider) : ''); },
    'ai.setKey': async ({ provider, key }) => { await ctx.secrets.set(provider, key); return true; },
    'ai.hasKey': async ({ provider }) => !!(await ctx.secrets.get(provider)),
    'ai.test': async ({ provider }) => {
      const p = need().getSettings().ai.providers[provider];
      const out = await AI.chat(p, p.needsKey ? await ctx.secrets.get(provider) : '', [{ role: 'user', content: 'Reply with the single word: ok' }], { maxTokens: 400, timeoutMs: p.remote ? 45000 : 90000 });
      return { reply: String(out).slice(0, 60) };
    },

    // ---------- export ----------
    // (the HTML file is the print layout; on a screen it needs the page's margins and a sheet, or the text touches the window edge)
    'export.run': async ({ id, format, saveAs, scale }) => {
      const ws = need(); const { cv, items } = cvAndItems(id);
      const base = safeName((cv.name || 'CV') + '_' + stamp());
      const dir = ws.p('exports', base); fs.mkdirSync(dir, { recursive: true });
      const files = [];
      const page = T.buildModel(cv, items, ws.getSettings()).page;
      if (format === 'pdf') { const buf = await ctx.engine.pdf(htmlFor(cv, items, 'print'), { pageSize: page.size }); const f = path.join(dir, base + '.pdf'); fs.writeFileSync(f, buf); files.push(f); }
      else if (format === 'png') { const pages = await ctx.engine.png(htmlFor(cv, items, 'png'), { pageSize: page.size, scale: scale || 2, pageW: page.wpx, pageH: page.hpx }); const f = path.join(dir, base + '.png'); fs.writeFileSync(f, pages[0]); files.push(f); }
      else if (format === 'docx') { const f = path.join(dir, base + '.docx'); fs.writeFileSync(f, await Exp.buildDocx(cv, items, ws.getSettings())); files.push(f); }
      else if (format === 'html') { const f = path.join(dir, base + '.html'); fs.writeFileSync(f, withScreenMargins(htmlFor(cv, items, 'print'), page)); files.push(f); }
      else if (format === 'json') { const f = path.join(dir, base + '.json'); fs.writeFileSync(f, JSON.stringify(Exp.nativeCvExport(cv, items), null, 2)); files.push(f); }
      else if (format === 'jsonresume') { const f = path.join(dir, base + '.resume.json'); fs.writeFileSync(f, JSON.stringify(Exp.toJsonResume(cv, items, ws.getSettings()), null, 2)); files.push(f); }
      else throw new Error('Unknown export format: ' + format);
      let saved = null;
      if (saveAs && ctx.pickSavePath && files.length) {
        const dest = await ctx.pickSavePath(path.basename(files[0]), files.length > 1);
        if (dest) { saved = []; if (files.length === 1) { fs.copyFileSync(files[0], dest); saved.push(dest); } else { fs.mkdirSync(dest, { recursive: true }); for (const f of files) { const d = path.join(dest, path.basename(f)); fs.copyFileSync(f, d); saved.push(d); } } }
      }
      return { files, saved, dir };
    },
    'export.copyFile': async ({ file }) => (ctx.copyFileToClipboard ? ctx.copyFileToClipboard(file) : Promise.reject(new Error('Copying files to the clipboard is only available in the desktop app.'))),
    // Render a CV to a PDF (cached in exports/_cache) for drag-out and Copy
    'export.quickPdf': async ({ id }) => {
      const ws = need(); const { cv, items } = cvAndItems(id);
      const dir = ws.p('exports', '_drag'); fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, safeName(cv.name || 'CV') + '.pdf');
      const page = T.buildModel(cv, items, ws.getSettings()).page;
      fs.writeFileSync(f, await ctx.engine.pdf(htmlFor(cv, items, 'print'), { pageSize: page.size }));
      return { file: f };
    },
    'export.pageCount': async ({ id }) => { const { cv, items } = cvAndItems(id); const page = T.buildModel(cv, items, need().getSettings()).page; return ctx.engine.pages ? ctx.engine.pages(htmlFor(cv, items, 'print'), { pageSize: page.size }) : null; },

    // ---------- ATS check ----------
    'ats.check': async ({ id }) => {
      const ws = need(); const { cv, items } = cvAndItems(id);
      const page = T.buildModel(cv, items, ws.getSettings()).page;
      const buf = await ctx.engine.pdf(htmlFor(cv, items, 'print'), { pageSize: page.size });
      const src = await Imp.pdfLines(buf);
      const rowText = src.lines.map(l => l.cells.map(c => c.text).join(' ')).join('\n');
      const text = (await Imp.pdfStreamText(buf)).replace(/[ \t]+\n/g, '\n'); const flat = text.replace(/\s+/g, ' ');
      const norm = s => String(s).replace(/\s+/g, ' ').replace(/[\u2018\u2019]/g, "'").replace(/(\w)-\s+(?=\w)/g, '$1-').trim(); // a line break after a hyphen is normal
      const nflat = norm(flat); const lflat = atsNorm(flat);   // item lines are compared without regard to capitals (a template may print them in capitals; that reads fine)
      const model = T.buildModel(cv, items, ws.getSettings());
      const problems = []; const passed = [];
      const tpl = T.findTemplate(cv.templateId, customTpls());
      if (model.header.name) (nflat.includes(norm(model.header.name)) ? passed : problems).push(nflat.includes(norm(model.header.name)) ? 'Name is read as one piece of text.' : 'Your name is not extracted cleanly (check fonts, letter-spacing, or text effects).');
      if (model.header.email) (nflat.includes(model.header.email) ? passed : problems).push(nflat.includes(model.header.email) ? 'Email is machine-readable.' : 'Email is not extracted intact.');
      let last = -1, orderOk = true, headOk = true;
      for (const s of model.sections) { const i = nflat.toLowerCase().indexOf(s.label.toLowerCase()); if (i < 0) { headOk = false; problems.push('Heading not found in extracted text: ' + s.label); } else { if (i < last) orderOk = false; last = i; } }
      if (headOk) passed.push('All section headings are found as plain text.');
      if (!orderOk) problems.push('Sections come out in a different order than they appear. A two-column layout is likely the cause.');
      let broken = 0; const brokenItems = [];
      for (const r of cv.selected) { const it = items.find(i => i.id === r.itemId); if (!it) continue; const raw = r.override || M.itemText(it, r.versionId); const t = atsNorm(raw); if (t && !lflat.includes(t)) { broken++; if (brokenItems.length < 30) brokenItems.push(String(raw).slice(0, 400)); } }
      if (broken) problems.push(broken + ' line item(s) do not extract as continuous text (they are split or reordered by the layout).'); else passed.push('Every line item extracts as continuous text.');
      const nrow = atsNorm(rowText); let rowBroken = 0;
      for (const r of cv.selected) { const it = items.find(i => i.id === r.itemId); if (!it) continue; const t = atsNorm(r.override || M.itemText(it, r.versionId)); if (t && !nrow.includes(t)) rowBroken++; }
      const warnings = [];
      if (!broken && rowBroken) warnings.push(rowBroken + ' wrapped line item(s) are interleaved with neighbouring columns when read strictly row by row. Most parsers read in stream order and are fine, but a single-column template avoids the risk.');
      const spaced = (text.match(/\b(?:[A-Za-z] ){4,}[A-Za-z]\b/g) || []).length;
      if (spaced) problems.push('Letter-spaced text detected; some parsers read it as separate letters.');
      if (tpl.ats === 'tolerant') problems.push('This is a multi-column template. Use a single-column template for online applications.');
      return { ok: problems.length === 0, problems, warnings, passed, brokenItems, text, template: tpl.name, atsClass: tpl.ats || 'unchecked' };
    },

    // ---------- template critique helper (rendered page image + extracted text) ----------
    'template.snapshot': async ({ id }) => {
      const { cv, items } = cvAndItems(id); const ws = need();
      const page = T.buildModel(cv, items, ws.getSettings()).page;
      const pages = await ctx.engine.png(htmlFor(cv, items, 'png'), { pageSize: page.size, scale: 1, pageW: page.wpx, pageH: page.hpx });
      const pdf = await ctx.engine.pdf(htmlFor(cv, items, 'print'), { pageSize: page.size });
      const src = await Imp.pdfLines(pdf);
      return { image: pages[0].toString('base64'), text: src.lines.map(l => l.cells.map(c => c.text).join(' ')).join('\n') };
    }
  };
  return require('./api-schema').withValidation(api);
}

module.exports = { createApi };
