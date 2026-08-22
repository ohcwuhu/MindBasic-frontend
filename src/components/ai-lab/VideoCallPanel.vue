<script setup lang="ts">
import { ref, onUnmounted, onMounted, nextTick, computed } from 'vue'
import { io, Socket } from 'socket.io-client'
import {
  PhVideoCamera,
  PhPhoneDisconnect,
  PhChatCircleDots,
  PhTrashSimple,
  PhCheck,
  PhStop,
  PhEye,
  PhWarningCircle,
  PhPause,
  PhPlay,
} from '@phosphor-icons/vue'
import CompanionSprite from './CompanionSprite.vue'
import { useCompanion } from '@/composables/useCompanion'

// 用户情绪是否处于"需要被安抚"的状态（airi 式情绪共感：角色据此切换为共情形态）
const DISTRESS_KEYS = [
  'sad', 'angry', 'anxious', 'fearful', 'depressed', 'stressed', 'upset',
  'sadness', 'anger', 'anxiety', 'fear', '悲伤', '愤怒', '焦虑', '恐惧', '低落',
]
const isDistressed = computed(() => {
  const e = emotionResult.value
  if (!e) return false
  const vals = [
    e.fusion?.final_emotion,
    e.fusion?.final_emotion_cn,
    e.asr_emo,
    e.voice_emotion?.emotion,
    e.voice_emotion?.emotion_cn,
    e.text_emotion?.emotion,
    e.facial_emotion?.dominant_emotion,
  ].map((v) => String(v ?? '').toLowerCase())
  return vals.some((v) => DISTRESS_KEYS.some((d) => v.includes(d)))
})

// 角色形态由 CompanionSprite 按 callState + isDistressed 实时驱动（视频状态 + empathy 心形叠加）

// 陪伴角色性别偏好（与全站共享、持久化）
const { gender } = useCompanion()

// ================================================================
//  常量 & 映射表
// ================================================================
const API_BASE_URL = ''

type CallState = 'idle' | 'listening' | 'thinking' | 'speaking'

const STATE_TEXT: Record<string, string> = {
  idle: '未开始',
  listening: '聆听中…',
  thinking: '思考中…',
  speaking: '回复中…'
}

// ================================================================
//  核心状态
// ================================================================
const socket = ref<Socket | null>(null)
const socketStatus = ref<'disconnected' | 'connecting' | 'connected'>('disconnected')
const callState = ref<CallState>('idle')
const isDeviceActive = ref(false)
const isLoading = ref(false)
const errorMsg = ref('')

// 视频 DOM
const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 录音相关
let mediaStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let audioContext: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null
let volumeAnimationId: number | null = null
const volumeLevel = ref(0)
const volumeCanvasRef = ref<HTMLCanvasElement | null>(null)

// VAD 状态（更灵敏，容忍说话中的小停顿）
const SILENCE_THRESHOLD = 4        // 音量 ≥4% 判定为"有声音"
const SILENCE_DURATION = 1200      // 静音 1.2s 判定说完话（更短，更快响应）
const SPEECH_MIN_SIZE = 6000       // 录音最小字节数，小于则判定为杂音丢弃

// ── 累积式语音时长检测（容忍小停顿） ─────────────────────────
//   问题：老方案要求"连续无间断"说话 ≥1.2s，用户的小停顿（换气、语气词间隔）
//         都会清零计时器，导致首句经常"不算开始说话" → 静音结束永远不触发 → 必须手动发送
//   新方案：累积语音时长（滑动窗口）+ 小停顿容忍（≤300ms 的停顿不算真正静音）
const VOICE_ACCUM_TARGET_MS = 800  // 累积有声音 ≥800ms 就算"开始说话"（不要求连续）
const GAP_TOLERANCE_MS = 300       // ≤300ms 的停顿视为"小间隙"，不重置累积、不中断正在说话

let silenceTimer: number | null = null
let wasSilent = true
let hasVoiceStarted = false         // 是否曾经检测到足够时长的声音，避免一上来就触发结束

let voiceAccumulatedMs = 0          // 累积有声音时长（毫秒）
let lastVoiceFrameAt = 0            // 上一次检测到"有声音"的时间戳（用于小停顿容忍判断）
let gapStartAt = 0                  // 当前"处于小间隙"的起始时间（0 = 不在小间隙中）

// 打断（Barge-in）保护：防止 TTS 回音/环境噪音误触发
// 核心策略：把 Barge-in 阈值设得比 VAD 高得多 + 必须连续多帧 + 播放中不触发
const INTERRUPT_VOLUME_THRESHOLD = 28   // 打断音量阈值 ≥28%（远高于VAD的4%，回音通常<20%）
const INTERRUPT_MIN_FRAMES = 30         // 连续 ≥30 帧（约 500ms）都超阈值才真打断
let interruptConsecutiveFrames = 0      // 当前连续超阈值帧数计数器
let ttsLastStartedAt = 0                // TTS 最近一次启动的时间戳
const TTS_START_GRACE_MS = 1500         // TTS 启动后 1.5s 内禁止打断
// 打断后保护期：被打断后 2s 内不再触发（防止回音再次误触发）
let lastInterruptAt = 0
const INTERRUPT_COOLDOWN_MS = 2000

// 视频帧定时器
let frameTimer: number | null = null
const FRAME_INTERVAL = 800

// VAD 帧间隔计时器（requestAnimationFrame 每帧 ≈16ms，累计用于语音时长）
let _lastVadFrameAt = 0

// 结束通话标志：为 true 时 onstop 中不重启录音
let isEndingCall = false

// 暂停 / 继续通话
const isPaused = ref(false)

// TTS 音频播放（按句子级完整收集后再入播放队列，避免一句话被切成半段）
let currentAudio: HTMLAudioElement | null = null
let currentSentenceChunks: ArrayBuffer[] = []  // 正在接收的"当前句"的所有分片（vc_tts_start → vc_tts_done 之间累积）
const sentencePlayQueue: Blob[] = []           // 句子级播放队列：每项是一句完整的 MP3 Blob
const isPlayingTTS = ref(false)
let ttsMimeType = 'audio/mp3'

// MediaRecorder 本地音频累积（持续录音不停止，只做逻辑切片）
let mediaRecorderMimeType = 'audio/webm'
let speechBlobChunks: Blob[] = []  // 当前说话轮次累积的 Blob 分片

