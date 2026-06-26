// Generate flat PNG app icons (no deps) — themed emblem: ring + vertical bar + dot.
const fs = require('fs');
const zlib = require('zlib');

const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size, draw) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => { if (x < 0 || y < 0 || x >= size || y >= size) return; const i = (y * size + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; };
  draw(set, size);
  // add filter byte (0) per scanline
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// colors
const BG = [14, 20, 22], ACCENT = [0, 198, 180];
function draw(set, S) {
  const cx = S / 2, cy = S / 2;
  const rOut = S * 0.40, rIn = S * 0.30;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // background
    set(x, y, BG[0], BG[1], BG[2], 255);
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    // ring
    if (d <= rOut && d >= rIn) set(x, y, ACCENT[0], ACCENT[1], ACCENT[2], 255);
    // vertical bar from top of ring to center
    if (Math.abs(dx) <= S * 0.045 && y >= cy - rOut && y <= cy) set(x, y, ACCENT[0], ACCENT[1], ACCENT[2], 255);
    // center dot
    if (d <= S * 0.085) set(x, y, ACCENT[0], ACCENT[1], ACCENT[2], 255);
  }
}

for (const s of [192, 512]) fs.writeFileSync(`../icon-${s}.png`, png(s, draw));
// maskable: same art with more padding already (art is centered) — reuse 512
fs.writeFileSync('../icon-maskable-512.png', png(512, draw));
console.log('icons written: 192, 512, maskable-512');
