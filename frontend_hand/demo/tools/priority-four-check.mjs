/**
 * 第四优先级自检 · 第一次来的人能不能自己走通
 *
 * 对着评审列的那几条验：
 *   · 主入口附近说清楚「语音陪伴，需要麦克风；摄像头可选」；
 *   · 旁边有「不方便说话？写下此刻」这条不出声的路；
 *   · 「先看看怎么用」进的是三步说明，不是文章列表；
 *   · 未登录 / 麦克风被拒 / 服务连不上，各有各的下一步；
 *   · 页头写「我的成长」，账户设置另开一个入口。
 *
 * 用法：  node tools/priority-four-check.mjs
 * 需要开发服务器 127.0.0.1:5178 与后端 127.0.0.1:8000（只有最后一段「麦克风被拒」用到登录态）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEMO = path.resolve(HERE, '..')
const FILE = (name) => pathToFileURL(path.join(DEMO, name)).href
const BASE = 'http://127.0.0.1:5178'
const API = 'http://127.0.0.1:8000/api/v1'

const passes = []
const problems = []

function check(name, condition, detail) {
  if (condition) passes.push(name)
  else problems.push(name + (detail ? ' —— ' + detail : ''))
}

const browser = await chromium.launch({ channel: 'chrome' })

/* ── 1. 首页：先说清楚要用到什么，再给第二条路 ─────────────────────── */
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })).newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
await page.goto(FILE('index.html'), { waitUntil: 'load' })

const hero = await page.evaluate(() => {
  const need = document.querySelector('.hero__need')
  const primary = document.querySelector('.hero__actions .btn')
  const secondary = document.querySelector('.hero__actions .link-more')
  const journalEntry = Array.from(document.querySelectorAll('.entry')).find((node) =>
    /情绪日记/.test(node.textContent),
  )
  return {
    need: need ? need.textContent.replace(/\s+/g, ' ').trim() : '',
    needLink: need && need.querySelector('a') ? need.querySelector('a').getAttribute('href') : '',
    primaryHref: primary ? primary.getAttribute('href') : '',
    secondaryHref: secondary ? secondary.getAttribute('href') : '',
    journalText: journalEntry ? journalEntry.textContent.replace(/\s+/g, ' ').trim() : '',
  }
})
check('主入口旁边写明需要麦克风', /需要麦克风/.test(hero.need), hero.need)
check('主入口旁边写明摄像头可选', /摄像头可选/.test(hero.need), hero.need)
check('「开始聊聊」仍进自我教练', hero.primaryHref === 'self-coaching.html', hero.primaryHref)
check('「先看看怎么用」进的是三步说明', hero.secondaryHref === 'how-to-use.html', hero.secondaryHref)
check('「不方便说话」有直接可点的日记入口', hero.needLink === 'emotion-journal.html' && /写下此刻/.test(hero.need), hero.needLink)
check('情绪日记那张便签也替不方便出声的人说话', /不方便说话/.test(hero.journalText), hero.journalText)
check('首页没有脚本报错', pageErrors.length === 0, JSON.stringify(pageErrors))
await page.screenshot({ path: path.join(DEMO, '.cache', 'review', 'priority-four-1-home.png'), fullPage: true })

/* ── 2. 三步说明页：三步都在，且每个链接都指得到东西 ─────────────── */
await page.goto(FILE('how-to-use.html'), { waitUntil: 'load' })
const howto = await page.evaluate(() => ({
  title: document.querySelector('.plate__title') ? document.querySelector('.plate__title').textContent.trim() : '',
  steps: Array.from(document.querySelectorAll('.cols--3 .panel__title')).map((node) => node.textContent.trim()),
  body: document.body.innerText,
  links: Array.from(document.querySelectorAll('a[href]')).map((node) => node.getAttribute('href')),
}))
check('三步说明页有标题', howto.title.length > 0, howto.title)
check('三步都在（说出来 / 收个尾 / 回来看一眼）', howto.steps.length === 3, JSON.stringify(howto.steps))
check('第一步说清麦克风与摄像头', /需要麦克风/.test(howto.body) && /摄像头/.test(howto.body))
check('第二步说清四行由用户确认', /以你确认为准|改到你认/.test(howto.body), '页面上没有确认那句话')
check('第三步说清回访与「一天一条」', /做完了/.test(howto.body) && /一天只记一条/.test(howto.body))
check('给了不出声也能用的两条路', /写下此刻/.test(howto.body) && /五维成长自评/.test(howto.body))

const missing = howto.links
  .filter((href) => href && !/^(https?:|tel:|mailto:|#)/.test(href))
  .map((href) => href.split('#')[0].split('?')[0])
  .filter((href) => href && !fs.existsSync(path.join(DEMO, href)))
check('三步说明页上的链接都指得到文件', missing.length === 0, JSON.stringify([...new Set(missing)]))

/* ── 3. 未登录（设计预览）：给「去登录」，也给「写下此刻」 ─────────── */
const previewPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })).newPage()
await previewPage.goto(FILE('self-coaching.html'), { waitUntil: 'load' })
await previewPage.waitForSelector('[data-sc-note="login"]', { timeout: 15000 })
const loginNote = await previewPage.$eval('[data-sc-note="login"]', (node) => ({
  text: node.textContent.replace(/\s+/g, ' ').trim(),
  actions: Array.from(node.querySelectorAll('a, button')).map((item) => ({
    label: item.textContent.trim(),
    href: item.getAttribute('href'),
  })),
}))
check('未登录时给出登录入口', /去登录/.test(loginNote.text) && loginNote.actions.some((item) => item.href === 'login.html'), loginNote.text)
check('未登录时也给「写下此刻」这条不出声的路', loginNote.actions.some((item) => item.label === '写下此刻' && item.href === 'emotion-journal.html'), JSON.stringify(loginNote.actions))

