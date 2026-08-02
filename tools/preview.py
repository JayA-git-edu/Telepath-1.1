"""Upscale spritesheets onto a dark backdrop so art can be eyeballed."""

import os
import sys

from pixelart import Canvas, hexc, write_png

ROOT = os.path.join(os.path.dirname(__file__), "..")


def read_png(path):
    """Minimal PNG reader for the RGBA8 files this pipeline writes."""
    import struct
    import zlib

    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    pos = 8
    w = h = None
    idat = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if tag == b"IHDR":
            w, h, bd, ct = struct.unpack(">IIBB", body[:10])
            assert bd == 8 and ct == 6, (bd, ct)
        elif tag == b"IDAT":
            idat += body
        pos += 12 + ln
    raw = zlib.decompress(idat)
    c = Canvas(w, h)
    stride = w * 4
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        ft = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        for i in range(stride):
            a = line[i - 4] if i >= 4 else 0
            b = prev[i]
            cc = prev[i - 4] if i >= 4 else 0
            if ft == 1:
                line[i] = (line[i] + a) & 255
            elif ft == 2:
                line[i] = (line[i] + b) & 255
            elif ft == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif ft == 4:
                pa = abs(b - cc)
                pb = abs(a - cc)
                pc = abs(a + b - 2 * cc)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else cc)
                line[i] = (line[i] + pr) & 255
        for x in range(w):
            o = x * 4
            c.px[y * w + x] = [line[o], line[o + 1], line[o + 2], line[o + 3]]
        prev = line
    return c


def preview(paths, out, scale=6, frame_w=None, cols=None):
    imgs = [(os.path.basename(p), read_png(p)) for p in paths]
    pad = 4
    width = max(i.w for _, i in imgs) * scale + pad * 2
    height = sum(i.h * scale + pad for _, i in imgs) + pad
    out_c = Canvas(width, height, hexc("101018"))
    y = pad
    for name, img in imgs:
        for j in range(img.h):
            for i in range(img.w):
                col = img.get(i, j)
                if col[3] == 0:
                    checker = hexc("22222c") if ((i // 8 + j // 8) % 2 == 0) else hexc("2c2c38")
                    col = checker
                out_c.rect(pad + i * scale, y + j * scale, scale, scale, col)
        y += img.h * scale + pad
    write_png(out, out_c)
    print(out, out_c.w, "x", out_c.h)


if __name__ == "__main__":
    files = sys.argv[2:]
    preview(files, sys.argv[1], scale=int(os.environ.get("SCALE", "6")))
