// Parse the T'au Empire Faction Pack bbox extraction into structured data.json.
// Run: node parse.js
const fs = require('fs');
const { loadPages, toLines } = require('./lib.js');

const pages = loadPages('bbox.html');
const COL_X = 333; // boundary: weapon table left of this, abilities text right of this.

function topHeader(pg) {
  // The unit/section name: first text block near top, all-caps. Strip Legends banner.
  const lines = toLines(pg.words);
  if (!lines.length) return '';
  // gather words on first 1-2 lines that are left-aligned title (large font, y small)
  const first = lines[0];
  let name = first.words.filter(w => w.x < COL_X).map(w => w.text).join(' ');
  name = name.replace(/WA\s*R\s*HA\s*M\s*M\s*E\s*R\s*L\s*E\s*G\s*E\s*N\s*D\s*S/gi, '').trim();
  return name.replace(/\s+/g, ' ').trim();
}

function isLegends(pg) {
  return /WA\s*R\s*HA\s*M\s*M\s*E\s*R/i.test(pg.words.map(w => w.text).join(' '));
}

// --- DATASHEET STAT PAGE ---
function parseStatPage(pg) {
  const lines = toLines(pg.words);
  const name = topHeader(pg);

  // locate statline header row (has M T SV W LD OC)
  const headIdx = lines.findIndex(l => {
    const t = l.words.map(w => w.text).join(' ');
    return /\bM\b/.test(t) && /\bSV\b/.test(t) && /\bOC\b/.test(t) && /\bW\b/.test(t);
  });
  const profiles = [];
  let invuln = '';
  const isStatVal = t => /^(-|N\/A|\d+("|\+)?|D\d+([+]\d+)?|\d+)$/.test(t);
  if (headIdx >= 0) {
    const header = lines[headIdx];
    const cols = header.words.filter(w => /^(M|T|SV|W|LD|OC)$/.test(w.text)).map(w => ({ k: w.text, x: w.x }));
    // value rows: following lines until weapons start
    for (let i = headIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      const t = l.words.map(w => w.text).join(' ');
      if (/RANGED WEAPONS|MELEE WEAPONS|^RANGE\b/i.test(t)) break;
      // invulnerable save side-box
      if (/INVULNERABLE/i.test(t)) {
        const iv = lines[i].words.find(w => /^\d\+$/.test(w.text)) ||
                   (lines[i - 1] && lines[i - 1].words.find(w => /^\d\+\*?$/.test(w.text)));
        if (iv) invuln = iv.text; continue;
      }
      const vals = l.words.filter(w => w.x < COL_X);
      if (vals.length < 4) continue;
      const prof = {};
      let labelWords = [];
      for (const w of vals) {
        let best = cols[0], bd = 1e9;
        for (const c of cols) { const d = Math.abs(c.x - w.x); if (d < bd) { bd = d; best = c; } }
        if (bd < 24 && isStatVal(w.text)) prof[best.k] = (prof[best.k] ? prof[best.k] + ' ' : '') + w.text;
        else labelWords.push(w.text);
      }
      if (Object.keys(prof).length >= 4) {
        if (labelWords.length) prof.label = labelWords.join(' ');
        profiles.push(prof);
      }
    }
  }

  // weapons + abilities
  const wpnHeaderIdxs = lines.map((l, i) => ({ i, t: l.words.map(w => w.text).join(' ') }))
    .filter(o => /RANGED WEAPONS|MELEE WEAPONS/i.test(o.t));
  const ranged = [], melee = [];
  for (let h = 0; h < wpnHeaderIdxs.length; h++) {
    const start = wpnHeaderIdxs[h].i;
    const end = (h + 1 < wpnHeaderIdxs.length) ? wpnHeaderIdxs[h + 1].i : lines.length;
    const isMelee = /MELEE/i.test(wpnHeaderIdxs[h].t);
    const header = lines[start];
    // stat columns from header (left of COL_X)
    const statKeys = ['RANGE', 'A', isMelee ? 'WS' : 'BS', 'S', 'AP', 'D'];
    const cols = [];
    for (const w of header.words) {
      if (w.x >= COL_X) continue;
      if (statKeys.includes(w.text)) {
        const k = (w.text === 'WS' || w.text === 'BS') ? 'skill' : (w.text === 'RANGE' ? 'range' : w.text);
        cols.push({ k, x: w.x });
      }
    }
    const rangeX = (cols.find(c => c.k === 'RANGE') || {}).x || 180;
    const out = [];
    let pendingName = [];
    for (let i = start + 1; i < end; i++) {
      const l = lines[i];
      const left = l.words.filter(w => w.x < COL_X);
      if (!left.length) continue;
      const nameToks = left.filter(w => w.x < rangeX - 6).map(w => w.text);
      const statToks = left.filter(w => w.x >= rangeX - 6);
      // does this line have stat values?
      const hasStats = statToks.length >= 3 && cols.length >= 4;
      if (hasStats) {
        const row = { name: '', range: '', A: '', skill: '', S: '', AP: '', D: '' };
        for (const w of statToks) {
          let best = cols[0], bd = 1e9;
          for (const c of cols) { const d = Math.abs(c.x - w.x); if (d < bd) { bd = d; best = c; } }
          row[best.k] = (row[best.k] ? row[best.k] + ' ' : '') + w.text;
        }
        // validate: real weapon rows have a skill like "4+"/"N/A" and a range "Melee"/"18\""
        const validSkill = /^(\d\+|N\/A)$/.test(row.skill);
        const validRange = /^(Melee|\d+")$/.test(row.range);
        if (!validSkill || !validRange) { pendingName = []; continue; }
        const fullName = [...pendingName, ...nameToks].join(' ');
        pendingName = [];
        const m = parseWeaponName(fullName);
        if (!m.name) continue;
        row.name = m.name; row.keywords = m.keywords;
        out.push(row);
      } else {
        // name continuation (wrap or trailing keyword line)
        if (out.length && nameToks.length && /^[\[▪]/.test(nameToks[0]) ) {
          // bracket keywords continuing previous weapon
          const extra = parseWeaponName(nameToks.join(' '));
          out[out.length - 1].keywords.push(...extra.keywords);
          if (extra.name) out[out.length - 1].name += ' ' + extra.name;
        } else {
          pendingName.push(...nameToks);
        }
      }
    }
    (isMelee ? melee : ranged).push(...out);
  }

  // abilities: right column, kept as ordered lines (preserves paragraph starts)
  const abilLineTexts = lines
    .filter(l => l.words.some(w => w.x >= COL_X))
    .map(l => l.words.filter(w => w.x >= COL_X).map(w => w.text).join(' ').trim())
    .filter(Boolean);
  const { abilities, damaged } = parseAbilities(abilLineTexts);

  // keywords (bottom). Find line starting KEYWORDS:
  let keywords = [], faction = [];
  for (const l of lines) {
    const t = l.words.map(w => w.text).join(' ');
    const km = t.match(/KEYWORDS:\s*(.+?)(?:\s+FACTION KEYWORDS:.*)?$/i);
    if (/^KEYWORDS:/i.test(t.trim()) || /KEYWORDS:/.test(t) && !/FACTION KEYWORDS/.test(t)) {
      const left = l.words.filter(w => w.x < COL_X).map(w => w.text).join(' ');
      const m2 = left.match(/KEYWORDS:\s*(.+)$/i);
      if (m2) keywords = m2[1].split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  // faction keywords usually "T'au Empire"
  const allTxt = pg.words.map(w => w.text).join(' ');
  const fm = allTxt.match(/FACTION KEYWORDS:\s*(T.au Empire)/i);
  if (fm) faction = ['T’au Empire'];

  return { name, profiles, invuln, rangedWeapons: ranged, meleeWeapons: melee, abilities, damaged, keywords, factionKeywords: faction };
}

function parseWeaponName(s) {
  s = s.replace(/\s+/g, ' ').trim();
  const keywords = [];
  s = s.replace(/\[([^\]]+)\]/g, (m, g) => { g.split(',').forEach(k => keywords.push(k.trim())); return ''; });
  return { name: s.replace(/\s+/g, ' ').trim().replace(/\s*[▪]\s*/g, ''), keywords };
}

// A line that begins a named ability: "Some Name:" or "Some Name (Aura):" at line start.
const NAMED_RE = /^([A-Z][A-Za-z0-9'’\-]+(?: [A-Za-z0-9'’\-()]+){0,4}?(?: \([^)]*\))?):\s+(\S.*)$/;

function parseAbilities(lineArr) {
  const res = { core: [], faction: [], wargear: [], other: [] };
  let damaged = '';
  let section = 'main';          // main | wargear
  let cur = null;                // current named-ability accumulator
  const push = () => { if (cur) { (section === 'wargear' ? res.wargear : res.other).push(cur); cur = null; } };

  for (let raw of lineArr) {
    let line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (/^ABILITIES$/i.test(line)) continue;
    if (/^WARGEAR ABILITIES/i.test(line)) { push(); section = 'wargear'; line = line.replace(/^WARGEAR ABILITIES/i, '').trim(); if (!line) continue; }
    if (/^FACTION KEYWORDS/i.test(line)) break;
    // CORE: list (may share a line with a leading "ABILITIES")
    let m;
    if ((m = line.match(/CORE:\s*(.+)$/i)) && !cur) { res.core = m[1].split(',').map(s => s.trim()).filter(Boolean); continue; }
    if ((m = line.match(/^FACTION:\s*(.+)$/i))) { res.faction = [m[1].trim()]; continue; }
    if ((m = line.match(/DAMAGED:\s*(.+)$/i))) { push(); damaged = m[1].trim(); section = 'damaged'; continue; }
    if (section === 'damaged') { damaged += ' ' + line; continue; }
    // named ability start?
    if ((m = line.match(NAMED_RE))) { push(); cur = { name: m[1].trim(), text: m[2].trim() }; continue; }
    // continuation of current ability
    if (cur) cur.text += ' ' + line;
  }
  push();
  // clean up: collapse whitespace
  for (const a of [...res.other, ...res.wargear]) a.text = a.text.replace(/\s+/g, ' ').trim();
  damaged = damaged.replace(/\s+/g, ' ').trim();
  return { abilities: res, damaged };
}

// --- WARGEAR / UNIT COMPOSITION PAGE ---
function parseInfoPage(pg) {
  const lines = toLines(pg.words);
  const name = topHeader(pg);
  let wgIdx = -1, ucIdx = -1;
  lines.forEach((l, i) => {
    const t = l.words.map(w => w.text).join(' ');
    if (/WARGEAR OPTIONS/i.test(t)) wgIdx = i;
    if (/UNIT COMPOSITION/i.test(t)) ucIdx = i;
  });
  function gather(startIdx, side) {
    if (startIdx < 0) return [];
    const out = [];
    const xFilter = side === 'left' ? (w) => w.x < COL_X : (w) => w.x >= COL_X - 5;
    const startY = lines[startIdx].y;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      const t = l.words.map(w => w.text).join(' ');
      if (/WARGEAR OPTIONS|UNIT COMPOSITION|KEYWORDS:|FACTION KEYWORDS/i.test(t)) break;
      const seg = l.words.filter(xFilter).map(w => w.text).join(' ').trim();
      if (seg) out.push(seg);
    }
    return out;
  }
  const wargear = gather(wgIdx, 'left');
  const composition = gather(ucIdx, 'right');
  return { name, wargear, composition };
}

// === DRIVE ===
const datasheets = [];
const dsByName = {};
function keyName(n) { return n.toUpperCase().replace(/[^A-Z0-9]/g, ''); }

pages.forEach((pg, i) => {
  const txt = pg.words.map(w => w.text).join(' ');
  // stat page: has the M/T/SV/W/LD/OC profile header line
  const isStat = toLines(pg.words).some(l => {
    const t = l.words.map(w => w.text).join(' ');
    return /\bM\b/.test(t) && /\bT\b/.test(t) && /\bSV\b/.test(t) && /\bW\b/.test(t) && /\bLD\b/.test(t) && /\bOC\b/.test(t);
  });
  const isInfo = /WARGEAR OPTIONS/i.test(txt) && /UNIT COMPOSITION/i.test(txt);
  if (isStat) {
    const ds = parseStatPage(pg);
    ds.legends = isLegends(pg);
    ds.page = i;
    datasheets.push(ds);
    dsByName[keyName(ds.name)] = ds;
  } else if (isInfo) {
    const info = parseInfoPage(pg);
    const ds = dsByName[keyName(info.name)];
    if (ds) { ds.wargearOptions = info.wargear; ds.unitComposition = info.composition; }
    else datasheets.push({ name: info.name, _infoOnly: true, wargearOptions: info.wargear, unitComposition: info.composition, page: i });
  }
});

fs.writeFileSync('datasheets.json', JSON.stringify(datasheets, null, 2));
console.log('datasheets parsed:', datasheets.length);
for (const d of datasheets) {
  console.log(`\n### ${d.name} ${d.legends ? '(Legends)' : ''} p${d.page}`);
  console.log('  profiles:', JSON.stringify(d.profiles));
  console.log('  ranged:', (d.rangedWeapons || []).map(w => `${w.name} ${w.range}/${w.A}/${w.skill}/${w.S}/${w.AP}/${w.D}[${(w.keywords||[]).join(',')}]`).join(' || '));
  console.log('  melee:', (d.meleeWeapons || []).map(w => `${w.name} ${w.range}/${w.A}/${w.skill}/${w.S}/${w.AP}/${w.D}`).join(' || '));
  console.log('  core:', (d.abilities && d.abilities.core || []).join('; '));
  console.log('  abil:', (d.abilities && d.abilities.other || []).map(a => a.name).join(' | '));
  console.log('  keywords:', (d.keywords || []).join(', '));
}
