/**
 * Render the demo page to the PNGs that live in frontend_hand/演示图.
 *
 * Playwright drives the Chrome that is already on the machine (channel: 'chrome'), so no
 * browser download is needed; the page is a plain file:// document whose fonts and images
 * sit next to it.
 *
 * Run:  node tools/render.mjs            (all targets)
 *       node tools/render.mjs desktop    (one target)
 */
import { createReadStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEMO = path.resolve(HERE, '..')
const OUT = path.resolve(DEMO, '..', '演示图')
const REVIEW = path.resolve(DEMO, '.cache', 'review')
const url = (file) => pathToFileURL(path.join(DEMO, file)).href

/* 自我教练页里，3D 陪伴角色的素材路径是原组件写死的站内绝对路径（`/companion/…`）——
   `file://` 下那是指向磁盘根目录，取不到。所以需要真设备的那些目标由脚本自己起一个
   只服务 demo/ 的小静态服务，把这一页当成「部署在站点根下」打开：和 README 里
   「要看动态角色请起本地服务」是同一件事，只是这里不用你手动起。 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
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

/**
 * One deliverable: the whole homepage at 1440 logical px, 2× density. This is a web surface,
 * so no phone composition is produced; the `wide` target is here only to prove the layout
 * holds when the window is wider than the design width.
 */
const TARGETS = [
  {
    id: 'home',
    page: 'index.html',
    file: '首页-手绘风-桌面端.png',
    out: OUT,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    fullPage: true,
    session: 'out',
  },
  {
    id: 'coach',
    page: 'self-coaching.html',
    file: '自我教练-手绘风-桌面端.png',
    out: OUT,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    /* 通话台占满第一屏、页脚被挤到折线以下，所以这一页按「一屏」出图 */
    fullPage: false,
    session: 'in',
    /* 这一页整页就是原前端的 VideoCallView（Vue 组件挂在 #app 上）：开场是「通话前」，
       要标掉「AI 自我教练说明」、点「开始自我教练」才进通话中 —— 下面这屏就是那一刻。 */
    media: true,
    prepare: async (page) => {
      await page.evaluate(() => localStorage.setItem('mb_ai_ack_v1', '1'))
      await page.reload({ waitUntil: 'load' })
      await page.getByRole('button', { name: '开始自我教练' }).click()
      /* 等脚本化对话走到第三句，侧栏里有来有回 */
      await page
        .locator('.chat-msg')
        .nth(2)
        .waitFor({ timeout: 15000 })
        .catch(() => {})
    },
    settle: 1200,
  },
  {
    /* 同一页的「通话前」一屏 —— 原版的第一屏（光球里的角色、三项授权、开始按钮） */
    id: 'coach-idle',
    page: 'self-coaching.html',
    file: '自我教练-通话前.png',
    out: REVIEW,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    fullPage: false,
    session: 'in',
    media: true,
    prepare: async (page) => {
      await page.evaluate(() => localStorage.setItem('mb_ai_ack_v1', '1'))
      await page.reload({ waitUntil: 'load' })
    },
    settle: 800,
  },
  {
    id: 'wide',
    page: 'index.html',
    file: '1920.png',
    out: REVIEW,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    fullPage: true,
    session: 'out',
  },
  {
    id: 'coaches',
    page: 'coaches.html',
    file: '真人教练-手绘风-桌面端.png',
    out: OUT,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    /* 内层页是固定背景（页面在背景上滑过），整页截图会把固定背景只画一屏，
       所以这一类页面按「一屏」出图 —— 也是它真实的样子 */
    fullPage: false,
    session: 'out',
  },
  {
    id: 'journal',
    page: 'emotion-journal.html',
    file: '情绪日记-手绘风-桌面端.png',
    out: OUT,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    fullPage: true,
    session: 'in',
  },
]

const wanted = process.argv.slice(2)
const targets = wanted.length ? TARGETS.filter((t) => wanted.includes(t.id)) : TARGETS
if (!targets.length) {
  console.error(`no target matched. known ids: ${TARGETS.map((t) => t.id).join(', ')}`)
  process.exit(1)
}

await mkdir(OUT, { recursive: true })
await mkdir(REVIEW, { recursive: true })

const site = targets.some((t) => t.media) ? await serveDemo() : null

/* 自我教练页的本地假服务端已删（页面始终用真的 socket.io-client），所以它的图得来自真后端：
   后端 + 演示站开发服务器（带 /api 与 /socket.io 代理）都在时，就用开发服务器打开这一页，
   并先用演示账号登录、把 token 注进页面；两个都没起时退回本地静态服务（那一页会显示「服务未连接」）。 */
const DEV = 'http://127.0.0.1:5178'

async function devServerReady() {
  try {
    return (await fetch(`${DEV}/api/v1/platform/config`)).ok
  } catch {
    return false
  }
}

async function demoToken() {
  try {
    const response = await fetch('http://127.0.0.1:8000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '13900000002', password: 'Demo123456' }),
    })
    const body = await response.json()
    return body?.data?.accessToken || null
  } catch {
    return null
  }
}

