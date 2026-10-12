/** Check the element pairs whose overlap would be a defect, at several widths. */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEMO = path.resolve(HERE, '..')
const PAGE_FILE = process.env.PAGE || 'index.html'
const PAGE = pathToFileURL(path.join(DEMO, PAGE_FILE)).href

/** [a, b, what it would mean] — an intersection means the composition is broken. */
/* The first band is one painting now — the two people are *inside* the picture, so there is
   no illustration element left to collide with. Instead the painting's own geometry is used
   to check that nothing covers the two people (see SUBJECT below). */
const HOME_PAIRS = [
  ['.hero__copy', '.hero__entries', 'the pinned entry cards cover the headline'],
  ['.hero__chips', '.hero__entries', 'the pinned entry cards cover the trust chips'],
  ['.hero__actions', '.hero__entries', 'the pinned entry cards cover the buttons'],
  ['.entry:nth-child(3) .entry__art', '.entry:nth-child(3) .entry__text', 'an entry drawing covers its words'],
  ['.ground', '.footer', 'the ground runs into the footer'],
]

const COACH_PAIRS = [
  ['.vc-stage', '.vc-sidebar', 'the stage and the sidebar overlap'],
  ['.vc-topbar', '.vc-main', 'the topbar lands on the stage'],
  ['.vc-stats', '.state-chip', 'the stats run into the state chip'],
  ['.stage-camoff', '.call-overlay', 'the camera-off panel runs into the companion card'],
  ['.co-avatar', '.co-status', 'the companion drawing runs into its status line'],
  ['.call-overlay', '.vc-controls', 'the companion card reaches the control bar'],
  ['.sidebar-header', '.signal-panel', 'the sidebar heading lands on the signal strip'],
  ['.signal-panel', '.chat-body', 'the signal strip runs into the conversation'],
  ['.volume-meter', '.ctrl-actions', 'the volume meter runs into the buttons'],
  ['.vc-controls', '.vc-tips', 'the buttons land on the tips line'],
  ['.masthead', '.ai-banner', 'the masthead lands on the AI banner'],
  ['.ai-text', '.ai-badge', 'the badge lands on the disclaimer text'],
]

const JOURNAL_PAIRS = [
  ['.masthead__inner', '.ej-page', 'the masthead lands on the notebook'],
  ['.ej-header', '.ej-write-card', 'the header runs into the record card'],
  ['.ej-mood-bar', '.ej-input-wrap', 'the mood row runs into the writing area'],
  ['.ej-textarea', '.ej-input-footer', 'the writing area runs into the counter row'],
  ['.ej-char-count', '.ej-submit-btn', 'the counter lands on the button'],
  ['.ej-calendar-card', '.ej-journal-list', 'the calendar and the records overlap'],
  ['.ej-card-mood-orb', '.ej-card-text', 'the face lands on the entry text'],
  ['.ej-card-delete', '.ej-card-time', 'the delete button lands on the timestamp'],
  ['.ej-trend-name', '.ej-trend-bar-track', 'the label runs into the bar'],
  ['.ej-trend-bar-track', '.ej-trend-count', 'the bar runs into the count'],
  ['.ej-section-head', '.ej-calendar-card', 'the section heading lands on the calendar'],
]

/* The inner surfaces share one page skeleton — the field's own top band (`.plate`), the
   ground under it, and the compliance footer — so they share one assertion set. What it
   guards is the two things that actually go wrong on a page built that way: a title that
   outgrows its band, and a band that does not hand over cleanly to the ground. */
const PAGES_PAIRS = [
  ['.masthead__inner', '.plate__title', 'the masthead lands on the page title'],
  ['.plate__title', '.ground', 'the page title runs into the ground band'],
  ['.plate', '.ground', 'the header band and the ground overlap'],
  ['.ground', '.footer', 'the ground runs into the footer'],
]

