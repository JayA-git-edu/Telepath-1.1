// Bosses. Every one of them is beaten with telekinesis: catch what they throw,
// or throw the arena back at them.

import { Actor, approach, clamp, rectsOverlap, TILE } from './physics.js';
import { Prop, Crate, GRAV } from './entities.js';

export class Boss extends Actor {
  constructor(x, y, w, h, opts = {}) {
    super(x, y, w, h);
    this.isBoss = true;
    this.kind = 'boss';
    this.name = opts.name || 'BOSS';
    this.hp = this.maxHp = opts.hp || 6;
    this.state = 'intro';
    this.stateT = 0;
    this.vulnerable = false;
    this.hitFlash = 0;
    this.facing = -1;
    this.animT = 0;
    this.pullable = false;
    this.pushable = false;
    this.freezable = false;
    this.introT = 1.6;
    this.deathT = 0;
    this.phase = 1;
    this.spawnX = x;
    this.spawnY = y;
  }

  reset() {
    this.place(this.spawnX, this.spawnY);
    this.hp = this.maxHp;
    this.state = 'intro';
    this.stateT = 0;
    this.introT = 1.0;
    this.dead = false;
    this.deathT = 0;
    this.vulnerable = false;
    this.phase = 1;
    this.vx = this.vy = 0;
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  damage(game, amount, dir) {
    if (this.dead || this.deathT > 0) return;
    if (!this.vulnerable) {
      game.particles.burst(this.cx, this.cy, 6, {
        color: '#9aa4c0', speed: 70, life: 0.3, size: 2,
      });
      game.audio.play('deflect');
      return;
    }
    this.hp -= amount;
    this.hitFlash = 0.35;
    game.audio.play('bossHit');
    game.renderer.shake(0.3);
    game.particles.burst(this.cx, this.cy, 16, {
      color: '#ffd0d0', speed: 130, life: 0.5, size: 3, additive: true, glow: 7,
    });
    if (this.hp <= 0) this.startDeath(game);
    else this.onDamaged(game);
  }

  onDamaged(game) {}

  startDeath(game) {
    this.deathT = 2.2;
    this.vulnerable = false;
    game.audio.play('win');
    game.renderer.shake(1.0);
    game.renderer.doFlash(0.5, '#ffffff');
  }

  updateDeath(dt, game) {
    this.deathT -= dt;
    if (Math.random() < 0.5) {
      game.particles.burst(
        this.x + Math.random() * this.w, this.y + Math.random() * this.h, 4,
        { color: '#ffcf6b', speed: 110, life: 0.7, size: 3, additive: true, glow: 8 },
      );
    }
    if (this.deathT <= 0 && !this.dead) {
      this.dead = true;
      game.onBossDefeated(this);
    }
  }

  common(dt, game) {
    this.animT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    if (this.deathT > 0) { this.updateDeath(dt, game); return false; }
    if (this.introT > 0) {
      this.introT -= dt;
      return false;
    }
    this.stateT += dt;
    if (!game.player.dying && rectsOverlap(this.rect, game.player.rect)) {
      game.player.hurt(game, 1, Math.sign(game.player.cx - this.cx) || 1);
    }
    // Thrown objects only land while the weak point is open.
    for (const e of game.entities) {
      if (e.dead || e.heldBy || !e.thrown) continue;
      if (Math.hypot(e.vx, e.vy) > 150 && rectsOverlap(this.rect, e.rect)) {
        this.damage(game, e.impactDamage(), Math.sign(e.vx) || 1);
        e.vx *= -0.4; e.vy *= -0.4;
        e.thrown = false;
      }
    }
    return true;
  }

  drawSprite(r, sheet, rate) {
    const s = r.assets.sheet[sheet];
    const x = this.cx - s.fw / 2;
    const y = this.y + this.h - s.fh;
    r.sprite(sheet, this.animT * rate, x, y, { flip: this.facing > 0 });
    if (this.hitFlash > 0) {
      r.spriteTinted(sheet, this.animT * rate, x, y, `rgba(255,255,255,${this.hitFlash * 2})`,
        { flip: this.facing > 0 });
    }
    if (this.vulnerable) {
      const a = 0.4 + Math.sin(this.animT * 12) * 0.25;
      r.rectOutline(this.x - 2, this.y - 2, this.w + 4, this.h + 4, `rgba(255,220,90,${a})`);
      r.addGlow(this.cx, this.cy, this.w, '#ffd166', 0.3);
    }
    if (this.introT > 0) {
      r.addGlow(this.cx, this.cy, this.w, '#ff5c5c', 0.4 * (this.introT / 1.6));
    }
  }
}

// ============================================================== E-MECH
export class EMech extends Boss {
  constructor(x, y) {
    super(x, y - 48, 44, 60, { name: 'E-MECH', hp: 6 });
    this.sprite = 'boss_emech';
    this.gravity = GRAV;
    this.bombT = 0;
  }

