<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { io, type Socket } from 'socket.io-client'

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
  neutral: '中性',
}
const EMOTION_EMOJI: Record<string, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😠',
  surprised: '😲',
  fearful: '😨',
  disgusted: '🤢',
  neutral: '😐',
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
  facial_emotion?: { dominant_emotion?: string; dominant_emotion_cn?: string }
  fusion?: { final_emotion?: string; final_emotion_cn?: string; overall_confidence?: number }
}

// ================================================================
//  状态
// ================================================================
const messages = ref<ChatItem[]>([
  {
    role: 'assistant',
    content:
      '你好，我是你的 AI 心理教练 🤗 可以打开摄像头和麦克风，让我感知你的状态；也可以直接打字聊聊。',
  },
])
const chatInput = ref('')
const sending = ref(false)
const chatError = ref('')
const chatScrollRef = ref<HTMLElement | null>(null)

// 摄像头 / 录音
const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isCameraOn = ref(false)
const cameraError = ref('')
const isRecording = ref(false)
const isAnalyzing = ref(false)
const analyzingHint = ref('')

// 识别结果
const liveEmotion = ref<LiveEmotion | null>(null)
const analysisResult = ref<AnalysisResult | null>(null)

let mediaStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let socket: Socket | null = null
let frameTimer: number | null = null
let recordStartTs = 0
let recordEndTs = 0
let audioChunks: Blob[] = []
let isPageVisible = true

// ================================================================
//  识别上下文（发送给 AI）
// ================================================================
const liveDominantEmotion = computed<string | null>(() => {
  const emo = liveEmotion.value?.emotions
  if (!emo) return null
  const top = Object.entries(emo).sort((a, b) => b[1] - a[1])[0]
  if (!top) return null
  return DEEPFACE_TO_UNIFIED[top[0]] ?? null
})

const analysisContext = computed<Record<string, any> | null>(() => {
  const a = analysisResult.value
  const ctx: Record<string, any> = {}
  if (a?.transcription?.text) ctx.transcription = a.transcription.text
  if (a?.text_emotion?.emotion) {
    ctx.text_emotion = a.text_emotion.emotion_cn || a.text_emotion.emotion
    if (typeof a.text_emotion.confidence === 'number') ctx.text_emotion_confidence = a.text_emotion.confidence
  }
  if (a?.voice_emotion?.emotion) {
    ctx.voice_emotion = a.voice_emotion.emotion_cn || a.voice_emotion.emotion
    if (typeof a.voice_emotion.confidence === 'number') ctx.voice_emotion_confidence = a.voice_emotion.confidence
  }
  const facial = a?.facial_emotion?.dominant_emotion_cn
    || a?.facial_emotion?.dominant_emotion
    || liveDominantEmotion.value
  if (facial) ctx.facial_emotion = facial
  if (a?.fusion?.final_emotion) {
    ctx.fusion_emotion = a.fusion.final_emotion_cn || a.fusion.final_emotion
    if (typeof a.fusion.overall_confidence === 'number') ctx.fusion_confidence = a.fusion.overall_confidence
  }
  if (liveEmotion.value && typeof liveEmotion.value.score === 'number') {
    ctx.live_score = liveEmotion.value.score
    ctx.live_level = liveEmotion.value.level
  }
  return Object.keys(ctx).length > 0 ? ctx : null
})

const contextSummary = computed(() => {
  const ctx = analysisContext.value
  if (!ctx) return ''
  const parts: string[] = []
  const facial = ctx.facial_emotion || ctx.fusion_emotion
  if (facial) parts.push(`表情 ${facial}`)
  if (ctx.voice_emotion) parts.push(`语调 ${ctx.voice_emotion}`)
  if (ctx.text_emotion && ctx.text_emotion !== facial) parts.push(`文本 ${ctx.text_emotion}`)
  if (ctx.transcription) {
    const t = String(ctx.transcription)
    parts.push(`转写「${t.length > 16 ? t.slice(0, 16) + '…' : t}」`)
  }
  if (ctx.live_score !== undefined) parts.push(`投入 ${ctx.live_score} 分`)
  return parts.join(' · ')
})

