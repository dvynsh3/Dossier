'use strict';
// Tiny rotating log file. Everything is passed through redact() first, so keys and user names never reach the disk.
const fs = require('fs');
const path = require('path');
const { redact } = require('./guards');

function createLogger(dir, opts) {
  opts = Object.assign({ maxBytes: 512 * 1024, keep: 3 }, opts);
  const file = path.join(dir, 'app.log');
  const rotate = () => {
    try {
      if (fs.statSync(file).size < opts.maxBytes) return;
      for (let i = opts.keep - 1; i >= 1; i--) { const a = path.join(dir, 'app.' + i + '.log'); if (fs.existsSync(a)) fs.renameSync(a, path.join(dir, 'app.' + (i + 1) + '.log')); }
      fs.renameSync(file, path.join(dir, 'app.1.log'));
      const old = path.join(dir, 'app.' + (opts.keep + 1) + '.log'); if (fs.existsSync(old)) fs.unlinkSync(old);
    } catch (e) { /* nothing to rotate yet */ }
  };
  function write(level, args) {
    try {
      fs.mkdirSync(dir, { recursive: true }); rotate();
      const msg = args.map(a => a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })()).join(' ');
      fs.appendFileSync(file, new Date().toISOString() + ' ' + level + ' ' + redact(msg).slice(0, 4000) + '\n');
    } catch (e) { /* logging must never break the app */ }
  }
  return { file, info: (...a) => write('INFO', a), warn: (...a) => write('WARN', a), error: (...a) => write('ERROR', a) };
}
module.exports = { createLogger };
