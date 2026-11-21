'use strict';
// Editor: template files and the template editor.
// Part of the editor (see editor.js). It shares the editor's state and helpers through App.edKit.
(function () {
  const { h, $, clear, call, tryCall, toast, debounce } = UI;
  const TP = window.CVTemplates;
  const S = App.state;
  const T = App.tabs.editor;
  const K = App.edKit;
  const { E, mutate } = K;
  // ---------- template files ----------
  async function importTemplateFile() {
    const f = await UI.pickFiles({ accept: '.json', filters: [{ name: 'Template', extensions: ['json'] }] }); if (!f.length) return;
    let txt; if (f[0].b64) txt = atob(f[0].b64); else { return toast('Use the import button in browser test mode only; in the desktop app drag the file onto Import is not supported for templates. Choose the file again.', { err: true }); }
    try { const t = JSON.parse(txt); if (!t.html) throw new Error('Not a template file'); await call('templates.save', { name: t.name || 'Imported template', html: t.html, css: t.css || '', sidebar: t.sidebar || [] }); await App.reloadTemplates(); T.render($('#view')); toast('Template imported'); } catch (e) { toast(e.message, { err: true }); }
  }
  function currentTplSource() { return TP.findTemplate(S.cv.templateId, K.customFull); }
  function exportTemplateFile() { const t = currentTplSource(); UI.download((t.name || 'template').replace(/[^\w-]+/g, '_') + '.cvtemplate.json', JSON.stringify({ name: t.name, html: t.html, css: t.css, sidebar: t.sidebar || [] }, null, 2)); }

  // ---------- template editor (inside the Editor tab) ----------
  T.editTemplate = function () { const t = currentTplSource(); E().tpl = { id: t.custom ? t.id : null, name: t.custom ? t.name : t.name + ' (copy)', html: t.html, css: t.css, sidebar: t.sidebar || [], useMine: false }; E().mode = 'template'; T.render($('#view')); };
  function renderTemplateEditor(view) {
    const tp = E().tpl; const ed = h('div', { class: 'editor', style: { flexDirection: 'column' } }); clear(view).append(ed);
    const nameIn = h('input', { type: 'text', value: tp.name, style: { width: '260px' }, oninput: e => tp.name = e.target.value });
    const htmlTa = h('textarea', { spellcheck: false, oninput: e => { tp.html = e.target.value; refresh(); } }); htmlTa.value = tp.html;
    const cssTa = h('textarea', { spellcheck: false, oninput: e => { tp.css = e.target.value; refresh(); } }); cssTa.value = tp.css;
    const prev = h('iframe', { style: { width: '100%', height: '100%', border: 0, background: '#fff' }, sandbox: 'allow-same-origin' });
    const err = h('span', { class: 'small', style: { color: 'var(--bad)' } });
    const refresh = debounce(() => {
      try {
        const base = tp.useMine ? { cv: S.cv, items: S.items } : TP.dummyCV(S.cv.templateId, S.cv.opts);
        const cv = Object.assign({}, base.cv, { opts: Object.assign({}, S.cv.opts), sortMode: 'date' });
        prev.srcdoc = TP.renderDocument(cv, base.items, S.settings, [], { template: { html: tp.html, css: tp.css, sidebar: tp.sidebar }, mode: 'preview' }); err.textContent = '';
      } catch (e) { err.textContent = 'Template error: ' + e.message; }
    }, 120);
    ed.append(h('div', { class: 'ebar' }, h('b', null, 'Template editor'), nameIn,
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: tp.useMine, onchange: e => { tp.useMine = e.target.checked; refresh(); } }), 'Preview with my CV content (otherwise sample content)'),
      err, h('div', { class: 'spacer' }),
      tp.id ? h('button', { class: 'btn small', onclick: () => saveTpl(true) }, 'Update this template') : null,
      h('button', { class: 'btn small primary', onclick: () => saveTpl(false) }, 'Save as new template'),
      h('button', { class: 'btn small', onclick: () => { E().mode = 'cv'; T.render($('#view')); } }, 'Back to my CV')));
    const cheat = h('details', { class: 'acc', style: { margin: '8px 10px 0' } }, h('summary', null, 'What you can use in a template'), h('div', null, h('div', { class: 'small', style: { lineHeight: 1.6 } },
      h('code', null, '{{header.name}} {{header.headline}} {{header.contactLine}} {{#header.contact}}{{.}}{{/header.contact}}'), h('br'),
      h('code', null, '{{#sections}} ... {{label}} ... {{/sections}}'), ' each visible section. Inside: ', h('code', null, '{{#groups}}'), ' (entries), ', h('code', null, '{{#skillGroups}}{{category}}: {{list}}{{/skillGroups}}'), ', ', h('code', null, '{{#isList}}{{list}}{{/isList}}'), h('br'),
      'Inside a group: ', h('code', null, '{{head}} {{sub}} {{dates}} {{score}} {{remarks}} {{#isEdu}}..{{/isEdu}} {{#flat}}..{{/flat}} {{#bullets}}<li data-id="{{id}}">{{text}}{{date}}</li>{{/bullets}}'), h('br'),
      'Keep ', h('code', null, 'data-id="{{id}}"'), ' on bullet elements so the live editor can click, edit and right-click them. Styling variables: ', h('code', null, '{{accent}} {{{font}}} {{fontSize}} {{spacing}}'), '. For best ATS results keep one column, real text, no images of text, no letter-spacing, and headings as plain words.')));
    ed.append(cheat);
    ed.append(h('div', { class: 'tpled', style: { flex: 1, minHeight: 0 } }, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', minHeight: 0 } }, h('b', { class: 'small' }, 'HTML'), htmlTa, h('b', { class: 'small' }, 'CSS'), cssTa), h('div', { style: { minHeight: 0, border: '1px solid var(--line)' } }, prev)));
    refresh();
    async function saveTpl(update) {
      const payload = { name: tp.name || 'My template', html: tp.html, css: tp.css, sidebar: tp.sidebar || [], ats: 'unchecked' }; if (update && tp.id) payload.id = tp.id;
      const t = await tryCall('templates.save', payload); if (!t) return;
      await App.reloadTemplates(); tp.id = t.id; mutate(cv => cv.templateId = t.id, { panel: false });
      toast('Template saved. Run "ATS check" on a CV that uses it to verify it.'); E().mode = 'cv'; T.render($('#view'));
    }
  }
  Object.assign(K, { renderTemplateEditor, importTemplateFile, exportTemplateFile });
})();
