'use strict';
// Provider-agnostic AI layer. Local models are the default for rephrasing and import assistance.
// Nothing is sent unless the user clicks an AI action; remote providers get a preview first (see prepare()).
const NET = require('./net');

const TASK_NOTES = {
  rephrase: 'Rewrite a CV bullet in several alternative wordings.',
  extract: 'Pull structured items out of messy CV text.',
  critique: 'Review a CV, its line items, or its template.',
  tailor: 'Match CV items against a job description.',
  cover: 'Draft a cover letter from a CV and a job description.',
  refine: 'Tidy the repository: categories, alternative wordings, skills.'
};

function redact(text, header) {
  let t = String(text || '');
  t = t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[EMAIL]').replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, '[PHONE]').replace(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|,]+/gi, '[LINKEDIN]');
  if (header) {
    for (const v of [header.name, header.address].concat(header.links || [])) if (v && v.length > 3) t = t.split(v).join('[REDACTED]');
  }
  return t;
}

function systemFor(task) {
  const base = 'You are an expert CV and resume editor. Be precise and concise. Never invent facts, numbers, employers or dates that are not in the input. ';
  return {
    rephrase: base + 'Return ONLY a JSON array of strings, each a distinct rewrite of the given bullet. Keep each to one sentence, start with a strong action verb, keep every fact and number from the original, past tense unless told otherwise.',
    extract: base + 'Return ONLY JSON: an array of objects {"type":"work|internship|education|project|certification|award|position|extracurricular|initiative|publication|volunteering|skill|language","text":"","role":"","org":"","title":"","start":"YYYY-MM or YYYY","end":"YYYY-MM or YYYY or present"} found in the text. One object per bullet or achievement.',
    critique: base + 'Return ONLY JSON in the exact shape requested by the user message.',
    tailor: base + 'Return ONLY JSON in the exact shape requested by the user message.',
    refine: base + 'You organise a CV repository. For EACH given entry return one object. Return ONLY a JSON array: [{"id":"","type":"work|internship|education|project|certification|award|position|extracurricular|initiative|publication|volunteering|language","versions":["alternative wording 1","alternative wording 2"],"skills":[{"name":"SQL","category":"Tools"}]}]. type = the best category for the entry (keep the current one when it is right). versions = exactly 2 distinct rewrites of the entry text, each one sentence, strong action verb, keeping every fact and number (empty array when the entry has no text). skills = up to 6 concrete skills the entry demonstrates (tools, methods, soft skills) with a short category such as Tools, Analytics, Languages, Management, Communication.',
    cover: 'You write concise, honest cover letters. Use ONLY the facts given about the candidate; never invent employers, numbers or skills. Return ONLY the letter body as plain text: a greeting line, 3 short paragraphs, and a sign-off. No markdown, no JSON, no subject line, no square-bracket placeholders.'
  }[task];
}

// small local models often wrap, truncate or slightly break the JSON: pull out every complete {...} object they did write
function salvageObjects(t) {
  const out = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}' && depth > 0) { depth--; if (depth === 0 && start >= 0) { try { out.push(JSON.parse(t.slice(start, i + 1).replace(/,\s*([}\]])/g, '$1'))); } catch (e) { /* skip this one */ } start = -1; } }
  }
  return out.length ? out : undefined;
}
function parseJSON(text) {
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[\u201C\u201D]/g, '"').trim();
  const tryParse = s => { try { return JSON.parse(s); } catch (e) { return undefined; } };
  let v = tryParse(t);
  if (v !== undefined) return v;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) { v = tryParse(fence[1].trim()); if (v !== undefined) return v; }
  const a = t.indexOf('['), b = t.lastIndexOf(']'), c = t.indexOf('{'), d = t.lastIndexOf('}');
  if (a >= 0 && b > a && (c < 0 || a < c)) { v = tryParse(t.slice(a, b + 1)); if (v !== undefined) return v; }
  if (c >= 0 && d > c) { v = tryParse(t.slice(c, d + 1)); if (v !== undefined) return v; }
  v = tryParse(t.replace(/,\s*([}\]])/g, '$1')); if (v !== undefined) return v;
  return salvageObjects(t);
}

