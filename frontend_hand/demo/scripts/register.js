/* 注册页：真的打 `POST /api/v1/auth/register`，成功后和登录页一样存凭证、进「接后端」模式。

   闸门是「页面是不是 http(s) 打开的」，**不是** `api.live` —— 这一点踩过坑：`api.live` 只有
   「这台浏览器登录过」或带 `?live=1` 时才为真，而注册页恰恰是**还没登录**的人在用，于是脚本
   整段不执行、表单退化成原生 GET 提交：注册没发生（所以之后怎么都登不上），
   密码还会跟着 query string 进地址栏和历史。登录页 / 找回密码页是同一套口径。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return

  var form = document.querySelector('.auth form')
  if (!form) return

  var phone = form.querySelector('#r-phone')
  var nick = form.querySelector('#r-nick')
  var password = form.querySelector('#r-pass')
  var confirm = form.querySelector('#r-pass2')
  var agreed = form.querySelector('input[type="checkbox"]')
  var button = form.querySelector('button[type="submit"]')
  var live = /^https?:$/.test(window.location.protocol)

  var errorLine = document.createElement('p')
  errorLine.className = 'field__error'
  errorLine.setAttribute('aria-live', 'polite')
  errorLine.hidden = true
  if (button && button.parentElement) button.parentElement.insertBefore(errorLine, button)

  function showError(message) {
    errorLine.textContent = message
    errorLine.hidden = !message
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    showError('')
    var value = {
      phone: (phone && phone.value.trim()) || '',
      nickname: (nick && nick.value.trim()) || '',
      password: (password && password.value) || '',
      confirm: (confirm && confirm.value) || '',
      agreed: !!(agreed && agreed.checked),
    }
    if (!/^1\d{10}$/.test(value.phone)) return showError('手机号格式不对，请填 11 位手机号。')
    if (!value.nickname) return showError('给自己起个昵称吧。')
    if (value.password.length < 8) return showError('密码至少 8 位，且包含字母与数字。')
    if (value.password !== value.confirm) return showError('两次输入的密码不一致。')
    if (!value.agreed) return showError('请先阅读并同意《服务协议与免责声明》。')

    /* 双击 .html（file://）看设计演示稿时没有后端可打：说清楚，别让人以为注册成功了 */
    if (!live) {
      return showError('这是设计演示稿（file://）：注册不会真的生效。起开发服务器后（127.0.0.1:5178）就能注册。')
    }

    if (button) button.disabled = true
    api
      .post('/auth/register', {
        phone: value.phone,
        password: value.password,
        nickname: value.nickname,
        gender: 'girl',
        privacyAgreed: true,
        serviceAgreed: true,
      })
      .then(function (data) {
        if (!data || !data.accessToken) throw new Error('注册没有返回登录凭证，请稍后再试。')
        try {
          window.localStorage.setItem('mb_access_token', data.accessToken)
          /* 这台浏览器以后就走真后端（和登录页同一套键） */
          window.localStorage.setItem('feisi_backend', 'live')
          /* 昵称与角色也存一份：下一页的页头立刻就是对的样子，不会先闪一下 */
          window.localStorage.setItem('feisi_nickname', (data.user && data.user.nickname) || '')
          window.localStorage.setItem('feisi_role', (data.user && data.user.role) || '')
        } catch (error) {
          /* localStorage 不可用时忽略：仍然跳首页 */
        }
        window.location.href = 'index.html'
      })
      .catch(function (error) {
        showError(error.message || '注册失败，请稍后重试。')
        if (button) button.disabled = false
      })
  })
})()
