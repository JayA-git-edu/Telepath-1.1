// Props, hazards and puzzle devices. Anything the player can grab, ride,
// trigger or break lives here.

import { Actor, Solid, TILE, approach, clamp, lerp, rectsOverlap } from './physics.js';

export const TIER_LIGHT = 1;   // Lift handles it
export const TIER_HEAVY = 2;   // needs Ultimate Telepathy
export const GRAV = 620;

let nextId = 1;

export class Prop extends Actor {
  constructor(x, y, w, h) {
    super(x, y, w, h);
    this.id = nextId++;
    this.kind = 'prop';
    this.grabbable = false;
    this.tier = TIER_LIGHT;
    this.gravity = GRAV;
    this.friction = 0.86;
    this.bounce = 0.25;
    this.heldBy = null;
    this.frozen = 0;            // stasis timer
    this.hitFlash = 0;
    this.spawnX = x;
    this.spawnY = y;
    this.throwDamage = 0;
    this.glowColor = null;
    this.pushable = true;
  }

  reset() {
    this.place(this.spawnX, this.spawnY);
    this.vx = this.vy = 0;
    this.dead = false;
    this.heldBy = null;
    this.frozen = 0;
  }

  /** Physics shared by every loose object. */
  stepPhysics(dt, game) {
    const level = game.level;
    if (this.frozen > 0) {
      this.frozen -= dt;
      if (this.frozen <= 0) this.frozen = 0;
      return;
    }
    if (this.heldBy) return;
    this.vy += this.gravity * dt;
    this.vy = clamp(this.vy, -600, 700);
    const wasFast = Math.abs(this.vx) + Math.abs(this.vy);
    this.moveX(level, this.vx * dt, () => {
      if (Math.abs(this.vx) > 120) this.onImpact(game, Math.abs(this.vx), Math.sign(this.vx), 0);
      this.vx = -this.vx * this.bounce;
      if (Math.abs(this.vx) < 12) this.vx = 0;
    });
    this.moveY(level, this.vy * dt, () => {
      if (this.vy > 160) {
        this.onImpact(game, this.vy, 0, 1);
        game.audio.play('land');
      }
      this.vy = Math.abs(this.vy) > 150 ? -this.vy * this.bounce : 0;
    });
    this.groundCheck(level);
    if (this.onGround) {
      this.vx = approach(this.vx, 0, (1 - this.friction) * 400 * dt * 3);
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    if (wasFast > 200) this.thrown = true;
    else if (this.onGround) this.thrown = false;

    if (this.y > level.h + 80) this.onFellOut(game);
  }

  onFellOut(game) {
    this.reset();
  }

  /** Called when the prop slams into terrain while moving fast. */
  onImpact(game, speed, dx, dy) {
    if (speed < 130) return;
    game.particles.burst(this.cx, this.cy + this.h / 2, 5, {
      color: '#cfd8ff', speed: 50, life: 0.3, size: 2, gravity: 300,
    });
    if (speed > 240) {
      game.punch(0.02, 0.14);
      game.ring(this.cx, this.cy + this.h / 2, { color: '#cfd8ff', r0: 2, r1: 18, life: 0.2, width: 1 });
    }
  }

  /** Damage dealt to entities this object slams into. */
  impactDamage() {
    const speed = Math.hypot(this.vx, this.vy);
    if (speed < 150) return 0;
    return this.throwDamage || (this.tier === TIER_HEAVY ? 3 : 1);
  }

  update(dt, game) {
    this.stepPhysics(dt, game);
  }

  draw(r, time) {}

  drawAura(r, time) {
    if (this.frozen > 0) {
      const a = 0.4 + Math.sin(time * 14) * 0.12;
      r.rectOutline(this.x - 1, this.y - 1, this.w + 2, this.h + 2, `rgba(154,141,255,${a})`);
      r.addGlow(this.cx, this.cy, this.w, '#9a8dff', 0.35);
    }
    if (this.hitFlash > 0) {
      r.addGlow(this.cx, this.cy, this.w * 1.2, '#ffffff', this.hitFlash * 0.5);
    }
  }
}

// ------------------------------------------------------------------ crates
export class Crate extends Prop {
  constructor(x, y, material = 'wood') {
    super(x, y, 16, 16);
    this.kind = 'crate';
    this.material = material;
    this.solid = true;
    this.grabbable = true;
    this.sprite = `crate_${material}`;
    this.hp = material === 'wood' ? 2 : 99;
    this.throwDamage = material === 'metal' ? 2 : 1;
    if (material === 'psy') {
      this.glowColor = '#3fd2c8';
      this.gravity = GRAV * 0.35;
    }
  }

