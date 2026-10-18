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

  /* 两个来源各自成败：一个挂了不能写成「没有记录」，也不能把另一个也拖成空的 */
  function load(path) {
    return api
      .get(path)
      .then(function (data) {
        if (!data || !Array.isArray(data.items)) throw new Error('列表数据不完整')
        return { items: data.items }
      })
      .catch(function (error) {
        return { failed: true, message: (error && error.message) || '读取失败' }
      })
  }

  Promise.all([load('/self-coaching/records?page=1&pageSize=50'), load('/ai-conversations?page=1&pageSize=20')])
    .then(function (results) {
      var records = (results[0] && results[0].items) || []
      var conversations = (results[1] && results[1].items) || []
      var incomplete = []
      if (results[0].failed) incomplete.push('自我教练记录')
      if (results[1].failed) incomplete.push('AI 对话')
      var rows = []

      records.forEach(function (record, index) {
        var done = record.status !== 'DRAFT'
        rows.push(
          '<li><a class="row" href="self-coaching-record.html?record=' + record.id + '">' +
            '<img class="row__art" src="' + art(index) + '" width="450" height="640" alt="" aria-hidden="true" />' +
            '<span><span class="row__title">' + api.esc(record.templateName || '自我教练记录') + '</span>' +
            '<span class="row__meta">' + api.esc(api.dateTime(record.createdAt)) + '</span></span>' +
            '<span class="row__side"><span class="chip ' + (done ? 'chip--green' : 'chip--yellow') + '">' +
            (done ? '已生成行动卡' : '还没写完') + '</span></span></a></li>',
        )
      })
      conversations.forEach(function (conversation, index) {
        var inJournal = conversation.journalId !== null && conversation.journalId !== undefined
        rows.push(
          '<li><a class="row" href="ai-conversation.html?id=' + conversation.id + '">' +
            '<img class="row__art" src="' + art(index + 1) + '" width="450" height="640" alt="" aria-hidden="true" />' +
            '<span><span class="row__title">' + api.esc(conversation.title || '自我教练对话') + '</span>' +
            '<span class="row__meta">' + api.esc(api.dateTime(conversation.createdAt)) + ' · ' +
            (conversation.turnCount || 0) + ' 轮' +
            (conversation.finalStageLabel ? ' · ' + api.esc(conversation.finalStageLabel) : '') + '</span></span>' +
            '<span class="row__side"><span class="chip ' + (inJournal ? 'chip--green' : '') + '">' +
            api.esc(inJournal ? '已记进日记' : conversation.status === 'ABANDONED' ? '中途断开' : '还没收束') + '</span></span></a></li>',
        )
      })

      if (!rows.length) {
        /* 只有两边都真的读到了、而且真的都是空的，才敢说「还没有」 */
        if (incomplete.length) {
          api.fail(list, new Error('记录没能完整读取（' + incomplete.join('、') + '），现在不能确认是否为空。'))
          if (note) note.textContent = '读取不完整'
          return
        }
        list.outerHTML = api.empty('还没有对话记录', '去「自我教练」聊一次，记录会自动留在这里。')
        if (note) note.textContent = '0 份记录 · 0 次对话'
        return
      }
      list.innerHTML = rows.join('')
      if (note) {
        note.textContent =
          records.length + ' 份记录 · ' + conversations.length + ' 次对话' +
          (incomplete.length ? '（' + incomplete.join('、') + '还没读到）' : '')
      }
    })
    .catch(function (error) {
      api.fail(list, error)
    })
})()
