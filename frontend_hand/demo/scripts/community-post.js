/* 帖子详情（原前端的 `CommunityPostDetailView`）：一条帖子 + 它下面的回应。

   接后端（地址带 `?communityId=&postId=`）：
     · `GET  /communities/{id}/posts/{postId}` → { post, comments }
     · `POST /communities/{id}/posts/{postId}/like` → { liked, likeCount }
     · `POST /communities/{id}/posts/{postId}/comments` { content }
     · `DELETE /communities/{id}/posts/{postId}/comments/{commentId}`（删自己的）
   没有后端（双击打开的设计演示）：页面里写好的示例，点赞与回应在页内真的生效。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live

  var params = new URLSearchParams(window.location.search)
  var communityId = Number(params.get('communityId') || 0)
  var postId = Number(params.get('postId') || 0)

  var timeCell = document.querySelector('[data-post-time]')
  var pinnedChip = document.querySelector('[data-post-pinned]')
  var bodyCell = document.querySelector('[data-post-body]')
  var likeButton = document.querySelector('[data-like]')
  var likeLabel = document.querySelector('[data-like-label]')
  var countCell = document.querySelector('[data-comment-count]')
  var statusLine = document.querySelector('[data-post-status]')
  var list = document.querySelector('[data-comments]')
  var form = document.querySelector('[data-comment-form]')
  var errorLine = document.querySelector('[data-comment-error]')
  var submit = document.querySelector('[data-comment-submit]')
  if (!list || !form) return

  var post = null
  var comments = []
  var busy = false
  /* 演示里那条示例回应算你自己写的，所以有「删除」；接后端时以后端回的 authorId 为准 */
  var mine = live ? null : '1'

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function fail(message) {
    if (!errorLine) return
    errorLine.textContent = message || ''
    errorLine.hidden = !message
  }

  function commentRow(item) {
    var removable = mine !== null && String(item.id) === String(mine)
    return (
      '<li class="comment">' +
      '<span class="comment__face" aria-hidden="true">' + api.esc(String(item.nickname || '?').slice(0, 1)) + '</span>' +
      '<div>' +
      '<p class="comment__who">' + api.esc(item.nickname || '同行的人') +
      ' <span class="comment__time">' + api.esc(api.dateTime(item.createdAt)) + '</span></p>' +
      '<p class="comment__text">' + api.esc(item.content) + '</p>' +
      '</div>' +
      (removable
        ? '<button class="act" type="button" data-remove-comment="' + Number(item.id) + '">删除</button>'
        : '<span></span>') +
      '</li>'
    )
  }

  function draw() {
    list.innerHTML = comments.length
      ? comments.map(commentRow).join('')
      : '<li class="comment"><span class="comment__face" aria-hidden="true">·</span><div>' +
        '<p class="comment__text">还没有人回应。第一条可以只是「我看到了」。</p></div><span></span></li>'
    if (countCell) countCell.textContent = String(comments.length)
    if (!post) return
    if (bodyCell) bodyCell.textContent = post.content
    if (timeCell) timeCell.textContent = api.dateTime(post.createdAt)
    if (pinnedChip) pinnedChip.hidden = !post.isPinned
    if (likeLabel) likeLabel.textContent = (post.liked ? '已赞 ' : '赞 ') + post.likeCount
    if (likeButton) likeButton.setAttribute('aria-pressed', post.liked ? 'true' : 'false')
  }

  function toggleLike() {
    if (!post || busy) return
    busy = true
    var request = live
      ? api.post('/communities/' + communityId + '/posts/' + postId + '/like')
      : Promise.resolve({ liked: !post.liked, likeCount: post.likeCount + (post.liked ? -1 : 1) })
    request
      .then(function (data) {
        post.liked = !!data.liked
        post.likeCount = Number(data.likeCount) || 0
        draw()
        say(post.liked ? '已点赞。' : '已取消点赞。')
      })
      .catch(function (error) {
        say((error && error.message) || '点赞没成功。')
      })
      .then(function () {
        busy = false
      })
  }

  function addComment(content) {
    if (busy) return
    busy = true
    fail('')
    if (submit) submit.disabled = true
    var request = live
      ? api.post('/communities/' + communityId + '/posts/' + postId + '/comments', { content: content })
      : Promise.resolve({
          id: String(Date.now() % 100000),
          nickname: '小满',
          content: content,
          createdAt: new Date().toISOString(),
        })
    request
      .then(function (comment) {
        comments = comments.concat([comment])
        if (mine === null) mine = comment.id
        form.reset()
        draw()
        say('回应已发出。')
      })
      .catch(function (error) {
        fail((error && error.message) || '没发出去，再试一次。')
      })
      .then(function () {
        busy = false
        if (submit) submit.disabled = false
      })
  }

  function removeComment(id) {
    if (busy) return
    busy = true
    var request = live
      ? api.del('/communities/' + communityId + '/posts/' + postId + '/comments/' + Number(id))
      : Promise.resolve()
    request
      .then(function () {
        comments = comments.filter(function (item) {
          return String(item.id) !== String(id)
        })
        draw()
        say('这条回应已删除。')
      })
      .catch(function (error) {
        say((error && error.message) || '删除没成功。')
      })
      .then(function () {
        busy = false
      })
  }

  list.addEventListener('click', function (event) {
    var button = event.target.closest('[data-remove-comment]')
    if (button) removeComment(button.getAttribute('data-remove-comment'))
  })

  if (likeButton) likeButton.addEventListener('click', toggleLike)

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    var content = form.elements.content.value.trim()
    if (content.length < 2) {
      fail('写一两个字也算，最少 2 个字。')
      form.elements.content.focus()
      return
    }
    if (content.length > 500) {
      fail('一条回应最多 500 字。')
      return
    }
    addComment(content)
  })

  if (live) {
    api
      .get('/communities/' + communityId + '/posts/' + postId)
      .then(function (data) {
        post = data.post
        comments = data.comments || []
        mine = null
        draw()
        say('已连后端，显示的是真实帖子。')
      })
      .catch(function (error) {
        say((error && error.message) || '帖子没读出来。')
      })
  } else {
    /* 设计演示里两条帖子各有一份写好的样子（社群详情那两页就链到这两份上） */
    var examples = {
      1: {
        author: '小满',
        content: '今天把一个能拖了三个月的表格交了。没有变厉害，只是把它切成了三块，每块二十分钟。',
        createdAt: '2026-10-10T21:14:00',
        likeCount: 3,
        isPinned: true,
        comments: [
          {
            id: '1',
            nickname: '阿禾',
            content: '切成三块这个办法我记下了。二十分钟一段，我大概也能开始。',
            createdAt: '2026-10-10T22:02:00',
          },
        ],
      },
      2: {
        author: '阿禾',
        content: '面试挂了第三次。现在最想做的不是复盘，是找个地方把这些话说出来。谢谢这里。',
        createdAt: '2026-10-09T18:02:00',
        likeCount: 8,
        isPinned: false,
        comments: [
          {
            id: '2',
            nickname: '小满',
            content: '三次都去面了，这件事本身就不容易。先歇一晚，明天再说复盘。',
            createdAt: '2026-10-09T19:10:00',
          },
          {
            id: '3',
            nickname: '晚风',
            content: '我上次也是第三家才成。挂掉的那几家后来看，其实都不太合适。',
            createdAt: '2026-10-09T20:35:00',
          },
        ],
      },
    }
    var example = examples[postId] || examples[1]
    post = {
      content: example.content,
      createdAt: example.createdAt,
      liked: false,
      likeCount: example.likeCount,
      isPinned: example.isPinned,
    }
    comments = example.comments
    var faceCell = document.querySelector('.comment__face')
    var whoCell = document.querySelector('.post__who')
    if (faceCell) faceCell.textContent = example.author.slice(0, 1)
    if (whoCell) whoCell.textContent = example.author
    draw()
    say('设计演示：点赞与回应会真的生效，刷新回到示例。')
  }
})()
