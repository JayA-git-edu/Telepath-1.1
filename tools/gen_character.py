"""Generates Eli's animated spritesheets.

Eli is drawn by a tiny 2-bone-IK puppet so every animation shares the same
proportions and palette. Frames are 32x32, character ~26px tall, facing right;
the engine mirrors for left.
"""

import math
import os

from pixelart import Canvas, hexc, mix, sheet, shade, write_png

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")

FW = FH = 32
GROUND = 30.0

PAL = {
    "line": hexc("241a33"),
    "skin": hexc("ffd0a0"),
    "skin_hi": hexc("ffe8cc"),
    "skin_sh": hexc("e2a274"),
    "hair": hexc("3b2b4f"),
    "hair_hi": hexc("614a80"),
    "hood": hexc("2fb8c6"),
    "hood_sh": hexc("1a7c8c"),
    "hood_dk": hexc("125863"),
    "hood_hi": hexc("77e6ec"),
    "pants": hexc("3d4c72"),
    "pants_sh": hexc("2a3555"),
    "shoe": hexc("ec5a48"),
    "shoe_sh": hexc("a8362b"),
    "scarf": hexc("ff9257"),
    "scarf_hi": hexc("ffc094"),
    "scarf_sh": hexc("d3612e"),
    "white": hexc("ffffff"),
    "psy": hexc("8ef7ff"),
}


# ---------------------------------------------------------------- rig utils
def ik(ax, ay, bx, by, l1, l2, flip=1):
    """Two-bone IK: returns the joint between anchor a and target b."""
    dx, dy = bx - ax, by - ay
    d = math.hypot(dx, dy)
    d = max(0.001, min(d, l1 + l2 - 0.001))
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    ux, uy = dx / d, dy / d
    px, py = -uy, ux
    return (ax + ux * a + px * h * flip, ay + uy * a + py * h * flip)


def limb(c, x0, y0, x1, y1, w0, w1, col):
    """Tapered capsule between two points."""
    steps = max(3, int(math.hypot(x1 - x0, y1 - y0) * 2))
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        r = (w0 + (w1 - w0) * t) / 2.0
        c.circle(x, y, r, col)


# ------------------------------------------------------------------ the head
# Hand-authored, because at 13 pixels wide a face is drawn pixel by pixel or
# not at all - the IK puppet handles the body, this handles the character.
HEAD = [
    "...KKKKK....",
    "..KkkkKKKK..",
    ".KkkkKKKKKK.",
    ".KKKKKKKKKK.",
    ".KKKSSSSSSS.",
    "KKKSSSSSSSS.",
    "KKrSSPSEPSS.",
    "KKrSSPSEPSS.",
    ".KSSSSSSSSS.",
    ".sSSSSSmmSS.",
    "..sSSSSSSs..",
    "...ssSSss...",
]
EYE_FAR = 5
EYE_NEAR = 7
MOUTH_X = 7
HEAD_W = len(HEAD[0])
HEAD_H = len(HEAD)
EYE_ROWS = (6, 7)
MOUTH_ROW = 9


def stamp_head(c, ox, oy, eyes="open", mouth="smile", hair_lift=0.0):
    """Blit the head map at (ox, oy), applying the eye and mouth variants."""
    glow = eyes == "glow"
    pupil = PAL["psy"] if glow else PAL["line"]
    key = {
        "K": PAL["hair"], "k": PAL["hair_hi"], "S": PAL["skin"],
        "s": PAL["skin_sh"], "r": PAL["skin_sh"], "E": PAL["white"],
        "P": pupil, "m": PAL["line"],
    }
    lift = 1 if hair_lift > 0.5 else 0
    for y, row in enumerate(HEAD):
        # a gust lifts the top of the hair without moving the face
        dy = -lift if y <= 2 else 0
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            if y in EYE_ROWS and ch in "EP":
                if eyes == "shut":
                    ch = "P" if y == EYE_ROWS[1] else "S"
                elif eyes == "half" and y == EYE_ROWS[0]:
                    ch = "S"
            if y == MOUTH_ROW and ch == "m":
                if mouth == "flat" and x == MOUTH_X + 1:
                    ch = "S"
            c.set(ox + x, oy + y + dy, key[ch])

    # variants that add pixels rather than swap them
    spec = ((EYE_FAR, "P"), (EYE_NEAR, "E"), (EYE_NEAR + 1, "P"))
    if eyes == "wide":
        for x, ch in spec:
            c.set(ox + x, oy + EYE_ROWS[0] - 1, PAL["line"] if ch == "P" else PAL["white"])
    if mouth == "open":
        c.rect(ox + MOUTH_X, oy + MOUTH_ROW, 2, 2, PAL["line"])
    elif mouth == "smile":
        c.set(ox + MOUTH_X + 2, oy + MOUTH_ROW - 1, PAL["line"])
    if glow:
        for x, _ in spec:
            c.rect(ox + x - 1, oy + EYE_ROWS[0] - 1, 3, 4, (142, 247, 255, 70))
        for x, ch in spec:
            for y in EYE_ROWS:
                c.set(ox + x, oy + y, PAL["psy"] if ch == "P" else PAL["white"])


