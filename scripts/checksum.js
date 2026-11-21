// Prints the SHA-256 of the installer(s) in dist/ and a block to paste into the GitHub release notes.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dist = path.join(__dirname, '..', 'dist');
const files = fs.existsSync(dist) ? fs.readdirSync(dist).filter((f) => /\.exe$/i.test(f)) : [];
if (!files.length) {
  console.error('No .exe found in dist/. Run "npm run dist" first.');
  process.exit(1);
}
for (const f of files) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, f))).digest('hex');
  console.log('\n' + f);
  console.log('SHA-256: ' + hash);
  console.log('\n--- paste into the release notes ---');
  console.log('**Windows installer:** `' + f + '`');
  console.log('This build is unsigned, so Windows SmartScreen may warn: choose *More info*, then *Run anyway*.');
  console.log('');
  console.log('**SHA-256**');
  console.log('```');
  console.log(hash + '  ' + f);
  console.log('```');
  console.log('To check your download (PowerShell): `Get-FileHash "' + f + '" -Algorithm SHA256`');
  console.log('------------------------------------');
}
