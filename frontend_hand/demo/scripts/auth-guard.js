/* 斐思同行 · 登录守卫：**接后端时只有登录才能使用**

   放在每个用户页面的最前面，规则三条：

   1. **双击打开（`file://`）或纯静态服务打开时不拦** —— 那是"看设计演示稿"的用法，
      页面里写好的示例照旧能看（`演示图/` 出图、`verify.mjs` / `collisions.mjs` 都走这条路）。
   2. 页面是 http(s) 打开的，但**后端不在**（`/api/v1/platform/config` 取不到）→ 也不拦，
      同样当静态演示看。
   3. 页面是 http(s) 打开的、**后端在**，而且**没有 token**（或 token 已失效 401）→
      跳到登录页并带上 `?next=`，登录完回到原来那一页。

   首页与登录 / 注册 / 找回密码 / 服务协议这几页不禁：
     · `index.html` —— 首页是门面，未登录也能看（四个入口点进去才要求登录）；
     · `login.html` / `register.html` —— 是进门的门，禁了会自己跳自己；
     · `forgot-password.html` —— 忘了密码的人本来就登不上，禁了就成了死结；
     · `terms.html` —— 登录与注册的表单里都要点它。 */
;(function () {
  'use strict'

  var OPEN_PAGES = ['index.html', 'login.html', 'register.html', 'forgot-password.html', 'terms.html']
  var here = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase()
  if (OPEN_PAGES.indexOf(here) >= 0) return

  /* 设计演示稿：file:// 打开不拦 */
  if (!/^https?:$/.test(window.location.protocol)) return

  function token() {
    try {
      return window.localStorage.getItem('mb_access_token')
    } catch (error) {
      return null
    }
  }

  function goLogin() {
    var next = here + window.location.search
    window.location.replace('login.html?next=' + encodeURIComponent(next))
  }

  /** 后端在不在：在 → 说明这是"接后端"的用法，那就要求登录；不在 → 当静态演示看 */
  function backendAlive() {
    return fetch('/api/v1/platform/config', { method: 'GET' })
      .then(function (response) {
        return response.ok
      })
      .catch(function () {
        return false
      })
  }

  var accessToken = token()
  if (!accessToken) {
    backendAlive().then(function (alive) {
      if (alive) goLogin()
    })
    return
  }

  /* 与页面共享同一次刷新请求，避免守卫抢先清掉仍可续期的登录。 */
  if (window.FeisiAPI) {
    window.FeisiAPI.get('/users/me').catch(function () {
      /* 401 的恢复与跳转由数据层处理；网络失败不阻止查看页面。 */
    })
  }
})()
