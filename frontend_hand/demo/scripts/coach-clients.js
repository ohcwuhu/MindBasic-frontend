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
  if (!clientRows || !caseRows || !caseForm) return

  var clients = []
  var cases = []
  var busy = false

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
  }

  function drawStats(stats) {
    if (!statsList) return
    statsList.innerHTML =
      '<li class="stat"><strong>' + (stats.totalCases || 0) + '</strong><span>条案例记录</span></li>' +
      '<li class="stat"><strong>' + Math.round(((stats.serviceMinutes || 0) / 60) * 10) / 10 + '</strong><span>累计服务小时</span></li>' +
      '<li class="stat"><strong>' + (stats.clientCount || 0) + '</strong><span>位客户</span></li>'
    if (statStatus) statStatus.textContent = api.dateTime(new Date().toISOString())
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
        cases = cases.filter(function (item) {
          return Number(item.id) !== Number(id)
        })
        drawCases()
        say(caseStatus, '这条案例记录已删除。')
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
        cases = [item].concat(cases)
        caseForm.reset()
        drawCases()
        say(caseStatus, '记下了。')
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
    api
      .get('/coach/clients')
      .then(function (data) {
        clients = (data && data.items) || []
        drawClients()
      })
      .catch(function (error) {
        say(clientStatus, (error && error.message) || '客户列表没读出来。')
      })
    api
      .get('/coach/cases?page=1&pageSize=50')
      .then(function (data) {
        cases = (data && data.items) || []
        drawCases()
      })
      .catch(function (error) {
        say(caseStatus, (error && error.message) || '案例记录没读出来。')
      })
    api
      .get('/coach/cases/stats')
      .then(drawStats)
      .catch(function () {
        /* 读不到就留着页面里的示例数字 */
      })
  }
})()
