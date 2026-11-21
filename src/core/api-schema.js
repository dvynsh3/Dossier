'use strict';
// Argument checks for every call that crosses from the window into the app. A call with the wrong shape fails with a short,
// clear message before any code runs. Types: id, str, text (long string), url, bool, num, obj, arr, ids (array of ids), any.
// A trailing "?" means optional. Extra fields are allowed (the window may send more than a call reads).
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const LIM = { str: 2000, text: 400000, url: 4096, b64: 60e6, arr: 20000 };
const CHECK = {
  id: (v) => typeof v === 'string' && ID_RE.test(v),
  str: (v) => typeof v === 'string' && v.length <= LIM.str,
  text: (v) => typeof v === 'string' && v.length <= LIM.text,
  url: (v) => typeof v === 'string' && v.length <= LIM.url,
  big: (v) => typeof v === 'string' && v.length <= 2e6,
  b64: (v) => typeof v === 'string' && v.length <= LIM.b64,
  bool: (v) => typeof v === 'boolean',
  num: (v) => typeof v === 'number' && Number.isFinite(v),
  obj: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  arr: (v) => Array.isArray(v) && v.length <= LIM.arr,
  ids: (v) => Array.isArray(v) && v.length <= LIM.arr && v.every(x => typeof x === 'string' && ID_RE.test(x)),
  any: () => true
};

const SCHEMA = {
  'workspace.open': { folder: 'str' },
  'profiles.switch': { id: 'id' }, 'profiles.create': { name: 'str?', from: 'id?' }, 'profiles.rename': { id: 'id', name: 'str' }, 'profiles.delete': { id: 'id' },
  'app.logError': { message: 'text?', source: 'str?' },
  'workspace.deleteBackup': { name: 'str' }, 'workspace.restoreBackup': { name: 'str' }, 'workspace.importAll': { file: 'str', merge: 'bool?' },
  'items.save': { id: 'id?' }, 'items.saveMany': { items: 'arr' }, 'items.delete': { id: 'id' }, 'items.deleteMany': { ids: 'ids' },
  'items.star': { ids: 'ids', starred: 'bool' }, 'items.archive': { ids: 'ids', archived: 'bool' },
  'items.addVersion': { id: 'id', text: 'text' }, 'items.addVersions': { id: 'id', texts: 'arr' }, 'items.setMain': { id: 'id', versionId: 'id?' },
  'items.editVersion': { id: 'id', versionId: 'id', text: 'text' }, 'items.deleteVersion': { id: 'id', versionId: 'id' }, 'items.promoteVersion': { id: 'id', versionId: 'id' },
  'trash.restore': { kind: 'str', id: 'id' }, 'trash.purge': { kind: 'str', id: 'id' },
  'refine.apply': { changes: 'arr?', removes: 'arr?', newSkills: 'arr?' },
  'dup.resolve': { keep: 'id', other: 'id', action: 'str' },
  'cv.get': { id: 'id' }, 'cv.save': { id: 'id?' }, 'cv.delete': { id: 'id' }, 'cv.duplicate': { id: 'id' }, 'cv.filePath': { id: 'id' }, 'cv.html': { id: 'id', mode: 'str?' }, 'cv.plainText': { id: 'id' }, 'cv.pushToRepo': { id: 'id' },
  'net.checkUrl': { url: 'url' }, 'net.fetchText': { url: 'url' }, 'link.meta': { url: 'url' },
  'applications.save': { list: 'arr' },
  'jd.add': { name: 'str?', file: 'str?', b64: 'b64?', text: 'text?' }, 'jd.path': { file: 'str' }, 'jd.text': { file: 'str' }, 'jd.delete': { file: 'str' },
  'letter.export': { header: 'obj?', recipient: 'str?', company: 'str?', role: 'str?', subject: 'str?', body: 'text?', format: 'str?' },
  'templates.get': { id: 'id' }, 'templates.save': { name: 'str?', html: 'big?', css: 'big?' }, 'templates.delete': { id: 'id' },
  'skills.set': { name: 'str' }, 'attachments.add': { src: 'str' }, 'attachments.addBuffer': { name: 'str', b64: 'b64' }, 'attachments.path': { name: 'str' }, 'import.path': { name: 'str' },
  'liprofiles.save': { name: 'str', itemIds: 'ids?', header: 'obj?' }, 'liprofiles.delete': { id: 'str' },
  'import.file': { file: 'str' }, 'import.buffer': { name: 'str', b64: 'b64' }, 'import.text': { text: 'text' }, 'import.commit': { candidates: 'arr' },
  'ai.prepare': { task: 'str' }, 'ai.run': { task: 'str' }, 'ai.revealKey': { provider: 'id' }, 'ai.deleteKey': { provider: 'id' }, 'ai.models': { provider: 'id' }, 'ai.setKey': { provider: 'id', key: 'str' }, 'ai.hasKey': { provider: 'id' }, 'ai.test': { provider: 'id' },
  'export.run': { id: 'id', format: 'str' }, 'export.copyFile': { file: 'str' }, 'export.quickPdf': { id: 'id' }, 'export.pageCount': { id: 'id' }, 'ats.check': { id: 'id' }, 'template.snapshot': { id: 'id' }
};

// Returns null when the arguments are fine, or a short message naming the first problem.
function validate(name, args) {
  const spec = SCHEMA[name]; if (!spec) return null;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return 'Bad request.';
  for (const field of Object.keys(spec)) {
    let type = spec[field]; const optional = type.endsWith('?'); if (optional) type = type.slice(0, -1);
    const v = args[field];
    if (v === undefined || v === null) { if (optional) continue; return 'Missing "' + field + '".'; }
    if (!CHECK[type](v)) return 'Invalid "' + field + '".';
  }
  return null;
}

// Wraps every call of an API object so it is validated first.
function withValidation(api) {
  const out = {};
  for (const name of Object.keys(api)) {
    const fn = api[name];
    out[name] = (args) => { const bad = validate(name, args === undefined ? {} : args); if (bad) return Promise.reject(new Error(bad)); return fn(args === undefined ? {} : args); };
  }
  return out;
}
module.exports = { SCHEMA, validate, withValidation };
