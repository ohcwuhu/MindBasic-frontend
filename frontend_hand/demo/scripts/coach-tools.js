/* 教练工作台 · 话术与评价（原前端「话术库」「我的评价」两栏）。

   接后端：
     · `GET  /coach/phrases` → { items }（我的）；`POST /coach/phrases` { category, content }
       `DELETE /coach/phrases/{id}`
     · `GET  /phrase-library` → { items }（公共）；`POST /coach/phrases/save` { phraseId }
     · `GET  /coach/reviews?page=&pageSize=` → { items }
   没有后端：页面里写好的示例，新增 / 删除 / 收藏在页内生效。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live

  var CATEGORY = { OPENING: '开场', RESOURCE: '资源', FUTURE: '未来', ACTION: '行动', OTHER: '其他' }

  var phraseList = document.querySelector('[data-phrases]')
  var phraseForm = document.querySelector('[data-phrase-form]')
  var phraseError = document.querySelector('[data-phrase-error]')
  var phraseStatus = document.querySelector('[data-phrase-status]')
  var phraseCount = document.querySelector('[data-phrase-count]')
  var libraryList = document.querySelector('[data-library]')
  var libraryStatus = document.querySelector('[data-library-status]')
  var reviewList = document.querySelector('[data-reviews]')
  var reviewCount = document.querySelector('[data-review-count]')
  if (!phraseList || !phraseForm) return

  var phrases = []
  var library = []
  var busy = false

  function say(node, text) {
    if (node) node.textContent = text || ''
  }

  function fail(message) {
    if (!phraseError) return
    phraseError.textContent = message || ''
    phraseError.hidden = !message
  }

  function phraseRow(item, kind) {
    var action = kind === 'library'
      ? '<button class="act" type="button" data-save-phrase="' + Number(item.id) + '">收进我的库</button>'
      : '<button class="act act--warn" type="button" data-remove-phrase="' + Number(item.id) + '">删除</button>'
    return (
      '<li><div class="row">' +
      '<span class="row__art" aria-hidden="true">' + api.esc((CATEGORY[item.category] || '话').slice(0, 1)) + '</span>' +
      '<span><span class="row__title">' + api.esc(CATEGORY[item.category] || item.category || '话术') + '</span>' +
      '<span class="row__meta">' + api.esc(item.content) + '</span></span>' +
      '<span class="row__side">' + action + '</span>' +
      '</div></li>'
    )
  }

  function drawPhrases() {
    phraseList.innerHTML = phrases.length
      ? phrases.map(function (item) { return phraseRow(item, 'mine') }).join('')
      : '<li class="panel__note">我的库里还没有话术。下面公共库里挑两句也行。</li>'
    if (phraseCount) phraseCount.textContent = phrases.length + ' 条'
  }

  function drawLibrary() {
    if (!libraryList) return
    libraryList.innerHTML = library.length
      ? library.map(function (item) { return phraseRow(item, 'library') }).join('')
      : '<li class="panel__note">公共库暂时是空的。</li>'
  }

  phraseForm.addEventListener('submit', function (event) {
    event.preventDefault()
    fail('')
    var content = phraseForm.elements.content.value.trim()
    if (content.length < 4) {
      fail('一句话至少 4 个字。')
      phraseForm.elements.content.focus()
      return
    }
    if (busy) return
    busy = true
    var category = phraseForm.elements.category.value
    var request = live
      ? api.post('/coach/phrases', { category: category, content: content })
      : Promise.resolve({ id: Date.now() % 10000, category: category, content: content, source: 'MINE' })
    request
      .then(function (item) {
        phrases = [item].concat(phrases)
        phraseForm.reset()
        drawPhrases()
        say(phraseStatus, '收进库里了。')
      })
      .catch(function (error) {
        fail((error && error.message) || '没存上，再试一次。')
      })
      .then(function () {
        busy = false
      })
  })

  function removePhrase(id) {
    if (busy) return
    busy = true
    var request = live ? api.del('/coach/phrases/' + Number(id)) : Promise.resolve()
    request
      .then(function () {
        phrases = phrases.filter(function (item) {
          return Number(item.id) !== Number(id)
        })
        drawPhrases()
        say(phraseStatus, '已删除。')
      })
      .catch(function (error) {
        say(phraseStatus, (error && error.message) || '删除没成功。')
      })
      .then(function () {
        busy = false
      })
  }

  function savePhrase(id) {
    if (busy) return
    busy = true
    var request = live ? api.post('/coach/phrases/save', { phraseId: Number(id) }) : Promise.resolve()
    request
      .then(function (saved) {
        var source = library.filter(function (item) {
          return Number(item.id) === Number(id)
        })[0]
        if (source && !phrases.some(function (item) { return item.content === source.content })) {
          phrases = [saved && saved.id ? saved : source].concat(phrases)
        }
        drawPhrases()
        say(libraryStatus, '已收进我的库。')
      })
      .catch(function (error) {
        say(libraryStatus, (error && error.message) || '没存上，再试一次。')
      })
      .then(function () {
        busy = false
      })
  }

  phraseList.addEventListener('click', function (event) {
    var button = event.target.closest('[data-remove-phrase]')
    if (button) removePhrase(button.getAttribute('data-remove-phrase'))
  })

  if (libraryList) {
    libraryList.addEventListener('click', function (event) {
      var button = event.target.closest('[data-save-phrase]')
      if (button) savePhrase(button.getAttribute('data-save-phrase'))
    })
  }

  if (!live) {
    phrases = [
      { id: 1, category: 'OPENING', content: '今天想从哪一段说起都行，我们先不急着解决什么。' },
      { id: 2, category: 'RESOURCE', content: '上一次那么难的时候，是什么帮你撑过来的？' },
      { id: 3, category: 'ACTION', content: '如果只做五分钟的那一版，会是什么样子？' },
    ]
    library = [
      { id: 11, category: 'FUTURE', content: '如果三个月后的你回头看今天，会希望现在的你做什么？' },
      { id: 12, category: 'RESOURCE', content: '有没有哪一次，你以为撑不过去，后来却过去了？' },
    ]
    drawPhrases()
    drawLibrary()
    say(phraseStatus, '设计演示：话术是示例，增删与收藏会在页内生效。')
  } else {
    api
      .get('/coach/phrases')
      .then(function (data) {
        phrases = (data && data.items) || []
        drawPhrases()
      })
      .catch(function (error) {
        say(phraseStatus, (error && error.message) || '话术库没读出来。')
      })
    api
      .get('/phrase-library')
      .then(function (data) {
        library = (data && data.items) || []
        drawLibrary()
      })
      .catch(function () {
        /* 公共库读不到就不显示 */
      })
    api
      .get('/coach/reviews?page=1&pageSize=50')
      .then(function (data) {
        var items = (data && data.items) || []
        if (reviewCount) reviewCount.textContent = items.length + ' 条'
        if (!reviewList) return
        reviewList.innerHTML = items.length
          ? items
              .map(function (review) {
                return (
                  '<li><div class="row">' +
                  '<span class="row__art" aria-hidden="true">' + (Number(review.rating) || 0) + '★</span>' +
                  '<span><span class="row__title">' + api.esc(review.nickname || '匿名') +
                  (review.serviceName ? ' · ' + api.esc(review.serviceName) : '') + '</span>' +
                  '<span class="row__meta">' + api.esc(review.content || '（没有写内容）') + '</span></span>' +
                  '<span class="row__side">' + api.esc(review.serviceDate || api.dateTime(review.createdAt)) + '</span>' +
                  '</div></li>'
                )
              })
              .join('')
          : '<li class="panel__note">还没有评价。</li>'
      })
      .catch(function () {
        /* 读不到就留着示例 */
      })
  }
})()
