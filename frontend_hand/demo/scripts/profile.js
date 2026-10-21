/* 个人资料：一个页面管住五件事 —— 基本资料、邮箱绑定、修改密码、数据导出、停用 / 删除。

   接口（都在 `/api/v1` 下）：
     · `GET|PATCH /users/me` —— 昵称 / 性别；手机号只读（后端只回掩码）
     · `POST /auth/email-code`（purpose=BIND）+ `POST /users/me/email` —— 绑邮箱
     · `POST /users/me/password` —— 改密码（**后端顺手作废当前 accessToken**，所以改完要重登）
     · `POST /users/me/data-export` + `GET /users/me/data-exports` + `.../{id}/download`
     · `POST /users/me/deactivate` / `POST /users/me/delete` —— 停用 / 永久删除

   三处照实处理：改完密码那份 token 已经失效，所以本地凭证一起清掉再回登录页；导出的下载
   要带 Bearer（`<a href>` 送不出去），所以取回 Blob 再点一下临时 `<a>`；导出的列表接口
   回的是 snake_case（`expires_at` / `created_at`，裸 dict 没过模型），两种写法都认。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
  var CREDENTIAL_KEYS = ['mb_access_token', 'feisi_backend', 'feisi_nickname', 'feisi_role']

  var basicForm = document.querySelector('[data-basic-form]')
  var basicNote = document.querySelector('#basic-title').closest('.panel__head').querySelector('.panel__note')
  var accountName = document.querySelector('.account__name')
  var accountMeta = document.querySelector('.account__meta')
  var accountAvatar = document.querySelector('.account__avatar')
  var phoneValue = document.querySelector('#acct-title').closest('.panel').querySelector('.kv__val')
  var mailNote = document.querySelector('[data-mail-note]')

  var mailForm = document.querySelector('[data-mail-form]')
  var mailInput = document.querySelector('#mail')
  var mailCode = document.querySelector('#mailcode')
  var mailSend = document.querySelector('[data-send-code]')
  var mailSendNote = document.querySelector('[data-send-note]')
  var mailError = document.querySelector('[data-mail-error]')

  var passwordForm = document.querySelector('[data-password-form]')
  var oldPass = document.querySelector('#oldpass')
  var newPass = document.querySelector('#newpass')
  var againPass = document.querySelector('#again')
  var passwordError = document.querySelector('[data-password-error]')

  var privacyMsg = document.querySelector('[data-privacy-msg]')
  var exportList = document.querySelector('[data-exports]')
  var exportButton = document.querySelector('[data-export]')
  var deactivateButton = document.querySelector('[data-deactivate]')
  var deleteButton = document.querySelector('[data-delete]')

  /** 本地凭证一起清掉，再按 `where` 走 */
  function leave(where) {
    try {
      CREDENTIAL_KEYS.forEach(function (key) {
        window.localStorage.removeItem(key)
      })
    } catch (error) {
      /* localStorage 不可用就忽略 */
    }
    window.location.replace(where)
  }

  function say(node, message, danger) {
    node.innerHTML = message ? api.note(message, danger) : ''
    node.hidden = !message
  }

  /* ==================================================================== 基本资料 */

  function fill(me) {
    var nickname = basicForm.querySelector('#nick')
    var gender = basicForm.querySelector('#gender')
    if (nickname) nickname.value = me.nickname || ''
    if (gender) gender.value = me.gender || 'other'
    if (accountName) accountName.textContent = me.nickname || '我'
    if (accountAvatar) accountAvatar.textContent = (me.nickname || '我').slice(0, 1)
    if (phoneValue) phoneValue.textContent = me.phone || '—'
    if (accountMeta) accountMeta.textContent = (me.phone || '') + ' · 开始于 ' + api.dateOnly(me.createdAt)
    if (mailNote) {
      mailNote.textContent = me.email ? '已绑定 ' + me.email : '还没绑定 —— 绑了才能用验证码登录、自己找回密码'
    }
    if (mailInput && me.email) mailInput.value = me.email
    return me
  }

  api
    .get('/users/me')
    .then(fill)
    .catch(function (error) {
      say(privacyMsg, error.message, true)
    })

  basicForm.addEventListener('submit', function (event) {
    event.preventDefault()
    var nickname = basicForm.querySelector('#nick')
    var gender = basicForm.querySelector('#gender')
    var button = basicForm.querySelector('button[type="submit"]')
    var payload = {}
    if (nickname && nickname.value.trim()) payload.nickname = nickname.value.trim()
    if (gender) payload.gender = gender.value
    button.disabled = true
    api
      .patch('/users/me', payload)
      .then(function (me) {
        fill(me)
        basicNote.textContent = '已保存 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false })
      })
      .catch(function (error) {
        basicNote.textContent = error.message
      })
      .then(function () {
        button.disabled = false
      })
  })

  /* ==================================================================== 绑定邮箱 */

  var mailTimer = null
  function mailCountdown() {
    var left = 60
    clearInterval(mailTimer)
    mailSend.disabled = true
    mailSend.textContent = left + ' 秒后可重发'
    mailTimer = setInterval(function () {
      left -= 1
      if (left <= 0) {
        clearInterval(mailTimer)
        mailSend.disabled = false
        mailSend.textContent = '重新发送'
        return
      }
      mailSend.textContent = left + ' 秒后可重发'
    }, 1000)
  }

  mailSend.addEventListener('click', function () {
    var email = mailInput.value.trim()
    say(mailError, '')
    say(mailSendNote, '')
    if (!EMAIL.test(email)) {
      say(mailError, '先写一个能收信的邮箱。', true)
      mailInput.focus()
      return
    }
    mailSend.disabled = true
    api
      .post('/auth/email-code', { email: email, purpose: 'BIND' })
      .then(function () {
        say(mailSendNote, '验证码已发出，10 分钟内有效。')
        mailCountdown()
      })
      .catch(function (error) {
        say(mailError, error.message, true)
        mailSend.disabled = false
      })
  })

  mailForm.addEventListener('submit', function (event) {
    event.preventDefault()
    var email = mailInput.value.trim()
    var code = mailCode.value.trim()
    var button = mailForm.querySelector('button[type="submit"]')
    say(mailError, '')
    if (!EMAIL.test(email)) return say(mailError, '先写一个能收信的邮箱。', true)
    if (!/^\d{6}$/.test(code)) return say(mailError, '验证码是 6 位数字。', true)
    button.disabled = true
    api
      .post('/users/me/email', { email: email, code: code, purpose: 'BIND' })
      .then(function (me) {
        fill(me)
        mailCode.value = ''
        say(mailSendNote, '邮箱已绑定：' + email)
      })
      .catch(function (error) {
        say(mailError, error.message, true)
      })
      .then(function () {
        button.disabled = false
      })
  })

  /* ==================================================================== 修改密码 */

  passwordForm.addEventListener('submit', function (event) {
    event.preventDefault()
    var button = passwordForm.querySelector('button[type="submit"]')
    say(passwordError, '')
    if (!oldPass.value) return say(passwordError, '先填原密码。', true)
    if (newPass.value.length < 8) return say(passwordError, '新密码至少 8 位。', true)
    if (newPass.value !== againPass.value) return say(passwordError, '两次输入的新密码不一样。', true)
    button.disabled = true
    api
      .post('/users/me/password', { oldPassword: oldPass.value, newPassword: newPass.value })
      .then(function () {
        passwordForm.innerHTML = '<p class="anote">密码已修改。这台设备的登录状态已经作废，正在回登录页…</p>'
        window.setTimeout(function () {
          leave('login.html?changed=1')
        }, 1200)
      })
      .catch(function (error) {
        say(passwordError, error.message, true)
        button.disabled = false
      })
  })

  /* ============================================================== 导出 · 停用 · 删除 */

  var STATUS = { READY: ['可下载', 'chip--green'], EXPIRED: ['已过期', ''], FAILED: ['生成失败', ''] }

  function sizeText(size) {
    var bytes = Number(size) || 0
    if (!bytes) return '—'
    return bytes < 1024 ? bytes + ' B' : Math.round(bytes / 1024) + ' KB'
  }

  function exportRow(record) {
    var pair = STATUS[record.status] || [record.status || '—', '']
    var alive = record.status === 'READY'
    return (
      '<li class="row" data-export-id="' +
      record.id +
      '">' +
      '<img class="row__art" src="' +
      api.symbol(record.id) +
      '" width="419" height="560" alt="" aria-hidden="true" />' +
      '<span><span class="row__title">' +
      api.esc(record.format || 'JSON') +
      ' · ' +
      api.esc(sizeText(record.size)) +
      '</span><span class="row__meta">' +
      api.esc(api.dateTime(record.created_at || record.createdAt)) +
      ' · 到 ' +
      api.esc(api.dateTime(record.expires_at || record.expiresAt)) +
      ' 之前可下载</span></span>' +
      '<span class="row__side">' +
      (alive
        ? '<button class="act" type="button" data-download>下载</button>'
        : '<span class="chip ' + pair[1] + '">' + api.esc(pair[0]) + '</span>') +
      '</span></li>'
    )
  }

  function loadExports() {
    exportList.innerHTML = '<li class="panel__note" role="status">正在读取导出记录…</li>'
    return api
      .get('/users/me/data-exports?page=1&pageSize=10')
      .then(function (data) {
        var items = (data && data.items) || []
        exportList.innerHTML = items.length
          ? items.map(exportRow).join('')
          : api.emptyItem('还没有导出过', '点上面那颗按钮，会当场打包一个 JSON 给你。')
      })
      .catch(function (error) {
        exportList.innerHTML =
          '<li class="panel__note" role="alert">导出记录没有读取成功：' +
          api.esc(error && error.message ? error.message : '请稍后重试') +
          ' <button class="link-quiet" type="button" data-export-retry>重试</button></li>'
      })
  }

  /* 下载要带 Bearer，`<a href>` 送不出去 —— 取回 Blob 再点一下临时 `<a>` */
  exportList.addEventListener('click', function (event) {
    if (event.target.closest('[data-export-retry]')) {
      loadExports()
      return
    }
    var button = event.target.closest('[data-download]')
    if (!button) return
    var row = button.closest('[data-export-id]')
    var id = row ? row.getAttribute('data-export-id') : ''
    button.disabled = true
    button.textContent = '打包中…'
    api.download('/users/me/data-exports/' + id + '/download', 'mindbasic-data-export-' + id + '.json')
      .catch(function (error) {
        say(privacyMsg, error.message, true)
      })
      .then(function () {
        button.disabled = false
        button.textContent = '下载'
      })
  })

  exportButton.addEventListener('click', function () {
    exportButton.disabled = true
    exportButton.textContent = '正在打包…'
    say(privacyMsg, '')
    api
      .post('/users/me/data-export', {})
      .then(function (record) {
        say(privacyMsg, '导出好了（编号 ' + record.id + '），7 天内可以下载。')
        return loadExports()
      })
      .catch(function (error) {
        say(privacyMsg, error.message, true)
      })
      .then(function () {
        exportButton.disabled = false
        exportButton.textContent = '导出我的数据'
      })
  })

  /* 停用 / 删除都就地确认：按钮那一格换成「说明 + 确定 / 取消」，删除还多一个密码框 */
  function confirmCell(button, options) {
    var holder = button.parentNode
    var box = document.createElement('div')
    box.className = 'stack'
    box.innerHTML =
      '<p class="anote' +
      (options.danger ? ' anote--warn' : '') +
      '">' +
      api.esc(options.ask) +
      '</p>' +
      (options.password
        ? '<input class="input" type="password" placeholder="输入登录密码确认" aria-label="登录密码" data-confirm-password />'
        : '') +
      '<div class="field__row">' +
      '<button class="btn btn--small' +
      (options.danger ? '' : ' btn--paper') +
      '" type="button" data-yes>' +
      api.esc(options.confirm || '确定') +
      '</button>' +
      '<button class="btn btn--paper btn--small" type="button" data-no>取消</button>' +
      '</div>'
    holder.replaceChild(box, button)

    box.querySelector('[data-no]').addEventListener('click', function () {
      holder.replaceChild(button, box)
    })

    var passwordInput = box.querySelector('[data-confirm-password]')
    if (passwordInput) passwordInput.focus()

    box.querySelector('[data-yes]').addEventListener('click', function (event) {
      var password = passwordInput ? passwordInput.value : undefined
      if (options.password && !password) {
        say(privacyMsg, '要删除账号，得先输入登录密码。', true)
        passwordInput.focus()
        return
      }
      event.target.disabled = true
      event.target.textContent = '处理中…'
      api
        .post(options.path, password ? { password: password } : {})
        .then(function () {
          say(privacyMsg, options.done)
          window.setTimeout(function () {
            leave(options.where || 'index.html')
          }, 1200)
        })
        .catch(function (error) {
          say(privacyMsg, error.message, true)
          event.target.disabled = false
          event.target.textContent = options.confirm || '确定'
        })
    })
  }

  deactivateButton.addEventListener('click', function () {
    say(privacyMsg, '')
    confirmCell(deactivateButton, {
      ask: '停用之后会立刻退出，所有记录都留着；用同一个账号登录就能恢复。',
      confirm: '停用账号',
      path: '/users/me/deactivate',
      done: '账号已停用，正在回首页…',
    })
  })

  deleteButton.addEventListener('click', function () {
    say(privacyMsg, '')
    confirmCell(deleteButton, {
      ask: '删除之后无法恢复：日记、对话、测评结果都会被清掉。',
      confirm: '永久删除',
      password: true,
      danger: true,
      path: '/users/me/delete',
      done: '账号已删除，正在回首页…',
    })
  })

  loadExports()

  /* 「我的订单 / 我的预约」那两行归 `scripts/account-rows.js` 管（接后端时它也是这一份），
     所以这里不再重复请求一次。 */
})()
