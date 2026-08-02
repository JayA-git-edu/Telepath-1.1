"""Generates 16px autotile sheets and parallax backdrops for every world.

Each world sheet is 16 tiles wide: the tile index is a 4-bit neighbour mask
(1=solid above, 2=right, 4=below, 8=left), so the renderer can pick edges
without any hand-authored tile picking. Row 0 = solid terrain,
row 1 = background (non-colliding) fill.
"""

import math
import os

from pixelart import Canvas, hexc, mix, shade, sheet, write_png

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
T = 16


def noise(x, y, seed=0):
    """Deterministic value noise in [0,1)."""
    n = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65536.0


WORLDS = {
    "facility": {
        "base": "3f4a63",
        "dark": "26304a",
        "light": "5a6c8c",
        "cap": "45d6d0",
        "cap_hi": "9ffff4",
        "accent": "ff7a5c",
        "style": "panel",
        "sky": ["101828", "17233d", "1f3352"],
        "glow": "45d6d0",
    },
    "city": {
        "base": "35304f",
        "dark": "1e1b30",
        "light": "50496e",
        "cap": "ff4fa3",
        "cap_hi": "ffa8d4",
        "accent": "4fe0ff",
        "style": "brick",
        "sky": ["120e26", "241a45", "45215e"],
        "glow": "ff4fa3",
    },
    "caves": {
        "base": "4a3563",
        "dark": "2b1d3d",
        "light": "6a4d89",
        "cap": "b06bff",
        "cap_hi": "e0b6ff",
        "accent": "6bffd5",
        "style": "rock",
        "sky": ["150d24", "241640", "3a2260"],
        "glow": "b06bff",
    },
    "temple": {
        "base": "8a6b46",
        "dark": "5a4229",
        "light": "b08f63",
        "cap": "ffd166",
        "cap_hi": "fff0b8",
        "accent": "5ad6a8",
        "style": "brick",
        "sky": ["2a1d18", "4a3226", "76503a"],
        "glow": "ffd166",
    },
    "frost": {
        "base": "44618a",
        "dark": "2a3f60",
        "light": "6b8cba",
        "cap": "e8f8ff",
        "cap_hi": "ffffff",
        "accent": "7ee0ff",
        "style": "rock",
        "sky": ["16233d", "24406b", "4a7ba8"],
        "glow": "aee8ff",
    },
    "void": {
        "base": "241c3d",
        "dark": "120d22",
        "light": "3c2f60",
        "cap": "58ffe0",
        "cap_hi": "d0fff6",
        "accent": "ff5cf0",
        "style": "panel",
        "sky": ["07060f", "0f0a1e", "1a1030"],
        "glow": "58ffe0",
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
        base = mix(base, hexc("0b0c18"), 0.5)
        dark = mix(dark, hexc("0b0c18"), 0.5)
        light = mix(light, hexc("0b0c18"), 0.4)

    c = Canvas(T, T)
    seed = variant * 97 + 3

    # --- body texture -------------------------------------------------------
    for y in range(T):
        for x in range(T):
            n = noise(x, y, seed)
            col = base
            if n > 0.82:
                col = light
            elif n < 0.2:
                col = dark
            c.set(x, y, col)

    style = cfg["style"]
    if style == "brick":
        for row in range(0, T, 5):
            off = 0 if (row // 5 + variant) % 2 == 0 else 4
            for x in range(T):
                c.set(x, row, dark)
            for y in range(row, min(T, row + 5)):
                c.set((off + 8) % T, y, dark)
    elif style == "panel":
        c.rect_outline(1, 1, T - 2, T - 2, mix(base, dark, 0.5))
        for i in range(2, T - 2, 4):
            c.set(2, i, light)
            c.set(T - 3, i, light)
        if variant == 2:
            c.rect(6, 6, 4, 4, mix(base, dark, 0.7))
            c.rect(7, 7, 2, 2, accent)
    elif style == "rock":
        for i in range(3):
            cx = 3 + noise(variant, i, 11) * 10
            cy = 3 + noise(variant, i, 23) * 10
            r = 1.5 + noise(variant, i, 31) * 2.0
            c.ellipse(cx, cy, r, r * 0.8, dark if i % 2 else light)

    up = mask & 1
    right = mask & 2
    down = mask & 4
    leftn = mask & 8

    # --- edges --------------------------------------------------------------
    if not up:
        capdepth = 4
        for x in range(T):
            h = capdepth + (1 if noise(x, variant, 7) > 0.65 else 0)
            for y in range(h):
                col = cap_hi if y == 0 else cap
                if y >= 2:
                    col = mix(cap, dark, 0.55)
                c.set(x, y, col)
        # drips of cap colour running down the face
        for x in range(T):
            if noise(x, variant, 19) > 0.8:
                c.set(x, 4 + (1 if noise(x, variant, 7) > 0.65 else 0), mix(cap, dark, 0.7))
    if not down:
        for x in range(T):
            c.set(x, T - 1, dark)
            if noise(x, variant, 41) > 0.6:
                c.set(x, T - 2, mix(base, dark, 0.6))
    for side, present in ((0, leftn), (1, right)):
        if present:
            continue
        x0 = 0 if side == 0 else T - 1
        x1 = 1 if side == 0 else T - 2
        for y in range(T):
            c.set(x0, y, dark)
            if y > 2 or up:
                c.set(x1, y, mix(base, dark, 0.45))
        if not up:
            c.set(x0, 0, mix(cap, dark, 0.35))
            c.set(x0, 1, mix(cap, dark, 0.5))

    # inner corner sparkle for lit worlds
    if not up and variant % 3 == 0:
        c.set(3, 1, cap_hi)
        c.set(11, 2, cap_hi)
    return c


def gen_tileset(name, cfg):
    frames = []
    for variant in range(3):
        for mask in range(16):
            frames.append(tile(mask, cfg, variant=variant))
    for mask in range(16):
        frames.append(tile(mask, cfg, variant=0, background=True))
    write_png(os.path.join(OUT, f"tiles_{name}.png"), sheet(frames, cols=16))


# ------------------------------------------------------------- backgrounds
BW, BH = 480, 270


def gen_bg(name, cfg):
    sky = [hexc(s) for s in cfg["sky"]]
    glow = hexc(cfg["glow"])

    # layer 0: sky gradient + celestial detail
    l0 = Canvas(BW, BH)
    for y in range(BH):
        t = y / (BH - 1)
        if t < 0.5:
            col = mix(sky[0], sky[1], t * 2)
        else:
            col = mix(sky[1], sky[2], (t - 0.5) * 2)
        l0.rect(0, y, BW, 1, col)
    for i in range(90):
        x = noise(i, 1, 5) * BW
        y = noise(i, 2, 9) * BH * 0.75
        b = noise(i, 3, 13)
        col = mix(hexc("ffffff"), glow, b)
        l0.set(x, y, (col[0], col[1], col[2], int(90 + b * 165)))
    if name in ("caves", "void"):
        for i in range(24):
            x = noise(i, 7, 77) * BW
            y = noise(i, 8, 88) * BH
            r = 6 + noise(i, 9, 99) * 16
            l0.ellipse(x, y, r, r, (glow[0], glow[1], glow[2], 14))
    else:
        cx, cy = BW * 0.72, BH * 0.24
        l0.circle(cx, cy, 22, (glow[0], glow[1], glow[2], 22))
        l0.circle(cx, cy, 13, (glow[0], glow[1], glow[2], 40))
        l0.circle(cx, cy, 8, mix(hexc("ffffff"), glow, 0.4))

    # layer 1: far silhouettes
    l1 = Canvas(BW, BH)
    far = mix(sky[2], hexc("000010"), 0.45)
    if name == "city":
        x = 0
        i = 0
        while x < BW:
            w = 16 + int(noise(i, 0, 3) * 26)
            h = 40 + int(noise(i, 1, 4) * 80)
            l1.rect(x, BH - h, w, h, far)
            for wy in range(BH - h + 4, BH - 4, 6):
                for wx in range(x + 3, x + w - 3, 5):
                    if noise(wx, wy, 17) > 0.45:
                        l1.rect(wx, wy, 2, 2, (glow[0], glow[1], glow[2], 150))
            x += w + 2 + int(noise(i, 2, 5) * 6)
            i += 1
    elif name in ("frost", "temple"):
        for peak in range(7):
            px = peak * 52 - 20 + noise(peak, 0, 2) * 20
            ph = 60 + noise(peak, 1, 6) * 60
            for dx in range(-70, 71):
                h = ph - abs(dx) * 1.15
                if h > 0:
                    l1.rect(px + dx, BH - h, 1, h, far)
        if name == "frost":
            for peak in range(7):
                px = peak * 52 - 20 + noise(peak, 0, 2) * 20
                ph = 60 + noise(peak, 1, 6) * 60
                for dx in range(-16, 17):
                    h = ph - abs(dx) * 1.15
                    if h > 0:
                        l1.rect(px + dx, BH - h, 1, min(10, h), mix(far, hexc("ffffff"), 0.55))
    else:  # caves, facility, void: layered arches / strata
        for i in range(9):
            x = i * 40 - 10
            w = 34
            h = 50 + noise(i, 3, 21) * 70
            l1.rect(x, BH - h, w, h, far)
            l1.ellipse(x + w / 2, BH - h, w / 2, 10, far)
            if noise(i, 4, 22) > 0.5:
                l1.rect(x + w // 2 - 1, BH - h + 12, 2, h - 20, (glow[0], glow[1], glow[2], 60))

    # layer 2: near silhouettes
    l2 = Canvas(BW, BH)
    near = mix(sky[2], hexc("000008"), 0.72)
    for i in range(14):
        x = i * 26 - 8
        h = 30 + noise(i, 5, 31) * 46
        w = 20 + noise(i, 6, 32) * 14
        l2.rect(x, BH - h, w, h, near)
        l2.ellipse(x + w / 2, BH - h + 1, w / 2, 5, near)
        if noise(i, 7, 33) > 0.55:
            l2.rect(x + 4, BH - h + 8, 3, 3, (glow[0], glow[1], glow[2], 110))

    for idx, layer in enumerate((l0, l1, l2)):
        write_png(os.path.join(OUT, f"bg_{name}_{idx}.png"), layer)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, cfg in WORLDS.items():
        gen_tileset(name, cfg)
        gen_bg(name, cfg)
        print("world:", name)


if __name__ == "__main__":
    main()
