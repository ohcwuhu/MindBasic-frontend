<script setup lang="ts">
import { ref, onUnmounted, onMounted, nextTick, computed } from 'vue'
import { io, Socket } from 'socket.io-client'

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

const STATE_COLOR: Record<string, string> = {
  idle: '#909399',
  listening: '#67C23A',
  thinking: '#E6A23C',
  speaking: '#8b5cf6'
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
    reconnectionDelay: 2000
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
      if (isDeviceActive.value && mediaStream) {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') {
          startAudioStreaming()
        }
      }
    }
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
    if (isDeviceActive.value && mediaStream) {
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

    if (chunks.length === 0) {
      console.warn('[VC] onstop: 没有分片，立即重启录音')
      // 没分片说明是被直接打断/杂音 → 立即重启
      isProcessing = false
      if (isDeviceActive.value && mediaStream) {
        startAudioStreaming()
      }
      return
    }

    const fullBlob = new Blob(chunks, { type: mediaRecorderMimeType })
    console.log('[VC] onstop: 合成完整音频, 分片数=' + chunks.length + ', 大小=' + fullBlob.size + '字节')

    if (fullBlob.size < SPEECH_MIN_SIZE) {
      console.warn('[VC] onstop: 录音过小(' + fullBlob.size + 'B)，判定为杂音，重启录音')
      isProcessing = false
      if (isDeviceActive.value && mediaStream) {
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
        if (isDeviceActive.value && mediaStream) {
          startAudioStreaming()
        }
      }
    } catch (err: any) {
      console.error('[VC] 音频上传异常:', err)
      errorMsg.value = '音频上传失败：' + (err?.message || '网络错误')
      isProcessing = false
      callState.value = 'listening'
      if (isDeviceActive.value && mediaStream) {
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
    const vadEnabled = !isProcessing && callState.value === 'listening'

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
    if (ttsIsActuallyPlaying) {
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
        fetch('/api/vc_audio_upload', { method: 'POST', body: formData })
          .then(r => r.json())
          .then(result => {
            if (result.ok) {
              socket.value?.emit('vc_audio_end', { file_id: result.file_id, file_size: result.file_size })
            }
            isProcessing = false
            callState.value = 'listening'
            if (isDeviceActive.value && mediaStream) startAudioStreaming()
          })
          .catch(() => {
            isProcessing = false
            callState.value = 'listening'
            if (isDeviceActive.value && mediaStream) startAudioStreaming()
          })
      } else {
        isProcessing = false
        callState.value = 'listening'
        if (isDeviceActive.value && mediaStream) startAudioStreaming()
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

// 情感 emoji 映射
const EMOJI_MAP: Record<string, string> = {
  happy: '😊', sad: '😢', angry: '😠', surprised: '😮',
  fearful: '😨', disgusted: '🤢', neutral: '😐',
}
const CN_MAP: Record<string, string> = {
  happy: '开心', sad: '悲伤', angry: '愤怒', surprised: '惊讶',
  fearful: '恐惧', disgusted: '厌恶', neutral: '中性',
}
const getEmotionEmoji = (emo: string) => EMOJI_MAP[emo?.toLowerCase()] || '❓'
const getEmotionCn = (emo: string) => CN_MAP[emo?.toLowerCase()] || emo || '未知'

const manualSend = () => {
  if (!isDeviceActive.value) {
    errorMsg.value = '请先点击「开始视频通话」启动设备'
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
  <div class="vc-container">
    <h2 class="vc-title">📹 AI 视频通话</h2>

    <!-- Socket 状态条 -->
    <div class="socket-bar" :class="socketStatus">
      <span class="dot"></span>
      <span>{{ socketStatus === 'connected' ? '后端已连接' : socketStatus === 'connecting' ? '连接中…' : '后端未连接' }}</span>
    </div>

    <!-- 视频预览 + 状态浮层 -->
    <div class="video-wrapper">
      <video ref="videoRef" class="video-player" autoplay playsinline muted></video>
      <canvas ref="canvasRef" class="hidden-canvas"></canvas>

      <div v-if="isLoading" class="loading-overlay">
        <div class="spinner"></div>
        <span>设备启动中…</span>
      </div>

      <div v-if="!isDeviceActive && !isLoading" class="placeholder">
        <span>点击下方「开始视频通话」启动 AI 实时对话</span>
      </div>

      <!-- 状态浮层 -->
      <div v-if="isDeviceActive" class="state-overlay">
        <div class="state-badge" :style="{ backgroundColor: STATE_COLOR[callState] }">
          {{ STATE_TEXT[callState] }}
        </div>
      </div>

      <!-- VLM 视觉描述浮层 -->
      <div v-if="vlmDescription && isDeviceActive" class="vlm-overlay">
        <span class="vlm-label">👁️ VLM</span>
        <span class="vlm-text">{{ vlmDescription.slice(0, 80) }}{{ vlmDescription.length > 80 ? '…' : '' }}</span>
      </div>
    </div>

    <!-- 控制面板 -->
    <div class="controls">
      <button class="btn-call" :class="{ active: isDeviceActive }" @click="toggleCall">
        {{ isDeviceActive ? '⏹ 结束通话' : '📹 开始视频通话' }}
      </button>
      <button v-if="isDeviceActive" class="btn-send" @click="manualSend">
        ⏯ 说完了（手动发送）
      </button>
      <button v-if="isDeviceActive" class="btn-interrupt" @click="triggerManualInterrupt">
        ✋ 打断
      </button>
      <button v-if="messages.length > 0" class="btn-clear" @click="clearHistory">
        🗑 清空对话
      </button>
    </div>

    <!-- 音量条 + 统计 -->
    <div v-if="isDeviceActive" class="status-panel">
      <div class="volume-item">
        <span class="vol-label">音量</span>
        <canvas ref="volumeCanvasRef" class="vol-canvas" width="200" height="32"></canvas>
        <span class="vol-value">{{ volumeLevel }}%</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">对话轮数</span>
        <span class="stat-value">{{ stats.totalTurns }}</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMsg" class="error-banner">
      ⚠ {{ errorMsg }}
    </div>

    <!-- 对话记录 -->
    <div class="chat-panel">
      <div class="chat-header">
        <span>💬 对话记录</span>
        <span v-if="partialAssistantText" class="typing-hint">AI 正在回复…</span>
      </div>
      <div ref="chatBodyRef" class="chat-body">
        <div v-if="displayMessages.length === 0" class="chat-empty">
          开始视频通话后，对话内容将显示在这里
        </div>
        <div
          v-for="(m, i) in displayMessages"
          :key="i"
          class="chat-msg"
          :class="m.role"
        >
          <div class="msg-bubble">{{ m.content }}</div>
          <div class="msg-time">{{ m.timestamp }}</div>
        </div>
      </div>
    </div>

    <!-- 多模态情感分析面板 -->
    <div v-if="emotionResult" class="emotion-panel">
      <div class="emotion-header">
        <span>🎭 多模态情感分析</span>
        <span class="emotion-elapsed">{{ emotionResult.elapsed_seconds }}s</span>
      </div>
      <div class="emotion-grid">
        <!-- 融合结果 -->
        <div v-if="emotionResult.fusion" class="emotion-card emotion-fusion">
          <div class="emotion-card-title">融合结果</div>
          <div class="emotion-main">
            <span class="emotion-emoji">{{ getEmotionEmoji(emotionResult.fusion.final_emotion) }}</span>
            <span class="emotion-label">{{ emotionResult.fusion.final_emotion_cn }}</span>
            <span class="emotion-conf">{{ Math.round((emotionResult.fusion.overall_confidence || 0) * 100) }}%</span>
          </div>
          <div v-if="emotionResult.fusion.weights_used" class="emotion-weights">
            文本{{ Math.round((emotionResult.fusion.weights_used.text || 0) * 100) }}% ·
            语调{{ Math.round((emotionResult.fusion.weights_used.voice || 0) * 100) }}% ·
            面部{{ Math.round((emotionResult.fusion.weights_used.facial || 0) * 100) }}%
          </div>
        </div>

        <!-- 语调情感 -->
        <div v-if="emotionResult.voice_emotion" class="emotion-card">
          <div class="emotion-card-title">语调情感</div>
          <div class="emotion-main">
            <span class="emotion-emoji">{{ getEmotionEmoji(emotionResult.voice_emotion.emotion) }}</span>
            <span class="emotion-label">{{ emotionResult.voice_emotion.emotion_cn }}</span>
            <span class="emotion-conf">{{ Math.round((emotionResult.voice_emotion.confidence || 0) * 100) }}%</span>
          </div>
        </div>

        <!-- 文本情感 -->
        <div v-if="emotionResult.text_emotion" class="emotion-card">
          <div class="emotion-card-title">文本情感</div>
          <div class="emotion-main">
            <span class="emotion-emoji">{{ getEmotionEmoji(emotionResult.text_emotion.emotion) }}</span>
            <span class="emotion-label">{{ emotionResult.text_emotion.emotion_cn }}</span>
            <span class="emotion-conf">{{ Math.round((emotionResult.text_emotion.confidence || 0) * 100) }}%</span>
          </div>
        </div>

        <!-- 面部情感 -->
        <div v-if="emotionResult.facial_emotion && emotionResult.facial_emotion.frame_count > 0" class="emotion-card">
          <div class="emotion-card-title">面部情感</div>
          <div class="emotion-main">
            <span class="emotion-emoji">{{ getEmotionEmoji(emotionResult.facial_emotion.dominant_emotion) }}</span>
            <span class="emotion-label">{{ emotionResult.facial_emotion.dominant_emotion_cn }}</span>
            <span class="emotion-conf">{{ Math.round((emotionResult.facial_emotion.confidence || 0) * 100) }}%</span>
          </div>
          <div class="emotion-weights">{{ emotionResult.facial_emotion.frame_count }}帧 · 稳定性{{ Math.round((emotionResult.facial_emotion.stability || 0) * 100) }}%</div>
        </div>

        <!-- ASR 情感 -->
        <div class="emotion-card">
          <div class="emotion-card-title">ASR 情感</div>
          <div class="emotion-main">
            <span class="emotion-emoji">{{ getEmotionEmoji(emotionResult.asr_emo) }}</span>
            <span class="emotion-label">{{ getEmotionCn(emotionResult.asr_emo) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="tips">
      <p>💡 使用提示：</p>
      <ul>
        <li>说话后停顿 1.5 秒，AI 会自动开始回复</li>
        <li>AI 回复时直接开口说话即可打断</li>
        <li>问"这是什么？"等视觉问题，AI 会通过摄像头观察画面</li>
        <li>每轮对话会自动进行多模态情感分析（语调+文本+面部融合）</li>
        <li>需要配置 DEEPSEEK_API_KEY 才能使用 AI 对话功能</li>
        <li>配置 VLM_API_KEY 后可启用视觉理解能力</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.vc-container {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.vc-title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  margin: 0;
}
.socket-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
}
.socket-bar .dot {
  width: 8px; height: 8px; border-radius: 50%;
}
.socket-bar.connected { background: #f0f9eb; color: #67C23A; }
.socket-bar.connected .dot { background: #67C23A; }
.socket-bar.connecting { background: #fdf6ec; color: #E6A23C; }
.socket-bar.connecting .dot { background: #E6A23C; }
.socket-bar.disconnected { background: #fef0f0; color: #F56C6C; }
.socket-bar.disconnected .dot { background: #F56C6C; }

.video-wrapper {
  position: relative;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
}
.video-player {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}
.hidden-canvas { display: none; }
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.7);
  color: #fff;
  gap: 12px;
}
.spinner {
  width: 40px; height: 40px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 14px;
}
.state-overlay {
  position: absolute;
  top: 12px;
  left: 12px;
}
.state-badge {
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.vlm-overlay {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0,0,0,0.7);
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
}
.vlm-label { font-weight: 600; flex-shrink: 0; }
.vlm-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.btn-call {
  flex: 1;
  min-width: 180px;
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: #8b5cf6;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-call:hover { background: #7c4de4; }
.btn-call.active { background: #F56C6C; }
.btn-call.active:hover { background: #e65656; }
.btn-send {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  color: #409EFF;
  background: #ecf5ff;
  border: 1px solid #b3d8ff;
  border-radius: 10px;
  cursor: pointer;
}
.btn-send:hover { background: #d9ecff; }
.btn-interrupt {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  color: #E6A23C;
  background: #fdf6ec;
  border: 1px solid #f5dab1;
  border-radius: 10px;
  cursor: pointer;
}
.btn-interrupt:hover { background: #faecd8; }
.btn-clear {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  color: #909399;
  background: #f4f4f5;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  cursor: pointer;
}
.btn-clear:hover { background: #e9e9eb; }

.status-panel {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 8px;
}
.volume-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.vol-label { font-size: 13px; color: #606266; }
.vol-canvas { background: transparent; }
.vol-value { font-size: 13px; color: #909399; min-width: 36px; }
.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stat-label { font-size: 13px; color: #606266; }
.stat-value { font-size: 16px; font-weight: 600; color: #8b5cf6; }

.error-banner {
  padding: 10px 16px;
  background: #fef0f0;
  color: #F56C6C;
  border-radius: 8px;
  font-size: 13px;
}

.chat-panel {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  overflow: hidden;
}
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f5f3ff;
  border-bottom: 1px solid #ebeef5;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.typing-hint {
  font-size: 12px;
  font-weight: 400;
  color: #8b5cf6;
}
.chat-body {
  max-height: 320px;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat-empty {
  text-align: center;
  color: #c0c4cc;
  font-size: 13px;
  padding: 24px 0;
}
.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chat-msg.user { align-items: flex-end; }
.chat-msg.assistant { align-items: flex-start; }
.msg-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}
.chat-msg.user .msg-bubble {
  background: #8b5cf6;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.chat-msg.assistant .msg-bubble {
  background: #f5f7fa;
  color: #303133;
  border: 1px solid #e4e7ed;
  border-bottom-left-radius: 4px;
}
.msg-time {
  font-size: 11px;
  color: #c0c4cc;
}

.tips {
  padding: 14px 16px;
  background: #f5f7fa;
  border-radius: 8px;
  font-size: 12px;
  color: #909399;
  line-height: 1.8;
}
.tips p { margin: 0 0 4px; font-weight: 600; }
.tips ul { margin: 0; padding-left: 20px; }

@media (max-width: 640px) {
  .vc-container { padding: 0 8px; }
  .btn-call { min-width: 140px; }
  .status-panel { flex-direction: column; align-items: flex-start; gap: 8px; }
}

/* 多模态情感分析面板 */
.emotion-panel {
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.emotion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #6366f1;
  margin-bottom: 10px;
}
.emotion-elapsed {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 400;
}
.emotion-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}
.emotion-card {
  background: white;
  border-radius: 8px;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
}
.emotion-fusion {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.04);
}
.emotion-card-title {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 4px;
}
.emotion-main {
  display: flex;
  align-items: center;
  gap: 4px;
}
.emotion-emoji {
  font-size: 18px;
}
.emotion-label {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}
.emotion-conf {
  font-size: 11px;
  color: #6b7280;
  margin-left: auto;
}
.emotion-weights {
  font-size: 10px;
  color: #9ca3af;
  margin-top: 4px;
}
</style>
