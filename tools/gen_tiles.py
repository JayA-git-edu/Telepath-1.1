"""Generates 16px autotile sheets and parallax backdrops for every world.

Each world sheet is 16 tiles wide: the tile index is a 4-bit neighbour mask
(1=solid above, 2=right, 4=below, 8=left), so the renderer can pick edges
without any hand-authored tile picking. Rows 0-2 are terrain variants,
row 3 is the background (non-colliding) fill.
"""

import math
import os

from pixelart import Canvas, hexc, mix, saturate, sheet, shade, write_png

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
T = 16


def noise(x, y, seed=0):
    """Deterministic value noise in [0,1)."""
    n = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65536.0


# Palettes lean saturated on purpose: the lighting layer eats a lot of colour,
# so the source art has to start louder than it should look.
WORLDS = {
    "facility": {
        "base": "2f4a7d", "dark": "1b2c4f", "light": "4d78bd",
        "cap": "34e8e0", "cap_hi": "b6fffb", "accent": "ff7a4f",
        "style": "panel", "detail": "circuit",
        "open_sky": False, "sky": ["0b1836", "14306b", "2a63b4"], "glow": "34e8e0",
        "horizon": "4fd8ff",
    },
    "city": {
        "base": "3b2270", "dark": "230f47", "light": "5c3aa8",
        "cap": "ff3ea5", "cap_hi": "ffb0dd", "accent": "35e6ff",
        "style": "brick", "detail": "neon",
        "sky": ["190a33", "50166f", "b02a86"], "glow": "ff3ea5",
        "horizon": "ff6ec7",
    },
    "caves": {
        "base": "5a2a8f", "dark": "331350", "light": "8348c9",
        "cap": "c76bff", "cap_hi": "f0c8ff", "accent": "3dffc4",
        "style": "rock", "detail": "crystal",
        "open_sky": False, "sky": ["190a2e", "3d1560", "74239c"[:6]], "glow": "c76bff",
        "horizon": "9b4dff",
    },
    "temple": {
        "base": "b57a2e", "dark": "6f4114", "light": "e6b258",
        "cap": "ffd34a", "cap_hi": "fff3b8", "accent": "2ee0a0",
        "style": "brick", "detail": "glyph",
        "open_sky": False, "sky": ["2e1508", "7a3410", "d97a24"], "glow": "ffb43a",
        "horizon": "ffb24a",
    },
    "frost": {
        "base": "2f6fc4", "dark": "1c4581", "light": "6fb2f2",
        "cap": "e8fbff", "cap_hi": "ffffff", "accent": "46e0ff",
        "style": "rock", "detail": "frost",
        "sky": ["0d2450", "2467bd", "8fd0f7"], "glow": "9fe4ff",
        "horizon": "bfeaff",
    },
    "void": {
        "base": "3a1a63", "dark": "1c0937", "light": "6432a3",
        "cap": "3dffd8", "cap_hi": "ccfff4", "accent": "ff45e0",
        "style": "panel", "detail": "rune",
        "open_sky": False, "sky": ["050310", "1a0840", "45156e"], "glow": "3dffd8",
        "horizon": "b03cff",
    },
}


