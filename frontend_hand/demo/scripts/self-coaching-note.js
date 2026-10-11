/* 自我教练页的一张小提示：这一页的 socket 握手要登录凭证 ——
   后端对没有 token 的连接会「拒绝未登录连接」（后端日志里的原话），
   页面上只会显示一句「后端连接失败」，看不出该去干什么。这里在通话台上方贴一张纸，
   直接给出登录入口；登录过（localStorage 里有 token）就什么都不做。 */
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
  note.className = 'panel'
  note.setAttribute('role', 'status')
  note.style.cssText =
    'display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 18px;margin:0 0 2px'
  note.innerHTML =
    '<span class="chip chip--yellow">还没登录</span>' +
    '<span style="font-size:var(--fs-small);color:var(--ink-body)">' +
    '自我教练要和后端建立实时连接，这一步需要登录凭证 —— 没登录时后端会拒绝这次连接（页面上那句「服务未连接 / 后端连接失败」就是这个）。' +
    '</span>' +
    '<a class="btn btn--small" href="login.html" style="margin-left:auto"><span>去登录</span></a>'
  host.insertBefore(note, host.firstChild)
})()
