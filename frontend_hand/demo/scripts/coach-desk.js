/* 教练工作台 · 预约管理（原前端的 `CoachWorkbenchView` 的「预约管理」那一栏）。

   接后端：
     · `GET  /coach/appointments?page=&pageSize=` → { items }
     · `POST /coach/appointments/{id}/confirm`
     · `POST /coach/appointments/{id}/complete`
     · `POST /coach/appointments/{id}/cancel` { cancelReason }
     · `GET  /coach/profile` → 审核状态（未通过时这一栏本该置灰，见页面上的说明）
   没有后端：页面里写好的四单示例，动作在行内生效。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live

  var STATUS = {
    PENDING: ['待确认', 'chip--yellow'],
    CONFIRMED: ['已确认', 'chip--green'],
    COMPLETED: ['已完成', 'chip--lilac'],
    CANCELLED: ['已取消', ''],
    NO_SHOW: ['未赴约', ''],
    RESCHEDULED: ['已改期', 'chip--yellow'],
  }
  var PAY = { PAID: ['已支付', 'chip--green'], CREATED: ['待支付', 'chip--yellow'], REFUNDED: ['已退款', 'chip--lilac'], CLOSED: ['已关闭', ''], NONE: ['免费', ''] }

  var rows = document.querySelector('[data-rows]')
  var statusLine = document.querySelector('[data-status]')
  var countCell = document.querySelector('[data-count]')
  var statsList = document.querySelector('[data-stats]')
  var updatedCell = document.querySelector('[data-updated]')
  var auditChip = document.querySelector('[data-audit]')
  var apply = document.querySelector('[data-apply]')
  var reset = document.querySelector('[data-reset]')
  var statusSelect = document.querySelector('select[name="status"]')
  if (!rows) return

  var items = []
  var busy = false

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function chip(pair) {
    return '<span class="chip ' + pair[1] + '">' + api.esc(pair[0]) + '</span>'
  }

  function row(item) {
    var status = STATUS[item.status] || [item.status, '']
    var pay = PAY[item.paymentStatus] || PAY.NONE
    var actions = ''
    if (item.status === 'PENDING') {
      actions =
        '<button class="act" type="button" data-confirm="' + Number(item.id) + '">确认</button>' +
        '<button class="act act--warn" type="button" data-cancel="' + Number(item.id) + '">取消</button>'
    } else if (item.status === 'CONFIRMED') {
      actions = '<button class="act" type="button" data-complete="' + Number(item.id) + '">标记完成</button>'
    } else {
      actions = '<span class="anote">—</span>'
    }
    return (
      '<tr data-appt="' + Number(item.id) + '">' +
      '<td>' + api.esc((item.user && item.user.nickname) || '') +
      ' <span class="tnum">' + api.esc((item.user && item.user.phone) || '') + '</span></td>' +
      '<td>' + api.esc((item.service && item.service.name) || '') + '</td>' +
      '<td class="tnum">' + api.esc(item.slot ? item.slot.date.slice(5) + ' ' + item.slot.startTime : '') + '</td>' +
      '<td class="crisis-say">' + api.esc(item.needDesc || '—') + '</td>' +
      '<td>' + chip(pay) + '</td>' +
      '<td>' + chip(status) + '</td>' +
      '<td>' + actions + '</td>' +
      '</tr>'
    )
  }

  function draw() {
    var filter = statusSelect ? statusSelect.value : ''
    var shown = filter
      ? items.filter(function (item) {
          return item.status === filter
        })
      : items
    rows.innerHTML = shown.length
      ? shown.map(row).join('')
      : '<tr><td colspan="7">' + (api.empty ? api.empty('这一档没有预约', '换个状态看看。') : '没有预约。') + '</td></tr>'
    if (countCell) countCell.textContent = '共 ' + shown.length + ' 单'
    if (statsList) {
      var pending = items.filter(function (item) { return item.status === 'PENDING' }).length
      var completed = items.filter(function (item) { return item.status === 'COMPLETED' }).length
      statsList.innerHTML =
        '<li class="stat"><strong>' + pending + '</strong><span>待你确认</span></li>' +
        '<li class="stat"><strong>' + items.length + '</strong><span>这一屏的预约</span></li>' +
        '<li class="stat"><strong>' + completed + '</strong><span>已完成</span></li>' +
        '<li class="stat"><strong>' + items.filter(function (item) { return item.status === 'CONFIRMED' }).length + '</strong><span>已确认</span></li>'
    }
    if (updatedCell) updatedCell.textContent = api.dateTime(new Date().toISOString())
  }

  function closeEditor() {
    var open = rows.querySelector('.rowedit')
    if (open) open.parentNode.removeChild(open)
  }

  function openCancel(id) {
    var rowNode = rows.querySelector('[data-appt="' + Number(id) + '"]')
    if (!rowNode || busy) return
    closeEditor()
    var editRow = document.createElement('tr')
    editRow.className = 'rowedit'
    editRow.innerHTML =
      '<td colspan="7"><form data-cancel-form="' + Number(id) + '">' +
      '<label class="field__label" for="cancel-reason-' + Number(id) + '">取消原因（用户看得到，也会留在订单里）</label>' +
      '<input class="input" id="cancel-reason-' + Number(id) + '" name="reason" maxlength="200" placeholder="例如：临时有会议，约下周同一时间" />' +
      '<div class="rowedit__acts">' +
      '<button class="act act--warn" type="submit">确认取消</button>' +
      '<button class="act" type="button" data-close>先不取消</button>' +
      '</div></form></td>'
    rowNode.parentNode.insertBefore(editRow, rowNode.nextSibling)
    var input = editRow.querySelector('input')
    if (input) input.focus()
  }

  function act(id, kind, reason) {
    if (busy) return
    busy = true
    say(kind === 'confirm' ? '正在确认…' : kind === 'complete' ? '正在标记完成…' : '正在取消…')
    var path = '/coach/appointments/' + Number(id) + '/' + kind
    var body = kind === 'cancel' ? { cancelReason: reason || null } : undefined
    var request = live ? api.post(path, body) : Promise.resolve()
    request
      .then(function () {
        items = items.map(function (item) {
          if (Number(item.id) !== Number(id)) return item
          if (kind === 'confirm') return Object.assign({}, item, { status: 'CONFIRMED' })
          if (kind === 'complete') return Object.assign({}, item, { status: 'COMPLETED', completedAt: new Date().toISOString() })
          return Object.assign({}, item, { status: 'CANCELLED', cancelReason: reason })
        })
        draw()
        say(kind === 'confirm' ? '已确认，用户那边会看到。' : kind === 'complete' ? '已记完成，用户可以来评价了。' : '已取消，原因已留痕。')
      })
      .catch(function (error) {
        say((error && error.message) || '这一步没成功，再试一次。')
      })
      .then(function () {
        busy = false
        draw()
        if (statusLine && statusLine.focus) statusLine.focus()
      })
  }

  rows.addEventListener('click', function (event) {
    if (event.target.closest('[data-close]')) {
      closeEditor()
      return
    }
    var confirm = event.target.closest('[data-confirm]')
    if (confirm) {
      act(confirm.getAttribute('data-confirm'), 'confirm')
      return
    }
    var complete = event.target.closest('[data-complete]')
    if (complete) {
      act(complete.getAttribute('data-complete'), 'complete')
      return
    }
    var cancel = event.target.closest('[data-cancel]')
    if (cancel) openCancel(cancel.getAttribute('data-cancel'))
  })

  rows.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-cancel-form]')
    if (!form) return
    event.preventDefault()
    var reason = form.elements.reason.value.trim()
    if (reason.length < 2) {
      say('写一句原因再取消 —— 用户那边看得到。')
      form.elements.reason.focus()
      return
    }
    closeEditor()
    act(form.getAttribute('data-cancel-form'), 'cancel', reason)
  })

  if (apply) apply.addEventListener('click', function () { draw() })
  if (reset) {
    reset.addEventListener('click', function () {
      if (statusSelect) statusSelect.value = ''
      draw()
    })
  }

  if (!live) {
    items = [
      { id: 1, user: { nickname: '小满', phone: '139****0002' }, service: { name: '单次咨询 · 50 分钟' }, slot: { date: '2026-10-13', startTime: '20:00' }, needDesc: '下个月有场重要的考试，最近一想到就睡不着。', paymentStatus: 'PAID', status: 'PENDING' },
      { id: 2, user: { nickname: '阿禾', phone: '138****6621' }, service: { name: '首次了解 · 15 分钟' }, slot: { date: '2026-10-14', startTime: '10:00' }, needDesc: '想做一次成长测评，不知道从哪开始。', paymentStatus: 'NONE', status: 'CONFIRMED' },
      { id: 3, user: { nickname: '苏木', phone: '137****3320' }, service: { name: '单次咨询 · 50 分钟' }, slot: { date: '2026-10-08', startTime: '19:00' }, needDesc: '和室友的关系有点僵，不知道该不该先开口。', paymentStatus: 'PAID', status: 'COMPLETED' },
      { id: 4, user: { nickname: '晚风', phone: '136****8891' }, service: { name: '四周陪伴套餐 · 50 分钟' }, slot: { date: '2026-10-05', startTime: '15:30' }, needDesc: '', paymentStatus: 'REFUNDED', status: 'CANCELLED' },
    ]
    draw()
    say('设计演示：这四单是示例，确认 / 完成 / 取消会在页内生效。')
  } else {
    api
      .get('/coach/profile')
      .then(function (profile) {
        if (auditChip) {
          var status = profile && profile.auditStatus
          auditChip.textContent = status === 'APPROVED' ? '已通过审核' : status === 'PENDING' ? '审核中' : '未通过审核'
          auditChip.className = 'chip ' + (status === 'APPROVED' ? 'chip--green' : status === 'PENDING' ? 'chip--yellow' : '')
        }
      })
      .catch(function () {
        /* 拿不到就留着页面里写的那一句 */
      })
    api
      .get('/coach/appointments?page=1&pageSize=50')
      .then(function (data) {
        items = (data && data.items) || []
        draw()
        say('已连后端，显示的是真实预约。')
      })
      .catch(function (error) {
        say((error && error.message) || '预约没读出来。')
      })
  }
})()
