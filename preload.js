'use strict';
const { contextBridge, ipcRenderer, webUtils, webFrame } = require('electron');
// Apply the saved zoom level before anything is drawn (applying it later changed the page size mid-splash).
try { const z = parseFloat(localStorage.getItem('cvb.zoom')); if (z >= .6 && z <= 2) webFrame.setZoomFactor(z); } catch (e) { /* default zoom */ }
contextBridge.exposeInMainWorld('cvDesktop', {
  call: (name, args) => ipcRenderer.invoke('api', name, args),
  pickFolder: () => ipcRenderer.invoke('dialog.folder'),
  pickFiles: (o) => ipcRenderer.invoke('dialog.files', o),
  openPath: (p) => ipcRenderer.invoke('shell.openPath', p),
  showInFolder: (p) => ipcRenderer.invoke('shell.showInFolder', p),
  openExternal: (u) => ipcRenderer.invoke('shell.openExternal', u),
  linkedinWindow: (u) => ipcRenderer.invoke('linkedin.window', u),
  setIcon: (url) => ipcRenderer.invoke('app.setIcon', url),
  setZoom: (z) => { try { webFrame.setZoomFactor(z); } catch (e) { /* ignore */ } },
  linkedinReset: (partition) => ipcRenderer.invoke('linkedin.reset', partition),
  openCmd: (text) => ipcRenderer.invoke('cmd.open', text),
  ollamaQuit: () => ipcRenderer.invoke('ollama.quit'),
  testCrash: () => ipcRenderer.invoke('app.testCrash'),
  dragStart: (file) => ipcRenderer.send('drag.start', file),
  onKey: (cb) => ipcRenderer.on('app.key', (e, k) => cb(k)),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch (e) { return ''; } }
});
