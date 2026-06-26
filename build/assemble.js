// Combine all parsed pieces into ../data.json consumed by the app.
const fs = require('fs');
const datasheets = require('./datasheets.json');
const detachments = require('./detachments_parsed.json');
const stratagems = require('./stratagems.json');
const { updates, faqs } = require('./updates.json');

// Flatten enhancements from detachments into a top-level list (with detachment ref).
const enhancements = [];
for (const d of detachments) {
  for (const e of d.enhancements) enhancements.push({ name: e.name, detachment: d.name, text: e.text });
}

// Clean datasheets: drop internal/raw helper fields, normalise empties.
const cleanSheets = datasheets.map(d => ({
  name: d.name,
  legends: !!d.legends,
  profiles: d.profiles || [],
  invuln: d.invuln || '',
  rangedWeapons: (d.rangedWeapons || []).map(stripWpn),
  meleeWeapons: (d.meleeWeapons || []).map(stripWpn),
  abilities: {
    core: (d.abilities && d.abilities.core) || [],
    faction: (d.abilities && d.abilities.faction) || [],
    other: (d.abilities && d.abilities.other) || [],
    wargear: (d.abilities && d.abilities.wargear) || [],
  },
  damaged: d.damaged || '',
  wargearOptions: d.wargearOptions || [],
  unitComposition: d.unitComposition || [],
  keywords: d.keywords || [],
  factionKeywords: d.factionKeywords || [],
}));

function stripWpn(w) {
  return { name: w.name, range: w.range, A: w.A, skill: w.skill, S: w.S, AP: w.AP, D: w.D, keywords: w.keywords || [] };
}

const data = {
  meta: {
    source: 'T’au Empire Faction Pack',
    version: 'Version 1.0',
    legal: 'Legal for matched play from 20th June 2026',
    note: 'Unofficial personal reference compiled from the official Faction Pack PDF. Not a substitute for the official rules.',
  },
  detachments: detachments.map(d => ({ name: d.name, uniqueTag: d.uniqueTag, tagline: d.tagline, rules: d.rules })),
  datasheets: cleanSheets,
  stratagems,
  enhancements,
  rulesUpdates: updates,
  faqs,
};

fs.writeFileSync('../data.json', JSON.stringify(data));
fs.writeFileSync('../data.pretty.json', JSON.stringify(data, null, 2));
const kb = (s) => (s.length / 1024).toFixed(0) + 'KB';
console.log('Wrote ../data.json', kb(JSON.stringify(data)));
console.log({
  detachments: data.detachments.length,
  datasheets: data.datasheets.length,
  stratagems: data.stratagems.length,
  enhancements: data.enhancements.length,
  rulesUpdates: data.rulesUpdates.length,
  faqs: data.faqs.length,
});
