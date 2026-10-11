"""换页时那一下「颜色变了」的检查：底色是不是该页背景图自己的平均色。

为什么要有它：整页背景是 `cover` 大图，图没到之前先铺的是那条 `background: #xxx url(...)`
里的颜色。这个颜色要是随手写一个草绿，图一到整屏就从绿翻成暖 —— 看着就是闪一下。
所以判据只有一条：**每处底色都该约等于它那张图的整体平均色**（±12/255 以内，人眼这时
只察觉到纹理变清晰，察觉不到换色）。

检查两处：
  1. `styles/*.css` 里每一条 `background: #RRGGBB url('../assets/….webp')`
  2. 每一页 `<head>` 里 `<style data-first-paint>html{background:#RRGGBB}</style>` ——
     它配的那张 `<link rel="preload" as="image">` 就是这一页的背景图

用法：  python tools/first-paint-check.py       （不合规时退出码非 0）
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageStat

DEMO = Path(__file__).resolve().parents[1]
TOLERANCE = 12


def mean_color(path: Path) -> tuple[int, int, int]:
    image = Image.open(path).convert("RGB")
    r, g, b = ImageStat.Stat(image).mean
    return (round(r), round(g), round(b))


def rgb(hex_value: str) -> tuple[int, int, int]:
    value = hex_value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def delta(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def report(label: str, declared: str, image: Path) -> bool:
    if not image.exists():
        print(f"  ✗ {label}：找不到图 {image.name}")
        return False
    want, have = rgb(declared), mean_color(image)
    off = delta(want, have)
    ok = off <= TOLERANCE
    print(
        f"  {'✓' if ok else '✗'} {label:<34} 写死 {declared.upper()} · 图平均 "
        f"#%02X%02X%02X · 差 {off}" % have
    )
    return ok


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    failures = 0

    print("styles/*.css 里的底色：")
    for css in sorted((DEMO / "styles").glob("*.css")):
        text = css.read_text(encoding="utf-8")
        for declared, url in re.findall(r"background:\s*(#[0-9A-Fa-f]{6})\s+url\('([^']+)'", text):
            image = (css.parent / url).resolve()  # url 是相对 styles/ 的 ../assets/…
            if not report(f"{css.name} → {Path(url).name}", declared, image):
                failures += 1

    print("\n每页 <head> 里的首帧底色：")
    for page in sorted(DEMO.glob("*.html")):
        text = page.read_text(encoding="utf-8")
        color = re.search(r"<style data-first-paint>\s*html \{\s*background:\s*(#[0-9A-Fa-f]{6});", text)
        preload = re.search(r'<link rel="preload" as="image" href="([^"]+)"', text)
        if not color or not preload:
            print(f"  ✗ {page.name}：少了首帧底色或图片预取")
            failures += 1
            continue
        if not report(page.name, color.group(1), DEMO / preload.group(1)):
            failures += 1

    print(f"\n{'全部合规' if not failures else str(failures) + ' 处不合规'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
