'use strict';
const T = require('./templates');
const M = require('./model');

function requireDocx() { try { return require('docx'); } catch (e) { throw new Error('The "docx" package is not installed. Run npm install.'); } }

// How each built-in template looks in Word. Word cannot draw CSS, so each one gets the closest simple equivalent:
// header (centred, left, or a coloured band), heading style (rule under, bar beside, filled strip, plain), bullet character and font.
const DOCX_LOOKS = {
  classic: { head: 'center', name: 2.1, nameAccent: true, h2: 'rule', bullet: '\u2022', italicHl: true },
  'ats-plain': { font: 'Arial', head: 'left', name: 1.7, h2: 'rule', mono: true, bullet: '-' },
  modern: { head: 'band', name: 2.2, h2: 'bar', bullet: '\u25AA', bulletAccent: true },
  compact: { head: 'left', name: 1.7, headRule: true, h2: 'fill', fill: 'EEEEEE', h2Dark: true, bullet: '-' },
  academic: { font: 'Cambria', head: 'center', name: 1.9, h2: 'rule', mono: true, bullet: '\u2013', italicHl: true },
  timeline: { head: 'left', name: 2.2, nameAccent: true, h2: 'plain', groupBar: true, bullet: '\u2022' },
  gridcv: { head: 'left', name: 1.8, h2: 'fill', bullet: '\u2022' },
  sidebar: { head: 'left', name: 2.1, nameAccent: true, headRule: true, h2: 'rule', bullet: '\u2022' },
  rightside: { head: 'left', name: 2.1, nameAccent: true, headRule: true, h2: 'rule', bullet: '\u2022' },
  darkside: { head: 'band', name: 2.3, h2: 'rule', bullet: '\u2022' },
  harvard: { font: 'Times New Roman', head: 'center', name: 2, h2: 'rule', mono: true, bullet: '\u2022' },
  executive: { head: 'band', name: 2.2, h2: 'rule', bullet: '\u2022' },
  swiss: { head: 'left', name: 2, h2: 'plain', bullet: '\u2013' },
  gutter: { head: 'left', name: 2, nameAccent: true, h2: 'plain', bullet: '\u2022' },
  banner: { head: 'band', name: 2.4, h2: 'fill', fill: 'tint', bullet: '\u2022' },
  boxed: { head: 'left', name: 2.2, nameAccent: true, h2: 'fill', bullet: '\u2022' },
  mono: { font: 'Consolas', head: 'left', name: 1.9, nameAccent: true, h2: 'rule', bullet: '*' },
  elegant: { font: 'Georgia', head: 'center', name: 2.3, nameAccent: true, h2: 'rule', bullet: '\u2022', italicHl: true },
  bold: { head: 'left', name: 2.6, h2: 'plain', h2Dark: true, headBar: true, bullet: '\u25B8' },
  dots: { head: 'left', name: 2.1, nameAccent: true, h2: 'plain', bullet: '\u2013' },
  euro: { head: 'left', name: 2, nameAccent: true, headRule: true, h2: 'plain', bullet: '\u2022' },
  chips: { head: 'left', name: 2.1, h2: 'plain', bullet: '\u2022' },
  ribbon: { head: 'left', name: 2.1, h2: 'fill', bullet: '\u2022' },
  journal: { font: 'Georgia', head: 'left', name: 2, h2: 'rule', mono: true, bullet: '\u2022' }
};
const WORD_FONTS = { calibri: 'Calibri', arial: 'Arial', helvetica: 'Arial', cambria: 'Cambria', georgia: 'Georgia', times: 'Times New Roman', 'times new roman': 'Times New Roman', garamond: 'Garamond', verdana: 'Verdana', tahoma: 'Tahoma', 'segoe ui': 'Segoe UI', consolas: 'Consolas', 'courier new': 'Courier New', palatino: 'Palatino Linotype', 'palatino linotype': 'Palatino Linotype', 'book antiqua': 'Book Antiqua', trebuchet: 'Trebuchet MS', 'trebuchet ms': 'Trebuchet MS', serif: 'Times New Roman', 'sans-serif': 'Calibri' };
function wordFont(css) {
  for (const part of String(css || '').split(',')) { const k = part.replace(/["']/g, '').trim().toLowerCase(); if (WORD_FONTS[k]) return WORD_FONTS[k]; }
  return 'Calibri';
}

// size and type of an embedded picture (data URL): only PNG and JPEG are placed in Word files
function imageOf(src) {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+\/=]+)$/i.exec(String(src || '')); if (!m) return null;
  const data = Buffer.from(m[2], 'base64'); let w = 0, hh = 0;
  try {
    if (/png/i.test(m[1])) { w = data.readUInt32BE(16); hh = data.readUInt32BE(20); }
    else { let i = 2; while (i < data.length) { if (data[i] !== 0xFF) { i++; continue; } const mk = data[i + 1]; if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) { hh = data.readUInt16BE(i + 5); w = data.readUInt16BE(i + 7); break; } i += 2 + data.readUInt16BE(i + 2); } }
  } catch (e) { w = hh = 0; }
  return { data, type: /png/i.test(m[1]) ? 'png' : 'jpg', ratio: w > 0 && hh > 0 ? Math.max(.5, Math.min(2, hh / w)) : 1 };
}