  update(dt, game) {
    if (!this.common(dt, game)) return;
    const p = game.player;
    this.facing = p.cx > this.cx ? 1 : -1;

    switch (this.state) {
      case 'intro':
        this.setState('charge');
        break;
      case 'charge': {
        this.vx = approach(this.vx, this.facing * (this.phase > 1 ? 58 : 42), 200 * dt);
        if (this.stateT > 2.2) this.setState('windup');
        break;
      }
      case 'windup':
        this.vx = approach(this.vx, 0, 400 * dt);
        if (this.stateT > 0.7) {
          this.setState('slam');
          this.vy = -260;
          this.vx = this.facing * 90;
        }
        break;
      case 'slam':
        if (this.onGround && this.stateT > 0.2) {
          game.renderer.shake(0.6);
          game.audio.play('shock');
          game.particles.burst(this.cx, this.y + this.h, 24, {
            color: '#ffb06b', speed: 180, life: 0.5, size: 3, additive: true, glow: 7,
          });
          if (Math.abs(p.cx - this.cx) < 70 && p.onGround) {
            p.hurt(game, 1, Math.sign(p.cx - this.cx) || 1);
          }
          this.setState('barrage');
        }
        break;
      case 'barrage': {
        this.vx = approach(this.vx, 0, 500 * dt);
        const shots = this.phase > 1 ? 4 : 3;
        if (this.stateT > 0.35 && this.shotsFired === undefined) this.shotsFired = 0;
        if (this.shotsFired !== undefined && this.shotsFired < shots &&
            this.stateT > 0.35 + this.shotsFired * 0.3) {
          const dy = (this.shotsFired - 1) * 26;
          game.spawnProjectile(this.cx + this.facing * 22, this.cy - 6,
            this.facing * 145, dy, { sprite: 'proj_energy', damage: 1, owner: this });
          game.audio.play('shoot');
          this.shotsFired++;
        }
        if (this.stateT > 0.4 + shots * 0.3 + 0.3) {
          this.shotsFired = undefined;
          this.setState('overheat');
        }
        break;
      }
      case 'overheat':
        this.vx = approach(this.vx, 0, 500 * dt);
        this.vulnerable = true;
        // Vent bombs the player can catch and throw back.
        this.bombT -= dt;
        if (this.bombT <= 0) {
          this.bombT = 1.1;
          const bomb = new Crate(this.cx - 8, this.y - 10, 'psy');
          bomb.vx = (Math.random() - 0.5) * 90;
          bomb.vy = -190;
          bomb.throwDamage = 2;
          game.spawn(bomb);
        }
        if (this.stateT > 3.2) {
          this.vulnerable = false;
          this.setState('charge');
        }
        break;
      default:
        this.setState('charge');
    }

    if (this.hp <= 3) this.phase = 2;

    this.vy = Math.min(this.vy + this.gravity * dt, 520);
    this.moveX(game.level, this.vx * dt, () => { this.vx = 0; });
    this.moveY(game.level, this.vy * dt, () => { this.vy = 0; });
    this.groundCheck(game.level);
  }

  draw(r, time) {
    this.drawSprite(r, this.sprite, this.state === 'charge' ? 6 : 3);
    r.addGlow(this.cx, this.cy - 4, 30, this.vulnerable ? '#ffd166' : '#ff7a5c',
      this.vulnerable ? 0.5 : 0.3);
    r.addLight(this.cx, this.cy, 110, 0.6);
  }
}

// ======================================================= CRYSTAL SPIDER
export class CrystalSpider extends Boss {
  constructor(x, y) {
    super(x, y - 40, 56, 40, { name: 'CRYSTAL SPIDER', hp: 6 });
    this.sprite = 'boss_spider';
    this.gravity = GRAV * 0.8;
    this.ceilY = y - 40;
    this.dropT = 0;
  }

