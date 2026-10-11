/**
 * 极端内容压力自检：把后端会回来的那几段文字换成「最长的可能」，看版式会不会被顶破。
 *
 * 为什么单独一个脚本：`verify.mjs` 跑的是 `file://` 的静态示例（短、好看），真实数据里的
 * 长昵称、长群名、一长串不分词的英文或网址都不会出现在那份示例里。这一份用**替身响应**把
 * 这些长度塞进去，只在浏览器里量，不写库。
 *
 * 用法（要开发服务器 5178）：
 *   node tools/stress-check.mjs
 * 退出码非 0 表示有页面被顶破了（横向溢出 / 元素越过右边缘）。
 */
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:5178'
const problems = []

const LONG_CN = '很长很长的一个中文昵称用来看看会不会把这一行顶出去'.repeat(3)
const LONG_TOKEN = 'A'.repeat(120)
const LONG_URL = 'https://example.com/' + 'a'.repeat(160)

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: 'zh-CN' })

const json = (data) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 'OK', message: 'success', data }),
})

await context.route('**/api/v1/notifications**', (route) => {
  const url = route.request().url()
  if (route.request().method() === 'POST') return route.fulfill(json({ message: 'ok' }))
  if (url.includes('unread-count')) return route.fulfill(json({ count: 1234 }))
  return route.fulfill(
    json({
      items: [
        { id: 1, type: 'SYSTEM', title: LONG_CN, content: LONG_URL, isRead: false, createdAt: '2026-10-11T12:31:00.000Z' },
        { id: 2, type: 'APPOINTMENT', title: LONG_TOKEN, content: LONG_CN, isRead: true, createdAt: '2026-10-11T12:31:00.000Z' },
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1, hasMore: false },
    }),
  )
})

await context.route('**/api/v1/wallet**', (route) => {
  const url = route.request().url()
  if (url.endsWith('/wallet')) return route.fulfill(json({ balanceInCents: 9876543210 }))
  return route.fulfill(
    json({
      items: [
        { changeInCents: 99999999, balanceAfter: 9876543210, bizType: 'ADMIN_GRANT', note: LONG_CN, createdAt: '2026-10-11T12:31:00.000Z' },
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasMore: false },
    }),
  )
})

const COMMUNITY = {
  id: 1,
  name: LONG_CN,
  description: LONG_CN,
  coverUrl: null,
  coachNickname: LONG_TOKEN,
  memberCount: 12345,
  joined: true,
  canManage: false,
  maxMembers: 500,
  createdAt: '2026-09-01T00:00:00.000Z',
}
await context.route('**/api/v1/communities**', (route) => {
  const url = route.request().url()
  if (route.request().method() === 'POST') return route.fulfill(json({ joined: true, member_count: 1 }))
  if (/\/communities\/\d+$/.test(url.split('?')[0])) return route.fulfill(json(COMMUNITY))
  if (!/\/\d+/.test(url.split('?')[0])) return route.fulfill(json({ items: [COMMUNITY], pagination: {} }))
  return route.fulfill(
    json({
      items: [
        {
          id: 9,
          communityId: 1,
          userId: 3,
          nickname: LONG_CN,
          content: LONG_URL,
          imageUrl: null,
          isPinned: false,
          likeCount: 99999,
          liked: true,
          commentCount: 88888,
          createdAt: '2026-10-11T12:31:00.000Z',
        },
      ],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1, hasMore: false },
    }),
  )
})

await context.route('**/api/v1/users/me**', (route) => {
  const url = route.request().url()
  if (url.includes('data-exports')) {
    return route.fulfill(
      json({
        items: [{ id: 7, status: 'READY', format: 'JSON', size: 12345678, expires_at: '2026-10-18T12:00:00.000Z', created_at: '2026-10-11T12:00:00.000Z' }],
        pagination: {},
      }),
    )
  }
  return route.fulfill(
    json({
      id: 3,
      phone: '139****0002',
      email: LONG_TOKEN + '@example.com',
      nickname: LONG_CN,
      avatarUrl: null,
      gender: 'girl',
      role: 'USER',
      isDisabled: false,
      createdAt: '2026-09-21T00:00:00.000Z',
    }),
  )
})

const PAGES = ['notifications.html', 'wallet.html', 'community-detail.html?id=1', 'profile.html', 'my-growth.html']

for (const target of PAGES) {
  const page = await context.newPage()
  page.on('pageerror', (error) => problems.push(target + ' pageerror: ' + error.message))
  await page.addInitScript(() => {
    localStorage.setItem('mb_access_token', 'stress-token')
    localStorage.setItem('feisi_backend', 'live')
    localStorage.setItem('feisi_nickname', 'x'.repeat(60))
    localStorage.setItem('feisi_role', 'USER')
  })
  await page.goto(BASE + '/' + target, { waitUntil: 'load' })
  await page.waitForTimeout(1600)

  const result = await page.evaluate(() => {
    const doc = document.documentElement
    const spill = []
    document.querySelectorAll('body *').forEach((el) => {
      const box = el.getBoundingClientRect()
      if (!box.width || !box.height) return
      if (box.right > window.innerWidth + 1) spill.push((el.className || el.tagName) + ' 右边缘 ' + Math.round(box.right))
    })
    return { overflow: doc.scrollWidth - doc.clientWidth, spill: spill.slice(0, 6), spillCount: spill.length, height: doc.scrollHeight }
  })

  console.log(
    ((result.overflow > 0 || result.spillCount ? '✗ ' : '✓ ') + target).padEnd(34) +
      ' 横向溢出 ' + String(result.overflow).padStart(4) + 'px · 越界元素 ' + String(result.spillCount).padStart(2) +
      ' · 页高 ' + result.height,
  )
  result.spill.forEach((line) => console.log('      ' + line))
  if (result.overflow > 0 || result.spillCount) {
    problems.push(target + ' 被长内容顶破（溢出 ' + result.overflow + 'px，越界 ' + result.spillCount + ' 个）')
  }
  await page.close()
}

console.log('\n' + (problems.length ? problems.join('\n') : '长内容下这几个页面都没有被顶破'))
await browser.close()
process.exit(problems.length ? 1 : 0)
