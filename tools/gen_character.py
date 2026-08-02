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
    "skin_sh": hexc("e2a274"),
    "hair": hexc("3b2b4f"),
    "hair_hi": hexc("614a80"),
    "hood": hexc("2fb8c6"),
    "hood_sh": hexc("1a7c8c"),
    "hood_hi": hexc("77e6ec"),
    "pants": hexc("3d4c72"),
    "pants_sh": hexc("2a3555"),
    "shoe": hexc("ec5a48"),
    "shoe_sh": hexc("a8362b"),
    "scarf": hexc("ff9257"),
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
    headx = shx + lean * 0.6 + head_dx
    heady = shy - 5.4 + head_dy

    legs = legs or (((0, GROUND - hipy), (0, GROUND - hipy)))
    arms = arms or ((1.5, 4.5), (1.5, 4.5))

    def draw_leg(target, col_leg, col_shoe):
        fx, fy = hipx + target[0], hipy + target[1]
        knee = ik(hipx, hipy, fx, fy, 4.2, 4.2, flip=-1)
        limb(c, hipx, hipy, knee[0], knee[1], 4.4, 3.4, col_leg)
        limb(c, knee[0], knee[1], fx, fy - 0.6, 3.4, 3.0, col_leg)
        # foot
        c.ellipse(fx + 0.9, fy - 0.4, 2.4, 1.5, col_shoe)

    def draw_arm(target, col):
        hx, hy = shx + target[0], shy + target[1]
        elbow = ik(shx, shy, hx, hy, 3.4, 3.4, flip=1)
        limb(c, shx, shy, elbow[0], elbow[1], 3.6, 2.8, col)
        limb(c, elbow[0], elbow[1], hx, hy, 2.8, 2.4, col)
        c.circle(hx, hy, 1.5, PAL["skin"])

    # back leg + back arm first
    draw_leg(legs[1], PAL["pants_sh"], PAL["shoe_sh"])
    draw_arm(arms[1], PAL["hood_sh"])

    # --- hoodie torso -------------------------------------------------------
    for i in range(9):
        t = i / 8.0
        x = hipx + (shx - hipx) * t
        y = hipy + (shy - hipy) * t
        w = 8.0 - 1.2 * t
        c.ellipse(x, y, w / 2, 2.0, PAL["hood"])
    # hem shadow keeps the hoodie from merging with the legs
    c.ellipse(hipx, hipy + 0.8, 3.9, 1.5, PAL["hood_sh"])
    c.ellipse(shx, shy - 0.4, 3.7, 2.2, PAL["hood"])
    # chest highlight
    c.ellipse(shx + 1.6, shy + 1.2, 1.4, 2.0, PAL["hood_hi"])

    # hood bunched behind the neck
    c.ellipse(shx - 2.8 - cape_up * 0.6, shy - 1.8 - cape_up, 2.6, 2.0, PAL["hood_sh"])

    # --- front leg + head ---------------------------------------------------
    draw_leg(legs[0], PAL["pants"], PAL["shoe"])

    # neck
    c.rect(headx - 0.5, heady + 3.4, 2, 2, PAL["skin_sh"])

    # head: hair mass sits back/up, face skin is drawn over its front-lower half
    c.ellipse(headx - 0.8, heady - 1.0 - hair_lift * 0.4, 5.2, 4.6, PAL["hair"])
    c.ellipse(headx - 3.4, heady + 0.4, 2.0, 3.0, PAL["hair"])

    c.ellipse(headx + 0.8, heady + 0.8, 4.2, 3.9, PAL["skin"])
    c.ellipse(headx + 1.4, heady + 2.0, 3.2, 2.6, PAL["skin"])
    # jaw shadow
    c.ellipse(headx - 1.6, heady + 2.6, 2.0, 1.6, PAL["skin_sh"])

    # fringe: spikes along the brow, never below the eyes
    for sx, sy, rx, ry in (
        (-1.6, -3.4, 2.6, 2.0),
        (1.2, -3.0, 2.2, 1.8),
        (3.2, -2.2, 1.6, 1.5),
    ):
        c.ellipse(headx + sx, heady + sy - hair_lift * 0.6, rx, ry, PAL["hair"])
    c.ellipse(headx - 0.6, heady - 4.2 - hair_lift * 0.6, 2.8, 1.0, PAL["hair_hi"])
    # sideburn / ear
    c.ellipse(headx - 2.6, heady + 0.2, 1.2, 1.6, PAL["hair"])

    # face: near eye reads white-with-pupil, far eye is a single dark column
    ex, ey = headx + 0.6, heady + 1.0
    nx = ex + 2.6
    if eyes == "shut":
        c.rect(ex, ey, 1, 1, PAL["line"])
        c.rect(nx, ey, 2, 1, PAL["line"])
    else:
        eh = {"open": 2, "half": 1, "wide": 3, "glow": 2}[eyes]
        top = ey - eh / 2.0
        pupil = PAL["psy"] if eyes == "glow" else PAL["line"]
        c.rect(ex, top, 1, eh, PAL["line"] if eyes != "glow" else pupil)
        c.rect(nx, top, 2, eh, PAL["white"])
        c.rect(nx + 1, top, 1, eh, pupil)
        if eyes == "glow":
            c.rect(ex - 1, top - 1, 2, eh + 2, (142, 247, 255, 70))
            c.rect(nx - 1, top - 1, 4, eh + 2, (142, 247, 255, 70))
    if mouth == "smile":
        c.set(nx - 0.4, ey + 2.4, PAL["line"])
        c.set(nx + 0.6, ey + 2.8, PAL["line"])
        c.set(nx + 1.6, ey + 2.4, PAL["line"])
    elif mouth == "open":
        c.ellipse(nx + 0.6, ey + 2.6, 1.2, 1.1, PAL["line"])
    elif mouth == "flat":
        c.line(nx - 0.4, ey + 2.6, nx + 1.4, ey + 2.6, PAL["line"])

    # --- scarf --------------------------------------------------------------
    c.ellipse(shx - 0.2, shy - 1.4, 2.9, 1.3, PAL["scarf"])
    tail_x = shx - 2.2
    tail_y = shy - 0.6
    seg = 4
    for i in range(seg):
        t = (i + 1) / seg
        x = tail_x - t * (2.2 + scarf * 3.0)
        y = tail_y + math.sin(t * 2.0 + scarf) * 1.4 + t * (1.6 - scarf * 3.0)
        col = PAL["scarf"] if i % 2 == 0 else PAL["scarf_sh"]
        c.circle(x, y, 1.6 - t * 0.5, col)

    # --- front arm ----------------------------------------------------------
    draw_arm(arms[0], PAL["hood"])

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
