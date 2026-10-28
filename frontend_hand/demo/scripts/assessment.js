/* 成长测评：量表加载、完整校验、保存确认与结果回读。 */
;(function () {
  'use strict'
  var api = window.FeisiAPI, view = window.FeisiAssessment
  var quiz = document.querySelector('.quiz'), submit = document.querySelector('[data-assessment-submit]')
  var progress = document.querySelector('[data-answer-progress]')
  var note = document.querySelector('[data-quiz-status]'), answers = {}, questions = [], busy = false
  if (!api || !quiz || !submit) return
  note.setAttribute('role', 'status')
  if (!api.live) {
    view.mode('设计演示 · 以下题目与结果为示例，答案不会保存到账号。')
    submit.disabled = true
    note.textContent = '接上服务并登录后，可完成真实测评。'
    return
  }
  view.mode('账号数据 · 答案保存成功后，结果会留在你的账号中。')
  document.getElementById('quiz-title').textContent = '按真实感受作答'
  document.querySelector('[data-scale-legend]').hidden = true
  document.querySelector('.plate__lede').textContent = '按最近两周真实的感受作答。结果用于自我回顾，不作诊断。'
  document.querySelector('[data-template-note]').textContent = '题目来自当前启用的成长自评量表。'
  document.querySelector('[data-result-title]').textContent = '最近一次结果'
  document.querySelector('.footer__note--demo').textContent = '© 2026 知心同行 · 测评结果来自你的账号'
  view.state(quiz, '正在读取测评题目…')
  document.documentElement.removeAttribute('data-live-pending')
  view.load(document.querySelector('[data-assessment-result]'), document.querySelector('[data-result-note]'))
  function loadTemplate() {
    answers = {}; questions = []; submit.disabled = true
    view.state(quiz, '正在读取测评题目…')
    note.textContent = '正在加载…'
    api.get('/growth-assessments/template').then(function (template) {
      if (!template || !Array.isArray(template.questions)) throw new Error('量表数据不完整')
      questions = template.questions
      document.querySelector('.plate__lede').textContent = template.description || '按真实感受作答。结果仅用于自我回顾。'
      document.querySelector('[data-template-note]').textContent = template.name + ' · 选项说明以题目中的文字为准。'
      document.querySelector('[data-scale-legend]').hidden = true
      if (!questions.length) {
        view.state(quiz, '暂时没有测评题目，请稍后再来。')
        note.textContent = '暂不可提交'; return
      }
      quiz.innerHTML = questions.map(function (q) {
        return '<div class="q" data-question="' + api.esc(q.id) + '"><div><p class="q__dim">' + api.esc(q.dimensionName) +
          '</p><p class="q__text">' + api.esc(q.question) + '</p></div><div class="scale" role="group" aria-label="' + api.esc(q.question) + '">' +
          q.options.slice().sort(function (a, b) { return a.value - b.value }).map(function (o) {
            return '<button type="button" aria-pressed="false" aria-label="' + api.esc(o.label) + '" data-value="' + api.esc(o.value) + '">' + api.esc(o.value) + '<span class="scale-option-label">' + api.esc(o.label) + '</span></button>'
          }).join('') + '</div></div>'
      }).join('')
      progress.setAttribute('aria-valuemax', questions.length)
      progress.setAttribute('aria-valuenow', '0'); progress.querySelector('i').style.width = '0%'
      note.textContent = '已答 0 / ' + questions.length
      submit.disabled = false
    }).catch(function (error) {
      view.state(quiz, '题目读取失败：' + error.message, loadTemplate)
      note.textContent = '题目尚未加载，不能提交。'
    })
  }
  quiz.addEventListener('click', function (event) {
    var button = event.target.closest('.scale button')
    if (!button || busy) return
    var block = button.closest('.q')
    answers[block.dataset.question] = Number(button.dataset.value)
    block.querySelectorAll('button').forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)) })
    progress.setAttribute('aria-valuenow', Object.keys(answers).length)
    progress.querySelector('i').style.width = (Object.keys(answers).length / questions.length * 100) + '%'
    note.textContent = '已答 ' + Object.keys(answers).length + ' / ' + questions.length
  })
  submit.addEventListener('click', function () {
    if (busy || !questions.length) return
    var missing = questions.filter(function (q) { return !Object.prototype.hasOwnProperty.call(answers, String(q.id)) })
    if (missing.length) {
      note.textContent = '还有 ' + missing.length + ' 题没答，请完成后再提交。'
      quiz.querySelector('[data-question="' + missing[0].id + '"] button').focus()
      return
    }
    busy = true; submit.disabled = true; submit.textContent = '正在保存…'
    quiz.querySelectorAll('button').forEach(function (b) { b.disabled = true })
    api.post('/growth-assessments', { answers: answers }).then(function (saved) {
      if (!saved || !saved.id) throw new Error('没有收到保存确认，请先查看历史结果再重试。')
      note.textContent = '保存成功，正在打开本次结果…'
      window.location.assign('my-growth.html?live=1&assessment=' + encodeURIComponent(saved.id))
    }).catch(function (error) {
      note.textContent = '未能确认保存成功：' + error.message + ' 你的答案仍保留在此页。'
      busy = false; submit.disabled = false; submit.textContent = '提交，看结果'
      quiz.querySelectorAll('button').forEach(function (b) { b.disabled = false })
    })
  })
  loadTemplate()
})()
