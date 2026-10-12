/* 「我的订单 / 我的预约」那两行小字（个人资料页的账号区）。

   两行都指向我的订单页；这里只负责把数字写对：
     · 接后端：`GET /orders`、`GET /appointments/mine`，如实报笔数与下一页要做的事；
     · 静态演示：读订单页同一个本地演示账本，所以刚约完回到这里就看得见。
   （订单页做出来之前，这两行只报个数量 —— 现在它们通到真的页面。） */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live
  var KEY = 'feisi_demo_flow'

  var ordersBox = document.querySelector('[data-orders]')
  var appointmentsBox = document.querySelector('[data-appointments]')
  var checkinsBox = document.querySelector('[data-checkins]')
  var favoritesBox = document.querySelector('[data-favorites]')
  if (!ordersBox && !appointmentsBox && !checkinsBox && !favoritesBox) return

  function daysUntil(date) {
    var target = new Date(date + 'T00:00:00')
    if (isNaN(target.getTime())) return null
    var today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((target.getTime() - today.getTime()) / 86400000)
  }

  function fill(orders, appointments) {
    if (ordersBox) {
      if (!orders.length) {
        ordersBox.textContent = '还没有订单'
      } else {
        var pending = orders.filter(function (order) {
          return order.status === 'CREATED'
        }).length
        ordersBox.textContent = '共 ' + orders.length + ' 笔' + (pending ? ' · ' + pending + ' 笔待支付' : '')
      }
    }
    if (appointmentsBox) {
      if (!appointments.length) {
        appointmentsBox.textContent = '还没有预约'
      } else {
        var upcoming = appointments
          .filter(function (item) {
            return item.status === 'PENDING' || item.status === 'CONFIRMED'
          })
          .sort(function (a, b) {
            return String(a.slot.date + a.slot.startTime).localeCompare(String(b.slot.date + b.slot.startTime))
          })[0]
        var next = ''
        if (upcoming) {
          var days = daysUntil(upcoming.slot.date)
          var when = days === 0 ? '今天' : days === 1 ? '明天' : days === 2 ? '后天' : upcoming.slot.date.slice(5)
          next = ' · 下一次 ' + when + ' ' + upcoming.slot.startTime
        }
        appointmentsBox.textContent = '共 ' + appointments.length + ' 次' + next
      }
    }
  }

  if (live) {
    Promise.all([
      api.get('/orders?page=1&pageSize=50'),
      api.get('/appointments/mine?page=1&pageSize=50'),
      api.get('/check-ins/stats').catch(function () {
        return null
      }),
      api.get('/users/me/favorites?page=1&pageSize=1').catch(function () {
        return null
      }),
    ])
      .then(function (result) {
        fill((result[0] && result[0].items) || [], (result[1] && result[1].items) || [])
        var stats = result[2]
        if (checkinsBox) {
          checkinsBox.textContent = stats && stats.streakDays
            ? '连续 ' + stats.streakDays + ' 天 · 本月 ' + (stats.monthCount || 0) + ' 天'
            : '还没有打卡'
        }
        var favorites = result[3]
        if (favoritesBox) {
          var total = Number((favorites && favorites.pagination && favorites.pagination.totalItems) || 0)
          favoritesBox.textContent = total ? '共 ' + total + ' 篇' : '还没有收藏'
        }
      })
      .catch(function () {
        /* 取不到就留着页面里写的那一句 */
      })
    return
  }

  var store = (function () {
    try {
      return JSON.parse(window.sessionStorage.getItem(KEY) || 'null')
    } catch (error) {
      return null
    }
  })()
  /* 演示模式下这两行跟着示例页面走（打卡页写的是 5 天连续 / 12 天本月，收藏页是三篇） */
  if (checkinsBox) checkinsBox.textContent = '连续 5 天 · 本月 12 天'
  if (favoritesBox) favoritesBox.textContent = '共 3 篇'
  if (!store) return
  fill(store.orders || [], store.appointments || [])
})()
