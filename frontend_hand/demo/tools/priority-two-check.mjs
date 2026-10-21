/**
 * 第二优先级自检 · 「对话收束 → 一个小行动 → 记进日记 → 次日回访 → 成长页看到」
 *
 * 对着真后端 + 真浏览器跑，不 mock：
 *   A. 正路：新账号 → 造一次带阶段的通话 → 通话页弹出的「收束卡」预填四行（都取自用户自己说过的话）
 *      → 改出一个小行动（含时间与完成条件）→ 确认 → 真写出情绪日记 → 成长页「下一步行动」显示这一步
 *      → 回访「做完了」→ 真写进今天打卡 → 刷新后仍在 → 时间轴多一条能点回打卡的记录；
 *   B. 权限与坏情况：换一个账号拿别人的会话 id 去收束 → 不能假装成功（草稿读不到、保存失败、不留日记）。
 *
 * 前置：后端 127.0.0.1:8000 + 开发服务器 127.0.0.1:5178。
 * 用法：  node tools/priority-two-check.mjs
 * 会在库里建两个临时账号、一次通话和一条日记，跑完自动清掉（tools/test-account.py drop）。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEMO = path.resolve(HERE, '..')
const BACKEND = path.resolve(DEMO, '..', '..', 'MindBasic-backend')
const PYTHON = path.join(BACKEND, '.venv', 'Scripts', 'python.exe')
const HELPER = path.join(HERE, 'test-account.py')
const SHOTS = path.join(DEMO, '.cache', 'review')
const BASE = 'http://127.0.0.1:5178'
const API = 'http://127.0.0.1:8000/api/v1'
const PASSWORD = 'Feisi2026test'
const STAMP = String(Date.now()).slice(-8)
const OWNER_PHONE = '138' + STAMP
const OTHER_PHONE = '137' + STAMP

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

/** 造通话 / 清账号：都要在后端根目录下跑（配置从它的 .env 读） */
function helper(action, phone) {
  const result = spawnSync(PYTHON, [HELPER, action, '--phone', phone], { cwd: BACKEND, encoding: 'utf-8' })
  if (result.status !== 0) throw new Error(action + ' 失败：' + (result.stderr || result.stdout))
  return String(result.stdout || '').trim()
}

async function register(phone, nickname) {
  const created = await call('POST', '/auth/register', {
    phone,
    password: PASSWORD,
    nickname,
    gender: 'girl',
    privacyAgreed: true,
    serviceAgreed: true,
  })
  if (created.status !== 201 || !created.data) throw new Error('注册失败：' + JSON.stringify(created.payload))
  return created.data
}

fs.mkdirSync(SHOTS, { recursive: true })

const owner = await register(OWNER_PHONE, '行动自检')
const other = await register(OTHER_PHONE, '旁人自检')
const conversationId = helper('seed', OWNER_PHONE)
check('造出了一次带阶段的通话', /^\d+$/.test(conversationId), '返回：' + conversationId)

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()
let consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message))

/* 这一页会去连 socket.io（没有实时后端时必然失败）——那不是这次要验的东西 */
function realErrors() {
  return consoleErrors.filter(
    (text) => !/socket|websocket|403|404|Failed to load resource/i.test(text),
  )
}

async function signIn(session, next) {
  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ([token, nickname, role]) => {
      localStorage.setItem('mb_access_token', token)
      localStorage.setItem('feisi_backend', 'live')
      localStorage.setItem('feisi_nickname', nickname)
      localStorage.setItem('feisi_role', role)
      /* 自我教练页的「AI 说明」弹窗挡在前面，跳过它 */
      localStorage.setItem('mb_ai_ack_v1', '1')
    },
    [session.accessToken, session.user.nickname, session.user.role],
  )
  if (next) await page.goto(BASE + '/' + next, { waitUntil: 'domcontentloaded' })
}

/** 打开通话页的收束卡：从容器上的 vnode 树找到 VideoCallPanel，触发它的「通话结束」事件。
    （生产构建里 `app._instance` 是 dev-only 的，只能在 DOM 上找到根 vnode。） */
