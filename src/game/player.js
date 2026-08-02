// Eli: Celeste-flavoured platforming (coyote time, jump buffer, variable jump,
// wall slide) plus the telekinesis rig.

import { Actor, TILE, approach, clamp, rectsOverlap } from './physics.js';
import { Telekinesis } from './telekinesis.js';
import { T_SPIKE, T_VOID, T_ICE, T_BOUNCE } from './level.js';

const RUN_SPEED = 116;
const ACCEL_GROUND = 900;
const ACCEL_AIR = 620;
const FRICTION = 1250;
const ICE_FRICTION = 130;
const GRAVITY = 640;
const GRAVITY_FALL = 820;
const MAX_FALL = 340;
const JUMP_VEL = -218;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;
const WALL_SLIDE = 62;
const WALL_JUMP_X = 168;

export class Player extends Actor {
  constructor(x, y) {
    // (x, y) is the spawn tile's top-left; Eli is taller than a tile, so
    // his feet sit on that tile's floor and his head pokes into the one above.
    super(x + 3, y - 4, 10, 20);
    this.kind = 'player';
    this.facing = 1;
    this.hp = 4;
    this.maxHp = 4;
    this.invuln = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpHeld = false;
    this.anim = 'idle';
    this.animT = 0;
    this.castTimer = 0;
    this.dashTimer = 0;
    this.landTimer = 0;
    this.wallDir = 0;
    this.wallSlideT = 0;
    this.stepT = 0;
    this.tk = new Telekinesis(this);
    this.dying = 0;
    this.spawnX = this.x;
    this.spawnY = this.y;
    this.hurtTimer = 0;
    this.controlLock = 0;
  }

  respawnAt(x, y) {
    this.place(x + 3, y - 4);
    this.vx = this.vy = 0;
    this.hp = this.maxHp;
    this.invuln = 1.2;
    this.dying = 0;
    this.dead = false;
    this.tk.reset();
    this.controlLock = 0;
  }

  hurt(game, amount, dir) {
    if (this.invuln > 0 || this.dying > 0) return;
    this.hp -= amount;
    this.invuln = 1.3;
    this.hurtTimer = 0.35;
    this.controlLock = 0.18;
    this.vx = (dir || -this.facing) * 130;
    this.vy = -150;
    game.punch(0.09, 0.34, [0.24, '#ff5c7a']);
    game.ring(this.cx, this.cy, { color: '#ff5c7a', r1: 30, life: 0.35, width: 2 });
    game.particles.burst(this.cx, this.cy, 14, {
      color: '#ff5c7a', speed: 110, life: 0.5, size: 3, additive: true, glow: 6,
    });
    if (this.hp <= 0) {
      this.die(game);
    } else {
      game.audio.play('hurt');
    }
  }

  die(game) {
    if (this.dying > 0) return;
    this.dying = 1.1;
    this.hp = 0;
    this.tk.release(game, true);
    game.audio.play('die');
    game.punch(0.16, 0.55, [0.3, '#8ef7ff']);
    game.ring(this.cx, this.cy, { color: '#8ef7ff', r0: 4, r1: 70, life: 0.7, width: 2 });
    game.particles.burst(this.cx, this.cy, 34, {
      color: '#8ef7ff', speed: 150, life: 0.9, size: 3, additive: true, glow: 8, round: true,
    });
    game.particles.burst(this.cx, this.cy, 18, {
      color: '#ff5c7a', speed: 90, life: 0.8, size: 3, gravity: 260,
    });
  }

  squish() {
    if (this.squishGrace > 0) return;
    this.pendingSquish = true;
  }

