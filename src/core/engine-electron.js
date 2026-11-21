'use strict';
// PDF / PNG rendering through a hidden Electron BrowserWindow. Only loaded inside Electron.
const fs = require('fs');
const os = require('os');
const path = require('path');

function countPdfPages(buf) { const m = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g); return m ? m.length : 1; }

module.exports = function makeEngine(electron) {
  const { BrowserWindow } = electron;
  async function withWindow(html, opts, fn) {
    const tmp = path.join(os.tmpdir(), 'cvb_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.html');
    fs.writeFileSync(tmp, html, 'utf8');
    const win = new BrowserWindow({ show: false, width: opts.width || 900, height: opts.height || 1200, webPreferences: { sandbox: true, contextIsolation: true, javascript: false, zoomFactor: opts.zoom || 1, backgroundThrottling: false } });
    try {
      await win.loadFile(tmp);
      await new Promise(r => setTimeout(r, 150));
      return await fn(win);
    } finally { try { win.destroy(); } catch (e) { /* ignore */ } try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ } }
  }
  // Fallback: capture the page in screen-sized strips and join them on a canvas (in a scratch window that shows nothing but the strips).
  async function tiledPng(win, W, total) {
    const wc = win.webContents; win.setContentSize(Math.round(W * (wc.getZoomFactor() || 1)), 900);
    await new Promise(r => setTimeout(r, 250));
    const viewH = Math.max(100, await wc.executeJavaScript('window.innerHeight'));
    const tiles = []; let ratio = 1;
    for (let y = 0; y < total; y += viewH) {
      await wc.executeJavaScript('window.scrollTo(0,' + y + ')'); await new Promise(r => setTimeout(r, 150));
      const at = await wc.executeJavaScript('window.scrollY'); const img = await wc.capturePage(); ratio = img.getSize().width / W;
      tiles.push({ at, data: img.toPNG().toString('base64') });
    }
    const cv = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { sandbox: true, contextIsolation: true } });
    try {
      await cv.loadURL('data:text/html,<canvas id=c></canvas>');
      const out = await cv.webContents.executeJavaScript('(async()=>{const T=' + JSON.stringify(tiles) + ',R=' + ratio + ',W=' + W + ',H=' + total + ';const c=document.getElementById("c");c.width=Math.round(W*R);c.height=Math.round(H*R);const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);for(const t of T){const i=new Image();await new Promise((ok,no)=>{i.onload=ok;i.onerror=no;i.src="data:image/png;base64,"+t.data;});x.drawImage(i,0,Math.round(t.at*R));}return c.toDataURL("image/png").split(",")[1];})()');
      return Buffer.from(out, 'base64');
    } finally { try { cv.destroy(); } catch (e) { /* ignore */ } }
  }
  return {
    async pdf(html, o) {
      return withWindow(html, {}, win => win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: (o && o.pageSize) || 'A4' }));
    },
    async pages(html, o) { const b = await this.pdf(html, o); return countPdfPages(b); },
    // PNG of the whole CV as ONE continuous image (like the Continuous view: no page gaps). Returns [buffer].
    async png(html, o) {
      let scale = o.scale || 2; const W = o.pageW || 794, H = o.pageH || 1123;
      const tmp = path.join(os.tmpdir(), 'cvb_png_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.html');
      fs.writeFileSync(tmp, html, 'utf8');
      // scripts stay off for the CV itself except the two measuring calls below, which the app issues, not the page
      const win = new BrowserWindow({ show: false, width: Math.round(W * scale), height: Math.round(H * scale), useContentSize: true, webPreferences: { sandbox: true, contextIsolation: true, zoomFactor: scale, backgroundThrottling: false } });
      try {
        await win.loadFile(tmp);
        await new Promise(r => setTimeout(r, 250));
        const total = Math.max(H, await win.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)'));
        // graphics cards cannot make images much taller than 16000 pixels: lower the sharpness for very long CVs
        scale = Math.max(1, Math.min(scale, 15000 / total));
        win.webContents.setZoomFactor(scale);
        win.setContentSize(Math.round(W * scale), Math.round(total * scale));
        await new Promise(r => setTimeout(r, 350));
        let img = await win.webContents.capturePage();
        const sz = img.getSize();
        // complete when the picture has the same proportions as the CV; the window may have been limited by the screen size
        if (Math.abs(sz.height - sz.width * total / W) <= 4) return [img.toPNG()];
        return [await tiledPng(win, W, total)];
      } finally { try { win.destroy(); } catch (e) { /* ignore */ } try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ } }
    }
  };
};
module.exports.countPdfPages = countPdfPages;
