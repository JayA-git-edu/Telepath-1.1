// Enemies and their projectiles. Everything here can be pushed, pulled,
// frozen and killed by thrown objects - no weapons required.

import { Actor, TILE, approach, clamp, rectsOverlap } from './physics.js';
import { Prop, GRAV } from './entities.js';
import { T_SPIKE, T_VOID } from './level.js';

export class Enemy extends Actor {
  constructor(x, y, w, h) {
    super(x, y, w, h);
    this.isEnemy = true;
    this.kind = 'enemy';
    this.hp = 2;
    this.maxHp = 2;
    this.touchDamage = 1;
    this.pullable = true;
    this.pushable = true;
    this.frozen = 0;
    this.stagger = 0;
    this.hitFlash = 0;
    this.animT = 0;
    this.facing = -1;
    this.spawnX = x;
    this.spawnY = y;
    this.thrown = false;
    this.gravity = GRAV;
    this.deathTimer = 0;
  }

  reset() {
    this.place(this.spawnX, this.spawnY);
    this.vx = this.vy = 0;
    this.hp = this.maxHp;
    this.dead = false;
    this.frozen = 0;
    this.stagger = 0;
    this.deathTimer = 0;
  }

  damage(game, amount, dir) {
    if (this.dead || this.hp <= 0) return;
    this.hp -= amount;
    this.hitFlash = 0.3;
    this.stagger = Math.max(this.stagger, 0.35);
    game.particles.burst(this.cx, this.cy, 8, {
      color: '#ffd0d0', speed: 90, life: 0.4, size: 2, additive: true, glow: 5,
    });
    if (this.hp <= 0) {
      this.die(game);
    } else {
      game.audio.play('hitEnemy');
      game.renderer.shake(0.1);
    }
  }

  die(game) {
    this.dead = true;
    game.audio.play('enemyDie');
    game.renderer.shake(0.2);
    game.particles.burst(this.cx, this.cy, 22, {
      color: '#ff9257', speed: 140, life: 0.6, size: 3, additive: true, glow: 7,
    });
    game.particles.burst(this.cx, this.cy, 12, {
      color: '#7a8299', speed: 100, life: 0.7, size: 2, gravity: 380,
    });
    game.onEnemyKilled(this);
  }

  /** Shared per-frame housekeeping: stasis, knockback, prop hits, contact damage. */
  common(dt, game) {
    this.animT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    if (this.frozen > 0) {
      this.frozen -= dt;
      return false;
    }
    this.stagger = Math.max(0, this.stagger - dt);

    // Traps work on enemies exactly like they work on Eli - that is the whole
    // point of shoving them around.
    this.trapT = Math.max(0, (this.trapT || 0) - dt);
    if (!this.ignoreSolids) {
      if (game.level.tileTypeIn(this.rect, T_SPIKE) && this.trapT <= 0) {
        this.trapT = 0.45;
        this.damage(game, 2, -Math.sign(this.vx) || 1);
        if (this.dead) return false;
      }
      if (game.level.tileTypeIn(this.rect, T_VOID) || this.y > game.level.h + 40) {
        this.hp = 0;
        this.die(game);
        return false;
      }
    }

    // Thrown objects hurt enemies.
    for (const e of game.entities) {
      if (e.dead || e.heldBy || !e.thrown) continue;
      const speed = Math.hypot(e.vx, e.vy);
      if (speed > 150 && rectsOverlap(this.rect, e.rect)) {
        this.damage(game, e.impactDamage(), Math.sign(e.vx) || 1);
        e.vx *= -0.35; e.vy *= -0.35;
        e.thrown = false;
        break;
      }
    }
    if (this.dead) return false;

    // Contact damage.
    const p = game.player;
    if (!p.dying && rectsOverlap(this.rect, p.rect)) {
      p.hurt(game, this.touchDamage, Math.sign(p.cx - this.cx) || 1);
    }
    return this.stagger <= 0;
  }

  /** Knockback physics used while staggered/thrown. */
  drift(dt, game, gravity = true) {
    if (gravity) this.vy = Math.min(this.vy + this.gravity * dt, 420);
    this.moveX(game.level, this.vx * dt, () => { this.vx = -this.vx * 0.3; });
    this.moveY(game.level, this.vy * dt, () => {
      if (this.vy > 0) this.onGround = true;
      this.vy = 0;
    });
    this.vx = approach(this.vx, 0, 420 * dt);
  }