  update(dt, game) {
    const input = game.input;
    const level = game.level;

    if (this.dying > 0) {
      this.dying -= dt;
      if (this.dying <= 0) game.respawn();
      return;
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.castTimer = Math.max(0, this.castTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);
    this.controlLock = Math.max(0, this.controlLock - dt);
    this.squishGrace = Math.max(0, (this.squishGrace || 0) - dt);

    const locked = this.controlLock > 0 || game.cutscene;
    const ax = locked ? 0 : input.axisX();
    if (ax !== 0) this.facing = ax;

    // --- horizontal -------------------------------------------------------
    const onIce = this.standingOn(level, T_ICE);
    const accel = this.onGround ? (onIce ? ACCEL_GROUND * 0.35 : ACCEL_GROUND) : ACCEL_AIR;
    if (ax !== 0) {
      this.vx = approach(this.vx, RUN_SPEED * ax, accel * dt);
    } else {
      const fr = this.onGround ? (onIce ? ICE_FRICTION : FRICTION) : ACCEL_AIR * 0.55;
      this.vx = approach(this.vx, 0, fr * dt);
    }

    // --- wall slide -------------------------------------------------------
    this.wallDir = 0;
    if (!this.onGround) {
      if (this.collides(level, 1, 0) && ax > 0) this.wallDir = 1;
      else if (this.collides(level, -1, 0) && ax < 0) this.wallDir = -1;
    }
    const sliding = this.wallDir !== 0 && this.vy > 0;
    if (sliding) {
      this.vy = Math.min(this.vy, WALL_SLIDE);
      this.wallSlideT += dt;
      if (Math.random() < 0.25) {
        game.particles.spawn({
          x: this.cx + this.wallDir * 6, y: this.cy + Math.random() * 10,
          vx: -this.wallDir * 20, vy: 20, life: 0.3, size: 2, color: '#c9d6ff', drag: 0.9,
        });
      }
    } else {
      this.wallSlideT = 0;
    }

    // --- jumping ----------------------------------------------------------
    if (this.onGround) this.coyote = COYOTE;
    else this.coyote = Math.max(0, this.coyote - dt);
    if (!locked && input.hit('jump')) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    // Eli climbs with telekinesis, not with wall jumps - a wall slide only
    // softens the fall so vertical puzzles stay solvable by grabbing things.
    if (this.jumpBuffer > 0 && this.coyote > 0) this.doJump(game);
    // Variable jump height: releasing early cuts the rise short.
    if (this.jumpHeld && !input.held('jump')) {
      this.jumpHeld = false;
      if (this.vy < 0) this.vy *= 0.45;
    }

    // --- gravity ----------------------------------------------------------
    let g = this.vy < 0 ? GRAVITY : GRAVITY_FALL;
    if (this.vy < 0 && !this.jumpHeld) g *= 1.25;
    this.vy = Math.min(this.vy + g * dt, MAX_FALL);

    // --- move -------------------------------------------------------------
    const wasGround = this.onGround;
    this.moveX(level, this.vx * dt, () => { this.vx = 0; });
    this.moveY(level, this.vy * dt, (sign) => {
      if (sign > 0) {
        if (this.standingOn(level, T_BOUNCE)) {
          this.vy = -330;
          game.audio.play('jump');
          game.renderer.shake(0.12);
          game.particles.burst(this.cx, this.y + this.h, 12, {
            color: '#ff78c8', speed: 110, life: 0.4, size: 2, additive: true, glow: 6,
          });
          return;
        }
        if (this.vy > 220) {
          this.landTimer = 0.16;
          game.audio.play('land');
          game.particles.burst(this.cx, this.y + this.h, 8, {
            color: '#c9d6ff', speed: 70, life: 0.3, size: 2, angle: -Math.PI / 2, spread: 2.4,
          });
          if (this.vy > 300) {
            game.renderer.shake(0.12);
            game.ring(this.cx, this.y + this.h, { color: '#c9d6ff', r0: 2, r1: 22, life: 0.22, width: 1 });
          }
        }
      }
      this.vy = 0;
    });
    this.groundCheck(level);
    if (this.onGround && !wasGround && this.vy >= 0) this.jumpHeld = false;

    // Footstep dust.
    if (this.onGround && Math.abs(this.vx) > 40) {
      this.stepT += dt * Math.abs(this.vx) / 40;
      if (this.stepT > 1) {
        this.stepT = 0;
        game.audio.play('step');
        game.particles.spawn({
          x: this.cx - Math.sign(this.vx) * 4, y: this.y + this.h - 1,
          vx: -this.vx * 0.15, vy: -14, life: 0.28, size: 2, color: '#b9c6e8', drag: 0.88,
        });
      }
    }

    // --- hazards ----------------------------------------------------------
    const body = { x: this.x + 1, y: this.y + 2, w: this.w - 2, h: this.h - 3 };
    if (level.tileTypeIn(body, T_SPIKE)) this.hurt(game, 1, -this.facing);
    if (level.tileTypeIn(body, T_VOID)) this.die(game);
    if (this.y > level.h + 40) this.die(game);

    if (this.pendingSquish) {
      this.pendingSquish = false;
      if (this.collides(level, 0, 0)) this.die(game);
    }

    // --- powers -----------------------------------------------------------
    if (!game.cutscene) this.tk.update(dt, game);

    this.updateAnim(dt, ax);
  }

  doJump(game) {
    this.vy = JUMP_VEL;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.onGround = false;
    this.jumpHeld = true;
    game.audio.play('jump');
    game.particles.burst(this.cx, this.y + this.h, 6, {
      color: '#c9d6ff', speed: 60, life: 0.3, size: 2, angle: Math.PI / 2, spread: 1.6,
    });
  }

  standingOn(level, type) {
    const r = { x: this.x + 1, y: this.y + this.h, w: this.w - 2, h: 2 };
    return !!level.tileTypeIn(r, type);
  }

  updateAnim(dt, ax) {
    let next = 'idle';
    if (this.dashTimer > 0) next = 'dash';
    else if (this.hurtTimer > 0) next = 'hurt';
    else if (!this.onGround) next = this.vy < -20 ? 'jump' : 'fall';
    else if (this.landTimer > 0) next = 'land';
    else if (Math.abs(this.vx) > 12) next = 'run';
    else if (this.castTimer > 0) next = 'cast';
    if (this.castTimer > 0 && (next === 'idle')) next = 'cast';

    if (next !== this.anim) {
      this.anim = next;
      this.animT = 0;
    }
    const speed = { idle: 6, run: 14, cast: 10, fall: 6, jump: 6, land: 12, dash: 14, hurt: 6 }[this.anim] || 8;
    this.animT += dt * speed * (this.anim === 'run' ? Math.min(1.6, Math.abs(this.vx) / RUN_SPEED + 0.4) : 1);
  }

  draw(r, game, time) {
    const sheet = {
      idle: 'eli_idle', run: 'eli_run', jump: 'eli_jump', fall: 'eli_fall',
      land: 'eli_land', cast: 'eli_cast', dash: 'eli_dash', hurt: 'eli_hurt',
    }[this.anim] || 'eli_idle';
    const x = this.cx - 16;
    const y = this.y + this.h - 30;
    const flip = this.facing < 0;
    const blink = this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0;

    // Ground shadow.
    if (this.onGround) {
      r.ctx.save();
      r.ctx.globalAlpha = 0.28;
      r.ctx.fillStyle = '#000010';
      r.ctx.beginPath();
      r.ctx.ellipse(Math.round(this.cx - r.ox), Math.round(this.y + this.h - r.oy), 8, 2.5, 0, 0, Math.PI * 2);
      r.ctx.fill();
      r.ctx.restore();
    }

    if (this.dashTimer > 0) {
      for (let i = 1; i <= 3; i++) {
        r.spriteTinted(sheet, this.animT, x - this.vx * 0.012 * i, y, 'rgba(142,247,255,0.35)', { flip });
      }
    }

    if (!blink) {
      r.sprite(sheet, this.animT, x, y, { flip });
    }
    if (this.hurtTimer > 0) {
      r.spriteTinted(sheet, this.animT, x, y, 'rgba(255,120,140,0.75)', { flip });
    }

    // Psychic aura when channelling.
    if (this.tk.held.length || this.castTimer > 0) {
      r.addGlow(this.cx, this.cy - 4, 26, '#8ef7ff', 0.28);
    }
    r.addLight(this.cx, this.cy - 4, 132, 1.0);
  }
}
