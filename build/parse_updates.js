// Parse Rules Updates (p18) + FAQs (p18-19) into structured entries.
const fs = require('fs');
const { loadPages, toLines } = require('./lib.js');
const pages = loadPages('bbox.html');
const SPLIT = 300;

// Ordered text of a column across one or more pages (left col then nothing).
function colText(pi, lo, hi) {
  const lines = toLines(pages[pi].words.filter(w => w.x >= lo && w.x < hi))
    .map(l => l.words.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return lines;
}

const CATS = ['ARMY RULES', 'MONT’KA DETACHMENT', "MONT'KA DETACHMENT", 'KAUYON DETACHMENT',
  'RETALIATION CADRE DETACHMENT', 'DATASHEETS', 'UPDATES'];
const isCat = s => CATS.includes(s.trim());

// Split a column's lines into update entries. Each entry: { category, title, change }.
function parseUpdates(lineGroups) {
  const entries = [];
  let category = '';
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    buf = [];
    if (!text) return;
    // split into title + change ("Change to:" / "Change X to Y." / "Add '...'")
    let m = text.match(/^(.*?)\s*[–-]?\s*Change to:\s*(.+)$/i);
    if (m) { entries.push({ category, title: m[1].trim(), change: m[2].trim() }); return; }
    m = text.match(/^(.*?)\s*(Change \d.*|Add '.*)$/i);
    if (m && m[1].trim()) { entries.push({ category, title: m[1].trim(), change: m[2].trim() }); return; }
    entries.push({ category, title: '', change: text });
  };
  for (const ln of lineGroups) {
    if (isCat(ln)) { flush(); category = ln.trim(); continue; }
    buf.push(ln);
    // an entry ends when its change text closes with a quote+period
    if (/['’]\s*$|['’]\.?$|\.”$|Add '[^']*'\.?$/.test(ln) && /Change to:|Add '|Change \d/.test(buf.join(' '))) flush();
  }
  flush();
  return entries.filter(e => e.change);
}

// Rules Updates: page 18 left col + right col (skip page title lines)
const p18L = colText(18, 0, SPLIT).filter(t => !/^T’AU EMPIRE$|^RULES UPDATES$|This section presents|Changes applied/.test(t));
const p18R = colText(18, SPLIT, 1000).filter(t => !/designed to improve|in red\.?$/.test(t));
// FAQs start at "FAQS" on page 18R; updates continue on page 19 too
const updates = [...parseUpdates(p18L), ...parseUpdates(p18R)];

// page 19: more updates (both cols until FAQS marker), then FAQ Q/A
const p19L = colText(19, 0, SPLIT);
const p19R = colText(19, SPLIT, 1000);
const faqIdx = p19R.findIndex(t => /^FAQS$/i.test(t));
const updates19R = faqIdx >= 0 ? p19R.slice(0, faqIdx) : p19R;
updates.push(...parseUpdates(p19L), ...parseUpdates(updates19R));

// FAQs: gather all lines after FAQS marker (p18R tail + p19R tail), join, split Q:/A:
function faqLines() {
  const out = [];
  for (const pi of [18, 19]) {
    const lines = toLines(pages[pi].words.filter(w => w.x >= SPLIT))
      .map(l => l.words.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    let on = false;
    for (const ln of lines) { if (/^FAQS$/i.test(ln)) { on = true; continue; } if (on) out.push(ln); }
  }
  return out;
}
const faqText = faqLines().join(' ').replace(/\s+/g, ' ');
const faqs = [];
const faqRe = /Q:\s*([^]*?)\s*A:\s*([^]*?)(?=\s*Q:|$)/g;
let fm;
while ((fm = faqRe.exec(faqText))) faqs.push({ q: fm[1].trim(), a: fm[2].trim() });

// page-19 errata continue the DATASHEETS section
let lastCat = '';
for (const u of updates) { if (u.category) lastCat = u.category; else u.category = lastCat || 'DATASHEETS'; }

fs.writeFileSync('updates.json', JSON.stringify({ updates, faqs }, null, 2));
console.log('updates:', updates.length, 'faqs:', faqs.length, '\n');
for (const u of updates) console.log(`[${u.category}] ${u.title} => ${u.change.slice(0, 70)}`);
console.log();
for (const f of faqs) console.log('Q:', f.q.slice(0, 70), '\n  A:', f.a.slice(0, 60));
