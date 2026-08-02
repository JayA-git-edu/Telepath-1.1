// Tilemap: parsing, autotiling, baked terrain canvas, collision + parallax.

import { TILE } from './physics.js';
import { VIEW_W, VIEW_H } from '../engine/render.js';

export { TILE };

export const T_EMPTY = 0;
export const T_SOLID = 1;
export const T_BG = 2;
export const T_SPIKE = 3;
export const T_VOID = 4;      // bottomless / lethal fog
export const T_ICE = 5;       // slippery solid
export const T_BOUNCE = 6;    // springy solid

const DECOR_COLORS = {
  facility: { pipe: '#39445e', pipeDark: '#232b40', bracket: '#4c597a', panel: '#2b344c', led: '#7ff0ea', ledGlow: '#7ff0ea' },
  caves: { pipe: '#3d2b55', pipeDark: '#261a38', bracket: '#543d73', panel: '#33234a', led: '#c99bff', ledGlow: '#b06bff' },
  temple: { pipe: '#6b5334', pipeDark: '#453321', bracket: '#8a6b46', panel: '#5a4429', led: '#ffdc8f', ledGlow: '#ffd166' },
  void: { pipe: '#2b2247', pipeDark: '#17102b', bracket: '#3c3163', panel: '#211a3a', led: '#8bfff0', ledGlow: '#58ffe0' },
};

const DECOR_STYLE = {
  facility: 'tech', void: 'tech', caves: 'natural', temple: 'stone',
};

const LIGHT_COLORS = {
  facility: '#7ff0ea', city: '#ff7fc0', caves: '#c99bff',
  temple: '#ffdc8f', frost: '#cdefff', void: '#8bfff0',
};

const CHARS = {
  '#': T_SOLID,
  'b': T_BG,
  '^': T_SPIKE,
  'v': T_VOID,
  'i': T_ICE,
  'j': T_BOUNCE,
};

/** Characters that spawn an entity and leave the tile empty. */
export const SPAWN_CHARS = 'PEHcCoQ*dgstwTxWkK';

