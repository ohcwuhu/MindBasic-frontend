<!--
  AiLabView: AI 实验室（RelMind 复刻）— 实时视频情绪识别 + 音频 ASR/情感分析
  无重型模型时后端返回 source: mock 的确定性结果，UI 与协议完整可用。
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  PhCamera as CameraIcon,
  PhMicrophone as MicIcon,
  PhStop as StopIcon,
  PhPlay as PlayIcon,
  PhWarning as WarningIcon,
} from '@phosphor-icons/vue'
import type { AiAudioAnalysis, AiLabFrameResult } from '@/api/types'
import { getSocket } from '@/utils/socket'
import ErrorBanner from '@/components/ErrorBanner.vue'

// ---------- 视频情绪识别 ----------
const videoEl = ref<HTMLVideoElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const videoState = ref<'idle' | 'running' | 'error'>('idle')
const socketStatus = ref<'disconnected' | 'connected'>('disconnected')
const frameResult = ref<AiLabFrameResult | null>(null)
const videoError = ref('')
let stream: MediaStream | null = null
let frameTimer: number | undefined
let socket = getSocket()

function levelLabel(level: string): string {
  return { ENGAGED: '投入', NEUTRAL: '平稳', BORING: '需关注' }[level] ?? level
}

function levelClass(level: string): string {
  if (level === 'ENGAGED') return 'bg-pine-soft text-pine-deep'
  if (level === 'NEUTRAL') return 'bg-amber-100 text-amber-900'
  return 'bg-red-100 text-red-800'
}

async function startVideo() {
  videoError.value = ''
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
    }
    videoState.value = 'running'
    socket.on('emotion_result', (data: AiLabFrameResult) => (frameResult.value = data))
    socket.on('emotion_error', (data: { message?: string }) => {
      videoError.value = data?.message ?? '识别出错'
    })
    frameTimer = window.setInterval(captureFrame, 400)
  } catch (e) {
    videoState.value = 'error'
    videoError.value = e instanceof Error ? e.message : '无法访问摄像头'
  }
}

function captureFrame() {
  const video = videoEl.value
  const canvas = canvasEl.value
  if (!video || !canvas || video.readyState < 2) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = video.videoWidth || 640
  canvas.height = video.videoHeight || 480
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  socket.emit('upload_frame', { imgBase64: canvas.toDataURL('image/jpeg', 0.8) })
}

function stopVideo() {
  if (frameTimer !== undefined) window.clearInterval(frameTimer)
  socket.off('emotion_result')
  socket.off('emotion_error')
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  if (videoEl.value) videoEl.value.srcObject = null
  videoState.value = 'idle'
}

// ---------- 音频分析 ----------
const recording = ref(false)
const analyzing = ref(false)
const audioResult = ref<AiAudioAnalysis | null>(null)
const audioError = ref('')
let recorder: MediaRecorder | null = null
let chunks: BlobPart[] = []

async function startRecording() {
  audioError.value = ''
  audioResult.value = null
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio: true })
    recorder = new MediaRecorder(media)
    chunks = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      media.getTracks().forEach((track) => track.stop())
      uploadAudio(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }))
    }
    recorder.start()
    recording.value = true
  } catch (e) {
    audioError.value = e instanceof Error ? e.message : '无法访问麦克风'
  }
}

function stopRecording() {
  recorder?.stop()
  recording.value = false
}

async function uploadAudio(blob: Blob) {
  analyzing.value = true
  audioError.value = ''
  try {
    const token = localStorage.getItem('mb_access_token')
    const form = new FormData()
    form.append('file', blob, 'record.webm')
    const resp = await fetch('/api/v1/ai-lab/analyze-audio', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!resp.ok) throw new Error('分析失败，请稍后重试')
    const body = (await resp.json()) as { data: AiAudioAnalysis }
    audioResult.value = body.data
  } catch (e) {
    audioError.value = e instanceof Error ? e.message : '分析失败'
  } finally {
    analyzing.value = false
  }
}

const emotionBars = computed(() => {
  const scores = audioResult.value?.voice_features?.emotion_scores ?? {}
  const max = Math.max(1, ...Object.values(scores))
  return Object.entries(scores).map(([key, value]) => ({
    key,
    value,
    width: `${(value / max) * 100}%`,
  }))
})

socket.on('connect', () => (socketStatus.value = 'connected'))
socket.on('disconnect', () => (socketStatus.value = 'disconnected'))

onMounted(() => {
  socket = getSocket()
})

onUnmounted(() => {
  stopVideo()
  socket.off('connect')
  socket.off('disconnect')
})
</script>

