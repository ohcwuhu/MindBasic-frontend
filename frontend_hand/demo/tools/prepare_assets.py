"""Build the demo's image set from 素材库2.0.

Every file the homepage ships is cut from the client's own material library: the PNG is
trimmed to its real ink, scaled to the size the layout actually paints it at (2x, for the
2x render the demo is captured at), and re-encoded to WebP so the page stays light.

Two mascot poses (打招呼 / 思考 / 困了) were exported onto white in 素材库2.0; the same
poses exist with real alpha in 前端设计/素材库, so those are taken from there instead of
keying a white background out by hand.

Run:  python tools/prepare_assets.py                 （全部重建）
      python tools/prepare_assets.py <名字> [<名字>…]  （只重建这几个，见 JOBS 里的输出名）
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image
import numpy as np

HERE = Path(__file__).resolve()
DEMO = HERE.parents[1]
OUT = DEMO / "assets"

LIB = Path(r"C:\Users\26329\Desktop\斐思同行\项目主体\素材库2.0")
DESIGN_LIB = Path(r"C:\Users\26329\Desktop\斐思同行\项目主体\前端设计\素材库")
HAND_FRONTEND = Path(r"C:\Users\26329\Desktop\斐思同行\项目主体\手绘风前端")
# the original product's 3D companion renders (MindBasic-frontend/public/companion)
COMPANION = Path(r"C:\Users\26329\Desktop\斐思同行\项目主体\项目代码\MindBasic-frontend\public\companion")
# 交付目录本身（frontend_hand）：客户端后来放进来的那几张背景图在这里
HAND = Path(r"C:\Users\26329\Desktop\斐思同行\项目主体\frontend_hand")
# 客户端给的第三版首页背景（「双人聊天版 · 优化后」，2896 × 1448，2 : 1）—— 他们放在交付目录里。
# 这一版人物组更小、更靠左，左上留白更大，专门给首屏文案让位；合成与调色说明见
# 演示图/优化说明-Hero插画.md。整幅画做 plate，草皮仍从同一幅画的底边重建。
HOME_BG = Path(
    r"C:\Users\26329\Desktop\斐思同行\项目主体\frontend_hand\演示图\首页背景-双人聊天版-优化后.png"
)

# ---------------------------------------------------------------------------------------------
# 内页那片草地的「降噪」
#
# 首页保留整幅插画；内页里背景是配角，内容才是主角 —— 所以把客户定稿的暖纸色按比例压在
# 草地上，纹理淡下去、纸感上来。口径来自客户端：**普通内页 62%**，画面更满的
# 带树 / 木屋 **45%**。首页那两件（hero-plate / hero-ground）不压。
#
# 压在图里而不是用 CSS 叠一层：这样「首帧底色 = 这张图的平均色」这条不变量照旧成立
# （tools/first-paint-check.py 会拿新图算平均色），页面也不用多一层背景。
# 想换强度就改下面这两个数，然后重跑本脚本 + `python tools/first-paint-check.py`。
# ---------------------------------------------------------------------------------------------
VEIL_INK = (255, 250, 246)  # --surface：纸色
VEIL = {
    "field-watercolour.webp": 0.62,  # 内页默认那张（含情绪日记页）
    "field-grass.webp": 0.62,  # 自我教练页自己那张
    "field-tree.webp": 0.45,  # 科普中心
    "field-cabin.webp": 0.45,  # 真人教练
}

# (source root, source relative path, output name, longest side in px, trim to ink)
JOBS: list[tuple[Path, str, str, int, bool]] = [
    # ---- hero -------------------------------------------------------------------------
    # `web-background.png` is not listed here: both the page's plate and its ground come out
    # of build_field() below, which has to crop the two of them to the same window.
    (LIB, r"两人草地聊天_水彩风_透明底_首页.png", "hero-scene.webp", 1800, True),
    # the whole plate, uncropped — the self-coaching page puts this behind the entire page
    (LIB, r"web-background.png", "field-full.webp", 2730, False),
    # ---- the original 3D companion (self-coaching video area) --------------------------
    # not trimmed: the original lays the sprite out on this whole 625×947 frame, so cutting
    # it to the ink would move the figure
    (COMPANION, "girl.png", "companion-girl.webp", 947, False),
    # ---- mascot 小苗 ------------------------------------------------------------------
    (DESIGN_LIB, r"01-吉祥物小苗\打招呼.png", "mascot-hello.webp", 420, True),
    (LIB, r"01-吉祥物小苗\倾听.png", "mascot-listen.webp", 640, True),
    (DESIGN_LIB, r"01-吉祥物小苗\思考.png", "mascot-think.webp", 640, True),
    (LIB, r"01-吉祥物小苗\开心.png", "mascot-happy.webp", 480, True),
    (LIB, r"01-吉祥物小苗\安抚.png", "mascot-comfort.webp", 640, True),
    (LIB, r"01-吉祥物小苗\盖章.png", "mascot-stamp.webp", 640, True),
    (LIB, r"01-吉祥物小苗\举牌.png", "mascot-sign.webp", 640, True),
    (DESIGN_LIB, r"01-吉祥物小苗\困了.png", "mascot-sleepy.webp", 420, True),
    # ---- 徽章印章 ---------------------------------------------------------------------
    (LIB, r"02-徽章印章\第一篇日记.png", "badge-first-journal.webp", 400, True),
    (LIB, r"02-徽章印章\首次对话.png", "badge-first-chat.webp", 400, True),
    (LIB, r"02-徽章印章\连续7天.png", "badge-streak-7.webp", 400, True),
    (LIB, r"02-徽章印章\教练首谈.png", "badge-first-coach.webp", 400, True),
    (LIB, r"02-徽章印章\深夜陪伴.png", "badge-night.webp", 400, True),
    (LIB, r"02-徽章印章\坚持30天.png", "badge-streak-30.webp", 400, True),
    # ---- 文章分类 ---------------------------------------------------------------------
    (LIB, r"03-文章分类\情绪调节.png", "cat-emotion.webp", 560, True),
    (LIB, r"03-文章分类\学习方法.png", "cat-study.webp", 560, True),
    (LIB, r"03-文章分类\人际关系.png", "cat-relation.webp", 560, True),
    (LIB, r"03-文章分类\自我成长.png", "cat-growth.webp", 560, True),
    (LIB, r"03-文章分类\危机科普.png", "cat-crisis.webp", 560, True),
    (LIB, r"03-文章分类\教练故事.png", "cat-story.webp", 560, True),
    # ---- 教练象征物 -------------------------------------------------------------------
    (LIB, r"04-教练象征物\一把椅子.png", "sym-chair.webp", 560, True),
    (LIB, r"04-教练象征物\一杯茶.png", "sym-tea.webp", 560, True),
    (LIB, r"04-教练象征物\一本书.png", "sym-book.webp", 480, True),
    (LIB, r"04-教练象征物\一盏灯.png", "sym-lamp.webp", 560, True),
    (LIB, r"04-教练象征物\一只猫.png", "sym-cat.webp", 560, True),
    (LIB, r"04-教练象征物\一株植物.png", "sym-plant.webp", 560, True),
    (LIB, r"04-教练象征物\一条围巾.png", "sym-scarf.webp", 560, True),
    (LIB, r"04-教练象征物\一轮月亮.png", "sym-moon.webp", 560, True),
    # ---- 测评五维 ---------------------------------------------------------------------
    (LIB, r"05-测评五维\情绪.png", "dim-emotion.webp", 400, True),
    (LIB, r"05-测评五维\投入.png", "dim-engagement.webp", 400, True),
    (LIB, r"05-测评五维\关系.png", "dim-relation.webp", 400, True),
    (LIB, r"05-测评五维\意义.png", "dim-meaning.webp", 400, True),
    (LIB, r"05-测评五维\行动.png", "dim-action.webp", 400, True),
    # ---- 表情 -------------------------------------------------------------------------
    (LIB, r"表情\表情-开心.png", "mood-happy.webp", 300, True),
    (LIB, r"表情\表情-平静.png", "mood-calm.webp", 300, True),
    (LIB, r"表情\表情-焦虑.png", "mood-anxious.webp", 300, True),
    (LIB, r"表情\表情-烦躁.png", "mood-irritable.webp", 300, True),
    (LIB, r"表情\表情-低落.png", "mood-low.webp", 300, True),
    (LIB, r"表情\表情-其他.png", "mood-other.webp", 300, True),
    # ---- 手绘道具 ---------------------------------------------------------------------
    (LIB, r"06-手绘道具\胶带-黄色.png", "prop-tape-yellow.webp", 520, True),
    (LIB, r"06-手绘道具\胶带-粉色.png", "prop-tape-pink.webp", 520, True),
    (LIB, r"06-手绘道具\胶带-绿色.png", "prop-tape-green.webp", 520, True),
    (LIB, r"06-手绘道具\图钉-粉色.png", "prop-pin-pink.webp", 200, True),
    (LIB, r"06-手绘道具\回形针.png", "prop-clip.webp", 220, True),
    (LIB, r"06-手绘道具\便利贴-黄色带图钉.png", "prop-sticky.webp", 560, True),
    (LIB, r"06-手绘道具\波浪下划线.png", "prop-underline.webp", 900, True),
    (LIB, r"06-手绘道具\圈注圆圈.png", "prop-circle.webp", 480, True),
    (LIB, r"06-手绘道具\对勾.png", "prop-check.webp", 240, True),
    (LIB, r"06-手绘道具\箭头-向右.png", "prop-arrow.webp", 320, True),
    (LIB, r"06-手绘道具\方格纸.png", "prop-grid.webp", 900, True),
    (LIB, r"06-手绘道具\横线纸.png", "prop-lines.webp", 900, True),
    (LIB, r"06-手绘道具\进度墨点.png", "prop-dots.webp", 900, True),
    # ---- wordmark (the client's own logo mark, already part of the shipped frontend) ----
    (HAND_FRONTEND / "public" / "assets", "logo-sprout.png", "logo-sprout.png", 120, False),
    # ---- 自我教练页自己的背景（客户端给的「情绪日记-背景图-更新版」，2730×1536）----------
    # 原尺寸转 WebP：这一页把整幅画在 body 上当背景，不缩不放（见 styles/self-coaching.css）
    (HAND, r"演示图\情绪日记-背景图-更新版.png", "emotion-journal-bg.webp", 2730, False),
    # ---- 情绪日记页自己的背景（客户端给的「纯水彩草地版」，2590×1619）--------------------
    # 固定背景（cover + fixed），所以这里只要原尺寸的图（见 styles/emotion-journal.css）
    (HAND, r"演示图\首页背景-纯水彩草地版.png", "field-watercolour.webp", 2590, False),
    # ---- 自我教练页的背景候选（客户端给的「纯水彩草地背景」，2590×1619，整幅草地）----------
    (HAND, r"演示图\纯水彩草地背景.png", "field-grass.webp", 2590, False),
    # ---- 内层页的背景：默认那张 + 两页专用的两张（客户端后来放进来的，2730×1536）----------
    # 科普中心用「带树」，真人教练用「木屋」，其余内层页用不带树不带屋的那张
    (HAND, r"演示图\首页背景-纯水彩草地版-带树.png", "field-tree.webp", 2730, False),
    (HAND, r"演示图\首页背景-纯水彩草地版-木屋.png", "field-cabin.webp", 2730, False),
]


def build(root: Path, rel: str, name: str, longest: int, trim: bool) -> str:
    src = root / rel
    if not src.exists():
        raise SystemExit(f"missing source: {src}")
    im = Image.open(src).convert("RGBA")
    if trim:
        box = im.getchannel("A").getbbox()
        if box:
            im = im.crop(box)
    w, h = im.size
    scale = min(1.0, longest / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    veil = VEIL.get(name)
    if veil:
        im = Image.alpha_composite(im, Image.new("RGBA", im.size, VEIL_INK + (round(255 * veil),)))
    dest = OUT / name
    if dest.suffix == ".webp":
        im.save(dest, "WEBP", quality=88, method=6)
    else:
        im.save(dest)
    tag = f"  纸色 {round(veil * 100)}%" if veil else ""
    return f"{name:26s} {im.size[0]:>5}x{im.size[1]:<5} {dest.stat().st_size / 1024:7.1f} KB{tag}"


# The window both field layers are cut to. Measured on the plate's bottom band: the left third
# is a blue-grey pond (blue-dominant columns out to x≈31%), a tan path crosses at x≈31%, and
# everything past x≈74% washes out to sand. Only x 33%…74% is unbroken grass, and the ground
# repeats whatever it is given down the length of the page — so both layers take that window,
# or the seam between them would show a colour step where water or sand meets grass.
FIELD_START = 0.33
FIELD_END = 0.74


def build_plate(longest: int = 2403) -> str:
    """The page's plate, cropped to the same window as the ground below it.

    Both layers have to cover the identical horizontal range, or the seam between them shows a
    colour step where the plate's pond meets the green ground. So the plate is cut to
    `FIELD_START … FIELD_END` and the ground tile is cut from the same window.
    """
    im = Image.open(LIB / "web-background.png").convert("RGB")
    w, h = im.size
    im = im.crop((int(w * FIELD_START), 0, int(w * FIELD_END), h))
    if max(im.size) > longest:
        scale = longest / max(im.size)
        im = im.resize((round(im.size[0] * scale), round(im.size[1] * scale)), Image.LANCZOS)
    dest = OUT / "field-bg.webp"
    im.save(dest, "WEBP", quality=90, method=6)
    return f"{'field-bg.webp':26s} {im.size[0]:>5}x{im.size[1]:<5} {dest.stat().st_size / 1024:7.1f} KB"


def build_ground(band: int = 140) -> str:
    """The page's ground: the plate's grass, levelled and then mirrored into a seamless tile.

    Three things have to be true at once, and each one is a step below.

    1. **No seam where the plate ends.** Read top to bottom the tile is
       `row[-1] … row[-band]` then `row[-band] … row[-1]`, so its first row *is* the plate's
       last row: the ground starts exactly where the plate's grass stops.
    2. **No wave.** The plate's last rows run from near-white into olive; mirroring that ramp
       would pulse light/dark every tile. So every row is divided by its own mean and
       multiplied by the last row's mean — a flat-field correction that keeps the blade
       texture and throws the gradient away, leaving one even tone.
    3. **No pond, no sand.** The plate's bottom-left is water and its bottom-right washes out
       to sand; the tile takes only the `FIELD_START … FIELD_END` window, so neither runs down
       the margin for the length of the page.
    """
    plate = Image.open(LIB / "web-background.png").convert("RGB")
    w, h = plate.size
    strip = plate.crop((int(w * FIELD_START), h - band, int(w * FIELD_END), h))
    sw = strip.size[0]

    # the tone every row is levelled to: the row that meets the plate
    target = tuple(
        round(sum(strip.getpixel((x, band - 1))[c] for x in range(0, sw, 8)) / len(range(0, sw, 8)))
        for c in range(3)
    )
    levelled = strip.copy()
    src, dst = strip.load(), levelled.load()
    for y in range(band):
        mean = [
            sum(src[x, y][c] for x in range(0, sw, 8)) / len(range(0, sw, 8)) for c in range(3)
        ]
        gain = [target[c] / max(mean[c], 1) for c in range(3)]
        for x in range(sw):
            r, g, b = src[x, y]
            dst[x, y] = (
                min(255, round(r * gain[0])),
                min(255, round(g * gain[1])),
                min(255, round(b * gain[2])),
            )

    # mirror into a tile whose top row is the plate's last row
    tile = Image.new("RGB", (sw, band * 2))
    tile.paste(levelled.transpose(Image.FLIP_TOP_BOTTOM), (0, 0))
    tile.paste(levelled, (0, band))
    dest = OUT / "field-ground.webp"
    tile.save(dest, "WEBP", quality=88, method=6)
    return f"{'field-ground.webp':26s} {tile.size[0]:>5}x{tile.size[1]:<5} {dest.stat().st_size / 1024:7.1f} KB"


def build_home_field(plate_width: int = 2896, band: int = 151) -> list[str]:
    """The homepage's own two layers, cut from the client's 双人聊天版 · 优化后 painting.

    The painting already contains the two people, so the homepage does not draw them on top
    of a separate illustration: the picture *is* the first band, and the ground below it is
    cut from the painting's own bottom edge (levelled, then mirrored into a seamless tile) so
    the band and the ground below it meet without a colour step — the same construction the
    earlier versions used, but the two layers now come out of the optimized image.

    Neither layer is stretched. The plate keeps the painting's own aspect (2896 : 1448 = 2 : 1)
    and is only ever scaled *down* to `plate_width`; the default is the source's own 2896 px,
    so nothing is resampled at all: the page paints the first band at 100% of the window width,
    and the picture the client handed over is the picture that ships. The tile is cut from the
    same width of the same painting, and `band` keeps the share of the height the earlier
    version took (160 of 1536 → 151 of 1448), so the strip of grass the notes stand on reads
    the same.
    """
    src = Image.open(HOME_BG).convert("RGB")
    w, h = src.size

    # 1 · the plate — the whole painting
    plate = src.copy()
    if plate.size[0] > plate_width:
        s = plate_width / plate.size[0]
        plate = plate.resize((plate_width, round(plate.size[1] * s)), Image.LANCZOS)
    dest = OUT / "hero-plate.webp"
    plate.save(dest, "WEBP", quality=90, method=6)
    lines = [
        f"{'hero-plate.webp':26s} {plate.size[0]:>5}x{plate.size[1]:<5}"
        f" {dest.stat().st_size / 1024:7.1f} KB"
    ]

    # 2 · the ground — the painting's bottom band, flat-fielded and mirrored
    strip = np.asarray(src.crop((0, h - band, w, h))).astype(np.float32)
    target = strip[band - 1, ::8, :].mean(axis=0)
    mean = strip[:, ::8, :].mean(axis=1)
    gain = target / np.maximum(mean, 1.0)
    levelled = np.clip(strip * gain[:, None, :], 0, 255).astype(np.uint8)
    tile = Image.fromarray(np.concatenate([levelled[::-1], levelled], axis=0))
    if tile.size[0] > plate_width:
        s = plate_width / tile.size[0]
        tile = tile.resize((plate_width, round(tile.size[1] * s)), Image.LANCZOS)
    dest = OUT / "hero-ground.webp"
    tile.save(dest, "WEBP", quality=88, method=6)
    lines.append(
        f"{'hero-ground.webp':26s} {tile.size[0]:>5}x{tile.size[1]:<5}"
        f" {dest.stat().st_size / 1024:7.1f} KB"
    )
    return lines


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    total = 0
    for root, rel, name, longest, trim in JOBS:
        if only and name not in only:
            continue
        line = build(root, rel, name, longest, trim)
        print(line)
        total += (OUT / name).stat().st_size
    for name, builder in (("field-bg.webp", build_plate), ("field-ground.webp", build_ground)):
        if only and name not in only:
            continue
        print(builder())
        total += (OUT / name).stat().st_size
    # 首页那两件从客户端给的「双人聊天版」整幅画里出（见 build_home_field）
    if not only or only & {"hero-plate.webp", "hero-ground.webp"}:
        for line in build_home_field():
            print(line)
        total += sum((OUT / n).stat().st_size for n in ("hero-plate.webp", "hero-ground.webp"))
    print(f"{'TOTAL':26s} {total / 1024 / 1024:>22.2f} MB  ({len(JOBS)} files)")


if __name__ == "__main__":
    main()
