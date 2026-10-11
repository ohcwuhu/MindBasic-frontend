/* 我的成长：接后端时用真数据填连续记录、三项统计、徽章墙与时间轴。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var countEl = document.querySelector('.streak-head__count')
  if (!countEl) return

  var week = document.querySelector('.week')
  var stats = document.querySelector('.stats')
  var timeline = document.querySelector('.timeline')
  var streakNote = document.querySelector('#streak-title') && document.querySelector('#streak-title').closest('.panel__head').querySelector('.panel__note')
  var badgeGrid = document.querySelector('.badge-grid') || document.querySelector('.badges')

  Promise.all([
    api.get('/users/me').catch(function () {
      return null
    }),
    api.get('/check-ins/stats').catch(function () {
      return null
    }),
    api.get('/emotion-journals?page=1&pageSize=50').catch(function () {
      return { items: [] }
    }),
    api.get('/self-coaching/records?page=1&pageSize=50').catch(function () {
      return { items: [] }
    }),
    api.get('/growth-assessments?page=1&pageSize=20').catch(function () {
      return { items: [] }
    }),
    api.get('/users/me/badges').catch(function () {
      return { items: [] }
    }),
    api.get('/check-ins?page=1&pageSize=30').catch(function () {
      return { items: []
      }
    }),
  ])
    .then(function (r) {
      var me = r[0]
      var checkin = r[1] || { streakDays: 0, totalCount: 0, monthCount: 0 }
      var journals = (r[2] && r[2].items) || []
      var records = (r[3] && r[3].items) || []
      var assessments = (r[4] && r[4].items) || []
      var badges = (r[5] && r[5].items) || []
      var checkins = (r[6] && r[6].items) || []

      countEl.innerHTML = '<strong>' + (checkin.streakDays || 0) + '</strong> 天连续记录'
      if (streakNote) {
        streakNote.textContent =
          me ? me.nickname + ' · 这个月记了 ' + (checkin.monthCount || 0) + ' 天' : ''
      }

      if (week) {
        var today = new Date()
        var marked = {}
        checkins.forEach(function (item) {
          var date = new Date(item.createdAt || item.date || '')
          if (!isNaN(date.getTime())) marked[date.toDateString()] = true
        })
        journals.forEach(function (item) {
          var date = new Date(item.createdAt || '')
          if (!isNaN(date.getTime())) marked[date.toDateString()] = true
        })
        var cells = ''
        for (var back = 6; back >= 0; back -= 1) {
          var day = new Date(today.getTime() - back * 86400000)
          cells +=
            '<li class="' + (marked[day.toDateString()] ? 'is-on' : '') + '"><span>' +
            (day.getMonth() + 1) + '/' + day.getDate() + '</span></li>'
        }
        week.innerHTML = cells
      }

      if (stats) {
        stats.innerHTML =
          '<li class="stat"><strong>' + journals.length + '</strong><span>条情绪日记</span></li>' +
          '<li class="stat"><strong>' + records.length + '</strong><span>次 AI 对话</span></li>' +
          '<li class="stat"><strong>' + assessments.length + '</strong><span>次成长测评</span></li>'
      }

      if (timeline) {
        var events = []
        journals.forEach(function (item) {
          events.push({ at: item.createdAt, text: '写了一条情绪日记：' + (item.content || '').slice(0, 22), tag: '情绪日记' })
        })
        records.forEach(function (item) {
          events.push({ at: item.createdAt, text: '完成一次自我教练：' + (item.title || item.summary || '').slice(0, 20), tag: '自我教练' })
        })
        assessments.forEach(function (item) {
          events.push({ at: item.createdAt, text: '做了一次成长测评', tag: '成长测评' })
        })
        checkins.forEach(function (item) {
          events.push({ at: item.createdAt || item.date, text: '完成一次打卡', tag: '打卡' })
        })
        events.sort(function (a, b) {
          return new Date(b.at || 0) - new Date(a.at || 0)
        })
        if (!events.length) {
          timeline.outerHTML = api.empty('还没有记录', '写下第一条日记，或去做一次自我教练。')
        } else {
          timeline.innerHTML = events
            .slice(0, 12)
            .map(function (event) {
              return (
                '<li class="tl__item"><span class="chip chip--green">' + api.esc(event.tag) + '</span>' +
                '<p class="tl__text">' + api.esc(event.text) + '</p>' +
                '<time>' + api.esc(api.dateTime(event.at)) + '</time></li>'
              )
            })
            .join('')
        }
      }

      if (badgeGrid) {
        if (!badges.length) {
          badgeGrid.innerHTML = api.empty('还没有徽章', '连续记录、完成对话都会盖章。')
        } else {
          badgeGrid.innerHTML = badges
            .map(function (badge) {
              var art = badge.iconUrl || badge.imageUrl || 'assets/badge-first-journal.webp'
              return (
                '<li class="badge"><img src="' + api.esc(art) + '" width="400" height="391" alt="" aria-hidden="true" />' +
                '<span>' + api.esc(badge.name || badge.title || '徽章') + '</span></li>'
              )
            })
            .join('')
        }
      }
    })
    .catch(function (error) {
      api.fail(countEl.closest('.panel') || countEl, error)
    })
})()