// accept the plain Gemini address too: the chat endpoint lives under /openai
function baseOf(prov) { let b = String(prov.baseUrl || '').replace(/\/+$/, ''); if (prov.kind === 'gemini') b = b.replace(/\/openai$/i, ''); return b; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function chat(prov, key, messages, opts) {
  opts = opts || {};
  if (!prov.baseUrl) throw new Error('This provider has no base URL set (Settings > AI).');
  if (!prov.model) throw new Error('This provider has no model set (Settings > AI).');
  if (prov.needsKey && !key) throw new Error('No API key saved for ' + (prov.label || 'this provider') + '.');
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), opts.timeoutMs || 180000);
  try {
    let url, headers = { 'Content-Type': 'application/json' }, body;
    if (prov.kind === 'gemini') {
      url = baseOf(prov) + '/models/' + encodeURIComponent(prov.model) + ':generateContent';
      headers['x-goog-api-key'] = key;
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
      body = { contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: (m.image ? [{ inlineData: { mimeType: 'image/png', data: m.image } }] : []).concat([{ text: m.content }]) })),
        generationConfig: { temperature: opts.temperature == null ? 0.7 : opts.temperature, maxOutputTokens: Math.max(opts.maxTokens || 2000, 1024) } };
      if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    } else if (prov.kind === 'anthropic') {
      url = baseOf(prov) + '/messages';
      headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01';
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
      body = { model: prov.model, max_tokens: opts.maxTokens || 2000, system: sys, temperature: opts.temperature == null ? 0.7 : opts.temperature,
        messages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.image ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: m.image } }, { type: 'text', text: m.content }] : m.content })) };
    } else {
      url = baseOf(prov) + '/chat/completions';
      if (key) headers['Authorization'] = 'Bearer ' + key;
      body = { model: prov.model, temperature: opts.temperature == null ? 0.7 : opts.temperature, messages: messages.map(m => m.image ? { role: m.role, content: [{ type: 'text', text: m.content }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + m.image } }] } : { role: m.role, content: m.content }) };
      if (opts.maxTokens) body.max_tokens = opts.maxTokens;
      if (!prov.remote) body.reasoning_effort = 'none';   // local thinking models: answer directly instead of reasoning first
    }
    let res, raw;
    for (let attempt = 0; ; attempt++) {   // a busy hosted model (503/429) usually recovers within seconds
      res = await NET.fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal }); raw = await res.text();
      if (res.ok || !prov.remote || ![429, 503].includes(res.status) || attempt >= 2) break;
      await sleep(1500 * (attempt + 1));
    }
    if (!res.ok) throw new Error('AI request failed (' + res.status + '): ' + raw.slice(0, 300));
    const j = JSON.parse(raw);
    if (prov.kind === 'gemini') {
      const c = j.candidates && j.candidates[0];
      if (!c) throw new Error('Gemini returned no answer' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (blocked: ' + j.promptFeedback.blockReason + ')' : '') + '.');
      return ((c.content && c.content.parts) || []).filter(x => x.text && !x.thought).map(x => x.text).join('');
    }
    if (prov.kind === 'anthropic') return (j.content || []).map(c => c.text || '').join('');
    const msg = j.choices && j.choices[0] && j.choices[0].message;
    return msg ? (msg.content || msg.reasoning_content || msg.reasoning || '') : '';
  } catch (e) {
    if (e.name === 'AbortError') { const secs = Math.round((opts.timeoutMs || 180000) / 1000); throw new Error(prov.remote ? (prov.label || 'The AI service') + ' did not answer within ' + secs + ' seconds. The request could not get through: check your internet connection, VPN or firewall, or try another provider in Settings.' : 'The local model did not answer within ' + secs + ' seconds. Local models can be slow; try a smaller model or a shorter input.'); }
    if (/fetch failed|ECONNREFUSED/i.test(String(e.message + (e.cause ? e.cause.message : '')))) throw new Error('Could not reach the AI server at ' + prov.baseUrl + '. ' + (prov.remote ? 'Check your internet connection.' : 'Is Ollama (or your local server) running?'));
    throw e;
  } finally { clearTimeout(to); }
}

