'use strict';

const view = document.getElementById('view');
const foot = document.getElementById('foot');
const searchEl = document.getElementById('search');
const clearBtn = document.getElementById('clearBtn');
const backBtn = document.getElementById('backBtn');
const tabsEl = document.getElementById('tabs');

let DATA = null;
let tab = 'datasheets';
let detail = null;          // { type, id } when viewing a single entry
let query = '';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const norm = (s) => String(s || '').toLowerCase();

// ---- boot ----
fetch('data.json').then((r) => r.json()).then((d) => {
  DATA = d;
  foot.innerHTML = `${esc(d.meta.source)} · ${esc(d.meta.version)}<br>${esc(d.meta.legal)}<br><span class="note">${esc(d.meta.note)}</span>`;
  render();
}).catch((e) => { view.innerHTML = `<p class="empty">Couldn’t load data.json.<br>${esc(e.message)}</p>`; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---- events ----
let t;
searchEl.addEventListener('input', () => {
  clearTimeout(t);
  t = setTimeout(() => { query = searchEl.value.trim(); clearBtn.hidden = !query; if (query) detail = null; render(); }, 120);
});
clearBtn.addEventListener('click', () => { searchEl.value = ''; query = ''; clearBtn.hidden = true; searchEl.focus(); render(); });
backBtn.addEventListener('click', () => { detail = null; render(); window.scrollTo(0, 0); });
tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  tab = b.dataset.tab; detail = null;
  [...tabsEl.children].forEach((c) => c.classList.toggle('active', c === b));
  window.scrollTo(0, 0); render();
});

// ---- render ----
function render() {
  if (!DATA) return;
  backBtn.hidden = !detail;
  if (detail) { view.innerHTML = renderDetail(detail); window.scrollTo(0, 0); return; }
  const q = norm(query);
  if (q) { view.innerHTML = renderSearch(q); return; }
  view.innerHTML = ({
    datasheets: listDatasheets,
    stratagems: listStratagems,
    enhancements: listEnhancements,
    detachments: listDetachments,
    rules: listRules,
  })[tab]();
  bindRows();
}

function bindRows() {
  view.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => {
    detail = JSON.parse(el.dataset.go); render();
  }));
}

function row(go, title, sub, meta, badge) {
  return `<button class="row" data-go='${esc(JSON.stringify(go))}'>
    <span><span class="title">${title}${badge || ''}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</span>
    ${meta ? `<span class="meta">${esc(meta)}</span>` : ''}</button>`;
}

// ---- list views ----
function listDatasheets() {
  const std = DATA.datasheets.filter((d) => !d.legends);
  const leg = DATA.datasheets.filter((d) => d.legends);
  let h = '';
  if (std.length) h += `<div class="group-title">Datasheets (${std.length})</div>` + std.map(dsRowHtml).join('');
  if (leg.length) h += `<div class="group-title">Warhammer Legends (${leg.length})</div>` + leg.map(dsRowHtml).join('');
  return h;
}
function dsRowHtml(d) {
  const p = d.profiles[0] || {};
  const strip = ['M', 'T', 'SV', 'W', 'LD', 'OC'].map((k) =>
    `<span class="ss"><i>${k}</i>${esc(p[k] || '–')}</span>`).join('');
  const badge = (d.legends ? ' <span class="badge legend">Legends</span>' : '') +
    (d.crucible ? ' <span class="badge legend">Crucible</span>' : '');
  const pts = d.points ? `<span class="pts">${d.points} pts</span>` : '';
  return `<button class="row dsrow" data-go='${esc(JSON.stringify({ type: 'ds', id: d.name }))}'>
    <span class="dsrow-top"><span class="title">${esc(d.name)}${badge}</span>${pts}</span>
    <span class="statstrip">${strip}</span></button>`;
}
function listStratagems() {
  const by = groupBy(DATA.stratagems, (s) => s.detachment);
  return Object.keys(by).map((k) => `<div class="group-title">${esc(k)}</div>` +
    by[k].map((s) => row({ type: 'strat', id: s.name }, esc(s.name), esc(s.when || ''), s.cost)).join('')).join('');
}
function listEnhancements() {
  const by = groupBy(DATA.enhancements, (e) => e.detachment);
  return Object.keys(by).map((k) => `<div class="group-title">${esc(k)}</div>` +
    by[k].map((e) => row({ type: 'enh', id: e.name }, esc(e.name), '', '')).join('')).join('');
}
function listDetachments() {
  return DATA.detachments.map((d) => row({ type: 'det', id: d.name }, esc(d.name),
    esc(d.tagline || ''), '', d.uniqueTag ? ' <span class="badge cp">Unique</span>' : '')).join('');
}
function listRules() {
  let h = `<div class="group-title">Rules updates (errata to Codex)</div>`;
  const by = groupBy(DATA.rulesUpdates, (u) => u.category || 'Other');
  h += Object.keys(by).map((k) => `<div class="group-title">${esc(k)}</div>` +
    by[k].map((u, i) => row({ type: 'upd', id: k + '#' + i }, esc(u.title || u.change.slice(0, 60)),
      esc(u.title ? 'Change' : ''), '')).join('')).join('');
  if (DATA.faqs.length) h += `<div class="group-title">FAQs</div>` +
    DATA.faqs.map((f, i) => row({ type: 'faq', id: i }, esc('Q: ' + f.q), '', '')).join('');
  return h;
}
function groupBy(arr, fn) { const o = {}; for (const x of arr) (o[fn(x)] = o[fn(x)] || []).push(x); return o; }

