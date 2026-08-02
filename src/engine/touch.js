// On-screen controls for touch devices.
//
// Buttons live in view coordinates (480x270) so they scale with the canvas.
// Every touch is tracked by its identifier: one finger can hold a button while
// another drags to aim, which is the whole point of a twin-stick-ish layout.

import { VIEW_W, VIEW_H } from './render.js';

/** Is this a touch device? Overridable with ?touch=1 / ?touch=0 for testing. */
export function detectTouch() {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '1' || q === 'true') return true;
    if (q === '0' || q === 'false') return false;
  } catch (e) { /* no location in some embeddings */ }
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const points = navigator.maxTouchPoints || 0;
  return coarse && points > 0;
}

const PLAY_BUTTONS = [
  { a: 'left', x: 10, y: 212, w: 46, h: 46, glyph: 'left' },
  { a: 'right', x: 62, y: 212, w: 46, h: 46, glyph: 'right' },
  { a: 'jump', x: 418, y: 208, w: 50, h: 50, glyph: 'jump', accent: '#8ef7ff' },
  { a: 'grab', x: 360, y: 212, w: 46, h: 46, glyph: 'grab', accent: '#8ef7ff' },
  { a: 'throw', x: 404, y: 154, w: 44, h: 44, glyph: 'throw', accent: '#ff9257' },
  { a: 'stasis', x: 450, y: 56, w: 26, h: 26, glyph: 'icon', icon: 3, power: 3 },
  { a: 'dash', x: 450, y: 86, w: 26, h: 26, glyph: 'icon', icon: 4, power: 4 },
  { a: 'shock', x: 450, y: 116, w: 26, h: 26, glyph: 'icon', icon: 6, power: 6 },
  { a: 'build', x: 372, y: 154, w: 26, h: 26, glyph: 'icon', icon: 7, power: 7 },
  { a: 'pause', x: VIEW_W - 24, y: 4, w: 20, h: 20, glyph: 'pause', small: true },
];

const MENU_BUTTONS = [
  { a: 'up', x: 20, y: 150, w: 46, h: 46, glyph: 'up' },
  { a: 'down', x: 20, y: 204, w: 46, h: 46, glyph: 'down' },
  { a: 'confirm', x: 400, y: 204, w: 60, h: 46, glyph: 'ok', accent: '#8ef7ff' },
  { a: 'back', x: 400, y: 150, w: 60, h: 46, glyph: 'back', small: true },
];

