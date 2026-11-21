'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model'));
  else root.CVReview = factory(root.CVModel);
})(typeof self !== 'undefined' ? self : this, function (M) {
  const WEAK = [/^responsible for\b/i, /^worked on\b/i, /^helped\b/i, /^assisted\b/i, /^involved in\b/i, /^tasked with\b/i, /^duties (included|include)\b/i, /^participated in\b/i, /^was a part of\b/i, /^did\b/i, /^handled\b/i, /^various\b/i];
  const IRREG_PAST = new Set('led built ran made wrote won took gave led met sold set spent taught held kept began grew drew chose found got ground led saw sent brought thought taught understood developed'.split(' '));
  const CHARS_PER_LINE = 112; // ~10pt body text on A4 with 14mm margins
  const LINES_PER_PAGE = 58;

  function words(s) { return String(s || '').trim().split(/\s+/).filter(Boolean); }
  function looksPast(w) { w = w.toLowerCase().replace(/[^a-z]/g, ''); return /ed$/.test(w) || IRREG_PAST.has(w); }
  function looksPresent(w) { w = w.toLowerCase().replace(/[^a-z]/g, ''); return !!w && !looksPast(w) && (/ing$/.test(w) || (/s$/.test(w) && !/ss$/.test(w)) ); }
  function lineCount(text) { return Math.max(1, Math.ceil(String(text || '').length / CHARS_PER_LINE)); }

  // Resolve the CV's chosen items to {item, text, id}
  function resolveSelected(cv, itemsById) {
    return (cv.selected || []).map(s => {
      const it = itemsById[s.itemId];
      if (!it) return null;
      return { item: it, id: it.id, text: s.override != null && s.override !== '' ? s.override : M.itemText(it, s.versionId) };
    }).filter(Boolean);
  }

  function dateIssues(sel) {
    const out = [];
    const dated = sel.map(r => r.item).filter(it => ['work', 'internship', 'education', 'position', 'volunteering', 'project'].includes(it.type) && (it.start || it.end));
    // collapse to unique entries
    const seen = new Map();
    for (const it of dated) { const k = M.groupKey(it); if (!seen.has(k)) seen.set(k, it); }
    const entries = [...seen.values()];
    for (const it of entries) {
      if (['work', 'internship', 'position'].includes(it.type) && it.start && !it.end)
        out.push({ kind: 'missing-end', severity: 'warn', itemId: it.id, msg: `"${label(it)}" has a start date but no end date (use "present" if ongoing).` });
    }
    const timeline = entries.filter(e => ['work', 'internship'].includes(e.type) && M.dateNum(e.start) != null)
      .map(e => ({ e, s: M.dateNum(e.start), f: M.dateNum(e.end || e.start, true) })).sort((a, b) => a.s - b.s);
    for (let i = 1; i < timeline.length; i++) {
      const prev = timeline[i - 1], cur = timeline[i];
      if (cur.s < prev.f) out.push({ kind: 'overlap', severity: 'info', itemId: cur.e.id, msg: `"${label(cur.e)}" overlaps with "${label(prev.e)}".` });
    }
    // gaps across work + internships + education combined
    const all = entries.filter(e => ['work', 'internship', 'education'].includes(e.type) && M.dateNum(e.start) != null && e.end !== 'present' || (e.end === 'present' && M.dateNum(e.start) != null))
      .map(e => ({ e, s: M.dateNum(e.start), f: M.dateNum(e.end || e.start, true) })).sort((a, b) => a.s - b.s);
    let maxEnd = null;
    for (const r of all) {
      if (maxEnd != null && r.s - maxEnd > 3) out.push({ kind: 'gap', severity: 'warn', itemId: r.e.id, msg: `Gap of ${r.s - maxEnd - 1} months before "${label(r.e)}".` });
      maxEnd = maxEnd == null ? r.f : Math.max(maxEnd, r.f);
    }
    return out;
  }
  function label(it) { return [it.role || it.title, it.org].filter(Boolean).join(', ') || M.itemText(it).slice(0, 40); }

  function textIssues(sel) {
    const out = [];
    const byGroup = new Map();
    for (const r of sel) {
      const t = r.text.trim();
      if (!t) continue;
      const it = r.item;
      const isBullet = !['skill', 'language'].includes(it.type);
      if (isBullet && !/\d/.test(t) && !['education', 'certification'].includes(it.type))
        out.push({ kind: 'no-metric', severity: 'tip', itemId: it.id, msg: 'No number or metric. Can you add scale, % change, time saved, count?', text: t });
      for (const rx of WEAK) if (rx.test(t)) { out.push({ kind: 'weak-verb', severity: 'warn', itemId: it.id, msg: 'Weak opening phrase. Start with a strong action verb.', text: t }); break; }
      const dup = /\b(\w+)\s+\1\b/i.exec(t);
      if (dup && !/^(that|had)$/i.test(dup[1])) out.push({ kind: 'dup-word', severity: 'warn', itemId: it.id, msg: `Repeated word "${dup[1]}".`, text: t });
      if (t.length > 220) out.push({ kind: 'long', severity: 'warn', itemId: it.id, msg: `Long (${t.length} characters, about ${lineCount(t)} lines). Consider trimming.`, text: t });
      else if (isBullet && t.length < 25) out.push({ kind: 'short', severity: 'tip', itemId: it.id, msg: 'Very short. Add the outcome or scope.', text: t });
      const lc = lineCount(t);
      const last = t.length - (lc - 1) * CHARS_PER_LINE;
      if (lc > 1 && last > 0 && last < 9) out.push({ kind: 'orphan', severity: 'tip', itemId: it.id, msg: 'Last line holds only a word or two. Trim a few words to save a line.', text: t });
      if (/\s{2,}|\s[,.;]/.test(t)) out.push({ kind: 'spacing', severity: 'tip', itemId: it.id, msg: 'Odd spacing or punctuation.', text: t });
      if (isBullet) { const k = M.groupKey(it); if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push({ r, first: words(t)[0] || '' }); }
    }
    // tense per role / entry
    for (const [, arr] of byGroup) {
      const it = arr[0].r.item;
      if (!['work', 'internship', 'position', 'project', 'volunteering'].includes(it.type)) continue;
      const ongoing = it.end === 'present';
      for (const { r, first } of arr) {
        if (!first) continue;
        if (!ongoing && it.end && looksPresent(first)) out.push({ kind: 'tense', severity: 'warn', itemId: r.id, msg: `Ended role but "${first}" reads as present tense.`, text: r.text });
      }
      const past = arr.filter(x => looksPast(x.first)).length, pres = arr.filter(x => looksPresent(x.first)).length;
      if (ongoing === false && past && pres && !out.some(o => o.kind === 'tense' && arr.some(x => x.r.id === o.itemId)))
        out.push({ kind: 'tense', severity: 'warn', itemId: arr[0].r.id, msg: `Mixed tenses in "${label(it)}".`, text: arr[0].r.text });
    }
    return out;
  }

  function lineBudget(cv, sel, pageTarget) {
    let lines = 4; // header
    const groups = new Set();
    const perItem = [];
    for (const r of sel) {
      const it = r.item;
      const secVisible = (cv.sections || []).find(s => s.visible !== false && s.types.includes(it.type));
      if (!secVisible) continue;
      const l = lineCount(r.text);
      perItem.push({ itemId: it.id, lines: l });
      lines += l;
      groups.add(secVisible.key + '|' + M.groupKey(it));
    }
    lines += groups.size; // one heading line per group
    const sections = new Set(sel.map(r => (cv.sections || []).find(s => s.types.includes(r.item.type))).filter(Boolean).map(s => s.key));
    lines += sections.size * 2;
    const budget = (pageTarget || cv.targetPages || 1) * LINES_PER_PAGE;
    return { lines, budget, pages: Math.round(lines / LINES_PER_PAGE * 100) / 100, over: lines - budget, perItem };
  }

  function review(cv, items) {
    const byId = {}; for (const it of items) byId[it.id] = it;
    const sel = resolveSelected(cv, byId);
    const issues = [].concat(dateIssues(sel), textIssues(sel));
    const sections = (cv.sections || []).filter(s => s.visible !== false && s.types.some(t => sel.some(r => r.item.type === t))).map(s => s.key);
    const missing = [];
    if (!sections.includes('education')) missing.push('No Education section content.');
    if (!(cv.header && cv.header.email)) missing.push('No email address in the header.');
    if (!(cv.header && cv.header.phone)) missing.push('No phone number in the header.');
    if (!(cv.header && cv.header.name)) missing.push('No name in the header.');
    return { issues, missing, budget: lineBudget(cv, sel), counts: { items: sel.length } };
  }

  // Word-level diff via LCS. Returns [{t, op: 'same'|'add'|'del'}]
  function diffWords(a, b) {
    const A = String(a || '').split(/(\s+)/).filter(x => x !== ''), B = String(b || '').split(/(\s+)/).filter(x => x !== '');
    const n = A.length, m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push({ t: A[i], op: 'same' }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: A[i++], op: 'del' });
      else out.push({ t: B[j++], op: 'add' });
    }
    while (i < n) out.push({ t: A[i++], op: 'del' });
    while (j < m) out.push({ t: B[j++], op: 'add' });
    return out;
  }
  return { review, diffWords, lineCount, resolveSelected, CHARS_PER_LINE, LINES_PER_PAGE };
});
