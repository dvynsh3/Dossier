'use strict';
// Additional built-in templates. Pure data: html + css strings in the same mustache-lite format as templates.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CVTemplatesExtra = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const UL = `<ul>{{#bullets}}<li data-id="{{id}}">{{text}}{{#date}} <span class="date">{{date}}</span>{{/date}}</li>{{/bullets}}</ul>`;
  const SK = `{{#isSkills}}{{#skillGroups}}<p class="sk">{{#showCat}}<b>{{category}}:</b> {{/showCat}}{{list}}</p>{{/skillGroups}}{{/isSkills}}{{#isList}}<p class="sk">{{list}}</p>{{/isList}}`;
  const SKCHIPS = `{{#isSkills}}{{#skillGroups}}<div class="skg">{{#showCat}}<b>{{category}}</b>{{/showCat}}<ul class="chips">{{#names}}<li>{{.}}</li>{{/names}}</ul></div>{{/skillGroups}}{{/isSkills}}{{#isList}}<p class="sk">{{list}}</p>{{/isList}}`;
  const FLAT = `{{#flat}}<div class="grp">${UL}</div>{{/flat}}`;
  // standard group: head/sub on the left, dates on the right
  const G_STD = `{{^flat}}<div class="grp"><div class="row"><div class="gh">{{#isEdu}}<b>{{head}}</b>{{#sub}}, {{sub}}{{/sub}}{{#score}} | {{score}}{{/score}}{{#remarks}} | {{remarks}}{{/remarks}}{{/isEdu}}{{^isEdu}}{{#head}}<b>{{head}}</b>{{/head}}{{#titleExtra}} | {{titleExtra}}{{/titleExtra}}{{#sub}}{{#head}}, {{/head}}<i>{{sub}}</i>{{/sub}}{{/isEdu}}</div><div class="date">{{dates}}</div></div>{{#hasBullets}}${UL}{{/hasBullets}}</div>{{/flat}}`;
  // two-line group: organisation + place, then role + dates (Harvard style)
  const G_TWO = `{{^flat}}<div class="grp">{{#isEdu}}<div class="row"><b>{{org}}</b><span class="date">{{dates}}</span></div><div class="row"><i>{{head}}{{#remarks}}, {{remarks}}{{/remarks}}</i><span>{{score}}</span></div>{{/isEdu}}{{^isEdu}}<div class="row"><b>{{#org}}{{org}}{{/org}}{{^org}}{{head}}{{/org}}</b><span class="date">{{dates}}</span></div>{{#org}}<div class="row"><i>{{head}}{{#titleExtra}} | {{titleExtra}}{{/titleExtra}}</i><span>{{loc}}</span></div>{{/org}}{{/isEdu}}{{#hasBullets}}${UL}{{/hasBullets}}</div>{{/flat}}`;
  // group with dates first (left gutter)
  const G_GUT = `{{^flat}}<div class="g"><div class="d date">{{dates}}</div><div class="c"><div class="gh">{{#isEdu}}<b>{{head}}</b>{{#sub}}, {{sub}}{{/sub}}{{#score}} | {{score}}{{/score}}{{#remarks}} | {{remarks}}{{/remarks}}{{/isEdu}}{{^isEdu}}{{#head}}<b>{{head}}</b>{{/head}}{{#titleExtra}} | {{titleExtra}}{{/titleExtra}}{{#sub}}{{#head}}, {{/head}}<i>{{sub}}</i>{{/sub}}{{/isEdu}}</div>{{#hasBullets}}${UL}{{/hasBullets}}</div></div>{{/flat}}`;
  const G_FLATG = `{{#flat}}<div class="g"><div class="d"></div><div class="c">${UL}</div></div>{{/flat}}`;
  // group with the date directly under the heading line
  const G_STACK = `{{^flat}}<div class="grp"><div class="gh">{{#isEdu}}<b>{{head}}</b>{{#sub}}, {{sub}}{{/sub}}{{#score}} | {{score}}{{/score}}{{#remarks}} | {{remarks}}{{/remarks}}{{/isEdu}}{{^isEdu}}{{#head}}<b>{{head}}</b>{{/head}}{{#titleExtra}} | {{titleExtra}}{{/titleExtra}}{{#sub}}{{#head}} - {{/head}}<i>{{sub}}</i>{{/sub}}{{/isEdu}}</div><div class="dt">{{dates}}</div>{{#hasBullets}}${UL}{{/hasBullets}}</div>{{/flat}}`;

  const HEADER_STD = `<header class="hd">{{#header.showPhoto}}<img class="ph" src="{{{header.photo}}}" alt="">{{/header.showPhoto}}<div class="hdt"><h1>{{header.name}}</h1>{{#header.headline}}<p class="hl">{{header.headline}}</p>{{/header.headline}}<div class="ct">{{{header.contactHtml}}}</div></div></header>`;
  const HEADER_SPLIT = `<header class="hd"><div class="hl1"><h1>{{header.name}}</h1>{{#header.headline}}<p class="hl">{{header.headline}}</p>{{/header.headline}}</div><div class="hr1"><div class="ct">{{{header.contactHtml}}}</div></div></header>`;

  const secs = (inner, sk) => `{{#sections}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2>${sk || SK}{{#groups}}${FLAT}${inner}{{/groups}}</section>{{/sections}}`;
  const sideBlock = (inner) => `{{#groups}}<div class="grp">{{#head}}<p><b>{{head}}</b></p>{{/head}}{{#sub}}<p>{{sub}}</p>{{/sub}}{{#dates}}<p class="date">{{dates}}</p>{{/dates}}{{#hasBullets}}${UL}{{/hasBullets}}</div>{{/groups}}`;
  const twoCol = (sideFirst) => {
    const side = `<aside class="side"><section class="sec"><h2>Contact</h2>{{#header.contact}}<p>{{.}}</p>{{/header.contact}}</section>{{#sections}}{{#side}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2>${SK}${sideBlock()}</section>{{/side}}{{/sections}}</aside>`;
    const main = `<main class="main">{{#sections}}{{^side}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2>${SK}{{#groups}}${FLAT}${G_STD}{{/groups}}</section>{{/side}}{{/sections}}</main>`;
    return `<header class="hd">{{#header.showPhoto}}<img class="ph" src="{{{header.photo}}}" alt="">{{/header.showPhoto}}<div><h1>{{header.name}}</h1>{{#header.headline}}<p class="hl">{{header.headline}}</p>{{/header.headline}}</div></header><div class="cols">${sideFirst ? side + main : main + side}</div>`;
  };
  const BULLET_DOT = (c) => `.grp li{padding-left:11pt;position:relative}.grp li:before{content:"${c || '\\2022'}";position:absolute;left:1pt;color:{{accent}}}`;

  const T = [];
  // 1 Harvard / Ivy
  T.push({ id: 'harvard', name: 'Harvard', ats: 'safe', description: 'Ivy-league style: centred name, serif type, organisation first then role, thin rules.',
    html: HEADER_STD + secs(G_TWO),
    css: `body{font-family:"Times New Roman",Times,serif;font-size:{{fontSize}}pt;line-height:1.3}.hd{text-align:center;margin-bottom:2pt}.hd h1{font-size:1.9em;font-weight:700;letter-spacing:.01em}.ct{font-size:.95em;margin-top:1pt}.hl{font-style:italic}
h2{font-size:1em;{{#upper}}text-transform:uppercase;{{/upper}}font-weight:700;border-bottom:.8pt solid #000;margin-bottom:2pt;padding-bottom:1pt}.grp li{padding-left:12pt;position:relative}.grp li:before{content:"\\2022";position:absolute;left:3pt}.sec{margin-top:calc(8pt*{{spacing}})}` });
  // 2 Executive
  T.push({ id: 'executive', name: 'Executive', ats: 'safe', description: 'Deep header block with name left and contact right, gold-style accent line, confident and formal.',
    html: HEADER_SPLIT + secs(G_STD),
    css: `.hd{background:{{accent}};color:#fff;padding:14pt 16pt;margin:-2pt -2pt 4pt;display:flex;justify-content:space-between;align-items:flex-end;gap:14pt;border-bottom:3pt solid #c9a24a}.hd h1{font-size:2.2em;font-weight:700;letter-spacing:.02em}.hl{opacity:.9;margin-top:2pt}.hr1{text-align:right;font-size:.92em;line-height:1.5}
h2{font-size:1.05em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.04em;color:{{accent}};border-bottom:1pt solid #c9a24a;padding-bottom:1.5pt;margin-bottom:2pt}${BULLET_DOT('\\25A0')}.grp li:before{font-size:.6em;top:.3em}` });
  // 3 Swiss minimal (section labels left)
  T.push({ id: 'swiss', name: 'Swiss minimal', ats: 'tolerant', description: 'Lots of white space; section names sit in a narrow left column, content on the right.',
    html: `<header class="hd"><h1>{{header.name}}</h1>{{#header.headline}}<p class="hl">{{header.headline}}</p>{{/header.headline}}<div class="ct">{{{header.contactHtml}}}</div></header>{{#sections}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2><div class="sc">${SK}{{#groups}}${FLAT}${G_STD}{{/groups}}</div></section>{{/sections}}`,
    css: `body{font-family:{{{font}}}}.hd{margin-bottom:8pt}.hd h1{font-size:2.5em;font-weight:300;letter-spacing:-.01em}.hl{color:#555;margin-top:1pt}.ct{margin-top:3pt;color:#555;font-size:.92em}
.sec{display:grid;grid-template-columns:22% 1fr;gap:12pt;margin-top:calc(8pt*{{spacing}});border-top:.6pt solid #ccc;padding-top:5pt}h2{font-size:.85em;{{#upper}}text-transform:uppercase;{{/upper}}color:{{accent}};font-weight:700}${BULLET_DOT('\\2013')}.grp:first-child{margin-top:0}` });
  // 4 Date gutter
  T.push({ id: 'gutter', name: 'Date gutter', ats: 'tolerant', description: 'Dates run down a left gutter, details to the right. Easy to scan chronologically.',
    html: HEADER_STD + `{{#sections}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2>${SK}{{#groups}}${G_FLATG}${G_GUT}{{/groups}}</section>{{/sections}}`,
    css: `.hd{border-bottom:2.5pt solid {{accent}};padding-bottom:5pt;display:flex;gap:12pt;align-items:center}.hd h1{font-size:2em;color:{{accent}}}.ph{width:56pt;height:56pt;object-fit:cover;border-radius:4pt}
h2{font-size:1em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.04em;color:{{accent}};margin-bottom:2pt}.g{display:grid;grid-template-columns:17% 1fr;gap:10pt;margin-top:calc(4pt*{{spacing}})}.g .d{color:#555;font-size:.92em;padding-top:1pt}${BULLET_DOT()}` });
  // 5 Banner (photo, two-tone)
  T.push({ id: 'banner', name: 'Banner', ats: 'safe', description: 'Large coloured banner with room for a photo; tinted section bars. Single column.',
    html: HEADER_STD + secs(G_STD),
    css: `.hd{background:linear-gradient(100deg,{{accent}},{{accent}}cc);color:#fff;padding:16pt 18pt;margin:-2pt -2pt 6pt;border-radius:0 0 14pt 14pt;display:flex;gap:14pt;align-items:center}.hd h1{font-size:2.4em;font-weight:800;letter-spacing:-.01em}.hl{font-size:1.1em;opacity:.95}.ct{margin-top:3pt;font-size:.92em;opacity:.95}.ph{width:70pt;height:70pt;object-fit:cover;border-radius:50%;border:2.5pt solid #fff}
h2{font-size:1em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.05em;background:{{accent}}18;color:{{accent}};padding:2pt 7pt;border-radius:3pt;margin-bottom:3pt}${BULLET_DOT('\\25CF')}.grp li:before{font-size:.55em;top:.35em}` });
  // 6 Right sidebar
  T.push({ id: 'rightside', name: 'Right sidebar', ats: 'tolerant', description: 'Experience on the left, a narrow tinted column on the right for skills, languages and certifications.',
    html: twoCol(false), sidebar: ['skills', 'language', 'certification'],
    css: `.hd{display:flex;gap:12pt;align-items:center;border-bottom:3pt solid {{accent}};padding-bottom:6pt}.hd h1{font-size:2.1em;color:{{accent}}}.ph{width:58pt;height:58pt;object-fit:cover;border-radius:50%}.cols{display:grid;grid-template-columns:1fr 30%;gap:14pt;margin-top:6pt}.side{background:{{accent}}12;padding:6pt 9pt;font-size:.95em}.side p{margin-top:1.5pt;overflow-wrap:anywhere}
h2{font-size:1em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.03em;color:{{accent}};border-bottom:.8pt solid {{accent}};margin-bottom:2pt}${BULLET_DOT()}` });
  // 7 Dark sidebar
  T.push({ id: 'darkside', name: 'Dark sidebar', ats: 'tolerant', description: 'Dark left column with white text for contact and skills; light main area. Bold and graphic.',
    html: twoCol(true), sidebar: ['skills', 'language', 'certification', 'award'],
    css: `body{padding:0!important}{{#mode.preview}}body{padding:0}{{/mode.preview}}.hd{background:{{accent}};color:#fff;padding:14pt 16pt;display:flex;gap:12pt;align-items:center}.hd h1{font-size:2.3em;font-weight:700}.hl{opacity:.92}.ph{width:62pt;height:62pt;object-fit:cover;border-radius:50%;border:2pt solid #fff}
.cols{display:grid;grid-template-columns:32% 1fr;min-height:240mm}.side{background:#232a36;color:#f1f3f7;padding:10pt 11pt;font-size:.93em}.side h2{color:#fff;border-bottom:.8pt solid #ffffff55;font-size:.95em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.05em;margin-bottom:3pt}.side p{margin-top:2pt;overflow-wrap:anywhere}.main{padding:6pt 14pt 10pt}
.main h2{font-size:1.02em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.04em;color:{{accent}};border-bottom:1pt solid {{accent}};margin-bottom:2pt}${BULLET_DOT()}.side .grp li:before{color:#fff}` });
  // 8 Boxed cards
  T.push({ id: 'boxed', name: 'Boxed cards', ats: 'safe', description: 'Each entry sits in a softly outlined card under a pill heading. Friendly and modern.',
    html: HEADER_STD + secs(G_STD),
    css: `.hd{text-align:left;margin-bottom:4pt}.hd h1{font-size:2.2em;font-weight:800;color:{{accent}}}.ct{font-size:.93em;color:#444;margin-top:2pt}.hl{font-weight:600}
h2{display:inline-block;font-size:.92em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.06em;background:{{accent}};color:#fff;padding:2pt 9pt;border-radius:99pt;margin-bottom:3pt}.grp{border:.8pt solid #d5d9e0;border-radius:5pt;padding:4pt 8pt 5pt;margin-top:calc(4pt*{{spacing}})}${BULLET_DOT('\\2013')}` });
  // 9 Mono / tech
  T.push({ id: 'mono', name: 'Tech mono', ats: 'safe', description: 'Monospace type and terminal-style headings for engineering and data roles.',
    html: HEADER_STD + secs(G_STD),
    css: `body{font-family:"Consolas","Courier New",monospace;font-size:{{fontSize}}pt;line-height:1.38}.hd h1{font-size:1.9em;font-weight:700;color:{{accent}}}.hd h1:before{content:"> ";color:#888}.ct{margin-top:2pt;font-size:.93em}.hl{color:#555}
h2{font-size:1em;{{#upper}}text-transform:uppercase;{{/upper}}color:{{accent}};border-bottom:1pt dashed #999;margin-bottom:2pt}h2:before{content:"## ";color:#888}${BULLET_DOT('*')}` });
  // 10 Elegant centred
  T.push({ id: 'elegant', name: 'Elegant', ats: 'safe', description: 'Centred serif layout with ornamental dividers and italic roles; formal and calm.',
    html: HEADER_STD + secs(G_TWO),
    css: `body{font-family:Georgia,"Times New Roman",serif;font-size:{{fontSize}}pt;line-height:1.4}.hd{text-align:center;padding-bottom:6pt;border-bottom:.8pt solid {{accent}};margin-bottom:2pt}.hd h1{font-size:2.3em;font-weight:400;letter-spacing:.06em;color:{{accent}}}.hl{font-style:italic;margin-top:1pt}.ct{margin-top:3pt;font-size:.92em}
h2{text-align:center;font-size:.95em;font-weight:700;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.08em;color:{{accent}};margin-bottom:3pt;display:flex;align-items:center;gap:8pt}h2:before,h2:after{content:"";flex:1;border-top:.6pt solid {{accent}}}${BULLET_DOT('\\2022')}` });
  // 11 Bold header
  T.push({ id: 'bold', name: 'Bold type', ats: 'safe', description: 'Oversized name, accent block on the left edge, short accent bars under headings.',
    html: HEADER_STD + secs(G_STD),
    css: `.hd{border-left:7pt solid {{accent}};padding-left:12pt;margin-bottom:4pt}.hd h1{font-size:2.8em;font-weight:900;line-height:1;letter-spacing:-.01em}.hl{font-size:1.1em;color:{{accent}};font-weight:700;margin-top:3pt}.ct{margin-top:3pt;font-size:.92em;color:#444}
h2{font-size:1.1em;font-weight:800;{{#upper}}text-transform:uppercase;{{/upper}}margin-bottom:3pt}h2:after{content:"";display:block;width:34pt;height:2.5pt;background:{{accent}};margin-top:1.5pt}${BULLET_DOT('\\25B8')}` });
  // 12 Dots timeline
  T.push({ id: 'dots', name: 'Dot timeline', ats: 'safe', description: 'A thin rail with a dot marking each role; dates under the heading. Distinct from the left-rule timeline.',
    html: HEADER_STD + secs(G_STACK),
    css: `.hd h1{font-size:2.1em;color:{{accent}}}.ct{margin-top:2pt}h2{font-size:1.05em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.04em;color:{{accent}};margin-bottom:3pt}
.sec{border-left:1.2pt solid {{accent}}55;margin-left:3pt;padding-left:12pt;position:relative}.sec>h2:before{content:"";position:absolute;left:-5pt;top:.35em;width:8pt;height:8pt;border-radius:50%;background:{{accent}}}
.grp .dt{color:#555;font-size:.92em}${BULLET_DOT('\\2013')}` });
  // 13 Europass-style
  T.push({ id: 'euro', name: 'Euro form', ats: 'tolerant', description: 'Form-like layout in the spirit of European CVs: labelled left column, content on the right, light dividers.',
    html: HEADER_STD + `{{#sections}}<section class="sec" data-sec="{{key}}" data-sgid="sec:{{key}}"><h2>{{label}}</h2><div class="sc">${SK}{{#groups}}${FLAT}${G_STD}{{/groups}}</div></section>{{/sections}}`,
    css: `.hd{border-bottom:2pt solid {{accent}};padding-bottom:5pt;display:flex;gap:12pt;align-items:center}.hd h1{font-size:2em;color:{{accent}};font-weight:700}.ph{width:56pt;height:70pt;object-fit:cover}
.sec{display:grid;grid-template-columns:24% 1fr;gap:12pt;border-bottom:.5pt solid #ccc;padding-bottom:5pt}h2{font-size:.95em;color:{{accent}};font-weight:700;{{#upper}}text-transform:uppercase;{{/upper}}padding-top:3pt}${BULLET_DOT('\\2022')}` });
  // 14 Chips
  T.push({ id: 'chips', name: 'Skill chips', ats: 'safe', description: 'Skills drawn as rounded chips, dates as small badges. Light and approachable; still one text column.',
    html: HEADER_SPLIT + secs(G_STD, SKCHIPS),
    css: `.hd{display:flex;justify-content:space-between;align-items:flex-end;gap:12pt;border-bottom:1.5pt solid {{accent}};padding-bottom:6pt}.hd h1{font-size:2.1em;font-weight:800}.hl{color:{{accent}};font-weight:700}.hr1{text-align:right;font-size:.9em;line-height:1.45;color:#333}
h2{font-size:1em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.05em;color:{{accent}};margin-bottom:3pt}.date{background:{{accent}}18;color:{{accent}};padding:0 6pt;border-radius:99pt;font-size:.88em}
.chips{display:flex;flex-wrap:wrap;gap:3pt 4pt;margin-top:2pt}.chips li{border:.8pt solid {{accent}};color:{{accent}};border-radius:99pt;padding:0 7pt;font-size:.92em}.skg{margin-top:2pt}.skg b{font-size:.9em;color:#444}${BULLET_DOT('\\2022')}` });
  // 15 Ribbon
  T.push({ id: 'ribbon', name: 'Ribbon', ats: 'safe', description: 'Full-width solid ribbons for section headings with white text; strong structure, very easy to skim.',
    html: HEADER_STD + secs(G_STD),
    css: `.hd{text-align:center;margin-bottom:3pt}.hd h1{font-size:2.1em;font-weight:700;color:{{accent}}}.ct{margin-top:2pt;font-size:.93em}
h2{background:{{accent}};color:#fff;font-size:.95em;{{#upper}}text-transform:uppercase;{{/upper}}letter-spacing:.07em;padding:2pt 8pt;margin-bottom:3pt}${BULLET_DOT('\\25AA')}` });
  // 16 Left-rail names (two tone serif/sans)
  T.push({ id: 'journal', name: 'Journal', ats: 'safe', description: 'Serif headings over a sans body, dates in italic on the right, hairline rules. Editorial and quiet.',
    html: HEADER_STD + secs(G_STD),
    css: `.hd{margin-bottom:6pt;border-bottom:.6pt solid #999;padding-bottom:5pt}.hd h1{font-family:Georgia,"Times New Roman",serif;font-size:2.4em;font-weight:400;font-style:italic;color:{{accent}}}.ct{margin-top:2pt;color:#444;font-size:.92em}.hl{font-family:Georgia,serif;color:#444}
h2{font-family:Georgia,"Times New Roman",serif;font-size:1.2em;font-weight:400;font-style:italic;color:{{accent}};border-bottom:.5pt solid #bbb;margin-bottom:2pt}.date{font-style:italic;color:#555}${BULLET_DOT('\\2013')}` });
  return T;
});
