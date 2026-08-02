"""Generates props, hazards, enemies, bosses, FX and UI sprites."""

import math
import os

from pixelart import Canvas, hexc, mix, sheet, shade, write_png

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")

LINE = hexc("1a1226")
WHITE = hexc("ffffff")
PSY = hexc("8ef7ff")


def noise(x, y, seed=0):
    n = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65536.0


def finish(c, outline=True, rim=True):
    if rim:
        c.shade_top(WHITE, 1)
    if outline:
        c.outline(LINE)
    return c


# =========================================================== props
def crate(kind="wood"):
    c = Canvas(16, 16)
    if kind == "wood":
        base, dark, light, band = hexc("c08b4a"), hexc("8a5c2a"), hexc("e0b070"), hexc("6b4520")
    elif kind == "metal":
        base, dark, light, band = hexc("8a94ad"), hexc("515a75"), hexc("c2cbe0"), hexc("39405a")
    else:  # psychic / light crate
        base, dark, light, band = hexc("3fd2c8"), hexc("1e7d80"), hexc("a8fff4"), hexc("14565c")
    c.rect(1, 1, 14, 14, base)
    c.rect_outline(1, 1, 14, 14, band)
    for i in range(3, 14, 4):
        c.rect(1, i, 14, 1, dark)
    c.line(2, 2, 13, 13, light)
    c.line(13, 2, 2, 13, light)
    c.rect(2, 2, 3, 1, light)
    c.rect(2, 2, 1, 3, light)
    if kind == "psy":
        c.rect(6, 6, 4, 4, hexc("d9fffb"))
    return finish(c, rim=False)


def boulder():
    c = Canvas(24, 24)
    base, dark, light = hexc("6b6f80"), hexc("3d4152"), hexc("9aa0b5")
    c.ellipse(12, 13, 10.5, 9.5, base)
    for i in range(10):
        x = 4 + noise(i, 1, 3) * 16
        y = 5 + noise(i, 2, 5) * 14
        r = 1.4 + noise(i, 3, 7) * 2.2
        c.ellipse(x, y, r, r * 0.85, dark if i % 2 else light)
    c.ellipse(9, 8, 4, 3, light)
    return finish(c)


def orb():
    frames = []
    for i in range(6):
        c = Canvas(16, 16)
        p = math.sin(i / 6 * math.tau)
        r = 5.0 + p * 0.6
        c.circle(8, 8, r + 2, (142, 247, 255, 40))
        c.circle(8, 8, r, hexc("2fa8c8"))
        c.circle(8, 8, r - 1.5, hexc("7ee8ff"))
        c.circle(6.5, 6.5, 1.6, WHITE)
        frames.append(finish(c, rim=False))
    return frames


def switch(on):
    c = Canvas(16, 16)
    c.rect(2, 9, 12, 6, hexc("4a5170"))
    c.rect(3, 10, 10, 4, hexc("6b7495"))
    col = hexc("6bff9a") if on else hexc("ff6b6b")
    c.rect(4, 4, 8, 6, hexc("2c3350"))
    c.rect(5, 5, 6, 4, col)
    c.rect(5, 5, 6, 1, mix(col, WHITE, 0.5))
    if on:
        c.rect(3, 3, 10, 1, (107, 255, 154, 90))
    return finish(c, rim=False)


def lever(state):
    c = Canvas(16, 16)
    c.rect(3, 12, 10, 3, hexc("4a5170"))
    c.rect(4, 13, 8, 1, hexc("777f9e"))
    ang = -0.9 if state == 0 else 0.9
    bx, by = 8, 12
    tx, ty = bx + math.sin(ang) * 8, by - math.cos(ang) * 8
    c.line(bx, by, tx, ty, hexc("b9c2d8"), thick=2)
    c.circle(tx, ty, 2.4, hexc("ff9257") if state == 0 else hexc("6bff9a"))
    c.circle(tx - 0.6, ty - 0.6, 1.0, WHITE)
    return finish(c, rim=False)


