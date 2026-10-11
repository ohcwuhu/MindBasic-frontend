/**
 * 用户端这一轮新做的几页联调自检：通知中心 / 钱包 / 找回密码 / 社群详情 / 个人中心的四件事。
 *
 * 跑之前两件东西要在（同 admin-live-check.mjs）：
 *   1. 后端 8000；2. 开发服务器 5178（代理 /api）。
 * 用法：  node tools/account-live-check.mjs
 *
 * 会真改数据的地方都做了还原：社群「加入→发帖→删帖→退出」，个人中心「导出一次」（留一条
 * 导出记录，7 天后后端自己过期，这是这一页正常的产物）。改密码 / 停用 / 删除只验请求，不真的打。
 *
 * 一个已知的后端限流：`/users/me/data-export` 是 **3 次 / 小时**。一小时内连着跑这个脚本，
 * 第三次之后会看到 429「操作过于频繁」——那本身也算验到了错误提示，只是下载那一步会拿上一次
 * 留下的导出记录来验。
 *
 * 还有 `/auth/email-code` 是 **10 次 / 5 分钟（按 IP）**：连跑几遍就会撞上，脚本把 429 当成
 * 「错误提示也验到了」而不是失败。
 */
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:5178'
const API = 'http://127.0.0.1:8000/api/v1'
const PHONE = '13900000002'
const PASSWORD = 'Demo123456'
const problems = []
const log = (...args) => console.log(...args)

const browser = await chromium.launch({ channel: 'chrome' })

/* 直接用后端拿一个 token：脚本里要自己调几个接口做还原 */
const loginBody = await (
  await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
  })
).json()
const token = loginBody.data.accessToken
const userId = loginBody.data.user.id
const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', acceptDownloads: true })
const page = await context.newPage()
page.on('console', (m) => {
  if (m.type() !== 'error') return
  /* `/users/me/data-export` 后端是 3 次 / 小时：连着跑脚本必然撞到，429 是预期内的 */
  if (/429 \(Too Many Requests\)/.test(m.text())) return
  problems.push('console: ' + m.text())
})
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' })
await page.evaluate(
  ([t, n, r]) => {
    localStorage.setItem('mb_access_token', t)
    localStorage.setItem('feisi_backend', 'live')
    localStorage.setItem('feisi_nickname', n)
    localStorage.setItem('feisi_role', r)
  },
  [token, loginBody.data.user.nickname, loginBody.data.user.role],
)
log('--- 演示账号已登录：' + loginBody.data.user.nickname + ' (id ' + userId + ') ---')