export class TouchControls {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.input = input;
    this.enabled = detectTouch();
    this.layout = 'play';
    this.active = new Map();     // touch identifier -> button action or 'aim'
    this.held = new Set();
    this.aim = null;             // { x, y } in view coords, persists after release
    this.pressFx = new Map();    // action -> flash timer
    this.portrait = false;
    this._bind();
  }

  buttons(game) {
    const list = this.layout === 'menu' ? MENU_BUTTONS : PLAY_BUTTONS;
    if (this.layout === 'menu' || !game) return list;
    // Only show power buttons the player has actually unlocked.
    return list.filter((b) => b.power === undefined || game.save.powers[b.power]);
  }

  _viewPos(touch) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - r.left) * (VIEW_W / r.width),
      y: (touch.clientY - r.top) * (VIEW_H / r.height),
    };
  }

  _hit(list, p) {
    // Generous hit boxes: fingers are wide and the buttons are small.
    const pad = 5;
    for (const b of list) {
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad &&
          p.y >= b.y - pad && p.y <= b.y + b.h + pad) return b;
    }
    return null;
  }

  _bind() {
    const opts = { passive: false };
    const start = (e) => {
      if (!this.enabled) {
        // A real touch proves it: switch the controls on and keep going.
        this.enabled = true;
        document.documentElement.dataset.touch = '1';
      }
      e.preventDefault();
      for (const t of e.changedTouches) this._begin(t);
    };
    const move = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) this._move(t);
    };
    const end = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) this._end(t);
    };
    this.canvas.addEventListener('touchstart', start, opts);
    this.canvas.addEventListener('touchmove', move, opts);
    this.canvas.addEventListener('touchend', end, opts);
    this.canvas.addEventListener('touchcancel', end, opts);
  }

  _begin(t) {
    const p = this._viewPos(t);
    const b = this._hit(this.buttons(this.game), p);
    if (b) {
      this.active.set(t.identifier, b.a);
      this._set(b.a, true);
      this.pressFx.set(b.a, 1);
    } else {
      this.active.set(t.identifier, 'aim');
      this.aim = p;
    }
  }

  _move(t) {
    const what = this.active.get(t.identifier);
    if (what === undefined) return;
    const p = this._viewPos(t);
    if (what === 'aim') {
      this.aim = p;
      return;
    }
    // Sliding off a d-pad button should hand over to its neighbour, so a thumb
    // can roll between left and right without lifting.
    const b = this._hit(this.buttons(this.game), p);
    if (b && b.a !== what) {
      this._set(what, false);
      this.active.set(t.identifier, b.a);
      this._set(b.a, true);
      this.pressFx.set(b.a, 1);
    } else if (!b) {
      this._set(what, false);
      this.active.set(t.identifier, 'none');
    }
  }

  _end(t) {
    const what = this.active.get(t.identifier);
    if (what && what !== 'aim' && what !== 'none') this._set(what, false);
    this.active.delete(t.identifier);
  }

  _set(action, on) {
    if (on) {
      this.held.add(action);
      this.input.setVirtual(action, true);
    } else {
      this.held.delete(action);
      this.input.setVirtual(action, false);
    }
  }

  /** Release everything - used when the scene changes under the player's thumb. */
  releaseAll() {
    for (const a of [...this.held]) this._set(a, false);
    this.active.clear();
  }

  update(dt, game) {
    this.game = game;
    if (!this.enabled) return;
    const layout = (game.scene === 'play') ? 'play' : 'menu';
    if (layout !== this.layout) {
      this.releaseAll();
      this.layout = layout;
    }
    for (const [k, v] of this.pressFx) {
      const n = v - dt * 4;
      if (n <= 0) this.pressFx.delete(k); else this.pressFx.set(k, n);
    }
    // Feed the aim point to telekinesis exactly like a mouse would.
    if (this.aim && layout === 'play') {
      this.input.mouse.x = this.aim.x;
      this.input.mouse.y = this.aim.y;
      this.input.mouse.inside = true;
      this.input.usedMouseAim = true;
    }
    this.portrait = innerHeight > innerWidth;
  }

  // ------------------------------------------------------------------ draw
  draw(r, game) {
    if (!this.enabled) return;
    const list = this.buttons(game);
    for (const b of list) {
      const down = this.held.has(b.a);
      const fx = this.pressFx.get(b.a) || 0;
      const accent = b.accent || '#a8c8d8';
      const alpha = b.small ? 0.3 : 0.42;
      const fill = down ? `rgba(142,247,255,${0.3 + fx * 0.2})` : `rgba(10,14,30,${alpha})`;
      const edge = down ? 'rgba(220,250,255,0.95)' : `rgba(168,200,216,${b.small ? 0.4 : 0.6})`;
      roundRect(r, b.x, b.y, b.w, b.h, fill, edge);
      this._glyph(r, b, accent, down);
    }

    if (this.aim && game.scene === 'play') {
      r.ring(this.aim.x, this.aim.y, 9, 'rgba(142,247,255,0.28)', 1, true);
    }

    if (this.portrait) {
      const w = 210, h = 34;
      const x = (VIEW_W - w) / 2, y = VIEW_H / 2 - h / 2;
      r.rect(x, y, w, h, 'rgba(6,8,20,0.85)', true);
      r.rectOutline(x, y, w, h, 'rgba(142,247,255,0.5)', true);
      r.text('ROTATE YOUR DEVICE', VIEW_W / 2, y + 8, { color: '#8ef7ff', align: 'center' });
      r.text('TELEPATH PLAYS IN LANDSCAPE', VIEW_W / 2, y + 20, { color: '#5d7f95', align: 'center' });
    }
  }

  _glyph(r, b, accent, down) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const col = down ? '#ffffff' : accent;
    switch (b.glyph) {
      case 'left': case 'right': case 'up': case 'down': {
        const vert = b.glyph === 'up' || b.glyph === 'down';
        const s = (b.glyph === 'left' || b.glyph === 'up') ? -1 : 1;
        for (let i = 0; i < 7; i++) {
          // i = 0 is the tip; it sits furthest along the direction of travel
          if (vert) r.rect(cx - i, cy + s * (3 - i), i * 2 + 1, 1, col, true);
          else r.rect(cx + s * (3 - i), cy - i, 1, i * 2 + 1, col, true);
        }
        break;
      }
      case 'jump':
        for (let i = 0; i < 7; i++) r.rect(cx - i, cy - 6 + i, i * 2 + 1, 1, col, true);
        r.rect(cx - 2, cy + 1, 5, 6, col, true);
        break;
      case 'grab':
        r.ring(cx, cy, 8, col, 1, true);
        r.ring(cx, cy, 3, col, 1, true);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          r.line(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9,
            cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, col, 1, true);
        }
        break;
      case 'throw':
        r.line(cx - 8, cy + 5, cx + 7, cy - 6, col, 2, true);
        r.line(cx + 7, cy - 6, cx + 1, cy - 6, col, 1, true);
        r.line(cx + 7, cy - 6, cx + 7, cy, col, 1, true);
        break;
      case 'icon':
        r.sprite('power_icons', b.icon, cx - 8, cy - 8, { screen: true, alpha: down ? 1 : 0.85 });
        break;
      case 'pause':
        r.rect(cx - 4, cy - 5, 3, 10, col, true);
        r.rect(cx + 1, cy - 5, 3, 10, col, true);
        break;
      case 'ok':
        r.text('OK', cx, cy - 4, { color: col, align: 'center' });
        break;
      case 'back':
        r.text('BACK', cx, cy - 4, { color: col, align: 'center' });
        break;
      default:
        break;
    }
  }
}

function roundRect(r, x, y, w, h, fill, edge) {
  // Chamfered corners: cheap, and reads as a button at this resolution.
  r.rect(x + 2, y, w - 4, h, fill, true);
  r.rect(x, y + 2, w, h - 4, fill, true);
  r.rect(x + 2, y, w - 4, 1, edge, true);
  r.rect(x + 2, y + h - 1, w - 4, 1, edge, true);
  r.rect(x, y + 2, 1, h - 4, edge, true);
  r.rect(x + w - 1, y + 2, 1, h - 4, edge, true);
  r.rect(x + 1, y + 1, 1, 1, edge, true);
  r.rect(x + w - 2, y + 1, 1, 1, edge, true);
  r.rect(x + 1, y + h - 2, 1, 1, edge, true);
  r.rect(x + w - 2, y + h - 2, 1, 1, edge, true);
}
