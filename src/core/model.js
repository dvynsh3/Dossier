'use strict';
// Shared constants and helpers. Pure JS, usable in Node and (via <script>) in the renderer.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CVModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TYPES = [
    { key: 'work', label: 'Work experience' },
    { key: 'internship', label: 'Internship' },
    { key: 'education', label: 'Education' },
    { key: 'project', label: 'Project' },
    { key: 'certification', label: 'Certification' },
    { key: 'award', label: 'Award / achievement' },
    { key: 'position', label: 'Position of responsibility' },
    { key: 'extracurricular', label: 'Extra-curricular' },
    { key: 'initiative', label: 'Other initiative' },
    { key: 'publication', label: 'Publication' },
    { key: 'volunteering', label: 'Volunteering' },
    { key: 'skill', label: 'Skill' },
    { key: 'language', label: 'Language' }
  ];
  const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.key, t.label]));

  // Default CV sections. Work experience is ON by default and every section can be hidden.
  const DEFAULT_SECTIONS = [
    { key: 'education', label: 'Education', types: ['education'], visible: true },
    { key: 'work', label: 'Work Experience', types: ['work'], visible: true },
    { key: 'internship', label: 'Internships', types: ['internship'], visible: true },
    { key: 'project', label: 'Projects', types: ['project'], visible: true },
    { key: 'certification', label: 'Certifications', types: ['certification'], visible: true },
    { key: 'position', label: 'Positions of Responsibility', types: ['position', 'volunteering'], visible: true },
    { key: 'award', label: 'Awards and Achievements', types: ['award'], visible: true },
    { key: 'extracurricular', label: 'Extra-Curricular', types: ['extracurricular'], visible: true },
    { key: 'initiative', label: 'Other Initiatives', types: ['initiative', 'custom'], visible: true },
    { key: 'publication', label: 'Publications', types: ['publication'], visible: true },
    { key: 'skills', label: 'Skills', types: ['skill'], visible: true },
    { key: 'language', label: 'Languages', types: ['language'], visible: true },
    { key: 'pagebreak', label: 'Page Break', types: [], visible: false, pb: true }
  ];

  const DEFAULT_OPTS = {
    accent: '#1f4e79', font: 'Calibri, Arial, Helvetica, sans-serif', fontSize: 10,
    spacing: 1, margin: 14, pageSize: 'A4', photo: false, dateFormat: 'longapos', headingCase: 'upper', labels: false
  };

  function uid(prefix) {
    const r = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    return (prefix || 'id') + '_' + r;
  }
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // 'YYYY-MM' or 'YYYY' -> sortable number (YYYY*12+MM), '' / 'present' handled by caller
  function dateNum(d, endOfYear) {
    if (!d) return null;
    if (d === 'present') return 9999 * 12;
    const m = /^(\d{4})(?:-(\d{1,2}))?$/.exec(d);
    if (!m) return null;
    return +m[1] * 12 + (m[2] ? +m[2] - 1 : (endOfYear ? 11 : 0));
  }
  function fmtDate(d, mode) {
    if (!d) return '';
    if (d === 'present') return 'Present';
    const m = /^(\d{4})(?:-(\d{1,2}))?$/.exec(d);
    if (!m) return d;
    if (!m[2]) return m[1];
    const mi = +m[2] - 1;
    if (mode === 'apos') return MONTHS[mi] + '’' + m[1].slice(2);
    if (mode === 'longapos') return MONTHS_LONG[mi] + ' ’' + m[1].slice(2);
    if (mode === 'long') return MONTHS_LONG[mi] + ' ' + m[1];
    if (mode === 'iso') return m[1] + '-' + String(m[2]).padStart(2, '0');
    if (mode === 'numeric') return String(m[2]).padStart(2, '0') + '/' + m[1];
    return MONTHS[mi] + ' ' + m[1];
  }
  // full dates (applications etc.): 'YYYY-MM-DD' -> text in the app-wide format
  const FULL_FORMATS = { 'dmy-long': '28 October \'26', 'dmy-short': '28 Oct 2026', 'dmy-full': '28 October 2026', 'mdy': 'Oct 28, 2026', 'dmy-num': '28/10/2026', 'iso': '2026-10-28' };
  function fmtFull(d, fmt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); if (!m) return d || '';
    const day = +m[3], mi = +m[2] - 1, y = m[1];
    switch (fmt) {
      case 'dmy-short': return day + ' ' + MONTHS[mi] + ' ' + y;
      case 'dmy-full': return day + ' ' + MONTHS_LONG[mi] + ' ' + y;
      case 'mdy': return MONTHS[mi] + ' ' + day + ', ' + y;
      case 'dmy-num': return String(day).padStart(2, '0') + '/' + m[2] + '/' + y;
      case 'iso': return m[1] + '-' + m[2] + '-' + m[3];
      default: return day + ' ' + MONTHS_LONG[mi] + ' \'' + y.slice(2);
    }
  }
  function fmtRange(start, end, mode) {
    const s = fmtDate(start, mode), e = fmtDate(end, mode);
    if (s && e) return s === e ? s : s + ' – ' + e;
    return s || e || '';
  }
  function itemText(item, versionId) {
    if (!item) return '';
    const vid = versionId || item.mainVersion;
    if (vid && item.versions) {
      const v = item.versions.find(x => x.id === vid);
      if (v) return v.text;
    }
    return item.text || '';
  }
  function groupKey(it) {
    return [it.type, (it.org || '').trim().toLowerCase(), (it.role || '').trim().toLowerCase(),
      it.start || '', it.end || '', (it.title || '').trim().toLowerCase()].join('|');
  }
  function newItem(p) {
    const now = new Date().toISOString();
    return Object.assign({
      id: uid('it'), type: 'award', text: '', title: '', org: '', role: '', location: '',
      start: '', end: '', tags: [], skills: [], link: '', notes: '', extra: {},
      proof: null, // { file, issued, expires, credentialUrl }
      versions: [], mainVersion: null, archived: false, addedAt: now, updatedAt: now, source: ''
    }, p || {});
  }
  function newCV(p) {
    const now = new Date().toISOString();
    return Object.assign({
      id: uid('cv'), name: 'Untitled CV', targetRole: '', company: '', notes: '', profiles: [],
      templateId: 'classic', opts: Object.assign({}, DEFAULT_OPTS),
      header: { name: '', headline: '', email: '', phone: '', address: '', dob: '', links: [], photo: '' },
      sections: JSON.parse(JSON.stringify(DEFAULT_SECTIONS)),
      selected: [], // [{ itemId, versionId, override }]
      sortMode: 'date', privacy: false, autoSkills: false, created: now, updated: now
    }, p || {});
  }
  return { TYPES, TYPE_LABEL, DEFAULT_SECTIONS, DEFAULT_OPTS, MONTHS, FULL_FORMATS, fmtFull, uid, dateNum, fmtDate, fmtRange, itemText, groupKey, newItem, newCV };
});
