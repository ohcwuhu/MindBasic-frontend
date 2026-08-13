<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import {
  PhRobot,
  PhVideoCamera,
  PhVideoCameraSlash,
  PhMicrophone,
  PhStop,
} from '@phosphor-icons/vue'

// ================================================================
//  常量与映射
// ================================================================
const API_BASE_URL = ''

const EMOTION_CN: Record<string, string> = {
  happy: '开心',
  sad: '悲伤',
  angry: '愤怒',
  surprised: '惊讶',
  fearful: '恐惧',
  disgusted: '厌恶',
  neutral: '平静',
}
const EMOTION_COLOR: Record<string, string> = {
  happy: '#2e9e6b',
  sad: '#4a7fd4',
  angry: '#d64545',
  surprised: '#d9a13b',
  fearful: '#8a63d2',
  disgusted: '#2c8f8f',
  neutral: '#9aa1ae',
}
const DEEPFACE_TO_UNIFIED: Record<string, string> = {
  happy: 'happy',
  surprise: 'surprised',
  neutral: 'neutral',
  fear: 'fearful',
  sad: 'sad',
  angry: 'angry',
  disgust: 'disgusted',
}
const LEVEL_CN: Record<string, string> = {
  ENGAGED: '投入',
  NEUTRAL: '平静',
  BORING: '分心',
}

interface ChatItem {
  role: 'user' | 'assistant'
  content: string
}
interface LiveEmotion {
  level: string
  score: number
  emotions: Record<string, number>
}
interface AnalysisResult {
  transcription?: { text?: string; language?: string; duration_seconds?: number }
  text_emotion?: { emotion?: string; emotion_cn?: string; confidence?: number }
  voice_emotion?: { emotion?: string; emotion_cn?: string; confidence?: number }
  fusion?: { final_emotion?: string; final_emotion_cn?: string; overall_confidence?: number }
}

// ================================================================
//  状态
// ================================================================
const messages = ref<ChatItem[]>([
  {
    role: 'assistant',
    content:
      '你好，我是你的 AI 心理教练。摄像头会一直帮我观察你的表情状态；可以用麦克风说话转成文字，也可以直接打字。',
  },
])
const chatInput = ref('')
const sending = ref(false)
const chatError = ref('')
const chatScrollRef = ref<HTMLElement | null>(null)

// 摄像头（常驻表情分析）
const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isCameraOn = ref(false)
const cameraError = ref('')
const liveEmotion = ref<LiveEmotion | null>(null)

// 语音输入
const isRecording = ref(false)
const isTranscribing = ref(false)
const recordSeconds = ref(0)
const voiceHint = ref('')

// 最近一次录音的分析结果（语调/文本情绪，随发送带上）
const analysisResult = ref<AnalysisResult | null>(null)

let mediaStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let socket: Socket | null = null
let frameTimer: number | null = null
let recordTimer: number | null = null
let recordStartTs = 0
let audioChunks: Blob[] = []
let isPageVisible = true

// ================================================================
//  表情识别（实时，常驻）
// ================================================================
const liveDominantEmotion = computed<string | null>(() => {
  const emo = liveEmotion.value?.emotions
  if (!emo) return null
  const top = Object.entries(emo).sort((a, b) => b[1] - a[1])[0]
  if (!top) return null
  return DEEPFACE_TO_UNIFIED[top[0]] ?? null
})

const liveEmotionColor = computed(() => EMOTION_COLOR[liveDominantEmotion.value || 'neutral'])

// 发送时附带的情感识别上下文：常驻表情 + 最近一次录音的语调
const analysisContext = computed<Record<string, any> | null>(() => {
  const ctx: Record<string, any> = {}
  if (liveDominantEmotion.value) ctx.facial_emotion = liveDominantEmotion.value
  if (liveEmotion.value && typeof liveEmotion.value.score === 'number') {
    ctx.live_score = liveEmotion.value.score
    ctx.live_level = liveEmotion.value.level
  }
  const a = analysisResult.value
  if (a?.voice_emotion?.emotion) {
    ctx.voice_emotion = a.voice_emotion.emotion_cn || a.voice_emotion.emotion
    if (typeof a.voice_emotion.confidence === 'number') ctx.voice_emotion_confidence = a.voice_emotion.confidence
  }
  if (a?.text_emotion?.emotion) {
    ctx.text_emotion = a.text_emotion.emotion_cn || a.text_emotion.emotion
  }
  if (a?.fusion?.final_emotion) {
    ctx.fusion_emotion = a.fusion.final_emotion_cn || a.fusion.final_emotion
  }
  return Object.keys(ctx).length > 0 ? ctx : null
})