def tile(mask, cfg, variant=0, background=False):
    base = hexc(cfg["base"])
    dark = hexc(cfg["dark"])
    light = hexc(cfg["light"])
    cap = hexc(cfg["cap"])
    cap_hi = hexc(cfg["cap_hi"])
    accent = hexc(cfg["accent"])
    if background:
        # Push the backdrop away in value *and* saturation so foreground reads.
        base = mix(base, hexc("0d0a1c"), 0.74)
        dark = mix(dark, hexc("0d0a1c"), 0.78)
        light = mix(light, hexc("0d0a1c"), 0.62)
        cap = mix(cap, hexc("0d0a1c"), 0.6)
        cap_hi = mix(cap_hi, hexc("0d0a1c"), 0.55)
        accent = mix(accent, hexc("0d0a1c"), 0.6)

    c = Canvas(T, T)
    seed = variant * 97 + 3

    # --- body: vertical gradient, then noise grain -------------------------
    for y in range(T):
        t = y / (T - 1.0)
        row = mix(mix(base, light, 0.22 * (1 - t)), dark, 0.38 * t)
        for x in range(T):
            n = noise(x, y, seed)
            col = row
            if n > 0.86:
                col = mix(row, light, 0.45)
            elif n < 0.16:
                col = mix(row, dark, 0.45)
            c.set(x, y, col)

    style = cfg["style"]
    if style == "brick":
        for row_y in range(0, T, 5):
            off = 0 if (row_y // 5 + variant) % 2 == 0 else 4
            for x in range(T):
                c.set(x, row_y, mix(dark, base, 0.15))
                if row_y + 1 < T:
                    c.set(x, row_y + 1, mix(base, light, 0.22))
            for y in range(row_y, min(T, row_y + 5)):
                c.set((off + 8) % T, y, mix(dark, base, 0.2))
    elif style == "panel":
        c.rect_outline(1, 1, T - 2, T - 2, mix(base, dark, 0.55))
        c.rect(2, 2, T - 4, 1, mix(base, light, 0.35))
        for i in range(3, T - 3, 4):
            c.set(2, i, mix(light, base, 0.3))
            c.set(T - 3, i, mix(dark, base, 0.3))
    elif style == "rock":
        for i in range(4):
            cx = 3 + noise(variant, i, 11) * 10
            cy = 3 + noise(variant, i, 23) * 10
            r = 1.6 + noise(variant, i, 31) * 2.4
            c.ellipse(cx, cy, r, r * 0.8, mix(dark, base, 0.35) if i % 2 else mix(light, base, 0.4))
            c.ellipse(cx - 0.6, cy - 0.6, r * 0.6, r * 0.45, mix(light, base, 0.25) if i % 2 else base)

    _detail(c, cfg, variant, accent, cap, light, dark, background)

    up = mask & 1
    right = mask & 2
    down = mask & 4
    leftn = mask & 8

    # --- top cap ------------------------------------------------------------
    if not up:
        for x in range(T):
            h = 4 + (1 if noise(x, variant, 7) > 0.62 else 0)
            for y in range(h):
                if y == 0:
                    col = cap_hi
                elif y == 1:
                    col = cap
                elif y == 2:
                    col = mix(cap, base, 0.45)
                else:
                    col = mix(cap, dark, 0.6)
                c.set(x, y, col)
            # a soft bleed of cap colour into the face below the lip
            c.set(x, h, mix(c.get(x, h), cap, 0.28))
        for x in range(T):
            if noise(x, variant, 19) > 0.78:
                h = 4 + (1 if noise(x, variant, 7) > 0.62 else 0)
                c.set(x, h + 1, mix(cap, dark, 0.72))

    # --- bottom / sides -----------------------------------------------------
    if not down:
        for x in range(T):
            c.set(x, T - 1, mix(dark, hexc("000008"), 0.35))
            c.set(x, T - 2, mix(c.get(x, T - 2), dark, 0.55))
    for side, present in ((0, leftn), (1, right)):
        if present:
            continue
        x0 = 0 if side == 0 else T - 1
        x1 = 1 if side == 0 else T - 2
        edge = mix(dark, hexc("000008"), 0.25)
        for y in range(T):
            c.set(x0, y, edge)
            if y > 3 or up:
                c.set(x1, y, mix(c.get(x1, y), dark, 0.45))
        # the lit side catches a rim
        if side == 0:
            for y in range(4 if not up else 0, T - 1):
                c.set(x1, y, mix(c.get(x1, y), light, 0.3))
        if not up:
            c.set(x0, 0, mix(cap, dark, 0.3))
            c.set(x0, 1, mix(cap, dark, 0.45))

    if not background:
        c.grade(0.16, 0.02)
    return c


def _detail(c, cfg, variant, accent, cap, light, dark, background):
    """The per-world flourish that stops every tile looking like the last."""
    kind = cfg["detail"]
    if variant == 0 and kind not in ("frost",):
        return                      # keep a plain variant so walls can breathe
    n = lambda a, b: noise(variant, a, b)   # noqa: E731
    if kind == "circuit":
        y = 4 + int(n(1, 5) * 8)
        x0 = 1 + int(n(2, 6) * 5)
        c.rect(x0, y, 6 + int(n(3, 7) * 5), 1, mix(light, accent, 0.5))
        c.rect(x0 + 2, y - 3, 1, 3, mix(light, accent, 0.35))
        c.rect(x0 + 2, y - 4, 2, 2, accent)
        if not background:
            c.set(x0 + 2, y - 4, hexc("ffffff"))
    elif kind == "neon":
        x = 2 + int(n(1, 5) * 11)
        y0 = 3 + int(n(2, 6) * 5)
        h = 4 + int(n(3, 7) * 5)
        c.rect(x, y0, 1, h, mix(cap, hexc("ffffff"), 0.35))
        c.rect(x + 1, y0, 1, h, mix(cap, dark, 0.45))
    elif kind == "crystal":
        cx = 3 + int(n(1, 5) * 9)
        cy = 4 + int(n(2, 6) * 7)
        h = 3 + int(n(3, 7) * 3)
        for k in range(h):
            w = max(1, (h - k) // 2 + 1)
            c.rect(cx - w // 2, cy + k, w, 1, mix(accent, hexc("ffffff"), 0.4 - k * 0.1))
        c.set(cx, cy, hexc("ffffff") if not background else mix(accent, light, 0.5))
    elif kind == "glyph":
        gx = 3 + int(n(1, 5) * 8)
        gy = 4 + int(n(2, 6) * 7)
        c.rect(gx, gy, 4, 1, mix(cap, dark, 0.25))
        c.rect(gx + 1, gy + 1, 1, 3, mix(cap, dark, 0.25))
        c.rect(gx, gy + 4, 3, 1, mix(cap, dark, 0.4))
    elif kind == "frost":
        for i in range(3):
            x = int(n(i, 5) * 15)
            y = 2 + int(n(i, 6) * 12)
            c.set(x, y, mix(cap, hexc("ffffff"), 0.6))
            c.set(x + 1, y + 1, mix(cap, light, 0.4))
    elif kind == "rune":
        rx = 4 + int(n(1, 5) * 7)
        ry = 5 + int(n(2, 6) * 6)
        for dx, dy in ((0, 0), (2, 0), (1, 1), (0, 2), (2, 2)):
            c.set(rx + dx, ry + dy, mix(accent, light, 0.35))
        if not background:
            c.set(rx + 1, ry + 1, accent)


def gen_tileset(name, cfg):
    frames = []
    for variant in range(3):
        for mask in range(16):
            frames.append(tile(mask, cfg, variant=variant))
    for mask in range(16):
        frames.append(tile(mask, cfg, variant=1, background=True))
    write_png(os.path.join(OUT, f"tiles_{name}.png"), sheet(frames, cols=16))


# ------------------------------------------------------------- backgrounds
BW, BH = 480, 270


def gen_bg(name, cfg):
    sky = [hexc(s) for s in cfg["sky"]]
    glow = hexc(cfg["glow"])
    horizon = hexc(cfg["horizon"])

    # --- layer 0: sky ------------------------------------------------------
    l0 = Canvas(BW, BH)
    hz = int(BH * 0.62)                     # where the light pools
    for y in range(BH):
        t = y / (BH - 1)
        if t < 0.45:
            col = mix(sky[0], sky[1], t / 0.45)
        else:
            col = mix(sky[1], sky[2], (t - 0.45) / 0.55)
        # horizon bloom: the sky gets hot near the light source
        d = abs(y - hz) / (BH * 0.55)
        bloom = 0.55 if cfg.get("open_sky", True) else 0.3
        col = mix(col, horizon, max(0.0, (1 - d) ** 3) * bloom)
        l0.rect(0, y, BW, 1, col)

    # drifting haze bands add depth without costing a layer
    for i in range(7):
        by = int(noise(i, 3, 21) * BH * 0.8) + 20
        bh = 3 + int(noise(i, 4, 22) * 7)
        a = 16 + int(noise(i, 5, 23) * 26)
        for y in range(by, min(BH, by + bh)):
            l0.rect(0, y, BW, 1, (horizon[0], horizon[1], horizon[2], a))

    for i in range(150):
        x = noise(i, 1, 5) * BW
        y = noise(i, 2, 9) * BH * 0.7
        b = noise(i, 3, 13)
        col = mix(hexc("ffffff"), glow, b)
        l0.set(x, y, (col[0], col[1], col[2], int(70 + b * 185)))
        if b > 0.94:
            l0.set(x + 1, y, (col[0], col[1], col[2], 90))
            l0.set(x, y + 1, (col[0], col[1], col[2], 90))

    if name in ("caves", "void"):
        for i in range(26):
            x = noise(i, 7, 77) * BW
            y = noise(i, 8, 88) * BH
            r = 8 + noise(i, 9, 99) * 22
            l0.ellipse(x, y, r, r, (glow[0], glow[1], glow[2], 12))
            l0.ellipse(x, y, r * 0.4, r * 0.4, (glow[0], glow[1], glow[2], 16))
    else:
        cx, cy = BW * 0.74, BH * 0.2
        for r, a in ((40, 14), (30, 20), (20, 34), (13, 70)):
            l0.circle(cx, cy, r, (glow[0], glow[1], glow[2], a))
        l0.circle(cx, cy, 9, mix(hexc("ffffff"), glow, 0.25))
        l0.circle(cx - 2, cy - 2, 5, hexc("ffffff"))

    # --- layer 1: far silhouettes -----------------------------------------
    l1 = Canvas(BW, BH)
    far = mix(sky[2], hexc("0a0616"), 0.62)
    far_rim = mix(far, horizon, 0.45)
    if name == "city":
        x = 0
        i = 0
        while x < BW:
            w = 20 + int(noise(i, 0, 3) * 34)
            h = 56 + int(noise(i, 1, 4) * 110)
            l1.rect(x, BH - h, w, h, far)
            l1.rect(x, BH - h, w, 1, far_rim)
            for wy in range(BH - h + 5, BH - 4, 7):
                for wx in range(x + 3, x + w - 3, 6):
                    if noise(wx, wy, 17) > 0.42:
                        lit = mix(glow, hexc("ffe9a8"), noise(wx, wy, 31) * 0.7)
                        l1.rect(wx, wy, 2, 3, (lit[0], lit[1], lit[2], 190))
            x += w + 2 + int(noise(i, 2, 5) * 8)
            i += 1
    elif name in ("frost", "temple"):
        for peak in range(8):
            px = peak * 62 - 20 + noise(peak, 0, 2) * 24
            ph = 78 + noise(peak, 1, 6) * 80
            for dx in range(-90, 91):
                h = ph - abs(dx) * 1.15
                if h > 0:
                    l1.rect(px + dx, BH - h, 1, h, far)
                    l1.set(px + dx, BH - h, far_rim)
        if name == "frost":
            for peak in range(8):
                px = peak * 62 - 20 + noise(peak, 0, 2) * 24
                ph = 78 + noise(peak, 1, 6) * 80
                for dx in range(-22, 23):
                    h = ph - abs(dx) * 1.15
                    if h > 0:
                        snow = mix(far, hexc("eaf6ff"), 0.62)
                        for k in range(min(14, int(h))):
                            l1.set(px + dx, BH - h + k, mix(snow, far, k / 14.0))
    else:
        for i in range(11):
            x = i * 44 - 12
            w = 36
            h = 66 + noise(i, 3, 21) * 84
            l1.rect(x, BH - h, w, h, far)
            l1.ellipse(x + w / 2, BH - h, w / 2, 12, far)
            l1.rect(x, BH - h - 1, w, 1, (far_rim[0], far_rim[1], far_rim[2], 150))
            if noise(i, 4, 22) > 0.45:
                l1.rect(x + w // 2 - 1, BH - h + 14, 2, h - 24, (glow[0], glow[1], glow[2], 70))

    # --- layer 2: near silhouettes ----------------------------------------
    l2 = Canvas(BW, BH)
    near = mix(sky[2], hexc("05030f"), 0.82)
    near_rim = mix(near, glow, 0.35)
    for i in range(16):
        x = i * 32 - 10
        h = 40 + noise(i, 5, 31) * 56
        w = 24 + noise(i, 6, 32) * 18
        l2.rect(x, BH - h, w, h, near)
        l2.ellipse(x + w / 2, BH - h + 1, w / 2, 6, near)
        l2.rect(x, BH - h, w, 1, near_rim)
        if noise(i, 7, 33) > 0.5:
            l2.rect(x + 5, BH - h + 10, 3, 4, (glow[0], glow[1], glow[2], 140))

    for idx, layer in enumerate((l0, l1, l2)):
        layer.grade(0.14, 0.0)
        write_png(os.path.join(OUT, f"bg_{name}_{idx}.png"), layer)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, cfg in WORLDS.items():
        gen_tileset(name, cfg)
        gen_bg(name, cfg)
        print("world:", name)


if __name__ == "__main__":
    main()
