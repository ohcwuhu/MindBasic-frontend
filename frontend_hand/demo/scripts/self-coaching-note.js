/* 自我教练页顶上的一张小提示 —— 一句话，一个动作。

   这一页要登录才真的起得来（后端的实时连接不带凭证会被拒），所以没登录时贴一张纸
   「自我教练要登录才能开始」+ 一个「去登录」；连不上后端（双击打开的设计预览）时
   换一句「这是设计预览」，别让人以为页面坏了。
   通话一开始这张纸就收起来 —— 那时候它已经没用了，该让位置给通话台。

   这一版多管两种「卡住」的情况，每种都给一条能往下走的路（第一次来的人不该停在原地）：
     · 浏览器不给麦克风 —— 说清去哪儿改回来，并给出「写下此刻」这条不出声的路；
     · 实时服务连不上 —— 说明是服务的问题，可以稍后重试，也可以先写日记。 */
;(function () {
  'use strict'

  var token = null
  try {
    token = window.localStorage.getItem('mb_access_token')
  } catch (error) {
    token = null
  }

  function host() {
    return document.querySelector('.video-call-page') || document.querySelector('#app')
  }
  if (!host()) return

  /** 一张提示纸：一个芯片 + 一句话 + 最多两个动作 */
  function makeNote(id) {
    var anchor = host()
    if (!anchor) return null
    var box = document.createElement('div')
    box.className = 'panel sc-hint'
    box.setAttribute('role', 'status')
    box.setAttribute('data-sc-note', id)
    anchor.insertBefore(box, anchor.firstChild)
    return box
  }

  function fill(box, chip, chipClass, text, actions) {
    box.replaceChildren()
    var tag = document.createElement('span')
    tag.className = 'chip ' + (chipClass || '')
    tag.textContent = chip
    box.appendChild(tag)
    var body = document.createElement('span')
    body.className = 'sc-hint__text'
    body.textContent = text
    box.appendChild(body)
    ;(actions || []).forEach(function (item) {
      var node
      if (item.href) {
        node = document.createElement('a')
        node.className = 'btn btn--small sc-hint__action'
        node.href = item.href
      } else {
        node = document.createElement('button')
        node.type = 'button'
        node.className = 'btn btn--small btn--paper sc-hint__action'
        node.addEventListener('click', item.onClick)
      }
      var label = document.createElement('span')
      label.textContent = item.label
      node.appendChild(label)
      box.appendChild(node)
    })
  }

  var boxes = {}
  var rendered = {}

  /** 条件在就贴、条件没了就收；同一段话不重复重画 */
  function sync(id, signature, chip, chipClass, text, actions) {
    if (!signature) {
      if (boxes[id]) {
        boxes[id].hidden = true
        delete rendered[id]
      }
      return
    }
    if (rendered[id] === signature) return
    if (!boxes[id]) boxes[id] = makeNote(id)
    if (!boxes[id]) return
    fill(boxes[id], chip, chipClass, text, actions)
    boxes[id].hidden = false
    rendered[id] = signature
  }

  var writeHere = { label: '写下此刻', href: 'emotion-journal.html' }
  var reload = { label: '刷新这一页', onClick: function () { window.location.reload() } }

  /* 没登录：这张纸在通话开始后收起来 */
  var loginNote = null
  if (!token) {
    loginNote = makeNote('login')
    if (loginNote) {
      fill(loginNote, '还没登录', 'chip--yellow', '自我教练要登录才能开始：对话里说的话要存进你的账号。', [
        { label: '去登录', href: 'login.html' },
        writeHere,
      ])
    }
  }

  function sayPreview() {
    if (!loginNote) return
    var text = loginNote.querySelector('.sc-hint__text')
    if (text) text.textContent = '这是设计预览 · 还没连后端，界面与状态都能看，真对话要接上后端再登录。'
  }

  /* 后端在不在：不在就说清楚这是设计预览。
     `file://` 下一看就知道没有后端 —— 不去发那个注定失败的请求（控制台会白报一串 CORS）。 */
  if (window.location.protocol === 'file:') {
    sayPreview()
  } else {
    fetch('/api/v1/platform/config')
      .then(function (response) {
        if (!response.ok) throw new Error('offline')
      })
      .catch(sayPreview)
  }

  /* 麦克风状态：浏览器已经明确拒绝时，先在这里说清楚 */
  var micState = ''
  if (token && navigator.permissions && navigator.permissions.query) {
    navigator.permissions
      .query({ name: 'microphone' })
      .then(function (status) {
        micState = status.state || ''
        if (status.onchange) status.onchange = function () { micState = status.state || ''; scan() }
        scan()
      })
      .catch(function () { /* 有的浏览器不支持查麦克风权限，就靠页面上那句话来判断 */ })
  }

  /** 页面上出现「麦克风被拒」或「服务连不上」的原文时，贴一张能往下走的纸 */
  function scan() {
    var text = document.body.innerText || ''
    var serviceDown = /服务未连接/.test(text) || /暂时无法连接/.test(text)
    var micDenied = micState === 'denied' || /需要麦克风权限才能开始/.test(text)
    sync('service', serviceDown ? 'down' : '', '服务连不上', 'chip--yellow',
      '实时服务暂时连不上：可以先写下此刻，或稍后重试。',
      [{ label: '重试', onClick: function () { window.location.reload() } }, writeHere])
    sync('mic', micDenied ? 'denied' : '', '麦克风被拒绝', 'chip--yellow',
      '浏览器现在不让用麦克风：在地址栏左侧的权限图标里改成「允许」，再刷新这一页；也可以先写下此刻。',
      [reload, writeHere])
  }

  if (token) {
    var observer = new MutationObserver(function () { scan() })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    scan()
  }

  /* 通话开始后把这张纸收掉（Vue 挂载要等一会儿，所以带重试上限） */
  ;(function watchCall(tries) {
    var stage = document.querySelector('#app .vc-stage')
    if (!stage) {
      if (tries > 0) window.setTimeout(function () {
        watchCall(tries - 1)
      }, 300)
      return
    }
    if (stage.classList.contains('active')) {
      if (loginNote) loginNote.hidden = true
      return
    }
    var observer = new MutationObserver(function () {
      if (!stage.classList.contains('active')) return
      observer.disconnect()
      if (loginNote) loginNote.hidden = true
    })
    observer.observe(stage, { attributes: true, attributeFilter: ['class'] })
  })(20)
})()