// 对话显示
interface ChatItem {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}
const messages = ref<ChatItem[]>([])
const partialAssistantText = ref('')
const partialUserText = ref('')
const vlmDescription = ref('')

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('mb_access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// 多模态情感分析结果
interface EmotionResult {
  voice_emotion: any | null
  text_emotion: any | null
  facial_emotion: any | null
  fusion: any | null
  asr_emo: string
  elapsed_seconds: number
}
const emotionResult = ref<EmotionResult | null>(null)
const chatBodyRef = ref<HTMLElement | null>(null)
const conversationId = ref<number | null>(null)
const emit = defineEmits<{ (e: 'conversation-ended', conversationId: number): void }>()

// 统计
const stats = ref({
  totalTurns: 0,
  asrLatency: 0,
  llmLatency: 0,
})

// ================================================================
//  Socket.io 连接
// ================================================================
const connectSocket = () => {
  if (socket.value && socket.value.connected) return
  socketStatus.value = 'connecting'
  socket.value = io(API_BASE_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    auth: { token: localStorage.getItem('mb_access_token') ?? undefined },
  })

  socket.value.on('connect', () => {
    socketStatus.value = 'connected'
    console.log('[VC] Socket connected, sid=' + socket.value?.id)
  })

  socket.value.on('disconnect', () => {
    socketStatus.value = 'disconnected'
  })

  socket.value.on('connect_error', (err: Error) => {
    socketStatus.value = 'disconnected'
    errorMsg.value = `后端连接失败：${err.message}`
  })

  // ── 接收后端事件 ──

  // 状态变更
  socket.value.on('vc_state_change', (data: { state: string }) => {
    callState.value = data.state as CallState
    if (data.state === 'listening') {
      // 【关键修正】此时才是管线真正结束：ASR→情感→LLM 全部完成
      //   之前的 vc_interrupted 只是停止TTS播放，不是结束！
      // 收尾 partial text：如果还有残留（vc_llm_done 没收到的异常情况），就兜底收掉
      if (partialAssistantText.value.trim()) {
        messages.value.push({
          role: 'assistant',
          content: partialAssistantText.value,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        })
        partialAssistantText.value = ''
        scrollToBottom()
      }
      isProcessing = false
      // AI 回复完成，统一重启录音（解决"只能说一句话"）
      if (isDeviceActive.value && mediaStream && !isPaused.value) {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') {
          startAudioStreaming()
        }
      }
    }
  })

  socket.value.on('vc_conversation_ready', (data: { conversationId?: number }) => {
    if (data?.conversationId) conversationId.value = data.conversationId
  })

  // ── 新事件：vc_interrupted = 仅停止 TTS，LLM 还在生成文字 ──
  //   此时：
  //   1) 立刻停止 TTS 播放（用户想说话）
  //   2) 不清空 partial text（LLM 继续发 token）
  //   3) 不设置 callState=listening（仍保持 speaking/thinking）
  //   4) 可以重启录音，让用户立即说话，但结果会排队等当前管线结束
  socket.value.on('vc_interrupted', () => {
    console.log('[VC] 收到 vc_interrupted：停止TTS，等待LLM文字收尾')
    // 停止 TTS 播放（立即静音，用户要说话）
    stopTTSPlayback()
    // 这里**不**设置 isProcessing=false，**不**重启录音
    // 因为管线还在跑，等 finally 里的 vc_state_change=listening 再统一处理
    // 避免"管线还在发 token，前端已经开始新一轮录音上传"的竞态
  })

  // ASR 结果
  socket.value.on('vc_asr_result', (data: { text: string; emo: string }) => {
    if (data.text.trim()) {
      partialUserText.value = ''
      messages.value.push({
        role: 'user',
        content: data.text,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      })
      stats.value.totalTurns++
      scrollToBottom()
    }
  })

  // LLM 流式 token
  socket.value.on('vc_llm_token', (data: { token: string }) => {
    partialAssistantText.value += data.token
    scrollToBottom()
  })

  // LLM 完成
  socket.value.on('vc_llm_done', (data: { full_response: string }) => {
    if (partialAssistantText.value.trim()) {
      messages.value.push({
        role: 'assistant',
        content: partialAssistantText.value,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      })
      partialAssistantText.value = ''
      scrollToBottom()
    }
  })

  // TTS 开始（一句）：重置"当前句分片缓冲"
  socket.value.on('vc_tts_start', (_data: { text: string }) => {
    currentSentenceChunks = []
    // 记录 TTS 启动时间，用于启动后 700ms 内的"回音保护期"（防止打断误触发）
    ttsLastStartedAt = Date.now()
    console.log('[VC] vc_tts_start: 开始接收新一句分片:', _data.text.slice(0, 30))
  })

  // TTS 音频分片：累积到"当前句缓冲"
  socket.value.on('vc_tts_chunk', (data: { data: string; format: string }) => {
    if (data.format === 'mp3') ttsMimeType = 'audio/mp3'
    const raw = atob(data.data)
    const buf = new ArrayBuffer(raw.length)
    const arr = new Uint8Array(buf)
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
    currentSentenceChunks.push(buf)
  })

  // TTS 完成（一句）：把"当前句所有分片"合并为完整 Blob，推入句子播放队列
  socket.value.on('vc_tts_done', (_data: { text: string }) => {
    if (currentSentenceChunks.length === 0) return
    // 合并当前句的所有分片 → 得到一句完整的 MP3 Blob
    const sentenceBlob = new Blob(currentSentenceChunks, { type: ttsMimeType })
    currentSentenceChunks = []
    sentencePlayQueue.push(sentenceBlob)
    console.log('[VC] vc_tts_done: 句子完整入队 → 队列长度=' + sentencePlayQueue.length +
                ' Blob大小=' + Math.round(sentenceBlob.size / 1024) + 'KB')
    // 如果当前没在播放，立刻启动播放（否则 onended 时会自动取下一句）
    if (!isPlayingTTS.value) {
      playNextSentence()
    }
  })

  // VLM 结果
  socket.value.on('vc_vlm_result', (data: { description: string; error: string | null }) => {
    if (data.description) {
      vlmDescription.value = data.description
    }
  })

  // 多模态情感分析结果
  socket.value.on('vc_emotion_analysis', (data: any) => {
    console.log('[VC] 多模态情感分析结果:', data)
    emotionResult.value = data
  })

  // 错误
  socket.value.on('vc_error', (data: { stage: string; message: string }) => {
    console.error('[VC] Error:', data)
    errorMsg.value = `[${data.stage}] ${data.message}`
    // 出错时也要重置状态，恢复录音
    isProcessing = false
    callState.value = 'listening'
    if (isDeviceActive.value && mediaStream && !isPaused.value) {
      if (!mediaRecorder || mediaRecorder.state !== 'recording') {
        startAudioStreaming()
      }
    }
  })

  // 同时监听情绪识别结果（复用 upload_frame 事件链路）
  socket.value.on('emotion_result', (data: any) => {
    // 同步情绪上下文到视频通话会话
    if (socket.value?.connected) {
      socket.value.emit('vc_update_emotion', {
        fusion_emotion: data.level,
        live_score: data.score,
        live_level: data.level,
      })
    }
  })
}

const disconnectSocket = () => {
  if (socket.value) {
    socket.value.removeAllListeners()
    socket.value.close()
    socket.value = null
  }
  socketStatus.value = 'disconnected'
}

