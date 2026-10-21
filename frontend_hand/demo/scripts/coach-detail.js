/* 教练档案：接后端时按 `?id=` 取真教练（没有 id 就用列表里的第一位），
   重绘档案头、服务理念、服务项目、可预约时段与用户评价。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var nameEl = document.querySelector('.profile__name')
  if (!nameEl) return

  var figure = document.querySelector('.profile__figure img')
  var metaEl = document.querySelector('.profile__meta')
  var tagsEl = document.querySelector('.profile__tags')
  var scoreEl = document.querySelector('.profile__score')
  var conceptPanel = document.querySelector('#concept-title') && document.querySelector('#concept-title').closest('.panel')
  var servicesEl = document.querySelector('.services')
  var slotsEl = document.querySelector('.slots')
  var reviewPanel = document.querySelector('#review-title') && document.querySelector('#review-title').closest('.panel')

  var params = new URLSearchParams(window.location.search)
  var wanted = Number(params.get('id') || 0)

  /* 真数据模式下先把页面里的示例身份与分区移走，避免接口慢时把示例当成这位教练的资料。 */
  nameEl.textContent = '正在读取教练资料…'
  if (metaEl) metaEl.textContent = ''
  if (tagsEl) tagsEl.innerHTML = ''
  if (scoreEl) scoreEl.textContent = ''
  if (conceptPanel) {
    Array.prototype.forEach.call(conceptPanel.querySelectorAll('.prose'), function (node) {
      node.textContent = ''
    })
  }
  if (servicesEl) servicesEl.innerHTML = '<p class="panel__note" role="status">正在读取服务项目…</p>'
  if (slotsEl) slotsEl.innerHTML = '<li class="panel__note" role="status">正在读取可约时段…</li>'
  if (reviewPanel) {
    var initialReviews = reviewPanel.querySelector('.reviews')
    if (initialReviews) initialReviews.innerHTML = '<div class="panel__note" role="status">正在读取评价…</div>'
  }

  function pickCoachId() {
    if (wanted) return Promise.resolve(wanted)
    return api.get('/coaches?page=1&pageSize=1').then(function (data) {
      var first = ((data && data.items) || [])[0]
      return first ? first.id : 0
    })
  }

  function renderProfile(coach) {
    document.title = coach.nickname + ' · 教练档案 · 斐思同行'
    var plateTitle = document.querySelector('.plate__title')
    if (plateTitle) plateTitle.textContent = coach.nickname
    var crumb = document.querySelector('.crumbs span:last-child')
    if (crumb) crumb.textContent = coach.nickname
    if (figure) figure.src = api.symbol(coach.id)
    nameEl.textContent = coach.nickname
    if (metaEl) {
      metaEl.textContent =
        '从业 ' + (coach.yearsOfExperience || 0) + ' 年 · 平台审核通过'
    }
    if (tagsEl) {
      tagsEl.innerHTML = (coach.tagNames || [])
        .map(function (name) {
          return '<li class="chip">' + api.esc(name) + '</li>'
        })
        .join('')
    }
    if (scoreEl) {
      scoreEl.innerHTML =
        '<strong>' + (coach.rating ? Number(coach.rating).toFixed(1) : '—') + '</strong>' +
        '<span>分 · ' + (coach.reviewCount || 0) + ' 条评价</span>'
    }
    if (conceptPanel) {
      var body = conceptPanel.querySelector('#concept-body')
      var text = body || conceptPanel.querySelector('.prose')
      var extra = conceptPanel.querySelectorAll('.prose')
      /* 服务理念那两块正文合成一段：简介 + 受训背景 */
      var blocks = [coach.serviceConcept, coach.bio, coach.trainingExp].filter(Boolean)
      if (text) {
        text.textContent = blocks[0] || ''
        if (extra.length > 1) {
          extra[extra.length - 1].textContent = blocks.slice(1).join(' ')
          for (var i = 1; i < extra.length - 1; i += 1) extra[i].remove()
        } else if (blocks.length > 1 && text.parentElement) {
          var p = document.createElement('p')
          p.className = 'prose'
          p.textContent = blocks.slice(1).join(' ')
          text.parentElement.appendChild(p)
        }
      }
    }
  }

  function renderServices(services) {
    if (!servicesEl) return
    if (!services.length) {
      servicesEl.innerHTML = api.empty('这位教练还没上架服务', '可以先看看别的教练。')
      return
    }
    servicesEl.innerHTML = services
      .map(function (service) {
        var meta = (service.serviceType === 'PACKAGE' ? '套餐' : '单次') + ' · ' + service.durationMin + ' 分钟'
        var price = service.priceInCents ? '¥' + service.priceInCents / 100 : '¥0'
        return (
          '<div class="service"><div><p class="service__name">' + api.esc(service.name) + '</p>' +
          '<p class="service__meta">' + api.esc(meta) + '</p></div>' +
          '<p class="service__price">' + price + '</p></div>'
        )
      })
      .join('')
  }

  function renderSlots(slots, coachId) {
    if (!slotsEl) return
    if (!slots.length) {
      slotsEl.innerHTML = api.emptyItem('暂时没有可约时段', '教练还没放出未来 14 天的空档，过几天再来看看。')
      return
    }
    slotsEl.innerHTML = slots
      .map(function (slot) {
        var start = new Date(slot.startAt)
        var label = String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0')
        var time = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0')
        return (
          '<li><a class="slot" href="booking.html?coachId=' + coachId + '&slotId=' + slot.id + '">' +
          '<time datetime="' + api.esc(slot.startAt) + '">' + label + '</time><span>' + time + '</span></a></li>'
        )
      })
      .join('')
  }

  function renderReviews(reviews) {
    if (!reviewPanel) return
    var list = reviewPanel.querySelector('.reviews')
    var note = reviewPanel.querySelector('.panel__note')
    if (!list) return
    if (!reviews.length) {
      list.innerHTML = api.empty('还没有评价，欢迎你来写第一条', '完成一次咨询后可以留下评价。')
      if (note) note.textContent = '0 条'
      return
    }
    if (note) note.textContent = reviews.length + ' 条 · 按时间排序'
    list.innerHTML = reviews
      .map(function (review) {
        var stars = ''
        for (var i = 0; i < (review.rating || 0); i += 1) {
          stars += '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-star" /></svg>'
        }
        return (
          '<article class="review"><p class="review__head">' +
          api.esc(review.nickname || '匿名用户') +
          '<span class="stars" role="img" aria-label="' + (review.rating || 0) + ' 分">' + stars + '</span></p>' +
          '<p class="review__body">' + api.esc(review.content || '') + '</p>' +
          '<time datetime="' + api.esc(review.createdAt || '') + '">' + api.esc((review.createdAt || '').slice(0, 10)) + '</time></article>'
        )
      })
      .join('')
  }

  function renderSectionFailure(container, message, retry) {
    if (!container) return
    var inner =
      '<div class="empty" role="alert"><p class="empty__title">这一部分没有读取成功</p>' +
      '<p class="empty__body">' + api.esc(message || '请稍后重试。') + '</p>' +
      '<p><button class="link-quiet" type="button" data-section-retry>重试</button></p></div>'
    container.innerHTML = container.tagName === 'UL' ? '<li>' + inner + '</li>' : inner
    var button = container.querySelector('[data-section-retry]')
    if (button) button.addEventListener('click', retry)
  }

  function loadSlots(coachId) {
    if (slotsEl) slotsEl.innerHTML = '<li class="panel__note" role="status">正在读取可约时段…</li>'
    return api
      .get('/coaches/' + coachId + '/slots')
      .then(function (data) {
        renderSlots((data && data.items) || [], coachId)
      })
      .catch(function (error) {
        renderSectionFailure(slotsEl, error && error.message, function () {
          loadSlots(coachId)
        })
      })
  }

  function loadReviews(coachId) {
    if (reviewPanel) {
      var list = reviewPanel.querySelector('.reviews')
      if (list) list.innerHTML = '<div class="panel__note" role="status">正在读取评价…</div>'
    }
    return api
      .get('/coaches/' + coachId + '/reviews')
      .then(function (data) {
        renderReviews((data && data.items) || [])
      })
      .catch(function (error) {
        var list = reviewPanel && reviewPanel.querySelector('.reviews')
        renderSectionFailure(list, error && error.message, function () {
          loadReviews(coachId)
        })
      })
  }

  pickCoachId().then(function (coachId) {
    if (!coachId) {
      api.fail(document.querySelector('.profile') || document.body, new Error('平台上还没有可展示的教练。'))
      return
    }
    api
      .get('/coaches/' + coachId)
      .then(function (coach) {
        renderProfile(coach)
        renderServices(coach.services || [])
        return Promise.all([loadSlots(coachId), loadReviews(coachId)])
      })
      .catch(function (error) {
        api.fail(document.querySelector('.profile') || document.body, error)
      })
  })
})()
