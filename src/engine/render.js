// Pixel renderer: camera, sprite drawing, additive glow layer, light/darkness
// layer, screen shake and a tinted bitmap font.

export const VIEW_W = 480;
export const VIEW_H = 270;

// Must match tools/gen_font.py ORDER.
const FONT_ORDER =
  ' !"#%\'()*+,-./0123456789:<=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_';
const FONT_COLS = 32;
export const CW = 6;
export const CH = 8;

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.assets = assets;

    this.glow = makeLayer(VIEW_W, VIEW_H);   // additive psychic light
    this.light = makeLayer(VIEW_W, VIEW_H);  // darkness with holes punched
    this.cam = { x: 0, y: 0, tx: 0, ty: 0, shake: 0, shakeX: 0, shakeY: 0 };
    this.flash = 0;
    this.flashColor = '#ffffff';
    this._tinted = new Map();
    this.time = 0;
    this.fitToWindow();
    addEventListener('resize', () => this.fitToWindow());
  }

  fitToWindow() {
    const pad = 8;
    const sx = (innerWidth - pad) / VIEW_W;
    const sy = (innerHeight - pad) / VIEW_H;
    let s = Math.min(sx, sy);
    s = s >= 1 ? Math.max(1, Math.floor(s)) : s;
    this.canvas.style.width = `${Math.round(VIEW_W * s)}px`;
    this.canvas.style.height = `${Math.round(VIEW_H * s)}px`;
    this.scale = s;
  }

  // ---------------------------------------------------------------- camera
  setCamera(x, y, bounds, snap = false) {
    this.cam.tx = x;
    this.cam.ty = y;
    if (snap) { this.cam.x = x; this.cam.y = y; }
    if (bounds) {
      const maxX = Math.max(0, bounds.w - VIEW_W);
      const maxY = Math.max(0, bounds.h - VIEW_H);
      this.cam.tx = clamp(this.cam.tx, 0, maxX);
      this.cam.ty = clamp(this.cam.ty, 0, maxY);
      if (snap) { this.cam.x = this.cam.tx; this.cam.y = this.cam.ty; }
    }
  }

  updateCamera(dt) {
    const k = 1 - Math.pow(0.0008, dt);
    this.cam.x += (this.cam.tx - this.cam.x) * k;
    this.cam.y += (this.cam.ty - this.cam.y) * k;
    if (this.cam.shake > 0) {
      this.cam.shake = Math.max(0, this.cam.shake - dt * 2.2);
      const m = this.cam.shake * 6;
      this.cam.shakeX = (Math.random() * 2 - 1) * m;
      this.cam.shakeY = (Math.random() * 2 - 1) * m;
    } else {
      this.cam.shakeX = this.cam.shakeY = 0;
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
  }

  shake(amount) {
    this.cam.shake = Math.min(2.4, this.cam.shake + amount);
  }

  doFlash(amount, color = '#ffffff') {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }

  get ox() { return Math.round(this.cam.x + this.cam.shakeX); }
  get oy() { return Math.round(this.cam.y + this.cam.shakeY); }

  // ---------------------------------------------------------------- frame
  begin(dt) {
    this.time += dt;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    this.glow.ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    this.light.ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  }

  /** Fill the light layer with darkness that lights will carve holes into. */
  ambient(color) {
    const g = this.light.ctx;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = color;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /** Punch a soft hole in the darkness (world coords). */
  addLight(x, y, radius, strength = 1) {
    const g = this.light.ctx;
    const sx = x - this.ox;
    const sy = y - this.oy;
    if (sx < -radius || sy < -radius || sx > VIEW_W + radius || sy > VIEW_H + radius) return;
    const grad = g.createRadialGradient(sx, sy, 0, sx, sy, radius);
    grad.addColorStop(0, `rgba(0,0,0,${strength})`);
    grad.addColorStop(0.55, `rgba(0,0,0,${strength * 0.55})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = grad;
    g.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  }

  /** Additive coloured glow (world coords). */
  addGlow(x, y, radius, color, alpha = 0.8) {
    const g = this.glow.ctx;
    const sx = x - this.ox;
    const sy = y - this.oy;
    if (sx < -radius || sy < -radius || sx > VIEW_W + radius || sy > VIEW_H + radius) return;
    const grad = g.createRadialGradient(sx, sy, 0, sx, sy, radius);
    grad.addColorStop(0, withAlpha(color, alpha));
    grad.addColorStop(1, withAlpha(color, 0));
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = grad;
    g.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  }

  /** Composite glow + darkness + flash. Call after all world/UI drawing. */
  end() {
    const c = this.ctx;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.light.canvas, 0, 0);
    c.globalCompositeOperation = 'lighter';
    c.drawImage(this.glow.canvas, 0, 0);
    c.globalCompositeOperation = 'source-over';
    if (this.flash > 0.001) {
      c.globalAlpha = Math.min(1, this.flash);
      c.fillStyle = this.flashColor;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      c.globalAlpha = 1;
    }
  }

  // --------------------------------------------------------------- sprites
  /** Draw a whole image in world space. */
  image(name, x, y, opts = {}) {
    const img = this.assets.get(name);
    if (!img) return;
    this.drawSub(img, 0, 0, img.width, img.height, x, y, opts);
  }

  /** Draw frame `i` of a sheet in world space. */
  sprite(name, i, x, y, opts = {}) {
    const s = this.assets.sheet[name];
    if (!s) return this.image(name, x, y, opts);
    const idx = ((Math.floor(i) % s.count) + s.count) % s.count;
    const sx = (idx % s.cols) * s.fw;
    const sy = Math.floor(idx / s.cols) * s.fh;
    this.drawSub(s.img, sx, sy, s.fw, s.fh, x, y, opts);
  }

  drawSub(img, sx, sy, sw, sh, x, y, opts = {}) {
    const c = this.ctx;
    const screenX = Math.round(x - (opts.screen ? 0 : this.ox));
    const screenY = Math.round(y - (opts.screen ? 0 : this.oy));
    const flip = opts.flip ? -1 : 1;
    const alpha = opts.alpha === undefined ? 1 : opts.alpha;
    if (alpha <= 0) return;
    const scale = opts.scale || 1;
    const w = sw * scale, h = sh * scale;
    if (screenX + w < -32 || screenY + h < -32 ||
        screenX > VIEW_W + 32 || screenY > VIEW_H + 32) return;

    c.save();
    if (alpha !== 1) c.globalAlpha = alpha;
    if (opts.additive) c.globalCompositeOperation = 'lighter';
    if (flip === -1 || opts.rot) {
      c.translate(screenX + w / 2, screenY + h / 2);
      if (opts.rot) c.rotate(opts.rot);
      c.scale(flip, 1);
      c.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
    } else {
      c.drawImage(img, sx, sy, sw, sh, screenX, screenY, w, h);
    }
    c.restore();
  }

  /** Silhouette of a sprite in a flat colour (hit flashes, shadows). */
  spriteTinted(name, i, x, y, color, opts = {}) {
    const s = this.assets.sheet[name];
    const img = s ? s.img : this.assets.get(name);
    if (!img) return;
    const key = `${name}|${color}`;
    let tint = this._tinted.get(key);
    if (!tint) {
      tint = makeLayer(img.width, img.height);
      tint.ctx.drawImage(img, 0, 0);
      tint.ctx.globalCompositeOperation = 'source-in';
      tint.ctx.fillStyle = color;
      tint.ctx.fillRect(0, 0, img.width, img.height);
      this._tinted.set(key, tint);
    }
    if (s) {
      const idx = ((Math.floor(i) % s.count) + s.count) % s.count;
      this.drawSub(tint.canvas, (idx % s.cols) * s.fw,
        Math.floor(idx / s.cols) * s.fh, s.fw, s.fh, x, y, opts);
    } else {
      this.drawSub(tint.canvas, 0, 0, img.width, img.height, x, y, opts);
    }
  }

  // ---------------------------------------------------------------- shapes
  rect(x, y, w, h, color, screen = false) {
    const c = this.ctx;
    c.fillStyle = color;
    c.fillRect(
      Math.round(x - (screen ? 0 : this.ox)),
      Math.round(y - (screen ? 0 : this.oy)),
      Math.round(w), Math.round(h),
    );
  }

  rectOutline(x, y, w, h, color, screen = false) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.strokeRect(
      Math.round(x - (screen ? 0 : this.ox)) + 0.5,
      Math.round(y - (screen ? 0 : this.oy)) + 0.5,
      Math.round(w) - 1, Math.round(h) - 1,
    );
  }

  line(x0, y0, x1, y1, color, width = 1, screen = false) {
    const c = this.ctx;
    const o = screen ? { x: 0, y: 0 } : { x: this.ox, y: this.oy };
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(Math.round(x0 - o.x) + 0.5, Math.round(y0 - o.y) + 0.5);
    c.lineTo(Math.round(x1 - o.x) + 0.5, Math.round(y1 - o.y) + 0.5);
    c.stroke();
  }

  circle(x, y, r, color, screen = false) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.arc(Math.round(x - (screen ? 0 : this.ox)), Math.round(y - (screen ? 0 : this.oy)), r, 0, Math.PI * 2);
    c.fill();
  }

  ring(x, y, r, color, width = 1, screen = false) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.arc(Math.round(x - (screen ? 0 : this.ox)), Math.round(y - (screen ? 0 : this.oy)), Math.max(0.5, r), 0, Math.PI * 2);
    c.stroke();
  }

  // ------------------------------------------------------------------ text
  textWidth(str, scale = 1) {
    return str.length * CW * scale;
  }

  /** Draw bitmap text. Screen coords by default. */
  text(str, x, y, opts = {}) {
    const color = opts.color || '#e8f6ff';
    const scale = opts.scale || 1;
    const s = String(str).toUpperCase();
    if (opts.align === 'center') x -= this.textWidth(s, scale) / 2;
    else if (opts.align === 'right') x -= this.textWidth(s, scale);
    if (opts.shadow !== false) {
      this._textPass(s, x + scale, y + scale, opts.shadowColor || 'rgba(6,6,16,0.85)', scale, opts);
    }
    this._textPass(s, x, y, color, scale, opts);
    return this.textWidth(s, scale);
  }

  _textPass(s, x, y, color, scale, opts) {
    const key = `font|${color}`;
    let tint = this._tinted.get(key);
    const img = this.assets.get('font');
    if (!img) return;
    if (!tint) {
      tint = makeLayer(img.width, img.height);
      tint.ctx.drawImage(img, 0, 0);
      tint.ctx.globalCompositeOperation = 'source-in';
      tint.ctx.fillStyle = color;
      tint.ctx.fillRect(0, 0, img.width, img.height);
      this._tinted.set(key, tint);
    }
    const c = this.ctx;
    c.save();
    if (opts.alpha !== undefined) c.globalAlpha = opts.alpha;
    const ox = opts.world ? this.ox : 0;
    const oy = opts.world ? this.oy : 0;
    for (let i = 0; i < s.length; i++) {
      const idx = FONT_ORDER.indexOf(s[i]);
      if (idx < 0) continue;
      c.drawImage(
        tint.canvas,
        (idx % FONT_COLS) * CW, Math.floor(idx / FONT_COLS) * CH, CW, CH,
        Math.round(x - ox + i * CW * scale), Math.round(y - oy), CW * scale, CH * scale,
      );
    }
    c.restore();
  }

  /** Word-wrap helper: returns an array of lines fitting `maxChars`. */
  static wrap(str, maxChars) {
    const words = String(str).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (!cur.length) cur = w;
      else if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur.length) lines.push(cur);
    return lines;
  }
}

function makeLayer(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

export function withAlpha(color, a) {
  if (color.startsWith('#')) {
    const h = color.slice(1);
    const n = h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
  }
  return color;
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
