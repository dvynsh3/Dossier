'use strict';
// Text comparison used by the ATS check: item text is looked for in the text read back from the exported PDF.
// Differences that do not matter to a parser are ignored: runs of spaces, curly quotes, capitals, and spaces
// around a hyphen or dash (some fonts make the PDF reader return "net - banking" for "net-banking").
const DASHES = /\s*[-‐‑‒–—―−]\s*/g;
function atsNorm(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’‛′]/g, "'").replace(/[“”″]/g, '"')
    .replace(/ /g, ' ').replace(/[​-‍﻿­]/g, '')
    .replace(/\s+/g, ' ')
    .replace(DASHES, '-')
    .trim().toLowerCase();
}
module.exports = { atsNorm };