  update(dt, game) {
    if (!this.common(dt, game)) return;
    const p = game.player;
    this.facing = p.cx > this.cx ? 1 : -1;

    switch (this.state) {
      case 'intro':
        this.setState('skitter');
        break;
      case 'skitter': {
        // Scuttles along the ceiling raining crystal shards.
        const target = p.cx;
        this.vx = approach(this.vx, clamp(target - this.cx, -1, 1) * (this.phase > 1 ? 90 : 62), 240 * dt);
        this.vy = approach(this.vy, (this.spawnY - this.y) * 2, 300 * dt);
        this.dropT -= dt;
        if (this.dropT <= 0) {
          this.dropT = this.phase > 1 ? 0.75 : 1.15;
          game.spawnProjectile(this.cx, this.y + this.h, (Math.random() - 0.5) * 40, 60, {
            sprite: 'proj_psy', damage: 1, owner: this, gravity: 320, life: 5,
          });
        }
        if (this.stateT > 4.5) this.setState('drop');
        break;
      }
      case 'drop':
        this.vx = approach(this.vx, 0, 400 * dt);
        this.vy += this.gravity * dt * 2;
        if (this.onGround) {
          game.renderer.shake(0.5);
          game.audio.play('shock');
          this.setState('stunned');
        }
        break;
      case 'stunned':
        this.vulnerable = true;
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.stateT > 3.0) {
          this.vulnerable = false;
          this.setState('climb');
        }
        break;
      case 'climb':
        this.vy = -120;
        if (this.y <= this.spawnY + 4) {
          this.y = this.spawnY;
          this.vy = 0;
          this.setState('skitter');
        }
        break;
      default:
        this.setState('skitter');
    }

    if (this.hp <= 3) this.phase = 2;
    if (this.state === 'drop') this.vy = Math.min(this.vy, 480);
    this.moveX(game.level, this.vx * dt, () => { this.vx = 0; });
    this.moveY(game.level, this.vy * dt, () => { this.vy = 0; });
    this.groundCheck(game.level);
  }

  draw(r, time) {
    this.drawSprite(r, this.sprite, 8);
    r.addGlow(this.cx, this.cy, 34, '#6bffd5', this.vulnerable ? 0.5 : 0.3);
    r.addLight(this.cx, this.cy, 100, 0.55);
  }
}

// ========================================================== BLACK REAPER
export class BlackReaper extends Boss {
  constructor(x, y) {
    super(x, y - 52, 30, 56, { name: 'BLACK REAPER', hp: 6 });
    this.sprite = 'boss_reaper';
    this.gravity = 0;
    this.anchors = [];
    this.vialT = 0;
  }

  update(dt, game) {
    if (!this.common(dt, game)) return;
    const p = game.player;
    this.facing = p.cx > this.cx ? 1 : -1;

    switch (this.state) {
      case 'intro':
        this.setState('hover');
        break;
      case 'hover': {
        const ty = this.spawnY + Math.sin(this.animT * 1.6) * 10;
        this.y = approach(this.y, ty, 40 * dt);
        this.vialT -= dt;
        if (this.vialT <= 0) {
          this.vialT = this.phase > 1 ? 0.85 : 1.3;
          const dx = p.cx - this.cx;
          game.spawnProjectile(this.cx, this.cy + 10, clamp(dx * 0.8, -160, 160), -110, {
            sprite: 'proj_void', damage: 1, owner: this, gravity: 300, life: 5,
            trailColor: '#8dff5c',
          });
          game.audio.play('shoot');
        }
        if (this.stateT > 3.4) this.setState('vanish');
        break;
      }
      case 'vanish':
        if (this.stateT > 0.4) {
          game.particles.burst(this.cx, this.cy, 20, {
            color: '#8dff5c', speed: 120, life: 0.5, size: 3, additive: true, glow: 7,
          });
          // Reappear on the far side of the arena.
          const side = p.cx > game.level.w / 2 ? -1 : 1;
          this.x = clamp(game.level.w / 2 + side * 90, 40, game.level.w - 80);
          this.y = this.spawnY;
          this.setState('reveal');
        }
        break;
      case 'reveal':
        this.vulnerable = true;
        if (this.stateT > 2.4) {
          this.vulnerable = false;
          this.setState('hover');
        }
        break;
      default:
        this.setState('hover');
    }

    if (this.hp <= 3 && this.phase === 1) {
      this.phase = 2;
      // Calls in wraiths once wounded.
      for (const dx of [-70, 70]) {
        game.spawnEnemy('w', (this.cx + dx) / TILE, (this.cy - 20) / TILE);
      }
      game.toast('THE REAPER CALLS FOR HELP');
    }
  }

