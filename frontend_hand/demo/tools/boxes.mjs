/** Dump exact geometry for named elements so composition can be checked numerically. */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEMO = path.resolve(HERE, '..')
const PAGE = pathToFileURL(path.join(DEMO, 'index.html')).href

const SELECTORS = [
  '.masthead',
  '.hero',
  '.hero__copy',
  '.hero__title',
  '.hero__lede',
  '.hero__actions',
  '.hero__chips',
  '.hero__sticky',
  '.hero__entries',
  '.entries',
  '.entry:nth-child(1)',
  '.entry:nth-child(2)',
  '.entry:nth-child(3)',
  '.entry:nth-child(4)',
  '.ground',
  '.footer__inner',
]

const width = Number(process.argv[2] || 1440)
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()
await page.goto(PAGE, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)

const rows = await page.evaluate((selectors) => {
  const r = (n) => Math.round(n * 10) / 10
  const scrollY = window.scrollY
  return selectors.map((sel) => {
    const el = document.querySelector(sel)
    if (!el) return { sel, missing: true }
    const b = el.getBoundingClientRect()
    return {
      sel,
      x: r(b.left),
      y: r(b.top + scrollY),
      w: r(b.width),
      h: r(b.height),
      bottom: r(b.bottom + scrollY),
    }
  })
}, SELECTORS)

for (const row of rows) {
  if (row.missing) {
    console.log(`${row.sel.padEnd(28)} MISSING`)
    continue
  }
  console.log(
    `${row.sel.padEnd(28)} x ${String(row.x).padStart(7)}  y ${String(row.y).padStart(7)}  ` +
      `${String(row.w).padStart(7)} x ${String(row.h).padStart(7)}  → ${row.bottom}`,
  )
}

await browser.close()
