'use strict';
const fs = require('fs');
const path = require('path');
const M = require('./model');
const G = require('./guards');

const DIRS = ['quarantine', 'jds', 'items', 'cvs', 'exports', 'imports', 'templates', 'attachments', 'backups', 'trash/items', 'trash/cvs', 'linkedin'];
const SCHEMA = 1;
const TRASH_DAYS = 30;
const MAX_AUTO = 48, MAX_MANUAL = 15, AUTO_DAYS = 2;

// Ids end up in file names, so only a plain allow-list is accepted. Anything else (../, slashes, dots, empty) is refused.
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
function assertId(id, what) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('Invalid ' + (what || 'id') + '.');
  return id;
}

// Turns low-level file errors into sentences a person can act on.
function friendlyFsError(e, what) {
  const code = e && e.code;
  const why = code === 'ENOSPC' ? 'the disk is full'
    : code === 'EACCES' || code === 'EPERM' || code === 'EROFS' ? 'the folder is read-only or protected'
    : code === 'ENOENT' ? 'the folder no longer exists (was a drive disconnected?)'
    : code === 'EBUSY' ? 'the file is in use by another program'
    : code === 'ENAMETOOLONG' ? 'the name is too long' : '';
  const err = new Error('Could not save ' + (what || 'your changes') + (why ? ': ' + why + '.' : '.') + ' Nothing was lost; your previous data is intact.');
  err.code = code; err.cause = e;
  return err;
}

// Writes to a temporary file first, then renames, so a crash never leaves a half-written file behind.
function writeJson(file, data) {
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* nothing to clean */ }
    throw friendlyFsError(e, path.basename(file));
  }
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
// Like readJson, but tells a missing file apart from a damaged one: { ok, data, missing }.
function readJsonStrict(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return { ok: false, missing: e.code === 'ENOENT', error: e }; }
  try { return { ok: true, data: JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw) }; } catch (e) { return { ok: false, missing: false, error: e }; }
}
// Stored files carry a schema number. Each step below upgrades one version; files are upgraded when they are loaded and
// stamped with the current number when they are next saved. Files written by a NEWER app are kept as they are and reported.
const MIGRATIONS = {
  item: { 1: (it) => { if (it.type === 'custom') it.type = 'initiative'; return it; } },   // 0 -> 1
  cv: { 1: (cv) => cv }                                                                 // 0 -> 1 (defaults are filled in by M.newCV)
};
function migrate(kind, rec) {
  const from = Number.isInteger(rec.schema) ? rec.schema : 0;
  if (from > SCHEMA) return { rec, newer: true };
  for (let v = from + 1; v <= SCHEMA; v++) { const fn = MIGRATIONS[kind][v]; if (fn) rec = fn(rec) || rec; }
  return { rec, newer: false };
}