/* 首页背景（首页背景-双人聊天版-优化后）里两个人所在的位置（右边那只猫也算在内），
   按画面比例量出来的：横向 53%–97%、纵向 28%–80%（优化后人物组缩小并左移，光晕之外
   左上留白更大，所以框比上一版宽、也更靠上）。首屏的盒子就是这幅画本身（比例 2896 : 1448），
   所以盒子多大、画就多大，从盒子直接算出这个矩形，再逐个看有没有元素压在上面。 */
const SUBJECT = { aspect: 2896 / 1448, left: 0.53, right: 0.97, top: 0.28, bottom: 0.8 }
const SUBJECT_GUARDS = ['.hero__copy', '.hero__entries']

const PAIRS =
  PAGE_FILE === 'self-coaching.html'
    ? COACH_PAIRS
    : PAGE_FILE === 'emotion-journal.html'
      ? JOURNAL_PAIRS
      : PAGE_FILE === 'index.html'
        ? HOME_PAIRS
        : PAGES_PAIRS

const WIDTHS = [1920, 1600, 1440, 1280, 1200, 1100]

/* 自我教练页整页就是原前端的 Vue 组件：开场是「通话前」，要进通话中才有舞台提示、
   控制条那些元素。所以这一页用假摄像头/麦克风起，标掉说明弹窗，再点开始。 */
const COACH = PAGE_FILE === 'self-coaching.html'
const browser = await chromium.launch({
  channel: 'chrome',
  args: COACH ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : [],
})
let hits = 0
for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    locale: 'zh-CN',
    permissions: COACH ? ['microphone', 'camera'] : [],
  })
  const page = await context.newPage()
  await page.goto(PAGE, { waitUntil: 'load' })
  if (COACH) {
    await page.evaluate(() => localStorage.setItem('mb_ai_ack_v1', '1'))
    await page.reload({ waitUntil: 'load' })
    await page.getByRole('button', { name: '开始自我教练' }).click()
    await page.waitForTimeout(2200)
  }
  await page.evaluate(() => document.fonts.ready)
  const found = await page.evaluate(({ pairs, subject, guards }) => {
    const out = []
    for (const [a, b, why] of pairs) {
      const ea = document.querySelector(a)
      const eb = document.querySelector(b)
      if (!ea || !eb) {
        out.push(`${a} ✕ ${b} — selector missing`)
        continue
      }
      const ra = ea.getBoundingClientRect()
      const rb = eb.getBoundingClientRect()
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (ox > 2 && oy > 2) out.push(`${why}  (${Math.round(ox)}x${Math.round(oy)}px overlap)`)
    }

    // 首屏那幅画里两个人所在的位置：首屏的盒子就是画本身（同比例），从盒子直接反推
    if (subject) {
      const hero = document.querySelector('.hero')
      if (hero) {
        const r = hero.getBoundingClientRect()
        const imgH = r.width / subject.aspect
        const imgTop = r.bottom - imgH
        const people = {
          left: r.left + r.width * subject.left,
          right: r.left + r.width * subject.right,
          top: imgTop + imgH * subject.top,
          bottom: imgTop + imgH * subject.bottom,
        }
        for (const sel of guards) {
          const el = document.querySelector(sel)
          if (!el) continue
          const b = el.getBoundingClientRect()
          const ox = Math.min(b.right, people.right) - Math.max(b.left, people.left)
          const oy = Math.min(b.bottom, people.bottom) - Math.max(b.top, people.top)
          if (ox > 2 && oy > 2) {
            out.push(`${sel} covers the two people in the painting  (${Math.round(ox)}x${Math.round(oy)}px)`)
          }
        }
      }
    }
    return out
  }, { pairs: PAIRS, subject: PAGE_FILE === 'index.html' ? SUBJECT : null, guards: SUBJECT_GUARDS })
  hits += found.length
  console.log(`\n=== ${width}px` + (found.length ? '' : '  ok'))
  for (const f of found) console.log(`    ! ${f}`)
  await context.close()
}
await browser.close()
console.log(`\n${hits ? `${hits} collision(s)` : 'no collisions'}`)
process.exit(hits ? 1 : 0)