// ================================================================
//  TTS 音频播放（句子级队列 → 顺序播放：一句完整播完才播下一句）
// ================================================================
const playNextSentence = () => {
  if (sentencePlayQueue.length === 0) {
    isPlayingTTS.value = false
    return
  }
  isPlayingTTS.value = true
  // 从队首取出一句完整的 Blob
  const blob = sentencePlayQueue.shift()!
  const url = URL.createObjectURL(blob)
  currentAudio = new Audio(url)
  const blobSizeKB = Math.round(blob.size / 1024)

  currentAudio.onloadedmetadata = () => {
    console.log('[VC] TTS 播放开始: 大小=' + blobSizeKB + 'KB, 时长=' +
                (currentAudio ? currentAudio.duration.toFixed(1) : '?') + 's, 队列剩余=' + sentencePlayQueue.length)
  }

  currentAudio.onended = () => {
    URL.revokeObjectURL(url)
    currentAudio = null
    // 自动播下一句
    playNextSentence()
  }

  currentAudio.onerror = (e) => {
    console.error('[VC] TTS 播放错误:', e, 'size=' + blobSizeKB + 'KB')
    URL.revokeObjectURL(url)
    currentAudio = null
    // 出错也尝试播下一句，不要卡住
    playNextSentence()
  }

  const playPromise = currentAudio.play()
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch((err) => {
      console.error('[VC] TTS play() 调用失败:', err)
      URL.revokeObjectURL(url)
      currentAudio = null
      playNextSentence()
    })
  }
}

const stopTTSPlayback = () => {
  // 清空：正在接收的句子分片 + 句子播放队列 + 当前播放中的 Audio
  currentSentenceChunks = []
  // 清空数组（不改变引用，保持响应式）
  while (sentencePlayQueue.length > 0) sentencePlayQueue.pop()
  if (currentAudio) {
    try { currentAudio.pause() } catch (_) { /* ignore */ }
    currentAudio = null
  }
  isPlayingTTS.value = false
  console.log('[VC] TTS 播放已停止（已清空所有缓冲）')
}

// ================================================================
//  设备管理（摄像头 + 麦克风）
// ================================================================
const startDevices = async () => {
  errorMsg.value = ''
  isLoading.value = true

  if (!navigator.mediaDevices?.getUserMedia) {
    errorMsg.value = '浏览器不支持媒体设备API，请使用最新版Chrome/Edge/Firefox'
    isLoading.value = false
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    mediaStream = stream

    if (videoRef.value) {
      videoRef.value.srcObject = stream
      videoRef.value.addEventListener('canplay', onVideoReady, { once: true })
    }
  } catch (err: any) {
    isLoading.value = false
    handleDeviceError(err)
  }
}

const onVideoReady = () => {
  isLoading.value = false
  isDeviceActive.value = true
  // 通知后端开始视频通话
  socket.value?.emit('vc_start')
  // 启动音量计/VAD（持续运行，不随录音轮次重启）
  startVolumeMeter()
  // 启动音频录制
  startAudioStreaming()
  // 启动视频帧上传
  startFrameUpload()
}

const stopDevices = () => {
  // 【关键】先设结束标志，防止 onstop 中自动重启录音
  isEndingCall = true
  // 如果 TTS 还在播放，先发送打断信号
  if (isPlayingTTS.value) {
    socket.value?.emit('vc_interrupt')
  }
  stopFrameUpload()
  stopAudioStreaming()
  stopTTSPlayback()

  socket.value?.emit('vc_stop')

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop())
    mediaStream = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
  isDeviceActive.value = false
  callState.value = 'idle'
  isPaused.value = false
  // 通话结束：把会话 ID 交给父级，由其询问是否记录到情绪日记
  if (conversationId.value && messages.value.length > 0) {
    const cid = conversationId.value
    emit('conversation-ended', cid)
  }
  conversationId.value = null
  // 清理对话和情感数据
  messages.value = []
  partialAssistantText.value = ''
  partialUserText.value = ''
  emotionResult.value = null
  stats.value = { totalTurns: 0, asrLatency: 0, llmLatency: 0 }
  errorMsg.value = ''
  // 重置结束标志
  isEndingCall = false
  console.log('[VC] 通话已完全结束')
}

const handleDeviceError = (err: any) => {
  switch (err?.name) {
    case 'NotAllowedError':
      errorMsg.value = '请允许摄像头/麦克风权限'
      break
    case 'NotFoundError':
      errorMsg.value = '找不到摄像头或麦克风设备'
      break
    case 'NotReadableError':
      errorMsg.value = '摄像头/麦克风被其他程序占用'
      break
    default:
      errorMsg.value = `设备启动失败：${err?.message || '未知错误'}`
  }
}

// ================================================================
//  音频录制（每轮说话独立录制 → stop 后自动 restart）
//  - 每轮 startAudioStreaming 都创建全新的 MediaRecorder
//  - 第一个 ondatasavailable 分片必定包含 WebM 头，保证文件完整
//  - 说话结束时 stop → onstop 事件中处理上传 → 然后自动 restart
// ================================================================
let isProcessing = false  // true = 正在上传/等待 AI 回复，VAD 暂停

const startAudioStreaming = () => {
  if (!mediaStream) return

  // 正常开始新录音 → 确保结束标志已清除
  isEndingCall = false

  // 先清理旧的 recorder
  if (mediaRecorder) {
    if (mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop() } catch {}
    }
    mediaRecorder = null
  }

  const audioTracks = mediaStream.getAudioTracks()
  if (audioTracks.length === 0) {
    errorMsg.value = '音频流中没有音频轨道'
    return
  }

  const audioOnlyStream = new MediaStream(audioTracks)

  const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', '']
  let recorder: MediaRecorder | null = null
  for (const type of mimeTypes) {
    try {
      const opts: MediaRecorderOptions = { audioBitsPerSecond: 128000 }
      if (type) opts.mimeType = type
      recorder = new MediaRecorder(audioOnlyStream, opts)
      mediaRecorderMimeType = type || 'audio/webm'
      console.log('[VC] MediaRecorder 使用 mimeType:', mediaRecorderMimeType)
      break
    } catch { continue }
  }
  if (!recorder) {
    errorMsg.value = '浏览器不支持 MediaRecorder'
    return
  }

  speechBlobChunks = []

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      speechBlobChunks.push(event.data)
    }
  }

  recorder.onstop = async () => {
    // Recorder 停止后，speechBlobChunks 中是完整的 WebM 文件（有头有尾）
    const chunks = [...speechBlobChunks]
    speechBlobChunks = []

    // 【关键】如果正在结束通话，直接跳过所有后续处理
    if (isEndingCall) {
      console.log('[VC] onstop: 正在结束通话，跳过录音处理')
      return
    }
    // 已暂停：丢弃音频分片，不处理不上传
    if (isPaused.value) {
      console.log('[VC] onstop: 已暂停，丢弃音频分片')
      speechBlobChunks = []
      return
    }

    if (chunks.length === 0) {
      console.warn('[VC] onstop: 没有分片，立即重启录音')
      // 没分片说明是被直接打断/杂音 → 立即重启
      isProcessing = false
      if (isDeviceActive.value && mediaStream && !isPaused.value) {
        startAudioStreaming()
      }
      return
    }

    const fullBlob = new Blob(chunks, { type: mediaRecorderMimeType })
    console.log('[VC] onstop: 合成完整音频, 分片数=' + chunks.length + ', 大小=' + fullBlob.size + '字节')

    if (fullBlob.size < SPEECH_MIN_SIZE) {
      console.warn('[VC] onstop: 录音过小(' + fullBlob.size + 'B)，判定为杂音，重启录音')
      isProcessing = false
      if (isDeviceActive.value && mediaStream && !isPaused.value) {
        startAudioStreaming()
      }
      return
    }

    // 上传 + 通知后端处理
    // 【关键】上传前再次检查，防止结束通话后还上传
    if (isEndingCall) {
      console.log('[VC] onstop: 上传前检测到已结束通话，跳过')
      return
    }
    try {
      const formData = new FormData()
      formData.append('file', fullBlob, 'audio.webm')
      formData.append('sid', socket.value?.id || '')

      errorMsg.value = ''
      const resp = await fetch('/api/vc_audio_upload', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      })
      const result = await resp.json()

      if (result.ok && result.file_id) {
        console.log('[VC] 上传成功, file_id=' + result.file_id + ', size=' + result.file_size + 'B')
        socket.value?.emit('vc_audio_end', {
          file_id: result.file_id,
          file_size: result.file_size,
        })
        // 上传成功 → 保持 isProcessing=true，AI 回复会发 vc_state_change=listening
        // 到时在该事件中统一重启录音
      } else {
        errorMsg.value = '音频上传失败：' + (result.error || '未知错误')
        // 上传失败 → 立即重置状态 + 重启录音
        isProcessing = false
        callState.value = 'listening'
        if (isDeviceActive.value && mediaStream && !isPaused.value) {
          startAudioStreaming()
        }
      }
    } catch (err: any) {
      console.error('[VC] 音频上传异常:', err)
      errorMsg.value = '音频上传失败：' + (err?.message || '网络错误')
      isProcessing = false
      callState.value = 'listening'
      if (isDeviceActive.value && mediaStream && !isPaused.value) {
        startAudioStreaming()
      }
    }
    // 注意：正常路径（上传成功 + AI 正在处理）不再在这里重启录音，
    // 统一等待后端回传 vc_state_change=listening 再重启
  }

  recorder.start(250)
  mediaRecorder = recorder
  console.log('[VC] 音频录制已启动, state=' + recorder.state)
}

