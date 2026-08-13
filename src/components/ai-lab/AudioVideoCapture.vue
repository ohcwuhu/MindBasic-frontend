<script setup lang="ts">
import { ref, onUnmounted, onMounted } from 'vue'
import { io, Socket } from 'socket.io-client'
import AiCoachPanel from './AiCoachPanel.vue'

// ================================================================
//  公共映射表：后端枚举 → 中文文案
// ================================================================
const LEVEL_TEXT: Record<string, string> = {
  ENGAGED: '投入',
  NEUTRAL: '平静',
  BORING: '无聊'
}

const EMOTION_TEXT: Record<string, string> = {
  happy: '开心',
  surprise: '惊讶',
  neutral: '平静',
  fear: '害怕',
  sad: '难过',
  angry: '生气',
  disgust: '厌恶'
}

// 情绪颜色映射（用于分布条）
const EMOTION_COLOR: Record<string, string> = {
  happy: '#67C23A',
  surprise: '#E6A23C',
  neutral: '#909399',
  fear: '#8e44ad',
  sad: '#409EFF',
  angry: '#F56C6C',
  disgust: '#2c3e50'
}

// ================================================================
//  统一 7 类情感中文映射 & 颜色（用于融合结果展示）
// ================================================================
const UNIFIED_EMOTION_CN: Record<string, string> = {
  happy: '开心', sad: '悲伤', angry: '愤怒', surprised: '惊讶',
  fearful: '恐惧', disgusted: '厌恶', neutral: '中性'
}
const UNIFIED_EMOTION_COLOR: Record<string, string> = {
  happy: '#67C23A', sad: '#409EFF', angry: '#F56C6C', surprised: '#E6A23C',
  fearful: '#8e44ad', disgusted: '#2c3e50', neutral: '#909399'
}
const UNIFIED_EMOTION_EMOJI: Record<string, string> = {
  happy: '😊', sad: '😢', angry: '😠', surprised: '😲',
  fearful: '😨', disgusted: '🤢', neutral: '😐'
}
/** 趋势中文 */
const TREND_CN: Record<string, string> = {
  rising: '上升', stable: '稳定', falling: '下降', no_data: '无数据'
}
/** 获取概率分布中的最大值（用于条宽归一化） */
const getMaxProb = (probs: Record<string, number>) => {
  const vals = Object.values(probs)
  return Math.max(0.01, ...vals)
}

// ================================================================
//  第一层：公共响应式状态 & 公共变量
// ================================================================

/** 统一媒体流（视频+音频共用一份 MediaStream） */
const mediaStream = ref<MediaStream | null>(null)
/** 设备是否已激活 */
const isDeviceActive = ref(false)
/** 加载状态 */
const isLoading = ref(false)
/** 统一错误信息 */
const errorMsg = ref('')
/** 页面可见性 */
let isPageVisible = true

// ================================================================
//  第二层：Socket.io 相关状态 & 逻辑
// ================================================================

/** 后端地址（Socket + REST API 共用；同源经 Vite 代理到 8000） */
const API_BASE_URL = ''
/** Socket.io 实例 */
let socket: Socket | null = null
/** Socket 连接状态 */
type SocketStatus = 'disconnected' | 'connecting' | 'connected'
const socketStatus = ref<SocketStatus>('disconnected')

/**
 * 建立 Socket.io 连接
 */
const connectSocket = () => {
  if (socket && socket.connected) return

  socketStatus.value = 'connecting'

  try {
    socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    })

    // ---- 连接成功 ----
    socket.on('connect', () => {
      socketStatus.value = 'connected'
      console.log(`[Socket.io] 已连接到 ${API_BASE_URL}, sid=${socket?.id}`)
    })

    // ---- 断开连接 ----
    socket.on('disconnect', (reason) => {
      socketStatus.value = 'disconnected'
      console.log('[Socket.io] 断开连接:', reason)
    })

    // ---- 重连中 ----
    socket.on('connect_error', (err) => {
      socketStatus.value = 'disconnected'
      console.warn('[Socket.io] 连接失败:', err.message)
      errorMsg.value = `后端连接失败：${err.message}（请确认后端已启动于 ${API_BASE_URL}）`
    })

    // ================ 接收后端推送 ================
    // 情绪识别结果（含人脸情绪 + 录音结束后的完整文本 + 文本情绪）
    socket.on('emotion_result', (data: EmotionResult) => {
      emotionResult.value = data
      emotionError.value = ''
      // 收到最终结果时清空实时片段文字
      if (data.final_text) {
        partialText.value = ''
      }
    })

    // 情绪识别错误
    socket.on('emotion_error', (data: { error: string; message: string }) => {
      emotionError.value = `${data.error}: ${data.message}`
    })

    // ===== whisper-live 实时片段文字（增量推送，可选展示）=====
    // 后端在 feed_audio 推理出增量文本时推送此事件
    socket.on('asr_partial', (data: { text: string; timestamp?: string }) => {
      partialText.value = data.text || ''
    })
    // ==============================================
  } catch (err: any) {
    socketStatus.value = 'disconnected'
    console.error('[Socket.io] 创建失败:', err)
    errorMsg.value = `Socket 创建失败：${err?.message || ''}`
  }
}

/**
 * 断开 Socket.io 连接
 * 清空所有监听事件后关闭连接，防止内存泄漏与重复回调
 */
const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners()
    socket.close()
    socket = null
  }
  socketStatus.value = 'disconnected'
}

// ================================================================
//  第三层：情绪识别结果状态（来自后端推送）
// ================================================================

interface EmotionResult {
  timestamp: string
  score: number
  students: number
  alert: boolean
  level: string
  emotions: Record<string, number>
  processing_time_ms: number
  // ===== whisper-live 流式 ASR 扩展字段（后端融合后推送）=====
  /** 录音结束后返回的完整识别文本 */
  final_text?: string
  /** 文本情绪分类（如 positive/negative/neutral） */
  text_emotion?: string
  /** 文本情绪置信度 0~1 */
  text_emotion_score?: number
}

/** 最新情绪识别结果（含人脸情绪 + 文本情绪） */
const emotionResult = ref<EmotionResult | null>(null)
/** 情绪识别错误信息 */
const emotionError = ref('')
/** 实时片段识别文本（whisper-live 增量推送，可选展示） */
const partialText = ref('')

// ================================================================
//  多模态音频分析新增：响应式类型与状态（SenseVoice + openSMILE）
// ================================================================

/** 统一 7 类情感概率分布 */
type EmotionProbs = Record<string, number>

/** 单个情感分析结果（文本/语调通用结构） */
interface EmotionAnalysis {
  emotion: string           // 统一英文标签 happy/sad/angry/...
  emotion_cn?: string       // 中文标签
  confidence: number        // 置信度 0~1
  probabilities: EmotionProbs
  method?: string           // 使用的模型/方法
  text?: string             // 文本情感时携带的原文
  sv_cross_check?: {        // 语调情感的 SenseVoice 交叉验证
    emotion: string
    agree: boolean
    source: string
  }
}

/** 面部情感聚合结果（录音时段内的时序聚合） */
interface FacialEmotionResult {
  dominant_emotion: string
  dominant_emotion_cn?: string
  confidence: number
  stability: number         // 稳定性 0~1（1-归一化熵）
  trend: string             // rising/stable/falling/no_data
  frame_count: number       // 录音时段内的有效面部帧数
  time_window: {
    start: string
    end: string
    duration_seconds: number
  }
  emotion_distribution: EmotionProbs
  sequence_summary: Array<{  // 下采样后的时序关键点（最多10个）
    t: number               // 相对录音开始的秒数
    emotion: string
    confidence: number
  }>
}

/** 融合结果 */
interface FusionResult {
  final_emotion: string
  final_emotion_cn: string
  overall_confidence: number
  probabilities: EmotionProbs
  weights_used: { text: number; voice: number; facial: number }
  weight_adjustments: string[]
}

/** 转写结果 */
interface TranscriptionResult {
  text: string
  language: string
  duration_seconds?: number
}

/** /api/analyze_audio 响应体（融合版） */
interface MultimodalAudioResponse {
  status: 'ok' | 'partial_success' | 'failed'
  transcription: TranscriptionResult
  text_emotion: EmotionAnalysis
  voice_emotion: EmotionAnalysis
  facial_emotion: FacialEmotionResult
  fusion: FusionResult
  errors?: {
    asr_error: string | null
    voice_emotion_error: string | null
    text_emotion_error: string | null
  }
  timing?: {
    total_seconds: number
    asr_seconds?: number | null
    voice_emotion_seconds?: number | null
    text_emotion_seconds?: number | null
    facial_buffer_frames?: number
  }
  server_info?: {
    sid: string
    voice_fallback_used?: boolean
    models_loaded?: Record<string, boolean>
  }
}

/** 音频分析请求状态：idle / uploading / analyzing / ready / error */
type AudioAnalysisState = 'idle' | 'uploading' | 'analyzing' | 'ready' | 'error'
const audioAnalysisState = ref<AudioAnalysisState>('idle')

/** 音频分析最终完整响应 */
const audioAnalysisResult = ref<MultimodalAudioResponse | null>(null)

