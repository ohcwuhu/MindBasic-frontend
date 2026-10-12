/* 自我教练页顶上的一张小提示 —— 一句话，一个动作。

   这一页要登录才真的起得来（后端的实时连接不带凭证会被拒），所以没登录时贴一张纸
   「自我教练要登录才能开始」+ 一个「去登录」；连不上后端（双击打开的设计预览）时
   换一句「这是设计预览」，别让人以为页面坏了。
   通话一开始这张纸就收起来 —— 那时候它已经没用了，该让位置给通话台。 */
;(function () {
  'use strict'

  var token = null
  try {
    token = window.localStorage.getItem('mb_access_token')
  } catch (error) {
    token = null
  }
  if (token) return

  var host = document.querySelector('.video-call-page') || document.querySelector('#app')
  if (!host) return

  var note = document.createElement('div')
  note.className = 'panel sc-hint'
  note.setAttribute('role', 'status')
  note.innerHTML =
    '<span class="chip chip--yellow">还没登录</span>' +
    '<span class="sc-hint__text">自我教练要登录才能开始：对话里说的话要存进你的账号。</span>' +
    '<a class="btn btn--small sc-hint__action" href="login.html"><span>去登录</span></a>'
  host.insertBefore(note, host.firstChild)

  function sayPreview() {
    var text = note.querySelector('.sc-hint__text')
    if (text) {
      text.textContent = '这是设计预览 · 还没连后端，界面与状态都能看，真对话要接上后端再登录。'
    }
  }

  /* 后端在不在：不在就说清楚这是设计预览。
     `file://` 下一看就知道没有后端 —— 不去发那个注定失败的请求（控制台会白报一串 CORS）。 */
  if (window.location.protocol === 'file:') {
    sayPreview()
  } else {
    fetch('/api/v1/platform/config')
      .then(function (response) {
        if (!response.ok) throw new Error('offline')
      })
      .catch(sayPreview)
  }

  /* 通话开始后把这张纸收掉（Vue 挂载要等一会儿，所以带重试上限） */
  ;(function watchCall(tries) {
    var stage = document.querySelector('#app .vc-stage')
    if (!stage) {
      if (tries > 0) window.setTimeout(function () {
        watchCall(tries - 1)
      }, 300)
      return
    }
    if (stage.classList.contains('active')) {
      note.hidden = true
      return
    }
    var observer = new MutationObserver(function () {
      if (!stage.classList.contains('active')) return
      observer.disconnect()
      note.hidden = true
    })
    observer.observe(stage, { attributes: true, attributeFilter: ['class'] })
  })(20)
})()
