/* 自我教练记录详情（原前端的 `SelfCoachingRecordDetailView`）：
   模板名 + 时间 + 状态、四步的问答、那张行动卡。

   接后端（地址带 `?record=<id>`）：
     · `GET /self-coaching/records/{id}` → { templateId, answers, actionCard, status, createdAt }
     · `GET /self-coaching/templates/{templateId}` → { name, steps[] }
   没有后端：页面里写好的示例（一份完成的记录 + 一张行动卡）。
   「分享」照原版：先试系统分享，没有就复制到剪贴板，并把结果写在这一行。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live
  var recordId = Number(new URLSearchParams(window.location.search).get('record') || 0)

  var titleCell = document.querySelector('[data-record-title]')
  var timeCell = document.querySelector('[data-record-time]')
  var statusCell = document.querySelector('[data-record-status]')
  var stepsBox = document.querySelector('[data-steps]')
  var cardSection = document.querySelector('[data-card-section]')
  var cardTitle = document.querySelector('[data-card-title]')
  var cardBody = document.querySelector('[data-card-body]')
  var shareButton = document.querySelector('[data-share]')
  var shareStatus = document.querySelector('[data-share-status]')

  var actionCard = null

  function say(text) {
    if (shareStatus) shareStatus.textContent = text || ''
  }

  function stepBlock(step, answer) {
    var text = String(answer || '').trim()
    return (
      '<section class="step">' +
      '<h3 class="step__name">' + api.esc(step.stepName || step.stepKey) + '</h3>' +
      '<p class="step__q">' + api.esc(step.question || '') + '</p>' +
      '<p class="step__a' + (text ? '' : ' step__a--empty') + '">' +
      api.esc(text || '（这一步还没写）') +
      '</p></section>'
    )
  }

  function drawSteps(template, answers) {
    if (!stepsBox) return
    stepsBox.innerHTML = (template.steps || [])
      .map(function (step) {
        return stepBlock(step, answers[step.stepKey])
      })
      .join('')
  }

  function drawCard(card) {
    actionCard = card || null
    if (!cardSection) return
    cardSection.hidden = !card
    if (!card) return
    if (cardTitle) cardTitle.textContent = card.title || '今天的一小步'
    if (cardBody) cardBody.textContent = card.content || ''
  }

  function drawHead(record, template) {
    if (titleCell) titleCell.textContent = template.name || '这一次的记录'
    if (timeCell) timeCell.textContent = api.dateTime(record.createdAt)
    if (!statusCell) return
    statusCell.textContent = record.status === 'DRAFT' ? '草稿' : '已完成'
    statusCell.className = 'chip ' + (record.status === 'DRAFT' ? 'chip--yellow' : 'chip--green')
  }

  function clip(message) {
    say(message)
  }

  if (shareButton) {
    shareButton.addEventListener('click', function () {
      if (!actionCard) return
      var text = (actionCard.title || '') + '\n\n' + (actionCard.content || '')
      if (navigator.share) {
        navigator
          .share({ title: actionCard.title || '行动卡', text: text })
          .then(function () {
            clip('已分享。')
          })
          .catch(function (error) {
            if (error && error.name === 'AbortError') return
            clip('分享没成功，可以直接选中复制。')
          })
        return
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(function () {
            clip('已复制到剪贴板。')
          })
          .catch(function () {
            clip('复制没成功，选中文字复制就行。')
          })
        return
      }
      clip('这台浏览器不让脚本写剪贴板，选中文字复制就行。')
    })
  }

  if (live && recordId) {
    api
      .get('/self-coaching/records/' + recordId)
      .then(function (record) {
        return api.get('/self-coaching/templates/' + record.templateId).then(function (template) {
          drawHead(record, template)
          drawSteps(template, record.answers || {})
          drawCard(record.actionCard)
          say('已连后端，显示的是这一条真实记录。')
        })
      })
      .catch(function (error) {
        say((error && error.message) || '这条记录没读出来。')
      })
  } else {
    actionCard = {
      title: cardTitle ? cardTitle.textContent.trim() : '今天的一小步',
      content: cardBody ? cardBody.textContent.trim() : '',
    }
    say('设计演示：这一份是示例记录。')
  }
})()