const needsBackend = targets.some((t) => t.media)
const useDevServer = needsBackend ? await devServerReady() : false
const authToken = useDevServer ? await demoToken() : null
if (needsBackend) {
  console.log(
    useDevServer
      ? `自我教练页走开发服务器 ${DEV}（演示账号${authToken ? '已' : '未'}登录）`
      : '开发服务器没起：自我教练页按静态服务出图（页面上会显示「服务未连接」）',
  )
}

/* 自我教练页要真的拿到麦克风/摄像头才跑得起来（原组件用 getUserMedia 起设备），
   所以这一批用 Chrome 的假设备；其它页不需要 */
const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    ...(targets.some((t) => t.media)
      ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
      : []),
  ],
})

for (const target of targets) {
  const context = await browser.newContext({
    viewport: target.viewport,
    deviceScaleFactor: target.deviceScaleFactor,
    locale: 'zh-CN',
    reducedMotion: 'reduce',
    permissions: target.media ? ['microphone', 'camera'] : [],
  })
  const page = await context.newPage()
  const problems = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`))

  const openWithDevServer = useDevServer && target.media
  if (openWithDevServer && authToken) {
    await context.addInitScript((token) => {
      try {
        window.localStorage.setItem('mb_access_token', token)
        window.localStorage.setItem('feisi_backend', 'live')
      } catch {
        /* localStorage 不可用时忽略 */
      }
    }, authToken)
  }
  const pageUrl =
    (openWithDevServer
      ? `${DEV}/${target.page}`
      : site && target.media
        ? `${site.origin}/${target.page}`
        : url(target.page)) +
    (target.query ? `?${target.query}` : '')
  await page.goto(pageUrl, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate((session) => {
    document
      .querySelectorAll('[data-session-label]')
      .forEach((el) => (el.textContent = session === 'in' ? '个人中心' : '开始登录'))
  }, target.session)
  if (target.prepare) await target.prepare(page)
  if (target.media) {
    // 等 3D 陪伴角色真的出画（canvas 有像素）
    await page
      .waitForFunction(() => {
        const cvs = document.querySelector('.cs-canvas')
        return !!cvs && cvs.width > 8
      }, null, { timeout: 8000 })
      .catch(() => {})
  }
  await page.waitForTimeout(target.settle || 320)

  const dest = path.join(target.out, target.file)
  await page.screenshot({ path: dest, fullPage: target.fullPage })

  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  console.log(
    `${target.file.padEnd(30)} ${metrics.scrollWidth}x${metrics.scrollHeight} ` +
      `(viewport ${metrics.innerWidth})${problems.length ? `  ! ${problems.join(' | ')}` : ''}`,
  )
  await context.close()
}

await browser.close()
if (site) await site.close()