/* ==================== 0 · 注册一个全新账号，再用它登录（踩过的坑：注册页曾经不发请求） ==================== */
{
  const phone = '139' + String(Math.floor(Math.random() * 90000000) + 10000000)
  const nickname = '自检小号'
  const password = PASSWORD
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const freshPage = await fresh.newPage()
  const sent = []
  freshPage.on('request', (request) => {
    if (request.url().includes('/api/')) sent.push(request.method() + ' ' + request.url().replace(BASE, ''))
  })

  await freshPage.goto(BASE + '/register.html', { waitUntil: 'load' })
  await freshPage.fill('#r-phone', phone)
  await freshPage.fill('#r-nick', nickname)
  await freshPage.fill('#r-pass', password)
  await freshPage.fill('#r-pass2', password)
  await freshPage.locator('form input[type="checkbox"]').check()
  await freshPage.locator('form button[type="submit"]').click()
  await freshPage.waitForURL(/index\.html/, { timeout: 8000 })
  await freshPage.waitForTimeout(800)
  const stored = await freshPage.evaluate(() => ({
    token: (localStorage.getItem('mb_access_token') || '').slice(0, 10),
    backend: localStorage.getItem('feisi_backend'),
    nickname: localStorage.getItem('feisi_nickname'),
  }))
  const landed = freshPage.url().replace(BASE, '')
  log('\n注册 · 报名请求:', sent.find((item) => item.includes('register')) || '（一个请求都没发 ✗）')
  log('注册 · 落地:', landed, '| 凭证:', JSON.stringify(stored), '| 页头:', (await freshPage.locator('.masthead__actions').innerText()).replace(/\n/g, ' | '))
  if (!sent.some((item) => item.includes('POST /api/v1/auth/register'))) problems.push('注册页没有真的发注册请求')
  if (landed !== '/index.html') problems.push('注册后落地地址不对（不该带 query）：' + landed)
  if (!stored.token || stored.backend !== 'live' || stored.nickname !== nickname) problems.push('注册后没有存下登录凭证')

  /* 退出来，再用同一套账号密码登一次 —— 用户报的就是这一步用不了。
     退出按钮现在在个人中心页里（页头那颗改成「个人中心」了） */
  await freshPage.goto(BASE + '/my-growth.html', { waitUntil: 'load' })
  await freshPage.waitForTimeout(800)
  const note = await freshPage.locator('[data-account-note]').innerText()
  log('注册 · 个人中心里的账号行:', note)
  if (!note.includes(nickname)) problems.push('个人中心里没显示当前登录的昵称')
  await freshPage.locator('[data-logout]').click()
  await freshPage.waitForURL(/index\.html/, { timeout: 8000 })
  await freshPage.waitForTimeout(500)
  await freshPage.goto(BASE + '/login.html', { waitUntil: 'load' })
  await freshPage.fill('#phone', phone)
  await freshPage.fill('#password', password)
  await freshPage.locator('#panel-password button[type="submit"]').click()
  await freshPage.waitForURL(/index\.html/, { timeout: 8000 })
  await freshPage.waitForTimeout(600)
  const header = (await freshPage.locator('.masthead__actions').innerText()).replace(/\n/g, ' | ')
  log('注册 · 退出后再登:', freshPage.url().replace(BASE, ''), '· 页头:', header)
  if (!header.includes('个人中心')) problems.push('用新注册的账号登录后，页头那颗按钮不是「个人中心」')

  /* 收尾：把这个自检号删掉，别在库里留东西 */
  const ownToken = await freshPage.evaluate(() => localStorage.getItem('mb_access_token'))
  const removed = await fetch(API + '/users/me/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ownToken },
    body: JSON.stringify({ password }),
  })
  const relogin = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  })
  log('注册 · 收尾: 删除接口', removed.status, '· 再登一次', relogin.status, '（401/403 = 已删干净）')
  if (!removed.ok) problems.push('自检号没有删掉：' + removed.status)
  await fresh.close()
}

/* ============================ 1 · 登录（密码 + 邮箱验证码） ============================ */
{
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const freshPage = await fresh.newPage()
  await freshPage.goto(BASE + '/login.html', { waitUntil: 'load' })
  await freshPage.fill('#phone', PHONE)
  await freshPage.fill('#password', PASSWORD)
  await freshPage.locator('#panel-password button[type="submit"]').click()
  await freshPage.waitForURL(/index\.html/)
  const stored = await freshPage.evaluate(() => ({
    token: (localStorage.getItem('mb_access_token') || '').slice(0, 12),
    mode: localStorage.getItem('feisi_backend'),
    nick: localStorage.getItem('feisi_nickname'),
    role: localStorage.getItem('feisi_role'),
  }))
  log('登录 · 密码登录 →', freshPage.url().replace(BASE, ''), JSON.stringify(stored))
  if (!stored.token || stored.mode !== 'live' || !stored.nick) problems.push('密码登录没有把凭证存下来')

  /* 邮箱验证码那一栏：发码是真的，登录用一个错码走错误提示 */
  await freshPage.goto(BASE + '/login.html', { waitUntil: 'load' })
  await freshPage.locator('#tab-email').click()
  await freshPage.fill('#email', 'live-check-' + Date.now() + '@example.com')
  await freshPage.locator('#panel-email [data-send-code]').click()
  /* 发得出去就是「验证码已发出」，撞上后端限流就是错误提示 —— 两种都算这一步验到了 */
  await freshPage.waitForFunction(() => {
    const note = document.querySelector('[data-send-note]')
    const error = document.querySelector('[data-email-error]')
    return /验证码已发出/.test(note.textContent) || (error && !error.hidden)
  })
  const sendNote = await freshPage.locator('[data-send-note]').innerText()
  const sendError = (await freshPage.locator('[data-email-error]').isHidden()) ? '' : await freshPage.locator('[data-email-error]').innerText()
  log('登录 · 邮箱验证码那一栏发码 →', sendNote, sendError ? '（' + sendError + '）' : '')
  await freshPage.fill('#code', '000000')
  await freshPage.locator('#panel-email button[type="submit"]').click()
  await freshPage.waitForFunction(() => !document.querySelector('[data-email-error]').hidden)
  log('登录 · 用一个错码登 →', await freshPage.locator('[data-email-error]').innerText())
  await fresh.close()
}

