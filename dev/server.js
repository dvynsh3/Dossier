'use strict';
// Headless harness: serves the renderer in a normal browser and exposes the same API over HTTP.
// Used for automated UI tests here; not part of the shipped desktop app.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Workspace } = require('../src/core/storage');
const { createApi } = require('../src/core/api');
const { countPdfPages } = require('../src/core/engine-electron');
const G = require('../src/core/guards');

const ROOT = path.join(__dirname, '..');
// Only these folders are served (never the whole project): the renderer, the shared core modules it loads, and assets.
const SERVED = ['renderer', 'src/core', 'assets'].map(d => path.join(ROOT, d) + path.sep);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

function makePlaywrightEngine() {
  let browser = null;
  const get = async () => { if (!browser) { const { chromium } = require('playwright'); browser = await chromium.launch(); } return browser; };
  return {
    async pdf(html, o) { const b = await get(); const pg = await b.newPage(); try { await pg.setContent(html); return await pg.pdf({ preferCSSPageSize: true, printBackground: true, format: (o && o.pageSize) || 'A4' }); } finally { await pg.close(); } },
    async pages(html, o) { return countPdfPages(await this.pdf(html, o)); },
    async png(html, o) {
      const b = await get(); const ctx = await b.newContext({ viewport: { width: o.pageW || 794, height: o.pageH || 1123 }, deviceScaleFactor: o.scale || 2 }); const pg = await ctx.newPage();
      try { await pg.setContent(html); return [await pg.screenshot({ fullPage: true })]; } finally { await ctx.close(); }
    },
    async close() { if (browser) await browser.close(); }
  };
}

function start(opts) {
  opts = opts || {};
  const secretsFile = opts.secretsFile || '/tmp/cvb_dev_secrets.json';
  const ctx = {
    ws: null, platform: 'dev', engine: makePlaywrightEngine(),
    secrets: {
      async get(id) { try { return JSON.parse(fs.readFileSync(secretsFile, 'utf8'))[id] || ''; } catch (e) { return ''; } },
      async set(id, k) { let a = {}; try { a = JSON.parse(fs.readFileSync(secretsFile, 'utf8')); } catch (e) { /* new */ } if (k) a[id] = k; else delete a[id]; fs.writeFileSync(secretsFile, JSON.stringify(a)); }
    },
    async openWorkspace(f) { fs.mkdirSync(f, { recursive: true }); ctx.ws = require('../src/core/storage').openWithProfiles(f); },
    pickSavePath: async () => null
  };
  if (opts.workspace) ctx.ws = new Workspace(opts.workspace);
  const api = createApi(ctx);
  const server = http.createServer(async (req, res) => {
    try {
      // DNS-rebinding guard: only answer requests addressed to this computer by name or number
      const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
      if (host !== '127.0.0.1' && host !== 'localhost') { res.statusCode = 403; return res.end('forbidden host'); }
      if (req.method === 'POST' && req.url.startsWith('/api/')) {
        // cross-site pages cannot add this header without a CORS check, which this server never grants
        if (req.headers['x-dossier'] !== '1' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) { res.statusCode = 403; return res.end('forbidden'); }
        let body = '', size = 0; for await (const c of req) { size += c.length; if (size > 80e6) { res.statusCode = 413; return res.end('too large'); } body += c; }
        const name = decodeURIComponent(req.url.slice(5));
        try {
          if (!G.hasOwn(api, name)) throw new Error('Unknown action.');
          const args = body ? JSON.parse(body) : {}; if (!G.isPlainObject(args)) throw new Error('Bad request.');
          const data = await api[name](args);
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, data: data === undefined ? null : data }));
        } catch (e) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: false, error: G.redact(e.message) })); }
        return;
      }
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') { res.writeHead(302, { Location: '/renderer/index.html' }); return res.end(); }
      const f = path.join(ROOT, p);
      if (!SERVED.some(d => f.startsWith(d)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end('not found'); return; }
      res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
    } catch (e) { res.statusCode = 500; res.end('error'); }
  });
  return new Promise(r => server.listen(opts.port || 0, '127.0.0.1', () => r({ server, ctx, api, port: server.address().port, close: async () => { server.close(); if (server.closeAllConnections) server.closeAllConnections(); await ctx.engine.close(); } })));
}
module.exports = { start };
if (require.main === module) start({ workspace: process.env.WS, port: +process.env.PORT || 5173 }).then(s => console.log('http://127.0.0.1:' + s.port));
