/* 打卡与徽章（原前端的 `/check-ins` + `/check-ins/leaderboard`）：
   今天的打卡、连续天数、这一期的榜单、已经盖下的章。

   接后端：
     · `POST /check-ins`（一天一次）
     · `GET  /check-ins/stats` → { streakDays, totalCount, monthCount }
     · `GET  /check-ins/leaderboard?period=week|month` → { items: [{ rank, nickname, count }] }
     · `GET  /users/me/badges` → { items }
   没有后端：页面里写好的示例；打卡这一步如实说明需要后端（它要写进账号）。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live

  var streakCell = document.querySelector('[data-streak]')
  var weekList = document.querySelector('[data-week]')
  var statsList = document.querySelector('[data-stats]')
  var noteCell = document.querySelector('[data-note]')
  var checkButton = document.querySelector('[data-checkin]')
  var statusLine = document.querySelector('[data-status]')
  var boardBox = document.querySelector('[data-board]')
  var periodKeys = document.querySelector('[data-period]')
  var badgeGrid = document.querySelector('[data-badges]')
  var badgeCount = document.querySelector('[data-badge-count]')

  var period = 'week'
  var busy = false

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function drawStreak(stats) {
    if (streakCell) streakCell.innerHTML = '<strong>' + (stats.streakDays || 0) + '</strong> 天连续记录'
    if (statsList) {
      statsList.innerHTML =
        '<li class="stat"><strong>' + (stats.streakDays || 0) + '</strong><span>天连续</span></li>' +
        '<li class="stat"><strong>' + (stats.monthCount || 0) + '</strong><span>天本月</span></li>' +
        '<li class="stat"><strong>' + (stats.totalCount || 0) + '</strong><span>天累计</span></li>'
    }
  }

  function drawBoard(items, mine) {
    if (!boardBox) return
    if (!items.length) {
      boardBox.innerHTML = '<p class="panel__note">这一期还没有人打卡。</p>'
      return
    }
    boardBox.innerHTML = items
      .map(function (item, index) {
        var isMine = mine && item.nickname === mine
        return (
          '<div class="board__row' + (index < 2 ? ' board__row--top' : '') + (isMine ? ' board__row--me' : '') + '">' +
          '<span class="board__rank">' + api.esc(item.rank || index + 1) + '</span>' +
          '<span class="board__who">' + api.esc(item.nickname) + (isMine ? '（你）' : '') + '</span>' +
          '<span class="board__count">' + (Number(item.count) || 0) + ' 天</span>' +
          '</div>'
        )
      })
      .join('')
  }

  function drawBadges(items) {
    if (!badgeGrid || !items.length) return
    badgeGrid.innerHTML = items
      .map(function (badge) {
        var art = badge.iconUrl || badge.imageUrl || 'assets/badge-first-journal.webp'
        return (
          '<li class="badge' + (badge.unlocked === false ? ' is-locked' : '') + '">' +
          '<img src="' + api.esc(art) + '" width="400" height="400" alt="" aria-hidden="true" />' +
          '<span>' + api.esc(badge.name || '徽章') + '</span></li>'
        )
      })
      .join('')
    if (badgeCount) badgeCount.textContent = items.length + ' / ' + items.length
  }

  function loadBoard(periodValue) {
    period = periodValue || period
    if (!live) {
      say(period === 'week' ? '设计演示：这一份是本周的示例榜单。' : '设计演示：这一份是本月的示例榜单。')
      return
    }
    api
      .get('/check-ins/leaderboard?period=' + encodeURIComponent(period))
      .then(function (data) {
        drawBoard((data && data.items) || [], nick)
      })
      .catch(function (error) {
        say((error && error.message) || '榜单没读出来。')
      })
  }

  var nick = ''

  function checkIn() {
    if (busy || !live) {
      if (!live) say('设计演示里打卡需要后端：接上后端、登录之后，这里会把今天记进你的账号。')
      return
    }
    busy = true
    if (checkButton) {
      checkButton.disabled = true
      checkButton.textContent = '打卡中…'
    }
    api
      .post('/check-ins')
      .then(function () {
        say('今天记上了。明天见。')
        return api.get('/check-ins/stats').then(drawStreak)
      })
      .catch(function (error) {
        say((error && error.message) || '打卡没成功，再试一次。')
      })
      .then(function () {
        busy = false
        if (checkButton) {
          checkButton.disabled = false
          checkButton.textContent = '今天打个卡'
        }
        if (statusLine && statusLine.focus) statusLine.focus()
      })
  }

  if (checkButton) checkButton.addEventListener('click', checkIn)

  if (periodKeys) {
    periodKeys.addEventListener('click', function (event) {
      var button = event.target.closest('[data-period-value]')
      if (!button) return
      Array.prototype.forEach.call(periodKeys.querySelectorAll('[data-period-value]'), function (item) {
        var current = item === button
        item.classList.toggle('is-current', current)
        item.setAttribute('aria-pressed', current ? 'true' : 'false')
      })
      loadBoard(button.getAttribute('data-period-value'))
    })
  }

  if (live) {
    api
      .get('/users/me')
      .then(function (me) {
        nick = (me && me.nickname) || ''
        if (noteCell && nick) noteCell.textContent = nick
      })
      .catch(function () {
        /* 拿不到昵称就不写 */
      })
    api
      .get('/check-ins/stats')
      .then(drawStreak)
      .catch(function () {
        /* 读不到就留着页面里的示例数字 */
      })
    api
      .get('/users/me/badges')
      .then(function (data) {
        drawBadges((data && data.items) || [])
      })
      .catch(function () {
        /* 同上 */
      })
    loadBoard('week')
    say('已连后端，下面是你的打卡与榜单。')
  } else {
    say('设计演示：数字是示例。')
  }
})()
