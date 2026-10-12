/* 教练工作台 · 资料与入驻（原前端「我的资料」那一栏）。

   接后端：
     · `GET   /coach/profile` → { realName, yearsOfExperience, serviceConcept, bio,
                                  trainingExp, credentialUrls, auditStatus, auditRemark }
     · `PATCH /coach/profile` { realName, yearsOfExperience, serviceConcept, bio, trainingExp,
                                credentialUrls }（首次入驻是 POST，这里用 PATCH 改资料）
     · `POST  /coach/profile/submit-audit` —— 交给平台审
   没有后端：页面里写好的示例，保存与提交都会说明需要后端。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live

  var AUDIT = {
    APPROVED: ['已通过审核', 'chip--green'],
    PENDING: ['审核中', 'chip--yellow'],
    REJECTED: ['未通过审核', ''],
  }

  var form = document.querySelector('[data-profile-form]')
  var errorLine = document.querySelector('[data-profile-error]')
  var saveButton = document.querySelector('[data-save]')
  var reloadButton = document.querySelector('[data-reload]')
  var statusLine = document.querySelector('[data-profile-status]')
  var auditChip = document.querySelector('[data-audit]')
  var auditRemark = document.querySelector('[data-audit-remark]')
  var auditStatus = document.querySelector('[data-audit-status]')
  var submitAudit = document.querySelector('[data-submit-audit]')
  if (!form) return

  var original = {}
  var busy = false

  function say(node, text) {
    if (node) node.textContent = text || ''
  }

  function fail(message) {
    if (!errorLine) return
    errorLine.textContent = message || ''
    errorLine.hidden = !message
  }

  function values() {
    var data = {}
    Array.prototype.forEach.call(form.querySelectorAll('input[name], textarea[name]'), function (input) {
      if (input.name === 'credentialUrls') {
        data.credentialUrls = input.value
          .split('\n')
          .map(function (line) { return line.trim() })
          .filter(Boolean)
        return
      }
      data[input.name] = input.name === 'yearsOfExperience' ? Number(input.value) : input.value.trim()
    })
    return data
  }

  function paint(profile) {
    var map = {
      realName: profile.realName || '',
      yearsOfExperience: profile.yearsOfExperience || 0,
      serviceConcept: profile.serviceConcept || '',
      bio: profile.bio || '',
      trainingExp: profile.trainingExp || '',
      credentialUrls: (profile.credentialUrls || []).join('\n'),
    }
    Object.keys(map).forEach(function (key) {
      var input = form.querySelector('[name="' + key + '"]')
      if (input) input.value = map[key]
    })
    original = values()
    var pair = AUDIT[profile.auditStatus] || ['状态待确认', '']
    if (auditChip) {
      auditChip.textContent = pair[0]
      auditChip.className = 'chip ' + pair[1]
    }
    if (auditRemark) auditRemark.textContent = profile.auditRemark || '还没有审核备注。'
  }

  function validate(data) {
    if ((data.realName || '').length < 2) {
      fail('真实姓名要写全，平台审核要看。')
      return false
    }
    if ((data.serviceConcept || '').length < 4) {
      fail('服务理念写一句话，它会出现在别人的列表上。')
      return false
    }
    return true
  }

  function load() {
    if (!live) {
      original = values()
      say(statusLine, '设计演示：这一份是示例资料；保存与提交审核需要后端。')
      return
    }
    say(statusLine, '正在读取资料…')
    api
      .get('/coach/profile')
      .then(function (profile) {
        paint(profile)
        say(statusLine, '资料已读取。')
      })
      .catch(function (error) {
        say(statusLine, (error && error.message) || '资料没读出来。')
      })
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    fail('')
    var data = values()
    if (!validate(data)) return
    if (!live) {
      say(statusLine, '设计演示：改动没有提交 —— 保存要接上后端才会写进数据库。')
      return
    }
    if (busy) return
    busy = true
    if (saveButton) saveButton.disabled = true
    say(statusLine, '正在保存…')
    api
      .patch('/coach/profile', data)
      .then(function (profile) {
        paint(profile || data)
        say(statusLine, '资料已保存。')
      })
      .catch(function (error) {
        fail((error && error.message) || '保存没成功，再试一次。')
      })
      .then(function () {
        busy = false
        if (saveButton) saveButton.disabled = false
        if (statusLine && statusLine.focus) statusLine.focus()
      })
  })

  if (reloadButton) reloadButton.addEventListener('click', load)

  if (submitAudit) {
    submitAudit.addEventListener('click', function () {
      if (busy) return
      if (!live) {
        say(auditStatus, '设计演示：提交审核要接上后端 —— 它会把资料交给平台并写进审计日志。')
        return
      }
      busy = true
      say(auditStatus, '正在提交审核…')
      api
        .post('/coach/profile/submit-audit')
        .then(function (result) {
          if (auditChip) {
            auditChip.textContent = '审核中'
            auditChip.className = 'chip chip--yellow'
          }
          if (auditRemark) auditRemark.textContent = (result && result.remark) || '已提交，等平台看。'
          say(auditStatus, '已提交审核。')
        })
        .catch(function (error) {
          say(auditStatus, (error && error.message) || '提交没成功，再试一次。')
        })
        .then(function () {
          busy = false
          if (auditStatus && auditStatus.focus) auditStatus.focus()
        })
    })
  }

  load()
})()