  drawBody(r, sheet, frameRate, time) {
    const flip = this.facing > 0;
    const x = this.cx - r.assets.sheet[sheet].fw / 2;
    const y = this.y + this.h - r.assets.sheet[sheet].fh;
    r.sprite(sheet, this.animT * frameRate, x, y, { flip });
    if (this.hitFlash > 0) {
      r.spriteTinted(sheet, this.animT * frameRate, x, y, `rgba(255,255,255,${this.hitFlash * 2})`, { flip });
    }
    if (this.frozen > 0) {
      r.rectOutline(this.x - 1, this.y - 1, this.w + 2, this.h + 2, 'rgba(154,141,255,0.7)');
      r.addGlow(this.cx, this.cy, this.w, '#9a8dff', 0.35);
    }
    // Health pips for tougher enemies.
    if (this.maxHp > 2 && this.hp < this.maxHp) {
      for (let i = 0; i < this.maxHp; i++) {
        r.rect(this.x + i * 4, this.y - 5, 3, 2, i < this.hp ? '#ff5c7a' : '#3a3550');
      }
    }
  }
}

// ------------------------------------------------------------------- drone
export class Drone extends Enemy {
  constructor(x, y, opts = {}) {
    super(x, y - 4, 18, 14);
    this.hp = this.maxHp = 2;
    this.gravity = 0;
    this.homeX = this.cx;
    this.homeY = this.cy;
    this.range = opts.range || 70;
    this.speed = opts.speed || 46;
    this.t = Math.random() * 6;
    this.aggro = false;
  }

  update(dt, game) {
    if (!this.common(dt, game)) { this.drift(dt, game, false); return; }
    this.t += dt;
    const p = game.player;
    const d = Math.hypot(p.cx - this.cx, p.cy - this.cy);
    this.aggro = d < 110 && !game.level.raycast(this.cx, this.cy, p.cx, p.cy);
    let tx, ty;
    if (this.aggro) {
      tx = p.cx;
      ty = p.cy - 12;
    } else {
      tx = this.homeX + Math.sin(this.t * 0.7) * this.range;
      ty = this.homeY + Math.sin(this.t * 1.3) * 8;
    }
    const dx = tx - this.cx, dy = ty - this.cy;
    const dd = Math.hypot(dx, dy) || 1;
    const sp = this.aggro ? this.speed * 1.5 : this.speed;
    this.vx = approach(this.vx, (dx / dd) * sp, 260 * dt);
    this.vy = approach(this.vy, (dy / dd) * sp, 260 * dt);
    this.facing = this.vx >= 0 ? 1 : -1;
    this.moveX(game.level, this.vx * dt, () => { this.vx = -this.vx * 0.5; });
    this.moveY(game.level, this.vy * dt, () => { this.vy = -this.vy * 0.5; });
  }

  draw(r, time) {
    this.drawBody(r, 'drone', 8, time);
    r.addGlow(this.cx + this.facing * 3, this.cy, 12, this.aggro ? '#ff5c5c' : '#ff9257', 0.35);
    r.addLight(this.cx, this.cy, 46, 0.4);
  }
}

// ------------------------------------------------------------------- guard
export class Guard extends Enemy {
  constructor(x, y, opts = {}) {
    super(x, y - 12, 14, 28);
    this.hp = this.maxHp = 3;
    this.speed = opts.speed || 34;
    this.dir = opts.dir || -1;
    this.shootT = 1.4;
    this.alert = 0;
  }

  update(dt, game) {
    if (!this.common(dt, game)) { this.drift(dt, game); return; }
    const p = game.player;
    this.groundCheck(game.level);
    const seePlayer = Math.abs(p.cy - this.cy) < 34 &&
      Math.abs(p.cx - this.cx) < 130 &&
      Math.sign(p.cx - this.cx) === this.dir &&
      !game.level.raycast(this.cx, this.cy, p.cx, p.cy);
    this.alert = seePlayer ? 1 : Math.max(0, this.alert - dt);

    if (this.alert > 0) {
      this.vx = approach(this.vx, 0, 400 * dt);
      this.shootT -= dt;
      if (this.shootT <= 0) {
        this.shootT = 1.5;
        const dir = Math.sign(p.cx - this.cx) || this.dir;
        this.dir = dir;
        game.spawnProjectile(this.cx + dir * 10, this.cy - 4, dir * 150, 0, {
          sprite: 'proj_energy', damage: 1, owner: this,
        });
        game.audio.play('shoot');
      }
    } else {
      this.vx = this.speed * this.dir;
      // Turn at walls and ledges.
      const ahead = { x: this.x + (this.dir > 0 ? this.w : -3), y: this.y, w: 3, h: this.h };
      const ledge = { x: this.x + (this.dir > 0 ? this.w : -3), y: this.y + this.h + 1, w: 3, h: 3 };
      if (game.level.solidRect(ahead) || (!game.level.solidRect(ledge) && this.onGround)) {
        this.dir *= -1;
      }
    }
    this.facing = this.dir;
    this.vy = Math.min(this.vy + this.gravity * dt, 420);
    this.moveX(game.level, this.vx * dt, () => { this.dir *= -1; });
    this.moveY(game.level, this.vy * dt, () => { this.vy = 0; });
  }