const stopAudioStreaming = () => {
  if (mediaRecorder) {
    if (mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop() } catch {}
    }
    mediaRecorder = null
  }
  speechBlobChunks = []
  isProcessing = false
  stopVolumeMeter()

  // 清理所有计时器 + VAD 累积状态
  if (silenceTimer !== null) { clearTimeout(silenceTimer); silenceTimer = null }
  wasSilent = true
  hasVoiceStarted = false
  voiceAccumulatedMs = 0
  lastVoiceFrameAt = 0
  gapStartAt = 0
  _lastVadFrameAt = 0
}

// ================================================================
//  音量可视化 + VAD 静音检测
//  - 使用 ScriptProcessorNode（AudioWorklet 兼容性不好），实时获取 PCM
//  - 计算 RMS → dBFS → 映射到 0-100% 的音量显示
//  - 该方式比 AnalyserNode.getByteFrequencyData 更准确
// ================================================================
let scriptProcessor: ScriptProcessorNode | null = null

const startVolumeMeter = async () => {
  if (!mediaStream) return
  try {
    if (audioContext) {
      try { await audioContext.close() } catch {}
      audioContext = null
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext
    audioContext = new AC({ sampleRate: 48000 })
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume()
        console.log('[VC] AudioContext resumed, state=' + audioContext.state)
      } catch (e) {
        console.warn('[VC] AudioContext resume failed:', e)
      }
    }
    sourceNode = audioContext.createMediaStreamSource(mediaStream)

    // 使用 ScriptProcessorNode 抓真实 PCM 数据（4096 samples ≈ 85ms @48k）
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1)
    scriptProcessor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      let sumSq = 0
      for (let i = 0; i < input.length; i++) {
        sumSq += input[i] * input[i]
      }
      const rms = Math.sqrt(sumSq / input.length)
      // RMS → dBFS：范围 ~ -60dB 到 0dB，映射 0-100%
      const db = 20 * Math.log10(rms + 1e-8)
      // -60dB → 0%, 0dB → 100%，给一个稍微放大的增益曲线
      let pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
      pct = Math.pow(pct / 100, 0.7) * 100
      volumeLevel.value = Math.round(pct)
    }

    sourceNode.connect(scriptProcessor)
    // 【关键修正】ScriptProcessorNode 必须有输出才能触发 onaudioprocess
    //   但直接连到 destination 会把麦克风声音播放回扬声器（回声/啸叫）
    //   解决：接一个 GainNode gain=0 的"哑节点"，既满足引擎要求又不会发声
    const dummyGain = audioContext.createGain()
    dummyGain.gain.value = 0
    scriptProcessor.connect(dummyGain)
    dummyGain.connect(audioContext.destination)
    console.log('[VC] 音量计已启动（ScriptProcessorNode, rate=' + audioContext.sampleRate + '，哑节点防回声）')

    // 启动 UI 绘制 + VAD 检测定时器（独立循环，每 100ms 一次）
    drawVolume()
  } catch (e) {
    console.error('[VC] 启动音量计失败:', e)
  }
}

const stopVolumeMeter = () => {
  if (volumeAnimationId !== null) {
    cancelAnimationFrame(volumeAnimationId)
    volumeAnimationId = null
  }
  try {
    if (sourceNode && scriptProcessor) sourceNode.disconnect(scriptProcessor)
    // ScriptProcessor 的输出连的是哑 GainNode（防回声），统一断开即可
    if (scriptProcessor) scriptProcessor.disconnect()
  } catch {}
  scriptProcessor = null
  sourceNode = null
  if (audioContext) { audioContext.close().catch(() => {}); audioContext = null }
  volumeLevel.value = 0
  // 重置所有 VAD 累积状态（下一轮从干净状态开始）
  voiceAccumulatedMs = 0
  lastVoiceFrameAt = 0
  gapStartAt = 0
  hasVoiceStarted = false
}

