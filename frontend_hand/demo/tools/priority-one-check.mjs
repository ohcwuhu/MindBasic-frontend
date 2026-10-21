/**
 * 优先级一自检 · 「测评 → 结果 → 成长」闭环（真后端 + 真浏览器，不 mock）
 *
 * 对着评审提的那五条验：
 *   1. 测评页的「提交，看结果」是真按钮，提交成功后带着本次结果进成长页；
 *   2. 成长页的五维分数、时间、差值全部来自真实结果（新账号是空态，不是示例分）；
 *   3. 统计口径：累计数量用 pagination.totalItems，不是第一页的 items.length；
 *   4. 接口失败不伪装成「零记录」，加载中 / 暂无记录 / 加载失败分得开，失败可重试；
 *   5. 自我教练记录与 AI 会话分开计数、分开命名。
 * 另外跑一遍「退出 → 重新登录 → 结果还在」。
 *
 * 跑之前两件东西要在（同其他 *-live-check.mjs）：
 *   1. 后端 127.0.0.1:8000；2. 开发服务器 127.0.0.1:5178（代理 /api）。
 * 用法：  node tools/priority-one-check.mjs
 *
 * 会真建一个账号（手机号按时间戳生成，注册限流 5 次/分钟，别连着猛跑），并在它身上完成一次
 * 真实测评。截图落在 .cache/review/priority-one-*.png。
 *
 * 跑完自动把临时账号连它名下的行一起清掉（tools/test-account.py drop）。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEMO = path.resolve(HERE, '..')
const BACKEND = path.resolve(DEMO, '..', '..', 'MindBasic-backend')
const HELPER = path.join(HERE, 'test-account.py')
const SHOTS = path.join(DEMO, '.cache', 'review')
const BASE = 'http://127.0.0.1:5178'
const API = 'http://127.0.0.1:8000/api/v1'
const PASSWORD = 'Feisi2026test'
const PHONE = '139' + String(Date.now()).slice(-8)

const passes = []
const problems = []

function check(name, condition, detail) {
  if (condition) passes.push(name)
  else problems.push(name + (detail ? ' —— ' + detail : ''))
}

async function call(method, route, body, token) {
  const response = await fetch(API + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, payload, data: payload.data }
}

fs.mkdirSync(SHOTS, { recursive: true })

/* ── 起一个干净的账号：注册 → 拿 token ─────────────────────────────── */
const registered = await call('POST', '/auth/register', {
  phone: PHONE,
  password: PASSWORD,
  nickname: '自检用户',
  gender: 'girl',
  privacyAgreed: true,
  serviceAgreed: true,
})
if (registered.status !== 201 || !registered.data || !registered.data.accessToken) {
  console.error('注册失败，后面的检查没法做：', registered.status, JSON.stringify(registered.payload))
  process.exit(2)
}
const token = registered.data.accessToken
const auth = { Authorization: 'Bearer ' + token }
console.log('新账号 ' + PHONE + ' 注册完成（id ' + registered.data.user.id + '）')

/* 后端真实的量表：题目数量与文案，是等下要拿来和页面对账的基准 */
const template = (await call('GET', '/growth-assessments/template', undefined, token)).data
check('后端量表可读', Array.isArray(template.questions) && template.questions.length > 0)

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()
page.on('console', (message) => {
  if (message.type() === 'error') problems.push('console: ' + message.text())
})
page.on('pageerror', (error) => problems.push('pageerror: ' + error.message))

/* 版式自查：真数据比示例数据长，接上后端之后最容易出问题的就是「溢出去」和「图没加载」 */
async function layoutProblems(label) {
  const measured = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    brokenImages: Array.from(document.images)
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute('src')),
  }))
  check(label + '不横向溢出', measured.scrollWidth <= measured.innerWidth + 1, JSON.stringify(measured))
  check(label + '图片都加载出来了', measured.brokenImages.length === 0, JSON.stringify(measured.brokenImages))
}