const contextSummary = computed(() => {
  const ctx = analysisContext.value
  if (!ctx) return ''
  const parts: string[] = []
  if (ctx.facial_emotion) parts.push(`表情 ${ctx.facial_emotion}`)
  if (ctx.voice_emotion) parts.push(`语调 ${ctx.voice_emotion}`)
  if (ctx.fusion_emotion && ctx.fusion_emotion !== ctx.facial_emotion) parts.push(`融合 ${ctx.fusion_emotion}`)
  if (ctx.live_score !== undefined) parts.push(`投入 ${ctx.live_score} 分`)
  return parts.join(' · ')
})

function connectSocket() {
  if (socket && socket.connected) return
  socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] })
  socket.on('emotion_result', (data: LiveEmotion) => {
    liveEmotion.value = data
  })
  socket.on('emotion_error', (data: { message?: string }) => {
    cameraError.value = data?.message || '表情识别出错'
  })
  socket.on('connect_error', (err) => {
    cameraError.value = `识别服务连接失败：${err.message}`
  })
}

function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.close()
    socket = null
  }
}

function captureFrame() {
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!video || !canvas || !isPageVisible || !isCameraOn.value) return
  const ctx = canvas.getContext('2d')
  if (!ctx || video.videoWidth === 0) return
  const w = 320
  const h = Math.round(video.videoHeight * (w / video.videoWidth))
  canvas.width = w
  canvas.height = h
  ctx.drawImage(video, 0, 0, w, h)
  socket?.emit('upload_frame', { imgBase64: canvas.toDataURL('image/jpeg', 0.6) })
}

// ================================================================
//  摄像头：进入页面即开启，常驻表情分析
// ================================================================
async function startCamera() {
  cameraError.value = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640 },
      audio: true,
    })
    mediaStream = stream
    const video = videoRef.value
    if (video) {
      video.srcObject = stream
      await video.play()
    }
    isCameraOn.value = true
    connectSocket()
    frameTimer = window.setInterval(captureFrame, 400)
  } catch (err: any) {
    cameraError.value = `无法开启摄像头：${err?.message || '请检查浏览器权限设置'}`
  }
}

function stopCamera() {
  if (frameTimer !== null) {
    clearInterval(frameTimer)
    frameTimer = null
  }
  stopRecordingInternal()
  mediaStream?.getTracks().forEach((t) => t.stop())
  mediaStream = null
  if (videoRef.value) videoRef.value.srcObject = null
  isCameraOn.value = false
  liveEmotion.value = null
  disconnectSocket()
}

// ================================================================
//  语音输入：录音 → 转文字放入输入框（由用户决定是否发送）
// ================================================================
function startVoiceInput() {
  if (isRecording.value) return
  if (!mediaStream || mediaStream.getAudioTracks().length === 0) {
    voiceHint.value = '请先允许麦克风权限'
    return
  }
  const audioTracks = mediaStream.getAudioTracks()
  const audioOnly = new MediaStream(audioTracks)
  const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', '']
  let recorder: MediaRecorder | null = null
  for (const type of mimeTypes) {
    try {
      recorder = new MediaRecorder(audioOnly, type ? { mimeType: type } : undefined)
      break
    } catch {
      /* 尝试下一种 */
    }
  }
  if (!recorder) {
    voiceHint.value = '当前浏览器不支持录音'
    return
  }
  audioChunks = []
  recordStartTs = Date.now()
  recordSeconds.value = 0
  voiceHint.value = ''
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data)
  }
  recorder.onstop = () => {
    isRecording.value = false
    if (recordTimer !== null) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    void transcribeAudio()
  }
  recorder.start(800)
  mediaRecorder = recorder
  isRecording.value = true
  recordTimer = window.setInterval(() => {
    recordSeconds.value += 1
  }, 1000)
}

function stopVoiceInput() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
}

function stopRecordingInternal() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  mediaRecorder = null
  isRecording.value = false
  if (recordTimer !== null) {
    clearInterval(recordTimer)
    recordTimer = null
  }
}