/** 音频分析请求过程中显示的「提示文本」 */
const audioAnalysisHint = ref('')

// ================================================================
//  第四层：视频相关状态 & 逻辑
// ================================================================

/** 视频 DOM 引用 */
const videoRef = ref<HTMLVideoElement | null>(null)
/** 隐藏画布 DOM 引用（抽帧用） */
const canvasRef = ref<HTMLCanvasElement | null>(null)
/** 视频状态：idle=空闲 / previewing=预览中 / paused=已暂停 */
const videoState = ref<'idle' | 'previewing' | 'paused'>('idle')
/** 抽帧定时器是否运行 */
const isFrameCapturing = ref(false)
/** 抽帧图片质量（0.1~1.0） */
const frameQuality = ref(0.6)
/** 抽帧定时器 ID */
let frameTimer: number | null = null

/**
 * 启动视频抽帧定时器（约 2.5fps）
 */
const startFrameCapture = () => {
  stopFrameCapture()
  isFrameCapturing.value = true
  frameTimer = window.setInterval(() => {
    if (isPageVisible && isDeviceActive.value) {
      captureFrame()
    }
  }, 400)
}

/**
 * 停止视频抽帧定时器
 */
const stopFrameCapture = () => {
  if (frameTimer !== null) {
    clearInterval(frameTimer)
    frameTimer = null
  }
  isFrameCapturing.value = false
}

/**
 * 视频抽帧：从 video 截取一帧 → 压缩 base64 → 发送到后端
 */
const captureFrame = () => {
  if (!videoRef.value || !canvasRef.value) return
  const video = videoRef.value
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx || video.videoWidth === 0) return

  // 降分辨率至 320 宽，节省带宽
  const targetWidth = 320
  const targetHeight = Math.round(video.videoHeight * (targetWidth / video.videoWidth))
  canvas.width = targetWidth
  canvas.height = targetHeight
  ctx.drawImage(video, 0, 0, targetWidth, targetHeight)

  // 压缩为 base64
  const base64Frame = canvas.toDataURL('image/jpeg', frameQuality.value)

  // ========== 发送视频帧到后端（Socket.io） ==========
  sendFrame(base64Frame)
  // ==================================================
}

/**
 * 手动切换抽帧定时器
 */
const toggleFrameCapture = () => {
  if (isFrameCapturing.value) {
    stopFrameCapture()
  } else {
    startFrameCapture()
  }
}

// ================================================================
//  第五层：音频相关状态 & 逻辑
// ================================================================

/** MediaRecorder 实例 */
let mediaRecorder: MediaRecorder | null = null
/** 录音状态：idle=空闲 / recording=录制中 / paused=已暂停 */
const audioState = ref<'idle' | 'recording' | 'paused'>('idle')
/** 已录制的音频分片缓存 */
const audioChunks = ref<Blob[]>([])
/**
 * 录音开始/结束时间戳（毫秒，Date.now()）
 * 用于多模态融合时从后端 FacialBuffer 提取对应时段的面部帧
 */
let recordStartTs = 0
let recordEndTs = 0
/** 实时音量 0~100 */
const volumeLevel = ref(0)
/** 音量可视化 Canvas 引用 */
const volumeCanvasRef = ref<HTMLCanvasElement | null>(null)
/** 静音上传开关 */
const isUploadPaused = ref(false)

/** Web Audio 相关实例 */
let audioContext: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null
/** 音量可视化动画帧 ID */
let volumeAnimationId: number | null = null

/** 静音检测配置 */
const SILENCE_THRESHOLD = 5
const SILENCE_DURATION = 3000
let silenceTimer: number | null = null
let wasSilent = false

/**
 * 启动音频录制（MediaRecorder 分片，800ms/段）
 */
const startAudioRecording = () => {
  if (!mediaStream.value) {
    errorMsg.value = '音频录制失败：媒体流未就绪'
    return
  }

  const audioTracks = mediaStream.value.getAudioTracks()
  if (audioTracks.length === 0) {
    errorMsg.value = '音频录制失败：当前媒体流中没有音频轨道'
    return
  }

  if (typeof MediaRecorder === 'undefined') {
    errorMsg.value = '浏览器不支持 MediaRecorder API'
    return
  }

  // 从完整流中提取纯音频轨道，构建仅含音频的新 MediaStream
  // 避免含视频轨道流 + 纯音频 mimeType 导致 NotSupportedError
  const audioOnlyStream = new MediaStream(audioTracks)

  const mimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    ''
  ]

  let recorder: MediaRecorder | null = null
  let lastError: any = null

  for (const type of mimeTypes) {
    try {
      const options: MediaRecorderOptions = {}
      if (type) options.mimeType = type
      options.audioBitsPerSecond = 128000
      recorder = new MediaRecorder(audioOnlyStream, options)
      break
    } catch (err) {
      lastError = err
      continue
    }
  }

  if (!recorder) {
    errorMsg.value = `启动录音失败：${lastError?.name || '未知'} - ${lastError?.message || ''}`
    return
  }

  try {
    const chunks: Blob[] = []
    audioChunks.value = chunks
    isUploadPaused.value = false
    wasSilent = false
    // 新一轮录音开始：清空上一轮的多模态分析结果
    clearAudioAnalysisResult()
    // 记录录音开始时间戳（用于融合时查询对应时段的面部缓冲）
    recordStartTs = Date.now()

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data)
        if (!isUploadPaused.value) {
          // 多模态流程：分片只做本地收集 + 实时音量展示，不实时上传。
          // 真正的上传在 stopAudioRecording() 里通过 POST /api/analyze_audio 一次性完成。
        }
      }
    }

    recorder.onstop = () => { audioState.value = 'idle' }
    recorder.onerror = () => { errorMsg.value = '录音过程出错，请重试' }

    recorder.start(800)
    mediaRecorder = recorder
    audioState.value = 'recording'
    startVolumeMeter()
  } catch (err: any) {
    errorMsg.value = `启动录音失败：${err?.name || ''} ${err?.message || ''}`
    try { recorder.stop() } catch {}
    mediaRecorder = null
  }
}

/**
 * 停止音频录制（多模态模式：非分片流式，而是完整段上传）
 * 结束时把已录制的 audioChunks 合并 → 构造 FormData → POST /api/analyze_audio
 */
const stopAudioRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop() } catch {}
  }
  mediaRecorder = null
  stopVolumeMeter()

  if (silenceTimer !== null) {
    clearTimeout(silenceTimer)
    silenceTimer = null
  }
  isUploadPaused.value = false
  wasSilent = false
  audioState.value = 'idle'

  // 不再发 socket 的 {type:"audio_end"} — 多模态流程用 HTTP 一次性提交
  const chunks = audioChunks.value
  if (chunks.length === 0) {
    console.warn('[Audio] 停止录音但没有任何 audioChunks，不上传')
    return
  }

  // 记录录音结束时间戳（用于融合时查询对应时段的面部缓冲）
  recordEndTs = Date.now()

  // 异步：完整段上传 + 分析（携带 sid 和时间戳供后端融合使用）
  void uploadAndAnalyzeAudio(chunks, recordStartTs, recordEndTs)
}

/**
 * 将录制的 Blob 分片合并为一个完整文件，上传到 /api/analyze_audio，
 * 并把返回的融合结果（文本情感 + 语调情感 + 面部情感 + 融合）渲染到 UI 面板。
 *
 * @param chunks 录音分片
 * @param startTs 录音开始时间戳（毫秒，Date.now()）
 * @param endTs   录音结束时间戳（毫秒，Date.now()）
 */
const uploadAndAnalyzeAudio = async (chunks: Blob[], startTs: number, endTs: number) => {
  if (!chunks || chunks.length === 0) return

  // 1) 开始新一轮：清空上次结果
  audioAnalysisResult.value = null
  audioAnalysisHint.value = '正在打包并上传音频...'
  audioAnalysisState.value = 'uploading'

  try {
    // 2) 合成完整 Blob：优先用录制时已有的 mimeType；否则浏览器默认 webm
    const firstMime = chunks[0]?.type || ''
    const combinedMime = firstMime || 'audio/webm;codecs=opus'
    const combinedBlob = new Blob(chunks, { type: combinedMime })

    // 3) 构造 FormData：字段名与后端 analyze_audio.py 对应
    //    file: 音频文件
    //    sid: SocketIO 客户端 ID（用于查询面部时序缓冲）
    //    record_start_ts: 录音开始时间戳（毫秒）
    //    record_end_ts:   录音结束时间戳（毫秒）
    const formData = new FormData()
    const ext = combinedMime.includes('webm') ? 'webm'
               : combinedMime.includes('wav') ? 'wav'
               : combinedMime.includes('mp3') ? 'mp3' : 'webm'
    const filename = `audio_${Date.now()}.${ext}`
    formData.append('file', combinedBlob, filename)
    // 携带 SocketIO sid（可能为空字符串，后端会跳过面部融合）
    formData.append('sid', socket?.id || '')
    formData.append('record_start_ts', String(startTs))
    formData.append('record_end_ts', String(endTs))

    audioAnalysisHint.value = `已上传 ${Math.round(combinedBlob.size / 1024)} KB，等待后端多模态分析（首次推理较慢，请耐心等待）...`
    audioAnalysisState.value = 'analyzing'

    const resp = await fetch(`${API_BASE_URL}/api/analyze_audio`, {
      method: 'POST',
      body: formData,
      // 注意：不要设置 Content-Type，浏览器会自动为 FormData 生成带 boundary 的 Content-Type
    })

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
    }
    const json = (await resp.json()) as MultimodalAudioResponse
    audioAnalysisResult.value = json

    if (json.status === 'ok') {
      audioAnalysisState.value = 'ready'
      audioAnalysisHint.value = `融合分析完成（${json.timing?.total_seconds?.toFixed(1) ?? '-'}s）`
    } else if (json.status === 'partial_success') {
      audioAnalysisState.value = 'ready'
      audioAnalysisHint.value = '部分完成：某路分析失败，请查看下方错误详情'
    } else {
      audioAnalysisState.value = 'error'
      audioAnalysisHint.value = '分析失败：ASR 和语调分析均未成功'
    }
  } catch (err: any) {
    audioAnalysisState.value = 'error'
    audioAnalysisHint.value = `上传或分析异常：${err?.message || String(err)}`
    console.error('[Audio] uploadAndAnalyzeAudio 失败:', err)
  }
}