# ------------------------------------------------------------------ drawing
def draw_eli(
    body_dx=0.0,
    body_dy=0.0,
    lean=0.0,
    head_dx=0.0,
    head_dy=0.0,
    legs=None,          # ((fx, fy), (fx, fy)) foot targets, relative to hip
    arms=None,          # ((hx, hy), (hx, hy)) hand targets, relative to shoulder
    scarf=0.0,          # sway, positive = trailing back
    eyes="open",        # open | half | shut | glow | wide
    mouth="smile",
    hair_lift=0.0,
    cape_up=0.0,
):
    c = Canvas(FW, FH)
    P = PAL

    hipx = 15 + body_dx
    hipy = 21.5 + body_dy
    shx = hipx + lean
    shy = hipy - 5.6
    headx = shx + lean * 0.25 + head_dx
    heady = shy - 6.2 + head_dy

    legs = legs or (((0, GROUND - hipy), (0, GROUND - hipy)))
    arms = arms or ((1.5, 4.5), (1.5, 4.5))

    def draw_leg(target, col_leg, col_leg_sh, col_shoe, col_shoe_sh, front):
        fx, fy = hipx + target[0], hipy + target[1]
        knee = ik(hipx, hipy, fx, fy, 4.2, 4.2, flip=-1)
        limb(c, hipx, hipy, knee[0], knee[1], 4.6, 3.6, col_leg)
        limb(c, knee[0], knee[1], fx, fy - 1.0, 3.6, 3.0, col_leg)
        if front:
            # light comes from the upper left, so the trailing edge stays dark
            limb(c, hipx + 1.4, hipy, knee[0] + 1.2, knee[1], 1.6, 1.4, col_leg_sh)
            limb(c, knee[0] + 1.2, knee[1], fx + 1.0, fy - 1.4, 1.4, 1.2, col_leg_sh)
        # shoe: a wedge with a lighter toe cap
        c.ellipse(fx + 0.6, fy - 0.8, 2.7, 1.8, col_shoe)
        c.ellipse(fx + 1.4, fy - 0.4, 1.9, 1.2, col_shoe_sh)
        c.rect(fx - 0.8, fy - 2.0, 2.4, 1, col_shoe_sh)

    def draw_arm(target, col, col_sh, front):
        hx, hy = shx + target[0], shy + target[1]
        elbow = ik(shx, shy, hx, hy, 3.4, 3.4, flip=1)
        limb(c, shx, shy, elbow[0], elbow[1], 3.8, 3.0, col)
        limb(c, elbow[0], elbow[1], hx, hy, 3.0, 2.4, col)
        if front:
            limb(c, elbow[0], elbow[1] + 1.0, hx, hy + 0.8, 1.4, 1.2, col_sh)
        # sleeve cuff, then the hand
        d = math.hypot(hx - elbow[0], hy - elbow[1]) or 1
        cx_ = hx - (hx - elbow[0]) / d * 1.6
        cy_ = hy - (hy - elbow[1]) / d * 1.6
        c.circle(cx_, cy_, 1.6, col_sh)
        c.circle(hx, hy, 1.6, PAL["skin"])
        c.circle(hx + 0.4, hy + 0.6, 0.7, PAL["skin_sh"])

    # back leg + back arm first: darker, so depth reads at a glance
    draw_leg(legs[1], PAL["pants_sh"], PAL["pants_sh"], PAL["shoe_sh"], PAL["shoe_sh"], False)
    draw_arm(arms[1], PAL["hood_sh"], PAL["hood_sh"], False)

    # --- the hood itself, bunched behind the neck ---------------------------
    hood_x = shx - 3.0 - cape_up * 0.5
    hood_y = shy - 2.4 - cape_up * 0.9
    c.ellipse(hood_x, hood_y, 3.6, 3.2, PAL["hood_sh"])
    c.ellipse(hood_x - 0.6, hood_y + 0.4, 2.6, 2.4, PAL["hood_dk"])

    # --- hoodie torso -------------------------------------------------------
    for i in range(9):
        t = i / 8.0
        x = hipx + (shx - hipx) * t
        y = hipy + (shy - hipy) * t
        w = 8.2 - 1.4 * t
        c.ellipse(x, y, w / 2, 2.1, PAL["hood"])
    # kangaroo pocket + hem, so the torso is not one flat block
    c.ellipse(hipx + 0.6, hipy - 0.6, 3.4, 1.8, PAL["hood_sh"])
    c.ellipse(hipx, hipy + 1.0, 4.0, 1.4, PAL["hood_dk"])
    c.ellipse(shx, shy - 0.6, 3.8, 2.3, PAL["hood"])
    # lit shoulder and shaded flank
    c.ellipse(shx - 1.0, shy - 1.4, 2.6, 1.4, PAL["hood_hi"])
    c.ellipse(shx + 2.4, shy + 1.6, 1.3, 2.6, PAL["hood_sh"])

    # hood drawstrings and the crystal that started all of this
    c.rect(shx - 0.4, shy - 0.2, 1, 3, PAL["hood_hi"])
    c.rect(shx + 1.2, shy - 0.2, 1, 2, PAL["hood_hi"])
    c.circle(shx + 0.6, shy + 3.0, 1.3, PAL["psy"])
    c.set(shx + 0.6, shy + 2.6, PAL["white"])

    # --- front leg + head ---------------------------------------------------
    draw_leg(legs[0], PAL["pants"], PAL["pants_sh"], PAL["shoe"], PAL["shoe_sh"], True)

    # neck
    c.rect(headx - 0.5, heady + 4.0, 2, 2, PAL["skin_sh"])

    stamp_head(c, round(headx - 6.5), round(heady - 6), eyes, mouth, hair_lift)

    # --- scarf --------------------------------------------------------------
    c.ellipse(shx - 0.2, shy - 1.8, 2.9, 1.2, PAL["scarf"])
    c.ellipse(shx + 0.4, shy - 2.2, 1.8, 0.7, PAL["scarf_hi"])
    tail_x = shx - 2.4
    tail_y = shy - 1.2
    seg = 3
    for i in range(seg):
        t = (i + 1) / seg
        x = tail_x - t * (1.8 + scarf * 3.2)
        y = tail_y + math.sin(t * 1.8 + scarf) * 1.2 + t * (1.8 - scarf * 3.2)
        col = PAL["scarf"] if i % 2 == 0 else PAL["scarf_sh"]
        c.circle(x, y, 1.5 - t * 0.4, col)

    # --- front arm ----------------------------------------------------------
    draw_arm(arms[0], PAL["hood"], PAL["hood_sh"], True)

    c.shade_top(PAL["white"], rows=1)
    c.outline(PAL["line"])
    return c