// ---- detail views ----
function renderDetail(d) {
  if (d.type === 'ds') return dsDetail(DATA.datasheets.find((x) => x.name === d.id));
  if (d.type === 'strat') return stratDetail(DATA.stratagems.find((x) => x.name === d.id));
  if (d.type === 'enh') return enhDetail(DATA.enhancements.find((x) => x.name === d.id));
  if (d.type === 'det') return detDetail(DATA.detachments.find((x) => x.name === d.id));
  if (d.type === 'upd') { const [c, i] = d.id.split('#'); return updDetail(DATA.rulesUpdates.filter((u) => (u.category || 'Other') === c)[+i]); }
  if (d.type === 'faq') return faqDetail(DATA.faqs[+d.id]);
  return '';
}

function dsDetail(d) {
  if (!d) return '<p class="empty">Not found.</p>';
  const badge = (d.legends ? ' <span class="badge legend">Legends</span>' : '') + (d.crucible ? ' <span class="badge legend">Crucible</span>' : '');
  const pts = d.points ? ` <span class="pts">${d.points} pts</span>` : '';
  let h = `<div class="detail"><h1>${esc(d.name)}${badge}${pts}</h1>`;
  // profiles
  for (const p of d.profiles) {
    if (p.label) h += `<div class="prof-label">${esc(p.label)}</div>`;
    h += `<div class="statline">` + ['M', 'T', 'SV', 'W', 'LD', 'OC'].map((k) =>
      `<div class="stat"><div class="k">${k}</div><div class="v">${esc(p[k] || '–')}</div></div>`).join('') + `</div>`;
  }
  if (d.invuln) h += `<div class="invuln">Invulnerable Save <b>${esc(d.invuln)}</b></div>`;
  h += weaponTable('Ranged Weapons', d.rangedWeapons, 'BS');
  h += weaponTable('Melee Weapons', d.meleeWeapons, 'WS');
  // abilities
  const a = d.abilities;
  if (a.core.length || a.faction.length || a.other.length) {
    h += `<div class="sec"><h2>Abilities</h2>`;
    if (a.core.length) h += `<div class="ability"><span class="an core">Core:</span> ${esc(a.core.join(', '))}</div>`;
    if (a.faction.length) h += `<div class="ability"><span class="an core">Faction:</span> ${esc(a.faction.join(', '))}</div>`;
    for (const ab of a.other) h += `<div class="ability"><span class="an">${esc(ab.name)}:</span> ${esc(ab.text)}</div>`;
    h += `</div>`;
  }
  if (a.wargear && a.wargear.length) {
    h += `<div class="sec"><h2>Wargear Abilities</h2>`;
    for (const ab of a.wargear) h += `<div class="ability"><span class="an">${esc(ab.name)}:</span> ${esc(ab.text)}</div>`;
    h += `</div>`;
  }
  if (d.damaged) h += `<div class="sec"><h2>Damaged</h2><div class="ability">${esc(d.damaged)}</div></div>`;
  if (d.wargearOptions.length) h += `<div class="sec"><h2>Wargear Options</h2><ul class="opts">` +
    d.wargearOptions.map((o) => `<li>${esc(o.replace(/^[■▪◦]\s*/, ''))}</li>`).join('') + `</ul></div>`;
  if (d.unitComposition.length) h += `<div class="sec"><h2>Unit Composition</h2><ul class="opts">` +
    d.unitComposition.map((o) => `<li>${esc(o.replace(/^[■▪◦]\s*/, ''))}</li>`).join('') + `</ul></div>`;
  if (d.keywords.length) h += `<div class="sec"><h2>Keywords</h2><div class="kw">${d.keywords.map((k) => `<b>${esc(k)}</b>`).join(', ')}</div>`;
  if (d.factionKeywords.length) h += `<div class="kw" style="margin-top:6px">Faction: ${d.factionKeywords.map((k) => `<b>${esc(k)}</b>`).join(', ')}</div>`;
  h += `</div></div>`;
  return h;
}