  draw(r, time) {
    const alpha = this.state === 'vanish' ? clamp(1 - this.stateT / 0.4, 0, 1) : 1;
    const s = r.assets.sheet[this.sprite];
    const x = this.cx - s.fw / 2;
    const y = this.y + this.h - s.fh;
    r.sprite(this.sprite, this.animT * 6, x, y, { flip: this.facing > 0, alpha });
    if (this.hitFlash > 0) {
      r.spriteTinted(this.sprite, this.animT * 6, x, y, `rgba(255,255,255,${this.hitFlash * 2})`,
        { flip: this.facing > 0 });
    }
    if (this.vulnerable) {
      const a = 0.4 + Math.sin(this.animT * 12) * 0.25;
      r.rectOutline(this.x - 2, this.y - 2, this.w + 4, this.h + 4, `rgba(255,220,90,${a})`);
    }
    r.addGlow(this.cx, this.cy - 10, 28, '#8dff5c', 0.35 * alpha);
    r.addLight(this.cx, this.cy, 90, 0.5 * alpha);
  }
}

// =========================================================== MIND WARDEN
export class MindWarden extends Boss {
  constructor(x, y) {
    super(x, y - 56, 44, 52, { name: 'THE MIND WARDEN', hp: 5 });
    this.sprite = 'boss_warden';
    this.gravity = 0;
    this.shieldOrbs = [];
    this.beamT = 0;
    this.orbT = 0;
  }

  reset() {
    super.reset();
    this.shieldOrbs = [];
    this.spawnedShield = false;
  }

  ensureShield(game) {
    this.shieldOrbs = this.shieldOrbs.filter((o) => !o.dead && !o.consumed);
    if (this.shieldOrbs.length === 0 && this.state !== 'exposed') {
      for (let i = 0; i < 3; i++) {
        const crate = new Crate(this.cx - 8, this.cy - 8, 'psy');
        crate.orbitAngle = (i / 3) * Math.PI * 2;
        crate.isShield = true;
        crate.gravity = 0;
        crate.throwDamage = 2;
        game.spawn(crate);
        this.shieldOrbs.push(crate);
      }
      game.toast('TEAR AWAY ITS SHIELD');
    }
  }

  update(dt, game) {
    if (!this.common(dt, game)) return;
    const p = game.player;
    this.facing = p.cx > this.cx ? 1 : -1;

    if (this.state === 'intro') this.setState('float');
    this.ensureShield(game);

    // Orbiting shield crates: grab them off and throw them back.
    const alive = this.shieldOrbs.filter((o) => !o.dead && !o.heldBy && !o.thrown);
    for (const o of this.shieldOrbs) {
      if (o.dead) continue;
      if (o.heldBy || o.thrown) { o.isShield = false; continue; }
      if (!o.isShield) continue;
      o.orbitAngle += dt * 1.5;
      const r = 42;
      o.place(this.cx - 8 + Math.cos(o.orbitAngle) * r, this.cy - 8 + Math.sin(o.orbitAngle) * r * 0.6);
      o.vx = o.vy = 0;
    }
    const shieldUp = this.shieldOrbs.some((o) => !o.dead && o.isShield);
    this.vulnerable = !shieldUp;

    const ty = this.spawnY + Math.sin(this.animT * 1.2) * 12;
    this.y = approach(this.y, ty, 30 * dt);
    this.x = approach(this.x, clamp(p.cx - this.w / 2, 40, game.level.w - this.w - 40), 26 * dt);

    this.beamT -= dt;
    if (this.beamT <= 0) {
      this.beamT = shieldUp ? 1.5 : 2.4;
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      const n = this.phase > 1 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.34;
        const a = Math.atan2(dy, dx) + spread;
        game.spawnProjectile(this.cx, this.cy, Math.cos(a) * 150, Math.sin(a) * 150, {
          sprite: 'proj_void', damage: 1, owner: this, life: 4,
        });
      }
      game.audio.play('shoot');
    }
    if (this.hp <= 2) this.phase = 2;
  }

  onDamaged(game) {
    // Shield reforms after each hit lands.
    this.shieldOrbs = [];
  }

  draw(r, time) {
    this.drawSprite(r, this.sprite, 6);
    const shieldUp = this.shieldOrbs.some((o) => !o.dead && o.isShield);
    if (shieldUp) {
      const a = 0.25 + Math.sin(this.animT * 5) * 0.08;
      r.ring(this.cx, this.cy, 40, `rgba(176,107,255,${a})`, 2);
    }
    r.addGlow(this.cx, this.cy, 40, '#b06bff', this.vulnerable ? 0.55 : 0.35);
    r.addLight(this.cx, this.cy, 130, 0.7);
  }
}

