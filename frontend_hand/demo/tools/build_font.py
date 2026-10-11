"""Self-host the two voices this page uses, subset to the characters it actually sets.

* `--font-hand` — **LXGW WenKai** (霞鹜文楷, OFL), the project's own hand-written voice. The
  npm webfont package publishes it as unicode-range chunks; only the chunks that can contain
  this page's characters are fetched, then folded into one ~30 KB subset so the page makes a
  single request.
* `--font-ui` — **Noto Sans SC** (OFL) 400/500/600, the CJK resort under the system stack,
  so the page sets correctly on a machine that has none of PingFang / Hiragino / YaHei.

Nothing is requested from a font CDN at page runtime. Re-run after copy changes, or new
glyphs fall back to a system face.

扫描范围是三处：`*.html`、`styles/*.css`、`scripts/*.js`（含两个编译包 —— 自我教练与情绪
日记那两页的文案在包里，不在 HTML 里）。字符范围也不再只收 ASCII + CJK 汉字：`…`、`—`、
`·`、`¥`、`（）`、`① ② ③` 这些同样要进子集，否则它们会掉回系统字体。

哪天觉得「页面上的字怎么是两种」，跑 `python tools/font-check.py` 看差多少。

Run:  python tools/build_font.py
"""
from __future__ import annotations

import re
import sys
import time
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger

HERE = Path(__file__).resolve()
DEMO = HERE.parents[1]
OUT = DEMO / "fonts"
CACHE = DEMO / ".cache" / "fonts"
CSS_UA = "Mozilla/5.0"
LXGW_CDN = "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0"

ASCII = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
PUNCT = "，。、；：？！（）《》「」『』【】—…·,.!?()[]{}<>/\\|+-=_*&%$#@~'\"`^:;　"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": CSS_UA})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def cached(url: str, name: str) -> bytes:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if path.exists():
        return path.read_bytes()
    data = fetch(url)
    path.write_bytes(data)
    return data


def page_text() -> str:
    """Every character the pages set —— HTML、样式表，以及脚本里拼出来的文案。"""
    chars = set(ASCII) | set(PUNCT)
    sources = (
        list(DEMO.glob("*.html"))
        + list((DEMO / "styles").glob("*.css"))
        + list((DEMO / "scripts").glob("*.js"))
    )
    for path in sources:
        chars |= set(path.read_text(encoding="utf-8"))
    keep = {c for c in chars if c.isprintable() and in_range(c)}
    return "".join(sorted(keep))


def in_range(ch: str) -> bool:
    """要进子集的码位：ASCII、拉丁补充（¥ © · ×）、常用标点（– — … →）、
    序号（① ② ③）、CJK 与 CJK 标点、全角形式（（），：；？）。"""
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


def subset_options():
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["DSIG"]
    return options


def save(font, stem: str, weight: str) -> None:
    for flavor in ("woff2", "woff"):
        options = subset_options()
        options.flavor = flavor
        path = OUT / f"{stem}-{weight}.{flavor}"
        try:
            subset.save_font(font, str(path), options)
        except Exception as exc:  # woff2 needs brotli; woff stays as the fallback
            print(f"    {flavor} unavailable: {exc}")
            continue
        print(f"    wrote {path.name}  {path.stat().st_size / 1024:.1f} KB")


def parse_face_blocks(css: str) -> list[tuple[str, str]]:
    out = []
    for block in re.findall(r"@font-face\s*\{(.*?)\}", css, re.S):
        url = re.search(r"url\(['\"]?(?:\./)?files/([^)'\"]+)['\"]?\)", block)
        rng = re.search(r"unicode-range:\s*([^;}]+)", block)
        if url and rng:
            out.append((url.group(1), rng.group(1).strip()))
    return out


def range_codepoints(rng: str) -> set[int]:
    points: set[int] = set()
    for part in rng.split(","):
        part = part.strip().upper().replace("U+", "")
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-")
            span = int(hi, 16) - int(lo, 16)
            if span > 32768:  # keep the scan bounded on the big CJK ranges
                points.add(int(lo, 16))
                continue
            points.update(range(int(lo, 16), int(hi, 16) + 1))
        else:
            points.add(int(part, 16))
    return points


def chunked_chunks(css_url: str, file_base: str, cache_key: str, text: str) -> list[Path]:
    """Fetch only the unicode-range chunks that can contain this page's characters."""
    css = cached(css_url, f"{cache_key}.css").decode("utf-8")
    wanted = {ord(c) for c in text if ord(c) > 0x2E7F}
    files: list[Path] = []
    total = 0
    for name, rng in parse_face_blocks(css):
        if not (range_codepoints(rng) & wanted):
            continue
        data = cached(f"{file_base}/{name}", name)
        total += len(data)
        files.append(CACHE / name)
    print(f"{cache_key}: {len(files)} chunks, {total / 1024:.0f} KB downloaded")
    return sorted(files)


def build_chunked(chunks: list[Path], stem: str, weight: str, text: str) -> None:
    if not chunks:
        raise SystemExit(f"no chunks matched the page's characters for {stem}")
    if len(chunks) == 1:
        merged = subset.load_font(str(chunks[0]), subset_options())
    else:
        merged = Merger().merge([str(p) for p in chunks])
    options = subset_options()
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(merged)
    save(merged, stem, weight)
    merged.close()


FONTSOURCE = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.2.5"


def build_noto(weights: tuple[str, ...], text: str) -> None:
    for weight in weights:
        build_chunked(
            chunked_chunks(
                f"{FONTSOURCE}/{weight}.css",
                f"{FONTSOURCE}/files",
                f"noto-sans-sc-{weight}",
                text,
            ),
            "noto-sans-sc-subset",
            weight,
            text,
        )


FONTS_CSS = """/* Generated by tools/build_font.py — do not edit by hand.
   Both faces are the project's own type system, self-hosted and subset to the characters
   this page sets. Re-run the script after copy changes. */

@font-face {
  font-family: 'LXGW WenKai';
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
  src: url('../fonts/lxgw-wenkai-subset-@W@.woff2') format('woff2'),
    url('../fonts/lxgw-wenkai-subset-@W@.woff') format('woff');
}
"""

NOTO_BLOCK = """
@font-face {
  font-family: 'Noto Sans SC';
  font-weight: @W@;
  font-style: normal;
  font-display: swap;
  src: url('../fonts/noto-sans-sc-subset-@W@.woff2') format('woff2'),
    url('../fonts/noto-sans-sc-subset-@W@.woff') format('woff');
}
"""


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    text = page_text()
    print(f"page charset: {len(text)} characters")
    build_chunked(
        chunked_chunks(
            f"{LXGW_CDN}/lxgwwenkai-bold.css", f"{LXGW_CDN}/files", "lxgw-wenkai-bold", text
        ),
        "lxgw-wenkai-subset",
        "700",
        text,
    )
    css = FONTS_CSS.replace("@W@", "700")
    build_noto(("400", "500", "600"), text)
    css += "".join(NOTO_BLOCK.replace("@W@", w) for w in ("400", "500", "600"))
    (DEMO / "styles" / "fonts.css").write_text(css, encoding="utf-8")
    print("    wrote styles/fonts.css")
    return 0


if __name__ == "__main__":
    sys.exit(main())
