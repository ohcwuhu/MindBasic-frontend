<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

const API_BASE_URL = ''

// ================================================================
//  Props：识别结果（父组件传入，任意结构以兼容现有接口）
// ================================================================
const props = defineProps<{
  analysisResult?: any
  liveEmotion?: any
}>()

interface ChatItem {
  role: 'user' | 'assistant'
  content: string
}

// ================================================================
//  对话状态
// ================================================================
const messages = ref<ChatItem[]>([
  {
    role: 'assistant',
    content:
      '你好，我是你的 AI 心理教练 🤗 刚才的识别结果我会作为参考。你可以先说说刚才发生了什么，或者让我基于识别到的情绪状态来引导你。',
  },
])
const chatInput = ref('')
const sending = ref(false)
const chatError = ref('')
const chatBodyRef = ref<HTMLElement | null>(null)

// ================================================================
//  从识别结果构造上下文（仅取非空字段）
// ================================================================
const analysisContext = computed(() => {
  const a = props.analysisResult
  const live = props.liveEmotion
  const ctx: Record<string, any> = {}
  if (a?.transcription?.text) ctx.transcription = a.transcription.text
  if (a?.text_emotion) {
    ctx.text_emotion = a.text_emotion.emotion_cn || a.text_emotion.emotion
    if (typeof a.text_emotion.confidence === 'number') {
      ctx.text_emotion_confidence = a.text_emotion.confidence
    }
  }
  if (a?.voice_emotion?.emotion) {
    ctx.voice_emotion = a.voice_emotion.emotion_cn || a.voice_emotion.emotion
    if (typeof a.voice_emotion.confidence === 'number') {
      ctx.voice_emotion_confidence = a.voice_emotion.confidence
    }
  }
  if (a?.facial_emotion?.dominant_emotion) {
    ctx.facial_emotion =
      a.facial_emotion.dominant_emotion_cn || a.facial_emotion.dominant_emotion
  }
  if (a?.fusion?.final_emotion) {
    ctx.fusion_emotion = a.fusion.final_emotion_cn || a.fusion.final_emotion
    if (typeof a.fusion.overall_confidence === 'number') {
      ctx.fusion_confidence = a.fusion.overall_confidence
    }
  }
  if (typeof live?.score === 'number') {
    ctx.live_score = live.score
    ctx.live_level = live.level
  }
  return Object.keys(ctx).length > 0 ? ctx : null
})

const contextSummary = computed(() => {
  const ctx = analysisContext.value
  if (!ctx) return ''
  const parts: string[] = []
  if (ctx.fusion_emotion) parts.push(`融合情绪：${ctx.fusion_emotion}`)
  if (ctx.transcription) parts.push(`转写：${String(ctx.transcription).slice(0, 24)}${String(ctx.transcription).length > 24 ? '…' : ''}`)
  return parts.join(' · ')
})

// ================================================================
//  发送消息
// ================================================================
const scrollToBottom = () => {
  nextTick(() => {
    if (chatBodyRef.value) {
      chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
    }
  })
}

const pushMessage = (item: ChatItem) => {
  messages.value.push(item)
  scrollToBottom()
}

const buildPayload = () => {
  const history = messages.value
    .filter((m) => m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }))
  return {
    messages: history,
    context: analysisContext.value,
  }
}

