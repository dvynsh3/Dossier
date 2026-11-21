'use strict';
// Shows a rendered CV document (the preview HTML) as real pages: 'stack' = pages one under another with gaps (like Word),
// 'side' = pages next to each other. Lines are never cut: a bullet or heading that would cross the bottom margin moves to the next page.
(function () {
  const GAP = 22, PAD = 14, MM = 3.7795;
  const BG = '#cfd3d9';

  function leafBlocks(body) {
    const out = [];
    const all = body.querySelectorAll('*');
    for (const e of all) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue;
      if (!/^(block|list-item|table-row|flex|grid|table)$/.test(cs.display)) continue;
      if (/^(UL|OL|TABLE|TBODY|THEAD|SECTION|HEADER|MAIN|ARTICLE|ASIDE|NAV)$/.test(e.tagName) && e.children.length) continue;
      // leaf = no child that is itself a block-level box
      let hasBlock = false;
      for (const c of e.children) { const d = getComputedStyle(c).display; if (/^(block|list-item|table-row|flex|grid|table)$/.test(d) && c.getBoundingClientRect().height > 0) { hasBlock = true; break; } }
      if (hasBlock) continue;
      if (e.getBoundingClientRect().height < 2) continue;
      out.push(e);
    }
    return out;
  }

  function isHead(e, next) {
    if (/^H[1-6]$/.test(e.tagName)) return true;
    const p = e.parentElement; if (!p || !next) return false;
    if (p.firstElementChild !== e) return false;
    return next.parentElement === p || (next.closest && next.closest('ul,ol') && next.closest('ul,ol').parentElement === p);
  }

  // undo everything a previous run did, so measuring twice (fonts arriving late, window resized) never stacks gaps
  function reset(d) {
    d.querySelectorAll('[data-pgsp]').forEach(x => x.remove());
    d.querySelectorAll('[data-pgo]').forEach(x => { x.style.paddingTop = x.getAttribute('data-pgo'); x.removeAttribute('data-pgo'); });
    const o = d.getElementById('cvb-pager'); if (o) o.remove();
    d.body.style.minHeight = ''; d.body.style.height = ''; d.body.style.removeProperty('background');
  }

  // Pushes leaf blocks so nothing is cut at a page bottom and honours "start on a new page" / "keep together" on blocks.
  // flagsOnly: only the block flags are applied (used by the continuous view, which has no gaps).
  function place(d, body, PH, M, GAP, flagsOnly) {
    const bodyTop = () => body.getBoundingClientRect().top;
    const units = leafBlocks(body);
    const regTop = k => k * (PH + GAP) + M, regBot = k => k * (PH + GAP) + PH - M;
    const seen = new Set();
    const flow = (e) => { if (e === body) return true; const dd = getComputedStyle(e).display; return dd === 'block' || dd === 'list-item' || dd === 'flow-root'; };
    const near = (a, b) => Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) < 4;
    // the highest element that starts exactly where u starts and can take a spacer in front of it. A spacer (not padding) keeps coloured bars,
    // borders and backgrounds of headings and sections from stretching over the page gap.
    const anchorFor = (u) => {
      let a = u, best = null;
      for (;;) {
        const p = a.parentElement; if (!p) break;
        if (flow(p)) best = a;
        if (p === body) break;
        const cs = getComputedStyle(p);
        if (a !== p.firstElementChild || !near(a, p) || parseFloat(cs.paddingTop) > 0.5 || parseFloat(cs.borderTopWidth) > 0.5) break;
        a = p;
      }
      return best;
    };
    const push = (u, top, page) => {
      const target = regTop(page + 1), delta = target - top; if (delta <= 0.5) return;
      const a = anchorFor(u);
      if (a) {
        const sp = d.createElement('div'); sp.setAttribute('data-pgsp', '1'); sp.style.cssText = 'display:block;height:' + delta + 'px;margin:0;padding:0;border:0;pointer-events:none;background:none';
        a.parentNode.insertBefore(sp, a);
        const fix = target - (u.getBoundingClientRect().top - bodyTop()); if (Math.abs(fix) > 0.5) sp.style.height = Math.max(0, delta + fix) + 'px';
        return;
      }
      const cs = getComputedStyle(u); if (!u.hasAttribute('data-pgo')) u.setAttribute('data-pgo', u.style.paddingTop || '');
      u.style.paddingTop = (parseFloat(cs.paddingTop) + delta) + 'px';
    };
    for (let i = 0; i < units.length; i++) {
      const u = units[i], next = units[i + 1];
      // block flags: this leaf is the first one of every flagged block that contains it
      let moved = false;
      for (let b = u.closest('[data-gid],[data-sgid]'); b; b = b.parentElement && b.parentElement.closest('[data-gid],[data-sgid]')) {
        const g = b.getAttribute('data-gid') || b.getAttribute('data-sgid'); if (seen.has(g)) continue; seen.add(g);
        const cs = getComputedStyle(b); const wantNew = cs.breakBefore === 'page' || cs.pageBreakBefore === 'always', keep = cs.breakInside === 'avoid' || cs.pageBreakInside === 'avoid';
        if (!wantNew && !keep) continue;
        const r = b.getBoundingClientRect(), top = r.top - bodyTop(), bottom = r.bottom - bodyTop();
        const page = Math.max(0, Math.floor((top + 1) / (PH + GAP)));
        if (wantNew) { if (top > regTop(page) + 3) { push(u, top, page); moved = true; } }
        else if (bottom > regBot(page) + .5 && (bottom - top) <= (regBot(page) - regTop(page)) && top > regTop(page) + 3) { push(u, top, page); moved = true; }
      }
      if (flagsOnly || moved) continue;
      const r = u.getBoundingClientRect(); const top = r.top - bodyTop(), bottom = r.bottom - bodyTop();
      const page = Math.max(0, Math.floor((top + 1) / (PH + GAP)));
      let need = bottom;
      if (next && isHead(u, next)) { const nr = next.getBoundingClientRect(); need = Math.max(need, Math.min(nr.bottom - bodyTop(), nr.top - bodyTop() + 40)); }
      if (need <= regBot(page) + 0.5 || (bottom - top) > (regBot(page) - regTop(page))) continue;
      push(u, top, page);
    }
    return units;
  }

  // continuous view: only the block flags matter. Returns true when something moved.
  function flagsOnly(d, pg) {
    reset(d); const body = d.body, M = Math.round(pg.margin * MM);
    const before = body.scrollHeight; place(d, body, pg.hpx, M, 0, true); return body.scrollHeight !== before;
  }

  // mode: 'stack' | 'side'. pg: {wpx,hpx,margin(mm)}. Returns {pages, width, height} in CSS px of the content to show.
  function apply(d, pg, mode) {
    reset(d); const body = d.body, html = d.documentElement; const PW = pg.wpx, PH = pg.hpx, M = Math.round(pg.margin * MM);
    const st = d.createElement('style'); st.id = 'cvb-pager';
    if (mode === 'side') {
      st.textContent = `html{background:${BG} linear-gradient(to right,#fff 0,#fff ${PW}px,${BG} ${PW}px) ${PAD}px ${PAD}px/${PW + GAP}px ${PH}px repeat-x!important;padding:0!important}` +
        `body{background:transparent!important;box-shadow:none!important;margin:${PAD}px ${PAD}px!important;width:${PW}px!important;min-height:0!important;height:${PH}px!important;padding:${M}px!important;column-width:${PW - 2 * M}px;column-gap:${2 * M + GAP}px;column-fill:auto}` +
        `li,p,h1,h2,h3,h4,tr,[data-id]{break-inside:avoid}h1,h2,h3,h4{break-after:avoid}`;
      d.head.append(st);
      const sw = Math.max(html.scrollWidth, body.scrollWidth);
      const pages = Math.max(1, Math.round((sw - PAD * 2 + GAP) / (PW + GAP)));
      const width = pages * PW + (pages - 1) * GAP + PAD * 2;
      return { pages, width, height: PH + PAD * 2 };
    }
    // stack
    st.textContent = `html{background:${BG}!important;padding:${PAD}px 0!important}body{margin:0 auto!important;box-shadow:none!important;min-height:${PH}px!important;position:relative}`;
    d.head.append(st);
    const units = place(d, body, PH, M, GAP, false); const bodyTop = () => body.getBoundingClientRect().top;
    // the lowest bottom of ANY block: in two-column layouts the last block in the markup is often in the shorter column
    let end = PH; for (const u of units) { const b = u.getBoundingClientRect().bottom - bodyTop(); if (b > end) end = b; }
    end = Math.max(end, d.documentElement.scrollHeight - 2 * PAD);
    const pages = Math.max(1, Math.floor((end - 1) / (PH + GAP)) + 1);
    const total = pages * PH + (pages - 1) * GAP;
    body.style.minHeight = total + 'px'; body.style.height = total + 'px';
    body.style.setProperty('background', `repeating-linear-gradient(to bottom,#fff 0,#fff ${PH}px,${BG} ${PH}px,${BG} ${PH + GAP}px)`, 'important');
    return { pages, width: PW + PAD * 2, height: total + PAD * 2 };
  }

  window.Pager = { apply, flagsOnly, GAP, PAD };
})();
