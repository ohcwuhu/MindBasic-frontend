"""Print the colour down a vertical (or across a horizontal) line of a render.

usage: python scan.py <png> <v|x> <position> [start] [end] [step]
"""
from __future__ import annotations

import sys

from PIL import Image


def main() -> None:
    path = sys.argv[1]
    axis = sys.argv[2]
    pos = int(sys.argv[3])
    start = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    end = int(sys.argv[5]) if len(sys.argv) > 5 else -1
    step = int(sys.argv[6]) if len(sys.argv) > 6 else 40
    im = Image.open(path).convert("RGB")
    W, H = im.size
    if end < 0:
        end = H if axis == "v" else W
    print(f"# {path} {W}x{H}  {'down' if axis == 'v' else 'across'} at {pos}")
    for t in range(start, end, step):
        if axis == "v":
            r, g, b = im.getpixel((min(pos, W - 1), min(t, H - 1)))
            label = f"y={t:5d}"
        else:
            r, g, b = im.getpixel((min(t, W - 1), min(pos, H - 1)))
            label = f"x={t:5d}"
        print(f"  {label}  #{r:02X}{g:02X}{b:02X}  ({(0.299 * r + 0.587 * g + 0.114 * b):5.1f})")


if __name__ == "__main__":
    main()