  draw(r, time) {
    r.image(this.sprite, this.x, this.y, { alpha: 1 });
    if (this.glowColor) r.addGlow(this.cx, this.cy, 16, this.glowColor, 0.4);
    this.drawAura(r, time);
  }
}

export class Boulder extends Prop {
  constructor(x, y) {
    super(x, y - 8, 24, 24);
    this.kind = 'boulder';
    this.solid = true;
    this.grabbable = true;
    this.tier = TIER_HEAVY;
    this.throwDamage = 4;
    this.friction = 0.7;
    this.bounce = 0.15;
  }

  draw(r, time) {
    r.image('boulder', this.x, this.y);
    this.drawAura(r, time);
  }
}

export class Orb extends Prop {
  constructor(x, y) {
    super(x + 0, y, 16, 16);
    this.kind = 'orb';
    this.grabbable = true;
    this.gravity = GRAV * 0.15;
    this.bounce = 0.7;
    this.friction = 0.99;
    this.glowColor = '#7ee8ff';
    this.throwDamage = 1;
  }

  draw(r, time) {
    r.sprite('orb', time * 8, this.x, this.y);
    r.addGlow(this.cx, this.cy, 20, '#7ee8ff', 0.5);
    this.drawAura(r, time);
  }
}

// ------------------------------------------------------------- devices
export class Switch extends Prop {
  constructor(x, y, opts = {}) {
    super(x, y, 16, 16);
    this.kind = 'switch';
    this.channel = opts.ch ?? 0;
    this.mode = opts.mode || 'toggle';   // toggle | hold | plate
    this.on = !!opts.on;
    this.gravity = 0;
    this.pushable = false;
    this.holdTimer = 0;
    this.pulseTimer = 0;
  }

  interact(game) {
    if (this.mode === 'plate') return;
    this.on = this.mode === 'hold' ? true : !this.on;
    if (this.mode === 'hold') this.holdTimer = 4;
    this.pulseTimer = 0.4;
    game.audio.play('switch');
    game.setChannel(this.channel, this.on);
    game.particles.burst(this.cx, this.cy, 10, {
      color: this.on ? '#6bff9a' : '#ff6b6b', speed: 60, life: 0.4, size: 2, additive: true, glow: 6,
    });
  }

  update(dt, game) {
    if (this.mode === 'plate') {
      const r = { x: this.x, y: this.y - 4, w: this.w, h: this.h };
      let pressed = false;
      for (const e of game.entities) {
        if (e === this || e.dead || e.heldBy) continue;
        if ((e.kind === 'crate' || e.kind === 'boulder' || e.kind === 'orb') && rectsOverlap(r, e.rect)) pressed = true;
      }
      if (rectsOverlap(r, game.player.rect)) pressed = true;
      if (pressed !== this.on) {
        this.on = pressed;
        this.pulseTimer = 0.4;
        game.audio.play('switch');
        game.setChannel(this.channel, this.on);
      }
    } else if (this.mode === 'hold' && this.on) {
      this.holdTimer -= dt;
      if (this.holdTimer <= 0) {
        this.on = false;
        game.audio.play('switch');
        game.setChannel(this.channel, false);
      }
    }
    this.pulseTimer = Math.max(0, this.pulseTimer - dt);
  }