async function transcribeAudio() {
  if (audioChunks.length === 0) return
  const firstMime = audioChunks[0]?.type || 'audio/webm;codecs=opus'
  const blob = new Blob(audioChunks, { type: firstMime })
  const ext = firstMime.includes('webm') ? 'webm' : firstMime.includes('wav') ? 'wav' : 'webm'
  const form = new FormData()
  form.append('file', blob, `voice_${Date.now()}.${ext}`)
  form.append('sid', socket?.id || '')
  form.append('record_start_ts', String(recordStartTs))
  form.append('record_end_ts', String(Date.now()))

  isTranscribing.value = true
  voiceHint.value = '正在转写语音，请稍候'
  try {
    const resp = await fetch(`${API_BASE_URL}/api/analyze_audio`, { method: 'POST', body: form })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data?.detail || `转写失败（${resp.status}）`)
    analysisResult.value = data
    const text = data?.transcription?.text?.trim()
    if (text) {
      chatInput.value = text
      voiceHint.value = '语音已转成文字，可编辑后发送'
    } else {
      voiceHint.value = '没有识别到有效语音，请重试'
    }
  } catch (err: any) {
    voiceHint.value = `转写失败：${err?.message || '请重试'}`
  } finally {
    isTranscribing.value = false
  }
}

const recordLabel = computed(() => {
  const m = Math.floor(recordSeconds.value / 60)
  const s = String(recordSeconds.value % 60).padStart(2, '0')
  return `${m}:${s}`
})

// ================================================================
//  对话
// ================================================================
function scrollToBottom() {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight
    }
  })
}

function pushMessage(item: ChatItem) {
  messages.value.push(item)
  scrollToBottom()
}

