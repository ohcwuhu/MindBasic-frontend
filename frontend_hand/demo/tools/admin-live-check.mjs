/**
 * 管理工作台那四页的联调自检 —— 真后端 + 真接口，用管理员账号把三个模块走一遍。
 *
 * 跑之前两件东西要在：
 *   1. 后端：项目主体/项目代码/MindBasic-backend → .venv\Scripts\python.exe scripts\run_dev.py
 *   2. 开发服务器（5178，代理 /api 到 8000）：
 *      cd demo && node vue/node_modules/vite/bin/vite.js --config vite.config.mjs
 *
 * 用法：  node tools/admin-live-check.mjs
 *
 * 它会**真的**改数据，所以每一处都在同一次运行里还原：用户停用→恢复；临时文章新建→删除；
 * 临时分类新增→删除。教练审核那一段真库里 0 条申请，所以列表空态用真接口验，详情 / 通过 /
 * 驳回用替身响应验（并断言发出去的请求体）。任何一处控制台报错都会让它以非 0 退出。
 */
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:5178'
const problems = []
const log = (...args) => console.log(...args)

const browser = await chromium.launch({ channel: 'chrome' })

async function signIn(phone, password, nickname, role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  /* 只有管理员那一次才记控制台：普通用户打开 /admin/* 本来就该收 403，那是越权用例要的 */
  if (role === 'ADMIN') {
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push('console: ' + m.text())
    })
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))
  }
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' })
  const token = await page.evaluate(
    async ([p, w]) => {
      const r = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p, password: w }),
      })
      return (await r.json()).data.accessToken
    },
    [phone, password],
  )
  await page.evaluate(
    ([t, n, r]) => {
      localStorage.setItem('mb_access_token', t)
      localStorage.setItem('feisi_backend', 'live')
      localStorage.setItem('feisi_nickname', n)
      localStorage.setItem('feisi_role', r)
    },
    [token, nickname, role],
  )
  return { context, page }
}