// ================================================================
//  SocketIO：实时表情识别
// ================================================================
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
//  摄像头
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
    cameraError.value = `无法开启摄像头：${err?.message || '请检查权限'}`
  }
}

function stopCamera() {
  if (frameTimer !== null) {
    clearInterval(frameTimer)
    frameTimer = null
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  mediaRecorder = null
  mediaStream?.getTracks().forEach((t) => t.stop())
  mediaStream = null
  if (videoRef.value) videoRef.value.srcObject = null
  isCameraOn.value = false
  isRecording.value = false
  liveEmotion.value = null
  disconnectSocket()
}

// ================================================================
//  录音 → 多模态分析
// ================================================================
function startRecording() {
  if (!mediaStream) {
    cameraError.value = '请先开启摄像头'
    return
  }
  const audioTracks = mediaStream.getAudioTracks()
  if (audioTracks.length === 0) {
    cameraError.value = '没有可用的麦克风'
    return
  }
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
    cameraError.value = '浏览器不支持录音'
    return
  }
  audioChunks = []
  recordStartTs = Date.now()
  analysisResult.value = null
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data)
  }
  recorder.onstop = () => {
    recordEndTs = Date.now()
    isRecording.value = false
    void uploadAndAnalyze()
  }
  recorder.start(800)
  mediaRecorder = recorder
  isRecording.value = true
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
}

async function uploadAndAnalyze() {
  if (audioChunks.length === 0) return
  const firstMime = audioChunks[0]?.type || 'audio/webm;codecs=opus'
  const blob = new Blob(audioChunks, { type: firstMime })
  const ext = firstMime.includes('webm') ? 'webm' : firstMime.includes('wav') ? 'wav' : 'webm'
  const form = new FormData()
  form.append('file', blob, `audio_${Date.now()}.${ext}`)
  form.append('sid', socket?.id || '')
  form.append('record_start_ts', String(recordStartTs))
  form.append('record_end_ts', String(recordEndTs))

  isAnalyzing.value = true
  analyzingHint.value = '正在分析你的语音和表情…'
  try {
    const resp = await fetch(`${API_BASE_URL}/api/analyze_audio`, { method: 'POST', body: form })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data?.detail || `分析失败（${resp.status}）`)
    analysisResult.value = data
    analyzingHint.value = ''
  } catch (err: any) {
    cameraError.value = `分析失败：${err?.message || '请重试'}`
  } finally {
    isAnalyzing.value = false
  }
}

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

async function send(contentOverride?: string) {
  const text = (contentOverride ?? chatInput.value).trim()
  if (!text || sending.value) return
  chatInput.value = ''
  chatError.value = ''
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
    pushMessage({ role: 'assistant', content: data.reply || '（AI 没有返回内容，请重试）' })
  } catch (err: any) {
    chatError.value = `AI 暂时无法回复：${err?.message || '网络错误'}`
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

function sendWithContext() {
  const ctx = analysisContext.value
  if (!ctx) return
  const t = ctx.transcription ? `（我刚说：${ctx.transcription}）` : ''
  void send(`基于我现在的状态（${contextSummary.value}）${t}，陪我聊聊吧`)
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
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibility)
  stopCamera()
})
</script>

