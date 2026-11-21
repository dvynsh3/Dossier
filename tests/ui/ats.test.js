'use strict';
// ATS readability: render every built-in template to PDF, read it back with pdftotext and check name, email, headings and entry text survive in order.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const T = require('../../src/core/templates');
const M = require('../../src/core/model');
const { tmpDir } = require('../helpers');

const hasPdftotext = spawnSync('pdftotext', ['-v']).error === undefined;

test('every built-in template stays readable as a PDF', { skip: !hasPdftotext && 'pdftotext (poppler) not installed' }, async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch(); const p = await b.newPage(); const dir = tmpDir('dossier-ats-'); const failures = [];
  try {
    for (const t of T.BUILTIN) {
      const { cv, items } = T.dummyCV(t.id);
      await p.setContent(T.renderDocument(cv, items, {}, [], { mode: 'print' }));
      const f = path.join(dir, t.id + '.pdf');
      await p.pdf({ path: f, preferCSSPageSize: true, printBackground: true });
      const flat = execFileSync('pdftotext', [f, '-']).toString().replace(/\s+/g, ' ');
      const model = T.buildModel(cv, items, {}); const errs = [];
      if (!flat.includes(model.header.name)) errs.push('name garbled');
      if (!flat.includes(model.header.email)) errs.push('email missing');
      let last = -1;
      for (const s of model.sections) {
        const i = flat.toLowerCase().indexOf(s.label.toLowerCase());
        if (i < 0) errs.push('heading missing: ' + s.label); else { if (i < last && t.ats === 'safe') errs.push('heading out of order: ' + s.label); last = i; }
      }
      for (const it of items) { const tx = M.itemText(it).trim(); if (tx && !flat.includes(tx.replace(/\s+/g, ' '))) errs.push('text broken: ' + tx.slice(0, 40)); }
      if (errs.length && t.ats === 'safe') failures.push(t.id + ': ' + errs.join('; '));
    }
  } finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  assert.deepEqual(failures, []);
});