  draw(r, time) {
    r.image(this.on ? 'switch_on' : 'switch_off', this.x, this.y);
    const col = this.on ? '#6bff9a' : '#ff6b6b';
    r.addGlow(this.cx, this.y + 6, 12 + this.pulseTimer * 20, col, 0.4);
    if (this.mode === 'hold' && this.on) {
      const w = (this.holdTimer / 4) * 14;
      r.rect(this.x + 1, this.y - 3, w, 2, '#6bff9a');
    }
  }
}

export class Lever extends Switch {
  constructor(x, y, opts = {}) {
    super(x, y, opts);
    this.kind = 'lever';
    this.mode = 'toggle';
  }

  draw(r, time) {
    r.image(this.on ? 'lever_on' : 'lever_off', this.x, this.y);
    r.addGlow(this.cx, this.y + 4, 10 + this.pulseTimer * 18, this.on ? '#6bff9a' : '#ff9257', 0.35);
  }
}

export class Door extends Solid {
  constructor(x, y, opts = {}) {
    super(x, y, 16, (opts.h || 2) * TILE);
    this.kind = 'door';
    this.channel = opts.ch ?? 0;
    this.invert = !!opts.invert;
    this.open = 0;
    this.tiles = opts.h || 2;
    this.dead = false;
    this.spawnX = x; this.spawnY = y;
  }

  reset() {
    this.open = 0;
    this.y = this.spawnY;
    this.dead = false;
  }

  update(dt, game) {
    const active = !!game.channels[this.channel] !== this.invert;
    const target = active ? 1 : 0;
    const prev = this.open;
    this.open = approach(this.open, target, dt * 1.6);
    if (prev !== this.open && (prev === 0 || prev === 1)) game.audio.play('door');
    this.collidable = this.open < 0.85;
    this.h = Math.max(1, this.tiles * TILE * (1 - this.open));
    this.y = this.spawnY;
  }

  draw(r, time) {
    for (let i = 0; i < this.tiles; i++) {
      r.sprite('door', Math.min(3, Math.floor(this.open * 3.99)), this.x, this.spawnY + i * TILE - 0, {});
    }
    if (this.open > 0.1) {
      r.addGlow(this.cx, this.spawnY + this.tiles * 8, 20, '#45d6d0', 0.25 * this.open);
    }
  }
}

export class Barrier extends Solid {
  constructor(x, y, opts = {}) {
    super(x, y, 16, (opts.h || 3) * TILE);
    this.kind = 'barrier';
    this.channel = opts.ch ?? 0;
    this.invert = !!opts.invert;
    this.tiles = opts.h || 3;
    this.active = true;
    this.hurts = opts.hurts !== false;
  }

  reset() { this.active = true; this.collidable = true; }

  update(dt, game) {
    const powered = !!game.channels[this.channel] !== this.invert;
    this.active = !powered;
    this.collidable = this.active;
    if (this.active && this.hurts && rectsOverlap(this.rect, game.player.rect)) {
      game.player.hurt(game, 1, Math.sign(game.player.cx - this.cx) || 1);
    }
  }

  draw(r, time) {
    if (!this.active) {
      for (let i = 0; i < this.tiles; i++) {
        r.rect(this.x, this.y + i * TILE, 2, TILE, 'rgba(60,70,100,0.7)');
        r.rect(this.x + 14, this.y + i * TILE, 2, TILE, 'rgba(60,70,100,0.7)');
      }
      return;
    }
    for (let i = 0; i < this.tiles; i++) {
      r.sprite('barrier', time * 10 + i, this.x, this.y + i * TILE, { additive: false });
    }
    r.addGlow(this.cx, this.cy, this.tiles * 10, '#6ee6ff', 0.3);
  }
}

export class WeakWall extends Solid {
  constructor(x, y) {
    super(x, y, 16, 16);
    this.kind = 'weakwall';
    this.hp = 3;
    this.maxHp = 3;
    this.shake = 0;
  }

  reset() { this.hp = this.maxHp; this.dead = false; this.collidable = true; this.shake = 0; }

