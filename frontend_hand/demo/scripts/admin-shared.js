/* 知心同行 · 管理工作台共用的一层

   概览 / 用户 / 内容 / 教练审核 四个模块说的是同一种话：一个状态叫什么、它画成哪枚小标
   签、金额怎么写、表在等数据的时候长什么样。这些放在这里，免得三份页面脚本各写一遍，然后
   慢慢走样。

   非管理员（401 / 403）一律请回首页 —— 后端的 `/admin/*` 本来就只放 ADMIN 进门。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI

  var ROLE = { USER: '用户', COACH: '教练', ADMIN: '管理员' }
  var ARTICLE = { PUBLISHED: '已发布', DRAFT: '草稿', OFFLINE: '已下线' }
  var AUDIT = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' }
  var SERVICE = { SINGLE: '单次咨询', PACKAGE: '陪伴卡' }

  function esc(value) {
    return api && api.esc ? api.esc(value) : String(value === null || value === undefined ? '' : value)
  }

  function chip(text, kind) {
    return '<span class="chip' + (kind ? ' chip--' + kind : '') + '">' + esc(text) + '</span>'
  }

  function when(iso) {
    return iso ? api.dateTime(iso) : '—'
  }

  /* 401 / 403：这一页只给管理员。返回 true 表示人已经送走了，调用方别再往下画。 */
  function bounce(error) {
    var status = (error && error.status) || 0
    if (
      status === 403 ||
      status === 401 ||
      /403|401|权限|管理员|无权/.test(String((error && error.message) || ''))
    ) {
      window.location.replace('index.html')
      return true
    }
    return false
  }

  /* 表格在等数据的时候保持自己的形状：三行灰条，行高与真行一样 */
  function skeleton(columns, rows) {
    var widths = ['72%', '58%', '84%', '46%']
    var html = ''
    for (var index = 0; index < (rows || 3); index++) {
      html +=
        '<tr aria-hidden="true"><td colspan="' +
        columns +
        '"><span class="skl" style="--skl-w:' +
        widths[index % widths.length] +
        '"></span></td></tr>'
    }
    return html
  }

  /* 空态：`.empty` 是一块 div，塞进 tbody / ul 之前得先有个合法的壳 */
  function emptyRow(columns, title, hint) {
    return '<tr><td colspan="' + columns + '">' + api.empty(title, hint) + '</td></tr>'
  }

  function emptyItem(title, hint) {
    return api.emptyItem(title, hint)
  }

  function note(text, danger) {
    return api.note(text, danger)
  }

  function money(cents) {
    return api.money(cents)
  }

  window.AdminKit = {
    esc: esc,
    chip: chip,
    when: when,
    bounce: bounce,
    skeleton: skeleton,
    emptyRow: emptyRow,
    emptyItem: emptyItem,
    note: note,
    money: money,
    roleLabel: function (role) {
      return ROLE[role] || role || '—'
    },
    articleLabel: function (status) {
      return ARTICLE[status] || status || '—'
    },
    auditLabel: function (status) {
      return AUDIT[status] || status || '—'
    },
    serviceLabel: function (type) {
      return SERVICE[type] || type || '—'
    },
    userChip: function (isDisabled) {
      return isDisabled ? chip('已停用') : chip('正常', 'green')
    },
    articleChip: function (status) {
      if (status === 'PUBLISHED') return chip(ARTICLE.PUBLISHED, 'green')
      if (status === 'DRAFT') return chip(ARTICLE.DRAFT, 'yellow')
      return chip(ARTICLE[status] || status || '—')
    },
    auditChip: function (status) {
      if (status === 'APPROVED') return chip(AUDIT.APPROVED, 'green')
      if (status === 'PENDING') return chip(AUDIT.PENDING, 'yellow')
      return chip(AUDIT[status] || status || '—')
    },
  }
})()