/* ---------- 1 · 越权：没登录 / 普通用户 ---------- */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  await page.goto(BASE + '/admin-users.html', { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const where = page.url().replace(BASE, '')
  log('越权 · 未登录打开 admin-users.html →', where)
  if (where !== '/login.html?next=admin-users.html') problems.push('未登录没有被送到登录页：' + where)
  await context.close()

  const user = await signIn('13900000002', 'Demo123456', '小满', 'USER')
  for (const file of ['admin.html', 'admin-users.html', 'admin-articles.html', 'admin-coach-audits.html']) {
    await user.page.goto(BASE + '/' + file, { waitUntil: 'load' })
    await user.page.waitForTimeout(1800)
    const at = user.page.url().replace(BASE, '')
    log('越权 · 普通用户打开 ' + file + ' →', at)
    if (at !== '/index.html') problems.push('普通用户没被请回首页：' + file + ' → ' + at)
  }
  await user.context.close()
}

const { context, page } = await signIn('13800138000', 'Admin@123456', '管理员', 'ADMIN')
log('--- 管理员已登录 ---')

/* ---------- 2 · 用户 ---------- */
await page.goto(BASE + '/admin-users.html', { waitUntil: 'load' })
await page.waitForSelector('[data-rows] tr[data-id]')
log('用户 · 第一行:', (await page.locator('[data-rows] tr').first().innerText()).replace(/\n/g, ' | '))
log('用户 · 计数:', await page.locator('[data-count]').innerText())
log('用户 · 分页:', await page.locator('[data-pager-count]').innerText())

await page.locator('[data-next]').click()
await page.waitForFunction(() => document.querySelector('[data-pager-count]').textContent.includes('第 2 /'))
log('用户 · 翻到第 2 页 →', await page.locator('[data-pager-count]').innerText(), '| 地址栏', page.url().replace(BASE, ''))
if (!page.url().includes('page=2')) problems.push('翻页没有写回地址栏')

await page.selectOption('.filters [name="role"]', 'ADMIN')
await page.locator('[data-apply]').click()
await page.waitForSelector('[data-rows] tr[data-id]:has-text("你自己")')
log('用户 · 按角色筛「管理员」→', (await page.locator('[data-rows] tr').first().innerText()).replace(/\n/g, ' | '))
const selfDisabled = await page.locator('[data-rows] tr', { hasText: '你自己' }).locator('[data-act]').isDisabled()
log('用户 · 「你自己」那一行的开关被禁用:', selfDisabled)
if (!selfDisabled) problems.push('自己那一行的开关没有被禁用')

await page.locator('[data-reset]').click()
/* 不写死总数：库里随时可能多出账号（比如刚注册的）。只要求「重置之后回到一个总数、且回到第 1 页」 */
await page.waitForFunction(() => /共 \d+ 位/.test(document.querySelector('[data-count]').textContent))
await page.waitForFunction(() => document.querySelector('[data-pager-count]').textContent.includes('第 1 /'))
const total = Number((await page.locator('[data-count]').innerText()).replace(/\D/g, ''))
log('用户 · 重置后:', await page.locator('[data-count]').innerText(), '·', await page.locator('[data-pager-count]').innerText())
if (!total) problems.push('重置之后没读到总数')
await page.fill('.filters [name="keyword"]', '林老师')
await page.locator('[data-apply]').click()
await page.waitForFunction(() => /共 \d+ 位/.test(document.querySelector('[data-count]').textContent))
log('用户 · 搜「林老师」→', await page.locator('[data-count]').innerText(), '| 行数', await page.locator('[data-rows] tr[data-id]').count())

await page.locator('[data-rows] tr[data-id] [data-act]').first().click()
await page.locator('[data-yes]').click()
await page.waitForSelector('[data-rows] tr[data-id] .chip:has-text("已停用")')
log('用户 · 停用后状态:', await page.locator('[data-rows] tr[data-id] .chip').innerText())
await page.locator('[data-rows] tr[data-id] [data-act]').first().click()
await page.locator('[data-yes]').click()
await page.waitForSelector('[data-rows] tr[data-id] .chip--green')
log('用户 · 恢复后状态:', await page.locator('[data-rows] tr[data-id] .chip').innerText(), '（已还原）')

/* ---------- 3 · 内容 ---------- */
await page.goto(BASE + '/admin-articles.html', { waitUntil: 'load' })
await page.waitForSelector('[data-rows] tr[data-id]')
log('\n内容 · 计数:', await page.locator('[data-count]').innerText())
log('内容 · 第一行:', (await page.locator('[data-rows] tr').first().innerText()).replace(/\n/g, ' | '))
log('内容 · 分类表:', await page.locator('[data-cats] tr').count(), '行')

const TITLE = '联调临时稿（会自动删掉）'
const CAT = '联调临时分类'

/* 上一次没跑完留下的，先清掉 */
for (let guard = 0; guard < 6; guard++) {
  const row = page.locator(`[data-rows] tr[data-id]:has-text("${TITLE}")`).first()
  if (!(await row.count())) break
  await row.locator('[data-remove]').click()
  await row.locator('[data-yes-del]').click()
  await page.waitForTimeout(500)
}

await page.locator('[data-new]').click()
await page.fill('#a-title', TITLE)
await page.fill('#a-content', '<p>用来自检内容模块的一篇短稿。</p>')
await page.fill('#a-summary', '自检用。')
await page.selectOption('#a-status', 'DRAFT')
await page.locator('[data-save]').click()
await page.waitForFunction(() => document.querySelector('[data-editor]').hidden)
await page.waitForSelector(`[data-rows] tr[data-id]:has-text("${TITLE}")`)
log('内容 · 新建（草稿）后第一行:', (await page.locator('[data-rows] tr[data-id]').first().innerText()).replace(/\n/g, ' | '))

await page.locator(`[data-rows] tr[data-id]:has-text("${TITLE}") [data-edit]`).click()
await page.waitForSelector('[data-editor]:not([hidden])')
log('内容 · 编辑器标题:', await page.locator('[data-editor-title]').innerText())
log('内容 · 正文回填:', await page.inputValue('#a-content'))
await page.selectOption('#a-status', 'PUBLISHED')
await page.locator('[data-save]').click()
await page.waitForFunction(() => document.querySelector('[data-editor]').hidden)
await page.waitForSelector(`[data-rows] tr[data-id]:has-text("${TITLE}") .chip--green`)
log('内容 · 改成已发布后:', (await page.locator(`[data-rows] tr[data-id]:has-text("${TITLE}")`).innerText()).replace(/\n/g, ' | '))

await page.locator(`[data-rows] tr[data-id]:has-text("${TITLE}") [data-remove]`).click()
await page.locator('[data-yes-del]').click()
await page.waitForFunction((t) => !document.body.innerText.includes(t), TITLE)
log('内容 · 删除后计数:', await page.locator('[data-count]').innerText(), '（已还原）')

for (let guard = 0; guard < 6; guard++) {
  const row = page.locator(`[data-cats] tr:has-text("${CAT}")`).first()
  if (!(await row.count())) break
  await row.locator('[data-del-cat]').click()
  await row.locator('[data-yes-cat]').click()
  await page.waitForTimeout(500)
}

await page.fill('#new-cat', CAT)
await page.locator('[data-add-cat]').click()
await page.waitForSelector(`[data-cats] tr:has-text("${CAT}")`)
log('内容 · 新增分类 →', await page.locator('[data-cat-msg]').innerText())
await page.locator(`[data-cats] tr:has-text("${CAT}") [data-del-cat]`).click()
await page.locator(`[data-cats] tr:has-text("${CAT}") [data-yes-cat]`).click()
await page.waitForFunction((c) => !document.querySelector('[data-cats]').innerText.includes(c), CAT)
log('内容 · 删除分类 →', await page.locator('[data-cat-msg]').innerText(), '（已还原）')

/* ---------- 4 · 教练审核 ---------- */
const FAKE = {
  id: 9001,
  coachId: 77,
  coachName: '林老师',
  phone: '139****0001',
  submitVersion: 2,
  status: 'PENDING',
  remark: null,
  snapshot: {
    realName: '林某',
    bio: '专注高考陪伴与亲子沟通。',
    trainingExp: '心理教练认证 120 学时。',
    serviceConcept: '赋能、陪伴、资源导向。',
    yearsOfExperience: 8,
    credentialUrls: ['https://example.com/cert-1.pdf', 'https://example.com/cert-2.pdf'],
    idCardUrl: 'https://example.com/id.jpg',
    tagIds: [1, 2, 9],
    services: [
      { name: '单次咨询', serviceType: 'SINGLE', durationMin: 60, priceInCents: 9900, description: '一次 60 分钟。' },
      { name: '高考 5 次陪伴卡', serviceType: 'PACKAGE', durationMin: 60, priceInCents: 99000, description: null },
    ],
  },
  submittedAt: '2026-10-11T12:31:00.000Z',
  reviewedAt: null,
}
const sent = []
await context.route('**/api/v1/admin/coach-audits**', async (route) => {
  const url = route.request().url()
  const method = route.request().method()
  const wrap = (data) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'OK', message: 'success', data }) })
  if (method === 'GET' && /\/coach-audits\?/.test(url)) {
    return wrap({ items: [FAKE], pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1, hasMore: false } })
  }
  if (method === 'GET') return wrap(FAKE)
  sent.push({ url: url.replace(BASE, ''), body: route.request().postData() })
  return wrap({ id: FAKE.id, status: 'APPROVED' })
})

