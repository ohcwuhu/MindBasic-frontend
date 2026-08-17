<template>
  <div class="cs-root" :class="[state, { empathy }]">
    <!-- 落地阴影（随呼吸脉动） -->
    <span class="cs-shadow" aria-hidden="true"></span>

    <!-- 角色渲染区 -->
    <div class="cs-char">
      <!-- ===== 视频：idle/listening 状态用 canvas 黑幕抠像 ===== -->
      <template v-if="isVideoState">
        <video
          ref="videoRef"
          class="cs-video-src"
          :src="videoSrc"
          :key="videoSrc"
          muted
          loop
          playsinline
          preload="auto"
          @loadedmetadata="onVideoReady"
          @canplaythrough="startVideoRender"
        />
        <canvas ref="canvasRef" class="cs-canvas" />
      </template>

      <!-- ===== 静态图片：thinking/speaking/empathy 状态 ===== -->
      <img
        v-else
        :src="staticImageSrc"
        class="cs-frame active"
        draggable="false"
        alt=""
      />

      <!-- 眨眼 SVG 覆盖层（代码绘制，叠在视频/图上方） -->
      <transition name="cs-blink-fade">
        <div v-if="blinkVisible" class="cs-blink-overlay">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" class="cs-blink-svg">
            <template v-if="gender === 'girl'">
              <path d="M21 37 Q29 33 37 37" class="cs-eye-curve" />
              <path d="M59 37 Q67 33 75 37" class="cs-eye-curve" />
            </template>
            <template v-if="gender === 'boy'">
              <path d="M23 39 Q31 35 39 39" class="cs-eye-curve" />
              <path d="M57 39 Q65 35 73 39" class="cs-eye-curve" />
            </template>
          </svg>
        </div>
      </transition>
    </div>

    <!-- 共情心形 -->
    <span v-if="isEmpathy" class="cs-heart" aria-hidden="true">&#9825;</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

type CompanionState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'empathy'

const props = defineProps<{
  gender: 'boy' | 'girl'
  state?: CompanionState
  empathy?: boolean
  size?: number
}>()

const isEmpathy = computed(() => props.empathy)

// ====== 状态判断：哪些状态用视频、哪些用静态图 ======
const VIDEO_STATES = new Set(['idle', 'listening', 'thinking', 'speaking'])
const isVideoState = computed(() => {
  const s = props.state || 'listening'
  return VIDEO_STATES.has(s)
})

// ====== 资源路径 ======
const videoSrc = computed(() => {
  const g = props.gender || 'girl'
  const s = props.state || 'listening'
  if (s === 'thinking') return `/companion/${g}-thinking.mp4`
  if (s === 'speaking') return `/companion/${g}-speaking.mp4`
  // idle / listening → 呼吸视频
  return `/companion/${g}-breath.mp4`
})

function stateImage(g: string, s: string): string | null {
  if (s === 'thinking') return `/companion/${g}-thinking.png`
  if (s === 'speaking') return `/companion/${g}-speaking.png`
  if (s === 'empathy') return `/companion/${g}-empathy.png`
  return null
}
const staticImageSrc = computed(() => {
  const g = props.gender || 'girl'
  const s = props.state || 'listening'
  const img = stateImage(g, s)
  return img || `/companion/${g}.png` // fallback
})

// ====== 视频源引用 ======
const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let animId: number | null = null
let ctx: CanvasRenderingContext2D | null = null
let canvasW = 0
let canvasH = 0

/** 黑幕阈值：RGB 三通道都低于此值视为背景 → 设为透明 */
const BLACK_THRESHOLD = 30

/** 启动视频渲染循环 */
function startVideoRender() {
  const video = videoRef.value
  const cvs = canvasRef.value
  if (!video || !cvs) return

  // 设置 canvas 尺寸为容器实际大小
  const rect = cvs.parentElement?.getBoundingClientRect()
  if (rect && rect.width > 0) {
    canvasW = Math.floor(rect.width * window.devicePixelRatio)
    canvasH = Math.floor(rect.height * window.devicePixelRatio)
    cvs.width = canvasW
    cvs.height = canvasH
  }

  ctx = cvs.getContext('2d', { willReadFrequently: true })
  if (!ctx) return

  // 播放视频
  video.play().catch(() => {})

  // 开始 rAF 渲染循环
  function render() {
    if (!video || !cvs || !ctx) return
    if (!video.paused && !video.ended && ctx && cvs.width > 0) {
      // 0. 透明清屏（黑边在抠像后变透明）
      ctx.clearRect(0, 0, canvasW, canvasH)

      // 1. 等比 contain + 底部对齐绘制（避免拉伸变形，人物脚底贴底）
      //    容器宽高比已与视频素材(784x1184≈0.662)对齐，故基本满铺不变形
      const vw = video.videoWidth || 784
      const vh = video.videoHeight || 1184
      const scale = Math.min(canvasW / vw, canvasH / vh)
      const drawW = Math.round(vw * scale)
      const drawH = Math.round(vh * scale)
      const drawX = Math.round((canvasW - drawW) / 2)
      const drawY = Math.round(canvasH - drawH)
      ctx.drawImage(video, drawX, drawY, drawW, drawH)

      // 2. 黑幕抠像：将接近黑色的像素设为透明
      const imageData = ctx.getImageData(0, 0, canvasW, canvasH)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < BLACK_THRESHOLD && data[i + 1] < BLACK_THRESHOLD && data[i + 2] < BLACK_THRESHOLD) {
          data[i + 3] = 0 // alpha → 透明
        }
      }
      ctx.putImageData(imageData, 0, 0)
    }
    animId = requestAnimationFrame(render)
  }

  if (animId !== null) cancelAnimationFrame(animId)
  animId = requestAnimationFrame(render)
}

