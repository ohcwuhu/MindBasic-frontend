/* 共用结果呈现：遵循后端 1–5 原始分值，不伪造百分制与增幅。 */
;(function () {
  'use strict'
  var api = window.FeisiAPI
  var art = { SELF_AWARENESS: 'dim-emotion', RESOURCE_USE: 'dim-engagement', GOAL_CLARITY: 'dim-meaning', ACTION: 'dim-action', EMOTION_REGULATION: 'dim-relation' }
  function state(box, message, retry) {
    box.replaceChildren()
    var item = document.createElement(/^(UL|OL)$/.test(box.tagName) ? 'li' : box.tagName === 'P' ? 'span' : 'div')
    var text = document.createElement(box.tagName === 'P' ? 'span' : 'p')
    text.className = 'panel__note'; text.setAttribute('role', 'status'); text.textContent = message
    item.appendChild(text)
    if (retry) {
      var button = document.createElement('button')
      button.type = 'button'; button.className = 'btn btn--paper'; button.textContent = '重试'
      button.addEventListener('click', retry); item.appendChild(button)
    }
    box.appendChild(item)
  }
  function draw(box, result, previous) {
    if (!result || !Array.isArray(result.scores) || !result.scores.length) throw new Error('测评结果不完整，请重试。')
    var comparable = previous && previous.templateId === result.templateId && Array.isArray(previous.scores)
    box.innerHTML = result.scores.map(function (score) {
      var value = Number(score.score)
      if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error('测评分值无效，请重试。')
      var old = comparable && previous.scores.find(function (s) { return s.dimensionKey === score.dimensionKey })
      var delta = old && Number.isFinite(Number(old.score)) ? Math.round((value - Number(old.score)) * 100) / 100 : null
      var change = delta === null ? '' : ' · 较上次 ' + (delta > 0 ? '+' : '') + delta.toFixed(2)
      return '<li class="dim"><img src="assets/' + (art[score.dimensionKey] || 'dim-emotion') +
        '.webp" width="46" height="44" alt="" aria-hidden="true" /><div>' +
        '<p class="dim__label"><strong>' + api.esc(score.dimensionName) + '</strong><em>' + value.toFixed(2) + ' / 5</em></p>' +
        '<span class="meter" aria-hidden="true"><i style="width:' + (value / 5 * 100) + '%"></i></span>' +
        '<p class="panel__note">' + api.esc((score.levelLabel || '') + change) + '</p></div></li>'
    }).join('')
  }
  function load(box, note, id) {
    state(box, '正在读取测评结果…'); note.textContent = ''
    return api.get('/growth-assessments?page=1&pageSize=2').then(function (history) {
      if (!history || !Array.isArray(history.items)) throw new Error('测评历史数据不完整，请重试。')
      var items = history.items, selected = id || (items[0] && items[0].id)
      if (!selected) {
        state(box, '还没有测评结果，完成第一次自评后会显示在这里。')
        note.textContent = '分值为 1–5，仅用于自我回顾，不作诊断。'; return
      }
      var index = items.findIndex(function (item) { return String(item.id) === String(selected) })
      var prior = index >= 0 && items[index + 1]
      return Promise.all([
        api.get('/growth-assessments/' + encodeURIComponent(selected)),
        prior ? api.get('/growth-assessments/' + prior.id).then(function (data) { return { data: data } }, function () { return { failed: true } }) : Promise.resolve(null)
      ]).then(function (rows) {
        draw(box, rows[0], rows[1] && rows[1].data)
        note.textContent = '测评时间：' + api.dateTime(rows[0].createdAt) + ' · ' +
          (rows[1] && rows[1].failed ? '上次结果读取失败，暂不显示变化。' :
            rows[1] && rows[1].data && rows[1].data.templateId === rows[0].templateId ? '变化与上次同量表测评比较。' : '暂无可比较的上次结果。') +
          ' 分值为 1–5，不作诊断。'
        if (rows[0].report && rows[0].report.summary) note.textContent += ' ' + rows[0].report.summary
      })
    }).catch(function (error) {
      state(box, '测评结果读取失败：' + error.message, function () { load(box, note, id) })
      note.textContent = '没有显示示例分数。'
    })
  }
  function mode(message) {
    if (api.live) document.querySelectorAll('a[href]').forEach(function (link) {
      var url = new URL(link.href, location.href)
      if (url.origin === location.origin && /\/(assessment|my-growth)\.html$/.test(url.pathname)) {
        url.searchParams.set('live', '1'); link.href = url.href
      }
    })
    var banner = document.querySelector('[data-data-mode]'); if (banner) banner.textContent = message }
  window.FeisiAssessment = { state: state, draw: draw, load: load, mode: mode }
})()