  draw(r, time) {
    this.drawBody(r, 'guard', this.alert > 0 ? 3 : 6, time);
    if (this.alert > 0) {
      r.text('!', this.cx - 3, this.y - 12, { color: '#ff5c5c', world: true });
      r.addGlow(this.cx, this.cy, 20, '#ff5c5c', 0.25);
    }
  }
}

// ------------------------------------------------------------------ spider
export class Spider extends Enemy {
  constructor(x, y, opts = {}) {
    super(x, y - 4, 22, 16);
    this.hp = this.maxHp = 3;
    this.dir = opts.dir || -1;
    this.speed = 62;
    this.leapT = 1.6;
  }

  update(dt, game) {
    if (!this.common(dt, game)) { this.drift(dt, game); return; }
    const p = game.player;
    this.groundCheck(game.level);
    const dist = Math.hypot(p.cx - this.cx, p.cy - this.cy);
    if (dist < 120 && this.onGround) {
      this.dir = Math.sign(p.cx - this.cx) || this.dir;
      this.leapT -= dt;
      if (this.leapT <= 0 && dist < 90) {
        this.leapT = 1.8;
        this.vy = -230;
        this.vx = this.dir * 130;
      } else {
        this.vx = approach(this.vx, this.dir * this.speed, 500 * dt);
      }
    } else if (this.onGround) {
      this.vx = this.dir * this.speed * 0.6;
      const ahead = { x: this.x + (this.dir > 0 ? this.w : -3), y: this.y, w: 3, h: this.h };
      const ledge = { x: this.x + (this.dir > 0 ? this.w : -3), y: this.y + this.h + 1, w: 3, h: 3 };
      if (game.level.solidRect(ahead) || !game.level.solidRect(ledge)) this.dir *= -1;
    }
    this.facing = this.dir;
    this.vy = Math.min(this.vy + this.gravity * dt, 460);
    this.moveX(game.level, this.vx * dt, () => { this.dir *= -1; this.vx = 0; });
    this.moveY(game.level, this.vy * dt, () => { this.vy = 0; });
  }

  draw(r, time) {
    this.drawBody(r, 'spider', 9, time);
    r.addGlow(this.cx, this.cy - 4, 14, '#6bffd5', 0.3);
  }
}

// ------------------------------------------------------------------ wraith
export class Wraith extends Enemy {
  constructor(x, y, opts = {}) {
    super(x, y - 12, 16, 26);
    this.hp = this.maxHp = 3;
    this.gravity = 0;
    this.ignoreSolids = true;
    this.speed = opts.speed || 34;
    this.t = Math.random() * 6;
  }

  update(dt, game) {
    if (!this.common(dt, game)) { this.drift(dt, game, false); return; }
    this.t += dt;
    const p = game.player;
    const dx = p.cx - this.cx, dy = (p.cy - 6) - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    this.vx = approach(this.vx, (dx / d) * this.speed, 120 * dt);
    this.vy = approach(this.vy, (dy / d) * this.speed + Math.sin(this.t * 2) * 12, 120 * dt);
    this.facing = this.vx >= 0 ? 1 : -1;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (Math.random() < 0.3) {
      game.particles.spawn({
        x: this.cx + (Math.random() - 0.5) * 10, y: this.cy + 8 + Math.random() * 8,
        vx: 0, vy: 16, life: 0.5, size: 2, color: '#ff5cf0', additive: true, glow: 4, drag: 0.92,
      });
    }
  }

  draw(r, time) {
    this.drawBody(r, 'wraith', 7, time);
    r.addGlow(this.cx, this.cy - 6, 22, '#ff5cf0', 0.4);
    r.addLight(this.cx, this.cy, 40, 0.35);
  }
}