async function buildDocx(cv, items, settings, customTemplates) {
  const D = requireDocx();
  const m = T.buildModel(cv, items, settings);
  const look = DOCX_LOOKS[cv.templateId] || DOCX_LOOKS.classic;   // custom templates use the Classic look with their accent colour
  const accent = (m.opts.accent || '#1f4e79').replace('#', '').toUpperCase();
  const font = look.font || wordFont(m.opts.font);
  const ink = look.mono ? '000000' : '111111';
  const band = look.head === 'band';
  const sz = Math.round((m.opts.fontSize || 10) * 2);
  const sp = Math.max(0.4, +m.opts.spacing || 1);
  const pageW = m.page.size === 'Letter' ? 12240 : 11906, pageH = m.page.size === 'Letter' ? 15840 : 16838;
  const mar = Math.round((m.opts.margin || 14) * 56.7);
  const usable = pageW - 2 * mar;
  const run = (text, o) => new D.TextRun(Object.assign({ text, size: sz, font, color: ink }, o || {}));
  const kids = [];
  const solid = (c) => ({ style: D.BorderStyle.SINGLE, size: 4, color: c, space: 6 });
  const ctr = look.head === 'center' ? D.AlignmentType.CENTER : D.AlignmentType.LEFT;
  const hc = band ? 'FFFFFF' : null;   // text colour inside the band
  const bandBox = band ? { shading: { type: D.ShadingType.CLEAR, fill: accent, color: 'auto' }, border: { top: solid(accent), bottom: solid(accent), left: solid(accent), right: solid(accent) } } : {};
  const nameRun = run(m.header.name, { bold: true, size: Math.round(sz * look.name), color: hc || (look.nameAccent ? accent : ink) });
  const lastHead = (m.header.nameExtra ? 1 : 0) + (m.header.headline ? 1 : 0) + (m.header.rows || []).length;
  // photo and QR code sit in a borderless table beside the name (inline pictures: they show in every version of Word)
  const pics = [];
  const photo = m.header.showPhoto ? imageOf(m.header.photo) : null;
  if (photo) pics.push({ kind: 'photo', data: photo.data, type: photo.type, w: 84, h: Math.round(84 * photo.ratio) });
  if (cv.qr && cv.qr.on && cv.qr.url && !cv.privacy) {
    try { const QR = require('./qr'); const px = Math.round(Math.max(40, Math.min(120, +cv.qr.size || 64)) * 1.1); pics.push({ kind: 'qr', data: QR.png(cv.qr.url, 8), type: 'png', w: px, h: px, alt: cv.qr.url }); } catch (e) { /* no QR in the file */ }
  }
  if (cv.qr && cv.qr.swap) pics.reverse();   // swapped: the QR code takes the photo's side
  const inTable = pics.length > 0;
  const hdrPara = (kidsArr, o) => new D.Paragraph(Object.assign({ alignment: ctr, children: kidsArr }, inTable ? {} : bandBox, o || {}));
  const textParas = [hdrPara([nameRun], look.headBar ? { border: { left: { style: D.BorderStyle.SINGLE, size: 48, color: accent, space: 8 } } } : (look.headRule && !lastHead ? { border: { bottom: { style: D.BorderStyle.SINGLE, size: 12, color: accent, space: 2 } } } : {}))];
  const hdrLines = [];
  if (m.header.nameExtra) hdrLines.push([run(m.header.nameExtra, { size: 18, color: hc || ink })]);
  if (m.header.headline) hdrLines.push([run(m.header.headline, { italics: !!look.italicHl, bold: !look.italicHl && !band, color: hc || ink })]);
  for (const r of (m.header.rows || [])) hdrLines.push([run(r.join('   \u00B7   '), { color: hc || ink })]);
  hdrLines.forEach((ch, i) => textParas.push(hdrPara(ch, i === hdrLines.length - 1 && look.headRule ? { border: { bottom: { style: D.BorderStyle.SINGLE, size: 12, color: accent, space: 4 } } } : {})));
  if (!inTable) textParas.forEach(p => kids.push(p));
  else {
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }; const nob = { top: none, bottom: none, left: none, right: none };
    const picW = Math.round(Math.max(...pics.map(p => p.w)) * 15 + 240);
    const cell = (children, width, align) => new D.TableCell({ children, width: { size: width, type: D.WidthType.DXA }, borders: nob, verticalAlign: D.VerticalAlign.CENTER, margins: { top: 60, bottom: 60, left: 100, right: 100 }, shading: band ? { type: D.ShadingType.CLEAR, fill: accent, color: 'auto' } : undefined });
    const picCell = (p) => cell([new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.ImageRun({ type: p.type, data: p.data, transformation: { width: p.w, height: p.h }, altText: { title: p.kind === 'qr' ? 'QR code' : 'Photo', description: p.alt || 'Photo', name: p.kind } })] })], picW);
    const left = pics.length && cv.qr && cv.qr.swap ? [pics[0]] : (photo ? [pics[0]] : []);
    const right = pics.filter(p => !left.includes(p));
    const textW = usable - picW * (left.length + right.length);
    const row = new D.TableRow({ cantSplit: true, children: [].concat(left.map(picCell), [cell(textParas, textW)], right.map(picCell)) });
    kids.push(new D.Table({ width: { size: usable, type: D.WidthType.DXA }, columnWidths: [].concat(left.map(() => picW), [textW], right.map(() => picW)), borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }, rows: [row] }));
    kids.push(new D.Paragraph({ spacing: { after: 0, before: 0 }, children: [run('', { size: 4 })] }));
  }
  const rightTab = [{ type: D.TabStopType.RIGHT, position: usable }];
  const headLabel = (s) => run(m.upper ? s.label.toUpperCase() : s.label, { bold: true, color: look.h2 === 'fill' ? (look.h2Dark ? ink : 'FFFFFF') : (look.h2Dark ? ink : accent) });
  const tint = ((c) => [0, 2, 4].map(i => Math.round(255 - (255 - parseInt(c.slice(i, i + 2), 16)) * 0.14).toString(16).padStart(2, '0')).join('').toUpperCase())(accent);
  const h2Props = (s) => {
    const base = { spacing: { before: Math.round(160 * sp), after: 40 }, keepNext: true, pageBreakBefore: !!s.breakBefore };
    if (look.h2 === 'bar') return Object.assign(base, { indent: { left: 140 }, border: { left: { style: D.BorderStyle.SINGLE, size: 36, color: accent, space: 6 } } });
    if (look.h2 === 'fill') { const f = look.fill === 'tint' ? tint : (look.fill || accent); return Object.assign(base, { shading: { type: D.ShadingType.CLEAR, fill: f, color: 'auto' }, border: { top: solid(f), bottom: solid(f), left: solid(f), right: solid(f) } }); }
    if (look.h2 === 'plain') return base;
    return Object.assign(base, { border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: look.mono ? '000000' : accent, space: 1 } } });
  };
  const gbar = look.groupBar ? { indent: { left: 160 }, border: { left: { style: D.BorderStyle.SINGLE, size: 20, color: accent, space: 8 } } } : {};
  for (const s of m.sections) {
    kids.push(new D.Paragraph(Object.assign(h2Props(s), { children: [headLabel(s)] })));
    if (s.isSkills) { for (const g of s.skillGroups) kids.push(new D.Paragraph({ children: [g.showCat ? run(g.category + ': ', { bold: true }) : run(''), run(g.list)] })); continue; }
    if (s.isList) { kids.push(new D.Paragraph({ children: [run(s.list)] })); continue; }
    for (const g of s.groups) {
      if (!g.flat) {
        const parts = [];
        if (g.isEdu) {
          parts.push(run(g.head, { bold: true }));
          const rest = [g.sub, g.score, g.remarks].filter(Boolean).join(' | ');
          if (rest) parts.push(run(', ' + rest));
        } else {
          if (g.head) parts.push(run(g.head, { bold: true }));
          if (g.titleExtra) parts.push(run(' | ' + g.titleExtra));
          if (g.sub) parts.push(run((g.head ? ', ' : '') + g.sub, { italics: true }));
        }
        if (g.dates) parts.push(new D.TextRun({ text: '\t' + g.dates, size: sz, font, color: ink }));
        kids.push(new D.Paragraph(Object.assign({ tabStops: rightTab, keepNext: g.hasBullets, spacing: { before: Math.round(80 * sp) }, children: parts }, gbar)));
      }
      for (const b of g.bullets) {
        const ch = [run(b.text)];
        if (b.date) ch.push(new D.TextRun({ text: '\t' + b.date, size: sz, font, color: ink }));
        kids.push(new D.Paragraph({ numbering: { reference: 'bul', level: 0 }, tabStops: rightTab, children: ch }));
      }
    }
  }
  const doc = new D.Document({
    creator: m.header.name || 'Dossier', title: cv.name || 'CV',
    styles: { default: { document: { run: { font, size: sz, color: ink } } } },
    numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: look.bullet || '\u2022', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } }, run: { font, color: look.bulletAccent ? accent : ink } } }] }] },
    sections: [{ properties: { page: { size: { width: pageW, height: pageH }, margin: { top: mar, bottom: mar, left: mar, right: mar } } }, children: kids }]
  });
  return D.Packer.toBuffer(doc);
}