// ============================================================== THE ENTITY
export class TheEntity extends Boss {
  constructor(x, y) {
    super(x, y - 80, 66, 66, { name: 'THE ENTITY', hp: 9 });
    this.sprite = 'boss_entity';
    this.gravity = 0;
    this.ringT = 0;
    this.summonT = 4;
    this.pullT = 0;
  }

  update(dt, game) {
    if (!this.common(dt, game)) return;
    const p = game.player;

    if (this.state === 'intro') this.setState('ring');
    const ty = this.spawnY + Math.sin(this.animT * 0.9) * 16;
    this.y = approach(this.y, ty, 26 * dt);
    this.x = approach(this.x, clamp(p.cx - this.w / 2, 60, game.level.w - this.w - 60), 20 * dt);

    this.phase = this.hp > 6 ? 1 : (this.hp > 3 ? 2 : 3);

    switch (this.state) {
      case 'ring':
        this.ringT -= dt;
        if (this.ringT <= 0) {
          this.ringT = this.phase === 3 ? 1.5 : 2.2;
          const n = 6 + this.phase * 2;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + this.animT;
            game.spawnProjectile(this.cx, this.cy, Math.cos(a) * 110, Math.sin(a) * 110, {
              sprite: 'proj_void', damage: 1, owner: this, life: 4,
            });
          }
          game.audio.play('shoot');
        }
        if (this.stateT > 5) this.setState('open');
        break;
      case 'open':
        // The maw gapes: this is the window to hurl something in.
        this.vulnerable = true;
        if (this.stateT > 3.4) {
          this.vulnerable = false;
          this.setState(this.phase >= 2 ? 'summon' : 'ring');
        }
        break;
      case 'summon':
        if (this.stateT < 0.05) {
          for (const dx of [-90, 90]) {
            game.spawnEnemy('w', (this.cx + dx) / TILE, (this.cy) / TILE);
          }
          game.toast('IT SPLITS ITSELF');
        }
        if (this.stateT > 1.4) this.setState('ring');
        break;
      default:
        this.setState('ring');
    }

    // Phase 3 drags the player in; psychic platforms are the way out.
    if (this.phase === 3) {
      const dx = this.cx - p.cx;
      const d = Math.abs(dx);
      if (d < 200) p.vx += Math.sign(dx) * 60 * dt;
    }
  }

  draw(r, time) {
    this.drawSprite(r, this.sprite, 7);
    const pulse = this.vulnerable ? 0.6 : 0.35;
    r.addGlow(this.cx, this.cy, 60, this.vulnerable ? '#ff5cf0' : '#58ffe0', pulse);
    r.addLight(this.cx, this.cy, 150, 0.75);
    if (this.phase === 3) {
      for (let i = 0; i < 3; i++) {
        const rr = 60 + i * 26 + Math.sin(this.animT * 3 + i) * 6;
        r.ring(this.cx, this.cy, rr, 'rgba(88,255,224,0.12)', 1);
      }
    }
  }
}

export const BOSSES = {
  emech: EMech,
  spider: CrystalSpider,
  reaper: BlackReaper,
  warden: MindWarden,
  entity: TheEntity,
};