async function signIn(next) {
  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ([accessToken, nickname, role]) => {
      localStorage.setItem('mb_access_token', accessToken)
      localStorage.setItem('feisi_backend', 'live')
      localStorage.setItem('feisi_nickname', nickname)
      localStorage.setItem('feisi_role', role)
    },
    [token, registered.data.user.nickname, registered.data.user.role],
  )
  if (next) await page.goto(BASE + '/' + next, { waitUntil: 'domcontentloaded' })
}
await signIn()

/* ── 1. 测评页：题目来自真量表，提交是真按钮 ───────────────────────── */
await page.goto(BASE + '/assessment.html?live=1', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.quiz .q', { timeout: 15000 })

const rendered = await page.$$eval('.quiz .q', (nodes) =>
  nodes.map((node) => ({
    text: node.querySelector('.q__text').textContent.trim(),
    dimension: node.querySelector('.q__dim').textContent.trim(),
    options: Array.from(node.querySelectorAll('.scale button')).map((button) => button.dataset.value),
  })),
)
check(
  '测评页渲染的是真量表的 ' + template.questions.length + ' 道题',
  rendered.length === template.questions.length,
  '页面上 ' + rendered.length + ' 题',
)
check(
  '题干与后端量表逐条一致（不是写死的示例题）',
  rendered.every((item, index) => item.text === template.questions[index].question),
)
check(
  '每题按后端选项渲染 1–5 分',
  rendered.every((item) => item.options.join(',') === '1,2,3,4,5'),
)
check(
  '维度名来自后端',
  rendered.every((item, index) => item.dimension.includes(template.questions[index].dimensionName)),
)

const submitIsButton = await page.$eval('[data-assessment-submit]', (node) => node.tagName)
check('「提交，看结果」是 button（不是跳转链接）', submitIsButton === 'BUTTON', '实际是 ' + submitIsButton)

const resultBefore = await page.$eval('[data-assessment-result]', (node) => node.textContent.trim())
check(
  '新账号在结果区看到空态而不是示例分数',
  /还没有测评结果/.test(resultBefore),
  '实际：' + resultBefore.slice(0, 60),
)
check('新账号结果区没有示例分数 68 / +6', !/\b68\b|\+6\b/.test(resultBefore))
await layoutProblems('接上后端后的测评页')

await page.screenshot({ path: path.join(SHOTS, 'priority-one-1-assessment-fresh.png'), fullPage: true })

/* ── 2. 完整作答 → 提交 → 落到成长页的本次结果 ─────────────────────── */
for (let index = 0; index < template.questions.length; index += 1) {
  await page.click('.quiz .q:nth-child(' + (index + 1) + ') .scale button[data-value="4"]')
}
const answered = await page.getAttribute('[data-answer-progress]', 'aria-valuenow')
check(
  '进度条记满 ' + template.questions.length + ' 题',
  Number(answered) === template.questions.length,
  'aria-valuenow=' + answered,
)
const statusBefore = await page.$eval('[data-quiz-status]', (node) => node.textContent.trim())
check('作答状态实时反馈', /已答\s*\d+\s*\/\s*\d+/.test(statusBefore), '实际：' + statusBefore)

await Promise.all([
  page.waitForURL(/my-growth\.html\?live=1&assessment=\d+/, { timeout: 20000 }),
  page.click('[data-assessment-submit]'),
])
const savedId = new URL(page.url()).searchParams.get('assessment')
check('提交成功后带着本次结果 id 进成长页', /^\d+$/.test(String(savedId)), 'url=' + page.url())

await page.waitForSelector('.dims .dim', { timeout: 20000 })
await page.waitForFunction(
  () => !/正在读取'.$/.test(document.querySelector('#dim-title').closest('.panel').querySelector('.panel__foot').textContent),
  undefined,
  { timeout: 20000 },
)
const dims = await page.$$eval('.dims .dim', (nodes) =>
  nodes.map((node) => ({
    name: node.querySelector('.dim__label strong').textContent.trim(),
    value: node.querySelector('.dim__label em').textContent.trim(),
    note: node.querySelector('.panel__note') ? node.querySelector('.panel__note').textContent.trim() : '',
    width: node.querySelector('.meter i').style.width,
  })),
)
check('成长页五维都按本次答案算出来（全 4 分 → 4.00 / 5）', dims.length === 5 && dims.every((d) => d.value === '4.00 / 5'), JSON.stringify(dims.map((d) => d.value)))
check('五维名称来自后端', dims.every((d) => d.name), JSON.stringify(dims.map((d) => d.name)))
check('柱条宽度跟着分数走（4/5 = 80%）', dims.every((d) => d.width === '80%'), JSON.stringify(dims.map((d) => d.width)))
check('每维带等级说明', dims.every((d) => d.note), JSON.stringify(dims.map((d) => d.note)))

const dimFoot = await page.$eval('#dim-title', (node) => node.closest('.panel').querySelector('.panel__foot').textContent.trim())
check('结果区标注了测评时间', /测评时间：/.test(dimFoot), '实际：' + dimFoot)
check('首次测评不显示差值', !/较上次/.test(dimFoot + JSON.stringify(dims)))
check('结果区不再出现示例分数 68 / 54 / 61 / 47 / 72', !/\b(68|54|61|47|72)\b/.test(JSON.stringify(dims)))
check('结果区不再出现示例增幅 +6 / +3 / +4 / +2 / +8', !/\+[23468]\b/.test(JSON.stringify(dims)))
await layoutProblems('接上后端后的成长页')

await page.screenshot({ path: path.join(SHOTS, 'priority-one-2-growth-fresh-result.png'), fullPage: true })

/* ── 3. 统计口径：累计 vs 最近，类型分开命名 ────────────────────────── */
const stats = await page.$$eval('[data-stat]', (nodes) =>
  nodes.map((node) => ({
    key: node.dataset.stat,
    value: node.querySelector('strong').textContent.trim(),
    label: node.querySelector('span').textContent.trim(),
    note: node.querySelector('p').textContent.trim(),
  })),
)
const byKey = Object.fromEntries(stats.map((item) => [item.key, item]))
check('统计区四类记录都在', stats.length === 4, JSON.stringify(stats.map((s) => s.key)))
check('测评累计数为 1（真的来自 pagination.totalItems）', byKey.assessments && byKey.assessments.value === '1', JSON.stringify(byKey.assessments))
check('新账号其它累计数为 0，且不是加载失败', stats.filter((s) => s.key !== 'assessments').every((s) => s.value === '0' && !/失败/.test(s.note)), JSON.stringify(stats))
check('统计标注了「累计」口径', stats.every((s) => /累计/.test(s.label)), JSON.stringify(stats.map((s) => s.label)))
const labeledCoach = stats.some((s) => /自我教练/.test(s.label))
const labeledAi = stats.some((s) => /AI 会话/.test(s.label))
check('自我教练记录与 AI 会话分开命名', labeledCoach && labeledAi, JSON.stringify(stats.map((s) => s.label)))

const streak = await page.$eval('.streak-head__count', (node) => node.textContent.trim())
check('连续记录读的是打卡统计（新账号 0 天，不是示例的 5 天）', /0/.test(streak) && !/5/.test(streak), '实际：' + streak)
const badgeNote = await page.$eval('#badge-title', (node) => node.closest('.panel').querySelector('.panel__note').textContent.trim())
check('徽章数量来自接口（新账号 0 枚）', /0/.test(badgeNote) && !/失败/.test(badgeNote), '实际：' + badgeNote)
const timeline = await page.$eval('.timeline', (node) => node.textContent.trim())
const timelineRows = await page.$$eval('.timeline .tl', (nodes) =>
  nodes.map((node) => ({
    title: node.querySelector('.tl__title').textContent.trim(),
    text: node.querySelector('.tl__text').textContent.trim(),
    time: node.querySelector('time').textContent.trim(),
  })),
)
check(
  '时间轴上只有刚才这一次测评（真实记录，不是示例）',
  timelineRows.length === 1 && /成长测评/.test(timelineRows[0].title) && /成长状态自评/.test(timelineRows[0].text),
  JSON.stringify(timelineRows),
)
check('时间轴不再显示示例条目（10 月 9 日那批）', !/10 月 9 日|睡前把明天要做的三件事/.test(timeline))
check('时间轴不让其它类别跟着显得「有记录」', !/AI 会话|情绪日记|打卡/.test(timelineRows.map((row) => row.title).join(',')))

/* ── 4. 退出 → 重新登录 → 结果还在（走真登录页） ───────────────────── */
await page.evaluate(() => localStorage.clear())
await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' })
await page.fill('#phone', PHONE)
await page.fill('#password', PASSWORD)
await Promise.all([page.waitForURL(/index\.html/, { timeout: 20000 }), page.click('form.form button[type="submit"]')])
const mode = await page.evaluate(() => localStorage.getItem('feisi_backend'))
check('登录页会写下 feisi_backend=live', mode === 'live', '实际：' + mode)

await page.goto(BASE + '/my-growth.html', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.dims .dim', { timeout: 20000 })
const dimsAgain = await page.$$eval('.dims .dim', (nodes) => nodes.map((node) => node.querySelector('.dim__label em').textContent.trim()))
check('退出后重新登录，本次结果仍能读回', dimsAgain.join(',') === dims.map((d) => d.value).join(','), JSON.stringify(dimsAgain))
const assessmentsAgain = await page.$eval('[data-stat="assessments"] strong', (node) => node.textContent.trim())
check('累计测评数在重新登录后仍是 1', assessmentsAgain === '1', '实际：' + assessmentsAgain)

/* 直接打开测评页（无 assessment 参数）也要落在最近一次结果上 */
await page.goto(BASE + '/assessment.html?live=1', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-assessment-result] .dim', { timeout: 20000 })
const latest = await page.$$eval('[data-assessment-result] .dim', (nodes) => nodes.map((node) => node.querySelector('.dim__label em').textContent.trim()))
check('测评页右栏回读最近一次结果', latest.join(',') === dims.map((d) => d.value).join(','), JSON.stringify(latest))
await page.screenshot({ path: path.join(SHOTS, 'priority-one-3-assessment-after-login.png'), fullPage: true })

/* ── 收尾：与后端对账，确认库里真的存下了 ─────────────────────────── */
const history = (await call('GET', '/growth-assessments?page=1&pageSize=2', undefined, token)).data
check('库里累计 1 次测评', history.pagination.totalItems === 1, JSON.stringify(history.pagination))
const detail = (await call('GET', '/growth-assessments/' + savedId, undefined, token)).data
check('按 id 取回的结果就是刚才提交的那一份', detail && String(detail.id) === String(savedId))
check('结果分值 1–5，不是百分制', detail.scores.every((score) => score.score >= 1 && score.score <= 5), JSON.stringify(detail.scores))

await browser.close()

/* 跑完清场：把这次自检建的账号和它名下的行删掉（删不掉不影响结论，只提示一句） */
const cleaned = spawnSync(
  path.join(BACKEND, '.venv', 'Scripts', 'python.exe'),
  [HELPER, 'drop', '--phone', PHONE],
  { cwd: BACKEND, encoding: 'utf-8' },
)
console.log(cleaned.status === 0 ? '\n' + String(cleaned.stdout || '').trim() : '\n清场没成功，可按昵称「自检用户」手动清。')

console.log('\n通过 ' + passes.length + ' 项：')
passes.forEach((name) => console.log('  ✓ ' + name))
if (problems.length) {
  console.log('\n未通过 ' + problems.length + ' 项：')
  problems.forEach((name) => console.log('  ✗ ' + name))
}
console.log('\n自检账号：' + PHONE + ' / ' + PASSWORD + '（结果 id ' + savedId + '）')
process.exit(problems.length ? 1 : 0)
