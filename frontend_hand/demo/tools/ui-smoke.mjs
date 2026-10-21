import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEMO = path.resolve(HERE, '..')
const PORT = 5180
const BASE = `http://127.0.0.1:${PORT}`
const SHOTS = path.join(os.tmpdir(), 'feisi-ui-smoke')
fs.mkdirSync(SHOTS, { recursive: true })
const server = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: DEMO,
  stdio: 'ignore',
  windowsHide: true,
})

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/articles.html`)
      if (response.ok) return
    } catch {
      /* 服务正在启动 */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('静态站没有在 3 秒内启动')
}

function envelope(data) {
  return { code: 'OK', message: 'OK', data, traceId: 'ui-smoke' }
}

async function run() {
  await waitForServer()
  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch {
    browser = await chromium.launch({ headless: true, channel: 'chrome' })
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript(() => {
    localStorage.setItem('mb_access_token', 'ui-smoke-token')
    localStorage.setItem('feisi_backend', 'live')
    localStorage.setItem('feisi_role', 'USER')
    localStorage.setItem('feisi_nickname', '自检用户')
  })

  const page = await context.newPage()
  const consoleErrors = []
  const journalItems = Array.from({ length: 51 }, (_, index) => {
    const created = new Date(Date.UTC(2026, 9, 21) - index * 24 * 60 * 60 * 1000)
    return {
      id: index + 1,
      moodType: 'CALM',
      content: `日记夹具 ${index + 1}`,
      feedback: '',
      source: 'MANUAL',
      sourceConversationId: null,
      createdAt: created.toISOString(),
    }
  })
  let failTrendAfterSave = false
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !message.text().includes('503 (Service Unavailable)') &&
      !message.text().includes("WebSocket connection to 'ws://127.0.0.1:5180/socket.io/")
    ) {
      consoleErrors.push(message.text())
    }
  })

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const pathname = url.pathname
    const categoryId = url.searchParams.get('categoryId')

    if (pathname === '/api/v1/users/me') {
      return route.fulfill({
        json: envelope({ id: 1, nickname: '自检用户', role: 'COACH', phone: '139****0000' }),
      })
    }
    if (pathname === '/api/v1/platform/config') {
      return route.fulfill({
        json: envelope({ platformName: '斐思同行', hotline: '12356', aiDisclaimer: 'AI 内容仅供参考' }),
      })
    }
    if (pathname === '/api/v1/notifications/unread-count') {
      return route.fulfill({ json: envelope({ count: 1 }) })
    }
    if (pathname === '/api/v1/article-categories') {
      return route.fulfill({
        json: envelope({ items: [{ id: 1, name: '分类 A' }, { id: 2, name: '分类 B' }] }),
      })
    }
    if (pathname === '/api/v1/articles') {
      if (categoryId === '1') await new Promise((resolve) => setTimeout(resolve, 260))
      if (categoryId === '2') await new Promise((resolve) => setTimeout(resolve, 20))
      const title = categoryId === '1' ? '旧分类结果' : categoryId === '2' ? '最新分类结果' : '初始文章'
      return route.fulfill({
        json: envelope({
          items: [{
            id: Number(categoryId || 10),
            title,
            summary: '筛选回归夹具',
            categoryId: Number(categoryId || 1),
            publishedAt: '2026-10-21T10:00:00',
          }],
          pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1, hasMore: false },
        }),
      })
    }
    if (pathname === '/api/v1/articles/10') {
      return route.fulfill({
        json: envelope({
          id: 10,
          title: '收藏回归文章',
          summary: '收藏夹具',
          categoryId: 1,
          isFavorite: false,
          content: '<p>正文</p>',
          viewCount: 1,
          publishedAt: '2026-10-21T10:00:00',
        }),
      })
    }
    if (pathname === '/api/v1/articles/10/favorite') {
      return route.fulfill({ json: envelope({ isFavorite: true }) })
    }
    if (pathname === '/api/v1/notifications') {
      return route.fulfill({
        json: envelope({
          items: [{ id: 1, type: 'SYSTEM', title: '已读通知', content: '第二页未读测试', isRead: true, createdAt: '2026-10-21T10:00:00' }],
          pagination: { page: 1, pageSize: 20, totalItems: 21, totalPages: 2, hasMore: true },
        }),
      })
    }
    if (pathname === '/api/v1/notifications/read-all') {
      return route.fulfill({
        status: 503,
        json: { code: 'SERVICE_UNAVAILABLE', message: '暂时没有成功，请重试', data: null, traceId: 'ui-smoke' },
      })
    }
    if (pathname === '/api/v1/emotion-journals/trend') {
      if (failTrendAfterSave) {
        return route.fulfill({
          status: 503,
          json: { code: 'SERVICE_UNAVAILABLE', message: '统计暂时不可用', data: null, traceId: 'ui-smoke' },
        })
      }
      return route.fulfill({
        json: envelope({
          days: 30,
          items: [],
          summary: { CALM: 1, HAPPY: 0, ANXIOUS: 0, DOWN: 0, IRRITATED: 0, OTHER: 0 },
        }),
      })
    }
    if (pathname === '/api/v1/emotion-journals/calendar') {
      const month = url.searchParams.get('month') || '2026-10'
      const [year, monthNumber] = month.split('-').map(Number)
      const dayCount = new Date(year, monthNumber, 0).getDate()
      const days = Array.from({ length: dayCount }, (_, index) => {
        const date = `${year}-${String(monthNumber).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
        return { date, moods: index === 0 ? { CALM: 1 } : {}, count: index === 0 ? 1 : 0 }
      })
      return route.fulfill({
        json: envelope({
          year,
          month: monthNumber,
          days,
          summary: { CALM: 1, HAPPY: 0, ANXIOUS: 0, DOWN: 0, IRRITATED: 0, OTHER: 0 },
        }),
      })
    }
    if (pathname === '/api/v1/emotion-journals' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const created = {
        id: 100,
        moodType: body.moodType,
        content: body.content,
        feedback: '已收到',
        source: 'MANUAL',
        sourceConversationId: null,
        createdAt: '2026-10-21T12:00:00Z',
      }
      journalItems.unshift(created)
      failTrendAfterSave = true
      return route.fulfill({ status: 201, json: envelope(created) })
    }
    if (pathname === '/api/v1/emotion-journals') {
      const pageNumber = Math.max(1, Number(url.searchParams.get('page')) || 1)
      const pageSize = Math.max(1, Number(url.searchParams.get('pageSize')) || 10)
      const start = (pageNumber - 1) * pageSize
      return route.fulfill({
        json: envelope({
          items: journalItems.slice(start, start + pageSize),
          pagination: {
            page: pageNumber,
            pageSize,
            totalItems: journalItems.length,
            totalPages: Math.max(1, Math.ceil(journalItems.length / pageSize)),
            hasMore: start + pageSize < journalItems.length,
          },
        }),
      })
    }
    return route.fulfill({ json: envelope({ items: [], pagination: {} }) })
  })

  await page.goto(`${BASE}/articles.html`)
  await page.waitForFunction(() => document.querySelector('.masthead__actions a[href*="coach.html"]'))
  await page.waitForSelector('[data-cat="1"]')
  await page.click('[data-cat="1"]')
  await page.click('[data-cat="2"]')
  await page.waitForTimeout(420)
  const renderedTitle = await page.locator('.art-row__title').textContent()
  if (renderedTitle !== '最新分类结果') throw new Error(`筛选乱序回归失败：${renderedTitle}`)
  await page.screenshot({ path: path.join(SHOTS, 'articles-filtered.png'), fullPage: false })

  await page.goto(`${BASE}/article-detail.html?id=10`)
  await page.waitForSelector('[data-favorite]:not([hidden])')
  await page.click('[data-favorite]')
  await page.waitForFunction(() => document.querySelector('[data-favorite]')?.getAttribute('aria-pressed') === 'true')

  await page.goto(`${BASE}/notifications.html`)
  await page.waitForFunction(() => !document.querySelector('[data-read-all]').disabled)
  await page.click('[data-read-all]')
  await page.waitForFunction(() => document.querySelector('[data-read-all]').textContent.includes('全部标为已读'))
  const readAllEnabled = await page.locator('[data-read-all]').isEnabled()
  if (!readAllEnabled) throw new Error('全部已读失败后没有恢复重试')

  await page.goto(`${BASE}/my-growth.html`)
  await page.waitForFunction(() => window.FeisiJournalAction)
  const actionText = await page.evaluate(() => {
    const parsed = window.FeisiJournalAction.parseJournalAction(
      '我的一小步：第一步\n第二步（今晚；完成条件：两步都做完）',
    )
    return parsed && parsed.text
  })
  if (actionText !== '第一步 第二步') throw new Error(`行动解析回归失败：${actionText}`)

  await page.goto(`${BASE}/emotion-journal.html?journalId=51`)
  await page.waitForSelector('[data-journal-id="51"]')
  const oldJournalText = await page.locator('[data-journal-id="51"] .ej-card-text').textContent()
  if (oldJournalText !== '日记夹具 51') throw new Error(`旧日记定位失败：${oldJournalText}`)

  await page.goto(`${BASE}/emotion-journal.html`)
  await page.click('.ej-mood-pill')
  await page.fill('#journal-feeling', '保存成功但统计暂时失败')
  await page.click('.ej-submit-btn')
  await page.waitForFunction(() =>
    document.querySelector('.ej-status')?.textContent.includes('日记已保存'),
  )
  await page.waitForSelector('.ej-card-text:text("保存成功但统计暂时失败")')
  await page.screenshot({ path: path.join(SHOTS, 'journal-save-refresh-warning.png'), fullPage: false })

  await page.goto(`${BASE}/emotion-journal.html`)
  await page.click('[aria-label="上个月"]')
  await page.waitForSelector('[aria-label="2026-09-01 的心情"]')
  await page.click('[aria-label="2026-09-01 的心情"]')
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.ej-card-text')).some((node) => node.textContent === '日记夹具 51'),
  )

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${BASE}/self-coaching.html`)
  await page.waitForSelector('.cs-frame')
  const videoCount = await page.locator('video.cs-video-src').count()
  if (videoCount !== 0) throw new Error('减少动态效果下角色仍在播放视频')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(SHOTS, 'self-coaching-reduced-motion-mobile.png'), fullPage: false })

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(`${BASE}/emotion-journal.html`)
  await page.waitForSelector('.ej-page')
  await Promise.all([
    page.waitForURL(/login\.html\?next=/, { waitUntil: 'commit' }),
    page.evaluate(() => window.dispatchEvent(new CustomEvent('mb:logout'))),
  ])

  if (consoleErrors.length) throw new Error(`浏览器控制台错误：${consoleErrors.join(' | ')}`)
  await browser.close()
  console.log('UI smoke passed: 角色入口、筛选乱序、文章收藏、通知重试、行动格式、旧日记定位、按日回溯、保存后局部失败、减少动态效果、Vue 登录失效')
  console.log(`Screenshots: ${SHOTS}`)
}

try {
  await run()
} finally {
  await new Promise((resolve) => setTimeout(resolve, 50))
  server.kill()
}
