/* 管理工作台 · 系统配置（后端 `/admin/system-configs`）。

   接后端：`GET /admin/system-configs` → { items: [{ key, value, description }] }
           `PUT /admin/system-configs` { items: [{ key, value }] } —— 只提交改过的那几项
   没有后端：页面里写好的示例值；保存会如实说明这一步要接后端（它要写进数据库）。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live

  var form = document.querySelector('[data-config-form]')
  var errorLine = document.querySelector('[data-form-error]')
  var saveButton = document.querySelector('[data-save]')
  var reloadButton = document.querySelector('[data-reload]')
  var statusLine = document.querySelector('[data-status]')
  if (!form) return

  var original = {}
  var busy = false

  function say(text) {
    if (statusLine) statusLine.textContent = text || ''
  }

  function fail(message) {
    if (!errorLine) return
    errorLine.textContent = message || ''
    errorLine.hidden = !message
  }

  function fields() {
    return Array.prototype.slice.call(form.querySelectorAll('input[name], textarea[name]'))
  }

  function collect() {
    return fields().map(function (input) {
      return { key: input.name, value: input.value.trim() }
    })
  }

  function paint(items) {
    original = {}
    items.forEach(function (item) {
      var input = form.querySelector('[name="' + item.key + '"]')
      if (!input) return
      input.value = item.value || ''
      original[item.key] = input.value
    })
  }

  function changed() {
    return collect().filter(function (item) {
      return original[item.key] !== undefined && item.value !== original[item.key]
    })
  }

  function validate(items) {
    var empty = items.filter(function (item) {
      return !item.value
    })
    if (!empty.length) return true
    fail(
      '这几项不能留空：' +
        empty
          .map(function (item) {
            return item.key
          })
          .join('、'),
    )
    return false
  }

  function load() {
    if (!live) {
      paint(collect())
      say('设计演示：这几句是示例值；保存需要后端 —— 它要写进数据库，并留下审计日志。')
      return
    }
    say('正在读取配置…')
    api
      .get('/admin/system-configs')
      .then(function (data) {
        paint((data && data.items) || [])
        say('配置已读取。')
      })
      .catch(function (error) {
        say((error && error.message) || '配置没读出来。')
      })
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    fail('')
    var items = collect()
    if (!validate(items)) return
    var dirty = changed()
    if (!dirty.length) {
      say('没有改动。')
      return
    }
    if (!live) {
      say('设计演示：改动没有提交 —— 保存要接上后端才会写进数据库。')
      return
    }
    busy = true
    if (saveButton) saveButton.disabled = true
    say('正在保存 ' + dirty.length + ' 项…')
    api
      .put('/admin/system-configs', { items: dirty })
      .then(function () {
        dirty.forEach(function (item) {
          original[item.key] = item.value
        })
        say('已保存 ' + dirty.length + ' 项，改动进了审计日志。')
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
  load()
})()
