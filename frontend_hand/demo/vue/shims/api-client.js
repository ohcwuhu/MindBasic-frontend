/* 原前端的 REST 客户端（axios + `/api/v1` + 统一信封）。

   **两种模式**：
     · 演示模式（默认）：没有后端可打，用下面这份假数据顶上；
     · 接后端模式：页面 URL 带 `?live=1`，或在登录页登录过（localStorage 里
       `feisi_backend=live`）时，所有调用**直接转发给原前端的真客户端**
       （同源 `/api/v1`，由 demo/vite.config.mjs 的代理转给后端 127.0.0.1:8000）。

   假数据只实现这两页真正用到的调用，形状与原实现一致：
     get('/platform/config')                     → PublicPlatformConfig（自我教练页的 AI 横幅）
     post('/ai-conversations/{id}/summary')      → { moodType, content, conversationId }
     get('/emotion-journals?…')                  → { items, pagination }（情绪日记页的记录）
     get('/emotion-journals/trend?days=30')      → { days, items, summary }
     get('/emotion-journals/calendar?month=…')   → { year, month, days }
     post('/emotion-journals')                   → 新建一条（带 AI 回应）
     del('/emotion-journals/{id}')               → 删除一条
   记录数据放在内存里（提交、删除真的会生效，刷新回到示例）。 */

import * as realClient from '@original-api-client'

/** 是否走真后端：URL 带 ?live=1，或本机记着上次登录过 */
export const isLive = (() => {
  try {
    if (new URLSearchParams(window.location.search).has('live')) return true
    return window.localStorage.getItem('feisi_backend') === 'live'
  } catch {
    return false
  }
})()

export class ApiError extends Error {
  constructor(code, message, status = 0, errors) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.errors = errors
  }
}

/** 演示用的平台配置：与页脚、AI 免责声明横幅上的口径一致 */
const PLATFORM = {
  platformName: '知心同行',
  hotline: '12356',
  emergencyHint: '如有危机或伤害自己的念头，请立即拨打热线，或前往就近医院急诊。',
  disclaimer: 'AI 陪伴不能替代专业诊疗，也不做任何医疗诊断。',
  aiDisclaimer: 'AI 陪伴不能替代专业诊疗，也不做任何医疗诊断。',
}

/** 通话结束后「总结到情绪日记」的那份草稿（原后端由 /summary 生成） */
const JOURNAL_DRAFT = {
  /* 心情键与原前端一致：全大写（EmotionJournalView 里 moods[].key 是 CALM / HAPPY / …），
     写成小写的话情绪日记页认不出来，提交按钮会一直是灰的 */
  moodType: 'CALM',
  content:
    '今天和 AI 教练聊了聊最近的低落。我发现最难的时候是晚上一个人待在宿舍，安静下来念头就特别响。把它说出来之后，心里松了一点。',
}

/* =====================================================================================
   情绪日记页的数据（原后端由 /emotion-journals 系列提供）
   —— 记录、月历上的点、近 30 天分布都照这一版演示稿里的示例内容。
   ===================================================================================== */

let nextJournalId = 4

/** 示例记录：与演示稿里那三条同文 */
const journals = [
  {
    id: 3,
    moodType: 'CALM',
    content: '大概是晚上一个人的时候吧，宿舍太安静了。',
    feedback: '你愿意把这份安静写下来，本身就很有分量。',
    source: 'SELF_COACHING',
    sourceConversationId: 1,
    createdAt: '2026-10-09T22:14:00',
  },
  {
    id: 2,
    moodType: 'ANXIOUS',
    content: '明天要交的东西还差一半，脑子停不下来。',
    feedback: '先做能开始的那一小块，剩下的交给明天。',
    source: 'MANUAL',
    sourceConversationId: null,
    createdAt: '2026-10-08T23:40:00',
  },
  {
    id: 1,
    moodType: 'HAPPY',
    content: '和室友一起吃了顿好的，笑了很久。',
    feedback: '记住这一刻的松弛，它是真的。',
    source: 'MANUAL',
    sourceConversationId: null,
    createdAt: '2026-10-06T19:05:00',
  },
]

/** 月历上每天那个心情点（与演示稿里 10 月那一片点一致） */
const CALENDAR_DOTS = {
  1: 'CALM',
  2: 'HAPPY',
  4: 'ANXIOUS',
  5: 'CALM',
  6: 'IRRITATED',
  7: 'HAPPY',
  8: 'DOWN',
  11: 'ANXIOUS',
  12: 'CALM',
  13: 'OTHER',
  14: 'HAPPY',
  15: 'DOWN',
  16: 'ANXIOUS',
  18: 'CALM',
  19: 'IRRITATED',
  20: 'HAPPY',
  21: 'CALM',
  22: 'ANXIOUS',
  23: 'DOWN',
  25: 'CALM',
  26: 'HAPPY',
  27: 'IRRITATED',
  28: 'CALM',
  29: 'OTHER',
  30: 'ANXIOUS',
}

