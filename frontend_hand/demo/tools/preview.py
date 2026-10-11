"""ASCII-preview a rendered PNG (optionally a crop) so composition can be judged without eyes.

usage:  python preview.py <png> [cols] [x,y,w,h] [invert]
"""
from __future__ import annotations

import sys

from PIL import Image

RAMP = "@%#*+=-:. "  # dark -> light


def preview(path: str, cols: int, crop: tuple[int, int, int, int] | None, invert: bool) -> None:
    im = Image.open(path).convert("RGBA")
    if crop:
        x, y, w, h = crop
        im = im.crop((x, y, x + w, y + h))
    W, H = im.size
    rows = max(1, int(cols * H / W / 2.1))
    small = im.resize((cols, rows), Image.LANCZOS)
    px = list(small.getdata())
    print(f"### {path} crop={crop} {W}x{H} -> {cols}x{rows}")
    for y in range(rows):
        line = []
        for x in range(cols):
            r, g, b, a = px[y * cols + x]
            if a < 24:
                line.append(" ")
                continue
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            if invert:
                lum = 1 - lum
            idx = min(len(RAMP) - 1, max(0, int(lum * (len(RAMP) - 1) + 0.5)))
            line.append(RAMP[idx])
        print("".join(line))


def main() -> None:
    path = sys.argv[1]
    nums = [a for a in sys.argv[2:] if a.replace(",", "").isdigit()]
    flags = [a for a in sys.argv[2:] if not a.replace(",", "").isdigit()]
    cols = int(nums[0]) if nums and "," not in nums[0] else 110
    crop = None
    for n in nums:
        if "," in n:
            crop = tuple(int(v) for v in n.split(","))  # type: ignore[assignment]
    preview(path, cols, crop, "invert" in flags)


if __name__ == "__main__":
    main()