const drawVolume = () => {
  const canvas = volumeCanvasRef.value
  const ctx = canvas ? canvas.getContext('2d') : null

  const render = () => {
    volumeAnimationId = requestAnimationFrame(render)

    // ── VAD 静音检测（每帧跑）──
    const now = Date.now()
    const frameDeltaMs = _lastVadFrameAt ? (now - _lastVadFrameAt) : 16
    _lastVadFrameAt = now

    const isNowSilent = volumeLevel.value < SILENCE_THRESHOLD
    // 如果正在处理（等待 AI 回复），跳过 VAD 检测
    const vadEnabled = !isProcessing && callState.value === 'listening' && !isPaused.value

    if (vadEnabled) {
      if (!isNowSilent) {
        // ── 有声音 ──
        // 1. 累积语音时长
        voiceAccumulatedMs += frameDeltaMs
        lastVoiceFrameAt = now
        gapStartAt = 0  // 有声音 → 不在小间隙中

        // 2. 累积达到目标 → 标记"已开始说话"
        if (!hasVoiceStarted && voiceAccumulatedMs >= VOICE_ACCUM_TARGET_MS) {
          hasVoiceStarted = true
          console.log('[VC] VAD: 累积语音 ' + voiceAccumulatedMs +
                      'ms ≥ 目标 ' + VOICE_ACCUM_TARGET_MS + 'ms → 已开始说话')
        }

        // 3. 有声音 → 肯定还没说完，取消静音计时器
        if (silenceTimer !== null) { clearTimeout(silenceTimer); silenceTimer = null }

      } else {
        // ── 当前帧静音 ──

        if (hasVoiceStarted) {
          // 已经在"说话中" → 用小停顿容忍判断
          const sinceLastVoice = now - lastVoiceFrameAt
          if (sinceLastVoice <= GAP_TOLERANCE_MS) {
            // ≤ 300ms 的停顿视为"换气小间隙"：当作还在说话，不启动静音结束计时器
            if (silenceTimer !== null) { clearTimeout(silenceTimer); silenceTimer = null }
          } else {
            // 超过容忍度的真正静音 → 启动说话结束倒计时
            if (silenceTimer === null) {
              silenceTimer = window.setTimeout(() => {
                if (volumeLevel.value < SILENCE_THRESHOLD && hasVoiceStarted && !isProcessing) {
                  console.log('[VC] VAD: 检测到静音持续 ≥' + SILENCE_DURATION +
                              'ms（已超容忍），触发说话结束')
                  hasVoiceStarted = false
                  voiceAccumulatedMs = 0
                  lastVoiceFrameAt = 0
                  gapStartAt = 0
                  triggerAudioEnd(false)
                }
              }, SILENCE_DURATION)
            }
          }
        }
        // else：还没"开始说话"的静音 → 就是纯背景，不做任何事
        //   voiceAccumulatedMs 保留（"嗯" [100ms静音] "你好" 可累计到 ≥800ms）
      }
    }

    // AI 说话中，用户打断（Barge-in）—— 关键规则：
    //   ✅ 仅在 TTS 正在播放时才允许自动打断
    //   ❌ 其他任何阶段（thinking / listening / recording）绝对不允许自动打断
    //      原因：AI 还在"思考"时（ASR+情感+LLM首token前），任何自动打断都是自杀式取消
    //      导致用户说的话被识别、管线启动，但还没生成回复就被取消
    //   手动"打断"按钮不受此限制（用户明确点击才允许强制停止）
    //
    //   TTS 播放中仍有 5 重保护防回音误触发：
    //   1) 音量 ≥ 40%（回音通常 <20%）
    //   2) 连续 ≥45 帧（约 750ms）都超阈值
    //   3) TTS 启动后 1.5s 内禁止打断（扬声器刚启动回音最大）
    //   4) 打断后 2s 冷却期内禁止再次打断
    const ttsIsActuallyPlaying = isPlayingTTS.value  // 只有音频真在播才允许自动打断
    if (ttsIsActuallyPlaying && !isPaused.value) {
      const volumeNow = volumeLevel.value
      const now = Date.now()
      const inGracePeriod = (now - ttsLastStartedAt) < TTS_START_GRACE_MS
      const inCooldown = (now - lastInterruptAt) < INTERRUPT_COOLDOWN_MS
      // 仅在 TTS 播放中才允许自动打断，阈值使用最严格档
      const bargeVolThreshold = 40
      const bargeFrameThreshold = 45

      if (inGracePeriod) {
        // TTS 刚启动的 1.5s 内，完全禁止打断
        interruptConsecutiveFrames = 0
      } else if (inCooldown) {
        // 打断后 2s 冷却期
        interruptConsecutiveFrames = 0
      } else if (volumeNow >= bargeVolThreshold) {
        interruptConsecutiveFrames++
        if (interruptConsecutiveFrames >= bargeFrameThreshold) {
          console.log('[VC] Barge-in: 用户真·打断（连续' + interruptConsecutiveFrames +
                      '帧音量≥' + bargeVolThreshold + '%，当前=' + volumeNow + '%）')
          triggerBargeIn()
          hasVoiceStarted = false
          interruptConsecutiveFrames = 0
          lastInterruptAt = now
        }
      } else {
        // 音量不够 → 计数器清零
        interruptConsecutiveFrames = 0
      }
    } else {
      // AI 没在播放 TTS 时（思考/录音/空闲） → 完全禁止自动打断
      interruptConsecutiveFrames = 0
    }
    wasSilent = isNowSilent

    // ── 绘制音量条 ──
    if (!canvas) return
    if (!ctx) return
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const barCount = 24, barWidth = 6, gap = 3
    const totalWidth = barCount * (barWidth + gap) - gap
    const startX = (w - totalWidth) / 2, centerY = h / 2
    const activeBars = Math.round((volumeLevel.value / 100) * barCount)
    for (let i = 0; i < barCount; i++) {
      const x = startX + i * (barWidth + gap)
      const isActive = i < activeBars
      const ratio = i / barCount
      const barHeight = isActive ? Math.max(8, ratio * h * 0.9 + 6) : 6
      let color = '#67C23A'
      if (ratio >= 0.6) color = '#F56C6C'
      else if (ratio >= 0.3) color = '#E6A23C'
      ctx.fillStyle = isActive ? color : '#e4e7ed'
      ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight)
    }
  }
  render()
}

const triggerAudioEnd = (fromManual = false) => {
  if (!socket.value?.connected) {
    if (fromManual) errorMsg.value = '后端未连接，请刷新页面'
    return
  }
  // 如果正在结束通话，不再触发
  if (isEndingCall) {
    console.log('[VC] 正在结束通话，忽略 triggerAudioEnd')
    return
  }
  // 已暂停：不触发说话结束
  if (isPaused.value) {
    console.log('[VC] 已暂停，忽略 triggerAudioEnd')
    return
  }
  if (isProcessing) {
    console.log('[VC] 正在处理中，忽略本次触发')
    return
  }

  // 清除计时器 + 重置所有 VAD 累积状态（新一轮干净状态）
  if (silenceTimer !== null) { clearTimeout(silenceTimer); silenceTimer = null }
  hasVoiceStarted = false
  voiceAccumulatedMs = 0
  lastVoiceFrameAt = 0
  gapStartAt = 0

  // 标记正在处理，防止 VAD 在 AI 回复期间重复触发
  isProcessing = true
  callState.value = 'thinking'

  // 停止 MediaRecorder → onstop 中自动上传并 restart
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    try {
      mediaRecorder.stop()
      console.log('[VC] triggerAudioEnd: 停止录制，等待 onstop 处理')
    } catch (e) {
      console.error('[VC] 停止 MediaRecorder 失败:', e)
      isProcessing = false
      callState.value = 'listening'
    }
  } else {
    // Recorder 已经停了，手动触发 onstop 流程
    console.log('[VC] triggerAudioEnd: recorder 已停止，手动处理')
    // onstop 逻辑需要手动调用
    const chunks = [...speechBlobChunks]
    speechBlobChunks = []
    if (chunks.length > 0) {
      const fullBlob = new Blob(chunks, { type: mediaRecorderMimeType })
      if (fullBlob.size >= SPEECH_MIN_SIZE) {
        // 直接上传
        const formData = new FormData()
        formData.append('file', fullBlob, 'audio.webm')
        formData.append('sid', socket.value?.id || '')
        fetch('/api/vc_audio_upload', { method: 'POST', headers: authHeaders(), body: formData })
          .then(r => r.json())
          .then(result => {
            if (result.ok) {
              socket.value?.emit('vc_audio_end', { file_id: result.file_id, file_size: result.file_size })
            }
            isProcessing = false
            callState.value = 'listening'
            if (isDeviceActive.value && mediaStream && !isPaused.value) startAudioStreaming()
          })
          .catch(() => {
            isProcessing = false
            callState.value = 'listening'
            if (isDeviceActive.value && mediaStream && !isPaused.value) startAudioStreaming()
          })
      } else {
        isProcessing = false
        callState.value = 'listening'
        if (isDeviceActive.value && mediaStream && !isPaused.value) startAudioStreaming()
      }
    } else {
      isProcessing = false
      callState.value = 'listening'
    }
  }
}