export class Level {
  constructor(def, assets) {
    this.def = def;
    this.assets = assets;
    this.name = def.name;
    this.world = def.world;
    this.rows = def.map.length;
    this.cols = Math.max(...def.map.map((r) => r.length));
    this.w = this.cols * TILE;
    this.h = this.rows * TILE;
    this.tiles = new Uint8Array(this.cols * this.rows);
    this.spawns = [];
    this.playerSpawn = { x: TILE * 2, y: TILE * 2 };

    for (let y = 0; y < this.rows; y++) {
      const row = def.map[y];
      for (let x = 0; x < this.cols; x++) {
        const ch = row[x] || '.';
        if (CHARS[ch] !== undefined) {
          this.tiles[y * this.cols + x] = CHARS[ch];
        } else if (SPAWN_CHARS.includes(ch)) {
          this.spawns.push({ ch, x, y });
          if (ch === 'P') this.playerSpawn = { x: x * TILE, y: y * TILE };
        }
      }
    }
    if (def.bgFill) {
      // Interior worlds get a wall behind the play space - but only near the
      // terrain. Further out the parallax shows through, which gives the big
      // rooms depth instead of one flat texture.
      const reach = def.bgReach === undefined ? 5 : def.bgReach;
      const dist = new Int16Array(this.cols * this.rows).fill(9999);
      const queue = [];
      for (let i = 0; i < this.tiles.length; i++) {
        if (this.isSolidType(this.tiles[i])) { dist[i] = 0; queue.push(i); }
      }
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        if (dist[i] >= reach) continue;
        const x = i % this.cols;
        const y = (i / this.cols) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const j = ny * this.cols + nx;
          if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; queue.push(j); }
        }
      }
      for (let i = 0; i < this.tiles.length; i++) {
        if (this.tiles[i] === T_EMPTY && dist[i] <= reach) this.tiles[i] = T_BG;
      }
    }
    this.bake();
    this.buildLights();
  }

  /** Lamps hang from ceilings every few columns; purely decorative lighting. */
  buildLights() {
    this.lights = [];
    const spacing = 7;
    for (let x = 2; x < this.cols - 2; x += spacing) {
      for (let y = 0; y < this.rows - 2; y++) {
        const here = this.at(x, y);
        const below = this.at(x, y + 1);
        if (this.isSolidType(here) && (below === T_EMPTY || below === T_BG)) {
          this.lights.push({ x: x * TILE + 8, y: y * TILE + TILE + 2 });
          break;
        }
      }
    }
  }

  /** Non-colliding structural detail so interiors are not flat walls. */
  drawDecor(r, time) {
    if (!this.def.bgFill) return;
    const cfg = DECOR_COLORS[this.world] || DECOR_COLORS.facility;
    const x0 = Math.max(0, Math.floor(r.ox / TILE) - 2);
    const x1 = Math.min(this.cols - 1, Math.floor((r.ox + VIEW_W) / TILE) + 2);
    for (let x = x0 - (x0 % 6); x <= x1; x += 6) {
      if (x < 1 || x >= this.cols - 1) continue;
      const seed = hash2(x, 7);
      // find the ceiling in this column
      let top = -1;
      for (let y = 0; y < this.rows - 1; y++) {
        if (this.isSolidType(this.at(x, y)) && !this.isSolidType(this.at(x, y + 1))) { top = y; break; }
      }
      if (top < 0) continue;
      const len = 3 + (seed >>> 4) % 6;
      const px = x * TILE + 7;
      const py = (top + 1) * TILE;
      const style = DECOR_STYLE[this.world] || 'tech';
      if (style === 'natural') {
        // stalactite
        const tip = py + len * TILE * 0.7;
        for (let k = 0; k < len * TILE * 0.7; k++) {
          const t = k / (len * TILE * 0.7);
          const wd = Math.max(1, (1 - t) * 7);
          r.rect(px + 1 - wd / 2, py + k, wd, 1, k < 3 ? cfg.bracket : cfg.pipe);
        }
        if ((seed >>> 8) % 3 === 0) {
          r.rect(px - 1, tip - 6, 3, 6, cfg.led);
          r.addGlow(px, tip - 3, 16, cfg.ledGlow, 0.25);
        }
      } else if (style === 'stone') {
        // carved pillar with glyph band
        const w = 10;
        r.rect(px - 4, py, w, len * TILE, cfg.panel);
        r.rect(px - 4, py, 2, len * TILE, cfg.pipe);
        r.rect(px + 4, py, 2, len * TILE, cfg.pipeDark);
        for (let k = 1; k < len; k++) {
          r.rect(px - 6, py + k * TILE, 14, 4, cfg.bracket);
          if (k % 2 === 0) r.rect(px - 1, py + k * TILE + 6, 3, 3, cfg.led);
        }
      } else if ((seed >>> 8) % 2 === 0) {
        // hanging pipe
        r.rect(px, py, 2, len * TILE, cfg.pipe);
        r.rect(px + 2, py, 1, len * TILE, cfg.pipeDark);
        for (let k = 1; k < len; k++) {
          r.rect(px - 2, py + k * TILE, 7, 3, cfg.bracket);
        }
        r.rect(px - 3, py + len * TILE - 2, 9, 4, cfg.bracket);
      } else {
        // wall panel with a status light
        const w = 3 * TILE, h = 2 * TILE;
        r.rect(px - 8, py + 12, w, h, cfg.panel);
        r.rectOutline(px - 8, py + 12, w, h, cfg.bracket);
        const on = Math.sin(time * 1.6 + x) > -0.2;
        r.rect(px - 3, py + 18, 3, 3, on ? cfg.led : cfg.pipeDark);
        if (on) r.addGlow(px - 2, py + 20, 12, cfg.ledGlow, 0.22);
        for (let k = 0; k < 3; k++) r.rect(px + 4, py + 18 + k * 4, 16, 2, cfg.pipeDark);
      }
    }
  }

  drawLights(r, time) {
    if (!this.lights) return;
    const color = LIGHT_COLORS[this.world] || '#8ef7ff';
    for (const L of this.lights) {
      if (L.x < r.ox - 40 || L.x > r.ox + VIEW_W + 40) continue;
      const flicker = 0.86 + Math.sin(time * 2.4 + L.x * 0.07) * 0.14;
      r.rect(L.x - 2, L.y - 4, 4, 3, 'rgba(20,24,40,0.9)');
      r.rect(L.x - 2, L.y - 1, 4, 1, color);
      r.addLight(L.x, L.y + 34, 116 * flicker, 0.95);
      r.addGlow(L.x, L.y + 8, 34 * flicker, color, 0.3);
    }
  }

  index(x, y) { return y * this.cols + x; }

  at(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return T_EMPTY;
    return this.tiles[y * this.cols + x];
  }

  setTile(x, y, v) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.tiles[y * this.cols + x] = v;
    this.bake();
  }

  isSolidType(t) {
    return t === T_SOLID || t === T_ICE || t === T_BOUNCE;
  }

  isSolid(x, y) {
    // Outside the map: everything except above the top counts as solid, so the
    // player can jump past the ceiling line but never walks off the sides.
    if (x < 0 || x >= this.cols) return true;
    if (y < 0) return false;
    if (y >= this.rows) return false;
    return this.isSolidType(this.tiles[y * this.cols + x]);
  }

  /** Does a world-space rect overlap solid terrain? */
  solidRect(r) {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 0.001) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 0.001) / TILE);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.isSolid(x, y)) return true;
      }
    }
    return false;
  }

  /** First tile of the given type overlapping the rect, or null. */
  tileTypeIn(r, type) {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 0.001) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 0.001) / TILE);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.at(x, y) === type) return { x, y };
      }
    }
    return null;
  }

  /** Set by Game each frame so actors can collide with solid entities. */
  setEntities(list) {
    this.entities = list;
  }

  solidEntityAt(r, ignore) {
    if (!this.entities) return null;
    for (const e of this.entities) {
      if (e === ignore || e.dead || !e.solid || e.collidable === false) continue;
      // Held props pass through Eli so he can carry them in front of him - but
      // a platform he is standing on has to stay solid underfoot.
      if (e.heldBy && !e.solidWhileHeld) continue;
      if (r.x < e.x + e.w && r.x + r.w > e.x && r.y < e.y + e.h && r.y + r.h > e.y) return e;
    }
    return null;
  }

  /** Ray march for line-of-sight / aiming. Returns hit point or null. */
  raycast(x0, y0, x1, y1, step = 3) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      if (this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE))) {
        return { x: px, y: py, t };
      }
    }
    return null;
  }

  // ------------------------------------------------------------- rendering
  mask(x, y, forBg) {
    const solidLike = (tx, ty) => {
      if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return true;
      const t = this.at(tx, ty);
      return forBg ? (t === T_BG || this.isSolidType(t)) : this.isSolidType(t);
    };
    return (solidLike(x, y - 1) ? 1 : 0) |
           (solidLike(x + 1, y) ? 2 : 0) |
           (solidLike(x, y + 1) ? 4 : 0) |
           (solidLike(x - 1, y) ? 8 : 0);
  }

  /** Pre-render the whole terrain layer into an offscreen canvas. */
  bake() {
    if (!this.baked) {
      this.baked = document.createElement('canvas');
      this.baked.width = this.w;
      this.baked.height = this.h;
    }
    const ctx = this.baked.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.w, this.h);
    const sheetName = `tiles_${this.world}`;
    const sheet = this.assets.sheet[sheetName];
    if (!sheet) return;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const t = this.at(x, y);
        if (t === T_EMPTY || t === T_SPIKE || t === T_VOID) continue;
        let idx;
        if (t === T_BG) {
          idx = 48 + this.mask(x, y, true);
        } else {
          const variant = hash2(x, y) % 3;
          idx = variant * 16 + this.mask(x, y, false);
        }
        const sx = (idx % sheet.cols) * sheet.fw;
        const sy = Math.floor(idx / sheet.cols) * sheet.fh;
        ctx.drawImage(sheet.img, sx, sy, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
        if (t === T_BG) {
          // Where the backdrop wall stops and the parallax shows through,
          // fade its edge so the opening reads as a window, not a hole.
          const px = x * TILE;
          const py = y * TILE;
          const sides = [
            [this.at(x, y - 1), 0, 0, TILE, 1, 0, 1],
            [this.at(x, y + 1), 0, TILE - 1, TILE, 1, 0, -1],
            [this.at(x - 1, y), 0, 0, 1, TILE, 1, 0],
            [this.at(x + 1, y), TILE - 1, 0, 1, TILE, -1, 0],
          ];
          for (const [n, ox, oy, w, h, dx, dy] of sides) {
            if (n !== T_EMPTY) continue;
            for (let k = 0; k < 4; k++) {
              ctx.fillStyle = `rgba(6,7,18,${0.5 - k * 0.11})`;
              ctx.fillRect(px + ox + dx * k, py + oy + dy * k, w, h);
            }
          }
        }
        if (t === T_ICE) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(120,220,255,0.22)';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          ctx.restore();
        } else if (t === T_BOUNCE) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(255,120,200,0.22)';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          ctx.restore();
        }
      }
    }
  }

  drawBackground(r, time) {
    const c = r.ctx;
    const layers = [
      { i: 0, p: 0.08, sy: 0.05 },
      { i: 1, p: 0.25, sy: 0.14 },
      { i: 2, p: 0.5, sy: 0.28 },
    ];
    for (const L of layers) {
      const img = this.assets.get(`bg_${this.world}_${L.i}`);
      if (!img) continue;
      const ox = -(r.ox * L.p) % img.width;
      const camRange = Math.max(1, this.h - VIEW_H);
      const oy = -(r.oy * L.sy) + (VIEW_H - img.height) * (1 - Math.min(1, r.oy / camRange)) * 0.15;
      for (let x = ox - img.width; x < VIEW_W + img.width; x += img.width) {
        c.drawImage(img, Math.round(x), Math.round(oy));
      }
    }
  }

  drawTerrain(r) {
    if (!this.baked) return;
    const sx = Math.max(0, r.ox);
    const sy = Math.max(0, r.oy);
    const sw = Math.min(this.w - sx, VIEW_W + 32);
    const sh = Math.min(this.h - sy, VIEW_H + 32);
    if (sw <= 0 || sh <= 0) return;
    r.ctx.drawImage(this.baked, sx, sy, sw, sh, Math.round(sx - r.ox), Math.round(sy - r.oy), sw, sh);
  }

  /** Spikes and void fog are drawn on top of entities for readability. */
  drawHazards(r, time) {
    const x0 = Math.max(0, Math.floor(r.ox / TILE) - 1);
    const x1 = Math.min(this.cols - 1, Math.floor((r.ox + VIEW_W) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(r.oy / TILE) - 1);
    const y1 = Math.min(this.rows - 1, Math.floor((r.oy + VIEW_H) / TILE) + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = this.at(x, y);
        if (t === T_SPIKE) {
          const up = !this.isSolid(x, y + 1) && this.isSolid(x, y - 1);
          r.sprite('spikes', 0, x * TILE, y * TILE, { rot: up ? Math.PI : 0 });
        } else if (t === T_VOID) {
          const a = 0.5 + Math.sin(time * 2 + x * 0.6 + y) * 0.12;
          r.rect(x * TILE, y * TILE, TILE, TILE, `rgba(120,20,80,${a * 0.5})`);
          r.addGlow(x * TILE + 8, y * TILE + 8, 14, '#ff2f88', 0.18);
        }
      }
    }
  }
}

export function hash2(x, y) {
  let n = (x * 73856093) ^ (y * 19349663);
  n = (n ^ (n >>> 13)) >>> 0;
  return (n * 1274126177) >>> 0;
}