function safeName(s) { return String(s || 'file').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file'; }

class Workspace {
  constructor(root) {
    if (!root) throw new Error('No working folder given');
    this.root = root;
    for (const d of DIRS) fs.mkdirSync(path.join(root, d), { recursive: true });
    this.items = new Map();
    this.cvs = new Map();
    this.notices = [];   // things the person should hear about (recovered files, newer data); the UI reads these once
    this._loadSettings();
    this._loadAll();
    { const pf = this.settings.profiles || []; if (pf.length === 1 && pf[0].id === 'pf_default' && ![...this.cvs.values()].some(c => (c.profiles || []).includes('pf_default'))) { this.settings.profiles = []; this._saveSettings(); } }
    this.purgeTrash();
    this.snapshot('open');
  }
  p(...a) { return path.join(this.root, ...a); }

  // ---------- settings ----------
  _loadSettings() {
    const def = {
      schema: SCHEMA,
      profiles: [],
      skills: {},            // name -> { category, level, years? }
      rules: [],             // smart-CV rules
      header: { name: '', headline: '', email: '', phone: '', address: '', dob: '', age: '', gender: '', links: [], photo: '' },
      links: [], personalProfiles: [], defaultPersonalProfile: '', personalOptions: {},
      dateFormat: 'dmy-long',
      linkedinUrl: '',
      theme: 'dark',
      ai: {
        tasks: { rephrase: 'local', extract: 'local', critique: 'gemini', tailor: 'gemini', cover: 'local' },
        providers: {
          local: { label: 'Ollama (runs on this computer)', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:3b', needsKey: false, remote: false },
          groq: { label: 'Groq (free API key)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', needsKey: true, remote: true },
          gemini: { label: 'Google Gemini (API key)', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.8-flash', needsKey: true, remote: true }
        },
        redact: true
      }
    };
    const cur = readJson(this.p('settings.json'), {});
    // older versions offered other providers; only Ollama and Gemini are offered now
    if (cur.ai && cur.ai.providers) for (const k of ['openai', 'custom', 'anthropic']) delete cur.ai.providers[k];
    if (cur.ai && cur.ai.tasks) for (const k of Object.keys(cur.ai.tasks)) if (!['local', 'gemini', 'groq'].includes(cur.ai.tasks[k])) cur.ai.tasks[k] = k === 'critique' || k === 'tailor' ? 'gemini' : 'local';
    if (cur.ai && cur.ai.providers && cur.ai.providers.gemini && cur.ai.providers.gemini.model === 'gemini-2.5-flash') cur.ai.providers.gemini.model = 'gemini-3.8-flash';   // retired for new users
    if (cur.ai && cur.ai.providers && cur.ai.providers.gemini) { const g = cur.ai.providers.gemini; g.kind = 'gemini'; g.baseUrl = String(g.baseUrl || '').replace(/\/openai\/?$/i, '') || 'https://generativelanguage.googleapis.com/v1beta'; }
    this.settings = deepMerge(def, cur);
    this._saveSettings();
  }
  _saveSettings() { writeJson(this.p('settings.json'), this.settings); }
  getSettings() { return this.settings; }
  setSettings(patch) { this.settings = deepMerge(this.settings, patch, true); this._saveSettings(); return this.settings; }

  // ---------- load ----------
  _loadAll() {
    for (const f of fs.readdirSync(this.p('items'))) {
      if (!f.endsWith('.json')) continue;
      const r = this._readRecord('items', f);
      if (!r) continue;
      const { rec, newer } = migrate('item', r);
      if (!rec || typeof rec !== 'object' || !ID_RE.test(String(rec.id || ''))) { this._quarantine('items', f, 'missing or invalid id'); continue; }
      if (newer) this.notices.push({ kind: 'newer', file: 'items/' + f });
      this.items.set(rec.id, M.newItem(rec));
    }
    for (const f of fs.readdirSync(this.p('cvs'))) {
      if (!f.endsWith('.json')) continue;
      const r = this._readRecord('cvs', f);
      if (!r) continue;
      const { rec: cv, newer } = migrate('cv', r);
      if (!cv || typeof cv !== 'object' || !ID_RE.test(String(cv.id || ''))) { this._quarantine('cvs', f, 'missing or invalid id'); continue; }
      if (newer) this.notices.push({ kind: 'newer', file: 'cvs/' + f });
      this.cvs.set(cv.id, this._normaliseCV(cv));
    }
  }
  // Reads one stored file. A damaged file is moved to quarantine/ (never deleted) and reported instead of silently vanishing.
  _readRecord(dir, f) {
    const r = readJsonStrict(this.p(dir, f));
    if (r.ok && r.data && typeof r.data === 'object' && !Array.isArray(r.data)) return r.data;
    if (r.missing) return null;
    this._quarantine(dir, f, r.ok ? 'not an object' : 'unreadable');
    return null;
  }
  _quarantine(dir, f, why) {
    let to = f; const base = path.basename(f, '.json');
    for (let n = 2; fs.existsSync(this.p('quarantine', to)); n++) to = base + '_' + n + '.json';
    try { fs.renameSync(this.p(dir, f), this.p('quarantine', to)); } catch (e) { /* could not move it; it stays where it is */ }
    this.notices.push({ kind: 'recovered', file: dir + '/' + f, moved: 'quarantine/' + to, why });
  }
  _normaliseCV(cv) {
    const c = Object.assign(M.newCV(), cv); c.opts = Object.assign({}, M.DEFAULT_OPTS, cv.opts || {}); c.header = Object.assign({ name: '', headline: '', email: '', phone: '', address: '', dob: '', links: [], photo: '' }, cv.header || {});
    for (const k of ['selected', 'profiles', 'sections']) if (!Array.isArray(c[k])) c[k] = M.newCV()[k];
    if (!c.blockFlags || typeof c.blockFlags !== 'object') c.blockFlags = {};
    if (!c.sections.some(x => x.pb)) c.sections.push({ key: 'pagebreak', label: 'Page Break', types: [], visible: false, pb: true });
    return c;
  }
  takeNotices() { const n = this.notices; this.notices = []; return n; }

  // ---------- items ----------
  listItems() { return [...this.items.values()]; }
  getItem(id) { return this.items.get(id) || null; }
  saveItem(item) {
    const it = Object.assign(M.newItem(), item);
    assertId(it.id, 'entry id');
    it.schema = SCHEMA;
    it.updatedAt = new Date().toISOString();
    if (!it.text && it.versions && it.versions.length === 0 && !it.title) throw new Error('Item needs text or a title');
    this.items.set(it.id, it);
    writeJson(this.p('items', it.id + '.json'), it);
    this.autoSnap();
    return it;
  }
  saveItems(list) { return list.map(i => this.saveItem(i)); }
  deleteItem(id, extra) {
    assertId(id, 'entry id');
    const it = this.items.get(id);
    if (!it) return false;
    const rec = Object.assign({}, it, { deletedAt: new Date().toISOString() }, extra || {});
    writeJson(this.p('trash/items', id + '.json'), rec);
    try { fs.unlinkSync(this.p('items', id + '.json')); } catch (e) { /* ignore */ }
    this.items.delete(id);
    // remove from CV selections
    for (const cv of this.cvs.values()) {
      const n = cv.selected.length;
      cv.selected = cv.selected.filter(s => s.itemId !== id);
      if (cv.selected.length !== n) this.saveCV(cv, true);
    }
    return true;
  }
  listTrash() {
    const out = [];
    for (const kind of ['items', 'cvs']) {
      for (const f of fs.readdirSync(this.p('trash', kind))) {
        const r = readJson(this.p('trash', kind, f));
        if (r) out.push({ kind: kind === 'items' ? 'item' : 'cv', id: r.id, label: r.name || r.title || (r.text || '').slice(0, 80), deletedAt: r.deletedAt, mergedInto: r.mergedInto || null });
      }
    }
    return out.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  }
  // deleted CVs in full (the Home bin shows them as dimmed cards); damaged files are skipped
  listTrashCvs() {
    const out = [];
    for (const f of fs.readdirSync(this.p('trash', 'cvs'))) { const r = readJson(this.p('trash', 'cvs', f)); if (r && r.id) out.push(Object.assign(this._normaliseCV(r), { deletedAt: r.deletedAt || '' })); }
    return out.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  }
  purge(kind, id) {   // removes one bin entry for good
    assertId(id, 'id'); const f = this.p('trash', kind === 'item' ? 'items' : 'cvs', id + '.json');
    try { fs.unlinkSync(f); return true; } catch (e) { return false; }
  }
  restore(kind, id) {
    assertId(id, 'id');
    const dir = kind === 'item' ? 'items' : 'cvs';
    const f = this.p('trash', dir, id + '.json');
    const r = readJson(f);
    if (!r) return null;
    delete r.deletedAt; delete r.mergedInto;
    fs.unlinkSync(f);
    if (kind === 'item') return this.saveItem(r);
    return this.saveCV(r, true);
  }
  emptyTrash() {
    for (const kind of ['items', 'cvs']) for (const f of fs.readdirSync(this.p('trash', kind))) fs.unlinkSync(this.p('trash', kind, f));
    return true;
  }
  purgeTrash() {
    const cutoff = Date.now() - TRASH_DAYS * 86400000;
    for (const kind of ['items', 'cvs']) {
      for (const f of fs.readdirSync(this.p('trash', kind))) {
        const r = readJson(this.p('trash', kind, f));
        if (r && r.deletedAt && Date.parse(r.deletedAt) < cutoff) fs.unlinkSync(this.p('trash', kind, f));
      }
    }
  }

  // ---------- CVs ----------
  listCVs() {
    return [...this.cvs.values()].map(cv => ({
      id: cv.id, name: cv.name, targetRole: cv.targetRole, company: cv.company, templateId: cv.templateId,
      profiles: cv.profiles, archived: !!cv.archived, created: cv.created, updated: cv.updated, count: cv.selected.length, notes: cv.notes
    }));
  }
  getCV(id) { return this.cvs.get(id) || null; }
  saveCV(cv, keepTime) {
    const c = Object.assign(M.newCV(), cv);
    assertId(c.id, 'CV id');
    c.schema = SCHEMA;
    if (!keepTime) c.updated = new Date().toISOString();
    this.cvs.set(c.id, c);
    writeJson(this.p('cvs', c.id + '.json'), c);
    this.autoSnap();
    return c;
  }
  deleteCV(id) {
    assertId(id, 'CV id');
    const cv = this.cvs.get(id);
    if (!cv) return false;
    writeJson(this.p('trash/cvs', id + '.json'), Object.assign({}, cv, { deletedAt: new Date().toISOString() }));
    try { fs.unlinkSync(this.p('cvs', id + '.json')); } catch (e) { /* ignore */ }
    this.cvs.delete(id);
    return true;
  }
  duplicateCV(id) {
    const cv = this.cvs.get(id);
    if (!cv) return null;
    const c = JSON.parse(JSON.stringify(cv));
    c.id = M.uid('cv'); c.name = cv.name + ' (copy)';
    c.created = c.updated = new Date().toISOString();
    return this.saveCV(c, true);
  }

  // ---------- custom templates ----------
  listCustomTemplates() {
    return fs.readdirSync(this.p('templates')).filter(f => f.endsWith('.json')).map(f => readJson(this.p('templates', f))).filter(t => t && typeof t === 'object').map(t => Object.assign(t, { html: G.sanitizeTemplateHtml(t.html), css: G.sanitizeTemplateCss(t.css) }));
  }
  saveTemplate(t) {
    const tpl = Object.assign({ id: M.uid('tpl'), name: 'Custom template', html: '', css: '', custom: true, ats: 'unchecked', sidebar: [] }, t, { custom: true });
    assertId(tpl.id, 'template id');
    tpl.html = G.sanitizeTemplateHtml(tpl.html); tpl.css = G.sanitizeTemplateCss(tpl.css);
    if (String(tpl.html).length + String(tpl.css).length > 500000) throw new Error('That template is too large.');
    writeJson(this.p('templates', tpl.id + '.json'), tpl);
    return tpl;
  }
  deleteTemplate(id) { assertId(id, 'template id'); try { fs.unlinkSync(this.p('templates', id + '.json')); return true; } catch (e) { return false; } }

  // ---------- attachments ----------
  addAttachment(srcPath) {
    const base = safeName(path.basename(srcPath));
    let name = base, n = 1;
    while (fs.existsSync(this.p('attachments', name))) { const e = path.extname(base); name = path.basename(base, e) + '_' + (n++) + e; }
    fs.copyFileSync(srcPath, this.p('attachments', name));
    return name;
  }
  addAttachmentBuffer(name, buf) {
    const base = safeName(name);
    let out = base, n = 1;
    while (fs.existsSync(this.p('attachments', out))) { const e = path.extname(base); out = path.basename(base, e) + '_' + (n++) + e; }
    fs.writeFileSync(this.p('attachments', out), buf);
    return out;
  }

  // ---------- backups ----------
  snapshot(reason) {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const f = this.p('backups', stamp + '_' + (reason || 'auto') + '.json');
    if (fs.existsSync(f)) return f;
    writeJson(f, { schema: SCHEMA, at: new Date().toISOString(), settings: this.settings, items: this.listItems(), cvs: [...this.cvs.values()] });
    this.pruneBackups();
    return f;
  }
  autoSnap() { const now = Date.now(); if (this._lastSnap && now - this._lastSnap < 30 * 60000) return; this._lastSnap = now; try { this.snapshot('auto'); } catch (e) { /* ignore */ } }
  // keep every automatic backup of the last ~2 days (capped), plus a limited number of manual ones
  pruneBackups() {
    const all = fs.readdirSync(this.p('backups')).filter(x => x.endsWith('.json')).sort();
    const manual = all.filter(x => /_manual\.json$/.test(x)), auto = all.filter(x => !/_manual\.json$/.test(x));
    const cutoff = Date.now() - AUTO_DAYS * 86400000;
    const del = [];
    for (const x of auto) { const t = Date.parse(x.slice(0, 10) + 'T' + x.slice(11, 19).replace(/-/g, ':') + 'Z'); if (t && t < cutoff && auto.length - del.length > 6) del.push(x); }
    let left = auto.filter(x => !del.includes(x)); while (left.length > MAX_AUTO) del.push(left.shift());
    while (manual.length > MAX_MANUAL) del.push(manual.shift());
    for (const x of del) { try { fs.unlinkSync(this.p('backups', x)); } catch (e) { /* ignore */ } }
  }
  deleteBackup(name) { try { fs.unlinkSync(this.p('backups', path.basename(name))); return true; } catch (e) { return false; } }
  backupInfo() { return fs.readdirSync(this.p('backups')).filter(x => x.endsWith('.json')).sort().reverse().map(n => { const st = fs.statSync(this.p('backups', n)); return { name: n, size: st.size, at: st.mtime.toISOString(), reason: (n.replace(/\.json$/, '').split('_').slice(1).join('_')) || 'auto' }; }); }
  listBackups() { return fs.readdirSync(this.p('backups')).filter(x => x.endsWith('.json')).sort().reverse(); }
  restoreBackup(name) {
    const b = readJson(this.p('backups', path.basename(name)));
    if (!b) throw new Error('Backup unreadable');
    this.snapshot('before-restore');
    for (const it of b.items || []) this.saveItem(it);
    for (const cv of b.cvs || []) this.saveCV(cv, true);
    if (b.settings) this.setSettings(b.settings);
    return { items: (b.items || []).length, cvs: (b.cvs || []).length };
  }

  // whole-repository export / import (native JSON)
  exportAll() { return { schema: SCHEMA, kind: 'cvbuilder-repository', exportedAt: new Date().toISOString(), settings: this.settings, items: this.listItems(), cvs: [...this.cvs.values()], templates: this.listCustomTemplates() }; }
  importAll(data, merge) {
    if (!data || data.kind !== 'cvbuilder-repository') throw new Error('Not a Dossier repository file');
    this.snapshot('before-import');
    let n = 0;
    for (const it of data.items || []) { if (merge && this.items.has(it.id)) continue; this.saveItem(it); n++; }
    for (const cv of data.cvs || []) { if (merge && this.cvs.has(cv.id)) continue; this.saveCV(cv, true); }
    for (const t of data.templates || []) this.saveTemplate(t);
    return { items: n };
  }
}

function deepMerge(a, b, replaceArrays) {
  if (Array.isArray(b)) return replaceArrays || !Array.isArray(a) ? b.slice() : b.slice();
  if (b && typeof b === 'object') {
    const out = Object.assign({}, a && typeof a === 'object' && !Array.isArray(a) ? a : {});
    for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k], replaceArrays);
    return out;
  }
  return b === undefined ? a : b;
}

// ---------- global profiles: each profile is its own data folder (Main = the base folder itself, others under profiles/<id>) ----------
const regFile = (base) => path.join(base, 'profiles.json');
function readRegistry(base) { const r = readJson(regFile(base), null); if (r && Array.isArray(r.list) && r.list.length) return r; return { active: 'main', list: [{ id: 'main', name: 'Main' }] }; }
// Main = the folder the person chose. Every other profile is its own folder next to it (or, for older installs, under base/profiles/<id>).
function profileDir(base, id, reg) { if (id === 'main') return base; const e = ((reg || readRegistry(base)).list || []).find(x => x.id === id); return e && e.dir ? path.join(path.dirname(base), e.dir) : path.join(base, 'profiles', assertId(id, 'profile id')); }
function uniqueDir(parent, name) { const stem = safeName(name || 'Profile') || 'Profile'; let d = stem, n = 2; while (fs.existsSync(path.join(parent, d))) d = stem + ' (' + (n++) + ')'; return d; }
function openWithProfiles(base) {
  fs.mkdirSync(base, { recursive: true }); const reg = readRegistry(base);
  const act = reg.list.find(x => x.id === reg.active) || reg.list[0];
  const ws = new Workspace(profileDir(base, act.id, reg)); ws.base = base; ws.profileId = act.id; return ws;
}
function profileList(base) {
  const reg = readRegistry(base);
  return { active: reg.active, list: reg.list.map(e => { const dir = profileDir(base, e.id, reg); const st = readJson(path.join(dir, 'settings.json'), {}); const hd = st.header || {}; return { id: e.id, name: e.name, photo: hd.photo || '', header: hd, dir }; }) };
}
function createProfile(base, name, fromId) {
  const reg = readRegistry(base); const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const label = name || 'New profile';
  // a duplicate goes next to the folder it was copied from, named like the profile; a new blank one goes next to the main folder
  const srcDir = fromId ? profileDir(base, fromId, reg) : null; const parent = srcDir ? path.dirname(srcDir) : path.dirname(base);
  const dirName = uniqueDir(parent, label); const dst = path.join(parent, dirName);
  const cur = readJson(path.join(profileDir(base, reg.active, reg), 'settings.json'), {});
  fs.mkdirSync(dst, { recursive: true });
  if (srcDir) { for (const e of fs.readdirSync(srcDir)) { if (['profiles', 'backups', 'profiles.json'].includes(e)) continue; fs.cpSync(path.join(srcDir, e), path.join(dst, e), { recursive: true }); } }
  else { const keep = JSON.parse(JSON.stringify(cur)); for (const k of ['header', 'links', 'personalProfiles', 'defaultPersonalProfile', 'personalOptions', 'profiles', 'linkedinUrl', 'rules', 'skills']) delete keep[k]; writeJson(path.join(dst, 'settings.json'), keep); }
  reg.list.push({ id, name: label, dir: path.relative(path.dirname(base), dst).split(path.sep).join('/') }); writeJson(regFile(base), reg); return id;
}
function setActiveProfile(base, id) { const reg = readRegistry(base); if (!reg.list.some(x => x.id === id)) throw new Error('Profile not found'); reg.active = id; writeJson(regFile(base), reg); }
function renameProfile(base, id, name) {
  const reg = readRegistry(base); const e = reg.list.find(x => x.id === id); if (!e) return;
  e.name = name;
  // the folder follows the name (the Main folder is the one you picked, so it keeps its name)
  if (id !== 'main') {
    try {
      const cur = profileDir(base, id, reg), parent = path.dirname(cur), want = safeName(name) || 'Profile';
      if (path.basename(cur) !== want) { const dn = uniqueDir(parent, name); fs.renameSync(cur, path.join(parent, dn)); e.dir = path.relative(path.dirname(base), path.join(parent, dn)).split(path.sep).join('/'); }
    } catch (er) { /* folder is in use: the profile keeps its old folder name */ }
  }
  writeJson(regFile(base), reg);
}
function deleteProfile(base, id) {
  const reg = readRegistry(base); if (reg.list.length < 2) throw new Error('This is the only profile. Create another one first.');
  const dir = profileDir(base, id, reg); reg.list = reg.list.filter(x => x.id !== id); if (reg.active === id) reg.active = reg.list[0].id; writeJson(regFile(base), reg);
  try {
    if (id === 'main') { for (const e of fs.readdirSync(base)) { if (['profiles.json', 'profiles'].includes(e)) continue; fs.rmSync(path.join(base, e), { recursive: true, force: true }); } }   // the registry lives in this folder, so only its data goes
    else fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) { /* ignore */ }
}
module.exports = { assertId, readJsonStrict, friendlyFsError, migrate, openWithProfiles, profileList, createProfile, setActiveProfile, renameProfile, deleteProfile, Workspace, safeName, writeJson, readJson, SCHEMA, TRASH_DAYS };
