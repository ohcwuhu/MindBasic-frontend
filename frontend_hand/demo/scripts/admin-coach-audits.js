/* 教练审核模块：`/admin/coach-audits` 的列表与详情，`approve` / `reject` 两个动作。

   审核是一份一份读的活，所以「查看」把那份申请摊在页面上（一块面板，不是弹窗）：真实姓名、
   从业年限、简介、受训与服务理念、擅长方向、证件链接、以及他报的服务项目与价格 —— 通过或驳回
   就在这份材料的下面决定，驳回必须写一句理由（后端也会校验）。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  var kit = window.AdminKit
  if (!api || !api.live || !kit) return

  var PAGE_SIZE = 10
  var COLUMNS = 6

  var detail = document.querySelector('[data-detail]')
  var detailBody = document.querySelector('[data-detail-body]')
  var rowsBox = document.querySelector('[data-rows]')
  var countBox = document.querySelector('[data-count]')
  var pagerBox = document.querySelector('[data-pager-count]')
  var prevButton = document.querySelector('[data-prev]')
  var nextButton = document.querySelector('[data-next]')
  var statusKeys = document.querySelector('.filters .keys')

  var query = new URLSearchParams(window.location.search)
  var statusParam = query.get('status')
  var state = {
    page: Math.max(1, Number(query.get('page')) || 1),
    /* 默认就停在最该看的那一档：待审 */
    status: statusParam === null ? 'PENDING' : statusParam,
    audit: Number(query.get('audit')) || 0,
  }
  var items = []
  var tagNames = {}
  var opened = null

  function syncUrl() {
    try {
      var params = new URLSearchParams()
      params.set('status', state.status)
      if (state.page > 1) params.set('page', String(state.page))
      if (state.audit) params.set('audit', String(state.audit))
      window.history.replaceState(null, '', 'admin-coach-audits.html?' + params.toString())
    } catch (error) {
      /* file:// 下不允许改地址栏，跳过就好 */
    }
  }

  /* ---- 列表 ---- */

  var EMPTY = {
    PENDING: ['没有待审的申请', '教练提交入驻资料之后，会出现在这里。'],
    APPROVED: ['还没有通过过的申请', '通过一份之后，它会留在这里存档。'],
    REJECTED: ['没有驳回过的申请', '驳回的那几份会留在这里，连着理由。'],
    '': ['还没有任何申请', '有人提交教练入驻资料之后，这里就有东西看了。'],
  }

  function auditRow(audit) {
    return (
      '<tr data-id="' +
      audit.id +
      '">' +
      '<td>' +
      kit.esc(audit.coachName || '—') +
      '</td>' +
      '<td class="tnum">第 ' +
      (Number(audit.submitVersion) || 1) +
      ' 版</td>' +
      '<td class="tnum">' +
      kit.when(audit.submittedAt) +
      '</td>' +
      '<td class="tnum">' +
      kit.when(audit.reviewedAt) +
      '</td>' +
      '<td>' +
      kit.auditChip(audit.status) +
      (audit.remark ? '<p class="anote">' + kit.esc(audit.remark) + '</p>' : '') +
      '</td>' +
      '<td><button class="act" type="button" data-open="' + audit.id + '">查看</button></td>' +
      '</tr>'
    )
  }

  function draw(list, pagination) {
    items = list
    var empty = EMPTY[state.status] || EMPTY['']
    rowsBox.innerHTML = items.length
      ? items.map(auditRow).join('')
      : kit.emptyRow(COLUMNS, empty[0], empty[1])

    var total = Number(pagination.totalItems) || 0
    var pages = Math.max(1, Number(pagination.totalPages) || 1)
    countBox.textContent = '共 ' + total + ' 份'
    pagerBox.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 份'
    prevButton.disabled = state.page <= 1
    nextButton.disabled = state.page >= pages

    Array.prototype.forEach.call(statusKeys.querySelectorAll('[data-status]'), function (key) {
      key.classList.toggle('is-current', key.getAttribute('data-status') === state.status)
    })
  }

  function load() {
    rowsBox.innerHTML = kit.skeleton(COLUMNS, 3)
    countBox.textContent = '读取中…'
    pagerBox.textContent = ''
    prevButton.disabled = true
    nextButton.disabled = true

    var path =
      '/admin/coach-audits?page=' +
      state.page +
      '&pageSize=' +
      PAGE_SIZE +
      (state.status ? '&status=' + state.status : '')

    return api
      .get(path)
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

  /* ---- 那一份申请 ---- */

  function links(urls) {
    if (!urls || !urls.length) return '未上传'
    return urls
      .map(function (url, index) {
        return (
          '<a href="' + kit.esc(url) + '" target="_blank" rel="noreferrer">查看第 ' + (index + 1) + ' 份</a>'
        )
      })
      .join('、')
  }

  function pair(label, value) {
    return '<dt>' + kit.esc(label) + '</dt><dd>' + (value || '—') + '</dd>'
  }

  function serviceRow(service) {
    return (
      '<li class="svc">' +
      '<span class="svc__name">' +
      kit.esc(service.name || '未命名') +
      '</span>' +
      '<span class="svc__price">' +
      kit.esc(kit.money(service.priceInCents)) +
      '</span>' +
      '<span class="svc__meta">' +
      kit.esc(
        kit.serviceLabel(service.serviceType) +
          ' · ' +
          (Number(service.durationMin) || 0) +
          ' 分钟' +
          (service.description ? ' · ' + service.description : ''),
      ) +
      '</span></li>'
    )
  }

  function actionsHtml(audit) {
    return audit.status === 'PENDING'
      ? '<button class="btn" type="button" data-ask-approve>通过这一份</button>' +
          '<button class="btn btn--paper" type="button" data-ask-reject>驳回</button>'
      : '<button class="btn btn--paper" type="button" data-close>收起</button>'
  }

  function detailHtml(audit) {
    var snapshot = audit.snapshot || {}
    var tags = (snapshot.tagIds || []).map(function (id) {
      return kit.chip(tagNames[id] || '标签 ' + id)
    })
    var services = snapshot.services || []

    return (
      '<div class="ahead">' +
      '<span class="ahead__who">' +
      kit.esc(audit.coachName || '—') +
      '</span>' +
      kit.auditChip(audit.status) +
      '<span class="ahead__meta">' +
      kit.esc(audit.phone || '') +
      ' · 第 ' +
      (Number(audit.submitVersion) || 1) +
      ' 版 · 提交于 ' +
      kit.esc(api.dateTime(audit.submittedAt)) +
      (audit.reviewedAt ? ' · 审核于 ' + kit.esc(api.dateTime(audit.reviewedAt)) : '') +
      '</span>' +
      (audit.remark ? '<span class="anote anote--warn">驳回理由：' + kit.esc(audit.remark) + '</span>' : '') +
      '</div>' +
      '<div class="cols cols--2">' +
      '<div>' +
      '<h3 class="panel__sub">资质材料</h3>' +
      '<dl class="pairs">' +
      pair('真实姓名', kit.esc(snapshot.realName)) +
      pair('从业年限', Number(snapshot.yearsOfExperience) ? snapshot.yearsOfExperience + ' 年' : '—') +
      pair('擅长方向', tags.length ? tags.join(' ') : '—') +
      pair('个人简介', kit.esc(snapshot.bio)) +
      pair('受训经历', kit.esc(snapshot.trainingExp)) +
      pair('服务理念', kit.esc(snapshot.serviceConcept)) +
      pair('身份证明', snapshot.idCardUrl ? links([snapshot.idCardUrl]) : '未上传') +
      pair('资质证明', links(snapshot.credentialUrls)) +
      '</dl>' +
      '</div>' +
      '<div>' +
      '<h3 class="panel__sub">报的服务项目</h3>' +
      (services.length
        ? '<ul class="rows">' + services.map(serviceRow).join('') + '</ul>'
        : '<p class="anote">没有填服务项目。</p>') +
      '</div>' +
      '</div>' +
      '<div class="aacts" data-actions>' +
      actionsHtml(audit) +
      '</div>'
    )
  }

  function fail(message) {
    detailBody.innerHTML = kit.note(message, true)
  }

  function openDetail(id) {
    state.audit = Number(id)
    syncUrl()
    detail.hidden = false
    detailBody.innerHTML = '<span class="skl" style="--skl-w:64%"></span>'
    detail.scrollIntoView({ block: 'start', behavior: 'smooth' })

    api
      .get('/admin/coach-audits/' + id)
      .then(function (audit) {
        opened = audit
        detailBody.innerHTML = detailHtml(audit)
      })
      .catch(function (error) {
        if (kit.bounce(error)) return
        fail(error.message)
      })
  }

  function closeDetail() {
    detail.hidden = true
    detailBody.innerHTML = ''
    opened = null
    state.audit = 0
    syncUrl()
  }

  function approve() {
    var audit = opened
    if (!audit) return
    var actions = detailBody.querySelector('[data-actions]')
    actions.innerHTML =
      '<span class="confirm">' +
      '<span class="confirm__ask">通过之后，' + kit.esc(audit.coachName || '这位教练') + ' 就会出现在「找教练」里。</span>' +
      '<button class="btn" type="button" data-yes-approve>通过</button>' +
      '<button class="btn btn--paper" type="button" data-cancel>再想想</button></span>'

    actions.querySelector('[data-cancel]').addEventListener('click', function () {
      actions.innerHTML = actionsHtml(audit)
    })
    actions.querySelector('[data-yes-approve]').addEventListener('click', function (event) {
      event.target.disabled = true
      event.target.textContent = '处理中…'
      api
        .post('/admin/coach-audits/' + audit.id + '/approve', {})
        .then(function () {
          closeDetail()
          return load()
        })
        .catch(function (error) {
          if (kit.bounce(error)) return
          fail(error.message)
        })
    })
  }

  function askReject() {
    var audit = opened
    if (!audit) return
    var actions = detailBody.querySelector('[data-actions]')
    actions.innerHTML =
      '<div class="aacts__reason">' +
      '<label class="field__label" for="reason">驳回理由（教练能看到这句话）</label>' +
      '<textarea class="textarea" id="reason" rows="3" maxlength="500" placeholder="说清楚缺什么、或者哪里对不上，他好照着改。"></textarea>' +
      '<div class="field__row">' +
      '<button class="btn btn--paper" type="button" data-cancel>取消</button>' +
      '<button class="btn" type="button" data-yes-reject>提交驳回</button>' +
      '</div>' +
      '<p class="anote anote--warn" data-reason-msg hidden></p>' +
      '</div>'

    var reason = actions.querySelector('#reason')
    var message = actions.querySelector('[data-reason-msg]')
    reason.focus()

    actions.querySelector('[data-cancel]').addEventListener('click', function () {
      actions.innerHTML = actionsHtml(audit)
    })

    actions.querySelector('[data-yes-reject]').addEventListener('click', function (event) {
      var text = reason.value.trim()
      if (!text) {
        message.textContent = '理由不能空着 —— 教练要照着它改。'
        message.hidden = false
        reason.focus()
        return
      }
      event.target.disabled = true
      event.target.textContent = '提交中…'
      api
        .post('/admin/coach-audits/' + audit.id + '/reject', { reason: text })
        .then(function () {
          closeDetail()
          return load()
        })
        .catch(function (error) {
          if (kit.bounce(error)) return
          event.target.disabled = false
          event.target.textContent = '提交驳回'
          message.textContent = error.message
          message.hidden = false
        })
    })
  }

  detailBody.addEventListener('click', function (event) {
    if (event.target.closest('[data-ask-approve]')) {
      approve()
      return
    }
    if (event.target.closest('[data-ask-reject]')) {
      askReject()
      return
    }
    if (event.target.closest('[data-close]')) closeDetail()
  })

  /* ---- 筛与翻页 ---- */

  statusKeys.addEventListener('click', function (event) {
    var key = event.target.closest('[data-status]')
    if (!key) return
    state.status = key.getAttribute('data-status')
    state.page = 1
    state.audit = 0
    detail.hidden = true
    detailBody.innerHTML = ''
    if (!key.classList.contains('is-current')) syncUrl()
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

  rowsBox.addEventListener('click', function (event) {
    var open = event.target.closest('[data-open]')
    if (open) openDetail(Number(open.getAttribute('data-open')))
  })

  /* ---- 起跑：标签名与列表一起取，若地址栏里带了一份申请的 id 就顺手把它摊开 ---- */
  api
    .get('/admin/tags')
    .then(function (data) {
      ;((data && data.items) || []).forEach(function (tag) {
        tagNames[tag.id] = tag.name
      })
    })
    .catch(function () {
      /* 拿不到标签名就退回「标签 3」这种写法，不影响审核本身 */
    })
    .then(load)
    .then(function () {
      if (state.audit) openDetail(state.audit)
    })
})()
