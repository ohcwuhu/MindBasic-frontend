/* 钱包：余额 `GET /wallet`，流水 `GET /wallet/transactions`，充值 `POST /wallet/topup`。

   后端的充值这一版是**模拟充值**（`wallet.py` 里写明「直接到账余额，后续接真支付后改为创建
   充值单」），所以页面上照实说，不假装走了支付渠道。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  if (!api.live) {
    demoWallet()
    return
  }

  /* 静态演示（直接双击打开这个 .html）：页面里那份示例流水照旧，这一小段只把「余额」和
     充值接上 —— 用的是订单页同一个本地演示账本（sessionStorage），
     所以从订单点过来的「去钱包充值」不是一条死路。 */
  function demoWallet() {
    var KEY = 'feisi_demo_flow'
    var balanceBox = document.querySelector('[data-balance]')
    var balanceNote = document.querySelector('[data-balance-note]')
    var topupNote = document.querySelector('[data-topup-note]')
    var topupButton = document.querySelector('[data-topup]')
    var amountInput = document.querySelector('#amount')
    var pagerCount = document.querySelector('[data-pager-count]')
    if (!balanceBox) return

    function read() {
      try {
        return JSON.parse(window.sessionStorage.getItem(KEY) || 'null')
      } catch (error) {
        return null
      }
    }

    function write(store) {
      try {
        window.sessionStorage.setItem(KEY, JSON.stringify(store))
      } catch (error) {
        /* 存不进去也不影响这一屏 */
      }
    }

    var store = read()
    balanceBox.textContent = api.money((store && store.balanceInCents) || 0)
    if (balanceNote) {
      balanceNote.textContent = store
        ? '设计演示的本地余额 · 更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false })
        : '设计演示：还没有本地余额，先去「我的订单」走一遍预约。'
    }
    if (pagerCount) pagerCount.textContent = '设计演示：下面是示例流水'
    Array.prototype.forEach.call(document.querySelectorAll('[data-prev], [data-next]'), function (button) {
      button.disabled = true
    })

    function topup(yuan) {
      var cents = Math.round(Number(yuan) * 100)
      if (!isFinite(cents) || cents < 100) {
        if (topupNote) topupNote.innerHTML = api.note('单次最少充 1 元。', true)
        if (amountInput) amountInput.focus()
        return
      }
      var next = read() || { seeded: true, examples: true, orders: [], appointments: [], balanceInCents: 0 }
      next.balanceInCents = Number(next.balanceInCents || 0) + cents
      write(next)
      balanceBox.textContent = api.money(next.balanceInCents)
      if (topupNote) {
        topupNote.innerHTML =
          '已到账 ' + api.money(cents) + ' —— 设计演示里的本地余额，不经过任何支付渠道。'
      }
      if (amountInput) amountInput.value = ''
    }

    if (topupButton) {
      topupButton.addEventListener('click', function () {
        topup(amountInput ? amountInput.value : '')
      })
    }
    if (amountInput) {
      amountInput.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return
        event.preventDefault()
        topup(amountInput.value)
      })
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-amount]'), function (button) {
      button.addEventListener('click', function () {
        topup(Number(button.getAttribute('data-amount')) / 100)
      })
    })
  }

  var PAGE_SIZE = 20
  var KINDS = {
    TOPUP: ['充值', 'chip--green'],
    APPOINTMENT_PAY: ['支付预约', ''],
    REFUND: ['退款', 'chip--lilac'],
    ADMIN_GRANT: ['平台赠送', 'chip--yellow'],
  }

  var balanceBox = document.querySelector('[data-balance]')
  var balanceNote = document.querySelector('[data-balance-note]')
  var topupNote = document.querySelector('[data-topup-note]')
  var topupButton = document.querySelector('[data-topup]')
  var amountInput = document.querySelector('#amount')
  var quickButtons = document.querySelectorAll('[data-amount]')
  var rows = document.querySelector('[data-transactions]')
  var pagerCount = document.querySelector('[data-pager-count]')
  var prevButton = document.querySelector('[data-prev]')
  var nextButton = document.querySelector('[data-next]')

  var query = new URLSearchParams(window.location.search)
  var state = { page: Math.max(1, Number(query.get('page')) || 1) }
  var lastPagination = {}

  function syncUrl() {
    try {
      window.history.replaceState(null, '', 'wallet.html' + (state.page > 1 ? '?page=' + state.page : ''))
    } catch (error) {
      /* file:// 下不允许改地址栏 */
    }
  }

  function kind(type) {
    var pair = KINDS[type] || [type || '其他', '']
    return '<span class="chip ' + pair[1] + '">' + api.esc(pair[0]) + '</span>'
  }

  function row(tx) {
    var change = Number(tx.changeInCents) || 0
    return (
      '<tr>' +
      '<td class="tnum">' +
      api.esc(api.dateTime(tx.createdAt)) +
      '</td>' +
      '<td>' +
      kind(tx.bizType) +
      '</td>' +
      '<td>' +
      api.esc(tx.note || '—') +
      '</td>' +
      '<td class="is-num' +
      (change < 0 ? ' is-out' : '') +
      '">' +
      (change > 0 ? '+' : '') +
      api.money(change) +
      '</td>' +
      '<td class="is-num">' +
      api.money(tx.balanceAfter) +
      '</td>' +
      '</tr>'
    )
  }

  function drawBalance(cents) {
    balanceBox.textContent = api.money(cents)
  }

  function loadBalance() {
    return api
      .get('/wallet')
      .then(function (data) {
        drawBalance((data && data.balanceInCents) || 0)
        balanceNote.textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false })
      })
      .catch(function (error) {
        balanceBox.textContent = '—'
        balanceNote.textContent = error.message
      })
  }

  function loadTransactions() {
    rows.innerHTML =
      '<tr aria-hidden="true"><td colspan="5"><span class="skl" style="--skl-w:64%"></span></td></tr>' +
      '<tr aria-hidden="true"><td colspan="5"><span class="skl" style="--skl-w:48%"></span></td></tr>'
    pagerCount.textContent = ''
    prevButton.disabled = true
    nextButton.disabled = true

    return api
      .get('/wallet/transactions?page=' + state.page + '&pageSize=' + PAGE_SIZE)
      .then(function (data) {
        var items = (data && data.items) || []
        lastPagination = (data && data.pagination) || {}
        rows.innerHTML = items.length
          ? items.map(row).join('')
          : '<tr><td colspan="5">' + api.empty('还没有流水', '充值或用余额支付一次之后，这里就有记录。') + '</td></tr>'

        var total = Number(lastPagination.totalItems) || 0
        var pages = Math.max(1, Number(lastPagination.totalPages) || 1)
        pagerCount.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 笔 · 共 ' + total + ' 笔'
        prevButton.disabled = state.page <= 1
        nextButton.disabled = state.page >= pages
      })
      .catch(function (error) {
        rows.innerHTML = '<tr><td colspan="5">' + api.note(error.message, true) + '</td></tr>'
        pagerCount.textContent = '读取失败'
      })
  }

  /* 充值：元 → 分，最少 1 元（后端也是 >= 100 分） */
  function topup(yuan) {
    var cents = Math.round(Number(yuan) * 100)
    if (!isFinite(cents) || cents < 100) {
      topupNote.innerHTML = api.note('单次最少充 1 元。', true)
      amountInput.focus()
      return
    }
    topupButton.disabled = true
    topupButton.textContent = '充值中…'
    api
      .post('/wallet/topup', { amountInCents: cents })
      .then(function (data) {
        drawBalance((data && data.balanceInCents) || 0)
        topupNote.innerHTML =
          '已到账 ' + api.money(cents) + ' —— 这一版是<strong>模拟充值</strong>，不经过支付渠道。'
        amountInput.value = ''
        state.page = 1
        syncUrl()
        return loadTransactions()
      })
      .catch(function (error) {
        topupNote.innerHTML = api.note(error.message, true)
      })
      .then(function () {
        topupButton.disabled = false
        topupButton.textContent = '充值'
      })
  }

  topupButton.addEventListener('click', function () {
    topup(amountInput.value)
  })

  amountInput.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    topup(amountInput.value)
  })

  Array.prototype.forEach.call(quickButtons, function (button) {
    button.addEventListener('click', function () {
      topup(Number(button.getAttribute('data-amount')) / 100)
    })
  })

  prevButton.addEventListener('click', function () {
    if (state.page <= 1) return
    state.page -= 1
    syncUrl()
    loadTransactions()
  })

  nextButton.addEventListener('click', function () {
    state.page += 1
    syncUrl()
    loadTransactions()
  })

  syncUrl()
  loadBalance()
  loadTransactions()
})()
