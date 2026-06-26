// Minimal XML parser -> element tree. Handles tags, attrs, self-closing, text, CDATA.
function parseXML(s) {
  let i = 0;
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  while (i < s.length) {
    if (s[i] === '<') {
      if (s.startsWith('<!--', i)) { i = s.indexOf('-->', i) + 3; continue; }
      if (s.startsWith('<![CDATA[', i)) { const e = s.indexOf(']]>', i); top().children.push({ text: s.slice(i + 9, e) }); i = e + 3; continue; }
      if (s.startsWith('<?', i)) { i = s.indexOf('?>', i) + 2; continue; }
      if (s[i + 1] === '/') { // close
        const e = s.indexOf('>', i); stack.pop(); i = e + 1; continue;
      }
      const e = s.indexOf('>', i);
      let raw = s.slice(i + 1, e);
      const selfClose = raw.endsWith('/');
      if (selfClose) raw = raw.slice(0, -1);
      const sp = raw.indexOf(' ');
      const tag = sp < 0 ? raw : raw.slice(0, sp);
      const attrs = {};
      if (sp >= 0) { const re = /([\w:]+)\s*=\s*"([^"]*)"/g; let m; while ((m = re.exec(raw.slice(sp)))) attrs[m[1]] = decode(m[2]); }
      const node = { tag, attrs, children: [] };
      top().children.push(node);
      if (!selfClose) stack.push(node);
      i = e + 1;
    } else {
      const e = s.indexOf('<', i);
      const text = s.slice(i, e < 0 ? s.length : e);
      if (text.trim()) top().children.push({ text: decode(text) });
      i = e < 0 ? s.length : e;
    }
  }
  return root;
}
function decode(t) {
  return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'").replace(/&#039;/g, "'").replace(/&amp;/g, '&');
}
// helpers
const isEl = (n) => n && n.tag;
function find(node, fn, out = []) { for (const c of node.children || []) { if (isEl(c) && fn(c)) out.push(c); if (isEl(c)) find(c, fn, out); } return out; }
function childTextOf(node) { return (node.children || []).filter((c) => c.text != null).map((c) => c.text).join(''); }

module.exports = { parseXML, find, childTextOf, isEl };
