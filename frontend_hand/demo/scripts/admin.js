/* 管理工作台（概览）：只给 ADMIN。

   数据全是真的：`/admin/stats`、`/admin/crisis-flags`、`/admin/coach-audits`、
   `/admin/users`、`/admin/articles`。非管理员打开这一页会被请回首页（后端也会 403）。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  function text(node, value) {
    if (node) node.textContent = value
  }

  function list(node, html) {
    if (node) node.innerHTML = html
  }

  function emptyRow(columns, title, hint) {
    return (
      '<li class="empty"><img src="assets/mascot-sleepy.webp" width="420" height="640" alt="" aria-hidden="true" />' +
      '<p class="empty__title">' + api.esc(title) + '</p>' +
      '<p class="empty__body">' + api.esc(hint || '') + '</p></li>'
    )
  }

  /* ---- 1. 先确认是管理员（后端对非 ADMIN 会 403） ---- */
  api
    .get('/admin/stats')
    .then(function (stats) {
      var boxes = document.querySelectorAll('[data-admin-stats] .stat')
      var values = [
        [stats.userCount, '注册用户'],
        [stats.coachCount + '（已审核 ' + stats.approvedCoachCount + '）', '教练'],
        [stats.appointmentCount, '预约'],
        [stats.pendingAppointmentCount, '待处理预约'],
        [stats.articleCount, '文章'],
        [stats.todayUserCount + ' / ' + stats.todayAppointmentCount, '今日新增用户 / 预约'],
      ]
      Array.prototype.forEach.call(boxes, function (box, index) {
        var item = values[index]
        if (!item) return
        box.innerHTML = '<strong>' + api.esc(String(item[0])) + '</strong><span>' + api.esc(item[1]) + '</span>'
      })
      text(
        document.querySelector('[data-admin-updated]'),
        '更新于 ' + new Date().toLocaleString('zh-CN', { hour12: false }),
      )
      return Promise.all([
        api.get('/admin/crisis-flags?page=1&pageSize=5').catch(function () {
          return { items: [], pagination: {} }
        }),
        api.get('/admin/coach-audits?page=1&pageSize=5').catch(function () {
          return { items: [], pagination: {} }
        }),
        api.get('/admin/users?page=1&pageSize=8').catch(function () {
          return { items: [] }
        }),
        api.get('/admin/articles?page=1&pageSize=8').catch(function () {
          return { items: [] }
        }),
      ])
    })
    .then(function (results) {
      if (!results) return
      var crises = (results[0] && results[0].items) || []
      var audits = (results[1] && results[1].items) || []
      var users = (results[2] && results[2].items) || []
      var articles = (results[3] && results[3].items) || []

      /* ---- 危机预警 ---- */
      var openCrises = crises.filter(function (item) {
        return item.status !== 'RESOLVED'
      })
      text(
        document.querySelector('[data-crisis-count]'),
        openCrises.length ? openCrises.length + ' 条待跟进' : '没有待跟进',
      )
      list(
        document.querySelector('[data-crisis-list]'),
        openCrises.length
          ? openCrises
              .map(function (item) {
                var level = item.level === 'HIGH' ? '高危' : item.level === 'MEDIUM' ? '中' : '低'
                return (
                  '<li class="note" style="padding:14px 16px">' +
                  '<p class="tag">' + api.esc(level) + ' · ' + api.esc(item.source || '') + '</p>' +
                  '<p style="margin-top:6px;font-size:var(--fs-small);line-height:1.6;color:var(--ink-body)">' +
                  api.esc((item.content || '').slice(0, 70)) + '</p>' +
                  '<p class="panel__foot" style="margin-top:8px">' +
                  api.esc((item.user && item.user.nickname) || '匿名') + ' · ' +
                  api.esc(api.dateTime(item.createdAt)) + '</p></li>'
                )
              })
              .join('')
          : emptyRow(3, '没有待跟进的预警', '这条最要紧，保持这个状态。'),
      )

      /* ---- 教练审核 ---- */
      text(
        document.querySelector('[data-audit-count]'),
        audits.length ? audits.length + ' 份待审' : '没有待审',
      )
      list(
        document.querySelector('[data-audit-list]'),
        audits.length
          ? audits
              .map(function (item) {
                return (
                  '<li class="note" style="padding:14px 16px">' +
                  '<p class="tag">第 ' +
                  (Number(item.submitVersion) || 1) +
                  ' 版 · ' +
                  api.esc(item.status || 'PENDING') +
                  '</p>' +
                  '<p style="margin-top:6px;font-size:var(--fs-small);color:var(--ink-body)">' +
                  api.esc(item.coachName || '—') +
                  '</p>' +
                  '<p class="panel__foot" style="margin-top:8px">' +
                  api.esc(api.dateTime(item.submittedAt)) +
                  ' · <a href="admin-coach-audits.html?audit=' +
                  item.id +
                  '">去看这一份</a></p></li>'
                )
              })
              .join('')
          : emptyRow(3, '没有待审的教练', '新提交的资质会出现在这里。'),
      )

      /* ---- 新用户 ---- */
      list(
        document.querySelector('[data-users-body]'),
        users.length
          ? users
              .map(function (user) {
                return (
                  '<tr><td>' + api.esc(user.nickname || '—') +
                  (user.isDisabled ? ' <span class="chip">已停用</span>' : '') + '</td>' +
                  '<td>' + api.esc(user.role || 'USER') + '</td>' +
                  '<td class="is-num">' + api.esc(api.dateTime(user.createdAt)) + '</td></tr>'
                )
              })
              .join('')
          : '<tr><td colspan="3">还没有用户</td></tr>',
      )

      /* ---- 新文章 ---- */
      list(
        document.querySelector('[data-articles-body]'),
        articles.length
          ? articles
              .map(function (article) {
                return (
                  '<tr><td>' + api.esc(article.title || '—') + '</td>' +
                  '<td>' + api.esc(article.status === 'PUBLISHED' ? '已发布' : article.status || '') + '</td>' +
                  '<td class="is-num">' + (article.viewCount || 0) + '</td></tr>'
                )
              })
              .join('')
          : '<tr><td colspan="3">还没有文章</td></tr>',
      )
    })
    .catch(function (error) {
      /* 不是管理员（403）或没登录（401）：请回首页，别停在一个空的后台上。
         原前端的 axios 客户端抛的 ApiError 带 `status`，优先认它；认不到再看文案。 */
      var status = (error && error.status) || 0
      if (status === 403 || status === 401 || /403|401|权限|管理员|无权/.test(String(error && error.message))) {
        window.location.replace('index.html')
        return
      }
      api.fail(document.querySelector('[data-admin-stats]') || document.body, error)
    })
})()