const send = async (contentOverride?: string) => {
  const text = (contentOverride ?? chatInput.value).trim()
  if (!text || sending.value) return
  chatInput.value = ''
  chatError.value = ''
  pushMessage({ role: 'user', content: text })
  sending.value = true
  scrollToBottom()

  try {
    const resp = await fetch(`${API_BASE_URL}/api/ai_coach/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    })
    const data = await resp.json()
    if (!resp.ok) {
      throw new Error(data?.detail || `请求失败（${resp.status}）`)
    }
    pushMessage({ role: 'assistant', content: data.reply || '（AI 没有返回内容，请重试）' })
  } catch (err: any) {
    chatError.value = `AI 教练暂时无法回复：${err?.message || '网络错误'}`
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

const sendWithContext = () => {
  const ctx = analysisContext.value
  if (!ctx) return
  const transcription = ctx.transcription ? `（我刚说：${ctx.transcription}）` : ''
  void send(`基于我现在的状态（${contextSummary.value}）${transcription}，陪我聊聊吧`)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
}
</script>

<template>
  <div class="ai-coach-panel" :class="{ active: analysisContext }">
    <div class="ai-header">
      <span class="ai-title">🤖 AI 心理教练</span>
      <span class="ai-model">DeepSeek</span>
      <span v-if="contextSummary" class="ai-context-chip" :title="contextSummary">
        🧠 {{ contextSummary }}
      </span>
    </div>

    <div ref="chatBodyRef" class="ai-body">
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="ai-msg"
        :class="m.role === 'user' ? 'user' : 'assistant'"
      >
        <div class="ai-bubble">{{ m.content }}</div>
      </div>

      <div v-if="sending" class="ai-msg assistant">
        <div class="ai-bubble ai-typing">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>

      <p v-if="chatError" class="ai-error">{{ chatError }}</p>
    </div>

    <div class="ai-quick">
      <button
        class="ai-quick-btn"
        :disabled="!analysisContext || sending"
        @click="sendWithContext"
      >
        ✨ 基于本次识别引导我
      </button>
      <span v-if="!analysisContext" class="ai-quick-hint">
        完成一次「结束录音 & 分析」后即可使用识别上下文
      </span>
    </div>

    <div class="ai-input-row">
      <textarea
        v-model="chatInput"
        class="ai-input"
        rows="2"
        placeholder="说说你的感受，或按 Enter 发送（Shift+Enter 换行）"
        :disabled="sending"
        @keydown="onKeydown"
      ></textarea>
      <button
        class="ai-send"
        :disabled="sending || !chatInput.trim()"
        @click="send()"
      >
        {{ sending ? '思考中…' : '发送' }}
      </button>
    </div>

    <p class="ai-disclaimer">
      AI 教练为成长辅助工具，不提供诊断或治疗；如处于危机状态，请拨打心理援助热线
      <b>12356</b> 或尽快寻求线下专业帮助。
    </p>
  </div>
</template>

<style scoped>
.ai-coach-panel {
  width: 720px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
  overflow: hidden;
  opacity: 0.85;
  transition: all 0.3s;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.ai-coach-panel.active {
  opacity: 1;
  border-color: #8b5cf6;
  box-shadow: 0 8px 24px rgba(139, 92, 246, 0.14);
}
.ai-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: linear-gradient(90deg, #f5f3ff 0%, #fff 100%);
  border-bottom: 1px solid #ebeef5;
  flex-wrap: wrap;
}
.ai-title { font-size: 16px; font-weight: 700; color: #303133; }
.ai-model {
  font-size: 11px; font-weight: 600; color: #8b5cf6;
  background: #f3f0ff; padding: 2px 10px; border-radius: 10px;
}
.ai-context-chip {
  font-size: 12px; font-weight: 500; color: #606266;
  background: #f5f7fa; border: 1px solid #ebeef5;
  padding: 3px 10px; border-radius: 10px;
  max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ai-body {
  flex: 1;
  max-height: 380px;
  min-height: 200px;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fafafa;
}
.ai-msg { display: flex; }
.ai-msg.user { justify-content: flex-end; }
.ai-msg.assistant { justify-content: flex-start; }
.ai-bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-msg.user .ai-bubble {
  background: #8b5cf6;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.ai-msg.assistant .ai-bubble {
  background: #fff;
  color: #303133;
  border: 1px solid #e4e7ed;
  border-bottom-left-radius: 4px;
}
.ai-typing { display: flex; gap: 4px; align-items: center; }
.ai-typing .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #c0c4cc;
  animation: ai-blink 1.2s infinite ease-in-out;
}
.ai-typing .dot:nth-child(2) { animation-delay: 0.2s; }
.ai-typing .dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes ai-blink {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-3px); }
}
.ai-error {
  margin: 4px 0 0;
  color: #F56C6C; font-size: 13px;
  background: #fef0f0; border-radius: 8px; padding: 8px 12px;
}
.ai-quick {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 20px;
  border-top: 1px dashed #ebeef5;
  flex-wrap: wrap;
}
.ai-quick-btn {
  padding: 8px 18px;
  font-size: 13px; font-weight: 600;
  color: #8b5cf6; background: #f3f0ff;
  border: 1px solid #ddd0ff; border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.ai-quick-btn:hover:not(:disabled) { background: #ece4ff; }
.ai-quick-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ai-quick-hint { font-size: 12px; color: #909399; }
.ai-input-row {
  display: flex;
  gap: 10px;
  padding: 10px 20px;
  border-top: 1px solid #ebeef5;
  background: #fff;
}
.ai-input {
  flex: 1;
  resize: none;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.6;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.ai-input:focus { border-color: #8b5cf6; }
.ai-send {
  padding: 0 22px;
  font-size: 14px; font-weight: 600;
  color: #fff; background: #8b5cf6;
  border: none; border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.ai-send:hover:not(:disabled) { background: #7c4de4; }
.ai-send:disabled { opacity: 0.5; cursor: not-allowed; }
.ai-disclaimer {
  margin: 0;
  padding: 8px 20px 12px;
  font-size: 11px;
  color: #909399;
  line-height: 1.6;
  background: #fafafa;
  border-top: 1px dashed #ebeef5;
}
@media (max-width: 760px) {
  .ai-coach-panel { width: 100%; }
}
</style>
