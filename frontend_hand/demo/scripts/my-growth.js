/* 我的成长：示例/真实分离；各区独立加载，失败不伪装成零记录。 */
;(function () {
  'use strict'
  var api = window.FeisiAPI, view = window.FeisiAssessment
  if (!api || !view) return
  if (!api.live) { view.mode('设计演示 · 记录、分数与徽章均为示例，不代表你的账号数据。'); return }
  view.mode('账号数据 · 正在读取你的记录…')
  var count = document.querySelector('.streak-head__count'), week = document.querySelector('.week')
  var stats = document.querySelector('.stats'), timeline = document.querySelector('.timeline')
  var dims = document.querySelector('.dims'), badges = document.querySelector('.badge-grid')
  function panelNote(id) { return document.getElementById(id).closest('.panel').querySelector('.panel__note') }
  var streakNote = panelNote('streak-title'), badgeNote = panelNote('badge-title')
  var account = document.querySelector('[data-account-note]')
  var dimNote = document.getElementById('dim-title').closest('.panel').querySelector('.panel__foot')
  var timelineNote = document.getElementById('tl-title').closest('.panel').querySelector('.panel__foot')
  var timelineHeadingNote = panelNote('tl-title')
  document.querySelector('.footer__note--demo').textContent = '© 2026 斐思同行 · 记录与测评来自你的账号'
  count.textContent = '正在读取打卡统计…'; streakNote.textContent = ''
  badgeNote.textContent = '正在读取…'; account.textContent = '正在读取账号…'
  timelineNote.textContent = ''; timelineHeadingNote.textContent = '最近记录 · 不等于累计数量'
  var sources = [
    { key: 'journals', path: '/emotion-journals', label: '条情绪日记', tag: '情绪日记', text: function (i) { return i.content || '' } },
    { key: 'records', path: '/self-coaching/records', label: '份自我教练记录', tag: '自我教练', text: function (i) { return i.templateName || i.title || '自我教练记录' } },
    { key: 'conversations', path: '/ai-conversations', label: '次 AI 会话', tag: 'AI 会话', text: function (i) { return i.title || 'AI 对话' } },
    { key: 'assessments', path: '/growth-assessments', label: '次成长测评', tag: '成长测评', text: function (i) { return i.templateName || '成长自评' } }
  ]
  var results = {}, pending = {}, failures = {}, checkins = null
  stats.innerHTML = sources.map(function (s) { return '<li class="stat" data-stat="' + s.key + '"><strong>—</strong><span>' + s.label + ' · 累计</span><p class="panel__note" role="status">正在读取…</p></li>' }).join('')
  function updateTimeline() {
    var events = [], incomplete = []
    sources.forEach(function (s) {
      if (pending[s.key] || failures[s.key]) incomplete.push(s.tag)
      if (results[s.key]) results[s.key].items.forEach(function (i) { events.push({ at: i.createdAt, text: s.text(i), tag: s.tag, key: s.key, id: i.id }) })
    })
    if (checkins === null) incomplete.push('打卡')
    else checkins.forEach(function (i) { events.push({ at: i.checkDate || i.createdAt, text: i.content || '完成一次打卡', tag: '打卡', key: 'checkins', id: i.id }) })
    events.sort(function (a,b) { return new Date(b.at) - new Date(a.at) })
    /* 行动面板跟时间轴一样，每次来源有变化就重画一次（下面那条 return 之前也要画） */
    drawAction()
    timelineNote.textContent = incomplete.length ? '部分记录尚未加载：' + incomplete.join('、') + '。可在对应区域重试。' : '显示最近 12 条记录；累计数量见上方。'
    if (!events.length) { view.state(timeline, incomplete.length ? '记录尚未完整读取，不能确认是否为空。' : '还没有记录，写一条日记或完成一次自评吧。'); return }
    timeline.innerHTML = events.slice(0,12).map(function (e) {
      /* 每一条都能点回它自己的那一页：对话回看 / 记录详情 / 情绪日记 / 打卡 / 那一次测评 */
      var href =
        e.key === 'records' ? api.url('self-coaching-record.html', { record: e.id }) :
        e.key === 'conversations' ? api.url('ai-conversation.html', { id: e.id }) :
        e.key === 'journals' ? api.url('emotion-journal.html', { journalId: e.id }) :
        e.key === 'checkins' ? api.url('check-ins.html') :
        e.key === 'assessments' ? api.url('my-growth.html', { assessment: e.id }) : null
      return '<li class="tl"><time>' + api.esc(api.dateTime(e.at)) + '</time><div class="tl__body"><div><p class="tl__title">' + api.esc(e.tag) + '</p><p class="tl__text">' + api.esc(e.text.slice(0,100)) + '</p>' +
        (href ? '<a class="link-quiet" href="' + api.esc(href) + '">查看记录</a>' : '') + '</div></div></li>'
    }).join('')
  }
  function loadSource(s) {
    var cell = stats.querySelector('[data-stat="' + s.key + '"]'), value = cell.querySelector('strong'), status = cell.querySelector('p')
    pending[s.key] = true; delete failures[s.key]; delete results[s.key]
    value.textContent = '—'; status.textContent = '正在读取…'; cell.querySelectorAll('button').forEach(function (b) { b.remove() })
    return api.get(s.path + '?page=1&pageSize=50').then(function (data) {
      if (!data || !Array.isArray(data.items) || !data.pagination || !Number.isInteger(data.pagination.totalItems) || data.pagination.totalItems < 0) throw new Error('统计数据不完整')
      results[s.key] = data; value.textContent = data.pagination.totalItems; status.textContent = ''
      if (s.key === 'journals') {
        return findAction(data, 1).then(function (action) {
          if (action) return api.get('/check-ins/action?journalId=' + action.item.id).then(function (saved) {
            adjustedActions[action.item.id] = saved.action || null
          })
        })
      }
    }).catch(function (error) {
      failures[s.key] = true; status.textContent = '读取失败：' + error.message
      var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'link-quiet'; retry.textContent = '重试'
      retry.addEventListener('click', function () { loadSource(s) }); cell.appendChild(retry)
    }).then(function () { pending[s.key] = false; updateTimeline() })
  }
  function findAction(data, page) {
    var action = parseAction(data)
    if (action || page * 50 >= data.pagination.totalItems) return Promise.resolve(action)
    return api.get('/emotion-journals?page=' + (page + 1) + '&pageSize=50').then(function (next) {
      if (!next || !Array.isArray(next.items) || !next.pagination) throw new Error('行动记录读取不完整')
      results.journals.items = results.journals.items.concat(next.items)
      return findAction(next, page + 1)
    })
  }
  function loadStats() {
    count.textContent = '正在读取打卡统计…'
    return api.get('/check-ins/stats').then(function (data) {
      if (!data || !Number.isFinite(Number(data.streakDays)) || !Number.isFinite(Number(data.monthCount))) throw new Error('打卡统计不完整')
      count.innerHTML = '<strong>' + Number(data.streakDays) + '</strong> 天连续打卡'
      streakNote.textContent = '本月打卡 ' + Number(data.monthCount) + ' 天'
    }).catch(function (error) { view.state(count, '打卡统计读取失败：' + error.message, loadStats) })
  }
  function month(date) { return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') }
  function loadWeek() {
    checkins = null; view.state(week, '正在读取最近七天打卡…')
    var now = new Date(), start = new Date(now); start.setDate(start.getDate()-6)
    var months = Array.from(new Set([month(now), month(start)]))
    return Promise.all(months.map(function (m) { return api.get('/check-ins?month=' + m) })).then(function (rows) {
      checkins = rows.flatMap(function (r) { if (!Array.isArray(r.items)) throw new Error('打卡记录不完整'); return r.items })
      var days = new Set(checkins.map(function (r) { return r.checkDate }))
      week.setAttribute('aria-label', '最近七天打卡情况')
      week.innerHTML = Array.from({ length: 7 },function (_, i) {
        var d = new Date(start); d.setDate(d.getDate()+i)
        var key = month(d) + '-' + String(d.getDate()).padStart(2,'0'), on = days.has(key)
        return '<li class="' + (on ? 'is-on' : '') + '" aria-label="' + key + (on ? '，已打卡' : '，未打卡') + '"><span>' + (d.getMonth()+1) + '/' + d.getDate() + '</span></li>'
      }).join('')
    }).catch(function (error) { view.state(week, '打卡记录读取失败：' + error.message, loadWeek) }).then(updateTimeline)
  }
  function loadBadges() {
    view.state(badges, '正在读取徽章…'); badgeNote.textContent = '正在读取…'
    return api.get('/users/me/badges').then(function (data) {
      if (!Array.isArray(data.items)) throw new Error('徽章数据不完整')
      badgeNote.textContent = '已获得 ' + data.items.length + ' 枚'
      if (!data.items.length) { view.state(badges, '还没有徽章，去完成第一次打卡吧。'); return }
      var icons = { FIRST_CHECKIN: 'badge-first-journal', STREAK_7: 'badge-streak-7', STREAK_30: 'badge-streak-30', TOTAL_100: 'badge-first-coach' }
      badges.innerHTML = data.items.map(function (b) { return '<li class="badge"><img src="assets/' + (icons[b.key] || 'badge-first-journal') + '.webp" width="46" height="44" alt="" aria-hidden="true" /><span>' + api.esc(b.name) + '</span></li>' }).join('')
    }).catch(function (error) { badgeNote.textContent = '未能读取'; view.state(badges, '徽章读取失败：' + error.message, loadBadges) })
  }
  function loadAccount() {
    account.textContent = '正在读取账号…'
    return api.get('/users/me').then(function (me) { account.textContent = me.nickname || '我的账号' }).catch(function (error) { view.state(account, '账号读取失败：' + error.message, loadAccount) })
  }
  /* ── 下一步行动 ────────────────────────────────────────────────────────
     行动来自最近一次「收束」：对话结束时确认的那句「我的一小步」就写在情绪日记里，
     这里把它单独提出来，并回访它做没做完。回访记进今天的打卡（一天一条）。 */
  var actionCard = document.querySelector('[data-action-card]')
  var actionNote = document.querySelector('[data-action-note]')
  var actionReview = document.querySelector('[data-action-review]')
  var reviewStatus = document.querySelector('[data-review-status]')
  var adjustBox = document.querySelector('[data-action-adjust]')
  var adjustInput = document.querySelector('[data-action-smaller]')
  var REVIEW_TEXT = { DONE: '做完了', PARTIAL: '做了一部分', NOT_YET: '还没开始' }
  var currentAction = null, reviewBusy = false, adjustedActions = {}

  /** 正文格式由编译后的共享模块维护；旧记录的分行行动也不会被截断。 */
  function parseAction(data) {
    var items = (data && data.items) || []
    if (!window.FeisiJournalAction) throw new Error('行动格式模块未加载')
    return window.FeisiJournalAction.parseLatestJournalAction(items)
  }

  function reviewRows() {
    return (checkins || [])
      .filter(function (row) { return /^\s*(回访|行动调小)[：:]/.test(String(row.content || '')) })
      .slice()
      .sort(function (a, b) { return String(b.checkDate || '').localeCompare(String(a.checkDate || '')) })
  }

  function drawAction() {
    if (!actionCard) return
    if (pending.journals) {
      actionNote.textContent = ''
      actionReview.hidden = true
      actionCard.innerHTML = '<p class="panel__note" role="status">正在读取你的下一步行动…</p>'
      return
    }
    if (failures.journals) {
      /* 读不到就说读不到 —— 不能说成「你还没有行动」 */
      actionNote.textContent = ''
      actionReview.hidden = true
      actionCard.innerHTML = '<p class="panel__note" role="status">行动读取失败：日记没读上来，这一步暂时看不了。</p>' +
        '<p class="panel__foot"><button class="link-quiet" type="button" data-action-retry>重试</button></p>'
      return
    }
    var found = parseAction(results.journals)
    if (found && adjustedActions[found.item.id]) found.text = adjustedActions[found.item.id]
    currentAction = found
    if (!found) {
      actionNote.textContent = ''
      actionReview.hidden = true
      actionCard.innerHTML = '<p class="prose">还没有记下行动。聊完一次后，收束卡里的「我的一小步」会出现在这里——下一次回来，就知道它做没做完。</p>' +
        '<p class="panel__foot"><a class="link-quiet" href="self-coaching.html">去聊一次</a></p>'
      return
    }
    var source = found.item.createdAt ? api.dateTime(found.item.createdAt) : ''
    actionNote.textContent = '来自最近一次收束 · 一天回访一条'
    actionCard.innerHTML =
      '<p class="action-card__text" data-action-text>' + api.esc(found.text) + '</p>' +
      '<dl class="action-card__meta">' +
      (found.when ? '<dt>什么时候做</dt><dd>' + api.esc(found.when) + '</dd>' : '') +
      (found.condition ? '<dt>怎么算完成</dt><dd>' + api.esc(found.condition) + '</dd>' : '') +
      '</dl>' +
      '<p class="panel__note">写在 ' + api.esc(source || '这条日记') + ' 的收束里 · ' +
      '<a class="link-quiet" href="' + api.url('emotion-journal.html', { journalId: found.item.id }) + '">看这条日记</a></p>'
    actionReview.hidden = false
    var rows = reviewRows()
    reviewStatus.textContent = rows.length
      ? '上次回访：' + api.esc(String(rows[0].checkDate || '').slice(5) + ' · ' + String(rows[0].content || '').replace(/^\s*(回访|行动调小)[：:]\s*/, ''))
      : '回答会记进今天的打卡，成为这条成长线上的一次反馈。一天记一条。'
  }

  function sendReview(note, onDone) {
    if (reviewBusy || !currentAction) return
    reviewBusy = true
    reviewStatus.textContent = '正在记进今天的打卡…'
    api.post('/check-ins', { content: note }).then(function () {
      return Promise.all([loadStats(), loadWeek()])
    }).then(function () {
      onDone()
    }).catch(function (error) {
      if (error && error.status === 409) {
        reviewStatus.textContent = '今天已经记过一条了（一天一条）：' + (reviewRows().length ? String(reviewRows()[0].content || '') : '') + ' 明天可以再回访这一步。'
        return
      }
      reviewStatus.textContent = '没能记下来：' + ((error && error.message) || '请再试一次') + ' '
      var retry = document.createElement('button')
      retry.type = 'button'; retry.className = 'link-quiet'; retry.textContent = '重试'
      retry.addEventListener('click', function () { sendReview(note, onDone) })
      reviewStatus.appendChild(retry)
    }).then(function () { reviewBusy = false })
  }

  if (actionReview) {
    actionReview.addEventListener('click', function (event) {
      var button = event.target.closest('[data-review]')
      if (button) {
        if (reviewBusy || !currentAction) return
        var kind = button.dataset.review
        var text = REVIEW_TEXT[kind] || kind
        if (kind === 'NOT_YET') {
          adjustBox.hidden = false
          if (adjustInput) adjustInput.focus()
          reviewStatus.textContent = '先写下更小的一步，再一起保存；也可以只记录还没开始。'
          return
        }
        sendReview('回访：' + currentAction.text.slice(0, 160) + '——' + text, function () {
          adjustBox.hidden = true
          drawAction()
          reviewStatus.textContent = '已经记进今天的打卡：' + text + '（' + (currentAction ? currentAction.text : '') + '）'
        })
        return
      }
      var saveSmall = event.target.closest('[data-action-save-small]')
      if (saveSmall && adjustInput) {
        if (reviewBusy || !currentAction) return
        var smaller = String(adjustInput.value || '').trim()
        if (!smaller) { adjustInput.focus(); return }
        var journalId = currentAction.item.id
        sendReview('行动调小：' + smaller + '（来源日记：' + journalId + '）', function () {
          adjustBox.hidden = true
          adjustInput.value = ''
          adjustedActions[journalId] = smaller
          drawAction()
          reviewStatus.textContent = '已经把这一步改小成：' + smaller + '。'
        })
      }
      if (event.target.closest('[data-action-save-not-yet]')) {
        sendReview('回访：' + currentAction.text.slice(0, 160) + '——还没开始', function () {
          adjustBox.hidden = true
          reviewStatus.textContent = '已经记下：还没开始。明天可以再回访这一步。'
        })
      }
    })
    if (actionCard) {
      actionCard.addEventListener('click', function (event) {
        if (event.target.closest('[data-action-retry]')) loadSource(sources[0]).then(drawAction)
      })
    }
  }

  sources.forEach(function (s) { pending[s.key] = true })
  view.state(timeline, '正在读取最近记录…')
  view.state(dims, '正在读取测评结果…'); dimNote.textContent = ''
  view.state(badges, '正在读取徽章…'); view.state(week, '正在读取打卡…')
  document.documentElement.removeAttribute('data-live-pending')
  Promise.all(sources.map(loadSource).concat([loadStats(),loadWeek(),loadBadges(),loadAccount(),
    view.load(dims,dimNote,new URLSearchParams(location.search).get('assessment'))
  ])).then(function () { view.mode('账号数据 · 以下内容来自你的账号。') })
})()
