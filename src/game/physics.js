// AABB actors with sub-pixel accumulation, resolved against tiles and solids.

export const TILE = 16;

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class Actor {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.rx = 0; this.ry = 0;      // sub-pixel remainders
    this.onGround = false;
    this.dead = false;
    this.solid = false;            // does it block other actors?
    this.ignoreSolids = false;
    this.riding = null;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  setCenter(cx, cy) {
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
  }

  /** True if the actor's box (offset by dx,dy) hits terrain or a solid. */
  collides(level, dx = 0, dy = 0) {
    const r = { x: this.x + dx, y: this.y + dy, w: this.w, h: this.h };
    if (level.solidRect(r)) return true;
    if (!this.ignoreSolids && level.solidEntityAt(r, this)) return true;
    return false;
  }

  moveX(level, amount, onCollide) {
    this.rx += amount;
    let move = Math.round(this.rx);
    if (move === 0) return false;
    this.rx -= move;
    const sign = Math.sign(move);
    while (move !== 0) {
      if (!this.collides(level, sign, 0)) {
        this.x += sign;
        move -= sign;
      } else {
        if (onCollide) onCollide(sign);
        return true;
      }
    }
    return false;
  }

  moveY(level, amount, onCollide) {
    this.ry += amount;
    let move = Math.round(this.ry);
    if (move === 0) return false;
    this.ry -= move;
    const sign = Math.sign(move);
    while (move !== 0) {
      if (!this.collides(level, 0, sign)) {
        this.y += sign;
        move -= sign;
      } else {
        if (onCollide) onCollide(sign);
        return true;
      }
    }
    return false;
  }

  /** Teleport, ignoring collision. */
  place(x, y) {
    this.x = x; this.y = y; this.rx = this.ry = 0;
  }

  groundCheck(level) {
    this.onGround = this.collides(level, 0, 1);
    return this.onGround;
  }

  distanceTo(other) {
    return Math.hypot(this.cx - other.cx, this.cy - other.cy);
  }
}

/**
 * A solid that moves and carries/pushes actors (platforms, doors).
 * Riders are actors standing on top or overlapping horizontally.
 */
export class Solid extends Actor {
  constructor(x, y, w, h) {
    super(x, y, w, h);
    this.solid = true;
  }

  /** Move by (dx,dy) in world space, carrying riders and pushing blocked actors. */
  moveSolid(level, dx, dy, actors) {
    const riders = actors.filter((a) => a !== this && !a.dead && this.isRiding(a));
    this.collidable = false;
    if (dx !== 0) {
      this.x += dx;
      for (const a of actors) {
        if (a === this || a.dead || a.ignoreSolids) continue;
        if (rectsOverlap(this.rect, a.rect)) {
          // push out of the way
          const push = dx > 0
            ? this.x + this.w - a.x
            : this.x - (a.x + a.w);
          a.moveX(level, push, () => { if (a.squish) a.squish(); });
        } else if (riders.includes(a)) {
          a.moveX(level, dx);
        }
      }
    }
    if (dy !== 0) {
      this.y += dy;
      for (const a of actors) {
        if (a === this || a.dead || a.ignoreSolids) continue;
        if (rectsOverlap(this.rect, a.rect)) {
          const push = dy > 0
            ? this.y + this.h - a.y
            : this.y - (a.y + a.h);
          a.moveY(level, push, () => { if (a.squish) a.squish(); });
        } else if (riders.includes(a)) {
          a.moveY(level, dy);
        }
      }
    }
    this.collidable = true;
  }

  isRiding(a) {
    return (
      a.x + a.w > this.x && a.x < this.x + this.w &&
      Math.abs((a.y + a.h) - this.y) <= 1.5
    );
  }
}

export function approach(value, target, amount) {
  return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