  damage(game, amount = 1) {
    if (this.dead) return;
    this.hp -= amount;
    this.shake = 0.25;
    game.audio.play('break');
    game.particles.burst(this.cx, this.cy, 10, {
      color: '#a6968a', speed: 90, life: 0.5, size: 3, gravity: 420,
    });
    if (this.hp <= 0) {
      this.dead = true;
      this.collidable = false;
      game.punch(0.07, 0.34);
      game.ring(this.cx, this.cy, { color: '#c9ae8a', r1: 30, life: 0.35, width: 2 });
      game.particles.burst(this.cx, this.cy, 22, {
        color: '#7a6a5e', speed: 150, life: 0.7, size: 3, gravity: 500,
      });
    }
  }

  update(dt, game) {
    this.shake = Math.max(0, this.shake - dt * 4);
    for (const e of game.entities) {
      if (e === this || e.dead || !e.thrown || e.heldBy) continue;
      if (Math.hypot(e.vx, e.vy) > 190 && rectsOverlap(this.rect, e.rect)) {
        this.damage(game, e.impactDamage());
        e.vx *= -0.3; e.vy *= -0.3;
      }
    }
  }

  draw(r, time) {
    if (this.dead) return;
    const stage = clamp(this.maxHp - this.hp, 0, 3);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 2 : 0;
    r.sprite('weak_wall', stage, this.x + sx, this.y);
  }
}

export class MovingPlatform extends Solid {
  constructor(x, y, opts = {}) {
    super(x, y, (opts.w || 3) * TILE, 12);
    this.kind = 'platform';
    this.tilesW = opts.w || 3;
    this.path = (opts.path || []).map(([px, py]) => ({ x: px * TILE, y: py * TILE }));
    this.speed = opts.speed || 34;
    this.channel = opts.ch;
    this.grabbable = !!opts.grabbable;
    this.tier = TIER_LIGHT;
    this.leg = 0;
    this.t = 0;
    this.pingpong = opts.pingpong !== false;
    this.dir = 1;
    this.heldBy = null;
    this.spawnX = x; this.spawnY = y;
    this.freeAxis = opts.axis || null;   // 'x' | 'y' when player-driven
    this.driveSpeed = opts.driveSpeed || 66;
    this.solidWhileHeld = true;
    this.frozen = 0;
  }

  reset() {
    this.x = this.spawnX; this.y = this.spawnY;
    this.leg = 0; this.t = 0; this.dir = 1; this.heldBy = null; this.frozen = 0;
  }

  update(dt, game) {
    if (this.heldBy || this.frozen > 0) {
      if (this.frozen > 0) this.frozen -= dt;
      return;
    }
    if (this.path.length < 2) return;
    if (this.channel !== undefined && !game.channels[this.channel]) return;
    const from = this.path[this.leg];
    const to = this.path[(this.leg + this.dir + this.path.length) % this.path.length];
    const dx = to.x - this.x, dy = to.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      this.leg = (this.leg + this.dir + this.path.length) % this.path.length;
      if (this.pingpong && (this.leg === 0 || this.leg === this.path.length - 1)) this.dir *= -1;
      return;
    }
    const step = Math.min(d, this.speed * dt);
    this.moveSolid(game.level, (dx / d) * step, (dy / d) * step, game.allActors());
  }

  /**
   * Steering for a platform the player is standing on. The aim vector acts
   * like a joystick - following an aim *point* would run away, because the
   * point moves with the rider it is carrying.
   */
  driveDir(game, ax, ay, dt) {
    const mag = Math.hypot(ax, ay);
    if (mag < 0.2) return;
    let dx = (ax / mag) * this.driveSpeed * dt;
    let dy = (ay / mag) * this.driveSpeed * dt;
    if (this.freeAxis === 'x') dy = 0;
    if (this.freeAxis === 'y') dx = 0;
    const actors = game.allActors();
    if (dx && !game.level.solidRect({ x: this.x + dx, y: this.y, w: this.w, h: this.h })) {
      this.moveSolid(game.level, dx, 0, actors);
    }
    if (dy && !game.level.solidRect({ x: this.x, y: this.y + dy, w: this.w, h: this.h })) {
      this.moveSolid(game.level, 0, dy, actors);
    }
  }