// Barge-in（自动打断）：用户说话触发的打断
// 【关键修正】只通知后端，不强制修改前端状态
//   vc_interrupt → 后端返回 vc_interrupted → 前端 stopTTSPlayback()
//   真正的状态重置（isProcessing/listening/重启录音）等后端 finally 发 vc_state_change=listening
const triggerBargeIn = () => {
  if (!socket.value?.connected) return
  console.log('[VC] Barge-in: 通知后端打断TTS，等待后端确认')
  socket.value.emit('vc_interrupt')
  // 什么都不做！等后端 vc_interrupted 事件停止 TTS，
  // 等后端 vc_state_change=listening 事件重置状态和重启录音。
  // 这样能 100% 避免"前端说结束了但后端还在发 token"的竞态问题
}

// 手动打断：用户点击"打断"按钮
// 【关键修正】立即停止 TTS 播放（用户明确点击），但不强制改状态
//   真正的状态重置还是等后端 vc_state_change=listening
const triggerManualInterrupt = () => {
  if (!socket.value?.connected) return
  console.log('[VC] 用户手动打断：停止TTS，通知后端')
  socket.value.emit('vc_interrupt')
  // 用户明确点击 → 立即停止播放，不等待后端 vc_interrupted
  stopTTSPlayback()
  // 但状态重置还是等后端 vc_state_change=listening，
  // 避免 LLM 还在发 token 时前端已经开始新一轮录音的竞态
}

// ================================================================
//  暂停 / 继续通话
// ================================================================
const togglePause = () => {
  if (!isDeviceActive.value) return

  if (isPaused.value) {
    // 恢复：如果 AI 处于空闲/聆听状态，重启录音
    if (callState.value === 'listening' || callState.value === 'idle') {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop() } catch {}
      }
      startAudioStreaming()
    }
    isPaused.value = false
    console.log('[VC] 已恢复通话')
  } else {
    // 暂停：停止麦克风、停止AI说话、通知后端、清空缓冲区
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop() } catch {}
    }
    stopTTSPlayback()
    socket.value?.emit('vc_interrupt')
    speechBlobChunks = []
    isPaused.value = true
    console.log('[VC] 已暂停通话')
  }
}

// ================================================================
//  视频帧上传（供 VLM 使用，与面部识别的 upload_frame 独立）
// ================================================================
const startFrameUpload = () => {
  stopFrameUpload()
  frameTimer = window.setInterval(() => {
    if (isDeviceActive.value && videoRef.value && canvasRef.value) {
      captureAndSendFrame()
    }
  }, FRAME_INTERVAL)
}

const stopFrameUpload = () => {
  if (frameTimer !== null) {
    clearInterval(frameTimer)
    frameTimer = null
  }
}

const captureAndSendFrame = () => {
  if (!videoRef.value || !canvasRef.value) return
  const video = videoRef.value
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx || video.videoWidth === 0) return

  // 降分辨率至 480 宽（VLM 需要更高清晰度，比面部识别的 320 大）
  const targetWidth = 480
  const targetHeight = Math.round(video.videoHeight * (targetWidth / video.videoWidth))
  canvas.width = targetWidth
  canvas.height = targetHeight
  ctx.drawImage(video, 0, 0, targetWidth, targetHeight)

  const base64Frame = canvas.toDataURL('image/jpeg', 0.7)

  // 同时发送给面部识别（upload_frame）和 VLM（vc_update_frame）
  if (socket.value?.connected) {
    socket.value.emit('upload_frame', { imgBase64: base64Frame })
    socket.value.emit('vc_update_frame', { imgBase64: base64Frame })
  }
}

// ================================================================
//  工具方法
// ================================================================
const scrollToBottom = () => {
  nextTick(() => {
    if (chatBodyRef.value) {
      chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
    }
  })
}

const CN_MAP: Record<string, string> = {
  happy: '开心', sad: '悲伤', angry: '愤怒', surprised: '惊讶',
  fearful: '恐惧', disgusted: '厌恶', neutral: '中性',
}
const EMOTION_DOT_COLOR: Record<string, string> = {
  happy: '#cf9b4a',
  sad: '#9c83ad',
  angry: '#cf7a5b',
  surprised: '#d9a13b',
  fearful: '#b58a9a',
  disgusted: '#9cae8e',
  neutral: '#b5a392',
}
const getEmotionColor = (emo: string) => EMOTION_DOT_COLOR[emo?.toLowerCase()] || '#b5a392'
const getEmotionCn = (emo: string) => CN_MAP[emo?.toLowerCase()] || emo || '未知'

const manualSend = () => {
  if (!isDeviceActive.value) {
    errorMsg.value = '请先点击「开始自我教练」启动设备'
    return
  }
  triggerAudioEnd(true)
}

const clearHistory = () => {
  messages.value = []
  partialAssistantText.value = ''
  partialUserText.value = ''
  vlmDescription.value = ''
  emotionResult.value = null
  errorMsg.value = ''
  socket.value?.emit('vc_clear_history')
}

const toggleCall = () => {
  if (isDeviceActive.value) {
    stopDevices()
  } else {
    startDevices()
  }
}

// ================================================================
//  生命周期
// ================================================================
onMounted(() => {
  connectSocket()
})

onUnmounted(() => {
  stopDevices()
  disconnectSocket()
})

