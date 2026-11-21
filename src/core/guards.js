'use strict';
// Small, dependency-free safety checks shared by the desktop shell and the dev server (and unit-tested without Electron).
const fs = require('fs');
const path = require('path');

// Files that run code when opened. They are never opened or dragged out by the app, wherever they are.
const BLOCKED_EXT = new Set(['.exe', '.com', '.bat', '.cmd', '.msi', '.msp', '.scr', '.pif', '.lnk', '.url', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.hta', '.cpl', '.jar', '.reg', '.dll', '.sys', '.appx', '.msix', '.application', '.gadget', '.inf', '.sh', '.app', '.command', '.desktop']);
function isBlockedFile(p) { return BLOCKED_EXT.has(path.extname(String(p || '')).toLowerCase()); }

// realpath where possible (so a symlink or junction cannot point out of a folder), plain resolve otherwise
function canon(p) {
  const r = path.resolve(String(p));
  try { return fs.realpathSync.native ? fs.realpathSync.native(r) : fs.realpathSync(r); } catch (e) {
    try { return path.join(fs.realpathSync(path.dirname(r)), path.basename(r)); } catch (e2) { return r; }
  }
}
const norm = (p) => process.platform === 'win32' ? p.toLowerCase() : p;
function isInside(root, p) {
  if (!root || !p) return false;
  const rel = path.relative(norm(canon(root)), norm(canon(p)));
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

// A path policy: allowed = inside one of the working folders, or something the person chose in a save dialog this session.
function makePathPolicy(getRoots) {
  const trusted = new Set();
  return {
    trust(p) { if (typeof p === 'string' && p) trusted.add(path.resolve(p)); },
    allows(p) {
      if (typeof p !== 'string' || !p || p.includes('\0')) return false;
      if (!path.isAbsolute(p)) return false;
      const roots = (getRoots() || []).concat([...trusted]);
      return roots.some(r => isInside(r, p));
    },
    // a file the app may open with the system's default program
    allowsOpen(p) { return this.allows(p) && !isBlockedFile(p); }
  };
}

const WEB_RE = /^https?:\/\//i;
const isWebUrl = (u) => typeof u === 'string' && u.length < 4096 && WEB_RE.test(u);
const isLinkedInUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)linkedin\.com$/i.test(x.hostname); } catch (e) { return false; } };
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Remove secrets and personal paths from text before it is shown or logged.
function redact(text) {
  return String(text == null ? '' : text)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]')
    .replace(/\b(?:gsk|sk|xai|hf|pk)[-_][A-Za-z0-9_-]{16,}/g, '[key]')
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 [key]')
    .replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&\s"']+/gi, '$1[key]')
    .replace(/([A-Za-z]:\\Users\\)[^\\/\s"']+/gi, '$1~')
    .replace(/(\/(?:home|Users)\/)[^/\s"']+/g, '$1~');
}

// Custom templates are code-like input (HTML + CSS from a file or typed in). Keep them to layout: no scripts, frames, plug-ins,
// forms-to-elsewhere, event handlers, javascript: links, or CSS that loads things from the internet.
function sanitizeTemplateHtml(html) {
  return String(html == null ? '' : html)
    .replace(/<\s*(script|iframe|frame|frameset|object|embed|applet|link|meta|base|form|noscript|template)\b[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/gi, '')
    .replace(/<\s*\/?\s*(script|iframe|frame|frameset|object|embed|applet|link|meta|base|form)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(src|srcset|poster|background|data)\s*=\s*(["']?)\s*(?:https?:|\/\/|ftp:|file:)[^"'>\s]*\2/gi, '')   // nothing is loaded from the internet
    .replace(/\s(href|src|xlink:href|action|formaction)\s*=\s*(["']?)\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^"'>\s]*\2/gi, ' $1="#"');
}
function sanitizeTemplateCss(css) {
  return String(css == null ? '' : css)
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(["']?)\s*(?:https?:|\/\/|ftp:|file:|javascript:)[^)]*\)/gi, 'none')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/(?:-moz-binding|behavior)\s*:[^;}]*/gi, '')
    .replace(/<\s*\/?\s*style[^>]*>/gi, '');
}

module.exports = { sanitizeTemplateHtml, sanitizeTemplateCss, BLOCKED_EXT, isBlockedFile, isInside, makePathPolicy, isWebUrl, isLinkedInUrl, isPlainObject, hasOwn, redact };
