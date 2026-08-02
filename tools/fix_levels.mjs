// One-shot maintenance pass over src/data/levels.js: drops props, spawns,
// exits and checkpoints onto the floor beneath them so nothing floats.

import { readFileSync, writeFileSync } from 'node:fs';

const PATH = new URL('../src/data/levels.js', import.meta.url);
const DROPPABLE = 'EHcCQogsk';
const SOLID = '#ij';

let src = readFileSync(PATH, 'utf8');
let moved = 0;

src = src.replace(/(map: \[\n)([\s\S]*?)(\n\s*\],)/g, (all, head, body, tail) => {
  const lineRe = /^(\s*)'(.*)',?$/;
  const lines = body.split('\n');
  const rows = [];
  const meta = [];
  for (const ln of lines) {
    const m = ln.match(lineRe);
    if (!m) return all;           // unexpected shape: leave this block alone
    meta.push(m[1]);
    rows.push(m[2].split(''));
  }
  const h = rows.length;
  const solid = (x, y) => {
    if (y < 0 || y >= h) return true;
    const row = rows[y];
    if (x < 0 || x >= row.length) return true;
    return SOLID.includes(row[x]);
  };
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (!DROPPABLE.includes(ch)) continue;
      if (solid(x, y + 1)) continue;
      let ny = y;
      while (ny + 1 < h && !solid(x, ny + 1) && ny - y < 5) ny++;
      if (ny === y || solid(x, ny)) continue;
      if (rows[ny][x] !== '.') continue;
      rows[ny][x] = ch;
      rows[y][x] = '.';
      moved++;
    }
  }
  const out = rows.map((r, i) => `${meta[i]}'${r.join('')}',`).join('\n');
  return head + out + tail;
});

writeFileSync(PATH, src);
console.log(`dropped ${moved} glyphs onto the floor`);
