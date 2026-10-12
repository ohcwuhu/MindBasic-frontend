/* 预约：三步下单 —— 选服务 → 选时段 → 写一句你的情况。

   数据有两个来源，校验、防重复提交、成功反馈走同一条路：
     · 接后端（`?live=1` 或本机登录过）：按 `?coachId=` 取真教练、真服务、真时段，
       提交打 `POST /appointments`；
     · 静态演示（直接打开这个 .html）：用页面里写好的示例服务，示例时段的日期按「今天」算
       （所以隔几天再打开也不会出现过去的时段），提交生成一笔本地演示订单，
       订单页能接着走支付 —— 「预约 → 订单 → 支付 → 我的预约」这条链在演示里是通的。

   提交按钮是表单的 submit：点了以后先禁用自己并写「提交中…」，成功了换成成功卡，
   失败了把按钮放回去让人重试 —— 不会重复下单。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  var live = !!(api && api.live)
  var DEMO_KEY = 'feisi_demo_flow'
  var DEMO_MINUTES = 30

  var form = document.querySelector('#booking-form')
  var servicesBox = document.querySelector('.services')
  var slotsList = document.querySelector('.slots')
  var slotsNote = document.querySelector('[data-slots-note]')
  var need = document.querySelector('#need')
  var counter = document.querySelector('#need-counter')
  var needError = document.querySelector('#need-error')
  var agree = document.querySelector('#agree')
  var agreeError = document.querySelector('#agree-error')
  var slotError = document.querySelector('[data-slot-error]')
  var aside = document.querySelector('aside.panel')
  var submit = document.querySelector('[data-booking-submit]')
  var submitLabel = document.querySelector('[data-submit-label]')
  var statusLine = document.querySelector('[data-booking-status]')
  var sumTotal = document.querySelector('[data-sum-total]')
  if (!form || !aside || !servicesBox || !slotsList) return

  var params = new URLSearchParams(window.location.search)
  var coachId = Number(params.get('coachId') || 0)
  var presetSlotId = Number(params.get('slotId') || 0)
  var coachName = (function () {
    var crumb = document.querySelector('.crumbs a[href^="coach-detail"]')
    return crumb && crumb.textContent.trim() ? crumb.textContent.trim() : '知夏'
  })()

  var services = []
  var pickedService = null
  var pickedSlot = null
  var submitting = false
  var ticker = null

  function esc(value) {
    if (api && api.esc) return api.esc(value)
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function money(cents) {
    var value = (Number(cents) || 0) / 100
    return '¥' + (value % 1 === 0 ? String(value) : value.toFixed(2))
  }

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function showError(node, message) {
    if (!node) return
    node.textContent = message || ''
    node.hidden = !message
  }

  function setRow(key, value) {
    Array.prototype.forEach.call(aside.querySelectorAll('.kv__row'), function (row) {
      var label = row.querySelector('.kv__key')
      var cell = row.querySelector('.kv__val')
      if (label && cell && label.textContent.trim() === key) cell.textContent = value
    })
  }

  function refreshSummary() {
    setRow('教练', coachName)
    if (pickedService) {
      setRow('服务', pickedService.name + (pickedService.durationMin ? ' · ' + pickedService.durationMin + ' 分钟' : ''))
      if (sumTotal) sumTotal.textContent = money(pickedService.priceInCents)
    }
    setRow('时间', pickedSlot ? pickedSlot.label + ' ' + pickedSlot.time : '还没选时段')
  }

  /* ---------- 服务 ---------- */

  function serviceRows() {
    return services
      .map(function (service, index) {
        return (
          '<label class="service pick"><span class="pick__body">' +
          '<span class="service__name">' + esc(service.name) + '</span>' +
          '<span class="service__meta">' + esc(service.metaText) + '</span></span>' +
          '<span class="pick__side"><span class="service__price">' + esc(service.priceText) + '</span>' +
          '<input type="radio" name="service" value="' + esc(service.id) + '"' +
          (index === 0 ? ' checked' : '') + ' /></span></label>'
        )
      })
      .join('')
  }

  function renderServices(list) {
    services = list
    if (!services.length) {
      servicesBox.innerHTML =
        api && api.empty
          ? api.empty('这位教练还没上架服务', '换一位教练看看。')
          : '<p class="panel__note">这位教练还没上架服务。</p>'
      pickedService = null
      refreshSummary()
      return
    }
    servicesBox.innerHTML = serviceRows()
    pickedService = services[0]
    servicesBox.addEventListener('change', function (event) {
      var input = event.target.closest('input[name="service"]')
      if (!input) return
      pickedService =
        services.filter(function (item) {
          return String(item.id) === String(input.value)
        })[0] || pickedService
      refreshSummary()
    })
    refreshSummary()
  }

  /** 静态演示：服务清单就在页面里，读回来（示例数据不另抄一份） */
  function servicesFromPage() {
    var list = []
    Array.prototype.forEach.call(servicesBox.querySelectorAll('.service'), function (row, index) {
      var input = row.querySelector('input[name="service"]')
      var nameNode = row.querySelector('.service__name')
      var metaNode = row.querySelector('.service__meta')
      var priceNode = row.querySelector('.service__price')
      var metaText = metaNode ? metaNode.textContent.trim() : ''
      var priceText = priceNode ? priceNode.textContent.trim() : '¥0'
      var duration = /(\d+)\s*分钟/.exec(metaText)
      list.push({
        id: input && input.value ? input.value : 'demo-' + (index + 1),
        name: nameNode ? nameNode.textContent.trim() : '咨询',
        metaText: metaText,
        priceText: priceText,
        priceInCents: Math.round(parseFloat(priceText.replace(/[^\d.]/g, '')) * 100) || 0,
        durationMin: duration ? Number(duration[1]) : 0,
      })
    })
    return list
  }

  /* ---------- 时段 ---------- */

  function dateFromOffset(offset) {
    var date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + offset)
    return date
  }

  function isoDay(date) {
    return (
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0')
    )
  }

  function shortDay(date) {
    return String(date.getMonth() + 1) + '-' + String(date.getDate())
  }

  function slotItems(rows) {
    return rows
      .map(function (item) {
        if (item.off) {
          return (
            '<li><button class="slot slot--off" type="button" disabled><time>' +
            esc(item.label) +
            '</time><span>已约满</span></button></li>'
          )
        }
        var picked = item.picked
        return (
          '<li><button class="slot' +
          (picked ? ' is-picked' : '') +
          '" type="button" aria-pressed="' +
          (picked ? 'true' : 'false') +
          '" data-slot="' +
          esc(item.id) +
          '" data-iso="' +
          esc(item.iso) +
          '" data-label="' +
          esc(item.label) +
          '" data-time="' +
          esc(item.time) +
          '"><time datetime="' +
          esc(item.iso) +
          '">' +
          esc(item.label) +
          '</time><span>' +
          esc(item.time) +
          '</span></button></li>'
        )
      })
      .join('')
  }

  function renderSlots(rows) {
    slotsList.innerHTML = slotItems(rows)
    if (slotsNote) {
      var open = rows.filter(function (item) {
        return !item.off
      }).length
      slotsNote.textContent = open ? '未来 14 天 · ' + open + ' 个空档' : '暂时没有可约时段'
    }
    var first = slotsList.querySelector('.slot.is-picked')
    pickedSlot = first
      ? {
          id: first.getAttribute('data-slot'),
          iso: first.getAttribute('data-iso'),
          label: first.getAttribute('data-label'),
          time: first.getAttribute('data-time'),
        }
      : null
    presetSlotId = 0
    refreshSummary()
  }

  /** 静态演示：照页面里写好的时段与顺序重新算日期（今天 + 偏移） */
  function slotsFromPage() {
    var offsets = [1, 2, 2, 3, 4, 7]
    var rows = []
    Array.prototype.forEach.call(slotsList.querySelectorAll('.slot'), function (button, index) {
      var date = dateFromOffset(offsets[index] || 7)
      var timeNode = button.querySelector('span')
      if (button.classList.contains('slot--off') || button.disabled) {
        rows.push({ label: shortDay(date), off: true })
        return
      }
      rows.push({
        id: button.getAttribute('data-slot') || 'demo-' + (index + 1),
        iso: isoDay(date),
        label: shortDay(date),
        time: timeNode ? timeNode.textContent.trim() : '',
        off: false,
        picked: button.classList.contains('is-picked'),
      })
    })
    return rows
  }

  slotsList.addEventListener('click', function (event) {
    var button = event.target.closest('[data-slot]')
    if (!button) return
    pickedSlot = {
      id: button.getAttribute('data-slot'),
      iso: button.getAttribute('data-iso'),
      label: button.getAttribute('data-label'),
      time: button.getAttribute('data-time'),
    }
    Array.prototype.forEach.call(slotsList.querySelectorAll('.slot'), function (item) {
      var current = item === button
      item.classList.toggle('is-picked', current)
      if (item.hasAttribute('data-slot')) item.setAttribute('aria-pressed', current ? 'true' : 'false')
    })
    showError(slotError, '')
    refreshSummary()
  })

  /* ---------- 校验 ---------- */

  function validate() {
    var problems = []
    var text = need ? need.value.trim() : ''
    if (text.length < 5) {
      showError(needError, '用一句话说说你想聊什么（至少 5 个字），教练好提前准备。')
      if (need) need.setAttribute('aria-invalid', 'true')
      problems.push(need)
    } else {
      showError(needError, '')
      if (need) need.removeAttribute('aria-invalid')
    }
    if (!pickedSlot) {
      showError(slotError, '先选一个可约时段。')
      problems.push(slotsList.querySelector('.slot:not(.slot--off)'))
    } else {
      showError(slotError, '')
    }
    if (agree && !agree.checked) {
      showError(agreeError, '需要先同意《服务协议与免责声明》才能提交。')
      problems.push(agree)
    } else {
      showError(agreeError, '')
    }
    return problems
  }

  /* ---------- 提交 ---------- */

  function ymdStamp(date) {
    return (
      String(date.getFullYear()).slice(2) +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0')
    )
  }

  function writeDemo(pair) {
    try {
      var store = JSON.parse(window.sessionStorage.getItem(DEMO_KEY) || 'null') || { orders: [], appointments: [] }
      store.orders = [pair.order].concat(store.orders || [])
      store.appointments = [pair.appointment].concat(store.appointments || [])
      window.sessionStorage.setItem(DEMO_KEY, JSON.stringify(store))
    } catch (error) {
      /* 存不进去（隐私模式之类）也不影响这一屏的成功反馈 */
    }
  }

  function demoTicket(needDesc) {
    var now = new Date()
    var expireAt = new Date(now.getTime() + DEMO_MINUTES * 60 * 1000)
    var stamp = ymdStamp(now) + String(Math.floor(Math.random() * 9000) + 1000)
    var id = Math.floor(now.getTime() % 1000000)
    var amountInCents = pickedService ? pickedService.priceInCents : 0
    var free = amountInCents <= 0
    var order = {
      orderNo: 'OD' + stamp,
      type: 'APPOINTMENT',
      status: free ? 'PAID' : 'CREATED',
      amountInCents: amountInCents,
      payExpireAt: free ? null : expireAt.toISOString(),
      paidAt: free ? now.toISOString() : null,
      refundedAt: null,
      appointment: { id: id, appointmentNo: 'AP' + stamp },
      createdAt: now.toISOString(),
    }
    var appointment = {
      id: id,
      appointmentNo: order.appointment.appointmentNo,
      coach: { nickname: coachName },
      service: {
        name: pickedService ? pickedService.name : '咨询',
        durationMin: pickedService ? pickedService.durationMin : 0,
        priceInCents: amountInCents,
      },
      slot: {
        date: pickedSlot ? pickedSlot.iso : '',
        startTime: pickedSlot ? pickedSlot.time : '',
        endTime: '',
      },
      needDesc: needDesc,
      status: 'PENDING',
      cancelReason: null,
      cancelWindow: 'free',
      canCancel: true,
      reviewed: false,
      paymentStatus: free ? 'PAID' : 'CREATED',
      orderNo: order.orderNo,
      amountInCents: amountInCents,
      payExpireAt: order.payExpireAt,
      createdAt: order.createdAt,
    }
    return { order: order, appointment: appointment }
  }

  function startCountdown(expireAt, node) {
    if (ticker) window.clearInterval(ticker)
    if (!expireAt || !node) return
    function tick() {
      var left = Math.max(0, Math.round((new Date(expireAt).getTime() - Date.now()) / 1000))
      if (left <= 0) {
        node.textContent = '已超时'
        window.clearInterval(ticker)
        var line = aside.querySelector('[data-done-line]')
        if (line) line.textContent = '支付时间已过，这个时段已经释放；可以回教练档案重新约一次。'
        return
      }
      node.textContent =
        String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0')
    }
    tick()
    ticker = window.setInterval(tick, 1000)
  }

  function showDone(appointment) {
    var amount = Number(appointment.amountInCents || 0)
    var orderNo = appointment.orderNo || ''
    var payLink = 'orders.html' + (orderNo ? '?orderNo=' + encodeURIComponent(orderNo) : '')
    aside.innerHTML =
      '<div class="panel__head">' +
      '<h2 class="panel__title" id="sum-title" tabindex="-1">预约申请已提交</h2>' +
      '<p class="panel__note">预约号 ' +
      esc(appointment.appointmentNo || '') +
      '</p>' +
      '</div>' +
      '<p class="booking-done__slot">' +
      esc((appointment.slot && appointment.slot.date) || '') +
      ' ' +
      esc((appointment.slot && appointment.slot.startTime) || '') +
      ' · ' +
      esc((appointment.service && appointment.service.name) || '') +
      '</p>' +
      '<p class="booking-done__amount">' +
      money(amount) +
      '</p>' +
      '<p class="panel__foot" data-done-line>' +
      (amount > 0
        ? '订单 ' +
          esc(orderNo) +
          ' 已生成，请在 <strong data-done-countdown class="booking-done__count">' +
          DEMO_MINUTES +
          ':00</strong> 内完成支付，超时这个时段会释放。'
        : '这笔不需要支付，等教练确认就可以。') +
      '</p>' +
      '<div class="booking-done__actions">' +
      (amount > 0 ? '<a class="btn btn--block" href="' + esc(payLink) + '"><span>去支付订单</span></a>' : '') +
      '<a class="link-quiet" href="orders.html#appointments">查看我的预约</a>' +
      '</div>' +
      '<p class="panel__foot" role="status" aria-live="polite">' +
      (amount > 0 ? '支付完成后教练会尽快确认。' : '教练确认后会在这里和「我的预约」里更新。') +
      '</p>'
    startCountdown(appointment.payExpireAt, aside.querySelector('[data-done-countdown]'))
    var heading = aside.querySelector('.panel__title')
    if (heading) heading.focus()
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    if (submitting) return
    var problems = validate()
    if (problems.length) {
      say('还差一点，按提示补上就能提交。')
      if (problems[0] && problems[0].focus) problems[0].focus()
      return
    }
    submitting = true
    if (submit) {
      submit.disabled = true
      submit.setAttribute('aria-busy', 'true')
    }
    if (submitLabel) submitLabel.textContent = '提交中…'
    say('正在提交预约…')
    var needDesc = need ? need.value.trim() : ''
    var request = live
      ? api.post('/appointments', {
          coachId: coachId,
          serviceId: Number(pickedService.id),
          slotId: Number(pickedSlot.id),
          needDesc: needDesc,
        })
      : Promise.resolve().then(function () {
          var pair = demoTicket(needDesc)
          writeDemo(pair)
          return pair.appointment
        })
    request
      .then(function (appointment) {
        say('')
        showDone(appointment)
      })
      .catch(function (error) {
        submitting = false
        if (submit) {
          submit.disabled = false
          submit.removeAttribute('aria-busy')
        }
        if (submitLabel) submitLabel.textContent = '重新提交'
        say(((error && error.message) || '提交没成功。') + ' 你的选择还在，改一下再点一次。')
      })
  })

  if (need && counter) {
    need.addEventListener('input', function () {
      counter.textContent = '你写的内容只有你和教练能看到。' + need.value.length + ' / 500'
    })
  }
  if (agree) {
    agree.addEventListener('change', function () {
      if (agree.checked) showError(agreeError, '')
    })
  }

  /* ---------- 起手 ---------- */

  if (live) {
    api
      .get(coachId ? '/coaches/' + coachId : '/coaches?page=1&pageSize=1')
      .then(function (data) {
        var coach = data && data.items ? data.items[0] || null : data
        if (!coach) throw new Error('平台上还没有可预约的教练。')
        coachId = coach.id
        coachName = coach.nickname
        var figure = document.querySelector('.profile__figure img')
        if (figure) figure.src = api.symbol(coach.id)
        renderServices(
          (coach.services || []).map(function (service) {
            return {
              id: service.id,
              name: service.name,
              metaText:
                (service.serviceType === 'PACKAGE' ? '套餐' : '单次') + ' · ' + service.durationMin + ' 分钟',
              priceText: money(service.priceInCents),
              priceInCents: service.priceInCents,
              durationMin: service.durationMin,
            }
          })
        )
        return api.get('/coaches/' + coach.id + '/slots').then(function (slotData) {
          var rows = ((slotData && slotData.items) || [])
            .filter(function (slot) {
              return slot.status === 'AVAILABLE'
            })
            .map(function (slot) {
              return {
                id: slot.id,
                iso: slot.date,
                label: String(slot.date).slice(5),
                time: slot.startTime,
                off: false,
                picked: presetSlotId ? slot.id === presetSlotId : false,
              }
            })
          if (!rows.length) {
            renderSlots([])
            slotsList.innerHTML =
              api && api.emptyItem
                ? api.emptyItem('暂时没有可约时段', '教练还没放出未来 14 天的空档。')
                : '<li class="panel__note">暂时没有可约时段。</li>'
            return
          }
          if (!presetSlotId) rows[0].picked = true
          renderSlots(rows)
        })
      })
      .catch(function (error) {
        if (api && api.fail) api.fail(servicesBox, error)
        say((error && error.message) || '没能取到教练信息。')
      })
  } else {
    renderSlots(slotsFromPage())
    renderServices(servicesFromPage())
    say('当前是设计演示：登录后会加载真实时段与价格。')
  }
})()