<template>
  <div class="ai-chat-page">
    <!-- ===== 摄像头面板 ===== -->
    <div class="camera-card" :class="{ active: isCameraOn }">
      <div class="camera-video-wrap">
        <video ref="videoRef" class="camera-video" autoplay playsinline muted></video>
        <canvas ref="canvasRef" class="camera-canvas"></canvas>

        <div v-if="!isCameraOn && !cameraError" class="camera-placeholder">
          <span class="cam-icon">📷</span>
          <span>开启摄像头，让我看到你的状态</span>
        </div>

        <div v-if="liveEmotion" class="camera-emotion">
          <span class="emotion-emoji">{{ EMOTION_EMOJI[liveDominantEmotion || 'neutral'] || '😐' }}</span>
          <span class="emotion-label">
            {{ EMOTION_CN[liveDominantEmotion || 'neutral'] || '识别中' }}
            · {{ LEVEL_CN[liveEmotion.level] || liveEmotion.level }} {{ liveEmotion.score }} 分
          </span>
        </div>

        <div v-if="isRecording" class="recording-badge">● 录音中</div>
        <div v-if="isAnalyzing" class="analyzing-badge">{{ analyzingHint }}</div>
      </div>

      <div class="camera-controls">
        <button v-if="!isCameraOn" class="cam-btn primary" @click="startCamera">
          {{ cameraError ? '重试开启' : '开启摄像头' }}
        </button>
        <template v-else>
          <button class="cam-btn" :class="{ recording: isRecording }" :disabled="isAnalyzing" @click="isRecording ? stopRecording() : startRecording()">
            {{ isRecording ? '停止并分析' : '开始录音' }}
          </button>
          <button class="cam-btn ghost" @click="stopCamera">关闭</button>
        </template>
      </div>

      <p v-if="cameraError" class="camera-error">{{ cameraError }}</p>
      <p v-if="contextSummary" class="context-chips" :title="contextSummary">🧠 {{ contextSummary }}</p>
    </div>

    <!-- ===== 对话区（豆包式排版） ===== -->
    <div class="chat-wrap">
      <div ref="chatScrollRef" class="chat-scroll">
        <div
          v-for="(m, i) in messages"
          :key="i"
          class="msg-row"
          :class="m.role === 'user' ? 'user' : 'assistant'"
        >
          <div v-if="m.role === 'assistant'" class="avatar">🤖</div>
          <div class="bubble">{{ m.content }}</div>
        </div>

        <div v-if="sending" class="msg-row assistant">
          <div class="avatar">🤖</div>
          <div class="bubble typing">
            <span></span><span></span><span></span>
          </div>
        </div>
        <p v-if="chatError" class="chat-error">{{ chatError }}</p>
      </div>

      <div class="chat-input-bar">
        <div class="chat-quick">
          <button class="quick-btn" :disabled="!analysisContext || sending" @click="sendWithContext">
            ✨ 基于识别结果引导我
          </button>
          <span v-if="!analysisContext" class="quick-hint">打开摄像头或录音后，识别结果会自动带上</span>
        </div>
        <div class="input-row">
          <textarea
            v-model="chatInput"
            class="chat-textarea"
            rows="1"
            placeholder="说点什么，或按 Enter 发送…"
            :disabled="sending"
            @keydown="onInputKeydown"
          ></textarea>
          <button class="send-btn" :disabled="sending || !chatInput.trim()" @click="send()">
            {{ sending ? '思考中' : '发送' }}
          </button>
        </div>
        <p class="disclaimer">
          AI 教练为成长辅助工具，不提供诊断或治疗；如有自伤/危机信号，请立即拨打心理援助热线
          <b>12356</b> 或尽快寻求线下专业帮助。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-chat-page {
  min-height: calc(100vh - 64px);
  background: #f7f8fa;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 16px 0;
  box-sizing: border-box;
}

/* ===== 摄像头卡片 ===== */
.camera-card {
  width: min(760px, 100%);
  background: #fff;
  border: 1px solid #eceef2;
  border-radius: 14px;
  padding: 10px 12px;
  box-sizing: border-box;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}
