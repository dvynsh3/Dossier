'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, nativeImage, clipboard, Menu, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createApi } = require('./src/core/api');
const G = require('./src/core/guards');
const { createLogger } = require('./src/core/log');
const makeEngine = require('./src/core/engine-electron');

const ICON_B64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAdElEQVR4nGNgGOmAEZeEvF/lf2pa9HBTO1a7mKhpCTmAhZCCBxvbKLJAwb8Kr/yAh8CoAwbcAQQTIQwQSkzogNjES7QDKM0NuMCAR8GoA0YT4YBHwagDRhPhgEfBqANGE+GAR8GAO4BgFJAa96SCAQ+BUQAAMa0ckcCsjNcAAAAASUVORK5CYII=';
let win = null;
const ctx = { ws: null, platform: process.platform };
let configFile, secretsFile, log = { info: (..._a) => {}, warn: (..._a) => {}, error: (..._a) => {} };

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
// atomic (temp file + rename); owner-only permissions where the OS supports them
function writeJson(f, v) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 2), { mode: 0o600 }); fs.renameSync(t, f); }

// ---- secrets: API keys are encrypted with the OS (Windows DPAPI via safeStorage) and kept OUTSIDE the working folder.
// New values are stored as "v2:<base64>". If the OS cannot encrypt, keys are NOT saved (never written as plain text).
const NO_ENC = 'Your computer cannot protect saved keys (secure storage is unavailable), so the key was not saved. You can still paste it each time you need it.';
ctx.secrets = {
  async get(id) {
    const all = readJson(secretsFile, {}); let v = all[id]; if (!v || typeof v !== 'string') return '';
    try {
      const legacy = !v.startsWith('v2:'); if (!legacy) v = v.slice(3);
      const buf = Buffer.from(v, 'base64');
      if (!safeStorage.isEncryptionAvailable()) return legacy ? buf.toString('utf8') : '';   // only old plain-text entries are readable without encryption
      if (typeof safeStorage.decryptStringAsync === 'function') { const r = await safeStorage.decryptStringAsync(buf); return typeof r === 'string' ? r : (r && r.result) || ''; }
      return safeStorage.decryptString(buf);
    } catch (e) { return ''; }
  },
  async set(id, key) {
    const all = readJson(secretsFile, {});
    if (!key) delete all[id];
    else {
      if (!safeStorage.isEncryptionAvailable()) throw new Error(NO_ENC);
      const enc = typeof safeStorage.encryptStringAsync === 'function' ? await safeStorage.encryptStringAsync(key) : safeStorage.encryptString(key);
      all[id] = 'v2:' + Buffer.from(enc).toString('base64');
    }
    writeJson(secretsFile, all);
  },
  list() { return Object.keys(readJson(secretsFile, {})); },
  file() { return secretsFile; }
};
ctx.openWorkspace = async (folder) => {
  fs.mkdirSync(folder, { recursive: true });
  ctx.ws = require('./src/core/storage').openWithProfiles(folder);
  const cfg = readJson(configFile, {}); cfg.lastFolder = folder; writeJson(configFile, cfg);
};
// Folders the app may open files from or drag files out of: the working folder, the base folder and every profile folder.
// Anything the person picks in a save dialog this session is trusted as well.
const paths = G.makePathPolicy(() => {
  if (!ctx.ws) return [];
  const roots = [ctx.ws.root, ctx.ws.base].filter(Boolean);
  try { const ST = require('./src/core/storage'); if (ctx.ws.base) for (const p of ST.profileList(ctx.ws.base).list) roots.push(p.dir); } catch (e) { /* the main folder is enough */ }
  return roots;
});
ctx.pickSavePath = async (defaultName, multi) => {
  if (multi) { const r = await dialog.showOpenDialog(win, { title: 'Choose a folder to copy the exported files into', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled) return null; paths.trust(r.filePaths[0]); return r.filePaths[0]; }
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName }); if (r.canceled) return null; paths.trust(r.filePath); return r.filePath;
};
ctx.copyFileToClipboard = (file) => new Promise((resolve, reject) => {
  if (!paths.allowsOpen(file)) return reject(new Error('That file cannot be copied from here.'));
  if (!fs.existsSync(file)) return reject(new Error('The file to copy was not found.'));
  if (process.platform !== 'win32') { clipboard.writeText(file); return resolve({ copied: false, note: 'File copy to clipboard is Windows-only; the file path was copied instead.' }); }
  // Put the file on the Windows clipboard as a real file (CF_HDROP), so Ctrl+V works in Explorer, the desktop and email.
  // The path travels in an environment variable: no quoting problems with spaces, quotes or non-ASCII names.
  const script = "Add-Type -AssemblyName System.Windows.Forms; $c = New-Object System.Collections.Specialized.StringCollection; $null = $c.Add($env:CVB_FILE); [System.Windows.Forms.Clipboard]::SetFileDropList($c)";
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, env: Object.assign({}, process.env, { CVB_FILE: file }) });
  let err = ''; ps.stderr.on('data', d => { err += d; });
  ps.on('error', e => reject(new Error('Could not start PowerShell: ' + e.message)));
  ps.on('exit', c => c === 0 ? resolve({ copied: true }) : reject(new Error('Could not copy the file to the clipboard. ' + err.trim().slice(0, 200))));
});

