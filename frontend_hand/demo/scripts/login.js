/* 斐思同行 · 登录页的接线

   这一页只有一件事要动：上面那两个标签。选「密码登录」就只出现手机号 + 密码，
   选「邮箱验证码」就只出现邮箱 + 验证码 —— 换标签是页内的事，不跳页、不刷新。

   标签按 ARIA 的 tabs 写法接：`aria-selected` 跟着走，左右方向键也能切（键盘习惯），
   隐藏的那一块用 `hidden`，样式见 styles/pages.css 的 `.auth .form[hidden]`。

   二、接后端。用带代理的开发服务器打开时（`demo/vite.config.mjs` 把 `/api` 转到后端
   127.0.0.1:8000），「密码登录」会真的去打 `POST /api/v1/auth/login`：成功就把
   accessToken 存进 `mb_access_token`（原前端约定的键），并记下 `feisi_backend=live`，
   之后自我教练 / 情绪日记两页就走真数据。没有后端时（file:// 或 python http.server）
   保持原来的演示行为：表单照旧跳首页。 */
;(function () {
  'use strict'

  var tabs = [].slice.call(document.querySelectorAll('[data-auth-tabs] [role="tab"]'))
  if (!tabs.length) return

  var panels = tabs.map(function (tab) {
    return document.getElementById(tab.getAttribute('aria-controls'))
  })

  function select(index, focus) {
    tabs.forEach(function (tab, i) {
      var on = i === index
      tab.classList.toggle('is-current', on)
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
      if (panels[i]) panels[i].hidden = !on
    })
    if (focus) tabs[index].focus()
    /* 换了方式就把光标放到这一块的第一格，省一次点击 */
    var first = panels[index] && panels[index].querySelector('input')
    if (focus && first) first.focus()
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () {
      select(i, false)
    })
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      var next = (i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
      select(next, true)
    })
  })

  var send = document.querySelector('[data-send-code]')
  var sendNote = document.querySelector('[data-send-note]')
  var emailErrorLine = document.querySelector('[data-email-error]')
  var emailBox = document.querySelector('#email')

  /* ---- 两种登录都要用到的那点东西 ---- */
  var live = /^https?:$/.test(window.location.protocol)

  function storeAuth(data) {
    try {
      window.localStorage.setItem('mb_access_token', data.accessToken)
      /* 这台浏览器以后就走真后端（想回演示数据：清掉这个键即可） */
      window.localStorage.setItem('feisi_backend', 'live')
      /* 昵称也存一份：下一页的页头就能立刻画出「<昵称> · 个人中心」，不会闪 */
      window.localStorage.setItem('feisi_nickname', (data.user && data.user.nickname) || '')
      /* 角色也要：管理员进的是管理工作台，不是普通用户的个人中心 */
      window.localStorage.setItem('feisi_role', (data.user && data.user.role) || '')
    } catch (error) {
      /* localStorage 不可用时忽略 */
    }
  }

  function afterLogin(data) {
    storeAuth(data)
    /* 登录守卫会带 `?next=`：登录完回到你原本要去的页面（只认本站的 .html） */
    var next = ''
    try {
      next = new URLSearchParams(window.location.search).get('next') || ''
    } catch (error) {
      next = ''
    }
    if (!/^[\w-]+\.html(\?[^\s]*)?$/.test(next)) next = ''
    var isAdmin = !!(data.user && data.user.role === 'ADMIN')
    window.location.href = next || (isAdmin ? 'admin.html' : 'index.html')
  }

  /* 后端那套统一信封：拆出 data，出错就抛一条带 message 的错误 */
  function post(path, body) {
    return fetch('/api/v1' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
      .catch(function () {
        /* 请求本身没出去：多半是后端没起 */
        throw new Error('连不上后端（127.0.0.1:8000 起了吗？）。要看演示数据就直接双击 .html 打开。')
      })
      .then(function (response) {
      return response
        .json()
        .catch(function () {
          return {}
        })
        .then(function (payload) {
          if (!response.ok || !payload || !payload.data) {
            throw new Error((payload && payload.message) || '请求失败（' + response.status + '）')
          }
          return payload.data
        })
      })
  }

  function fail(node, message) {
    if (!node) return
    node.textContent = message
    node.hidden = !message
  }

  /* 「获取验证码」：真的发一封（LOGIN 用途），发出去才开始 60 秒倒数 */
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
  var timer = null
  function countdown() {
    var left = 60
    clearInterval(timer)
    send.disabled = true
    send.textContent = left + ' 秒后可重发'
    timer = setInterval(function () {
      left -= 1
      if (left <= 0) {
        clearInterval(timer)
        send.disabled = false
        send.textContent = '重新发送'
        return
      }
      send.textContent = left + ' 秒后可重发'
    }, 1000)
  }

  if (send) {
    send.addEventListener('click', function () {
      if (send.disabled) return
      var email = emailBox.value.trim()
      fail(emailErrorLine, '')
      if (!EMAIL.test(email)) {
        fail(emailErrorLine, '先写一个能收信的邮箱。')
        emailBox.focus()
        return
      }
      if (!live) {
        /* 演示稿：只走一遍倒数，不发请求 */
        if (sendNote) sendNote.textContent = '演示模式：验证码不会真的发出去。'
        countdown()
        return
      }
      send.disabled = true
      post('/auth/email-code', { email: email, purpose: 'LOGIN' })
        .then(function () {
          if (sendNote) sendNote.textContent = '验证码已发出，10 分钟内有效。'
          countdown()
        })
        .catch(function (error) {
          fail(emailErrorLine, error.message)
          send.disabled = false
        })
    })
  }

  /* ---- 密码登录 ---- */
  var form = document.getElementById('panel-password')
  var errorLine = document.querySelector('[data-auth-error]')

  if (form && live) {
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var phone = (form.querySelector('#phone') || {}).value || ''
      var password = (form.querySelector('#password') || {}).value || ''
      var button = form.querySelector('button[type="submit"]')
      fail(errorLine, '')
      if (button) button.disabled = true

      post('/auth/login', { phone: phone.trim(), password: password })
        .then(function (data) {
          if (!data || !data.accessToken) throw new Error('登录失败，请检查手机号与密码')
          afterLogin(data)
        })
        .catch(function (error) {
          fail(errorLine, error.message)
          if (button) button.disabled = false
        })
    })
  }

  /* ---- 邮箱验证码登录 ---- */
  var emailForm = document.getElementById('panel-email')
  if (emailForm && live) {
    emailForm.addEventListener('submit', function (event) {
      event.preventDefault()
      var email = emailBox.value.trim()
      var code = (emailForm.querySelector('#code') || {}).value || ''
      var button = emailForm.querySelector('button[type="submit"]')
      fail(emailErrorLine, '')
      if (!EMAIL.test(email)) return fail(emailErrorLine, '先写一个能收信的邮箱。')
      if (!/^\d{6}$/.test(code.trim())) return fail(emailErrorLine, '验证码是 6 位数字。')
      if (button) button.disabled = true

      post('/auth/email-login', { email: email, code: code.trim() })
        .then(function (data) {
          if (!data || !data.accessToken) throw new Error('验证码不对，或者已经过期了')
          afterLogin(data)
        })
        .catch(function (error) {
          fail(emailErrorLine, error.message)
          if (button) button.disabled = false
        })
    })
  }

  /* 从「重设密码」或「修改密码」绕回来时，说一句为什么又站在这儿 */
  try {
    var flags = new URLSearchParams(window.location.search)
    var note = document.querySelector('[data-auth-note]')
    if (note && (flags.get('changed') || flags.get('reset'))) {
      note.textContent = flags.get('reset') ? '密码已重置，用新密码登录一次就好。' : '密码已修改，用新密码登录一次就好。'
      note.hidden = false
    }
  } catch (error) {
    /* 地址栏读不出来就不提示 */
  }
})()
