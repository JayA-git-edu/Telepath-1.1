// The telekinesis system: aiming, grabbing, throwing, and every power the
// progression unlocks.

import { TILE, clamp, lerp, rectsOverlap } from './physics.js';
import { PsyPlatform, TIER_HEAVY } from './entities.js';

export const POWERS = [
  { id: 'lift', name: 'LIFT', desc: 'Hold GRAB to seize a nearby object and move it with your aim.' },
  { id: 'push', name: 'PUSH', desc: 'Tap THROW with empty hands to blast objects and enemies away.' },
  { id: 'pull', name: 'PULL', desc: 'GRAB at range yanks distant objects and enemies toward you.' },
  { id: 'stasis', name: 'STASIS', desc: 'STASIS freezes what you hold - or an incoming projectile - in midair.' },
  { id: 'dash', name: 'MIND DASH', desc: 'DASH teleports you to the object you are holding.' },
  { id: 'chain', name: 'CHAIN CONTROL', desc: 'Hold up to three objects at once and move them together.' },
  { id: 'shock', name: 'SHOCKWAVE', desc: 'SHOCK releases a psychic blast that shatters weak walls.' },
  { id: 'ultimate', name: 'ULTIMATE TELEPATHY', desc: 'Lift the heaviest things, and BUILD psychic platforms from nothing.' },
];

export const COST = {
  hold: 3.5,      // per second, per object
  throw: 6,
  push: 14,
  pull: 8,
  stasis: 18,
  dash: 22,
  shock: 30,
  build: 26,
};

const BASE_RANGE = 104;

export class Telekinesis {
  constructor(player) {
    this.player = player;
    this.held = [];
    this.aim = { x: 1, y: 0 };
    this.aimPoint = { x: 0, y: 0 };
    this.holdDist = 40;
    this.energy = 100;
    this.maxEnergy = 100;
    this.cooldown = 0;
    this.pushFx = 0;
    this.shockFx = -1;
    this.shockX = 0;
    this.shockY = 0;
    this.targetHint = null;
    this.overloaded = 0;
  }

  get range() {
    return BASE_RANGE + (this.player.game && this.player.game.hasPower('ultimate') ? 40 : 0);
  }

  get capacity() {
    return this.player.game && this.player.game.hasPower('chain') ? 3 : 1;
  }

  reset() {
    for (const h of this.held) h.heldBy = null;
    this.held = [];
    this.energy = this.maxEnergy;
    this.cooldown = 0;
    this.shockFx = -1;
  }

  spend(amount) {
    if (this.energy < amount) {
      this.overloaded = 0.5;
      return false;
    }
    this.energy -= amount;
    return true;
  }

  // ------------------------------------------------------------------ aim
  updateAim(game) {
    const p = this.player;
    const input = game.input;
    const cx = p.cx;
    const cy = p.cy - 2;
    if (input.padAim) {
      const d = Math.hypot(input.padAim.x, input.padAim.y) || 1;
      this.aim.x = input.padAim.x / d;
      this.aim.y = input.padAim.y / d;
      this.holdDist = clamp(this.holdDist, 28, this.range);
      this.aimPoint.x = cx + this.aim.x * this.holdDist;
      this.aimPoint.y = cy + this.aim.y * this.holdDist;
    } else if (input.usedMouseAim) {
      const mx = input.mouse.x + game.renderer.ox;
      const my = input.mouse.y + game.renderer.oy;
      let dx = mx - cx;
      let dy = my - cy;
      const d = Math.hypot(dx, dy) || 1;
      this.aim.x = dx / d;
      this.aim.y = dy / d;
      this.holdDist = clamp(d, 22, this.range);
      this.aimPoint.x = cx + this.aim.x * this.holdDist;
      this.aimPoint.y = cy + this.aim.y * this.holdDist;
    } else {
      // Keyboard aiming: facing direction blended with up/down.
      const ax = input.axisX() || p.facing;
      const ay = (input.held('down') ? 1 : 0) - (input.held('up') ? 1 : 0);
      let dx = ax, dy = ay;
      if (!dx && !dy) { dx = p.facing; dy = 0; }
      const d = Math.hypot(dx, dy) || 1;
      this.aim.x = dx / d;
      this.aim.y = dy / d;
      this.holdDist = 48;
      this.aimPoint.x = cx + this.aim.x * this.holdDist;
      this.aimPoint.y = cy + this.aim.y * this.holdDist;
    }
  }