// keep using the folder from the app's earlier name so settings, saved keys and LinkedIn sign-ins survive the rename to Dossier
try { app.setPath('userData', path.join(app.getPath('appData'), 'cv-builder')); } catch (e) { /* ignore */ }
try { log = createLogger(path.join(app.getPath('userData'), 'logs')); } catch (e) { /* run without a log file */ }
process.on('uncaughtException', (e) => { log.error('uncaughtException', e); });
process.on('unhandledRejection', (e) => { log.error('unhandledRejection', e); });

// Only one copy at a time: two copies (installed + source) would write the same data folder. A second launch focuses the first.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

ctx.log = log;
const api = createApi(ctx);

function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1000, minHeight: 640, show: false, title: 'Dossier', icon: path.join(__dirname, 'assets', 'icon.ico'), backgroundColor: '#0b0e14', autoHideMenuBar: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true, webviewTag: true }
  });
  win.setMenuBarVisibility(false);
  // Maximise BEFORE the first paint (hidden), then show: showing first and maximising afterwards left a stale-sized,
  // cut-off first frame (dark bars at the right and bottom of the splash screen) on some Windows setups.
  win.maximize();
  win.once('ready-to-show', () => {
    win.show();
    const refresh = () => { try { if (!win.isDestroyed()) win.webContents.invalidate(); } catch (e) { /* closing */ } };
    setTimeout(refresh, 80); setTimeout(refresh, 400);
  });
  win.on('maximize', () => { try { win.webContents.invalidate(); } catch (e) { /* closing */ } });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // never navigate the app window away; open web links in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (G.isWebUrl(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-attach-webview', (e, webPreferences, params) => {
    if (!G.isLinkedInUrl(params.src || '') || !/^persist:li-[a-z0-9_-]+$/i.test(params.partition || '')) { e.preventDefault(); return; }
    delete webPreferences.preload; delete webPreferences.preloadURL; webPreferences.nodeIntegration = false; webPreferences.nodeIntegrationInSubFrames = false; webPreferences.contextIsolation = true; webPreferences.sandbox = true; webPreferences.webSecurity = true; webPreferences.allowRunningInsecureContent = false;
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (G.isWebUrl(url)) shell.openExternal(url); } });
  // a crashed or frozen page offers a reload instead of leaving a dead window; your data is already on disk
  win.webContents.on('render-process-gone', (e, d) => {
    log.error('render-process-gone', d && d.reason);
    if (d && d.reason === 'clean-exit') return;
    dialog.showMessageBox(win, { type: 'error', title: 'Dossier', message: 'The window stopped working and needs to reload.', detail: 'Your saved data is safe. Changes from the last second or two may be missing.', buttons: ['Reload'] }).then(() => { if (win && !win.isDestroyed()) win.webContents.reload(); });
  });
  win.on('unresponsive', () => {
    log.warn('window unresponsive');
    dialog.showMessageBox(win, { type: 'warning', title: 'Dossier', message: 'Dossier is not responding.', detail: 'It may just be busy with a large file. You can wait, or reload the window (saved data is safe).', buttons: ['Wait', 'Reload'], defaultId: 0, cancelId: 0 }).then(r => { if (r.response === 1 && win && !win.isDestroyed()) win.webContents.reload(); });
  });
}

