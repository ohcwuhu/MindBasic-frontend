/* 找回密码：`POST /auth/email-code`（purpose=RESET）拿验证码，
   `POST /auth/reset-password` 带邮箱 + 验证码 + 新密码重设。

   这一页**不用登录**（忘了密码的人本来就登不上），auth-guard.js 把它和登录 / 注册一起放行。
   和登录页同一个口径：只有 http(s) 打开时才真的发请求，双击 .html 看演示稿时保持静态。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return

  var form = document.querySelector('[data-reset-form]')
  var errorLine = document.querySelector('[data-reset-error]')
  var sendButton = document.querySelector('[data-send-code]')
  var sendNote = document.querySelector('[data-send-note]')
  var aside = document.querySelector('[data-reset-aside]')
  var emailInput = document.querySelector('#email')
  var codeInput = document.querySelector('#code')
  var passInput = document.querySelector('#newpass')
  var againInput = document.querySelector('#again')
  var live = /^https?:$/.test(window.location.protocol)

  function showError(message) {
    errorLine.textContent = message || ''
    errorLine.hidden = !message
  }

  function showNote(message) {
    sendNote.textContent = message || ''
    sendNote.hidden = !message
  }

  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

  /* ---- 获取验证码：真的发一封（后端在没配邮件服务时会把验证码打进日志） ---- */
  var timer = null
  function countdown() {
    var left = 60
    clearInterval(timer)
    sendButton.disabled = true
    sendButton.textContent = left + ' 秒后可重发'
    timer = setInterval(function () {
      left -= 1
      if (left <= 0) {
        clearInterval(timer)
        sendButton.disabled = false
        sendButton.textContent = '重新发送'
        return
      }
      sendButton.textContent = left + ' 秒后可重发'
    }, 1000)
  }

  sendButton.addEventListener('click', function () {
    if (sendButton.disabled) return
    var email = emailInput.value.trim()
    showError('')
    showNote('')
    if (!EMAIL.test(email)) {
      showError('先写一个能收信的邮箱。')
      emailInput.focus()
      return
    }
    if (!live) {
      /* 演示稿：只走一遍倒数，不发请求 */
      showNote('演示模式：验证码不会真的发出去。')
      countdown()
      return
    }
    sendButton.disabled = true
    api
      .post('/auth/email-code', { email: email, purpose: 'RESET' })
      .then(function () {
        showNote('验证码已发出，10 分钟内有效。')
        countdown()
      })
      .catch(function (error) {
        showError(error.message)
        sendButton.disabled = false
      })
  })

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    var email = emailInput.value.trim()
    var code = codeInput.value.trim()
    var password = passInput.value
    showError('')

    if (!EMAIL.test(email)) return showError('先写一个能收信的邮箱。')
    if (!/^\d{6}$/.test(code)) return showError('验证码是 6 位数字。')
    if (password.length < 8) return showError('新密码至少 8 位。')
    if (password !== againInput.value) return showError('两次输入的密码不一样。')
    if (!live) return showError('演示模式：起开发服务器（127.0.0.1:5178）才真的重设。')

    var button = form.querySelector('button[type="submit"]')
    button.disabled = true
    api
      .post('/auth/reset-password', { email: email, code: code, newPassword: password })
      .then(function () {
        aside.textContent = '密码已重设，正在带你回登录页…'
        window.location.href = 'login.html?reset=1'
      })
      .catch(function (error) {
        showError(error.message)
        button.disabled = false
      })
  })
})()
