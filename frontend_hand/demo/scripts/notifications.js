/* 站内通知：列表 `/notifications`，标已读 `POST /notifications/{id}/read`，
   全部已读 `POST /notifications/read-all`。

   有两种读法：「全部」和「只看未读」（服务端有 `unreadOnly`，交给它筛）。标完已读顺手
   把页头那枚未读角标也叫新一下（`window.FeisiNav.refreshUnread`，由 session-nav.js 提供）。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var PAGE_SIZE = 20
  var KINDS = {
    APPOINTMENT: ['预约', 'chip--green'],
    AUDIT: ['审核', 'chip--yellow'],
    CHAT: ['消息', 'chip--lilac'],
    SYSTEM: ['系统', ''],
  }

  var list = document.querySelector('[data-list]')
  var count = document.querySelector('[data-count]')
  var pagerCount = document.querySelector('[data-pager-count]')
  var prevButton = document.querySelector('[data-prev]')
  var nextButton = document.querySelector('[data-next]')
  var readAllButton = document.querySelector('[data-read-all]')
  var keys = document.querySelector('.filters .keys')

  var query = new URLSearchParams(window.location.search)
  var state = {
    page: Math.max(1, Number(query.get('page')) || 1),
    only: query.get('only') === '1',
  }
  var items = []
  var lastPagination = {}

  function syncUrl() {
    try {
      var params = new URLSearchParams()
      if (state.only) params.set('only', '1')
      if (state.page > 1) params.set('page', String(state.page))
      var search = params.toString()
      window.history.replaceState(null, '', 'notifications.html' + (search ? '?' + search : ''))
    } catch (error) {
      /* file:// 下不允许改地址栏 */
    }
  }

  function kind(type) {
    var pair = KINDS[type] || [type || '通知', '']
    return '<span class="chip ' + pair[1] + '">' + api.esc(pair[0]) + '</span>'
  }

  function item(item) {
    var read = Boolean(item.isRead)
    return (
      '<li class="noti' +
      (read ? ' is-read' : '') +
      '" data-id="' +
      item.id +
      '">' +
      '<span class="noti__dot" aria-hidden="true"></span>' +
      '<div>' +
      '<p class="noti__title">' +
      api.esc(item.title || '通知') +
      kind(item.type) +
      '</p>' +
      '<p class="noti__body">' +
      api.esc(item.content || '') +
      '</p>' +
      '<p class="noti__time">' +
      api.esc(api.dateTime(item.createdAt)) +
      '</p>' +
      '</div>' +
      (read ? '<span></span>' : '<button class="act" type="button" data-read>标记已读</button>') +
      '</li>'
    )
  }

  function draw(list2, pagination) {
    items = list2
    lastPagination = pagination || lastPagination
    list.innerHTML = items.length
      ? items.map(item).join('')
      : state.only
        ? api.emptyItem('没有未读的通知', '都读完了。切到「全部」还能翻旧消息。')
        : api.emptyItem('还没有收到通知', '预约被确认、审核有结果的时候，这里会亮起来。')
    updateMeta()
  }

  function entryOf(id) {
    for (var index = 0; index < items.length; index++) {
      if (String(items[index].id) === String(id)) return items[index]
    }
    return null
  }

  /* 条数、页码、几个按钮的可用状态都从这里出来：就地改一条之后也要能把这一行重算一遍 */
  function updateMeta() {
    var total = Number(lastPagination.totalItems) || 0
    var pages = Math.max(1, Number(lastPagination.totalPages) || 1)
    var unread = items.filter(function (entry) {
      return !entry.isRead
    }).length
    count.textContent = state.only ? '共 ' + total + ' 条未读' : '共 ' + total + ' 条 · 本页 ' + unread + ' 条未读'
    pagerCount.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 条'
    prevButton.disabled = state.page <= 1
    nextButton.disabled = state.page >= pages
    readAllButton.disabled = unread === 0

    Array.prototype.forEach.call(keys.querySelectorAll('[data-only]'), function (key) {
      key.classList.toggle('is-current', (key.getAttribute('data-only') === '1') === state.only)
    })
  }

  function load() {
    list.innerHTML =
      '<li aria-hidden="true"><span class="skl" style="--skl-w:70%"></span></li>' +
      '<li aria-hidden="true"><span class="skl" style="--skl-w:52%"></span></li>'
    count.textContent = '读取中…'
    pagerCount.textContent = ''
    prevButton.disabled = true
    nextButton.disabled = true
    readAllButton.disabled = true

    return api
      .get('/notifications?page=' + state.page + '&pageSize=' + PAGE_SIZE + (state.only ? '&unreadOnly=true' : ''))
      .then(function (data) {
        var pagination = (data && data.pagination) || {}
        var pages = Math.max(1, Number(pagination.totalPages) || 1)
        /* 读掉几条之后原来那一页可能已经不存在了（第 2 / 1 页），先收回来再画 */
        if (state.page > pages && (Number(pagination.totalItems) || 0) > 0) {
          state.page = pages
          syncUrl()
          return load()
        }
        draw((data && data.items) || [], pagination)
      })
      .catch(function (error) {
        items = []
        list.innerHTML = '<li>' + api.note(error.message) + '</li>'
        count.textContent = '读取失败'
      })
  }

  /* 读一条：就地处理那一条，不重画整张表（重画会把焦点打回 body） */
  list.addEventListener('click', function (event) {
    var button = event.target.closest('[data-read]')
    if (!button) return
    var row = button.closest('[data-id]')
    var id = row ? row.getAttribute('data-id') : ''
    var entry = entryOf(id)
    button.disabled = true
    button.textContent = '处理中…'
    api
      .post('/notifications/' + id + '/read', {})
      .then(function () {
        if (entry) entry.isRead = true
        if (window.FeisiNav) window.FeisiNav.refreshUnread()
        if (state.only) {
          /* 「只看未读」里读掉的那条应该离开列表；焦点交给下一条，别掉回 body */
          var sibling = row.nextElementSibling
          var next = sibling && sibling.querySelector ? sibling.querySelector('[data-read]') : null
          row.parentNode.removeChild(row)
          items = items.filter(function (item2) {
            return String(item2.id) !== String(id)
          })
          if (!items.length) {
            load()
            return
          }
          lastPagination.totalItems = Math.max(0, (Number(lastPagination.totalItems) || 0) - 1)
          updateMeta()
          if (next) next.focus()
          else readAllButton.focus()
          return
        }
        /* 「全部」这一档：这一条就地变淡，按钮换成已读那一格里的空位 */
        row.classList.add('is-read')
        button.parentNode.replaceChild(document.createElement('span'), button)
        updateMeta()
      })
      .catch(function (error) {
        button.disabled = false
        button.textContent = '标记已读'
        var box = row && row.querySelector('.noti__time')
        /* 用「重写」而不是「追加」：连点两次不会堆两句一样的话 */
        if (box) box.innerHTML = api.esc(entry ? api.dateTime(entry.createdAt) : '') + ' ' + api.note(error.message, true)
      })
  })

  readAllButton.addEventListener('click', function () {
    readAllButton.disabled = true
    readAllButton.textContent = '处理中…'
    api
      .post('/notifications/read-all', {})
      .then(function () {
        if (window.FeisiNav) window.FeisiNav.refreshUnread()
        return load()
      })
      .catch(function (error) {
        count.textContent = error.message
      })
      .then(function () {
        readAllButton.textContent = '全部标为已读'
      })
  })

  keys.addEventListener('click', function (event) {
    var key = event.target.closest('[data-only]')
    if (!key) return
    state.only = key.getAttribute('data-only') === '1'
    state.page = 1
    syncUrl()
    load()
  })

  prevButton.addEventListener('click', function () {
    if (state.page <= 1) return
    state.page -= 1
    syncUrl()
    load()
  })

  nextButton.addEventListener('click', function () {
    state.page += 1
    syncUrl()
    load()
  })

  syncUrl()
  load()
})()