async function send() {
  const text = chatInput.value.trim()
  if (!text || sending.value) return
  chatInput.value = ''
  chatError.value = ''
  voiceHint.value = ''
  pushMessage({ role: 'user', content: text })
  sending.value = true
  scrollToBottom()
  try {
    const history = messages.value
      .filter((m) => m.content.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }))
    const resp = await fetch(`${API_BASE_URL}/api/ai_coach/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, context: analysisContext.value }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data?.detail || `请求失败（${resp.status}）`)
    pushMessage({ role: 'assistant', content: data.reply || 'AI 暂时没有回复，请再试一次' })
  } catch (err: any) {
    chatError.value = `AI 暂时无法回复：${err?.message || '网络异常，请重试'}`
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
}

function handleVisibility() {
  isPageVisible = document.visibilityState === 'visible'
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibility)
  scrollToBottom()
  void startCamera()
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibility)
  stopCamera()
})
</script>

<template>
  <div class="ai-chat-page">
    <!-- ===== 常驻表情分析面板 ===== -->
    <section class="camera-card" :class="{ active: isCameraOn }">
      <div class="camera-video-wrap">
        <video ref="videoRef" class="camera-video" autoplay playsinline muted></video>
        <canvas ref="canvasRef" class="camera-canvas"></canvas>

        <div v-if="!isCameraOn && !cameraError" class="camera-placeholder">
          <PhVideoCamera :size="28" weight="thin" />
          <span>正在请求摄像头…</span>
        </div>

        <div v-if="liveEmotion" class="camera-emotion">
          <span class="emotion-dot" :style="{ backgroundColor: liveEmotionColor }"></span>
          <span class="emotion-label">
            {{ EMOTION_CN[liveDominantEmotion || 'neutral'] || '识别中' }}
            · {{ LEVEL_CN[liveEmotion.level] || liveEmotion.level }} {{ liveEmotion.score }} 分
          </span>
        </div>
        <div v-else-if="isCameraOn" class="camera-emotion">
          <span class="emotion-dot neutral"></span>
          <span class="emotion-label">表情分析中</span>
        </div>
      </div>

      <div class="camera-info">
        <div class="camera-title">
          <span class="status-dot" :class="{ on: isCameraOn }" aria-hidden="true"></span>
          <span>表情识别</span>
          <span class="camera-sub">{{ isCameraOn ? '持续运行中' : '未开启' }}</span>
        </div>
        <p class="camera-desc">摄像头保持开启，实时分析你的表情，对话时会自动附上结果</p>
        <button v-if="!isCameraOn" class="cam-btn primary" @click="startCamera">
          <PhVideoCamera :size="16" weight="bold" />
          {{ cameraError ? '重新开启' : '开启摄像头' }}
        </button>
        <button v-else class="cam-btn ghost" @click="stopCamera">
          <PhVideoCameraSlash :size="16" weight="bold" />
          关闭摄像头
        </button>
      </div>

      <p v-if="cameraError" class="camera-error" role="alert">{{ cameraError }}</p>
    </section>

    <!-- ===== 对话区（豆包式排版） ===== -->
    <div class="chat-wrap">
      <div ref="chatScrollRef" class="chat-scroll">
        <div
          v-for="(m, i) in messages"
          :key="i"
          class="msg-row"
          :class="m.role === 'user' ? 'user' : 'assistant'"
        >
          <div v-if="m.role === 'assistant'" class="avatar" aria-hidden="true">
            <PhRobot :size="20" weight="duotone" />
          </div>
          <div class="bubble">{{ m.content }}</div>
        </div>

        <div v-if="sending" class="msg-row assistant">
          <div class="avatar" aria-hidden="true">
            <PhRobot :size="20" weight="duotone" />
          </div>
          <div class="bubble typing" aria-label="AI 正在思考">
            <span></span><span></span><span></span>
          </div>
        </div>
        <p v-if="chatError" class="chat-error" role="alert">{{ chatError }}</p>
      </div>

      <div class="chat-input-bar">
        <div v-if="contextSummary" class="context-line" aria-live="polite">
          本次发送将附带：{{ contextSummary }}
        </div>
        <div class="input-row">
          <button
            class="mic-btn"
            :class="{ recording: isRecording }"
            :disabled="isTranscribing"
            :aria-label="isRecording ? '结束录音' : '语音输入'"
            @click="isRecording ? stopVoiceInput() : startVoiceInput()"
          >
            <PhMicrophone v-if="!isRecording" :size="20" weight="bold" />
            <PhStop v-else :size="20" weight="fill" />
          </button>
          <textarea
            v-model="chatInput"
            class="chat-textarea"
            rows="1"
            :placeholder="isRecording ? `录音中 ${recordLabel}` : '说点什么，或按 Enter 发送'"
            :disabled="sending || isRecording || isTranscribing"
            @keydown="onInputKeydown"
          ></textarea>
          <button class="send-btn" :disabled="sending || !chatInput.trim()" @click="send">
            {{ sending ? '思考中' : '发送' }}
          </button>
        </div>
        <div class="input-hints" aria-live="polite">
          <span v-if="isRecording" class="recording-hint">录音中 {{ recordLabel }}，再次点击麦克风结束</span>
          <span v-else-if="isTranscribing" class="transcribing-hint">{{ voiceHint || '正在转写语音' }}</span>
          <span v-else-if="voiceHint" class="voice-hint">{{ voiceHint }}</span>
          <span v-else class="default-hint">文字会连同表情识别结果一起发送给 AI</span>
        </div>
        <p class="disclaimer">
          AI 教练为成长辅助工具，不提供诊断或治疗；如有自伤或危机信号，请立即拨打心理援助热线
          <b>12356</b>，或尽快寻求线下专业帮助。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 设计规范：纸白底 / 墨色文字 / 松绿强调 / 圆角 14-12 两级 */
.ai-chat-page {
  min-height: calc(100dvh - 64px);
  background: var(--color-paper);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 16px 0;
  box-sizing: border-box;
}

/* ===== 常驻表情面板 ===== */
.camera-card {
  width: min(760px, 100%);
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  border-radius: 14px;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
}
.camera-card.active {
  border-color: color-mix(in srgb, var(--color-pine) 35%, var(--color-hairline));
}
.camera-video-wrap {
  position: relative;
  width: 172px;
  height: 114px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--color-ink);
  flex-shrink: 0;
}
.camera-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}
.camera-canvas {
  display: none;
}
.camera-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #b9beb4;
  font-size: 12px;
  background: var(--color-ink);
  box-sizing: border-box;
}
.camera-emotion {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(28, 28, 26, 0.68);
  border-radius: 10px;
  padding: 5px 9px;
  color: #fff;
  font-size: 12px;
}
.emotion-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.emotion-dot.neutral {
  background: #9aa1ae;
}
.emotion-label {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.camera-info {
  flex: 1;
  min-width: 210px;
}
.camera-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink);
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c8cac2;
}
.status-dot.on {
  background: var(--color-pine);
}
.camera-sub {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-ink-soft);
}
.camera-desc {
  margin: 6px 0 10px;
  font-size: 12.5px;
  color: var(--color-ink-soft);
  line-height: 1.55;
}
.cam-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--color-card);
  color: var(--color-ink-soft);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.2s ease, border-color 0.2s ease;
}
.cam-btn.primary {
  background: var(--color-pine);
  border-color: var(--color-pine);
  color: #fff;
}
.cam-btn.primary:hover {
  background: var(--color-pine-deep);
}
.cam-btn.ghost {
  border-color: var(--color-hairline);
}
.cam-btn.ghost:hover {
  background: var(--color-paper);
}
.cam-btn:active {
  transform: scale(0.98);
}
.cam-btn:focus-visible,
.mic-btn:focus-visible,
.send-btn:focus-visible,
.chat-textarea:focus-visible {
  outline: 2px solid var(--color-pine);
  outline-offset: 2px;
}
.camera-error {
  width: 100%;
  margin: 0;
  color: #c2402f;
  font-size: 12.5px;
}

/* ===== 对话区 ===== */
.chat-wrap {
  width: min(760px, 100%);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 14px;
}
.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 2px 10px;
}
.msg-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 86%;
}
.msg-row.user {
  align-self: flex-end;
  justify-content: flex-end;
}
.msg-row.assistant {
  align-self: flex-start;
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--color-pine-deep);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.bubble {
  padding: 11px 15px;
  border-radius: 14px;
  font-size: 15px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-row.assistant .bubble {
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  color: var(--color-ink);
  border-top-left-radius: 4px;
}
.msg-row.user .bubble {
  background: var(--color-pine);
  color: #fff;
  border-top-right-radius: 4px;
}
.typing {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 15px 16px;
}
.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-pine);
  opacity: 0.35;
  animation: blink 1.2s infinite ease-in-out;
}
.typing span:nth-child(2) {
  animation-delay: 0.2s;
}
.typing span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
.chat-error {
  align-self: center;
  margin: 0;
  color: #c2402f;
  font-size: 13px;
  background: #fbeae6;
  padding: 8px 14px;
  border-radius: 12px;
}

/* ===== 输入区 ===== */
.chat-input-bar {
  background: var(--color-card);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 16px;
  box-shadow: 0 6px 24px rgba(28, 28, 26, 0.08);
}
.context-line {
  font-size: 12.5px;
  color: var(--color-pine);
  background: var(--color-pine-soft);
  border-radius: 10px;
  padding: 6px 10px;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.mic-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--color-hairline);
  background: var(--color-paper);
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: transform 0.1s ease, background 0.2s ease, border-color 0.2s ease;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mic-btn:hover:not(:disabled) {
  border-color: var(--color-pine);
  color: var(--color-pine);
}
.mic-btn.recording {
  background: #c2402f;
  border-color: #c2402f;
  color: #fff;
}
.mic-btn:active {
  transform: scale(0.96);
}
.mic-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.chat-textarea {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  font-size: 15px;
  line-height: 1.6;
  font-family: inherit;
  padding: 10px 4px;
  max-height: 120px;
  background: transparent;
  color: var(--color-ink);
}
.chat-textarea::placeholder {
  color: var(--color-ink-soft);
}
.send-btn {
  border: none;
  background: var(--color-pine);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  padding: 10px 22px;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.2s ease;
  flex-shrink: 0;
}
.send-btn:hover:not(:disabled) {
  background: var(--color-pine-deep);
}
.send-btn:active {
  transform: scale(0.98);
}
.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.input-hints {
  min-height: 18px;
  margin-top: 8px;
  font-size: 12.5px;
}
.recording-hint {
  color: #c2402f;
  font-weight: 600;
}
.transcribing-hint {
  color: var(--color-pine);
}
.voice-hint {
  color: var(--color-pine);
}
.default-hint {
  color: var(--color-ink-soft);
}
.disclaimer {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--color-ink-soft);
  line-height: 1.6;
}

@media (max-width: 640px) {
  .ai-chat-page {
    min-height: calc(100dvh - 56px);
    padding: 10px 10px 0;
  }
  .camera-card {
    padding: 10px;
  }
  .camera-video-wrap {
    width: 132px;
    height: 92px;
  }
  .camera-info {
    min-width: 0;
  }
}
</style>
