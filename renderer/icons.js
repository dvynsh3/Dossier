'use strict';
// Small icon set. Every icon has an optional closed "shape" (.s, gets filled when selected), "cut" details (.c) and plain lines (.l).
(function () {
  const gear = (() => { const pts = []; const n = 8; for (let i = 0; i < n * 2; i++) { const a = (Math.PI * 2 * i) / (n * 2) - Math.PI / 2; const r = i % 2 ? 7 : 9.6; const a2 = a + (i % 2 ? 0.0 : 0); pts.push([12 + Math.cos(a2) * r, 12 + Math.sin(a2) * r]); } 
    // smooth-ish gear: teeth from 16 points + rounding via straight segments
    return 'M' + pts.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'z'; })();
  const P = {
    folder: { s: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z' },
    edit: { s: 'M5 3.5h9l5 5V20.5H5z', c: 'M14 3.5v5h5M8.5 13h7M8.5 16.5h5' },
    review: { s: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', c: 'M8 12.2l2.8 2.8L16 9.5' },
    inbox: { s: 'M3.5 13.5L6 5.5h12l2.5 8V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z', c: 'M3.5 13.5h5l1 2.5h5l1-2.5h5M12 7.5v4.5M9.8 9.8L12 12l2.2-2.2' },
    home: { s: 'M3.5 11.2L12 4l8.5 7.2V20a.8.8 0 0 1-.8.8H15v-5.5H9v5.5H4.3a.8.8 0 0 1-.8-.8z' },
    gear: { s: gear, c: 'M12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z' },
    plus: { l: 'M12 5v14M5 12h14' },
    globe: { l: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z' },
    qr: { l: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM18 14h2v2M14 19h2M18 18.5h2v1.5h-2' },
    briefcase: { l: 'M3.5 8h17v11.5h-17zM9 8V5.5h6V8M3.5 13h17M10.5 13v1.5h3V13' },
    calendar: { l: 'M4 6h16v14H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4' },
    eye: { l: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z' },
    eyeOff: { l: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4zM4 4l16 16' },
    x: { l: 'M6 6l12 12M18 6L6 18' },
    check: { l: 'M5 12.5l4.5 4.5L19 7.5' },
    trash: { l: 'M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5' },
    copy: { l: 'M9 9h10.5v11H9zM15 9V4H4.5v11H9' },
    link: { l: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' },
    chevL: { l: 'M14.5 6l-6 6 6 6' }, chevR: { l: 'M9.5 6l6 6-6 6' }, chevD: { l: 'M6 9.5l6 6 6-6' }, chevU: { l: 'M6 14.5l6-6 6 6' },
    search: { l: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8' },
    grid: { l: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
    list: { l: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' },
    timeline: { l: 'M6 3.5v17M6 7h13M6 12h9M6 17h11' },
    layers: { l: 'M12 3.5l9 4.8-9 4.8-9-4.8zM3 12.5l9 4.8 9-4.8M3 16.5l9 4.8 9-4.8' },
    lock: { l: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3' },
    info: { l: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5.5M12 7.8v.01' },
    back: { l: 'M19 12H5M11 6l-6 6 6 6' }, fwd: { l: 'M5 12h14M13 6l6 6-6 6' },
    refresh: { l: 'M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5' },
    external: { l: 'M14 4h6v6M20 4l-9 9M18 14v5.5H4.5V6H10' },
    user: { l: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20a7.5 7.5 0 0 1 15 0' },
    users: { l: 'M9 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14a6 6 0 0 1 3.5 6' },
    upload: { l: 'M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14' },
    download: { l: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14' },
    sun: { l: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4' },
    moon: { l: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z' },
    doc: { l: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4' },
    drag: { l: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01', thick: true },
    filter: { l: 'M4 5h16l-6 7.5V19l-4-2v-4.5z' },
    sort: { l: 'M7 4v16M3.8 16.8L7 20l3.2-3.2M17 20V4M13.8 7.2L17 4l3.2 3.2' },
    sliders: { l: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5' },
    undo: { l: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11' },
    redo: { l: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13' },
    zoomIn: { l: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8M10.5 7.5v6M7.5 10.5h6' },
    zoomOut: { l: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8M7.5 10.5h6' },
    fit: { l: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
    fitW: { l: 'M3.5 6v12M20.5 6v12M7.5 12h9M7.5 12l2.5-2.5M7.5 12l2.5 2.5M16.5 12L14 9.5M16.5 12l-2.5 2.5' },
    fitH: { l: 'M6 3.5h12M6 20.5h12M12 7.5v9M12 7.5L9.5 10M12 7.5L14.5 10M12 16.5L9.5 14M12 16.5l2.5-2.5' },
    print: { l: 'M7 9V4h10v5M7 17H5v-7h14v7h-2M7 14h10v6H7z' },
    sparkles: { l: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z' },
    tag: { l: 'M3.5 12V4.5h7.5l9.5 9.5-7.5 7.5zM8 8.5h.01' },
    building: { l: 'M5 21V4h9v17M14 9h5v12M8.5 8h2M8.5 12h2M8.5 16h2M3 21h18' },
    panelL: { l: 'M3.5 5h17v14h-17zM9.5 5v14' },
    panelR: { l: 'M3.5 5h17v14h-17zM14.5 5v14' },
    blocks: { l: 'M4 4h7v7H4zM13 4h7v4.5h-7zM13 10.5h7V20h-7zM4 13h7v7H4z' },
    merge: { l: 'M6 4v5a5 5 0 0 0 5 5h7M6 20v-6M15 11l3 3-3 3' },
    star: { s: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z' },
    arrowUp: { l: 'M12 19V5M6 11l6-6 6 6', thick: true }, arrowDown: { l: 'M12 5v14M6 13l6 6 6-6', thick: true },
    archive: { s: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V9H4z', c: 'M5.5 9v9.5A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4' },
    clock: { l: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2' },
    more: { l: 'M5 12h.01M12 12h.01M19 12h.01', thick: true },
    pin: { l: 'M12 21v-6M8 4h8l-1 6 3 4H6l3-4z' },
    login: { l: 'M14 4h5.5v16H14M4 12h10M10 8l4 4-4 4' },
    apps: { l: 'M4 6h16M4 12h16M4 18h10' },
    letter: { l: 'M3.5 6h17v12h-17zM3.5 7l8.5 6.5L20.5 7' },
    clip: { l: 'M9 4h6v3H9zM9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15' },
    terminal: { l: 'M3.5 5h17v14h-17zM7 9.5l3 2.5-3 2.5M12.5 15h4.5' },
    pencil: { s: 'M4 20l1-4.5L16.5 4a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19z', c: 'M14.5 6l3.5 3.5M4 20l4.5-1' },
    updown: { l: 'M8 9l4-4 4 4M8 15l4 4 4-4', thick: false },
    stop: { l: 'M6.5 6.5h11v11h-11z' },
    key: { l: 'M14.5 9.5a4 4 0 1 0-4 4L20 14.5v3h-3v3h-3.5M8 8.5h.01' },
    save: { l: 'M5 4h12l2.5 2.5V20H5zM8 4v5h7V4M8 20v-6h8v6' },
    liglyph: { l: 'M6.5 10v8M6.5 6.3v.01M11.5 18v-8M11.5 13.5c0-2.2 1.3-3.5 3.3-3.5 2.2 0 3.2 1.3 3.2 3.5V18' },
    linkedin: { l: 'M4 4h16v16H4zM8 10.5V16M8 7.8v.01M12 16v-5.5M12 13c0-1.6 1-2.6 2.4-2.6S17 11.4 17 13v3' }
  };
  function svg(name, o) {
    o = o || {}; const d = P[name]; if (!d) return document.createTextNode('');
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('class', 'ic' + (o.filled ? ' filled' : '') + (d.thick ? ' thick' : '') + (o.cls ? ' ' + o.cls : ''));
    el.setAttribute('aria-hidden', 'true');
    for (const k of ['s', 'c', 'l']) if (d[k]) { const p = document.createElementNS(ns, 'path'); p.setAttribute('class', k); p.setAttribute('d', d[k]); el.append(p); }
    if (o.size) { el.style.width = el.style.height = o.size + 'px'; }
    return el;
  }
  window.Icons = { svg, names: Object.keys(P) };
})();