/**
 * 清空当前多模态音频分析结果（用户手动或新一轮录音开始时调用）
 */
const clearAudioAnalysisResult = () => {
  audioAnalysisResult.value = null
  audioAnalysisState.value = 'idle'
  audioAnalysisHint.value = ''
}

/**
 * 手动切换录音
 */
const toggleAudioRecording = () => {
  if (audioState.value === 'recording') {
    stopAudioRecording()
  } else if (audioState.value === 'idle' && isDeviceActive.value) {
    startAudioRecording()
  }
}

// ================================================================
//  第六层：音量可视化 & 静音检测
// ================================================================

const startVolumeMeter = () => {
  if (!mediaStream.value) return
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    audioContext = new AudioContextClass()
    sourceNode = audioContext.createMediaStreamSource(mediaStream.value)
    analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = 256
    sourceNode.connect(analyserNode)
    drawVolumeMeter()
  } catch {}
}

const stopVolumeMeter = () => {
  if (volumeAnimationId !== null) {
    cancelAnimationFrame(volumeAnimationId)
    volumeAnimationId = null
  }
  if (sourceNode) { try { sourceNode.disconnect() } catch {}; sourceNode = null }
  if (audioContext) { audioContext.close().catch(() => {}); audioContext = null }
  analyserNode = null
  volumeLevel.value = 0
}

const drawVolumeMeter = () => {
  if (!analyserNode || !volumeCanvasRef.value) return
  const canvas = volumeCanvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const bufferLength = analyserNode.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  const render = () => {
    if (!analyserNode || !canvas) return
    volumeAnimationId = requestAnimationFrame(render)
    analyserNode.getByteFrequencyData(dataArray)

    let sum = 0
    for (let i = 0; i < bufferLength; i++) sum += dataArray[i]
    const avg = sum / bufferLength
    volumeLevel.value = Math.min(100, Math.round((avg / 255) * 150))

    // 静音检测
    const isNowSilent = volumeLevel.value < SILENCE_THRESHOLD
    if (isNowSilent && !wasSilent && audioState.value === 'recording') {
      if (silenceTimer !== null) clearTimeout(silenceTimer)
      silenceTimer = window.setTimeout(() => {
        if (volumeLevel.value < SILENCE_THRESHOLD && audioState.value === 'recording') {
          isUploadPaused.value = true
        }
      }, SILENCE_DURATION)
    } else if (!isNowSilent && wasSilent) {
      if (silenceTimer !== null) { clearTimeout(silenceTimer); silenceTimer = null }
      if (isUploadPaused.value) isUploadPaused.value = false
    }
    wasSilent = isNowSilent

    // 绘制彩色长条
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const barCount = 24, barWidth = 6, gap = 3
    const totalWidth = barCount * (barWidth + gap) - gap
    const startX = (w - totalWidth) / 2, centerY = h / 2
    const activeBars = Math.round((volumeLevel.value / 100) * barCount)
    for (let i = 0; i < barCount; i++) {
      const x = startX + i * (barWidth + gap)
      const isActive = i < activeBars
      const barHeight = isActive ? Math.max(8, (i + 1) * (h * 0.06)) : 6
      let color = '#67C23A'
      if (i >= barCount * 0.6) color = '#F56C6C'
      else if (i >= barCount * 0.3) color = '#E6A23C'
      ctx.fillStyle = isActive ? color : '#e4e7ed'
      ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight)
    }
  }
  render()
}

// ================================================================
//  第七层：统一设备管理（开启/关闭/释放）
// ================================================================

const startAllDevices = async () => {
  errorMsg.value = ''
  emotionError.value = ''
  isLoading.value = true

  // 先建立 Socket 连接
  connectSocket()

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    errorMsg.value = '浏览器不支持媒体设备API，请使用最新版Chrome/Edge/Firefox'
    isLoading.value = false
    return
  }

  try {
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: 'user',
        width:  { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    mediaStream.value = stream

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
  videoState.value = 'previewing'

  startFrameCapture()
  // 多模态流程：不自动开始录音，改为用户手动点击「开始录音」→「结束录音」的显式流程，
  // 这样每次分析都基于一段完整的音频，与需求文档对齐。
}

const stopAllDevices = () => {
  stopFrameCapture()
  stopAudioRecording()

  if (mediaStream.value) {
    mediaStream.value.getTracks().forEach(track => track.stop())
    mediaStream.value = null
  }

  if (videoRef.value) {
    videoRef.value.srcObject = null
    videoRef.value.removeEventListener('canplay', onVideoReady)
  }

  audioChunks.value = []
  isDeviceActive.value = false
  videoState.value = 'idle'
  audioState.value = 'idle'
  isLoading.value = false
  errorMsg.value = ''
}

const handleDeviceError = (err: any) => {
  const errorName = err?.name || ''
  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      errorMsg.value = '用户拒绝了摄像头/麦克风权限，请在浏览器设置中允许访问'
      break
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      errorMsg.value = '找不到摄像头或麦克风硬件设备，请检查设备连接'
      break
    case 'NotReadableError':
    case 'TrackStartError':
      errorMsg.value = '摄像头/麦克风被其他程序占用，请关闭占用程序后重试'
      break
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      errorMsg.value = '无法满足视频参数要求（720P/30fps），请降低分辨率后重试'
      break
    default:
      errorMsg.value = `设备启动失败：${err?.message || errorName || '未知错误'}`
  }
}

// ================================================================
//  第八层：窗口可见性监听
// ================================================================

const handleVisibilityChange = () => {
  isPageVisible = !document.hidden

  if (!isPageVisible && isDeviceActive.value) {
    if (videoRef.value && !videoRef.value.paused) videoRef.value.pause()
    videoState.value = 'paused'
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.pause(); audioState.value = 'paused'; stopVolumeMeter() } catch {}
    }
  } else if (isPageVisible && isDeviceActive.value) {
    if (videoRef.value && videoRef.value.paused) videoRef.value.play().catch(() => {})
    videoState.value = 'previewing'
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      try { mediaRecorder.resume(); audioState.value = 'recording'; startVolumeMeter() } catch {}
    }
  }
}

// ================================================================
//  第九层：对外发送方法（已接入 Socket.io）
// ================================================================

/**
 * 发送视频帧到后端情绪识别服务
 * 对应后端 socket_emotion.py 的 @sio.on("upload_frame")
 * 数据格式：{imgBase64: "data:image/jpeg;base64,xxx"}
 */
const sendFrame = (base64Frame: string) => {
  if (socket && socket.connected) {
    socket.emit('upload_frame', { imgBase64: base64Frame })
  }
}

// ================================================================
//  第十层：生命周期
// ================================================================

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // 提前建立 Socket 连接（未启动设备时也能显示连接状态）
  connectSocket()
})

