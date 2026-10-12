/* 社群详情：按 `?id=`（没有就取列表里的第一个）取 `GET /communities/{id}`，
   加入 / 退出 `POST /communities/{id}/join|leave`，帖子 `GET|POST /communities/{id}/posts`，
   点赞 `POST /communities/{id}/posts/{postId}/like`。

   两个后端细节照实处理：
   · 帖子接口要成员身份（非成员 403），所以没加入时这一页只显示「加入之后能看什么」；
   · join / leave / like 回的是 snake_case（`member_count` / `like_count`，裸 dict 没过模型），
     而 detail 与 posts 回的是 camelCase —— 这里两边都认。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var PAGE_SIZE = 10
  var COVERS = ['cat-emotion', 'cat-study', 'cat-relation', 'cat-growth', 'cat-crisis', 'cat-story']

  var nameBoxes = document.querySelectorAll('[data-name]')
  var descBoxes = document.querySelectorAll('[data-desc]')
  var crumb = document.querySelector('[data-crumb]')
  var art = document.querySelector('[data-art]')
  var meta = document.querySelector('[data-meta]')
  var stateChip = document.querySelector('[data-state]')
  var joinButton = document.querySelector('[data-join]')
  var note = document.querySelector('[data-note]')
  var countBox = document.querySelector('[data-count]')
  var composer = document.querySelector('[data-composer]')
  var postForm = document.querySelector('[data-post-form]')
  var postError = document.querySelector('[data-post-error]')
  var postSubmit = document.querySelector('[data-post-submit]')
  var posts = document.querySelector('[data-posts]')
  var pagerCount = document.querySelector('[data-pager-count]')
  var prevButton = document.querySelector('[data-prev]')
  var nextButton = document.querySelector('[data-next]')

  var wanted = Number(new URLSearchParams(window.location.search).get('id') || 0)
  var communityId = wanted
  var community = null
  var state = { page: 1 }
  var lastPagination = {}

  function setText(nodes, value) {
    Array.prototype.forEach.call(nodes, function (node) {
      node.textContent = value
    })
  }

  function showNote(message, danger) {
    note.innerHTML = message ? api.note(message, danger) : ''
    note.hidden = !message
  }

  function members(count) {
    return Number(count) || 0
  }

  /* ---- 抬头 ---- */
  function drawCommunity(data) {
    community = data
    communityId = data.id
    setText(nameBoxes, data.name || '社群')
    setText(descBoxes, data.description || '')
    if (crumb) crumb.textContent = data.name || '社群'
    document.title = (data.name || '社群') + ' · 斐思同行'
    if (art && !data.coverUrl) {
      art.src = 'assets/' + COVERS[Math.abs(Number(data.id) || 0) % COVERS.length] + '.webp'
    } else if (art && data.coverUrl) {
      art.src = data.coverUrl
    }
    meta.textContent =
      '加入 ' +
      members(data.memberCount) +
      ' 人 · 上限 ' +
      members(data.maxMembers) +
      ' 人' +
      (data.coachNickname ? ' · 带组教练 ' + data.coachNickname : '')

    stateChip.textContent = data.joined ? '已加入' : '未加入'
    stateChip.className = 'chip' + (data.joined ? ' chip--green' : '')
    joinButton.textContent = data.joined ? '退出社群' : '加入社群'
    joinButton.className = 'btn btn--small' + (data.joined ? ' btn--paper' : '')
    composer.hidden = !data.joined
  }

  function loadCommunity() {
    var request = communityId
      ? api.get('/communities/' + communityId)
      : api.get('/communities?page=1&pageSize=1').then(function (data) {
          var first = ((data && data.items) || [])[0]
          if (!first) throw new Error('平台上还没有开放的社群。')
          return api.get('/communities/' + first.id)
        })
    return request.then(drawCommunity)
  }

  /* ---- 帖子 ---- */
  function face(post) {
    return (
      '<span class="cpost__face"><img src="' +
      api.symbol(post.userId) +
      '" width="384" height="560" alt="" aria-hidden="true" /></span>'
    )
  }

  function postItem(post) {
    return (
      '<li class="cpost" data-id="' +
      post.id +
      '">' +
      '<div class="cpost__head">' +
      face(post) +
      '<span class="cpost__who">' +
      api.esc(post.nickname || '有人') +
      '</span>' +
      (post.isPinned ? '<span class="chip chip--yellow">置顶</span>' : '') +
      '<span class="cpost__time">' +
      api.esc(api.dateTime(post.createdAt)) +
      '</span>' +
      '</div>' +
      '<p class="cpost__body">' +
      api.esc(post.content || '') +
      '</p>' +
      (post.imageUrl
        ? '<img class="cpost__image" src="' + api.esc(post.imageUrl) + '" alt="" aria-hidden="true" />'
        : '') +
      '<p class="cpost__acts">' +
      '<button class="act" type="button" data-like>' +
      (post.liked ? '已赞 ' : '赞 ') +
      (Number(post.likeCount) || 0) +
      '</button>' +
      '<span class="cpost__meta">' +
      (Number(post.commentCount) || 0) +
      ' 条回复</span>' +
      '<a class="act" href="community-post.html?communityId=' +
      communityId +
      '&amp;postId=' +
      post.id +
      '">看这条</a>' +
      '</p>' +
      '</li>'
    )
  }

  function loadPosts() {
    posts.innerHTML =
      '<li aria-hidden="true"><span class="skl" style="--skl-w:68%"></span></li>' +
      '<li aria-hidden="true"><span class="skl" style="--skl-w:44%"></span></li>'
    countBox.textContent = '读取中…'
    pagerCount.textContent = ''
    prevButton.disabled = true
    nextButton.disabled = true

    return api
      .get('/communities/' + communityId + '/posts?page=' + state.page + '&pageSize=' + PAGE_SIZE)
      .then(function (data) {
        var items = (data && data.items) || []
        lastPagination = (data && data.pagination) || {}
        posts.innerHTML = items.length
          ? items.map(postItem).join('')
          : api.emptyItem('组里还很安静', '第一条说不一定要说得好，把今天发生的事写下来就行。')

        var total = Number(lastPagination.totalItems) || 0
        var pages = Math.max(1, Number(lastPagination.totalPages) || 1)
        countBox.textContent = '共 ' + total + ' 条'
        pagerCount.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 条'
        prevButton.disabled = state.page <= 1
        nextButton.disabled = state.page >= pages
      })
      .catch(function (error) {
        /* 非成员会 403（后端只让成员看帖），那就把「加入之后能看什么」说清楚 */
        lastPagination = {}
        countBox.textContent = ''
        pagerCount.textContent = ''
        posts.innerHTML = api.emptyItem(
          '加入之后才看得到组里的帖子',
          error.message || '这个组的帖子只对成员开放。',
        )
      })
  }

  function notMember() {
    lastPagination = {}
    countBox.textContent = ''
    pagerCount.textContent = ''
    prevButton.disabled = true
    nextButton.disabled = true
    posts.innerHTML = api.emptyItem('加入之后才看得到组里的帖子', '组里的内容只对成员开放，加入也能自己发一条。')
  }

  /* ---- 加入 / 退出 ---- */
  joinButton.addEventListener('click', function () {
    if (!community) return
    var leaving = Boolean(community.joined)
    var path = '/communities/' + communityId + '/' + (leaving ? 'leave' : 'join')
    joinButton.disabled = true
    joinButton.textContent = leaving ? '退出中…' : '加入中…'
    showNote('')
    api
      .post(path, {})
      .then(function (data) {
        /* join / leave 回的是 snake_case 的裸 dict */
        community.joined = data && data.joined !== undefined ? data.joined : !leaving
        if (data && data.member_count !== undefined) community.memberCount = data.member_count
        drawCommunity(community)
        showNote(community.joined ? '已经加入，下面就能发帖了。' : '已退出这个社群。')
        state.page = 1
        if (community.joined) return loadPosts()
        notMember()
      })
      .catch(function (error) {
        drawCommunity(community)
        showNote(error.message, true)
      })
      .then(function () {
        joinButton.disabled = false
      })
  })

  /* ---- 发帖 ---- */
  postForm.addEventListener('submit', function (event) {
    event.preventDefault()
    var box = postForm.querySelector('#content')
    var text = box.value.trim()
    postError.hidden = true
    if (!text) {
      postError.textContent = '先写一句再发 —— 空帖子发出去也没意义。'
      postError.hidden = false
      box.focus()
      return
    }
    postSubmit.disabled = true
    postSubmit.textContent = '发布中…'
    api
      .post('/communities/' + communityId + '/posts', { content: text })
      .then(function () {
        box.value = ''
        state.page = 1
        return loadPosts()
      })
      .catch(function (error) {
        postError.textContent = error.message
        postError.hidden = false
      })
      .then(function () {
        postSubmit.disabled = false
        postSubmit.textContent = '发布'
      })
  })

  /* ---- 点赞：就地改那一颗，不重取整页 ---- */
  posts.addEventListener('click', function (event) {
    var button = event.target.closest('[data-like]')
    if (!button) return
    var row = button.closest('[data-id]')
    var postId = row ? row.getAttribute('data-id') : ''
    button.disabled = true
    api
      .post('/communities/' + communityId + '/posts/' + postId + '/like', {})
      .then(function (data) {
        var liked = Boolean(data && data.liked)
        var total = Number(data && data.like_count)
        if (!isFinite(total)) total = 0
        button.textContent = (liked ? '已赞 ' : '赞 ') + total
      })
      .catch(function (error) {
        var box = row && row.querySelector('.cpost__acts')
        if (box) box.innerHTML += ' ' + api.note(error.message, true)
      })
      .then(function () {
        button.disabled = false
      })
  })

  prevButton.addEventListener('click', function () {
    if (state.page <= 1) return
    state.page -= 1
    loadPosts()
  })

  nextButton.addEventListener('click', function () {
    state.page += 1
    loadPosts()
  })

  loadCommunity()
    .then(function () {
      if (community && community.joined) return loadPosts()
      notMember()
    })
    .catch(function (error) {
      note.hidden = false
      note.innerHTML = api.note(error.message, true)
      notMember()
    })
})()