/* ============================ 2 · 找回密码（不用登录） ============================ */
{
  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const guestPage = await guest.newPage()
  await guestPage.goto(BASE + '/forgot-password.html', { waitUntil: 'load' })
  await guestPage.waitForTimeout(1200)
  log('找回密码 · 未登录打开 →', guestPage.url().replace(BASE, '') === '/forgot-password.html' ? '留在本页 ✓' : guestPage.url().replace(BASE, '') + ' ✗')
  if (guestPage.url().replace(BASE, '') !== '/forgot-password.html') problems.push('找回密码页被登录守卫拦了')

  const sent = []
  await guest.route('**/api/v1/auth/reset-password', async (route) => {
    sent.push(route.request().postData())
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'OK', message: 'success', data: { message: '密码已重置' } }) })
  })
  /* 每次换一个邮箱：后端对同一个邮箱 60 秒内只发一次（第二次回 429），用固定邮箱重跑会撞上 */
  await guestPage.fill('#email', 'live-check-' + Date.now() + '@example.com')
  await guestPage.locator('[data-send-code]').click() /* 真的打 /auth/email-code（purpose=RESET） */
  /* 发得出去或撞限流，两种都算这一步验到了 */
  await guestPage.waitForFunction(() => {
    const note = document.querySelector('[data-send-note]')
    const error = document.querySelector('[data-reset-error]')
    return !note.hidden || (error && !error.hidden)
  })
  const resetNote = (await guestPage.locator('[data-send-note]').isHidden()) ? '' : await guestPage.locator('[data-send-note]').innerText()
  const resetError = (await guestPage.locator('[data-reset-error]').isHidden()) ? '' : await guestPage.locator('[data-reset-error]').innerText()
  log('找回密码 · 真发验证码 →', resetNote || resetError)
  await guestPage.fill('#code', '123456')
  await guestPage.fill('#newpass', 'NewPass12345')
  await guestPage.fill('#again', 'NewPass12345')
  await guestPage.locator('button[type="submit"]').click()
  await guestPage.waitForTimeout(800)
  log('找回密码 · 提交 →', JSON.stringify(sent[sent.length - 1]))
  if (!sent.length || !/"newPassword":"NewPass12345"/.test(sent[0])) problems.push('reset-password 的请求体不对')
  await guest.close()
}

/* ============================ 3 · 通知中心 ============================ */
await page.goto(BASE + '/notifications.html', { waitUntil: 'load' })
await page.waitForSelector('[data-list] .empty')
log('\n通知 · 真库空态:', (await page.locator('[data-list] .empty').innerText()).replace(/\n/g, ' | '))
log('通知 · 计数:', await page.locator('[data-count]').innerText())
log('通知 · 页头角标（0 条时应当是隐藏的）:', await page.locator('.masthead__actions [data-unread]').isHidden() ? '隐藏 ✓' : '显示 ✗')

