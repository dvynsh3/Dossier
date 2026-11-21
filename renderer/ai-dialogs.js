'use strict';
(function () {
  const { h, clear, call, tryCall, toast, modal } = UI;
  const M = window.CVModel;
  const S = App.state;

  // AI helpers: provider picker, "this is exactly what leaves your computer" confirmation, rephrase dialog.
  // AI: confirm what is sent, then run
  App.aiProviderSelect = function (task, value) {
    const provs = S.settings.ai.providers;
    return h('select', { title: 'AI provider for this action' }, Object.entries(provs).map(([id, p]) => h('option', { value: id, selected: (value || S.settings.ai.tasks[task]) === id }, p.label + (p.remote ? '' : ' (stays on this PC)'))));
  };
  App.aiRun = async function (task, payload, provider) {
    const prov = S.settings.ai.providers[provider];
    if (prov && prov.remote) {
      const prep = await call('ai.prepare', { task, payload });
      const ok = await modal('Send this to ' + prov.label + '?', h('div', null, h('p', { class: 'muted small' }, 'This is exactly what will leave your computer.' + (S.settings.ai.redact !== false ? ' Email, phone, your name and links are replaced by placeholders.' : ' Redaction is switched off in Settings.')), h('pre', { class: 'raw' }, prep.preview)), { wide: true, buttons: [{ label: 'Cancel', value: false }, { label: 'Send', value: true, cls: 'primary' }] });
      if (!ok) return null;
    }
    const t = UI.busy('Waiting for ' + (prov ? prov.label : 'AI') + '...', { note: prov && !prov.remote ? 'Local models can take a minute.' : '' });
    try { return await call('ai.run', { task, payload, provider }); }
    catch (e) { toast(e.message, { err: true }); return null; }
    finally { t.remove(); }
  };
  // Rephrase dialog. onSaved(item) is called after versions are stored.
  App.rephrase = async function (item, text, onSaved) {
    const count = h('select', null, [2, 3, 4, 5].map(n => h('option', { value: n, selected: n === 3 }, n + ' versions')));
    const tone = h('select', null, ['', 'more concise', 'stronger impact, quantified', 'more formal', 'simpler wording'].map(t => h('option', { value: t }, t || 'Tone: keep as is')));
    const target = h('input', { type: 'text', placeholder: 'Target role (optional)', style: { width: '100%' } });
    const provSel = App.aiProviderSelect('rephrase');
    const out = h('div'); const checks = [];
    const textBox = h('textarea', { rows: 3 }); textBox.value = text || M.itemText(item);
    const gen = async () => {
      const r = await App.aiRun('rephrase', { text: textBox.value, count: +count.value, tone: tone.value, target: target.value, role: item.role, org: item.org }, provSel.value);
      if (!r) return;
      clear(out); checks.length = 0;
      const vs = r.versions || [];
      if (!vs.length) { out.append(h('p', { class: 'muted' }, 'The model did not return usable rewrites. Raw reply:'), h('pre', { class: 'raw' }, r.raw || '')); return; }
      out.append(h('p', { class: 'small muted' }, 'Made by ' + r.provider + ' (' + r.model + '). Tick the ones to keep as alternative versions:'));
      vs.forEach(v => { const cb = h('input', { type: 'checkbox', checked: true }); checks.push({ cb, v, ed: null }); const ta = h('textarea', { rows: 2 }); ta.value = v; checks[checks.length - 1].ed = ta; out.append(h('div', { class: 'ver' }, h('label', { class: 'row small' }, cb, 'keep'), ta)); });
    };
    const lab = (t, el) => h('label', { class: 'f' }, h('span', { class: 'small muted' }, t), el);
    [count, tone, provSel, textBox].forEach(e => { e.style.width = '100%'; });
    const r = await modal('Rephrase with AI', h('div', { class: 'rpgrid' }, h('p', { class: 'small muted', style: { margin: 0 } }, 'Your wording stays as the original. New wordings are stored beneath it.'),
      lab('Text to rephrase', textBox), h('div', { class: 'rp3' }, lab('How many', count), lab('Tone', tone), lab('Model', provSel)), lab('Target role (optional)', target),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: gen }, UI.icon('sparkles'), 'Generate')), out),
      { wide: true, buttons: [{ label: 'Cancel', value: false }, { label: 'Save selected as versions', value: true, cls: 'primary', onclick: () => { return true; } }] });
    if (!r) return null;
    const texts = checks.filter(c => c.cb.checked).map(c => c.ed.value.trim()).filter(Boolean);
    if (!texts.length) return null;
    const it = await tryCall('items.addVersions', { id: item.id, texts, source: 'ai', label: provSel.value });
    if (it) { await App.reloadItems(); toast(texts.length + ' version(s) added'); if (onSaved) onSaved(it); }
    return it;
  };
})();