onUnmounted(() => {
  stopAllDevices()
  disconnectSocket()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// ================================================================
//  工具：计算情绪分布的最大值（用于条宽百分比）
// ================================================================
const getMaxEmotionCount = (emotions: Record<string, number>) => {
  const values = Object.values(emotions)
  return Math.max(1, ...values)
}
</script>

<template>
  <div class="av-capture-container">
    <h2 class="title">🎥 实时情绪识别系统</h2>

    <!-- ========== Socket 连接状态条 ========== -->
    <div class="socket-status-bar" :class="socketStatus">
      <span class="socket-dot"></span>
      <span class="socket-text">
        {{ socketStatus === 'connected' ? '后端已连接' : socketStatus === 'connecting' ? '连接后端中...' : '后端未连接' }}
      </span>
      <span class="socket-url">{{ API_BASE_URL }}</span>
    </div>

    <!-- ========== 上方：视频预览窗口 ========== -->
    <div class="video-wrapper">
      <video ref="videoRef" class="video-player" autoplay playsinline muted></video>
      <canvas ref="canvasRef" class="hidden-canvas"></canvas>

      <div v-if="isLoading" class="loading-overlay">
        <div class="spinner"></div>
        <span class="loading-text">设备启动中...</span>
      </div>

      <div v-if="!isDeviceActive && !isLoading" class="placeholder">
        <span>点击下方「开启全部设备」启动实时情绪识别</span>
      </div>

      <!-- ========== 右上角情绪级别卡片（视频内浮动） ========== -->
      <div v-if="isDeviceActive && emotionResult" class="emotion-float-card" :class="emotionResult.level">
        <div class="emotion-level">{{ LEVEL_TEXT[emotionResult.level] || emotionResult.level }}</div>
        <div class="emotion-score">{{ emotionResult.score }} 分</div>
      </div>

      <!-- 告警浮标：低投入告警 -->
      <div v-if="emotionResult && emotionResult.alert" class="alert-float">
        ⚠ 低投入告警！
      </div>
    </div>

    <!-- ========== 设备状态面板 ========== -->
    <div class="status-panel">
      <div class="status-item">
        <span class="status-dot" :class="videoState"></span>
        <span class="status-label">视频</span>
        <span class="status-value">
          {{ videoState === 'idle' ? '空闲' : videoState === 'previewing' ? '预览中' : '已暂停' }}
        </span>
      </div>
      <div class="status-item">
        <span class="status-dot" :class="audioState"></span>
        <span class="status-label">录音</span>
        <span class="status-value">
          {{ audioState === 'idle' ? '空闲' : audioState === 'recording' ? '录制中' : '已暂停' }}
        </span>
      </div>
      <div class="status-item volume-item">
        <span class="status-label">音量</span>
        <canvas ref="volumeCanvasRef" class="volume-canvas" width="200" height="32"></canvas>
        <span class="volume-value">{{ volumeLevel }}%</span>
      </div>
      <div v-if="isUploadPaused" class="upload-paused-tag">🔇 静音·暂停上传</div>
    </div>

    <!-- ========== 情绪识别结果展示 ========== -->
    <div class="emotion-panel" :class="{ active: emotionResult }">
      <div class="emotion-header">
        <span class="emotion-title">📊 情绪识别结果</span>
        <span v-if="emotionResult" class="emotion-time">{{ emotionResult.timestamp }}</span>
      </div>

      <div v-if="!emotionResult" class="emotion-empty">
        <span>尚未收到识别结果，请先启动设备</span>
      </div>

      <div v-else class="emotion-body">
        <!-- 主指标：投入分数 + 级别 + 人脸数 + 耗时 -->
        <div class="emotion-metrics">
          <div class="metric-block score-block">
            <div class="metric-value" :class="emotionResult.level">{{ emotionResult.score }}</div>
            <div class="metric-label">投入分数</div>
            <div class="score-bar">
              <div class="score-bar-fill" :class="emotionResult.level"
                :style="{ width: emotionResult.score + '%' }"></div>
            </div>
          </div>

          <div class="metric-block">
            <div class="metric-label">投入级别</div>
            <div class="metric-level" :class="emotionResult.level">
              {{ LEVEL_TEXT[emotionResult.level] || emotionResult.level }}
            </div>
          </div>

          <div class="metric-block">
            <div class="metric-value">{{ emotionResult.students }}</div>
            <div class="metric-label">检测人脸数</div>
          </div>

          <div class="metric-block">
            <div class="metric-value small">{{ emotionResult.processing_time_ms }}ms</div>
            <div class="metric-label">推理耗时</div>
          </div>
        </div>

        <!-- 情绪分布条形图 -->
        <div class="emotion-distribution">
          <div class="dist-title">情绪分布</div>
          <div class="dist-list">
            <div
              v-for="(count, emo) in emotionResult.emotions"
              :key="emo"
              class="dist-item"
            >
              <span class="dist-label">{{ (EMOTION_TEXT as any)[emo] || emo }}</span>
              <div class="dist-bar-track">
                <div
                  class="dist-bar-fill"
                  :style="{
                    width: (count / getMaxEmotionCount(emotionResult.emotions) * 100) + '%',
                    backgroundColor: (EMOTION_COLOR as any)[emo] || '#409EFF'
                  }"
                ></div>
              </div>
              <span class="dist-count">{{ count }}</span>
            </div>
            <!-- 没有任何情绪时显示提示 -->
            <div v-if="Object.keys(emotionResult.emotions).length === 0" class="dist-empty">
              未检测到情绪特征
            </div>
          </div>
        </div>

        <!-- ===== 语音识别文本展示区（whisper-live） ===== -->
        <div class="asr-section">
          <div class="asr-title">🗣️ 语音识别</div>

          <!-- 实时片段文字（录音中增量更新） -->
          <div v-if="partialText" class="asr-partial">
            <span class="asr-label">实时片段</span>
            <span class="asr-text">{{ partialText }}</span>
            <span class="asr-cursor">▎</span>
          </div>

          <!-- 录音结束后完整识别文本 -->
          <div v-if="emotionResult?.final_text" class="asr-final">
            <span class="asr-label">完整识别</span>
            <span class="asr-text">{{ emotionResult.final_text }}</span>
          </div>

          <!-- 文本情绪（后端融合后推送） -->
          <div v-if="emotionResult?.text_emotion" class="asr-text-emotion">
            <span class="asr-label">文本情绪</span>
            <span class="asr-emotion-tag">{{ emotionResult.text_emotion }}</span>
            <span v-if="emotionResult.text_emotion_score" class="asr-score">
              {{ Math.round(emotionResult.text_emotion_score * 100) }}%
            </span>
          </div>

          <!-- 空状态提示 -->
          <div
            v-if="!partialText && !emotionResult?.final_text"
            class="asr-empty"
          >
            录音中实时识别文字将显示在此处
          </div>
        </div>
      </div>
    </div>

    <!-- ========== 多模态融合分析结果面板（文本+语调+面部+融合） ========== -->
    <div
      class="multimodal-audio-panel"
      :class="{
        active: audioAnalysisState === 'ready' || audioAnalysisState === 'analyzing' || audioAnalysisState === 'uploading'
      }"
    >
      <div class="mm-header">
        <span class="mm-title">🎙️ 多模态融合分析（文本 + 语调 + 面部）</span>
        <span class="mm-status" :class="audioAnalysisState">
          {{
            audioAnalysisState === 'uploading' ? '上传中'
            : audioAnalysisState === 'analyzing' ? '多模态分析中...'
            : audioAnalysisState === 'ready' ? '已完成'
            : audioAnalysisState === 'error' ? '失败'
            : '等待开始录音'
          }}
        </span>
        <span v-if="audioAnalysisHint" class="mm-hint">{{ audioAnalysisHint }}</span>
      </div>

      <!-- 空状态 -->
      <div v-if="audioAnalysisState === 'idle' && !audioAnalysisResult" class="mm-empty">
        <span>点击下方「开始录音」→「结束录音」，即可得到文本+语调+面部+融合的多模态情感分析结果</span>
      </div>

      <!-- 加载动画：上传/分析中 -->
      <div v-if="audioAnalysisState === 'uploading' || audioAnalysisState === 'analyzing'" class="mm-loading">
        <div class="mm-spinner"></div>
        <span>{{ audioAnalysisHint || '处理中，请稍候...' }}</span>
      </div>

      <!-- 结果展示 -->
      <div v-if="audioAnalysisResult" class="mm-body">

        <!-- ===== 0. 融合结果主卡片（置顶突出展示） ===== -->
        <div class="mm-section fusion-hero" v-if="audioAnalysisResult.fusion">
          <div class="fusion-hero-card" :style="{ borderColor: UNIFIED_EMOTION_COLOR[audioAnalysisResult.fusion.final_emotion] || '#409EFF' }">
            <div class="fusion-emoji">
              {{ UNIFIED_EMOTION_EMOJI[audioAnalysisResult.fusion.final_emotion] || '🎭' }}
            </div>
            <div class="fusion-main">
              <div class="fusion-label">最终融合情绪</div>
              <div class="fusion-emotion" :style="{ color: UNIFIED_EMOTION_COLOR[audioAnalysisResult.fusion.final_emotion] || '#303133' }">
                {{ audioAnalysisResult.fusion.final_emotion_cn || audioAnalysisResult.fusion.final_emotion }}
                <span class="fusion-en">({{ audioAnalysisResult.fusion.final_emotion }})</span>
              </div>
              <div class="fusion-conf-bar">
                <div class="fusion-conf-track">
                  <div
                    class="fusion-conf-fill"
                    :style="{
                      width: (audioAnalysisResult.fusion.overall_confidence * 100).toFixed(0) + '%',
                      backgroundColor: UNIFIED_EMOTION_COLOR[audioAnalysisResult.fusion.final_emotion] || '#409EFF'
                    }"
                  ></div>
                </div>
                <span class="fusion-conf-val">
                  整体置信度 {{ (audioAnalysisResult.fusion.overall_confidence * 100).toFixed(1) }}%
                </span>
              </div>
              <div class="fusion-weights">
                <span class="fw-chip">文本 {{ (audioAnalysisResult.fusion.weights_used.text * 100).toFixed(0) }}%</span>
                <span class="fw-chip">语调 {{ (audioAnalysisResult.fusion.weights_used.voice * 100).toFixed(0) }}%</span>
                <span class="fw-chip">面部 {{ (audioAnalysisResult.fusion.weights_used.facial * 100).toFixed(0) }}%</span>
                <span v-if="audioAnalysisResult.timing?.total_seconds" class="fw-chip">
                  耗时 {{ audioAnalysisResult.timing.total_seconds.toFixed(1) }}s
                </span>
              </div>
              <div v-if="audioAnalysisResult.fusion.weight_adjustments && audioAnalysisResult.fusion.weight_adjustments.length > 0" class="fusion-adjustments">
                <span class="fa-label">权重调整：</span>
                <span v-for="(adj, i) in audioAnalysisResult.fusion.weight_adjustments" :key="i" class="fa-tag">{{ adj }}</span>
              </div>
            </div>
          </div>
          <!-- 融合概率分布条 -->
          <div class="mm-dist" v-if="audioAnalysisResult.fusion.probabilities">
            <div class="dist-title-sm">融合后 7 类情绪概率分布</div>
            <div class="dist-list-sm">
              <div
                v-for="(prob, emo) in audioAnalysisResult.fusion.probabilities"
                :key="String(emo)"
                class="dist-item-sm"
              >
                <span class="dist-label-sm">{{ UNIFIED_EMOTION_CN[String(emo)] || String(emo) }}</span>
                <div class="dist-bar-track-sm">
                  <div
                    class="dist-bar-fill-sm"
                    :style="{
                      width: (Number(prob) / getMaxProb(audioAnalysisResult.fusion.probabilities) * 100).toFixed(0) + '%',
                      backgroundColor: UNIFIED_EMOTION_COLOR[String(emo)] || '#409EFF'
                    }"
                  ></div>
                </div>
                <span class="dist-count-sm">{{ (Number(prob) * 100).toFixed(1) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== 1. 语音转文字（SenseVoice ASR） ===== -->
        <div class="mm-section">
          <div class="mm-section-title">📝 语音转文字 (SenseVoice ASR)</div>
          <div v-if="audioAnalysisResult.errors?.asr_error" class="mm-error-box">
            ⚠ ASR 失败：{{ audioAnalysisResult.errors.asr_error }}
          </div>
          <template v-else-if="audioAnalysisResult.transcription">
            <div class="mm-trans-text">
              {{ audioAnalysisResult.transcription.text || '（未识别出有效语音内容）' }}
            </div>
            <div class="mm-meta-row">
              <span class="mm-meta-chip lang">
                语种：{{ audioAnalysisResult.transcription.language || 'zh' }}
              </span>
              <span v-if="audioAnalysisResult.transcription.duration_seconds" class="mm-meta-chip">
                音频时长：{{ audioAnalysisResult.transcription.duration_seconds.toFixed(1) }}s
              </span>
              <span v-if="audioAnalysisResult.timing?.asr_seconds" class="mm-meta-chip">
                ASR 耗时：{{ audioAnalysisResult.timing.asr_seconds.toFixed(1) }}s
              </span>
            </div>
          </template>
        </div>

        <!-- ===== 2. 文本情感（零样本 mDeBERTa-v3） ===== -->
        <div class="mm-section" v-if="audioAnalysisResult.text_emotion">
          <div class="mm-section-title">📖 文本情感 (mDeBERTa-v3 zero-shot)</div>
          <div v-if="audioAnalysisResult.errors?.text_emotion_error" class="mm-error-box">
            ⚠ 文本情感失败：{{ audioAnalysisResult.errors.text_emotion_error }}
          </div>
          <template v-else>
            <div class="emotion-summary-card" :style="{ borderColor: UNIFIED_EMOTION_COLOR[audioAnalysisResult.text_emotion.emotion] || '#409EFF' }">
              <span class="es-emoji">{{ UNIFIED_EMOTION_EMOJI[audioAnalysisResult.text_emotion.emotion] || '📖' }}</span>
              <span class="es-label">文本情感：</span>
              <b class="es-emotion" :style="{ color: UNIFIED_EMOTION_COLOR[audioAnalysisResult.text_emotion.emotion] || '#303133' }">
                {{ audioAnalysisResult.text_emotion.emotion_cn || audioAnalysisResult.text_emotion.emotion }}
              </b>
              <span class="es-conf">{{ (audioAnalysisResult.text_emotion.confidence * 100).toFixed(1) }}%</span>
              <span v-if="audioAnalysisResult.text_emotion.method" class="mm-meta-chip es-method">
                {{ audioAnalysisResult.text_emotion.method }}
              </span>
            </div>
            <div class="mm-dist" v-if="audioAnalysisResult.text_emotion.probabilities">
              <div class="dist-title-sm">文本情感概率分布</div>
              <div class="dist-list-sm">
                <div
                  v-for="(prob, emo) in audioAnalysisResult.text_emotion.probabilities"
                  :key="String(emo)"
                  class="dist-item-sm"
                >
                  <span class="dist-label-sm">{{ UNIFIED_EMOTION_CN[String(emo)] || String(emo) }}</span>
                  <div class="dist-bar-track-sm">
                    <div
                      class="dist-bar-fill-sm"
                      :style="{
                        width: (Number(prob) / getMaxProb(audioAnalysisResult.text_emotion.probabilities) * 100).toFixed(0) + '%',
                        backgroundColor: UNIFIED_EMOTION_COLOR[String(emo)] || '#409EFF'
                      }"
                    ></div>
                  </div>
                  <span class="dist-count-sm">{{ (Number(prob) * 100).toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- ===== 3. 语调情感（emotion2vec+ / OpenSMILE 后备） ===== -->
        <div class="mm-section" v-if="audioAnalysisResult.voice_emotion">
          <div class="mm-section-title">🎵 语调情感 (emotion2vec+ / OpenSMILE 后备)</div>
          <div v-if="audioAnalysisResult.errors?.voice_emotion_error" class="mm-error-box">
            ⚠ 语调情感失败：{{ audioAnalysisResult.errors.voice_emotion_error }}
          </div>
          <template v-else>
            <div class="emotion-summary-card" :style="{ borderColor: UNIFIED_EMOTION_COLOR[audioAnalysisResult.voice_emotion.emotion] || '#409EFF' }">
              <span class="es-emoji">{{ UNIFIED_EMOTION_EMOJI[audioAnalysisResult.voice_emotion.emotion] || '🎵' }}</span>
              <span class="es-label">语调情感：</span>
              <b class="es-emotion" :style="{ color: UNIFIED_EMOTION_COLOR[audioAnalysisResult.voice_emotion.emotion] || '#303133' }">
                {{ audioAnalysisResult.voice_emotion.emotion_cn || audioAnalysisResult.voice_emotion.emotion }}
              </b>
              <span class="es-conf">{{ (audioAnalysisResult.voice_emotion.confidence * 100).toFixed(1) }}%</span>
              <span v-if="audioAnalysisResult.voice_emotion.method" class="mm-meta-chip es-method">
                {{ audioAnalysisResult.voice_emotion.method }}
              </span>
              <!-- SenseVoice emo 交叉验证 -->
              <span
                v-if="audioAnalysisResult.voice_emotion.sv_cross_check"
                class="mm-meta-chip"
                :class="audioAnalysisResult.voice_emotion.sv_cross_check.agree ? 'sv-agree' : 'sv-disagree'"
              >
                SV交叉验证：{{ UNIFIED_EMOTION_CN[audioAnalysisResult.voice_emotion.sv_cross_check.emotion] || audioAnalysisResult.voice_emotion.sv_cross_check.emotion }}
                {{ audioAnalysisResult.voice_emotion.sv_cross_check.agree ? '✓一致' : '✗不一致' }}
              </span>
              <span v-if="audioAnalysisResult.timing?.voice_emotion_seconds" class="mm-meta-chip">
                耗时 {{ audioAnalysisResult.timing.voice_emotion_seconds.toFixed(1) }}s
              </span>
            </div>
            <div class="mm-dist" v-if="audioAnalysisResult.voice_emotion.probabilities">
              <div class="dist-title-sm">语调情感概率分布</div>
              <div class="dist-list-sm">
                <div
                  v-for="(prob, emo) in audioAnalysisResult.voice_emotion.probabilities"
                  :key="String(emo)"
                  class="dist-item-sm"
                >
                  <span class="dist-label-sm">{{ UNIFIED_EMOTION_CN[String(emo)] || String(emo) }}</span>
                  <div class="dist-bar-track-sm">
                    <div
                      class="dist-bar-fill-sm"
                      :style="{
                        width: (Number(prob) / getMaxProb(audioAnalysisResult.voice_emotion.probabilities) * 100).toFixed(0) + '%',
                        backgroundColor: UNIFIED_EMOTION_COLOR[String(emo)] || '#409EFF'
                      }"
                    ></div>
                  </div>
                  <span class="dist-count-sm">{{ (Number(prob) * 100).toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- ===== 4. 面部情感（录音时段时序聚合） ===== -->
        <div class="mm-section" v-if="audioAnalysisResult.facial_emotion">
          <div class="mm-section-title">😀 面部情感 (录音时段时序聚合)</div>
          <template v-if="audioAnalysisResult.facial_emotion.frame_count > 0">
            <div class="emotion-summary-card" :style="{ borderColor: UNIFIED_EMOTION_COLOR[audioAnalysisResult.facial_emotion.dominant_emotion] || '#409EFF' }">
              <span class="es-emoji">{{ UNIFIED_EMOTION_EMOJI[audioAnalysisResult.facial_emotion.dominant_emotion] || '😀' }}</span>
              <span class="es-label">主要面部情绪：</span>
              <b class="es-emotion" :style="{ color: UNIFIED_EMOTION_COLOR[audioAnalysisResult.facial_emotion.dominant_emotion] || '#303133' }">
                {{ audioAnalysisResult.facial_emotion.dominant_emotion_cn || audioAnalysisResult.facial_emotion.dominant_emotion }}
              </b>
              <span class="es-conf">{{ (audioAnalysisResult.facial_emotion.confidence * 100).toFixed(1) }}%</span>
              <span class="mm-meta-chip">帧数：{{ audioAnalysisResult.facial_emotion.frame_count }}</span>
              <span class="mm-meta-chip">稳定性：{{ (audioAnalysisResult.facial_emotion.stability * 100).toFixed(0) }}%</span>
              <span class="mm-meta-chip">趋势：{{ TREND_CN[audioAnalysisResult.facial_emotion.trend] || audioAnalysisResult.facial_emotion.trend }}</span>
              <span v-if="audioAnalysisResult.facial_emotion.time_window?.duration_seconds" class="mm-meta-chip">
                窗口：{{ audioAnalysisResult.facial_emotion.time_window.duration_seconds.toFixed(1) }}s
              </span>
            </div>

            <!-- 面部时序关键点（下采样后的 sequence_summary） -->
            <div class="facial-sequence" v-if="audioAnalysisResult.facial_emotion.sequence_summary && audioAnalysisResult.facial_emotion.sequence_summary.length > 0">
              <div class="dist-title-sm">面部情绪时序变化（关键点）</div>
              <div class="fs-timeline">
                <div
                  v-for="(point, i) in audioAnalysisResult.facial_emotion.sequence_summary"
                  :key="i"
                  class="fs-point"
                  :title="`t=${point.t}s · ${UNIFIED_EMOTION_CN[point.emotion] || point.emotion} · ${(point.confidence * 100).toFixed(0)}%`"
                >
                  <div class="fs-dot" :style="{ backgroundColor: UNIFIED_EMOTION_COLOR[point.emotion] || '#909399' }"></div>
                  <div class="fs-label">{{ point.t.toFixed(1) }}s</div>
                  <div class="fs-emoji">{{ UNIFIED_EMOTION_EMOJI[point.emotion] || '😐' }}</div>
                </div>
              </div>
            </div>

            <!-- 面部情绪分布 -->
            <div class="mm-dist" v-if="audioAnalysisResult.facial_emotion.emotion_distribution">
              <div class="dist-title-sm">面部情绪分布（时段内平均概率）</div>
              <div class="dist-list-sm">
                <div
                  v-for="(prob, emo) in audioAnalysisResult.facial_emotion.emotion_distribution"
                  :key="String(emo)"
                  class="dist-item-sm"
                >
                  <span class="dist-label-sm">{{ UNIFIED_EMOTION_CN[String(emo)] || String(emo) }}</span>
                  <div class="dist-bar-track-sm">
                    <div
                      class="dist-bar-fill-sm"
                      :style="{
                        width: (Number(prob) / getMaxProb(audioAnalysisResult.facial_emotion.emotion_distribution) * 100).toFixed(0) + '%',
                        backgroundColor: UNIFIED_EMOTION_COLOR[String(emo)] || '#409EFF'
                      }"
                    ></div>
                  </div>
                  <span class="dist-count-sm">{{ (Number(prob) * 100).toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="mm-warn-box">
            ⚠ 录音时段内未捕获到面部帧（可能 Socket 未连接或视频未启动），面部融合权重已自动归零。
          </div>
        </div>

        <!-- ===== 全局状态：部分成功/失败 ===== -->
        <div v-if="audioAnalysisResult.status === 'partial_success'" class="mm-warn-box">
          ⚠ 本次分析为「部分成功」：某路分析失败，具体错误见上方对应区块。
        </div>
        <div v-if="audioAnalysisResult.status === 'failed'" class="mm-error-box big">
          ❌ 分析全部失败：ASR、语调、文本均未成功，请检查后端配置（Python 解释器、依赖、模型权重）。
        </div>
      </div>
    </div>

    <!-- ========== AI 心理教练对话（DeepSeek，携带识别上下文） ========== -->
    <AiCoachPanel
      :analysis-result="audioAnalysisResult"
      :live-emotion="emotionResult"
    />

    <!-- ========== 控制区 ========== -->
    <div class="control-area">
      <div class="main-controls">
        <button
          class="btn btn-primary"
          :disabled="isDeviceActive || isLoading"
          @click="startAllDevices"
        >
          {{ isLoading ? '启动中...' : '▶ 开启全部设备' }}
        </button>
        <button
          class="btn btn-danger"
          :disabled="!isDeviceActive"
          @click="stopAllDevices"
        >
          ⏹ 关闭全部设备
        </button>
      </div>

      <!-- ===== 新增：多模态流程独立控制 —— 开始录音 / 结束录音 ===== -->
      <div class="audio-controls">
        <button
          class="btn btn-success"
          :disabled="!isDeviceActive || audioState === 'recording' || audioAnalysisState === 'uploading' || audioAnalysisState === 'analyzing'"
          @click="() => { if (isDeviceActive && audioState !== 'recording') startAudioRecording() }"
        >
          🎤 {{ audioAnalysisState === 'uploading' || audioAnalysisState === 'analyzing' ? '分析中...' : '开始录音' }}
        </button>
        <button
          class="btn btn-stop"
          :disabled="!isDeviceActive || audioState !== 'recording'"
          @click="stopAudioRecording"
        >
          ⏹️ 结束录音 & 分析
        </button>
        <button
          class="btn btn-outline"
          :disabled="audioAnalysisState === 'uploading' || audioAnalysisState === 'analyzing'"
          @click="clearAudioAnalysisResult"
        >
          🗑 清空多模态结果
        </button>
      </div>

      <div class="sub-controls" v-if="isDeviceActive">
        <button
          class="btn btn-small"
          :class="isFrameCapturing ? 'btn-active' : 'btn-inactive'"
          @click="toggleFrameCapture"
        >
          {{ isFrameCapturing ? '⏸ 暂停抽帧' : '▶ 启动抽帧' }}
        </button>
        <button
          class="btn btn-small"
          :class="audioState === 'recording' ? 'btn-active' : 'btn-inactive'"
          @click="toggleAudioRecording"
        >
          {{ audioState === 'recording' ? '⏸ 暂停录音' : '▶ 启动录音' }}
        </button>
        <label class="quality-control">
          <span>帧质量 {{ Math.round(frameQuality * 100) }}%</span>
          <input type="range" min="0.1" max="1.0" step="0.05"
            v-model="frameQuality" class="quality-slider" />
        </label>
      </div>

      <div class="chunk-info" v-if="audioChunks.length > 0">
        已录制 {{ audioChunks.length }} 段音频分片
      </div>

      <p v-if="errorMsg" class="error-message">{{ errorMsg }}</p>
      <p v-if="emotionError" class="error-message">⚠ 识别错误：{{ emotionError }}</p>
    </div>
  </div>
</template>

<style scoped>
.av-capture-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 16px 48px;
  max-width: 820px;
  margin: 0 auto;
}

.title {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  margin: 0;
}

/* ===== Socket 连接状态 ===== */
.socket-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
}
.socket-status-bar.connected { background: #f0f9eb; border-color: #c2e7b0; }
.socket-status-bar.connecting { background: #fdf6ec; border-color: #faecd8; }
.socket-status-bar.disconnected { background: #fef0f0; border-color: #fbc4c4; }

.socket-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #c0c4cc;
}
.socket-status-bar.connected .socket-dot {
  background: #67C23A;
  box-shadow: 0 0 6px rgba(103, 194, 58, 0.5);
}
.socket-status-bar.connecting .socket-dot {
  background: #E6A23C;
  animation: pulse 1s ease-in-out infinite;
}
.socket-status-bar.disconnected .socket-dot {
  background: #F56C6C;
}
.socket-text { font-weight: 600; color: #606266; }
.socket-url { color: #909399; font-family: monospace; }

/* ===== 视频预览窗口 ===== */
.video-wrapper {
  position: relative;
  width: 720px;
  height: 405px;
  background-color: #000;
  border: 3px solid #409EFF;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}
.video-player {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background-color: #000;
  transform: scaleX(-1);
}
.hidden-canvas {
  position: absolute;
  left: -9999px; top: -9999px;
  width: 320px;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 16px;
  z-index: 10;
}
.spinner {
  width: 44px; height: 44px;
  border: 4px solid rgba(64, 158, 255, 0.2);
  border-top-color: #409EFF;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
.loading-text { color: #fff; font-size: 14px; font-weight: 500; }
.placeholder {
  position: absolute; inset: 0;
  display: flex; justify-content: center; align-items: center;
  color: #909399; font-size: 14px;
}

/* ===== 视频内浮动情绪卡片 ===== */
.emotion-float-card {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 10px 18px;
  border-radius: 10px;
  backdrop-filter: blur(8px);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  text-align: right;
  z-index: 5;
  border: 1px solid rgba(255,255,255,0.15);
}
.emotion-float-card.ENGAGED { background: rgba(103, 194, 58, 0.85); }
.emotion-float-card.NEUTRAL { background: rgba(230, 162, 60, 0.85); }
.emotion-float-card.BORING  { background: rgba(245, 108, 108, 0.85); }
.emotion-level { font-size: 20px; font-weight: 800; line-height: 1.2; }
.emotion-score { font-size: 14px; font-weight: 600; opacity: 0.95; margin-top: 2px; }

.alert-float {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(245, 108, 108, 0.95);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  z-index: 5;
  animation: pulse 1.2s ease-in-out infinite;
}

/* ===== 设备状态面板 ===== */
.status-panel {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 24px;
  background-color: #fff;
  border-radius: 10px;
  border: 1px solid #e4e7ed;
  flex-wrap: wrap;
  justify-content: center;
  width: 720px;
  box-sizing: border-box;
}
.status-item { display: flex; align-items: center; gap: 8px; }
.status-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background-color: #c0c4cc;
  transition: all 0.3s;
}
.status-dot.previewing, .status-dot.recording {
  background-color: #F56C6C;
  box-shadow: 0 0 8px rgba(245, 108, 108, 0.5);
  animation: pulse 1.2s ease-in-out infinite;
}
.status-dot.paused { background-color: #E6A23C; }
.status-label { font-size: 13px; font-weight: 500; color: #909399; }
.status-value { font-size: 13px; font-weight: 600; color: #606266; min-width: 48px; }
.volume-item { gap: 6px; }
.volume-canvas { display: block; }
.volume-value {
  font-size: 12px; font-weight: 600; color: #409EFF;
  min-width: 32px; text-align: right;
}
.upload-paused-tag {
  font-size: 12px; font-weight: 600;
  color: #E6A23C; background-color: #fdf6ec;
  padding: 2px 10px; border-radius: 10px;
}

/* ===== 情绪识别面板 ===== */
.emotion-panel {
  width: 720px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
  overflow: hidden;
  opacity: 0.6;
  transition: all 0.3s;
  box-sizing: border-box;
}
.emotion-panel.active {
  opacity: 1;
  border-color: #409EFF;
  box-shadow: 0 8px 24px rgba(64, 158, 255, 0.12);
}
.emotion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: linear-gradient(90deg, #ecf5ff 0%, #fff 100%);
  border-bottom: 1px solid #ebeef5;
}
.emotion-title { font-size: 16px; font-weight: 700; color: #303133; }
.emotion-time { font-size: 12px; color: #909399; font-family: monospace; }

.emotion-empty {
  padding: 32px;
  text-align: center;
  color: #c0c4cc;
  font-size: 13px;
}

.emotion-body { padding: 20px; }

/* 主指标 */
.emotion-metrics {
  display: grid;
  grid-template-columns: 2fr 1.2fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}
.metric-block {
  background: #f5f7fa;
  border-radius: 10px;
  padding: 14px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
.metric-label {
  font-size: 12px; color: #909399;
  font-weight: 500; margin-bottom: 4px;
}
.metric-value {
  font-size: 34px; font-weight: 800; color: #303133;
  line-height: 1.1;
}
.metric-value.small { font-size: 20px; font-weight: 700; color: #909399; }
.metric-value.ENGAGED { color: #67C23A; }
.metric-value.NEUTRAL { color: #E6A23C; }
.metric-value.BORING  { color: #F56C6C; }

.metric-level {
  font-size: 22px; font-weight: 800; padding: 2px 14px;
  border-radius: 6px;
}
.metric-level.ENGAGED { background: #f0f9eb; color: #67C23A; }
.metric-level.NEUTRAL { background: #fdf6ec; color: #E6A23C; }
.metric-level.BORING  { background: #fef0f0; color: #F56C6C; }

.score-block { text-align: left; align-items: stretch; }
.score-block .metric-value { margin-bottom: 4px; }
.score-bar {
  width: 100%; height: 8px;
  background: #e4e7ed; border-radius: 4px; overflow: hidden;
}
.score-bar-fill {
  height: 100%;
  transition: width 0.4s ease, background-color 0.3s;
  border-radius: 4px;
}
.score-bar-fill.ENGAGED { background: linear-gradient(90deg, #67C23A, #85ce61); }
.score-bar-fill.NEUTRAL { background: linear-gradient(90deg, #E6A23C, #f0c78a); }
.score-bar-fill.BORING  { background: linear-gradient(90deg, #F56C6C, #f78989); }

/* 情绪分布条 */
.emotion-distribution {
  border-top: 1px dashed #ebeef5;
  padding-top: 16px;
}
.dist-title {
  font-size: 13px; font-weight: 700; color: #606266;
  margin-bottom: 10px;
}
.dist-list { display: flex; flex-direction: column; gap: 6px; }
.dist-item {
  display: grid;
  grid-template-columns: 56px 1fr 32px;
  gap: 10px;
  align-items: center;
}
.dist-label {
  font-size: 12px; font-weight: 600; color: #606266;
  text-align: right;
}
.dist-bar-track {
  height: 18px;
  background: #f0f2f5;
  border-radius: 9px;
  overflow: hidden;
}
.dist-bar-fill {
  height: 100%;
  border-radius: 9px;
  transition: width 0.5s cubic-bezier(.4,0,.2,1);
  min-width: 4px;
}
.dist-count {
  font-size: 12px; font-weight: 700; color: #909399;
  text-align: right;
  font-family: monospace;
}
.dist-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
}

/* ===== 语音识别文本展示区 ===== */
.asr-section {
  border-top: 1px dashed #ebeef5;
  padding-top: 16px;
  margin-top: 4px;
}
.asr-title {
  font-size: 13px;
  font-weight: 700;
  color: #606266;
  margin-bottom: 10px;
}
.asr-partial,
.asr-final,
.asr-text-emotion {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
}
.asr-partial {
  background: #ecf5ff;
  border: 1px solid #d9ecff;
}
.asr-final {
  background: #f0f9eb;
  border: 1px solid #c2e7b0;
}
.asr-text-emotion {
  background: #fdf6ec;
  border: 1px solid #faecd8;
  align-items: center;
}
.asr-label {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  white-space: nowrap;
  flex-shrink: 0;
  padding-top: 2px;
}
.asr-text {
  color: #303133;
  flex: 1;
  word-break: break-all;
}
.asr-cursor {
  color: #409EFF;
  animation: blink 1s step-end infinite;
  font-weight: 700;
}
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
.asr-emotion-tag {
  display: inline-block;
  padding: 2px 12px;
  border-radius: 10px;
  background: #E6A23C;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.asr-score {
  font-size: 12px;
  font-weight: 600;
  color: #E6A23C;
  font-family: monospace;
}
.asr-empty {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
}

/* ===== 控制区 ===== */
.control-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 720px;
}
.main-controls { display: flex; gap: 16px; }
.sub-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background-color: #ecf5ff;
  border-radius: 8px;
  border: 1px solid #d9ecff;
}
.quality-control {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #606266; font-weight: 500;
}
.quality-slider { width: 120px; cursor: pointer; accent-color: #409EFF; }
.chunk-info { font-size: 12px; color: #909399; }

.btn {
  padding: 10px 28px;
  font-size: 15px; font-weight: 600;
  border: none; border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 140px;
}
.btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #409EFF; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #66b1ff; }
.btn-danger { background: #F56C6C; color: #fff; }
.btn-danger:hover:not(:disabled) { background: #f78989; }
.btn-small {
  padding: 6px 16px; font-size: 13px;
  min-width: auto; border-radius: 5px;
}
.btn-active { background: #E6A23C; color: #fff; }
.btn-active:hover:not(:disabled) { background: #ebb563; }
.btn-inactive {
  background: #fff; color: #409EFF;
  border: 1px solid #409EFF;
}
.btn-inactive:hover:not(:disabled) { background: #ecf5ff; }

.error-message {
  color: #F56C6C; font-size: 14px; font-weight: 500;
  margin: 0; padding: 8px 16px;
  background-color: #fef0f0;
  border-radius: 4px;
  max-width: 720px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
}

/* ================================================================
   新增：多模态音频分析面板样式
   ================================================================ */

.multimodal-audio-panel {
  width: 720px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
  overflow: hidden;
  opacity: 0.6;
  transition: all 0.3s;
  box-sizing: border-box;
}
.multimodal-audio-panel.active {
  opacity: 1;
  border-color: #67C23A;
  box-shadow: 0 8px 24px rgba(103, 194, 58, 0.15);
}
.mm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: linear-gradient(90deg, #f0f9eb 0%, #fff 100%);
  border-bottom: 1px solid #ebeef5;
  flex-wrap: wrap;
  gap: 8px;
}
.mm-title { font-size: 16px; font-weight: 700; color: #303133; }
.mm-status {
  font-size: 12px; font-weight: 600; padding: 2px 12px;
  border-radius: 12px;
  background: #f5f7fa; color: #909399;
}
.mm-status.uploading { background: #ecf5ff; color: #409EFF; animation: pulse 1.2s infinite; }
.mm-status.analyzing { background: #fdf6ec; color: #E6A23C; animation: pulse 1.2s infinite; }
.mm-status.ready     { background: #f0f9eb; color: #67C23A; }
.mm-status.error     { background: #fef0f0; color: #F56C6C; }
.mm-hint { font-size: 12px; color: #909399; font-weight: 500; }

.mm-empty, .mm-loading {
  padding: 36px 24px;
  text-align: center;
  color: #909399;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.mm-spinner {
  width: 32px; height: 32px;
  border: 3px solid rgba(64,158,255,0.15);
  border-top-color: #409EFF;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.mm-body { padding: 20px; display: flex; flex-direction: column; gap: 20px; }
.mm-section { display: flex; flex-direction: column; gap: 10px; }
.mm-section-title {
  font-size: 14px; font-weight: 700; color: #303133;
  padding-bottom: 6px;
  border-bottom: 1px dashed #ebeef5;
}
.mm-trans-text {
  font-size: 15px; line-height: 1.7;
  color: #303133;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 8px;
  border-left: 3px solid #409EFF;
  white-space: pre-wrap;
  word-break: break-word;
}
.mm-meta-row {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.mm-meta-chip {
  font-size: 12px; font-weight: 500;
  color: #606266; background: #f5f7fa;
  padding: 2px 10px; border-radius: 10px;
  border: 1px solid #ebeef5;
}
.mm-meta-chip.lang { background: #ecf5ff; color: #409EFF; border-color: #d9ecff; }

.mm-error-box {
  padding: 10px 14px;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 8px;
  color: #F56C6C;
  font-size: 13px;
  font-weight: 500;
  word-break: break-word;
}
.mm-error-box.big { padding: 14px 18px; font-size: 14px; }
.mm-warn-box {
  padding: 10px 14px;
  background: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 8px;
  color: #E6A23C;
  font-size: 13px;
  font-weight: 500;
}

/* ================================================================
   融合结果主卡片（置顶突出展示）
   ================================================================ */
.fusion-hero { gap: 14px; }
.fusion-hero-card {
  display: flex;
  gap: 18px;
  padding: 18px 22px;
  background: linear-gradient(135deg, #f4f8ff 0%, #fff 100%);
  border: 2px solid #409EFF;
  border-radius: 12px;
  align-items: center;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.12);
}
.fusion-emoji {
  font-size: 56px; line-height: 1;
  flex-shrink: 0;
}
.fusion-main { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.fusion-label {
  font-size: 12px; color: #909399; font-weight: 600;
  letter-spacing: 1px;
}
.fusion-emotion {
  font-size: 26px; font-weight: 800;
  line-height: 1.2;
}
.fusion-en {
  font-size: 13px; font-weight: 500; color: #909399;
  margin-left: 6px;
}
.fusion-conf-bar {
  display: flex; align-items: center; gap: 10px;
  margin-top: 4px;
}
.fusion-conf-track {
  flex: 1; height: 10px;
  background: #f0f2f5; border-radius: 5px; overflow: hidden;
  max-width: 320px;
}
.fusion-conf-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.6s cubic-bezier(.4,0,.2,1);
}
.fusion-conf-val {
  font-size: 12px; font-weight: 700; color: #606266;
  white-space: nowrap;
}
.fusion-weights {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;
}
.fw-chip {
  font-size: 11px; font-weight: 600;
  color: #606266; background: #fff;
  padding: 2px 10px; border-radius: 10px;
  border: 1px solid #e4e7ed;
}
.fusion-adjustments {
  display: flex; flex-wrap: wrap; gap: 4px;
  margin-top: 6px;
  font-size: 11px;
}
.fa-label { color: #909399; font-weight: 600; }
.fa-tag {
  color: #E6A23C; background: #fdf6ec;
  padding: 1px 8px; border-radius: 8px;
  border: 1px solid #faecd8;
}

/* ================================================================
   情感摘要卡片（文本/语调/面部通用）
   ================================================================ */
.emotion-summary-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fafbfc;
  border: 1px solid #e4e7ed;
  border-left: 4px solid #409EFF;
  border-radius: 8px;
  flex-wrap: wrap;
}
.es-emoji {
  font-size: 28px; line-height: 1;
  flex-shrink: 0;
}
.es-label {
  font-size: 13px; color: #909399; font-weight: 500;
}
.es-emotion {
  font-size: 18px; font-weight: 700;
}
.es-conf {
  font-size: 13px; font-weight: 700; color: #409EFF;
  font-family: monospace;
  padding: 2px 8px; background: #ecf5ff; border-radius: 8px;
}
.es-method {
  background: #f5f7fa !important; color: #909399 !important;
  border-color: #ebeef5 !important;
  font-size: 11px !important;
}
/* SenseVoice 交叉验证标签 */
.sv-agree {
  background: #f0f9eb !important; color: #67C23A !important;
  border-color: #c2e7b0 !important;
}
.sv-disagree {
  background: #fef0f0 !important; color: #F56C6C !important;
  border-color: #fbc4c4 !important;
}

/* ================================================================
   面部时序时间线
   ================================================================ */
.facial-sequence { padding-top: 4px; }
.fs-timeline {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 8px;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  overflow-x: auto;
}
.fs-point {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 44px;
  flex-shrink: 0;
}
.fs-dot {
  width: 12px; height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(0,0,0,0.15);
}
.fs-label {
  font-size: 10px; color: #909399;
  font-family: monospace;
}
.fs-emoji {
  font-size: 18px;
}

/* 语音情感主卡片 */
.voice-emotion-card {
  display: flex;
  gap: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #fff7e6 0%, #f0f9eb 100%);
  border: 1px solid #e1f3d8;
  border-radius: 10px;
  align-items: center;
}
.ve-emoji {
  font-size: 44px; line-height: 1;
  flex-shrink: 0;
}
.ve-main { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ve-primary { font-size: 16px; color: #303133; font-weight: 500; }
.ve-primary b { color: #67C23A; font-size: 18px; }
.ve-en { color: #909399; font-size: 12px; font-weight: 400; margin-left: 4px; }
.ve-desc { font-size: 13px; color: #606266; line-height: 1.5; }
.ve-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }

/* 分布条（小） */
.mm-dist { padding-top: 4px; }
.dist-title-sm {
  font-size: 13px; font-weight: 600; color: #606266;
  margin-bottom: 8px;
}
.dist-list-sm { display: flex; flex-direction: column; gap: 5px; }
.dist-item-sm {
  display: grid;
  grid-template-columns: 64px 1fr 48px;
  gap: 10px;
  align-items: center;
}
.dist-label-sm { font-size: 12px; font-weight: 600; color: #606266; text-align: right; }
.dist-bar-track-sm {
  height: 14px;
  background: #f0f2f5;
  border-radius: 7px;
  overflow: hidden;
}
.dist-bar-fill-sm {
  height: 100%;
  background: linear-gradient(90deg, #67C23A, #E6A23C, #F56C6C);
  border-radius: 7px;
  transition: width 0.5s cubic-bezier(.4,0,.2,1);
  min-width: 3px;
}
.dist-count-sm {
  font-size: 12px; font-weight: 700; color: #909399;
  text-align: right;
  font-family: monospace;
}

/* MetricsBarChart（关键语调指标）样式 */
.mm-metrics { padding-top: 4px; }
.metric-chart { display: flex; flex-direction: column; gap: 5px; }
.metric-row {
  display: grid;
  grid-template-columns: 130px 1fr 110px;
  gap: 10px;
  align-items: center;
}
.metric-label {
  font-size: 12px; font-weight: 600; color: #606266;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metric-track {
  height: 18px;
  background: #f0f2f5;
  border-radius: 9px;
  overflow: hidden;
  position: relative;
}
.metric-fill {
  height: 100%;
  border-radius: 9px;
  transition: width 0.5s cubic-bezier(.4,0,.2,1);
  min-width: 4px;
}
.metric-fill.pos { background: linear-gradient(90deg, #409EFF, #67C23A); }
.metric-fill.neg { background: linear-gradient(90deg, #F56C6C, #E6A23C); }
.metric-val {
  font-size: 12px; font-weight: 600; color: #303133;
  text-align: right;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 新增：独立录音控制按钮 ===== */
.audio-controls {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  flex-wrap: wrap;
  justify-content: center;
}
.btn-success { background: #67C23A; color: #fff; }
.btn-success:hover:not(:disabled) { background: #85ce61; }
.btn-stop    { background: #F56C6C; color: #fff; }
.btn-stop:hover:not(:disabled) { background: #f78989; }
.btn-outline {
  background: #fff;
  color: #606266;
  border: 1px solid #dcdfe6;
}
.btn-outline:hover:not(:disabled) { background: #f5f7fa; border-color: #c0c4cc; }

/* ===== 响应式：窄屏缩放 ===== */
@media (max-width: 760px) {
  .video-wrapper, .status-panel, .emotion-panel, .control-area,
  .multimodal-audio-panel {
    width: 100%;
  }
  .video-wrapper { height: calc((100vw - 48px) * 405 / 720); }
  .emotion-metrics { grid-template-columns: 1fr 1fr; }
  .metric-row { grid-template-columns: 100px 1fr 90px; }
  .dist-item-sm { grid-template-columns: 56px 1fr 44px; }
}
</style>