await page.goto(BASE + '/admin-coach-audits.html', { waitUntil: 'load' })
await page.waitForSelector('[data-rows] tr[data-id]')
log('\n审核 · 列表第一行:', (await page.locator('[data-rows] tr').first().innerText()).replace(/\n/g, ' | '))
log('审核 · 计数:', await page.locator('[data-count]').innerText())

await page.locator('[data-open]').first().click()
await page.waitForSelector('[data-detail]:not([hidden]) .pairs')
log('审核 · 详情抬头:', (await page.locator('.ahead').innerText()).replace(/\n/g, ' | '))
log('审核 · 标签 id → 名:', await page.locator('.pairs dd').nth(2).innerText())
log('审核 · 服务项目:', (await page.locator('.svc').first().innerText()).replace(/\n/g, ' | '))
log('审核 · 地址栏:', page.url().replace(BASE, ''))

await page.locator('[data-ask-reject]').click()
await page.locator('#reason').fill('资质证明缺第 2 页，请补齐后再提交。')
await page.locator('[data-yes-reject]').click()
await page.waitForFunction(() => document.querySelector('[data-detail]').hidden)
log('审核 · 驳回 →', JSON.stringify(sent[sent.length - 1]))

await page.locator('[data-open]').first().click()
await page.waitForSelector('[data-detail]:not([hidden]) .pairs')
await page.locator('[data-ask-approve]').click()
await page.locator('[data-yes-approve]').click()
await page.waitForFunction(() => document.querySelector('[data-detail]').hidden)
log('审核 · 通过 →', JSON.stringify(sent[sent.length - 1]))
if (sent.length !== 2) problems.push('通过 / 驳回的请求数不对：' + sent.length)

/* 真库那份空态 */
await context.unroute('**/api/v1/admin/coach-audits**')
await page.goto(BASE + '/admin-coach-audits.html', { waitUntil: 'load' })
await page.waitForSelector('[data-rows] .empty')
log('审核 · 真库空态:', (await page.locator('[data-rows] .empty').innerText()).replace(/\n/g, ' | '))
log('审核 · 计数:', await page.locator('[data-count]').innerText())
await page.locator('[data-status=""]').click()
await page.waitForFunction(() => document.querySelector('[data-count]').textContent.includes('共'))
log('审核 · 「全部」档:', await page.locator('[data-count]').innerText(), '| 地址栏', page.url().replace(BASE, ''))

/* ---------- 5 · 概览 ---------- */
await page.goto(BASE + '/admin.html', { waitUntil: 'load' })
await page.waitForFunction(() => !document.querySelector('[data-users-body]').innerText.includes('读取中'))
log('\n概览 · 模块导航:', (await page.locator('.atabs').innerText()).replace(/\n/g, ' / '))
log('概览 · 统计:', (await page.locator('[data-admin-stats]').innerText()).replace(/\n/g, ' | '))
log('概览 · 新用户第一行:', (await page.locator('[data-users-body] tr').first().innerText()).replace(/\n/g, ' | '))
log('概览 · 教练审核待办:', await page.locator('[data-audit-count]').innerText())

log('\n--- 控制台问题 ---')
log(problems.length ? problems.join('\n') : '无')
await browser.close()
process.exit(problems.length ? 1 : 0)