async function openClosingCard(id) {
  return page.evaluate((cid) => {
    const host = document.querySelector('#app')
    const root = host && host._vnode
    if (!root) return 'no-vnode'
    const seen = new Set()
    function walk(vnode, depth) {
      if (!vnode || typeof vnode !== 'object' || seen.has(vnode) || depth > 16) return null
      seen.add(vnode)
      const type = vnode.type
      const name = type && (type.__name || type.name)
      if (name === 'VideoCallPanel') return vnode
      if (vnode.component) {
        const inside = walk(vnode.component.subTree, depth + 1)
        if (inside) return inside
      }
      for (const branch of [vnode.children, vnode.dynamicChildren]) {
        if (!Array.isArray(branch)) continue
        for (const kid of branch) {
          const hit = walk(kid, depth + 1)
          if (hit) return hit
        }
      }
      return null
    }
    const panel = walk(root, 0)
    if (!panel || !panel.component || typeof panel.component.emit !== 'function') return 'no-panel'
    panel.component.emit('conversation-ended', cid)
    return 'emitted'
  }, id)
}

/* ── A. 正路 ─────────────────────────────────────────────────────── */
await signIn(owner)
consoleErrors = []
await page.goto(BASE + '/self-coaching.html?live=1', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#app .video-call-page', { timeout: 20000 })
const opened = await openClosingCard(conversationId)
check('能在通话页打开收束卡', opened === 'emitted', '返回：' + opened)
await page.waitForSelector('[role="dialog"] .closing-card', { timeout: 20000 })

const prefilled = await page.evaluate(() => {
  const areas = Array.from(document.querySelectorAll('.closing-card textarea'))
  const inputs = Array.from(document.querySelectorAll('.closing-card input'))
  return {
    fields: areas.map((node) => node.value),
    when: inputs[0] ? inputs[0].value : '',
    condition: inputs[1] ? inputs[1].value : '',
    note: document.querySelector('.closing-card__note') ? document.querySelector('.closing-card__note').textContent : '',
    heading: document.querySelector('[role="dialog"] h2').textContent,
    dialogText: document.querySelector('[role="dialog"]').innerText,
  }
})
check(
  '「这次谈到的事」预填的是用户自己说的第一句',
  prefilled.fields[0].includes('论文堆到最后一周'),
  JSON.stringify(prefilled.fields),
)
check(
  '「我的一小步」预填的是用户自己说的行动那句',
  prefilled.fields[3].includes('三个待办'),
  JSON.stringify(prefilled.fields[3]),
)
check('行动默认带了时间与完成条件', prefilled.when.length > 0 && prefilled.condition.length > 0, JSON.stringify(prefilled))
check('卡上写明以用户确认为准', /以你确认为准/.test(prefilled.dialogText), '标题：' + prefilled.heading)
check('卡上说明确认后会去哪', /记进情绪日记/.test(prefilled.dialogText) && /下一步行动/.test(prefilled.dialogText), prefilled.dialogText.slice(0, 200))
check(
  '四行都能改（真实输入框，不是只读文本）',
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.closing-card textarea, .closing-card input')).every(
      (node) => !node.readOnly && !node.disabled,
    ),
  ),
)

/* 必填项不足时不能提交 */
await page.fill('.closing-card textarea >> nth=0', '')
await page.waitForTimeout(150)
const disabledWhenEmpty = await page.isDisabled('button:has-text("确认并记进情绪日记")')
check('「这次谈到的事」空着时不能提交', disabledWhenEmpty)

const ACTION_TEXT = '自检行动：今晚 21:00 前把论文的三个待办列出来'
await page.fill('.closing-card textarea >> nth=0', '这周的论文堆到最后一周，不知道从哪开始')
await page.fill('.closing-card textarea >> nth=3', ACTION_TEXT)
await page.fill('.closing-card input >> nth=0', '今晚 21:00 前')
await page.fill('.closing-card input >> nth=1', '三个待办写在纸上')
await page.waitForTimeout(150)
check('补齐必填项后可以提交', !(await page.isDisabled('button:has-text("确认并记进情绪日记")')))
await page.screenshot({ path: path.join(SHOTS, 'priority-two-1-closing-card.png') })

await page.click('button:has-text("确认并记进情绪日记")')
await page.waitForFunction(() => /收好尾/.test(document.body.innerText), undefined, { timeout: 20000 })
check('确认后收束卡显示「已收好尾」', true)