// 显示用的对话列表（包含流式累积的 assistant 文本）
const displayMessages = computed(() => {
  const list = [...messages.value]
  if (partialAssistantText.value) {
    list.push({
      role: 'assistant',
      content: partialAssistantText.value,
      timestamp: '…'
    })
  }
  return list
})
</script>
<template>
  <div class="vc-shell">
    <!-- ===== 顶栏：连接状态 / 通话状态 / 统计 ===== -->
    <div class="vc-topbar">
      <div class="vc-topbar-left">
        <span class="socket-chip" :class="socketStatus">
          <span class="socket-dot" aria-hidden="true"></span>
          {{
            socketStatus === 'connected' ? '服务已连接'
            : socketStatus === 'connecting' ? '正在连接服务'
            : '服务未连接'
          }}
        </span>
        <span v-if="isDeviceActive" class="state-chip" :class="callState">
          {{ isPaused ? '已暂停' : STATE_TEXT[callState] }}
        </span>
      </div>
      <div v-if="isDeviceActive" class="vc-stats">
        <span>轮次 {{ stats.totalTurns }}</span>
        <span v-if="stats.llmLatency">回复 {{ stats.llmLatency }}ms</span>
      </div>
    </div>

    <!-- ===== 主区：通话舞台 + 对话侧栏 ===== -->
    <div class="vc-main">
      <section class="vc-stage" :class="{ active: isDeviceActive }">
        <!-- 摄像头画面为主画面（大屏显示自己） -->
        <video ref="videoRef" class="stage-video" autoplay playsinline muted></video>
        <canvas ref="canvasRef" class="stage-canvas"></canvas>
        <span v-if="isDeviceActive" class="self-tag">我</span>

        <div v-if="isLoading" class="stage-loading">
          <span class="loader"></span>
          <span>设备启动中…</span>
        </div>

        <!-- 未开始：开场引导 -->
        <div v-if="!isDeviceActive && !isLoading" class="stage-idle">
          <div class="idle-orb">
          <CompanionSprite :gender="gender" state="idle" />
          </div>
          <p class="idle-title">自我教练</p>
          <p class="idle-desc">开启摄像头和麦克风，像打电话一样聊聊你的状态</p>
          <button class="start-call-btn" @click="toggleCall">
            <PhVideoCamera :size="18" weight="bold" />
            开始自我教练
          </button>
        </div>

        <!-- 通话中：AI 教练卡通小人（右下角）随状态切换形态 -->
        <template v-if="isDeviceActive && !isLoading">
          <div class="call-overlay">
            <div class="co-avatar">
              <CompanionSprite :gender="gender" :state="callState" :empathy="isDistressed" />
            </div>
            <div class="co-info">
              <p class="co-status" :class="callState">
                <span class="co-dot" :class="callState"></span>
                {{ STATE_TEXT[callState] }}
              </p>
            </div>
          </div>

          <div v-if="vlmDescription" class="vlm-caption">
            <PhEye :size="14" weight="bold" />
            <span>{{ vlmDescription.slice(0, 70) }}{{ vlmDescription.length > 70 ? '…' : '' }}</span>
          </div>
        </template>

        <p v-if="errorMsg" class="stage-error" role="alert">
          <PhWarningCircle :size="15" weight="bold" />
          {{ errorMsg }}
        </p>
      </section>

      <!-- 对话侧栏 -->
      <aside class="vc-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">
            <PhChatCircleDots :size="16" weight="duotone" />
            对话
          </span>
          <span v-if="partialAssistantText" class="typing-hint">AI 正在回复…</span>
        </div>

        <!-- 情绪分析（紧凑芯片） -->
        <div v-if="emotionResult" class="emotion-strip">
          <div v-if="emotionResult.fusion" class="emo-chip">
            <span class="emo-dot" :style="{ backgroundColor: getEmotionColor(emotionResult.fusion.final_emotion) }"></span>
            <span class="emo-name">融合</span>
            <span class="emo-val">{{ emotionResult.fusion.final_emotion_cn }}</span>
          </div>
          <div v-if="emotionResult.voice_emotion" class="emo-chip">
            <span class="emo-dot" :style="{ backgroundColor: getEmotionColor(emotionResult.voice_emotion.emotion) }"></span>
            <span class="emo-name">语调</span>
            <span class="emo-val">{{ emotionResult.voice_emotion.emotion_cn }}</span>
          </div>
          <div v-if="emotionResult.text_emotion" class="emo-chip">
            <span class="emo-dot" :style="{ backgroundColor: getEmotionColor(emotionResult.text_emotion.emotion) }"></span>
            <span class="emo-name">文本</span>
            <span class="emo-val">{{ emotionResult.text_emotion.emotion_cn }}</span>
          </div>
          <div v-if="emotionResult.facial_emotion && emotionResult.facial_emotion.frame_count > 0" class="emo-chip">
            <span class="emo-dot" :style="{ backgroundColor: getEmotionColor(emotionResult.facial_emotion.dominant_emotion) }"></span>
            <span class="emo-name">面部</span>
            <span class="emo-val">{{ emotionResult.facial_emotion.dominant_emotion_cn }}</span>
          </div>
          <div class="emo-chip">
            <span class="emo-dot" :style="{ backgroundColor: getEmotionColor(emotionResult.asr_emo) }"></span>
            <span class="emo-name">ASR</span>
            <span class="emo-val">{{ getEmotionCn(emotionResult.asr_emo) }}</span>
          </div>
        </div>

        <div ref="chatBodyRef" class="chat-body">
          <div v-if="displayMessages.length === 0" class="chat-empty">
            开始自我教练后，对话内容会显示在这里
          </div>
          <div
            v-for="(m, i) in displayMessages"
            :key="i"
            class="chat-msg"
            :class="m.role"
          >
            <div class="msg-bubble">{{ m.content }}</div>
            <div class="msg-meta">
              <span v-if="m.role === 'assistant'" class="ai-tag">AI 生成</span>
              <span class="msg-time">{{ m.timestamp }}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- ===== 底部控制条 ===== -->
    <div class="vc-controls">
      <div v-if="isDeviceActive" class="volume-meter">
        <span class="vol-label">音量</span>
        <canvas ref="volumeCanvasRef" class="vol-canvas" width="160" height="24"></canvas>
        <span class="vol-value">{{ volumeLevel }}%</span>
      </div>

      <div class="ctrl-actions">
        <button v-if="messages.length > 0" class="ctrl-btn" title="清空对话" @click="clearHistory">
          <PhTrashSimple :size="20" weight="duotone" />
          <span>清空</span>
        </button>
        <button v-if="isDeviceActive" class="ctrl-btn" title="暂停/继续通话" @click="togglePause">
          <PhPause v-if="!isPaused" :size="20" weight="duotone" />
          <PhPlay v-else :size="20" weight="duotone" />
          <span>{{ isPaused ? '继续' : '暂停' }}</span>
        </button>
        <button v-if="isDeviceActive" class="ctrl-btn" title="说完了（手动发送）" :disabled="isPaused" @click="manualSend">
          <PhCheck :size="20" weight="duotone" />
          <span>说完了</span>
        </button>
        <button
          v-if="isDeviceActive && callState !== 'idle'"
          class="ctrl-btn"
          title="打断 AI 回复"
          :disabled="isPaused"
          @click="triggerManualInterrupt"
        >
          <PhStop :size="20" weight="duotone" />
          <span>打断</span>
        </button>
        <button v-if="isDeviceActive" class="ctrl-btn end" @click="toggleCall">
          <PhPhoneDisconnect :size="22" weight="fill" />
          <span>结束通话</span>
        </button>
      </div>
    </div>

    <p class="vc-tips">说话后停顿 1.5 秒 AI 自动回复 · AI 说话时直接开口可打断 · 问「这是什么」可让 AI 观察画面</p>
  </div>
</template>
<style scoped>
/* 通话页大改版：全屏通话舞台 + 对话侧栏 + 底部控制条（松绿体系） */
.vc-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