def door(open_amt):
    c = Canvas(16, 32)
    c.rect(0, 0, 16, 32, hexc("232a40"))
    c.rect_outline(0, 0, 16, 32, hexc("161b2c"))
    h = int(30 * (1 - open_amt))
    if h > 0:
        c.rect(2, 1, 12, h, hexc("58627f"))
        for y in range(1, h, 5):
            c.rect(2, y, 12, 1, hexc("39415c"))
        c.rect(3, 2, 2, max(0, h - 2), hexc("8892ad"))
        c.rect(6, 2 + h // 2 - 2, 4, 4, hexc("45d6d0"))
    return c


def spikes(up=True):
    c = Canvas(16, 16)
    base, tip = hexc("9aa3bd"), hexc("e6ecff")
    for i in range(4):
        x = i * 4
        for j in range(8):
            w = max(1, 4 - j // 2)
            c.rect(x + (4 - w) // 2, 15 - j, w, 1, mix(base, tip, j / 8.0))
    c.rect(0, 14, 16, 2, hexc("5a6480"))
    finish(c, rim=False)
    return c if up else c.copy()


def weak_wall(stage):
    c = Canvas(16, 16)
    base, dark, light = hexc("7a6a5e"), hexc("4a3e36"), hexc("a6968a")
    c.rect(0, 0, 16, 16, base)
    for i in range(14):
        x = noise(i, 1, 9) * 16
        y = noise(i, 2, 11) * 16
        c.set(x, y, dark if i % 2 else light)
    c.rect_outline(0, 0, 16, 16, dark)
    cracks = [((2, 3), (7, 8)), ((13, 2), (8, 9)), ((4, 14), (7, 9)), ((12, 13), (9, 9))]
    for i in range(min(stage * 2, len(cracks))):
        (x0, y0), (x1, y1) = cracks[i]
        c.line(x0, y0, x1, y1, dark)
    if stage >= 2:
        c.line(0, 8, 16, 7, dark)
    return c


def platform(w=48):
    c = Canvas(w, 16)
    body, dark, light = hexc("4b5573"), hexc("2c3350"), hexc("7c88ab")
    c.rect(0, 2, w, 10, body)
    c.rect(0, 2, w, 2, light)
    c.rect(0, 10, w, 2, dark)
    for x in range(2, w - 2, 8):
        c.rect(x, 5, 4, 4, dark)
        c.rect(x + 1, 6, 2, 2, hexc("45d6d0"))
    c.rect(0, 12, w, 1, (69, 214, 208, 90))
    return finish(c, rim=False)


def checkpoint(active):
    frames = []
    for i in range(4):
        c = Canvas(16, 32)
        p = math.sin(i / 4 * math.tau)
        c.rect(6, 18, 4, 13, hexc("4a5170"))
        c.rect(7, 19, 2, 12, hexc("6f7896"))
        c.ellipse(8, 30, 6, 2.4, hexc("39405c"))
        col = hexc("6bff9a") if active else hexc("6b7495")
        cy = 12 + p * 1.2
        c.ellipse(8, cy, 5.5, 6.5, mix(col, LINE, 0.45))
        c.ellipse(8, cy, 3.8, 4.8, col)
        c.ellipse(7, cy - 1.4, 1.4, 1.8, WHITE)
        if active:
            c.ellipse(8, cy, 7.5, 8.5, (107, 255, 154, 34))
        frames.append(finish(c, rim=False))
    return frames


def shard():
    frames = []
    for i in range(6):
        c = Canvas(16, 16)
        p = math.sin(i / 6 * math.tau)
        y = 8 + p * 1.2
        col, hi = hexc("b06bff"), hexc("e6ccff")
        pts = [(8, y - 5), (11.5, y), (8, y + 5), (4.5, y)]
        for j in range(-5, 6):
            wdt = (5 - abs(j)) * 0.7
            c.rect(8 - wdt, y + j, wdt * 2, 1, col)
        for j in range(-4, 2):
            c.rect(7, y + j, 1.5, 1, hi)
        c.circle(8, y, 7 + p, (176, 107, 255, 26))
        frames.append(finish(c, rim=False))
    return frames


def barrier():
    frames = []
    for i in range(4):
        c = Canvas(16, 16)
        for y in range(16):
            a = 90 + int(70 * math.sin((y + i * 2) * 0.7))
            c.rect(2, y, 12, 1, (110, 230, 255, max(30, a)))
        c.rect(0, 0, 2, 16, hexc("2c3350"))
        c.rect(14, 0, 2, 16, hexc("2c3350"))
        frames.append(c)
    return frames


def crystal_key():
    c = Canvas(16, 16)
    col, hi = hexc("ffd166"), hexc("fff3c4")
    for j in range(-6, 7):
        w = (6 - abs(j)) * 0.75
        c.rect(8 - w, 8 + j, w * 2, 1, col)
    c.rect(7, 3, 1.5, 6, hi)
    c.circle(8, 8, 7.5, (255, 209, 102, 30))
    return finish(c, rim=False)


# =========================================================== enemies
def drone():
    frames = []
    for i in range(6):
        c = Canvas(24, 24)
        p = math.sin(i / 6 * math.tau)
        y = 11 + p * 1.4
        body, dark, light = hexc("6f7ba0"), hexc("39415e"), hexc("aab5d2")
        c.ellipse(12, y, 7.5, 5.5, body)
        c.ellipse(12, y - 1.4, 6.0, 3.4, light)
        c.ellipse(12, y + 2.0, 7.0, 2.6, dark)
        # eye
        c.ellipse(14, y, 3.2, 2.6, hexc("2a1030"))
        c.ellipse(14.4, y, 2.0, 1.6, hexc("ff5c5c"))
        c.set(14, y - 0.6, WHITE)
        # rotor blur
        c.rect(4, y - 6, 16, 1, (170, 181, 210, 120 if i % 2 else 60))
        c.rect(11, y - 6, 2, 3, dark)
        # thruster glow
        c.ellipse(12, y + 5 + abs(p), 3.0, 1.6, (255, 140, 90, 110))
        frames.append(finish(c))
    return frames


def guard():
    frames = []
    for i in range(6):
        c = Canvas(24, 32)
        t = i / 6
        step = math.sin(t * math.tau)
        body, dark, light = hexc("5a6a8f"), hexc("323b57"), hexc("93a2c4")
        # legs
        for s, off in ((0, step), (1, -step)):
            col = body if s == 0 else dark
            c.rect(9 + off * 3, 22, 4, 8, col)
            c.rect(8 + off * 3, 29, 6, 3, dark)
        # torso
        c.rect(6, 10, 12, 13, body)
        c.rect(6, 10, 12, 3, light)
        c.rect(6, 20, 12, 3, dark)
        c.rect(8, 14, 8, 4, hexc("2a3048"))
        c.rect(9, 15, 6, 2, hexc("ff7a5c"))
        # head
        c.ellipse(13, 7, 5.0, 4.4, body)
        c.ellipse(14, 7, 3.6, 2.4, hexc("2a1030"))
        c.rect(14, 6, 3, 1, hexc("ff5c5c"))
        # arm
        c.rect(16, 12, 4, 9 + int(step), dark)
        frames.append(finish(c))
    return frames


def spider():
    frames = []
    for i in range(6):
        c = Canvas(32, 24)
        t = i / 6
        body, dark, light = hexc("7a4fb0"), hexc("40265e"), hexc("c39aff")
        for leg in range(4):
            side = -1 if leg < 2 else 1
            phase = math.sin(t * math.tau + leg * 1.6)
            bx = 16 + side * 5
            ex = 16 + side * (12 + phase * 2)
            ey = 21 - abs(phase) * 4
            c.line(bx, 13, bx + side * 4, 10 - phase, dark, thick=2)
            c.line(bx + side * 4, 10 - phase, ex, ey, dark, thick=2)
        c.ellipse(14, 13, 8.0, 6.0, body)
        c.ellipse(14, 11, 6.4, 3.6, light)
        c.ellipse(21, 13, 4.4, 3.8, body)
        for ex, ey in ((21, 11.5), (23, 13), (20, 14.5)):
            c.circle(ex, ey, 1.2, hexc("ffe14f"))
            c.set(ex, ey, hexc("2a1030"))
        # crystal back
        for j in range(-4, 3):
            w = (4 - abs(j)) * 0.6
            c.rect(11 - w, 7 + j, w * 2, 1, hexc("6bffd5"))
        frames.append(finish(c))
    return frames


def turret():
    frames = []
    for i in range(4):
        c = Canvas(16, 16)
        body, dark, light = hexc("5a6480"), hexc("323b57"), hexc("98a4c2")
        c.rect(2, 9, 12, 6, body)
        c.rect(2, 9, 12, 2, light)
        c.rect(2, 14, 12, 2, dark)
        c.ellipse(8, 8, 4.4, 4.0, body)
        c.rect(8, 6, 8, 4, dark)
        c.rect(9, 7, 6, 2, body)
        charge = i / 3.0
        c.ellipse(8, 8, 2.4, 2.2, mix(hexc("3a2b55"), hexc("ff5c5c"), charge))
        frames.append(finish(c))
    return frames


def wraith():
    frames = []
    for i in range(6):
        c = Canvas(24, 32)
        t = i / 6
        p = math.sin(t * math.tau)
        body, dark = hexc("2e2545"), hexc("17102b")
        glow = hexc("ff5cf0")
        top = 6 + p * 1.2
        c.ellipse(12, top + 4, 7.0, 7.5, body)
        for y in range(int(top + 8), 29):
            w = 7.0 - (y - top - 8) * 0.18
            wob = math.sin(y * 0.5 + t * 6) * 1.6
            c.rect(12 - w + wob, y, w * 2, 1, body if (y % 3) else dark)
        c.ellipse(12, top + 2, 5.4, 4.0, dark)
        for ex in (9.6, 14.4):
            c.circle(ex, top + 3, 1.5, glow)
            c.circle(ex, top + 3, 0.8, WHITE)
        c.ellipse(12, top + 4, 9.0, 9.0, (255, 92, 240, 22))
        frames.append(finish(c, rim=False))
    return frames


def projectile(kind="energy"):
    frames = []
    for i in range(4):
        c = Canvas(8, 8)
        col = {"energy": hexc("ff6b5c"), "psy": hexc("8ef7ff"), "void": hexc("ff5cf0")}[kind]
        r = 2.6 + (i % 2) * 0.4
        c.circle(4, 4, r + 1.4, (col[0], col[1], col[2], 60))
        c.circle(4, 4, r, col)
        c.circle(3.4, 3.4, 1.0, WHITE)
        frames.append(c)
    return frames


# =========================================================== bosses
def emech():
    frames = []
    for i in range(6):
        c = Canvas(64, 64)
        t = i / 6
        p = math.sin(t * math.tau)
        body, dark, light = hexc("59637f"), hexc("2c3350"), hexc("98a4c2")
        acc = hexc("ff7a5c")
        # legs
        for s in (-1, 1):
            c.rect(32 + s * 14 - 4, 44, 8, 14, dark)
            c.rect(32 + s * 14 - 5, 56, 12, 6, body)
            c.rect(32 + s * 14 - 5, 56, 12, 2, light)
        # torso
        c.rect(16, 20, 32, 26, body)
        c.rect(16, 20, 32, 4, light)
        c.rect(16, 42, 32, 4, dark)
        c.rect(20, 26, 24, 12, dark)
        core = mix(hexc("3a2b55"), acc, 0.5 + p * 0.5)
        c.ellipse(32, 32, 7, 6, core)
        c.ellipse(32, 32, 4, 3.4, mix(core, WHITE, 0.5))
        # shoulders + arms
        for s in (-1, 1):
            c.ellipse(32 + s * 22, 24, 8, 7, body)
            c.rect(32 + s * 26 - 4, 28, 8, 18 + int(p * 2), dark)
            c.rect(32 + s * 26 - 5, 44, 10, 6, body)
        # head
        c.rect(24, 6, 16, 14, body)
        c.rect(24, 6, 16, 3, light)
        c.rect(26, 11, 12, 5, hexc("221a33"))
        c.rect(27, 12, 10, 3, mix(hexc("ff5c5c"), WHITE, abs(p) * 0.4))
        c.rect(28, 2, 3, 5, dark)
        c.rect(35, 2, 3, 5, dark)
        frames.append(finish(c))
    return frames


def crystal_spider_boss():
    frames = []
    for i in range(6):
        c = Canvas(80, 56)
        t = i / 6
        body, dark, light = hexc("6b3fa0"), hexc("35205a"), hexc("bb92ff")
        cry = hexc("6bffd5")
        for leg in range(6):
            side = -1 if leg < 3 else 1
            k = leg % 3
            phase = math.sin(t * math.tau + leg * 1.1)
            bx = 40 + side * 12
            mx = 40 + side * (24 + k * 3)
            my = 18 + k * 3 - phase * 3
            ex = 40 + side * (34 + k * 2)
            ey = 50 - abs(phase) * 5
            c.line(bx, 30, mx, my, dark, thick=3)
            c.line(mx, my, ex, ey, dark, thick=2)
            c.circle(ex, ey, 2, body)
        c.ellipse(34, 30, 20, 14, body)
        c.ellipse(34, 25, 16, 8, light)
        c.ellipse(56, 30, 11, 9, body)
        for j, (ex, ey) in enumerate(((54, 26), (60, 29), (52, 33), (58, 35))):
            c.circle(ex, ey, 2.0, hexc("ffe14f"))
            c.circle(ex, ey, 1.0, hexc("2a1030"))
        # crystal cluster on the back
        for j, (cx, cy, h) in enumerate(((28, 16, 10), (36, 13, 13), (44, 17, 9))):
            for k in range(h):
                w = (h - k) * 0.35
                c.rect(cx - w, cy + k, w * 2, 1, mix(cry, WHITE, 0.4 if k < 3 else 0.0))
            c.circle(cx, cy + 2, 4 + math.sin(t * math.tau + j) * 1.2, (107, 255, 213, 26))
        frames.append(finish(c))
    return frames


def reaper():
    frames = []
    for i in range(6):
        c = Canvas(48, 64)
        t = i / 6
        p = math.sin(t * math.tau)
        body, dark = hexc("241d3a"), hexc("110c1f")
        acid = hexc("8dff5c")
        # cloak
        for y in range(18, 62):
            w = 6 + (y - 18) * 0.32
            wob = math.sin(y * 0.35 + t * 5) * 2.0
            c.rect(24 - w + wob, y, w * 2, 1, body if y % 4 else dark)
        c.ellipse(24, 20, 11, 10, body)
        c.ellipse(24, 16, 9, 5, dark)
        # hood opening + eyes
        c.ellipse(24, 20, 6.5, 6.0, hexc("0a0714"))
        for ex in (21, 27):
            c.circle(ex, 20 + p * 0.4, 1.8, acid)
            c.circle(ex, 20 + p * 0.4, 0.9, WHITE)
        # scythe
        sx = 40
        c.line(sx, 8, sx - 4, 58, hexc("4a3f2e"), thick=2)
        bx, by = sx, 10
        for j in range(30):
            a = -2.5 + j * 0.075
            for w in range(4):
                rr = 13 - w
                col = mix(acid, WHITE, 0.55) if w == 0 else mix(acid, dark, w * 0.22)
                c.set(bx + math.cos(a) * rr, by + math.sin(a) * rr + 12, col)
        # vial belt
        for bx in (18, 24, 30):
            c.rect(bx, 34, 3, 5, hexc("2f6b3a"))
            c.rect(bx, 34, 3, 2, acid)
        frames.append(finish(c, rim=False))
    return frames


def mind_warden():
    frames = []
    for i in range(6):
        c = Canvas(64, 64)
        t = i / 6
        p = math.sin(t * math.tau)
        body, dark, light = hexc("b06bff"), hexc("4a2b7a"), hexc("e6ccff")
        # floating brain-core
        c.ellipse(32, 26 + p, 18, 15, body)
        for j in range(9):
            ang = j / 9 * math.tau
            cx = 32 + math.cos(ang) * 11
            cy = 26 + p + math.sin(ang) * 8
            c.ellipse(cx, cy, 5, 4, mix(body, light, 0.35))
            c.ellipse(cx, cy, 3, 2.4, dark)
        c.ellipse(32, 21 + p, 13, 6, light)
        # eye
        c.ellipse(32, 30 + p, 7, 6, hexc("140b26"))
        c.ellipse(32, 30 + p, 4.4, 3.8, hexc("ffe14f"))
        c.ellipse(32, 30 + p, 2.0, 1.8, hexc("140b26"))
        # tendrils
        for s in (-1, 1):
            for k in range(3):
                x0 = 32 + s * (6 + k * 5)
                for y in range(40, 62):
                    wob = math.sin(y * 0.4 + t * 6 + k) * (2 + k)
                    c.set(x0 + s * (y - 40) * 0.25 + wob, y, dark if y % 3 else body)
        # halo ring
        for j in range(36):
            ang = j / 36 * math.tau
            rr = 26 + math.sin(t * math.tau + j * 0.4) * 1.5
            c.set(32 + math.cos(ang) * rr, 26 + p + math.sin(ang) * rr * 0.45, (230, 204, 255, 120))
        frames.append(finish(c, rim=False))
    return frames


def entity():
    frames = []
    for i in range(6):
        c = Canvas(96, 96)
        t = i / 6
        p = math.sin(t * math.tau)
        void, edge = hexc("0d0a1a"), hexc("58ffe0")
        pink = hexc("ff5cf0")
        # writhing mass
        c.ellipse(48, 50, 30, 28, void)
        for j in range(60):
            ang = j / 60 * math.tau
            r = 26 + math.sin(ang * 5 + t * math.tau) * 5
            x = 48 + math.cos(ang) * r
            y = 50 + math.sin(ang) * r * 0.95
            col = edge if j % 3 else pink
            c.circle(x, y, 2.2, (col[0], col[1], col[2], 150))
        c.ellipse(48, 50, 24, 22, void)
        # eyes ring
        for j in range(5):
            ang = -1.6 + j * 0.72
            ex = 48 + math.cos(ang) * 14
            ey = 46 + math.sin(ang) * 11
            c.ellipse(ex, ey, 4.0, 3.4, hexc("f2f6ff"))
            c.ellipse(ex, ey, 2.0, 2.6, hexc("140b26"))
            c.set(ex - 1, ey - 1, WHITE)
        # maw
        c.ellipse(48, 66, 13, 6 + abs(p) * 3, hexc("140b26"))
        for j in range(7):
            c.rect(38 + j * 3, 62, 2, 3, hexc("f2f6ff"))
            c.rect(38 + j * 3, 68 + abs(p) * 2, 2, 3, hexc("f2f6ff"))
        # outer aura
        for j in range(40):
            ang = j / 40 * math.tau
            rr = 36 + math.sin(t * math.tau * 2 + j) * 3
            c.circle(48 + math.cos(ang) * rr, 50 + math.sin(ang) * rr * 0.9, 1.4,
                     (88, 255, 224, 60))
        frames.append(c)
    return frames


# =========================================================== fx + ui
def shockwave():
    frames = []
    for i in range(6):
        c = Canvas(64, 64)
        r = 6 + i * 4.6
        a = int(220 * (1 - i / 6.0))
        for k in range(72):
            ang = k / 72 * math.tau
            for w in range(3):
                col = PSY if w else WHITE
                c.set(32 + math.cos(ang) * (r - w), 32 + math.sin(ang) * (r - w),
                      (col[0], col[1], col[2], max(0, a - w * 40)))
        frames.append(c)
    return frames


def psi_ring():
    frames = []
    for i in range(8):
        c = Canvas(32, 32)
        t = i / 8
        for k in range(48):
            ang = k / 48 * math.tau + t * math.tau
            rr = 12 + math.sin(ang * 3 + t * math.tau) * 1.6
            a = 90 + int(120 * (0.5 + 0.5 * math.sin(ang * 2 - t * math.tau)))
            c.set(16 + math.cos(ang) * rr, 16 + math.sin(ang) * rr, (142, 247, 255, a))
        for k in range(4):
            ang = t * math.tau + k * math.pi / 2
            c.circle(16 + math.cos(ang) * 12, 16 + math.sin(ang) * 12, 1.4, (255, 255, 255, 200))
        frames.append(c)
    return frames


POWER_ICONS = [
    ("lift", "8ef7ff"),
    ("push", "ff9257"),
    ("pull", "6bff9a"),
    ("stasis", "9a8dff"),
    ("dash", "ffe14f"),
    ("chain", "ff5cf0"),
    ("shock", "5cffe0"),
    ("ultimate", "ffffff"),
]


def power_icon(idx):
    name, col = POWER_ICONS[idx]
    c = Canvas(16, 16)
    col = hexc(col)
    dark = mix(col, LINE, 0.6)
    if name == "lift":
        c.rect(5, 8, 6, 5, col)
        c.line(8, 6, 8, 2, col)
        c.line(6, 4, 8, 2, col)
        c.line(10, 4, 8, 2, col)
    elif name == "push":
        for k in range(3):
            c.line(3 + k * 3, 4, 3 + k * 3, 11, col if k else dark)
        c.line(11, 8, 8, 5, col)
        c.line(11, 8, 8, 11, col)
        c.line(4, 8, 12, 8, col)
    elif name == "pull":
        c.line(3, 8, 11, 8, col)
        c.line(3, 8, 6, 5, col)
        c.line(3, 8, 6, 11, col)
        c.rect(11, 5, 3, 7, dark)
    elif name == "stasis":
        c.rect_outline(3, 3, 10, 10, col)
        c.rect(6, 6, 4, 4, col)
        for k in range(4):
            c.set(3 + k * 3, 1, dark)
            c.set(3 + k * 3, 14, dark)
    elif name == "dash":
        c.line(3, 12, 12, 3, col, thick=2)
        c.line(9, 3, 12, 3, col)
        c.line(12, 3, 12, 6, col)
        c.set(4, 10, dark)
        c.set(6, 12, dark)
    elif name == "chain":
        c.rect_outline(2, 5, 5, 5, col)
        c.rect_outline(9, 5, 5, 5, col)
        c.rect(7, 7, 2, 1, dark)
        c.rect(4, 11, 8, 2, dark)
    elif name == "shock":
        for r in (3, 5, 7):
            for k in range(28):
                ang = k / 28 * math.tau
                c.set(8 + math.cos(ang) * r, 8 + math.sin(ang) * r, col if r < 7 else dark)
    else:
        for k in range(24):
            ang = k / 24 * math.tau
            c.set(8 + math.cos(ang) * 6, 8 + math.sin(ang) * 6, col)
        c.rect(7, 3, 2, 10, col)
        c.rect(3, 7, 10, 2, col)
        c.rect(6, 6, 4, 4, dark)
    return c


def heart(full=True):
    c = Canvas(12, 12)
    col = hexc("ff5c7a") if full else hexc("3a3550")
    hi = hexc("ffb0c0") if full else hexc("4a4566")
    c.circle(4, 4, 2.6, col)
    c.circle(8, 4, 2.6, col)
    for j in range(6):
        w = 5.6 - j * 0.9
        c.rect(6 - w, 5 + j, w * 2, 1, col)
    c.circle(3.6, 3.4, 1.0, hi)
    return finish(c, rim=False)


def logo():
    """TELEPATH wordmark, 8x8 blocky font, glow behind."""
    glyphs = {
        "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
        "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
        "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
        "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
        "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
        "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    }
    word = "TELEPATH"
    cw = 6
    c = Canvas(cw * len(word) + 8, 16)
    for i, ch in enumerate(word):
        g = glyphs[ch]
        for y, row in enumerate(g):
            for x, v in enumerate(row):
                if v == "1":
                    px, py = 4 + i * cw + x, 4 + y
                    c.set(px, py, mix(hexc("8ef7ff"), hexc("ffffff"), y / 7.0))
    c.outline(hexc("1a1a3a"))
    return c


def main():
    os.makedirs(OUT, exist_ok=True)
    single = {
        "crate_wood": crate("wood"),
        "crate_metal": crate("metal"),
        "crate_psy": crate("psy"),
        "boulder": boulder(),
        "switch_off": switch(False),
        "switch_on": switch(True),
        "lever_off": lever(0),
        "lever_on": lever(1),
        "spikes": spikes(),
        "platform": platform(48),
        "crystal_key": crystal_key(),
        "heart_full": heart(True),
        "logo": logo(),
    }
    for name, img in single.items():
        write_png(os.path.join(OUT, name + ".png"), img)

    sheets = {
        "orb": orb(),
        "door": [door(i / 3.0) for i in range(4)],
        "weak_wall": [weak_wall(s) for s in range(4)],
        "checkpoint_off": checkpoint(False),
        "checkpoint_on": checkpoint(True),
        "shard": shard(),
        "barrier": barrier(),
        "drone": drone(),
        "guard": guard(),
        "spider": spider(),
        "turret": turret(),
        "wraith": wraith(),
        "proj_energy": projectile("energy"),
        "proj_psy": projectile("psy"),
        "proj_void": projectile("void"),
        "boss_emech": emech(),
        "boss_spider": crystal_spider_boss(),
        "boss_reaper": reaper(),
        "boss_warden": mind_warden(),
        "boss_entity": entity(),
        "fx_shockwave": shockwave(),
        "fx_psi_ring": psi_ring(),
        "power_icons": [power_icon(i) for i in range(8)],
    }
    for name, frames in sheets.items():
        write_png(os.path.join(OUT, name + ".png"), sheet(frames))
    print(f"wrote {len(single)} sprites and {len(sheets)} sheets")


if __name__ == "__main__":
    main()
