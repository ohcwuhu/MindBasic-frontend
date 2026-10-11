/* vue-router 的替身：这个 demo 是十六个静态 .html，不是单页应用，
   所以只把这一页用得到的三件事接到真的页面上 —— RouterLink 渲染成 <a>、
   useRouter().push() 跳到对应的 .html（带 query）。原组件里的写法一个字没改：
   `to="/self-coaching/history"`、`router.push({ path: '/emotion-journal', query })`。 */

import { h } from 'vue'

const PAGES = {
  '/': 'index.html',
  '/home': 'index.html',
  '/self-coaching': 'self-coaching.html',
  '/self-coaching/history': 'self-coaching-history.html',
  '/emotion-journal': 'emotion-journal.html',
  '/coaches': 'coaches.html',
  '/terms': 'terms.html',
}

export function toHref(to) {
  if (typeof to === 'string') return PAGES[to] || to
  const href = PAGES[to.path] || to.path || 'index.html'
  const query = to.query || {}
  const search = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) search.set(key, String(value))
  })
  const qs = search.toString()
  return qs ? `${href}?${qs}` : href
}

export function useRouter() {
  return {
    push: (to) => {
      const href = toHref(to)
      /* 目标就是当前这一页时只换 URL、不重载 —— 原前端是单页应用，
         `router.replace('/emotion-journal')` 只是把 query 抹掉，不该把页面刷新掉 */
      if (isSamePage(href)) {
        window.history.replaceState(null, '', href)
        return
      }
      window.location.href = href
    },
    replace: (to) => {
      const href = toHref(to)
      if (isSamePage(href)) {
        window.history.replaceState(null, '', href)
        return
      }
      window.location.replace(href)
    },
    back: () => window.history.back(),
  }
}

function isSamePage(href) {
  const target = decodeURIComponent(href.split('?')[0]).split('/').pop()
  const current = decodeURIComponent(window.location.pathname).split('/').pop() || 'index.html'
  return target === current
}

export function useRoute() {
  return {
    path: window.location.pathname,
    query: Object.fromEntries(new URLSearchParams(window.location.search)),
  }
}

export const RouterLink = {
  name: 'RouterLink',
  props: {
    to: { type: [String, Object], required: true },
    replace: { type: Boolean, default: false },
  },
  setup(props, { slots, attrs }) {
    return () => h('a', { href: toHref(props.to), ...attrs }, slots.default ? slots.default() : [])
  },
}

export const RouterView = {
  name: 'RouterView',
  render: () => null,
}

/* 原 main.ts 里的 createRouter(...) 形态：这一页不用路由表，装上空壳即可 */
export function createRouter() {
  return { install() {} }
}

export const createWebHistory = () => ({})
export const createWebHashHistory = () => ({})
export const createMemoryHistory = () => ({})

export default {
  install(app) {
    app.component('RouterLink', RouterLink)
    app.component('RouterView', RouterView)
    app.config.globalProperties.$router = useRouter()
  },
}
