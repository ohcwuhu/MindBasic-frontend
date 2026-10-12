/**
 * 走一遍「预约 → 订单 → 支付 → 我的预约」这条链，并核几个刚补上的行为：
 *   · 预约页必填项真的拦得住（空提交 / 4 个字 / 没勾协议），错误写在页面上而不是 alert；
 *   · 提交按钮是表单的 submit，连点两次只会生成一笔订单（pending guard）；
 *   · 成功后给的是订单号 + 倒计时 + 「去支付订单」，点过去能落在订单页那一笔上；
 *   · 订单页真的能付（余额够时先确认再付），付完状态变「已支付」，预约跟着走；
 *   · 预约能取消（退款退回本地余额），完成的还能评价；
 *   · 教练列表每张卡都有价格、时长，并且点卡片任意位置都能进详情；
 *   · 个人资料页的「我的订单 / 我的预约」两行通到订单页。
 *
 * 跑的是静态演示那一路（不起后端、不开 dev server）：起一个小静态服务把 demo/ 当成站点根，
 * 用这台机器上已有的 Chrome。
 *
 * Run:  node tools/booking-orders-check.mjs
 */
import { createReadStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEMO = path.resolve(HERE, '..')
const SHOTS = path.resolve(DEMO, '.cache', 'review')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
}

async function serveDemo() {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const file = path.join(DEMO, pathname)
    if (!file.startsWith(DEMO)) {
      res.writeHead(403).end()
      return
    }
    try {
      const info = await stat(file)
      if (!info.isFile()) throw new Error('not a file')
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': info.size,
      })
      createReadStream(file).pipe(res)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

const problems = []
const notes = []
function check(ok, label, detail) {
  if (ok) {
    notes.push('  ok   ' + label)
  } else {
    problems.push(label + (detail ? ' —— ' + detail : ''))
  }
}

const demo = await serveDemo()
/* 假麦克风 / 假摄像头：自我教练那一段要真的点「开始」才能看到通话中的舞台 */
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'zh-CN' })
const page = await context.newPage()
const consoleErrors = []
const badResponses = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))
page.on('response', (response) => {
  if (response.status() >= 400) badResponses.push(response.status() + ' ' + response.url())
})