  /** Used when the player telekinetically drives the platform. */
  driveTo(game, tx, ty, dt) {
    let dx = tx - this.x;
    let dy = ty - this.y;
    if (this.freeAxis === 'x') dy = 0;
    if (this.freeAxis === 'y') dx = 0;
    const maxStep = 150 * dt;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) {
      const s = Math.min(1, maxStep / d);
      const mx = dx * s;
      const my = dy * s;
      const actors = game.allActors();
      // Don't shove the platform into terrain.
      if (!game.level.solidRect({ x: this.x + mx, y: this.y, w: this.w, h: this.h })) {
        this.moveSolid(game.level, mx, 0, actors);
      }
      if (!game.level.solidRect({ x: this.x, y: this.y + my, w: this.w, h: this.h })) {
        this.moveSolid(game.level, 0, my, actors);
      }
    }
  }

  draw(r, time) {
    const img = r.assets.get('platform');
    if (!img) return;
    for (let i = 0; i < this.tilesW; i++) {
      const src = i === 0 ? 0 : (i === this.tilesW - 1 ? 32 : 16);
      r.drawSub(img, src, 0, 16, 16, this.x + i * TILE, this.y - 2, {});
    }
    r.addGlow(this.cx, this.y + 10, this.w * 0.5, '#45d6d0', 0.22);
    if (this.frozen > 0) {
      r.rectOutline(this.x - 1, this.y - 1, this.w + 2, this.h + 2, 'rgba(154,141,255,0.6)');
    }
  }
}

/** Temporary platform conjured by Ultimate Telepathy. */
export class PsyPlatform extends Solid {
  constructor(x, y, w = 3) {
    super(x, y, w * TILE, 10);
    this.kind = 'psyplatform';
    this.life = 6;
    this.tilesW = w;
    this.fade = 0;
  }

  update(dt, game) {
    this.life -= dt;
    this.fade = clamp(this.life / 1.2, 0, 1);
    if (this.life <= 0) {
      this.dead = true;
      this.collidable = false;
      game.particles.burst(this.cx, this.cy, 12, {
        color: '#8ef7ff', speed: 60, life: 0.5, size: 2, additive: true, glow: 6,
      });
    }
  }

  draw(r, time) {
    const a = 0.35 + Math.sin(time * 6) * 0.08;
    const alpha = this.fade;
    r.rect(this.x, this.y, this.w, this.h, `rgba(142,247,255,${a * alpha})`);
    r.rectOutline(this.x, this.y, this.w, this.h, `rgba(220,255,255,${0.8 * alpha})`);
    for (let i = 0; i < this.tilesW; i++) {
      r.rect(this.x + i * TILE + 6, this.y + 3, 4, 4, `rgba(255,255,255,${0.5 * alpha})`);
    }
    r.addGlow(this.cx, this.cy, this.w * 0.6, '#8ef7ff', 0.3 * alpha);
  }
}

// ----------------------------------------------------------- collectibles
export class Shard extends Prop {
  constructor(x, y) {
    super(x, y, 12, 12);
    this.kind = 'shard';
    this.gravity = 0;
    this.solid = false;
    this.bobT = Math.random() * 6;
  }

  /** Collected shards stay collected across deaths. */
  reset() {}

  update(dt, game) {
    this.bobT += dt;
    if (rectsOverlap(this.rect, game.player.rect)) {
      this.dead = true;
      game.collectShard(this);
    }
  }

  draw(r, time) {
    const y = this.y + Math.sin(this.bobT * 2.4) * 2;
    r.sprite('shard', time * 8, this.x - 2, y - 2);
    r.addGlow(this.cx, y + 6, 14, '#b06bff', 0.45);
  }
}

export class CrystalKey extends Prop {
  constructor(x, y, opts = {}) {
    super(x, y, 14, 14);
    this.kind = 'key';
    this.gravity = 0;
    this.solid = false;
    this.channel = opts.ch;
    this.bobT = 0;
  }

  reset() {}

