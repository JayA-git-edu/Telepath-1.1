// Renders every level to a single PNG contact sheet for eyeballing layouts.
// Tiles are 6px blocks; entities are drawn as coloured markers.

import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { LEVELS } from '../src/data/levels.js';

const S = 6;
const PAD = 10;

const TILE_COLORS = {
  '#': [90, 104, 140], 'i': [150, 210, 245], 'j': [255, 120, 200],
  'b': [40, 44, 66], '^': [230, 70, 70], 'v': [190, 40, 130],
  '.': [16, 16, 26], ' ': [16, 16, 26],
};
const SPAWN_COLORS = {
  P: [80, 255, 120], E: [120, 240, 255], H: [180, 255, 120],
  c: [200, 150, 80], C: [190, 200, 215], Q: [80, 230, 210], o: [130, 130, 145],
  '*': [190, 110, 255], k: [255, 210, 100], x: [160, 130, 100],
  d: [255, 140, 90], g: [255, 90, 90], s: [200, 90, 255], w: [255, 90, 240], T: [255, 60, 60],
};
const ENTITY_COLORS = {
  power: [255, 255, 255], plate: [255, 170, 60], switch: [255, 200, 60], lever: [255, 200, 60],
  door: [90, 140, 255], barrier: [80, 240, 255], platform: [140, 255, 120],
  orb: [120, 230, 255], exit: [120, 240, 255], boss: [255, 60, 60],
};

const cells = LEVELS.map((L) => ({
  L,
  w: Math.max(...L.map.map((r) => r.length)) * S,
  h: L.map.length * S + 10,
}));

const COLS = 2;
let W = 0, H = PAD;
const rowsMeta = [];
for (let i = 0; i < cells.length; i += COLS) {
  const row = cells.slice(i, i + COLS);
  const rw = row.reduce((a, c) => a + c.w + PAD, PAD);
  const rh = Math.max(...row.map((c) => c.h));
  rowsMeta.push({ row, y: H, h: rh });
  W = Math.max(W, rw);
  H += rh + PAD;
}

const buf = new Uint8Array(W * H * 4);
const put = (x, y, c) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
};
const block = (x, y, w, h, c) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
};

block(0, 0, W, H, [8, 8, 14]);

for (const meta of rowsMeta) {
  let x = PAD;
  for (const cell of meta.row) {
    const { L } = cell;
    const oy = meta.y + 8;
    block(x - 1, oy - 1, cell.w + 2, L.map.length * S + 2, [45, 50, 75]);
    L.map.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const ch = row[tx];
        const col = TILE_COLORS[ch] || SPAWN_COLORS[ch] || [255, 0, 255];
        block(x + tx * S, oy + ty * S, S, S, col);
        if (SPAWN_COLORS[ch]) {
          block(x + tx * S + 1, oy + ty * S + 1, S - 2, S - 2, [255, 255, 255]);
          block(x + tx * S + 1, oy + ty * S + 1, S - 2, S - 2, col);
        }
      }
    });
    for (const e of L.entities || []) {
      const col = ENTITY_COLORS[e.t] || [255, 0, 255];
      const size = e.t === 'boss' ? S * 3 : S;
      const ww = e.t === 'platform' ? (e.w || 3) * S : (e.t === 'barrier' || e.t === 'door' ? S : size);
      const hh = (e.t === 'barrier' || e.t === 'door') ? (e.h || 3) * S : (e.t === 'platform' ? S : size);
      block(x + e.x * S, oy + e.y * S, ww, hh, col);
      if (e.t === 'platform' && e.path) {
        for (const [px, py] of e.path) block(x + px * S + 2, oy + py * S + 2, 2, 2, [255, 255, 0]);
      }
    }
    // Index bar so the sheet can be matched back to level numbers.
    const idx = LEVELS.indexOf(L);
    for (let k = 0; k <= idx; k++) block(x + k * 4, meta.y, 3, 4, [140, 220, 255]);
    x += cell.w + PAD;
  }
}

// --- PNG encode ---
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  Buffer.from(buf.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
}
const chunk = (tag, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};
function crc32(b) {
  let c = ~0;
  for (const byte of b) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = process.argv[2] || 'levels.png';
writeFileSync(out, png);
console.log(`${out}  ${W}x${H}  (${LEVELS.length} levels)`);