const marked = []
const FAKE_NOTI = [
  { id: 501, type: 'APPOINTMENT', title: '预约已确认', content: '你和林教练 10 月 14 日 20:00 的对话已确认。', isRead: false, createdAt: '2026-10-11T12:31:00.000Z' },
  { id: 502, type: 'SYSTEM', title: '这周的情绪有点沉', content: '连着的三天都记了「低落」。', isRead: false, createdAt: '2026-10-10T01:12:00.000Z' },
  { id: 503, type: 'AUDIT', title: '资料已通过', content: '你的教练入驻资料审核通过了。', isRead: true, createdAt: '2026-10-08T13:40:00.000Z' },
]
let notiState = FAKE_NOTI.map((item) => ({ ...item }))
await context.route('**/api/v1/notifications**', async (route) => {
  const url = route.request().url()
  const method = route.request().method()
  const wrap = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'OK', message: 'success', data }) })
  if (method === 'POST') {
    marked.push(url.replace(BASE, '') + ' ' + (route.request().postData() || ''))
    const one = url.match(/notifications\/(\d+)\/read/)
    if (one) notiState = notiState.map((item) => (String(item.id) === one[1] ? { ...item, isRead: true } : item))
    if (url.includes('read-all')) notiState = notiState.map((item) => ({ ...item, isRead: true }))
    return wrap({ message: 'ok' })
  }
  if (url.includes('unread-count')) return wrap({ count: notiState.filter((item) => !item.isRead).length })
  const items = url.includes('unreadOnly=true') ? notiState.filter((item) => !item.isRead) : notiState
  return wrap({ items: items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0, hasMore: false } })
})
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('[data-list] .noti')
log('通知 · 3 条（2 未读）→', await page.locator('[data-count]').innerText(), '| 未读点', await page.locator('[data-list] .noti:not(.is-read)').count())
log('通知 · 页头角标:', await page.locator('.masthead__actions [data-unread]').innerText())
/* 给最后一行打个记号，标完一条之后它应该还在 —— 证明是就地改，不是重画整张表 */
await page.evaluate(() => {
  document.querySelectorAll('[data-list] .noti')[2].dataset.keep = 'yes'
})
await page.locator('[data-list] .noti:not(.is-read) [data-read]').first().click()
await page.waitForFunction(() => document.querySelectorAll('[data-list] .noti:not(.is-read)').length === 1)
const kept = await page.evaluate(() => Boolean(document.querySelector('[data-list] .noti[data-keep="yes"]')))
log('通知 · 标记一条已读 →', JSON.stringify(marked[marked.length - 1]), '| 未读剩', await page.locator('[data-list] .noti:not(.is-read)').count())
log('通知 · 别的行还是原来那个节点:', kept ? '是 ✓（就地改，没有重画整张表）' : '不是 ✗（整张表被重画了）')
if (!kept) problems.push('标记已读把整张表重画了')
await page.locator('[data-read-all]').click()
/* 等那个 POST 真的发出去：页面此时已经没有未读行了，光看界面看不出请求有没有回来 */
for (let tick = 0; tick < 40 && marked.length < 3; tick++) await page.waitForTimeout(100)
log('通知 · 全部已读 →', JSON.stringify(marked[marked.length - 1]))
await page.waitForFunction(() => document.querySelector('[data-read-all]').disabled)
log('通知 · 全读完之后「全部标为已读」自己禁用了 ✓')
await page.locator('[data-only="1"]').click()
await page.waitForSelector('[data-list] .empty')
log('通知 · 「只看未读」空态:', (await page.locator('[data-list] .empty').innerText()).split('\n')[0])
await context.unroute('**/api/v1/notifications**')

/* ============================ 4 · 钱包 ============================ */
await page.goto(BASE + '/wallet.html', { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('[data-balance]').textContent !== '—')
log('\n钱包 · 真库余额:', await page.locator('[data-balance]').innerText(), '| 流水:', (await page.locator('[data-transactions]').innerText()).split('\n')[0])
if (!/还没有流水/.test(await page.locator('[data-transactions]').innerText())) problems.push('钱包空态没出来')

const topups = []
await context.route('**/api/v1/wallet/topup', async (route) => {
  topups.push(route.request().postData())
  return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ code: 'OK', message: 'success', data: { balanceInCents: 10000, credited: true } }) })
})
await context.route('**/api/v1/wallet/transactions**', async (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      code: 'OK',
      message: 'success',
      data: {
        items: [
          { changeInCents: 10000, balanceAfter: 10000, bizType: 'TOPUP', note: '模拟充值', createdAt: '2026-10-11T13:02:00.000Z' },
          { changeInCents: -9900, balanceAfter: 100, bizType: 'APPOINTMENT_PAY', note: '与知夏的一次对话', createdAt: '2026-10-10T12:00:00.000Z' },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1, hasMore: false },
      },
    }),
  }),
)
await page.locator('[data-amount="10000"]').click()
await page.waitForFunction(() => document.querySelector('[data-balance]').textContent === '¥100')
log('钱包 · 充值 ¥100 →', JSON.stringify(topups[topups.length - 1]), '| 余额', await page.locator('[data-balance]').innerText())
log('钱包 · 流水第一行:', (await page.locator('[data-transactions] tr').first().innerText()).replace(/\n/g, ' | '))
await page.fill('#amount', '30.5')
await page.locator('[data-topup]').click()
await page.waitForFunction(() => document.querySelector('[data-balance]').textContent === '¥100')
log('钱包 · 自定义 30.5 元 →', JSON.stringify(topups[topups.length - 1]))
if (!/"amountInCents":3050/.test(topups[topups.length - 1])) problems.push('自定义金额没换算成分')
await page.fill('#amount', '0.5')
await page.locator('[data-topup]').click()
await page.waitForTimeout(300)
log('钱包 · 少于 1 元:', await page.locator('[data-topup-note]').innerText())
await context.unroute('**/api/v1/wallet/topup')
await context.unroute('**/api/v1/wallet/transactions**')

