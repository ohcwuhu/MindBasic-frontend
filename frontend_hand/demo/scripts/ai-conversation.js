/* AI 会话回看（原前端的 `SelfCoachingHistoryDetailView`）：
   这一次聊过的每一句 + 当时的情绪，以及「总结并加入情绪日记」。

   接后端（地址带 `?id=<conversationId>`）：
     · `GET  /ai-conversations/{id}` → { conversation, messages[] }
     · `POST /ai-conversations/{id}/summary` → { moodType, content, conversationId }
       拿到草稿后跳到情绪日记页（带 mood / content / conversationId —— 原版就是这么走的）
   没有后端（设计演示）：页面里写好的示例对话，「总结」这一步如实说明需要后端。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live
  var conversationId = Number(new URLSearchParams(window.location.search).get('id') || 0)

  var titleCell = document.querySelector('[data-convo-title]')
  var metaCell = document.querySelector('[data-convo-meta]')
  var list = document.querySelector('[data-messages]')
  var summaryButton = document.querySelector('[data-summary]')
  var errorLine = document.querySelector('[data-summary-error]')
  var statusLine = document.querySelector('[data-summary-status]')
  if (!list) return

  var messages = []
  var busy = false
  var journalCreated = false

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function fail(message) {
    if (!errorLine) return
    errorLine.textContent = message || ''
    errorLine.hidden = !message
  }

  function clock(iso) {
    var date = new Date(iso)
    if (isNaN(date.getTime())) return ''
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
  }

  function emotion(emotionValue) {
    var value = emotionValue && (emotionValue.fusion_emotion_cn || emotionValue.emotion_cn)
    return typeof value === 'string' ? value : ''
  }

  function messageBlock(item) {
    var mine = item.role === 'USER'
    return (
      '<div class="convo__msg convo__msg--' + (mine ? 'mine' : 'they') + '">' +
      '<div class="convo__bubble">' + api.esc(item.content) + '</div>' +
      '<div class="convo__meta">' +
      (mine ? '' : '<span class="chip chip--green">AI 生成</span>') +
      (emotion(item.emotion) ? '<span>' + api.esc(emotion(item.emotion)) + '</span>' : '') +
      '<span>' + api.esc(clock(item.createdAt)) + '</span>' +
      '</div></div>'
    )
  }

  function draw() {
    list.innerHTML = messages.length
      ? messages.map(messageBlock).join('')
      : '<p class="panel__note">这次会话没有留下消息。</p>'
  }

  function drawSummary() {
    if (!summaryButton || !journalCreated) return
    summaryButton.textContent = '已生成情绪日记'
    summaryButton.disabled = true
    say('这次会话已经总结进情绪日记了。')
  }

  function summarize() {
    if (busy || journalCreated) return
    if (!live || !conversationId) {
      say('设计演示里这一步需要后端：接上后端、登录之后，这里会把这次会话总结成一条日记草稿。')
      return
    }
    busy = true
    fail('')
    summaryButton.disabled = true
    summaryButton.textContent = '总结中…'
    say('正在把这次会话总结成一条日记草稿…')
    api
      .post('/ai-conversations/' + conversationId + '/summary')
      .then(function (draft) {
        window.location.href =
          'emotion-journal.html?mood=' +
          encodeURIComponent(draft.moodType) +
          '&content=' +
          encodeURIComponent(draft.content) +
          '&conversationId=' +
          encodeURIComponent(draft.conversationId)
      })
      .catch(function (error) {
        fail((error && error.message) || '总结没成功，再试一次。')
        summaryButton.disabled = false
        summaryButton.textContent = '总结并加入情绪日记'
      })
      .then(function () {
        busy = false
      })
  }

  if (summaryButton) summaryButton.addEventListener('click', summarize)

  if (live && conversationId) {
    api
      .get('/ai-conversations/' + conversationId)
      .then(function (data) {
        var conversation = data.conversation || {}
        messages = data.messages || []
        if (titleCell) titleCell.textContent = conversation.title || '这次会话'
        if (metaCell) {
          metaCell.textContent =
            api.dateTime(conversation.createdAt) + ' · ' + (conversation.messageCount || messages.length) + ' 条消息'
        }
        journalCreated = conversation.journalId !== null && conversation.journalId !== undefined
        draw()
        drawSummary()
        if (!journalCreated) say('可以把这次会话总结成一条日记草稿。')
      })
      .catch(function (error) {
        say((error && error.message) || '这次会话没读出来。')
      })
  } else {
    draw()
    say('设计演示：这几句是示例对话。')
  }
})()