# ------------------------------------------------------------- animations
def anim_idle(n=8):
    frames = []
    for i in range(n):
        t = i / n
        bob = math.sin(t * math.tau) * 0.9
        breath = math.sin(t * math.tau)
        frames.append(
            draw_eli(
                body_dy=bob * 0.6,
                head_dy=bob * 0.4,
                lean=0.3,
                legs=((1.4, GROUND - 21.5 - bob * 0.6), (-1.6, GROUND - 21.5 - bob * 0.6)),
                arms=((1.4, 5.0 + breath * 0.5), (0.4, 5.2 - breath * 0.4)),
                scarf=0.15 + breath * 0.2,
                eyes="open" if i != n - 2 else "half",
                hair_lift=breath * 0.3,
            )
        )
    return frames


def anim_run(n=10):
    frames = []
    for i in range(n):
        t = i / n
        bob = -abs(math.sin(t * math.tau)) * 1.1
        legs = []
        for phase in (t, (t + 0.5) % 1.0):
            if phase < 0.5:  # swing
                u = phase / 0.5
                fx = -4.0 + 8.0 * (0.5 - 0.5 * math.cos(math.pi * u))
                fy = GROUND - 21.5 - math.sin(math.pi * u) * 4.2
            else:  # stance
                u = (phase - 0.5) / 0.5
                fx = 4.0 - 8.0 * u
                fy = GROUND - 21.5
            legs.append((fx, fy - bob))
        swing = math.sin(t * math.tau)
        arms = ((-swing * 2.6 + 1.0, 4.2 - abs(swing)), (swing * 2.6 + 1.0, 4.2 - abs(swing)))
        frames.append(
            draw_eli(
                body_dy=bob,
                lean=1.5,
                head_dx=0.4,
                legs=(legs[0], legs[1]),
                arms=arms,
                scarf=0.9,
                eyes="open",
                mouth="smile",
                hair_lift=0.6,
                cape_up=1.0,
            )
        )
    return frames


