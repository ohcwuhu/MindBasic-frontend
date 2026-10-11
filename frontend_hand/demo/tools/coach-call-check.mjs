/**
 * 自我教练通话自检：真 socket + 假麦克风，把「开始 → 暂停 → 继续」这条线走一遍。
 *
 * 为什么单独一个：这一页整页是原前端的 Vue 组件（`scripts/self-coaching-app.js`），
 * 它的状态机在浏览器里才跑得起来；`verify.mjs` 只看版式，看不出「点了暂停没反应」。
 *
 * 跑之前：后端 8000 + 开发服务器 5178 都要在（见 admin-live-check.mjs 的头注）。
 * 用法：  node tools/coach-call-check.mjs
 * 退出码非 0 = 通话或暂停这条线有问题。
 */
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:5178'
const problems = []
const log = (...args) => console.log(...args)

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  permissions: ['microphone', 'camera'],
})
const page = await context.newPage()

const vc = []
page.on('console', (message) => {
  if (/\[VC\]/.test(message.text())) vc.push(message.text())
})
page.on('pageerror', (error) => problems.push('pageerror: ' + error.message))

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' })
const token = await page.evaluate(async () => {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13900000002', password: 'Demo123456' }),
  })
  return (await response.json()).data.accessToken
})
await page.evaluate((value) => {
  localStorage.setItem('mb_access_token', value)
  localStorage.setItem('feisi_backend', 'live')
  localStorage.setItem('feisi_nickname', '小满')
  localStorage.setItem('feisi_role', 'USER')
  localStorage.setItem('mb_ai_ack_v1', '1')
}, token)

await page.goto(BASE + '/self-coaching.html', { waitUntil: 'load' })
await page.waitForTimeout(1000)
log('通话前 · socket:', (await page.locator('.socket-chip').innerText()).replace(/\n/g, ' '))

await page.getByRole('button', { name: '开始自我教练' }).click()
await page.waitForTimeout(2500)
const socket = (await page.locator('.socket-chip').innerText()).replace(/\n/g, ' ')
log('通话中 · socket:', socket, '· 状态:', (await page.locator('.state-chip').innerText()).replace(/\n/g, ' '))
if (!/服务已连接/.test(socket)) problems.push('通话中 socket 没连上：' + socket)

const pause = page.getByRole('button', { name: /暂停|继续/ }).first()
if (!(await pause.count())) problems.push('通话中没有「暂停」按钮')
const box = await pause.boundingBox()
if (box) {
  /* 用真实鼠标坐标点，顺手验「按钮没被别的东西盖住」 */
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
} else {
  await pause.click()
}
await page.waitForTimeout(1400)

const pausedLabel = await pause.innerText()
const pausedState = (await page.locator('.state-chip').innerText()).replace(/\n/g, ' ')
const saidButton = page.getByRole('button', { name: '说完了' })
const saidDisabled = (await saidButton.count()) ? await saidButton.isDisabled() : null
log('点暂停 → 按钮「' + pausedLabel + '」· 状态条「' + pausedState + '」· 说完了禁用:', saidDisabled)
if (!/继续/.test(pausedLabel)) problems.push('点暂停之后按钮文案没变成「继续」：' + pausedLabel)
if (!/已暂停/.test(pausedState)) problems.push('点暂停之后状态条没变成「已暂停」：' + pausedState)
if (!vc.some((line) => /已暂停通话/.test(line))) problems.push('控制台没有「[VC] 已暂停通话」')
if (saidDisabled === false) problems.push('暂停之后「说完了」仍然可点')

await pause.click()
await page.waitForTimeout(1600)
const resumedLabel = await pause.innerText()
const resumedState = (await page.locator('.state-chip').innerText()).replace(/\n/g, ' ')
log('点继续 → 按钮「' + resumedLabel + '」· 状态条「' + resumedState + '」')
if (!/暂停/.test(resumedLabel)) problems.push('点继续之后按钮没回到「暂停」：' + resumedLabel)
if (/已暂停/.test(resumedState)) problems.push('点继续之后状态条还停在「已暂停」：' + resumedState)
if (!vc.some((line) => /已恢复通话/.test(line))) problems.push('控制台没有「[VC] 已恢复通话」')

await page.getByRole('button', { name: '结束通话' }).click()
await page.waitForTimeout(1200)
log('点结束通话 → 页面上还有「开始自我教练」:', await page.getByRole('button', { name: '开始自我教练' }).count())

log('\n--- 控制台问题 ---')
log(problems.length ? problems.join('\n') : '无')
await browser.close()
process.exit(problems.length ? 1 : 0)