.camera-card.active {
  border-color: #c7b8f5;
}
.camera-video-wrap {
  position: relative;
  width: 150px;
  height: 100px;
  border-radius: 10px;
  overflow: hidden;
  background: #0f1220;
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
  gap: 6px;
  color: #8b93a5;
  font-size: 12px;
  text-align: center;
  padding: 8px;
  background: linear-gradient(160deg, #151a2e, #1c2340);
  box-sizing: border-box;
}
.cam-icon {
  font-size: 26px;
}
.camera-emotion {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 8px;
  padding: 4px 8px;
  color: #fff;
  font-size: 12px;
  backdrop-filter: blur(4px);
}
.emotion-emoji {
  font-size: 16px;
}
.emotion-label {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recording-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 8px;
  animation: pulse 1.2s infinite;
}
.analyzing-badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 18, 32, 0.75);
  color: #fff;
  font-size: 12px;
  padding: 8px;
  text-align: center;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
.camera-controls {
  display: flex;
  gap: 8px;
  flex: 1;
  min-width: 200px;
}
.cam-btn {
  padding: 9px 16px;
  border-radius: 10px;
  border: 1px solid #e3e5ea;
  background: #fff;
  color: #4b5563;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.cam-btn.primary {
  background: #6d5ae0;
  border-color: #6d5ae0;
  color: #fff;
}
.cam-btn.recording {
  background: #f56c6c;
  border-color: #f56c6c;
  color: #fff;
}
.cam-btn.ghost {
  color: #9aa1ae;
}
.cam-btn:hover:not(:disabled) {
  filter: brightness(0.96);
}
.cam-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.camera-error {
  width: 100%;
  margin: 0;
  color: #f56c6c;
  font-size: 12px;
}
.context-chips {
  width: 100%;
  margin: 0;
  font-size: 12px;
  color: #6d5ae0;
  background: #f5f2ff;
  border-radius: 8px;
  padding: 5px 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  max-width: 88%;
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
  background: linear-gradient(135deg, #8b7cf0, #6d5ae0);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(109, 90, 224, 0.25);
}
.bubble {
  padding: 11px 15px;
  border-radius: 14px;
  font-size: 14.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-row.assistant .bubble {
  background: #fff;
  border: 1px solid #eceef2;
  color: #272b35;
  border-top-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}
.msg-row.user .bubble {
  background: linear-gradient(135deg, #7c6cf0, #5f4ad0);
  color: #fff;
  border-top-right-radius: 4px;
}
.typing {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 14px 16px;
}
.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b8b0e8;
  animation: blink 1.2s infinite ease-in-out;
}
.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-3px); }
}
.chat-error {
  align-self: center;
  margin: 0;
  color: #f56c6c;
  font-size: 13px;
  background: #fef0f0;
  padding: 8px 14px;
  border-radius: 10px;
}

/* ===== 输入区 ===== */
.chat-input-bar {
  background: #fff;
  border: 1px solid #eceef2;
  border-radius: 16px;
  padding: 10px 12px 8px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.05);
  margin-bottom: 14px;
}
.chat-quick {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.quick-btn {
  border: none;
  background: #f5f2ff;
  color: #6d5ae0;
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 20px;
  cursor: pointer;
}
.quick-btn:hover:not(:disabled) {
  background: #ece5ff;
}
.quick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.quick-hint {
  font-size: 12px;
  color: #a5acb8;
}
.input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.chat-textarea {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  font-size: 15px;
  line-height: 1.6;
  font-family: inherit;
  padding: 8px 4px;
  max-height: 120px;
  background: transparent;
  color: #272b35;
}
.chat-textarea::placeholder {
  color: #b3bac6;
}
.send-btn {
  border: none;
  background: #6d5ae0;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  padding: 9px 22px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.send-btn:hover:not(:disabled) {
  background: #5f4ad0;
}
.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.disclaimer {
  margin: 8px 0 0;
  font-size: 11px;
  color: #a5acb8;
  line-height: 1.6;
}

@media (max-width: 640px) {
  .ai-chat-page {
    min-height: calc(100vh - 56px);
    padding: 10px 10px 0;
  }
  .camera-card {
    padding: 8px;
  }
  .camera-video-wrap {
    width: 120px;
    height: 84px;
  }
}
</style>