try {
  /* ---------- 新补的页面：冒烟（打得开、一个 h1、不横向溢出、没有真报错）----------
     这一组随「原版有、这边还没做」的页面一起长：新加一页就往 NEW_PAGES 里补一行。 */
  const NEW_PAGES = [
    'community-post.html?communityId=1&postId=1',
    'community-post.html?communityId=1&postId=2',
    'self-coaching-record.html?record=1',
    'ai-conversation.html?id=1',
    'favorites.html',
    'check-ins.html',
    'messages.html',
    'admin-orders.html',
    'admin-crisis.html',
    'admin-audit-logs.html',
    'admin-system-configs.html',
    'coach.html',
    'coach-slots.html',
    'coach-clients.html',
    'coach-tools.html',
    'coach-profile.html',
  ]
  for (const file of NEW_PAGES) {
    const errors = []
    const onConsole = (message) => {
      if (message.type() === 'error' && !/status of 404|socket\.io|WebSocket/i.test(message.text())) {
        errors.push(message.text())
      }
    }
    const onFailure = (request) => {
      if (!/\/api\/v1\/|\/socket\.io\//.test(request.url())) errors.push('requestfailed ' + request.url())
    }
    page.on('console', onConsole)
    page.on('requestfailed', onFailure)
    await page.goto(demo.origin + '/' + file, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    const report = await page.evaluate(() => ({
      title: (document.querySelector('.plate__title') || {}).textContent || '',
      headings: document.querySelectorAll('h1').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    page.off('console', onConsole)
    page.off('requestfailed', onFailure)
    check(report.headings === 1 && report.title.trim().length > 0, file + '：打得开，有一个标题', report.title.trim())
    check(report.overflow <= 1, file + '：没有横向溢出', String(report.overflow))
    check(errors.length === 0, file + '：没有脚本报错', errors.join(' | '))
  }

  /* ---------- 首页：那一处「落纸」动效 ---------- */
  await page.goto(demo.origin + '/index.html', { waitUntil: 'load' })
  const motion = await page.evaluate(() => {
    const entry = document.querySelector('.entry')
    return {
      card: entry ? getComputedStyle(entry).animationName : 'missing',
      inner: entry ? getComputedStyle(entry.querySelector('.entry__art')).animationName : 'missing',
    }
  })
  check(
    /entry-fade/.test(motion.card) && /entry-settle/.test(motion.inner),
    '首页四张便签有「落纸」入场动效',
    JSON.stringify(motion),
  )
  /* 便签盒子自己不做位移：版式脚本量的就是它的几何 */
  const boxShift = await page.evaluate(() => {
    const entry = document.querySelector('.entry')
    return entry ? getComputedStyle(entry).translate : 'missing'
  })
  check(boxShift === 'none', '便签盒子本身不位移（量到的几何不受动效影响）', boxShift)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload({ waitUntil: 'load' })
  const reduced = await page.evaluate(() => {
    const entry = document.querySelector('.entry')
    return entry ? getComputedStyle(entry).animationName : 'missing'
  })
  check(reduced === 'none', 'prefers-reduced-motion 下这处动效完全不发生', reduced)
  await page.emulateMedia({ reducedMotion: null })

  /* ---------- 预约页：校验 ---------- */
  await page.goto(demo.origin + '/booking.html', { waitUntil: 'load' })

  const slotState = await page.$$eval('.slot', (nodes) =>
    nodes.map((node) => ({ text: node.textContent.trim(), pressed: node.getAttribute('aria-pressed'), off: node.disabled })),
  )
  check(
    slotState.filter((item) => !item.off).every((item) => item.pressed === 'true' || item.pressed === 'false'),
    '时段是可读的开关状态（aria-pressed）',
  )
  check(slotState.filter((item) => item.pressed === 'true').length === 1, '默认只有一个时段被选中')

  const dates = await page.$$eval('.slot time[datetime]', (nodes) => nodes.map((node) => node.getAttribute('datetime')))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  check(
    dates.length > 0 && dates.every((value) => new Date(value + 'T00:00:00') >= today),
    '示例时段都在今天之后',
    dates.join(' '),
  )

  const unchecked = await page.$eval('#agree', (node) => node.checked)
  check(unchecked === false, '协议默认不勾选')

  await page.click('[data-booking-submit]')
  await page.waitForTimeout(120)
  const emptyErrors = await page.$$eval('.field__error:not([hidden])', (nodes) => nodes.map((node) => node.textContent.trim()))
  check(emptyErrors.length >= 2, '空提交时给出可见的错误提示', JSON.stringify(emptyErrors))
  check(!(await page.$('[data-editor], .booking-done__amount')), '空提交不会生成订单')

  await page.fill('#need', '考试')
  await page.click('[data-booking-submit]')
  await page.waitForTimeout(120)
  const shortError = await page.$eval('#need-error', (node) => node.textContent.trim())
  check(/至少 5 个字/.test(shortError), '少于 5 个字会被拦下', shortError)

  /* ---------- 预约页：提交 ---------- */
  await page.fill('#need', '下个月有场重要的考试，最近一想到就睡不着。')
  await page.check('#agree')
  await page.click('[data-booking-submit]')
  /* 连点两次：如果有防重复，第二下会被 submitting 挡住 */
  await page.click('[data-booking-submit]', { force: true }).catch(() => {})
  await page.waitForSelector('.booking-done__amount', { timeout: 4000 })

  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('feisi_demo_flow') || 'null'))
  check(stored && stored.orders.length === 1, '连点两次只生成一笔订单', JSON.stringify(stored && stored.orders.length))
  check(stored && stored.appointments.length === 1, '预约也只有一条')

  const doneText = await page.$eval('aside.panel', (node) => node.textContent.replace(/\s+/g, ' ').trim())
  check(/预约申请已提交/.test(doneText), '成功后给出明确的结果标题')
  check(/AP\d+/.test(doneText), '结果里有预约号', doneText.slice(0, 80))
  const firstCount = await page.$eval('[data-done-countdown]', (node) => node.textContent.trim())
  await page.waitForTimeout(1200)
  const secondCount = await page.$eval('[data-done-countdown]', (node) => node.textContent.trim())
  check(/^\d\d:\d\d$/.test(firstCount) && firstCount !== secondCount, '支付倒计时在走', firstCount + ' → ' + secondCount)

  /* ---------- 订单页：定位 → 支付 ---------- */
  await page.click('aside.panel a.btn')
  await page.waitForURL(/orders\.html/, { timeout: 4000 })
  await page.waitForSelector('.order', { timeout: 4000 })
  const hash = await page.evaluate(() => window.location.hash)
  check(/^#order-OD/.test(hash), '从成功卡过来会定位到那一笔订单', hash)

  const rows = await page.$$eval('[data-orders-list] .order', (nodes) => nodes.map((node) => node.textContent.replace(/\s+/g, ' ')))
  check(rows.length >= 2, '订单列表读到了示例 + 刚下的那一笔', String(rows.length))
  check(rows.some((text) => /待支付/.test(text)), '有一笔显示「待支付」')

  await page.click('[data-orders-list] [data-pay]')
  await page.waitForSelector('[data-confirm-pay]', { timeout: 4000 })
  const confirm = await page.$eval('[data-confirm-pay]', (node) =>
    node.closest('[data-editor]').textContent.replace(/\s+/g, ' '),
  )
  check(/钱包余额/.test(confirm) && /要扣/.test(confirm), '支付前先说清余额与扣款', confirm)

  await page.click('[data-confirm-pay]')
  await page.waitForFunction(() => /已支付/.test(document.querySelector('[data-orders-list]').textContent), null, {
    timeout: 4000,
  })
  const afterPay = await page.$eval('[data-orders-status]', (node) => node.textContent.trim())
  check(/支付完成/.test(afterPay), '支付后给出结果反馈', afterPay)

  const apptText = await page.$eval('[data-appointments-list]', (node) => node.textContent.replace(/\s+/g, ' '))
  check(/待教练确认/.test(apptText), '支付后预约进入「待教练确认」')
  check(apptText.length > 0 && !/正在读取/.test(apptText), '预约列表已渲染')

  /* ---------- 筛选 ---------- */
  /* 支付那一下还没收尾时按钮是禁用的 —— 等它松开再点，量到的才是筛选本身的行为 */
  await page.waitForSelector('[data-order-filter="CREATED"]:not([disabled])', { timeout: 4000 })
  await page.click('[data-order-filter="CREATED"]')
  await page.waitForTimeout(80)
  const filtered = await page.$$eval('[data-orders-list] .order', (nodes) => nodes.length)
  const filterNote = await page.$eval('[data-orders-status]', (node) => node.textContent.trim())
  check(filtered < rows.length, '按「待支付」筛选后条目变少', filtered + ' / ' + rows.length)
  check(/筛选/.test(filterNote), '筛选结果有文字反馈', filterNote)
  await page.click('[data-order-filter="ALL"]')

  /* ---------- 取消与评价 ---------- */
  await page.click('[data-appointments-list] [data-open-cancel]')
  await page.waitForSelector('[data-confirm-cancel]', { timeout: 4000 })
  const cancelCopy = await page.$eval('[data-confirm-cancel]', (node) =>
    node.closest('[data-editor]').textContent.replace(/\s+/g, ' '),
  )
  check(/确认取消/.test(cancelCopy), '取消前先确认一遍', cancelCopy.slice(0, 60))
  await page.click('[data-confirm-cancel]')
  await page.waitForFunction(() => /已取消/.test(document.querySelector('[data-appointments-list]').textContent), null, {
    timeout: 4000,
  })
  const cancelNote = await page.$eval('[data-appointments-status]', (node) => node.textContent.trim())
  check(/预约已取消/.test(cancelNote), '取消后有结果反馈', cancelNote)

  await page.click('[data-appointments-list] [data-open-review]')
  await page.waitForSelector('[data-review]', { timeout: 4000 })
  await page.selectOption('[data-review] select', '5')
  await page.fill('[data-review] textarea', '聊完心里松了一点，谢谢。')
  await page.click('[data-review] button[type="submit"]')
  await page.waitForFunction(() => /已评价/.test(document.querySelector('[data-appointments-list]').textContent), null, {
    timeout: 4000,
  })
  check(
    /已评价/.test(await page.$eval('[data-appointments-list]', (node) => node.textContent)),
    '评价提交后显示「已评价」',
  )

  /* ---------- 个人中心两行 ---------- */
  await page.goto(demo.origin + '/profile.html', { waitUntil: 'load' })
  await page.waitForTimeout(200)
  const ordersRow = await page.$eval('[data-orders]', (node) => node.textContent.trim())
  const apptRow = await page.$eval('[data-appointments]', (node) => node.textContent.trim())
  check(/共 \d+ 笔/.test(ordersRow), '个人中心「我的订单」报的是真实笔数', ordersRow)
  check(/共 \d+ 次/.test(apptRow), '个人中心「我的预约」报的是真实次数', apptRow)
  check(
    (await page.$eval('a[href="orders.html"]', (node) => node.getAttribute('href'))) === 'orders.html',
    '「我的订单」通到订单页',
  )

  /* ---------- 教练列表 ---------- */
  await page.goto(demo.origin + '/coaches.html', { waitUntil: 'load' })
  const cards = await page.$$eval('.coach-card', (nodes) =>
    nodes.map((node) => ({
      text: node.textContent.replace(/\s+/g, ' '),
      price: node.querySelector('.coach-card__price') ? node.querySelector('.coach-card__price').textContent.trim() : '',
      link: node.querySelector('.coach-card__link') ? node.querySelector('.coach-card__link').getAttribute('href') : '',
    })),
  )
  check(cards.length === 6, '六张教练卡都在', String(cards.length))
  check(
    cards.every((card) => /¥\d+/.test(card.price) && /分钟/.test(card.price)),
    '每张卡都有价格与时长',
    JSON.stringify(cards.map((card) => card.price)),
  )
  check(
    cards.every((card) => card.link && card.link.indexOf('coach-detail.html') === 0),
    '每张卡都有进详情的入口',
  )
  await page.click('.coach-card', { position: { x: 24, y: 24 } })
  await page.waitForURL(/coach-detail\.html/, { timeout: 4000 })
  check(/coach-detail\.html/.test(page.url()), '点卡片空白处也能进详情（整卡可点）')

  /* ---------- 钱包（静态演示）---------- */
  await page.goto(demo.origin + '/wallet.html', { waitUntil: 'load' })
  await page.waitForTimeout(120)
  const balance = await page.$eval('[data-balance]', (node) => node.textContent.trim())
  check(/^¥/.test(balance) && balance !== '—', '静态演示里钱包显示本地余额', balance)
  await page.click('[data-amount="5000"]')
  await page.waitForTimeout(120)
  const afterTopup = await page.$eval('[data-balance]', (node) => node.textContent.trim())
  check(afterTopup !== balance, '演示充值会改余额', balance + ' → ' + afterTopup)

  /* ---------- 自我教练：说明弹窗的键盘焦点 ----------
     原项目 src 里已经写好（焦点进弹窗、背景 inert、Tab 在弹窗内循环、关闭后还原），
     但页面挂的是编译产物 —— 这一段就是钉「重构建之后真的生效」。 */
  await page.evaluate(() => sessionStorage.clear())
  await page.goto(demo.origin + '/self-coaching.html', { waitUntil: 'load' })
  await page.waitForSelector('.vc-shell, [aria-label="AI 自我教练说明"]', { timeout: 8000 })
  const dialog = '[aria-label="AI 自我教练说明"]'
  if (await page.$(dialog)) {
    const inside = await page.evaluate(
      (selector) => !!document.activeElement && !!document.activeElement.closest(selector),
      dialog,
    )
    check(inside, '说明弹窗打开时焦点在弹窗里')
    const inertReport = await page.evaluate(
      (selector) =>
        Array.from(document.body.children)
          /* 只管真的会渲染、能聚焦的容器：script / style 之类不参与，inert 与否没有意义 */
          .filter(
            (node) =>
              node.nodeType === 1 &&
              !/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT|META)$/.test(node.tagName) &&
              !node.matches(selector) &&
              !node.querySelector(selector),
          )
          .map((node) => node.tagName.toLowerCase() + '.' + (node.className || '') + '=' + node.inert),
      dialog,
    )
    check(
      inertReport.every((entry) => /=true$/.test(entry)),
      '弹窗打开时背景被 inert 挡住',
      inertReport.join(' | '),
    )
    let escaped = false
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab')
      const still = await page.evaluate(
        (selector) => !!document.activeElement && !!document.activeElement.closest(selector),
        dialog,
      )
      if (!still) escaped = true
    }
    check(!escaped, '连按 Tab 也不会跑到背后的页面上')
    await page.click(dialog + ' button')
    await page.waitForTimeout(200)
    check(!(await page.$(dialog)), '点「我已知晓」后弹窗关闭')

    /* ---------- 自我教练：语音模式的主角是陪伴角色 ---------- */
    await page.click('.start-call-btn')
    await page.waitForSelector('.vc-stage.active', { timeout: 8000 })
    await page.waitForTimeout(500)
    const voice = await page.evaluate(() => ({
      stageVoice: document.querySelectorAll('.stage-voice').length,
      companion: document.querySelectorAll('.stage-voice .voice-companion .cs-root').length,
      overlay: document.querySelectorAll('.call-overlay').length,
      status: (document.querySelector('.voice-state') || {}).textContent || '',
      note: document.querySelector('.sc-hint')
        ? getComputedStyle(document.querySelector('.sc-hint')).display !== 'none' &&
          !document.querySelector('.sc-hint').hidden
        : false,
    }))
    check(voice.stageVoice === 1 && voice.companion === 1, '语音模式：角色站在舞台中央')
    check(voice.overlay === 0, '语音模式：右下角不再重复一次角色')
    check(/等你开口|聆听|思考|回复|暂停/.test(voice.status), '语音模式：状态写的是"在做什么"', voice.status)
    check(voice.note === false, '通话开始后那张登录提示自己收起来')

    const cameraButton = await page.$('.ctrl-actions .ctrl-btn[aria-pressed="false"]')
    check(!!cameraButton, '摄像头开关在底部控制条里（语音模式下的次级控制）')
    if (cameraButton) {
      await cameraButton.click()
      await page.waitForTimeout(1200)
      const withCamera = await page.evaluate(() => ({
        stageVoice: document.querySelectorAll('.stage-voice').length,
        overlay: document.querySelectorAll('.call-overlay').length,
        statusColor: document.querySelector('.co-status')
          ? getComputedStyle(document.querySelector('.co-status')).color
          : '',
      }))
      check(withCamera.stageVoice === 0 && withCamera.overlay === 1, '开摄像头后角色回到右下角浮窗')
      check(
        withCamera.statusColor === 'rgb(253, 250, 245)',
        '浮窗里的状态字是浅色（深底上看得见）',
        withCamera.statusColor,
      )
    }
  } else {
    check(false, '自我教练页出现了「AI 自我教练说明」弹窗')
  }
} catch (error) {
  problems.push('流程中断：' + (error && error.message ? error.message : String(error)))
} finally {
  /* 想看这一轮改过的几屏长什么样：$env:SHOTS="1"; node tools/booking-orders-check.mjs */
  if (process.env.SHOTS && !problems.length) {
    await mkdir(SHOTS, { recursive: true })
    const shots = [
      ['booking.html', '预约-成功卡.png', false],
      ['booking.html', '预约-表单.png', true],
      ['orders.html', '我的订单.png', true],
      ['coaches.html', '找教练-价格.png', true],
    ]
    for (const [file, name, fresh] of shots) {
      if (fresh) await page.evaluate(() => sessionStorage.clear())
      await page.goto(demo.origin + '/' + file, { waitUntil: 'load' })
      await page.waitForTimeout(400)
      if (!fresh && file === 'booking.html') {
        await page.fill('#need', '下个月有场重要的考试，最近一想到就睡不着。')
        await page.check('#agree')
        await page.click('[data-booking-submit]')
        await page.waitForSelector('.booking-done__amount', { timeout: 4000 })
      }
      await page.screenshot({ path: path.join(SHOTS, name), fullPage: true })
      console.log('  shot ' + name)
    }
  }
  await browser.close()
  await demo.close()
}

console.log(notes.join('\n'))
/* `/api/v1/...` 的 404 是 auth-guard 在问「后端在不在」：这台静态服务当然没有后端，
   所以那一条不算问题；其余 404 / 控制台报错要报出来。 */
const backendProbes = badResponses.filter((text) => /\/api\/v1\/|\/socket\.io\//.test(text))
const realFailures = badResponses.filter((text) => !/\/api\/v1\/|\/socket\.io\//.test(text))
if (backendProbes.length) {
  console.log('\n（静态服务下 ' + backendProbes.length + ' 次「后端在不在」的探测返回 404，属预期）')
}
if (realFailures.length) {
  console.log('\n资源加载失败（' + realFailures.length + '）：')
  realFailures.forEach((text) => console.log('  · ' + text))
}
/* 自我教练页始终连真 socket.io，这台静态服务上没有后端 → WebSocket 握手 404，同样算预期 */
const expectedConsole = /status of 404|socket\.io|WebSocket/i
const realConsole = consoleErrors.filter((text) => !expectedConsole.test(text))
if (realConsole.length) {
  console.log('\n控制台报错（' + realConsole.length + '）：')
  realConsole.slice(0, 10).forEach((text) => console.log('  · ' + text))
}
if (problems.length || realFailures.length) {
  console.log('\n没通过（' + problems.length + '）：')
  problems.forEach((text) => console.log('  × ' + text))
  process.exitCode = 1
} else {
  console.log('\n全部通过。')
}