async function listModels(prov, key) {
  const base = baseOf(prov);
  if (!prov.remote) {   // Ollama: its own list shows every installed model (the OpenAI-style list can miss some)
    try { const r = await NET.fetch(base.replace(/\/v1$/, '') + '/api/tags'); if (r.ok) { const j = await r.json(); const names = (j.models || []).map(m => m.name || m.model).filter(Boolean); if (names.length) return names; } } catch (e) { /* fall back */ }
  }
  if (prov.kind === 'gemini') {
    const res = await NET.fetch(base + '/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    if (!res.ok) throw new Error('Model list failed (' + res.status + ')');
    const j = await res.json();
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name || '').replace(/^models\//, '')).filter(Boolean);
  }
  const headers = key ? { Authorization: 'Bearer ' + key } : {};
  if (prov.kind === 'anthropic') headers['x-api-key'] = key, headers['anthropic-version'] = '2023-06-01';
  const res = await NET.fetch(base + '/models', { headers });
  if (!res.ok) throw new Error('Model list failed (' + res.status + ')');
  const j = await res.json();
  return (j.data || j.models || []).map(m => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
}

// Build the exact messages that would be sent so the UI can show a preview first.
function prepare(task, payload, settings) {
  const redactOn = settings && settings.ai ? settings.ai.redact !== false : true;
  const header = payload.header || (settings && settings.header);
  const R = t => redactOn ? redact(t, header) : t;
  let user;
  switch (task + ':' + (payload.mode || '')) {
    case 'rephrase:': {
      const n = payload.count || 3;
      user = `Rewrite this CV bullet in ${n} different ways.${payload.tone ? ' Tone: ' + payload.tone + '.' : ''}${payload.role ? ' Role: ' + payload.role + '.' : ''}${payload.org ? ' Organisation: ' + R(payload.org) + '.' : ''}${payload.target ? ' Target job: ' + payload.target + '.' : ''}\n\nBullet:\n${R(payload.text)}`;
      break;
    }
    case 'extract:': user = 'Extract the CV items from this text:\n\n' + R(String(payload.text).slice(0, 12000)); break;
    case 'critique:cv': user = 'Critique this CV. Return JSON: {"score":0-100,"summary":"2-3 sentences","strengths":[""],"weaknesses":[""],"missing":[""],"sectionOrder":"advice","topFixes":[""]}.\n\nCV text:\n' + R(payload.text); break;
    case 'critique:items': user = 'Critique each CV line item. Return JSON array: [{"id":"","score":1-10,"issue":"","suggestion":"improved rewrite using only the given facts"}].\n\nItems:\n' + payload.items.map(i => `[${i.id}] ${R(i.text)}`).join('\n'); break;
    case 'critique:template': user = `Critique this CV template and formatting for readability, visual hierarchy, density, contrast, whitespace, and ATS/parser risk. Template name: ${payload.name}. Layout notes: ${payload.notes || 'n/a'}. ${payload.image ? 'A rendered page image is attached.' : 'No image is attached; judge from the text order below.'} Return JSON: {"score":0-100,"readability":"","hierarchy":"","density":"","atsRisk":"low|medium|high","atsNotes":"","suggestions":[""]}.\n\nExtracted text in reading order:\n${R(payload.text || '')}`; break;
    case 'tailor:': user = 'Match this CV against the job description. Return JSON: {"keywords":["important terms from the job"],"missingKeywords":["keywords not covered by the CV"],"scores":[{"id":"","score":0-10,"why":""}],"summary":""}.\n\nJOB DESCRIPTION:\n' + String(payload.job).slice(0, 8000) + '\n\nCV ITEMS:\n' + payload.items.map(i => `[${i.id}] (${i.type}) ${R(i.text)}`).join('\n'); break;
    case 'refine:': user = 'Process these entries and return the JSON array.\n\n' + payload.items.map(i => JSON.stringify({ id: i.id, type: i.type, role: i.role, org: R(i.org), title: i.title, text: R(i.text) })).join('\n'); break;
    case 'cover:': user = 'Write a cover letter for the role "' + (payload.role || 'the role') + '" at ' + R(payload.company || 'the company') + (payload.addressee ? ', addressed to ' + R(payload.addressee) : '') + '.\n\nCANDIDATE FACTS (from their CV):\n' + R(String(payload.cv || '').slice(0, 7000)) + (payload.jd ? '\n\nJOB DESCRIPTION:\n' + R(String(payload.jd).slice(0, 7000)) : '');
      break;
    default: throw new Error('Unknown AI task: ' + task + ' ' + (payload.mode || ''));
  }
  const messages = [{ role: 'system', content: systemFor(task) }, { role: 'user', content: user }];
  if (payload.image) messages[1].image = payload.image;
  return { messages, preview: messages.map(m => '[' + m.role + ']\n' + m.content).join('\n\n') + (payload.image ? '\n\n[attached: rendered page image]' : '') };
}

async function run(task, payload, settings, getKey, providerOverride) {
  const provId = providerOverride || (settings.ai.tasks[task] || ((task === 'cover' || task === 'refine') ? settings.ai.tasks.rephrase : undefined));
  const prov = settings.ai.providers[provId];
  if (!prov) throw new Error('No AI provider configured for ' + task);
  const p = prepare(task, payload, settings);
  if (p.messages[1].image && !prov.remote) { delete p.messages[1].image; }
  const key = prov.needsKey ? await getKey(provId) : '';
  const text = await chat(prov, key, p.messages, { temperature: task === 'rephrase' ? 0.8 : task === 'cover' ? 0.6 : 0.3, maxTokens: task === 'extract' || task === 'refine' ? 4000 : 2500, timeoutMs: prov.remote ? 120000 : 180000 });
  const data = task === 'cover' ? undefined : parseJSON(text);
  return { provider: provId, model: prov.model, raw: text, data, sent: p.preview };
}

function rephraseResult(res) {
  let arr = res.data;
  if (arr && !Array.isArray(arr) && Array.isArray(arr.versions)) arr = arr.versions;
  if (!Array.isArray(arr)) {
    arr = String(res.raw || '').split('\n').map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(l => l.length > 15);
  }
  return arr.map(x => typeof x === 'string' ? x : (x && x.text) || '').map(s => s.trim()).filter(Boolean);
}

module.exports = { run, prepare, chat, listModels, parseJSON, redact, rephraseResult, TASK_NOTES };
