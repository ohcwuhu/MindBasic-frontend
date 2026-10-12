/* 和教练的私信（原前端的 `ChatView`）：会话列表 + 这一次的来往 + 说一句。

   接后端：
     · `GET  /chat/conversations` → 会话列表（peerNickname / lastMessagePreview /
       lastMessageAt / unreadCount / coachReplyCount / freeLimit / limitReached）
     · `GET  /chat/conversations/{id}/messages` → { items }
     · `POST /chat/conversations/{id}/messages` { content }
     · `POST /chat/conversations/{id}/read` —— 打开会话时标已读
   原前端还挂着 socket（`chat:join` / `chat:send` / `chat:message`）做实时；
   演示站这一页先走 POST + 刷新，实时那一层接回原前端时用它自己的实现。
   没有后端：页面里写好的示例，发送在页内生效。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live

  var peerCell = document.querySelector('[data-peer]')
  var threadNote = document.querySelector('[data-thread-note]')
  var list = document.querySelector('[data-messages]')
  var convList = document.querySelector('[data-conversations]')
  var convCount = document.querySelector('[data-conv-count]')
  var limitBanner = document.querySelector('[data-limit]')
  var limitText = document.querySelector('[data-limit-text]')
  var form = document.querySelector('[data-send]')
  var errorLine = document.querySelector('[data-send-error]')
  var submit = document.querySelector('[data-send-submit]')
  var statusLine = document.querySelector('[data-status]')
  if (!list || !form) return

  var conversations = []
  var activeId = 0
  var messages = []
  var busy = false

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
    return (
      String(date.getMonth() + 1).padStart(2, '0') +
      '/' +
      String(date.getDate()).padStart(2, '0') +
      ' ' +
      String(date.getHours()).padStart(2, '0') +
      ':' +
      String(date.getMinutes()).padStart(2, '0')
    )
  }

  function active() {
    return conversations.filter(function (item) {
      return Number(item.id) === Number(activeId)
    })[0]
  }

  function drawThread() {
    list.innerHTML = messages.length
      ? messages
          .map(function (item) {
            var mine = item.senderRole === 'USER'
            return (
              '<div class="convo__msg convo__msg--' + (mine ? 'mine' : 'they') + '">' +
              '<div class="convo__bubble">' + api.esc(item.content) + '</div>' +
              '<div class="convo__meta"><span>' + api.esc(clock(item.createdAt)) + '</span></div>' +
              '</div>'
            )
          })
          .join('')
      : '<p class="panel__note">这一位还没有消息。说第一句吧。</p>'

    var conv = active()
    if (peerCell && conv) peerCell.textContent = conv.peerNickname || '教练'
    if (threadNote && conv) {
      threadNote.textContent = conv.lastMessageAt ? '最近一次 ' + api.dateTime(conv.lastMessageAt) : '还没有消息'
    }
    /* 免费额度用完时照原版说清楚：还能不能回、下一步去哪 */
    var blocked = conv && !conv.unlocked && Number(conv.coachReplyCount) >= Number(conv.freeLimit)
    if (limitBanner) limitBanner.hidden = !blocked
    if (blocked && limitText) {
      limitText.textContent = '这一轮的免费咨询已经用完（教练回了 ' + conv.coachReplyCount + ' 条）。' +
        '想继续聊，可以看这位教练的服务与可约时段。'
    }
    if (submit) submit.disabled = !!blocked || busy
  }

  function drawConversations() {
    if (!convList) return
    convList.innerHTML = conversations
      .map(function (conv) {
        var current = Number(conv.id) === Number(activeId)
        return (
          '<li><button class="row' + (current ? ' is-current' : '') + '" type="button" data-conv="' + Number(conv.id) +
          '" aria-pressed="' + (current ? 'true' : 'false') + '">' +
          '<img class="row__art" src="' + api.symbol(conv.coachId || conv.id) + '" width="419" height="560" alt="" aria-hidden="true" />' +
          '<span><span class="row__title">' + api.esc(conv.peerNickname || '教练') + '</span>' +
          '<span class="row__meta">' + api.esc(conv.lastMessagePreview || '还没有消息') + '</span></span>' +
          '<span class="row__side">' +
          (conv.unreadCount ? '<span class="chip chip--yellow">' + Number(conv.unreadCount) + '</span>' : '') +
          '<span class="cpost__meta">' + api.esc(clock(conv.lastMessageAt)) + '</span></span>' +
          '</button></li>'
        )
      })
      .join('')
    if (convCount) convCount.textContent = conversations.length + ' 位'
  }

  function open(id) {
    activeId = Number(id)
    if (!live) {
      messages = examples[activeId] || []
      drawConversations()
      drawThread()
      say('设计演示：这两位教练的会话是示例，发送会在页内生效。')
      return
    }
    messages = []
    drawThread()
    say('正在读取这一位的消息…')
    api
      .get('/chat/conversations/' + activeId + '/messages')
      .then(function (data) {
        messages = (data && data.items) || []
        drawThread()
        say('')
        return api.post('/chat/conversations/' + activeId + '/read').catch(function () {
          /* 已读失败不算事 */
        })
      })
      .catch(function (error) {
        say((error && error.message) || '消息没读出来。')
      })
  }

  function send(content) {
    if (busy || !activeId) return
    var conv = active()
    if (conv && !conv.unlocked && Number(conv.coachReplyCount) >= Number(conv.freeLimit)) {
      fail('这一轮的免费咨询已经用完，先去教练档案看看服务。')
      return
    }
    busy = true
    fail('')
    if (submit) submit.disabled = true
    var optimistic = {
      id: 'local-' + Date.now(),
      senderRole: 'USER',
      content: content,
      createdAt: new Date().toISOString(),
    }
    var request = live
      ? api.post('/chat/conversations/' + activeId + '/messages', { content: content })
      : Promise.resolve(optimistic)
    request
      .then(function (message) {
        messages = messages.concat([message || optimistic])
        if (conv) {
          conv.lastMessagePreview = content
          conv.lastMessageAt = (message || optimistic).createdAt
        }
        form.reset()
        drawThread()
        drawConversations()
        say('发出去了。教练回你之后会出现在这里。')
      })
      .catch(function (error) {
        fail((error && error.message) || '没发出去，再试一次。')
      })
      .then(function () {
        busy = false
        if (submit) submit.disabled = false
      })
  }

  if (convList) {
    convList.addEventListener('click', function (event) {
      var button = event.target.closest('[data-conv]')
      if (button) open(button.getAttribute('data-conv'))
    })
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    var content = form.elements.content.value.trim()
    if (!content) {
      fail('先写一句再发。')
      form.elements.content.focus()
      return
    }
    if (content.length > 500) {
      fail('一条消息最多 500 字。')
      return
    }
    send(content)
  })

  var examples = {
    1: [
      {
        id: '1',
        senderRole: 'COACH',
        content: '今天那一段里，你提到「一想到就心跳快」。下次可以试着在那半分钟里只管呼吸，不急着评价自己。',
        createdAt: '2026-10-11T20:31:00',
      },
      { id: '2', senderRole: 'USER', content: '好，我记下来了。今天试了两次，第二次没那么快。', createdAt: '2026-10-11T21:02:00' },
    ],
    2: [
      { id: '3', senderRole: 'USER', content: '下周二那个时间我看了，可以的。', createdAt: '2026-10-10T19:20:00' },
      { id: '4', senderRole: 'COACH', content: '那我们就约在下周二 10:00，提前一天我会再提醒你一次。', createdAt: '2026-10-10T19:41:00' },
    ],
  }

  if (live) {
    api
      .get('/chat/conversations')
      .then(function (data) {
        conversations = Array.isArray(data) ? data : (data && data.items) || []
        if (!conversations.length) {
          list.innerHTML = '<p class="panel__note">还没有会话。预约过教练之后，就能在这里私信。</p>'
          if (convList) convList.innerHTML = api.emptyItem('还没有会话', '在教练档案里私信一次，会话会留在这里。')
          say('还没有会话。')
          return
        }
        activeId = Number(conversations[0].id)
        drawConversations()
        open(activeId)
      })
      .catch(function (error) {
        say((error && error.message) || '会话没读出来。')
      })
  } else {
    conversations = [
      { id: 1, coachId: 1, peerNickname: '知夏', lastMessagePreview: '今天试了两次，第二次没那么快。', lastMessageAt: '2026-10-11T21:02:00', unreadCount: 0, coachReplyCount: 1, freeLimit: 6, unlocked: false },
      { id: 2, coachId: 2, peerNickname: '林深', lastMessagePreview: '那我们就约在下周二 10:00。', lastMessageAt: '2026-10-10T19:41:00', unreadCount: 1, coachReplyCount: 4, freeLimit: 4, unlocked: false },
    ]
    activeId = 1
    drawConversations()
    open(1)
  }
})()