const detail = (await call('GET', '/ai-conversations/' + conversationId, undefined, owner.accessToken)).data
check('会话真的挂上了情绪日记', detail.conversation.journalId, JSON.stringify(detail.conversation))
const journals = (await call('GET', '/emotion-journals?page=1&pageSize=5', undefined, owner.accessToken)).data
const journalText = journals.items.length ? journals.items[0].content : ''
check('日记正文里带上了这次谈到的事', journalText.includes('这次谈到的事：'), journalText)
check('日记正文里带上了那个行动', journalText.includes('我的一小步：' + ACTION_TEXT), journalText)
check(
  '行动那行带着时间与完成条件',
  journalText.includes('（今晚 21:00 前；完成条件：三个待办写在纸上）'),
  journalText,
)

/* ── 成长页：下一步行动 + 回访 ────────────────────────────────────── */
consoleErrors = []
await page.goto(BASE + '/my-growth.html?live=1', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(
  () => /自检行动|读取失败|还没有记下行动/.test(document.querySelector('[data-action-card]').innerText),
  undefined,
  { timeout: 20000 },
)
const actionPanel = await page.evaluate(() => {
  const firstPanel = document.querySelector('.ground .wrap > .panel')
  return {
    isFirst: firstPanel ? firstPanel.hasAttribute('data-action-panel') : false,
    text: document.querySelector('[data-action-text]') ? document.querySelector('[data-action-text]').textContent.trim() : '',
    html: document.querySelector('[data-action-card]').innerText,
    reviewVisible: !document.querySelector('[data-action-review]').hidden,
    buttons: Array.from(document.querySelectorAll('[data-review]')).map((node) => node.textContent.trim()),
    note: document.querySelector('[data-action-note]').textContent.trim(),
  }
})
check('「下一步行动」排在成长页最前面', actionPanel.isFirst)
check('行动来自这次收束（不是示例）', actionPanel.text.includes('自检行动'), actionPanel.text)
check('行动带着时间与完成条件', /今晚 21:00 前/.test(actionPanel.html) && /三个待办写在纸上/.test(actionPanel.html), actionPanel.html)
check('回访三选一都在', actionPanel.buttons.join(',') === '做完了,做了一部分,还没开始', JSON.stringify(actionPanel.buttons))
check('面板标注了行动来源', /来自最近一次收束/.test(actionPanel.note), actionPanel.note)
await page.screenshot({ path: path.join(SHOTS, 'priority-two-2-growth-action.png'), fullPage: true })

await page.click('[data-review="DONE"]')
await page.waitForFunction(
  () => /已经记进今天的打卡|今天已经记过一条了|没能记下来/.test(document.querySelector('[data-review-status]').textContent),
  undefined,
  { timeout: 20000 },
)
const reviewText = await page.$eval('[data-review-status]', (node) => node.textContent)
check('回访「做完了」被记进今天的打卡', /已经记进今天的打卡：做完了/.test(reviewText), reviewText)

const month = new Date()
const monthKey = month.getFullYear() + '-' + String(month.getMonth() + 1).padStart(2, '0')
const checkins = (await call('GET', '/check-ins?month=' + monthKey, undefined, owner.accessToken)).data
const reviewRow = (checkins.items || []).find((row) => /^回访：/.test(String(row.content || '')))
check('打卡记录里能查到这次回访', Boolean(reviewRow), JSON.stringify(checkins.items))
check(
  '打卡正文把行动和结果都写清楚了',
  reviewRow && reviewRow.content.includes('自检行动') && reviewRow.content.includes('做完了'),
  reviewRow ? reviewRow.content : '',
)

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(
  () => /上次回访/.test(document.querySelector('[data-review-status]').textContent),
  undefined,
  { timeout: 20000 },
)
const afterReload = await page.$eval('[data-review-status]', (node) => node.textContent)
check('刷新后仍能看到上次回访结果', /上次回访/.test(afterReload) && /做完了/.test(afterReload), afterReload)
const timelineRows = await page.$$eval('.timeline .tl', (nodes) =>
  nodes.map((node) => ({ title: node.querySelector('.tl__title').textContent.trim(), href: node.querySelector('a') ? node.querySelector('a').getAttribute('href') : '' })),
)
const checkinRow = timelineRows.find((row) => /打卡/.test(row.title))
check('时间轴上这次打卡能点回打卡页', Boolean(checkinRow) && checkinRow.href === 'check-ins.html', JSON.stringify(timelineRows))
const journalRow = timelineRows.find((row) => /情绪日记/.test(row.title))
check('时间轴上日记能点回日记页', Boolean(journalRow) && journalRow.href === 'emotion-journal.html', JSON.stringify(journalRow))

/* 一天一条：再点一次要如实说明，而不是静默失败 */
await page.click('[data-review="NOT_YET"]')
await page.waitForFunction(
  () => /今天已经记过一条了|已经记进今天的打卡/.test(document.querySelector('[data-review-status]').textContent),
  undefined,
  { timeout: 20000 },
)
check(
  '同一天再回访会如实说明「一天一条」',
  /今天已经记过一条了/.test(await page.$eval('[data-review-status]', (node) => node.textContent)),
  await page.$eval('[data-review-status]', (node) => node.textContent),
)
check('收束与回访这一段没有脚本报错', realErrors().length === 0, JSON.stringify(realErrors()))

/* ── B. 拿别人的会话去收束：不能假装成功 ─────────────────────────── */
consoleErrors = []
const beforeForeign = (await call('GET', '/ai-conversations/' + conversationId, undefined, owner.accessToken)).data
await signIn(other)
await page.goto(BASE + '/self-coaching.html?live=1', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#app .video-call-page', { timeout: 20000 })
await openClosingCard(conversationId)
await page.waitForSelector('[role="dialog"] .closing-card', { timeout: 20000 })
const foreign = await page.evaluate(() => ({
  alert: document.querySelector('[role="dialog"] [role="alert"]') ? document.querySelector('[role="dialog"] [role="alert"]').textContent.trim() : '',
  editable: Array.from(document.querySelectorAll('.closing-card textarea')).every((node) => !node.readOnly && !node.disabled),
}))
check('别人的会话读不到草稿时，页面说明读不到', foreign.alert.length > 0, '实际：' + foreign.alert)
check('读不到草稿也仍然可以自己写（不是死路）', foreign.editable)

await page.fill('.closing-card textarea >> nth=0', '试着自己写一行')
await page.fill('.closing-card textarea >> nth=3', '自己写一个小行动')
await page.waitForTimeout(150)
await page.click('button:has-text("确认并记进情绪日记")')
await page.waitForFunction(
  () => Boolean(document.querySelector('[role="dialog"] [role="alert"]')) || /收好尾/.test(document.body.innerText),
  undefined,
  { timeout: 20000 },
)
const afterForeignSave = await page.evaluate(() => ({
  alert: document.querySelector('[role="dialog"] [role="alert"]') ? document.querySelector('[role="dialog"] [role="alert"]').textContent.trim() : '',
  saved: /收好尾/.test(document.body.innerText),
  kept: document.querySelectorAll('.closing-card textarea')[3].value,
}))
check('保存失败时不会假装成功', afterForeignSave.saved === false, JSON.stringify(afterForeignSave))
check('保存失败时说明原因', afterForeignSave.alert.length > 0 && !/收好尾/.test(afterForeignSave.alert), afterForeignSave.alert)
check('保存失败时写下的内容还在', afterForeignSave.kept.includes('自己写一个小行动'), afterForeignSave.kept)
const stillEmpty = (await call('GET', '/ai-conversations/' + conversationId, undefined, owner.accessToken)).data
const afterJournals = (await call('GET', '/emotion-journals?page=1&pageSize=5', undefined, owner.accessToken)).data
check(
  '别人的会话一个字都没被改',
  stillEmpty.conversation.journalId === beforeForeign.conversation.journalId &&
    stillEmpty.conversation.summary === beforeForeign.conversation.summary,
  JSON.stringify(stillEmpty.conversation),
)
check(
  '那条日记里没混进旁人写的内容',
  !afterJournals.items.some((item) => String(item.content || '').includes('自己写一个小行动')),
  JSON.stringify(afterJournals.items.map((item) => item.content)),
)

await browser.close()

/* ── 清场 ─────────────────────────────────────────────────────────── */
helper('drop', OWNER_PHONE)
helper('drop', OTHER_PHONE)

console.log('\n通过 ' + passes.length + ' 项：')
passes.forEach((name) => console.log('  ✓ ' + name))
if (problems.length) {
  console.log('\n未通过 ' + problems.length + ' 项：')
  problems.forEach((name) => console.log('  ✗ ' + name))
}
console.log('\n临时账号已清理：' + OWNER_PHONE + ' / ' + OTHER_PHONE)
process.exit(problems.length ? 1 : 0)
