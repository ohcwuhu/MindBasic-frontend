/* 斐思同行 · 演示站的数据层（**只在接后端时生效**）

   演示站里的十二个内层页是手写静态页，数据都写在 HTML 里（设计演示稿那批示例）。
   这份脚本给它们一个统一的数据层：页面带 `?live=1`，或在本机登录页登录过
   （localStorage `feisi_backend=live`）时，`FeisiAPI.live` 为 true，页面自己的脚本
   就去真后端取数、按页面原来的类名重绘；否则**一个请求都不发**，页面里写好的示例原样保留
   （所以 `演示图/` 出图、`verify.mjs` / `collisions.mjs` 都不受影响）。

   约定与原前端一致：请求打同源 `/api/v1/...`（由 demo/vite.config.mjs 的代理转到
   127.0.0.1:8000），token 取 `localStorage.mb_access_token`，响应是统一信封
   `{ code, message, data, traceId }` —— 这里拆出 `data` 给页面用。 */
;(function () {
  'use strict'

  var MODE_KEY = 'feisi_backend'

  var live = (function () {
    try {
      if (new URLSearchParams(window.location.search).has('live')) return true
      return window.localStorage.getItem(MODE_KEY) === 'live'
    } catch (error) {
      return false
    }
  })()

  function token() {
    try {
      return window.localStorage.getItem('mb_access_token')
    } catch (error) {
      return null
    }
  }

  /* 登录页 / 注册页 / 找回密码页自己就在门口：这几页上收到 401 不再往登录页送，免得绕圈 */
  var DOOR_PAGES = ['login.html', 'register.html', 'forgot-password.html']

  /** 401：这份 token 已经不作数了 —— 清掉本地凭证，把人送回登录页并带上要回的那一页 */
  function sessionExpired() {
    var here = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase()
    try {
      ;['mb_access_token', 'feisi_backend', 'feisi_nickname', 'feisi_role'].forEach(function (key) {
        window.localStorage.removeItem(key)
      })
    } catch (error) {
      /* localStorage 不可用就忽略 */
    }
    if (DOOR_PAGES.indexOf(here) >= 0) return
    window.location.replace('login.html?next=' + encodeURIComponent(here + window.location.search))
  }

  function request(method, path, body) {
    var headers = { 'Content-Type': 'application/json' }
    var accessToken = token()
    if (accessToken) headers.Authorization = 'Bearer ' + accessToken
    return fetch('/api/v1' + path, {
      method: method,
      headers: headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {}
        })
        .then(function (payload) {
          if (!response.ok || (payload && payload.code && payload.code !== 'OK')) {
            var message = (payload && payload.message) || '请求失败（' + response.status + '）'
            /* 把状态码与后端的错误码一起带上：调用方要能分辨 401 / 403
               （例如管理工作台对非管理员要请回首页，而不是只显示一句文案） */
            var failure = new Error(message)
            failure.status = response.status
            failure.code = (payload && payload.code) || ''
            /* token 失效：不用等用户自己发现，直接送回登录页（页面上的提示只是给来不及跳的情况） */
            if (response.status === 401) {
              failure.message = '登录状态已过期，正在带你回登录页…'
              sessionExpired()
            }
            throw failure
          }
          return payload.data
        })
    })
  }

  /** HTML 转义：后端来的文字一律先过这里，再拼进页面 */
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(
      /[&<>"']/g,
      function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
      },
    )
  }

  /** 后端没有头像时，按 id 稳定地挑一件素材库的手绘象征物顶上（八个轮着用） */
  var SYMBOLS = [
    'sym-tea',
    'sym-chair',
    'sym-cat',
    'sym-lamp',
    'sym-plant',
    'sym-scarf',
    'sym-book',
    'sym-moon',
  ]
  function symbol(id) {
    var index = Math.abs(Number(id) || 0) % SYMBOLS.length
    return 'assets/' + SYMBOLS[index] + '.webp'
  }

  function dateTime(iso) {
    if (!iso) return ''
    var date = new Date(iso)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  function dateOnly(iso) {
    if (!iso) return ''
    var date = new Date(iso)
    if (isNaN(date.getTime())) return ''
    return (
      date.getFullYear() +
      ' · ' +
      String(date.getMonth() + 1).padStart(2, '0') +
      ' · ' +
      String(date.getDate()).padStart(2, '0')
    )
  }

  /** 出错时在容器里放一条与页面同风格的提示（不挡住原来的内容） */
  function fail(container, error) {
    if (!container) return
    container.innerHTML =
      '<li class="note" style="padding:16px 18px;font-size:var(--fs-small);color:#7d3a4a">' +
      esc(error && error.message ? error.message : error) +
      '</li>'
  }

  /** 空态的内芯：与 ui.css 的 `.empty` 同一套 */
  function emptyInner(title, hint) {
    return (
      '<img src="assets/mascot-sleepy.webp" width="420" height="640" alt="" aria-hidden="true" />' +
      '<p class="empty__title">' +
      esc(title) +
      '</p><p class="empty__body">' +
      esc(hint || '') +
      '</p>'
    )
  }

  function empty(title, hint) {
    return '<div class="empty">' + emptyInner(title, hint) + '</div>'
  }

  /** 空态（列表版）：`.empty` 是一块 div，塞进 `ul` 之前得先有个 `li` 的壳 */
  function emptyItem(title, hint) {
    return '<li class="empty">' + emptyInner(title, hint) + '</li>'
  }

  /** 一行小字：放在动作旁边说清楚发生了什么（`.anote` 那一套） */
  function note(text, danger) {
    return '<span class="anote' + (danger ? ' anote--warn' : '') + '">' + esc(text) + '</span>'
  }

  /** 分 → 「¥99」：后端所有金额都是分 */
  function money(cents) {
    var value = (Number(cents) || 0) / 100
    var negative = value < 0
    var text = (Math.abs(value) % 1 === 0 ? String(Math.abs(value)) : Math.abs(value).toFixed(2))
    return (negative ? '-' : '') + '¥' + text
  }

  window.FeisiAPI = {
    live: live,
    get: function (path) {
      return request('GET', path)
    },
    post: function (path, body) {
      return request('POST', path, body)
    },
    patch: function (path, body) {
      return request('PATCH', path, body)
    },
    del: function (path) {
      return request('DELETE', path)
    },
    esc: esc,
    symbol: symbol,
    dateTime: dateTime,
    dateOnly: dateOnly,
    fail: fail,
    note: note,
    money: money,
    empty: empty,
    emptyItem: emptyItem,
  }
})()
