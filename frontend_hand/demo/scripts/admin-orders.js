/* 管理工作台 · 订单与退款（后端 `/admin/orders`）。

   接后端：`GET /admin/orders?page=&pageSize=&status=&type=` → { items, pagination }
           `POST /admin/orders/{id}/refund` { reason } —— 钱退回用户余额，预约跟着取消
   没有后端：页面里写好的四笔示例；「退款」在行内就地确认（写一句原因），页内生效。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live
  var PAGE_SIZE = 20

  var LABEL = { CREATED: '待支付', PAID: '已支付', CLOSED: '已关闭', REFUNDED: '已退款' }
  var CHIP = { CREATED: 'chip--yellow', PAID: 'chip--green', CLOSED: '', REFUNDED: 'chip--lilac' }

  var rows = document.querySelector('[data-rows]')
  var statusLine = document.querySelector('[data-status]')
  var countCell = document.querySelector('[data-count]')
  var pagerCount = document.querySelector('[data-pager-count]')
  var prev = document.querySelector('[data-prev]')
  var next = document.querySelector('[data-next]')
  var apply = document.querySelector('[data-apply]')
  var reset = document.querySelector('[data-reset]')
  var statusSelect = document.querySelector('select[name="status"]')
  var typeSelect = document.querySelector('select[name="type"]')
  if (!rows) return

  var items = []
  var page = 1
  var pages = 1
  var busy = false

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function row(order) {
    var alive = order.status === 'PAID'
    var paid = order.paidAt ? api.dateTime(order.paidAt) : '—'
    if (order.refundedAt) paid = '退款 ' + api.dateTime(order.refundedAt)
    return (
      '<tr data-order="' + Number(order.id) + '">' +
      '<td class="tnum">' + api.esc(order.orderNo) + '</td>' +
      '<td>' + api.esc((order.user && order.user.nickname) || '') +
      ' <span class="tnum">' + api.esc((order.user && order.user.phone) || '') + '</span></td>' +
      '<td>' + (order.type === 'APPOINTMENT' ? '教练预约' : '钱包充值') + '</td>' +
      '<td class="is-num">' + api.money(order.amountInCents) + '</td>' +
      '<td><span class="chip ' + (CHIP[order.status] || '') + '">' + api.esc(LABEL[order.status] || order.status) + '</span></td>' +
      '<td class="tnum">' + api.esc(api.dateTime(order.createdAt)) + '</td>' +
      '<td class="tnum">' + api.esc(paid) + '</td>' +
      '<td>' + (alive
        ? '<button class="act act--warn" type="button" data-refund="' + Number(order.id) + '">退款</button>'
        : '<button class="act" type="button" disabled title="只有已支付的订单能退款">退款</button>') +
      '</td></tr>'
    )
  }

  function draw() {
    rows.innerHTML = items.length
      ? items.map(row).join('')
      : '<tr><td colspan="8">' + (api.empty ? api.empty('没有符合条件的订单', '换个筛选看看。') : '没有订单。') + '</td></tr>'
    if (countCell) countCell.textContent = '共 ' + items.length + ' 笔'
    if (pagerCount) pagerCount.textContent = '第 ' + page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 笔'
    if (prev) prev.disabled = busy || page <= 1
    if (next) next.disabled = busy || page >= pages
  }

  function openRefund(id) {
    var rowNode = rows.querySelector('[data-order="' + Number(id) + '"]')
    if (!rowNode || busy) return
    closeEditor()
    var editRow = document.createElement('tr')
    editRow.className = 'rowedit'
    editRow.setAttribute('data-editor-for', String(Number(id)))
    editRow.innerHTML =
      '<td colspan="8">' +
      '<form data-refund-form="' + Number(id) + '">' +
      '<label class="field__label" for="refund-reason-' + Number(id) + '">退款原因（会写进审计日志）</label>' +
      '<input class="input" id="refund-reason-' + Number(id) + '" name="reason" maxlength="120" placeholder="例如：用户申请，时间冲突" />' +
      '<div class="rowedit__acts">' +
      '<button class="act act--warn" type="submit">确认退款</button>' +
      '<button class="act" type="button" data-cancel>取消</button>' +
      '</div></form></td>'
    rowNode.parentNode.insertBefore(editRow, rowNode.nextSibling)
    var input = editRow.querySelector('input')
    if (input) input.focus()
  }

  function closeEditor() {
    var open = rows.querySelector('.rowedit')
    if (open) open.parentNode.removeChild(open)
  }

  function refund(id, reason) {
    if (busy) return
    busy = true
    say('正在退款…')
    var request = live
      ? api.post('/admin/orders/' + Number(id) + '/refund', { reason: reason || null })
      : Promise.resolve()
    request
      .then(function () {
        items = items.map(function (order) {
          return Number(order.id) === Number(id)
            ? Object.assign({}, order, { status: 'REFUNDED', refundedAt: new Date().toISOString() })
            : order
        })
        draw()
        say('已退款，钱回到用户的余额，相关预约也取消了。')
      })
      .catch(function (error) {
        say((error && error.message) || '退款没成功。')
      })
      .then(function () {
        busy = false
        draw()
        if (statusLine && statusLine.focus) statusLine.focus()
      })
  }

  function load() {
    if (!live) {
      draw()
      say('设计演示：这四笔是示例订单，退款会在页内生效。')
      return
    }
    busy = true
    say('正在读取订单…')
    var query = '/admin/orders?page=' + page + '&pageSize=' + PAGE_SIZE
    if (statusSelect && statusSelect.value) query += '&status=' + encodeURIComponent(statusSelect.value)
    if (typeSelect && typeSelect.value) query += '&type=' + encodeURIComponent(typeSelect.value)
    api
      .get(query)
      .then(function (data) {
        items = (data && data.items) || []
        var pagination = (data && data.pagination) || {}
        pages = Math.max(1, Number(pagination.totalPages) || 1)
        draw()
        say('订单已更新。')
      })
      .catch(function (error) {
        say((error && error.message) || '订单没读出来。')
      })
      .then(function () {
        busy = false
        draw()
      })
  }

  rows.addEventListener('click', function (event) {
    if (event.target.closest('[data-cancel]')) {
      closeEditor()
      return
    }
    var button = event.target.closest('[data-refund]')
    if (button) openRefund(button.getAttribute('data-refund'))
  })

  rows.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-refund-form]')
    if (!form) return
    event.preventDefault()
    var reason = form.elements.reason.value.trim()
    closeEditor()
    refund(form.getAttribute('data-refund-form'), reason)
  })

  if (apply) apply.addEventListener('click', function () { page = 1; load() })
  if (reset) {
    reset.addEventListener('click', function () {
      if (statusSelect) statusSelect.value = ''
      if (typeSelect) typeSelect.value = ''
      page = 1
      load()
    })
  }
  if (prev) prev.addEventListener('click', function () { if (page > 1) { page -= 1; load() } })
  if (next) next.addEventListener('click', function () { if (page < pages) { page += 1; load() } })

  if (!live) {
    items = [
      { id: 1, orderNo: 'OD2610124821', type: 'APPOINTMENT', status: 'CREATED', amountInCents: 30000, user: { nickname: '小满', phone: '139****0002' }, paidAt: null, refundedAt: null, createdAt: '2026-10-12T21:30:00' },
      { id: 2, orderNo: 'OD2610113077', type: 'APPOINTMENT', status: 'PAID', amountInCents: 30000, user: { nickname: '小满', phone: '139****0002' }, paidAt: '2026-10-11T20:05:00', refundedAt: null, createdAt: '2026-10-11T20:03:00' },
      { id: 3, orderNo: 'OD2610091140', type: 'TOPUP', status: 'CLOSED', amountInCents: 10000, user: { nickname: '阿禾', phone: '138****6621' }, paidAt: null, refundedAt: null, createdAt: '2026-10-09T11:40:00' },
      { id: 4, orderNo: 'OD2610080902', type: 'APPOINTMENT', status: 'REFUNDED', amountInCents: 28000, user: { nickname: '苏木', phone: '137****3320' }, paidAt: '2026-10-08T09:05:00', refundedAt: '2026-10-08T18:20:00', createdAt: '2026-10-08T09:02:00' },
    ]
  }
  load()
})()
