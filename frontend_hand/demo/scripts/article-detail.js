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
      })
    })
    .catch(function (error) {
      api.fail(prose.parentElement || prose, error)
    })
})()
