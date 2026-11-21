'use strict';
const M = require('./model');

function norm(s) { return String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9%\s']/g, ' ').replace(/\s+/g, ' ').trim(); }
const STOP = new Set('a an the and or of to in on for with by at as is was were be been from that this it its into using used via'.split(' '));
function tokens(s) { return norm(s).split(' ').filter(w => w && !STOP.has(w)); }
function bigramCounts(s) { const t = norm(s).replace(/ /g, ''); const m = new Map(); let n = 0; for (let i = 0; i < t.length - 1; i++) { const x = t.slice(i, i + 2); m.set(x, (m.get(x) || 0) + 1); n++; } return { m, n }; }
function diceCounts(A, B) {
  if (!A.n || !B.n) return 0;
  const [small, big] = A.m.size <= B.m.size ? [A.m, B.m] : [B.m, A.m];
  let hit = 0; for (const [x, c] of small) { const d = big.get(x); if (d) hit += Math.min(c, d); }
  return 2 * hit / (A.n + B.n);
}
function jaccardSets(A, B) {
  if (!A.size && !B.size) return 1;
  let i = 0; const [s, l] = A.size <= B.size ? [A, B] : [B, A]; for (const x of s) if (l.has(x)) i++;
  return i / (A.size + B.size - i);
}
// everything that only depends on one text, computed once per entry (comparing every pair used to redo it n times over)
function prepText(t) { return { tok: new Set(tokens(t)), bg: bigramCounts(t) }; }
function simPrepared(pa, pb) { const j = jaccardSets(pa.tok, pb.tok); return Math.max(j, 0.5 * j + 0.5 * diceCounts(pa.bg, pb.bg)); }
function textSim(a, b) { return simPrepared(prepText(a), prepText(b)); }
function datesOverlap(a, b) {
  const as = M.dateNum(a.start), ae = M.dateNum(a.end || a.start, true), bs = M.dateNum(b.start), be = M.dateNum(b.end || b.start, true);
  if (as == null || bs == null) return null;
  return as <= be && bs <= ae;
}
function isWorky(i) { return ['work', 'internship', 'position', 'volunteering', 'project'].includes(i.type); }
function pairKey(a, b) { return [a, b].sort().join('~'); }

// Returns candidate duplicate pairs with a suggested action.
function findDuplicates(items, dismissed) {
  const dis = new Set(dismissed || []);
  const list = items.filter(i => !i.archived).map(it => {
    const t = M.itemText(it) || [it.title, it.org].filter(Boolean).join(' ');
    return { it, ok: !!norm(t), p: prepText(t), org: norm(it.org), title: norm(it.title), worky: isWorky(it) };
  }).filter(x => x.ok);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j], a = A.it, b = B.it;
      if (a.type !== b.type && !(A.worky && B.worky)) continue;
      const key = pairKey(a.id, b.id);
      if (dis.has(key)) continue;
      const ts = simPrepared(A.p, B.p);
      const sameOrg = a.org && b.org && A.org === B.org;
      const sameType = a.type === b.type;
      const ov = datesOverlap(a, b);
      let score = ts * 0.65 + (sameOrg ? 0.15 : 0) + (sameType ? 0.05 : 0) + (ov ? 0.1 : 0) + (A.title && A.title === B.title ? 0.05 : 0);
      const orgClash = a.org && b.org && !sameOrg && ts < 0.8;
      const strong = !orgClash && (ts >= 0.55 || (sameOrg && ts >= 0.38) || (sameOrg && ov && ts >= 0.3));
      if (!strong || score < 0.45) continue;
      // Suggestion: near-identical text => delete one; otherwise keep both as versions of one.
      const identical = ts >= 0.92 && (!a.org || !b.org || sameOrg);
      const keep = pickKeeper(a, b);
      const other = keep === a ? b : a;
      out.push({
        key, score: Math.round(score * 100) / 100, textSimilarity: Math.round(ts * 100) / 100,
        a: a.id, b: b.id, keep: keep.id, other: other.id,
        suggestion: identical ? 'delete' : 'nest',
        reasons: [sameOrg ? 'same organisation' : null, sameType ? 'same type' : null, ov ? 'overlapping dates' : null, ts >= 0.55 ? 'similar wording' : null].filter(Boolean)
      });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
function pickKeeper(a, b) {
  const sa = (a.versions || []).length * 10 + M.itemText(a).length + (a.proof ? 50 : 0);
  const sb = (b.versions || []).length * 10 + M.itemText(b).length + (b.proof ? 50 : 0);
  if (sa !== sb) return sa > sb ? a : b;
  return (a.addedAt || '') <= (b.addedAt || '') ? a : b;
}
module.exports = { findDuplicates, textSim, pairKey, norm };