<template>
  <div class="max-w-[880px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">AI 实验 · RelMind 复刻</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">情绪识别实验室</h1>
    <p class="mt-3 text-sm md:text-[15px] text-ink-soft leading-relaxed max-w-[56ch]">
      实时视频情绪识别 + 语音转文字与情感分析。未安装重型模型时后端返回演示结果（标记 mock）。
    </p>

    <section class="card mt-8 overflow-hidden">
      <div class="px-6 py-4 border-b border-hairline flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <CameraIcon :size="18" class="text-pine" weight="duotone" />
          <h2 class="font-semibold tracking-tight">实时视频情绪识别</h2>
        </div>
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1.5 text-xs" :class="socketStatus === 'connected' ? 'text-pine' : 'text-red-800'">
            <span class="w-2 h-2 rounded-full" :class="socketStatus === 'connected' ? 'bg-pine' : 'bg-red-800'"></span>
            {{ socketStatus === 'connected' ? '已连接' : '未连接' }}
          </span>
          <button
            v-if="videoState !== 'running'"
            type="button"
            class="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-pine text-card text-sm pressable"
            @click="startVideo"
          >
            <PlayIcon :size="15" weight="fill" /> 开启
          </button>
          <button
            v-else
            type="button"
            class="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
            @click="stopVideo"
          >
            <StopIcon :size="15" /> 关闭
          </button>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-6 p-6">
        <div>
          <video ref="videoEl" muted playsinline class="w-full aspect-[4/3] rounded-[12px] bg-paper object-cover border border-hairline"></video>
          <canvas ref="canvasEl" class="hidden"></canvas>
          <p v-if="videoError" class="mt-3 text-sm text-red-800">{{ videoError }}</p>
        </div>
        <div>
          <template v-if="frameResult">
            <div class="flex items-center justify-between gap-3">
              <p class="text-3xl font-semibold tracking-tight" :class="frameResult.alert ? 'text-red-800' : 'text-ink'">
                {{ frameResult.score }}
              </p>
              <span class="text-xs px-2.5 py-1 rounded-full" :class="levelClass(frameResult.level)">
                {{ levelLabel(frameResult.level) }}
              </span>
            </div>
            <div class="mt-2 h-2 rounded-full bg-paper overflow-hidden">
              <div class="h-full rounded-full transition-all" :class="frameResult.alert ? 'bg-red-800' : 'bg-pine'" :style="{ width: `${frameResult.score}%` }"></div>
            </div>
            <div v-if="frameResult.alert" class="mt-3 flex items-center gap-1.5 text-sm text-red-800">
              <WarningIcon :size="16" weight="fill" /> 投入度偏低，建议关注
            </div>
            <p class="catalog-tab mt-4">检测人数 {{ frameResult.students }} · {{ frameResult.source === 'mock' ? '演示数据' : '实时模型' }}</p>
            <div class="mt-4 space-y-2">
              <div v-for="(value, key) in frameResult.emotions" :key="key" class="flex items-center gap-2 text-sm">
                <span class="w-20 shrink-0 text-ink-soft">{{ key }}</span>
                <div class="flex-1 h-1.5 rounded-full bg-paper overflow-hidden">
                  <div class="h-full rounded-full bg-pine" :style="{ width: `${value * 100}%` }"></div>
                </div>
                <span class="w-12 text-right text-ink-faint">{{ Math.round(value * 100) }}%</span>
              </div>
            </div>
          </template>
          <p v-else class="text-sm text-ink-faint leading-relaxed">点击「开启」授权摄像头，实时画面将按 2.5 帧/秒发送识别。</p>
        </div>
      </div>
    </section>

    <section class="card mt-6 p-6">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <MicIcon :size="18" class="text-pine" weight="duotone" />
          <h2 class="font-semibold tracking-tight">语音转文字与情感分析</h2>
        </div>
        <button
          v-if="!recording"
          type="button"
          class="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-pine text-card text-sm pressable"
          @click="startRecording"
        >
          <MicIcon :size="15" weight="fill" /> 开始录音
        </button>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-red-800 text-card text-sm pressable"
          @click="stopRecording"
        >
          <StopIcon :size="15" weight="fill" /> 停止（5-15 秒）
        </button>
      </div>
      <ErrorBanner v-if="audioError" :message="audioError" class="mt-4" />
      <p v-if="analyzing" class="mt-4 text-sm text-ink-soft">正在分析语音…</p>

      <template v-if="audioResult">
        <div class="mt-5 rounded-[12px] bg-paper border border-hairline p-5">
          <p class="catalog-tab">识别文字</p>
          <p class="mt-2 text-[15px] leading-relaxed">{{ audioResult.transcription?.text ?? '—' }}</p>
          <div v-if="audioResult.voice_features" class="mt-5">
            <p class="catalog-tab">情感分析</p>
            <p class="mt-2 text-lg font-medium">
              {{ audioResult.voice_features.primary_emotion_cn }}
              <span class="ml-1">{{ audioResult.voice_features.primary_emotion_emoji }}</span>
            </p>
            <p v-if="audioResult.voice_features.primary_emotion_desc" class="mt-1 text-sm text-ink-soft">
              {{ audioResult.voice_features.primary_emotion_desc }}
            </p>
            <div class="mt-4 space-y-2">
              <div v-for="bar in emotionBars" :key="bar.key" class="flex items-center gap-2 text-sm">
                <span class="w-20 shrink-0 text-ink-soft">{{ bar.key }}</span>
                <div class="flex-1 h-1.5 rounded-full bg-paper overflow-hidden">
                  <div class="h-full rounded-full bg-pine" :style="{ width: bar.width }"></div>
                </div>
                <span class="w-12 text-right text-ink-faint">{{ Math.round(bar.value * 100) }}%</span>
              </div>
            </div>
            <div v-if="audioResult.voice_features.key_metrics.length" class="mt-5 grid grid-cols-3 gap-3">
              <div v-for="metric in audioResult.voice_features.key_metrics" :key="metric.key" class="rounded-[10px] bg-card border border-hairline p-3">
                <p class="text-lg font-semibold">{{ metric.value }}<span class="ml-1 text-xs text-ink-faint">{{ metric.unit }}</span></p>
                <p class="catalog-tab mt-1">{{ metric.label }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>