function weaponTable(title, list, skillHead) {
  if (!list || !list.length) return '';
  let h = `<div class="sec"><h2>${title}</h2><table class="w"><thead><tr>
    <th class="nm">Weapon</th><th>Range</th><th>A</th><th>${skillHead}</th><th>S</th><th>AP</th><th>D</th></tr></thead><tbody>`;
  for (const w of list) {
    const kw = (w.keywords && w.keywords.length) ? `<span class="wk">[${esc(w.keywords.join(', '))}]</span>` : '';
    h += `<tr><td class="nm">${esc(w.name)}${kw}</td><td>${esc(w.range)}</td><td>${esc(w.A)}</td>
      <td>${esc(w.skill)}</td><td>${esc(w.S)}</td><td>${esc(w.AP)}</td><td>${esc(w.D)}</td></tr>`;
  }
  return h + `</tbody></table></div>`;
}

function stratDetail(s) {
  if (!s) return '<p class="empty">Not found.</p>';
  return `<div class="detail"><h1>${esc(s.name)} <span class="badge cp">${esc(s.cost)}</span></h1>
    <div class="tag">${esc(s.detachment)} — Stratagem</div>
    ${s.lore ? `<div class="lore">${esc(s.lore)}</div>` : ''}
    <div class="field"><span class="lab">WHEN:</span> ${esc(s.when)}</div>
    <div class="field"><span class="lab">TARGET:</span> ${esc(s.target)}</div>
    <div class="field"><span class="lab">EFFECT:</span> ${esc(s.effect)}</div></div>`;
}
function enhDetail(e) {
  if (!e) return '<p class="empty">Not found.</p>';
  return `<div class="detail"><h1>${esc(e.name)}</h1>
    <div class="tag">${esc(e.detachment)} — Enhancement</div>
    <div class="field">${esc(e.text)}</div></div>`;
}
function detDetail(d) {
  if (!d) return '<p class="empty">Not found.</p>';
  let h = `<div class="detail"><h1>${esc(d.name)}</h1>`;
  if (d.uniqueTag) h += `<div class="tag">Unique: ${esc(d.uniqueTag)}</div>`;
  if (d.tagline) h += `<div class="lore">${esc(d.tagline)}</div>`;
  h += `<div class="sec"><h2>Detachment Rules</h2>`;
  for (const r of d.rules) h += `<div class="ability"><span class="an">${esc(r.name)}:</span> ${esc(r.text)}</div>`;
  h += `</div>`;
  const strs = DATA.stratagems.filter((s) => s.detachment === d.name);
  const enhs = DATA.enhancements.filter((e) => e.detachment === d.name);
  if (enhs.length) h += `<div class="sec"><h2>Enhancements</h2>` +
    enhs.map((e) => row({ type: 'enh', id: e.name }, esc(e.name), '', '')).join('') + `</div>`;
  if (strs.length) h += `<div class="sec"><h2>Stratagems</h2>` +
    strs.map((s) => row({ type: 'strat', id: s.name }, esc(s.name), esc(s.when || ''), s.cost)).join('') + `</div>`;
  h += `</div>`;
  setTimeout(bindRows, 0);
  return h;
}
function updDetail(u) {
  if (!u) return '<p class="empty">Not found.</p>';
  return `<div class="detail"><h1>${esc(u.title || 'Rules update')}</h1>
    <div class="tag">${esc(u.category || '')}</div>
    <div class="field">${esc(u.change)}</div></div>`;
}
function faqDetail(f) {
  if (!f) return '<p class="empty">Not found.</p>';
  return `<div class="detail"><h1>FAQ</h1>
    <div class="field"><span class="lab">Q:</span> ${esc(f.q)}</div>
    <div class="field"><span class="lab">A:</span> ${esc(f.a)}</div></div>`;
}

