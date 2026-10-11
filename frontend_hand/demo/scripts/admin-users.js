/* 用户模块：真数据来自 `/admin/users`，停用 / 恢复走 `PATCH /admin/users/{id}/status`。

   三件小事按操作面的规矩来：
   · 过滤器写回地址栏（`?keyword=&role=&status=&page=`），刷新、后退、把链接发给另一个管理员，
     都还停在同一屏；
   · 停用是破坏性动作，就地确认（这一格变成「确定 / 取消」），不为了一个是非题弹一整个对话框；
   · 正在读数据的时候表格保持自己的行高（骨架行），不是页面中间转一个圈。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  var kit = window.AdminKit
  if (!api || !api.live || !kit) return

  var PAGE_SIZE = 20
  var COLUMNS = 7

  var rowsBox = document.querySelector('[data-rows]')
  var countBox = document.querySelector('[data-count]')
  var pagerBox = document.querySelector('[data-pager-count]')
  var prevButton = document.querySelector('[data-prev]')
  var nextButton = document.querySelector('[data-next]')
  var applyButton = document.querySelector('[data-apply]')
  var resetButton = document.querySelector('[data-reset]')
  var keywordInput = document.querySelector('.filters [name="keyword"]')
  var roleSelect = document.querySelector('.filters [name="role"]')
  var statusSelect = document.querySelector('.filters [name="status"]')

  var query = new URLSearchParams(window.location.search)
  var state = {
    page: Math.max(1, Number(query.get('page')) || 1),
    keyword: query.get('keyword') || '',
    role: query.get('role') || '',
    status: query.get('status') || '',
  }
  var items = []
  var selfId = null

  function syncUrl() {
    try {
      var params = new URLSearchParams()
      if (state.keyword) params.set('keyword', state.keyword)
      if (state.role) params.set('role', state.role)
      if (state.status) params.set('status', state.status)
      if (state.page > 1) params.set('page', String(state.page))
      var search = params.toString()
      window.history.replaceState(null, '', 'admin-users.html' + (search ? '?' + search : ''))
    } catch (error) {
      /* file:// 下不允许改地址栏，跳过就好 */
    }
  }

  /* ---- 一行 ---- */

  function isSelf(user) {
    return selfId !== null && Number(user.id) === selfId
  }

  function actionHtml(user) {
    return (
      '<button class="act' +
      (user.isDisabled ? '' : ' act--warn') +
      '" type="button" data-act="' +
      user.id +
      '"' +
      (isSelf(user) ? ' disabled title="不能修改自己的账号状态"' : '') +
      '>' +
      (user.isDisabled ? '恢复使用' : '停用') +
      '</button>'
    )
  }

  function rowHtml(user) {
    return (
      '<tr data-id="' +
      user.id +
      '">' +
      '<td>' +
      kit.esc(user.nickname || '（还没有昵称）') +
      (isSelf(user) ? ' <span class="chip">你自己</span>' : '') +
      '</td>' +
      '<td class="tnum">' +
      kit.esc(user.phone || '—') +
      '</td>' +
      '<td>' +
      kit.esc(kit.roleLabel(user.role)) +
      '</td>' +
      '<td>' +
      kit.userChip(user.isDisabled) +
      '</td>' +
      '<td class="tnum">' +
      kit.when(user.createdAt) +
      '</td>' +
      '<td class="tnum">' +
      kit.when(user.lastLoginAt) +
      '</td>' +
      '<td data-cell>' +
      actionHtml(user) +
      '</td>' +
      '</tr>'
    )
  }

  function draw(list, pagination) {
    items = list
    rowsBox.innerHTML = items.length
      ? items.map(rowHtml).join('')
      : kit.emptyRow(COLUMNS, '这组条件下没有用户', '换个关键词，或者把角色 / 状态恢复成「全部」。')

    var total = Number(pagination.totalItems) || 0
    var pages = Math.max(1, Number(pagination.totalPages) || 1)
    countBox.textContent = '共 ' + total + ' 位'
    pagerBox.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 位'
    prevButton.disabled = state.page <= 1
    nextButton.disabled = state.page >= pages
  }

  /* ---- 取数 ---- */

  function path() {
    return (
      '/admin/users?page=' +
      state.page +
      '&pageSize=' +
      PAGE_SIZE +
      (state.keyword ? '&keyword=' + encodeURIComponent(state.keyword) : '') +
      (state.role ? '&role=' + state.role : '') +
      (state.status ? '&status=' + state.status : '')
    )
  }

  function load() {
    rowsBox.innerHTML = kit.skeleton(COLUMNS, 3)
    countBox.textContent = '读取中…'
    pagerBox.textContent = ''
    prevButton.disabled = true
    nextButton.disabled = true

    return api
      .get(path())
      .then(function (data) {
        draw((data && data.items) || [], (data && data.pagination) || {})
      })
      .catch(function (error) {
        if (kit.bounce(error)) return
        items = []
        rowsBox.innerHTML = '<tr><td colspan="' + COLUMNS + '">' + kit.note(error.message, true) + '</td></tr>'
        countBox.textContent = '读取失败'
      })
  }

  /* ---- 停用 / 恢复：就地确认，就地上报 ---- */

  function cellOf(node) {
    return node.closest('td[data-cell]')
  }

  function userOf(node) {
    var row = node.closest('tr')
    var id = row ? Number(row.getAttribute('data-id')) : 0
    for (var index = 0; index < items.length; index++) {
      if (Number(items[index].id) === id) return items[index]
    }
    return null
  }

  function ask(button) {
    var user = userOf(button)
    var cell = cellOf(button)
    if (!user || !cell) return
    var off = !user.isDisabled
    cell.innerHTML =
      '<span class="confirm">' +
      '<span class="confirm__ask">' +
      (off ? '停用这个账号？' : '恢复这个账号？') +
      '</span>' +
      '<button class="act' +
      (off ? ' act--warn' : '') +
      '" type="button" data-yes>确定</button>' +
      '<button class="act" type="button" data-no>取消</button></span>'
    cell.querySelector('[data-no]').focus()
  }

  function commit(button) {
    var cell = cellOf(button)
    var user = userOf(button)
    if (!cell || !user) return
    var next = user.isDisabled ? 'ENABLED' : 'DISABLED'
    button.disabled = true
    button.textContent = '处理中…'

    api
      .patch('/admin/users/' + user.id + '/status', { status: next })
      .then(function () {
        user.isDisabled = next === 'DISABLED'
        var row = cell.closest('tr')
        var holder = document.createElement('tbody')
        holder.innerHTML = rowHtml(user)
        row.parentNode.replaceChild(holder.firstElementChild, row)
      })
      .catch(function (error) {
        if (kit.bounce(error)) return
        /* 失败就把按钮放回去，并把原因写在它旁边 —— 后端那句「不能修改自己的账号状态」就是原因 */
        cell.innerHTML = actionHtml(user) + ' ' + kit.note(error.message, true)
      })
  }

  rowsBox.addEventListener('click', function (event) {
    if (event.target.closest('[data-no]')) {
      var user = userOf(event.target)
      var cell = cellOf(event.target)
      if (user && cell) cell.innerHTML = actionHtml(user)
      return
    }
    var yes = event.target.closest('[data-yes]')
    if (yes) {
      commit(yes)
      return
    }
    var button = event.target.closest('[data-act]')
    if (button && !button.disabled) ask(button)
  })

  /* ---- 过滤与翻页 ---- */

  function apply() {
    state.keyword = keywordInput.value.trim()
    state.role = roleSelect.value
    state.status = statusSelect.value
    state.page = 1
    syncUrl()
    load()
  }

  applyButton.addEventListener('click', apply)
  keywordInput.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    apply()
  })
  resetButton.addEventListener('click', function () {
    keywordInput.value = ''
    roleSelect.value = ''
    statusSelect.value = ''
    apply()
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

  /* 先把当前管理员的 id 拿到：可以标出「你自己」那一行，也先把那一行的开关禁用掉
     （后端也会 409 挡住，但让人在点之前就看见原因更好） */
  keywordInput.value = state.keyword
  roleSelect.value = state.role
  statusSelect.value = state.status
  api
    .get('/users/me')
    .then(function (me) {
      selfId = me && me.id !== undefined ? Number(me.id) : null
    })
    .catch(function () {
      /* 拿不到就不标「你自己」，后端那道 409 还在 */
    })
    .then(load)
})()