/* ===== 顶栏 ===== */
.vc-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.vc-topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.socket-chip,
.state-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  color: var(--color-ink-soft);
}
.socket-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #c8cac2;
}
.socket-chip.connected .socket-dot { background: var(--color-pine); }
.socket-chip.connecting .socket-dot { background: #d9a13b; }
.socket-chip.connected { color: var(--color-pine); }
.socket-chip.connecting { color: #8a6d1f; }
.socket-chip.disconnected { color: #c2402f; }
.socket-chip.disconnected .socket-dot { background: #c2402f; }
.state-chip.listening {
  color: var(--color-pine);
  background: var(--color-pine-soft);
  border-color: transparent;
}
.state-chip.thinking {
  color: #8a6d1f;
  background: #f6efd9;
  border-color: transparent;
}
.state-chip.speaking {
  color: var(--color-pine-deep);
  background: #dcebe2;
  border-color: transparent;
}
.state-chip.idle.paused,
.state-chip.listening.paused {
  color: var(--color-ink-soft);
  background: var(--color-paper);
  border-color: var(--color-hairline);
}
.vc-stats {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--color-ink-soft);
}

/* ===== 主区 ===== */
.vc-main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

/* ===== 通话舞台（深色画布） ===== */
.vc-stage {
  flex: 1;
  min-width: 0;
  position: relative;
  border-radius: 20px;
  background: #10131c;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}
.stage-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}
.stage-canvas { display: none; }
.self-tag {
  position: absolute;
  top: 14px;
  left: 14px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 8px;
  border-radius: 8px;
  z-index: 3;
}

.stage-loading {
  position: relative;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #b9a08f;
  font-size: 13px;
}
.loader {
  width: 26px;
  height: 26px;
  border: 3px solid rgba(255, 255, 255, 0.18);
  border-top-color: #6fcf9f;
  border-radius: 50%;
  animation: vc-spin 0.8s linear infinite;
}
@keyframes vc-spin { to { transform: rotate(360deg); } }

.stage-idle {
  position: relative;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 24px;
  max-width: 340px;
}
.idle-orb {
  width: 120px;
  height: 181px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}
.idle-orb :deep(.cs-root) { width: 100%; height: 100%; }
.idle-title {
  margin: 0;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
}
.idle-desc {
  margin: 0;
  color: #aeb4c4;
  font-size: 13px;
  line-height: 1.6;
}
.start-call-btn {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 26px;
  border: none;
  border-radius: 999px;
  background: var(--color-pine);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.2s ease;
}
.start-call-btn:hover { background: #2a8262; }
.start-call-btn:active { transform: scale(0.98); }
.start-call-btn:focus-visible,
.ctrl-btn:focus-visible {
  outline: 2px solid #9fd4bd;
  outline-offset: 2px;
}

/* ====== 通话中右下角陪伴浮窗（横向：图+状态文字）====== */
.call-overlay {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 12px 14px;
  background: rgba(16, 19, 28, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  backdrop-filter: blur(14px);
  z-index: 2;
}

/* 角色头像区 —— 比例对齐视频素材(784x1184≈0.662)，全身立绘不拉伸变形 */
.co-avatar {
  width: 100px;
  height: 151px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.co-avatar :deep(.cs-root) { width: 100%; height: 100%; }

/* 状态信息区 */
.co-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.co-status {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

/* 状态指示灯（呼吸小圆点） */
.co-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  animation: co-dot-pulse 2s ease-in-out infinite;
}
@keyframes co-dot-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.85); }
  50%      { opacity: 1;   transform: scale(1.15); }
}

/* 各状态颜色 */
.co-status.listening,
.co-dot.listening    { color: #7fd8b2; }
.co-dot.listening    { background: #3ecf8e; box-shadow: 0 0 6px rgba(62,207,142,0.45); }

.co-status.thinking,
.co-dot.thinking     { color: #e5c06f; }
.co-dot.thinking     { background: #d9a13b; box-shadow: 0 0 6px rgba(217,161,59,0.45); }

.co-status.speaking,
.co-dot.speaking     { color: #b7e3cf; }
.co-dot.speaking     { background: #7fd8b2; box-shadow: 0 0 8px rgba(127,216,178,0.55); animation-duration: 0.9s; }

.vlm-caption {
  position: absolute;
  left: 50%;
  top: 16px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 70%;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #e6e9f0;
  font-size: 12.5px;
  padding: 7px 14px;
  border-radius: 999px;
  backdrop-filter: blur(6px);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.stage-error {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  border-radius: 10px;
  background: rgba(194, 64, 47, 0.94);
  color: #fff;
  font-size: 12.5px;
  z-index: 3;
}

/* ===== 对话侧栏 ===== */
.vc-sidebar {
  width: 372px;
  flex-shrink: 0;
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-hairline);
}
.sidebar-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink);
}
.typing-hint {
  font-size: 12px;
  color: var(--color-pine);
}

.emotion-strip {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-hairline);
  flex-wrap: wrap;
}
.emo-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--color-paper);
  border: 1px solid var(--color-hairline);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--color-ink-soft);
}
.emo-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.emo-name {
  font-weight: 600;
  color: var(--color-ink-faint);
}
.emo-val {
  font-weight: 600;
  color: var(--color-ink);
}

.chat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat-empty {
  margin: auto;
  color: var(--color-ink-faint);
  font-size: 13px;
  text-align: center;
}
.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 88%;
}
.chat-msg.user {
  align-self: flex-end;
  align-items: flex-end;
}
.msg-bubble {
  padding: 9px 13px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.chat-msg.assistant .msg-bubble {
  background: var(--color-paper);
  border: 1px solid var(--color-hairline);
  color: var(--color-ink);
  border-top-left-radius: 4px;
}
.chat-msg.user .msg-bubble {
  background: var(--color-pine);
  color: #fff;
  border-top-right-radius: 4px;
}
.msg-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ai-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-pine-deep);
  background: var(--color-pine-soft);
  border-radius: 999px;
  padding: 1px 6px;
}
.msg-time {
  font-size: 11px;
  color: var(--color-ink-faint);
}

/* ===== 底部控制条 ===== */
.vc-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.volume-meter {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  border-radius: 999px;
  padding: 6px 14px;
}
.vol-label {
  font-size: 12px;
  color: var(--color-ink-soft);
}
.vol-canvas { display: block; }
.vol-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-pine);
  min-width: 34px;
  text-align: right;
}
.ctrl-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-hairline);
  background: var(--color-card);
  color: var(--color-ink-soft);
  border-radius: 999px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.2s ease, border-color 0.2s ease;
}
.ctrl-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ctrl-btn:hover {
  border-color: var(--color-pine);
  color: var(--color-pine);
}
.ctrl-btn:active {
  transform: scale(0.97);
}
.ctrl-btn.end {
  background: var(--color-pine);
  border-color: var(--color-pine);
  color: #fff;
}
.ctrl-btn.end:hover {
  background: var(--color-pine-deep);
  color: #fff;
}
.ctrl-btn.end.active {
  background: #c2402f;
  border-color: #c2402f;
}
.ctrl-btn.end.active:hover {
  background: #a83628;
}

.vc-tips {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-ink-soft);
}

@media (max-width: 900px) {
  .vc-main {
    flex-direction: column;
  }
  .vc-stage {
    min-height: 260px;
  }
  .vc-sidebar {
    width: 100%;
    flex: 1;
    min-height: 220px;
  }
  .call-overlay {
    right: 12px;
    bottom: 12px;
    padding: 10px 14px;
    min-width: 128px;
  }
  .vc-controls {
    justify-content: center;
  }
}
</style>
