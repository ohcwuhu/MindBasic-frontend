# companion-eyes

量 `public/companion/*` 里陪伴角色「眼睛画在哪」的小工具，给眨眼覆盖层用。

`src/components/ai-lab/CompanionSprite.vue` 里的 `EYE_ANCHORS` 就是本工具的输出：
对每个状态视频逐帧做模板匹配、取中位数，避免用肉眼估坐标。

## 什么时候要重跑

- 陪伴角色素材重新渲染过（`public/companion/` 里换了图或视频）
- 发现眨眼弧线又没贴在眼睛上

## 怎么跑

```bash
cd MindBasic-frontend
python tools/companion-eyes/measure_eyes.py            # 全部 6 个状态
python tools/companion-eyes/measure_eyes.py girl-breath  # 单个
```

输出是素材像素坐标（原图 625×947），直接替换 `CompanionSprite.vue` 里的 `EYE_ANCHORS`。

依赖：`ffmpeg` 在 PATH 里；python 装了 `numpy` / `pillow` / `scipy`。
