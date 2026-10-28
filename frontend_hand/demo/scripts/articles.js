/* 科普中心：接后端时用真分类与真文章重绘（页面原来的 `.cats` / `.arts` / `.art-row` 照用） */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var catsList = document.querySelector('.cats')
  var list = document.querySelector('ul.arts')
  var note = document.querySelector('.panel__note')
  var foot = document.querySelector('.cat-foot, .panel__foot')
  var pager = document.querySelector('[data-pager]')
  var pagerCount = document.querySelector('[data-pager-count]')
  var prevButton = document.querySelector('[data-prev]')
  var nextButton = document.querySelector('[data-next]')
  if (!list) return

  var PAGE_SIZE = 10
  var queryParams = new URLSearchParams(window.location.search)
  var currentCategoryId = queryParams.get('categoryId') || null
  var state = { page: Math.max(1, Number(queryParams.get('page')) || 1) }
  var lastPagination = {}
  var requestGeneration = 0

  /* 内容短的时候别让页脚那条提醒一进页面就露在首屏里：给正文一个「至少一屏」的高度
     （页头占掉多少按实际量），页脚自然落到折线以下。文章多的时候正文本来就更高，不受影响。 */
  var main = document.querySelector('main')
  var masthead = document.querySelector('.masthead')
  if (main && masthead) {
    /* 多留 32px：页脚的上一行（正文的底部留白）也一起压到折线下面 */
    main.style.minHeight = Math.max(0, window.innerHeight - masthead.offsetHeight + 32) + 'px'
  }

  /* 后端没给封面（coverUrl 为 null）时，按分类用素材库里那几张文章插画顶上 */
  var COVERS = ['cat-emotion', 'cat-study', 'cat-relation', 'cat-growth', 'cat-crisis', 'cat-story']
  function cover(article) {
    var index = Math.abs(Number(article.categoryId) || Number(article.id) || 0) % COVERS.length
    return 'assets/' + COVERS[index] + '.webp'
  }

  function row(article) {
    return (
      '<li><a class="art-row" href="' + api.url('article-detail.html', { id: article.id }) + '">' +
      '<img class="art-row__art" src="' + cover(article) + '" width="560" height="545" alt="" aria-hidden="true" />' +
      '<span><span class="art-row__title">' + api.esc(article.title) + '</span>' +
      '<span class="art-row__summary">' + api.esc(article.summary || '') + '</span></span>' +
      '<span class="art-row__side"><span class="art-row__date">' +
      api.esc((article.publishedAt || '').slice(0, 10)) +
      '</span><img class="arrow" src="assets/prop-arrow.webp" width="320" height="156" alt="" aria-hidden="true" /></span>' +
      '</a></li>'
    )
  }

  function syncUrl() {
    try {
      var params = new URLSearchParams()
      if (new URLSearchParams(window.location.search).has('live')) params.set('live', '1')
      if (currentCategoryId) params.set('categoryId', currentCategoryId)
      if (state.page > 1) params.set('page', String(state.page))
      var search = params.toString()
      window.history.replaceState(null, '', 'articles.html' + (search ? '?' + search : ''))
    } catch (error) {
      /* file:// 下不改地址栏 */
    }
  }

  function updatePager(pagination) {
    lastPagination = pagination || {}
    if (!pager) return
    pager.hidden = false
    var total = Number(lastPagination.totalItems) || 0
    var pages = Math.max(1, Number(lastPagination.totalPages) || 1)
    pagerCount.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 篇 · 共 ' + total + ' 篇'
    prevButton.disabled = state.page <= 1
    nextButton.disabled = state.page >= pages
  }

  function load(page) {
    if (page !== undefined) state.page = page
    var generation = ++requestGeneration
    var query = '/articles?page=' + state.page + '&pageSize=' + PAGE_SIZE
    if (currentCategoryId) query += '&categoryId=' + currentCategoryId
    if (pagerCount) pagerCount.textContent = '正在读取第 ' + state.page + ' 页…'
    if (prevButton) prevButton.disabled = true
    if (nextButton) nextButton.disabled = true
    return api
      .get(query)
      .then(function (data) {
        if (generation !== requestGeneration) return
        var items = (data && data.items) || []
        updatePager(data && data.pagination)
        if (note) note.textContent = '共 ' + (Number(lastPagination.totalItems) || items.length) + ' 篇 · 来自平台内容库'
        /* 列表下面那句（「…为示例数据，接入后来自平台真实内容库」）在接后端模式下**直接去掉**：
           真后端只有三篇文章，列表短，那句话会正好落在第一屏里 —— 一进页面就被一条说明挡住。
           「内容来自平台内容库」这层意思，页脚最后一行已经说过了，不必在列表里再说一遍。
           设计演示稿（file://）不走这里，那句照旧留着。 */
        if (foot) foot.remove()
        /* 页脚那行「设计演示稿：文章条目为示例内容」同理：接了真后端就不是示例了 */
        var demoLine = document.querySelector('.footer__note--demo')
        if (demoLine) demoLine.textContent = '© 2026 知心同行 · 内容来自平台内容库'
        if (!items.length) {
          list.innerHTML = api.empty('这一类还没有文章', '换个分类看看，或回到「全部」。')
          return
        }
        list.innerHTML = items.map(row).join('')
      })
      .catch(function (error) {
        if (generation !== requestGeneration) return
        api.fail(list, error)
        if (pagerCount) pagerCount.textContent = '读取失败'
      })
  }

  api
    .get('/article-categories')
    .then(function (data) {
      var categories = (data && data.items) || []
      if (!catsList || !categories.length) return
      catsList.innerHTML =
        '<li><button class="key' + (currentCategoryId ? '' : ' is-current') + '" type="button" data-cat="">全部</button></li>' +
        categories
          .map(function (category) {
            return (
              '<li><button class="key' + (String(currentCategoryId) === String(category.id) ? ' is-current' : '') +
              '" type="button" data-cat="' +
              category.id +
              '">' +
              api.esc(category.name) +
              '</button></li>'
            )
          })
          .join('')
      catsList.addEventListener('click', function (event) {
        var button = event.target.closest('[data-cat]')
        if (!button) return
        currentCategoryId = button.getAttribute('data-cat') || null
        state.page = 1
        syncUrl()
        Array.prototype.forEach.call(catsList.querySelectorAll('.key'), function (key) {
          key.classList.toggle('is-current', key === button)
        })
        load(1)
      })
    })
    .catch(function () {
      /* 分类取不到就留着页面原来的那几个 */
    })

  if (prevButton) {
    prevButton.addEventListener('click', function () {
      if (state.page <= 1) return
      state.page -= 1
      syncUrl()
      load()
    })
  }
  if (nextButton) {
    nextButton.addEventListener('click', function () {
      var pages = Math.max(1, Number(lastPagination.totalPages) || 1)
      if (state.page >= pages) return
      state.page += 1
      syncUrl()
      load()
    })
  }

  syncUrl()
  load()
})()
