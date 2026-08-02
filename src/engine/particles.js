// Pooled particle system. Particles are simple squares/circles with optional
// gravity, drag, glow and a target-seeking mode used by telekinesis wisps.

const MAX = 900;

export class Particles {
  constructor() {
    this.pool = [];
    for (let i = 0; i < MAX; i++) this.pool.push(blank());
    this.count = 0;
  }

  clear() {
    this.count = 0;
  }

  spawn(opts) {
    if (this.count >= MAX) return null;
    const p = this.pool[this.count++];
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0;
    p.life = p.maxLife = opts.life || 0.5;
    p.size = opts.size || 2;
    p.endSize = opts.endSize === undefined ? 0 : opts.endSize;
    p.color = opts.color || '#8ef7ff';
    p.gravity = opts.gravity || 0;
    p.drag = opts.drag === undefined ? 0.9 : opts.drag;
    p.glow = opts.glow || 0;
    p.additive = !!opts.additive;
    p.round = !!opts.round;
    p.target = opts.target || null;
    p.seek = opts.seek || 0;
    p.spin = opts.spin || 0;
    return p;
  }

  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.angle === undefined
        ? Math.random() * Math.PI * 2
        : opts.angle + (Math.random() - 0.5) * (opts.spread || 0.6);
      const sp = (opts.speed || 40) * (0.4 + Math.random() * 0.8);
      this.spawn({
        ...opts,
        x: x + (Math.random() - 0.5) * (opts.jitter || 0),
        y: y + (Math.random() - 0.5) * (opts.jitter || 0),
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp + (opts.vy || 0),
        life: (opts.life || 0.5) * (0.6 + Math.random() * 0.8),
        size: (opts.size || 2) * (0.7 + Math.random() * 0.6),
      });
    }
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool[i] = this.pool[this.count - 1];
        this.pool[this.count - 1] = p;
        this.count--;
        i--;
        continue;
      }
      if (p.target && p.seek) {
        const dx = p.target.x - p.x;
        const dy = p.target.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * p.seek * dt;
        p.vy += (dy / d) * p.seek * dt;
      }
      p.vy += p.gravity * dt;
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(r) {
    const ctx = r.ctx;
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      const t = p.life / p.maxLife;
      const size = Math.max(0.6, p.endSize + (p.size - p.endSize) * t);
      const x = Math.round(p.x - r.ox);
      const y = Math.round(p.y - r.oy);
      if (x < -8 || y < -8 || x > 488 || y > 278) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.6);
      if (p.additive) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
      ctx.restore();
      if (p.glow) r.addGlow(p.x, p.y, p.glow * (0.4 + t), p.color, 0.35 * t);
    }
  }
}

function blank() {
  return {
    x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, endSize: 0,
    color: '#fff', gravity: 0, drag: 0.9, glow: 0, additive: false,
    round: false, target: null, seek: 0, spin: 0,
  };
}
