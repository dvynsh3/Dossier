'use strict';
// Small offline QR code generator: byte mode, error correction level M, versions 1-10 (up to ~213 characters).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.QR = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  // per version (level M): [data codewords per block group..., ec codewords per block, blocks1, dataCw1, blocks2, dataCw2]
  const VER = [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const EXP = new Array(512), LOG = new Array(256);
  (function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
  function rsRem(data, n) { const g = rsGen(n); const r = new Array(n).fill(0); for (const b of data) { const f = b ^ r.shift(); r.push(0); if (f) for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); } return r; }
  const utf8 = (s) => Array.from(unescape(encodeURIComponent(s)), c => c.charCodeAt(0));
  const dataCw = (v) => VER[v][1] * VER[v][2] + VER[v][3] * VER[v][4];

  function encode(text) {
    const bytes = utf8(String(text));
    let v = 1; for (; v <= 10; v++) { const cc = v < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= dataCw(v) * 8) break; }
    if (v > 10) throw new Error('That link is too long for a QR code (limit about 210 characters).');
    const bits = []; const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCw(v) * 8; for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0); while (bits.length % 8) bits.push(0);
    const cw = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }
    for (let pad = 0xec; cw.length < dataCw(v); pad ^= 0xec ^ 0x11) cw.push(pad);
    // blocks
    const [ecn, n1, d1, n2, d2] = VER[v]; const blocks = []; let p = 0;
    for (let i = 0; i < n1 + n2; i++) { const len = i < n1 ? d1 : d2; const d = cw.slice(p, p + len); p += len; blocks.push({ d, e: rsRem(d, ecn) }); }
    const out = []; const maxd = Math.max(d1, d2);
    for (let i = 0; i < maxd; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < ecn; i++) for (const b of blocks) out.push(b.e[i]);
    return { v, codewords: out };
  }

  function build(text) {
    const { v, codewords } = encode(text); const size = 17 + 4 * v;
    const m = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark, f) => { if (x < 0 || y < 0 || x >= size || y >= size) return; m[y][x] = !!dark; if (f !== false) fn[y][x] = true; };
    // timing
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    // finders + separators
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
    // alignment
    const al = ALIGN[v]; for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) { if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    const fmt = (mask) => {
      const data = (0 << 3) | mask; let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); const bits = ((data << 10) | rem) ^ 0x5412; const b = (i) => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, b(i)); set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i)); set(8, size - 8, true);
    };
    fmt(0);
    if (v >= 7) { let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25); const bits = (v << 12) | rem; for (let i = 0; i < 18; i++) { const bit = ((bits >>> i) & 1) !== 0; const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit); set(b, a, bit); } }
    // data
    let i = 0; const total = codewords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j; const up = ((right + 1) & 2) === 0; const y = up ? size - 1 - vert : vert; if (!fn[y][x] && i < total) { m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; } } }
    const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const applyMask = (k) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASK[k](x, y)) m[y][x] = !m[y][x]; };
    const penalty = () => {
      let p = 0;
      for (let y = 0; y < size; y++) for (const horiz of [true, false]) { let run = 1; for (let k = 1; k < size; k++) { const a = horiz ? m[y][k] : m[k][y], b = horiz ? m[y][k - 1] : m[k - 1][y]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
      let dark = 0; for (const r of m) for (const c of r) if (c) dark++; p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let k = 0; k < 8; k++) { applyMask(k); fmt(k); const pn = penalty(); if (pn < bestP) { bestP = pn; best = k; } applyMask(k); }
    applyMask(best); fmt(best);
    return m;
  }

  // SVG as a data URI (white background and quiet zone included)
  function svg(text) {
    const m = build(text), n = m.length, q = 3; let d = '';
    for (let y = 0; y < n; y++) { let x = 0; while (x < n) { if (m[y][x]) { let e = x; while (e < n && m[y][e]) e++; d += 'M' + (x + q) + ' ' + (y + q) + 'h' + (e - x) + 'v1h-' + (e - x) + 'z'; x = e; } else x++; } }
    const s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q) + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
    return 'data:image/svg+xml;base64,' + (typeof Buffer !== 'undefined' ? Buffer.from(s).toString('base64') : btoa(s));
  }
  // PNG bytes (Node only) for Word export
  function png(text, scale) {
    const zlib = require('zlib'); const m = build(text), n = m.length, q = 3, sc = scale || 8, W = (n + 2 * q) * sc;
    const raw = Buffer.alloc((W + 1) * W, 255);
    for (let y = 0; y < W; y++) { raw[y * (W + 1)] = 0; const my = Math.floor(y / sc) - q; for (let x = 0; x < W; x++) { const mx = Math.floor(x / sc) - q; if (my >= 0 && my < n && mx >= 0 && mx < n && m[my][mx]) raw[y * (W + 1) + 1 + x] = 0; } }
    const crcT = []; for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[i] = c >>> 0; }
    const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  }
  return { build, svg, png };
});
