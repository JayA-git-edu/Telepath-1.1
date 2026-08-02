// Keyboard + mouse + gamepad input, exposed as named actions with edge detection.

export const ACTIONS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  grab: ['KeyJ', 'Mouse0'],
  throw: ['KeyK', 'Mouse2'],
  stasis: ['KeyQ', 'Mouse1'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyL'],
  shock: ['KeyE'],
  build: ['KeyF'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'Space', 'KeyJ', 'Mouse0'],
  back: ['Escape', 'Backspace'],
  restart: ['KeyR'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();   // went down this frame
    this.released = new Set();
    this.mouse = { x: 0, y: 0, inside: false };
    this.usedMouseAim = false;
    this.anyPressed = false;
    this.scale = 1;
    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
      this._press(e.code);
    });
    addEventListener('keyup', (e) => this._release(e.code));
    addEventListener('blur', () => {
      for (const k of [...this.down]) this._release(k);
    });

    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      e.preventDefault();
      c.focus();
      this._press('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => this._release('Mouse' + e.button));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousemove', (e) => {
      const r = c.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (c.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (c.height / r.height);
      this.mouse.inside = true;
      this.usedMouseAim = true;
    });
    c.addEventListener('mouseleave', () => { this.mouse.inside = false; });

    // Touch: treat as mouse aim + tap-to-grab, so the game is at least reachable
    // on a tablet even though it is designed for keyboard + mouse.
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._touch(e);
      this._press('Mouse0');
    }, { passive: false });
    c.addEventListener('touchmove', (e) => { e.preventDefault(); this._touch(e); }, { passive: false });
    c.addEventListener('touchend', (e) => { e.preventDefault(); this._release('Mouse0'); }, { passive: false });
  }

  _touch(e) {
    const t = e.changedTouches[0];
    if (!t) return;
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = (t.clientX - r.left) * (this.canvas.width / r.width);
    this.mouse.y = (t.clientY - r.top) * (this.canvas.height / r.height);
    this.mouse.inside = true;
    this.usedMouseAim = true;
  }

  _press(code) {
    if (!this.down.has(code)) {
      this.down.add(code);
      this.pressed.add(code);
      this.anyPressed = true;
    }
  }

  _release(code) {
    this.down.delete(code);
    this.released.add(code);
  }

  /** Call once per frame, after game logic. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.anyPressed = false;
  }

  _pollPad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Merge gamepad state into the keyboard sets. Called at the top of a frame. */
  pollGamepad() {
    const p = this._pollPad();
    this.pad = p;
    if (!p) return;
    const b = (i) => p.buttons[i] && p.buttons[i].pressed;
    const ax = (i) => (Math.abs(p.axes[i] || 0) > 0.3 ? p.axes[i] : 0);
    const map = [
      ['PadLeft', b(14) || ax(0) < 0],
      ['PadRight', b(15) || ax(0) > 0],
      ['PadUp', b(12) || ax(1) < 0],
      ['PadDown', b(13) || ax(1) > 0],
      ['PadJump', b(0)],
      ['PadGrab', b(7) || b(2)],
      ['PadThrow', b(5) || b(1)],
      ['PadStasis', b(3)],
      ['PadDash', b(6) || b(4)],
      ['PadShock', b(10) || b(11)],
      ['PadPause', b(9)],
    ];
    for (const [name, on] of map) {
      if (on) this._press(name);
      else if (this.down.has(name)) this._release(name);
    }
    // Right stick aims.
    const rx = ax(2), ry = ax(3);
    if (rx || ry) {
      this.padAim = { x: rx, y: ry };
      this.usedMouseAim = false;
    } else if (this.padAim && !rx && !ry) {
      this.padAim = null;
    }
  }

  _codes(action) {
    const extra = {
      left: ['PadLeft'], right: ['PadRight'], up: ['PadUp'], down: ['PadDown'],
      jump: ['PadJump'], grab: ['PadGrab'], throw: ['PadThrow'], stasis: ['PadStasis'],
      dash: ['PadDash'], shock: ['PadShock'], pause: ['PadPause'],
      confirm: ['PadJump', 'PadGrab'], back: ['PadPause'], build: ['PadStasis'],
    }[action] || [];
    return (ACTIONS[action] || []).concat(extra);
  }

  held(action) {
    return this._codes(action).some((c) => this.down.has(c));
  }

  hit(action) {
    return this._codes(action).some((c) => this.pressed.has(c));
  }

  letGo(action) {
    return this._codes(action).some((c) => this.released.has(c)) && !this.held(action);
  }

  axisX() {
    return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
  }
}
