/* 教练工作台 · 客户与案例（原前端「客户列表」「案例记录」两栏）。

   接后端：
     · `GET   /coach/clients` → { items: [{ id, nickname, phone, lastAppointmentAt, remark }] }
       `PATCH /coach/clients/{id}` { remark }
     · `GET   /coach/cases?page=&pageSize=` → { items }
       `POST  /coach/cases` { clientNickname, content, durationMin }；`DELETE /coach/cases/{id}`
       `GET   /coach/cases/stats` → { totalCases, serviceMinutes, clientCount }
   没有后端：页面里写好的示例。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live

  var clientRows = document.querySelector('[data-clients]')
  var clientStatus = document.querySelector('[data-client-status]')
  var caseRows = document.querySelector('[data-cases]')
  var caseForm = document.querySelector('[data-case-form]')
  var caseError = document.querySelector('[data-case-error]')
  var caseStatus = document.querySelector('[data-case-status]')
  var statsList = document.querySelector('[data-stats]')
  var statStatus = document.querySelector('[data-stat-status]')
  var pager = document.querySelector('[data-pager]')
  var pagerCount = document.querySelector('[data-pager-count]')
  var prevButton = document.querySelector('[data-prev]')
  var nextButton = document.querySelector('[data-next]')
  if (!clientRows || !caseRows || !caseForm) return

  var clients = []
  var cases = []
  var busy = false
  var PAGE_SIZE = 20
  var query = new URLSearchParams(window.location.search)
  var state = { page: Math.max(1, Number(query.get('page')) || 1) }
  var pagination = {}
  var casesGeneration = 0

  function say(node, text) {
    if (node) node.textContent = text || ''
  }

  function fail(node, message) {
    if (!node) return
    node.textContent = message || ''
    node.hidden = !message
  }

  function drawClients() {
    clientRows.innerHTML = clients.length
      ? clients
          .map(function (client) {
            return (
              '<tr data-client="' + Number(client.id) + '">' +
              '<td>' + api.esc(client.nickname) + '</td>' +
              '<td class="tnum">' + api.esc(client.phone || '—') + '</td>' +
              '<td class="tnum">' + api.esc(client.lastAppointmentAt ? api.dateTime(client.lastAppointmentAt) : '—') + '</td>' +
              '<td class="crisis-say">' + api.esc(client.remark || '—') + '</td>' +
              '<td><button class="act" type="button" data-remark="' + Number(client.id) + '">' +
              (client.remark ? '改备注' : '写备注') + '</button></td>' +
              '</tr>'
            )
          })
          .join('')
      : '<tr><td colspan="5">' + (api.empty ? api.empty('还没有客户', '有人约过你之后，会出现在这里。') : '还没有客户。') + '</td></tr>'
  }

  function drawCases() {
    caseRows.innerHTML = cases.length
      ? cases
          .map(function (item) {
            return (
              '<tr data-case="' + Number(item.id) + '">' +
              '<td>' + api.esc(item.clientNickname || '—') + '</td>' +
              '<td class="tnum">' + (Number(item.durationMin) || 0) + ' 分钟</td>' +
              '<td class="crisis-say">' + api.esc(item.content || '') + '</td>' +
              '<td class="tnum">' + api.esc(api.dateTime(item.createdAt)) + '</td>' +
              '<td><button class="act act--warn" type="button" data-remove-case="' + Number(item.id) + '">删除</button></td>' +
              '</tr>'
            )
          })
          .join('')
      : '<tr><td colspan="5">' + (api.empty ? api.empty('还没有案例记录', '每次谈完记一条，回头看会有用。') : '还没有案例记录。') + '</td></tr>'
    if (pager) {
      pager.hidden = !live
      var total = Number(pagination.totalItems) || 0
      var pages = Math.max(1, Number(pagination.totalPages) || 1)
      pagerCount.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 条 · 共 ' + total + ' 条'
      prevButton.disabled = state.page <= 1
      nextButton.disabled = state.page >= pages
    }
  }

  function drawStats(stats) {
    if (!statsList) return
    statsList.innerHTML =
      '<li class="stat"><strong>' + (stats.totalCases || 0) + '</strong><span>条案例记录</span></li>' +
      '<li class="stat"><strong>' + Math.round(((stats.serviceMinutes || 0) / 60) * 10) / 10 + '</strong><span>累计服务小时</span></li>' +
      '<li class="stat"><strong>' + (stats.clientCount || 0) + '</strong><span>位客户</span></li>'
    if (statStatus) statStatus.textContent = api.dateTime(new Date().toISOString())
  }

  function syncUrl() {
    try {
      var params = new URLSearchParams()
      if (new URLSearchParams(window.location.search).has('live')) params.set('live', '1')
      if (state.page > 1) params.set('page', String(state.page))
      var search = params.toString()
      window.history.replaceState(null, '', 'coach-clients.html' + (search ? '?' + search : ''))
    } catch (error) {
      /* file:// 下不改地址栏 */
    }
  }

  function loadCases(page) {
    if (page !== undefined) state.page = page
    var generation = ++casesGeneration
    caseRows.innerHTML = '<tr aria-hidden="true"><td colspan="5"><span class="skl" style="--skl-w:68%"></span></td></tr>'
    return api
      .get('/coach/cases?page=' + state.page + '&pageSize=' + PAGE_SIZE)
      .then(function (data) {
        if (generation !== casesGeneration) return
        cases = (data && data.items) || []
        pagination = (data && data.pagination) || {}
        drawCases()
      })
      .catch(function (error) {
        if (generation !== casesGeneration) return
        cases = []
        pagination = {}
        caseRows.innerHTML =
          '<tr><td colspan="5">' + api.note((error && error.message) || '案例记录没读出来。', true) + '</td></tr>'
        say(caseStatus, '案例记录没有读取成功，可以刷新后重试。')
        if (pagerCount) pagerCount.textContent = '读取失败'
      })
  }

  function loadStats() {
    if (statsList) statsList.innerHTML = '<li class="stat"><strong>—</strong><span>正在读取案例统计…</span></li>'
    if (statStatus) statStatus.textContent = ''
    return api
      .get('/coach/cases/stats')
      .then(drawStats)
      .catch(function (error) {
        if (statsList) {
          statsList.innerHTML =
            '<li class="stat"><strong>—</strong><span>统计读取失败</span>' +
            '<button class="link-quiet" type="button" data-stat-retry>重试</button></li>'
          var retry = statsList.querySelector('[data-stat-retry]')
          if (retry) retry.addEventListener('click', loadStats)
        }
        if (statStatus) statStatus.textContent = (error && error.message) || '案例统计没有读取成功。'
      })
  }

  function closeEditor() {
    Array.prototype.forEach.call(document.querySelectorAll('.rowedit'), function (node) {
      node.parentNode.removeChild(node)
    })
  }

  function openRemark(id) {
    var client = clients.filter(function (item) {
      return Number(item.id) === Number(id)
    })[0]
    var rowNode = clientRows.querySelector('[data-client="' + Number(id) + '"]')
    if (!client || !rowNode || busy) return
    closeEditor()
    var editRow = document.createElement('tr')
    editRow.className = 'rowedit'
    editRow.innerHTML =
      '<td colspan="5"><form data-remark-form="' + Number(id) + '">' +
      '<label class="field__label" for="remark-' + Number(id) + '">我的备注</label>' +
      '<input class="input" id="remark-' + Number(id) + '" name="remark" maxlength="255" value="' +
      api.esc(client.remark || '') + '" placeholder="例如：考前焦虑，先从作息开始" />' +
      '<div class="rowedit__acts">' +
      '<button class="act" type="submit">保存备注</button>' +
      '<button class="act" type="button" data-close>取消</button>' +
      '</div></form></td>'
    rowNode.parentNode.insertBefore(editRow, rowNode.nextSibling)
    var input = editRow.querySelector('input')
    if (input) input.focus()
  }

  function saveRemark(id, remark) {
    if (busy) return
    busy = true
    var request = live ? api.patch('/coach/clients/' + Number(id), { remark: remark || null }) : Promise.resolve()
    request
      .then(function () {
        clients = clients.map(function (item) {
          return Number(item.id) === Number(id) ? Object.assign({}, item, { remark: remark }) : item
        })
        closeEditor()
        drawClients()
        say(clientStatus, '备注已保存（只有你自己看得到）。')
      })
      .catch(function (error) {
        say(clientStatus, (error && error.message) || '备注没保存上。')
      })
      .then(function () {
        busy = false
      })
  }

  function removeCase(id) {
    if (busy) return
    busy = true
    var request = live ? api.del('/coach/cases/' + Number(id)) : Promise.resolve()
    request
      .then(function () {
        say(caseStatus, '这条案例记录已删除。')
        return loadCases()
      })
      .catch(function (error) {
        say(caseStatus, (error && error.message) || '删除没成功。')
      })
      .then(function () {
        busy = false
      })
  }

  clientRows.addEventListener('click', function (event) {
    if (event.target.closest('[data-close]')) {
      closeEditor()
      return
    }
    var button = event.target.closest('[data-remark]')
    if (button) openRemark(button.getAttribute('data-remark'))
  })

  clientRows.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-remark-form]')
    if (!form) return
    event.preventDefault()
    saveRemark(form.getAttribute('data-remark-form'), form.elements.remark.value.trim())
  })

  caseRows.addEventListener('click', function (event) {
    var button = event.target.closest('[data-remove-case]')
    if (button) removeCase(button.getAttribute('data-remove-case'))
  })

  caseForm.addEventListener('submit', function (event) {
    event.preventDefault()
    fail(caseError, '')
    var clientNickname = caseForm.elements.clientNickname.value.trim()
    var durationMin = Number(caseForm.elements.durationMin.value)
    var content = caseForm.elements.content.value.trim()
    if (content.length < 4) {
      fail(caseError, '写清楚做了什么，至少 4 个字。')
      caseForm.elements.content.focus()
      return
    }
    if (!(durationMin >= 5 && durationMin <= 480)) {
      fail(caseError, '时长在 5–480 分钟之间。')
      return
    }
    if (busy) return
    busy = true
    var request = live
      ? api.post('/coach/cases', { clientNickname: clientNickname || null, content: content, durationMin: durationMin })
      : Promise.resolve({
          id: Date.now() % 10000,
          clientNickname: clientNickname || '未署名',
          content: content,
          durationMin: durationMin,
          createdAt: new Date().toISOString(),
        })
    request
      .then(function (item) {
        caseForm.reset()
        say(caseStatus, '记下了。')
        if (pagination.totalItems) pagination.totalItems += 1
        return loadCases(1)
      })
      .catch(function (error) {
        fail(caseError, (error && error.message) || '没记上，再试一次。')
      })
      .then(function () {
        busy = false
        if (caseStatus && caseStatus.focus) caseStatus.focus()
      })
  })

  if (!live) {
    clients = [
      { id: 1, nickname: '小满', phone: '139****0002', lastAppointmentAt: '2026-10-13T20:00:00', remark: '考前焦虑，先从作息开始。' },
      { id: 2, nickname: '阿禾', phone: '138****6621', lastAppointmentAt: '2026-10-14T10:00:00', remark: '' },
      { id: 3, nickname: '苏木', phone: '137****3320', lastAppointmentAt: '2026-10-08T19:00:00', remark: '和室友的关系；下次看有没有开口。' },
    ]
    cases = [
      { id: 1, clientNickname: '小满', durationMin: 50, content: '把「一想到考试就心跳快」拆成了三个具体场景，留了一个睡前放下手机的作业。', createdAt: '2026-10-08T20:05:00' },
      { id: 2, clientNickname: '苏木', durationMin: 50, content: '关系里的话没出口；练了一次开口的开场白。', createdAt: '2026-10-02T19:55:00' },
    ]
    drawClients()
    drawCases()
    say(caseStatus, '设计演示：客户与案例都是示例，备注与新增会在页内生效。')
  } else {
    clientRows.innerHTML = '<tr aria-hidden="true"><td colspan="5"><span class="skl" style="--skl-w:64%"></span></td></tr>'
    caseRows.innerHTML = '<tr aria-hidden="true"><td colspan="5"><span class="skl" style="--skl-w:64%"></span></td></tr>'
    if (statsList) statsList.innerHTML = '<li class="stat"><strong>—</strong><span>正在读取案例统计…</span></li>'
    api
      .get('/coach/clients')
      .then(function (data) {
        clients = (data && data.items) || []
        drawClients()
      })
      .catch(function (error) {
        clients = []
        clientRows.innerHTML =
          '<tr><td colspan="5">' + api.note((error && error.message) || '客户列表没读出来。', true) + '</td></tr>'
        say(clientStatus, (error && error.message) || '客户列表没读出来。')
      })
    loadCases()
    loadStats()
    if (prevButton) {
      prevButton.addEventListener('click', function () {
        if (state.page <= 1) return
        state.page -= 1
        syncUrl()
        loadCases()
      })
    }
    if (nextButton) {
      nextButton.addEventListener('click', function () {
        var pages = Math.max(1, Number(pagination.totalPages) || 1)
        if (state.page >= pages) return
        state.page += 1
        syncUrl()
        loadCases()
      })
    }
    syncUrl()
  }
})()
