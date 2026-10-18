/**
 * 优先级一自检 · 坏情况（对着 tools/growth-fixture.cjs 的假后端跑）
 *
 * 验评审那两条：「部分接口失败被转换成空数组或零 → 服务故障被展示成『你没有记录』」，
 * 以及「提交没成功，却不能看起来像成功了」。
 *
 * 用法：  node tools/priority-one-failure-check.mjs
 * 需要本机有 Chrome（playwright 的 channel=chrome）；夹具服务由脚本自己起、自己关。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(HERE, 'growth-fixture.cjs')
const BASE = 'http://127.0.0.1:5189'

const passes = []
const problems = []

function check(name, condition, detail) {
  if (condition) passes.push(name)
  else problems.push(name + (detail ? ' —— ' + detail : ''))
}

async function setup(scenario) {
  const response = await fetch(BASE + '/__test/setup?scenario=' + scenario)
  if (!response.ok) throw new Error('夹具没起来')
  return response.json()
}

async function status() {
  const payload = await (await fetch(BASE + '/__test/status')).json()
  return payload.data
}

const fixture = spawn(process.execPath, [FIXTURE], { stdio: ['ignore', 'pipe', 'pipe'] })
fixture.stderr.on('data', (chunk) => process.stderr.write('[fixture] ' + chunk))
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('夹具启动超时')), 15000)
  fixture.stdout.on('data', (chunk) => {
    if (/ready on/.test(String(chunk))) {
      clearTimeout(timer)
      resolve()
    }
  })
})

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()
let consoleErrors = []
/* 夹具是故意让接口 503 的：浏览器把「请求失败」记进 console 是正常现象，
   这里只关心脚本自己抛的错（pageerror / 未捕获异常），所以把网络 503 排除掉 */
function realErrors() {
  return consoleErrors.filter((text) => !/503 \(Service Unavailable\)/.test(text))
}
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message))

async function bodyText() {
  return page.evaluate(() => document.body.innerText)
}

/* 页面上有没有混进设计演示稿那批写死的示例数字 / 示例条目 */
function demoLeaks(text) {
  return [
    '68 · +6',
    '72 · +8',
    '5 天连续记录',
    '睡前把明天要做的三件事',
    '再记两天，解锁「连续 7 天」徽章',
    '这半个月里，我能说出自己当下是什么情绪',
    '今晚先列出论文的三个待办',
    '三个待办都写在纸上，拍照存下来',
  ].filter((needle) => text.includes(needle))
}

async function waitFor(regex, timeout = 15000) {
  await page.waitForFunction((source) => new RegExp(source).test(document.body.innerText), regex.source, { timeout })
}

