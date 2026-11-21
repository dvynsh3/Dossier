'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const M = require('./model');
const S = require('./similarity');

const ROLE_WORDS = /^(trainee|intern|interns|internship|analyst|manager|associate|engineer|consultant|executive|coordinator|co-ordinator|lead|head|director|developer|researcher|assistant|officer|specialist|fellow|member|president|secretary|representative|volunteer|founder|co-founder|editor|writer|designer|scientist|architect|administrator|strategist|advisor|adviser|mentor|tutor|captain|treasurer|ambassador|organiser|organizer|convenor|convener|chair|chairperson|vice-president|vice-coordinator|apprentice|leader|owner|partner|programmer|technician|supervisor|trustee|curator|moderator|facilitator|instructor|lecturer|professor|assistant)$/i;
const ORG_SUFFIX = /^(limited|ltd\.?|pvt\.?|private|inc\.?|llc|llp|corp\.?|corporation|bank|university|college|institute|school|foundation|technologies|technology|solutions|services|group|company|co\.?|labs|lab|consulting|consultants|ventures|industries|systems|enterprises|authority|council|association|society|club|ministry|department|academy|centre|center|trust|bureau)$/i;
function splitRoleOrg(parts, fonts) {
  const txt = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!txt) return { role: '', org: '' };
  // 1. a change of font inside the heading usually separates role from organisation
  if (parts.length > 1 && fonts && fonts[0] && fonts.some(f => f && f !== fonts[0])) {
    let k = 0; while (k < parts.length && (!fonts[k] || fonts[k] === fonts[0])) k++;
    if (k > 0 && k < parts.length) return { role: parts.slice(0, k).join(' ').trim(), org: parts.slice(k).join(' ').trim() };
  }
  // 2. explicit separators
  let m = /^(.+?)\s+(?:\||@|—|–|-|at)\s+(.+)$/i.exec(txt); if (m && m[2].length > 1) return { role: m[1].trim(), org: m[2].trim() };
  m = /^(.+?),\s+(.+)$/.exec(txt); if (m && !/\b(and|&)\b/i.test(m[1]) && m[1].split(' ').length <= 6 && ROLE_WORDS.test(m[1].split(' ').pop())) return { role: m[1].trim(), org: m[2].trim() };
  // 3. last role word in the line, the rest is the organisation
  const toks = txt.split(' ');
  let last = -1; toks.forEach((t, i) => { if (ROLE_WORDS.test(t.replace(/[.,;]+$/, ''))) last = i; });
  if (last >= 0 && last < toks.length - 1 && toks.length - last - 1 >= 1) {
    const rest = toks.slice(last + 1);
    if (rest.some(t => ORG_SUFFIX.test(t) || /^[A-Z][A-Za-z&.]*$/.test(t))) return { role: toks.slice(0, last + 1).join(' '), org: rest.join(' ') };
  }
  // 4. trailing ALL-CAPS acronym (DMRC, NPCI, BBPS) is the organisation
  const tail = toks[toks.length - 1];
  if (toks.length >= 3 && /^[A-Z][A-Z&.]{1,9}$/.test(tail) && !/^[A-Z][A-Z&.]{1,9}$/.test(toks[toks.length - 2])) return { role: toks.slice(0, -1).join(' '), org: tail };
  // 5. organisation suffix word (Limited, University...) - take the capitalised run before it
  const si = toks.findIndex((t, i) => i > 0 && ORG_SUFFIX.test(t));
  if (si > 0) { let st = si; while (st > 1 && /^[A-Z]/.test(toks[st - 1])) st--; return { role: toks.slice(0, st).join(' '), org: toks.slice(st).join(' ') }; }
  return { role: txt, org: '' };
}

// ---------------------------------------------------------------- text extraction
let _pdfjs = null;
async function pdfjs() {
  if (_pdfjs) return _pdfjs;
  const file = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  _pdfjs = await import(pathToFileURL(file).href);
  return _pdfjs;
}

