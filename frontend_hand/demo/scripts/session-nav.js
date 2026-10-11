/* 斐思同行 · 页头右上角的那组按钮跟着登录状态走

   · 没登录：保持页面里原本写的那两枚（首页是「注册 / 开始登录」）；
   · 已登录：换成「通知（带未读角标）· 钱包 · 个人中心」。个人中心是一枚按钮，指向
     `my-growth.html`；角色是 ADMIN 时这枚按钮写「管理工作台」并指向 `admin.html`。

   **退出登录不在页头**：它挪进了个人中心页（那里有一颗 `[data-logout]`）。这份脚本会把页面上
   任何一颗 `[data-logout]` 接上同一个动作、并从 `hidden` 里放出来 —— 动作只有一处实现。
   退出会真的打 `POST /auth/logout`（后端清掉 httpOnly 的 refresh Cookie），再清掉本地的
   `mb_access_token` / `feisi_backend` / 昵称 / 角色，最后回首页 —— 首页不需要登录，不会绕回登录页。

   只在**真接后端**时改：`file://` 打开（双击 .html 看设计演示稿）与后端不在时一律不动 ——
   `演示图/` 出图、`verify.mjs` / `collisions.mjs` 记录的还是页面里写好的静态样子。 */
;(function () {
  'use strict'

  var NICK_KEY = 'feisi_nickname'
  var ROLE_KEY = 'feisi_role'

  function token() {
    try {
      return window.localStorage.getItem('mb_access_token')
    } catch (error) {
      return null
    }
  }

  function cachedNickname() {
    try {
      return window.localStorage.getItem(NICK_KEY) || ''
    } catch (error) {
      return ''
    }
  }

  function cachedRole() {
    try {
      return window.localStorage.getItem(ROLE_KEY) || ''
    } catch (error) {
      return ''
    }
  }

  /* 第一帧就要对：有 token 时先把页头那组藏起来（这段是"解析到就执行"，
     比页头本身还早），免得先闪一下「注册 / 开始登录」那颗黄按钮。 */
  if (/^https?:$/.test(window.location.protocol) && token()) {
    var guardStyle = document.createElement('style')
    guardStyle.setAttribute('data-session-nav', 'pending')
    guardStyle.textContent = '.masthead__actions{visibility:hidden}'
    ;(document.head || document.documentElement).appendChild(guardStyle)
  }

  /* 这份脚本被放在 <head> 之后、页面内容之前（和登录守卫一起），所以等 DOM 出来再找页头 */
  function run() {
    if (!/^https?:$/.test(window.location.protocol)) return

    var accessToken = token()
    if (!accessToken) return

    /* 页面上任何一颗 [data-logout]（现在长在个人中心页里）都接上退出动作 */
    function bindLogout() {
      var buttons = document.querySelectorAll('[data-logout]')
      Array.prototype.forEach.call(buttons, function (button) {
        button.hidden = false
        button.addEventListener('click', function () {
          button.disabled = true
          button.textContent = '正在退出…'
          fetch('/api/v1/auth/logout', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + accessToken },
            credentials: 'include',
          })
            .catch(function () {
              /* 后端没响应也照常退：本地凭证清掉就算退出 */
            })
            .then(function () {
              try {
                window.localStorage.removeItem('mb_access_token')
                window.localStorage.removeItem('feisi_backend')
                window.localStorage.removeItem(NICK_KEY)
                window.localStorage.removeItem(ROLE_KEY)
              } catch (error) {
                /* 忽略 */
              }
              window.location.replace('index.html')
            })
        })
      })
    }

    var actions = document.querySelector('.masthead__actions')
    if (!actions) {
      bindLogout()
      return
    }

    function show(name, role) {
      /* 管理员看到的不是普通用户那套「个人中心」，而是他的管理工作台 */
      var isAdmin = role === 'ADMIN'
      actions.innerHTML =
        '<a class="link-quiet" href="notifications.html">通知<span class="chip chip--yellow" data-unread hidden></span></a>' +
        '<a class="link-quiet" href="wallet.html">钱包</a>' +
        /* 页头不放昵称了（个人中心页里显示「现在是谁登录着」）：管理员这枚写「管理工作台」 */
        '<a class="btn btn--paper btn--small" href="' + (isAdmin ? 'admin.html' : 'my-growth.html') + '">' +
        (isAdmin ? '管理工作台' : '个人中心') +
        '</a>'

      paintNote(name, role, '')
    }

    /* 个人中心那一页上「现在是谁登录着」：昵称 + 角色（昵称本身就叫「管理员」时不重复）
       + 手机号掩码（后端只回掩码，拿到就带上） */
    function paintNote(name, role, phone) {
      var note = document.querySelector('[data-account-note]')
      if (!note) return
      var who = name || '已登录'
      if (role === 'ADMIN' && who.indexOf('管理员') < 0) who += ' · 管理员'
      note.textContent = phone ? who + ' · ' + phone : who
    }

    /* 未读数：没读过的消息有几条，就写在「通知」后面那枚小标签上 */
    function badge() {
      fetch('/api/v1/notifications/unread-count', {
        headers: { Authorization: 'Bearer ' + accessToken },
        credentials: 'include',
      })
        .then(function (response) {
          return response.ok ? response.json() : null
        })
        .then(function (payload) {
          var spot = actions.querySelector('[data-unread]')
          if (!spot || !payload) return
          var count = Number((payload.data || {}).count) || 0
          spot.textContent = count > 99 ? '99+' : String(count)
          spot.hidden = count <= 0
        })
        .catch(function () {
          /* 取不到就不显示角标，别为一条角标打扰人 */
        })
    }

    /* 别的页面（通知中心）把消息标成已读之后，顺手把页头那枚角标也叫新一下 */
    window.FeisiNav = { refreshUnread: badge }

    function reveal() {
      var pending = document.querySelector('style[data-session-nav="pending"]')
      if (pending) pending.remove()
    }

    /* 先用缓存里的昵称与角色立刻画出来（登录时存过），这样不会先出现一版错的 */
    show(cachedNickname(), cachedRole())
    reveal()
    badge()
    bindLogout()

    /* 再问一次后端：昵称变了就刷新，顺手把新昵称缓存起来 */
    fetch('/api/v1/users/me', {
      headers: { Authorization: 'Bearer ' + accessToken },
      credentials: 'include',
    })
      .then(function (response) {
        if (response.status === 401) return null /* 失效就别动，守卫会把人送回登录页 */
        if (!response.ok) return null
        return response.json()
      })
      .then(function (payload) {
        if (!payload) return
        var me = payload.data || {}
        var name = me.nickname || ''
        var role = me.role || ''
        try {
          window.localStorage.setItem(NICK_KEY, name)
          window.localStorage.setItem(ROLE_KEY, role)
        } catch (error) {
          /* 忽略 */
        }
        if (name !== cachedNickname() || role !== cachedRole()) show(name, role)
        paintNote(name, role, me.phone || '')
      })
      .catch(function () {
        /* 后端暂时不可达：保持页面原样 */
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