def anim_jump():
    return [
        draw_eli(
            body_dy=-0.6,
            lean=1.0,
            legs=((2.6, 4.4), (-1.0, 6.2)),
            arms=((0.6, -1.6), (-1.4, 1.0)),
            scarf=1.2,
            eyes="wide",
            mouth="open",
            hair_lift=1.2,
            cape_up=1.4,
        )
    ]


def anim_fall(n=2):
    out = []
    for i in range(n):
        out.append(
            draw_eli(
                body_dy=0.2 + i * 0.2,
                lean=0.4,
                legs=((3.0, 6.0 + i * 0.3), (-2.2, 5.0)),
                arms=((2.2, 1.2), (-2.0, 0.4 - i * 0.4)),
                scarf=1.4,
                eyes="wide",
                mouth="open",
                hair_lift=1.4,
                cape_up=1.6,
            )
        )
    return out


def anim_land(n=2):
    out = []
    for i in range(n):
        squash = 1.6 - i * 0.9
        out.append(
            draw_eli(
                body_dy=squash,
                lean=0.2,
                legs=((3.2, GROUND - 21.5 - squash), (-3.0, GROUND - 21.5 - squash)),
                arms=((3.0, 3.0), (-2.6, 3.0)),
                scarf=-0.4,
                eyes="half",
                mouth="flat",
            )
        )
    return out


def anim_cast(n=6):
    """Telekinesis pose: arm out, psychic eyes."""
    out = []
    for i in range(n):
        t = i / n
        p = math.sin(t * math.tau)
        out.append(
            draw_eli(
                body_dy=p * 0.4,
                lean=0.8,
                head_dx=0.5,
                legs=((2.4, GROUND - 21.5), (-2.6, GROUND - 21.5)),
                arms=((5.6 + p * 0.5, 0.6 + p * 0.4), (1.0, 4.4)),
                scarf=0.5 + p * 0.3,
                eyes="glow",
                mouth="flat",
                hair_lift=1.0 + p * 0.4,
                cape_up=0.8,
            )
        )
    return out


def anim_dash(n=3):
    out = []
    for i in range(n):
        out.append(
            draw_eli(
                body_dy=1.0,
                lean=2.6,
                head_dx=1.0,
                head_dy=0.6,
                legs=((-1.0 - i, 5.0), (-3.4 - i, 6.4)),
                arms=((4.4 + i * 0.4, 2.0), (-3.0, 3.2)),
                scarf=1.8,
                eyes="glow",
                mouth="flat",
                hair_lift=1.6,
                cape_up=2.0,
            )
        )
    return out


def anim_hurt():
    return [
        draw_eli(
            body_dy=-0.4,
            lean=-1.6,
            head_dx=-1.0,
            legs=((-2.0, 6.2), (1.6, 5.4)),
            arms=((-2.6, 1.0), (2.4, 1.4)),
            scarf=-1.2,
            eyes="shut",
            mouth="open",
            hair_lift=1.2,
        )
    ]


def anim_crouch():
    return [
        draw_eli(
            body_dy=3.2,
            lean=1.2,
            head_dy=0.6,
            legs=((3.0, GROUND - 24.7), (-2.6, GROUND - 24.7)),
            arms=((3.2, 2.0), (-1.4, 2.4)),
            scarf=-0.3,
            eyes="half",
            mouth="flat",
        )
    ]


def main():
    os.makedirs(OUT, exist_ok=True)
    sets = {
        "eli_idle": anim_idle(),
        "eli_run": anim_run(),
        "eli_jump": anim_jump(),
        "eli_fall": anim_fall(),
        "eli_land": anim_land(),
        "eli_cast": anim_cast(),
        "eli_dash": anim_dash(),
        "eli_hurt": anim_hurt(),
        "eli_crouch": anim_crouch(),
    }
    for name, frames in sets.items():
        write_png(os.path.join(OUT, name + ".png"), sheet(frames))
        print(f"{name}: {len(frames)} frames")


if __name__ == "__main__":
    main()
