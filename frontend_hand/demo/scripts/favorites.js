/* 我的收藏（原前端的 `/profile/favorites`）：读过、想再读一遍的文章。

   接后端：`GET /users/me/favorites?page=1&pageSize=50` → { items }（文章摘要）
           `POST /articles/{id}/favorite` 是**切换**收藏，所以这里的「取消收藏」也走它，
           成功后把这一行从列表里去掉。
   没有后端：页面里写好的三篇示例，取消收藏在页内真的生效（刷新回到示例）。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live
  var COVERS = ['cat-emotion', 'cat-study', 'cat-relation', 'cat-growth', 'cat-crisis', 'cat-story']

  var list = document.querySelector('[data-list]')
  var countCell = document.querySelector('[data-count]')
  var statusLine = document.querySelector('[data-status]')
  if (!list) return

  var items = []
  var busy = false

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function cover(article) {
    var index = Math.abs(Number(article.categoryId) || Number(article.id) || 0) % COVERS.length
    return 'assets/' + COVERS[index] + '.webp'
  }

  function row(article) {
    var meta = [article.categoryName || '成长文章', article.publishedAt ? api.dateTime(article.publishedAt) : '']
      .filter(Boolean)
      .join(' · ')
    var href = 'article-detail.html' + (live ? '?id=' + Number(article.id) : '')
    return (
      '<li class="fav">' +
      '<img class="fav__art" src="' + cover(article) + '" width="560" height="560" alt="" aria-hidden="true" />' +
      '<div>' +
      '<a class="fav__title" href="' + href + '">' + api.esc(article.title) + '</a>' +
      '<p class="fav__meta">' + api.esc(meta) + '</p>' +
      '<p class="fav__acts">' +
      '<a class="link-quiet" href="' + href + '">再读一遍</a>' +
      '<button class="act" type="button" data-unfavorite="' + Number(article.id) + '">取消收藏</button>' +
      '</p></div></li>'
    )
  }

  function draw() {
    list.innerHTML = items.length
      ? items.map(row).join('')
      : api.empty('还没有收藏', '在文章页点一下收藏，读过的东西会留在这里。')
    if (countCell) countCell.textContent = items.length + ' 篇'
  }

  function unfavorite(id, button) {
    if (busy) return
    busy = true
    if (button) button.disabled = true
    var request = live ? api.post('/articles/' + Number(id) + '/favorite') : Promise.resolve({ isFavorite: false })
    request
      .then(function () {
        items = items.filter(function (article) {
          return Number(article.id) !== Number(id)
        })
        draw()
        say('已取消收藏。')
      })
      .catch(function (error) {
        if (button) button.disabled = false
        say((error && error.message) || '取消收藏没成功，再试一次。')
      })
      .then(function () {
        busy = false
        if (statusLine && statusLine.focus) statusLine.focus()
      })
  }

  list.addEventListener('click', function (event) {
    var button = event.target.closest('[data-unfavorite]')
    if (button) unfavorite(button.getAttribute('data-unfavorite'), button)
  })

  if (live) {
    api
      .get('/users/me/favorites?page=1&pageSize=50')
      .then(function (data) {
        items = (data && data.items) || []
        draw()
        say(items.length ? '这是你收藏过的文章。' : '还没有收藏。')
      })
      .catch(function (error) {
        say((error && error.message) || '收藏没读出来。')
      })
  } else {
    items = [
      { id: 1, title: '焦虑先到的时候，先做三件小事', categoryName: '情绪调节', publishedAt: '2026-09-28T09:00:00', categoryId: 0 },
      { id: 2, title: '把一件大事切成二十分钟一块', categoryName: '学习方法', publishedAt: '2026-10-02T09:00:00', categoryId: 1 },
      { id: 3, title: '室友那件事，我是怎么开口的', categoryName: '人际关系', publishedAt: '2026-09-19T09:00:00', categoryId: 2 },
    ]
    draw()
    say('设计演示：取消收藏会真的生效，刷新回到示例。')
  }
})()
