/* 管理工作台 · 危机跟进（后端 `/admin/crisis-flags`）。

   接后端：`GET  /admin/crisis-flags?status=&page=&pageSize=` → { items, pagination }
           `POST /admin/crisis-flags/{id}/assign`（接管，无请求体）
           `POST /admin/crisis-flags/{id}/follow-up` { note }
           `POST /admin/crisis-flags/{id}/resolve`   { note }
   后端回的字段：{ user:{nickname,phone(掩码)}, source, level, content, status,
                  assignedAdminName, createdAt, resolvedAt }
   没有后端：页面里写好的三条示例，动作在行内生效。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live
  var PAGE_SIZE = 20

  var STATUS = { OPEN: ['待接管', 'chip--yellow'], FOLLOWING: ['跟进中', ''], RESOLVED: ['已结案', 'chip--green'] }
  var LEVEL = { HIGH: ['高风险', 'chip--lilac'], MEDIUM: ['中风险', 'chip--yellow'], LOW: ['低风险', ''] }
  var SOURCE = {
    AI_CONVERSATION: 'AI 对话',
    JOURNAL: '情绪日记',
    COMMUNITY_POST: '社群发帖',
    SELF_COACHING: '自我教练',
  }

  var rows = document.querySelector('[data-rows]')
  var statusLine = document.querySelector('[data-status]')
  var countCell = document.querySelector('[data-count]')
  var pagerCount = document.querySelector('[data-pager-count]')
  var prev = document.querySelector('[data-prev]')
  var next = document.querySelector('[data-next]')
  var apply = document.querySelector('[data-apply]')
  var reset = document.querySelector('[data-reset]')
  var statusSelect = document.querySelector('select[name="status"]')
  if (!rows) return

  var items = []
  var page = 1
  var pages = 1
  var busy = false

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function chip(pair) {
    return '<span class="chip ' + pair[1] + '">' + api.esc(pair[0]) + '</span>'
  }

  function row(flag) {
    var status = STATUS[flag.status] || [flag.status, '']
    var level = LEVEL[flag.level] || [flag.level || '待评估', '']
    var source = SOURCE[flag.source] || flag.source || '—'
    var actions = ''
    if (flag.status === 'OPEN') {
      actions = '<button class="act" type="button" data-assign="' + Number(flag.id) + '">接管</button>'
    } else if (flag.status === 'FOLLOWING') {
      actions =
        '<button class="act" type="button" data-follow="' + Number(flag.id) + '">跟进记录</button>' +
        '<button class="act act--warn" type="button" data-resolve="' + Number(flag.id) + '">结案</button>'
    } else {
      actions = '<button class="act" type="button" disabled title="已经结案">结案</button>'
    }
    return (
      '<tr data-crisis="' + Number(flag.id) + '">' +
      '<td>' + api.esc((flag.user && flag.user.nickname) || '') +
      ' <span class="tnum">' + api.esc((flag.user && flag.user.phone) || '') + '</span></td>' +
      '<td>' + chip(level) + '</td>' +
      '<td>' + api.esc(source) + '</td>' +
      '<td class="crisis-say">' + api.esc(flag.content || '') + '</td>' +
      '<td>' + chip(status) + '</td>' +
      '<td>' + api.esc(flag.assignedAdminName || '—') + '</td>' +
      '<td class="tnum">' + api.esc(api.dateTime(flag.createdAt)) + '</td>' +
      '<td>' + actions + '</td>' +
      '</tr>'
    )
  }

  function draw() {
    rows.innerHTML = items.length
      ? items.map(row).join('')
      : '<tr><td colspan="8">' + (api.empty ? api.empty('队列是空的', '没有待处理的预警。') : '没有待处理的预警。') + '</td></tr>'
    if (countCell) countCell.textContent = '共 ' + items.length + ' 条'
    if (pagerCount) pagerCount.textContent = '第 ' + page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 条'
    if (prev) prev.disabled = busy || page <= 1
    if (next) next.disabled = busy || page >= pages
  }

  function find(id) {
    return items.filter(function (flag) {
      return Number(flag.id) === Number(id)
    })[0]
  }

  /* 跟进 / 结案都要写一句：写在行内，提交前不落库 */
  function openNote(id, kind) {
    var flag = find(id)
    var rowNode = rows.querySelector('[data-crisis="' + Number(id) + '"]')
    if (!flag || !rowNode || busy) return
    closeEditor()
    var label = kind === 'resolve' ? '结案说明' : '这次跟进做了什么'
    var editRow = document.createElement('tr')
    editRow.className = 'rowedit'
    editRow.setAttribute('data-editor-for', String(Number(id)))
    editRow.innerHTML =
      '<td colspan="8">' +
      '<form data-note-form="' + Number(id) + '" data-note-kind="' + kind + '">' +
      '<label class="field__label" for="note-' + Number(id) + '">' + label + '（会写进审计日志）</label>' +
      '<input class="input" id="note-' + Number(id) + '" name="note" maxlength="500" placeholder="例如：已电话联系，情绪平稳，约好明天再确认" />' +
      '<div class="rowedit__acts">' +
      '<button class="act' + (kind === 'resolve' ? ' act--warn' : '') + '" type="submit">' +
      (kind === 'resolve' ? '确认结案' : '保存跟进') +
      '</button>' +
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

  function act(id, kind, note) {
    if (busy) return
    busy = true
    say(kind === 'assign' ? '正在接管…' : kind === 'resolve' ? '正在结案…' : '正在保存跟进…')
    var path = '/admin/crisis-flags/' + Number(id) + '/' + (kind === 'assign' ? 'assign' : kind === 'resolve' ? 'resolve' : 'follow-up')
    var request = live ? api.post(path, kind === 'assign' ? undefined : { note: note }) : Promise.resolve()
    request
      .then(function () {
        items = items.map(function (flag) {
          if (Number(flag.id) !== Number(id)) return flag
          if (kind === 'assign') return Object.assign({}, flag, { status: 'FOLLOWING', assignedAdminName: flag.assignedAdminName || '你' })
          if (kind === 'resolve') return Object.assign({}, flag, { status: 'RESOLVED', resolvedAt: new Date().toISOString() })
          return Object.assign({}, flag, { status: 'FOLLOWING' })
        })
        draw()
        say(kind === 'assign' ? '已接管，继续跟进。' : kind === 'resolve' ? '已结案，说明进了日志。' : '跟进已记录。')
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

  function load() {
    if (!live) {
      draw()
      say('设计演示：这三条是示例预警，接管 / 跟进 / 结案会在页内生效。')
      return
    }
    busy = true
    say('正在读取队列…')
    var query = '/admin/crisis-flags?page=' + page + '&pageSize=' + PAGE_SIZE
    if (statusSelect && statusSelect.value) query += '&status=' + encodeURIComponent(statusSelect.value)
    api
      .get(query)
      .then(function (data) {
        items = (data && data.items) || []
        pages = Math.max(1, Number((data && data.pagination && data.pagination.totalPages)) || 1)
        draw()
        say('队列已更新。')
      })
      .catch(function (error) {
        say((error && error.message) || '队列没读出来。')
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
    var assign = event.target.closest('[data-assign]')
    if (assign) {
      act(assign.getAttribute('data-assign'), 'assign')
      return
    }
    var follow = event.target.closest('[data-follow]')
    if (follow) {
      openNote(follow.getAttribute('data-follow'), 'follow')
      return
    }
    var resolve = event.target.closest('[data-resolve]')
    if (resolve) openNote(resolve.getAttribute('data-resolve'), 'resolve')
  })

  rows.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-note-form]')
    if (!form) return
    event.preventDefault()
    var note = form.elements.note.value.trim()
    if (note.length < 2) {
      say('留一句说明再提交 —— 结案与跟进都要写清做了什么。')
      form.elements.note.focus()
      return
    }
    act(form.getAttribute('data-note-form'), form.getAttribute('data-note-kind'), note)
  })

  if (apply) apply.addEventListener('click', function () { page = 1; load() })
  if (reset) {
    reset.addEventListener('click', function () {
      if (statusSelect) statusSelect.value = ''
      page = 1
      load()
    })
  }
  if (prev) prev.addEventListener('click', function () { if (page > 1) { page -= 1; load() } })
  if (next) next.addEventListener('click', function () { if (page < pages) { page += 1; load() } })

  if (!live) {
    items = [
      { id: 1, user: { nickname: '小满', phone: '139****0002' }, level: 'HIGH', source: 'AI_CONVERSATION', content: '「凌晨两点那一段」里提到不想活下去', status: 'OPEN', assignedAdminName: '', createdAt: '2026-10-12T02:07:00' },
      { id: 2, user: { nickname: '阿禾', phone: '138****6621' }, level: 'MEDIUM', source: 'JOURNAL', content: '连续三天写「撑不下去」', status: 'FOLLOWING', assignedAdminName: '管理员', createdAt: '2026-10-11T23:12:00' },
      { id: 3, user: { nickname: '苏木', phone: '137****3320' }, level: 'LOW', source: 'COMMUNITY_POST', content: '帖子里提到「不想再麻烦任何人」', status: 'RESOLVED', assignedAdminName: '管理员', createdAt: '2026-10-09T20:40:00', resolvedAt: '2026-10-10T09:15:00' },
    ]
  }
  load()
})()