function stopVideoRender() {
  if (animId !== null) cancelAnimationFrame(animId)
  animId = null
  videoRef.value?.pause()
}

function onVideoReady() {
  startVideoRender()
}

// 监听视频源变化（idle↔thinking↔speaking 切换时重启渲染）
watch(videoSrc, () => {
  stopVideoRender()
})

// 监听状态变化：在视频/静态之间切换时重启/停止渲染
watch(isVideoState, (useVideo) => {
  if (useVideo) {
    nextTick(() => startVideoRender())
  } else {
    stopVideoRender()
  }
})

// ====== 眨眼逻辑（不变） ======
const blinkVisible = ref(false)
let blinkTimerId: ReturnType<typeof setTimeout> | null = null
let blinkHideTimerId: ReturnType<typeof setTimeout> | null = null

const BLINK_INTERVAL_MIN = 4000
const BLINK_INTERVAL_MAX = 8000
const BLINK_SHOW_MS = 160

function scheduleBlink() {
  const delay =
    BLINK_INTERVAL_MIN +
    Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN)
  blinkTimerId = setTimeout(() => {
    blinkVisible.value = true
    blinkHideTimerId = setTimeout(() => {
      blinkVisible.value = false
      scheduleBlink()
    }, BLINK_SHOW_MS)
  }, delay)
}

import { nextTick } from 'vue'

onMounted(() => {
  scheduleBlink()
  // 如果初始状态是视频状态，等 DOM 更新后启动渲染
  if (isVideoState.value) {
    nextTick(() => {
      // 给 video 一点时间加载
      setTimeout(startVideoRender, 200)
    })
  }
})

onBeforeUnmount(() => {
  stopVideoRender()
  if (blinkTimerId !== null) clearTimeout(blinkTimerId)
  if (blinkHideTimerId !== null) clearTimeout(blinkHideTimerId)
})
</script>

<style scoped>
/* ── 根容器 ── */
.cs-root {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

/* ── 落地阴影 ── */
.cs-shadow {
  position: absolute;
  bottom: 2%;
  left: 50%;
  width: 60%;
  height: 9px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0) 70%
  );
  pointer-events: none;
  z-index: 0;
  transform: translateX(-50%);
  animation: cs-shadow-pulse 2.33s ease-in-out infinite;
}
@keyframes cs-shadow-pulse {
  0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.9; }
  50%      { transform: translateX(-50%) scale(0.88); opacity: 0.55; }
}

/* ── 角色容器 ── */
.cs-char {
  position: absolute;
  inset: 0;
  z-index: 1;
  animation: cs-look-around 11s ease-in-out infinite;
}
@keyframes cs-look-around {
  0%,   18%  { transform: translateX(0); }
  25%,  43%  { transform: translateX(2.5px); }
  50%,  68%  { transform: translateX(0); }
  75%,  93%  { transform: translateX(-2px); }
  100%       { transform: translateX(0); }
}

/* ── 隐藏的视频源元素 ── */
.cs-video-src {
  display: none;
}

/* ── Canvas 画布（视频渲染输出） ── */
.cs-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* ── 静态图片（非视频状态） ── */
.cs-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: bottom center;
}

/* ── 眨眼 SVG 覆盖层 ── */
.cs-blink-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}
.cs-blink-svg {
  width: 100%;
  height: 100%;
}
.cs-eye-curve {
  fill: none;
  stroke: #5a3a32;
  stroke-width: 1.8;
  stroke-linecap: round;
  opacity: 0.82;
}

.cs-blink-fade-enter-active,
.cs-blink-fade-leave-active {
  transition: opacity 80ms ease-out;
}
.cs-blink-fade-enter-from,
.cs-blink-fade-leave-to {
  opacity: 0;
}

/* ── 共情心形 ── */
.cs-heart {
  position: absolute;
  top: -4px;
  right: -2px;
  font-size: 14px;
  line-height: 1;
  color: #e9b6c4;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  z-index: 3;
  animation: cs-heart-float 2.8s ease-in-out infinite;
}
@keyframes cs-heart-float {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.85; }
  50%      { transform: translateY(-4px) scale(1.15); opacity: 1; }
}

/* ── 无障碍降级 ── */
@media (prefers-reduced-motion: reduce) {
  .cs-shadow, .cs-char, .cs-heart {
    animation: none !important;
  }
  .cs-blink-fade-enter-active,
  .cs-blink-fade-leave-active {
    transition: none !important;
  }
}
</style>