// ---- search (across all sections) ----
function renderSearch(q) {
  const hits = [];
  const add = (go, title, sub, meta, badge, score) => hits.push({ go, title, sub, meta, badge, score });
  for (const d of DATA.datasheets) {
    const hay = norm([d.name, d.keywords.join(' '),
      d.rangedWeapons.concat(d.meleeWeapons).map((w) => w.name + ' ' + (w.keywords || []).join(' ')).join(' '),
      d.abilities.core.join(' '), d.abilities.other.map((a) => a.name + ' ' + a.text).join(' '),
      (d.abilities.wargear || []).map((a) => a.name + ' ' + a.text).join(' ')].join(' '));
    if (hay.includes(q)) {
      const p = d.profiles[0] || {};
      add({ type: 'ds', id: d.name }, hl(d.name, q), matchSub(d, q), '', d.legends ? ' <span class="badge legend">Legends</span>' : '', score(d.name, q));
    }
  }
  for (const s of DATA.stratagems) if (norm(s.name + ' ' + s.when + ' ' + s.target + ' ' + s.effect + ' ' + s.detachment).includes(q))
    add({ type: 'strat', id: s.name }, hl(s.name, q), esc(s.detachment) + ' · Stratagem', s.cost, '', score(s.name, q));
  for (const e of DATA.enhancements) if (norm(e.name + ' ' + e.text + ' ' + e.detachment).includes(q))
    add({ type: 'enh', id: e.name }, hl(e.name, q), esc(e.detachment) + ' · Enhancement', '', '', score(e.name, q));
  for (const d of DATA.detachments) if (norm(d.name + ' ' + d.tagline + ' ' + d.rules.map((r) => r.name + r.text).join(' ')).includes(q))
    add({ type: 'det', id: d.name }, hl(d.name, q), 'Detachment', '', '', score(d.name, q));
  DATA.rulesUpdates.forEach((u, i) => { if (norm((u.title || '') + ' ' + u.change + ' ' + u.category).includes(q))
    add({ type: 'upd', id: (u.category || 'Other') + '#' + DATA.rulesUpdates.filter((x) => (x.category || 'Other') === (u.category || 'Other')).indexOf(u) }, hl(u.title || u.change.slice(0, 50), q), esc(u.category) + ' · Update', '', '', 1); });
  DATA.faqs.forEach((f, i) => { if (norm(f.q + ' ' + f.a).includes(q)) add({ type: 'faq', id: i }, hl('Q: ' + f.q.slice(0, 60), q), 'FAQ', '', '', 1); });

  hits.sort((a, b) => b.score - a.score);
  if (!hits.length) return `<p class="empty">No matches for “${esc(query)}”.</p>`;
  const html = `<div class="group-title">${hits.length} result${hits.length > 1 ? 's' : ''}</div>` +
    hits.map((h) => `<button class="row" data-go='${esc(JSON.stringify(h.go))}'>
      <span><span class="title">${h.title}${h.badge || ''}</span>${h.sub ? `<span class="sub">${h.sub}</span>` : ''}</span>
      ${h.meta ? `<span class="meta">${esc(h.meta)}</span>` : ''}</button>`).join('');
  setTimeout(bindRows, 0);
  return html;
}
function matchSub(d, q) {
  const w = d.rangedWeapons.concat(d.meleeWeapons).find((x) => norm(x.name).includes(q));
  if (w) return 'weapon: ' + hl(w.name, q);
  const k = d.keywords.find((x) => norm(x).includes(q));
  if (k && !norm(d.name).includes(q)) return 'keyword: ' + hl(k, q);
  return d.legends ? 'Legends datasheet' : 'Datasheet';
}
function score(name, q) { const n = norm(name); return n === q ? 3 : n.startsWith(q) ? 2 : n.includes(q) ? 1.5 : 1; }
function hl(text, q) {
  const s = String(text); const i = norm(s).indexOf(q);
  if (i < 0) return esc(s);
  return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
}
