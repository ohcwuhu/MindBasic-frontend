/* 教练列表：接后端时用真数据重绘标签与教练卡（页面原来的类名照用，画风不变）
   筛选走后端：标签 → `tagId`，搜索 → `keyword`。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var keysList = document.querySelector('.dir__bar .keys')
  var grid = document.querySelector('.dir__bar ~ ul.cols')
  var countLine = document.querySelector('.dir__count')
  var searchInput = document.querySelector('.dir__bar .search input')
  var pager = document.querySelector('[data-pager]')
  var pagerCount = document.querySelector('[data-pager-count]')
  var prevButton = document.querySelector('[data-prev]')
  var nextButton = document.querySelector('[data-next]')
  if (!grid) return

  var PAGE_SIZE = 10
  var queryParams = new URLSearchParams(window.location.search)
  var currentTagId = queryParams.get('tagId') || null
  var state = { page: Math.max(1, Number(queryParams.get('page')) || 1) }
  var lastPagination = {}
  var requestGeneration = 0
  if (searchInput && queryParams.get('keyword')) searchInput.value = queryParams.get('keyword')

  function card(coach) {
    var tags = (coach.tagNames || [])
      .map(function (name) {
        return '<li class="chip">' + api.esc(name) + '</li>'
      })
      .join('')
    var rating = coach.rating ? Number(coach.rating).toFixed(1) : '—'
    return (
      '<li class="note coach-card">' +
      '<div class="coach-card__top">' +
      '<span class="figure"><img src="' + api.symbol(coach.id) + '" width="419" height="560" alt="" aria-hidden="true" /></span>' +
      '<div>' +
      '<p class="coach-card__name"><a class="stretch" href="' + api.url('coach-detail.html', { id: coach.id }) + '">' +
      api.esc(coach.nickname) +
      '</a></p>' +
      '<p class="coach-card__meta">从业 ' + (coach.yearsOfExperience || 0) + ' 年</p>' +
      '</div></div>' +
      '<ul class="coach-card__tags">' + tags + '</ul>' +
      '<p class="coach-card__concept">' + api.esc(coach.serviceConcept || '') + '</p>' +
      '<p class="coach-card__score"><strong>' + rating + '</strong> 分 · ' +
      (coach.reviewCount || 0) + ' 条评价</p>' +
      '<p class="coach-card__price" data-price="' + coach.id + '">正在读取价格…</p>' +
      '<p class="coach-card__more"><a class="coach-card__link" href="' + api.url('coach-detail.html', { id: coach.id }) +
      '">查看服务与可约时段</a></p>' +
      '</li>'
    )
  }

  /* 列表接口目前只回评分与标签，价格与时长要去详情里拿 —— 这里逐个补上（一页几位教练，
     请求量可以接受）。后端列表哪天直接带 `minPriceInCents` / `durationMin`，这段就能删。 */
  function fillPrices(container, items, generation) {
    items.forEach(function (coach) {
      var node = container.querySelector('[data-price="' + coach.id + '"]')
      if (!node) return
      api
        .get('/coaches/' + coach.id)
        .then(function (detail) {
          if (generation !== requestGeneration) return
          var services = ((detail && detail.services) || []).slice().sort(function (a, b) {
            return a.priceInCents - b.priceInCents
          })
          if (!services.length) {
            node.textContent = '服务与价格见详情'
            return
          }
          node.innerHTML =
            api.esc(services[0].name) +
            ' <strong>' +
            api.money(services[0].priceInCents) +
            '</strong> 起 · ' +
            services[0].durationMin +
            ' 分钟'
        })
        .catch(function () {
          if (generation === requestGeneration) node.textContent = '服务与价格见详情'
        })
    })
  }

  function syncUrl() {
    try {
      var params = new URLSearchParams()
      if (new URLSearchParams(window.location.search).has('live')) params.set('live', '1')
      if (currentTagId) params.set('tagId', currentTagId)
      var keyword = searchInput && searchInput.value.trim()
      if (keyword) params.set('keyword', keyword)
      if (state.page > 1) params.set('page', String(state.page))
      var search = params.toString()
      window.history.replaceState(null, '', 'coaches.html' + (search ? '?' + search : ''))
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
    pagerCount.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 位 · 共 ' + total + ' 位'
    prevButton.disabled = state.page <= 1
    nextButton.disabled = state.page >= pages
  }

  function load(page) {
    if (page !== undefined) state.page = page
    var generation = ++requestGeneration
    var query = '/coaches?page=' + state.page + '&pageSize=' + PAGE_SIZE
    if (currentTagId) query += '&tagId=' + currentTagId
    var keyword = searchInput && searchInput.value.trim()
    if (keyword) query += '&keyword=' + encodeURIComponent(keyword)

    return api
      .get(query)
      .then(function (data) {
        if (generation !== requestGeneration) return
        var items = (data && data.items) || []
        updatePager(data && data.pagination)
        if (!items.length) {
          grid.outerHTML = api.empty('没有符合条件的教练', '换个标签，或把搜索词清掉再看看。')
          grid = document.querySelector('.empty')
          if (countLine) countLine.textContent = '0 位教练'
          return
        }
        var html = items.map(card).join('')
        if (grid && grid.tagName === 'UL') grid.innerHTML = html
        else document.querySelector('.empty').outerHTML = '<ul class="cols cols--2">' + html + '</ul>'
        grid = document.querySelector('.dir__bar ~ ul.cols') || document.querySelector('ul.cols')
        if (countLine) countLine.textContent = '共 ' + (Number(lastPagination.totalItems) || items.length) + ' 位教练 · 按评分排序'
        if (grid) fillPrices(grid, items, generation)
      })
      .catch(function (error) {
        if (generation !== requestGeneration) return
        api.fail(grid, error)
        if (countLine) countLine.textContent = '没能取到教练列表'
        if (pagerCount) pagerCount.textContent = '读取失败'
      })
  }

  /** 标签：用后端 `/tags?type=FIELD` 的真标签（后端把「困扰类」标签存成 FIELD，教练身上挂的就是它们） */
  api
    .get('/tags?type=FIELD')
    .then(function (data) {
      var tags = (data && data.items) || []
      if (!keysList || !tags.length) return
      keysList.innerHTML =
        '<li><button class="key' + (currentTagId ? '' : ' is-current') + '" type="button" data-tag="">全部</button></li>' +
        tags
          .map(function (tag) {
            return (
              '<li><button class="key' + (String(currentTagId) === String(tag.id) ? ' is-current' : '') +
              '" type="button" data-tag="' +
              tag.id +
              '">' +
              api.esc(tag.name) +
              '</button></li>'
            )
          })
          .join('')
      keysList.addEventListener('click', function (event) {
        var button = event.target.closest('[data-tag]')
        if (!button) return
        currentTagId = button.getAttribute('data-tag') || null
        state.page = 1
        syncUrl()
        Array.prototype.forEach.call(keysList.querySelectorAll('.key'), function (key) {
          key.classList.toggle('is-current', key === button)
        })
        load(1)
      })
    })
    .catch(function () {
      /* 标签取不到就留着页面原来的那几个，不影响列表 */
    })

  if (searchInput) {
    var timer = null
    searchInput.addEventListener('input', function () {
      window.clearTimeout(timer)
      timer = window.setTimeout(function () {
        state.page = 1
        syncUrl()
        load(1)
      }, 300)
    })
  }

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
