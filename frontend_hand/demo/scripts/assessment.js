/* 成长测评：接后端时用 `/growth-assessments/template` 的真题目重绘，提交走 `POST /growth-assessments`。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var quiz = document.querySelector('.quiz')
  if (!quiz) return

  var note = document.querySelector('.panel__note')
  var answers = {}

  /* 后端按 dimensionKey 给维度，图标沿用素材库那五张 */
  function dimArt(dimensionName) {
    var map = {
      自我觉察: 'dim-emotion',
      情绪: 'dim-emotion',
      投入: 'dim-engagement',
      关系: 'dim-relation',
      意义: 'dim-meaning',
      行动: 'dim-action',
    }
    return 'assets/' + (map[dimensionName] || 'dim-emotion') + '.webp'
  }

  api
    .get('/growth-assessments/template')
    .then(function (template) {
      var questions = (template && template.questions) || []
      if (!questions.length) {
        quiz.innerHTML = api.empty('暂时没有测评题目', '平台还没配置量表。')
        return
      }
      if (note) note.textContent = '已答 0 / ' + questions.length
      quiz.innerHTML = questions
        .map(function (question) {
          var options = (question.options || []).slice().sort(function (a, b) {
            return a.value - b.value
          })
          return (
            '<div class="q" data-question="' + question.id + '">' +
            '<div><p class="q__dim"><img src="' + dimArt(question.dimensionName) +
            '" width="400" height="381" alt="" aria-hidden="true" />' + api.esc(question.dimensionName || '') + '</p>' +
            '<p class="q__text">' + api.esc(question.question) + '</p></div>' +
            '<div class="scale" role="group" aria-label="' + api.esc(question.dimensionName || '') + '：从低到高">' +
            options
              .map(function (option) {
                return (
                  '<button type="button" aria-label="' + api.esc(option.label || option.value) +
                  '" data-value="' + option.value + '">' + option.value + '</button>'
                )
              })
              .join('') +
            '</div></div>'
          )
        })
        .join('')

      quiz.addEventListener('click', function (event) {
        var button = event.target.closest('.scale button')
        if (!button) return
        var block = button.closest('.q')
        var questionId = block.getAttribute('data-question')
        answers[questionId] = Number(button.getAttribute('data-value'))
        Array.prototype.forEach.call(block.querySelectorAll('.scale button'), function (item) {
          item.setAttribute('aria-pressed', String(item === button))
        })
        if (note) note.textContent = '已答 ' + Object.keys(answers).length + ' / ' + questions.length
      })

      /* 提交按钮：页面里那个「提交测评」 */
      var submit = document.querySelector('.quiz ~ * button.btn, button[type="submit"]')
      if (submit) {
        submit.addEventListener('click', function (event) {
          event.preventDefault()
          if (Object.keys(answers).length < questions.length) {
            if (note) note.textContent = '还有 ' + (questions.length - Object.keys(answers).length) + ' 题没答'
            return
          }
          submit.disabled = true
          api
            .post('/growth-assessments', { answers: answers })
            .then(function () {
              if (note) note.textContent = '已提交 · 结果已存进「我的成长」'
            })
            .catch(function (error) {
              if (note) note.textContent = error.message
            })
            .then(function () {
              submit.disabled = false
            })
        })
      }
    })
    .catch(function (error) {
      api.fail(quiz, error)
    })
})()