// Nothing in the app needs camera, microphone, location, notifications and so on: deny every permission request.
function lockPermissions(ses, allow) {
  allow = allow || [];   // the app's own window may copy text to the clipboard; nothing else
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(allow.includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => allow.includes(permission));
  if (ses.setDevicePermissionHandler) ses.setDevicePermissionHandler(() => false);
}

const passkeyOff = new WeakSet();
app.on('web-contents-created', (e, contents) => {
  if (contents.getType() !== 'webview') return;
  lockPermissions(contents.session);
  // no passkey prompt from LinkedIn's sign-in page (once per browser session)
  try { if (!passkeyOff.has(contents.session)) { passkeyOff.add(contents.session); contents.session.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'li-preload.js') }); } } catch (err) { log.warn('passkey block not applied', err && err.message); }
  // LinkedIn window: look like a normal browser, and keep pop-ups inside the same window
  try { contents.setUserAgent(contents.getUserAgent().replace(/\s*Electron\/\S+/i, '').replace(/\s*cv-builder\/\S+/i, '')); } catch (err) { /* ignore */ }
  contents.on('will-navigate', (ev, url) => { if (!G.isWebUrl(url)) ev.preventDefault(); });
  // Ctrl+Tab / Ctrl+1..6 must still switch app tabs while the LinkedIn window has focus; right-click gets copy / paste
  contents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta)) return;
    if (input.key === 'Tab' || /^[1-6]$/.test(input.key)) { ev.preventDefault(); const host = contents.hostWebContents; if (host) host.send('app.key', { key: input.key, shift: !!input.shift }); }
  });
  contents.on('context-menu', (ev, p) => {
    const t = [];
    if (p.linkURL) t.push({ label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' });
    if (p.isEditable) t.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' });
    else if (p.selectionText) t.push({ role: 'copy' }, { role: 'selectAll' });
    else t.push({ label: 'Back', enabled: contents.canGoBack(), click: () => contents.goBack() }, { label: 'Reload', click: () => contents.reload() });
    Menu.buildFromTemplate(t).popup();
  });
  contents.setWindowOpenHandler(({ url }) => { if (G.isLinkedInUrl(url)) contents.loadURL(url); else if (G.isWebUrl(url)) shell.openExternal(url); return { action: 'deny' }; });
});