/* ── 4. 已登录：麦克风被拒 / 服务连不上，各给下一步 ───────────────── */
const login = await (
  await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13900000002', password: 'Demo123456' }),
  })
).json()
check('能拿到登录态做这一段检查', Boolean(login.data && login.data.accessToken), JSON.stringify(login).slice(0, 120))

const liveContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
/* 浏览器把麦克风拒了的样子：只改这一处查询结果，别的都照常 */
await liveContext.addInitScript(() => {
  if (navigator.permissions && navigator.permissions.query) {
    const original = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = (parameters) =>
      parameters && parameters.name === 'microphone'
        ? Promise.resolve({ state: 'denied', onchange: null })
        : original(parameters)
  }
})
const livePage = await liveContext.newPage()
await livePage.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' })
await livePage.evaluate(
  ([accessToken, nickname, role]) => {
    localStorage.setItem('mb_access_token', accessToken)
    localStorage.setItem('feisi_backend', 'live')
    localStorage.setItem('feisi_nickname', nickname)
    localStorage.setItem('feisi_role', role)
    localStorage.setItem('mb_ai_ack_v1', '1')
  },
  [login.data.accessToken, login.data.user.nickname, login.data.user.role],
)
await livePage.goto(BASE + '/self-coaching.html?live=1', { waitUntil: 'domcontentloaded' })
await livePage.waitForSelector('#app .video-call-page', { timeout: 20000 })
await livePage.waitForSelector('[data-sc-note="mic"]', { timeout: 15000 })
const micNote = await livePage.$eval('[data-sc-note="mic"]', (node) => ({
  text: node.textContent.replace(/\s+/g, ' ').trim(),
  actions: Array.from(node.querySelectorAll('a, button')).map((item) => item.textContent.trim()),
}))
check('麦克风被拒时说清去哪儿改回来', /权限/.test(micNote.text) && /允许/.test(micNote.text), micNote.text)
check('麦克风被拒时给了刷新与「写下此刻」两个动作', micNote.actions.includes('刷新这一页') && micNote.actions.includes('写下此刻'), JSON.stringify(micNote.actions))

/* 服务连不上：页面上出现那句原文时（通话中会这样），也该贴出下一步 */
await livePage.evaluate(() => {
  const line = document.createElement('p')
  line.className = 'test-service-line'
  line.textContent = '服务未连接'
  document.body.appendChild(line)
})
await livePage.waitForSelector('[data-sc-note="service"]', { timeout: 15000 })
const serviceNote = await livePage.$eval('[data-sc-note="service"]', (node) => ({
  text: node.textContent.replace(/\s+/g, ' ').trim(),
  actions: Array.from(node.querySelectorAll('a, button')).map((item) => item.textContent.trim()),
}))
check('服务连不上时说明是服务的问题', /服务暂时连不上/.test(serviceNote.text), serviceNote.text)
check('服务连不上时给了重试与「写下此刻」', serviceNote.actions.includes('重试') && serviceNote.actions.includes('写下此刻'), JSON.stringify(serviceNote.actions))
await livePage.screenshot({ path: path.join(DEMO, '.cache', 'review', 'priority-four-2-notes.png') })

/* ── 5. 页头：我的成长 + 账户设置另开一个入口 ─────────────────────── */
const headers = {
  'my-growth.html': '账户设置',
  'emotion-journal.html': '我的成长',
  'self-coaching.html': '我的成长',
  'check-ins.html': '我的成长',
}
for (const [file, label] of Object.entries(headers)) {
  const html = fs.readFileSync(path.join(DEMO, file), 'utf-8')
  const match = /<div class="masthead__actions">([\s\S]*?)<\/div>/.exec(html)
  const actions = match ? match[1] : ''
  check(file + ' 的页头写着「' + label + '」', new RegExp('>' + label + '<').test(actions), actions.replace(/\s+/g, ' ').trim())
}
const stragglers = fs
  .readdirSync(DEMO)
  .filter((name) => name.endsWith('.html'))
  .filter((name) => /个人中心/.test(fs.readFileSync(path.join(DEMO, name), 'utf-8')))
check('没有页面还在写「个人中心」', stragglers.length === 0, JSON.stringify(stragglers))

await browser.close()

console.log('\n通过 ' + passes.length + ' 项：')
passes.forEach((name) => console.log('  ✓ ' + name))
if (problems.length) {
  console.log('\n未通过 ' + problems.length + ' 项：')
  problems.forEach((name) => console.log('  ✗ ' + name))
}
process.exit(problems.length ? 1 : 0)
