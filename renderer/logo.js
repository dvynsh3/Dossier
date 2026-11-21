'use strict';
// Dossier logo in three styles: main (3D, raster), flat and outline (vector, follow the app colours).
(function () {
  // Dossier logo styles. 'main' is the original 3D mark (default); the others are PNG marks with transparent backgrounds.
  const KINDS = [['main', 'Classic'], ['classic2', 'Classic 2'], ['gradient', 'Gradient'], ['glass', 'Glass'], ['paper', 'Paper'], ['solid', 'Solid'], ['linepaper', 'Line + page'], ['line', 'Line'], ['gradientline', 'Gradient line'], ['neon', 'Neon']];
  // Paper suits the dark theme, Classic the light one. A logo the user picks is remembered separately for each theme.
  const DEFAULTS = { dark: 'paper', light: 'main' };
  const themeNow = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  const defaultFor = (t) => DEFAULTS[t || themeNow()];
  const srcOf = (kind) => kind === 'main' ? window.LOGO_MAIN : (window.LOGOS || {})[kind] || (window.LOGOS || {}).paper || window.LOGO_MAIN;
  // Only the Paper and Classic marks ship with the first load; the other styles (about 0.9 MB) load when one of them is needed.
  const have = (kind) => kind === 'main' || !!(window.LOGOS || {})[kind];
  let moreP = null;
  const loadMore = () => moreP || (moreP = new Promise((res) => { const sc = document.createElement('script'); sc.src = 'logo-more.js'; sc.onload = () => res(true); sc.onerror = () => { moreP = null; res(false); }; document.head.append(sc); }));
  const ready = (kind) => have(kind) ? Promise.resolve(true) : loadMore().then(() => have(kind));
  function el(kind, size) {
    size = size || 28; const i = document.createElement('img'); i.src = srcOf(kind); i.alt = ''; i.className = 'dlogo ' + kind; i.style.width = i.style.height = size + 'px'; i.draggable = false; if (!have(kind)) ready(kind).then(ok => { if (ok) i.src = srcOf(kind); }); return i;
  }
  const current = () => { try { const m = (window.App && App.state.settings && App.state.settings.logoByTheme) || {}; const k = m[themeNow()]; return KINDS.some(x => x[0] === k) ? k : defaultFor(); } catch (e) { return defaultFor(); } };
  // the chosen logo is also the window and taskbar icon (desktop app only)
  const applyWindowIcon = () => { try { if (window.cvDesktop && window.cvDesktop.setIcon) { const k = current(); ready(k).then(() => { if (current() === k) window.cvDesktop.setIcon(srcOf(k)); }); } } catch (e) { /* ignore */ } };
  const api = { el, ready, loadMore, KINDS, current, defaultFor, themeNow, applyWindowIcon };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.Logo = api;
})();
