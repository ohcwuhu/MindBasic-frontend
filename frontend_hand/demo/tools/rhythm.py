"""Compact density profile of a whole page render: mean colour and ink coverage per band."""
from __future__ import annotations

import sys

from PIL import Image


def main() -> None:
    path = sys.argv[1]
    bands = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    im = Image.open(path).convert("RGB")
    W, H = im.size
    step = H / bands
    print(f"# {path} {W}x{H} in {bands} bands of {step:.0f}px")
    for i in range(bands):
        y0, y1 = int(i * step), int((i + 1) * step)
        # mean colour from a downscaled strip; ink density from the real pixels (a thin
        # stroke must not be averaged away)
        small = im.crop((0, y0, W, max(y1, y0 + 1))).resize((160, 1))
        px = list(small.getdata())
        r = sum(p[0] for p in px) / len(px)
        g = sum(p[1] for p in px) / len(px)
        b = sum(p[2] for p in px) / len(px)
        band = im.crop((0, y0, W, max(y1, y0 + 1)))
        raw = band.load()
        dark = total = 0
        for yy in range(0, band.height, 2):
            for xx in range(0, W, 2):
                p = raw[xx, yy]
                total += 1
                if 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] < 150:
                    dark += 1
        ink = dark / max(total, 1)
        bar = "#" * int(ink * 60)
        print(f"  {i:3d} y{y0:6d}  #{int(r):02X}{int(g):02X}{int(b):02X}  ink {ink * 100:5.2f}%  {bar}")


if __name__ == "__main__":
    main()
