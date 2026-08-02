// Static checks on level data: ragged rows, unknown glyphs, missing spawn/exit,
// unreachable-looking geometry and entity placement inside walls.

import { LEVELS, WORLDS } from '../src/data/levels.js';

const TILE_CHARS = new Set(['#', '.', ' ', 'b', '^', 'v', 'i', 'j']);
const SPAWN_CHARS = new Set(['P', 'E', 'H', 'c', 'C', 'o', 'Q', '*', 'k', 'x', 'd', 'g', 's', 'w', 'T']);
const ENTITY_TYPES = new Set(['switch', 'lever', 'plate', 'door', 'barrier', 'platform', 'orb', 'power', 'exit', 'boss']);
const BOSSES = new Set(['emech', 'spider', 'reaper', 'warden', 'entity']);

let errors = 0;
let warnings = 0;
const err = (m) => { console.log(`  ERROR  ${m}`); errors++; };
const warn = (m) => { console.log(`  warn   ${m}`); warnings++; };

const ids = new Set();
const powersSeen = new Set([0]);

for (const [i, L] of LEVELS.entries()) {
  console.log(`\n[${i}] ${L.id}  ${L.name}  (${L.world})`);
  if (ids.has(L.id)) err(`duplicate id ${L.id}`);
  ids.add(L.id);
  if (!WORLDS[L.world]) err(`unknown world ${L.world}`);

  const rows = L.map;
  const w = rows[0].length;
  const h = rows.length;
  console.log(`  size ${w} x ${h}`);
  rows.forEach((r, y) => {
    if (r.length !== w) err(`row ${y} is ${r.length} wide, expected ${w}`);
    for (const ch of r) {
      if (!TILE_CHARS.has(ch) && !SPAWN_CHARS.has(ch)) err(`row ${y}: unknown glyph "${ch}"`);
    }
  });

  const count = (ch) => rows.reduce((n, r) => n + [...r].filter((c) => c === ch).length, 0);
  const solidAt = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return true;
    return '#ij'.includes(rows[y][x]);
  };
  const find = (ch) => {
    for (let y = 0; y < h; y++) {
      const x = rows[y].indexOf(ch);
      if (x >= 0) return { x, y };
    }
    return null;
  };

  if (count('P') !== 1) err(`expected exactly 1 player spawn, found ${count('P')}`);
  const hasExitChar = count('E') > 0;
  const hasExitEntity = (L.entities || []).some((e) => e.t === 'exit');
  if (!L.boss && !hasExitChar && !hasExitEntity) err('no exit');
  if (L.boss && !(L.entities || []).some((e) => e.t === 'boss')) err('boss level without a boss entity');

  // Spawn points should have floor under them and headroom.
  for (const ch of ['P', 'E', 'H', 'c', 'C', 'Q', 'g', 's']) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (rows[y][x] !== ch) continue;
        if (solidAt(x, y)) err(`"${ch}" at ${x},${y} is inside a wall`);
        if (!solidAt(x, y + 1)) warn(`"${ch}" at ${x},${y} has no floor directly below`);
        if (solidAt(x, y - 1) && ch !== 'c' && ch !== 'C' && ch !== 'Q') {
          warn(`"${ch}" at ${x},${y} has a ceiling right above it`);
        }
      }
    }
  }

  // Nothing may spawn on top of Eli.
  const spawn = find('P');
  if (spawn) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const ch = (rows[spawn.y + dy] || '')[spawn.x + dx];
        if (ch && 'cCQo'.includes(ch)) {
          err(`"${ch}" at ${spawn.x + dx},${spawn.y + dy} overlaps the player spawn`);
        }
      }
    }
  }

  // Entities.
  for (const e of L.entities || []) {
    if (!ENTITY_TYPES.has(e.t)) { err(`unknown entity type ${e.t}`); continue; }
    if (e.x === undefined || e.y === undefined) { err(`entity ${e.t} missing coords`); continue; }
    if (e.x < 0 || e.x >= w || e.y < 0 || e.y >= h) err(`entity ${e.t} at ${e.x},${e.y} is off-map`);
    else if (solidAt(e.x, e.y) && e.t !== 'boss') err(`entity ${e.t} at ${e.x},${e.y} is inside a wall`);
    if (e.t === 'boss' && !BOSSES.has(e.boss)) err(`unknown boss "${e.boss}"`);
    if (e.t === 'power') {
      if (e.power === undefined) err('power pickup without a power index');
      else powersSeen.add(e.power);
    }
    if (e.t === 'platform' && e.path && e.path.length) {
      for (const [px, py] of e.path) {
        if (px < 0 || px >= w || py < 0 || py >= h) err(`platform path point ${px},${py} off-map`);
      }
    }
  }

  // Channel wiring: every consumer needs a producer and vice versa.
  const producers = new Set();
  const consumers = new Set();
  for (const e of L.entities || []) {
    if (e.t === 'switch' || e.t === 'lever' || e.t === 'plate') producers.add(e.ch ?? 0);
    if (e.t === 'door' || e.t === 'barrier') consumers.add(e.ch ?? 0);
    if (e.t === 'platform' && e.ch !== undefined) consumers.add(e.ch);
  }
  for (const c of consumers) if (!producers.has(c)) err(`channel ${c} has no switch/lever/plate`);
  for (const p of producers) if (!consumers.has(p)) warn(`channel ${p} controls nothing`);

  // Reachability sanity: flood fill from the player spawn through non-solid
  // tiles, allowing 2 tiles of climb (Eli's jump) and any drop.
  const start = find('P');
  if (start) {
    const seen = new Set();
    const stack = [[start.x, start.y]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (solidAt(x, y)) continue;
      seen.add(key);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1]);
      for (let up = 1; up <= 3; up++) stack.push([x, y - up]);
      stack.push([x + 1, y - 1], [x - 1, y - 1], [x + 2, y - 2], [x - 2, y - 2]);
    }
    const exitPos = find('E');
    if (exitPos && !seen.has(`${exitPos.x},${exitPos.y}`)) {
      warn(`exit at ${exitPos.x},${exitPos.y} not reached by the loose flood fill (may need telekinesis)`);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (rows[y][x] === '*' && !seen.has(`${x},${y}`)) {
          warn(`shard at ${x},${y} outside the loose flood fill`);
        }
      }
    }
  }
}

console.log(`\npowers granted by pickups: ${[...powersSeen].sort((a, b) => a - b).join(', ')}`);
for (let i = 0; i < 8; i++) if (!powersSeen.has(i)) err(`power ${i} is never granted`);

console.log(`\n${LEVELS.length} levels, ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