  /** Best grab candidate: closest to the aim point, in range, with line of sight. */
  findTarget(game, opts = {}) {
    const p = this.player;
    const cx = p.cx, cy = p.cy - 2;
    let best = null;
    let bestScore = Infinity;
    const canHeavy = game.hasPower('ultimate');
    for (const e of game.grabbables()) {
      if (e.dead || e.heldBy) continue;
      if (this.held.includes(e)) continue;
      if (!opts.includeDevices && (e.kind === 'switch' || e.kind === 'lever')) continue;
      const d = Math.hypot(e.cx - cx, e.cy - cy);
      if (d > this.range) continue;
      if (e.tier === TIER_HEAVY && !canHeavy && !opts.allowHeavy) continue;
      const aimDist = Math.hypot(e.cx - this.aimPoint.x, e.cy - this.aimPoint.y);
      // Prefer whatever is nearest the reticle, with a nudge toward closer things.
      const score = aimDist + d * 0.25;
      if (score > 46 + e.w * 0.5) continue;
      if (game.level.raycast(cx, cy, e.cx, e.cy)) continue;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  findDevice(game) {
    const p = this.player;
    const cx = p.cx, cy = p.cy - 2;
    let best = null;
    let bestScore = Infinity;
    for (const e of game.entities) {
      if (e.dead) continue;
      if (e.kind !== 'switch' && e.kind !== 'lever') continue;
      if (e.mode === 'plate') continue;
      const d = Math.hypot(e.cx - cx, e.cy - cy);
      if (d > this.range) continue;
      const aimDist = Math.hypot(e.cx - this.aimPoint.x, e.cy - this.aimPoint.y);
      const score = aimDist + d * 0.2;
      if (score > 40) continue;
      if (game.level.raycast(cx, cy, e.cx, e.cy)) continue;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  // ----------------------------------------------------------------- verbs
  grab(game) {
    const device = this.findDevice(game);
    const target = this.findTarget(game);
    // A device right under the reticle wins over a distant crate.
    if (device && (!target || Math.hypot(device.cx - this.aimPoint.x, device.cy - this.aimPoint.y) <
        Math.hypot(target.cx - this.aimPoint.x, target.cy - this.aimPoint.y))) {
      device.interact(game);
      this.player.castTimer = 0.3;
      game.particles.burst(device.cx, device.cy, 8, {
        color: '#8ef7ff', speed: 50, life: 0.35, size: 2, additive: true, glow: 5,
      });
      return true;
    }
    if (!target) {
      // Nothing under the reticle: chained objects are set down, otherwise try
      // to yank something in from further out.
      if (this.held.length && game.hasPower('chain')) {
        this.release(game);
        return true;
      }
      if (game.hasPower('pull')) return this.pull(game);
      return false;
    }
    if (this.held.length >= this.capacity) {
      if (this.capacity === 1) this.release(game);
      else return false;
    }
    if (!this.spend(2)) return false;
    target.heldBy = this;
    target.frozen = 0;
    target.grabAngleOffset = this.held.length === 0 ? 0
      : (this.held.length === 1 ? -0.6 : 0.6);
    this.held.push(target);
    game.audio.play('grab');
    this.player.castTimer = 0.35;
    game.particles.burst(target.cx, target.cy, 10, {
      color: '#8ef7ff', speed: 55, life: 0.4, size: 2, additive: true, glow: 6,
    });
    return true;
  }

  pull(game) {
    const p = this.player;
    const cx = p.cx, cy = p.cy - 2;
    let best = null;
    let bestD = Infinity;
    for (const e of [...game.grabbables(), ...game.enemies]) {
      if (e.dead || e.heldBy || !e.pullable) continue;
      const d = Math.hypot(e.cx - cx, e.cy - cy);
      if (d > this.range * 1.35) continue;
      const aimDist = Math.hypot(e.cx - this.aimPoint.x, e.cy - this.aimPoint.y);
      if (aimDist > 60) continue;
      if (game.level.raycast(cx, cy, e.cx, e.cy)) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return false;
    if (!this.spend(COST.pull)) return false;
    const dx = cx - best.cx, dy = cy - best.cy;
    const d = Math.hypot(dx, dy) || 1;
    const force = best.tier === TIER_HEAVY ? 180 : 300;
    best.vx = (dx / d) * force;
    best.vy = (dy / d) * force - 60;
    best.thrown = true;
    if (best.stagger !== undefined) best.stagger = 0.5;
    game.audio.play('grab');
    this.player.castTimer = 0.3;
    game.particles.burst(best.cx, best.cy, 10, {
      color: '#6bff9a', speed: 60, life: 0.4, size: 2, additive: true, glow: 6,
    });
    this.beamFx = { x: best.cx, y: best.cy, t: 0.25, color: '#6bff9a' };
    return true;
  }

  release(game, silent = false) {
    if (!this.held.length) return;
    for (const h of this.held) {
      h.heldBy = null;
      h.vx *= 0.5;
      h.vy *= 0.5;
    }
    this.held = [];
    if (!silent) game.audio.play('release');
  }

  throwHeld(game) {
    if (!this.held.length) return false;
    if (!this.spend(COST.throw)) return false;
    const speed = 400;
    for (const h of this.held) {
      h.heldBy = null;
      h.vx = this.aim.x * speed;
      h.vy = this.aim.y * speed - 30;
      h.thrown = true;
      h.frozen = 0;
      if (h.kind === 'projectile') h.deflected = true;
      game.particles.burst(h.cx, h.cy, 12, {
        color: '#8ef7ff', speed: 90, life: 0.4, size: 2, additive: true, glow: 6,
        angle: Math.atan2(this.aim.y, this.aim.x), spread: 0.8,
      });
    }
    this.held = [];
    game.audio.play('throw');
    game.renderer.shake(0.12);
    this.player.castTimer = 0.3;
    return true;
  }

  pushBlast(game) {
    if (!game.hasPower('push')) return false;
    if (!this.spend(COST.push)) return false;
    const p = this.player;
    const ox = p.cx + this.aim.x * 14;
    const oy = p.cy - 2 + this.aim.y * 14;
    const reach = 78;
    const targets = [...game.entities, ...game.enemies];
    for (const e of targets) {
      if (e.dead || e.heldBy || e === p) continue;
      if (e.pushable === false) continue;
      const dx = e.cx - ox, dy = e.cy - oy;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      const dot = (dx / (d || 1)) * this.aim.x + (dy / (d || 1)) * this.aim.y;
      if (dot < 0.35) continue;
      const power = (1 - d / reach) * 480;
      if (e.kind === 'weakwall') { e.damage(game, 1); continue; }
      if (e.vx !== undefined) {
        e.vx += (dx / (d || 1)) * power;
        e.vy += (dy / (d || 1)) * power - 40;
        e.thrown = true;
        e.frozen = 0;
        if (e.stagger !== undefined) e.stagger = 0.6;
        if (e.hp !== undefined && e.isEnemy) e.damage(game, 1, Math.sign(dx) || 1);
      }
    }
    game.particles.burst(ox, oy, 22, {
      color: '#ff9257', speed: 210, life: 0.35, size: 3, additive: true, glow: 8,
      angle: Math.atan2(this.aim.y, this.aim.x), spread: 1.1,
    });
    this.pushFx = 0.3;
    this.pushAngle = Math.atan2(this.aim.y, this.aim.x);
    game.audio.play('push');
    game.renderer.shake(0.2);
    this.player.castTimer = 0.3;
    // Newton's third law: a blast shoves the player back a little.
    p.vx -= this.aim.x * 60;
    if (!p.onGround) p.vy -= this.aim.y * 40;
    return true;
  }

  stasis(game) {
    if (!game.hasPower('stasis')) return false;
    let targets = this.held.slice();
    if (!targets.length) {
      // Freeze whatever is nearest the reticle: projectile, enemy or platform.
      const cands = [...game.projectiles, ...game.enemies, ...game.entities];
      let best = null, bestD = 44;
      for (const e of cands) {
        if (e.dead || e.freezable === false) continue;
        const d = Math.hypot(e.cx - this.aimPoint.x, e.cy - this.aimPoint.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) targets = [best];
    }
    if (!targets.length) return false;
    if (!this.spend(COST.stasis)) return false;
    for (const t of targets) {
      t.heldBy = null;
      t.frozen = 4;
      t.vx = 0; t.vy = 0;
      game.particles.burst(t.cx, t.cy, 14, {
        color: '#9a8dff', speed: 70, life: 0.5, size: 2, additive: true, glow: 7,
      });
    }
    this.held = this.held.filter((h) => !targets.includes(h));
    game.audio.play('stasis');
    this.player.castTimer = 0.35;
    return true;
  }

  mindDash(game) {
    if (!game.hasPower('dash')) return false;
    const anchor = this.held[0] || this.frozenAnchor(game);
    if (!anchor) return false;
    if (!this.spend(COST.dash)) return false;
    const p = this.player;
    const fromX = p.cx, fromY = p.cy;
    let tx = anchor.cx - p.w / 2;
    let ty = anchor.cy - p.h / 2;
    // Nudge out of terrain if the anchor is embedded in a wall.
    const safe = this.findFreeSpot(game, tx, ty, p.w, p.h);
    if (!safe) return false;
    p.place(safe.x, safe.y);
    p.vx = this.aim.x * 90;
    p.vy = Math.min(p.vy, -60);
    p.dashTimer = 0.25;
    p.invuln = Math.max(p.invuln, 0.4);
    game.audio.play('dash');
    game.renderer.shake(0.16);
    game.renderer.doFlash(0.18, '#8ef7ff');
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      game.particles.spawn({
        x: lerp(fromX, p.cx, t), y: lerp(fromY, p.cy, t),
        vx: 0, vy: -10, life: 0.35, size: 3, color: '#8ef7ff',
        additive: true, glow: 6, drag: 0.86,
      });
    }
    return true;
  }

  frozenAnchor(game) {
    let best = null, bestD = 50;
    for (const e of game.entities) {
      if (e.dead || !e.frozen) continue;
      const d = Math.hypot(e.cx - this.aimPoint.x, e.cy - this.aimPoint.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  findFreeSpot(game, x, y, w, h) {
    const tryPos = (px, py) => {
      const r = { x: px, y: py, w, h };
      if (game.level.solidRect(r)) return false;
      const solid = game.level.solidEntityAt(r, this.player);
      if (solid && solid !== this.held[0]) return false;
      return true;
    };
    if (tryPos(x, y)) return { x, y };
    for (let radius = 4; radius <= 24; radius += 4) {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = x + dx * radius;
        const py = y + dy * radius;
        if (tryPos(px, py)) return { x: px, y: py };
      }
    }
    return null;
  }

  shockwave(game) {
    if (!game.hasPower('shock')) return false;
    if (!this.spend(COST.shock)) return false;
    const p = this.player;
    this.shockFx = 0;
    this.shockX = p.cx;
    this.shockY = p.cy;
    const radius = 86;
    for (const e of [...game.entities, ...game.enemies, ...game.projectiles]) {
      if (e.dead || e === p) continue;
      const dx = e.cx - p.cx, dy = e.cy - p.cy;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      if (e.kind === 'weakwall') { e.damage(game, 3); continue; }
      if (e.kind === 'projectile') { e.dead = true; continue; }
      const force = (1 - d / radius) * 420;
      if (e.vx !== undefined && e.pushable !== false) {
        e.vx += (dx / (d || 1)) * force;
        e.vy += (dy / (d || 1)) * force - 80;
        e.thrown = true;
        e.frozen = 0;
      }
      if (e.isEnemy) e.damage(game, 2, Math.sign(dx) || 1);
      if (e.isBoss) e.damage(game, 1, Math.sign(dx) || 1);
    }
    this.release(game, true);
    game.audio.play('shock');
    game.renderer.shake(0.5);
    game.renderer.doFlash(0.25, '#8ef7ff');
    game.particles.burst(p.cx, p.cy, 30, {
      color: '#8ef7ff', speed: 200, life: 0.55, size: 3, additive: true, glow: 8, round: true,
    });
    this.player.castTimer = 0.4;
    return true;
  }

  build(game) {
    if (!game.hasPower('ultimate')) return false;
    const x = Math.round((this.aimPoint.x - 24) / 8) * 8;
    const y = Math.round(this.aimPoint.y / 8) * 8;
    const rect = { x, y, w: 3 * TILE, h: 10 };
    if (game.level.solidRect(rect)) { game.toast('NO ROOM'); return false; }
    if (game.level.solidEntityAt(rect, null)) { game.toast('NO ROOM'); return false; }
    if (!this.spend(COST.build)) return false;
    const plat = new PsyPlatform(x, y, 3);
    game.spawn(plat);
    game.audio.play('build');
    game.particles.burst(x + 24, y + 5, 16, {
      color: '#8ef7ff', speed: 80, life: 0.5, size: 2, additive: true, glow: 6,
    });
    this.player.castTimer = 0.35;
    return true;
  }

  // ---------------------------------------------------------------- update
  update(dt, game) {
    const input = game.input;
    const p = this.player;
    this.updateAim(game);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.pushFx = Math.max(0, this.pushFx - dt);
    this.overloaded = Math.max(0, this.overloaded - dt);
    if (this.shockFx >= 0) {
      this.shockFx += dt * 2.6;
      if (this.shockFx > 1) this.shockFx = -1;
    }
    if (this.beamFx) {
      this.beamFx.t -= dt;
      if (this.beamFx.t <= 0) this.beamFx = null;
    }

    // Energy: drains while holding, refills quickly when idle.
    const drain = this.held.length * COST.hold;
    this.energy = clamp(this.energy - drain * dt + (this.held.length ? 0 : 26 * dt) + 6 * dt,
      0, this.maxEnergy);
    if (this.energy <= 0 && this.held.length) {
      this.release(game);
      this.overloaded = 0.6;
    }

    // Verbs
    if (input.hit('grab') && this.cooldown <= 0) {
      this.grab(game);
      this.cooldown = 0.12;
    }
    if (input.letGo('grab') && this.held.length && !game.hasPower('chain')) {
      this.release(game);
    }
    if (input.hit('throw')) {
      if (this.held.length) this.throwHeld(game);
      else this.pushBlast(game);
    }
    if (input.hit('stasis')) this.stasis(game);
    if (input.hit('dash')) this.mindDash(game);
    if (input.hit('shock')) this.shockwave(game);
    if (input.hit('build')) this.build(game);

    // Held objects follow the reticle with a spring, fanned out if chained.
    const n = this.held.length;
    for (let i = 0; i < n; i++) {
      const h = this.held[i];
      if (h.dead) { this.held.splice(i, 1); i--; continue; }
      const spread = n > 1 ? (i - (n - 1) / 2) * 22 : 0;
      const px = -this.aim.y * spread;
      const py = this.aim.x * spread;
      const tx = this.aimPoint.x + px - h.w / 2;
      const ty = this.aimPoint.y + py - h.h / 2;
      if (h.kind === 'platform') {
        // Short hysteresis: a rider who bounces a pixel off the deck should
        // not flip the platform back to reticle-following mid-crossing.
        if (h.isRiding(this.player)) h.rideT = 0.4;
        else h.rideT = Math.max(0, (h.rideT || 0) - dt);
        if (h.rideT > 0) h.driveDir(game, this.aim.x, this.aim.y, dt);
        else h.driveTo(game, tx, ty, dt);
      } else {
        const k = 1 - Math.pow(0.0001, dt);
        const nx = lerp(h.x, tx, k);
        const ny = lerp(h.y, ty, k);
        h.vx = (nx - h.x) / Math.max(dt, 0.0001) * 0.35;
        h.vy = (ny - h.y) / Math.max(dt, 0.0001) * 0.35;
        // Held objects still respect terrain so they can't phase through walls.
        h.moveX(game.level, nx - h.x);
        h.moveY(game.level, ny - h.y);
      }
      if (Math.random() < 0.4) {
        game.particles.spawn({
          x: h.cx + (Math.random() - 0.5) * h.w,
          y: h.cy + (Math.random() - 0.5) * h.h,
          vx: 0, vy: -14, life: 0.5, size: 2, color: '#8ef7ff',
          additive: true, glow: 4, drag: 0.9,
        });
      }
      // Held objects hurt enemies they are shoved into.
      for (const en of game.enemies) {
        if (en.dead) continue;
        if (rectsOverlap(h.rect, en.rect) && Math.hypot(h.vx, h.vy) > 90) {
          en.damage(game, 1, Math.sign(h.vx) || 1);
          h.vx *= -0.4;
        }
      }
    }

    // Hint marker for whatever the reticle is over.
    this.targetHint = this.findDevice(game) || this.findTarget(game);
  }

  // ----------------------------------------------------------------- draw
  draw(r, game, time) {
    const p = this.player;
    const hx = p.cx + p.facing * 5;
    const hy = p.cy - 3;

    // Beams to held objects.
    for (const h of this.held) {
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const wob = Math.sin(time * 16 + i) * 2.2;
        const nx = -(h.cy - hy), ny = (h.cx - hx);
        const nl = Math.hypot(nx, ny) || 1;
        const x0 = lerp(hx, h.cx, t0) + (nx / nl) * wob * Math.sin(t0 * Math.PI);
        const y0 = lerp(hy, h.cy, t0) + (ny / nl) * wob * Math.sin(t0 * Math.PI);
        const x1 = lerp(hx, h.cx, t1) + (nx / nl) * wob * Math.sin(t1 * Math.PI);
        const y1 = lerp(hy, h.cy, t1) + (ny / nl) * wob * Math.sin(t1 * Math.PI);
        r.line(x0, y0, x1, y1, `rgba(142,247,255,${0.25 + 0.4 * (1 - t0)})`, 1);
      }
      r.rectOutline(h.x - 2, h.y - 2, h.w + 4, h.h + 4, 'rgba(142,247,255,0.55)');
      r.addGlow(h.cx, h.cy, h.w + 12, '#8ef7ff', 0.35);
    }

    if (this.beamFx) {
      r.line(hx, hy, this.beamFx.x, this.beamFx.y, this.beamFx.color, 1);
    }

    // Reticle.
    const ap = this.aimPoint;
    const canReach = this.energy > 4;
    const col = this.overloaded > 0 ? '#ff6b6b' : (canReach ? '#8ef7ff' : '#5a7a88');
    const spin = time * 2.2;
    for (let i = 0; i < 4; i++) {
      const a = spin + i * Math.PI / 2;
      const r0 = 5, r1 = 8.5;
      r.line(ap.x + Math.cos(a) * r0, ap.y + Math.sin(a) * r0,
        ap.x + Math.cos(a) * r1, ap.y + Math.sin(a) * r1, col, 1);
    }
    r.ring(ap.x, ap.y, 3.5, col, 1);
    r.addGlow(ap.x, ap.y, 14, col, 0.35);

    // Target highlight.
    const t = this.targetHint;
    if (t && !this.held.includes(t)) {
      const a = 0.4 + Math.sin(time * 8) * 0.2;
      r.rectOutline(t.x - 2, t.y - 2, t.w + 4, t.h + 4, `rgba(255,255,255,${a})`);
      const corner = 3;
      r.line(t.x - 2, t.y - 2, t.x - 2 + corner, t.y - 2, '#ffffff');
      r.line(t.x + t.w + 2, t.y + t.h + 2, t.x + t.w + 2 - corner, t.y + t.h + 2, '#ffffff');
    }

    // Push cone.
    if (this.pushFx > 0) {
      const a = this.pushFx / 0.3;
      for (let i = 1; i <= 3; i++) {
        const rr = 20 + i * 14 * (1 - a) + 10;
        r.ctx.save();
        r.ctx.globalCompositeOperation = 'lighter';
        r.ctx.strokeStyle = `rgba(255,146,87,${a * 0.5})`;
        r.ctx.lineWidth = 2;
        r.ctx.beginPath();
        r.ctx.arc(Math.round(p.cx - r.ox), Math.round(p.cy - 2 - r.oy), rr,
          this.pushAngle - 0.8, this.pushAngle + 0.8);
        r.ctx.stroke();
        r.ctx.restore();
      }
    }

    // Shockwave.
    if (this.shockFx >= 0) {
      const f = Math.min(5, Math.floor(this.shockFx * 6));
      r.sprite('fx_shockwave', f, this.shockX - 32, this.shockY - 32,
        { additive: true, alpha: 1 - this.shockFx * 0.6, scale: 1 + this.shockFx * 0.6 });
      r.addGlow(this.shockX, this.shockY, 60 * (0.4 + this.shockFx), '#8ef7ff', 0.4 * (1 - this.shockFx));
    }
  }
}
