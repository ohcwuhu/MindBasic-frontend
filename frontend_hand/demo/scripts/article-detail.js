/* 文章详情：接后端时按 `?id=` 取真文章（没有 id 就用列表里的第一篇），
   填标题、面包屑、分类/日期与正文（后端正文本身就是 HTML）。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var prose = document.querySelector('.prose')
  if (!prose) return

  var params = new URLSearchParams(window.location.search)
  var wanted = Number(params.get('id') || 0)
  var favoriteButton = document.querySelector('[data-favorite]')
  var favoriteNote = document.querySelector('[data-favorite-note]')
  var currentArticleId = 0
  var favoriteBusy = false

  function hasToken() {
    try {
      return Boolean(window.localStorage.getItem('mb_access_token'))
    } catch (error) {
      return false
    }
  }

  function setFavoriteState(isFavorite) {
    if (!favoriteButton) return
    favoriteButton.dataset.favorite = isFavorite ? '1' : '0'
    favoriteButton.setAttribute('aria-pressed', isFavorite ? 'true' : 'false')
    favoriteButton.textContent = isFavorite ? '已收藏' : '加入收藏'
  }

  function prepareFavorite() {
    if (!favoriteButton) return
    if (!hasToken()) {
      favoriteButton.hidden = true
      if (favoriteNote) {
        favoriteNote.innerHTML =
          '<a href="' + api.esc(api.url('login.html', { next: 'article-detail.html?id=' + wanted })) + '">登录后收藏</a>'
      }
      return
    }
    favoriteButton.hidden = false
    if (favoriteNote) favoriteNote.textContent = '正在读取收藏状态…'
  }

  if (favoriteButton) {
    favoriteButton.addEventListener('click', function () {
      if (!currentArticleId || favoriteBusy) return
      favoriteBusy = true
      favoriteButton.disabled = true
      var before = favoriteButton.dataset.favorite === '1'
      if (favoriteNote) favoriteNote.textContent = '正在更新收藏…'
      api
        .post('/articles/' + currentArticleId + '/favorite')
        .then(function (data) {
          var isFavorite = Boolean(data && data.isFavorite)
          setFavoriteState(isFavorite)
          if (favoriteNote) favoriteNote.textContent = isFavorite ? '已加入收藏。' : '已取消收藏。'
        })
        .catch(function (error) {
          setFavoriteState(before)
          if (favoriteNote) favoriteNote.textContent = (error && error.message) || '收藏没更新，请重试。'
        })
        .then(function () {
          favoriteBusy = false
          favoriteButton.disabled = false
        })
    })
  }

  prepareFavorite()

  function pickArticleId() {
    if (wanted) return Promise.resolve(wanted)
    return api.get('/articles?page=1&pageSize=1').then(function (data) {
      var first = ((data && data.items) || [])[0]
      return first ? first.id : 0
    })
  }

  pickArticleId()
    .then(function (articleId) {
      if (!articleId) {
        api.fail(prose.parentElement || prose, new Error('内容库里还没有文章。'))
        return
      }
      return api.get('/articles/' + articleId).then(function (article) {
        currentArticleId = Number(article.id) || articleId
        document.title = article.title + ' · 斐思同行'
        var plateTitle = document.querySelector('.plate__title')
        if (plateTitle) plateTitle.textContent = article.title
        var meta = document.querySelector('.article-head__meta')
        if (meta) {
          meta.innerHTML =
            '<span class="chip chip--lilac">' + api.esc((article.publishedAt || '').slice(0, 10)) + '</span>' +
            '<span>阅读 ' + (article.viewCount || 0) + ' 次</span>' +
            '<span aria-hidden="true">·</span>' +
            '<span>' + (article.isPinned ? '置顶' : '科普') + '</span>'
        }
        /* 后端正文是平台自己编排的 HTML，直接放进来 */
        prose.innerHTML = article.content || ''
        if (favoriteButton && hasToken()) {
          setFavoriteState(Boolean(article.isFavorite))
          favoriteButton.hidden = false
          if (favoriteNote) favoriteNote.textContent = article.isFavorite ? '这篇文章已经在你的收藏里。' : ''
        }
      })
    })
    .catch(function (error) {
      api.fail(prose.parentElement || prose, error)
    })
})()