/* ── 场景一：新账号，没有任何记录 ─────────────────────────────────── */
await setup('fresh')
consoleErrors = []
await page.goto(BASE + '/assessment.html?live=1', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.quiz .q', { timeout: 15000 })
check('量表正常时渲染题目（5 题）', (await page.$$('.quiz .q')).length === 5)
check('量表正常时提交按钮可用', !(await page.isDisabled('[data-assessment-submit]')))
await page.waitForFunction(
  () => /还没有测评结果/.test(document.querySelector('[data-assessment-result]').innerText),
  undefined,
  { timeout: 15000 },
)
check('没有测评历史时结果是空态', true)

await page.goto(BASE + '/my-growth.html?live=1', { waitUntil: 'domcontentloaded' })
await waitFor(/还没有测评结果/)
const freshStats = await page.$$eval('[data-stat]', (nodes) => nodes.map((node) => node.querySelector('strong').textContent.trim()))
check('新账号每个累计数都是 0', freshStats.every((value) => value === '0'), JSON.stringify(freshStats))
const freshText = await bodyText()
check('新账号页面上没有加载失败的痕迹', !/读取失败/.test(freshText))
check('新账号时间轴是空态', /还没有记录/.test(freshText))
const freshLeaks = demoLeaks(freshText)
check('新账号页面上没有示例数字 / 示例条目', freshLeaks.length === 0, JSON.stringify(freshLeaks))
check('新账号没有脚本报错', realErrors().length === 0, JSON.stringify(realErrors()))

/* ── 场景二：量表接口 503 ────────────────────────────────────────── */
await setup('template-error')
consoleErrors = []
await page.goto(BASE + '/assessment.html?live=1', { waitUntil: 'domcontentloaded' })
await waitFor(/题目读取失败/)
check('量表读不到时页面明说读取失败', true)
check('量表读不到时不显示写死的示例题', (await page.$$('.quiz .q')).length === 0)
check('量表读不到时不能提交', await page.isDisabled('[data-assessment-submit]'))
check('量表读不到时给了重试', (await page.$$('.quiz button')).length > 0)
await page.click('.quiz button')
await page.waitForTimeout(800)
check('重试仍然失败时还是失败（不会退回示例题）', /题目读取失败/.test(await bodyText()))
check('量表失败场景没有脚本报错', realErrors().length === 0, JSON.stringify(realErrors()))

/* ── 场景三：提交接口 503 ───────────────────────────────────────── */
await setup('save-error')
consoleErrors = []
await page.goto(BASE + '/assessment.html?live=1', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.quiz .q', { timeout: 15000 })
for (let index = 1; index <= 5; index += 1) {
  await page.click('.quiz .q:nth-child(' + index + ') .scale button[data-value="4"]')
}
await page.click('[data-assessment-submit]')
await waitFor(/未能确认保存成功/)
check('保存失败时明说没确认成功', true)
check('保存失败时不跳转到成长页', /assessment\.html/.test(page.url()), page.url())
check('保存失败时按钮能再按一次', !(await page.isDisabled('[data-assessment-submit]')))
const kept = await page.$$eval('.scale button[aria-pressed="true"]', (nodes) => nodes.length)
check('保存失败时答案还留在页面上（不用重答）', kept === 5, '保留 ' + kept + ' 题')
check('保存失败时页面没说已经生成结果', !/保存成功，正在打开/.test(await bodyText()))
const posted = await status()
check('确实发出去了一次提交请求、且后端没存下结果', posted.posts === 1 && posted.results === 0, JSON.stringify(posted))
check('提交失败场景没有脚本报错', realErrors().length === 0, JSON.stringify(realErrors()))

/* ── 场景四：一处接口 503、其余正常 ──────────────────────────────── */
await setup('partial-error')
consoleErrors = []
await page.goto(BASE + '/my-growth.html?live=1', { waitUntil: 'domcontentloaded' })
await waitFor(/读取失败/)
const failedCell = await page.$eval('[data-stat="journals"]', (node) => ({
  value: node.querySelector('strong').textContent.trim(),
  note: node.querySelector('p').textContent.trim(),
  retry: !!node.querySelector('button'),
}))
check('失败的来源单独显示读取失败', failedCell.value === '—' && /读取失败/.test(failedCell.note), JSON.stringify(failedCell))
check('失败的来源给了重试按钮', failedCell.retry)
const okCells = await page.$$eval('[data-stat]', (nodes) =>
  nodes
    .filter((node) => node.dataset.stat !== 'journals')
    .map((node) => ({ value: node.querySelector('strong').textContent.trim(), note: node.querySelector('p').textContent.trim() })),
)
check('没失败的那几项照常显示 0（不是被牵连成空数组）', okCells.every((cell) => cell.value === '0' && !/失败/.test(cell.note)), JSON.stringify(okCells))
const partialText = await bodyText()
check('一处失败不会被说成「你没有记录」', !/还没有记录/.test(partialText), '页面上写着空态')
check('时间轴说清楚哪一块没读到', /部分记录尚未加载/.test(partialText) && /情绪日记/.test(partialText))
await page.click('[data-stat="journals"] button')
await page.waitForTimeout(800)
check('重试仍失败时还是失败状态', /读取失败/.test(await page.$eval('[data-stat="journals"] p', (node) => node.textContent)))
check('局部失败场景没有脚本报错', realErrors().length === 0, JSON.stringify(realErrors()))

/* ── 场景五：有记录，且分页总数与第一页条数不一样 ─────────────────── */
await setup('populated')
consoleErrors = []
await page.goto(BASE + '/my-growth.html?live=1', { waitUntil: 'domcontentloaded' })
await waitFor(/较上次/)
const populatedStats = await page.$$eval('[data-stat]', (nodes) =>
  Object.fromEntries(nodes.map((node) => [node.dataset.stat, node.querySelector('strong').textContent.trim()])),
)
check(
  '累计数用后端的分页总数 123，不是第一页的 1 条',
  populatedStats.journals === '123' && populatedStats.records === '123' && populatedStats.conversations === '123',
  JSON.stringify(populatedStats),
)
check('累计测评数为 2', populatedStats.assessments === '2', JSON.stringify(populatedStats))
const populatedDims = await page.$$eval('.dims .dim', (nodes) =>
  nodes.map((node) => ({
    value: node.querySelector('.dim__label em').textContent.trim(),
    note: node.querySelector('.panel__note').textContent.trim(),
    width: node.querySelector('.meter i').style.width,
  })),
)
check('五维分数来自保存的结果（4.00 / 5）', populatedDims.length === 5 && populatedDims.every((dim) => dim.value === '4.00 / 5'), JSON.stringify(populatedDims.map((dim) => dim.value)))
check('增幅是与上一次真实结果比出来的 +1.00', populatedDims.every((dim) => /较上次 \+1\.00/.test(dim.note)), JSON.stringify(populatedDims.map((dim) => dim.note)))
check('柱条宽度跟着分值走', populatedDims.every((dim) => dim.width === '80%'))
const populatedFoot = await page.$eval('#dim-title', (node) => node.closest('.panel').querySelector('.panel__foot').textContent)
check('说明这是与上次同量表比较', /变化与上次同量表测评比较/.test(populatedFoot), populatedFoot)
const timelineRows = await page.$$eval('.timeline .tl', (nodes) => nodes.map((node) => node.querySelector('.tl__title').textContent.trim()))
check('时间轴把各类记录都排上了', timelineRows.length === 5 && /成长测评/.test(timelineRows.join(',')), JSON.stringify(timelineRows))
check('有记录场景没有脚本报错', realErrors().length === 0, JSON.stringify(realErrors()))

await browser.close()
fixture.kill()

console.log('\n通过 ' + passes.length + ' 项：')
passes.forEach((name) => console.log('  ✓ ' + name))
if (problems.length) {
  console.log('\n未通过 ' + problems.length + ' 项：')
  problems.forEach((name) => console.log('  ✗ ' + name))
}
process.exit(problems.length ? 1 : 0)
