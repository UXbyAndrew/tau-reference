// Shared bbox loader: parses pdftotext -bbox-layout HTML into pages of words.
const fs = require('fs');

function loadPages(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const pages = [];
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  let pm;
  while ((pm = pageRe.exec(html))) {
    const width = parseFloat(pm[1]);
    const height = parseFloat(pm[2]);
    const body = pm[3];
    const words = [];
    const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;
    let wm;
    while ((wm = wordRe.exec(body))) {
      const text = decodeEntities(wm[5]);
      words.push({
        x: parseFloat(wm[1]), y: parseFloat(wm[2]),
        xMax: parseFloat(wm[3]), yMax: parseFloat(wm[4]),
        text,
      });
    }
    pages.push({ width, height, words });
  }
  return pages;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

// Group words into lines by y (within tolerance), sorted left-to-right.
function toLines(words, yTol = 3) {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const w of sorted) {
    let line = lines.find(l => Math.abs(l.y - w.y) <= yTol);
    if (!line) { line = { y: w.y, words: [] }; lines.push(line); }
    line.words.push(w);
  }
  lines.sort((a, b) => a.y - b.y);
  for (const l of lines) l.words.sort((a, b) => a.x - b.x);
  return lines;
}

// Join words in a column range [xLo, xHi) into text for a line.
function joinRange(line, xLo, xHi) {
  return line.words.filter(w => w.x >= xLo && w.x < xHi).map(w => w.text).join(' ');
}

module.exports = { loadPages, toLines, joinRange };
