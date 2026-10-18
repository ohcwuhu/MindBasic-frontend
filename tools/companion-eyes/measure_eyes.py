"""测量陪伴角色「眼睛」在素材里的位置。

用途：`src/components/ai-lab/CompanionSprite.vue` 里的眨眼覆盖层（代码画的睫毛弧线）
需要知道角色眼睛画在哪里，才能把弧线叠在眼睛上。眼位不是猜的，是用本脚本量出来的。

原理：
  1. 以 `public/companion/<gender>.png` 里人工框出的眼睛区域作为模板；
  2. 对某个状态视频（breath / thinking / speaking）逐帧做归一化模板匹配；
  3. 取所有帧结果的中位数 —— 角色在每个 loop 里头部会小幅移动，
     中位数代表该姿态下的“静止眼位”。

输出坐标是素材自身的像素空间（原图 625×947），可直接填进 CompanionSprite.vue
的 EYE_ANCHORS。素材重新渲染后，重跑本脚本刷新坐标即可。

依赖：ffmpeg / ffprobe 在 PATH 中，python 有 numpy + pillow + scipy。

用法：
    python measure_eyes.py                      # 测全部 6 个状态
    python measure_eyes.py girl-breath          # 只测一个
"""

import glob
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy.signal import fftconvolve

# 素材原图尺寸（眼睛模板就是在这张图上框出来的）
SPRITE_W, SPRITE_H = 625, 947

# 眼睛模板框：(x0, y0, x1, y1)，坐标基于 SPRITE_W × SPRITE_H
EYE_PATCHES = {
    "girl": {"left": (186, 329, 277, 397), "right": (390, 336, 474, 388)},
    "boy": {"left": (186, 330, 269, 396), "right": (366, 329, 438, 387)},
}

STATES = ["breath", "thinking", "speaking"]


def luminance(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def best_match(frame, tmpl, search):
    x0, y0, x1, y1 = search
    t = tmpl - tmpl.mean()
    f = frame - frame.mean()
    corr = fftconvolve(f, t[::-1, ::-1], mode="valid")
    sub = corr[y0:y1, x0:x1]
    iy, ix = np.unravel_index(np.argmax(sub), sub.shape)
    th, tw = tmpl.shape
    return (x0 + ix + tw / 2) / frame.shape[1], (y0 + iy + th / 2) / frame.shape[0]


def measure(gender, state, radius=45):
    video = "public/companion/%s-%s.mp4" % (gender, state)
    tmp = tempfile.mkdtemp(prefix="companion-eyes-")
    try:
        subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vsync", "0",
                        os.path.join(tmp, "%03d.png"), "-y"], check=True)
        files = sorted(glob.glob(os.path.join(tmp, "*.png")))
        with Image.open(files[0]) as first:
            vw, vh = first.size
        scale = vw / SPRITE_W
        png = Image.open("public/companion/%s.png" % gender)

        templates = {}
        for key, (x0, y0, x1, y1) in EYE_PATCHES[gender].items():
            crop = png.crop((x0, y0, x1, y1))
            templates[key] = luminance(
                crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS))

        tracks = {k: [] for k in templates}
        for path in files:
            frame = luminance(Image.open(path))
            for key, tmpl in templates.items():
                th, tw = tmpl.shape
                cx = EYE_PATCHES[gender][key][0] * scale + tw / 2
                cy = EYE_PATCHES[gender][key][1] * scale + th / 2
                search = (max(0, int(cx - radius)), max(0, int(cy - radius)),
                          min(vw - tw, int(cx + radius)), min(vh - th, int(cy + radius)))
                tracks[key].append(best_match(frame, tmpl, search))

        out = {}
        for key, pts in tracks.items():
            pts = np.array(pts)
            out[key] = (np.median(pts[:, 0]) * SPRITE_W, np.median(pts[:, 1]) * SPRITE_H)
        return out
    finally:
        for f in glob.glob(os.path.join(tmp, "*")):
            os.remove(f)
        os.rmdir(tmp)


def main():
    wanted = sys.argv[1:] or ["%s-%s" % (g, s) for g in ("girl", "boy") for s in STATES]
    print("素材像素坐标（原图 %dx%d），可直接填入 CompanionSprite.vue 的 EYE_ANCHORS\n"
          % (SPRITE_W, SPRITE_H))
    for item in wanted:
        gender, state = item.split("-", 1)
        res = measure(gender, state)
        lx, ly = res["left"]
        rx, ry = res["right"]
        print("  %-6s %-9s  [[%.0f, %.0f], [%.0f, %.0f]]" % (gender, state, lx, ly, rx, ry))


if __name__ == "__main__":
    main()