// ------------------------------------------------------------------ turret
export class Turret extends Enemy {
  constructor(x, y, opts = {}) {
    super(x, y, 16, 16);
    this.hp = this.maxHp = 3;
    this.pullable = false;
    this.pushable = false;
    this.gravity = 0;
    this.dir = opts.dir === undefined ? -1 : opts.dir;
    this.vertical = !!opts.vertical;
    this.interval = opts.interval || 1.8;
    this.t = opts.phase || 0;
    this.touchDamage = 1;
  }

  update(dt, game) {
    if (!this.common(dt, game)) return;
    this.t += dt;
    if (this.t >= this.interval) {
      this.t = 0;
      const vx = this.vertical ? 0 : this.dir * 130;
      const vy = this.vertical ? this.dir * 130 : 0;
      game.spawnProjectile(this.cx + Math.sign(vx) * 9, this.cy + Math.sign(vy) * 9, vx, vy, {
        sprite: 'proj_energy', damage: 1, owner: this,
      });
      game.audio.play('shoot');
    }
  }

  draw(r, time) {
    const charge = clamp(this.t / this.interval, 0, 1);
    const frame = Math.floor(charge * 3.99);
    const flip = this.dir > 0 && !this.vertical;
    r.sprite('turret', frame, this.x, this.y, { flip, rot: this.vertical ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : 0 });
    if (this.hitFlash > 0) {
      r.spriteTinted('turret', frame, this.x, this.y, `rgba(255,255,255,${this.hitFlash * 2})`, { flip });
    }
    r.addGlow(this.cx, this.cy, 10 + charge * 8, '#ff5c5c', 0.25 + charge * 0.2);
  }
}

// -------------------------------------------------------------- projectile
export class Projectile extends Prop {
  constructor(x, y, vx, vy, opts = {}) {
    super(x - 4, y - 4, 8, 8);
    this.kind = 'projectile';
    this.vx = vx; this.vy = vy;
    this.gravity = opts.gravity || 0;
    this.damage = opts.damage || 1;
    this.sprite = opts.sprite || 'proj_energy';
    this.owner = opts.owner || null;
    this.grabbable = true;
    this.life = opts.life || 4;
    this.solid = false;
    this.deflected = false;
    this.trailColor = opts.trailColor || (this.sprite === 'proj_void' ? '#ff5cf0' : '#ff8a6b');
  }

  onFellOut() { this.dead = true; }

  update(dt, game) {
    // A frozen shot is a solid ledge - that is the trick Stasis teaches.
    this.solid = this.frozen > 0;
    if (this.frozen > 0) {
      this.frozen -= dt;
      return;
    }
    if (this.heldBy) return;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy += this.gravity * dt;
    let hit = false;
    this.moveX(game.level, this.vx * dt, () => { hit = true; });
    this.moveY(game.level, this.vy * dt, () => { hit = true; });
    if (hit) {
      this.burst(game);
      return;
    }
    if (Math.random() < 0.6) {
      game.particles.spawn({
        x: this.cx, y: this.cy, vx: 0, vy: 0, life: 0.25, size: 2,
        color: this.trailColor, additive: true, glow: 4, drag: 0.85,
      });
    }
    const p = game.player;
    if (!p.dying && rectsOverlap(this.rect, p.rect)) {
      p.hurt(game, this.damage, Math.sign(this.vx) || 1);
      this.burst(game);
      return;
    }
    // A redirected shot hurts whatever fired it (and its friends).
    if (this.deflected) {
      for (const e of [...game.enemies, ...game.bosses]) {
        if (e.dead) continue;
        if (rectsOverlap(this.rect, e.rect)) {
          e.damage(game, 2, Math.sign(this.vx) || 1);
          this.burst(game);
          return;
        }
      }
    }
  }

  burst(game) {
    this.dead = true;
    game.particles.burst(this.cx, this.cy, 8, {
      color: this.trailColor, speed: 90, life: 0.3, size: 2, additive: true, glow: 5,
    });
  }

  draw(r, time) {
    r.sprite(this.sprite, time * 12, this.x, this.y, { additive: true });
    r.addGlow(this.cx, this.cy, 12, this.deflected ? '#8ef7ff' : this.trailColor, 0.5);
    if (this.frozen > 0) {
      r.rectOutline(this.x - 2, this.y - 2, this.w + 4, this.h + 4, 'rgba(154,141,255,0.8)');
    }
  }
}

export const ENEMY_CHARS = {
  d: Drone,
  g: Guard,
  s: Spider,
  w: Wraith,
  T: Turret,
};
