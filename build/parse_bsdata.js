// Extract full T'au roster from the BSData BattleScribe catalogue -> bsdata.json
const fs = require('fs');
const { parseXML, find, childTextOf } = require('./xml.js');
const root = parseXML(fs.readFileSync('tau.cat', 'utf8'));

// --- global profile map (resolve infoLink references) ---
const profileById = {};
for (const p of find(root, (n) => n.tag === 'profile')) if (p.attrs.id) profileById[p.attrs.id] = p;
const ruleById = {};
for (const r of find(root, (n) => n.tag === 'rule')) if (r.attrs.id) ruleById[r.attrs.id] = r;
const entryById = {};
for (const e of find(root, (n) => n.tag === 'selectionEntry' || n.tag === 'selectionEntryGroup')) if (e.attrs.id) entryById[e.attrs.id] = e;

function chars(profile) {
  const o = {};
  for (const c of find(profile, (n) => n.tag === 'characteristic')) o[c.attrs.name] = childTextOf(c).trim();
  return o;
}

// gather profiles within a subtree. Always follows infoLink(profile); follows entryLink (shared
// wargear) only when followEntry=true (used for weapons, so optional wargear weapons are included).
function gatherProfiles(node, typeNames, followEntry) {
  const res = [];
  const seen = new Set();
  const visited = new Set();
  const add = (p) => { const key = p.attrs.name + '|' + p.attrs.typeName; if (!seen.has(key)) { seen.add(key); res.push(p); } };
  (function walk(n) {
    for (const c of n.children || []) {
      if (!c.tag) continue;
      if (c.tag === 'profile' && typeNames.includes(c.attrs.typeName)) add(c);
      else if (c.tag === 'infoLink' && c.attrs.type === 'profile') { const p = profileById[c.attrs.targetId]; if (p && typeNames.includes(p.attrs.typeName)) add(p); }
      if (c.tag === 'entryLink') { if (followEntry) { const t = entryById[c.attrs.targetId]; if (t && !visited.has(t)) { visited.add(t); walk(t); } } }
      else walk(c);
    }
  })(node);
  return res;
}

// --- identify datasheet entries: outermost selectionEntries containing a Unit profile ---
const parent = new Map();
(function mark(n, p) { for (const c of n.children || []) { if (c.tag) { parent.set(c, p); mark(c, c.tag === 'selectionEntry' ? c : p); } } })(root, null);
const hasUnit = (e) => find(e, (n) => n.tag === 'profile' && n.attrs.typeName === 'Unit').length > 0 ||
  find(e, (n) => n.tag === 'infoLink' && n.attrs.type === 'profile' && profileById[n.attrs.targetId] && profileById[n.attrs.targetId].attrs.typeName === 'Unit').length > 0;
const allEntries = find(root, (n) => n.tag === 'selectionEntry');
const candidates = allEntries.filter(hasUnit);
const candSet = new Set(candidates);
function ancestorIsCand(e) { let p = parent.get(e); while (p) { if (p !== e && candSet.has(p)) return true; p = parent.get(p); } return false; }
const datasheetEntries = candidates.filter((e) => !ancestorIsCand(e));

function weapon(p, melee) {
  const c = chars(p);
  const kw = (c.Keywords && c.Keywords !== '-') ? c.Keywords.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return { name: p.attrs.name, range: c.Range || (melee ? 'Melee' : ''), A: c.A || '', skill: c.BS || c.WS || '', S: c.S || '', AP: c.AP || '', D: c.D || '', keywords: kw };
}

function pointsOf(entry) {
  // smallest model/unit cost listed
  const costs = find(entry, (n) => n.tag === 'cost' && /pts/i.test(n.attrs.name || '')).map((c) => parseInt(c.attrs.value, 10)).filter((v) => v > 0);
  return costs.length ? Math.min(...costs) : null;
}

