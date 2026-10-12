/* 我的订单 + 我的预约 —— 同一页两块，一次把它们看完。

   数据有两个来源：
     · 接后端（`?live=1` 或本机登录过）：GET /orders、GET /appointments/mine、GET /wallet；
       支付 POST /orders/{no}/pay，取消 POST /appointments/{id}/cancel，
       评价 POST /appointments/{id}/review。
     · 静态演示（直接打开这个 .html）：示例订单与预约 + 一个本地余额，动作会真的在页面里生效，
       并写进 sessionStorage —— 预约页提交的订单也接在这里，
       所以「预约 → 订单 → 支付 → 我的预约」整条链在演示里能走完（不经过任何假服务端）。

   每个动作都有 pending guard：按下先禁用自己，回来了再放开；结果写在 aria-live 的行里。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  var live = !!(api && api.live)
  var KEY = 'feisi_demo_flow'

  var list = document.querySelector('[data-orders-list]')
  var status = document.querySelector('[data-orders-status]')
  var refresh = document.querySelector('[data-orders-refresh]')
  var filters = document.querySelector('[data-order-filters]')
  var demoNote = document.querySelector('[data-demo-note]')
  var apptList = document.querySelector('[data-appointments-list]')
  var apptStatus = document.querySelector('[data-appointments-status]')
  if (!list || !apptList) return

  var ORDER_LABEL = { CREATED: '待支付', PAID: '已支付', CLOSED: '已关闭', REFUNDED: '已退款' }
  var ORDER_CHIP = { CREATED: 'chip--yellow', PAID: 'chip--green', CLOSED: '', REFUNDED: 'chip--lilac' }
  var APPT_LABEL = {
    PENDING: '待教练确认',
    CONFIRMED: '已确认',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    NO_SHOW: '未赴约',
    RESCHEDULED: '已改期',
  }
  var APPT_CHIP = {
    PENDING: 'chip--yellow',
    CONFIRMED: 'chip--green',
    COMPLETED: 'chip--lilac',
    CANCELLED: '',
    NO_SHOW: '',
    RESCHEDULED: 'chip--yellow',
  }

  var orders = []
  var appointments = []
  var balanceInCents = 0
  var filter = 'ALL'
  var busy = false
  var target = new URLSearchParams(window.location.search).get('orderNo')

  function esc(value) {
    if (api && api.esc) return api.esc(value)
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function money(cents) {
    if (api && api.money) return api.money(cents)
    var value = (Number(cents) || 0) / 100
    return '¥' + (value % 1 === 0 ? String(value) : value.toFixed(2))
  }

  function stamp(iso) {
    if (api && api.dateTime) return api.dateTime(iso)
    if (!iso) return ''
    var date = new Date(iso)
    return isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false })
  }

  function say(node, text) {
    if (node) node.textContent = text || ''
  }

  function metaRow(label, value) {
    return '<div><dt>' + esc(label) + '</dt><dd>' + value + '</dd></div>'
  }

  function expired(order) {
    return !!(
      order.status === 'CREATED' &&
      order.payExpireAt &&
      new Date(order.payExpireAt).getTime() <= Date.now()
    )
  }

  /* ---------- 订单 ---------- */

  function orderCard(order) {
    var orderNo = String(order.orderNo || '')
    var isExpired = expired(order)
    var alive = order.status === 'CREATED' && !isExpired
    var label = isExpired ? '已超时' : ORDER_LABEL[order.status] || '状态待确认'
    var chip = isExpired ? '' : ORDER_CHIP[order.status] || ''
    var free = Number(order.amountInCents) <= 0
    var meta =
      metaRow('订单号', esc(orderNo)) +
      metaRow('创建', esc(stamp(order.createdAt))) +
      (order.paidAt ? metaRow('支付时间', esc(stamp(order.paidAt))) : '') +
      (order.refundedAt ? metaRow('退款时间', esc(stamp(order.refundedAt))) : '') +
      (alive && !free
        ? metaRow('支付截止', '<strong class="order__count" data-count="' + esc(order.payExpireAt) + '">—</strong>')
        : order.status === 'CREATED' && order.payExpireAt
          ? metaRow('支付截止', esc(stamp(order.payExpireAt)) + ' · 时段已释放')
          : '')
    var actions = ''
    if (alive && !free) {
      actions +=
        '<button class="btn btn--small" type="button" data-pay="' + esc(orderNo) + '">使用余额支付</button>'
    }
    if (alive && free) {
      actions += '<span class="anote">这笔不需要支付，等教练确认就可以</span>'
    }
    if (order.appointment && order.appointment.appointmentNo) {
      actions += '<a class="link-quiet" href="#appointments">查看这次预约</a>'
    }
    return (
      '<article class="order" id="order-' + esc(orderNo) + '" data-order="' + esc(orderNo) + '">' +
      '<div class="order__head">' +
      '<h3 class="order__title">' + (order.type === 'APPOINTMENT' ? '教练预约' : '钱包充值') + '</h3>' +
      '<span class="chip ' + chip + '">' + esc(label) + '</span>' +
      '<strong class="order__amount">' + money(order.amountInCents) + '</strong>' +
      '</div>' +
      '<dl class="order__meta">' + meta + '</dl>' +
      (actions ? '<div class="order__actions">' + actions + '</div>' : '') +
      '<div data-editor></div>' +
      '</article>'
    )
  }

  function drawOrders() {
    var rows = orders.filter(function (order) {
      if (filter === 'ALL') return true
      if (filter === 'CLOSED') return order.status === 'CLOSED' || order.status === 'REFUNDED'
      return order.status === filter
    })
    list.innerHTML = rows.length
      ? rows.map(orderCard).join('')
      : api && api.empty
        ? api.empty(
            orders.length ? '这一类里还没有订单' : '还没有订单',
            orders.length ? '换个筛选看看。' : '找一位教练，约一次聊聊。',
          )
        : '<p class="panel__note">还没有订单。</p>'
    tick()
    if (target) {
      var node = document.getElementById('order-' + target)
      if (node) {
        window.location.hash = 'order-' + target
        target = null
      }
    }
  }

  /* ---------- 预约 ---------- */

  function appointmentCard(item) {
    var meta =
      metaRow(
        '时间',
        esc(item.slot.date) +
          ' ' +
          esc(item.slot.startTime) +
          (item.slot.endTime ? '–' + esc(item.slot.endTime) : ''),
      ) +
      metaRow('预约号', esc(item.appointmentNo)) +
      (item.needDesc ? metaRow('想聊什么', esc(item.needDesc)) : '') +
      (item.cancelReason ? metaRow('说明', esc(item.cancelReason)) : '') +
      (item.orderNo
        ? metaRow('订单', '<a class="link-quiet" href="#order-' + esc(item.orderNo) + '">' + esc(item.orderNo) + '</a>')
        : '')
    var actions = ''
    if (item.canCancel) {
      actions +=
        '<button class="btn btn--paper btn--small" type="button" data-open-cancel="' +
        Number(item.id) +
        '">取消预约</button>'
    }
    if (item.status === 'COMPLETED' && !item.reviewed) {
      actions +=
        '<button class="btn btn--small" type="button" data-open-review="' +
        Number(item.id) +
        '">评价这次服务</button>'
    }
    if (item.reviewed) actions += '<span class="anote">已评价</span>'
    return (
      '<article class="order" id="appointment-' +
      Number(item.id) +
      '" data-appointment="' +
      Number(item.id) +
      '">' +
      '<div class="order__head">' +
      '<h3 class="order__title">' +
      esc((item.coach && item.coach.nickname) || '教练') +
      ' · ' +
      esc(item.service.name) +
      '</h3>' +
      '<span class="chip ' +
      (APPT_CHIP[item.status] || '') +
      '">' +
      esc(APPT_LABEL[item.status] || '状态待确认') +
      '</span>' +
      '</div>' +
      '<dl class="order__meta">' +
      meta +
      '</dl>' +
      (actions ? '<div class="order__actions">' + actions + '</div>' : '') +
      '<div data-editor></div>' +
      '</article>'
    )
  }

  function drawAppointments() {
    apptList.innerHTML = appointments.length
      ? appointments
          .slice()
          .sort(function (a, b) {
            return String(b.slot.date + b.slot.startTime).localeCompare(String(a.slot.date + a.slot.startTime))
          })
          .map(appointmentCard)
          .join('')
      : api && api.empty
        ? api.empty('还没有预约', '去「真人教练」页面选一位，约一次聊聊。')
        : '<p class="panel__note">还没有预约。</p>'
  }

  function setBusy(next) {
    busy = next
    Array.prototype.forEach.call(list.querySelectorAll('button'), function (button) {
      button.disabled = next
    })
    Array.prototype.forEach.call(apptList.querySelectorAll('button'), function (button) {
      button.disabled = next
    })
    /* 忙碌时筛选也按不动 —— 按了没反应比按不动更让人困惑 */
    Array.prototype.forEach.call(document.querySelectorAll('[data-order-filter]'), function (button) {
      button.disabled = next
    })
    if (refresh) refresh.disabled = next
  }

  /* ---------- 倒计时 ---------- */

  function tick() {
    Array.prototype.forEach.call(list.querySelectorAll('[data-count]'), function (node) {
      var left = Math.max(0, Math.round((new Date(node.getAttribute('data-count')).getTime() - Date.now()) / 1000))
      if (left <= 0) {
        node.textContent = '已超时'
        node.classList.add('is-over')
        return
      }
      node.textContent =
        String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0')
    })
  }

  function startTicker() {
    window.setInterval(function () {
      if (busy) return
      var stale = false
      Array.prototype.forEach.call(list.querySelectorAll('[data-count]'), function (node) {
        if (new Date(node.getAttribute('data-count')).getTime() <= Date.now()) stale = true
      })
      tick()
      /* 刚过期就重画一次：按钮该收起来了 */
      if (stale) {
        drawOrders()
        say(status, '有一笔订单支付超时，时段已经释放。')
      }
    }, 1000)
  }

  /* ---------- 静态演示的数据 ---------- */

  function isoDay(offset) {
    var date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + offset)
    return (
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0')
    )
  }

  function readStore() {
    try {
      return JSON.parse(window.sessionStorage.getItem(KEY) || 'null')
    } catch (error) {
      return null
    }
  }

  function writeStore(store) {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(store))
    } catch (error) {
      /* 存不进去也不影响这一屏 */
    }
  }

  function seed() {
    var now = Date.now()
    var today = isoDay(0).replace(/-/g, '').slice(2)
    var yesterday = isoDay(-1).replace(/-/g, '').slice(2)
    var pending = {
      orderNo: 'OD' + today + '4821',
      type: 'APPOINTMENT',
      status: 'CREATED',
      amountInCents: 30000,
      payExpireAt: new Date(now + 22 * 60 * 1000).toISOString(),
      paidAt: null,
      refundedAt: null,
      appointment: { id: 9001, appointmentNo: 'AP' + today + '4821' },
      createdAt: new Date(now - 8 * 60 * 1000).toISOString(),
    }
    var paid = {
      orderNo: 'OD' + yesterday + '3077',
      type: 'APPOINTMENT',
      status: 'PAID',
      amountInCents: 30000,
      payExpireAt: null,
      paidAt: new Date(now - 25 * 3600 * 1000).toISOString(),
      refundedAt: null,
      appointment: { id: 9002, appointmentNo: 'AP' + yesterday + '3077' },
      createdAt: new Date(now - 26 * 3600 * 1000).toISOString(),
    }
    return {
      seeded: true,
      balanceInCents: 52000,
      orders: [pending, paid],
      appointments: [
        {
          id: 9001,
          appointmentNo: pending.appointment.appointmentNo,
          coach: { nickname: '知夏' },
          service: { name: '单次咨询', durationMin: 50, priceInCents: 30000 },
          slot: { date: isoDay(1), startTime: '20:00', endTime: '20:50' },
          needDesc: '下个月有场重要的考试，最近一想到就睡不着。',
          status: 'PENDING',
          cancelReason: null,
          cancelWindow: 'free',
          canCancel: true,
          reviewed: false,
          paymentStatus: 'CREATED',
          orderNo: pending.orderNo,
          amountInCents: 30000,
          payExpireAt: pending.payExpireAt,
          createdAt: pending.createdAt,
        },
        {
          id: 9002,
          appointmentNo: paid.appointment.appointmentNo,
          coach: { nickname: '林深' },
          service: { name: '单次咨询', durationMin: 50, priceInCents: 30000 },
          slot: { date: isoDay(-1), startTime: '19:00', endTime: '19:50' },
          needDesc: '和室友的关系有点僵，不知道该不该先开口。',
          status: 'COMPLETED',
          cancelReason: null,
          cancelWindow: 'closed',
          canCancel: false,
          reviewed: false,
          paymentStatus: 'PAID',
          orderNo: paid.orderNo,
          amountInCents: 30000,
          payExpireAt: null,
          createdAt: paid.createdAt,
        },
      ],
    }
  }

  function loadDemo() {
    var store = readStore() || {}
    if (!store.seeded) {
      var fresh = seed()
      /* 预约页可能已经先塞了一笔新订单进来，接着算，不能丢 */
      fresh.orders = (store.orders || []).concat(fresh.orders)
      fresh.appointments = (store.appointments || []).concat(fresh.appointments)
      if (typeof store.balanceInCents === 'number') fresh.balanceInCents = store.balanceInCents
      store = fresh
      writeStore(store)
    }
    orders = store.orders || []
    appointments = store.appointments || []
    balanceInCents = Number(store.balanceInCents || 0)
    if (demoNote) {
      demoNote.hidden = false
      demoNote.innerHTML =
        '设计演示：订单与预约是示例数据，但动作会真的生效（只存在这个标签页里）。可用余额 ' +
        money(balanceInCents) +
        '（演示用的本地余额，可在钱包充值）。' +
        '<button class="orders-demo__reset" type="button" data-reset>重置演示数据</button>'
    }
  }

  function persist() {
    writeStore({
      seeded: true,
      balanceInCents: balanceInCents,
      orders: orders,
      appointments: appointments,
    })
  }

  /* ---------- 支付 ---------- */

  function findOrder(orderNo) {
    return orders.filter(function (order) {
      return order.orderNo === orderNo
    })[0]
  }

  function clearEditors() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-editor]'), function (node) {
      node.innerHTML = ''
    })
  }

  function openPay(orderNo, button) {
    var order = findOrder(orderNo)
    var row = document.getElementById('order-' + orderNo)
    var box = row && row.querySelector('[data-editor]')
    if (!order || !box) return
    if (expired(order)) {
      say(status, '这笔订单的支付时间已经过了，时段已经释放。可以回教练档案重新约一次。')
      drawOrders()
      return
    }
    var wallet = live
      ? api.get('/wallet').then(function (data) {
          balanceInCents = Number((data && data.balanceInCents) || 0)
          return balanceInCents
        })
      : Promise.resolve(balanceInCents)
    box.innerHTML = '<p class="order__line">正在确认可用余额…</p>'
    if (button) button.setAttribute('aria-busy', 'true')
    wallet
      .then(function (balance) {
        if (button) button.removeAttribute('aria-busy')
        if (expired(order)) {
          box.innerHTML = ''
          drawOrders()
          say(status, '刚过了支付时间，这笔订单已经不能付了。')
          return
        }
        if (balance >= order.amountInCents) {
          box.innerHTML =
            '<p class="order__line">钱包余额 ' +
            money(balance) +
            '，这次要扣 ' +
            money(order.amountInCents) +
            '。</p>' +
            '<div class="order__actions">' +
            '<button class="btn btn--small" type="button" data-confirm-pay="' +
            esc(orderNo) +
            '">确认支付 ' +
            money(order.amountInCents) +
            '</button>' +
            '<button class="btn btn--paper btn--small" type="button" data-dismiss>先不付</button>' +
            '</div>'
        } else {
          box.innerHTML =
            '<p class="order__line">钱包余额 ' +
            money(balance) +
            '，不够付这一笔（' +
            money(order.amountInCents) +
            '）。</p>' +
            '<div class="order__actions">' +
            '<a class="btn btn--small" href="wallet.html">去钱包充值</a>' +
            '<button class="btn btn--paper btn--small" type="button" data-confirm-pay="' +
            esc(orderNo) +
            '">模拟支付（演示用）</button>' +
            '<button class="btn btn--paper btn--small" type="button" data-dismiss>先不付</button>' +
            '</div>'
        }
        var confirm = box.querySelector('[data-confirm-pay]')
        if (confirm) confirm.focus()
      })
      .catch(function (error) {
        if (button) button.removeAttribute('aria-busy')
        box.innerHTML = ''
        say(status, ((error && error.message) || '余额没读出来。') + ' 点「刷新订单」再看一次。')
      })
  }

  function pay(orderNo) {
    var order = findOrder(orderNo)
    var row = document.getElementById('order-' + orderNo)
    var box = row && row.querySelector('[data-editor]')
    if (!order || busy) return
    setBusy(true)
    say(status, '正在支付，请稍候…')
    var request = live
      ? api.post('/orders/' + encodeURIComponent(orderNo) + '/pay', { method: 'BALANCE' })
      : Promise.resolve().then(function () {
          var now = new Date().toISOString()
          balanceInCents = Math.max(0, balanceInCents - Number(order.amountInCents || 0))
          orders = orders.map(function (item) {
            return item.orderNo === orderNo
              ? Object.assign({}, item, { status: 'PAID', paidAt: now, payExpireAt: null })
              : item
          })
          appointments = appointments.map(function (item) {
            return item.orderNo === orderNo ? Object.assign({}, item, { paymentStatus: 'PAID' }) : item
          })
          persist()
          return findOrder(orderNo)
        })
    request
      .then(function (updated) {
        if (updated && updated.orderNo) {
          orders = orders.map(function (item) {
            return item.orderNo === updated.orderNo ? Object.assign({}, item, updated) : item
          })
        }
        if (box) box.innerHTML = ''
        drawOrders()
        drawAppointments()
        say(status, '支付完成，预约已进入教练确认。')
      })
      .catch(function (error) {
        if (box) box.innerHTML = ''
        say(status, ((error && error.message) || '支付没完成。') + ' 刷新订单核对状态后再试。')
      })
      .then(function () {
        setBusy(false)
        if (status && status.focus) status.focus()
      })
  }

  /* ---------- 取消与评价 ---------- */

  function openCancel(id) {
    var item = appointments.filter(function (record) {
      return Number(record.id) === Number(id)
    })[0]
    var row = document.getElementById('appointment-' + id)
    var box = row && row.querySelector('[data-editor]')
    if (!item || !box || !item.canCancel) return
    var rule =
      item.paymentStatus === 'PAID'
        ? item.cancelWindow === 'free'
          ? '已支付的金额会全额退回钱包余额。'
          : '离服务开始很近了，可能只按规则部分退款，以平台处理结果为准。'
        : '这笔还没支付，取消后订单会关闭。'
    box.innerHTML =
      '<p class="order__line">确认取消这次预约？' +
      rule +
      '</p>' +
      '<div class="order__actions">' +
      '<button class="btn btn--small" type="button" data-confirm-cancel="' +
      Number(item.id) +
      '">确认取消预约</button>' +
      '<button class="btn btn--paper btn--small" type="button" data-dismiss>保留预约</button>' +
      '</div>'
    var keep = box.querySelector('[data-dismiss]')
    if (keep) keep.focus()
  }

  function cancelAppointment(id) {
    var item = appointments.filter(function (record) {
      return Number(record.id) === Number(id)
    })[0]
    if (!item || busy) return
    setBusy(true)
    say(apptStatus, '正在取消预约…')
    var refunding = item.paymentStatus === 'PAID' && Number(item.amountInCents) > 0
    var request = live
      ? api.post('/appointments/' + Number(id) + '/cancel', {})
      : Promise.resolve().then(function () {
          var refund = refunding ? Number(item.amountInCents || 0) : 0
          balanceInCents += refund
          appointments = appointments.map(function (record) {
            return Number(record.id) === Number(id)
              ? Object.assign({}, record, {
                  status: 'CANCELLED',
                  canCancel: false,
                  paymentStatus: refund ? 'REFUNDED' : record.paymentStatus,
                  cancelReason: refund ? '你取消了预约，已退款到钱包余额。' : '你取消了预约。',
                })
              : record
          })
          if (item.orderNo) {
            orders = orders.map(function (order) {
              return order.orderNo === item.orderNo
                ? Object.assign({}, order, {
                    status: refund ? 'REFUNDED' : order.status,
                    refundedAt: refund ? new Date().toISOString() : order.refundedAt,
                  })
                : order
            })
          }
          persist()
          return appointments.filter(function (record) {
            return Number(record.id) === Number(id)
          })[0]
        })
    request
      .then(function (updated) {
        if (updated && updated.id) {
          appointments = appointments.map(function (record) {
            return Number(record.id) === Number(updated.id) ? Object.assign({}, record, updated) : record
          })
        }
        clearEditors()
        drawAppointments()
        drawOrders()
        say(apptStatus, '预约已取消。' + (refunding ? '退款与新余额可以在钱包里对。' : ''))
      })
      .catch(function (error) {
        clearEditors()
        say(apptStatus, ((error && error.message) || '取消没完成。') + ' 刷新页面核对最新状态。')
      })
      .then(function () {
        setBusy(false)
        if (apptStatus && apptStatus.focus) apptStatus.focus()
      })
  }

  function openReview(id) {
    var row = document.getElementById('appointment-' + id)
    var box = row && row.querySelector('[data-editor]')
    if (!box) return
    box.innerHTML =
      '<form class="order__confirm" data-review="' +
      Number(id) +
      '">' +
      '<div class="field">' +
      '<label class="field__label" for="rating-' +
      Number(id) +
      '">这次服务打几分</label>' +
      '<select class="select" id="rating-' +
      Number(id) +
      '" name="rating">' +
      '<option value="5">5 分 · 很有帮助</option>' +
      '<option value="4">4 分 · 有帮助</option>' +
      '<option value="3">3 分 · 一般</option>' +
      '<option value="2">2 分 · 不太有帮助</option>' +
      '<option value="1">1 分 · 没有帮助</option>' +
      '</select>' +
      '</div>' +
      '<div class="field">' +
      '<label class="field__label" for="review-' +
      Number(id) +
      '">想对教练说的话（选填，最多 500 字）</label>' +
      '<textarea class="textarea" id="review-' +
      Number(id) +
      '" name="content" maxlength="500"></textarea>' +
      '</div>' +
      '<div class="order__actions">' +
      '<button class="btn btn--small" type="submit">提交评价</button>' +
      '<button class="btn btn--paper btn--small" type="button" data-dismiss>稍后再说</button>' +
      '</div>' +
      '</form>'
    var select = box.querySelector('select')
    if (select) select.focus()
  }

  function sendReview(form, id) {
    if (busy) return
    var rating = Number(form.elements.rating.value)
    var content = form.elements.content.value.trim()
    if (!(rating >= 1 && rating <= 5)) {
      say(apptStatus, '请选 1～5 分再提交。')
      return
    }
    if (content.length > 500) {
      say(apptStatus, '评价内容最多 500 字。')
      return
    }
    setBusy(true)
    say(apptStatus, '正在提交评价…')
    var request = live
      ? api.post('/appointments/' + Number(id) + '/review', { rating: rating, content: content || null })
      : Promise.resolve()
    request
      .then(function () {
        appointments = appointments.map(function (record) {
          return Number(record.id) === Number(id) ? Object.assign({}, record, { reviewed: true }) : record
        })
        if (!live) persist()
        clearEditors()
        drawAppointments()
        say(apptStatus, '评价已提交，谢谢你愿意说这些。')
      })
      .catch(function (error) {
        say(apptStatus, ((error && error.message) || '评价没提交上。') + ' 再试一次。')
      })
      .then(function () {
        setBusy(false)
        if (apptStatus && apptStatus.focus) apptStatus.focus()
      })
  }

  /* ---------- 事件 ---------- */

  list.addEventListener('click', function (event) {
    var button = event.target.closest('button')
    if (!button) return
    var row = button.closest('[data-order]')
    var orderNo = row ? row.getAttribute('data-order') : ''
    if (button.hasAttribute('data-dismiss')) {
      clearEditors()
      return
    }
    if (button.hasAttribute('data-pay')) openPay(orderNo, button)
    if (button.hasAttribute('data-confirm-pay')) pay(orderNo)
  })

  apptList.addEventListener('click', function (event) {
    var button = event.target.closest('button')
    if (!button) return
    if (button.hasAttribute('data-dismiss')) {
      clearEditors()
      return
    }
    if (button.hasAttribute('data-open-cancel')) openCancel(button.getAttribute('data-open-cancel'))
    if (button.hasAttribute('data-confirm-cancel')) cancelAppointment(button.getAttribute('data-confirm-cancel'))
    if (button.hasAttribute('data-open-review')) openReview(button.getAttribute('data-open-review'))
  })

  apptList.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-review]')
    if (!form) return
    event.preventDefault()
    sendReview(form, form.getAttribute('data-review'))
  })

  if (filters) {
    filters.addEventListener('click', function (event) {
      var button = event.target.closest('[data-order-filter]')
      if (!button || busy) return
      filter = button.getAttribute('data-order-filter')
      Array.prototype.forEach.call(filters.querySelectorAll('[data-order-filter]'), function (item) {
        var current = item === button
        item.classList.toggle('is-current', current)
        item.setAttribute('aria-pressed', current ? 'true' : 'false')
      })
      drawOrders()
      say(status, '订单已按「' + button.textContent.trim() + '」筛选。')
    })
  }

  if (refresh) {
    refresh.addEventListener('click', function () {
      if (busy) return
      if (live) {
        loadLive(true)
      } else {
        loadDemo()
        drawOrders()
        drawAppointments()
        say(status, '订单已刷新。')
      }
    })
  }

  if (demoNote) {
    demoNote.addEventListener('click', function (event) {
      if (!event.target.closest('[data-reset]')) return
      try {
        window.sessionStorage.removeItem(KEY)
      } catch (error) {
        /* ignore */
      }
      loadDemo()
      drawOrders()
      drawAppointments()
      say(status, '演示数据已重置。')
    })
  }

  /* ---------- 起手 ---------- */

  function loadLive(announce) {
    setBusy(true)
    say(status, '正在读取订单…')
    say(apptStatus, '正在读取预约…')
    return Promise.all([
      api.get('/orders?page=1&pageSize=50'),
      api.get('/appointments/mine?page=1&pageSize=50'),
      api.get('/wallet').catch(function () {
        return null
      }),
    ])
      .then(function (result) {
        orders = (result[0] && result[0].items) || []
        appointments = (result[1] && result[1].items) || []
        if (result[2] && typeof result[2].balanceInCents === 'number') {
          balanceInCents = result[2].balanceInCents
        }
        drawOrders()
        drawAppointments()
        var total = Number((result[0] && result[0].pagination && result[0].pagination.totalItems) || orders.length)
        say(status, announce ? '订单已刷新。' : total > orders.length ? '只显示最近 ' + orders.length + ' 笔订单。' : '订单已更新。')
        say(apptStatus, '预约已更新。')
      })
      .catch(function (error) {
        say(status, ((error && error.message) || '订单没读出来。') + ' 点「刷新订单」再试一次。')
        list.innerHTML = '<p class="panel__note">读取失败。点上面的「刷新订单」再试一次。</p>'
        apptList.innerHTML = ''
      })
      .then(function () {
        setBusy(false)
      })
  }

  if (live) {
    loadLive(false)
  } else {
    loadDemo()
    drawOrders()
    drawAppointments()
    say(status, '正在看的是设计示例。')
    say(apptStatus, '正在看的是设计示例。')
  }
  startTicker()
})()
