/**
 * 测评 / 成长的「故障夹具」服务：一个假后端，专门用来验坏情况。
 *
 * 评审提的第三条是「接口失败不能被展示成『你没有记录』」。这种情形在真后端上很难复现
 * （总不能真去把 MySQL 停掉），所以这里用一个只实现被测接口的小服务，按场景返回
 * 503 / 空数组 / 假的分页数，让页面把「加载中、暂无记录、加载失败」三种状态都走一遍。
 *
 * 用法：  node tools/growth-fixture.cjs          # 听 127.0.0.1:5189
 *        然后 tools/priority-one-failure-check.mjs 自己起它、自己关它
 *
 * 场景（`/__test/setup?scenario=<名字>` 切换）：
 *   fresh           新账号：没有任何记录，量表正常
 *   populated       有记录：分页总数 123、第一页只给 1 条（验「累计 ≠ 第一页条数」）
 *   template-error  量表接口 503（验：不给示例题、不能提交、可重试）
 *   save-error      提交接口 503（验：不跳转、答案留在页面上、明确说没确认成功）
 *   partial-error   日记接口 503、其余正常（验：一处失败只影响一处，不写成零记录）
 *
 * 它也顺带把 demo 目录当静态服务器用（页面请求的同源 `/api/v1/...` 打到自己身上）。
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PORT = 5189

const DIMENSIONS = [
  ['SELF_AWARENESS', '自我觉察'],
  ['RESOURCE_USE', '资源运用'],
  ['GOAL_CLARITY', '目标清晰'],
  ['ACTION', '行动力'],
  ['EMOTION_REGULATION', '情绪调节'],
]
const OPTION_LABELS = ['几乎从不', '偶尔', '有时', '经常', '几乎总是']

let scenario = 'fresh'
let saved = []
let posts = 0

function result(id) {
  return {
    id,
    templateId: 1,
    templateName: '成长状态自评',
    createdAt: '2026-10-13T12:00:00+08:00',
    scores: DIMENSIONS.map(([key, name]) => ({
      dimensionKey: key,
      dimensionName: name,
      // 第一次 3 分、第二次 4 分：差值应该是 +1.00（验「增幅来自真实结果」）
      score: id === 1 ? 3 : 4,
      levelLabel: '正在生长',
    })),
    report: { summary: '这次自评来自已保存的答案。' },
  }
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(
    JSON.stringify({
      code: status < 400 ? 'OK' : 'TEST_ERROR',
      message: status < 400 ? 'success' : '测试服务暂时不可用',
      data,
    }),
  )
}

async function readBody(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  return body
}

function api(req, res, url) {
  const route = url.pathname.slice('/api/v1'.length)

  if (route === '/platform/config') return json(res, null, 503)
  if (route === '/users/me') return json(res, { nickname: '验证用户' })

  if (route === '/growth-assessments/template') {
    if (scenario === 'template-error') return json(res, null, 503)
    return json(res, {
      id: 1,
      name: '成长状态自评',
      description: '按最近两周的感受回答',
      questions: DIMENSIONS.map(([key, name], index) => ({
        id: index + 1,
        dimensionKey: key,
        dimensionName: name,
        question: '测试题目 ' + (index + 1),
        options: OPTION_LABELS.map((label, i) => ({ value: i + 1, label })),
      })),
    })
  }

  if (route === '/growth-assessments' && req.method === 'POST') {
    return readBody(req).then((body) => {
      posts += 1
      if (scenario === 'save-error') return json(res, null, 503)
      const answers = JSON.parse(body).answers
      if (Object.keys(answers).length !== DIMENSIONS.length) return json(res, null, 400)
      const fresh = result(saved.length + 1)
      fresh.scores.forEach((score, index) => {
        score.score = answers[String(index + 1)]
      })
      saved.unshift(fresh)
      json(res, fresh, 201)
    })
  }

  if (route === '/growth-assessments') {
    const pageSize = Number(url.searchParams.get('pageSize') || 50)
    return json(res, {
      items: saved
        .map((item) => ({ id: item.id, templateName: item.templateName, createdAt: item.createdAt }))
        .slice(0, pageSize),
      pagination: { page: 1, pageSize, totalItems: saved.length, totalPages: saved.length ? 1 : 0, hasMore: false },
    })
  }

  if (route.startsWith('/growth-assessments/')) {
    const found = saved.find((item) => String(item.id) === route.split('/').pop())
    return json(res, found, found ? 200 : 404)
  }

  if (route === '/check-ins/stats') return json(res, { streakDays: 0, monthCount: 0, totalCount: 0 })
  if (route === '/check-ins' || route === '/users/me/badges') return json(res, { items: [] })

  if (['/emotion-journals', '/self-coaching/records', '/ai-conversations'].includes(route)) {
    if (scenario === 'partial-error' && route === '/emotion-journals') return json(res, null, 503)
    const many = scenario === 'populated'
    return json(res, {
      items: many
        ? [{ id: 1, title: '已保存记录', content: '已保存日记', createdAt: '2026-10-13T12:00:00+08:00' }]
        : [],
      /* 分页总数与第一页条数刻意不一样：页面该显示 123，而不是 1 */
      pagination: { page: 1, pageSize: 50, totalItems: many ? 123 : 0, totalPages: many ? 3 : 0, hasMore: many },
    })
  }

  json(res, null, 404)
}

function serveFile(res, url) {
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
  const file = path.resolve(ROOT, '.' + relative)
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403)
    return res.end()
  }
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
  }
  fs.readFile(file, (error, buffer) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
    res.end(error ? 'not found' : buffer)
  })
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/__test/setup') {
      scenario = url.searchParams.get('scenario') || 'fresh'
      saved = scenario === 'populated' ? [result(2), result(1)] : []
      posts = 0
      return json(res, { scenario })
    }
    if (url.pathname === '/__test/status') return json(res, { scenario, posts, results: saved.length })
    if (url.pathname.startsWith('/api/v1')) return api(req, res, url)
    serveFile(res, url)
  })
  .listen(PORT, '127.0.0.1', () => console.log('growth fixture ready on http://127.0.0.1:' + PORT))
