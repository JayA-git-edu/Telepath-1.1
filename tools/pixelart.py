"""Tiny dependency-free pixel-art toolkit: RGBA canvas + PNG writer.

Everything the sprite generators need lives here so the art pipeline runs on a
bare Python install (no Pillow, no network).
"""

import struct
import zlib


class Canvas:
    """An RGBA pixel buffer with the handful of primitives our sprites need."""

    def __init__(self, w, h, fill=(0, 0, 0, 0)):
        self.w = w
        self.h = h
        self.px = [list(fill) for _ in range(w * h)]

    # ---- low level -------------------------------------------------------
    def set(self, x, y, c):
        if c is None or len(c) < 4 or c[3] == 0:
            return
        x = int(x)
        y = int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            i = y * self.w + x
            if c[3] == 255:
                self.px[i] = list(c)
            else:
                self.px[i] = list(blend(self.px[i], c))

    def get(self, x, y):
        x = int(x)
        y = int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            return tuple(self.px[y * self.w + x])
        return (0, 0, 0, 0)

    def alpha(self, x, y):
        return self.get(x, y)[3]

    # ---- primitives ------------------------------------------------------
    def rect(self, x, y, w, h, c):
        for j in range(int(h)):
            for i in range(int(w)):
                self.set(x + i, y + j, c)

    def rect_outline(self, x, y, w, h, c):
        for i in range(int(w)):
            self.set(x + i, y, c)
            self.set(x + i, y + h - 1, c)
        for j in range(int(h)):
            self.set(x, y + j, c)
            self.set(x + w - 1, y + j, c)

    def ellipse(self, cx, cy, rx, ry, c):
        if rx <= 0 or ry <= 0:
            return
        for j in range(int(cy - ry - 1), int(cy + ry + 2)):
            for i in range(int(cx - rx - 1), int(cx + rx + 2)):
                dx = (i + 0.5 - cx) / rx
                dy = (j + 0.5 - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    self.set(i, j, c)

    def circle(self, cx, cy, r, c):
        self.ellipse(cx, cy, r, r, c)

    def line(self, x0, y0, x1, y1, c, thick=1):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx = abs(x1 - x0)
        dy = -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            if thick <= 1:
                self.set(x0, y0, c)
            else:
                r = thick / 2.0
                self.circle(x0 + 0.5, y0 + 0.5, r, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def blit(self, other, ox, oy):
        for y in range(other.h):
            for x in range(other.w):
                self.set(ox + x, oy + y, other.get(x, y))

    def copy(self):
        c = Canvas(self.w, self.h)
        c.px = [list(p) for p in self.px]
        return c

    def flip_x(self):
        c = Canvas(self.w, self.h)
        for y in range(self.h):
            for x in range(self.w):
                c.px[y * self.w + (self.w - 1 - x)] = list(self.px[y * self.w + x])
        return c

    # ---- effects ---------------------------------------------------------
    def outline(self, c, diagonal=False):
        """Add a 1px border around every opaque cluster (drawn underneath)."""
        marks = []
        offs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diagonal:
            offs += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
        for y in range(self.h):
            for x in range(self.w):
                if self.alpha(x, y) != 0:
                    continue
                if any(self.alpha(x + dx, y + dy) > 128 for dx, dy in offs):
                    marks.append((x, y))
        for x, y in marks:
            self.px[y * self.w + x] = list(c)

    def shade_top(self, light, rows=1):
        """Lighten the topmost opaque pixel of each column (cheap rim light)."""
        for x in range(self.w):
            hits = 0
            for y in range(self.h):
                if self.alpha(x, y) > 200:
                    self.px[y * self.w + x] = list(mix(self.get(x, y), light, 0.45))
                    hits += 1
                    if hits >= rows:
                        break

    def replace(self, src, dst):
        for i, p in enumerate(self.px):
            if tuple(p[:3]) == tuple(src[:3]) and p[3] > 0:
                self.px[i] = [dst[0], dst[1], dst[2], p[3]]

    def tint(self, c, amount):
        for i, p in enumerate(self.px):
            if p[3] > 0:
                self.px[i] = list(mix(p, c, amount))


# ---- colour helpers ------------------------------------------------------
def blend(dst, src):
    sa = src[3] / 255.0
    da = dst[3] / 255.0
    oa = sa + da * (1 - sa)
    if oa <= 0:
        return (0, 0, 0, 0)
    out = [int(round((src[i] * sa + dst[i] * da * (1 - sa)) / oa)) for i in range(3)]
    return (out[0], out[1], out[2], int(round(oa * 255)))


def mix(a, b, t):
    return (
        int(round(a[0] + (b[0] - a[0]) * t)),
        int(round(a[1] + (b[1] - a[1]) * t)),
        int(round(a[2] + (b[2] - a[2]) * t)),
        a[3] if len(a) > 3 else 255,
    )


def shade(c, amount):
    """amount > 0 lightens, < 0 darkens."""
    if amount >= 0:
        return mix(c, (255, 255, 255, 255), amount)
    return mix(c, (0, 0, 0, 255), -amount)


def hexc(s, a=255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


# ---- png -----------------------------------------------------------------
def write_png(path, canvas):
    raw = bytearray()
    for y in range(canvas.h):
        raw.append(0)  # filter type 0
        row = canvas.px[y * canvas.w:(y + 1) * canvas.w]
        for p in row:
            raw += bytes((p[0] & 255, p[1] & 255, p[2] & 255, p[3] & 255))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", canvas.w, canvas.h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def sheet(frames, cols=None):
    """Pack equal-size frames into a horizontal (or grid) spritesheet."""
    if not frames:
        raise ValueError("no frames")
    fw, fh = frames[0].w, frames[0].h
    cols = cols or len(frames)
    rows = (len(frames) + cols - 1) // cols
    out = Canvas(fw * cols, fh * rows)
    for i, f in enumerate(frames):
        out.blit(f, (i % cols) * fw, (i // cols) * fh)
    return out
