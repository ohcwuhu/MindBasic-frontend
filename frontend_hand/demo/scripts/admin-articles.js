/* 内容模块：文章与分类，全部走真接口。

   · 列表：`/admin/articles`（状态 / 分类 / 关键词都由服务端筛）
   · 写与改：`POST /admin/articles`、`PATCH /admin/articles/{id}`（编辑器是页面上的一块面板，
     不是模态框 —— 写正文要的是地方，不是打断）
   · 上下线：`PATCH {status}`；删除：`DELETE`，就地确认
   · 分类：`/admin/article-categories` 的增 / 改名 / 启停 / 删（分类下有文章时后端会 409） */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  var kit = window.AdminKit
  if (!api || !api.live || !kit) return

  var PAGE_SIZE = 10
  var COLUMNS = 6
  var CAT_COLUMNS = 4

  var editor = document.querySelector('[data-editor]')
  var editorTitle = document.querySelector('[data-editor-title]')
  var form = document.querySelector('[data-form]')
  var formError = document.querySelector('[data-form-error]')
  var saveButton = document.querySelector('[data-save]')
  var rowsBox = document.querySelector('[data-rows]')
  var catsBox = document.querySelector('[data-cats]')
  var countBox = document.querySelector('[data-count]')
  var pagerBox = document.querySelector('[data-pager-count]')
  var prevButton = document.querySelector('[data-prev]')
  var nextButton = document.querySelector('[data-next]')
  var newButton = document.querySelector('[data-new]')
  var applyButton = document.querySelector('[data-apply]')
  var resetButton = document.querySelector('[data-reset]')
  var keywordInput = document.querySelector('.filters [name="keyword"]')
  var statusSelect = document.querySelector('.filters [name="status"]')
  var categoryFilter = document.querySelector('.filters [name="categoryId"]')
  var newCatInput = document.querySelector('#new-cat')
  var catMsg = document.querySelector('[data-cat-msg]')

  function field(name) {
    return form.elements.namedItem(name)
  }

  var query = new URLSearchParams(window.location.search)
  var state = {
    page: Math.max(1, Number(query.get('page')) || 1),
    keyword: query.get('keyword') || '',
    status: query.get('status') || '',
    categoryId: query.get('categoryId') || '',
  }
  var categories = []
  var items = []
  var lastPagination = {}
  var editingId = null

  function syncUrl() {
    try {
      var params = new URLSearchParams()
      if (new URLSearchParams(window.location.search).has('live')) params.set('live', '1')
      if (state.keyword) params.set('keyword', state.keyword)
      if (state.status) params.set('status', state.status)
      if (state.categoryId) params.set('categoryId', state.categoryId)
      if (state.page > 1) params.set('page', String(state.page))
      var search = params.toString()
      window.history.replaceState(null, '', 'admin-articles.html' + (search ? '?' + search : ''))
    } catch (error) {
      /* file:// 下不允许改地址栏，跳过就好 */
    }
  }

  function categoryName(id) {
    for (var index = 0; index < categories.length; index++) {
      if (String(categories[index].id) === String(id)) return categories[index].name
    }
    return id === null || id === undefined || id === '' ? '未分类' : '分类 ' + id
  }

  /* ---- 文章表 ---- */

  function actionsHtml(article) {
    var toggle = article.status === 'PUBLISHED' ? '下线' : article.status === 'OFFLINE' ? '上线' : '发布'
    return (
      '<button class="act" type="button" data-edit="' + article.id + '">编辑</button> ' +
      '<button class="act" type="button" data-toggle="' + article.id + '">' + toggle + '</button> ' +
      '<button class="act act--warn" type="button" data-remove="' + article.id + '">删除</button>'
    )
  }

  function articleRow(article) {
    return (
      '<tr data-id="' +
      article.id +
      '">' +
      '<td>' +
      kit.esc(article.title) +
      (article.isPinned ? ' <span class="chip chip--yellow">置顶</span>' : '') +
      '</td>' +
      '<td>' +
      kit.esc(categoryName(article.categoryId)) +
      '</td>' +
      '<td>' +
      kit.articleChip(article.status) +
      '</td>' +
      '<td class="is-num">' +
      (Number(article.viewCount) || 0) +
      '</td>' +
      '<td class="tnum">' +
      kit.when(article.updatedAt || article.createdAt) +
      '</td>' +
      '<td data-cell>' +
      actionsHtml(article) +
      '</td>' +
      '</tr>'
    )
  }

  function drawArticles(list, pagination) {
    items = list
    lastPagination = pagination || {}
    rowsBox.innerHTML = items.length
      ? items.map(articleRow).join('')
      : kit.emptyRow(COLUMNS, '这组条件下没有文章', '换个关键词，或把状态 / 分类恢复成「全部」。')

    var total = Number(pagination.totalItems) || 0
    var pages = Math.max(1, Number(pagination.totalPages) || 1)
    countBox.textContent = '共 ' + total + ' 篇'
    pagerBox.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 篇'
    prevButton.disabled = state.page <= 1
    nextButton.disabled = state.page >= pages
  }

  function articleOf(node) {
    var row = node.closest('tr')
    var id = row ? Number(row.getAttribute('data-id')) : 0
    for (var index = 0; index < items.length; index++) {
      if (Number(items[index].id) === id) return items[index]
    }
    return null
  }

  function cellOf(node) {
    return node.closest('td[data-cell]')
  }

  function replaceRow(node, html) {
    var row = node.closest('tr')
    var holder = document.createElement('tbody')
    holder.innerHTML = html
    row.parentNode.replaceChild(holder.firstElementChild, row)
  }

  function load() {
    rowsBox.innerHTML = kit.skeleton(COLUMNS, 3)
    countBox.textContent = '读取中…'
    pagerBox.textContent = ''
    prevButton.disabled = true
    nextButton.disabled = true

    var path =
      '/admin/articles?page=' +
      state.page +
      '&pageSize=' +
      PAGE_SIZE +
      (state.keyword ? '&keyword=' + encodeURIComponent(state.keyword) : '') +
      (state.status ? '&status=' + state.status : '') +
      (state.categoryId ? '&categoryId=' + state.categoryId : '')

    return api
      .get(path)
      .then(function (data) {
        drawArticles((data && data.items) || [], (data && data.pagination) || {})
      })
      .catch(function (error) {
        if (kit.bounce(error)) return
        items = []
        rowsBox.innerHTML = '<tr><td colspan="' + COLUMNS + '">' + kit.note(error.message, true) + '</td></tr>'
        countBox.textContent = '读取失败'
      })
  }

  /* ---- 编辑器 ---- */

  function openEditor(article) {
    editingId = article ? Number(article.id) : null
    editorTitle.textContent = article ? '编辑《' + article.title + '》' : '写一篇'
    field('title').value = article ? article.title || '' : ''
    field('summary').value = article ? article.summary || '' : ''
    field('categoryId').value = article && article.categoryId !== null && article.categoryId !== undefined
      ? String(article.categoryId)
      : ''
    field('status').value = article ? article.status || 'DRAFT' : 'DRAFT'
    field('coverUrl').value = article ? article.coverUrl || '' : ''
    field('isPinned').checked = Boolean(article && article.isPinned)
    field('content').value = article ? article.content || '' : ''
    formError.hidden = true
    formError.textContent = ''
    editor.hidden = false
    editor.scrollIntoView({ block: 'start', behavior: 'smooth' })
    field('title').focus()
  }

  function closeEditor(clear) {
    editor.hidden = true
    editingId = null
    formError.hidden = true
    formError.textContent = ''
    if (clear !== false) form.reset()
  }

  function editorFail(message) {
    formError.textContent = message
    formError.hidden = false
  }

  function submit() {
    var title = field('title').value.trim()
    var content = field('content').value.trim()
    if (!title) return editorFail('标题不能是空的。')
    if (!content) return editorFail('正文不能是空的 —— 科普中心的文章就是靠它撑起来的。')

    var categoryValue = field('categoryId').value
    var body = {
      title: title,
      summary: field('summary').value.trim() || null,
      content: content,
      coverUrl: field('coverUrl').value.trim() || null,
      categoryId: categoryValue ? Number(categoryValue) : null,
      isPinned: field('isPinned').checked,
      status: field('status').value,
    }
    var wasEdit = editingId !== null
    var id = editingId

    saveButton.disabled = true
    saveButton.textContent = '保存中…'
    var request = wasEdit ? api.patch('/admin/articles/' + id, body) : api.post('/admin/articles', body)

    request
      .then(function () {
        closeEditor()
        /* 新写的排在「按更新时间」的最前面，所以回到第一页才看得见它 */
        if (!wasEdit) state.page = 1
        syncUrl()
        return load()
      })
      .catch(function (error) {
        if (!kit.bounce(error)) editorFail(error.message)
      })
      .then(function () {
        saveButton.disabled = false
        saveButton.textContent = '保存'
      })
  }

  /* ---- 行上的三个动作 ---- */

  function toggleStatus(button) {
    var article = articleOf(button)
    var cell = cellOf(button)
    if (!article || !cell) return
    var next = article.status === 'PUBLISHED' ? 'OFFLINE' : 'PUBLISHED'
    button.disabled = true
    button.textContent = '处理中…'

    api
      .patch('/admin/articles/' + article.id, { status: next })
      .then(function (data) {
        article.status = (data && data.status) || next
        if (data && data.updatedAt) article.updatedAt = data.updatedAt
        replaceRow(button, articleRow(article))
      })
      .catch(function (error) {
        if (kit.bounce(error)) return
        cell.innerHTML = actionsHtml(article) + ' ' + kit.note(error.message, true)
      })
  }

  function askDelete(button) {
    var article = articleOf(button)
    var cell = cellOf(button)
    if (!article || !cell) return
    cell.innerHTML =
      '<span class="confirm">' +
      '<span class="confirm__ask">删除这篇文章？</span>' +
      '<button class="act act--warn" type="button" data-yes-del="' + article.id + '">确定</button>' +
      '<button class="act" type="button" data-cancel>取消</button></span>'
    cell.querySelector('[data-cancel]').focus()
  }

  function remove(button) {
    var article = articleOf(button)
    var cell = cellOf(button)
    if (!article || !cell) return
    button.disabled = true
    button.textContent = '删除中…'

    api
      .del('/admin/articles/' + article.id)
      .then(function () {
        /* 「共 N 篇」是按服务端那份数出来的，删掉一行之后它也少一篇 —— 否则表头就说了假话。
           这一页还剩别的行就只重画这一页（不闪骨架）；删空了、或者页码已经越过末页，就回去重取。 */
        var total = Math.max(0, (Number(lastPagination.totalItems) || 0) - 1)
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
        var rest = items.filter(function (item) {
          return Number(item.id) !== Number(article.id)
        })
        if (state.page > pages) state.page = pages
        syncUrl()
        if (!rest.length) {
          load()
          return
        }
        drawArticles(rest, { totalItems: total, totalPages: pages })
      })
      .catch(function (error) {
        if (kit.bounce(error)) return
        cell.innerHTML = actionsHtml(article) + ' ' + kit.note(error.message, true)
      })
  }

  rowsBox.addEventListener('click', function (event) {
    var edit = event.target.closest('[data-edit]')
    if (edit) {
      var article = articleOf(edit)
      if (article) openEditor(article)
      return
    }
    if (event.target.closest('[data-cancel]')) {
      var cancelled = articleOf(event.target)
      var cell = cellOf(event.target)
      if (cancelled && cell) cell.innerHTML = actionsHtml(cancelled)
      return
    }
    var yes = event.target.closest('[data-yes-del]')
    if (yes) {
      remove(yes)
      return
    }
    var toggle = event.target.closest('[data-toggle]')
    if (toggle) {
      toggleStatus(toggle)
      return
    }
    var del = event.target.closest('[data-remove]')
    if (del) askDelete(del)
  })

  /* ---- 分类 ---- */

  function categoryOf(node) {
    var row = node.closest('tr')
    var id = row ? Number(row.getAttribute('data-cat-id')) : 0
    for (var index = 0; index < categories.length; index++) {
      if (Number(categories[index].id) === id) return categories[index]
    }
    return null
  }

  function catActionsHtml(category) {
    return (
      '<button class="act" type="button" data-rename="' + category.id + '">改名</button> ' +
      '<button class="act" type="button" data-enable="' + category.id + '">' +
      (category.isEnabled ? '停用' : '启用') +
      '</button> ' +
      '<button class="act act--warn" type="button" data-del-cat="' + category.id + '">删除</button>'
    )
  }

  function catRow(category) {
    return (
      '<tr data-cat-id="' +
      category.id +
      '">' +
      '<td>' +
      kit.esc(category.name) +
      '</td>' +
      '<td class="is-num">' +
      (Number(category.sortOrder) || 0) +
      '</td>' +
      '<td>' +
      (category.isEnabled ? kit.chip('启用中', 'green') : kit.chip('已停用')) +
      '</td>' +
      '<td data-cell>' +
      catActionsHtml(category) +
      '</td>' +
      '</tr>'
    )
  }

  function optionsHtml(first) {
    return (
      '<option value="">' +
      first +
      '</option>' +
      categories
        .map(function (category) {
          return (
            '<option value="' +
            category.id +
            '">' +
            kit.esc(category.name) +
            (category.isEnabled ? '' : '（已停用）') +
            '</option>'
          )
        })
        .join('')
    )
  }

  function drawCategories() {
    catsBox.innerHTML = categories.length
      ? categories.map(catRow).join('')
      : kit.emptyRow(CAT_COLUMNS, '还没有分类', '在下面加一个，科普中心顶上那排标签就跟着出现。')

    var editorSelect = field('categoryId')
    var kept = editorSelect.value
    editorSelect.innerHTML = optionsHtml('未分类')
    editorSelect.value = kept

    categoryFilter.innerHTML = optionsHtml('全部分类')
    categoryFilter.value = state.categoryId || ''
  }

  function loadCategories() {
    return api
      .get('/admin/article-categories')
      .then(function (data) {
        categories = (data && data.items) || []
        drawCategories()
      })
      .catch(function (error) {
        if (kit.bounce(error)) return
        catsBox.innerHTML =
          '<tr><td colspan="' + CAT_COLUMNS + '">' + kit.note(error.message, true) + '</td></tr>'
      })
  }

  function catNote(message, danger) {
    catMsg.innerHTML = message ? kit.note(message, danger) : ''
  }

  function reloadCategories(message) {
    return loadCategories().then(function () {
      catNote(message || '')
      return load()
    })
  }

  function askRename(button) {
    var category = categoryOf(button)
    var cell = button.closest('td')
    if (!category || !cell) return
    var nameCell = cell.parentNode.querySelector('td')
    nameCell.innerHTML =
      '<span class="rename">' +
      '<input class="input" type="text" maxlength="32" value="' +
      kit.esc(category.name) +
      '" aria-label="分类名字" />' +
      '<button class="act" type="button" data-save-name>保存</button>' +
      '<button class="act" type="button" data-cancel>取消</button></span>'
    var input = nameCell.querySelector('input')
    input.focus()
    input.select()

    function cancel() {
      nameCell.textContent = category.name
    }

    function save() {
      var name = input.value.trim()
      if (!name) {
        catNote('分类名字不能是空的。', true)
        input.focus()
        return
      }
      api
        .patch('/admin/article-categories/' + category.id, { name: name })
        .then(function () {
          return reloadCategories('已改名为「' + name + '」。')
        })
        .catch(function (error) {
          if (kit.bounce(error)) return
          catNote(error.message, true)
        })
    }

    nameCell.querySelector('[data-save-name]').addEventListener('click', save)
    nameCell.querySelector('[data-cancel]').addEventListener('click', cancel)
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault()
        save()
      }
      if (event.key === 'Escape') cancel()
    })
  }

  function toggleCategory(button) {
    var category = categoryOf(button)
    var cell = button.closest('td')
    if (!category || !cell) return
    var next = !category.isEnabled
    button.disabled = true
    button.textContent = '处理中…'
    api
      .patch('/admin/article-categories/' + category.id, { isEnabled: next })
      .then(function () {
        return reloadCategories(next ? '已启用。' : '已停用 —— 科普中心顶上不再出现这一个。')
      })
      .catch(function (error) {
        if (kit.bounce(error)) return
        cell.innerHTML = catActionsHtml(category) + ' ' + kit.note(error.message, true)
      })
  }

  function askDeleteCategory(button) {
    var category = categoryOf(button)
    var cell = button.closest('td')
    if (!category || !cell) return
    cell.innerHTML =
      '<span class="confirm">' +
      '<span class="confirm__ask">删除分类「' + kit.esc(category.name) + '」？</span>' +
      '<button class="act act--warn" type="button" data-yes-cat>确定</button>' +
      '<button class="act" type="button" data-cancel>取消</button></span>'
    cell.querySelector('[data-cancel]').focus()
  }

  function removeCategory(button) {
    var category = categoryOf(button)
    var cell = button.closest('td')
    if (!category || !cell) return
    button.disabled = true
    button.textContent = '删除中…'
    api
      .del('/admin/article-categories/' + category.id)
      .then(function () {
        return reloadCategories('已删除「' + category.name + '」。')
      })
      .catch(function (error) {
        if (kit.bounce(error)) return
        /* 分类下还有文章时后端回 409，把那句话原样放在这一格 */
        cell.innerHTML = catActionsHtml(category) + ' ' + kit.note(error.message, true)
      })
  }

  catsBox.addEventListener('click', function (event) {
    if (event.target.closest('[data-cancel]')) {
      var cancelled = categoryOf(event.target)
      var cell = cellOf(event.target)
      if (cancelled && cell) cell.innerHTML = catActionsHtml(cancelled)
      return
    }
    var yes = event.target.closest('[data-yes-cat]')
    if (yes) {
      removeCategory(yes)
      return
    }
    var rename = event.target.closest('[data-rename]')
    if (rename) {
      askRename(rename)
      return
    }
    var enable = event.target.closest('[data-enable]')
    if (enable) {
      toggleCategory(enable)
      return
    }
    var del = event.target.closest('[data-del-cat]')
    if (del) askDeleteCategory(del)
  })

  function addCategory() {
    var name = newCatInput.value.trim()
    if (!name) {
      catNote('先写一个名字。', true)
      newCatInput.focus()
      return
    }
    var sortOrder = categories.reduce(function (max, category) {
      return Math.max(max, Number(category.sortOrder) || 0)
    }, 0)
    newCatInput.disabled = true
    api
      .post('/admin/article-categories', { name: name, sortOrder: sortOrder + 1, isEnabled: true })
      .then(function () {
        newCatInput.value = ''
        return reloadCategories('已新增「' + name + '」。')
      })
      .catch(function (error) {
        if (!kit.bounce(error)) catNote(error.message, true)
      })
      .then(function () {
        newCatInput.disabled = false
        newCatInput.focus()
      })
  }

  document.querySelector('[data-add-cat]').addEventListener('click', addCategory)
  newCatInput.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addCategory()
  })

  /* ---- 过滤、翻页、编辑器入口 ---- */

  function apply() {
    state.keyword = keywordInput.value.trim()
    state.status = statusSelect.value
    state.categoryId = categoryFilter.value
    state.page = 1
    syncUrl()
    load()
  }

  applyButton.addEventListener('click', apply)
  keywordInput.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    apply()
  })
  resetButton.addEventListener('click', function () {
    keywordInput.value = ''
    statusSelect.value = ''
    categoryFilter.value = ''
    apply()
  })
  newButton.addEventListener('click', function () {
    openEditor(null)
  })
  form.addEventListener('submit', function (event) {
    event.preventDefault()
    submit()
  })
  form.querySelector('[data-cancel]').addEventListener('click', function () {
    closeEditor()
  })
  prevButton.addEventListener('click', function () {
    if (state.page <= 1) return
    state.page -= 1
    syncUrl()
    load()
  })
  nextButton.addEventListener('click', function () {
    state.page += 1
    syncUrl()
    load()
  })

  keywordInput.value = state.keyword
  statusSelect.value = state.status
  loadCategories().then(load)
})()