/** 近 30 天分布 */
const TREND_SUMMARY = { CALM: 9, HAPPY: 6, ANXIOUS: 5, DOWN: 3, IRRITATED: 2, OTHER: 1 }

/** 新写一条时，后端会回一句资源导向的回应（原由 LLM 生成） */
const FEEDBACK_BY_MOOD = {
  CALM: '你愿意把这份安静写下来，本身就很有分量。',
  HAPPY: '记住这一刻的松弛，它是真的。',
  ANXIOUS: '先把最响的那件事放下来一点，它不必今天就解决。',
  DOWN: '能写下它，说明你还在照顾自己，这很不容易。',
  IRRITATED: '烦躁里常常藏着被冒犯的边界，值得看一眼。',
  OTHER: '说不清也没关系，写下来就已经是线索了。',
}

const pad = (value) => String(value).padStart(2, '0')

const calendarFor = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const total = new Date(year, monthNumber, 0).getDate()
  const days = []
  for (let day = 1; day <= total; day += 1) {
    const key = `${year}-${pad(monthNumber)}-${pad(day)}`
    const mood = year === 2026 && monthNumber === 10 ? CALENDAR_DOTS[day] : undefined
    days.push({ date: key, moods: mood ? { [mood]: 1 } : {}, count: mood ? 1 : 0 })
  }
  return { year, month: monthNumber, days }
}

/* ---------- 演示数据（没有后端时用） ---------- */

async function fakeGet(url) {
  if (url === '/platform/config') return { ...PLATFORM }
  if (url.startsWith('/emotion-journals?') || url === '/emotion-journals') {
    return {
      items: journals.map((item) => ({ ...item })),
      pagination: {
        page: 1,
        pageSize: 50,
        totalItems: journals.length,
        totalPages: 1,
        hasMore: false,
      },
    }
  }
  if (url.startsWith('/emotion-journals/trend')) {
    return { days: 30, items: [], summary: { ...TREND_SUMMARY } }
  }
  const calendar = /^\/emotion-journals\/calendar\?month=(\d{4}-\d{2})$/.exec(url)
  if (calendar) return calendarFor(calendar[1])
  throw new ApiError('DEMO_STAND_IN', `演示版没有接后端：GET ${url}`, 0)
}

async function fakePost(url, data) {
  const summary = /^\/ai-conversations\/(\d+)\/summary$/.exec(url)
  if (summary) return { ...JOURNAL_DRAFT, conversationId: Number(summary[1]) }
  if (url === '/emotion-journals') {
    const payload = data ?? {}
    const moodType = payload.moodType ?? 'OTHER'
    const created = {
      id: nextJournalId++,
      moodType,
      content: payload.content ?? '',
      feedback: FEEDBACK_BY_MOOD[moodType] ?? FEEDBACK_BY_MOOD.OTHER,
      source: payload.source ?? 'MANUAL',
      sourceConversationId: payload.sourceConversationId ?? null,
      createdAt: new Date().toISOString(),
    }
    journals.unshift(created)
    return { ...created }
  }
  throw new ApiError('DEMO_STAND_IN', `演示版没有接后端：POST ${url}`, 0)
}

async function fakePatch(url) {
  throw new ApiError('DEMO_STAND_IN', `演示版没有接后端：PATCH ${url}`, 0)
}

async function fakePut(url) {
  throw new ApiError('DEMO_STAND_IN', `演示版没有接后端：PUT ${url}`, 0)
}

async function fakeDel(url) {
  const journal = /^\/emotion-journals\/(\d+)$/.exec(url)
  if (journal) {
    const index = journals.findIndex((item) => item.id === Number(journal[1]))
    if (index >= 0) journals.splice(index, 1)
    return
  }
  throw new ApiError('DEMO_STAND_IN', `演示版没有接后端：DELETE ${url}`, 0)
}

async function fakeUploadFile() {
  throw new ApiError('DEMO_STAND_IN', '演示版没有接后端：上传文件', 0)
}

/* ---------- 对外的四个调用：接后端模式下原样转发给真客户端 ---------- */
/* 真客户端是原前端的写法：`get('/platform/config')` 实际打 `/api/v1/platform/config`，
   并在响应拦截器里把统一信封拆开；它的 token 取 localStorage 的 `mb_access_token`
   （登录页登录后会写进去），刷新令牌走 httpOnly Cookie。 */

export const get = (url, params) => (isLive ? realClient.get(url, params) : fakeGet(url))
export const post = (url, data) => (isLive ? realClient.post(url, data) : fakePost(url, data))
export const patch = (url, data) => (isLive ? realClient.patch(url, data) : fakePatch(url))
export const put = (url, data) => (isLive ? realClient.put(url, data) : fakePut(url))
export const del = (url) => (isLive ? realClient.del(url) : fakeDel(url))
export const uploadFile = (file, usage) =>
  isLive ? realClient.uploadFile(file, usage) : fakeUploadFile()

export default { get, post, patch, put, del, uploadFile, isLive }
