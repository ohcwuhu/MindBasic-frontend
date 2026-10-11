/**
 * Measure the rendered page instead of trusting it: sideways overflow, elements escaping the
 * viewport, pictures that did not load, text overflowing its box, the two type voices, and
 * the section rhythm.
 *
 * Run:  node tools/verify.mjs
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEMO = path.resolve(HERE, '..')
const PAGE = pathToFileURL(path.join(DEMO, process.env.PAGE || 'index.html')).href
/** the element that has to be set in the project's hand-written face, per page */
const HEADLINES = {
  'self-coaching.html': '.sidebar-title',
  'emotion-journal.html': '.ej-title',
}
/* the homepage opens on its own hero; every inner surface opens on the same field with a
   `.plate__title`, so one selector covers the rest */
const HEADLINE = HEADLINES[process.env.PAGE || 'index.html'] || '.hero__title, .plate__title'

const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1600', width: 1600, height: 1000 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1100', width: 1100, height: 760 },
]

/* 自我教练页整页就是原前端的 Vue 组件，开场是「通话前」；用假设备起、点开始，
   量到的才是通话中那一屏的真实版式 */
const COACH = (process.env.PAGE || 'index.html') === 'self-coaching.html'
const browser = await chromium.launch({
  channel: 'chrome',
  args: COACH ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : [],
})
let failures = 0

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    permissions: COACH ? ['microphone', 'camera'] : [],
  })
  const page = await context.newPage()
  const bad = []
  /* 自我教练页的角色素材是原组件写死的站内绝对路径 `/companion/…`：本地服务下取得到
     （服务器根就是 demo/），`file://` 下取不到 —— 这一页要看 3D 角色本来就得起服务，
     所以这条已知的失败不算版式问题，详见 README。 */
  /* 自我教练页的两条已知项（都只发生在 file:// 下）：
       · 角色素材是原组件写死的站内绝对路径 `/companion/…`，file:// 下取不到；
       · socket.io 现在**始终连真后端**（本地假服务端已删），file:// 下没有同源服务可连。
     本地服务打开时两条都不会出现。 */
  const knownAssetMiss = (text) =>
    COACH && /\/companion\/|ERR_FILE_NOT_FOUND|socket\.io|ERR_NAME_NOT_RESOLVED/.test(text)
  page.on('requestfailed', (r) => {
    if (!knownAssetMiss(r.url())) bad.push(`request failed: ${r.url()}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error' && !knownAssetMiss(m.text())) bad.push(`console: ${m.text()}`)
  })
  await page.goto(PAGE, { waitUntil: 'load' })
  if (COACH) {
    await page.evaluate(() => localStorage.setItem('mb_ai_ack_v1', '1'))
    await page.reload({ waitUntil: 'load' })
    await page.getByRole('button', { name: '开始自我教练' }).click()
    await page.waitForTimeout(2200)
  }
  await page.evaluate(() => document.fonts.ready)

  const report = await page.evaluate((headSel) => {
    const round = (n) => Math.round(n * 10) / 10
    const doc = document.documentElement

    const escapees = []
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el)
      if (style.position === 'absolute' || style.position === 'fixed') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.right - window.innerWidth > 1 || r.left < -1) {
        escapees.push(
          `${el.tagName.toLowerCase()}.${String(el.className) || '-'} [${round(r.left)}..${round(r.right)}]`,
        )
      }
    }

    const broken = [...document.images]
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute('src'))

    const clipped = []
    for (const el of document.querySelectorAll('h1,h2,h3,p,span,a,li,em,strong')) {
      const style = getComputedStyle(el)
      if (style.overflowX === 'auto' || style.whiteSpace === 'nowrap') continue
      // a tilted note has a wider bounding box than its own content box; not a defect
      if (style.rotate !== 'none' || (style.transform && style.transform !== 'none')) continue
      if (el.scrollWidth - el.clientWidth > 2) {
        clipped.push(`${el.tagName.toLowerCase()}: ${(el.textContent || '').trim().slice(0, 20)}`)
      }
    }

    const faceOf = (sel) => getComputedStyle(document.querySelector(sel)).fontFamily
    const h1 = document.querySelector(headSel)
    const h1Box = h1.getBoundingClientRect()

    const sections = [...document.querySelectorAll('main > *, main > * > section')]
      .filter((s) => s.getBoundingClientRect().height > 120)
      .map((s) => ({
        cls: s.className || s.tagName.toLowerCase(),
        top: round(s.getBoundingClientRect().top + window.scrollY),
        h: round(s.getBoundingClientRect().height),
      }))

    return {
      page: { scrollWidth: doc.scrollWidth, scrollHeight: doc.scrollHeight, innerWidth: window.innerWidth },
      overflowX: doc.scrollWidth - window.innerWidth,
      escapees: escapees.slice(0, 6),
      broken,
      clipped: clipped.slice(0, 6),
      h1: {
        family: faceOf(headSel),
        size: round(parseFloat(getComputedStyle(h1).fontSize)),
        box: [round(h1Box.width), round(h1Box.height)],
      },
      bodyFamily: faceOf('body'),
      bodySize: round(parseFloat(getComputedStyle(document.body).fontSize)),
      sections,
    }
  }, HEADLINE)

  const local = []
  if (report.overflowX > 1) local.push(`sideways overflow ${report.overflowX}px`)
  if (report.escapees.length) local.push(`outside viewport: ${report.escapees.join(', ')}`)
  if (report.broken.length) local.push(`images not loaded: ${report.broken.join(', ')}`)
  if (report.clipped.length) local.push(`text overflowing: ${report.clipped.join(' | ')}`)
  if (!/LXGW WenKai/.test(report.h1.family)) local.push(`headline face is not the hand: ${report.h1.family}`)
  if (!/Noto Sans SC|PingFang|Hiragino|YaHei/.test(report.bodyFamily)) {
    local.push(`body face unexpected: ${report.bodyFamily}`)
  }
  local.push(...bad.slice(0, 4))

  failures += local.length
  console.log(`\n=== ${vp.name}px  ·  page ${report.page.scrollWidth}x${report.page.scrollHeight}`)
  console.log(`    headline: ${report.h1.size}px, box ${report.h1.box.join('x')}, face ${report.h1.family.split(',')[0]}`)
  console.log(`    body:    ${report.bodySize}px, face ${report.bodyFamily.split(',')[0]}`)
  for (const s of report.sections) {
    console.log(`      ${String(s.top).padStart(6)}  h=${String(s.h).padStart(6)}  ${s.cls}`)
  }
  console.log(local.length ? `    x ${local.join('\n    x ')}` : '    ok no layout problems found')
  await context.close()
}

await browser.close()
console.log(`\n${failures ? `${failures} problem(s) reported` : 'all checks clean'}`)
process.exit(failures ? 1 : 0)