app.whenReady().then(async () => {
  if (!gotLock) return;
  try { require('./src/core/net').use((u, o) => require('electron').net.fetch(u, o)); } catch (e) { /* fall back to Node fetch */ }
  // hidden menu: only there so Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+A work everywhere (including the LinkedIn window)
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }]));
  configFile = path.join(app.getPath('userData'), 'config.json');
  secretsFile = path.join(app.getPath('userData'), 'secrets.json');
  ctx.engine = makeEngine(require('electron'));
  const cfg = readJson(configFile, {});
  if (cfg.lastFolder && fs.existsSync(cfg.lastFolder)) { try { await ctx.openWorkspace(cfg.lastFolder); } catch (e) { log.error('Could not reopen last folder', e); } }
  session.defaultSession.setSpellCheckerLanguages(['en-US', 'en-GB']);

  lockPermissions(session.defaultSession, ['clipboard-sanitized-write']);
  // Calls are accepted only from the app's own window (a local page, not a web page), with plain-object arguments.
  const trusted = (e) => { try { return win && !win.isDestroyed() && e.sender === win.webContents && /^file:/i.test(e.senderFrame ? e.senderFrame.url : e.sender.getURL()); } catch (err) { return false; } };
  const guard = (fn) => async (e, ...a) => { if (!trusted(e)) throw new Error('Request refused.'); return fn(e, ...a); };
  ipcMain.handle('api', async (e, name, args) => {
    try {
      if (!trusted(e)) throw new Error('Request refused.');
      if (typeof name !== 'string' || !G.hasOwn(api, name)) throw new Error('Unknown action.');
      if (args != null && !G.isPlainObject(args)) throw new Error('Bad request.');
      return { ok: true, data: await api[name](args || {}) };
    } catch (err) {
      log.warn('api', name, err && err.message);
      return { ok: false, error: G.redact(err && err.message ? err.message : String(err)) };
    }
  });
  ipcMain.handle('dialog.folder', guard(async () => { const r = await dialog.showOpenDialog(win, { title: 'Choose the working folder for your CV data', properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; }));
  ipcMain.handle('dialog.files', guard(async (e, o) => { o = G.isPlainObject(o) ? o : {}; const filters = Array.isArray(o.filters) ? o.filters.filter(f => f && typeof f.name === 'string' && Array.isArray(f.extensions)).slice(0, 10) : []; const r = await dialog.showOpenDialog(win, { title: typeof o.title === 'string' ? o.title.slice(0, 120) : 'Choose files', properties: ['openFile'].concat(o.multi ? ['multiSelections'] : []), filters }); return r.canceled ? [] : r.filePaths; }));
  // Opening is limited to files inside the working folders (or ones you just saved) and never runs programs or scripts.
  ipcMain.handle('shell.openPath', guard(async (e, p) => {
    if (!paths.allowsOpen(p)) { log.warn('openPath refused', p); throw new Error('That file cannot be opened from here.'); }
    const err = await shell.openPath(p); if (err) throw new Error('Could not open the file: ' + err); return true;
  }));
  // the logo picked in Settings also becomes the window / taskbar icon while the app runs
  ipcMain.handle('app.setIcon', guard((e, url) => { try { if (typeof url !== 'string' || !/^data:image\/(png|jpeg|x-icon|vnd\.microsoft\.icon);base64,/i.test(url) || url.length > 4e6) return false; const img = nativeImage.createFromDataURL(url); if (img.isEmpty() || !win) return false; win.setIcon(img); return true; } catch (err) { return false; } }));
  // Settings > "Test crash recovery": crashes this window on purpose so the reload dialog can be checked (nothing is lost)
  ipcMain.handle('app.testCrash', guard(async () => { setTimeout(() => { try { win.webContents.forcefullyCrashRenderer(); } catch (err) { log.warn('test crash failed', err && err.message); } }, 150); return true; }));
  ipcMain.handle('shell.showInFolder', guard(async (e, p) => { if (!paths.allows(p)) { log.warn('showInFolder refused', p); throw new Error('That location cannot be shown from here.'); } if (fs.existsSync(p)) shell.showItemInFolder(p); else { const err = await shell.openPath(path.dirname(p)); if (err) throw new Error('Could not open the folder: ' + err); } return true; }));
  ipcMain.handle('shell.openExternal', guard(async (e, url) => { if (!G.isWebUrl(url)) throw new Error('Only web links can be opened.'); await shell.openExternal(url); return true; }));
  // LinkedIn runs inside the app in <webview> tags, each account with its own saved sign-in (partition). Nothing is automated.
  ipcMain.handle('linkedin.reset', guard(async (e, partition) => {
    if (typeof partition !== 'string' || !/^persist:li-[a-z0-9_-]+$/i.test(partition)) throw new Error('Bad partition');
    const ses = session.fromPartition(partition);
    await ses.clearStorageData(); await ses.clearCache(); await ses.clearAuthCache();
    return true;
  }));
  // Ollama helpers: open a command prompt (the command is already on the clipboard), stop the model, quit Ollama
  ipcMain.handle('cmd.open', guard(async (e, text) => {
    if (typeof text === 'string' && text.length < 300) clipboard.writeText(text);
    if (process.platform !== 'win32') return { opened: false, copied: true };
    spawn('cmd.exe', ['/c', 'start', '', 'cmd.exe', '/k'], { detached: true, stdio: 'ignore' }).unref();
    return { opened: true, copied: true };
  }));
  ipcMain.handle('ollama.quit', guard(async () => {
    if (process.platform !== 'win32') throw new Error('Quit Ollama from its tray icon.');
    const kill = (name) => new Promise(res => { const p = spawn('taskkill', ['/IM', name, '/F'], { windowsHide: true }); p.on('exit', c => res(c === 0)); p.on('error', () => res(false)); });
    const a = await kill('ollama app.exe'), b = await kill('ollama.exe'); return { stopped: a || b };
  }));
  ipcMain.on('drag.start', (e, file) => { try { if (!trusted(e) || !paths.allowsOpen(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { log.warn('drag refused', file); return; } e.sender.startDrag({ file, icon: nativeImage.createFromBuffer(Buffer.from(ICON_B64, 'base64')) }); } catch (err) { log.error('drag', err); } });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