  update(dt, game) {
    this.bobT += dt;
    if (rectsOverlap(this.rect, game.player.rect)) {
      this.dead = true;
      game.audio.play('pickup');
      game.keys++;
      if (this.channel !== undefined) game.setChannel(this.channel, true);
      game.particles.burst(this.cx, this.cy, 18, {
        color: '#ffd166', speed: 90, life: 0.6, size: 3, additive: true, glow: 8,
      });
      game.toast('CRYSTAL KEY');
    }
  }

  draw(r, time) {
    const y = this.y + Math.sin(this.bobT * 2) * 2;
    r.image('crystal_key', this.x - 1, y - 1);
    r.addGlow(this.cx, y + 7, 18, '#ffd166', 0.5);
  }
}

export class Checkpoint extends Prop {
  constructor(x, y) {
    super(x, y - TILE, 16, 32);
    this.kind = 'checkpoint';
    this.gravity = 0;
    this.solid = false;
    this.active = false;
  }

  reset() { /* checkpoints persist across deaths */ }

  update(dt, game) {
    if (!this.active && rectsOverlap({ x: this.x - 4, y: this.y, w: 24, h: 32 }, game.player.rect)) {
      this.active = true;
      game.setCheckpoint(this);
      game.audio.play('checkpoint');
      game.particles.burst(this.cx, this.y + 12, 16, {
        color: '#6bff9a', speed: 70, life: 0.6, size: 2, additive: true, glow: 8,
      });
    }
  }

  draw(r, time) {
    r.sprite(this.active ? 'checkpoint_on' : 'checkpoint_off', time * 5, this.x, this.y);
    if (this.active) r.addGlow(this.cx, this.y + 12, 22, '#6bff9a', 0.4);
  }
}

export class Exit extends Prop {
  constructor(x, y, opts = {}) {
    super(x, y - TILE, 16, 32);
    this.kind = 'exit';
    this.gravity = 0;
    this.solid = false;
    this.needKeys = opts.keys || 0;
    this.t = 0;
  }

  reset() {}

  update(dt, game) {
    this.t += dt;
    if (rectsOverlap({ x: this.x - 2, y: this.y, w: 20, h: 32 }, game.player.rect)) {
      if (game.keys >= this.needKeys) game.completeLevel();
      else game.toast(`NEEDS ${this.needKeys} CRYSTAL KEY${this.needKeys > 1 ? 'S' : ''}`, 1.2);
    }
  }

  draw(r, time) {
    const locked = false;
    const pulse = 0.5 + Math.sin(this.t * 3) * 0.5;
    for (let i = 0; i < 10; i++) {
      const a = (this.t * 1.4 + i / 10) % 1;
      const y = this.y + 32 - a * 34;
      const w = 12 * (1 - a) + 2;
      r.rect(this.cx - w / 2, y, w, 2, `rgba(142,247,255,${(1 - a) * 0.8})`);
    }
    r.ring(this.cx, this.y + 16, 9 + pulse * 2, 'rgba(142,247,255,0.85)', 1);
    r.ring(this.cx, this.y + 16, 13 + pulse * 3, 'rgba(142,247,255,0.35)', 1);
    r.addGlow(this.cx, this.y + 16, 30, '#8ef7ff', 0.45);
  }
}

/** Pickup that permanently unlocks a power. */
export class PowerCrystal extends Prop {
  constructor(x, y, opts = {}) {
    super(x, y, 16, 16);
    this.kind = 'powercrystal';
    this.gravity = 0;
    this.solid = false;
    this.power = opts.power;
    this.t = 0;
  }

  reset() {}

  update(dt, game) {
    this.t += dt;
    if (rectsOverlap(this.rect, game.player.rect)) {
      this.dead = true;
      game.unlockPower(this.power);
    }
  }

  draw(r, time) {
    const y = this.y + Math.sin(this.t * 2) * 2.5;
    const s = 1 + Math.sin(this.t * 4) * 0.06;
    r.sprite('power_icons', this.power, this.x, y, { scale: 1 });
    r.ring(this.cx, y + 8, 10 + Math.sin(this.t * 3) * 2, 'rgba(255,255,255,0.6)');
    r.addGlow(this.cx, y + 8, 26 * s, '#ffffff', 0.5);
  }
}