// Returns positioned lines: [{page, y, size, cells:[{x, end, text}]}], pageWidth
// Limits so a hostile or accidental huge file cannot freeze or exhaust the app.
const MAX_FILE_BYTES = 25 * 1048576, MAX_PDF_PAGES = 30, MAX_ZIP_ENTRIES = 3000, MAX_ZIP_EXPANDED = 300 * 1048576;
// Opens a zip after checking entry count and total uncompressed size (zip-bomb guard).
async function loadZipSafe(buf) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  if (names.length > MAX_ZIP_ENTRIES) throw new Error('This archive has too many files to be a CV or a LinkedIn export.');
  let total = 0; for (const n of names) { const d = zip.files[n]._data; total += (d && d.uncompressedSize) || 0; }
  if (total > MAX_ZIP_EXPANDED) throw new Error('This archive expands to an unreasonable size, so it was not opened.');
  return zip;
}
async function pdfLines(buf) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  const lines = []; let pageWidth = 595;
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PDF_PAGES); p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 }); pageWidth = vp.width;
    const tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim() !== '').map(i => ({ x: i.transform[4], y: vp.height - i.transform[5], w: i.width, size: Math.abs(i.transform[3]) || i.height, str: i.str, fn: i.fontName }));
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    let cur = null;
    for (const it of items) {
      const tol = Math.max(3.2, 0.5 * Math.max(it.size, cur ? cur.size : 0));
      if (!cur || it.y - cur.lastY > tol) { cur = { page: p, y: it.y, lastY: it.y, size: it.size, items: [] }; lines.push(cur); }
      cur.lastY = it.y; cur.items.push(it); cur.size = Math.max(cur.size, it.size);
      cur.y = cur.items.reduce((m, q) => Math.max(m, q.y), 0); // baseline = lowest item
    }
  }
  for (const ln of lines) {
    ln.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const it of ln.items) {
      const last = cells[cells.length - 1];
      const gap = last ? it.x - last.end : 0;
      const startsBullet = /^[\u2022\u25AA\u25CF\u25E6\u00B7\u2023\u25A0\u2219]/.test(it.str.trim());
      const rightCol = it.x >= pageWidth * 0.915;
      if (last && gap < Math.max(5, it.size * 0.9) && !startsBullet && !(rightCol && last.x < pageWidth * 0.915) && (it.fn === last.fn || !last.text.trim() || gap < 1.5)) { last.text += (gap > 0.8 && !/\s$/.test(last.text) && !/^\s/.test(it.str) ? ' ' : '') + it.str; last.end = it.x + it.w; }
      else cells.push({ x: it.x, end: it.x + it.w, text: it.str, fn: it.fn });
    }
    ln.cells = cells.map(c => ({ x: c.x, end: c.end, fn: c.fn, text: c.text.replace(/\s+/g, ' ').trim() })).filter(c => c.text);
    delete ln.items;
  }
  return { lines: lines.filter(l => l.cells.length), pageWidth, positional: true };
}

// Text in content-stream order, the way most parsers (pdfminer, pdf.js text layer, many ATS) read it.
async function pdfStreamText(buf) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  let out = '';
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PDF_PAGES); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items) out += it.str + (it.hasEOL ? '\n' : ' ');
    out += '\n';
  }
  return out;
}

function textToLines(text) {
  const lines = [];
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const t = raw.replace(/\t/g, '  ');
    if (!t.trim()) { lines.push({ blank: true, cells: [], y: 0 }); continue; }
    const indent = t.length - t.trimStart().length;
    lines.push({ cells: [{ x: indent, end: indent + t.trim().length, text: t.trim() }], y: lines.length, size: 10 });
  }
  return { lines, pageWidth: 100, positional: false };
}

function xmlText(s) { return s.replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)); }