const datasheets = [];
for (const e of datasheetEntries) {
  const name = e.attrs.name;
  const unitProfs = gatherProfiles(e, ['Unit'], false);
  // dedupe profiles by stat signature; keep label when distinct
  const profiles = [];
  const sigSeen = new Set();
  for (const up of unitProfs) {
    const c = chars(up);
    const sig = ['M', 'T', 'SV', 'W', 'LD', 'OC'].map((k) => c[k]).join('|');
    if (sigSeen.has(sig)) continue; sigSeen.add(sig);
    const prof = { M: c.M || '-', T: c.T || '-', SV: c.SV || '-', W: c.W || '-', LD: c.LD || '-', OC: c.OC || '-' };
    if (up.attrs.name && up.attrs.name !== name) prof.label = up.attrs.name;
    profiles.push(prof);
  }
  const clean = (w) => { w.name = w.name.replace(/^[➤▪◦\s]+/, '').trim(); return w; };
  const ranged = gatherProfiles(e, ['Ranged Weapons'], true).map((p) => clean(weapon(p, false)));
  const melee = gatherProfiles(e, ['Melee Weapons'], true).map((p) => clean(weapon(p, true)));
  // abilities -> app schema {core, faction, other, wargear}
  const other = [];
  let damaged = '';
  for (const p of gatherProfiles(e, ['Abilities'], false)) {
    const c = chars(p);
    const text = (c.Description || '').trim();
    if (/^Damaged/i.test(p.attrs.name)) { damaged = (p.attrs.name + ': ' + text).replace(/\s+/g, ' ').trim(); continue; }
    other.push({ name: p.attrs.name, text });
  }
  // core abilities + faction ability from rule infoLinks (not following wargear entryLinks)
  const ruleNames = [];
  (function rules(n) { for (const ch of n.children || []) { if (!ch.tag) continue; if (ch.tag === 'infoLink' && ch.attrs.type === 'rule' && ch.attrs.name) ruleNames.push(ch.attrs.name); if (ch.tag !== 'entryLink') rules(ch); } })(e);
  const uniq = [...new Set(ruleNames)];
  const faction = uniq.filter((r) => /greater good/i.test(r)).map(() => 'For the Greater Good');
  // weapon abilities (10e) are also rule infoLinks on the unit's weapons — exclude from unit core.
  const WPN = /^(Assault|Rapid Fire|Pistol|Ignores Cover|Twin-linked|Hazardous|Devastating Wounds|Sustained Hits|Lethal Hits|Blast|Melta|Heavy|Anti-|Torrent|Lance|Indirect Fire|Precision|One Shot|Extra Attacks|Conversion|Psychic|Hot)\b/i;
  const core = uniq.filter((r) => !/greater good/i.test(r) && !WPN.test(r));
  // invuln
  let invuln = '';
  const iv = other.find((a) => /invulnerable/i.test(a.name));
  if (iv) { const m = iv.text.match(/(\d\+)/); if (m) invuln = m[1]; }
  // keywords from categoryLinks
  const cats = find(e, (n) => n.tag === 'categoryLink').map((c) => c.attrs.name).filter(Boolean);
  const factionKeywords = cats.filter((c) => /^Faction:/i.test(c)).map((c) => c.replace(/^Faction:\s*/i, ''));
  const keywords = cats.filter((c) => !/^Faction:/i.test(c) && !/^(Configuration|Battleline|Dedicated Transport|Infantry Models|Non-Kroot)$/i.test(c) && c !== 'Unit');
  datasheets.push({
    name: name.replace(/\s*\[(Legends|Crucible)\]\s*/i, '').trim(),
    legends: /\[Legends\]/i.test(name), crucible: /\[Crucible\]/i.test(name),
    profiles, invuln,
    rangedWeapons: ranged, meleeWeapons: melee,
    abilities: { core, faction: [...new Set(faction)], other, wargear: [] },
    damaged, keywords,
    factionKeywords: factionKeywords.length ? factionKeywords : ['T’au Empire'],
    points: pointsOf(e),
  });
}

datasheets.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync('bsdata.json', JSON.stringify(datasheets, null, 2));
console.log('datasheets:', datasheets.length);
for (const d of datasheets) console.log(`- ${d.name}  [${d.profiles[0] ? ['M','T','SV','W','LD','OC'].map(k=>d.profiles[0][k]).join('/') : '?'}]  R:${d.rangedWeapons.length} M:${d.meleeWeapons.length} A:${d.abilities.other.length} core:[${d.abilities.core.join(',')}] pts:${d.points}`);
