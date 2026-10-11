/* 服务协议：接后端时用 `/platform/agreement` 的真文本替换页面里的示例文本。
   后端下发的是 Markdown（`## 标题` + 段落 + `-` 列表 + `**加粗**`），这里做一个很小的转换。

   闸门是「页面是不是 http(s) 打开的」，不是 `api.live`：这一页**不用登录**（注册页里那个
   勾选框直接指过来），没登录的浏览器里 `api.live` 还是 false，那样就会拿页面里写死的示例文本
   冒充正式协议。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !/^https?:$/.test(window.location.protocol)) return

  api
    .get('/platform/agreement')
    .then(function (data) {
      var markdown = (data && data.content) || ''
      if (!markdown) return
      var container = document.querySelector('article, .prose, .terms, main .wrap')
      if (!container) return
      var html = markdown
        .split(/\n{2,}/)
        .map(function (block) {
          var text = block.trim()
          if (!text) return ''
          var heading = /^#{1,3}\s*(.+)$/.exec(text)
          if (heading) return '<h2>' + api.esc(heading[1]) + '</h2>'
          if (/^[-*]\s/m.test(text)) {
            return (
              '<ul>' +
              text
                .split('\n')
                .map(function (line) {
                  return '<li>' + inline(line.replace(/^[-*]\s*/, '')) + '</li>'
                })
                .join('') +
              '</ul>'
            )
          }
          return '<p>' + inline(text.replace(/\n/g, ' ')) + '</p>'
        })
        .join('')
      function inline(value) {
        return api
          .esc(value)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
      }
      container.innerHTML = html
      var foot = document.querySelector('.panel__foot')
      if (foot) foot.textContent = '协议版本 v' + (data.version || '1') + ' · 来自后端 /platform/agreement'
    })
    .catch(function (error) {
      api.fail(document.querySelector('.panel') || document.body, error)
    })
})()