async function docxLines(buf) {
  const zip = await loadZipSafe(buf);
  const xml = await zip.file('word/document.xml').async('string');
  const body = xml.slice(xml.indexOf('<w:body'));
  const lines = [];
  const pushPara = (pxml) => {
    const runs = [...pxml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map(m => m[0] === '<w:tab/>' ? '\t' : xmlText(m[1]));
    let t = runs.join('');
    if (!t.trim()) return;
    if (/<w:numPr>/.test(pxml) && !/^[•\-–]/.test(t.trim())) t = '• ' + t.trim();
    lines.push({ cells: [{ x: 0, end: 0, text: t.trim() }], y: lines.length, size: 10 });
  };
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g; let m;
  while ((m = re.exec(body))) {
    if (m[0].startsWith('<w:tbl>')) {
      for (const tr of m[0].match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []) {
        const cells = [];
        for (const tc of tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []) {
          const paras = (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(p => xmlText(p)).filter(s => s.trim());
          const text = paras.join(' ').replace(/\s+/g, ' ').trim();
          if (text) cells.push({ x: cells.length * 100, end: cells.length * 100 + 90, text });
        }
        if (cells.length) lines.push({ cells, y: lines.length, size: 10, fromTable: true });
      }
    } else pushPara(m[0]);
  }
  return { lines, pageWidth: 600, positional: false };
}

async function odtLines(buf) {
  const zip = await loadZipSafe(buf);
  const xml = await zip.file('content.xml').async('string');
  const out = [];
  for (const m of xml.matchAll(/<text:(p|h)[^>]*>([\s\S]*?)<\/text:\1>/g)) {
    const t = xmlText(m[2].replace(/<text:tab\/>/g, '\t')).trim();
    if (t) out.push(t);
  }
  return textToLines(out.join('\n'));
}
function htmlToText(h) {
  return h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<li[^>]*>/gi, '\n• ').replace(/<\/(p|div|h\d|tr|ul|ol|section|header)>|<br\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, '   ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, '\n');
}
function rtfToText(r) {
  return r.replace(/\\par[d]?/g, '\n').replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\tab/g, '\t').replace(/\{\\\*[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '');
}

// ---------------------------------------------------------------- parsing
const BULLET = /^[•▪●◦·‣⁃■∙*\-–—]\s*/;
const HEADINGS = [
  [/^education( and qualifications?)?|^academics?$|^academic (background|qualifications?)/i, 'education'],
  [/^internships?( and trainings?)?$|^trainings?$/i, 'internship'],
  [/^(work|professional|relevant|employment|career) (experience|history)|^experience$|^employment$/i, 'work'],
  [/^(academic )?projects?$|^personal projects?$|^project work$/i, 'project'],
  [/^certifications?|^certificates?$|^courses?( and certifications?)?$|^licen[sc]es?/i, 'certification'],
  [/^positions? of responsibility|^responsibilit|^leadership|^roles? and responsibilit/i, 'position'],
  [/^(awards?|honou?rs?|achievements?|accomplishments?|scholarships?)( and (awards?|achievements?|honou?rs?))?$|^academic\/?\s*co-?curricular$/i, 'award'],
  [/^extra[- ]?curricular|^co-?curricular|^activities$/i, 'extracurricular'],
  [/^other (initiatives?|activities|information|achievements?)|^initiatives?$|^additional (information|activities)/i, 'initiative'],
  [/^(technical |key |core )?skills?( and (tools|interests|competenc\w+))?$|^competenc\w+$|^tools( and technologies)?$/i, 'skill'],
  [/^languages?$/i, 'language'],
  [/^publications?|^papers?$|^research$/i, 'publication'],
  [/^volunteer(ing)?( experience)?$|^social (work|service)$/i, 'volunteering'],
  [/^(career )?milestones?$|^highlights$/i, 'project']
];
function headingType(text) {
  const t = text.replace(/[:\-–]+$/, '').trim();
  if (t.length > 45 || t.split(' ').length > 6) return null;
  for (const [rx, type] of HEADINGS) if (rx.test(t)) return type;
  return null;
}
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const DATE_RX = /(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s’'`,.-]*((?:19|20)?\d{2}))|(\b(?:19|20)\d{2}\b)|(present|current|ongoing|till date|now)/gi;
function parseDates(str) {
  const found = [];
  let m; DATE_RX.lastIndex = 0;
  while ((m = DATE_RX.exec(str))) {
    if (m[1]) { let y = m[2]; if (y.length === 2) y = (+y > 50 ? '19' : '20') + y; found.push(y + '-' + String(MON[m[1].toLowerCase()]).padStart(2, '0')); }
    else if (m[3]) found.push(m[3]);
    else found.push('present');
  }
  if (!found.length) return { start: '', end: '' };
  if (found.length === 1) return { start: found[0] === 'present' ? '' : found[0], end: found[0] };
  return { start: found[0], end: found[1] };
}
function looksDate(str) {
  const t = str.trim();
  if (!t) return false;
  DATE_RX.lastIndex = 0;
  const stripped = t.replace(DATE_RX, '').replace(/[\s\-–—’'`,./()]|months?|years?|\d+/gi, '');
  return stripped.length === 0 || /^\d+\s*(months?|years?)/i.test(t) === true;
}
const TRAIL_DATE = /[\s,|(\-–]*((?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s’'`,.]*\d{2,4}|(?:19|20)\d{2}|present|current)(?:\s*[\-–—to]+\s*(?:(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s’'`,.]*\d{2,4})|(?:19|20)\d{2}|present|current))?)\s*\)?\s*$/i;
function splitTrailingDate(text) {
  const m = TRAIL_DATE.exec(text);
  if (!m || m.index === 0) return { text, date: '' };
  return { text: text.slice(0, m.index).replace(/[\s,|\-–]+$/, '').trim(), date: m[1] };
}
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/;
const LINK = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|medium\.com)\/[^\s|,]+/i;

function parseLines(src, opts) {
  opts = opts || {};
  const { lines, pageWidth, positional } = src;
  const cands = []; const warnings = []; const header = { name: '', headline: '', email: '', phone: '', address: '', dob: '', links: [], photo: '' };
  const sectionsFound = [];
  let sec = null, secLines = [];
  const preface = [];
  const flushSection = () => { if (sec) { parseSection(sec, secLines); } secLines = []; };

  // find headings
  for (const ln of lines) {
    if (ln.blank) { if (sec) secLines.push(ln); continue; }
    const first = ln.cells[0].text;
    const tailOk = ln.cells.length > 1 && ln.cells.slice(1).every(c => looksDate(c.text) || /^\d+\s*(months?|years?|yrs?)$/i.test(c.text));
    const ht = ln.cells.length === 1 || tailOk ? headingType(first) : null;
    const isCaps = first === first.toUpperCase() && /[A-Z]/.test(first);
    const unknownCapsHeading = ln.cells.length === 1 && isCaps && first.length >= 4 && first.length <= 40 && !BULLET.test(first) && !EMAIL.test(first) && !/\d/.test(first) && positional !== false && sec !== null;
    if (ht || (ln.cells.length === 1 && isCaps && first.length <= 40 && !/\d/.test(first) && sec === null && preface.length >= 1 && headingType(first))) {
      flushSection(); sec = { name: first, type: ht }; sectionsFound.push(first); continue;
    }
    if (unknownCapsHeading && !positional) { flushSection(); sec = { name: first, type: 'initiative' }; sectionsFound.push(first); continue; }
    if (unknownCapsHeading && positional && ln.cells[0].x < 60) { flushSection(); sec = { name: first, type: 'initiative' }; sectionsFound.push(first); continue; }
    if (!sec) preface.push(ln); else secLines.push(ln);
  }
  flushSection();

  // header from preface
  const big = preface.slice().sort((a, b) => (b.size || 0) - (a.size || 0))[0];
  const textOf = l => l.cells.map(c => c.text).join(' ');
  if (preface.length) {
    const nameLine = (big && (big.size || 0) > (preface.reduce((s, l) => s + (l.size || 0), 0) / preface.length) + 0.5) ? big : preface.find(l => !EMAIL.test(textOf(l)) && !PHONE.test(textOf(l))) || preface[0];
    header.name = nameLine ? textOf(nameLine).replace(/\s+/g, ' ').trim() : '';
    const all = preface.map(textOf).join(' | ');
    const em = EMAIL.exec(all); if (em) header.email = em[0];
    const ph = PHONE.exec(all.replace(EMAIL, '')); if (ph) header.phone = ph[0].trim();
    const lk = all.match(new RegExp(LINK.source, 'gi')); if (lk) header.links = lk;
    const rest = preface.filter(l => l !== nameLine).map(textOf).filter(t => t && !EMAIL.test(t) && !PHONE.test(t) && !LINK.test(t));
    const hl = rest.find(t => !/\b(male|female)\b|^\W*\d{2}\W*$/i.test(t));
    if (hl) header.headline = hl.slice(0, 120);
  }

  function addCand(c) {
    cands.push(Object.assign({ tempId: M.uid('c'), type: 'initiative', text: '', title: '', org: '', role: '', location: '', start: '', end: '', tags: [], extra: {}, section: sec && sec.name, needsReview: false }, c));
  }

  function parseSection(sec, ls) {
    const type = sec.type || 'initiative';
    const real = ls.filter(l => !l.blank);
    if (!real.length) return;
    // Skills / languages: split into items
    if (type === 'skill' || type === 'language') {
      for (const ln of real) {
        const t = ln.cells.map(c => c.text).join(' ').replace(BULLET, '');
        const cm = /^([^:]{2,40}):\s*(.+)$/.exec(t);
        const cat = cm ? cm[1].trim() : '';
        const list = (cm ? cm[2] : t).split(/[,;|•]/).map(s => s.trim()).filter(s => s && s.length < 60);
        for (const s of list) addCand({ type, title: s, text: '', extra: cat ? { category: cat } : {} });
      }
      return;
    }
    // Education tables (>= 3 cells per line)
    if (type === 'education') {
      const cellRows = real.filter(l => l.cells.length >= 3 && !l.cells.some(c => BULLET.test(c.text)));
      for (const ln of cellRows) {
        const cs = ln.cells.map(c => c.text);
        if (/^(degree|qualification|course|exam)/i.test(cs[0]) && /(year|institut|school|board)/i.test(cs.join(' '))) continue;
        const yi = cs.findIndex((c, i) => i > 0 && looksDate(c) && /\d{4}/.test(c));
        if (yi < 0) continue;
        const d = parseDates(cs[yi]);
        const rest = cs.filter((c, i) => i !== 0 && i !== yi);
        addCand({ type: 'education', title: cs[0], org: rest[0] || '', start: d.start, end: d.end, extra: { score: rest[1] || '', remarks: rest.slice(2).join(' ') } });
      }
      const handled = new Set(cellRows);
      secLines = real.filter(l => !handled.has(l));
      if (!secLines.length) return;
      real.splice(0, real.length, ...secLines);
    }
    // gaps for group detection
    const gaps = []; for (let i = 1; i < real.length; i++) if (positional && real[i].page === real[i - 1].page) gaps.push(real[i].y - real[i - 1].y);
    gaps.sort((a, b) => a - b);
    const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;

    let grp = null; let lastBullet = null; let bulletTextX = null; let bulletGlyphX = null;
    const newGroup = () => { grp = { label: [], lf: [], dates: [], bullets: [] }; lastBullet = null; };
    const lp = (t, f) => { grp.label.push(t); grp.lf.push(f || ''); };
    const flush = () => {
      if (!grp || !grp.bullets.length) { grp = null; return; }
      const label = grp.label.join(' ').replace(/\s+/g, ' ').trim();
      let roleTxt = label, orgTxt = '';
      if (type !== 'education') { const so = splitRoleOrg(grp.label, grp.lf); roleTxt = so.role; orgTxt = so.org; }
      const dd = parseDates(grp.dates.join(' '));
      const flat = grp.bullets.some(b => b.date);
      for (const b of grp.bullets) {
        const bd = b.date ? parseDates(b.date) : null;
        addCand({
          type: type === 'custom' ? 'initiative' : type, text: b.text.trim(), role: flat ? '' : roleTxt, org: flat ? '' : orgTxt,
          tags: flat && label ? [label] : [], start: bd ? bd.start : dd.start, end: bd ? bd.end : dd.end,
          needsReview: !!label && !flat
        });
      }
      grp = null;
    };
    newGroup();
    for (let i = 0; i < real.length; i++) {
      const ln = real[i];
      const cells = ln.cells;
      const prev = real[i - 1];
      if (i === 0 && positional && cells.length >= 2 && !cells.some(c => BULLET.test(c.text) || looksDate(c.text)) && type !== 'education') continue; // table column header
      if (positional && prev && med && ln.page === prev.page && (ln.y - prev.y) > med * 1.32 && grp.bullets.length) { flush(); newGroup(); }
      if (positional && prev && ln.page !== prev.page && grp.bullets.length && false) { flush(); newGroup(); }
      let bi = cells.findIndex(c => BULLET.test(c.text) && (c.text.length === 1 || /^[•▪●◦·]/.test(c.text) || !positional || c.text.length > 2));
      // in positional mode, a leading "-" inside normal text is not a bullet unless it is the first token
      if (positional && bi > 0 && !/^[•▪●◦·‣■∙]/.test(cells[bi].text)) bi = -1;
      if (bi >= 0) {
        const labelCells = positional ? cells.slice(0, bi) : [];
        let rest = cells.slice(bi);
        let date = '';
        if (positional) {
          const last = rest[rest.length - 1];
          if (rest.length > 1 && last.x > pageWidth * 0.8 && looksDate(last.text)) { date = last.text; rest = rest.slice(0, -1); }
          else if (rest.length > 1 && last.x > pageWidth * 0.8 && /^\d+\s*months?$/i.test(last.text)) { rest = rest.slice(0, -1); }
        }
        let text = rest.map(c => c.text).join(' ').replace(BULLET, '').trim();
        // some PDFs glue the bullet to the next text: x of the text start
        if (positional && rest.length > 1 && /^[•▪●]$/.test(rest[0].text)) bulletTextX = rest[1].x; else if (positional) bulletTextX = rest[0].x + 8;
        if (!positional) { const sd = splitTrailingDate(text); if (sd.date && sd.text.length > 15) { text = sd.text; date = sd.date; } }
        for (const c of labelCells) if (!looksDate(c.text)) lp(c.text, c.fn); else grp.dates.push(c.text);
        if (date && !(positional && grp.bullets.length && false)) { if (type === 'award' || type === 'certification' || type === 'extracurricular' || type === 'initiative' || type === 'custom' || labelCells.length === 0 && !grp.label.length && false) { /* per-bullet date */ } }
        lastBullet = { text, date: '' };
        // dates: per-bullet for flat sections, group-level for experience-like ones
        const perBullet = ['award', 'certification', 'extracurricular', 'initiative', 'custom', 'publication'].includes(type);
        if (date) { if (perBullet) lastBullet.date = date; else grp.dates.push(date); }
        grp.bullets.push(lastBullet);
        continue;
      }
      // no bullet
      if (positional && lastBullet && bulletGlyphX != null && cells[0].x >= bulletGlyphX - 6 && cells[0].x < bulletTextX - 3 && !looksDate(cells[0].text)) {
        flush(); newGroup(); for (const c of cells.filter(c => !(looksDate(c.text) && c.x > pageWidth * 0.7))) lp(c.text, c.fn);
        for (const c of cells) if (looksDate(c.text) && c.x > pageWidth * 0.7) grp.dates.push(c.text);
        continue;
      }
      if (positional && lastBullet && cells[0].x >= (bulletTextX || 0) - 4 && !(looksDate(cells[0].text) && cells.length === 1)) {
        let rest = cells; let date = '';
        const last = rest[rest.length - 1];
        if (rest.length > 1 && last.x > pageWidth * 0.8 && looksDate(last.text)) { date = last.text; rest = rest.slice(0, -1); }
        lastBullet.text += ' ' + rest.map(c => c.text).join(' ');
        if (date) { if (lastBullet.date !== undefined && ['award', 'certification', 'extracurricular', 'initiative', 'custom', 'publication'].includes(type)) lastBullet.date = date; else grp.dates.push(date); }
        continue;
      }
      // label-only / date-only lines
      const texts = cells.map(c => c.text);
      if (!positional) {
        // text mode: a non-bullet line starts a new group (role/org line, possibly with trailing date)
        if (grp.bullets.length) { flush(); newGroup(); }
        const joined = texts.join('  ');
        const sd = splitTrailingDate(joined);
        lp(sd.text || joined, '');
        if (sd.date) grp.dates.push(sd.date);
        continue;
      }
      for (const c of cells) {
        if (looksDate(c.text) && c.x > pageWidth * 0.7) grp.dates.push(c.text);
        else if (!grp.bullets.length || c.x < (bulletTextX || 9999) - 20) lp(c.text, c.fn);
        else if (lastBullet) lastBullet.text += ' ' + c.text;
      }
    }
    flush();
  }

  // post: attach education dates formatting; skills ok.
  return { header, candidates: cands, sections: sectionsFound, warnings };
}

// ---------------------------------------------------------------- structured sources
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
async function linkedinZip(buf) {
  const zip = await loadZipSafe(buf);
  const get = async (re) => { const f = Object.keys(zip.files).find(n => re.test(n)); return f ? parseCSV(await zip.file(f).async('string')) : []; };
  const cands = []; const hdr = { name: '', headline: '', email: '', phone: '', address: '', dob: '', links: [], photo: '' };
  const prof = (await get(/(^|\/)Profile\.csv$/i))[0];
  if (prof) { hdr.name = ((prof['First Name'] || '') + ' ' + (prof['Last Name'] || '')).trim(); hdr.headline = prof['Headline'] || ''; hdr.address = prof['Geo Location'] || ''; }
  const mk = c => cands.push(Object.assign({ tempId: M.uid('c'), type: 'initiative', text: '', title: '', org: '', role: '', location: '', start: '', end: '', tags: [], extra: {}, section: 'LinkedIn', needsReview: false }, c));
  for (const p of await get(/(^|\/)Positions\.csv$/i)) {
    const s = parseDates(p['Started On'] || ''), e = (p['Finished On'] || '').trim() ? parseDates(p['Finished On']) : { start: '', end: 'present' };
    const desc = (p['Description'] || '').split(/\n|•/).map(x => x.trim()).filter(Boolean);
    const base = { type: 'work', org: p['Company Name'], role: p['Title'], location: p['Location'], start: s.start, end: e.end || e.start };
    if (!desc.length) mk(Object.assign({}, base, { text: p['Title'] + ' at ' + p['Company Name'] })); else for (const d of desc) mk(Object.assign({}, base, { text: d }));
  }
  for (const p of await get(/(^|\/)Education\.csv$/i)) {
    const s = parseDates(p['Start Date'] || ''), e = parseDates(p['End Date'] || '');
    mk({ type: 'education', title: p['Degree Name'] || '', org: p['School Name'], start: s.start ? s.start.slice(0, 4) : '', end: e.end ? e.end.slice(0, 4) : '', text: p['Notes'] || '' });
  }
  for (const p of await get(/(^|\/)Certifications\.csv$/i)) { const s = parseDates(p['Started On'] || ''); mk({ type: 'certification', title: p['Name'], org: p['Authority'], text: p['Name'] + (p['Authority'] ? ' (' + p['Authority'] + ')' : ''), link: p['Url'] || '', start: s.start, end: s.end }); }
  for (const p of await get(/(^|\/)Skills\.csv$/i)) if (p['Name']) mk({ type: 'skill', title: p['Name'] });
  for (const p of await get(/(^|\/)Projects\.csv$/i)) { const s = parseDates(p['Started On'] || ''), e = parseDates(p['Finished On'] || ''); mk({ type: 'project', title: p['Title'], text: p['Description'] || p['Title'], start: s.start, end: e.end || e.start }); }
  return { header: hdr, candidates: cands, sections: ['LinkedIn export'], warnings: cands.length ? [] : ['No LinkedIn CSV files recognised in this ZIP.'] };
}
function jsonResume(j) {
  const cands = []; const b = j.basics || {};
  const header = { name: b.name || '', headline: b.label || '', email: b.email || '', phone: b.phone || '', address: (b.location && (b.location.address || b.location.city)) || '', dob: '', links: (b.profiles || []).map(p => p.url).filter(Boolean), photo: '' };
  const mk = c => cands.push(Object.assign({ tempId: M.uid('c'), type: 'initiative', text: '', title: '', org: '', role: '', location: '', start: '', end: '', tags: [], extra: {}, section: 'JSON Resume', needsReview: false }, c));
  const d = x => (x || '').slice(0, 7);
  for (const w of j.work || []) { const hl = (w.highlights && w.highlights.length ? w.highlights : (w.summary ? [w.summary] : [])); for (const h of hl.length ? hl : [(w.position || '') + ' at ' + (w.name || '')]) mk({ type: 'work', org: w.name, role: w.position, location: w.location, start: d(w.startDate), end: w.endDate ? d(w.endDate) : 'present', text: h }); }
  for (const e of j.education || []) mk({ type: 'education', title: [e.studyType, e.area].filter(Boolean).join(' '), org: e.institution, start: (e.startDate || '').slice(0, 4), end: (e.endDate || '').slice(0, 4), extra: { score: e.score || '' } });
  for (const p of j.projects || []) for (const h of (p.highlights && p.highlights.length ? p.highlights : [p.description || p.name])) mk({ type: 'project', title: p.name, text: h, start: d(p.startDate), end: d(p.endDate), link: p.url });
  for (const a of j.awards || []) mk({ type: 'award', text: a.title + (a.summary ? ': ' + a.summary : ''), org: a.awarder, end: d(a.date), start: d(a.date) });
  for (const c of j.certificates || []) mk({ type: 'certification', title: c.name, text: c.name, org: c.issuer, end: d(c.date), start: d(c.date), link: c.url });
  for (const v of j.volunteer || []) for (const h of (v.highlights && v.highlights.length ? v.highlights : [v.summary || v.position])) mk({ type: 'volunteering', org: v.organization, role: v.position, text: h, start: d(v.startDate), end: d(v.endDate) });
  for (const s of j.skills || []) for (const k of s.keywords && s.keywords.length ? s.keywords : [s.name]) mk({ type: 'skill', title: k, extra: s.keywords && s.keywords.length ? { category: s.name } : {} });
  for (const l of j.languages || []) mk({ type: 'language', title: l.language, extra: { level: l.fluency || '' } });
  for (const p of j.publications || []) mk({ type: 'publication', title: p.name, text: p.name, org: p.publisher, end: d(p.releaseDate), start: d(p.releaseDate), link: p.url });
  return { header, candidates: cands, sections: ['JSON Resume'], warnings: [] };
}

// ---------------------------------------------------------------- entry points
async function extractText(file) {
  const ext = path.extname(file).toLowerCase();
  const st = fs.statSync(file);
  if (st.size > MAX_FILE_BYTES) throw new Error('That file is too large to import (limit ' + Math.round(MAX_FILE_BYTES / 1048576) + ' MB).');
  if (st.size === 0) throw new Error('That file is empty.');
  const buf = fs.readFileSync(file);
  let src;
  if (ext === '.pdf') src = await pdfLines(buf);
  else if (ext === '.docx' || ext === '.dotx') src = await docxLines(buf);
  else if (ext === '.odt') src = await odtLines(buf);
  else if (ext === '.html' || ext === '.htm') src = textToLines(htmlToText(buf.toString('utf8')));
  else if (ext === '.rtf') src = textToLines(rtfToText(buf.toString('latin1')));
  else if (ext === '.txt' || ext === '.md' || ext === '.markdown') src = textToLines(buf.toString('utf8'));
  else if (ext === '.doc') throw new Error('Old .doc files are not supported offline. Open it in Word and save as .docx or PDF, then import that.');
  else if (['.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff', '.webp'].includes(ext)) throw new Error('Importing from images needs OCR, which is not included in this version. Save the CV as PDF or DOCX first.');
  else throw new Error('Unsupported file type: ' + (ext || 'unknown'));
  return src;
}
function rawTextOf(src) { return src.lines.map(l => l.blank ? '' : l.cells.map(c => c.text).join('   ')).join('\n'); }

async function importFile(file, existingItems) {
  const ext = path.extname(file).toLowerCase();
  let res;
  const st = fs.statSync(file);
  if (st.size > MAX_FILE_BYTES) throw new Error('That file is too large to import (limit ' + Math.round(MAX_FILE_BYTES / 1048576) + ' MB).');
  if (st.size === 0) throw new Error('That file is empty.');
  if (ext === '.zip') res = await linkedinZip(fs.readFileSync(file));
  else if (ext === '.json') {
    let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error('That JSON file is damaged or not valid JSON.'); }
    if (!j || typeof j !== 'object') throw new Error('That JSON file does not contain a CV.');
    if (j.kind === 'cvbuilder-cv') res = { header: j.cv.header, candidates: (j.items || []).map(i => Object.assign({}, i, { tempId: M.uid('c'), section: 'CV Builder export', needsReview: false })), sections: ['CV Builder export'], warnings: [] };
    else if (j.kind === 'cvbuilder-repository') res = { header: (j.settings && j.settings.header) || {}, candidates: (j.items || []).map(i => Object.assign({}, i, { tempId: M.uid('c'), section: 'Repository export', needsReview: false })), sections: ['Repository export'], warnings: [] };
    else res = jsonResume(j);
  } else {
    const src = await extractText(file);
    res = parseLines(src);
    res.rawText = rawTextOf(src);
    if (!res.candidates.length) res.warnings.push('No items could be recognised automatically. The raw text is shown so you can copy pieces into new entries.');
  }
  const base = path.basename(file);
  flagDuplicates(res.candidates, existingItems, base);
  res.file = base;
  return res;
}
// Mark each candidate with the id of a near-identical existing entry (so the review screen can untick it).
function flagDuplicates(candidates, existingItems, source) {
  for (const c of candidates) {
    c.source = source; c.dupOf = null;
    const t = c.text || c.title;
    if (t && existingItems) for (const it of existingItems) {
      if (S.textSim(t, M.itemText(it) || it.title) >= 0.82) { c.dupOf = it.id; break; }
    }
  }
}
// Paste text directly
function importPastedText(text, existingItems) {
  const res = parseLines(textToLines(text));
  if (!res.candidates.length) {   // no headings: treat every non-empty line as one entry for the user to sort out in the review
    res.candidates = String(text || '').split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, '').trim()).filter(l => l.length > 8).map(l => ({ tempId: M.uid('c'), type: 'initiative', text: l, title: '', org: '', role: '', location: '', start: '', end: '', tags: [], extra: {}, section: '', needsReview: true }));
    res.header = {}; res.warnings = (res.warnings || []).concat(['No headings were found, so each line was added as a separate entry. Set the type and organisation below.']);
  }
  res.rawText = text; res.file = 'pasted text';
  flagDuplicates(res.candidates, existingItems, 'pasted text');
  return res;
}

module.exports = { MAX_FILE_BYTES, loadZipSafe, pdfStreamText, importFile, importPastedText, extractText, parseLines, parseDates, splitTrailingDate, pdfLines, textToLines, headingType, parseCSV, rawTextOf };
