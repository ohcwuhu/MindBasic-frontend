"""字体子集够不够用：页面上有多少字并不在自托管的那份手写字体里。

为什么需要它：`verify.mjs` 只检查标题「声明」的字体族是不是 LXGW WenKai —— 声明对不代表字
有。子集是构建时按当时的文案切出来的，文案一改、新字就掉回系统字体（下一个字体栈里的
楷体 / Noto），页面上是两种字混着排，肉眼不细看还发现不了。

`build_font.py` 只扫 `*.html` 与 `styles/*.css`，所以它自己拼出来的文案（"还没有订单" 这种）
永远进不了子集 —— 这个脚本会把这一类单独列出来。

用法：  python tools/font-check.py
退出码非 0 表示子集已经落后于文案，该重跑 `python tools/build_font.py` 了。
"""
from __future__ import annotations

import sys
from pathlib import Path

from fontTools.ttLib import TTFont

DEMO = Path(__file__).resolve().parents[1]
SUBSET = DEMO / "fonts" / "lxgw-wenkai-subset-700.woff2"


def coverage(font_path: Path) -> set[str]:
    font = TTFont(str(font_path), lazy=True)
    chars: set[str] = set()
    for table in font["cmap"].tables:
        chars |= {chr(code) for code in table.cmap}
    font.close()
    return chars


def chars_of(text: str) -> set[str]:
    """和 build_font.py 的 in_range 保持同一套码位口径，否则「缺字」会两处不一样。"""
    def keep(ch: str) -> bool:
        code = ord(ch)
        if code < 128:
            return True
        return (
            0x00A0 <= code <= 0x00FF
            or 0x2000 <= code <= 0x206F
            or 0x2460 <= code <= 0x24FF
            or 0x2E80 <= code <= 0x9FFF
            or 0xFF00 <= code <= 0xFFEF
        )

    return {c for c in text if c.isprintable() and keep(c)}


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 控制台默认不是 UTF-8
    except Exception:
        pass

    have = coverage(SUBSET)
    html = sorted(DEMO.glob("*.html"))
    css = sorted((DEMO / "styles").glob("*.css"))
    js = sorted((DEMO / "scripts").glob("*.js"))

    # project 的口径：build_font.py 扫的就是这些
    page_text = "".join(p.read_text(encoding="utf-8") for p in html + css)
    page_chars = chars_of(page_text)
    cjk = {c for c in page_chars if ord(c) >= 0x2E80}
    missing = sorted(page_chars - have)

    print(f"子集字形 {len(have)} 个 · 页面用到 {len(page_chars)} 个字符（CJK {len(cjk)} 个）")
    if cjk:
        print(f"子集里没有的：{len(missing)} 个，占页面 CJK 的 {len(missing) / len(cjk) * 100:.1f}%")
        print("  " + "".join(missing))

    js_only = sorted((chars_of("".join(p.read_text(encoding="utf-8") for p in js)) - have) - page_chars)
    print(f"\n只在 scripts/*.js 里出现、子集里也没有的：{len(js_only)} 个（build_font.py 不扫 js）")
    print("  " + "".join(js_only))

    worst = []
    for path in html:
        gaps = {c for c in path.read_text(encoding="utf-8") if c in missing}
        if gaps:
            worst.append((len(gaps), path.name, "".join(sorted(gaps))))
    if worst:
        print("\n每页缺多少：")
        for count, name, sample in sorted(worst, reverse=True):
            print(f"  {name:<26} {count:>3} 个字  {sample[:32]}{'…' if len(sample) > 32 else ''}")

    return 1 if missing or js_only else 0


if __name__ == "__main__":
    raise SystemExit(main())