/* ============================ 5 · 社群详情 ============================ */
/* 先把上一次跑剩的东西清掉（成员身份 + 临时帖），保证从头开始 */
await fetch(API + '/communities/1/leave', { method: 'POST', headers: auth, body: '{}' }).catch(() => {})
const POST_TEXT = '自检临时帖（脚本会删掉）：今天把拖了很久的一件小事做完了。'
async function sweepTempPosts() {
  const data = await (await fetch(API + '/communities/1/posts?page=1&pageSize=50', { headers: auth })).json()
  const leftovers = ((data.data || {}).items || []).filter((p) => p.content === POST_TEXT)
  for (const post of leftovers) {
    await fetch(API + '/communities/1/posts/' + post.id, { method: 'DELETE', headers: auth })
  }
  return leftovers.length
}
const swept = await sweepTempPosts().catch(() => 0)
if (swept) log('社群 · 清掉上一次留下的临时帖', swept, '条')
const before = (await (await fetch(API + '/communities/1', { headers: auth })).json()).data
await page.goto(BASE + '/community-detail.html?id=1', { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('[data-name]').textContent !== '职场成长群')
log('\n社群 · 抬头:', (await page.locator('.cd').innerText()).replace(/\n+/g, ' | '))
log('社群 · 未加入时帖子区:', (await page.locator('[data-posts] .empty').innerText()).split('\n')[0])
if (before.joined) problems.push('社群 1 起步就是已加入状态，测不了加入流程')

await page.locator('[data-join]').click()
await page.waitForSelector('[data-composer]:not([hidden])')
log('社群 · 加入后:', (await page.locator('.cd').innerText()).replace(/\n+/g, ' | '))
await page.waitForSelector('[data-posts] .empty, [data-posts] .cpost')
log('社群 · 加入后帖子区:', (await page.locator('[data-posts]').innerText()).split('\n')[0])

await page.fill('#content', POST_TEXT)
await page.locator('[data-post-submit]').click()
await page.waitForFunction((t) => document.querySelector('[data-posts]').innerText.includes(t), POST_TEXT)
log('社群 · 发帖后第一条:', (await page.locator('[data-posts] .cpost').first().innerText()).replace(/\n/g, ' | '))
await page.locator('[data-posts] .cpost [data-like]').first().click()
await page.waitForFunction(() => /已赞/.test(document.querySelector('[data-posts] .cpost [data-like]').textContent))
log('社群 · 点赞 →', await page.locator('[data-posts] .cpost [data-like]').first().innerText())

/* 还原：先删掉临时帖（还是成员才读得到），再退出社群 —— 顺序反了就读不到帖子了 */
const made = await sweepTempPosts()
const leftInGroup = await sweepTempPosts()
await page.locator('[data-join]').click()
await page.waitForFunction(() => document.querySelector('[data-state]').textContent === '未加入')
const restored = (await (await fetch(API + '/communities/1', { headers: auth })).json()).data
log(
  '社群 · 还原 →',
  '删掉临时帖 ' + made + ' 条 · 组里还剩 ' + leftInGroup + ' 条 · 退出社群 · 成员数回到 ' + restored.memberCount + (restored.joined ? ' ✗' : ' ✓'),
)
if (restored.joined || made < 1 || leftInGroup !== 0) problems.push('社群那一轮没有还原干净')

/* ============================ 6 · 个人中心 ============================ */
await page.goto(BASE + '/profile.html', { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('#nick').value !== '小舟')
log('\n个人中心 · 真资料:', await page.locator('.account__name').innerText(), '|', await page.locator('.account__meta').innerText())
log('个人中心 · 邮箱状态:', await page.locator('[data-mail-note]').innerText())

const caught = []
await context.route('**/api/v1/users/me/password', async (route) => {
  caught.push(['password', route.request().postData()])
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'OK', message: 'success', data: { message: '密码已修改' } }) })
})
await context.route('**/api/v1/users/me/delete', async (route) => {
  caught.push(['delete', route.request().postData()])
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'OK', message: 'success', data: { message: '账号已删除' } }) })
})
await page.fill('#oldpass', 'Demo123456')
await page.fill('#newpass', 'NewPass12345')
await page.fill('#again', 'NewPass12345')
await page.locator('[data-password-form] button[type="submit"]').click()
await page.waitForFunction(() => /正在回登录页/.test(document.querySelector('[data-password-form]').innerText))
log('个人中心 · 改密码（只验请求）→', JSON.stringify(caught[0]))
await page.goto(BASE + '/profile.html', { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('#nick').value !== '小舟')

await page.locator('[data-export]').click()
/* 等这次请求有回音（上一次跑留下的记录会让 .row 立刻就在，所以不能等它） */
await page.waitForFunction(() => document.querySelector('[data-privacy-msg]').innerText.trim().length > 0)
await page.waitForSelector('[data-exports] .row')
log('个人中心 · 导出:', await page.locator('[data-privacy-msg]').innerText(), '|', (await page.locator('[data-exports] .row').first().innerText()).replace(/\n/g, ' | '))
const download = page.waitForEvent('download', { timeout: 8000 })
await page.locator('[data-exports] [data-download]').first().click()
const file = await download
log('个人中心 · 下载:', file.suggestedFilename())

await page.locator('[data-delete]').click()
await page.waitForSelector('[data-confirm-password]')
await page.fill('[data-confirm-password]', 'Demo123456')
await page.locator('[data-yes]').click()
await page.waitForFunction(() => /正在回首页/.test(document.querySelector('[data-privacy-msg]').innerText))
log('个人中心 · 删除（只验请求，没真删）→', JSON.stringify(caught[1]))
if (!/"password":"Demo123456"/.test(caught[1])) problems.push('删除账号的请求体不对')

/* ============================ 7 · 会话中途过期 ============================ */
{
  const stale = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const stalePage = await stale.newPage()
  await stalePage.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' })
  await stalePage.evaluate(
    ([t, n]) => {
      localStorage.setItem('mb_access_token', t)
      localStorage.setItem('feisi_backend', 'live')
      localStorage.setItem('feisi_nickname', n)
      localStorage.setItem('feisi_role', 'USER')
    },
    [token, loginBody.data.user.nickname],
  )
  await stalePage.goto(BASE + '/wallet.html', { waitUntil: 'load' })
  await stalePage.waitForFunction(() => document.querySelector('[data-balance]').textContent !== '—')
  /* 页面开着的时候 token 失效：点一个动作，应该被送回登录页并带上 next */
  await stalePage.evaluate(() => localStorage.setItem('mb_access_token', 'broken.token.value'))
  await stalePage.locator('[data-amount="5000"]').click()
  await stalePage.waitForURL(/login\.html/, { timeout: 8000 }).catch(() => {})
  const where = stalePage.url().replace(BASE, '')
  const left = await stalePage.evaluate(() => localStorage.getItem('mb_access_token'))
  log('会话过期 · 点动作后 →', where, '| 本地 token:', left)
  if (!/^\/login\.html\?next=wallet\.html/.test(where)) problems.push('token 中途失效没有送回登录页：' + where)
  if (left !== null) problems.push('token 失效后没有清掉本地凭证')
  await stale.close()
}

log('\n--- 控制台问题 ---')
log(problems.length ? problems.join('\n') : '无')
await browser.close()
process.exit(problems.length ? 1 : 0)
