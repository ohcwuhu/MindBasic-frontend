/* 自我教练历史：接后端时用 `/self-coaching/records` 与 `/ai-conversations` 的真记录重绘。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var list = document.querySelector('.rows')
  var note = document.querySelector('.panel__note')
  if (!list) return

  function art(index) {
    var pool = ['mascot-listen', 'mascot-think', 'mascot-comfort', 'mascot-happy']
    return 'assets/' + pool[index % pool.length] + '.webp'
  }

  Promise.all([
    api.get('/self-coaching/records?page=1&pageSize=50').catch(function () {
      return { items: [] }
    }),
    api.get('/ai-conversations?page=1&pageSize=20').catch(function () {
      return { items: [] }
    }),
  ])
    .then(function (results) {
      var records = (results[0] && results[0].items) || []
      var conversations = (results[1] && results[1].items) || []
      var rows = []

      records.forEach(function (record, index) {
        rows.push(
          '<li><a class="row" href="self-coaching-record.html?record=' + record.id + '">' +
            '<img class="row__art" src="' + art(index) + '" width="450" height="640" alt="" aria-hidden="true" />' +
            '<span><span class="row__title">' + api.esc(record.title || record.summary || '自我教练记录') + '</span>' +
            '<span class="row__meta">' + api.esc(api.dateTime(record.createdAt)) + '</span></span>' +
            '<span class="row__side"><span class="chip chip--green">已生成行动卡</span></span></a></li>',
        )
      })
      conversations.forEach(function (conversation, index) {
        rows.push(
          '<li><a class="row" href="ai-conversation.html?id=' + conversation.id + '">' +
            '<img class="row__art" src="' + art(index + 1) + '" width="450" height="640" alt="" aria-hidden="true" />' +
            '<span><span class="row__title">' + api.esc(conversation.title || '自我教练对话') + '</span>' +
            '<span class="row__meta">' + api.esc(api.dateTime(conversation.createdAt)) + ' · ' +
            (conversation.turnCount || 0) + ' 轮</span></span>' +
            '<span class="row__side"><span class="chip">' + api.esc(conversation.status === 'ABANDONED' ? '未完成' : '已结束') + '</span></span></a></li>',
        )
      })

      if (!rows.length) {
        list.outerHTML = api.empty('还没有对话记录', '去「自我教练」聊一次，记录会自动留在这里。')
        if (note) note.textContent = '0 次对话'
        return
      }
      list.innerHTML = rows.join('')
      if (note) note.textContent = records.length + ' 份行动卡 · ' + conversations.length + ' 次对话'
    })
    .catch(function (error) {
      api.fail(list, error)
    })
})()
