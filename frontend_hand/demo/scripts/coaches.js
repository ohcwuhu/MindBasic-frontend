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
  if (!grid) return

  var currentTagId = null

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
      '<p class="coach-card__name"><a class="stretch" href="coach-detail.html?id=' + coach.id + '">' +
      api.esc(coach.nickname) +
      '</a></p>' +
      '<p class="coach-card__meta">从业 ' + (coach.yearsOfExperience || 0) + ' 年</p>' +
      '</div></div>' +
      '<ul class="coach-card__tags">' + tags + '</ul>' +
      '<p class="coach-card__concept">' + api.esc(coach.serviceConcept || '') + '</p>' +
      '<p class="coach-card__score"><strong>' + rating + '</strong> 分 · ' +
      (coach.reviewCount || 0) + ' 条评价</p>' +
      '</li>'
    )
  }

  function load() {
    var query = '/coaches?page=1&pageSize=50'
    if (currentTagId) query += '&tagId=' + currentTagId
    var keyword = searchInput && searchInput.value.trim()
    if (keyword) query += '&keyword=' + encodeURIComponent(keyword)

    return api
      .get(query)
      .then(function (data) {
        var items = (data && data.items) || []
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
        if (countLine) countLine.textContent = items.length + ' 位教练 · 按评分排序'
      })
      .catch(function (error) {
        api.fail(grid, error)
        if (countLine) countLine.textContent = '没能取到教练列表'
      })
  }

  /** 标签：用后端 `/tags?type=FIELD` 的真标签（后端把「困扰类」标签存成 FIELD，教练身上挂的就是它们） */
  api
    .get('/tags?type=FIELD')
    .then(function (data) {
      var tags = (data && data.items) || []
      if (!keysList || !tags.length) return
      keysList.innerHTML =
        '<li><button class="key is-current" type="button" data-tag="">全部</button></li>' +
        tags
          .map(function (tag) {
            return (
              '<li><button class="key" type="button" data-tag="' +
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
        Array.prototype.forEach.call(keysList.querySelectorAll('.key'), function (key) {
          key.classList.toggle('is-current', key === button)
        })
        load()
      })
    })
    .catch(function () {
      /* 标签取不到就留着页面原来的那几个，不影响列表 */
    })

  if (searchInput) {
    var timer = null
    searchInput.addEventListener('input', function () {
      window.clearTimeout(timer)
      timer = window.setTimeout(load, 300)
    })
  }

  load()
})()
