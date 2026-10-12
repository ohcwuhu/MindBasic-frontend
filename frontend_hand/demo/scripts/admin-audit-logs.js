/* 管理工作台 · 审计日志（后端 `/admin/audit-logs`，只读）。

   接后端：`GET /admin/audit-logs?action=&targetType=&page=&pageSize=` → { items, pagination }
           每条：{ actorNickname, actorRole, action, targetType, targetId, detail, ip, createdAt }
   没有后端：页面里写好的五条示例。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live
  var PAGE_SIZE = 20

  var ACTION = {
    ADMIN_ORDER_REFUND: '订单退款',
    ADMIN_CRISIS_ASSIGN: '危机接管',
    ADMIN_CRISIS_FOLLOW_UP: '危机跟进',
    ADMIN_CRISIS_RESOLVE: '危机结案',
    ADMIN_USER_STATUS: '用户状态',
    ADMIN_COACH_AUDIT: '教练审核',
    ADMIN_COACH_APPROVE: '教练审核 · 通过',
    ADMIN_COACH_REJECT: '教练审核 · 驳回',
    ADMIN_SYSTEM_CONFIG: '系统配置',
    ADMIN_ARTICLE: '内容维护',
    ADMIN_WALLET_GRANT: '钱包发放',
  }
  var TARGET = {
    ORDER: '订单',
    CRISIS: '危机预警',
    USER: '用户',
    COACH: '教练',
    ARTICLE: '文章',
    SYSTEM_CONFIG: '系统配置',
  }

  var rows = document.querySelector('[data-rows]')
  var statusLine = document.querySelector('[data-status]')
  var countCell = document.querySelector('[data-count]')
  var pagerCount = document.querySelector('[data-pager-count]')
  var prev = document.querySelector('[data-prev]')
  var next = document.querySelector('[data-next]')
  var apply = document.querySelector('[data-apply]')
  var reset = document.querySelector('[data-reset]')
  var actionSelect = document.querySelector('select[name="action"]')
  var targetSelect = document.querySelector('select[name="targetType"]')
  if (!rows) return

  var items = []
  var page = 1
  var pages = 1
  var busy = false

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function detail(detailValue) {
    if (!detailValue || typeof detailValue !== 'object') return '—'
    return Object.keys(detailValue)
      .slice(0, 3)
      .map(function (key) {
        return key + '=' + detailValue[key]
      })
      .join(' · ')
  }

  function row(log) {
    var target = (TARGET[log.targetType] || log.targetType || '—') + (log.targetId ? ' #' + log.targetId : '')
    return (
      '<tr>' +
      '<td class="tnum">' + api.esc(api.dateTime(log.createdAt)) + '</td>' +
      '<td>' + api.esc(log.actorNickname || '系统') + '</td>' +
      '<td>' + api.esc(log.actorRole || '—') + '</td>' +
      '<td>' + api.esc(ACTION[log.action] || log.action || '—') + '</td>' +
      '<td>' + api.esc(target) + '</td>' +
      '<td class="tnum">' + api.esc(detail(log.detail)) + '</td>' +
      '<td class="tnum">' + api.esc(log.ip || '—') + '</td>' +
      '</tr>'
    )
  }

  function draw() {
    rows.innerHTML = items.length
      ? items.map(row).join('')
      : '<tr><td colspan="7">' + (api.empty ? api.empty('没有符合条件的日志', '换个动作或对象看看。') : '没有日志。') + '</td></tr>'
    if (countCell) countCell.textContent = '共 ' + items.length + ' 条'
    if (pagerCount) pagerCount.textContent = '第 ' + page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 条'
    if (prev) prev.disabled = busy || page <= 1
    if (next) next.disabled = busy || page >= pages
  }

  function load() {
    if (!live) {
      draw()
      say('设计演示：这五条是示例日志。')
      return
    }
    busy = true
    say('正在读取日志…')
    var query = '/admin/audit-logs?page=' + page + '&pageSize=' + PAGE_SIZE
    if (actionSelect && actionSelect.value) query += '&action=' + encodeURIComponent(actionSelect.value)
    if (targetSelect && targetSelect.value) query += '&targetType=' + encodeURIComponent(targetSelect.value)
    api
      .get(query)
      .then(function (data) {
        items = (data && data.items) || []
        pages = Math.max(1, Number((data && data.pagination && data.pagination.totalPages)) || 1)
        draw()
        say('日志已更新。')
      })
      .catch(function (error) {
        say((error && error.message) || '日志没读出来。')
      })
      .then(function () {
        busy = false
        draw()
      })
  }

  if (apply) apply.addEventListener('click', function () { page = 1; load() })
  if (reset) {
    reset.addEventListener('click', function () {
      if (actionSelect) actionSelect.value = ''
      if (targetSelect) targetSelect.value = ''
      page = 1
      load()
    })
  }
  if (prev) prev.addEventListener('click', function () { if (page > 1) { page -= 1; load() } })
  if (next) next.addEventListener('click', function () { if (page < pages) { page += 1; load() } })

  if (!live) {
    items = [
      { id: 1, actorNickname: '管理员', actorRole: 'ADMIN', action: 'ADMIN_ORDER_REFUND', targetType: 'ORDER', targetId: 2, detail: { order_no: 'OD2610113077', amount_in_cents: 30000 }, ip: '127.0.0.1', createdAt: '2026-10-12T21:44:00' },
      { id: 2, actorNickname: '管理员', actorRole: 'ADMIN', action: 'ADMIN_CRISIS_ASSIGN', targetType: 'CRISIS', targetId: 9, detail: null, ip: '127.0.0.1', createdAt: '2026-10-12T09:12:00' },
      { id: 3, actorNickname: '管理员', actorRole: 'ADMIN', action: 'ADMIN_COACH_APPROVE', targetType: 'COACH', targetId: 12, detail: { audit_id: 31 }, ip: '127.0.0.1', createdAt: '2026-10-11T18:03:00' },
      { id: 4, actorNickname: '管理员', actorRole: 'ADMIN', action: 'ADMIN_USER_STATUS', targetType: 'USER', targetId: 7, detail: { status: 'DISABLED' }, ip: '127.0.0.1', createdAt: '2026-10-11T15:27:00' },
      { id: 5, actorNickname: '管理员', actorRole: 'ADMIN', action: 'ADMIN_SYSTEM_CONFIG', targetType: 'SYSTEM_CONFIG', targetId: null, detail: { keys: 2 }, ip: '127.0.0.1', createdAt: '2026-10-10T20:15:00' },
    ]
  }
  load()
})()