// JSON Resume (jsonresume.org schema) export
function toJsonResume(cv, items, settings) {
  const H = cv.header || {};
  const iso = d => (d && d !== 'present' ? (d.length === 4 ? d : d) : undefined);
  const out = { $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json', basics: { name: H.name, label: H.headline, email: H.email, phone: cv.privacy ? undefined : H.phone, summary: undefined, location: cv.privacy ? undefined : { address: H.address }, profiles: (H.links || []).map(u => ({ url: u })) }, work: [], education: [], projects: [], awards: [], certificates: [], skills: [], languages: [], volunteer: [], publications: [] };
  const sel = (cv.selected || []).map(s => { const it = items.find(i => i.id === s.itemId); return it ? { it, text: s.override || M.itemText(it, s.versionId) } : null; }).filter(Boolean);
  const groups = new Map();
  for (const r of sel) { const k = M.groupKey(r.it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const rs of groups.values()) {
    const it = rs[0].it, hl = rs.map(r => r.text).filter(Boolean);
    const base = { startDate: iso(it.start), endDate: iso(it.end) };
    switch (it.type) {
      case 'work': case 'internship': out.work.push(Object.assign({ name: it.org, position: it.role || it.title, location: it.location, highlights: hl }, base)); break;
      case 'education': out.education.push(Object.assign({ institution: it.org, studyType: it.title, score: (it.extra || {}).score }, base)); break;
      case 'project': out.projects.push(Object.assign({ name: it.title || it.org, description: it.org, highlights: hl, url: it.link }, base)); break;
      case 'award': for (const r of rs) out.awards.push({ title: r.text, date: iso(r.it.end || r.it.start), awarder: r.it.org }); break;
      case 'certification': for (const r of rs) out.certificates.push({ name: r.it.title || r.text, date: iso(r.it.end || r.it.start), issuer: r.it.org, url: r.it.link }); break;
      case 'position': case 'volunteering': out.volunteer.push(Object.assign({ organization: it.org, position: it.role || it.title, highlights: hl }, base)); break;
      case 'publication': for (const r of rs) out.publications.push({ name: r.it.title || r.text, publisher: r.it.org, releaseDate: iso(r.it.end || r.it.start), url: r.it.link }); break;
      case 'skill': for (const r of rs) out.skills.push({ name: (r.it.extra || {}).category || 'Skills', keywords: [r.it.title || r.text] }); break;
      case 'language': for (const r of rs) out.languages.push({ language: r.it.title || r.text, fluency: (r.it.extra || {}).level }); break;
      default: break;
    }
  }
  return out;
}

function nativeCvExport(cv, items) {
  const used = new Set((cv.selected || []).map(s => s.itemId));
  return { schema: 1, kind: 'cvbuilder-cv', exportedAt: new Date().toISOString(), cv, items: items.filter(i => used.has(i.id)) };
}

module.exports = { buildDocx, toJsonResume, nativeCvExport };
