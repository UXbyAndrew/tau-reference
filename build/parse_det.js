// Parse detachments (pages 1-3): rules + enhancements (left col) + stratagems (right col).
const fs = require('fs');
const { loadPages, toLines } = require('./lib.js');
const pages = loadPages('bbox.html');
const SPLIT = 300;

const isCaps = s => /[A-Z]/.test(s) && !/[a-z]/.test(s) && /^[A-Z0-9'’\-/ .,()]+$/.test(s);
const colLines = (pg, lo, hi) => toLines(pg.words.filter(w => w.x >= lo && w.x < hi))
  .map(l => ({ y: l.y, t: l.words.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim(), words: l.words }))
  .filter(o => o.t);

function parseStratagems(pg, detName) {
  const lines = colLines(pg, SPLIT, 1000);
  const strats = [];
  let cur = null, field = null;
  for (const l of lines) {
    const cpWord = l.words.find(w => /^\d+CP$/.test(w.text));
    if (cpWord) { // header: NAME ... NCP
      if (cur) strats.push(cur);
      cur = { name: l.t.replace(/\s*\d+CP$/, '').trim(), cost: cpWord.text, detachment: detName, lore: '', when: '', target: '', effect: '' };
      field = 'lore';
      continue;
    }
    if (!cur) continue;
    if (/STRATAGEM$/i.test(l.t) && isCaps(l.t)) continue; // "<DET> STRATAGEM" marker
    let m;
    if ((m = l.t.match(/^WHEN:\s*(.*)$/i))) { field = 'when'; cur.when = m[1]; continue; }
    if ((m = l.t.match(/^TARGET:\s*(.*)$/i))) { field = 'target'; cur.target = m[1]; continue; }
    if ((m = l.t.match(/^EFFECT:\s*(.*)$/i))) { field = 'effect'; cur.effect = m[1]; continue; }
    cur[field] = (cur[field] ? cur[field] + ' ' : '') + l.t;
  }
  if (cur) strats.push(cur);
  for (const s of strats) for (const k of ['lore', 'when', 'target', 'effect']) s[k] = s[k].replace(/\s+/g, ' ').trim();
  return strats;
}

function parseHeader(pg) {
  const full = toLines(pg.words).map(l => l.words.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  let i = 0, uniqueTag = '';
  if (/^UNIQUE:/i.test(full[0])) { uniqueTag = full[0].replace(/^UNIQUE:\s*/i, '').trim(); i = 1; }
  let tIdx = i; while (tIdx < full.length && full[tIdx].split(' ').length < 6) tIdx++;
  const name = full.slice(i, tIdx).join(' ').trim();
  const tagline = full[tIdx] || '';
  return { name, tagline, uniqueTag };
}

function parseLeft(pg, name, tagline) {
  const lines = colLines(pg, 0, SPLIT);
  let mode = null; const rules = []; const enh = []; let cur = null;
  const flush = () => { if (cur && cur.text.trim()) (mode === 'enh' ? enh : rules).push(cur); cur = null; };
  for (const o of lines) {
    const t = o.t;
    if (/^DETACHMENT RULES/i.test(t)) { flush(); mode = 'rules'; continue; }
    if (/^ENHANCEMENTS/i.test(t)) { flush(); mode = 'enh'; continue; }
    if (mode === null) continue;
    if (name.includes(t) || t === tagline) continue;
    const headerish = isCaps(t) && !t.includes('/') && t.replace(/[^A-Za-z]/g, '').length >= 4 && t.length <= 40;
    if (headerish && cur && !cur.text.trim()) { cur.name += ' ' + t; continue; } // wrapped name
    if (headerish) { flush(); cur = { name: t, text: '' }; continue; }
    if (cur) cur.text += ' ' + t;
  }
  flush();
  for (const e of [...rules, ...enh]) { e.name = e.name.replace(/\s+/g, ' ').trim(); e.text = e.text.replace(/\s+/g, ' ').trim(); }
  return { rules, enhancements: enh };
}

const detachments = [];
const stratagems = [];
[1, 2, 3].forEach(pi => {
  const pg = pages[pi];
  const h = parseHeader(pg);
  const left = parseLeft(pg, h.name, h.tagline);
  const strats = parseStratagems(pg, h.name);
  detachments.push({ name: h.name, uniqueTag: h.uniqueTag, tagline: h.tagline, rules: left.rules, enhancements: left.enhancements, stratagems: strats.map(s => s.name) });
  stratagems.push(...strats);
});
fs.writeFileSync('detachments_parsed.json', JSON.stringify(detachments, null, 2));
fs.writeFileSync('stratagems.json', JSON.stringify(stratagems, null, 2));
console.log('detachments:', detachments.length, 'stratagems:', stratagems.length, '\n');
for (const d of detachments) {
  console.log('=== ' + d.name + (d.uniqueTag ? ' [UNIQUE: ' + d.uniqueTag + ']' : ''));
  console.log('   tagline:', d.tagline);
  console.log('   RULES:', d.rules.map(r => r.name).join(' | '));
  console.log('   ENH:', d.enhancements.map(e => e.name).join(' | '));
  console.log('   STRATS:', d.stratagems.join(' | '), '\n');
}
