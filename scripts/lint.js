#!/usr/bin/env node
'use strict';
// Static checks with the TypeScript compiler (no ESLint needed): undefined names, unused variables/imports, wrong argument counts.
// Usage: npm run lint        (exit code 1 when anything is found)
let ts;
try { ts = require('typescript'); } catch (e) { console.error('lint: the "typescript" package is missing. Run npm install.'); process.exit(2); }
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SKIP = /(^|[\\/])(node_modules|dist|tests?|\.git|assets|build)([\\/]|$)|logo-data|logo-more/;
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (SKIP.test(path.relative(root, p))) continue;
    if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
  }
})(root);

// Globals that the renderer files share through <script> tags (see renderer/index.html).
const globals = path.join(__dirname, 'lint-globals.d.ts');
const program = ts.createProgram(files.concat(globals), {
  allowJs: true, checkJs: true, noEmit: true, noUnusedLocals: true, noUnusedParameters: false,
  target: ts.ScriptTarget.ES2022, strict: false, skipLibCheck: true, noImplicitAny: false, types: [],
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts']
});
// 2304 undefined name, 6133/6196/6198 unused, 2552 misspelt name, 2451/2300/2393 redeclared, 2554 wrong argument count
const KEEP = new Set([2304, 6133, 6196, 6198, 2552, 2451, 2300, 2393, 2554]);
let n = 0;
for (const d of ts.getPreEmitDiagnostics(program)) {
  if (!d.file || !KEEP.has(d.code)) continue;
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  console.log(path.relative(root, d.file.fileName) + ':' + (line + 1) + '  TS' + d.code + '  ' + ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 140));
  n++;
}
console.log(n ? '\n' + n + ' problem(s).' : 'lint: clean.');
process.exit(n ? 1 : 0);
